-- User identity / avatar
CREATE TABLE IF NOT EXISTS identity (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT 'Commander',
  avatar_emoji TEXT NOT NULL DEFAULT '🧠',
  avatar_color TEXT NOT NULL DEFAULT '#7c3aed',
  title TEXT NOT NULL DEFAULT 'World Builder',
  bio TEXT DEFAULT '',
  reputation INTEGER NOT NULL DEFAULT 0,
  badges_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Reputation events (what earned each point)
CREATE TABLE IF NOT EXISTS reputation_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rep_events_world ON reputation_events(world_id, created_at DESC);
