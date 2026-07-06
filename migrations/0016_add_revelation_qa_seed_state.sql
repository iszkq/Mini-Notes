CREATE TABLE IF NOT EXISTS revelation_qa_seed_state (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  seed_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
