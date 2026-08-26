ALTER TABLE notes ADD COLUMN summary TEXT NOT NULL DEFAULT '';

UPDATE notes
SET summary = substr(content, 1, 500)
WHERE summary = '';

UPDATE note_search
SET search_text = substr(search_text, 1, 16000);

CREATE TABLE IF NOT EXISTS note_upload_refs (
  note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  upload_id TEXT NOT NULL,
  PRIMARY KEY (note_id, upload_id)
);

CREATE INDEX IF NOT EXISTS idx_note_upload_refs_user_upload
  ON note_upload_refs (user_id, upload_id);

CREATE INDEX IF NOT EXISTS idx_note_upload_refs_user_note
  ON note_upload_refs (user_id, note_id);
