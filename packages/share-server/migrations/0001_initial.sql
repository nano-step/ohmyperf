-- @ohmyperf/share-server — initial D1 schema
-- Mirrors the D1_SCHEMA constant in src/workers.ts.
-- Apply with: wrangler d1 migrations apply ohmyperf-share-prod

CREATE TABLE IF NOT EXISTS share_records (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  password_hash TEXT,
  private INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS share_uploads (
  ip TEXT NOT NULL,
  id TEXT NOT NULL,
  at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_uploads_ip_at ON share_uploads (ip, at);
