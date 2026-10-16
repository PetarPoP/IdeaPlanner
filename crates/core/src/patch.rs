//! Live edits travel as patches instead of whole boards, so two people
//! changing different cards at the same time both keep their change.
//!
//! A patch replaces top-level fields (`title`, `people`…) and upserts or
//! removes items of the id-keyed lists (`nodes`, `edges`, `strokes`) one by
//! one. The last write wins per field and per item. The web app has the same
//! logic in `web/src/lib/patch.ts`.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// The lists patched item by item; every item has a string `id`.
pub const LISTS: [&str; 3] = ["nodes", "edges", "strokes"];

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct BoardPatch {
    /// Top-level fields to replace (never `id` or the lists above).
    #[serde(default, skip_serializing_if = "Map::is_empty")]
    pub set: Map<String, Value>,
    /// Items to insert or replace, per list.
    #[serde(default, skip_serializing_if = "Map::is_empty")]
    pub upsert: Map<String, Value>,
    /// Ids to remove, per list.
    #[serde(default, skip_serializing_if = "Map::is_empty")]
    pub remove: Map<String, Value>,
}

impl BoardPatch {
    pub fn is_empty(&self) -> bool {
        self.set.is_empty() && self.upsert.is_empty() && self.remove.is_empty()
    }
}

#[derive(Debug, thiserror::Error, PartialEq)]
pub enum PatchError {
    #[error("board document is not an object")]
    NotAnObject,
    #[error("patch may not change {0}")]
    Forbidden(String),
    #[error("malformed patch for {0}")]
    Malformed(String),
}

fn item_id(v: &Value) -> Option<&str> {
    v.get("id").and_then(Value::as_str)
}

/// Applies `patch` to a board document in place.
pub fn apply(doc: &mut Value, patch: &BoardPatch) -> Result<(), PatchError> {
    let obj = doc.as_object_mut().ok_or(PatchError::NotAnObject)?;

    for (key, value) in &patch.set {
        if key == "id" || LISTS.contains(&key.as_str()) {
            return Err(PatchError::Forbidden(key.clone()));
        }
        obj.insert(key.clone(), value.clone());
    }

    for (list, ids) in &patch.remove {
        if !LISTS.contains(&list.as_str()) {
            return Err(PatchError::Forbidden(list.clone()));
        }
        let ids: Vec<&str> = ids
            .as_array()
            .ok_or_else(|| PatchError::Malformed(list.clone()))?
            .iter()
            .filter_map(Value::as_str)
            .collect();
        if let Some(Value::Array(items)) = obj.get_mut(list) {
            items.retain(|v| !item_id(v).is_some_and(|id| ids.contains(&id)));
        }
    }

    for (list, new_items) in &patch.upsert {
        if !LISTS.contains(&list.as_str()) {
            return Err(PatchError::Forbidden(list.clone()));
        }
        let new_items = new_items
            .as_array()
            .ok_or_else(|| PatchError::Malformed(list.clone()))?;
        let items = obj
            .entry(list.clone())
            .or_insert_with(|| Value::Array(vec![]))
            .as_array_mut()
            .ok_or_else(|| PatchError::Malformed(list.clone()))?;
        for item in new_items {
            let id = item_id(item).ok_or_else(|| PatchError::Malformed(list.clone()))?;
            match items.iter_mut().find(|v| item_id(v) == Some(id)) {
                Some(slot) => *slot = item.clone(),
                None => items.push(item.clone()),
            }
        }
    }
    Ok(())
}

/// The patch that turns `old` into `new` (both board documents).
pub fn diff(old: &Value, new: &Value) -> BoardPatch {
    let mut patch = BoardPatch::default();
    let (Some(old), Some(new)) = (old.as_object(), new.as_object()) else {
        return patch;
    };
    for (key, value) in new {
        if key == "id" || LISTS.contains(&key.as_str()) {
            continue;
        }
        if old.get(key) != Some(value) {
            patch.set.insert(key.clone(), value.clone());
        }
    }
    for list in LISTS {
        let empty = vec![];
        let before = old.get(list).and_then(Value::as_array).unwrap_or(&empty);
        let after = new.get(list).and_then(Value::as_array).unwrap_or(&empty);
        let changed: Vec<Value> = after
            .iter()
            .filter(|item| !before.contains(item))
            .cloned()
            .collect();
        let gone: Vec<Value> = before
            .iter()
            .filter_map(item_id)
            .filter(|id| !after.iter().any(|v| item_id(v) == Some(id)))
            .map(|id| Value::String(id.to_owned()))
            .collect();
        if !changed.is_empty() {
            patch.upsert.insert(list.into(), Value::Array(changed));
        }
        if !gone.is_empty() {
            patch.remove.insert(list.into(), Value::Array(gone));
        }
    }
    patch
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn concurrent_edits_to_different_cards_both_survive() {
        let base =
            json!({"id":"b","title":"T","nodes":[{"id":"a","x":0},{"id":"b","x":0}],"edges":[]});
        let mut mine = base.clone();
        mine["nodes"][0]["x"] = json!(10);
        let mut theirs = base.clone();
        theirs["nodes"][1]["x"] = json!(20);
        theirs["title"] = json!("Trip");

        let mut server = base.clone();
        apply(&mut server, &diff(&base, &mine)).unwrap();
        apply(&mut server, &diff(&base, &theirs)).unwrap();
        assert_eq!(server["nodes"][0]["x"], 10);
        assert_eq!(server["nodes"][1]["x"], 20);
        assert_eq!(server["title"], "Trip");
    }

    #[test]
    fn adds_and_removes_items() {
        let old = json!({"id":"b","nodes":[{"id":"a"}],"strokes":[{"id":"s"}]});
        let new = json!({"id":"b","nodes":[{"id":"a"},{"id":"c"}],"strokes":[]});
        let p = diff(&old, &new);
        let mut doc = old.clone();
        apply(&mut doc, &p).unwrap();
        assert_eq!(doc, new);
        assert!(diff(&new, &new).is_empty());
    }

    #[test]
    fn refuses_to_change_the_id() {
        let mut doc = json!({"id":"b"});
        let mut p = BoardPatch::default();
        p.set.insert("id".into(), json!("x"));
        assert_eq!(apply(&mut doc, &p), Err(PatchError::Forbidden("id".into())));
    }
}
