CREATE TABLE IF NOT EXISTS qsl_puzzle_guests (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  player_token TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  completed_rounds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (room_id) REFERENCES qsl_puzzle_rooms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_qsl_guests_rank
  ON qsl_puzzle_guests(room_id, score DESC, completed_rounds DESC, updated_at ASC);
