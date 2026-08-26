ALTER TABLE notes ADD COLUMN share_token TEXT;

ALTER TABLE notes ADD COLUMN shared_at TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notes_share_token
  ON notes (share_token);
