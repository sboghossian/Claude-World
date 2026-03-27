-- Agent-to-agent relationships
CREATE TABLE IF NOT EXISTS agent_relationships (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  agent_a_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  agent_b_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL DEFAULT 'colleague',
  trust_level INTEGER NOT NULL DEFAULT 50,
  briefing_direction TEXT DEFAULT NULL,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Incident reports
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  reporter_agent_id TEXT REFERENCES agents(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  status TEXT NOT NULL DEFAULT 'open',
  zone_id TEXT REFERENCES zones(id),
  resolved_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_incidents_world ON incidents(world_id, created_at DESC);
