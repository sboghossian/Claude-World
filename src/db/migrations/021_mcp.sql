-- MCP Hub — Model Context Protocol server configurations
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  world_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  command TEXT NOT NULL,
  args_json TEXT NOT NULL DEFAULT '[]',
  env_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'disconnected',
  auto_connect INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_world ON mcp_servers(world_id);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_status ON mcp_servers(world_id, status);
