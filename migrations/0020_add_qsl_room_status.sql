ALTER TABLE qsl_puzzle_rooms ADD COLUMN status TEXT NOT NULL DEFAULT 'waiting';
ALTER TABLE qsl_puzzle_rooms ADD COLUMN started_at TEXT;
