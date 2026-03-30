-- Calendar Events — scheduler zone
CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  world_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  event_type TEXT NOT NULL DEFAULT 'task',       -- task | quest | snapshot | automation | milestone
  event_date TEXT NOT NULL,                       -- YYYY-MM-DD
  start_time TEXT DEFAULT NULL,                   -- HH:MM (24h), null = all-day
  end_time TEXT DEFAULT NULL,                     -- HH:MM (24h)
  all_day INTEGER NOT NULL DEFAULT 1,
  recurrence TEXT NOT NULL DEFAULT 'none',        -- none | daily | weekly | monthly
  recurrence_end TEXT DEFAULT NULL,               -- YYYY-MM-DD or null for no end
  color TEXT DEFAULT NULL,                        -- override color, null = use event_type default
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_calendar_world_date ON calendar_events(world_id, event_date);
CREATE INDEX IF NOT EXISTS idx_calendar_type ON calendar_events(world_id, event_type);
