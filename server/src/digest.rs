//! A daily email to each board's members about what's coming up in the next
//! two days (departures, check-ins, day plans, payments due). Runs only when
//! real email is configured. Each event is mailed once.

use std::{sync::Arc, time::Duration};

use chrono::{Timelike, Utc};
use ideaplanner_core::{reminders, Board};

use crate::api::AppState;
use crate::mailer::{esc, layout, Mail};

/// Days ahead a digest looks.
const AHEAD_DAYS: i64 = 2;

pub fn spawn(state: Arc<AppState>) {
    if !state.mailer.sends_real_mail() {
        return;
    }
    let hour: u32 = std::env::var("DIGEST_HOUR_UTC")
        .ok()
        .and_then(|h| h.parse().ok())
        .filter(|h| *h < 24)
        .unwrap_or(7);
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_secs(600));
        let mut last_day = None;
        loop {
            tick.tick().await;
            let now = Utc::now();
            let today = now.date_naive();
            if now.hour() < hour || last_day == Some(today) {
                continue;
            }
            last_day = Some(today);
            if let Err(e) = run(&state).await {
                tracing::error!(error = %e, "reminder digest failed");
            }
        }
    });
}

async fn run(state: &AppState) -> anyhow::Result<()> {
    let today = Utc::now().date_naive();
    let from = today.format("%Y-%m-%d").to_string();
    let until = (today + chrono::Duration::days(AHEAD_DAYS))
        .format("%Y-%m-%d")
        .to_string();
    for (id, doc) in state.store.boards_with_members().await? {
        let Ok(board) = Board::from_json(&doc) else {
            continue;
        };
        let mut fresh = Vec::new();
        for r in reminders::upcoming(&board, &from, &until) {
            if state.store.mark_sent(&id, &r.key).await? {
                fresh.push(r);
            }
        }
        if fresh.is_empty() {
            continue;
        }
        let link = format!("{}/b/{id}", state.auth.public_url);
        let lines: Vec<String> = fresh
            .iter()
            .map(|r| {
                let when = if r.time.is_empty() {
                    r.date.clone()
                } else {
                    format!("{} {}", r.date, r.time)
                };
                format!("{when} · {}: {}", r.what, r.title)
            })
            .collect();
        let subject = format!(
            "Coming up on {}",
            if board.title.is_empty() {
                "your board"
            } else {
                &board.title
            }
        );
        for m in state.store.members(&id).await? {
            let mail = Mail {
                to: &m.user.email,
                subject: &subject,
                text: format!("{}\n\n{link}", lines.join("\n")),
                html: layout(
                    &subject,
                    &lines.iter().map(|l| esc(l)).collect::<Vec<_>>(),
                    Some(("Open the board", &link)),
                ),
            };
            if let Err(e) = state.mailer.send(mail).await {
                tracing::warn!(error = %e, "reminder email failed");
            }
        }
    }
    Ok(())
}
