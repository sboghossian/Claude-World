-- Agent Skill Trees — per-agent skill progression
CREATE TABLE IF NOT EXISTS agent_skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(world_id, agent_id, skill_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_skills_world ON agent_skills(world_id, agent_id);
