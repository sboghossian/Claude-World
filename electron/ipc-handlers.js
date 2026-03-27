const { app } = require('electron');
const KeyStore = require('./key-store');

// ── Validation helpers ─────────────────────────────────────────────────
function assertType(value, type, name) {
  if (typeof value !== type) {
    throw new Error(`Invalid argument "${name}": expected ${type}, got ${typeof value}`);
  }
}

function assertOptionalType(value, type, name) {
  if (value !== undefined && value !== null && typeof value !== type) {
    throw new Error(`Invalid argument "${name}": expected ${type} or null, got ${typeof value}`);
  }
}

function assertPositiveInt(value, name) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid argument "${name}": expected non-negative integer, got ${value}`);
  }
}

// ── Mock data (used when database module is not yet available) ──────────
const MOCK_WORLD = {
  id: 1,
  name: 'Default World',
  template: 'starter',
  level: 1,
  xp: 0,
  xp_to_next: 100,
  created_at: new Date().toISOString(),
};

const MOCK_ZONES = [
  { id: 1, world_id: 1, slug: 'town-square', name: 'Town Square', color: '#4a9eff', grid_x: 0, grid_y: 0, width: 8, height: 8, unlocked: 1 },
  { id: 2, world_id: 1, slug: 'code-quarter', name: 'Code Quarter', color: '#ff6b6b', grid_x: 8, grid_y: 0, width: 8, height: 8, unlocked: 0 },
  { id: 3, world_id: 1, slug: 'data-district', name: 'Data District', color: '#51cf66', grid_x: 0, grid_y: 8, width: 8, height: 8, unlocked: 0 },
];

const MOCK_AGENTS = [
  { id: 1, world_id: 1, name: 'Claude', role: 'orchestrator', state: 'idle', tile_x: 4, tile_y: 4, sprite_key: 'agent_claude' },
];

const MOCK_QUESTS = [
  { id: 1, world_id: 1, title: 'Welcome to Claude World', description: 'Explore the town square', xp_reward: 50, status: 'active' },
];

// ── Handler registration ───────────────────────────────────────────────
function registerHandlers(ipcMain, db) {
  let keyStore = null;
  if (db) {
    try {
      // KeyStore needs the raw better-sqlite3 instance, not our Database wrapper
      const rawDb = db.db || db;
      keyStore = new KeyStore(rawDb);
    } catch (err) {
      console.warn('[ipc] Could not initialize KeyStore:', err.message);
    }
  }

  // Helper: safely call a db function or return mock data
  function dbCall(fn, fallback) {
    if (db) {
      try {
        return fn(db);
      } catch (err) {
        console.error('[ipc] Database error:', err.message);
        throw err;
      }
    }
    return fallback;
  }

  // ── db:* handlers ──────────────────────────────────────────────────

  ipcMain.handle('db:getWorld', async (_event, id) => {
    if (id !== undefined && id !== null) {
      assertPositiveInt(id, 'id');
    }
    return dbCall(
      (database) => {
        const row = database.prepare('SELECT * FROM worlds WHERE id = ?').get(id || 1);
        return row || null;
      },
      MOCK_WORLD
    );
  });

  ipcMain.handle('db:createWorld', async (_event, name, template) => {
    assertType(name, 'string', 'name');
    assertOptionalType(template, 'string', 'template');
    const tpl = template || 'starter';
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO worlds (name, template) VALUES (?, ?)'
        ).run(name, tpl);
        return database.prepare('SELECT * FROM worlds WHERE id = ?').get(result.lastInsertRowid);
      },
      { ...MOCK_WORLD, name, template: tpl }
    );
  });

  ipcMain.handle('db:getZones', async (_event, worldId) => {
    assertPositiveInt(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare('SELECT * FROM zones WHERE world_id = ?').all(worldId),
      MOCK_ZONES.filter((z) => z.world_id === worldId)
    );
  });

  ipcMain.handle('db:getAgents', async (_event, worldId) => {
    assertPositiveInt(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare('SELECT * FROM agents WHERE world_id = ?').all(worldId),
      MOCK_AGENTS.filter((a) => a.world_id === worldId)
    );
  });

  ipcMain.handle('db:getQuests', async (_event, worldId) => {
    assertPositiveInt(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare('SELECT * FROM quests WHERE world_id = ?').all(worldId),
      MOCK_QUESTS.filter((q) => q.world_id === worldId)
    );
  });

  ipcMain.handle('db:addXP', async (_event, worldId, amount) => {
    assertPositiveInt(worldId, 'worldId');
    assertType(amount, 'number', 'amount');
    if (amount < 0) throw new Error('XP amount must be non-negative');
    return dbCall(
      (database) => {
        database.prepare('UPDATE worlds SET xp = xp + ? WHERE id = ?').run(amount, worldId);
        const world = database.prepare('SELECT * FROM worlds WHERE id = ?').get(worldId);
        // Level up logic
        if (world && world.xp >= world.xp_to_next) {
          const newLevel = world.level + 1;
          const newXpToNext = Math.floor(world.xp_to_next * 1.5);
          database.prepare(
            'UPDATE worlds SET level = ?, xp = xp - ?, xp_to_next = ? WHERE id = ?'
          ).run(newLevel, world.xp_to_next, newXpToNext, worldId);
          return database.prepare('SELECT * FROM worlds WHERE id = ?').get(worldId);
        }
        return world;
      },
      { ...MOCK_WORLD, xp: MOCK_WORLD.xp + amount }
    );
  });

  ipcMain.handle('db:updateAgentState', async (_event, id, state, tileX, tileY) => {
    assertPositiveInt(id, 'id');
    assertType(state, 'string', 'state');
    assertType(tileX, 'number', 'tileX');
    assertType(tileY, 'number', 'tileY');
    const validStates = ['idle', 'walking', 'working', 'thinking', 'celebrating'];
    if (!validStates.includes(state)) {
      throw new Error(`Invalid agent state "${state}". Valid states: ${validStates.join(', ')}`);
    }
    return dbCall(
      (database) => {
        database.prepare(
          'UPDATE agents SET state = ?, tile_x = ?, tile_y = ? WHERE id = ?'
        ).run(state, tileX, tileY, id);
        return database.prepare('SELECT * FROM agents WHERE id = ?').get(id);
      },
      { ...MOCK_AGENTS[0], state, tile_x: tileX, tile_y: tileY }
    );
  });

  ipcMain.handle('db:getRecentTasks', async (_event, worldId, limit) => {
    assertPositiveInt(worldId, 'worldId');
    const lim = (limit !== undefined && limit !== null) ? limit : 20;
    assertPositiveInt(lim, 'limit');
    return dbCall(
      (database) =>
        database.prepare(
          'SELECT * FROM tasks WHERE world_id = ? ORDER BY created_at DESC LIMIT ?'
        ).all(worldId, lim),
      []
    );
  });

  ipcMain.handle('db:searchTasks', async (_event, worldId, query) => {
    assertPositiveInt(worldId, 'worldId');
    assertType(query, 'string', 'query');
    return dbCall(
      (database) =>
        database.prepare(
          "SELECT * FROM tasks WHERE world_id = ? AND (title LIKE ? OR description LIKE ?) ORDER BY created_at DESC LIMIT 50"
        ).all(worldId, `%${query}%`, `%${query}%`),
      []
    );
  });

  ipcMain.handle('db:getTaskStats', async (_event, worldId) => {
    assertPositiveInt(worldId, 'worldId');
    return dbCall(
      (database) => {
        const total = database.prepare('SELECT COUNT(*) as count FROM tasks WHERE world_id = ?').get(worldId);
        const completed = database.prepare("SELECT COUNT(*) as count FROM tasks WHERE world_id = ? AND status = 'completed'").get(worldId);
        const pending = database.prepare("SELECT COUNT(*) as count FROM tasks WHERE world_id = ? AND status = 'pending'").get(worldId);
        const running = database.prepare("SELECT COUNT(*) as count FROM tasks WHERE world_id = ? AND status = 'running'").get(worldId);
        return {
          total: total?.count || 0,
          completed: completed?.count || 0,
          pending: pending?.count || 0,
          running: running?.count || 0,
        };
      },
      { total: 0, completed: 0, pending: 0, running: 0 }
    );
  });

  ipcMain.handle('db:completeQuest', async (_event, questId) => {
    assertPositiveInt(questId, 'questId');
    return dbCall(
      (database) => {
        const quest = database.prepare('SELECT * FROM quests WHERE id = ?').get(questId);
        if (!quest) throw new Error(`Quest ${questId} not found`);
        if (quest.status === 'completed') throw new Error(`Quest ${questId} already completed`);
        database.prepare("UPDATE quests SET status = 'completed', completed_at = datetime('now') WHERE id = ?").run(questId);
        // Award XP
        if (quest.xp_reward) {
          database.prepare('UPDATE worlds SET xp = xp + ? WHERE id = ?').run(quest.xp_reward, quest.world_id);
        }
        return database.prepare('SELECT * FROM quests WHERE id = ?').get(questId);
      },
      { ...MOCK_QUESTS[0], status: 'completed' }
    );
  });

  // ── ai:* handlers ─────────────────────────────────────────────────

  ipcMain.handle('ai:dispatch', async (_event, task) => {
    assertType(task, 'object', 'task');
    if (!task.prompt) throw new Error('Task must include a "prompt" field');
    // AI dispatch will be implemented by the AI module
    // For now, return a placeholder response
    console.log('[ipc] ai:dispatch called with:', task.prompt?.substring(0, 80));
    return {
      id: `task_${Date.now()}`,
      status: 'queued',
      prompt: task.prompt,
      provider: task.provider || 'anthropic',
      created_at: new Date().toISOString(),
    };
  });

  ipcMain.handle('ai:listProviders', async () => {
    const providers = [
      { id: 'anthropic', name: 'Anthropic (Claude)', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514'] },
      { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'gpt-4o-mini'] },
      { id: 'google', name: 'Google (Gemini)', models: ['gemini-2.0-flash', 'gemini-2.5-pro'] },
    ];
    // Mark providers that have keys configured
    if (keyStore) {
      const keys = keyStore.list();
      for (const provider of providers) {
        provider.configured = keys.some((k) => k.provider === provider.id && k.is_active);
      }
    }
    return providers;
  });

  ipcMain.handle('ai:ping', async (_event, provider) => {
    assertType(provider, 'string', 'provider');
    // Placeholder — real implementation will test the API key
    return { provider, status: 'ok', latency_ms: 0 };
  });

  // ── keys:* handlers ───────────────────────────────────────────────

  ipcMain.handle('keys:store', async (_event, provider, key, displayName) => {
    assertType(provider, 'string', 'provider');
    assertType(key, 'string', 'key');
    assertOptionalType(displayName, 'string', 'displayName');
    if (!keyStore) throw new Error('Key store not available (database not initialized)');
    keyStore.store(provider, key, displayName);
    return { success: true };
  });

  ipcMain.handle('keys:list', async () => {
    if (!keyStore) return [];
    return keyStore.list();
  });

  ipcMain.handle('keys:delete', async (_event, provider) => {
    assertType(provider, 'string', 'provider');
    if (!keyStore) throw new Error('Key store not available (database not initialized)');
    keyStore.delete(provider);
    return { success: true };
  });

  // ── world:* handlers ──────────────────────────────────────────────

  ipcMain.handle('world:getState', async () => {
    return dbCall(
      (database) => {
        const world = database.prepare('SELECT * FROM worlds ORDER BY id ASC LIMIT 1').get();
        if (!world) return null;
        const zones = database.prepare('SELECT * FROM zones WHERE world_id = ?').all(world.id);
        const agents = database.prepare('SELECT * FROM agents WHERE world_id = ?').all(world.id);
        const quests = database.prepare("SELECT * FROM quests WHERE world_id = ? AND status = 'active'").all(world.id);
        return { world, zones, agents, quests };
      },
      { world: MOCK_WORLD, zones: MOCK_ZONES, agents: MOCK_AGENTS, quests: MOCK_QUESTS }
    );
  });

  // ── app:* handlers ────────────────────────────────────────────────

  ipcMain.handle('app:getVersion', async () => {
    return app.getVersion();
  });

  ipcMain.handle('app:getPlatform', async () => {
    return process.platform;
  });
}

module.exports = { registerHandlers };
