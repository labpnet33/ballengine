-- Original BallEngine guest publishing planner (manual posting, not OAuth social auto-publishing)
CREATE TABLE IF NOT EXISTS guest_publish_jobs (
 id TEXT PRIMARY KEY,
 library_id TEXT NOT NULL,
 title TEXT NOT NULL,
 caption TEXT NOT NULL,
 platforms_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft',
 scheduled_at INTEGER,
 repeat_rule TEXT NOT NULL DEFAULT 'none',
 media_id TEXT,
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL,
 completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_guest_publish_library ON guest_publish_jobs(library_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_publish_schedule ON guest_publish_jobs(library_id,status,scheduled_at);