//! The board document. It is stored as one JSON document per board (SQLite on
//! device, Postgres JSONB on the server) and mirrored to TypeScript with ts-rs.
//!
//! Money values are kept as the strings people typed (`"12,50"`), so a field
//! can hold a half-typed number; the UI parses them when it sums.

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
        /// ISO date (`YYYY-MM-DD`) of the event, or empty.
        #[serde(default)]
        pub date: String,
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
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    pub struct Person {
        /// Short display name.
        pub name: String,
        pub full: String,
        pub ini: String,
        pub role: Role,
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
        Itinerary { date: String, stops: Vec<Stop> },
        Booking {
            kind: BookingKind,
            from: String,
            to: String,
            when: String,
            conf: String,
            cost: String,
            paid: bool,
            payer: PersonIx,
        },
        Places { items: Vec<Place> },
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
        pub paid: bool,
        pub payer: PersonIx,
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
    }

    #[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
    pub struct Activity {
        pub who: String,
        pub msg: String,
        /// Unix time in milliseconds.
        pub t: f64,
    }
}
