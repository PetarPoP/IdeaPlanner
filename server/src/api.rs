use std::sync::Arc;

use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, Path, State},
    http::{header, HeaderMap, HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Json, Router,
};
use ideaplanner_core::{
    is_valid_id, Board, BoardError, BookingKind, Edge, Node, NodeBody, MAX_DOC_BYTES,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::ai::{self, AiConfig};
use crate::auth::{self, AuthConfig, Viewer};
use crate::inbox::{self, InboxConfig};
use crate::live::{self, Rooms};
use crate::mailer::Mailer;
use crate::store::{BoardRow, LinkAccess, Role, Store, User};

pub struct AppState {
    pub store: Store,
    pub inbox: Option<InboxConfig>,
    pub auth: AuthConfig,
    pub mailer: Mailer,
    pub ai: Option<AiConfig>,
    pub http: reqwest::Client,
    pub rooms: Rooms,
}

type Shared = State<Arc<AppState>>;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/me/boards", get(my_boards))
        .route("/api/boards/{id}", get(get_board).put(put_board))
        .route("/api/boards/{id}/live", get(live::live))
        .route("/api/boards/{id}/access", get(get_access).put(set_access))
        .route("/api/boards/{id}/claim", post(claim))
        .route("/api/boards/{id}/members", put(add_member))
        .route("/api/boards/{id}/members/{user}", delete(remove_member))
        .route("/api/ai/receipt", post(read_receipt))
        .route("/api/ai/booking", post(read_booking))
        .route("/api/inbox", post(receive_mail))
        .merge(auth::router())
        .layer(DefaultBodyLimit::max(MAX_DOC_BYTES))
        .with_state(state)
}

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("not found")]
    NotFound,
    #[error(transparent)]
    Invalid(#[from] BoardError),
    #[error("board id in the document does not match the URL")]
    IdMismatch,
    #[error("unauthorized")]
    Unauthorized,
    #[error("sign in to open this board")]
    SignIn,
    #[error("you don't have access to do that")]
    Forbidden,
    #[error("{0}")]
    BadRequest(&'static str),
    #[error("too many requests, try again shortly")]
    TooMany,
    #[error("an outside service failed, try again")]
    Upstream,
    #[error("message is not a readable email")]
    BadMail,
    #[error("no recipient is a board address")]
    NoBoard,
    #[error("storage error")]
    Storage(#[from] sqlx::Error),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = match &self {
            Self::NotFound | Self::NoBoard => StatusCode::NOT_FOUND,
            Self::Unauthorized | Self::SignIn => StatusCode::UNAUTHORIZED,
            Self::Forbidden => StatusCode::FORBIDDEN,
            Self::BadRequest(_) => StatusCode::BAD_REQUEST,
            Self::TooMany => StatusCode::TOO_MANY_REQUESTS,
            Self::Upstream => StatusCode::BAD_GATEWAY,
            Self::BadMail => StatusCode::UNPROCESSABLE_ENTITY,
            Self::Invalid(BoardError::TooLarge(_)) => StatusCode::PAYLOAD_TOO_LARGE,
            Self::Invalid(_) | Self::IdMismatch => StatusCode::UNPROCESSABLE_ENTITY,
            Self::Storage(e) => {
                tracing::error!(error = %e, "storage failure");
                StatusCode::INTERNAL_SERVER_ERROR
            }
        };
        (status, Json(json!({ "error": self.to_string() }))).into_response()
    }
}

async fn health(State(state): Shared) -> Json<Value> {
    let inbox = state.inbox.as_ref().map(|c| c.domain.as_str());
    Json(json!({
        "service": "ideaplanner",
        "ok": true,
        "inboxDomain": inbox,
        "accounts": true,
        "live": true,
        "google": state.auth.google.is_some(),
        "ai": state.ai.is_some(),
    }))
}

/// A board's row and what `user` may do on it. Boards nobody owns are open
/// to anyone with the link, as they were before accounts.
pub async fn board_access(
    state: &AppState,
    id: &str,
    user: Option<&User>,
) -> Result<(BoardRow, Option<Role>), ApiError> {
    if !is_valid_id(id) {
        return Err(ApiError::NotFound);
    }
    let row = state.store.get(id).await?.ok_or(ApiError::NotFound)?;
    if row.owner.is_none() {
        return Ok((row, Some(Role::Edit)));
    }
    let member = match user {
        Some(u) => state.store.role_of(id, &u.id).await?,
        None => None,
    };
    let role = member.max(row.link.role());
    Ok((row, role))
}

/// The role, or the error that tells the client to sign in or that it can't.
fn need(role: Option<Role>, at_least: Role, user: Option<&User>) -> Result<Role, ApiError> {
    match role {
        Some(r) if r >= at_least => Ok(r),
        _ if user.is_none() => Err(ApiError::SignIn),
        _ => Err(ApiError::Forbidden),
    }
}

async fn my_boards(State(state): Shared, viewer: Viewer) -> Result<Json<Value>, ApiError> {
    let user = viewer.require()?;
    Ok(Json(json!(state.store.user_boards(&user.id).await?)))
}

async fn get_board(
    State(state): Shared,
    Path(id): Path<String>,
    Viewer(user): Viewer,
) -> Result<Response, ApiError> {
    let (row, role) = board_access(&state, &id, user.as_ref()).await?;
    let role = need(role, Role::View, user.as_ref())?;
    // An open room has edits the store hasn't seen yet.
    let doc = match state.rooms.current(&id).await {
        Some(doc) => doc.to_string(),
        None => row.doc,
    };
    Ok((
        [
            (
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/json"),
            ),
            (
                header::HeaderName::from_static("x-board-role"),
                HeaderValue::from_static(role.as_str()),
            ),
        ],
        doc,
    )
        .into_response())
}

async fn put_board(
    State(state): Shared,
    Path(id): Path<String>,
    Viewer(user): Viewer,
    body: String,
) -> Result<StatusCode, ApiError> {
    let mut board = Board::from_json(&body)?;
    if board.id != id {
        return Err(ApiError::IdMismatch);
    }
    match board_access(&state, &id, user.as_ref()).await {
        Ok((_, role)) => {
            need(role, Role::Edit, user.as_ref())?;
        }
        // A new board belongs to whoever saves it first.
        Err(ApiError::NotFound) => {}
        Err(e) => return Err(e),
    }
    board.prune_dangling_edges();
    save(&state, &board, user.as_ref()).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Stores a board and hands it to its live room, if one is open.
async fn save(state: &AppState, board: &Board, owner: Option<&User>) -> Result<(), ApiError> {
    let value = serde_json::to_value(board).map_err(|e| BoardError::Malformed(e.to_string()))?;
    state
        .store
        .put(&board.id, &value.to_string(), owner.map(|u| u.id.as_str()))
        .await?;
    state.rooms.replace(&board.id, &value).await;
    Ok(())
}

/// The latest copy of a board: the live room's, else the stored one.
async fn load(state: &AppState, id: &str) -> Result<Board, ApiError> {
    if let Some(doc) = state.rooms.current(id).await {
        return serde_json::from_value(doc)
            .map_err(|e| BoardError::Malformed(e.to_string()).into());
    }
    let row = state.store.get(id).await?.ok_or(ApiError::NotFound)?;
    Ok(Board::from_json(&row.doc)?)
}

async fn get_access(
    State(state): Shared,
    Path(id): Path<String>,
    Viewer(user): Viewer,
) -> Result<Json<Value>, ApiError> {
    let (row, role) = board_access(&state, &id, user.as_ref()).await?;
    let role = need(role, Role::View, user.as_ref())?;
    let members = if role == Role::Admin {
        json!(state.store.members(&id).await?)
    } else {
        json!([])
    };
    Ok(Json(json!({
        "role": role,
        "owned": row.owner.is_some(),
        "isOwner": row.owner.is_some() && row.owner.as_deref() == user.as_ref().map(|u| u.id.as_str()),
        "linkAccess": row.link,
        "members": members,
    })))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetAccess {
    link_access: LinkAccess,
}

async fn set_access(
    State(state): Shared,
    Path(id): Path<String>,
    Viewer(user): Viewer,
    Json(body): Json<SetAccess>,
) -> Result<StatusCode, ApiError> {
    let (_, role) = board_access(&state, &id, user.as_ref()).await?;
    need(role, Role::Admin, user.as_ref())?;
    state.store.set_link(&id, body.link_access).await?;
    Ok(StatusCode::NO_CONTENT)
}

/// Takes ownership of a board nobody owns, so its access can be controlled.
async fn claim(
    State(state): Shared,
    Path(id): Path<String>,
    viewer: Viewer,
) -> Result<StatusCode, ApiError> {
    let user = viewer.require()?;
    board_access(&state, &id, Some(&user)).await?;
    if state.store.claim(&id, &user.id).await? {
        Ok(StatusCode::NO_CONTENT)
    } else {
        Err(ApiError::Forbidden)
    }
}

#[derive(Deserialize)]
struct AddMember {
    email: String,
    role: Role,
}

async fn add_member(
    State(state): Shared,
    Path(id): Path<String>,
    viewer: Viewer,
    Json(body): Json<AddMember>,
) -> Result<Json<Value>, ApiError> {
    let user = viewer.require()?;
    let (row, role) = board_access(&state, &id, Some(&user)).await?;
    need(role, Role::Admin, Some(&user))?;
    let email = body.email.trim().to_ascii_lowercase();
    if !email.contains('@') || email.len() > 254 {
        return Err(ApiError::BadRequest(
            "that doesn't look like an email address",
        ));
    }
    let member = state.store.ensure_user(&email, "").await?;
    if row.owner.as_deref() == Some(member.id.as_str()) {
        return Err(ApiError::BadRequest("the owner is always an admin"));
    }
    let existed = state.store.role_of(&id, &member.id).await?.is_some();
    state.store.set_member(&id, &member.id, body.role).await?;
    if !existed {
        let title = Board::from_json(&row.doc)
            .map(|b| b.title)
            .unwrap_or_default();
        auth::send_invite(&state, &email, &user, &id, &title).await;
    }
    Ok(Json(json!(state.store.members(&id).await?)))
}

async fn remove_member(
    State(state): Shared,
    Path((id, member)): Path<(String, String)>,
    viewer: Viewer,
) -> Result<StatusCode, ApiError> {
    let user = viewer.require()?;
    let (row, role) = board_access(&state, &id, Some(&user)).await?;
    // Admins remove anyone; everyone may leave.
    if member != user.id {
        need(role, Role::Admin, Some(&user))?;
    }
    if row.owner.as_deref() == Some(member.as_str()) {
        return Err(ApiError::BadRequest("the owner can't be removed"));
    }
    state.store.remove_member(&id, &member).await?;
    Ok(StatusCode::NO_CONTENT)
}

// Reading receipts and bookings

#[derive(Deserialize)]
struct ReceiptReq {
    image: String,
}

async fn read_receipt(
    State(state): Shared,
    viewer: Viewer,
    Json(body): Json<ReceiptReq>,
) -> Result<Json<ai::Receipt>, ApiError> {
    viewer.require()?;
    let config = state.ai.as_ref().ok_or(ApiError::NotFound)?;
    let receipt = ai::receipt(&state.http, config, &body.image)
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, "reading a receipt failed");
            ApiError::Upstream
        })?;
    Ok(Json(receipt))
}

#[derive(Deserialize)]
struct BookingReq {
    text: String,
}

async fn read_booking(
    State(state): Shared,
    viewer: Viewer,
    Json(body): Json<BookingReq>,
) -> Result<Json<ai::BookingGuess>, ApiError> {
    viewer.require()?;
    let config = state.ai.as_ref().ok_or(ApiError::NotFound)?;
    let guess = ai::booking(&state.http, config, &body.text)
        .await
        .map_err(|e| {
            tracing::warn!(error = %e, "reading a booking failed");
            ApiError::Upstream
        })?;
    Ok(Json(guess))
}

/// Raw MIME from the mail forwarder; adds the message to the addressed board.
async fn receive_mail(
    State(state): Shared,
    headers: HeaderMap,
    body: Bytes,
) -> Result<StatusCode, ApiError> {
    // Without configuration the endpoint does not exist.
    let config = state.inbox.as_ref().ok_or(ApiError::NotFound)?;
    let bearer = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "));
    if !bearer.is_some_and(|t| constant_time_eq(t.as_bytes(), config.token.as_bytes())) {
        return Err(ApiError::Unauthorized);
    }

    let mail = inbox::parse(&body).ok_or(ApiError::BadMail)?;
    let id = mail
        .to
        .iter()
        .find_map(|a| config.board_id(a))
        .ok_or(ApiError::NoBoard)?;
    // Read the booking before taking the board, which may change meanwhile.
    let guess = match &state.ai {
        Some(ai) => ai::booking(
            &state.http,
            ai,
            &format!("Subject: {}\n\n{}", mail.subject, mail.body),
        )
        .await
        .map_err(|e| tracing::warn!(error = %e, "reading a booking from mail failed"))
        .ok()
        .filter(|g| g.is_booking),
        None => None,
    };
    let mut board = load(&state, &id).await.map_err(|e| match e {
        ApiError::NotFound => ApiError::NoBoard,
        e => e,
    })?;
    let card_id = unique_id(
        &board,
        format!("mail{}", board.nodes.len() + board.activity.len()),
    );
    inbox::add_to_board(&mut board, mail, card_id.clone());
    if let Some(g) = guess {
        add_booking(&mut board, &card_id, g);
    }
    board.validate()?;
    save(&state, &board, None).await?;
    tracing::info!(board = %id, "email added to board");
    Ok(StatusCode::NO_CONTENT)
}

/// Puts a booking read from an email next to its email card, connected.
fn add_booking(board: &mut Board, mail_id: &str, g: ai::BookingGuess) {
    let Some(mail) = board.nodes.iter().find(|n| n.id == mail_id) else {
        return;
    };
    let (x, y) = (mail.x + mail.w + 60.0, mail.y);
    let kind = match g.kind.as_str() {
        "Stay" => BookingKind::Stay,
        "Car" => BookingKind::Car,
        "Ticket" => BookingKind::Ticket,
        _ => BookingKind::Flight,
    };
    let icon = match kind {
        BookingKind::Flight => "airplane-tilt",
        BookingKind::Stay => "bed",
        BookingKind::Car => "car-profile",
        BookingKind::Ticket => "ticket",
    };
    let id = unique_id(board, format!("{mail_id}-booking"));
    // The app writes currencies as symbols ("€"), Claude answers with ISO codes.
    let cur = match g.currency.to_ascii_uppercase().as_str() {
        "EUR" => "€".to_owned(),
        "USD" => "$".to_owned(),
        "GBP" => "£".to_owned(),
        "RSD" => "din".to_owned(),
        other => other.to_owned(),
    };
    let cur = if cur == board.cur { String::new() } else { cur };
    board.nodes.push(Node {
        id: id.clone(),
        x,
        y,
        w: 300.0,
        title: if g.title.is_empty() {
            "Booking".into()
        } else {
            g.title
        },
        icon: icon.into(),
        accent: false,
        color: String::new(),
        comments: vec![],
        body: NodeBody::Booking {
            kind,
            from: g.from,
            to: g.to,
            start_date: g.start_date,
            start_time: g.start_time,
            end_date: g.end_date,
            end_time: g.end_time,
            conf: g.conf,
            cost: g.cost,
            cur,
            paid: true,
            payer: 0,
        },
    });
    let edge = unique_id(board, format!("{mail_id}-edge"));
    board.edges.push(Edge {
        id: edge,
        from: mail_id.to_owned(),
        to: id,
    });
}

fn unique_id(board: &Board, base: String) -> String {
    let taken =
        |id: &str| board.nodes.iter().any(|n| n.id == id) || board.edges.iter().any(|e| e.id == id);
    if !taken(&base) {
        return base;
    }
    (2..)
        .map(|i| format!("{base}-{i}"))
        .find(|id| !taken(id))
        .expect("an unused id")
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::{to_bytes, Body};
    use axum::http::Request;
    use tower::ServiceExt;

    const BOARD: &str = r#"{"id":"b1","title":"T","icon":"van","date":"","cap":"","cur":"€","splitN":1,
        "people":[{"name":"A","full":"A","ini":"A","role":"Admin"}],
        "nodes":[{"id":"n","x":0,"y":0,"w":260,"title":"Idea","icon":"lightbulb","accent":true,
                  "type":"note","text":"hi","votes":[0],"author":"A"}],
        "edges":[{"id":"e","from":"n","to":"gone"}],"strokes":[],"activity":[]}"#;

    fn state(inbox: Option<InboxConfig>) -> Arc<AppState> {
        Arc::new(AppState {
            store: Store::memory(),
            inbox,
            auth: AuthConfig::new("http://localhost".into(), None),
            mailer: Mailer::Log,
            ai: None,
            http: reqwest::Client::new(),
            rooms: Rooms::default(),
        })
    }

    async fn call(app: &Router, req: Request<Body>) -> (StatusCode, String) {
        let res = app.clone().oneshot(req).await.unwrap();
        let status = res.status();
        let body = to_bytes(res.into_body(), usize::MAX).await.unwrap();
        (status, String::from_utf8(body.to_vec()).unwrap())
    }

    fn put(id: &str, body: &str) -> Request<Body> {
        Request::put(format!("/api/boards/{id}"))
            .body(Body::from(body.to_owned()))
            .unwrap()
    }

    #[tokio::test]
    async fn stores_and_returns_boards() {
        let app = router(state(None));
        let (s, _) = call(
            &app,
            Request::get("/api/boards/b1").body(Body::empty()).unwrap(),
        )
        .await;
        assert_eq!(s, StatusCode::NOT_FOUND);

        let (s, _) = call(&app, put("b1", BOARD)).await;
        assert_eq!(s, StatusCode::NO_CONTENT);

        let (s, body) = call(
            &app,
            Request::get("/api/boards/b1").body(Body::empty()).unwrap(),
        )
        .await;
        assert_eq!(s, StatusCode::OK);
        let board = Board::from_json(&body).unwrap();
        assert_eq!(board.title, "T");
        assert!(board.edges.is_empty(), "dangling edge is pruned on save");
    }

    #[tokio::test]
    async fn rejects_bad_writes() {
        let app = router(state(None));
        assert_eq!(
            call(&app, put("other", BOARD)).await.0,
            StatusCode::UNPROCESSABLE_ENTITY
        );
        assert_eq!(
            call(&app, put("b1", "{}")).await.0,
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }

    #[tokio::test]
    async fn adds_forwarded_mail_to_the_board() {
        let app = router(state(Some(InboxConfig {
            token: "secret".into(),
            domain: "in.example.com".into(),
        })));
        call(&app, put("b1", BOARD)).await;
        let mail =
            "From: a@b.c\r\nTo: board-b1@in.example.com\r\nSubject: Hotel\r\n\r\nSee you!\r\n";
        let post = |auth: &str| {
            Request::post("/api/inbox")
                .header("authorization", auth)
                .body(Body::from(mail))
                .unwrap()
        };
        assert_eq!(
            call(&app, post("Bearer nope")).await.0,
            StatusCode::UNAUTHORIZED
        );
        assert_eq!(
            call(&app, post("Bearer secret")).await.0,
            StatusCode::NO_CONTENT
        );

        let (_, body) = call(
            &app,
            Request::get("/api/boards/b1").body(Body::empty()).unwrap(),
        )
        .await;
        let board = Board::from_json(&body).unwrap();
        let card = board.nodes.last().unwrap();
        assert_eq!(card.title, "Hotel");
        assert!(
            matches!(&card.body, ideaplanner_core::NodeBody::Email { body, .. } if body == "See you!")
        );
    }

    #[tokio::test]
    async fn inbox_is_off_without_config() {
        let app = router(state(None));
        let req = Request::post("/api/inbox").body(Body::from("x")).unwrap();
        assert_eq!(call(&app, req).await.0, StatusCode::NOT_FOUND);
    }

    async fn signed_in(state: &AppState, email: &str) -> (User, String) {
        let user = state.store.ensure_user(email, "").await.unwrap();
        let token = crate::store::random_hex(16);
        let exp = chrono::Utc::now() + chrono::Duration::days(1);
        state
            .store
            .new_session(&auth::hash(&token), &user.id, exp)
            .await
            .unwrap();
        (user, token)
    }

    fn with(req: axum::http::request::Builder, token: &str) -> axum::http::request::Builder {
        req.header("authorization", format!("Bearer {token}"))
    }

    #[tokio::test]
    async fn enforces_roles_on_owned_boards() {
        let st = state(None);
        let app = router(st.clone());
        let (_, owner) = signed_in(&st, "o@x.com").await;
        let (_, guest) = signed_in(&st, "g@x.com").await;

        // Saving a new board while signed in makes you its owner.
        let req = with(Request::put("/api/boards/b1"), &owner)
            .body(Body::from(BOARD))
            .unwrap();
        assert_eq!(call(&app, req).await.0, StatusCode::NO_CONTENT);

        let set_link = |link: &'static str| {
            with(Request::put("/api/boards/b1/access"), &owner)
                .header("content-type", "application/json")
                .body(Body::from(format!(r#"{{"linkAccess":"{link}"}}"#)))
                .unwrap()
        };
        assert_eq!(call(&app, set_link("view")).await.0, StatusCode::NO_CONTENT);
        let get = |t: Option<&str>| {
            let r = Request::get("/api/boards/b1");
            match t {
                Some(t) => with(r, t),
                None => r,
            }
            .body(Body::empty())
            .unwrap()
        };
        assert_eq!(call(&app, get(None)).await.0, StatusCode::OK);
        let put_as = |t: &str| {
            with(Request::put("/api/boards/b1"), t)
                .body(Body::from(BOARD))
                .unwrap()
        };
        assert_eq!(call(&app, put_as(&guest)).await.0, StatusCode::FORBIDDEN);
        assert_eq!(
            call(&app, put("b1", BOARD)).await.0,
            StatusCode::UNAUTHORIZED
        );

        assert_eq!(call(&app, set_link("none")).await.0, StatusCode::NO_CONTENT);
        assert_eq!(call(&app, get(None)).await.0, StatusCode::UNAUTHORIZED);
        assert_eq!(call(&app, get(Some(&guest))).await.0, StatusCode::FORBIDDEN);

        // Adding the guest as an editor lets them in.
        let add = with(Request::put("/api/boards/b1/members"), &owner)
            .header("content-type", "application/json")
            .body(Body::from(r#"{"email":"G@x.com","role":"edit"}"#))
            .unwrap();
        let (s, body) = call(&app, add).await;
        assert_eq!(s, StatusCode::OK);
        assert!(body.contains("g@x.com"));
        assert_eq!(call(&app, put_as(&guest)).await.0, StatusCode::NO_CONTENT);

        // A guest can't change access; the list shows the board with its role.
        let (s, _) = call(&app, {
            with(Request::put("/api/boards/b1/access"), &guest)
                .header("content-type", "application/json")
                .body(Body::from(r#"{"linkAccess":"edit"}"#))
                .unwrap()
        })
        .await;
        assert_eq!(s, StatusCode::FORBIDDEN);
        let (_, mine) = call(
            &app,
            with(Request::get("/api/me/boards"), &guest)
                .body(Body::empty())
                .unwrap(),
        )
        .await;
        assert!(mine.contains(r#""role":"edit""#) && mine.contains(r#""title":"T""#));
    }

    #[tokio::test]
    async fn signs_in_with_an_emailed_code() {
        let st = state(None);
        let email = "ana@mail.com";
        st.store
            .new_login(crate::store::Login {
                token_hash: auth::hash("tok"),
                email: email.into(),
                code_hash: auth::hash(&format!("{email}:123456")),
                expires: chrono::Utc::now() + chrono::Duration::minutes(5),
            })
            .await
            .unwrap();
        let app = router(st.clone());
        let code = |c: &str| {
            Request::post("/api/auth/code")
                .header("content-type", "application/json")
                .body(Body::from(format!(r#"{{"email":"{email}","code":"{c}"}}"#)))
                .unwrap()
        };
        assert_eq!(call(&app, code("000000")).await.0, StatusCode::BAD_REQUEST);
        let (s, body) = call(&app, code("123 456")).await;
        assert_eq!(s, StatusCode::OK);
        let token = serde_json::from_str::<Value>(&body).unwrap()["token"]
            .as_str()
            .unwrap()
            .to_owned();
        let (_, me) = call(
            &app,
            with(Request::get("/api/me"), &token)
                .body(Body::empty())
                .unwrap(),
        )
        .await;
        assert!(me.contains(r#""name":"Ana""#));
        // The code is used up.
        assert_eq!(call(&app, code("123456")).await.0, StatusCode::BAD_REQUEST);
    }

    #[tokio::test]
    async fn passes_live_edits_between_people() {
        use futures_util::{SinkExt, StreamExt};
        use tokio_tungstenite::tungstenite::Message;

        let st = state(None);
        let app = router(st.clone());
        call(&app, put("b1", BOARD)).await;
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

        let url = format!("ws://{addr}/api/boards/b1/live");
        let (mut a, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
        let (mut b, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
        async fn next(
            ws: &mut (impl StreamExt<Item = Result<Message, tokio_tungstenite::tungstenite::Error>>
                      + Unpin),
        ) -> Value {
            loop {
                if let Message::Text(t) = ws.next().await.unwrap().unwrap() {
                    return serde_json::from_str(&t).unwrap();
                }
            }
        }
        a.send(Message::text(r#"{"t":"hello","name":"Ana","color":"red"}"#))
            .await
            .unwrap();
        assert_eq!(next(&mut a).await["t"], "welcome");
        b.send(Message::text(r#"{"t":"hello","name":"Ben"}"#))
            .await
            .unwrap();
        let welcome = next(&mut b).await;
        assert_eq!(welcome["peers"][0]["name"], "Ana");
        assert_eq!(next(&mut a).await["t"], "join");

        a.send(Message::text(
            r#"{"t":"patch","seq":1,"patch":{"set":{"title":"Lisbon"}}}"#,
        ))
        .await
        .unwrap();
        assert_eq!(next(&mut a).await, json!({ "t": "ack", "seq": 1 }));
        let got = next(&mut b).await;
        assert_eq!(got["patch"]["set"]["title"], "Lisbon");

        // A patch that breaks the board is refused with the current copy.
        a.send(Message::text(
            r#"{"t":"patch","seq":2,"patch":{"set":{"title":5}}}"#,
        ))
        .await
        .unwrap();
        let r = next(&mut a).await;
        assert_eq!(r["t"], "reject");
        assert_eq!(r["board"]["title"], "Lisbon");

        // Others reading the board see the live copy at once.
        let (_, body) = call(
            &router(st.clone()),
            Request::get("/api/boards/b1").body(Body::empty()).unwrap(),
        )
        .await;
        assert!(body.contains("Lisbon"));
    }
}
