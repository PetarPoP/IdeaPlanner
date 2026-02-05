#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use std::thread;
use std::time::Duration;

use chrono::{DateTime, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use uuid::Uuid;
use keyring::Entry;

const DB_FILE_NAME: &str = "ideaplanner.sqlite3";
const AUTH_FILE_NAME: &str = "auth.json";
const DEFAULT_SERVER_BASE_URL: &str = "http://localhost:3001";

#[derive(thiserror::Error, Debug)]
enum AppError {
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("network error: {0}")]
    Network(#[from] reqwest::Error),
    #[error("serde error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("other error: {0}")]
    Other(String),
}

impl From<AppError> for String {
    fn from(err: AppError) -> Self {
        err.to_string()
    }
}

fn app_data_dir(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(format!("failed to get app data dir: {e}")))?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn db_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let mut dir = app_data_dir(app)?;
    dir.push(DB_FILE_NAME);
    Ok(dir)
}

fn auth_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let mut dir = app_data_dir(app)?;
    dir.push(AUTH_FILE_NAME);
    Ok(dir)
}

fn keyring_entry() -> Result<Entry, AppError> {
    // Service name is the app; username can be a fixed identifier for the current profile.
    Entry::new("ideaplanner", "auth_jwt").map_err(|e| AppError::Other(e.to_string()))
}

fn open_connection(app: &AppHandle) -> Result<Connection, AppError> {
    let path = db_path(app)?;
    let conn = Connection::open(path)?;
    init_schema(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &Connection) -> Result<(), AppError> {
    // Users
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            local_id TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            display_name TEXT NOT NULL,
            sync_status TEXT NOT NULL DEFAULT 'synced',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS clubs (
            id TEXT PRIMARY KEY,
            local_id TEXT NOT NULL UNIQUE,
            owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            description TEXT,
            sync_status TEXT NOT NULL DEFAULT 'synced',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ideas (
            id TEXT PRIMARY KEY,
            local_id TEXT NOT NULL UNIQUE,
            club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
            author_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            body TEXT,
            sync_status TEXT NOT NULL DEFAULT 'synced',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS bullets (
            id TEXT PRIMARY KEY,
            local_id TEXT NOT NULL UNIQUE,
            idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            cost REAL,
            image_url TEXT,
            order_index INTEGER NOT NULL,
            sync_status TEXT NOT NULL DEFAULT 'synced',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS votes (
            id TEXT PRIMARY KEY,
            local_id TEXT NOT NULL UNIQUE,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            bullet_id TEXT NOT NULL REFERENCES bullets(id) ON DELETE CASCADE,
            value INTEGER NOT NULL DEFAULT 1,
            sync_status TEXT NOT NULL DEFAULT 'synced',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            UNIQUE(user_id, bullet_id)
        );

        CREATE INDEX IF NOT EXISTS idx_clubs_owner_user_id ON clubs (owner_user_id);
        CREATE INDEX IF NOT EXISTS idx_ideas_club_id ON ideas (club_id);
        CREATE INDEX IF NOT EXISTS idx_ideas_author_user_id ON ideas (author_user_id);
        CREATE INDEX IF NOT EXISTS idx_bullets_idea_id ON bullets (idea_id);
        CREATE INDEX IF NOT EXISTS idx_votes_bullet_id ON votes (bullet_id);
        CREATE INDEX IF NOT EXISTS idx_votes_user_id ON votes (user_id);
        "#,
    )?;

    Ok(())
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SyncStatus {
    Pending,
    Synced,
    Error,
}

impl SyncStatus {
    fn as_str(&self) -> &'static str {
        match self {
            SyncStatus::Pending => "pending",
            SyncStatus::Synced => "synced",
            SyncStatus::Error => "error",
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct IdeaInput {
    pub local_id: String,
    pub club_id: String,
    pub author_user_id: String,
    pub title: String,
    pub body: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Idea {
    pub id: String,
    pub local_id: String,
    pub club_id: String,
    pub author_user_id: String,
    pub title: String,
    pub body: Option<String>,
    pub sync_status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct IncomingIdeaForSync {
    id: Option<String>,
    local_id: String,
    club_id: String,
    author_user_id: String,
    title: String,
    body: Option<String>,
    sync_status: String,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SyncIdeasBody {
    ideas: Vec<IncomingIdeaForSync>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VoteInput {
    pub local_id: String,
    pub bullet_id: String,
    pub user_id: String,
    pub value: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Vote {
    pub id: String,
    pub local_id: String,
    pub bullet_id: String,
    pub user_id: String,
    pub value: i32,
    pub sync_status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct IncomingVoteForSync {
    id: Option<String>,
    local_id: String,
    user_id: String,
    bullet_id: String,
    value: i32,
    sync_status: String,
    updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SyncVotesBody {
    votes: Vec<IncomingVoteForSync>,
}

fn server_base_url(_app: &AppHandle) -> String {
    // In the future you can read this from config or env; for now default to localhost.
    std::env::var("IDEAPLANNER_SERVER_URL").unwrap_or_else(|_| DEFAULT_SERVER_BASE_URL.to_string())
}

fn collect_pending_ideas(conn: &Connection) -> Result<Vec<IncomingIdeaForSync>, AppError> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, local_id, club_id, author_user_id, title, body, sync_status, updated_at
        FROM ideas
        WHERE sync_status = 'pending'
        "#,
    )?;

    let rows = stmt.query_map([], |row| {
        let updated_at_str: String = row.get(7)?;
        let updated_at: DateTime<Utc> = updated_at_str
            .parse()
            .unwrap_or_else(|_| Utc::now());

        Ok(IncomingIdeaForSync {
            id: Some(row.get(0)?),
            local_id: row.get(1)?,
            club_id: row.get(2)?,
            author_user_id: row.get(3)?,
            title: row.get(4)?,
            body: row.get(5)?,
            sync_status: row.get(6)?,
            updated_at,
        })
    })?;

    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }

    Ok(out)
}

fn mark_ideas_synced(conn: &mut Connection, local_ids: &[String]) -> Result<(), AppError> {
    let now = now_iso();
    let tx = conn.transaction()?;
    {
        let mut stmt =
            tx.prepare("UPDATE ideas SET sync_status = 'synced', updated_at = ?1 WHERE local_id = ?2")?;
        for local_id in local_ids {
            stmt.execute(params![now, local_id])?;
        }
    }
    tx.commit()?;
    Ok(())
}

fn collect_pending_votes(conn: &Connection) -> Result<Vec<IncomingVoteForSync>, AppError> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, local_id, user_id, bullet_id, value, sync_status, updated_at
        FROM votes
        WHERE sync_status = 'pending'
        "#,
    )?;

    let rows = stmt.query_map([], |row| {
        let updated_at_str: String = row.get(6)?;
        let updated_at: DateTime<Utc> = updated_at_str
            .parse()
            .unwrap_or_else(|_| Utc::now());

        Ok(IncomingVoteForSync {
            id: Some(row.get(0)?),
            local_id: row.get(1)?,
            user_id: row.get(2)?,
            bullet_id: row.get(3)?,
            value: row.get(4)?,
            sync_status: row.get(5)?,
            updated_at,
        })
    })?;

    let mut out = Vec::new();
    for r in rows {
        out.push(r?);
    }

    Ok(out)
}

fn mark_votes_synced(conn: &mut Connection, local_ids: &[String]) -> Result<(), AppError> {
    let now = now_iso();
    let tx = conn.transaction()?;
    {
        let mut stmt =
            tx.prepare("UPDATE votes SET sync_status = 'synced', updated_at = ?1 WHERE local_id = ?2")?;
        for local_id in local_ids {
            stmt.execute(params![now, local_id])?;
        }
    }
    tx.commit()?;
    Ok(())
}

fn sync_pending_ideas_with_server(app: &AppHandle) -> Result<(), AppError> {
    let mut conn = open_connection(app)?;
    let pending_ideas = collect_pending_ideas(&conn)?;

    if pending_ideas.is_empty() {
        return Ok(());
    }

    let client = reqwest::blocking::Client::new();
    let url = format!("{}/sync/ideas", server_base_url(app));
    let body = SyncIdeasBody {
        ideas: pending_ideas.clone(),
    };

    client.post(url).json(&body).send()?.error_for_status()?;

    let local_ids: Vec<String> = pending_ideas.into_iter().map(|i| i.local_id).collect();
    mark_ideas_synced(&mut conn, &local_ids)?;

    Ok(())
}

fn sync_pending_votes_with_server(app: &AppHandle) -> Result<(), AppError> {
    let mut conn = open_connection(app)?;
    let pending_votes = collect_pending_votes(&conn)?;

    if pending_votes.is_empty() {
        return Ok(());
    }

    let client = reqwest::blocking::Client::new();
    let url = format!("{}/sync/votes", server_base_url(app));
    let body = SyncVotesBody {
        votes: pending_votes.clone(),
    };

    client.post(url).json(&body).send()?.error_for_status()?;

    let local_ids: Vec<String> = pending_votes.into_iter().map(|v| v.local_id).collect();
    mark_votes_synced(&mut conn, &local_ids)?;

    Ok(())
}

fn sync_pending_with_server(app: &AppHandle) -> Result<(), AppError> {
    // Sync ideas first, then votes. Each function is idempotent and skips work if nothing is pending.
    if let Err(err) = sync_pending_ideas_with_server(app) {
        eprintln!("sync_pending_ideas_with_server failed: {err}");
    }

    if let Err(err) = sync_pending_votes_with_server(app) {
        eprintln!("sync_pending_votes_with_server failed: {err}");
    }

    Ok(())
}

/// Simple test command to verify the JS <-> Rust bridge.
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {name} from Rust!")
}

/// Upsert an idea into local SQLite and mark it as pending, then attempt to sync to the Axum API.
#[tauri::command]
fn upsert_idea(app: AppHandle, input: IdeaInput) -> Result<Idea, String> {
    let mut conn = open_connection(&app).map_err(String::from)?;
    let now = now_iso();

    let id = {
        let tx = conn.transaction().map_err(AppError::from)?;

        // Try to read existing id first.
        let existing = tx
            .query_row(
                "SELECT id FROM ideas WHERE local_id = ?1",
                params![input.local_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(AppError::from)?;

        let id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());

        tx.execute(
            r#"
            INSERT INTO ideas (
                id,
                local_id,
                club_id,
                author_user_id,
                title,
                body,
                sync_status,
                created_at,
                updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?7)
            ON CONFLICT(local_id) DO UPDATE SET
                title = excluded.title,
                body = excluded.body,
                sync_status = 'pending',
                updated_at = excluded.updated_at
            "#,
            params![
                &id,
                input.local_id,
                input.club_id,
                input.author_user_id,
                input.title,
                input.body,
                now,
            ],
        )
        .map_err(AppError::from)?;

        tx.commit().map_err(AppError::from)?;
        id
    };

    // Attempt to sync in the background; failures are logged but don't break local save.
    let app_for_thread = app.clone();
    thread::spawn(move || {
        if let Err(err) = sync_pending_with_server(&app_for_thread) {
            eprintln!("background sync failed after upsert_idea: {err}");
        }
    });

    Ok(Idea {
        id,
        local_id: input.local_id,
        club_id: input.club_id,
        author_user_id: input.author_user_id,
        title: input.title,
        body: input.body,
        sync_status: SyncStatus::Pending.as_str().to_string(),
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Upsert a vote into local SQLite and mark it as pending, then attempt to sync to the Axum API.
#[tauri::command]
fn upsert_vote(app: AppHandle, input: VoteInput) -> Result<Vote, String> {
    let mut conn = open_connection(&app).map_err(String::from)?;
    let now = now_iso();

    let id = {
        let tx = conn.transaction().map_err(AppError::from)?;

        // Try to read existing id first.
        let existing = tx
            .query_row(
                "SELECT id FROM votes WHERE local_id = ?1",
                params![input.local_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(AppError::from)?;

        let id = existing.unwrap_or_else(|| Uuid::new_v4().to_string());

        tx.execute(
            r#"
            INSERT INTO votes (
                id,
                local_id,
                user_id,
                bullet_id,
                value,
                sync_status,
                created_at,
                updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6, ?6)
            ON CONFLICT(local_id) DO UPDATE SET
                value = excluded.value,
                sync_status = 'pending',
                updated_at = excluded.updated_at
            "#,
            params![
                &id,
                input.local_id,
                input.user_id,
                input.bullet_id,
                input.value,
                now,
            ],
        )
        .map_err(AppError::from)?;

        tx.commit().map_err(AppError::from)?;
        id
    };

    // Attempt to sync in the background; failures are logged but don't break local save.
    let app_for_thread = app.clone();
    thread::spawn(move || {
        if let Err(err) = sync_pending_with_server(&app_for_thread) {
            eprintln!("background sync failed after upsert_vote: {err}");
        }
    });

    Ok(Vote {
        id,
        local_id: input.local_id,
        bullet_id: input.bullet_id,
        user_id: input.user_id,
        value: input.value,
        sync_status: SyncStatus::Pending.as_str().to_string(),
        created_at: now.clone(),
        updated_at: now,
    })
}

/// Fetch all votes for a given bullet from local SQLite so the UI works offline.
#[tauri::command]
fn get_votes_for_bullet(app: AppHandle, bullet_id: String) -> Result<Vec<Vote>, String> {
    let conn = open_connection(&app).map_err(String::from)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, local_id, user_id, bullet_id, value, sync_status, created_at, updated_at
            FROM votes
            WHERE bullet_id = ?1
            ORDER BY updated_at DESC
            "#,
        )
        .map_err(AppError::from)?;

    let rows = stmt
        .query_map(params![bullet_id], |row| {
            Ok(Vote {
                id: row.get(0)?,
                local_id: row.get(1)?,
                user_id: row.get(2)?,
                bullet_id: row.get(3)?,
                value: row.get(4)?,
                sync_status: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })
        .map_err(AppError::from)?;

    let mut votes = Vec::new();
    for r in rows {
        votes.push(r.map_err(AppError::from)?);
    }

    Ok(votes)
}

/// Fetch all ideas from local SQLite so the UI works offline.
#[tauri::command]
fn get_all_ideas(app: AppHandle) -> Result<Vec<Idea>, String> {
    let conn = open_connection(&app).map_err(String::from)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, local_id, club_id, author_user_id, title, body, sync_status, created_at, updated_at
            FROM ideas
            ORDER BY updated_at DESC
            "#,
        )
        .map_err(AppError::from)?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Idea {
                id: row.get(0)?,
                local_id: row.get(1)?,
                club_id: row.get(2)?,
                author_user_id: row.get(3)?,
                title: row.get(4)?,
                body: row.get(5)?,
                sync_status: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(AppError::from)?;

    let mut ideas = Vec::new();
    for r in rows {
        ideas.push(r.map_err(AppError::from)?);
    }

    Ok(ideas)
}

/// Explicit command the frontend can call (e.g. when it detects `online`) to force a sync.
#[tauri::command]
fn trigger_sync(app: AppHandle) -> Result<(), String> {
    sync_pending_with_server(&app).map_err(String::from)
}

#[derive(Debug, Serialize, Deserialize)]
struct AuthFile {
    jwt: String,
}

/// Store a JWT token in a local auth.json file under the app data directory.
#[tauri::command]
fn save_jwt(app: AppHandle, token: String) -> Result<(), String> {
    // First, try to write into the OS keychain.
    if let Ok(entry) = keyring_entry() {
        if let Err(err) = entry.set_password(&token) {
            eprintln!("failed to store JWT in keyring: {err}");
        } else {
            // Best-effort: if we successfully wrote to keyring, remove any legacy auth.json file.
            if let Ok(path) = auth_path(&app) {
                if path.exists() {
                    let _ = fs::remove_file(path);
                }
            }
            return Ok(());
        }
    }

    // Fallback to legacy file-based storage if keyring is unavailable.
    let path = auth_path(&app).map_err(String::from)?;
    let data = AuthFile { jwt: token };
    let serialized = serde_json::to_string_pretty(&data).map_err(AppError::from)?;
    fs::write(path, serialized).map_err(AppError::from)?;
    Ok(())
}

/// Retrieve the stored JWT token, if present.
#[tauri::command]
fn get_jwt(app: AppHandle) -> Result<Option<String>, String> {
    // Prefer reading from OS keychain.
    if let Ok(entry) = keyring_entry() {
        match entry.get_password() {
            Ok(jwt) => return Ok(Some(jwt)),
            Err(keyring::Error::NoEntry) => {
                // Fall through to legacy file if nothing is stored yet.
            }
            Err(err) => {
                eprintln!("failed to read JWT from keyring: {err}");
            }
        }
    }

    // Fallback to legacy file-based storage.
    let path = auth_path(&app).map_err(String::from)?;
    if !path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(path).map_err(AppError::from)?;
    let auth: AuthFile = serde_json::from_str(&content).map_err(AppError::from)?;
    Ok(Some(auth.jwt))
}

/// Clear the stored JWT token.
#[tauri::command]
fn clear_jwt(app: AppHandle) -> Result<(), String> {
    // Clear from keyring first.
    if let Ok(entry) = keyring_entry() {
        if let Err(err) = entry.delete_password() {
            // Ignore "not found" errors; log others.
            if !matches!(err, keyring::Error::NoEntry) {
                eprintln!("failed to delete JWT from keyring: {err}");
            }
        }
    }

    // Also clear any legacy auth.json file.
    let path = auth_path(&app).map_err(String::from)?;
    if path.exists() {
        fs::remove_file(path).map_err(AppError::from)?;
    }
    Ok(())
}

fn spawn_background_sync(app: &AppHandle) {
    let app_handle = app.clone();
    thread::spawn(move || loop {
        if let Err(err) = sync_pending_with_server(&app_handle) {
            eprintln!("background sync loop error: {err}");
        }
        thread::sleep(Duration::from_secs(30));
    });
}

/// Shared entry point for desktop and mobile.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Load .env from project root when running `cargo tauri dev` from root
    let _ = dotenvy::dotenv();

    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            // Ensure local SQLite DB exists and schema is created.
            if let Err(err) = open_connection(&handle) {
                eprintln!("failed to initialize local SQLite DB: {err}");
            }

            // Start background sync worker.
            spawn_background_sync(&handle);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            upsert_idea,
            get_all_ideas,
            trigger_sync,
            save_jwt,
            get_jwt,
            clear_jwt,
            upsert_vote,
            get_votes_for_bullet
        ])
        .run(tauri::generate_context!())
        .expect("error while running Tauri application");
}

