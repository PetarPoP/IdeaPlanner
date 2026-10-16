-- Accounts, sessions and who may open which board.
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only hashes of session tokens and sign-in links are stored.
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS logins (
    token_hash TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS logins_email ON logins (email);

-- Boards without an owner stay open to anyone with the link, as before.
ALTER TABLE boards ADD COLUMN IF NOT EXISTS owner_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE boards ADD COLUMN IF NOT EXISTS link_access TEXT NOT NULL DEFAULT 'edit';

CREATE TABLE IF NOT EXISTS members (
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    PRIMARY KEY (board_id, user_id)
);
CREATE INDEX IF NOT EXISTS members_user ON members (user_id);

-- Reminder emails already sent, so the daily digest never repeats one.
CREATE TABLE IF NOT EXISTS reminders_sent (
    board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (board_id, key)
);
