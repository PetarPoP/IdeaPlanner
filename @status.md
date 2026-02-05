# Project Status

## Current Focus
- **Identity & Auth:** Building the Login/Register flow and connecting it to the Rust/Neon backend.
- **Social Layer:** Implementing search, add, and delete functionality for friends (Friends table, Rust commands, list view).

## Completed
- [x] Scaffolded Next.js App Router + Tauri v2 workspace.
- [x] Next.js configured for static export (`output: 'export'`).
- [x] Basic Rust backend (Axum) and Tauri bridge initialized.
- [x] Local SQLite schema defined for offline-first support.
- [x] Recursive Bullet UI and basic Mapbox search logic implemented (Draft state).
- [x] **Tab-based navigation:** Bottom bar (mobile) and horizontal tabs (desktop); URL `?tab=ideas|trip|social`.
- [x] **Three main views:** Ideas (IdeaPlanner + Tauri bridge), Trip Planner (TripPlanner), Social (Friends placeholder).
- [x] Custom nav with `useSearchParams` for view switching (no shadcn Tabs).
- [x] **i18n:** Croatian as default, English switch; shell, tabs, Social view, and Tauri bridge section translated.

## Pending / Next Steps (CRITICAL)

### 1. UI Refactor: Layout & Tabs
- [x] Move from "Everything on center" to a **Tab-based navigation** (Bottom bar mobile, horizontal tabs desktop).
- [x] Create 3 main views: `Ideas`, `Trip Planner`, and `Social`.
- [x] Custom navigation hook / URL searchParams for view switching.
- [x] **Localization (hr/en):** Default Croatian; LanguageProvider + `lib/i18n`; language switch button (hr ↔ en), preference in localStorage.
- [x] **Rounded tab bar:** Pill-style desktop tabs (`rounded-2xl` container, `rounded-xl` active tab); rounded top on mobile bottom bar.

### 2. Authentication Flow
- [ ] Build **Login & Sign-up screens** in Next.js.
- [ ] Connect frontend to Axum `/auth` endpoints.
- [ ] Implement JWT storage in Rust using the `keyring` crate (Secure Keychain) with a fallback.
- [ ] Add a "Protect Route" wrapper to ensure only logged-in users see the Planner.

### 3. Social System (Friends)
- [ ] Build **Friend Search UI** (search by email/username/friend code).
- [ ] Implement `Friends` table in NeonDB and SQLite.
- [ ] Add Rust commands for `send_friend_request`, `accept_request`, and `remove_friend`.
- [ ] Create a "Friends List" view with online/offline status indicators.

### 4. Integration & Features (In Progress)
- [ ] **Voting & Budget:** Connect the existing UI logic to the actual
