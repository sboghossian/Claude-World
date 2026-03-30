-- Daily Digest — auto-generated summaries of world activity
CREATE TABLE IF NOT EXISTS daily_digests (
  id TEXT PRIMARY KEY,
  world_id INTEGER NOT NULL,
  digest_date TEXT NOT NULL,
  tasks_completed INTEGER NOT NULL DEFAULT 0,
  tasks_failed INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost REAL NOT NULL DEFAULT 0.0,
  top_achievement TEXT DEFAULT '',
  most_active_zone TEXT DEFAULT '',
  agent_of_day TEXT DEFAULT '',
  health_change TEXT NOT NULL DEFAULT 'stable',
  ai_summary TEXT DEFAULT '',
  weekly_summary TEXT DEFAULT '',
  insights TEXT DEFAULT '[]',
  raw_data TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_digests_world_date ON daily_digests(world_id, digest_date);
CREATE INDEX IF NOT EXISTS idx_digests_world ON daily_digests(world_id);

-- Daily goals tracking
CREATE TABLE IF NOT EXISTS daily_goals (
  id TEXT PRIMARY KEY,
  world_id INTEGER NOT NULL,
  goal_date TEXT NOT NULL,
  label TEXT NOT NULL,
  target_value REAL NOT NULL DEFAULT 1,
  current_value REAL NOT NULL DEFAULT 0,
  goal_type TEXT NOT NULL DEFAULT 'tasks',
  completed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_goals_world_date ON daily_goals(world_id, goal_date);
