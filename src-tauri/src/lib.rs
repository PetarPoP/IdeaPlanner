//! Tauri shell for desktop (Windows, macOS, Linux) and mobile (Android, iOS).
//! The UI is the same web build as the browser version; this side stores
//! boards on the device and validates them with the shared core crate.

mod db;
mod files;

use std::sync::Mutex;

use ideaplanner_core::{is_valid_id, Board, BoardError, BoardSummary};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use db::Db;

#[derive(Debug, thiserror::Error)]
enum CommandError {
    #[error("invalid board id")]
    InvalidId,
    #[error(transparent)]
    Board(#[from] BoardError),
    #[error("board id in the document does not match")]
    IdMismatch,
    #[error("storage error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("invalid file name")]
    InvalidFileName,
    #[error("no downloads folder: {0}")]
    NoDownloads(#[from] tauri::Error),
    #[error("could not write the file: {0}")]
    Io(#[from] std::io::Error),
}

// Commands return errors to JS as their message.
impl Serialize for CommandError {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

type CmdResult<T> = Result<T, CommandError>;

#[tauri::command]
fn load_board(db: State<'_, Mutex<Db>>, id: String) -> CmdResult<Option<String>> {
    if !is_valid_id(&id) {
        return Err(CommandError::InvalidId);
    }
    Ok(db.lock().expect("db lock").load(&id)?)
}

#[tauri::command]
fn save_board(db: State<'_, Mutex<Db>>, id: String, doc: String) -> CmdResult<()> {
    let board = Board::from_json(&doc)?;
    if board.id != id {
        return Err(CommandError::IdMismatch);
    }
    db.lock().expect("db lock").save(&id, &doc)?;
    Ok(())
}

#[tauri::command]
fn list_boards(db: State<'_, Mutex<Db>>) -> CmdResult<Vec<BoardSummary>> {
    Ok(db.lock().expect("db lock").list()?)
}

#[tauri::command]
fn delete_board(db: State<'_, Mutex<Db>>, id: String) -> CmdResult<()> {
    if !is_valid_id(&id) {
        return Err(CommandError::InvalidId);
    }
    Ok(db.lock().expect("db lock").delete(&id)?)
}

/// Writes an export into Downloads (never over an existing file); returns its path.
#[tauri::command]
fn save_text_file(app: AppHandle, name: String, contents: String) -> CmdResult<String> {
    let name = files::clean_name(&name).ok_or(CommandError::InvalidFileName)?;
    let dir = app.path().download_dir()?;
    let path = files::write_unique(&dir, &name, &contents)?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let db = Db::open(&dir.join("boards.sqlite3"))?;
            app.manage(Mutex::new(db));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_board,
            save_board,
            list_boards,
            delete_board,
            save_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running Idea Planner");
}
