-- Prompt Library — saved, reusable AI prompts with variable substitution
CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  world_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  template TEXT NOT NULL DEFAULT '',
  description TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  usage_count INTEGER NOT NULL DEFAULT 0,
  starred INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prompts_world ON prompts(world_id);
CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(world_id, category);
CREATE INDEX IF NOT EXISTS idx_prompts_starred ON prompts(world_id, starred);
