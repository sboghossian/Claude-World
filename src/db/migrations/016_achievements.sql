-- Achievements tracking
CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL,
  achievement_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(world_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_achievements_world ON achievements(world_id, unlocked_at DESC);
