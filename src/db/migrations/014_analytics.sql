-- 014_analytics.sql — Analytics snapshots for caching computed metrics
CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  snapshot_date TEXT NOT NULL,
  range_key TEXT NOT NULL DEFAULT '30d',
  tasks_total INTEGER NOT NULL DEFAULT 0,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_usd REAL NOT NULL DEFAULT 0,
  avg_latency_ms REAL NOT NULL DEFAULT 0,
  zone_usage_json TEXT NOT NULL DEFAULT '{}',
  provider_usage_json TEXT NOT NULL DEFAULT '{}',
  agent_performance_json TEXT NOT NULL DEFAULT '[]',
  health_score INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(world_id, snapshot_date, range_key)
);

CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_world_date
  ON analytics_snapshots(world_id, snapshot_date DESC);
