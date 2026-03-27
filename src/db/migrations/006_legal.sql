-- Legal documents and analyses
CREATE TABLE IF NOT EXISTS legal_docs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  world_id TEXT NOT NULL REFERENCES worlds(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  doc_type TEXT NOT NULL DEFAULT 'contract',
  content TEXT NOT NULL DEFAULT '',
  analysis TEXT DEFAULT NULL,
  risk_level TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  tags_json TEXT DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE VIRTUAL TABLE IF NOT EXISTS legal_docs_fts USING fts5(
  title, content, analysis,
  content='legal_docs', content_rowid='rowid'
);
