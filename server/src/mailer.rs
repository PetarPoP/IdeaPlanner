//! Outgoing email (sign-in links, invites, reminders) through Resend's HTTP
//! API. Without `RESEND_API_KEY` messages are written to the log instead, so
//! signing in works in development.

use serde_json::json;

#[derive(Clone)]
pub enum Mailer {
    Resend {
        http: reqwest::Client,
        key: String,
        from: String,
    },
    Log,
}

pub struct Mail<'a> {
    pub to: &'a str,
    pub subject: &'a str,
    pub text: String,
    pub html: String,
}

impl Mailer {
    pub fn from_env(http: reqwest::Client) -> Self {
        let key = std::env::var("RESEND_API_KEY").unwrap_or_default();
        if key.is_empty() {
            tracing::warn!("RESEND_API_KEY is not set: emails are written to the log");
            return Self::Log;
        }
        let from = std::env::var("MAIL_FROM")
            .ok()
            .filter(|f| !f.is_empty())
            .unwrap_or_else(|| "Idea Planner <onboarding@resend.dev>".into());
        Self::Resend { http, key, from }
    }

    pub fn sends_real_mail(&self) -> bool {
        matches!(self, Self::Resend { .. })
    }

    pub async fn send(&self, mail: Mail<'_>) -> anyhow::Result<()> {
        match self {
            Self::Log => {
                tracing::info!(
                    to = mail.to,
                    subject = mail.subject,
                    "email (not sent):\n{}",
                    mail.text
                );
                Ok(())
            }
            Self::Resend { http, key, from } => {
                let res = http
                    .post("https://api.resend.com/emails")
                    .bearer_auth(key)
                    .json(&json!({
                        "from": from,
                        "to": [mail.to],
                        "subject": mail.subject,
                        "text": mail.text,
                        "html": mail.html,
                    }))
                    .send()
                    .await?;
                if !res.status().is_success() {
                    let status = res.status();
                    let body = res.text().await.unwrap_or_default();
                    anyhow::bail!("Resend answered {status}: {body}");
                }
                Ok(())
            }
        }
    }
}

/// Minimal escaping for text placed in the HTML emails.
pub fn esc(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// The shared look of every email: a title, paragraphs and one button.
pub fn layout(title: &str, paragraphs: &[String], button: Option<(&str, &str)>) -> String {
    let body: String = paragraphs
        .iter()
        .map(|p| {
            format!(
                r#"<p style="margin:0 0 14px;color:#c9cce0;font-size:15px;line-height:1.5">{p}</p>"#
            )
        })
        .collect();
    let button = button
        .map(|(label, href)| {
            format!(
                r#"<p style="margin:22px 0"><a href="{}" style="background:#8b93ff;color:#10121c;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">{}</a></p>"#,
                esc(href),
                esc(label)
            )
        })
        .unwrap_or_default();
    format!(
        r#"<div style="background:#161826;padding:32px 16px;font-family:Inter,system-ui,sans-serif"><div style="max-width:480px;margin:0 auto;background:#1e2133;border-radius:16px;padding:28px"><h1 style="margin:0 0 16px;color:#f3f5fe;font-size:20px">{}</h1>{body}{button}<p style="margin:24px 0 0;color:#6d7190;font-size:12px">Idea Planner</p></div></div>"#,
        esc(title)
    )
}
