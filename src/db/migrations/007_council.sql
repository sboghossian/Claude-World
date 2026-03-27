-- Council sessions (one prompt sent to multiple models)
CREATE TABLE IF NOT EXISTS council_sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  models_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Individual model responses within a council session
CREATE TABLE IF NOT EXISTS council_responses (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  session_id TEXT NOT NULL REFERENCES council_sessions(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  response TEXT DEFAULT NULL,
  cost_usd REAL DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
