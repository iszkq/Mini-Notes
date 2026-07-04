ALTER TABLE bible_notes ADD COLUMN selected_ranges TEXT NOT NULL DEFAULT '[]';

ALTER TABLE bible_notes ADD COLUMN content_key TEXT;

ALTER TABLE bible_notes ADD COLUMN content_size INTEGER NOT NULL DEFAULT 0;
