ALTER TABLE notes ADD COLUMN content_key TEXT;

ALTER TABLE notes ADD COLUMN content_size INTEGER NOT NULL DEFAULT 0;

UPDATE notes
SET content_size = length(CAST(content AS BLOB))
WHERE content_size = 0;

CREATE TABLE IF NOT EXISTS note_search (
  note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  search_text TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_note_search_user_updated
  ON note_search (user_id, updated_at DESC);

INSERT OR REPLACE INTO note_search (note_id, user_id, title, search_text, updated_at)
SELECT id,
       user_id,
       title,
       substr(title || ' ' || content, 1, 60000),
       updated_at
FROM notes
WHERE user_id IS NOT NULL
  AND kind = 'page'
  AND is_archived = 0;
