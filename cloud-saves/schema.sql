-- Isolated anonymous BallEngine project library; no account credentials stored.
CREATE TABLE IF NOT EXISTS saves (
 id TEXT PRIMARY KEY,
 library_id TEXT NOT NULL,
 name TEXT NOT NULL,
 config TEXT NOT NULL,
 checksum TEXT,
 scope TEXT NOT NULL DEFAULT 'personal',
 is_default INTEGER NOT NULL DEFAULT 0,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,
 size_bytes INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_saves_library_updated ON saves(library_id,updated_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS save_versions (
 id TEXT PRIMARY KEY,
 save_id TEXT NOT NULL,
 library_id TEXT NOT NULL,
 version INTEGER NOT NULL,
 config TEXT NOT NULL,
 checksum TEXT,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_save_versions_tenant ON save_versions(library_id,save_id,version DESC);
CREATE TABLE IF NOT EXISTS write_limits (
 day_ip_hash TEXT PRIMARY KEY,
 day TEXT NOT NULL,
 count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_write_limits_day ON write_limits(day);
