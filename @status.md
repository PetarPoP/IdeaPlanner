# Project Status

## Current focus
- Board rework from the "Idea Planner Board" design is in place (branch
  `claude/idea-planner-board-rework-v34w4n`).

## Stack
- `web/`: TanStack Start (SPA mode), React 19, Tailwind 4, Zustand,
  Phosphor icons. Same build runs in browser, Tauri desktop and mobile.
- `crates/core/`: Rust board model + validation; generates
  `web/src/lib/model.gen.ts` (ts-rs).
- `src-tauri/`: Tauri 2, boards stored in SQLite (`load_board`/`save_board`).
- `server/`: Axum 0.8 + sqlx/Postgres, serves the web build and
  `/api/boards/{id}`.

## Completed
- [x] Infinite canvas: pan, pinch/wheel zoom, snap-to-grid drag, connections,
      pen strokes, undo/redo (typing coalesced per field), keyboard shortcuts.
- [x] Card types: costs, day plan, map (Google Maps embed), booking, places,
      idea/vote, checklist, poll, link, photo (downscaled, stored inline),
      Secret Santa draw.
- [x] Budget: totals, per-card budgets, per-person split, paid balances,
      settle-up transfers, quick expense entry, currency.
- [x] Side panel (Budget, Tasks, People with roles/invite/QR, Activity),
      templates dialog, responsive phone layout.
- [x] Persistence: localStorage / SQLite on device, Postgres on server,
      share links `/b/<id>`.
- [x] CI: typecheck, vitest, build, fmt, clippy, cargo test, generated type
      drift check.

## Next steps
- Real-time collaboration (presence cursors, live updates): today the last
  save wins and others see changes on reload.
- Accounts/auth so roles are enforced server-side (roles are stored only).
- `tauri android init` / `tauri ios init` and store signing.
- Photo storage outside the board document for large boards.

## Tech debt / known issues
- Map embeds rely on Google Maps' public embed URLs.
