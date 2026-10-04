//! On-device board storage: one SQLite file in the app's data directory.

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};

pub struct Db(Connection);

impl Db {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let conn = Connection::open(path)?;
        Self::init(conn)
    }

    #[cfg(test)]
    pub fn in_memory() -> rusqlite::Result<Self> {
        Self::init(Connection::open_in_memory()?)
    }

    fn init(conn: Connection) -> rusqlite::Result<Self> {
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS boards (
                 id TEXT PRIMARY KEY,
                 doc TEXT NOT NULL,
                 updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
             );",
        )?;
        Ok(Self(conn))
    }

    pub fn load(&self, id: &str) -> rusqlite::Result<Option<String>> {
        self.0
            .query_row("SELECT doc FROM boards WHERE id = ?1", params![id], |r| {
                r.get(0)
            })
            .optional()
    }

    pub fn save(&self, id: &str, doc: &str) -> rusqlite::Result<()> {
        self.0.execute(
            "INSERT INTO boards (id, doc) VALUES (?1, ?2)
             ON CONFLICT(id) DO UPDATE SET doc = excluded.doc,
                 updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
            params![id, doc],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_and_overwrites() {
        let db = Db::in_memory().unwrap();
        assert_eq!(db.load("a").unwrap(), None);
        db.save("a", "1").unwrap();
        db.save("a", "2").unwrap();
        assert_eq!(db.load("a").unwrap().as_deref(), Some("2"));
    }
}
