//! Live boards over WebSocket (`/api/boards/{id}/live`). Everyone on a board
//! joins its room; edits arrive as patches (see `ideaplanner_core::patch`),
//! are applied to the room's copy in order and passed on to the others, and
//! the room writes the board back to the store shortly after.
//!
//! Client → server: `hello {name, color}`, `patch {seq, patch}`,
//! `cursor {x, y}`, `sel {ids}`.
//! Server → client: `welcome {you, role, board, peers}`, `ack {seq}`,
//! `reject {seq, board}`, `patch {from, patch}`, `join {peer}`,
//! `cursor {id, x, y}`, `sel {id, ids}`, `leave {id}`.

use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use axum::{
    extract::{
        ws::{Message, WebSocket},
        Path, Query, State, WebSocketUpgrade,
    },
    http::HeaderMap,
    response::Response,
};
use futures_util::{SinkExt, StreamExt};
use ideaplanner_core::{patch, Board};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::sync::{broadcast, Mutex as AsyncMutex};

use crate::api::{board_access, ApiError, AppState};
use crate::auth::{session_token, user_for_token};
use crate::store::Role;

/// How long a room waits after an edit before saving the board.
const FLUSH_AFTER: Duration = Duration::from_millis(800);
const MAX_PEERS: usize = 50;

#[derive(Default)]
pub struct Rooms {
    rooms: Mutex<HashMap<String, Arc<Room>>>,
    next_id: AtomicU64,
}

pub struct Room {
    doc: AsyncMutex<RoomDoc>,
    tx: broadcast::Sender<(u64, Arc<str>)>,
    peers: Mutex<HashMap<u64, Peer>>,
}

struct RoomDoc {
    doc: Value,
    dirty: bool,
    flushing: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Peer {
    id: u64,
    name: String,
    color: String,
    user_id: Option<String>,
    role: Role,
    x: Option<f64>,
    y: Option<f64>,
}

#[derive(Deserialize)]
#[serde(tag = "t", rename_all = "lowercase")]
enum In {
    Hello {
        #[serde(default)]
        name: String,
        #[serde(default)]
        color: String,
    },
    Patch {
        seq: u64,
        patch: patch::BoardPatch,
    },
    Cursor {
        x: f64,
        y: f64,
    },
    Sel {
        ids: Vec<String>,
    },
}

impl Rooms {
    fn get(&self, id: &str) -> Option<Arc<Room>> {
        self.rooms.lock().expect("lock").get(id).cloned()
    }

    async fn join(&self, state: &AppState, id: &str) -> Result<Arc<Room>, ApiError> {
        if let Some(room) = self.get(id) {
            return Ok(room);
        }
        let row = state.store.get(id).await?.ok_or(ApiError::NotFound)?;
        let doc: Value = serde_json::from_str(&row.doc).map_err(|_| ApiError::NotFound)?;
        let mut rooms = self.rooms.lock().expect("lock");
        // Someone may have opened the room while the board was loading.
        Ok(rooms
            .entry(id.to_owned())
            .or_insert_with(|| {
                Arc::new(Room {
                    doc: AsyncMutex::new(RoomDoc {
                        doc,
                        dirty: false,
                        flushing: false,
                    }),
                    tx: broadcast::channel(256).0,
                    peers: Mutex::default(),
                })
            })
            .clone())
    }

    /// The live copy of a board, when someone has it open.
    pub async fn current(&self, id: &str) -> Option<Value> {
        let room = self.get(id)?;
        let doc = room.doc.lock().await.doc.clone();
        Some(doc)
    }

    /// A whole-board save (or a server-side change) while a room is open:
    /// the room takes the new board and passes the difference on.
    pub async fn replace(&self, id: &str, new: &Value) {
        let Some(room) = self.get(id) else { return };
        let mut d = room.doc.lock().await;
        let diff = patch::diff(&d.doc, new);
        d.doc = new.clone();
        d.dirty = false;
        if !diff.is_empty() {
            let _ = room.tx.send((
                0,
                json!({ "t": "patch", "from": 0, "patch": diff })
                    .to_string()
                    .into(),
            ));
        }
    }

    fn leave(&self, id: &str, room: &Arc<Room>, peer: u64) -> bool {
        let empty = {
            let mut peers = room.peers.lock().expect("lock");
            peers.remove(&peer);
            peers.is_empty()
        };
        let _ = room
            .tx
            .send((peer, json!({ "t": "leave", "id": peer }).to_string().into()));
        if empty {
            let mut rooms = self.rooms.lock().expect("lock");
            if rooms.get(id).is_some_and(|r| Arc::ptr_eq(r, room)) {
                rooms.remove(id);
            }
        }
        empty
    }
}

#[derive(Deserialize)]
pub struct LiveQuery {
    /// Session token for clients that can't send headers on a WebSocket.
    token: Option<String>,
}

pub async fn live(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Query(q): Query<LiveQuery>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Result<Response, ApiError> {
    let token = q.token.as_deref().or_else(|| session_token(&headers));
    let user = user_for_token(&state, token).await?;
    let (_, role) = board_access(&state, &id, user.as_ref()).await?;
    let role = role.ok_or(if user.is_some() {
        ApiError::Forbidden
    } else {
        ApiError::SignIn
    })?;
    let room = state.rooms.join(&state, &id).await?;
    if room.peers.lock().expect("lock").len() >= MAX_PEERS {
        return Err(ApiError::TooMany);
    }
    let user_id = user.map(|u| u.id);
    Ok(ws
        .max_message_size(ideaplanner_core::MAX_DOC_BYTES)
        .on_upgrade(move |socket| async move {
            run(socket, state, id, room, role, user_id).await;
        }))
}

async fn run(
    socket: WebSocket,
    state: Arc<AppState>,
    id: String,
    room: Arc<Room>,
    role: Role,
    user_id: Option<String>,
) {
    let me = state.rooms.next_id.fetch_add(1, Ordering::Relaxed) + 1;
    let (mut tx, mut rx) = socket.split();
    let mut events = room.tx.subscribe();
    let send = |v: Value| Message::Text(v.to_string().into());
    let mut joined = false;

    loop {
        tokio::select! {
            msg = rx.next() => {
                let Some(Ok(msg)) = msg else { break };
                let text = match msg {
                    Message::Text(t) => t,
                    Message::Close(_) => break,
                    _ => continue,
                };
                let Ok(input) = serde_json::from_str::<In>(&text) else { continue };
                let reply = match input {
                    In::Hello { name, color } if !joined => {
                        joined = true;
                        let peer = Peer {
                            id: me,
                            name: name.chars().take(40).collect(),
                            color: color.chars().take(16).collect(),
                            user_id: user_id.clone(),
                            role,
                            x: None,
                            y: None,
                        };
                        let others: Vec<Peer> = {
                            let mut peers = room.peers.lock().expect("lock");
                            let others = peers.values().cloned().collect();
                            peers.insert(me, peer.clone());
                            others
                        };
                        let board = room.doc.lock().await.doc.clone();
                        let _ = room.tx.send((me, json!({ "t": "join", "peer": peer }).to_string().into()));
                        Some(json!({ "t": "welcome", "you": me, "role": role, "board": board, "peers": others }))
                    }
                    _ if !joined => None,
                    In::Hello { .. } => None,
                    In::Patch { seq, patch } => Some(apply(&state, &id, &room, me, role, seq, patch).await),
                    In::Cursor { x, y } => {
                        if let Some(p) = room.peers.lock().expect("lock").get_mut(&me) {
                            p.x = Some(x);
                            p.y = Some(y);
                        }
                        let _ = room.tx.send((me, json!({ "t": "cursor", "id": me, "x": x, "y": y }).to_string().into()));
                        None
                    }
                    In::Sel { ids } => {
                        let ids: Vec<String> = ids.into_iter().take(200).collect();
                        let _ = room.tx.send((me, json!({ "t": "sel", "id": me, "ids": ids }).to_string().into()));
                        None
                    }
                };
                if let Some(reply) = reply {
                    if tx.send(send(reply)).await.is_err() {
                        break;
                    }
                }
            }
            ev = events.recv() => {
                match ev {
                    Ok((from, text)) if from != me && joined => {
                        if tx.send(Message::Text(text.as_ref().into())).await.is_err() {
                            break;
                        }
                    }
                    Ok(_) => {}
                    // Fell behind: start over from the room's copy.
                    Err(broadcast::error::RecvError::Lagged(_)) => {
                        let board = room.doc.lock().await.doc.clone();
                        if tx.send(send(json!({ "t": "reject", "seq": 0, "board": board }))).await.is_err() {
                            break;
                        }
                    }
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
        }
    }

    if state.rooms.leave(&id, &room, me) {
        flush(&state, &id, &room).await;
    }
}

async fn apply(
    state: &Arc<AppState>,
    id: &str,
    room: &Arc<Room>,
    me: u64,
    role: Role,
    seq: u64,
    p: patch::BoardPatch,
) -> Value {
    let mut d = room.doc.lock().await;
    let reject = |doc: &Value| json!({ "t": "reject", "seq": seq, "board": doc });
    if role < Role::Edit {
        return reject(&d.doc);
    }
    let mut next = d.doc.clone();
    if patch::apply(&mut next, &p).is_err() {
        return reject(&d.doc);
    }
    let valid = serde_json::from_value::<Board>(next.clone())
        .ok()
        .filter(|b| b.id == id && b.validate().is_ok());
    if valid.is_none() {
        return reject(&d.doc);
    }
    d.doc = next;
    d.dirty = true;
    let _ = room.tx.send((
        me,
        json!({ "t": "patch", "from": me, "patch": p })
            .to_string()
            .into(),
    ));
    if !d.flushing {
        d.flushing = true;
        let (state, id, room) = (state.clone(), id.to_owned(), room.clone());
        tokio::spawn(async move {
            tokio::time::sleep(FLUSH_AFTER).await;
            flush(&state, &id, &room).await;
        });
    }
    json!({ "t": "ack", "seq": seq })
}

async fn flush(state: &AppState, id: &str, room: &Room) {
    let doc = {
        let mut d = room.doc.lock().await;
        d.flushing = false;
        if !d.dirty {
            return;
        }
        d.dirty = false;
        d.doc.to_string()
    };
    if let Err(e) = state.store.put(id, &doc, None).await {
        tracing::error!(error = %e, board = id, "saving a live board failed");
        room.doc.lock().await.dirty = true;
    }
}
