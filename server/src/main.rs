//! Idea Planner server: serves the web build and stores shared boards so
//! share links work across devices.
//!
//! Configuration (environment or `.env`):
//! - `DATABASE_URL`  Postgres (e.g. Neon). Without it boards live in memory.
//! - `WEB_DIST`      built web app, default `web/dist/client`.
//! - `PORT`          default 3001.
//! - `CORS_ORIGINS`  comma-separated origins allowed to call the API
//!   (needed when a desktop/mobile build syncs through `VITE_API_URL`).

mod api;
mod store;

use std::{net::SocketAddr, path::PathBuf, sync::Arc};

use anyhow::Context;
use axum::http::{HeaderValue, Method};
use sqlx::postgres::PgPoolOptions;
use tower_http::{
    compression::CompressionLayer,
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};

use store::Store;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "info,sqlx=warn,tower_http=info".into()),
        )
        .init();

    let store = match std::env::var("DATABASE_URL") {
        Ok(url) => {
            let pool = PgPoolOptions::new()
                .max_connections(5)
                .connect(&url)
                .await
                .context("connecting to DATABASE_URL")?;
            sqlx::migrate!("./migrations")
                .run(&pool)
                .await
                .context("running migrations")?;
            Store::Postgres(pool)
        }
        Err(_) => {
            tracing::warn!("DATABASE_URL is not set: boards are kept in memory only");
            Store::memory()
        }
    };

    let dist =
        PathBuf::from(std::env::var("WEB_DIST").unwrap_or_else(|_| "web/dist/client".into()));
    if !dist.join("index.html").exists() {
        tracing::warn!(path = %dist.display(), "web build not found; run `npm run build` in web/");
    }
    // Every unknown path is a client route (e.g. /b/<id>), so it gets the app shell.
    let app_shell = ServeDir::new(&dist).fallback(ServeFile::new(dist.join("index.html")));

    let app = api::router(Arc::new(store))
        .fallback_service(app_shell)
        .layer(cors())
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http());

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3001);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("Idea Planner on http://{addr}");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

fn cors() -> CorsLayer {
    let origins: Vec<HeaderValue> = std::env::var("CORS_ORIGINS")
        .unwrap_or_default()
        .split(',')
        .filter_map(|o| HeaderValue::from_str(o.trim()).ok())
        .filter(|o| !o.is_empty())
        .collect();
    CorsLayer::new()
        .allow_origin(origins)
        .allow_methods([Method::GET, Method::PUT])
        .allow_headers([axum::http::header::CONTENT_TYPE])
}

async fn shutdown() {
    let _ = tokio::signal::ctrl_c().await;
}
