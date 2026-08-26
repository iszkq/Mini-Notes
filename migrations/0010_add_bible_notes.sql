CREATE TABLE IF NOT EXISTS bible_notes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  book_name TEXT NOT NULL,
  chapter_number INTEGER NOT NULL,
  verse_start INTEGER NOT NULL,
  verse_end INTEGER NOT NULL,
  body TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bible_notes_user_chapter
  ON bible_notes (user_id, book_name, chapter_number, verse_start, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_bible_notes_user_updated
  ON bible_notes (user_id, updated_at DESC);
