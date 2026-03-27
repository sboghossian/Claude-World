-- Archive snapshots (world state saves)
CREATE TABLE IF NOT EXISTS world_snapshots (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  state_json TEXT NOT NULL DEFAULT '{}',
  xp_at_snapshot INTEGER DEFAULT 0,
  task_count_at_snapshot INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- R&D Lab experiments
CREATE TABLE IF NOT EXISTS experiments (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  prompt TEXT NOT NULL,
  result TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  is_promoted INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_world_snapshots_world ON world_snapshots(world_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_experiments_world ON experiments(world_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status);
