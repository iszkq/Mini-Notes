ALTER TABLE notes ADD COLUMN kind TEXT NOT NULL DEFAULT 'page';

UPDATE notes
SET kind = 'page'
WHERE kind IS NULL OR TRIM(kind) = '';

CREATE INDEX IF NOT EXISTS idx_notes_user_kind_archive_parent_sort
  ON notes (user_id, kind, is_archived, parent_id, sort_order DESC, updated_at DESC);
