-- Airport: Import/Export terminal and external deploy tokens
CREATE TABLE IF NOT EXISTS airport_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  operation TEXT NOT NULL DEFAULT 'export',  -- export|import
  file_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_kb REAL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS deploy_tokens (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id INTEGER NOT NULL UNIQUE REFERENCES worlds(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_airport_log_world ON airport_log(world_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deploy_tokens_world ON deploy_tokens(world_id);
