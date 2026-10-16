//! Exported files (CSV, calendar) written where people find them.

use std::fs::OpenOptions;
use std::io::{self, ErrorKind, Write};
use std::path::{Path, PathBuf};

/// Keeps a name the web side suggested to a plain file name: no folders,
/// nothing Windows or macOS refuse. `None` when nothing usable is left.
pub fn clean_name(name: &str) -> Option<String> {
    let cleaned: String = name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            c if c.is_control() => '-',
            c => c,
        })
        .collect();
    let cleaned = cleaned.trim().trim_matches('.').trim();
    (!cleaned.is_empty()).then(|| cleaned.to_owned())
}

/// `name`, then `name (1)`, `name (2)`… with the extension kept last.
fn candidate(name: &str, n: u32) -> String {
    if n == 0 {
        return name.to_owned();
    }
    match name.rsplit_once('.') {
        Some((stem, ext)) if !stem.is_empty() => format!("{stem} ({n}).{ext}"),
        _ => format!("{name} ({n})"),
    }
}

/// Writes `contents` as a new file in `dir`, never replacing an existing one.
pub fn write_unique(dir: &Path, name: &str, contents: &str) -> io::Result<PathBuf> {
    std::fs::create_dir_all(dir)?;
    for n in 0..1000 {
        let path = dir.join(candidate(name, n));
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut file) => {
                file.write_all(contents.as_bytes())?;
                return Ok(path);
            }
            Err(e) if e.kind() == ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }
    Err(io::Error::new(
        ErrorKind::AlreadyExists,
        "too many files with this name",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cleans_names() {
        assert_eq!(clean_name("trip.csv").as_deref(), Some("trip.csv"));
        assert_eq!(
            clean_name("../../etc/passwd").as_deref(),
            Some("-..-etc-passwd")
        );
        assert_eq!(clean_name("a:b?.ics").as_deref(), Some("a-b-.ics"));
        assert_eq!(clean_name(" .. "), None);
    }

    #[test]
    fn numbers_copies() {
        assert_eq!(candidate("trip.csv", 0), "trip.csv");
        assert_eq!(candidate("trip.csv", 2), "trip (2).csv");
        assert_eq!(candidate("trip", 1), "trip (1)");
    }

    #[test]
    fn never_overwrites() {
        let dir = std::env::temp_dir().join(format!("ideaplanner-files-{}", std::process::id()));
        let a = write_unique(&dir, "x.csv", "one").unwrap();
        let b = write_unique(&dir, "x.csv", "two").unwrap();
        assert_eq!(a.file_name().unwrap(), "x.csv");
        assert_eq!(b.file_name().unwrap(), "x (1).csv");
        assert_eq!(std::fs::read_to_string(&a).unwrap(), "one");
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
