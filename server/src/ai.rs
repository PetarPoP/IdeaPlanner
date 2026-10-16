//! Reading receipts and booking emails with Claude (`ANTHROPIC_API_KEY`).
//! Each call forces one tool so the answer is always the JSON shape we ask for.

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};

const API: &str = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL: &str = "claude-sonnet-5-5";

#[derive(Clone)]
pub struct AiConfig {
    pub key: String,
    pub model: String,
}

impl AiConfig {
    pub fn from_env() -> Option<Self> {
        let key = std::env::var("ANTHROPIC_API_KEY")
            .ok()
            .filter(|k| !k.is_empty())?;
        let model = std::env::var("ANTHROPIC_MODEL")
            .ok()
            .filter(|m| !m.is_empty())
            .unwrap_or_else(|| DEFAULT_MODEL.into());
        Some(Self { key, model })
    }
}

#[derive(Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Receipt {
    pub merchant: String,
    /// ISO date.
    pub date: String,
    pub total: String,
    /// ISO 4217 code, e.g. `EUR`.
    pub currency: String,
    pub items: Vec<ReceiptLine>,
}

#[derive(Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(default)]
pub struct ReceiptLine {
    pub text: String,
    pub cost: String,
}

#[derive(Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct BookingGuess {
    pub is_booking: bool,
    /// `Flight`, `Stay`, `Car` or `Ticket`.
    pub kind: String,
    pub title: String,
    pub from: String,
    pub to: String,
    pub start_date: String,
    pub start_time: String,
    pub end_date: String,
    pub end_time: String,
    pub conf: String,
    pub cost: String,
    pub currency: String,
}

async fn call<T: DeserializeOwned>(
    http: &reqwest::Client,
    ai: &AiConfig,
    system: &str,
    content: Value,
    schema: Value,
) -> anyhow::Result<T> {
    let res = http
        .post(API)
        .header("x-api-key", &ai.key)
        .header("anthropic-version", "2023-06-01")
        .json(&json!({
            "model": ai.model,
            "max_tokens": 1500,
            "system": system,
            "tools": [{ "name": "record", "description": "Record the extracted data.", "input_schema": schema }],
            "tool_choice": { "type": "tool", "name": "record" },
            "messages": [{ "role": "user", "content": content }],
        }))
        .send()
        .await?;
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        anyhow::bail!("Anthropic API answered {status}: {body}");
    }
    let body: Value = res.json().await?;
    let input = body["content"]
        .as_array()
        .and_then(|c| c.iter().find(|b| b["type"] == "tool_use"))
        .map(|b| b["input"].clone())
        .ok_or_else(|| anyhow::anyhow!("no tool call in the answer"))?;
    Ok(serde_json::from_value(input)?)
}

fn s() -> Value {
    json!({ "type": "string" })
}

/// Reads a photo of a receipt (`data:image/…;base64,…`).
pub async fn receipt(
    http: &reqwest::Client,
    ai: &AiConfig,
    data_url: &str,
) -> anyhow::Result<Receipt> {
    let (meta, data) = data_url
        .strip_prefix("data:")
        .and_then(|r| r.split_once(";base64,"))
        .ok_or_else(|| anyhow::anyhow!("not a base64 data URL"))?;
    if !["image/jpeg", "image/png", "image/webp", "image/gif"].contains(&meta) {
        anyhow::bail!("unsupported image type {meta}");
    }
    let schema = json!({
        "type": "object",
        "properties": {
            "merchant": s(), "date": s(), "total": s(), "currency": s(),
            "items": { "type": "array", "items": { "type": "object",
                "properties": { "text": s(), "cost": s() }, "required": ["text", "cost"] } }
        },
        "required": ["merchant", "total", "currency", "items"]
    });
    call(
        http,
        ai,
        "You read photos of receipts. Give the merchant, the date as YYYY-MM-DD (empty if unreadable), \
         the total paid as a plain number with a dot for decimals, the ISO 4217 currency code, and the \
         line items (at most 20; amounts as plain numbers). Leave a field empty rather than guessing.",
        json!([
            { "type": "image", "source": { "type": "base64", "media_type": meta, "data": data } },
            { "type": "text", "text": "Read this receipt." }
        ]),
        schema,
    )
    .await
}

/// Reads a booking confirmation out of an email or pasted text.
pub async fn booking(
    http: &reqwest::Client,
    ai: &AiConfig,
    text: &str,
) -> anyhow::Result<BookingGuess> {
    let text: String = text.chars().take(12_000).collect();
    let schema = json!({
        "type": "object",
        "properties": {
            "isBooking": { "type": "boolean" },
            "kind": { "type": "string", "enum": ["Flight", "Stay", "Car", "Ticket"] },
            "title": s(), "from": s(), "to": s(),
            "startDate": s(), "startTime": s(), "endDate": s(), "endTime": s(),
            "conf": s(), "cost": s(), "currency": s()
        },
        "required": ["isBooking"]
    });
    call(
        http,
        ai,
        "You turn travel confirmation emails into booking records. isBooking is false unless the text \
         confirms a flight, stay, car rental or ticket. title is short (\"TP 1234 Zagreb → Lisbon\", \
         \"Casa Azul\"). For flights from/to are airports or cities and start/end are the outbound and \
         return departures; for stays from is the property and to the room; for cars from/to are \
         pickup/drop-off places; for tickets from is the event and to the seat. Dates are YYYY-MM-DD, \
         times HH:MM 24h local, cost a plain number with a dot, currency an ISO 4217 code, conf the \
         booking reference. Leave a field empty rather than guessing.",
        json!([{ "type": "text", "text": text }]),
        schema,
    )
    .await
}
