//! Accounts: sign in with an emailed link or code, or with Google. A session
//! is a random token kept by the browser as an HttpOnly cookie (web) or sent
//! as `Authorization: Bearer` (desktop/mobile). Only token hashes are stored.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use axum::{
    extract::{FromRequestParts, Query, State},
    http::{header, request::Parts, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use serde::Deserialize;
use serde_json::json;
use sha2::{Digest, Sha256};

use crate::api::{ApiError, AppState};
use crate::mailer::{esc, layout, Mail};
use crate::store::{random_hex, Login, User};

const SESSION_COOKIE: &str = "ip_session";
const OAUTH_COOKIE: &str = "ip_oauth";
const SESSION_DAYS: i64 = 30;
const LOGIN_MINUTES: i64 = 15;
/// One sign-in email per address per this long.
const EMAIL_COOLDOWN: Duration = Duration::from_secs(30);

pub struct AuthConfig {
    /// Where people open the app, e.g. `https://ideaplanner.app`; used in
    /// emailed links and as the Google redirect.
    pub public_url: String,
    pub google: Option<GoogleConfig>,
    /// Recent sign-in emails, against sending floods to one address.
    sent: Mutex<HashMap<String, Instant>>,
}

pub struct GoogleConfig {
    pub client_id: String,
    pub secret: String,
}

impl AuthConfig {
    pub fn from_env(port: u16) -> Self {
        let var = |k: &str| std::env::var(k).ok().filter(|v| !v.is_empty());
        let public_url = var("PUBLIC_URL")
            .unwrap_or_else(|| format!("http://localhost:{port}"))
            .trim_end_matches('/')
            .to_owned();
        let google = match (var("GOOGLE_CLIENT_ID"), var("GOOGLE_CLIENT_SECRET")) {
            (Some(client_id), Some(secret)) => Some(GoogleConfig { client_id, secret }),
            _ => None,
        };
        Self::new(public_url, google)
    }

    pub fn new(public_url: String, google: Option<GoogleConfig>) -> Self {
        Self {
            public_url,
            google,
            sent: Mutex::default(),
        }
    }

    fn secure(&self) -> bool {
        self.public_url.starts_with("https://")
    }

    fn cookie(&self, name: &str, value: &str, max_age: i64) -> HeaderValue {
        let secure = if self.secure() { "; Secure" } else { "" };
        HeaderValue::from_str(&format!(
            "{name}={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}{secure}"
        ))
        .expect("cookie is ASCII")
    }
}

pub fn hash(token: &str) -> String {
    Sha256::digest(token.as_bytes())
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect()
}

fn cookie_value<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    headers
        .get_all(header::COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .find_map(|kv| kv.trim().strip_prefix(name)?.strip_prefix('='))
}

/// The session token a request carries, from the header or the cookie.
pub fn session_token(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .or_else(|| cookie_value(headers, SESSION_COOKIE))
        .filter(|t| !t.is_empty())
}

/// Who is making a request, if anyone is signed in.
pub struct Viewer(pub Option<User>);

impl FromRequestParts<Arc<AppState>> for Viewer {
    type Rejection = ApiError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &Arc<AppState>,
    ) -> Result<Self, Self::Rejection> {
        Ok(Self(
            user_for_token(state, session_token(&parts.headers)).await?,
        ))
    }
}

pub async fn user_for_token(
    state: &AppState,
    token: Option<&str>,
) -> Result<Option<User>, ApiError> {
    match token {
        Some(t) => Ok(state.store.session_user(&hash(t)).await?),
        None => Ok(None),
    }
}

impl Viewer {
    pub fn require(self) -> Result<User, ApiError> {
        self.0.ok_or(ApiError::SignIn)
    }
}

pub fn router() -> Router<Arc<AppState>> {
    Router::new()
        .route("/api/me", get(me).patch(rename))
        .route("/api/auth/email", post(send_link))
        .route("/api/auth/link", get(open_link))
        .route("/api/auth/code", post(enter_code))
        .route("/api/auth/google", get(google_start))
        .route("/api/auth/google/callback", get(google_done))
        .route("/api/auth/logout", post(logout))
}

/// Only same-site paths, so a sign-in link can't send people elsewhere.
fn safe_next(next: Option<&str>) -> String {
    match next {
        Some(n) if n.starts_with('/') && !n.starts_with("//") && !n.contains('\\') => n.to_owned(),
        _ => "/".to_owned(),
    }
}

fn valid_email(email: &str) -> bool {
    let Some((local, domain)) = email.split_once('@') else {
        return false;
    };
    email.len() <= 254
        && !local.is_empty()
        && domain.contains('.')
        && !email
            .chars()
            .any(|c| c.is_whitespace() || c == '<' || c == '>')
}

fn name_from_email(email: &str) -> String {
    let local = email.split('@').next().unwrap_or_default();
    let word = local.split(['.', '_', '-', '+']).next().unwrap_or(local);
    let mut chars = word.chars();
    chars
        .next()
        .map(|c| c.to_uppercase().chain(chars).collect())
        .unwrap_or_default()
}

/// Starts a session for `user`: the token, and the cookie that carries it.
async fn start_session(state: &AppState, user: &User) -> Result<(String, HeaderValue), ApiError> {
    let token = random_hex(32);
    let expires = Utc::now() + chrono::Duration::days(SESSION_DAYS);
    state
        .store
        .new_session(&hash(&token), &user.id, expires)
        .await?;
    let cookie = state
        .auth
        .cookie(SESSION_COOKIE, &token, SESSION_DAYS * 86_400);
    Ok((token, cookie))
}

async fn me(State(state): State<Arc<AppState>>, viewer: Viewer) -> Json<serde_json::Value> {
    Json(json!({
        "user": viewer.0,
        "google": state.auth.google.is_some(),
        "mail": state.mailer.sends_real_mail(),
        "ai": state.ai.is_some(),
    }))
}

#[derive(Deserialize)]
struct Rename {
    name: String,
}

async fn rename(
    State(state): State<Arc<AppState>>,
    viewer: Viewer,
    Json(body): Json<Rename>,
) -> Result<StatusCode, ApiError> {
    let user = viewer.require()?;
    let name: String = body.name.trim().chars().take(60).collect();
    state.store.rename_user(&user.id, &name).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct EmailReq {
    email: String,
    next: Option<String>,
}

async fn send_link(
    State(state): State<Arc<AppState>>,
    Json(req): Json<EmailReq>,
) -> Result<StatusCode, ApiError> {
    let email = req.email.trim().to_ascii_lowercase();
    if !valid_email(&email) {
        return Err(ApiError::BadRequest(
            "that doesn't look like an email address",
        ));
    }
    {
        let mut sent = state.auth.sent.lock().expect("lock");
        sent.retain(|_, at| at.elapsed() < EMAIL_COOLDOWN);
        if sent.contains_key(&email) {
            return Err(ApiError::TooMany);
        }
        sent.insert(email.clone(), Instant::now());
    }

    let token = random_hex(32);
    let code = format!(
        "{:06}",
        u32::from_str_radix(&random_hex(4), 16).unwrap_or(0) % 1_000_000
    );
    state
        .store
        .new_login(Login {
            token_hash: hash(&token),
            email: email.clone(),
            code_hash: hash(&format!("{email}:{code}")),
            expires: Utc::now() + chrono::Duration::minutes(LOGIN_MINUTES),
        })
        .await?;

    let next = safe_next(req.next.as_deref());
    let link = reqwest::Url::parse_with_params(
        &format!("{}/api/auth/link", state.auth.public_url),
        [("token", token.as_str()), ("next", next.as_str())],
    )
    .map_err(|_| ApiError::BadRequest("PUBLIC_URL is not a valid URL"))?;
    let text = format!(
        "Sign in to Idea Planner: {link}\n\nOr enter this code in the app: {code}\n\nThe link and code work for {LOGIN_MINUTES} minutes. If you didn't ask for this, ignore this email."
    );
    let html = layout(
        "Sign in to Idea Planner",
        &[
            "Click the button to sign in on this device.".into(),
            format!(
                r#"Or enter this code in the app: <b style="font-size:20px;letter-spacing:3px;color:#f3f5fe">{code}</b>"#
            ),
            format!("The link and code work for {LOGIN_MINUTES} minutes. If you didn't ask for this, ignore this email."),
        ],
        Some(("Sign in", link.as_str())),
    );
    state
        .mailer
        .send(Mail {
            to: &email,
            subject: &format!("Your Idea Planner sign-in code: {code}"),
            text,
            html,
        })
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "sending the sign-in email failed");
            ApiError::Upstream
        })?;
    Ok(StatusCode::NO_CONTENT)
}

#[derive(Deserialize)]
struct LinkQuery {
    token: String,
    next: Option<String>,
}

async fn open_link(
    State(state): State<Arc<AppState>>,
    Query(q): Query<LinkQuery>,
) -> Result<Response, ApiError> {
    let next = safe_next(q.next.as_deref());
    let Some(email) = state.store.take_login(&hash(&q.token)).await? else {
        let sep = if next.contains('?') { '&' } else { '?' };
        return Ok(Redirect::to(&format!("{next}{sep}signin=expired")).into_response());
    };
    let user = state
        .store
        .ensure_user(&email, &name_from_email(&email))
        .await?;
    let (_, cookie) = start_session(&state, &user).await?;
    Ok(([(header::SET_COOKIE, cookie)], Redirect::to(&next)).into_response())
}

#[derive(Deserialize)]
struct CodeReq {
    email: String,
    code: String,
}

async fn enter_code(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CodeReq>,
) -> Result<Response, ApiError> {
    let email = req.email.trim().to_ascii_lowercase();
    let code: String = req.code.chars().filter(char::is_ascii_digit).collect();
    if !state
        .store
        .take_login_code(&email, &hash(&format!("{email}:{code}")))
        .await?
    {
        return Err(ApiError::BadRequest("that code is wrong or has expired"));
    }
    let user = state
        .store
        .ensure_user(&email, &name_from_email(&email))
        .await?;
    let (token, cookie) = start_session(&state, &user).await?;
    Ok((
        [(header::SET_COOKIE, cookie)],
        Json(json!({ "token": token, "user": user })),
    )
        .into_response())
}

async fn logout(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    if let Some(t) = session_token(&headers) {
        state.store.end_session(&hash(t)).await?;
    }
    let clear = state.auth.cookie(SESSION_COOKIE, "", 0);
    Ok(([(header::SET_COOKIE, clear)], StatusCode::NO_CONTENT).into_response())
}

// Google

#[derive(Deserialize)]
struct NextQuery {
    next: Option<String>,
}

fn google_redirect(state: &AppState) -> String {
    format!("{}/api/auth/google/callback", state.auth.public_url)
}

async fn google_start(
    State(state): State<Arc<AppState>>,
    Query(q): Query<NextQuery>,
) -> Result<Response, ApiError> {
    let google = state.auth.google.as_ref().ok_or(ApiError::NotFound)?;
    let nonce = random_hex(16);
    let next = safe_next(q.next.as_deref());
    let url = reqwest::Url::parse_with_params(
        "https://accounts.google.com/o/oauth2/v2/auth",
        [
            ("client_id", google.client_id.as_str()),
            ("redirect_uri", google_redirect(&state).as_str()),
            ("response_type", "code"),
            ("scope", "openid email profile"),
            ("state", nonce.as_str()),
            ("prompt", "select_account"),
        ],
    )
    .expect("static URL");
    // The state travels in a short-lived cookie; `next` rides along with it.
    let value: String = format!("{nonce}.{}", hex_encode(next.as_bytes()));
    let cookie = state.auth.cookie(OAUTH_COOKIE, &value, 600);
    Ok(([(header::SET_COOKIE, cookie)], Redirect::to(url.as_str())).into_response())
}

fn hex_encode(b: &[u8]) -> String {
    b.iter().map(|b| format!("{b:02x}")).collect()
}

fn hex_decode(s: &str) -> Option<String> {
    let bytes: Option<Vec<u8>> = (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok())
        .collect();
    String::from_utf8(bytes?).ok()
}

#[derive(Deserialize)]
struct GoogleCallback {
    code: Option<String>,
    state: Option<String>,
}

#[derive(Deserialize)]
struct GoogleToken {
    access_token: String,
}

#[derive(Deserialize)]
struct GoogleUser {
    email: String,
    #[serde(default)]
    email_verified: bool,
    #[serde(default)]
    name: String,
}

async fn google_done(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Query(q): Query<GoogleCallback>,
) -> Result<Response, ApiError> {
    let google = state.auth.google.as_ref().ok_or(ApiError::NotFound)?;
    let saved = cookie_value(&headers, OAUTH_COOKIE).unwrap_or_default();
    let (nonce, next) = saved.split_once('.').unwrap_or_default();
    let next = safe_next(hex_decode(next).as_deref());
    let clear = state.auth.cookie(OAUTH_COOKIE, "", 0);
    let failed = |clear: HeaderValue| {
        Ok((
            [(header::SET_COOKIE, clear)],
            Redirect::to("/?signin=failed"),
        )
            .into_response())
    };
    let (Some(code), Some(got)) = (q.code, q.state) else {
        return failed(clear);
    };
    if nonce.is_empty() || got != nonce {
        return failed(clear);
    }

    let token: GoogleToken = state
        .http
        .post("https://oauth2.googleapis.com/token")
        .form(&[
            ("code", code.as_str()),
            ("client_id", google.client_id.as_str()),
            ("client_secret", google.secret.as_str()),
            ("redirect_uri", google_redirect(&state).as_str()),
            ("grant_type", "authorization_code"),
        ])
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(upstream)?
        .json()
        .await
        .map_err(upstream)?;
    let info: GoogleUser = state
        .http
        .get("https://openidconnect.googleapis.com/v1/userinfo")
        .bearer_auth(&token.access_token)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(upstream)?
        .json()
        .await
        .map_err(upstream)?;
    if !info.email_verified {
        return failed(clear);
    }
    let email = info.email.to_ascii_lowercase();
    let name = if info.name.is_empty() {
        name_from_email(&email)
    } else {
        info.name
    };
    let user = state.store.ensure_user(&email, &name).await?;
    let (_, cookie) = start_session(&state, &user).await?;
    let mut res = Redirect::to(&next).into_response();
    res.headers_mut().append(header::SET_COOKIE, cookie);
    res.headers_mut().append(header::SET_COOKIE, clear);
    Ok(res)
}

fn upstream(e: reqwest::Error) -> ApiError {
    tracing::error!(error = %e, "Google sign-in failed");
    ApiError::Upstream
}

/// Emails `to` that they were added to a board.
pub async fn send_invite(state: &AppState, to: &str, by: &User, board_id: &str, title: &str) {
    let link = format!("{}/b/{board_id}", state.auth.public_url);
    let who = if by.name.is_empty() {
        &by.email
    } else {
        &by.name
    };
    let title = if title.is_empty() { "a board" } else { title };
    let mail = Mail {
        to,
        subject: &format!("{who} shared \"{title}\" with you"),
        text: format!("{who} shared \"{title}\" on Idea Planner with you: {link}"),
        html: layout(
            &format!("{} shared a board with you", esc(who)),
            &[format!("Open <b>{}</b> to plan together.", esc(title))],
            Some(("Open the board", &link)),
        ),
    };
    if let Err(e) = state.mailer.send(mail).await {
        tracing::warn!(error = %e, "invite email failed");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_redirects_on_site() {
        assert_eq!(safe_next(Some("/b/abc")), "/b/abc");
        assert_eq!(safe_next(Some("//evil.com")), "/");
        assert_eq!(safe_next(Some("https://evil.com")), "/");
        assert_eq!(safe_next(Some("/\\evil.com")), "/");
        assert_eq!(safe_next(None), "/");
    }

    #[test]
    fn reads_tokens_from_header_or_cookie() {
        let mut h = HeaderMap::new();
        h.insert(header::COOKIE, "a=1; ip_session=abc".parse().unwrap());
        assert_eq!(session_token(&h), Some("abc"));
        h.insert(header::AUTHORIZATION, "Bearer xyz".parse().unwrap());
        assert_eq!(session_token(&h), Some("xyz"));
    }

    #[test]
    fn checks_emails_and_names() {
        assert!(valid_email("ana@mail.com"));
        assert!(!valid_email("ana@mail"));
        assert!(!valid_email("a na@mail.com"));
        assert_eq!(name_from_email("ana.kovac@mail.com"), "Ana");
        assert_eq!(
            hex_decode(&hex_encode("/b/x?y".as_bytes())).unwrap(),
            "/b/x?y"
        );
    }
}
