# Idea Planner

A shared planning board for trips, parties, renovations and anything else a
group plans together: cards for costs, day plans, maps, bookings, saved
places, checklists, polls, photos and Secret Santa draws, on an infinite
canvas, with a budget that splits costs and settles up between people.

One codebase ships as a **web app**, a **desktop app** (Windows, macOS, Linux)
and a **mobile app** (Android, iOS).

## How it fits together

```
web/          TanStack Start (SPA mode) + React + Tailwind: the whole UI
crates/core/  Rust: the board document model, validation, TS type generation
src-tauri/    Rust: Tauri 2 shell for desktop and mobile, boards in SQLite
server/       Rust: Axum server that hosts the web build and stores shared
              boards in Postgres (makes share links work)
```

- The board is one JSON document. Its shape is defined once in Rust
  (`crates/core/src/model.rs`) and generated into
  `web/src/lib/model.gen.ts` with ts-rs (`npm run gen:types`); CI fails if
  the two drift apart.
- Every store validates a board with the core crate before accepting it.
- The UI saves locally first (SQLite on desktop/mobile, `localStorage` in a
  browser) and, when a server is reachable, to the server too. Opening
  `/b/<board-id>` on a server-hosted build loads the shared copy.
- Styling uses the Nocturne design system's tokens, exposed as Tailwind
  theme values in `web/src/styles.css`.

## Develop

Prerequisites: Node 22+, Rust stable. For desktop builds, the
[Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS;
for mobile, Android Studio/NDK or Xcode.

```sh
npm install

npm run dev          # web app on http://localhost:3000 (boards in localStorage)
npm run desktop      # desktop app (Tauri) with hot reload
npm run server       # API + built web app on http://localhost:3001
```

Mobile (first time only: `npx tauri android init` / `npx tauri ios init`):

```sh
npm run android
npm run ios
```

Checks:

```sh
npm run typecheck && npm test
cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace
```

## Configuration

**[SETUP.md](SETUP.md)** walks through every service to switch on (database,
sign-in email, Google, Anthropic, email in, mobile). See `.env.example`. The server keeps boards in memory unless
`DATABASE_URL` points at Postgres (Neon works); migrations run on start.
Desktop and mobile builds sync with a server when built with
`VITE_API_URL`, and show share links when built with `VITE_PUBLIC_URL`.

## Deploy the web app

```sh
npm run build                       # → web/dist/client (static)
cargo build --release -p ideaplanner-server
DATABASE_URL=… WEB_DIST=web/dist/client ./target/release/ideaplanner-server
```

`web/dist/client` also works on any static host on its own; boards then
stay in each browser.

## Accounts, sharing and live editing

People sign in with an emailed link or code, or Google. A board saved while
signed in belongs to its creator; the Share panel sets what anyone with the
link can do (nothing, view, edit) and invites people as View, Edit or Admin.
The server enforces it. Boards nobody owns stay open to anyone with the link.
Everyone on a board edits it live over a WebSocket
(`/api/boards/<id>/live`): changes are small patches, last writer wins per
card, and you see others' cursors and selections.

## Email into a board

Each board can receive email at `board-<id>@<INBOX_DOMAIN>`. Point your mail
provider's inbound routing (Cloudflare Email Routing, Mailgun routes,
Postmark inbound…) at `POST /api/inbox` with the raw message as the body and
`Authorization: Bearer <INBOX_TOKEN>`. The server parses it (Rust,
`mail-parser`) and adds an email card. With both variables set, the address
shows on email cards and in the Share panel. Without a server, paste an
email or drop an `.eml` file onto an email card instead.

## Money

Costs can be in other currencies (converted with open.er-api.com rates),
receipts can be scanned into expenses, and settle-up links straight to
PayPal or Revolut (set each person's handle in People) with "Mark settled".

## Views

The bar at the top switches the same board between **Board** (the canvas),
**Cards** (every card in columns, with search and kind filters), **Costs**
(every cost line, paid status, split and settle-up) and **Timeline** (day
plans and bookings by date). Keys `1`–`4` do the same.

## Export

From the Costs or Timeline view (or `⌘/Ctrl E`): the itinerary as a PDF
(prints a clean, light page; pick "Save as PDF"), costs as CSV, and day
plans and bookings as a calendar (`.ics`). The desktop app saves files to
Downloads.

## Install and offline

The web build is an installable app (manifest and service worker in
`web/public`, registered only in production browser builds, never in Tauri).
Service workers need HTTPS (or `localhost`). Offline, the app still opens
and edits are saved on the device; they go to the server when the
connection is back.

## Keyboard

`S` select · `P` (or `H`) pan · `D` draw · `E` erase · `C` connect ·
hold `Space` or the middle mouse button to pan with any tool · drag on the
board to select several cards, `Shift`-click to add · `⌘/Ctrl A` select all ·
`⌘/Ctrl C`, `X`, `V` copy, cut, paste (pasting a link, an email or an image
makes a card) · `⌘/Ctrl D` duplicate · arrows nudge · `Delete` remove ·
`N` new idea · `F` fit · `1`–`4` views · `⌘/Ctrl K` find a board · `⌘/Ctrl E` export ·
`⌘/Ctrl Z` undo · `⇧⌘Z` redo · `?` all shortcuts.
