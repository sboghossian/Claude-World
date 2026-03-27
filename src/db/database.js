'use strict';

const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const BetterSqlite3 = require('better-sqlite3');
const { seedDefaultZones, seedDefaultAgents, seedQuestChain, applyTemplate } = require('./seed');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Calculate the level for a given total XP amount.
 * Level N requires N * 500 cumulative XP (so level 2 at 1000 XP, level 3 at 1500, etc.).
 *
 * @param {number} totalXP
 * @returns {number}
 */
function levelForXP(totalXP) {
  // level 1 = 0..499, level 2 = 500..1499, level 3 = 1500..2999 …
  // Cumulative threshold for level N: sum(k=1..N-1) k*500 = 500 * N*(N-1)/2
  // We solve 500 * L*(L-1)/2 <= totalXP  =>  L^2 - L - 2*totalXP/500 <= 0
  // L = floor((1 + sqrt(1 + 4*totalXP/250)) / 2)
  if (totalXP <= 0) return 1;
  const L = Math.floor((1 + Math.sqrt(1 + (4 * totalXP) / 250)) / 2);
  return Math.max(1, L);
}

/**
 * Build a partial-UPDATE SQL string and parameter object from a table name,
 * a primary-key column, its value, and a plain object of column→value updates.
 *
 * @param {string} table
 * @param {string} pkCol
 * @param {string} pkVal
 * @param {Record<string, any>} updates
 * @returns {{sql: string, params: Record<string, any>}}
 */
function buildPartialUpdate(table, pkCol, pkVal, updates) {
  const keys = Object.keys(updates);
  if (keys.length === 0) throw new Error('No update fields provided');
  const setClauses = keys.map((k) => `${k} = @${k}`);
  const sql = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${pkCol} = @__pk`;
  const params = { ...updates, __pk: pkVal };
  return { sql, params };
}

// ---------------------------------------------------------------------------
// Database class
// ---------------------------------------------------------------------------

/**
 * Central database layer for Claude World.
 *
 * Wraps better-sqlite3, runs migrations on open, and exposes prepared-statement
 * methods for every domain operation.
 */
class Database {
  /**
   * Open (or create) the SQLite database at `filePath` and run migrations.
   *
   * @param {string} filePath  Absolute path to the .sqlite file.
   */
  constructor(filePath) {
    /** @type {string} */
    this.filePath = filePath;

    // Ensure parent directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    /** @type {import('better-sqlite3').Database} */
    this.db = new BetterSqlite3(filePath);

    // Performance pragmas
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');

    this._runMigrations();
    this._prepareStatements();
  }

  // -----------------------------------------------------------------------
  // Migrations
  // -----------------------------------------------------------------------

  /**
   * Execute all .sql files in the migrations/ directory that have not yet
   * been applied.  Tracks applied migrations in an internal table.
   * @private
   */
  _runMigrations() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    const applied = new Set(
      this.db
        .prepare('SELECT name FROM _migrations')
        .all()
        .map((r) => r.name)
    );

    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) return;

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      this.db.exec(sql);
      this.db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
    }
  }

  // -----------------------------------------------------------------------
  // Prepared statements
  // -----------------------------------------------------------------------

  /** @private */
  _prepareStatements() {
    // -- Worlds --
    this._stmts = {};

    this._stmts.insertWorld = this.db.prepare(`
      INSERT INTO worlds (name, template) VALUES (@name, @template)
    `);

    this._stmts.getWorld = this.db.prepare(`
      SELECT w.*,
        (SELECT COUNT(*) FROM zones WHERE world_id = w.id) AS zone_count,
        (SELECT COUNT(*) FROM agents WHERE world_id = w.id) AS agent_count
      FROM worlds w WHERE w.id = ?
    `);

    this._stmts.getFirstWorld = this.db.prepare(`
      SELECT * FROM worlds ORDER BY created_at ASC LIMIT 1
    `);

    this._stmts.getWorldIdFromRowid = this.db.prepare(`
      SELECT id FROM worlds WHERE rowid = ?
    `);

    // -- Zones --
    this._stmts.getZones = this.db.prepare(`
      SELECT * FROM zones WHERE world_id = ? ORDER BY grid_y, grid_x
    `);

    this._stmts.getZone = this.db.prepare(`
      SELECT z.*,
        (SELECT COUNT(*) FROM agents WHERE zone_id = z.id) AS agent_count
      FROM zones z WHERE z.id = ?
    `);

    this._stmts.unlockZone = this.db.prepare(`
      UPDATE zones SET unlocked = 1, unlocked_at = datetime('now'), discovered = 1, discovered_at = COALESCE(discovered_at, datetime('now'))
      WHERE id = ?
    `);

    this._stmts.updateBuildProgress = this.db.prepare(`
      UPDATE zones SET build_progress = ? WHERE id = ?
    `);

    this._stmts.getZoneAgents = this.db.prepare(`
      SELECT * FROM agents WHERE zone_id = ?
    `);

    // -- Agents --
    this._stmts.getAgents = this.db.prepare(`
      SELECT a.*, z.name AS zone_name
      FROM agents a
      LEFT JOIN zones z ON a.zone_id = z.id
      WHERE a.world_id = ?
    `);

    this._stmts.getAgent = this.db.prepare(`
      SELECT a.*, z.name AS zone_name, z.zone_type
      FROM agents a
      LEFT JOIN zones z ON a.zone_id = z.id
      WHERE a.id = ?
    `);

    this._stmts.updateAgentState = this.db.prepare(`
      UPDATE agents SET state = @state, tile_x = @tile_x, tile_y = @tile_y WHERE id = @id
    `);

    this._stmts.addAgentXP = this.db.prepare(`
      UPDATE agents SET xp = xp + ? WHERE id = ?
    `);

    this._stmts.getAgentById = this.db.prepare(`
      SELECT * FROM agents WHERE id = ?
    `);

    // -- Tasks --
    this._stmts.insertTask = this.db.prepare(`
      INSERT INTO tasks (world_id, zone_id, agent_id, quest_id, provider, model, status, prompt, system_prompt, metadata_json)
      VALUES (@world_id, @zone_id, @agent_id, @quest_id, @provider, @model, @status, @prompt, @system_prompt, @metadata_json)
    `);

    this._stmts.getTaskIdFromRowid = this.db.prepare(`
      SELECT id FROM tasks WHERE rowid = ?
    `);

    this._stmts.getTask = this.db.prepare(`
      SELECT * FROM tasks WHERE id = ?
    `);

    this._stmts.getRecentTasks = this.db.prepare(`
      SELECT * FROM tasks WHERE world_id = ? ORDER BY created_at DESC LIMIT ?
    `);

    this._stmts.searchTasksFTS = this.db.prepare(`
      SELECT t.* FROM tasks_fts fts
      JOIN tasks t ON t.rowid = fts.rowid
      WHERE tasks_fts MATCH ? AND t.world_id = ?
      ORDER BY rank
      LIMIT 50
    `);

    this._stmts.taskStatsTotal = this.db.prepare(`
      SELECT
        COUNT(*) AS total_tasks,
        COALESCE(SUM(cost_usd), 0) AS total_cost,
        COALESCE(AVG(latency_ms), 0) AS avg_latency
      FROM tasks WHERE world_id = ?
    `);

    this._stmts.taskStatsByStatus = this.db.prepare(`
      SELECT status, COUNT(*) AS count FROM tasks WHERE world_id = ? GROUP BY status
    `);

    // -- Quests --
    this._stmts.getQuests = this.db.prepare(`
      SELECT * FROM quests WHERE world_id = ? ORDER BY chain_id, sort_order
    `);

    this._stmts.getActiveQuest = this.db.prepare(`
      SELECT * FROM quests WHERE world_id = ? AND status = 'active' ORDER BY sort_order ASC LIMIT 1
    `);

    this._stmts.activateQuest = this.db.prepare(`
      UPDATE quests SET status = 'active' WHERE id = ?
    `);

    this._stmts.completeQuest = this.db.prepare(`
      UPDATE quests SET status = 'completed', completed_at = datetime('now') WHERE id = ?
    `);

    this._stmts.getQuest = this.db.prepare(`
      SELECT * FROM quests WHERE id = ?
    `);

    this._stmts.findMatchingQuest = this.db.prepare(`
      SELECT * FROM quests
      WHERE world_id = ? AND status = 'active' AND trigger_type = ?
        AND (trigger_value = ? OR trigger_value = 'any')
      LIMIT 1
    `);

    this._stmts.getNextLockedQuest = this.db.prepare(`
      SELECT * FROM quests
      WHERE world_id = ? AND chain_id = ? AND status = 'locked'
      ORDER BY sort_order ASC LIMIT 1
    `);

    // -- Snapshots --
    this._stmts.insertSnapshot = this.db.prepare(`
      INSERT INTO snapshots (world_id, parent_id, label, data_json, size_bytes)
      VALUES (@world_id, @parent_id, @label, @data_json, @size_bytes)
    `);

    this._stmts.getSnapshotIdFromRowid = this.db.prepare(`
      SELECT id FROM snapshots WHERE rowid = ?
    `);

    this._stmts.listSnapshots = this.db.prepare(`
      SELECT id, world_id, parent_id, label, created_at, size_bytes
      FROM snapshots WHERE world_id = ? ORDER BY created_at DESC
    `);

    this._stmts.getSnapshot = this.db.prepare(`
      SELECT * FROM snapshots WHERE id = ?
    `);

    // -- Events --
    this._stmts.insertEvent = this.db.prepare(`
      INSERT INTO world_events (world_id, event_type, source_id, target_id, data_json)
      VALUES (@world_id, @event_type, @source_id, @target_id, @data_json)
    `);

    this._stmts.getRecentEvents = this.db.prepare(`
      SELECT * FROM world_events WHERE world_id = ? ORDER BY created_at DESC LIMIT ?
    `);

    // -- XP --
    this._stmts.addWorldXP = this.db.prepare(`
      UPDATE worlds SET xp = xp + ? WHERE id = ?
    `);

    this._stmts.updateWorldLevel = this.db.prepare(`
      UPDATE worlds SET level = ?, updated_at = datetime('now') WHERE id = ?
    `);

    this._stmts.getWorldXP = this.db.prepare(`
      SELECT xp, level FROM worlds WHERE id = ?
    `);
  }

  // =======================================================================
  // WORLD
  // =======================================================================

  /**
   * Create a new world, seed its zones, agents, and quest chain.
   * If a template is provided, unlock additional zones.
   *
   * @param {string} name  Display name of the world.
   * @param {string|null} [template=null]  Optional template key.
   * @returns {object}  The newly created world row (with zone_count, agent_count).
   */
  createWorld(name, template = null) {
    const world = this.db.transaction(() => {
      const info = this._stmts.insertWorld.run({ name, template: template || null });
      const { id } = this._stmts.getWorldIdFromRowid.get(info.lastInsertRowid);

      const zones = seedDefaultZones(this, id);
      seedDefaultAgents(this, id, zones);
      seedQuestChain(this, id);

      if (template) {
        applyTemplate(this, id, template);
      }

      return this._stmts.getWorld.get(id);
    })();

    return { ...world };
  }

  /**
   * Retrieve a world by ID, including aggregate counts.
   *
   * @param {string} id  World ID.
   * @returns {object|undefined}  The world row or undefined.
   */
  getWorld(id) {
    const row = this._stmts.getWorld.get(id);
    return row ? { ...row } : undefined;
  }

  /**
   * Retrieve the first world in the database, or create a default one if none exist.
   *
   * @returns {object}  A world row.
   */
  getDefaultWorld() {
    const row = this._stmts.getFirstWorld.get();
    if (row) {
      return this.getWorld(row.id);
    }
    return this.createWorld('My World');
  }

  /**
   * Partially update a world's columns.
   *
   * @param {string} id  World ID.
   * @param {Record<string, any>} updates  Column→value pairs to set.
   * @returns {object|undefined}  The updated world row.
   */
  updateWorld(id, updates) {
    const safeUpdates = { ...updates, updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19) };
    const { sql, params } = buildPartialUpdate('worlds', 'id', id, safeUpdates);
    this.db.prepare(sql).run(params);
    return this.getWorld(id);
  }

  /**
   * Add XP to a world and recalculate its level.
   *
   * @param {string} worldId  World ID.
   * @param {number} amount  XP to add (positive integer).
   * @returns {{xp: number, level: number, leveledUp: boolean}}
   */
  addXP(worldId, amount) {
    return this.db.transaction(() => {
      this._stmts.addWorldXP.run(amount, worldId);
      const { xp, level: oldLevel } = this._stmts.getWorldXP.get(worldId);
      const newLevel = levelForXP(xp);
      if (newLevel !== oldLevel) {
        this._stmts.updateWorldLevel.run(newLevel, worldId);
      }
      return { xp, level: newLevel, leveledUp: newLevel > oldLevel };
    })();
  }

  // =======================================================================
  // ZONES
  // =======================================================================

  /**
   * Get all zones for a world, ordered by grid position.
   *
   * @param {string} worldId
   * @returns {object[]}
   */
  getZones(worldId) {
    return this._stmts.getZones.all(worldId).map((r) => ({ ...r }));
  }

  /**
   * Get a single zone by ID, including agent count.
   *
   * @param {string} id  Zone ID.
   * @returns {object|undefined}
   */
  getZone(id) {
    const row = this._stmts.getZone.get(id);
    return row ? { ...row } : undefined;
  }

  /**
   * Unlock a zone (sets unlocked=1 and records timestamp).
   *
   * @param {string} id  Zone ID.
   * @returns {object|undefined}  The updated zone.
   */
  unlockZone(id) {
    this._stmts.unlockZone.run(id);
    return this.getZone(id);
  }

  /**
   * Update a zone's build progress, clamped to [0, 1].
   *
   * @param {string} id  Zone ID.
   * @param {number} progress  Value between 0 and 1.
   * @returns {object|undefined}  The updated zone.
   */
  updateBuildProgress(id, progress) {
    const clamped = Math.max(0, Math.min(1, progress));
    this._stmts.updateBuildProgress.run(clamped, id);
    return this.getZone(id);
  }

  /**
   * Get a zone along with all agents currently assigned to it.
   *
   * @param {string} id  Zone ID.
   * @returns {{zone: object, agents: object[]}|undefined}
   */
  getZoneWithAgents(id) {
    const zone = this.getZone(id);
    if (!zone) return undefined;
    const agents = this._stmts.getZoneAgents.all(id).map((r) => ({ ...r }));
    return { ...zone, agents };
  }

  // =======================================================================
  // AGENTS
  // =======================================================================

  /**
   * Get all agents in a world, including their zone name.
   *
   * @param {string} worldId
   * @returns {object[]}
   */
  getAgents(worldId) {
    return this._stmts.getAgents.all(worldId).map((r) => ({ ...r }));
  }

  /**
   * Get a single agent by ID, with zone info.
   *
   * @param {string} id  Agent ID.
   * @returns {object|undefined}
   */
  getAgent(id) {
    const row = this._stmts.getAgent.get(id);
    return row ? { ...row } : undefined;
  }

  /**
   * Update an agent's state and tile position.
   *
   * @param {string} id  Agent ID.
   * @param {string} state  New state (e.g. 'idle', 'working', 'walking').
   * @param {number} tileX
   * @param {number} tileY
   * @returns {object|undefined}  The updated agent.
   */
  updateAgentState(id, state, tileX, tileY) {
    this._stmts.updateAgentState.run({ id, state, tile_x: tileX, tile_y: tileY });
    return this.getAgent(id);
  }

  /**
   * Add XP to an agent and recalculate level.
   *
   * @param {string} id  Agent ID.
   * @param {number} amount  XP to add.
   * @returns {{xp: number, level: number, leveledUp: boolean}}
   */
  addAgentXP(id, amount) {
    return this.db.transaction(() => {
      this._stmts.addAgentXP.run(amount, id);
      const agent = this._stmts.getAgentById.get(id);
      const newLevel = levelForXP(agent.xp);
      if (newLevel !== agent.level) {
        this.db.prepare('UPDATE agents SET level = ? WHERE id = ?').run(newLevel, id);
      }
      return { xp: agent.xp, level: newLevel, leveledUp: newLevel > agent.level };
    })();
  }

  // =======================================================================
  // TASKS
  // =======================================================================

  /**
   * Create a new AI task record.
   *
   * @param {object} task
   * @param {string} task.world_id
   * @param {string} [task.zone_id]
   * @param {string} [task.agent_id]
   * @param {string} [task.quest_id]
   * @param {string} task.provider
   * @param {string} task.model
   * @param {string} task.prompt
   * @param {string} [task.system_prompt]
   * @param {string} [task.status='pending']
   * @param {string} [task.metadata_json='{}']
   * @returns {object}  The inserted task row.
   */
  createTask(task) {
    const params = {
      world_id: task.world_id,
      zone_id: task.zone_id || null,
      agent_id: task.agent_id || null,
      quest_id: task.quest_id || null,
      provider: task.provider,
      model: task.model,
      status: task.status || 'pending',
      prompt: task.prompt,
      system_prompt: task.system_prompt || null,
      metadata_json: task.metadata_json || '{}',
    };
    const info = this._stmts.insertTask.run(params);
    const { id } = this._stmts.getTaskIdFromRowid.get(info.lastInsertRowid);
    return { ...this._stmts.getTask.get(id) };
  }

  /**
   * Partially update a task (e.g. status, response, tokens, cost).
   *
   * @param {string} id  Task ID.
   * @param {Record<string, any>} updates  Column→value pairs to set.
   * @returns {object|undefined}  The updated task row.
   */
  updateTask(id, updates) {
    const { sql, params } = buildPartialUpdate('tasks', 'id', id, updates);
    this.db.prepare(sql).run(params);
    return { ...this._stmts.getTask.get(id) };
  }

  /**
   * Get the most recent tasks for a world.
   *
   * @param {string} worldId
   * @param {number} [limit=20]
   * @returns {object[]}
   */
  getRecentTasks(worldId, limit = 20) {
    return this._stmts.getRecentTasks.all(worldId, limit).map((r) => ({ ...r }));
  }

  /**
   * Full-text search across task prompts and responses.
   *
   * @param {string} worldId
   * @param {string} query  FTS5 query string.
   * @returns {object[]}
   */
  searchTasks(worldId, query) {
    return this._stmts.searchTasksFTS.all(query, worldId).map((r) => ({ ...r }));
  }

  /**
   * Get aggregate task statistics for a world.
   *
   * @param {string} worldId
   * @returns {{totalTasks: number, totalCost: number, avgLatency: number, tasksByStatus: Record<string, number>}}
   */
  getTaskStats(worldId) {
    const totals = this._stmts.taskStatsTotal.get(worldId);
    const byStatus = this._stmts.taskStatsByStatus.all(worldId);
    const tasksByStatus = {};
    for (const row of byStatus) {
      tasksByStatus[row.status] = row.count;
    }
    return {
      totalTasks: totals.total_tasks,
      totalCost: totals.total_cost,
      avgLatency: Math.round(totals.avg_latency),
      tasksByStatus,
    };
  }

  // =======================================================================
  // QUESTS
  // =======================================================================

  /**
   * Get all quests for a world, ordered by chain and position.
   *
   * @param {string} worldId
   * @returns {object[]}
   */
  getQuests(worldId) {
    return this._stmts.getQuests.all(worldId).map((r) => ({ ...r }));
  }

  /**
   * Get the first active quest for a world.
   *
   * @param {string} worldId
   * @returns {object|undefined}
   */
  getActiveQuest(worldId) {
    const row = this._stmts.getActiveQuest.get(worldId);
    return row ? { ...row } : undefined;
  }

  /**
   * Set a quest's status to 'active'.
   *
   * @param {string} id  Quest ID.
   * @returns {object|undefined}
   */
  activateQuest(id) {
    this._stmts.activateQuest.run(id);
    return { ...this._stmts.getQuest.get(id) };
  }

  /**
   * Complete a quest, record the timestamp, and auto-activate the next
   * locked quest in the same chain. Returns the reward XP.
   *
   * @param {string} id  Quest ID.
   * @returns {number}  The reward_xp value of the completed quest.
   */
  completeQuest(id) {
    return this.db.transaction(() => {
      const quest = this._stmts.getQuest.get(id);
      if (!quest) return 0;

      this._stmts.completeQuest.run(id);

      // Auto-activate next quest in the chain
      const next = this._stmts.getNextLockedQuest.get(quest.world_id, quest.chain_id);
      if (next) {
        this._stmts.activateQuest.run(next.id);
      }

      return quest.reward_xp;
    })();
  }

  /**
   * Check if an active quest matches the given trigger. If so, complete it
   * and grant XP to the world.
   *
   * @param {string} worldId
   * @param {string} triggerType  e.g. 'zone_enter', 'api_connect', etc.
   * @param {string} triggerValue  e.g. 'brain_library', 'any', '3'.
   * @returns {{quest: object, xpResult: {xp: number, level: number, leveledUp: boolean}}|null}
   */
  checkQuestTrigger(worldId, triggerType, triggerValue) {
    return this.db.transaction(() => {
      const quest = this._stmts.findMatchingQuest.get(worldId, triggerType, triggerValue);
      if (!quest) return null;

      const rewardXP = this.completeQuest(quest.id);
      const xpResult = this.addXP(worldId, rewardXP);

      return { quest: { ...this._stmts.getQuest.get(quest.id) }, xpResult };
    })();
  }

  // =======================================================================
  // SNAPSHOTS
  // =======================================================================

  /**
   * Serialize the current state of a world (world row, zones, agents) into a
   * gzipped JSON blob and store it as a snapshot.
   *
   * @param {string} worldId
   * @param {string} [label]  Optional human-readable label.
   * @returns {object}  The snapshot metadata (id, label, created_at, size_bytes).
   */
  createSnapshot(worldId, label) {
    return this.db.transaction(() => {
      const world = this.db.prepare('SELECT * FROM worlds WHERE id = ?').get(worldId);
      const zones = this.db.prepare('SELECT * FROM zones WHERE world_id = ?').all(worldId);
      const agents = this.db.prepare('SELECT * FROM agents WHERE world_id = ?').all(worldId);
      const quests = this.db.prepare('SELECT * FROM quests WHERE world_id = ?').all(worldId);
      const relationships = this.db.prepare(`
        SELECT r.* FROM relationships r
        JOIN agents a ON r.agent_a = a.id
        WHERE a.world_id = ?
      `).all(worldId);

      const payload = JSON.stringify({ world, zones, agents, quests, relationships });
      const compressed = zlib.gzipSync(Buffer.from(payload, 'utf-8'));

      // Find the latest snapshot for this world to use as parent
      const latest = this.db
        .prepare('SELECT id FROM snapshots WHERE world_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(worldId);

      const info = this._stmts.insertSnapshot.run({
        world_id: worldId,
        parent_id: latest ? latest.id : null,
        label: label || null,
        data_json: compressed,
        size_bytes: compressed.length,
      });

      const { id } = this._stmts.getSnapshotIdFromRowid.get(info.lastInsertRowid);
      const row = this._stmts.listSnapshots.all(worldId).find((s) => s.id === id);
      return { ...row };
    })();
  }

  /**
   * List all snapshots for a world (metadata only, no data blob).
   *
   * @param {string} worldId
   * @returns {Array<{id: string, world_id: string, parent_id: string|null, label: string|null, created_at: string, size_bytes: number}>}
   */
  listSnapshots(worldId) {
    return this._stmts.listSnapshots.all(worldId).map((r) => ({ ...r }));
  }

  /**
   * Restore a world from a snapshot. Deletes existing zones, agents, quests,
   * and relationships for that world, then re-inserts from the snapshot data.
   *
   * @param {string} snapshotId
   * @returns {object}  The restored world row.
   */
  restoreSnapshot(snapshotId) {
    return this.db.transaction(() => {
      const snap = this._stmts.getSnapshot.get(snapshotId);
      if (!snap) throw new Error(`Snapshot ${snapshotId} not found`);

      const decompressed = zlib.gunzipSync(snap.data_json).toString('utf-8');
      const data = JSON.parse(decompressed);
      const worldId = data.world.id;

      // Clear existing data for this world (order matters for FK constraints)
      this.db.prepare('DELETE FROM relationships WHERE agent_a IN (SELECT id FROM agents WHERE world_id = ?)').run(worldId);
      this.db.prepare('DELETE FROM agents WHERE world_id = ?').run(worldId);
      this.db.prepare('DELETE FROM quests WHERE world_id = ?').run(worldId);
      this.db.prepare('DELETE FROM zones WHERE world_id = ?').run(worldId);

      // Restore world row
      const worldCols = Object.keys(data.world);
      const worldPlaceholders = worldCols.map((c) => `@${c}`).join(', ');
      this.db.prepare(`
        UPDATE worlds SET ${worldCols.filter((c) => c !== 'id').map((c) => `${c} = @${c}`).join(', ')}
        WHERE id = @id
      `).run(data.world);

      // Restore zones
      if (data.zones && data.zones.length > 0) {
        const zoneCols = Object.keys(data.zones[0]);
        const zoneInsert = this.db.prepare(`
          INSERT INTO zones (${zoneCols.join(', ')}) VALUES (${zoneCols.map((c) => `@${c}`).join(', ')})
        `);
        for (const zone of data.zones) {
          zoneInsert.run(zone);
        }
      }

      // Restore agents
      if (data.agents && data.agents.length > 0) {
        const agentCols = Object.keys(data.agents[0]);
        const agentInsert = this.db.prepare(`
          INSERT INTO agents (${agentCols.join(', ')}) VALUES (${agentCols.map((c) => `@${c}`).join(', ')})
        `);
        for (const agent of data.agents) {
          agentInsert.run(agent);
        }
      }

      // Restore quests
      if (data.quests && data.quests.length > 0) {
        const questCols = Object.keys(data.quests[0]);
        const questInsert = this.db.prepare(`
          INSERT INTO quests (${questCols.join(', ')}) VALUES (${questCols.map((c) => `@${c}`).join(', ')})
        `);
        for (const quest of data.quests) {
          questInsert.run(quest);
        }
      }

      // Restore relationships
      if (data.relationships && data.relationships.length > 0) {
        const relCols = Object.keys(data.relationships[0]);
        const relInsert = this.db.prepare(`
          INSERT INTO relationships (${relCols.join(', ')}) VALUES (${relCols.map((c) => `@${c}`).join(', ')})
        `);
        for (const rel of data.relationships) {
          relInsert.run(rel);
        }
      }

      return this.getWorld(worldId);
    })();
  }

  // =======================================================================
  // EVENTS
  // =======================================================================

  /**
   * Emit a world event (for the event log / activity feed).
   *
   * @param {string} worldId
   * @param {string} type  Event type string (e.g. 'task_created', 'zone_unlocked').
   * @param {string|null} [sourceId]  ID of the source entity (agent, zone, etc.).
   * @param {string|null} [targetId]  ID of the target entity.
   * @param {object} [data={}]  Arbitrary JSON payload.
   * @returns {number}  The event row ID.
   */
  emitEvent(worldId, type, sourceId = null, targetId = null, data = {}) {
    const info = this._stmts.insertEvent.run({
      world_id: worldId,
      event_type: type,
      source_id: sourceId,
      target_id: targetId,
      data_json: JSON.stringify(data),
    });
    return info.lastInsertRowid;
  }

  /**
   * Get the most recent events for a world.
   *
   * @param {string} worldId
   * @param {number} [limit=50]
   * @returns {object[]}
   */
  getRecentEvents(worldId, limit = 50) {
    return this._stmts.getRecentEvents.all(worldId, limit).map((r) => {
      const row = { ...r };
      if (row.data_json) {
        try {
          row.data = JSON.parse(row.data_json);
        } catch {
          row.data = {};
        }
      }
      return row;
    });
  }

  // =======================================================================
  // LIFECYCLE
  // =======================================================================

  /**
   * Close the database connection. Safe to call multiple times.
   */
  close() {
    if (this.db && this.db.open) {
      this.db.close();
    }
  }
}

module.exports = { Database, levelForXP };
