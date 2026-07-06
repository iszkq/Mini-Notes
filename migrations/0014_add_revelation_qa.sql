CREATE TABLE IF NOT EXISTS revelation_qa_primary_categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS revelation_qa_secondary_categories (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  primary_id TEXT NOT NULL REFERENCES revelation_qa_primary_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS revelation_qa_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secondary_id TEXT NOT NULL REFERENCES revelation_qa_secondary_categories(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answers TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revelation_qa_primary_user_sort
  ON revelation_qa_primary_categories (user_id, sort_order DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_revelation_qa_secondary_user_primary_sort
  ON revelation_qa_secondary_categories (user_id, primary_id, sort_order DESC, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_revelation_qa_items_user_secondary_sort
  ON revelation_qa_items (user_id, secondary_id, sort_order DESC, updated_at DESC);
