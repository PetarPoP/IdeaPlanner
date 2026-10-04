//! Shared domain model for Idea Planner.
//!
//! The UI owns editing; Rust owns the document's shape and the checks every
//! store (device SQLite, server Postgres) runs before it accepts a write.

mod model;
pub mod patch;

use std::collections::HashSet;

pub use model::*;

/// Largest accepted board document. Photos are stored inline as downscaled
/// data URLs, so this leaves room for a few dozen of them.
pub const MAX_DOC_BYTES: usize = 16 * 1024 * 1024;
pub const MAX_NODES: usize = 1_000;
pub const MAX_PEOPLE: usize = 64;
const MAX_ID_LEN: usize = 64;

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum BoardError {
    #[error("board is {0} bytes, the limit is {MAX_DOC_BYTES}")]
    TooLarge(usize),
    #[error("board is not valid JSON for this version: {0}")]
    Malformed(String),
    #[error("invalid board id")]
    InvalidId,
    #[error("board has too many {0}")]
    TooMany(&'static str),
    #[error("duplicate card id {0}")]
    DuplicateNode(String),
    #[error("person index {0} is out of range")]
    UnknownPerson(PersonIx),
}

/// Board ids travel in URLs and file names: keep them short and URL-safe.
pub fn is_valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_ID_LEN
        && id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

impl Board {
    /// Parses and validates a board document received from a client.
    pub fn from_json(json: &str) -> Result<Self, BoardError> {
        if json.len() > MAX_DOC_BYTES {
            return Err(BoardError::TooLarge(json.len()));
        }
        let board: Board =
            serde_json::from_str(json).map_err(|e| BoardError::Malformed(e.to_string()))?;
        board.validate()?;
        Ok(board)
    }

    pub fn validate(&self) -> Result<(), BoardError> {
        if !is_valid_id(&self.id) {
            return Err(BoardError::InvalidId);
        }
        if self.nodes.len() > MAX_NODES {
            return Err(BoardError::TooMany("cards"));
        }
        if self.people.len() > MAX_PEOPLE {
            return Err(BoardError::TooMany("people"));
        }

        let mut ids = HashSet::with_capacity(self.nodes.len());
        for node in &self.nodes {
            if !ids.insert(node.id.as_str()) {
                return Err(BoardError::DuplicateNode(node.id.clone()));
            }
        }

        let people = self.people.len();
        let check = |ix: PersonIx| {
            if usize::from(ix) < people {
                Ok(())
            } else {
                Err(BoardError::UnknownPerson(ix))
            }
        };
        for st in &self.settlements {
            check(st.from)?;
            check(st.to)?;
        }
        for node in &self.nodes {
            match &node.body {
                NodeBody::Section { items, .. } => items.iter().try_for_each(|i| check(i.payer))?,
                NodeBody::Booking { payer, .. } => check(*payer)?,
                NodeBody::Checklist { items } => {
                    items.iter().filter_map(|t| t.who).try_for_each(check)?
                }
                _ => {}
            }
        }
        Ok(())
    }

    pub fn summary(&self, updated_at: f64) -> BoardSummary {
        BoardSummary {
            id: self.id.clone(),
            title: self.title.clone(),
            icon: self.icon.clone(),
            date: self.date.clone(),
            end_date: self.end_date.clone(),
            updated_at,
        }
    }

    /// A free spot for a new card of width `w`: under the board's lowest card,
    /// lined up with its leftmost one.
    pub fn free_spot(&self) -> (f64, f64) {
        let x = self.nodes.iter().map(|n| n.x).fold(f64::INFINITY, f64::min);
        // Card heights are only known to the UI; assume a tall one.
        let y = self.nodes.iter().map(|n| n.y + 400.0).fold(0.0, f64::max);
        (if x.is_finite() { x } else { 0.0 }, y)
    }

    /// Drops edges whose cards no longer exist (e.g. after a concurrent delete).
    pub fn prune_dangling_edges(&mut self) {
        let ids: HashSet<&str> = self.nodes.iter().map(|n| n.id.as_str()).collect();
        self.edges
            .retain(|e| ids.contains(e.from.as_str()) && ids.contains(e.to.as_str()));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn person(name: &str) -> Person {
        Person {
            name: name.into(),
            full: name.into(),
            ini: name[..1].into(),
            role: Role::Edit,
            user_id: String::new(),
            email: String::new(),
            paypal: String::new(),
            revolut: String::new(),
        }
    }

    fn board() -> Board {
        Board {
            id: "abc123".into(),
            title: "Trip".into(),
            icon: "van".into(),
            date: String::new(),
            end_date: String::new(),
            place: String::new(),
            cap: "1000".into(),
            cur: "€".into(),
            split_n: 2,
            people: vec![person("Ana"), person("Luka")],
            nodes: vec![Node {
                id: "n1".into(),
                x: 0.0,
                y: 0.0,
                w: 280.0,
                title: "Costs".into(),
                icon: "coins".into(),
                accent: false,
                color: String::new(),
                comments: vec![],
                body: NodeBody::Section {
                    items: vec![CostItem {
                        id: "i1".into(),
                        text: "Van".into(),
                        cost: "520".into(),
                        cur: String::new(),
                        paid: true,
                        payer: 1,
                        due: String::new(),
                    }],
                    budget: String::new(),
                },
            }],
            edges: vec![],
            strokes: vec![],
            activity: vec![],
            settlements: vec![],
            rates: Default::default(),
            rates_at: 0.0,
        }
    }

    #[test]
    fn round_trips_with_type_tag() {
        let json = serde_json::to_string(&board()).unwrap();
        assert!(json.contains(r#""type":"section""#));
        assert!(json.contains(r#""splitN":2"#));
        assert_eq!(Board::from_json(&json).unwrap(), board());
    }

    #[test]
    fn rejects_bad_ids_and_people() {
        let mut b = board();
        b.id = "../etc".into();
        assert_eq!(b.validate(), Err(BoardError::InvalidId));

        let mut b = board();
        if let NodeBody::Section { items, .. } = &mut b.nodes[0].body {
            items[0].payer = 7;
        }
        assert_eq!(b.validate(), Err(BoardError::UnknownPerson(7)));

        let mut b = board();
        b.nodes.push(b.nodes[0].clone());
        assert_eq!(b.validate(), Err(BoardError::DuplicateNode("n1".into())));
    }

    #[test]
    fn rejects_unknown_card_type() {
        let json = serde_json::to_string(&board())
            .unwrap()
            .replace(r#""type":"section""#, r#""type":"bogus""#);
        assert!(matches!(
            Board::from_json(&json),
            Err(BoardError::Malformed(_))
        ));
    }

    #[test]
    fn finds_a_free_spot_below_the_cards() {
        let mut b = board();
        b.nodes[0].x = -40.0;
        b.nodes[0].y = 100.0;
        assert_eq!(b.free_spot(), (-40.0, 500.0));
        b.nodes.clear();
        assert_eq!(b.free_spot(), (0.0, 0.0));
    }

    #[test]
    fn reads_boards_saved_before_new_fields() {
        let json = serde_json::to_string(&board())
            .unwrap()
            .replace(r#""endDate":"","place":"","#, "");
        assert!(!json.contains("endDate"));
        assert_eq!(Board::from_json(&json).unwrap(), board());
    }

    #[test]
    fn prunes_dangling_edges() {
        let mut b = board();
        b.edges.push(Edge {
            id: "e".into(),
            from: "n1".into(),
            to: "gone".into(),
        });
        b.prune_dangling_edges();
        assert!(b.edges.is_empty());
    }
}
