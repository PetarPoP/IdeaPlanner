//! Email in: a mail provider (Cloudflare Email Routing, Mailgun, Postmark…)
//! forwards each message sent to `board-<id>@INBOX_DOMAIN` as raw MIME to
//! `POST /api/inbox`, and the message becomes an email card on that board.

use ideaplanner_core::{is_valid_id, Board, Node, NodeBody};
use mail_parser::{Message, MessageParser};

/// Longest body kept on a card; the rest of a long thread is noise.
const MAX_BODY_CHARS: usize = 4_000;
const LOCAL_PREFIX: &str = "board-";

#[derive(Clone)]
pub struct InboxConfig {
    /// Shared secret the forwarder sends as `Authorization: Bearer …`.
    pub token: String,
    /// Domain of the generated addresses, e.g. `in.ideaplanner.app`.
    pub domain: String,
}

impl InboxConfig {
    pub fn from_env() -> Option<Self> {
        let token = std::env::var("INBOX_TOKEN")
            .ok()
            .filter(|t| !t.is_empty())?;
        let domain = std::env::var("INBOX_DOMAIN")
            .ok()
            .filter(|d| !d.is_empty())?;
        Some(Self {
            token,
            domain: domain.to_ascii_lowercase(),
        })
    }

    /// The board an address like `board-abc123@domain` points at.
    pub fn board_id(&self, address: &str) -> Option<String> {
        let address = address.trim().trim_matches(['<', '>']).to_ascii_lowercase();
        let (local, domain) = address.rsplit_once('@')?;
        if domain != self.domain {
            return None;
        }
        let id = local.strip_prefix(LOCAL_PREFIX)?;
        is_valid_id(id).then(|| id.to_owned())
    }
}

/// The parts of a message an email card shows.
#[derive(Debug, PartialEq)]
pub struct Mail {
    pub from: String,
    pub to: Vec<String>,
    pub subject: String,
    pub date: String,
    pub body: String,
}

pub fn parse(raw: &[u8]) -> Option<Mail> {
    let msg = MessageParser::default().parse(raw)?;
    let addr = |a: &mail_parser::Addr| match (a.name(), a.address()) {
        (Some(n), Some(e)) => format!("{n} <{e}>"),
        (_, Some(e)) => e.to_owned(),
        (Some(n), None) => n.to_owned(),
        _ => String::new(),
    };
    let mut body = msg
        .body_text(0)
        .map(|b| b.trim().to_owned())
        .unwrap_or_default();
    if let Some((cut, _)) = body.char_indices().nth(MAX_BODY_CHARS) {
        body.truncate(cut);
        body.push('…');
    }
    Some(Mail {
        from: msg
            .from()
            .and_then(|a| a.first())
            .map(addr)
            .unwrap_or_default(),
        to: recipients(&msg),
        subject: msg.subject().unwrap_or_default().to_owned(),
        date: msg.date().map(|d| d.to_rfc3339()).unwrap_or_default(),
        body,
    })
}

/// Envelope recipients first (forwarders set these), then the To header.
fn recipients(msg: &Message) -> Vec<String> {
    let mut out: Vec<String> = ["X-Original-To", "Delivered-To", "X-Forwarded-To"]
        .into_iter()
        .filter_map(|h| msg.header_raw(h))
        .map(|v| v.trim().to_owned())
        .collect();
    if let Some(to) = msg.to() {
        out.extend(to.iter().filter_map(|a| a.address()).map(str::to_owned));
    }
    out
}

/// Appends `mail` to `board` as an email card under the existing cards.
pub fn add_to_board(board: &mut Board, mail: Mail, card_id: String) {
    let (x, y) = board.free_spot();
    board.nodes.push(Node {
        id: card_id,
        x,
        y,
        w: 320.0,
        title: if mail.subject.is_empty() {
            "Email".into()
        } else {
            mail.subject.clone()
        },
        icon: "envelope-simple".into(),
        accent: false,
        color: String::new(),
        comments: vec![],
        body: NodeBody::Email {
            from: mail.from,
            to: mail.to.first().cloned().unwrap_or_default(),
            subject: mail.subject,
            date: mail.date,
            body: mail.body,
        },
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    const RAW: &str = "From: Ana Kovac <ana@mail.com>\r\n\
To: board-trip42@in.example.com\r\n\
Subject: Your booking TP4K9Q\r\n\
Date: Mon, 4 Oct 2026 09:30:00 +0000\r\n\
Content-Type: text/plain; charset=utf-8\r\n\
\r\n\
Flight ZAG -> LIS on Jun 12, 07:05.\r\n";

    fn config() -> InboxConfig {
        InboxConfig {
            token: "t".into(),
            domain: "in.example.com".into(),
        }
    }

    #[test]
    fn parses_a_message() {
        let m = parse(RAW.as_bytes()).unwrap();
        assert_eq!(m.from, "Ana Kovac <ana@mail.com>");
        assert_eq!(m.subject, "Your booking TP4K9Q");
        assert_eq!(m.body, "Flight ZAG -> LIS on Jun 12, 07:05.");
        assert!(m.date.starts_with("2026-10-04T09:30:00"));
        assert_eq!(m.to, vec!["board-trip42@in.example.com".to_owned()]);
    }

    #[test]
    fn maps_addresses_to_boards() {
        let c = config();
        assert_eq!(
            c.board_id("<Board-Trip42@IN.example.com>").as_deref(),
            Some("trip42")
        );
        assert_eq!(c.board_id("board-trip42@other.com"), None);
        assert_eq!(c.board_id("ana@in.example.com"), None);
        assert_eq!(c.board_id("board-../x@in.example.com"), None);
    }
}
