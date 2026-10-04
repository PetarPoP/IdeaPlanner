use std::sync::Arc;

use axum::{
    body::Bytes,
    extract::{DefaultBodyLimit, Path, State},
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use ideaplanner_core::{is_valid_id, Board, BoardError, MAX_DOC_BYTES};
use serde_json::json;

use crate::inbox::{self, InboxConfig};
use crate::store::Store;

pub struct AppState {
    pub store: Store,
    pub inbox: Option<InboxConfig>,
}

type Shared = State<Arc<AppState>>;

pub fn router(state: Arc<AppState>) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/boards/{id}", get(get_board).put(put_board))
        .route("/api/inbox", post(receive_mail))
        .layer(DefaultBodyLimit::max(MAX_DOC_BYTES))
        .with_state(state)
}

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("board not found")]
    NotFound,
    #[error(transparent)]
    Invalid(#[from] BoardError),
    #[error("board id in the document does not match the URL")]
    IdMismatch,
    #[error("unauthorized")]
    Unauthorized,
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
            Self::Unauthorized => StatusCode::UNAUTHORIZED,
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

async fn health(State(state): Shared) -> Json<serde_json::Value> {
    let inbox = state.inbox.as_ref().map(|c| c.domain.as_str());
    Json(json!({ "service": "ideaplanner", "ok": true, "inboxDomain": inbox }))
}

async fn get_board(State(state): Shared, Path(id): Path<String>) -> Result<Response, ApiError> {
    if !is_valid_id(&id) {
        return Err(ApiError::NotFound);
    }
    let doc = state.store.get(&id).await?.ok_or(ApiError::NotFound)?;
    Ok(([(header::CONTENT_TYPE, "application/json")], doc).into_response())
}

async fn put_board(
    State(state): Shared,
    Path(id): Path<String>,
    body: String,
) -> Result<StatusCode, ApiError> {
    let mut board = Board::from_json(&body)?;
    if board.id != id {
        return Err(ApiError::IdMismatch);
    }
    board.prune_dangling_edges();
    save(&state.store, &board).await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn save(store: &Store, board: &Board) -> Result<(), ApiError> {
    let doc = serde_json::to_string(board).map_err(|e| BoardError::Malformed(e.to_string()))?;
    store.put(&board.id, &doc).await?;
    Ok(())
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
    let doc = state.store.get(&id).await?.ok_or(ApiError::NoBoard)?;
    let mut board = Board::from_json(&doc)?;
    let card_id = format!("mail{}", board.nodes.len() + board.activity.len());
    let card_id = unique_id(&board, card_id);
    inbox::add_to_board(&mut board, mail, card_id);
    board.validate()?;
    save(&state.store, &board).await?;
    tracing::info!(board = %id, "email added to board");
    Ok(StatusCode::NO_CONTENT)
}

fn unique_id(board: &Board, base: String) -> String {
    let taken = |id: &str| board.nodes.iter().any(|n| n.id == id);
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
}
