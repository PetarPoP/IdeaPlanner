use std::collections::{HashMap, HashSet};

use chrono::{DateTime, Utc};
use ideaplanner_core::{Board, BoardSummary};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tokio::sync::RwLock;

/// What someone may do on a board, weakest first.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Role {
    View,
    Edit,
    Admin,
}

/// What anyone with a board's link may do without being a member.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LinkAccess {
    None,
    View,
    Edit,
}

impl Role {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::View => "view",
            Self::Edit => "edit",
            Self::Admin => "admin",
        }
    }
    fn parse(s: &str) -> Self {
        match s {
            "admin" => Self::Admin,
            "edit" => Self::Edit,
            _ => Self::View,
        }
    }
}

impl LinkAccess {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::View => "view",
            Self::Edit => "edit",
        }
    }
    fn parse(s: &str) -> Self {
        match s {
            "none" => Self::None,
            "view" => Self::View,
            _ => Self::Edit,
        }
    }
    pub fn role(self) -> Option<Role> {
        match self {
            Self::None => None,
            Self::View => Some(Role::View),
            Self::Edit => Some(Role::Edit),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct User {
    pub id: String,
    pub email: String,
    pub name: String,
}

pub struct BoardRow {
    pub doc: String,
    pub owner: Option<String>,
    pub link: LinkAccess,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Member {
    #[serde(flatten)]
    pub user: User,
    pub role: Role,
}

/// A board in someone's list, with their role on it.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MyBoard {
    #[serde(flatten)]
    pub summary: BoardSummary,
    pub role: Role,
}

pub struct Login {
    pub token_hash: String,
    pub email: String,
    pub code_hash: String,
    pub expires: DateTime<Utc>,
}

/// Wrong codes allowed per sign-in email before it stops working.
const MAX_CODE_ATTEMPTS: i32 = 5;

/// Where boards and accounts are kept.
#[allow(clippy::large_enum_variant)] // one per process
pub enum Store {
    Postgres(PgPool),
    /// For local development and tests; forgets everything on restart.
    Memory(RwLock<Mem>),
}

#[derive(Default)]
pub struct Mem {
    boards: HashMap<String, MemBoard>,
    users: HashMap<String, User>,
    sessions: HashMap<String, (String, DateTime<Utc>)>,
    logins: HashMap<String, (Login, i32)>,
    members: HashMap<(String, String), Role>,
    sent: HashSet<(String, String)>,
}

struct MemBoard {
    doc: String,
    owner: Option<String>,
    link: LinkAccess,
    updated: f64,
}

fn now_ms() -> f64 {
    Utc::now().timestamp_millis() as f64
}

/// A random lowercase hex string of `bytes` random bytes.
pub fn random_hex(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).expect("system randomness");
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

fn summary_of(id: &str, doc: &str, updated: f64) -> BoardSummary {
    match Board::from_json(doc) {
        Ok(b) => b.summary(updated),
        Err(_) => BoardSummary {
            id: id.to_owned(),
            title: String::new(),
            icon: String::new(),
            date: String::new(),
            end_date: String::new(),
            updated_at: updated,
        },
    }
}

type UserRow = (String, String, String);
fn user((id, email, name): UserRow) -> User {
    User { id, email, name }
}

impl Store {
    pub fn memory() -> Self {
        Self::Memory(RwLock::default())
    }

    // Boards

    pub async fn get(&self, id: &str) -> sqlx::Result<Option<BoardRow>> {
        match self {
            Self::Postgres(pool) => {
                let row: Option<(String, Option<String>, String)> = sqlx::query_as(
                    "SELECT doc::text, owner_id, link_access FROM boards WHERE id = $1",
                )
                .bind(id)
                .fetch_optional(pool)
                .await?;
                Ok(row.map(|(doc, owner, link)| BoardRow {
                    doc,
                    owner,
                    link: LinkAccess::parse(&link),
                }))
            }
            Self::Memory(m) => Ok(m.read().await.boards.get(id).map(|b| BoardRow {
                doc: b.doc.clone(),
                owner: b.owner.clone(),
                link: b.link,
            })),
        }
    }

    /// Saves a board; a new one belongs to `owner` when someone is signed in.
    pub async fn put(&self, id: &str, doc: &str, owner: Option<&str>) -> sqlx::Result<()> {
        match self {
            Self::Postgres(pool) => {
                let created: Option<bool> = sqlx::query_scalar(
                    "INSERT INTO boards (id, doc, owner_id) VALUES ($1, $2::jsonb, $3)
                     ON CONFLICT (id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()
                     RETURNING (xmax = 0)",
                )
                .bind(id)
                .bind(doc)
                .bind(owner)
                .fetch_optional(pool)
                .await?;
                if let (Some(true), Some(owner)) = (created, owner) {
                    self.set_member(id, owner, Role::Admin).await?;
                }
                Ok(())
            }
            Self::Memory(m) => {
                let mut m = m.write().await;
                let created = !m.boards.contains_key(id);
                let b = m.boards.entry(id.to_owned()).or_insert_with(|| MemBoard {
                    doc: String::new(),
                    owner: owner.map(str::to_owned),
                    link: LinkAccess::Edit,
                    updated: 0.0,
                });
                b.doc = doc.to_owned();
                b.updated = now_ms();
                if let (true, Some(owner)) = (created, owner) {
                    m.members
                        .insert((id.to_owned(), owner.to_owned()), Role::Admin);
                }
                Ok(())
            }
        }
    }

    /// Makes `user` the owner of a board nobody owns yet.
    pub async fn claim(&self, id: &str, user: &str) -> sqlx::Result<bool> {
        let claimed = match self {
            Self::Postgres(pool) => {
                sqlx::query("UPDATE boards SET owner_id = $2 WHERE id = $1 AND owner_id IS NULL")
                    .bind(id)
                    .bind(user)
                    .execute(pool)
                    .await?
                    .rows_affected()
                    == 1
            }
            Self::Memory(m) => match m.write().await.boards.get_mut(id) {
                Some(b) if b.owner.is_none() => {
                    b.owner = Some(user.to_owned());
                    true
                }
                _ => false,
            },
        };
        if claimed {
            self.set_member(id, user, Role::Admin).await?;
        }
        Ok(claimed)
    }

    pub async fn set_link(&self, id: &str, link: LinkAccess) -> sqlx::Result<()> {
        match self {
            Self::Postgres(pool) => {
                sqlx::query("UPDATE boards SET link_access = $2 WHERE id = $1")
                    .bind(id)
                    .bind(link.as_str())
                    .execute(pool)
                    .await?;
            }
            Self::Memory(m) => {
                if let Some(b) = m.write().await.boards.get_mut(id) {
                    b.link = link;
                }
            }
        }
        Ok(())
    }

    // Members

    pub async fn members(&self, board: &str) -> sqlx::Result<Vec<Member>> {
        match self {
            Self::Postgres(pool) => {
                let rows: Vec<(String, String, String, String)> = sqlx::query_as(
                    "SELECT u.id, u.email, u.name, m.role FROM members m
                     JOIN users u ON u.id = m.user_id WHERE m.board_id = $1 ORDER BY u.email",
                )
                .bind(board)
                .fetch_all(pool)
                .await?;
                Ok(rows
                    .into_iter()
                    .map(|(id, email, name, role)| Member {
                        user: User { id, email, name },
                        role: Role::parse(&role),
                    })
                    .collect())
            }
            Self::Memory(m) => {
                let m = m.read().await;
                let mut out: Vec<Member> = m
                    .members
                    .iter()
                    .filter(|((b, _), _)| b == board)
                    .filter_map(|((_, u), role)| {
                        m.users.get(u).map(|user| Member {
                            user: user.clone(),
                            role: *role,
                        })
                    })
                    .collect();
                out.sort_by(|a, b| a.user.email.cmp(&b.user.email));
                Ok(out)
            }
        }
    }

    pub async fn role_of(&self, board: &str, user: &str) -> sqlx::Result<Option<Role>> {
        match self {
            Self::Postgres(pool) => {
                let role: Option<String> = sqlx::query_scalar(
                    "SELECT role FROM members WHERE board_id = $1 AND user_id = $2",
                )
                .bind(board)
                .bind(user)
                .fetch_optional(pool)
                .await?;
                Ok(role.as_deref().map(Role::parse))
            }
            Self::Memory(m) => Ok(m
                .read()
                .await
                .members
                .get(&(board.to_owned(), user.to_owned()))
                .copied()),
        }
    }

    pub async fn set_member(&self, board: &str, user: &str, role: Role) -> sqlx::Result<()> {
        match self {
            Self::Postgres(pool) => {
                sqlx::query(
                    "INSERT INTO members (board_id, user_id, role) VALUES ($1, $2, $3)
                     ON CONFLICT (board_id, user_id) DO UPDATE SET role = EXCLUDED.role",
                )
                .bind(board)
                .bind(user)
                .bind(role.as_str())
                .execute(pool)
                .await?;
            }
            Self::Memory(m) => {
                m.write()
                    .await
                    .members
                    .insert((board.to_owned(), user.to_owned()), role);
            }
        }
        Ok(())
    }

    pub async fn remove_member(&self, board: &str, user: &str) -> sqlx::Result<()> {
        match self {
            Self::Postgres(pool) => {
                sqlx::query("DELETE FROM members WHERE board_id = $1 AND user_id = $2")
                    .bind(board)
                    .bind(user)
                    .execute(pool)
                    .await?;
            }
            Self::Memory(m) => {
                m.write()
                    .await
                    .members
                    .remove(&(board.to_owned(), user.to_owned()));
            }
        }
        Ok(())
    }

    /// Boards `user` is a member of, most recently changed first.
    pub async fn user_boards(&self, user: &str) -> sqlx::Result<Vec<MyBoard>> {
        let mut out = match self {
            Self::Postgres(pool) => {
                let rows: Vec<(String, String, f64, String)> = sqlx::query_as(
                    "SELECT b.id, b.doc::text, (extract(epoch FROM b.updated_at) * 1000)::float8, m.role
                     FROM members m JOIN boards b ON b.id = m.board_id WHERE m.user_id = $1",
                )
                .bind(user)
                .fetch_all(pool)
                .await?;
                rows.into_iter()
                    .map(|(id, doc, updated, role)| MyBoard {
                        summary: summary_of(&id, &doc, updated),
                        role: Role::parse(&role),
                    })
                    .collect::<Vec<_>>()
            }
            Self::Memory(m) => {
                let m = m.read().await;
                m.members
                    .iter()
                    .filter(|((_, u), _)| u == user)
                    .filter_map(|((b, _), role)| {
                        m.boards.get(b).map(|row| MyBoard {
                            summary: summary_of(b, &row.doc, row.updated),
                            role: *role,
                        })
                    })
                    .collect()
            }
        };
        out.sort_by(|a, b| b.summary.updated_at.total_cmp(&a.summary.updated_at));
        Ok(out)
    }

    /// Every board that has members, for the reminder digest.
    pub async fn boards_with_members(&self) -> sqlx::Result<Vec<(String, String)>> {
        match self {
            Self::Postgres(pool) => {
                sqlx::query_as(
                    "SELECT b.id, b.doc::text FROM boards b
                     WHERE EXISTS (SELECT 1 FROM members m WHERE m.board_id = b.id)",
                )
                .fetch_all(pool)
                .await
            }
            Self::Memory(m) => {
                let m = m.read().await;
                let ids: HashSet<&String> = m.members.keys().map(|(b, _)| b).collect();
                Ok(ids
                    .into_iter()
                    .filter_map(|id| m.boards.get(id).map(|b| (id.clone(), b.doc.clone())))
                    .collect())
            }
        }
    }

    /// Records a reminder as sent; false when it already was.
    pub async fn mark_sent(&self, board: &str, key: &str) -> sqlx::Result<bool> {
        match self {
            Self::Postgres(pool) => Ok(sqlx::query(
                "INSERT INTO reminders_sent (board_id, key) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            )
            .bind(board)
            .bind(key)
            .execute(pool)
            .await?
            .rows_affected()
                == 1),
            Self::Memory(m) => Ok(m
                .write()
                .await
                .sent
                .insert((board.to_owned(), key.to_owned()))),
        }
    }

    // Users and sessions

    /// The account for `email`, created on first use. Fills in a missing name.
    pub async fn ensure_user(&self, email: &str, name: &str) -> sqlx::Result<User> {
        match self {
            Self::Postgres(pool) => sqlx::query_as::<_, UserRow>(
                "INSERT INTO users (id, email, name) VALUES ($1, $2, $3)
                 ON CONFLICT (email) DO UPDATE
                   SET name = CASE WHEN users.name = '' THEN EXCLUDED.name ELSE users.name END
                 RETURNING id, email, name",
            )
            .bind(random_hex(8))
            .bind(email)
            .bind(name)
            .fetch_one(pool)
            .await
            .map(user),
            Self::Memory(m) => {
                let mut m = m.write().await;
                if let Some(u) = m.users.values_mut().find(|u| u.email == email) {
                    if u.name.is_empty() {
                        u.name = name.to_owned();
                    }
                    return Ok(u.clone());
                }
                let u = User {
                    id: random_hex(8),
                    email: email.to_owned(),
                    name: name.to_owned(),
                };
                m.users.insert(u.id.clone(), u.clone());
                Ok(u)
            }
        }
    }

    pub async fn rename_user(&self, id: &str, name: &str) -> sqlx::Result<()> {
        match self {
            Self::Postgres(pool) => {
                sqlx::query("UPDATE users SET name = $2 WHERE id = $1")
                    .bind(id)
                    .bind(name)
                    .execute(pool)
                    .await?;
            }
            Self::Memory(m) => {
                if let Some(u) = m.write().await.users.get_mut(id) {
                    u.name = name.to_owned();
                }
            }
        }
        Ok(())
    }

    pub async fn new_session(
        &self,
        token_hash: &str,
        user: &str,
        expires: DateTime<Utc>,
    ) -> sqlx::Result<()> {
        match self {
            Self::Postgres(pool) => {
                sqlx::query(
                    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
                )
                .bind(token_hash)
                .bind(user)
                .bind(expires)
                .execute(pool)
                .await?;
            }
            Self::Memory(m) => {
                m.write()
                    .await
                    .sessions
                    .insert(token_hash.to_owned(), (user.to_owned(), expires));
            }
        }
        Ok(())
    }

    pub async fn session_user(&self, token_hash: &str) -> sqlx::Result<Option<User>> {
        match self {
            Self::Postgres(pool) => Ok(sqlx::query_as::<_, UserRow>(
                "SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
                 WHERE s.token_hash = $1 AND s.expires_at > now()",
            )
            .bind(token_hash)
            .fetch_optional(pool)
            .await?
            .map(user)),
            Self::Memory(m) => {
                let m = m.read().await;
                Ok(m.sessions
                    .get(token_hash)
                    .filter(|(_, exp)| *exp > Utc::now())
                    .and_then(|(u, _)| m.users.get(u).cloned()))
            }
        }
    }

    pub async fn end_session(&self, token_hash: &str) -> sqlx::Result<()> {
        match self {
            Self::Postgres(pool) => {
                sqlx::query("DELETE FROM sessions WHERE token_hash = $1 OR expires_at < now()")
                    .bind(token_hash)
                    .execute(pool)
                    .await?;
            }
            Self::Memory(m) => {
                m.write().await.sessions.remove(token_hash);
            }
        }
        Ok(())
    }

    pub async fn new_login(&self, login: Login) -> sqlx::Result<()> {
        match self {
            Self::Postgres(pool) => {
                sqlx::query("DELETE FROM logins WHERE expires_at < now()")
                    .execute(pool)
                    .await?;
                sqlx::query(
                    "INSERT INTO logins (token_hash, email, code_hash, expires_at) VALUES ($1, $2, $3, $4)",
                )
                .bind(&login.token_hash)
                .bind(&login.email)
                .bind(&login.code_hash)
                .bind(login.expires)
                .execute(pool)
                .await?;
            }
            Self::Memory(m) => {
                let mut m = m.write().await;
                m.logins.retain(|_, (l, _)| l.expires > Utc::now());
                m.logins.insert(login.token_hash.clone(), (login, 0));
            }
        }
        Ok(())
    }

    /// Uses up the sign-in link with this token; its email when still valid.
    pub async fn take_login(&self, token_hash: &str) -> sqlx::Result<Option<String>> {
        match self {
            Self::Postgres(pool) => sqlx::query_scalar(
                "DELETE FROM logins WHERE token_hash = $1 AND expires_at > now() RETURNING email",
            )
            .bind(token_hash)
            .fetch_optional(pool)
            .await,
            Self::Memory(m) => Ok(m
                .write()
                .await
                .logins
                .remove(token_hash)
                .filter(|(l, _)| l.expires > Utc::now())
                .map(|(l, _)| l.email)),
        }
    }

    /// Uses up a sign-in by its emailed code. Wrong codes count against
    /// every pending sign-in for the address.
    pub async fn take_login_code(&self, email: &str, code_hash: &str) -> sqlx::Result<bool> {
        match self {
            Self::Postgres(pool) => {
                let hit = sqlx::query(
                    "DELETE FROM logins WHERE email = $1 AND code_hash = $2
                     AND expires_at > now() AND attempts < $3",
                )
                .bind(email)
                .bind(code_hash)
                .bind(MAX_CODE_ATTEMPTS)
                .execute(pool)
                .await?
                .rows_affected()
                    > 0;
                if !hit {
                    sqlx::query("UPDATE logins SET attempts = attempts + 1 WHERE email = $1")
                        .bind(email)
                        .execute(pool)
                        .await?;
                }
                Ok(hit)
            }
            Self::Memory(m) => {
                let mut m = m.write().await;
                let now = Utc::now();
                let hit = m
                    .logins
                    .iter()
                    .find(|(_, (l, tries))| {
                        l.email == email
                            && l.code_hash == code_hash
                            && l.expires > now
                            && *tries < MAX_CODE_ATTEMPTS
                    })
                    .map(|(k, _)| k.clone());
                match hit {
                    Some(k) => {
                        m.logins.remove(&k);
                        Ok(true)
                    }
                    None => {
                        for (l, tries) in m.logins.values_mut() {
                            if l.email == email {
                                *tries += 1;
                            }
                        }
                        Ok(false)
                    }
                }
            }
        }
    }
}
