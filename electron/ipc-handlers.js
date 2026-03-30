const { app } = require('electron');
const KeyStore = require('./key-store');
const DispatchManager = require('../src/systems/dispatch');
const AnthropicAdapter = require('../src/systems/providers/anthropic');
const OpenAIAdapter = require('../src/systems/providers/openai');

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

// IDs in the DB schema are TEXT hex strings (e.g. "a1b2c3d4e5f6g7h8"),
// but legacy callers may pass integers. Accept both.
function assertId(value, name) {
  if (value === undefined || value === null) {
    throw new Error(`Invalid argument "${name}": expected an ID (string or number), got ${value}`);
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`Invalid argument "${name}": expected string or number, got ${typeof value}`);
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
  // NOTE: Handlers expect a raw better-sqlite3 instance (with .prepare()),
  // but `db` is our Database wrapper. Pass `db.db` to get the raw instance.
  function dbCall(fn, fallback) {
    if (db) {
      try {
        const rawDb = db.db || db;
        return fn(rawDb);
      } catch (err) {
        console.error('[ipc] Database error:', err.message);
        throw err;
      }
    }
    return fallback;
  }

  // ── db:* handlers ──────────────────────────────────────────────────

  ipcMain.handle('db:getWorld', async (_event, id) => {
    // id can be an integer (legacy) or a hex string (actual DB schema)
    return dbCall(
      (database) => {
        if (id !== undefined && id !== null) {
          // Try exact match first (works for both text hex IDs and integers)
          const row = database.prepare('SELECT * FROM worlds WHERE id = ?').get(id);
          if (row) return row;
        }
        // Fallback: return the first world in the database
        const fallback = database.prepare('SELECT * FROM worlds ORDER BY created_at ASC LIMIT 1').get();
        return fallback || null;
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
        // The id column uses DEFAULT (lower(hex(randomblob(8)))), so we must
        // look up by rowid to get the generated text ID
        const row = database.prepare('SELECT * FROM worlds WHERE rowid = ?').get(result.lastInsertRowid);
        return row || null;
      },
      { ...MOCK_WORLD, name, template: tpl }
    );
  });

  ipcMain.handle('db:getZones', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare('SELECT * FROM zones WHERE world_id = ?').all(worldId),
      MOCK_ZONES.filter((z) => z.world_id === worldId)
    );
  });

  ipcMain.handle('db:getAgents', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare('SELECT * FROM agents WHERE world_id = ?').all(worldId),
      MOCK_AGENTS.filter((a) => a.world_id === worldId)
    );
  });

  ipcMain.handle('db:getQuests', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare('SELECT * FROM quests WHERE world_id = ?').all(worldId),
      MOCK_QUESTS.filter((q) => q.world_id === worldId)
    );
  });

  ipcMain.handle('db:addXP', async (_event, worldId, amount) => {
    assertId(worldId, 'worldId');
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
    assertId(id, 'id');
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
    assertId(worldId, 'worldId');
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
    assertId(worldId, 'worldId');
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
    assertId(worldId, 'worldId');
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
    assertId(questId, 'questId');
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

  ipcMain.handle('db:updateZoneProgress', async (_event, worldId, zoneType, progress) => {
    assertId(worldId, 'worldId');
    assertType(zoneType, 'string', 'zoneType');
    assertType(progress, 'number', 'progress');
    if (progress < 0 || progress > 1) throw new Error('progress must be 0.0-1.0');
    return dbCall(
      (database) => {
        database.prepare(
          'UPDATE zones SET build_progress = ? WHERE world_id = ? AND zone_type = ?'
        ).run(progress, worldId, zoneType);
        return database.prepare(
          'SELECT * FROM zones WHERE world_id = ? AND zone_type = ?'
        ).get(worldId, zoneType);
      },
      null
    );
  });

  ipcMain.handle('db:getZoneProgress', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT zone_type, build_progress, unlocked FROM zones WHERE world_id = ?'
      ).all(worldId),
      []
    );
  });

  ipcMain.handle('db:unlockZone', async (_event, worldId, zoneType) => {
    assertId(worldId, 'worldId');
    assertType(zoneType, 'string', 'zoneType');
    return dbCall(
      (database) => {
        database.prepare(
          "UPDATE zones SET unlocked = 1, build_progress = MAX(build_progress, 0.1), unlocked_at = datetime('now') WHERE world_id = ? AND zone_type = ?"
        ).run(worldId, zoneType);
        return database.prepare(
          'SELECT * FROM zones WHERE world_id = ? AND zone_type = ?'
        ).get(worldId, zoneType);
      },
      null
    );
  });

  // ── ai:* handlers ─────────────────────────────────────────────────

  // Lazy-init the dispatch manager on first AI call
  let dispatchManager = null;

  function getDispatchManager() {
    if (dispatchManager) return dispatchManager;

    dispatchManager = new DispatchManager(keyStore, db);

    // Register built-in providers
    dispatchManager.registerProvider('anthropic', new AnthropicAdapter(keyStore));
    dispatchManager.registerProvider('openai', new OpenAIAdapter(keyStore));

    return dispatchManager;
  }

  ipcMain.handle('ai:dispatch', async (_event, task) => {
    assertType(task, 'object', 'task');
    if (!task.messages || !Array.isArray(task.messages) || task.messages.length === 0) {
      throw new Error('Task must include a non-empty "messages" array');
    }

    const dm = getDispatchManager();
    const start = Date.now();

    console.log(
      '[ipc] ai:dispatch provider=%s model=%s messages=%d',
      task.provider || 'auto',
      task.model || 'default',
      task.messages.length
    );

    const response = await dm.dispatch({
      worldId: task.worldId || null,
      zoneId: task.zoneId || null,
      agentId: task.agentId || null,
      provider: task.provider || null,
      model: task.model || null,
      messages: task.messages,
      systemPrompt: task.systemPrompt || null,
      maxTokens: task.maxTokens || 4096,
    });

    // Persist completed task in database if available
    if (db) {
      try {
        const rawDb = db.db || db;
        rawDb
          .prepare(
            `INSERT INTO tasks (world_id, title, description, status, provider, model,
              input_tokens, output_tokens, cost_usd, latency_ms, created_at, completed_at)
            VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
          )
          .run(
            task.worldId || 1,
            (task.messages[task.messages.length - 1]?.content || '').substring(0, 120),
            response.text.substring(0, 500),
            response.provider,
            response.model,
            response.inputTokens,
            response.outputTokens,
            response.costUsd,
            response.latencyMs
          );
      } catch (dbErr) {
        // Don't fail the AI response because of a logging error
        console.warn('[ipc] Failed to persist task:', dbErr.message);
      }
    }

    return response;
  });

  ipcMain.handle('ai:stream', async (_event, task) => {
    assertType(task, 'object', 'task');
    if (!task.messages || !Array.isArray(task.messages) || task.messages.length === 0) {
      throw new Error('Task must include a non-empty "messages" array');
    }

    const dm = getDispatchManager();

    console.log(
      '[ipc] ai:stream provider=%s model=%s messages=%d',
      task.provider || 'auto',
      task.model || 'default',
      task.messages.length
    );

    // Collect full streamed response (IPC invoke cannot stream natively,
    // so this handler buffers everything and returns the final result).
    // For true streaming, use ai:dispatchStream with MessagePort (below).
    let fullText = '';
    let finalMeta = null;

    for await (const chunk of dm.stream({
      worldId: task.worldId || null,
      zoneId: task.zoneId || null,
      agentId: task.agentId || null,
      provider: task.provider || null,
      model: task.model || null,
      messages: task.messages,
      systemPrompt: task.systemPrompt || null,
      maxTokens: task.maxTokens || 4096,
    })) {
      if (chunk.type === 'text') {
        fullText += chunk.text;
      } else if (chunk.type === 'done') {
        finalMeta = chunk;
      }
    }

    const response = {
      text: fullText,
      provider: finalMeta?.provider || 'unknown',
      model: finalMeta?.model || 'unknown',
      inputTokens: finalMeta?.inputTokens || 0,
      outputTokens: finalMeta?.outputTokens || 0,
      costUsd: finalMeta?.costUsd || 0,
      latencyMs: finalMeta?.latencyMs || 0,
    };

    // Persist
    if (db) {
      try {
        const rawDb = db.db || db;
        rawDb
          .prepare(
            `INSERT INTO tasks (world_id, title, description, status, provider, model,
              input_tokens, output_tokens, cost_usd, latency_ms, created_at, completed_at)
            VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
          )
          .run(
            task.worldId || 1,
            (task.messages[task.messages.length - 1]?.content || '').substring(0, 120),
            response.text.substring(0, 500),
            response.provider,
            response.model,
            response.inputTokens,
            response.outputTokens,
            response.costUsd,
            response.latencyMs
          );
      } catch (dbErr) {
        console.warn('[ipc] Failed to persist streamed task:', dbErr.message);
      }
    }

    return response;
  });

  ipcMain.handle('ai:listProviders', async () => {
    const dm = getDispatchManager();
    return dm.listProviders();
  });

  ipcMain.handle('ai:ping', async (_event, provider) => {
    assertType(provider, 'string', 'provider');
    const dm = getDispatchManager();
    const result = await dm.ping(provider);
    return { provider, status: result.ok ? 'ok' : 'error', latency_ms: result.latencyMs, error: result.error || null };
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

  // ── Chat (projects + messages) ────────────────────────────────────

  ipcMain.handle('db:getProjects', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM projects WHERE world_id = ? ORDER BY pinned DESC, updated_at DESC'
      ).all(worldId),
      []
    );
  });

  ipcMain.handle('db:createProject', async (_event, worldId, name, icon) => {
    assertId(worldId, 'worldId');
    assertType(name, 'string', 'name');
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO projects (world_id, name, icon) VALUES (?, ?, ?)'
        ).run(worldId, name.trim(), icon || '💬');
        return database.prepare('SELECT * FROM projects WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  ipcMain.handle('db:getMessages', async (_event, projectId, limit) => {
    assertType(projectId, 'string', 'projectId');
    const lim = limit || 50;
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM messages WHERE project_id = ? ORDER BY created_at ASC LIMIT ?'
      ).all(projectId, lim),
      []
    );
  });

  ipcMain.handle('db:saveMessage', async (_event, projectId, worldId, role, content, meta) => {
    assertType(projectId, 'string', 'projectId');
    assertId(worldId, 'worldId');
    assertType(role, 'string', 'role');
    assertType(content, 'string', 'content');
    const m = meta || {};
    return dbCall(
      (database) => {
        const result = database.prepare(
          `INSERT INTO messages (project_id, world_id, role, content, agent_name, model, cost_usd, tokens_used)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(projectId, worldId, role, content, m.agentName || 'Commander', m.model || null, m.costUsd || 0, m.tokensUsed || 0);
        database.prepare(
          "UPDATE projects SET updated_at = datetime('now') WHERE id = ?"
        ).run(projectId);
        return database.prepare('SELECT * FROM messages WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  // ── Incidents ─────────────────────────────────────────────────────

  ipcMain.handle('db:getIncidents', async (_event, worldId, limit) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        "SELECT i.*, a.name AS reporter_name FROM incidents i LEFT JOIN agents a ON i.reporter_agent_id = a.id WHERE i.world_id = ? AND i.status != 'resolved' ORDER BY i.created_at DESC LIMIT ?"
      ).all(worldId, limit || 20),
      []
    );
  });

  ipcMain.handle('db:createIncident', async (_event, worldId, data) => {
    assertId(worldId, 'worldId');
    assertType(data.title, 'string', 'title');
    assertType(data.description, 'string', 'description');
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO incidents (world_id, reporter_agent_id, title, description, severity, zone_id) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(worldId, data.reporterAgentId || null, data.title, data.description, data.severity || 'info', data.zoneId || null);
        return database.prepare('SELECT * FROM incidents WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  ipcMain.handle('db:updateIncident', async (_event, incidentId, status) => {
    assertType(incidentId, 'string', 'incidentId');
    assertType(status, 'string', 'status');
    return dbCall(
      (database) => {
        const resolvedAt = status === 'resolved' ? "datetime('now')" : 'NULL';
        database.prepare(
          `UPDATE incidents SET status = ?, resolved_at = ${resolvedAt} WHERE id = ?`
        ).run(status, incidentId);
        return database.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId);
      },
      null
    );
  });

  // ── Minions ───────────────────────────────────────────────────────

  ipcMain.handle('db:getMinions', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM minions WHERE world_id = ? ORDER BY created_at ASC'
      ).all(worldId),
      []
    );
  });

  ipcMain.handle('db:createMinion', async (_event, worldId, config) => {
    assertId(worldId, 'worldId');
    assertType(config.name, 'string', 'name');
    assertType(config.prompt, 'string', 'prompt');
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO minions (world_id, name, description, prompt, schedule, provider) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(worldId, config.name.trim(), config.description || '', config.prompt, config.schedule || 'manual', config.provider || 'auto');
        return database.prepare('SELECT * FROM minions WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  ipcMain.handle('db:updateMinion', async (_event, minionId, updates) => {
    assertType(minionId, 'string', 'minionId');
    const allowed = ['name', 'description', 'prompt', 'schedule', 'provider', 'enabled', 'status', 'last_output', 'last_run', 'run_count'];
    const fields = Object.keys(updates).filter(k => allowed.includes(k));
    if (fields.length === 0) return null;
    return dbCall(
      (database) => {
        const sets = fields.map(f => `${f} = @${f}`).join(', ');
        database.prepare(`UPDATE minions SET ${sets} WHERE id = @id`).run({ ...updates, id: minionId });
        return database.prepare('SELECT * FROM minions WHERE id = ?').get(minionId);
      },
      null
    );
  });

  ipcMain.handle('db:recordMinionRun', async (_event, minionId, worldId, runData) => {
    assertType(minionId, 'string', 'minionId');
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => {
        const result = database.prepare(
          "INSERT INTO minion_runs (minion_id, world_id, status, output, error, cost_usd, tokens_used, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))"
        ).run(minionId, worldId, runData.status || 'completed', runData.output || null, runData.error || null, runData.costUsd || 0, runData.tokensUsed || 0);
        database.prepare(
          "UPDATE minions SET run_count = run_count + 1, last_run = datetime('now'), last_output = ?, status = 'idle' WHERE id = ?"
        ).run(runData.output?.slice(0, 500) || null, minionId);
        return database.prepare('SELECT * FROM minion_runs WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  // ── Airport ───────────────────────────────────────────────────────

  ipcMain.handle('db:getAirportLog', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM airport_log WHERE world_id = ? ORDER BY created_at DESC LIMIT 50'
      ).all(worldId),
      []
    );
  });

  ipcMain.handle('db:createAirportLog', async (_event, worldId, data) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO airport_log (world_id, operation, file_type, file_name, file_size_kb, status) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(worldId, data.operation || 'export', data.fileType || 'json', data.fileName || 'export.json', data.fileSizeKb || 0, data.status || 'completed');
        return database.prepare('SELECT * FROM airport_log WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  ipcMain.handle('db:getDeployToken', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare('SELECT * FROM deploy_tokens WHERE world_id = ?').get(worldId) || null,
      null
    );
  });

  ipcMain.handle('db:upsertDeployToken', async (_event, worldId, token) => {
    assertId(worldId, 'worldId');
    assertType(token, 'string', 'token');
    return dbCall(
      (database) => {
        database.prepare(
          'INSERT INTO deploy_tokens (world_id, token) VALUES (?, ?) ON CONFLICT(world_id) DO UPDATE SET token = excluded.token, created_at = datetime(\'now\')'
        ).run(worldId, token);
        return database.prepare('SELECT * FROM deploy_tokens WHERE world_id = ?').get(worldId);
      },
      null
    );
  });

  // ── Globe Room — Research ─────────────────────────────────────────

  ipcMain.handle('db:getResearchQueries', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM research_queries WHERE world_id = ? ORDER BY created_at DESC LIMIT 50'
      ).all(worldId),
      []
    );
  });

  ipcMain.handle('db:createResearchQuery', async (_event, worldId, data) => {
    assertId(worldId, 'worldId');
    assertType(data.query, 'string', 'query');
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO research_queries (world_id, query, result, sources_json, is_monitored) VALUES (?, ?, ?, ?, ?)'
        ).run(worldId, data.query.trim(), data.result || null, JSON.stringify(data.sources || []), data.isMonitored ? 1 : 0);
        return database.prepare('SELECT * FROM research_queries WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  ipcMain.handle('db:updateResearchQuery', async (_event, queryId, updates) => {
    assertType(queryId, 'string', 'queryId');
    const allowed = ['result', 'sources_json', 'is_monitored', 'last_queried_at'];
    const fields = Object.keys(updates).filter(k => allowed.includes(k));
    if (fields.length === 0) return null;
    return dbCall(
      (database) => {
        const sets = fields.map(f => `${f} = @${f}`).join(', ');
        database.prepare(`UPDATE research_queries SET ${sets} WHERE id = @id`).run({ ...updates, id: queryId });
        return database.prepare('SELECT * FROM research_queries WHERE id = ?').get(queryId);
      },
      null
    );
  });

  // ── Broadcast Tower ───────────────────────────────────────────────

  ipcMain.handle('db:getBroadcastChannels', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM broadcast_channels WHERE world_id = ? ORDER BY name ASC'
      ).all(worldId),
      []
    );
  });

  ipcMain.handle('db:createBroadcastChannel', async (_event, worldId, data) => {
    assertId(worldId, 'worldId');
    assertType(data.name, 'string', 'name');
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO broadcast_channels (world_id, name, channel_type, endpoint, triggers_json, enabled) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(worldId, data.name.trim(), data.channelType || 'webhook', data.endpoint || '', JSON.stringify(data.triggers || []), data.enabled !== false ? 1 : 0);
        return database.prepare('SELECT * FROM broadcast_channels WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  ipcMain.handle('db:updateBroadcastChannel', async (_event, channelId, updates) => {
    assertType(channelId, 'string', 'channelId');
    const allowed = ['name', 'channel_type', 'endpoint', 'triggers_json', 'enabled', 'last_broadcast_at'];
    const fields = Object.keys(updates).filter(k => allowed.includes(k));
    if (fields.length === 0) return null;
    return dbCall(
      (database) => {
        const sets = fields.map(f => `${f} = @${f}`).join(', ');
        database.prepare(`UPDATE broadcast_channels SET ${sets} WHERE id = @id`).run({ ...updates, id: channelId });
        return database.prepare('SELECT * FROM broadcast_channels WHERE id = ?').get(channelId);
      },
      null
    );
  });

  ipcMain.handle('db:deleteBroadcastChannel', async (_event, channelId) => {
    assertType(channelId, 'string', 'channelId');
    return dbCall(
      (database) => {
        database.prepare('DELETE FROM broadcast_channels WHERE id = ?').run(channelId);
        return { success: true };
      },
      { success: true }
    );
  });

  ipcMain.handle('db:getBroadcastLog', async (_event, worldId, limit) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT l.*, c.name AS channel_name FROM broadcast_log l LEFT JOIN broadcast_channels c ON l.channel_id = c.id WHERE l.world_id = ? ORDER BY l.created_at DESC LIMIT ?'
      ).all(worldId, limit || 50),
      []
    );
  });

  ipcMain.handle('db:createBroadcastLog', async (_event, worldId, data) => {
    assertId(worldId, 'worldId');
    assertType(data.eventType, 'string', 'eventType');
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO broadcast_log (world_id, channel_id, event_type, payload_json, status) VALUES (?, ?, ?, ?, ?)'
        ).run(worldId, data.channelId || null, data.eventType, JSON.stringify(data.payload || {}), data.status || 'sent');
        return database.prepare('SELECT * FROM broadcast_log WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  // ── World Versions (snapshot restore/delete) ──────────────────────

  ipcMain.handle('db:deleteSnapshot', async (_event, snapshotId) => {
    assertType(snapshotId, 'string', 'snapshotId');
    return dbCall(
      (database) => {
        database.prepare('DELETE FROM world_snapshots WHERE id = ?').run(snapshotId);
        return { success: true };
      },
      { success: true }
    );
  });

  ipcMain.handle('db:restoreSnapshot', async (_event, worldId, snapshotId) => {
    assertId(worldId, 'worldId');
    assertType(snapshotId, 'string', 'snapshotId');
    // Restoration in MVP: return the snapshot for the renderer to apply
    return dbCall(
      (database) => database.prepare('SELECT * FROM world_snapshots WHERE id = ?').get(snapshotId) || null,
      null
    );
  });

  // ── Sales District — Leads ────────────────────────────────────────

  ipcMain.handle('db:getLeads', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM leads WHERE world_id = ? ORDER BY updated_at DESC'
      ).all(worldId),
      []
    );
  });

  ipcMain.handle('db:createLead', async (_event, worldId, data) => {
    assertId(worldId, 'worldId');
    assertType(data.name, 'string', 'name');
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO leads (world_id, name, company, email, deal_value, stage, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).run(worldId, data.name.trim(), data.company || '', data.email || '', data.dealValue || 0, data.stage || 'prospect', data.notes || '');
        return database.prepare('SELECT * FROM leads WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  ipcMain.handle('db:updateLead', async (_event, leadId, updates) => {
    assertType(leadId, 'string', 'leadId');
    const allowed = ['name', 'company', 'email', 'deal_value', 'stage', 'notes', 'last_contact_at'];
    const fields = Object.keys(updates).filter(k => allowed.includes(k));
    if (fields.length === 0) return null;
    return dbCall(
      (database) => {
        const sets = fields.map(f => `${f} = @${f}`).join(', ');
        database.prepare(`UPDATE leads SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({ ...updates, id: leadId });
        return database.prepare('SELECT * FROM leads WHERE id = ?').get(leadId);
      },
      null
    );
  });

  ipcMain.handle('db:deleteLead', async (_event, leadId) => {
    assertType(leadId, 'string', 'leadId');
    return dbCall(
      (database) => {
        database.prepare('DELETE FROM leads WHERE id = ?').run(leadId);
        return { success: true };
      },
      { success: true }
    );
  });

  // ── Marketing Plaza — Content Pieces ──────────────────────────────

  ipcMain.handle('db:getContentPieces', async (_event, worldId, limit) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM content_pieces WHERE world_id = ? ORDER BY created_at DESC LIMIT ?'
      ).all(worldId, limit || 50),
      []
    );
  });

  ipcMain.handle('db:createContentPiece', async (_event, worldId, data) => {
    assertId(worldId, 'worldId');
    assertType(data.title, 'string', 'title');
    assertType(data.content, 'string', 'content');
    const wordCount = data.content.trim().split(/\s+/).filter(Boolean).length;
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO content_pieces (world_id, content_type, title, brief, content, tone, word_count, tokens_used, cost_usd) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(worldId, data.contentType || 'blog', data.title.trim(), data.brief || '', data.content, data.tone || 'professional', wordCount, data.tokensUsed || 0, data.costUsd || 0);
        return database.prepare('SELECT * FROM content_pieces WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  // ── The Exchange — Integrations & Webhooks ────────────────────────

  ipcMain.handle('db:getIntegrations', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM integrations WHERE world_id = ? ORDER BY name ASC'
      ).all(worldId),
      []
    );
  });

  ipcMain.handle('db:createIntegration', async (_event, worldId, data) => {
    assertId(worldId, 'worldId');
    assertType(data.name, 'string', 'name');
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO integrations (world_id, name, service, endpoint_url, status) VALUES (?, ?, ?, ?, ?)'
        ).run(worldId, data.name.trim(), data.service || 'custom', data.endpointUrl || '', data.status || 'disconnected');
        return database.prepare('SELECT * FROM integrations WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  ipcMain.handle('db:updateIntegration', async (_event, integrationId, updates) => {
    assertType(integrationId, 'string', 'integrationId');
    const allowed = ['name', 'service', 'endpoint_url', 'status', 'last_pinged_at', 'latency_ms', 'webhook_count'];
    const fields = Object.keys(updates).filter(k => allowed.includes(k));
    if (fields.length === 0) return null;
    return dbCall(
      (database) => {
        const sets = fields.map(f => `${f} = @${f}`).join(', ');
        database.prepare(`UPDATE integrations SET ${sets} WHERE id = @id`).run({ ...updates, id: integrationId });
        return database.prepare('SELECT * FROM integrations WHERE id = ?').get(integrationId);
      },
      null
    );
  });

  ipcMain.handle('db:getWebhookEvents', async (_event, worldId, limit) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM webhook_events WHERE world_id = ? ORDER BY created_at DESC LIMIT ?'
      ).all(worldId, limit || 50),
      []
    );
  });

  ipcMain.handle('db:createWebhookEvent', async (_event, worldId, data) => {
    assertId(worldId, 'worldId');
    assertType(data.eventType, 'string', 'eventType');
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO webhook_events (world_id, integration_id, direction, event_type, payload_json, status) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(worldId, data.integrationId || null, data.direction || 'inbound', data.eventType, JSON.stringify(data.payload || {}), data.status || 'received');
        return database.prepare('SELECT * FROM webhook_events WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  // ── The Market — Installs ─────────────────────────────────────────

  ipcMain.handle('db:getMarketInstalls', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM market_installs WHERE world_id = ? ORDER BY installed_at DESC'
      ).all(worldId),
      []
    );
  });

  ipcMain.handle('db:installMarketItem', async (_event, worldId, catalogItemId) => {
    assertId(worldId, 'worldId');
    assertType(catalogItemId, 'string', 'catalogItemId');
    return dbCall(
      (database) => {
        try {
          const result = database.prepare(
            'INSERT INTO market_installs (world_id, catalog_item_id) VALUES (?, ?)'
          ).run(worldId, catalogItemId);
          return database.prepare('SELECT * FROM market_installs WHERE rowid = ?').get(result.lastInsertRowid);
        } catch (err) {
          // Unique constraint violation = already installed
          if (err.message.includes('UNIQUE')) return { world_id: worldId, catalog_item_id: catalogItemId, already_installed: true };
          throw err;
        }
      },
      null
    );
  });

  // ── Identity & Reputation ─────────────────────────────────────────

  ipcMain.handle('db:getIdentity', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => {
        let row = database.prepare('SELECT * FROM identity WHERE world_id = ? LIMIT 1').get(worldId);
        if (!row) {
          const result = database.prepare(
            'INSERT INTO identity (world_id) VALUES (?)'
          ).run(worldId);
          row = database.prepare('SELECT * FROM identity WHERE rowid = ?').get(result.lastInsertRowid);
        }
        return row;
      },
      { world_id: worldId, display_name: 'Commander', avatar_emoji: '🧠', avatar_color: '#7c3aed', title: 'World Builder', bio: '', reputation: 0, badges_json: '[]' }
    );
  });

  ipcMain.handle('db:updateIdentity', async (_event, worldId, updates) => {
    assertId(worldId, 'worldId');
    const allowed = ['display_name', 'avatar_emoji', 'avatar_color', 'title', 'bio'];
    const fields = Object.keys(updates).filter(k => allowed.includes(k));
    if (fields.length === 0) return null;
    return dbCall(
      (database) => {
        const sets = fields.map(f => `${f} = @${f}`).join(', ');
        database.prepare(`UPDATE identity SET ${sets}, updated_at = datetime('now') WHERE world_id = @worldId`).run({ ...updates, worldId });
        return database.prepare('SELECT * FROM identity WHERE world_id = ?').get(worldId);
      },
      null
    );
  });

  ipcMain.handle('db:awardReputation', async (_event, worldId, eventType, points, description) => {
    assertId(worldId, 'worldId');
    assertType(eventType, 'string', 'eventType');
    assertType(points, 'number', 'points');
    assertType(description, 'string', 'description');
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO reputation_events (world_id, event_type, points, description) VALUES (?, ?, ?, ?)'
        ).run(worldId, eventType, points, description);
        database.prepare(
          'UPDATE identity SET reputation = reputation + ?, updated_at = datetime(\'now\') WHERE world_id = ?'
        ).run(points, worldId);
        return database.prepare('SELECT * FROM reputation_events WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  ipcMain.handle('db:getReputationHistory', async (_event, worldId, limit) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM reputation_events WHERE world_id = ? ORDER BY created_at DESC LIMIT ?'
      ).all(worldId, limit || 50),
      []
    );
  });

  // ── Legal Tower ───────────────────────────────────────────────────

  ipcMain.handle('db:getLegalDocs', async (_event, worldId, limit) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM legal_docs WHERE world_id = ? ORDER BY updated_at DESC LIMIT ?'
      ).all(worldId, limit || 50),
      []
    );
  });

  ipcMain.handle('db:createLegalDoc', async (_event, worldId, data) => {
    assertId(worldId, 'worldId');
    assertType(data.title, 'string', 'title');
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO legal_docs (world_id, title, doc_type, content, tags_json) VALUES (?, ?, ?, ?, ?)'
        ).run(worldId, data.title.trim(), data.docType || 'contract', data.content || '', JSON.stringify(data.tags || []));
        return database.prepare('SELECT * FROM legal_docs WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  ipcMain.handle('db:updateLegalDoc', async (_event, docId, updates) => {
    assertType(docId, 'string', 'docId');
    const allowed = ['title', 'content', 'analysis', 'risk_level', 'status', 'tags_json'];
    const fields = Object.keys(updates).filter(k => allowed.includes(k));
    if (fields.length === 0) return null;
    return dbCall(
      (database) => {
        const sets = fields.map(f => `${f} = @${f}`).join(', ');
        database.prepare(`UPDATE legal_docs SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({ ...updates, id: docId });
        return database.prepare('SELECT * FROM legal_docs WHERE id = ?').get(docId);
      },
      null
    );
  });

  // ── Council ───────────────────────────────────────────────────────

  ipcMain.handle('db:getCouncilSessions', async (_event, worldId, limit) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM council_sessions WHERE world_id = ? ORDER BY created_at DESC LIMIT ?'
      ).all(worldId, limit || 20),
      []
    );
  });

  ipcMain.handle('db:createCouncilSession', async (_event, worldId, prompt, models) => {
    assertId(worldId, 'worldId');
    assertType(prompt, 'string', 'prompt');
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO council_sessions (world_id, prompt, models_json) VALUES (?, ?, ?)'
        ).run(worldId, prompt.trim(), JSON.stringify(models || []));
        return database.prepare('SELECT * FROM council_sessions WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  ipcMain.handle('db:saveCouncilResponse', async (_event, sessionId, data) => {
    assertType(sessionId, 'string', 'sessionId');
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO council_responses (session_id, provider, model, response, cost_usd, tokens_used, latency_ms, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).run(sessionId, data.provider, data.model, data.response || null, data.costUsd || 0, data.tokensUsed || 0, data.latencyMs || 0, data.status || 'completed');
        return database.prepare('SELECT * FROM council_responses WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  ipcMain.handle('db:getCouncilResponses', async (_event, sessionId) => {
    assertType(sessionId, 'string', 'sessionId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM council_responses WHERE session_id = ? ORDER BY created_at ASC'
      ).all(sessionId),
      []
    );
  });

  // ── Archive & Snapshots ───────────────────────────────────────────

  ipcMain.handle('db:getSnapshots', async (_event, worldId, limit) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM world_snapshots WHERE world_id = ? ORDER BY created_at DESC LIMIT ?'
      ).all(worldId, limit || 20),
      []
    );
  });

  ipcMain.handle('db:saveWorldSnapshot', async (_event, worldId, label) => {
    assertId(worldId, 'worldId');
    assertType(label, 'string', 'label');
    return dbCall(
      (database) => {
        const world = database.prepare('SELECT * FROM worlds WHERE id = ?').get(worldId);
        const taskCount = database.prepare('SELECT COUNT(*) as n FROM tasks WHERE world_id = ?').get(worldId)?.n || 0;
        const stateJson = JSON.stringify({ world, capturedAt: new Date().toISOString() });
        const result = database.prepare(
          'INSERT INTO world_snapshots (world_id, label, state_json, xp_at_snapshot, task_count_at_snapshot) VALUES (?, ?, ?, ?, ?)'
        ).run(worldId, label.trim(), stateJson, world?.xp || 0, taskCount);
        return database.prepare('SELECT * FROM world_snapshots WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  // ── R&D Lab — Experiments ─────────────────────────────────────────

  ipcMain.handle('db:getExperiments', async (_event, worldId, limit) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM experiments WHERE world_id = ? ORDER BY created_at DESC LIMIT ?'
      ).all(worldId, limit || 30),
      []
    );
  });

  ipcMain.handle('db:createExperiment', async (_event, worldId, data) => {
    assertId(worldId, 'worldId');
    assertType(data.name, 'string', 'name');
    assertType(data.prompt, 'string', 'prompt');
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO experiments (world_id, name, description, prompt) VALUES (?, ?, ?, ?)'
        ).run(worldId, data.name.trim(), data.description || '', data.prompt.trim());
        return database.prepare('SELECT * FROM experiments WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  ipcMain.handle('db:updateExperiment', async (_event, experimentId, updates) => {
    assertType(experimentId, 'string', 'experimentId');
    const allowed = ['name', 'description', 'prompt', 'result', 'status', 'is_promoted'];
    const fields = Object.keys(updates).filter(k => allowed.includes(k));
    if (fields.length === 0) return null;
    return dbCall(
      (database) => {
        const sets = fields.map(f => `${f} = @${f}`).join(', ');
        database.prepare(`UPDATE experiments SET ${sets} WHERE id = @id`).run({ ...updates, id: experimentId });
        return database.prepare('SELECT * FROM experiments WHERE id = ?').get(experimentId);
      },
      null
    );
  });

  // ── Settings ──────────────────────────────────────────────────────

  ipcMain.handle('db:getSettings', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT key, value FROM settings WHERE world_id = ?'
      ).all(worldId),
      []
    );
  });

  ipcMain.handle('db:updateSettings', async (_event, worldId, key, value) => {
    assertId(worldId, 'worldId');
    assertType(key, 'string', 'key');
    assertType(value, 'string', 'value');
    return dbCall(
      (database) => {
        database.prepare(
          `INSERT INTO settings (world_id, key, value, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(world_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
        ).run(worldId, key, value);
        return { success: true };
      },
      { success: true }
    );
  });

  ipcMain.handle('db:exportWorld', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => {
        const world = database.prepare('SELECT * FROM worlds WHERE id = ?').get(worldId);
        if (!world) throw new Error('World not found');
        const zones = database.prepare('SELECT * FROM zones WHERE world_id = ?').all(worldId);
        const agents = database.prepare('SELECT * FROM agents WHERE world_id = ?').all(worldId);
        const quests = database.prepare('SELECT * FROM quests WHERE world_id = ?').all(worldId);
        const settings = database.prepare('SELECT key, value FROM settings WHERE world_id = ?').all(worldId);

        let tasks = [];
        try { tasks = database.prepare('SELECT * FROM tasks WHERE world_id = ? ORDER BY created_at DESC LIMIT 500').all(worldId); } catch (_) {}

        let identity = null;
        try { identity = database.prepare('SELECT * FROM identity WHERE world_id = ?').get(worldId); } catch (_) {}

        return {
          exportedAt: new Date().toISOString(),
          version: '1.0',
          world,
          zones,
          agents,
          quests,
          settings,
          tasks,
          identity,
        };
      },
      null
    );
  });

  ipcMain.handle('db:getAppInfo', async () => {
    return {
      version: app.getVersion(),
      electron: process.versions.electron || '—',
      node: process.versions.node || '—',
      chrome: process.versions.chrome || '—',
    };
  });

  // ── Missing handlers (quest activation, skills, tasks, relationships) ──

  ipcMain.handle('db:activateQuest', async (_event, questId) => {
    return dbCall(
      (database) => {
        database.prepare('UPDATE quests SET status = ? WHERE id = ?').run('active', questId);
        return database.prepare('SELECT * FROM quests WHERE id = ?').get(questId);
      },
      null
    );
  });

  ipcMain.handle('db:getSkills', async (_event, worldId) => {
    return dbCall(
      (database) => database.prepare('SELECT * FROM skills WHERE world_id = ? ORDER BY created_at DESC').all(worldId),
      []
    );
  });

  ipcMain.handle('db:createSkill', async (_event, worldId, data) => {
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO skills (world_id, name, description, category, code, status) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(worldId, data.name || '', data.description || '', data.category || 'general', data.code || '', data.status || 'active');
        return database.prepare('SELECT * FROM skills WHERE id = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  ipcMain.handle('db:importSkills', async (_event, worldId, skills) => {
    return dbCall(
      (database) => {
        const insert = database.prepare(
          'INSERT OR IGNORE INTO skills (world_id, name, description, category, code, status) VALUES (?, ?, ?, ?, ?, ?)'
        );
        const tx = database.transaction(() => {
          for (const s of skills) {
            insert.run(worldId, s.name || '', s.description || '', s.category || 'general', s.code || '', s.status || 'active');
          }
        });
        tx();
        return database.prepare('SELECT * FROM skills WHERE world_id = ?').all(worldId);
      },
      []
    );
  });

  ipcMain.handle('db:getTasks', async (_event, worldId, opts = {}) => {
    return dbCall(
      (database) => {
        const limit = (opts && opts.limit) || 100;
        return database.prepare('SELECT * FROM tasks WHERE world_id = ? ORDER BY created_at DESC LIMIT ?').all(worldId, limit);
      },
      []
    );
  });

  // ── Kanban Board — Cards ──────────────────────────────────────────

  // Ensure the kanban_cards table exists (safe to call multiple times)
  if (db) {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS kanban_cards (
          id TEXT PRIMARY KEY,
          world_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          description TEXT DEFAULT '',
          priority TEXT NOT NULL DEFAULT 'medium',
          column_key TEXT NOT NULL DEFAULT 'backlog',
          zone_tag TEXT DEFAULT '',
          agent_id TEXT,
          sort_order INTEGER DEFAULT 0,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_kanban_world ON kanban_cards(world_id, column_key)');
    } catch (err) {
      console.warn('[ipc] Could not create kanban_cards table:', err.message);
    }
  }

  ipcMain.handle('db:getKanbanCards', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM kanban_cards WHERE world_id = ? ORDER BY sort_order ASC, created_at DESC'
      ).all(worldId),
      []
    );
  });

  ipcMain.handle('db:createKanbanCard', async (_event, worldId, data) => {
    assertId(worldId, 'worldId');
    assertType(data.title, 'string', 'title');
    return dbCall(
      (database) => {
        const id = require('crypto').randomBytes(8).toString('hex');
        database.prepare(
          `INSERT INTO kanban_cards (id, world_id, title, description, priority, column_key, zone_tag, agent_id, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id, worldId,
          data.title.trim(),
          data.description || '',
          data.priority || 'medium',
          data.column_key || 'backlog',
          data.zone_tag || '',
          data.agent_id || null,
          data.sort_order || 0
        );
        return database.prepare('SELECT * FROM kanban_cards WHERE id = ?').get(id);
      },
      null
    );
  });

  ipcMain.handle('db:updateKanbanCard', async (_event, cardId, updates) => {
    assertType(cardId, 'string', 'cardId');
    const allowed = ['title', 'description', 'priority', 'column_key', 'zone_tag', 'agent_id', 'sort_order'];
    const fields = Object.keys(updates).filter(k => allowed.includes(k));
    if (fields.length === 0) return null;
    return dbCall(
      (database) => {
        const sets = fields.map(f => `${f} = @${f}`).join(', ');
        database.prepare(`UPDATE kanban_cards SET ${sets}, updated_at = datetime('now') WHERE id = @id`).run({ ...updates, id: cardId });
        return database.prepare('SELECT * FROM kanban_cards WHERE id = ?').get(cardId);
      },
      null
    );
  });

  ipcMain.handle('db:deleteKanbanCard', async (_event, cardId) => {
    assertType(cardId, 'string', 'cardId');
    return dbCall(
      (database) => {
        database.prepare('DELETE FROM kanban_cards WHERE id = ?').run(cardId);
        return { deleted: true };
      },
      { deleted: false }
    );
  });

  ipcMain.handle('db:getAgentRelationships', async (_event, worldId) => {
    return dbCall(
      (database) => database.prepare('SELECT * FROM agent_relationships WHERE world_id = ?').all(worldId),
      []
    );
  });

  ipcMain.handle('db:getMinionRuns', async (_event, worldId, limit = 500) => {
    return dbCall(
      (database) => database.prepare('SELECT * FROM minion_runs WHERE world_id = ? ORDER BY created_at DESC LIMIT ?').all(worldId, limit),
      []
    );
  });

  ipcMain.handle('db:saveExperiment', async (_event, worldId, data) => {
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO experiments (world_id, name, hypothesis, status, config, results) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(worldId, data.name || '', data.hypothesis || '', data.status || 'draft', JSON.stringify(data.config || {}), JSON.stringify(data.results || {}));
        return database.prepare('SELECT * FROM experiments WHERE id = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  ipcMain.handle('db:importWorldSnapshot', async (_event, worldId, data) => {
    return dbCall(
      (database) => {
        const result = database.prepare(
          'INSERT INTO world_snapshots (world_id, label, snapshot_data) VALUES (?, ?, ?)'
        ).run(worldId, data.label || 'Imported snapshot', JSON.stringify(data));
        return { id: result.lastInsertRowid };
      },
      null
    );
  });

  // ── Council: dedicated safe handlers (replaces raw db:run / db:all) ──

  ipcMain.handle('db:executeCouncilQuery', async (_event, action, params) => {
    assertType(action, 'string', 'action');

    switch (action) {
      case 'insertSession': {
        const { id, worldId, prompt, modelsJson } = params;
        assertType(id, 'string', 'id');
        assertId(worldId, 'worldId');
        assertType(prompt, 'string', 'prompt');
        assertType(modelsJson, 'string', 'modelsJson');
        return dbCall(
          (database) => database.prepare(
            'INSERT INTO council_sessions (id, world_id, prompt, models_json) VALUES (?, ?, ?, ?)'
          ).run(id, worldId, prompt, modelsJson),
          null
        );
      }
      case 'insertPendingResponse': {
        const { id, sessionId, provider, model } = params;
        assertType(id, 'string', 'id');
        assertType(sessionId, 'string', 'sessionId');
        assertType(provider, 'string', 'provider');
        assertType(model, 'string', 'model');
        return dbCall(
          (database) => database.prepare(
            "INSERT INTO council_responses (id, session_id, provider, model, status) VALUES (?, ?, ?, ?, 'pending')"
          ).run(id, sessionId, provider, model),
          null
        );
      }
      case 'completeResponse': {
        const { responseId, response, costUsd, tokensUsed, latencyMs } = params;
        assertType(responseId, 'string', 'responseId');
        return dbCall(
          (database) => database.prepare(
            "UPDATE council_responses SET response=?, cost_usd=?, tokens_used=?, latency_ms=?, status='complete' WHERE id=?"
          ).run(response, costUsd || 0, tokensUsed || 0, latencyMs || 0, responseId),
          null
        );
      }
      case 'errorResponse': {
        const { responseId, latencyMs } = params;
        assertType(responseId, 'string', 'responseId');
        return dbCall(
          (database) => database.prepare(
            "UPDATE council_responses SET status='error', latency_ms=? WHERE id=?"
          ).run(latencyMs || 0, responseId),
          null
        );
      }
      default:
        throw new Error(`Unknown council action: ${action}`);
    }
  });

  ipcMain.handle('db:getCouncilData', async (_event, action, params) => {
    assertType(action, 'string', 'action');

    switch (action) {
      case 'getSessionsWithCounts': {
        const { worldId } = params;
        assertId(worldId, 'worldId');
        return dbCall(
          (database) => database.prepare(
            `SELECT cs.id, cs.prompt, cs.models_json, cs.created_at,
                    COUNT(cr.id) AS response_count
             FROM council_sessions cs
             LEFT JOIN council_responses cr ON cr.session_id = cs.id
             WHERE cs.world_id = ?
             GROUP BY cs.id
             ORDER BY cs.created_at DESC
             LIMIT 10`
          ).all(worldId),
          []
        );
      }
      case 'getResponsesBySession': {
        const { sessionId } = params;
        assertType(sessionId, 'string', 'sessionId');
        return dbCall(
          (database) => database.prepare(
            'SELECT * FROM council_responses WHERE session_id = ? ORDER BY created_at ASC'
          ).all(sessionId),
          []
        );
      }
      default:
        throw new Error(`Unknown council data query: ${action}`);
    }
  });

  // ── Analytics ──────────────────────────────────────────────────────

  ipcMain.handle('db:getAnalytics', async (_event, worldId, range) => {
    assertId(worldId, 'worldId');
    const rangeKey = typeof range === 'string' ? range : '30d';
    const daysMap = { '7d': 7, '30d': 30, '90d': 90, 'all': 0 };
    const days = daysMap[rangeKey] ?? 30;

    return dbCall(
      (database) => {
        const rawDb = database.db || database;
        const dateFilter = days > 0
          ? `AND created_at >= datetime('now', '-${days} days')`
          : '';

        // 1. Tasks per day
        let tasksPerDay = [];
        try {
          tasksPerDay = rawDb.prepare(`
            SELECT date(created_at) as date, COUNT(*) as count
            FROM tasks
            WHERE world_id = ? ${dateFilter}
            GROUP BY date(created_at)
            ORDER BY date ASC
          `).all(worldId);
        } catch (_) { /* table may not exist yet */ }

        // 2. Zone usage (count tasks per zone)
        let zoneUsage = [];
        try {
          zoneUsage = rawDb.prepare(`
            SELECT zone_id as zone_type,
                   COALESCE(zone_id, 'unknown') as zone_name,
                   COUNT(*) as count
            FROM tasks
            WHERE world_id = ? AND zone_id IS NOT NULL ${dateFilter}
            GROUP BY zone_id
            ORDER BY count DESC
            LIMIT 15
          `).all(worldId);
        } catch (_) { /* fallback */ }

        // Enrich zone names from zones table
        if (zoneUsage.length > 0) {
          try {
            const zones = rawDb.prepare(
              'SELECT zone_type, name FROM zones WHERE world_id = ?'
            ).all(worldId);
            const zoneMap = new Map(zones.map(z => [z.zone_type, z.name]));
            zoneUsage = zoneUsage.map(zu => ({
              ...zu,
              zone_name: zoneMap.get(zu.zone_type) || zu.zone_type || 'Unknown',
            }));
          } catch (_) { /* ignore */ }
        }

        // 3. Provider usage
        let providerUsage = [];
        try {
          providerUsage = rawDb.prepare(`
            SELECT provider, COUNT(*) as count
            FROM tasks
            WHERE world_id = ? AND provider IS NOT NULL ${dateFilter}
            GROUP BY provider
            ORDER BY count DESC
          `).all(worldId);
        } catch (_) { /* fallback */ }

        // 4. Tokens per day
        let tokensPerDay = [];
        try {
          tokensPerDay = rawDb.prepare(`
            SELECT date(created_at) as date,
                   COALESCE(SUM(input_tokens), 0) as input_tokens,
                   COALESCE(SUM(output_tokens), 0) as output_tokens,
                   COALESCE(SUM(cost_usd), 0) as cost
            FROM tasks
            WHERE world_id = ? ${dateFilter}
            GROUP BY date(created_at)
            ORDER BY date ASC
          `).all(worldId);
        } catch (_) { /* fallback */ }

        // 5. Agent performance
        let agentPerformance = [];
        try {
          agentPerformance = rawDb.prepare(`
            SELECT agent_id,
                   COALESCE(agent_id, 'unknown') as name,
                   COUNT(*) as tasks_completed,
                   AVG(latency_ms) as avg_latency
            FROM tasks
            WHERE world_id = ? AND status = 'completed' AND agent_id IS NOT NULL ${dateFilter}
            GROUP BY agent_id
            ORDER BY tasks_completed DESC
          `).all(worldId);
        } catch (_) { /* fallback */ }

        // Enrich agent names from agents table
        if (agentPerformance.length > 0) {
          try {
            const agents = rawDb.prepare(
              'SELECT id, name FROM agents WHERE world_id = ?'
            ).all(worldId);
            const agentMap = new Map(agents.map(a => [String(a.id), a.name]));
            agentPerformance = agentPerformance.map(ap => ({
              ...ap,
              name: agentMap.get(String(ap.agent_id)) || ap.agent_id || 'Unknown Agent',
            }));
          } catch (_) { /* ignore */ }
        }

        // 6. Summary stats
        let totalTasks = 0;
        let totalTokens = 0;
        let totalCost = 0;
        let avgLatency = 0;
        try {
          const stats = rawDb.prepare(`
            SELECT COUNT(*) as total,
                   COALESCE(SUM(input_tokens), 0) + COALESCE(SUM(output_tokens), 0) as tokens,
                   COALESCE(SUM(cost_usd), 0) as cost,
                   COALESCE(AVG(latency_ms), 0) as avg_lat
            FROM tasks
            WHERE world_id = ? ${dateFilter}
          `).get(worldId);
          totalTasks = stats?.total || 0;
          totalTokens = stats?.tokens || 0;
          totalCost = stats?.cost || 0;
          avgLatency = stats?.avg_lat || 0;
        } catch (_) { /* fallback */ }

        // Health score: activity (0-40) + diversity (0-30) + quests (0-30)
        const activityScore = Math.min(40, (totalTasks / Math.max(days || 30, 7)) * 8);
        const diversityScore = Math.min(30, zoneUsage.length * 5);

        let questScore = 0;
        try {
          const questStats = rawDb.prepare(`
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as done
            FROM quests
            WHERE world_id = ?
          `).get(worldId);
          const qTotal = questStats?.total || 0;
          const qDone = questStats?.done || 0;
          questScore = qTotal > 0 ? (qDone / qTotal) * 30 : 0;
        } catch (_) { /* fallback */ }

        const healthScore = {
          score: Math.round(activityScore + diversityScore + questScore),
          activityScore: Math.round(activityScore),
          diversityScore: Math.round(diversityScore),
          questScore: Math.round(questScore),
        };

        return {
          tasksPerDay,
          zoneUsage,
          providerUsage,
          tokensPerDay,
          agentPerformance,
          healthScore,
          summary: {
            totalTasks,
            totalTokens,
            totalCost,
            avgLatency,
          },
        };
      },
      {
        tasksPerDay: [],
        zoneUsage: [],
        providerUsage: [],
        tokensPerDay: [],
        agentPerformance: [],
        healthScore: { score: 0, activityScore: 0, diversityScore: 0, questScore: 0 },
        summary: { totalTasks: 0, totalTokens: 0, totalCost: 0, avgLatency: 0 },
      }
    );
  });

  // ── db:globalSearch — cross-zone search ──────────────────────────

  ipcMain.handle('db:globalSearch', async (_event, worldId, query, limit) => {
    assertId(worldId, 'worldId');
    assertType(query, 'string', 'query');
    const maxResults = (limit && Number.isInteger(limit) && limit > 0) ? limit : 50;
    const likePattern = `%${query}%`;

    // Each search source: { sql, params, type, titleCol, snippetCol, idCol }
    const sources = [
      // FTS tables (higher score)
      {
        type: 'tasks',
        fts: true,
        sql: `SELECT t.id, t.prompt AS title, t.response AS snippet, rank
              FROM tasks_fts fts
              JOIN tasks t ON t.rowid = fts.rowid
              WHERE tasks_fts MATCH ? AND t.world_id = ?
              ORDER BY rank LIMIT 10`,
        params: [query, worldId],
      },
      {
        type: 'legal_docs',
        fts: true,
        sql: `SELECT ld.id, ld.title, ld.content AS snippet, rank
              FROM legal_docs_fts fts
              JOIN legal_docs ld ON ld.rowid = fts.rowid
              WHERE legal_docs_fts MATCH ? AND ld.world_id = ?
              ORDER BY rank LIMIT 10`,
        params: [query, worldId],
      },
      {
        type: 'messages',
        fts: true,
        sql: `SELECT m.id, m.content AS title, m.content AS snippet, rank
              FROM messages_fts fts
              JOIN messages m ON m.rowid = fts.rowid
              WHERE messages_fts MATCH ? AND m.world_id = ?
              ORDER BY rank LIMIT 10`,
        params: [query, worldId],
      },
      // LIKE fallback tables
      {
        type: 'council_sessions',
        fts: false,
        sql: `SELECT id, prompt AS title, prompt AS snippet
              FROM council_sessions
              WHERE world_id = ? AND prompt LIKE ?
              ORDER BY created_at DESC LIMIT 10`,
        params: [worldId, likePattern],
      },
      {
        type: 'leads',
        fts: false,
        sql: `SELECT id, name AS title, (name || ' - ' || COALESCE(company, '') || ' - ' || COALESCE(notes, '')) AS snippet
              FROM leads
              WHERE world_id = ? AND (name LIKE ? OR company LIKE ? OR notes LIKE ?)
              ORDER BY updated_at DESC LIMIT 10`,
        params: [worldId, likePattern, likePattern, likePattern],
      },
      {
        type: 'content_pieces',
        fts: false,
        sql: `SELECT id, title, (COALESCE(brief, '') || ' ' || COALESCE(content, '')) AS snippet
              FROM content_pieces
              WHERE world_id = ? AND (title LIKE ? OR brief LIKE ? OR content LIKE ?)
              ORDER BY created_at DESC LIMIT 10`,
        params: [worldId, likePattern, likePattern, likePattern],
      },
      {
        type: 'research_queries',
        fts: false,
        sql: `SELECT id, query AS title, COALESCE(result, query) AS snippet
              FROM research_queries
              WHERE world_id = ? AND (query LIKE ? OR result LIKE ?)
              ORDER BY created_at DESC LIMIT 10`,
        params: [worldId, likePattern, likePattern],
      },
      {
        type: 'broadcast_log',
        fts: false,
        sql: `SELECT id, event_type AS title, payload_json AS snippet
              FROM broadcast_log
              WHERE world_id = ? AND (event_type LIKE ? OR payload_json LIKE ?)
              ORDER BY created_at DESC LIMIT 10`,
        params: [worldId, likePattern, likePattern],
      },
      {
        type: 'experiments',
        fts: false,
        sql: `SELECT id, name AS title, (COALESCE(description, '') || ' ' || COALESCE(prompt, '')) AS snippet
              FROM experiments
              WHERE world_id = ? AND (name LIKE ? OR description LIKE ? OR prompt LIKE ?)
              ORDER BY created_at DESC LIMIT 10`,
        params: [worldId, likePattern, likePattern, likePattern],
      },
      {
        type: 'skills',
        fts: false,
        sql: `SELECT id, name AS title, COALESCE(description, '') AS snippet
              FROM skills
              WHERE world_id = ? AND (name LIKE ? OR description LIKE ?)
              ORDER BY created_at DESC LIMIT 10`,
        params: [worldId, likePattern, likePattern],
      },
    ];

    // Zone ID mapping
    const ZONE_IDS = {
      tasks:            'dispatch',
      legal_docs:       'legal',
      council_sessions: 'council',
      leads:            'sales',
      content_pieces:   'marketing',
      research_queries: 'globe',
      broadcast_log:    'broadcast',
      experiments:      'rnd',
      skills:           'skills',
      messages:         'chat',
    };

    return dbCall(
      (database) => {
        const allResults = [];

        for (const source of sources) {
          try {
            const rows = database.prepare(source.sql).all(...source.params);
            for (const row of rows) {
              const score = source.fts
                ? 100 + (row.rank ? Math.abs(row.rank) : 0)
                : 80 - (allResults.length * 0.1);

              // Truncate snippet for transport
              let snippet = row.snippet || '';
              if (snippet.length > 200) {
                snippet = snippet.slice(0, 200) + '...';
              }

              allResults.push({
                type: source.type,
                title: (row.title || '').slice(0, 200),
                snippet,
                score,
                id: row.id,
                zoneId: ZONE_IDS[source.type] || source.type,
              });
            }
          } catch (err) {
            // Table may not exist — skip silently
            if (!err.message.includes('no such table')) {
              console.warn(`[globalSearch] Error querying ${source.type}:`, err.message);
            }
          }
        }

        // Sort by score descending, then truncate
        allResults.sort((a, b) => b.score - a.score);
        const results = allResults.slice(0, maxResults);

        return { results, total: allResults.length };
      },
      { results: [], total: 0 }
    );
  });

  // ── Achievements ──────────────────────────────────────────────────

  ipcMain.handle('db:getAchievements', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM achievements WHERE world_id = ? ORDER BY unlocked_at DESC'
      ).all(worldId),
      []
    );
  });

  ipcMain.handle('db:unlockAchievement', async (_event, worldId, achievementId) => {
    assertId(worldId, 'worldId');
    assertType(achievementId, 'string', 'achievementId');
    return dbCall(
      (database) => database.prepare(
        `INSERT OR IGNORE INTO achievements (world_id, achievement_id) VALUES (?, ?)`
      ).run(worldId, achievementId),
      { changes: 0 }
    );
  });

  // ── app:* handlers ────────────────────────────────────────────────

  // ── Timeline ──────────────────────────────────────────────────────────
  ipcMain.handle('db:getTimelineEvents', async (_event, worldId, limit) => {
    assertId(worldId, 'worldId');
    const max = (typeof limit === 'number' && limit > 0) ? limit : 2000;

    return dbCall(
      (database) => {
        const rawDb = database.db || database;
        const events = [];

        // 1. Tasks — dispatched / completed / failed
        try {
          const tasks = rawDb.prepare(`
            SELECT id, prompt, status, model, cost_usd, zone_id, created_at, completed_at
            FROM tasks
            WHERE world_id = ?
            ORDER BY created_at DESC
            LIMIT ?
          `).all(worldId, max);

          for (const t of tasks) {
            events.push({
              category: 'tasks',
              title: t.status === 'completed' ? 'Task Completed'
                   : t.status === 'failed' ? 'Task Failed'
                   : 'Task Dispatched',
              description: t.prompt
                ? (t.prompt.length > 120 ? t.prompt.slice(0, 120) + '...' : t.prompt)
                : `Task ${t.status || 'dispatched'}`,
              created_at: t.completed_at || t.created_at,
              zone_link: t.zone_id || null,
              meta: { status: t.status, model: t.model, cost: t.cost_usd },
            });
          }
        } catch (_) { /* table may not exist */ }

        // 2. Zones — unlocked, progress milestones
        try {
          const zones = rawDb.prepare(`
            SELECT slug, name, color, unlocked, unlocked_at, progress, created_at
            FROM zones
            WHERE world_id = ?
          `).all(worldId);

          for (const z of zones) {
            if (z.unlocked) {
              events.push({
                category: 'zones',
                title: `Zone Unlocked: ${z.name || z.slug}`,
                description: `The ${z.name || z.slug} zone is now accessible.`,
                created_at: z.unlocked_at || z.created_at,
                zone_link: z.slug,
                meta: { color: z.color },
              });
            }
            // Progress milestones
            const progress = z.progress || 0;
            const milestones = [25, 50, 75, 100];
            for (const m of milestones) {
              if (progress >= m) {
                events.push({
                  category: 'zones',
                  title: `${z.name || z.slug}: ${m}% Complete`,
                  description: `Zone progress reached ${m}%.`,
                  created_at: z.created_at, // approximate
                  zone_link: z.slug,
                  meta: { progress: m },
                });
              }
            }
          }
        } catch (_) { /* table may not exist */ }

        // 3. Agents — joined / relationships
        try {
          const agents = rawDb.prepare(`
            SELECT name, role, state, created_at
            FROM agents
            WHERE world_id = ?
          `).all(worldId);

          for (const a of agents) {
            events.push({
              category: 'agents',
              title: `Agent Joined: ${a.name}`,
              description: `${a.name} (${a.role || 'agent'}) entered the world.`,
              created_at: a.created_at,
              zone_link: null,
              meta: { role: a.role, state: a.state },
            });
          }
        } catch (_) { /* table may not exist */ }

        // 4. Achievements — badges unlocked
        try {
          const achievements = rawDb.prepare(`
            SELECT achievement_id, description, unlocked_at, created_at
            FROM achievements
            WHERE world_id = ?
          `).all(worldId);

          for (const a of achievements) {
            events.push({
              category: 'achievements',
              title: `Achievement Unlocked: ${a.achievement_id || 'Badge'}`,
              description: a.description || 'A new achievement was unlocked.',
              created_at: a.unlocked_at || a.created_at,
              zone_link: null,
              meta: {},
            });
          }
        } catch (_) { /* table may not exist */ }

        // 5. Quests — started / completed
        try {
          const quests = rawDb.prepare(`
            SELECT title, description, xp_reward, status, created_at, completed_at
            FROM quests
            WHERE world_id = ?
          `).all(worldId);

          for (const q of quests) {
            events.push({
              category: 'quests',
              title: q.status === 'completed'
                ? `Quest Completed: ${q.title}`
                : `Quest Started: ${q.title}`,
              description: q.description || '',
              created_at: q.status === 'completed'
                ? (q.completed_at || q.created_at)
                : q.created_at,
              zone_link: null,
              meta: { xp_reward: q.xp_reward, status: q.status },
            });
          }
        } catch (_) { /* table may not exist */ }

        // 6. System — world creation, snapshots
        try {
          const world = rawDb.prepare(`
            SELECT name, created_at FROM worlds WHERE id = ?
          `).get(worldId);

          if (world) {
            events.push({
              category: 'system',
              title: `World Created: ${world.name}`,
              description: 'The world was created.',
              created_at: world.created_at,
              zone_link: null,
              meta: {},
            });
          }
        } catch (_) { /* table may not exist */ }

        try {
          const snapshots = rawDb.prepare(`
            SELECT label, created_at
            FROM world_snapshots
            WHERE world_id = ?
            ORDER BY created_at DESC
          `).all(worldId);

          for (const s of snapshots) {
            events.push({
              category: 'system',
              title: `Snapshot: ${s.label || 'Untitled'}`,
              description: 'A world snapshot was saved.',
              created_at: s.created_at,
              zone_link: null,
              meta: {},
            });
          }
        } catch (_) { /* table may not exist */ }

        // Sort descending by date and limit
        events.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return events.slice(0, max);
      },
      []
    );
  });

  // ── Automation Builder — Workflows ─────────────────────────────────

  ipcMain.handle('db:getWorkflows', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM workflows WHERE world_id = ? ORDER BY updated_at DESC'
      ).all(worldId),
      []
    );
  });

  ipcMain.handle('db:saveWorkflow', async (_event, worldId, data) => {
    assertId(worldId, 'worldId');
    assertType(data.name, 'string', 'name');
    return dbCall(
      (database) => {
        if (data.id) {
          // Update existing
          database.prepare(
            `UPDATE workflows SET name = ?, config = ?, updated_at = datetime('now') WHERE id = ? AND world_id = ?`
          ).run(data.name, data.config || '{}', data.id, worldId);
          return database.prepare('SELECT * FROM workflows WHERE id = ?').get(data.id);
        }
        // Insert new
        const result = database.prepare(
          `INSERT INTO workflows (world_id, name, config, status) VALUES (?, ?, ?, 'draft')`
        ).run(worldId, data.name, data.config || '{}');
        return database.prepare('SELECT * FROM workflows WHERE rowid = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  ipcMain.handle('db:deleteWorkflow', async (_event, workflowId) => {
    assertType(workflowId, 'string', 'workflowId');
    return dbCall(
      (database) => {
        database.prepare('DELETE FROM workflows WHERE id = ?').run(workflowId);
        return { success: true };
      },
      { success: true }
    );
  });

  // ── Agent Skill Trees ──────────────────────────────────────────────

  ipcMain.handle('db:getAgentSkills', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM agent_skills WHERE world_id = ? ORDER BY unlocked_at ASC'
      ).all(worldId),
      []
    );
  });

  ipcMain.handle('db:unlockAgentSkill', async (_event, worldId, agentId, skillId) => {
    assertId(worldId, 'worldId');
    assertType(agentId, 'string', 'agentId');
    assertType(skillId, 'string', 'skillId');
    return dbCall(
      (database) => database.prepare(
        `INSERT OR IGNORE INTO agent_skills (world_id, agent_id, skill_id) VALUES (?, ?, ?)`
      ).run(worldId, agentId, skillId),
      { changes: 0 }
    );
  });

  // ── Calendar Events ──────────────────────────────────────────────

  // Ensure the calendar_events table exists
  if (db) {
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS calendar_events (
          id TEXT PRIMARY KEY,
          world_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          description TEXT DEFAULT '',
          event_type TEXT NOT NULL DEFAULT 'task',
          event_date TEXT NOT NULL,
          start_time TEXT DEFAULT NULL,
          end_time TEXT DEFAULT NULL,
          all_day INTEGER NOT NULL DEFAULT 1,
          recurrence TEXT NOT NULL DEFAULT 'none',
          recurrence_end TEXT DEFAULT NULL,
          color TEXT DEFAULT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      db.exec('CREATE INDEX IF NOT EXISTS idx_calendar_world_date ON calendar_events(world_id, event_date)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_calendar_type ON calendar_events(world_id, event_type)');
    } catch (err) {
      console.warn('[ipc] Could not create calendar_events table:', err.message);
    }
  }

  ipcMain.handle('db:getCalendarEvents', async (_event, worldId) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM calendar_events WHERE world_id = ? ORDER BY event_date ASC, start_time ASC'
      ).all(worldId),
      []
    );
  });

  ipcMain.handle('db:createCalendarEvent', async (_event, worldId, data) => {
    assertId(worldId, 'worldId');
    assertType(data.title, 'string', 'title');
    return dbCall(
      (database) => {
        const id = require('crypto').randomBytes(8).toString('hex');
        database.prepare(
          `INSERT INTO calendar_events (id, world_id, title, description, event_type, event_date, start_time, end_time, all_day, recurrence, recurrence_end)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          id, worldId,
          data.title,
          data.description || '',
          data.event_type || 'task',
          data.event_date,
          data.start_time || null,
          data.end_time || null,
          data.all_day ? 1 : 0,
          data.recurrence || 'none',
          data.recurrence_end || null
        );
        return database.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
      },
      { id: 'mock', ...data, world_id: worldId }
    );
  });

  ipcMain.handle('db:updateCalendarEvent', async (_event, eventId, updates) => {
    assertType(eventId, 'string', 'eventId');
    return dbCall(
      (database) => {
        const allowed = ['title', 'description', 'event_type', 'event_date', 'start_time', 'end_time', 'all_day', 'recurrence', 'recurrence_end', 'color'];
        const fields = Object.keys(updates).filter(k => allowed.includes(k));
        if (fields.length === 0) return { changes: 0 };
        const sets = fields.map(f => `${f} = ?`).join(', ');
        const vals = fields.map(f => updates[f]);
        return database.prepare(
          `UPDATE calendar_events SET ${sets}, updated_at = datetime('now') WHERE id = ?`
        ).run(...vals, eventId);
      },
      { changes: 0 }
    );
  });

  ipcMain.handle('db:deleteCalendarEvent', async (_event, eventId) => {
    assertType(eventId, 'string', 'eventId');
    return dbCall(
      (database) => {
        database.prepare('DELETE FROM calendar_events WHERE id = ?').run(eventId);
        return { success: true };
      },
      { success: true }
    );
  });

  // ── Task creation (for Dispatch zone) ──────────────────────────
  ipcMain.handle('db:createTask', async (_event, worldId, data) => {
    assertId(worldId, 'worldId');
    return dbCall(
      (database) => {
        const result = database.prepare(
          `INSERT INTO tasks (world_id, prompt, model, provider, status, response, tokens_in, tokens_out, cost, created_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)`
        ).run(
          worldId, data.prompt || '', data.model || '', data.provider || '',
          data.status || 'completed', data.response || '', data.tokens_in || 0,
          data.tokens_out || 0, data.cost || 0, data.completed_at || null
        );
        return database.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
      },
      null
    );
  });

  ipcMain.handle('app:getVersion', async () => {
    return app.getVersion();
  });

  ipcMain.handle('app:getPlatform', async () => {
    return process.platform;
  });
}

module.exports = { registerHandlers };
