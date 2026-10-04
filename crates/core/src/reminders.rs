//! What is coming up on a board: departures, check-ins, day plans and
//! payments due. The server mails these as a daily digest; the web app has
//! the same rules in `web/src/lib/reminders.ts` for its bell.

use crate::{Board, BookingKind, NodeBody};

#[derive(Debug, Clone, PartialEq)]
pub struct Reminder {
    /// Stable per event, so a digest never repeats one.
    pub key: String,
    pub node_id: String,
    /// ISO date and optional `HH:MM`.
    pub date: String,
    pub time: String,
    /// "Check-in", "Depart", "Payment due"…
    pub what: String,
    pub title: String,
}

fn starts(kind: &BookingKind) -> (&'static str, &'static str) {
    match kind {
        BookingKind::Flight => ("Depart", "Return"),
        BookingKind::Stay => ("Check-in", "Check-out"),
        BookingKind::Car => ("Pickup", "Drop-off"),
        BookingKind::Ticket => ("Starts", "Ends"),
    }
}

/// Events dated from `from` to `until` (ISO dates, inclusive), soonest first.
pub fn upcoming(board: &Board, from: &str, until: &str) -> Vec<Reminder> {
    let within = |d: &str| d.len() == 10 && d >= from && d <= until;
    let mut out = Vec::new();
    let mut push = |node: &str, tag: &str, date: &str, time: &str, what: &str, title: &str| {
        if within(date) {
            out.push(Reminder {
                key: format!("{node}:{tag}:{date}"),
                node_id: node.to_owned(),
                date: date.to_owned(),
                time: time.to_owned(),
                what: what.to_owned(),
                title: title.to_owned(),
            });
        }
    };
    for n in &board.nodes {
        match &n.body {
            NodeBody::Booking {
                kind,
                start_date,
                start_time,
                end_date,
                end_time,
                ..
            } => {
                let (s, e) = starts(kind);
                push(&n.id, "s", start_date, start_time, s, &n.title);
                if end_date != start_date {
                    push(&n.id, "e", end_date, end_time, e, &n.title);
                }
            }
            NodeBody::Itinerary { date, stops } => {
                let time = stops.iter().find(|s| !s.time.is_empty());
                let time = time.map(|s| s.time.as_str()).unwrap_or("");
                push(&n.id, "d", date, time, "Day plan", &n.title);
            }
            NodeBody::Section { items, .. } => {
                for i in items.iter().filter(|i| !i.paid) {
                    let title = if i.text.is_empty() { &n.title } else { &i.text };
                    push(&n.id, &i.id, &i.due, "", "Payment due", title);
                }
            }
            _ => {}
        }
    }
    out.sort_by(|a, b| (&a.date, &a.time).cmp(&(&b.date, &b.time)));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_events_in_the_window() {
        let board = Board::from_json(
            r#"{"id":"b","title":"T","icon":"van","cur":"€","splitN":1,"people":[{"name":"A","full":"A","ini":"A","role":"Admin"}],
            "nodes":[
              {"id":"f","x":0,"y":0,"w":1,"title":"TP 123","icon":"x","accent":false,"type":"booking",
               "kind":"Flight","from":"ZAG","to":"LIS","startDate":"2027-06-12","startTime":"07:05",
               "endDate":"2027-06-19","endTime":"","conf":"","cost":"","paid":false,"payer":0},
              {"id":"c","x":0,"y":0,"w":1,"title":"Costs","icon":"x","accent":false,"type":"section","budget":"",
               "items":[{"id":"i1","text":"Deposit","cost":"50","paid":false,"payer":0,"due":"2027-06-10"},
                        {"id":"i2","text":"Paid","cost":"50","paid":true,"payer":0,"due":"2027-06-10"}]}
            ]}"#,
        )
        .unwrap();
        let r = upcoming(&board, "2027-06-10", "2027-06-12");
        let got: Vec<_> = r
            .iter()
            .map(|r| (r.what.as_str(), r.key.as_str()))
            .collect();
        assert_eq!(
            got,
            [
                ("Payment due", "c:i1:2027-06-10"),
                ("Depart", "f:s:2027-06-12")
            ]
        );
    }
}
