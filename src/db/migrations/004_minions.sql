-- Minion definitions (each minion is a named automated task)
CREATE TABLE IF NOT EXISTS minions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  schedule TEXT NOT NULL DEFAULT 'manual',
  provider TEXT DEFAULT 'auto',
  model TEXT DEFAULT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_run TEXT,
  next_run TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  last_output TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Minion run history
CREATE TABLE IF NOT EXISTS minion_runs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  minion_id TEXT NOT NULL REFERENCES minions(id) ON DELETE CASCADE,
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running',
  output TEXT DEFAULT NULL,
  error TEXT DEFAULT NULL,
  cost_usd REAL DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_minion_runs_minion ON minion_runs(minion_id, started_at DESC);
