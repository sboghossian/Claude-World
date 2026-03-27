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

  ipcMain.handle('db:updateZoneProgress', async (_event, worldId, zoneType, progress) => {
    assertPositiveInt(worldId, 'worldId');
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
    assertPositiveInt(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT zone_type, build_progress, unlocked FROM zones WHERE world_id = ?'
      ).all(worldId),
      []
    );
  });

  ipcMain.handle('db:unlockZone', async (_event, worldId, zoneType) => {
    assertPositiveInt(worldId, 'worldId');
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
    assertPositiveInt(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM projects WHERE world_id = ? ORDER BY pinned DESC, updated_at DESC'
      ).all(worldId),
      []
    );
  });

  ipcMain.handle('db:createProject', async (_event, worldId, name, icon) => {
    assertPositiveInt(worldId, 'worldId');
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
    assertPositiveInt(worldId, 'worldId');
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
    assertPositiveInt(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        "SELECT i.*, a.name AS reporter_name FROM incidents i LEFT JOIN agents a ON i.reporter_agent_id = a.id WHERE i.world_id = ? AND i.status != 'resolved' ORDER BY i.created_at DESC LIMIT ?"
      ).all(worldId, limit || 20),
      []
    );
  });

  ipcMain.handle('db:createIncident', async (_event, worldId, data) => {
    assertPositiveInt(worldId, 'worldId');
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
    assertPositiveInt(worldId, 'worldId');
    return dbCall(
      (database) => database.prepare(
        'SELECT * FROM minions WHERE world_id = ? ORDER BY created_at ASC'
      ).all(worldId),
      []
    );
  });

  ipcMain.handle('db:createMinion', async (_event, worldId, config) => {
    assertPositiveInt(worldId, 'worldId');
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
    assertPositiveInt(worldId, 'worldId');
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

  // ── app:* handlers ────────────────────────────────────────────────

  ipcMain.handle('app:getVersion', async () => {
    return app.getVersion();
  });

  ipcMain.handle('app:getPlatform', async () => {
    return process.platform;
  });
}

module.exports = { registerHandlers };
