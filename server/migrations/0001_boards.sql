-- One JSON document per board; see crates/core for its shape.
CREATE TABLE IF NOT EXISTS boards (
    id TEXT PRIMARY KEY,
    doc JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
