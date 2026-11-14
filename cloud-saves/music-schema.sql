CREATE TABLE IF NOT EXISTS media_uploads (id TEXT PRIMARY KEY,library_id TEXT NOT NULL,name TEXT NOT NULL,mime TEXT NOT NULL,size_bytes INTEGER NOT NULL,checksum TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_library_checksum ON media_uploads(library_id,checksum);
CREATE INDEX IF NOT EXISTS idx_media_library ON media_uploads(library_id);
CREATE TABLE IF NOT EXISTS media_chunks (asset_id TEXT NOT NULL,library_id TEXT NOT NULL,chunk_index INTEGER NOT NULL,data_b64 TEXT NOT NULL,PRIMARY KEY (asset_id,chunk_index));
CREATE TABLE IF NOT EXISTS songs (id TEXT NOT NULL,library_id TEXT NOT NULL,name TEXT NOT NULL,media_id TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(id,library_id));
CREATE INDEX IF NOT EXISTS idx_songs_library_created ON songs(library_id,created_at DESC);
CREATE TABLE IF NOT EXISTS melodies (id TEXT NOT NULL,library_id TEXT NOT NULL,name TEXT NOT NULL,data TEXT NOT NULL,created_at INTEGER NOT NULL,PRIMARY KEY(id,library_id));
CREATE INDEX IF NOT EXISTS idx_melodies_library_created ON melodies(library_id,created_at DESC);