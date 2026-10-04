//! On-device board storage: one SQLite file in the app's data directory.

use std::path::Path;

use ideaplanner_core::BoardSummary;
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

    /// Every board on the device, most recently saved first.
    pub fn list(&self) -> rusqlite::Result<Vec<BoardSummary>> {
        let mut stmt = self.0.prepare(
            "SELECT id,
                    coalesce(json_extract(doc, '$.title'), ''),
                    coalesce(json_extract(doc, '$.icon'), ''),
                    coalesce(json_extract(doc, '$.date'), ''),
                    coalesce(json_extract(doc, '$.endDate'), ''),
                    (julianday(updated_at) - 2440587.5) * 86400000.0
             FROM boards ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([], |r| {
            Ok(BoardSummary {
                id: r.get(0)?,
                title: r.get(1)?,
                icon: r.get(2)?,
                date: r.get(3)?,
                end_date: r.get(4)?,
                updated_at: r.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn delete(&self, id: &str) -> rusqlite::Result<()> {
        self.0
            .execute("DELETE FROM boards WHERE id = ?1", params![id])?;
        Ok(())
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

    #[test]
    fn lists_and_deletes() {
        let db = Db::in_memory().unwrap();
        db.save("a", r#"{"title":"Trip","icon":"van","date":"2027-06-12"}"#)
            .unwrap();
        let list = db.list().unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].title, "Trip");
        assert_eq!(list[0].end_date, "");
        assert!(list[0].updated_at > 1.6e12);
        db.delete("a").unwrap();
        assert!(db.list().unwrap().is_empty());
    }
}
