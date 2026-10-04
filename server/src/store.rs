use std::collections::HashMap;

use sqlx::PgPool;
use tokio::sync::RwLock;

/// Where shared boards are kept.
pub enum Store {
    Postgres(PgPool),
    /// For local development and tests; forgets everything on restart.
    Memory(RwLock<HashMap<String, String>>),
}

impl Store {
    pub fn memory() -> Self {
        Self::Memory(RwLock::default())
    }

    pub async fn get(&self, id: &str) -> sqlx::Result<Option<String>> {
        match self {
            Self::Postgres(pool) => {
                sqlx::query_scalar::<_, String>("SELECT doc::text FROM boards WHERE id = $1")
                    .bind(id)
                    .fetch_optional(pool)
                    .await
            }
            Self::Memory(map) => Ok(map.read().await.get(id).cloned()),
        }
    }

    pub async fn put(&self, id: &str, doc: &str) -> sqlx::Result<()> {
        match self {
            Self::Postgres(pool) => {
                sqlx::query(
                    "INSERT INTO boards (id, doc) VALUES ($1, $2::jsonb)
                     ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()",
                )
                .bind(id)
                .bind(doc)
                .execute(pool)
                .await?;
                Ok(())
            }
            Self::Memory(map) => {
                map.write().await.insert(id.to_owned(), doc.to_owned());
                Ok(())
            }
        }
    }
}
