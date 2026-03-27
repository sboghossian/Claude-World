PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name TEXT NOT NULL,
  template TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  xp INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 1,
  day_count INTEGER NOT NULL DEFAULT 1,
  time_of_day REAL NOT NULL DEFAULT 0.25,
  weather TEXT NOT NULL DEFAULT 'clear',
  mood_score REAL NOT NULL DEFAULT 0.5
);

CREATE TABLE IF NOT EXISTS zones (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  zone_type TEXT NOT NULL,
  name TEXT NOT NULL,
  grid_x INTEGER NOT NULL,
  grid_y INTEGER NOT NULL,
  grid_w INTEGER NOT NULL DEFAULT 3,
  grid_h INTEGER NOT NULL DEFAULT 3,
  unlocked INTEGER NOT NULL DEFAULT 0,
  build_progress REAL NOT NULL DEFAULT 0.0,
  discovered INTEGER NOT NULL DEFAULT 0,
  level INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  config_json TEXT DEFAULT '{}',
  unlocked_at TEXT,
  discovered_at TEXT
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  zone_id TEXT REFERENCES zones(id),
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  personality TEXT NOT NULL DEFAULT 'methodical',
  level INTEGER NOT NULL DEFAULT 1,
  xp INTEGER NOT NULL DEFAULT 0,
  tile_x INTEGER NOT NULL DEFAULT 0,
  tile_y INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL DEFAULT 'idle',
  sprite_set TEXT NOT NULL DEFAULT 'default',
  system_prompt TEXT,
  memory_json TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS relationships (
  agent_a TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  agent_b TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  trust REAL NOT NULL DEFAULT 0.5,
  rapport REAL NOT NULL DEFAULT 0.5,
  interaction_count INTEGER NOT NULL DEFAULT 0,
  last_interaction TEXT,
  PRIMARY KEY (agent_a, agent_b)
);

CREATE TABLE IF NOT EXISTS api_keys (
  provider TEXT PRIMARY KEY,
  encrypted_key BLOB NOT NULL,
  display_name TEXT,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used TEXT,
  total_spent REAL NOT NULL DEFAULT 0.0,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  zone_id TEXT REFERENCES zones(id),
  agent_id TEXT REFERENCES agents(id),
  quest_id TEXT,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  prompt TEXT NOT NULL,
  system_prompt TEXT,
  response TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  latency_ms INTEGER,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  metadata_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  prompt_template TEXT NOT NULL,
  zone_type TEXT,
  config_schema TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quests (
  id TEXT PRIMARY KEY,
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  chain_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'locked',
  sort_order INTEGER NOT NULL DEFAULT 0,
  reward_xp INTEGER NOT NULL DEFAULT 50,
  trigger_type TEXT,
  trigger_value TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES snapshots(id),
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  data_json BLOB NOT NULL,
  size_bytes INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS world_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  source_id TEXT,
  target_id TEXT,
  data_json TEXT DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(prompt, response, content=tasks, content_rowid=rowid);

CREATE TRIGGER IF NOT EXISTS tasks_fts_insert AFTER INSERT ON tasks BEGIN
  INSERT INTO tasks_fts(rowid, prompt, response) VALUES (new.rowid, new.prompt, new.response);
END;
CREATE TRIGGER IF NOT EXISTS tasks_fts_update AFTER UPDATE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, prompt, response) VALUES('delete', old.rowid, old.prompt, old.response);
  INSERT INTO tasks_fts(rowid, prompt, response) VALUES (new.rowid, new.prompt, new.response);
END;
CREATE TRIGGER IF NOT EXISTS tasks_fts_delete AFTER DELETE ON tasks BEGIN
  INSERT INTO tasks_fts(tasks_fts, rowid, prompt, response) VALUES('delete', old.rowid, old.prompt, old.response);
END;

CREATE INDEX IF NOT EXISTS idx_zones_world ON zones(world_id);
CREATE INDEX IF NOT EXISTS idx_agents_world ON agents(world_id);
CREATE INDEX IF NOT EXISTS idx_agents_zone ON agents(zone_id);
CREATE INDEX IF NOT EXISTS idx_tasks_world ON tasks(world_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status) WHERE status IN ('pending', 'running');
CREATE INDEX IF NOT EXISTS idx_quests_world ON quests(world_id, chain_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_snapshots_world ON snapshots(world_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_world ON world_events(world_id, created_at DESC);
