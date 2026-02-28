-- Migrations for experiments, shares and metrics
CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY,
  name TEXT,
  created_at INTEGER
);

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  experiment_id TEXT,
  user_id TEXT,
  platform TEXT,
  original_content TEXT,
  ai_content TEXT,
  post_id TEXT,
  published_at INTEGER,
  meta JSON,
  FOREIGN KEY(experiment_id) REFERENCES experiments(id)
);

CREATE TABLE IF NOT EXISTS metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  share_id TEXT,
  platform TEXT,
  metric_key TEXT,
  metric_value REAL,
  recorded_at INTEGER,
  FOREIGN KEY(share_id) REFERENCES shares(id)
);

-- Spreads — main publishing records
CREATE TABLE IF NOT EXISTS spreads (
  id TEXT PRIMARY KEY,
  media_url TEXT,
  media_type TEXT,
  ai_suggestion TEXT,
  user_text TEXT,
  platforms TEXT,
  content TEXT,
  metadata TEXT,
  created_at INTEGER
);

-- Resources table for external references (used by Turso libSQL insert)
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY,
  categoryId TEXT,
  name TEXT,
  payload JSON,
  created_at INTEGER
);
