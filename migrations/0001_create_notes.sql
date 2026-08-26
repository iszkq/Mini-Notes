CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled',
  icon TEXT NOT NULL DEFAULT 'Note',
  parent_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
  content TEXT NOT NULL DEFAULT '[]',
  is_archived INTEGER NOT NULL DEFAULT 0,
  sort_order REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_archive_parent_sort
  ON notes (is_archived, parent_id, sort_order DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notes_updated
  ON notes (is_archived, updated_at DESC);

