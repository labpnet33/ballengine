-- Guest users have free access to OUR social publishing workflows.
-- Platform posting always requires that user's explicit OAuth approval.
-- Apply only after cloud-saves/schema.sql, music-schema.sql, and guest-publishing-schema.sql.
CREATE TABLE IF NOT EXISTS guest_social_oauth_states (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  code_verifier TEXT,
  redirect_origin TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_social_oauth_expiry ON guest_social_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS guest_social_accounts (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  token_cipher TEXT NOT NULL,
  refresh_cipher TEXT,
  expires_at INTEGER,
  status TEXT NOT NULL DEFAULT 'connected',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(library_id,platform,provider_id)
);
CREATE INDEX IF NOT EXISTS idx_social_accounts_library ON guest_social_accounts(library_id,platform);

CREATE TABLE IF NOT EXISTS guest_social_jobs (
  id TEXT PRIMARY KEY,
  library_id TEXT NOT NULL,
  title TEXT NOT NULL,
  caption TEXT NOT NULL,
  media_id TEXT NOT NULL,
  tiktok_privacy TEXT NOT NULL DEFAULT 'SELF_ONLY',
  status TEXT NOT NULL DEFAULT 'queued',
  scheduled_at INTEGER NOT NULL,
  repeat_rule TEXT NOT NULL DEFAULT 'none',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_social_jobs_library ON guest_social_jobs(library_id,created_at DESC);

CREATE TABLE IF NOT EXISTS guest_social_deliveries (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  library_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  external_id TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER,
  UNIQUE(job_id,account_id)
);
CREATE INDEX IF NOT EXISTS idx_social_due ON guest_social_deliveries(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_social_job_deliveries ON guest_social_deliveries(job_id);
CREATE INDEX IF NOT EXISTS idx_social_library_deliveries ON guest_social_deliveries(library_id,updated_at DESC);
