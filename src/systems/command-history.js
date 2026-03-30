/**
 * command-history.js — Command history + undo/redo system for Claude World
 *
 * Records every user action as a structured command object. Reversible actions
 * can be undone with Cmd+Z and redone with Cmd+Shift+Z. History is persisted
 * to localStorage (last 100 entries).
 *
 * Usage:
 *   import { CommandHistory, getCommandHistory } from '../systems/command-history.js';
 *   const history = getCommandHistory();
 *   history.record({ type: 'zone-open', data: { zoneId: 'dispatch' } });
 */

// ── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "claude-world:command-history";
const MAX_HISTORY = 100;
const MAX_UNDO_STACK = 50;

/** Action types that can be undone */
const REVERSIBLE_TYPES = new Set([
  "setting-change",
  "theme-change",
  "zone-close",
  "tab-close",
  "panel-open",
  "zone-open",
]);

/** Action types recorded but never undoable */
const NON_REVERSIBLE_TYPES = new Set([
  "task-dispatch",
  "snapshot-create",
  "data-delete",
  "achievement-unlock",
  "zone-unlock",
]);

/** Human-readable labels for each action type */
const ACTION_LABELS = {
  "zone-open": "Opened zone",
  "zone-close": "Closed zone",
  "task-dispatch": "Dispatched task",
  "setting-change": "Changed setting",
  "theme-change": "Changed theme",
  "zone-unlock": "Unlocked zone",
  "snapshot-create": "Created snapshot",
  "achievement-unlock": "Unlocked achievement",
  "tab-switch": "Switched tab",
  "tab-close": "Closed tab",
  "panel-open": "Opened panel",
  "panel-close": "Closed panel",
  search: "Searched",
  "command-palette": "Used command palette",
  "focus-toggle": "Toggled focus mode",
  "audio-toggle": "Toggled audio",
};

/** Icons per action type (emoji shorthand) */
const ACTION_ICONS = {
  "zone-open": "🏠",
  "zone-close": "🚪",
  "task-dispatch": "🚀",
  "setting-change": "⚙️",
  "theme-change": "🎨",
  "zone-unlock": "🔓",
  "snapshot-create": "📸",
  "achievement-unlock": "🏆",
  "tab-switch": "📑",
  "tab-close": "✖️",
  "panel-open": "📋",
  "panel-close": "📋",
  search: "🔍",
  "command-palette": "⌘",
  "focus-toggle": "🎯",
  "audio-toggle": "🔊",
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Emit a custom event on `document`.
 * @param {string} name
 * @param {Object} detail
 */
function emit(name, detail = {}) {
  document.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * Get a readable description for a command.
 * @param {Object} cmd
 * @returns {string}
 */
function describeCommand(cmd) {
  const base = ACTION_LABELS[cmd.type] || cmd.type;
  const d = cmd.data || {};

  switch (cmd.type) {
    case "zone-open":
    case "zone-close":
      return `${base}: ${d.zoneName || d.zoneId || ""}`;
    case "theme-change":
      return `${base}: ${d.from || "?"} → ${d.to || "?"}`;
    case "setting-change":
      return `${base}: ${d.key || "?"} → ${d.value ?? "?"}`;
    case "task-dispatch":
      return `${base}: ${d.title || d.taskId || ""}`;
    case "achievement-unlock":
      return `${base}: ${d.name || d.id || ""}`;
    case "tab-switch":
    case "tab-close":
      return `${base}: ${d.tabName || d.tabId || ""}`;
    case "panel-open":
    case "panel-close":
      return `${base}: ${d.panelName || d.panelId || ""}`;
    default:
      return base;
  }
}

/**
 * Get the icon for a command type.
 * @param {string} type
 * @returns {string}
 */
function iconForType(type) {
  return ACTION_ICONS[type] || "▸";
}

// ── CommandHistory class ─────────────────────────────────────────────────────

export class CommandHistory {
  constructor() {
    /** @type {Array<Object>} Full chronological history */
    this._history = [];

    /** @type {Array<Object>} Undo stack (most recent at end) */
    this._undoStack = [];

    /** @type {Array<Object>} Redo stack (most recent at end) */
    this._redoStack = [];

    /** @type {Function|null} Keyboard handler ref for cleanup */
    this._keyHandler = null;

    this._load();
    this._bindKeyboard();
    this._bindEventListeners();
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Record a user action.
   * @param {Object} command
   * @param {string} command.type — Action type identifier
   * @param {Object} [command.data] — Action-specific payload
   * @param {Function} [command.undoFn] — Custom undo function (makes it reversible)
   * @param {Function} [command.redoFn] — Custom redo function
   */
  record(command) {
    const entry = {
      id:
        crypto.randomUUID?.() ||
        `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: command.type,
      data: command.data || {},
      timestamp: Date.now(),
      reversible: !!(command.undoFn || REVERSIBLE_TYPES.has(command.type)),
      description: describeCommand(command),
      icon: iconForType(command.type),
    };

    // Store undo/redo fns on the entry (not serialized)
    if (command.undoFn) entry._undoFn = command.undoFn;
    if (command.redoFn) entry._redoFn = command.redoFn;

    this._history.push(entry);

    // Trim history
    if (this._history.length > MAX_HISTORY) {
      this._history = this._history.slice(-MAX_HISTORY);
    }

    // Push to undo stack if reversible
    if (entry.reversible) {
      this._undoStack.push(entry);
      if (this._undoStack.length > MAX_UNDO_STACK) {
        this._undoStack.shift();
      }
      // Clear redo stack on new action
      this._redoStack = [];
    }

    this._save();
    emit("command:executed", { command: entry });
  }

  /**
   * Undo the last reversible action.
   * @returns {Object|null} The undone command, or null
   */
  undo() {
    if (!this.canUndo()) return null;

    const entry = this._undoStack.pop();

    if (entry._undoFn) {
      try {
        entry._undoFn();
      } catch (err) {
        console.warn("[CommandHistory] undo failed:", err);
      }
    } else {
      this._performDefaultUndo(entry);
    }

    this._redoStack.push(entry);
    this._save();
    emit("command:undone", { command: entry });
    emit("toast:show", {
      type: "info",
      title: "Undone",
      body: entry.description,
      duration: 2000,
    });

    return entry;
  }

  /**
   * Redo the last undone action.
   * @returns {Object|null} The redone command, or null
   */
  redo() {
    if (!this.canRedo()) return null;

    const entry = this._redoStack.pop();

    if (entry._redoFn) {
      try {
        entry._redoFn();
      } catch (err) {
        console.warn("[CommandHistory] redo failed:", err);
      }
    } else {
      this._performDefaultRedo(entry);
    }

    this._undoStack.push(entry);
    this._save();
    emit("command:redone", { command: entry });
    emit("toast:show", {
      type: "info",
      title: "Redone",
      body: entry.description,
      duration: 2000,
    });

    return entry;
  }

  /** @returns {boolean} */
  canUndo() {
    return this._undoStack.length > 0;
  }

  /** @returns {boolean} */
  canRedo() {
    return this._redoStack.length > 0;
  }

  /**
   * Get recent history entries.
   * @param {number} [limit=50]
   * @returns {Array<Object>}
   */
  getHistory(limit = 50) {
    return this._history.slice(-limit).reverse();
  }

  /**
   * Get all known action types.
   * @returns {string[]}
   */
  getActionTypes() {
    const types = new Set(this._history.map((e) => e.type));
    return [...types].sort();
  }

  /**
   * Clear all history.
   */
  clearHistory() {
    this._history = [];
    this._undoStack = [];
    this._redoStack = [];
    this._save();
    emit("command:history-cleared");
  }

  /**
   * Destroy the instance — remove listeners.
   */
  destroy() {
    if (this._keyHandler) {
      document.removeEventListener("keydown", this._keyHandler);
      this._keyHandler = null;
    }
    this._removeEventListeners();
    _singleton = null;
  }

  // ── Private: persistence ─────────────────────────────────────────

  _save() {
    try {
      // Serialize only serializable fields
      const serializable = this._history.map((e) => ({
        id: e.id,
        type: e.type,
        data: e.data,
        timestamp: e.timestamp,
        reversible: e.reversible,
        description: e.description,
        icon: e.icon,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
    } catch {
      // Storage full or unavailable — silently skip
    }
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this._history = JSON.parse(raw);
        // Loaded entries lose their undo/redo fns, so don't push to undo stack
      }
    } catch {
      this._history = [];
    }
  }

  // ── Private: keyboard ────────────────────────────────────────────

  _bindKeyboard() {
    this._keyHandler = (e) => {
      // Don't capture when typing in inputs
      const tag = e.target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || e.target?.isContentEditable)
        return;

      const isMeta = e.metaKey || e.ctrlKey;

      // Cmd+Z — undo
      if (isMeta && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        this.undo();
        return;
      }

      // Cmd+Shift+Z — redo
      if (isMeta && e.shiftKey && e.key === "z") {
        e.preventDefault();
        this.redo();
        return;
      }

      // Cmd+Shift+H — open history panel
      if (isMeta && e.shiftKey && e.key.toLowerCase() === "h") {
        e.preventDefault();
        emit("command-history:toggle-panel");
        return;
      }
    };

    document.addEventListener("keydown", this._keyHandler);
  }

  // ── Private: auto-record from system events ──────────────────────

  _bindEventListeners() {
    this._listeners = [];

    const listen = (event, handler) => {
      const fn = (e) => handler(e.detail || {});
      document.addEventListener(event, fn);
      this._listeners.push({ event, fn });
    };

    // Zone navigation
    listen("command-palette:navigate", (detail) => {
      this.record({
        type: "zone-open",
        data: { zoneId: detail.zoneId, zoneName: detail.zoneName },
        undoFn: () => emit("shortcut:escape"),
      });
    });

    // Theme changes
    listen("theme:changed", (detail) => {
      const prevTheme = detail.from;
      const newTheme = detail.to;
      this.record({
        type: "theme-change",
        data: { from: prevTheme, to: newTheme },
        undoFn: () => emit("theme:apply", { themeId: prevTheme }),
        redoFn: () => emit("theme:apply", { themeId: newTheme }),
      });
    });

    // Settings
    listen("setting:changed", (detail) => {
      this.record({
        type: "setting-change",
        data: {
          key: detail.key,
          value: detail.value,
          previous: detail.previous,
        },
        undoFn: () =>
          emit("setting:apply", { key: detail.key, value: detail.previous }),
        redoFn: () =>
          emit("setting:apply", { key: detail.key, value: detail.value }),
      });
    });

    // Task dispatch
    listen("task:dispatched", (detail) => {
      this.record({
        type: "task-dispatch",
        data: { taskId: detail.taskId, title: detail.title },
      });
    });

    // Snapshot create
    listen("snapshot:created", (detail) => {
      this.record({
        type: "snapshot-create",
        data: { snapshotId: detail.id },
      });
    });

    // Achievement unlock
    listen("achievement:unlocked", (detail) => {
      this.record({
        type: "achievement-unlock",
        data: { id: detail.id, name: detail.name },
      });
    });

    // Zone unlock
    listen("zone:unlocked", (detail) => {
      this.record({
        type: "zone-unlock",
        data: { zoneId: detail.zoneId, zoneName: detail.zoneName },
      });
    });

    // Tab switch
    listen("tab:switched", (detail) => {
      this.record({
        type: "tab-switch",
        data: { tabId: detail.tabId, tabName: detail.tabName },
      });
    });

    // Panel open/close
    listen("panel:opened", (detail) => {
      this.record({
        type: "panel-open",
        data: { panelId: detail.panelId, panelName: detail.panelName },
      });
    });

    listen("panel:closed", (detail) => {
      this.record({
        type: "panel-close",
        data: { panelId: detail.panelId, panelName: detail.panelName },
      });
    });

    // Focus mode
    listen("focus:toggled", (detail) => {
      this.record({
        type: "focus-toggle",
        data: { active: detail.active },
        undoFn: () => emit("focus:toggle"),
        redoFn: () => emit("focus:toggle"),
      });
    });
  }

  _removeEventListeners() {
    if (this._listeners) {
      for (const { event, fn } of this._listeners) {
        document.removeEventListener(event, fn);
      }
      this._listeners = [];
    }
  }

  // ── Private: default undo/redo for known types ───────────────────

  _performDefaultUndo(entry) {
    switch (entry.type) {
      case "zone-open":
        emit("shortcut:escape");
        break;
      case "zone-close":
        emit("command-palette:navigate", {
          zoneId: entry.data.zoneId,
          zoneName: entry.data.zoneName,
        });
        break;
      case "theme-change":
        emit("theme:apply", { themeId: entry.data.from });
        break;
      case "setting-change":
        emit("setting:apply", {
          key: entry.data.key,
          value: entry.data.previous,
        });
        break;
      case "tab-close":
        emit("tab:reopen", {
          tabId: entry.data.tabId,
          tabName: entry.data.tabName,
        });
        break;
      case "panel-open":
        emit("shortcut:escape");
        break;
      default:
        console.warn(
          `[CommandHistory] No default undo for type: ${entry.type}`,
        );
    }
  }

  _performDefaultRedo(entry) {
    switch (entry.type) {
      case "zone-open":
        emit("command-palette:navigate", {
          zoneId: entry.data.zoneId,
          zoneName: entry.data.zoneName,
        });
        break;
      case "zone-close":
        emit("shortcut:escape");
        break;
      case "theme-change":
        emit("theme:apply", { themeId: entry.data.to });
        break;
      case "setting-change":
        emit("setting:apply", { key: entry.data.key, value: entry.data.value });
        break;
      case "panel-open":
        emit("panel:opened", {
          panelId: entry.data.panelId,
          panelName: entry.data.panelName,
        });
        break;
      default:
        console.warn(
          `[CommandHistory] No default redo for type: ${entry.type}`,
        );
    }
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

/** @type {CommandHistory|null} */
let _singleton = null;

/**
 * Get or create the singleton CommandHistory instance.
 * @returns {CommandHistory}
 */
export function getCommandHistory() {
  if (!_singleton) {
    _singleton = new CommandHistory();
  }
  return _singleton;
}

// Re-export helpers for the panel
export {
  describeCommand,
  iconForType,
  ACTION_LABELS,
  ACTION_ICONS,
  REVERSIBLE_TYPES,
};
