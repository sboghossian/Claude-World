-- Globe Room: AI-powered research intelligence
CREATE TABLE IF NOT EXISTS research_queries (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  query TEXT NOT NULL,
  result TEXT DEFAULT NULL,
  sources_json TEXT DEFAULT '[]',
  is_monitored INTEGER NOT NULL DEFAULT 0,
  last_queried_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_research_world ON research_queries(world_id, created_at DESC);

-- Broadcast Tower: outbound notification channels
CREATE TABLE IF NOT EXISTS broadcast_channels (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  channel_type TEXT NOT NULL DEFAULT 'webhook',  -- webhook|slack|email|log
  endpoint TEXT DEFAULT '',
  triggers_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  last_broadcast_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS broadcast_log (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  channel_id TEXT REFERENCES broadcast_channels(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'sent',  -- sent|failed|pending|test
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_broadcast_channels_world ON broadcast_channels(world_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_log_world ON broadcast_log(world_id, created_at DESC);
