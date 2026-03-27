-- Sales District leads pipeline
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT DEFAULT '',
  email TEXT DEFAULT '',
  deal_value REAL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'prospect',  -- prospect|contacted|qualified|closed_won|closed_lost
  notes TEXT DEFAULT '',
  last_contact_at TEXT DEFAULT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_world ON leads(world_id, stage);
