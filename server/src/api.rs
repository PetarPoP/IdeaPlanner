use std::sync::Arc;

use axum::{
    extract::{DefaultBodyLimit, Path, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use ideaplanner_core::{is_valid_id, Board, BoardError, MAX_DOC_BYTES};
use serde_json::json;

use crate::store::Store;

pub fn router(store: Arc<Store>) -> Router {
    Router::new()
        .route("/api/health", get(health))
        .route("/api/boards/{id}", get(get_board).put(put_board))
        .layer(DefaultBodyLimit::max(MAX_DOC_BYTES))
        .with_state(store)
}

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("board not found")]
    NotFound,
    #[error(transparent)]
    Invalid(#[from] BoardError),
    #[error("board id in the document does not match the URL")]
    IdMismatch,
    #[error("storage error")]
    Storage(#[from] sqlx::Error),
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let status = match &self {
            Self::NotFound => StatusCode::NOT_FOUND,
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

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "service": "ideaplanner", "ok": true }))
}

async fn get_board(
    State(store): State<Arc<Store>>,
    Path(id): Path<String>,
) -> Result<Response, ApiError> {
    if !is_valid_id(&id) {
        return Err(ApiError::NotFound);
    }
    let doc = store.get(&id).await?.ok_or(ApiError::NotFound)?;
    Ok(([(header::CONTENT_TYPE, "application/json")], doc).into_response())
}

async fn put_board(
    State(store): State<Arc<Store>>,
    Path(id): Path<String>,
    body: String,
) -> Result<StatusCode, ApiError> {
    let mut board = Board::from_json(&body)?;
    if board.id != id {
        return Err(ApiError::IdMismatch);
    }
    board.prune_dangling_edges();
    let doc = serde_json::to_string(&board).map_err(|e| BoardError::Malformed(e.to_string()))?;
    store.put(&id, &doc).await?;
    Ok(StatusCode::NO_CONTENT)
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
        let app = router(Arc::new(Store::memory()));
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
        let app = router(Arc::new(Store::memory()));
        assert_eq!(
            call(&app, put("other", BOARD)).await.0,
            StatusCode::UNPROCESSABLE_ENTITY
        );
        assert_eq!(
            call(&app, put("b1", "{}")).await.0,
            StatusCode::UNPROCESSABLE_ENTITY
        );
    }
}
