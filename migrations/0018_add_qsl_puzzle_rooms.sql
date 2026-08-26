CREATE TABLE IF NOT EXISTS qsl_puzzle_rooms (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  seed INTEGER NOT NULL,
  round_count INTEGER NOT NULL,
  difficulty INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting',
  started_at TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS qsl_puzzle_players (
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  completed_rounds INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY (room_id) REFERENCES qsl_puzzle_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_qsl_players_rank
  ON qsl_puzzle_players(room_id, score DESC, completed_rounds DESC, updated_at ASC);

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
