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

See `.env.example`. The server keeps boards in memory unless
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

## Keyboard

`V` select · `H` pan · `P` draw · `C` connect · `N` new idea · `F` fit ·
`⌘/Ctrl Z` undo · `⇧⌘Z` redo · `⌘/Ctrl D` duplicate · `Delete` remove ·
double-click the board for a quick idea.
