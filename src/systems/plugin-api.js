/**
 * plugin-api.js — Plugin/extension system for Claude World
 *
 * Lets users and the community add new zones via JS plugin files.
 * Plugins live in ~/.claude-world/plugins/<plugin-id>/ and export
 * a zone class following the standard pattern:
 *   { name, id, icon, color, description, Zone: class with render() + init() }
 *
 * @module PluginManager
 */

// ── Constants ────────────────────────────────────────────────────

const PLUGINS_DIR_NAME = '.claude-world/plugins';

/** Required fields in a plugin manifest (manifest.json). */
const MANIFEST_REQUIRED = ['id', 'name', 'version', 'author', 'description', 'entryPoint'];

/** Allowed permission strings a plugin may request. */
const VALID_PERMISSIONS = [
  'db:read',
  'db:write',
  'ai:dispatch',
  'notify',
  'events',
  'fs:read',
];

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Resolve the plugins root directory.
 * In Electron we can use process.env.HOME; in browser context we fall back
 * to a configurable base.
 * @returns {string}
 */
function getPluginsDir() {
  if (typeof window !== 'undefined' && window.__pluginsDir) {
    return window.__pluginsDir;
  }
  // Electron renderer with nodeIntegration or preload bridge
  try {
    const { app } = require('electron').remote || {};
    if (app) return require('path').join(app.getPath('home'), PLUGINS_DIR_NAME);
  } catch (_) { /* not in electron context */ }

  // Fallback: use env
  const home = typeof process !== 'undefined' && process.env
    ? (process.env.HOME || process.env.USERPROFILE || '')
    : '';
  return home ? `${home}/${PLUGINS_DIR_NAME}` : PLUGINS_DIR_NAME;
}

/**
 * Validate a manifest object. Returns an array of error strings (empty = valid).
 * @param {object} manifest
 * @returns {string[]}
 */
function validateManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object') {
    return ['Manifest is not a valid object.'];
  }
  for (const field of MANIFEST_REQUIRED) {
    if (!manifest[field]) {
      errors.push(`Missing required field: "${field}".`);
    }
  }
  if (manifest.id && !/^[a-z0-9-]+$/.test(manifest.id)) {
    errors.push('Plugin id must be lowercase alphanumeric with dashes only.');
  }
  if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push('Version must follow semver (e.g. 1.0.0).');
  }
  if (manifest.permissions) {
    if (!Array.isArray(manifest.permissions)) {
      errors.push('Permissions must be an array.');
    } else {
      for (const perm of manifest.permissions) {
        if (!VALID_PERMISSIONS.includes(perm)) {
          errors.push(`Unknown permission: "${perm}".`);
        }
      }
    }
  }
  return errors;
}

/**
 * Validate that a plugin module exports the expected shape.
 * @param {object} mod — The imported module
 * @returns {string[]}
 */
function validateExports(mod) {
  const errors = [];
  if (!mod) return ['Module is null or undefined.'];

  if (typeof mod.Zone !== 'function') {
    errors.push('Module must export a Zone class (constructor function).');
  } else {
    // Check prototype for render/init
    const proto = mod.Zone.prototype;
    if (typeof proto.render !== 'function') {
      errors.push('Zone class must have a render() method.');
    }
    if (typeof proto.init !== 'function') {
      errors.push('Zone class must have an init() method.');
    }
  }
  if (!mod.name || typeof mod.name !== 'string') {
    errors.push('Module must export a "name" string.');
  }
  if (!mod.id || typeof mod.id !== 'string') {
    errors.push('Module must export an "id" string.');
  }
  return errors;
}

// ── Sandboxed API Factory ────────────────────────────────────────

/**
 * Build the sandboxed API surface that a plugin receives.
 * Each plugin gets its own instance, scoped to its id.
 *
 * @param {string} pluginId
 * @param {string[]} permissions — from manifest
 * @param {EventBus} eventBus
 * @returns {object}
 */
function buildPluginAPI(pluginId, permissions = [], eventBus) {
  const api = {};

  // ── db access ────────────────────────────────────────────────
  if (permissions.includes('db:read') || permissions.includes('db:write')) {
    api.db = {};

    // Read operations — always available if db:read
    if (permissions.includes('db:read')) {
      api.db.getTasks = async (worldId) => {
        if (window.api && window.api.db) {
          return window.api.db.getTasks(worldId);
        }
        return [];
      };

      api.db.getAgents = async (worldId) => {
        if (window.api && window.api.db) {
          return window.api.db.getAgents(worldId);
        }
        return [];
      };

      api.db.getWorld = async (worldId) => {
        if (window.api && window.api.db) {
          return window.api.db.getWorld(worldId);
        }
        return null;
      };

      api.db.query = async (sql, params) => {
        // Only allow SELECT for read-only
        if (!permissions.includes('db:write')) {
          const trimmed = sql.trim().toUpperCase();
          if (!trimmed.startsWith('SELECT')) {
            throw new Error(`Plugin "${pluginId}" only has db:read — write queries are blocked.`);
          }
        }
        if (window.api && window.api.db && window.api.db.query) {
          return window.api.db.query(sql, params);
        }
        return [];
      };
    }

    // Write operations
    if (permissions.includes('db:write')) {
      api.db.createTask = async (task) => {
        if (window.api && window.api.db && window.api.db.createTask) {
          return window.api.db.createTask(task);
        }
        return null;
      };

      api.db.updateTask = async (taskId, updates) => {
        if (window.api && window.api.db && window.api.db.updateTask) {
          return window.api.db.updateTask(taskId, updates);
        }
        return null;
      };
    }
  }

  // ── ai dispatch ──────────────────────────────────────────────
  if (permissions.includes('ai:dispatch')) {
    api.ai = {
      dispatch: async (prompt, opts = {}) => {
        // Tag the request so we can trace it back to the plugin
        const taggedOpts = { ...opts, _pluginId: pluginId };
        if (window.api && window.api.ai && window.api.ai.dispatch) {
          return window.api.ai.dispatch(prompt, taggedOpts);
        }
        throw new Error('AI dispatch is not available.');
      },
    };
  }

  // ── notifications ────────────────────────────────────────────
  if (permissions.includes('notify')) {
    api.notify = (message, type = 'info') => {
      document.dispatchEvent(new CustomEvent('toast:show', {
        detail: { message: `[${pluginId}] ${message}`, type },
        bubbles: true,
      }));
    };
  }

  // ── event bus ────────────────────────────────────────────────
  if (permissions.includes('events')) {
    api.events = {
      on: (event, handler) => eventBus.on(`plugin:${pluginId}:${event}`, handler),
      off: (event, handler) => eventBus.off(`plugin:${pluginId}:${event}`, handler),
      emit: (event, data) => eventBus.emit(`plugin:${pluginId}:${event}`, data),
      // Listen to global world events
      onGlobal: (event, handler) => eventBus.on(event, handler),
    };
  }

  return api;
}

// ── EventBus ─────────────────────────────────────────────────────

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }

  /**
   * @param {string} event
   * @param {Function} handler
   */
  on(event, handler) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set());
    }
    this._listeners.get(event).add(handler);
  }

  /**
   * @param {string} event
   * @param {Function} handler
   */
  off(event, handler) {
    const set = this._listeners.get(event);
    if (set) set.delete(handler);
  }

  /**
   * @param {string} event
   * @param {*} data
   */
  emit(event, data) {
    const set = this._listeners.get(event);
    if (set) {
      for (const handler of set) {
        try {
          handler(data);
        } catch (err) {
          console.error(`[PluginManager] Event handler error for "${event}":`, err);
        }
      }
    }
  }

  /** Remove all listeners for a given prefix (used during unload). */
  removeAllWithPrefix(prefix) {
    for (const key of this._listeners.keys()) {
      if (key.startsWith(prefix)) {
        this._listeners.delete(key);
      }
    }
  }
}

// ── PluginManager ────────────────────────────────────────────────

/**
 * @typedef {object} PluginEntry
 * @property {object} manifest
 * @property {object} mod — The imported module
 * @property {object} api — The sandboxed API instance
 * @property {boolean} enabled
 * @property {object|null} zoneInstance — Instantiated Zone, if any
 */

export class PluginManager {
  constructor() {
    /** @type {Map<string, PluginEntry>} */
    this._plugins = new Map();

    /** @type {EventBus} */
    this._events = new EventBus();

    /** @type {string} */
    this._pluginsDir = getPluginsDir();

    /** @type {boolean} */
    this._initialized = false;
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * Scan the plugins directory and load all valid plugins.
   * @returns {Promise<{loaded: string[], errors: Array<{id: string, error: string}>}>}
   */
  async loadAll() {
    const results = { loaded: [], errors: [] };

    // In Electron we can use Node fs; in browser we rely on a preload bridge.
    const pluginDirs = await this._listPluginDirs();

    for (const dir of pluginDirs) {
      try {
        await this.load(dir);
        const dirName = dir.split('/').pop();
        results.loaded.push(dirName);
      } catch (err) {
        results.errors.push({ id: dir.split('/').pop(), error: err.message });
        console.warn(`[PluginManager] Failed to load plugin from ${dir}:`, err.message);
      }
    }

    this._initialized = true;
    this._events.emit('plugins:loaded-all', results);
    return results;
  }

  /**
   * Load a single plugin from a directory path.
   * The directory must contain a manifest.json and the entry point JS file.
   *
   * @param {string} pluginPath — Absolute path to the plugin directory
   * @returns {Promise<PluginEntry>}
   */
  async load(pluginPath) {
    // 1. Read & validate manifest
    const manifest = await this._readManifest(pluginPath);
    const manifestErrors = validateManifest(manifest);
    if (manifestErrors.length > 0) {
      throw new Error(`Invalid manifest: ${manifestErrors.join(' ')}`);
    }

    // 2. Check for duplicate
    if (this._plugins.has(manifest.id)) {
      throw new Error(`Plugin "${manifest.id}" is already loaded.`);
    }

    // 3. Import the entry point module
    const entryPath = `${pluginPath}/${manifest.entryPoint}`;
    let mod;
    try {
      mod = await import(/* webpackIgnore: true */ entryPath);
    } catch (err) {
      throw new Error(`Failed to import entry point "${entryPath}": ${err.message}`);
    }

    // 4. Validate exports
    const exportErrors = validateExports(mod);
    if (exportErrors.length > 0) {
      throw new Error(`Invalid plugin exports: ${exportErrors.join(' ')}`);
    }

    // 5. Build sandboxed API
    const permissions = manifest.permissions || [];
    const api = buildPluginAPI(manifest.id, permissions, this._events);

    // 6. Register
    const entry = {
      manifest,
      mod,
      api,
      enabled: true,
      zoneInstance: null,
      path: pluginPath,
    };
    this._plugins.set(manifest.id, entry);

    // 7. Call onLoad lifecycle hook if present
    if (typeof mod.onLoad === 'function') {
      try {
        await mod.onLoad(api);
      } catch (err) {
        console.warn(`[PluginManager] onLoad error for "${manifest.id}":`, err);
      }
    }

    // 8. Dispatch event
    this._events.emit('plugin:loaded', { id: manifest.id, manifest });
    document.dispatchEvent(new CustomEvent('plugin:loaded', {
      detail: { id: manifest.id, manifest },
      bubbles: true,
    }));

    console.log(`[PluginManager] Loaded plugin: ${manifest.name} v${manifest.version}`);
    return entry;
  }

  /**
   * Unload a plugin by id.
   * @param {string} id
   */
  async unload(id) {
    const entry = this._plugins.get(id);
    if (!entry) {
      throw new Error(`Plugin "${id}" is not loaded.`);
    }

    // Call onUnload lifecycle hook
    if (typeof entry.mod.onUnload === 'function') {
      try {
        await entry.mod.onUnload(entry.api);
      } catch (err) {
        console.warn(`[PluginManager] onUnload error for "${id}":`, err);
      }
    }

    // Destroy zone instance if it has a destroy method
    if (entry.zoneInstance && typeof entry.zoneInstance.destroy === 'function') {
      try {
        entry.zoneInstance.destroy();
      } catch (_) { /* swallow */ }
    }

    // Clean up event listeners
    this._events.removeAllWithPrefix(`plugin:${id}:`);

    // Remove from registry
    this._plugins.delete(id);

    // Dispatch event
    this._events.emit('plugin:unloaded', { id });
    document.dispatchEvent(new CustomEvent('plugin:unloaded', {
      detail: { id },
      bubbles: true,
    }));

    console.log(`[PluginManager] Unloaded plugin: ${id}`);
  }

  /**
   * Enable or disable a plugin (without fully unloading it).
   * @param {string} id
   * @param {boolean} enabled
   */
  setEnabled(id, enabled) {
    const entry = this._plugins.get(id);
    if (!entry) throw new Error(`Plugin "${id}" is not loaded.`);
    entry.enabled = !!enabled;
    this._events.emit('plugin:toggled', { id, enabled: entry.enabled });
    document.dispatchEvent(new CustomEvent('plugin:toggled', {
      detail: { id, enabled: entry.enabled },
      bubbles: true,
    }));
  }

  /**
   * List all loaded plugins.
   * @returns {Array<{id: string, manifest: object, enabled: boolean}>}
   */
  list() {
    const result = [];
    for (const [id, entry] of this._plugins) {
      result.push({
        id,
        manifest: { ...entry.manifest },
        enabled: entry.enabled,
        path: entry.path,
      });
    }
    return result;
  }

  /**
   * Get a zone class instance for a plugin zone.
   * Instantiates on first call; caches afterward.
   *
   * @param {string} id — plugin id
   * @returns {object|null} — Zone instance with render() and init()
   */
  getZone(id) {
    const entry = this._plugins.get(id);
    if (!entry || !entry.enabled) return null;

    if (!entry.zoneInstance) {
      try {
        entry.zoneInstance = new entry.mod.Zone(entry.api);
      } catch (err) {
        console.error(`[PluginManager] Failed to instantiate zone for "${id}":`, err);
        return null;
      }
    }
    return entry.zoneInstance;
  }

  /**
   * Get the manifest for a specific plugin.
   * @param {string} id
   * @returns {object|null}
   */
  getManifest(id) {
    const entry = this._plugins.get(id);
    return entry ? { ...entry.manifest } : null;
  }

  /**
   * Check if a plugin is loaded.
   * @param {string} id
   * @returns {boolean}
   */
  has(id) {
    return this._plugins.has(id);
  }

  /**
   * Notify all loaded plugins of a world change.
   * @param {string} worldId
   */
  async notifyWorldChange(worldId) {
    for (const [id, entry] of this._plugins) {
      if (!entry.enabled) continue;
      if (typeof entry.mod.onWorldChange === 'function') {
        try {
          await entry.mod.onWorldChange(worldId, entry.api);
        } catch (err) {
          console.warn(`[PluginManager] onWorldChange error for "${id}":`, err);
        }
      }
    }
  }

  /**
   * Get the event bus (for internal/testing use).
   * @returns {EventBus}
   */
  get events() {
    return this._events;
  }

  /**
   * Get the plugins directory path.
   * @returns {string}
   */
  get pluginsDir() {
    return this._pluginsDir;
  }

  // ── Internal ─────────────────────────────────────────────────

  /**
   * List all sub-directories inside the plugins dir.
   * @returns {Promise<string[]>}
   */
  async _listPluginDirs() {
    // Try Node fs (Electron)
    try {
      if (window.api && window.api.fs && window.api.fs.readdir) {
        const entries = await window.api.fs.readdir(this._pluginsDir);
        return entries
          .filter((e) => e.isDirectory)
          .map((e) => `${this._pluginsDir}/${e.name}`);
      }
    } catch (_) { /* not available */ }

    // Try require('fs')
    try {
      const fs = require('fs');
      const path = require('path');
      if (!fs.existsSync(this._pluginsDir)) {
        fs.mkdirSync(this._pluginsDir, { recursive: true });
        return [];
      }
      const entries = fs.readdirSync(this._pluginsDir, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory())
        .map((e) => path.join(this._pluginsDir, e.name));
    } catch (_) { /* not available */ }

    console.warn('[PluginManager] Cannot list plugin directories — no fs access.');
    return [];
  }

  /**
   * Read and parse manifest.json from a plugin directory.
   * @param {string} pluginPath
   * @returns {Promise<object>}
   */
  async _readManifest(pluginPath) {
    const manifestPath = `${pluginPath}/manifest.json`;

    // Try preload bridge
    try {
      if (window.api && window.api.fs && window.api.fs.readFile) {
        const raw = await window.api.fs.readFile(manifestPath, 'utf-8');
        return JSON.parse(raw);
      }
    } catch (_) { /* not available */ }

    // Try Node fs
    try {
      const fs = require('fs');
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(`Cannot read manifest at "${manifestPath}": ${err.message}`);
    }
  }
}

// ── Singleton ────────────────────────────────────────────────────

/** @type {PluginManager|null} */
let _instance = null;

/**
 * Get the shared PluginManager singleton.
 * @returns {PluginManager}
 */
export function getPluginManager() {
  if (!_instance) {
    _instance = new PluginManager();
  }
  return _instance;
}

// ── Plugin template generator ────────────────────────────────────

/**
 * Generate a plugin scaffold (manifest + entry file contents).
 * Used by the Plugin Store "Create" tab.
 *
 * @param {object} opts
 * @param {string} opts.id
 * @param {string} opts.name
 * @param {string} opts.author
 * @param {string} opts.description
 * @param {string} [opts.icon]
 * @param {string} [opts.color]
 * @returns {{ manifest: string, entryPoint: string }}
 */
export function generatePluginTemplate(opts = {}) {
  const id = opts.id || 'my-plugin';
  const name = opts.name || 'My Plugin';
  const author = opts.author || 'Anonymous';
  const description = opts.description || 'A custom Claude World zone.';
  const icon = opts.icon || '\u{1F9E9}';
  const color = opts.color || '#a855f7';

  const manifest = JSON.stringify({
    id,
    name,
    version: '1.0.0',
    author,
    description,
    icon,
    color,
    entryPoint: 'index.js',
    permissions: ['db:read', 'notify', 'events'],
  }, null, 2);

  const entryPoint = `/**
 * ${name} — Claude World Plugin
 * ${description}
 */

export const id = '${id}';
export const name = '${name}';
export const icon = '${icon}';
export const color = '${color}';
export const description = '${description}';

/**
 * Zone class — rendered inside the Claude World side panel.
 * Receives the sandboxed plugin API in its constructor.
 */
export class Zone {
  constructor(api) {
    this.api = api;
    this.el = null;
  }

  /**
   * Build and return the root HTMLElement for this zone.
   * @returns {HTMLElement}
   */
  render() {
    this.el = document.createElement('div');
    this.el.className = 'plugin-zone plugin-zone--${id}';
    this.el.innerHTML = \`
      <div class="plugin-zone__header">
        <span class="plugin-zone__icon">${icon}</span>
        <h2 class="plugin-zone__title">${name}</h2>
      </div>
      <div class="plugin-zone__content">
        <p>Welcome to ${name}!</p>
        <p>Edit this zone in <code>~/.claude-world/plugins/${id}/index.js</code></p>
      </div>
    \`;
    return this.el;
  }

  /**
   * Initialize with world data. Called after render().
   * @param {number} worldId
   */
  async init(worldId) {
    // Load data, set up listeners, etc.
    console.log('${name} initialized for world', worldId);
  }

  /**
   * Clean up when zone is closed (optional).
   */
  destroy() {
    this.el = null;
  }
}

/** Called when the plugin is first loaded. */
export async function onLoad(api) {
  console.log('${name} plugin loaded');
}

/** Called when the plugin is unloaded. */
export async function onUnload(api) {
  console.log('${name} plugin unloaded');
}

/** Called when the user switches worlds. */
export async function onWorldChange(worldId, api) {
  console.log('${name}: world changed to', worldId);
}
`;

  return { manifest, entryPoint };
}
