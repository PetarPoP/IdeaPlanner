//! The board document. It is stored as one JSON document per board (SQLite on
//! device, Postgres JSONB on the server) and mirrored to TypeScript with ts-rs.
//!
//! Money values are kept as the strings people typed (`"12,50"`), so a field
//! can hold a half-typed number; the UI parses them when it sums.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// Index into [`Board::people`].
pub type PersonIx = u8;

macro_rules! model {
    ($($item:item)*) => {
        $(
            #[cfg_attr(feature = "ts", derive(ts_rs::TS))]
            #[cfg_attr(feature = "ts", ts(export, export_to = "../../../web/src/lib/model.gen.ts"))]
            $item
        )*
    };
}

model! {
    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct Board {
        pub id: String,
        pub title: String,
        pub icon: String,
        /// ISO date (`YYYY-MM-DD`) the plan starts, or empty.
        #[serde(default)]
        pub date: String,
        /// ISO date the plan ends, or empty for a one-day plan.
        #[serde(default)]
        pub end_date: String,
        /// Where it happens, free text ("Lisbon → Algarve").
        #[serde(default)]
        pub place: String,
        /// Total budget.
        #[serde(default)]
        pub cap: String,
        pub cur: String,
        /// How many of `people` the costs are split between.
        pub split_n: u8,
        pub people: Vec<Person>,
        pub nodes: Vec<Node>,
        #[serde(default)]
        pub edges: Vec<Edge>,
        #[serde(default)]
        pub strokes: Vec<Stroke>,
        #[serde(default)]
        pub activity: Vec<Activity>,
        /// Payments people made to each other to settle up.
        #[serde(default)]
        pub settlements: Vec<Settlement>,
        /// What one unit of another currency is worth in `cur`, keyed by the
        /// currency as typed on costs (`"$"`, `"USD"`…).
        #[serde(default)]
        pub rates: BTreeMap<String, f64>,
        /// When `rates` were fetched (Unix ms), 0 if never.
        #[serde(default)]
        pub rates_at: f64,
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    pub struct Settlement {
        pub id: String,
        pub from: PersonIx,
        pub to: PersonIx,
        pub amount: String,
        /// Unix time in milliseconds.
        pub t: f64,
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    pub struct Comment {
        pub id: String,
        /// Display name of the author.
        pub who: String,
        pub text: String,
        /// Unix time in milliseconds.
        pub t: f64,
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct Person {
        /// Short display name.
        pub name: String,
        pub full: String,
        pub ini: String,
        pub role: Role,
        /// Account this person signed in with, once linked.
        #[serde(default)]
        pub user_id: String,
        #[serde(default)]
        pub email: String,
        /// PayPal.me username, for settle-up links.
        #[serde(default)]
        pub paypal: String,
        /// Revolut username (revolut.me/…), for settle-up links.
        #[serde(default)]
        pub revolut: String,
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
    pub enum Role {
        View,
        Edit,
        Admin,
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    pub struct Node {
        pub id: String,
        pub x: f64,
        pub y: f64,
        pub w: f64,
        pub title: String,
        pub icon: String,
        #[serde(default)]
        pub accent: bool,
        /// Palette key (`violet`, `amber`, `mint`, `rose`, `sky`), empty for the default surface.
        #[serde(default)]
        pub color: String,
        #[serde(default)]
        pub comments: Vec<Comment>,
        #[serde(flatten)]
        pub body: NodeBody,
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    #[serde(tag = "type", rename_all = "lowercase")]
    pub enum NodeBody {
        Section { items: Vec<CostItem>, budget: String },
        Note { text: String, votes: Vec<PersonIx>, author: String },
        Checklist { items: Vec<Task> },
        Poll { options: Vec<PollOption> },
        Link { url: String },
        Image { src: Option<String> },
        Santa { cap: String, pairs: Option<Vec<PersonIx>>, revealed: Vec<PersonIx> },
        Map { input: String },
        Itinerary {
            /// ISO date (`YYYY-MM-DD`).
            date: String,
            stops: Vec<Stop>,
        },
        #[serde(rename_all = "camelCase")]
        Booking {
            kind: BookingKind,
            from: String,
            to: String,
            /// Departure / check-in / pickup: ISO date and `HH:MM`.
            #[serde(default)]
            start_date: String,
            #[serde(default)]
            start_time: String,
            /// Return / check-out / drop-off.
            #[serde(default)]
            end_date: String,
            #[serde(default)]
            end_time: String,
            conf: String,
            cost: String,
            /// Currency of `cost` when it differs from the board's.
            #[serde(default)]
            cur: String,
            paid: bool,
            payer: PersonIx,
        },
        Places { items: Vec<Place> },
        Sticky { text: String },
        /// A titled area drawn behind cards; moving it moves the cards inside.
        Frame { h: f64 },
        Email {
            from: String,
            to: String,
            subject: String,
            /// As sent, e.g. an RFC 2822 date or an ISO date.
            date: String,
            body: String,
        },
    }

    #[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
    pub enum BookingKind {
        Flight,
        Stay,
        Car,
        Ticket,
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    pub struct CostItem {
        pub id: String,
        pub text: String,
        pub cost: String,
        /// Currency of `cost` when it differs from the board's.
        #[serde(default)]
        pub cur: String,
        pub paid: bool,
        pub payer: PersonIx,
        /// ISO date the payment is due, for reminders.
        #[serde(default)]
        pub due: String,
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    pub struct Task {
        pub id: String,
        pub text: String,
        pub done: bool,
        pub who: Option<PersonIx>,
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    pub struct Stop {
        pub id: String,
        pub time: String,
        pub place: String,
        pub cost: String,
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    pub struct Place {
        pub id: String,
        pub name: String,
        /// Index into the UI's place categories.
        pub cat: u8,
        pub hearts: Vec<PersonIx>,
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    pub struct PollOption {
        pub id: String,
        pub text: String,
        pub votes: Vec<PersonIx>,
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    pub struct Edge {
        pub id: String,
        pub from: String,
        pub to: String,
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    pub struct Stroke {
        pub id: String,
        pub pts: Vec<(i32, i32)>,
        /// CSS colour; empty means the accent colour.
        #[serde(default)]
        pub color: String,
    }

    /// One row of the "my boards" list.
    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    #[serde(rename_all = "camelCase")]
    pub struct BoardSummary {
        pub id: String,
        pub title: String,
        pub icon: String,
        #[serde(default)]
        pub date: String,
        #[serde(default)]
        pub end_date: String,
        /// Unix time in milliseconds of the last save.
        pub updated_at: f64,
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    pub struct Activity {
        pub who: String,
        pub msg: String,
        /// Unix time in milliseconds.
        pub t: f64,
    }
}
