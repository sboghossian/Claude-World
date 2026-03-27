-- Marketing Plaza content library
CREATE TABLE IF NOT EXISTS content_pieces (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id INTEGER NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL DEFAULT 'blog',  -- blog|tweet|newsletter|linkedin|ad
  title TEXT NOT NULL,
  brief TEXT DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  tone TEXT DEFAULT 'professional',
  word_count INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_content_world ON content_pieces(world_id, created_at DESC);
