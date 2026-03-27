-- Exchange: API integration hub
CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  service TEXT NOT NULL DEFAULT 'custom',
  endpoint_url TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'disconnected',  -- connected|disconnected|error
  last_pinged_at TEXT DEFAULT NULL,
  latency_ms INTEGER DEFAULT 0,
  webhook_count INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  integration_id TEXT REFERENCES integrations(id) ON DELETE SET NULL,
  direction TEXT NOT NULL DEFAULT 'inbound',  -- inbound|outbound
  event_type TEXT NOT NULL,
  payload_json TEXT DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'received',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_integrations_world ON integrations(world_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_world ON webhook_events(world_id, created_at DESC);

-- Market: skill/prompt/agent catalog installs
CREATE TABLE IF NOT EXISTS market_installs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  catalog_item_id TEXT NOT NULL,
  installed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_market_unique ON market_installs(world_id, catalog_item_id);
