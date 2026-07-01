CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

ALTER TABLE notes ADD COLUMN user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_notes_user_archive_parent_sort
  ON notes (user_id, is_archived, parent_id, sort_order DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notes_user_updated
  ON notes (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_user_expires
  ON sessions (user_id, expires_at DESC);
