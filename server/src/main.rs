use std::str::FromStr as _;
use std::net::SocketAddr;

use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use dotenvy::dotenv;
use serde::Deserialize;
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use tracing::{error, info};

#[derive(Clone)]
struct AppState {
    pool: PgPool,
}

#[derive(Debug, thiserror::Error)]
enum AppError {
    #[error("database error")]
    Sqlx(#[from] sqlx::Error),

    #[error("invalid uuid: {0}")]
    Uuid(#[from] uuid::Error),

    #[error("internal error")]
    Other(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        error!(error = ?self, "request failed");
        (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error").into_response()
    }
}

#[tokio::main]
async fn main() -> Result<(), anyhow::Error> {
    dotenv().ok();
    // When run from server/, also try loading .env from project root
    if std::env::var("DATABASE_URL").is_err() {
        let _ = dotenvy::from_path("../.env");
    }
    tracing_subscriber::fmt()
        .with_env_filter("info,sqlx=warn")
        .init();

    let database_url =
        std::env::var("DATABASE_URL").expect("DATABASE_URL env var must be set for NeonDB");
    // sqlx does not support channel_binding; strip it to avoid a parse warning
    let database_url = database_url
        .replace("&channel_binding=require", "")
        .replace("?channel_binding=require&", "?")
        .replace("?channel_binding=require", "");

    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await?;

    let state = AppState { pool };

    let app = Router::new()
        .route("/healthz", get(health_check))
        .route("/sync/ideas", post(sync_ideas))
        .route("/sync/bullets", post(sync_bullets))
        .route("/sync/votes", post(sync_votes))
        .with_state(state);

    let addr: SocketAddr = "0.0.0.0:3001".parse()?;
    info!("Starting IdeaPlanner server on {addr}");

    let listener = tokio::net::TcpListener::bind(&addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> &'static str {
    "ok"
}

#[derive(Debug, Deserialize)]
struct IncomingIdea {
    id: Option<uuid::Uuid>,
    local_id: String,
    club_id: String,
    author_user_id: String,
    title: String,
    body: Option<String>,
    #[allow(dead_code)]
    sync_status: String,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct IncomingBullet {
    id: Option<uuid::Uuid>,
    local_id: String,
    idea_id: String,
    content: String,
    cost: Option<f64>,
    image_url: Option<String>,
    order_index: i32,
    #[allow(dead_code)]
    sync_status: String,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct SyncIdeasBody {
    ideas: Vec<IncomingIdea>,
}

#[derive(Debug, Deserialize)]
struct SyncBulletsBody {
    bullets: Vec<IncomingBullet>,
}

#[derive(Debug, Deserialize)]
struct IncomingVote {
    id: Option<uuid::Uuid>,
    local_id: String,
    user_id: String,
    bullet_id: String,
    value: i32,
    #[allow(dead_code)]
    sync_status: String,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
struct SyncVotesBody {
    votes: Vec<IncomingVote>,
}

async fn sync_ideas(
    State(state): State<AppState>,
    Json(payload): Json<SyncIdeasBody>,
) -> Result<impl IntoResponse, AppError> {
    let mut tx = state.pool.begin().await?;

    for idea in payload.ideas {
        sqlx::query!(
            r#"
            INSERT INTO ideas (
                id,
                local_id,
                club_id,
                author_user_id,
                title,
                body,
                sync_status,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, 'synced', $7)
            ON CONFLICT (local_id) DO UPDATE SET
                title = EXCLUDED.title,
                body = EXCLUDED.body,
                sync_status = 'synced',
                updated_at = EXCLUDED.updated_at
            "#,
            idea.id,
            idea.local_id,
            idea.club_id.parse::<uuid::Uuid>()?,
            idea.author_user_id.parse::<uuid::Uuid>()?,
            idea.title,
            idea.body,
            idea.updated_at,
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn sync_bullets(
    State(state): State<AppState>,
    Json(payload): Json<SyncBulletsBody>,
) -> Result<impl IntoResponse, AppError> {
    let mut tx = state.pool.begin().await?;

    for bullet in payload.bullets {
        sqlx::query!(
            r#"
            INSERT INTO bullets (
                id,
                local_id,
                idea_id,
                content,
                cost,
                image_url,
                order_index,
                sync_status,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'synced', $8)
            ON CONFLICT (local_id) DO UPDATE SET
                content = EXCLUDED.content,
                cost = EXCLUDED.cost,
                image_url = EXCLUDED.image_url,
                order_index = EXCLUDED.order_index,
                sync_status = 'synced',
                updated_at = EXCLUDED.updated_at
            "#,
            bullet.id,
            bullet.local_id,
            bullet.idea_id.parse::<uuid::Uuid>()?,
            bullet.content,
            bullet.cost.and_then(|c| sqlx::types::BigDecimal::from_str(&c.to_string()).ok()),
            bullet.image_url,
            bullet.order_index,
            bullet.updated_at,
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

async fn sync_votes(
    State(state): State<AppState>,
    Json(payload): Json<SyncVotesBody>,
) -> Result<impl IntoResponse, AppError> {
    let mut tx = state.pool.begin().await?;

    for vote in payload.votes {
        sqlx::query!(
            r#"
            INSERT INTO votes (
                id,
                local_id,
                user_id,
                bullet_id,
                value,
                sync_status,
                updated_at
            ) VALUES ($1, $2, $3, $4, $5, 'synced', $6)
            ON CONFLICT (user_id, bullet_id) DO UPDATE SET
                value = EXCLUDED.value,
                sync_status = 'synced',
                updated_at = EXCLUDED.updated_at
            "#,
            vote.id,
            vote.local_id,
            vote.user_id.parse::<uuid::Uuid>()?,
            vote.bullet_id.parse::<uuid::Uuid>()?,
            vote.value,
            vote.updated_at,
        )
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;

    Ok(StatusCode::NO_CONTENT)
}

