/**
 * shortcuts.js — Global keyboard shortcut manager for Claude World
 *
 * Listens on document for key events and dispatches custom events.
 * Ignores shortcuts when user is typing in input/textarea.
 *
 * Exports SHORTCUTS_REGISTRY so the overlay can read it dynamically.
 */

import { ShortcutsOverlay } from './shortcuts-overlay.js';

// ── Shortcuts registry ──────────────────────────────────────────────────────
// Canonical list of all shortcuts. The overlay reads this to stay in sync.

export const SHORTCUTS_REGISTRY = [
  // Navigation
  { key: 'h', meta: false, label: 'Camera go home', display: 'H', action: 'shortcut:camera-home', category: 'navigation' },
  { key: 'Tab', meta: false, label: 'Cycle zones forward', display: 'Tab', action: 'shortcut:cycle-zones', category: 'navigation' },
  { key: 'Tab', meta: false, shift: true, label: 'Cycle zones backward', display: 'Shift+Tab', action: 'shortcut:cycle-zones', category: 'navigation' },
  { key: ' ', meta: false, label: 'Pause / Resume day cycle', display: 'Space', action: 'shortcut:toggle-day-cycle', category: 'navigation' },
  // Zone quick-jump 1-9
  { key: '1', meta: false, label: 'Jump to Dispatch Tower', display: '1', action: 'shortcut:jump-zone', detail: { index: 0 }, category: 'navigation' },
  { key: '2', meta: false, label: 'Jump to Brain Library', display: '2', action: 'shortcut:jump-zone', detail: { index: 1 }, category: 'navigation' },
  { key: '3', meta: false, label: 'Jump to Chat Rooms', display: '3', action: 'shortcut:jump-zone', detail: { index: 2 }, category: 'navigation' },
  { key: '4', meta: false, label: 'Jump to Memory Vault', display: '4', action: 'shortcut:jump-zone', detail: { index: 3 }, category: 'navigation' },
  { key: '5', meta: false, label: 'Jump to Skills Academy', display: '5', action: 'shortcut:jump-zone', detail: { index: 4 }, category: 'navigation' },
  { key: '6', meta: false, label: 'Jump to Minion Tunnels', display: '6', action: 'shortcut:jump-zone', detail: { index: 5 }, category: 'navigation' },
  { key: '7', meta: false, label: 'Jump to Treasury', display: '7', action: 'shortcut:jump-zone', detail: { index: 6 }, category: 'navigation' },
  { key: '8', meta: false, label: 'Jump to Sales District', display: '8', action: 'shortcut:jump-zone', detail: { index: 7 }, category: 'navigation' },
  { key: '9', meta: false, label: 'Jump to Marketing Plaza', display: '9', action: 'shortcut:jump-zone', detail: { index: 8 }, category: 'navigation' },
  // Zones (Cmd shortcuts)
  { key: 'd', meta: true, label: 'Dispatch Tower', display: '\u2318D', action: 'shortcut:zone-dispatch', category: 'zones' },
  { key: 'b', meta: true, label: 'Brain Library', display: '\u2318B', action: 'shortcut:zone-brain', category: 'zones' },
  { key: 'l', meta: true, label: 'Legal Tower', display: '\u2318L', action: 'shortcut:zone-legal', category: 'zones' },
  { key: 'm', meta: true, label: 'Memory Vault', display: '\u2318M', action: 'shortcut:zone-memory', category: 'zones' },
  { key: 's', meta: true, label: 'Skills Academy', display: '\u2318S', action: 'shortcut:zone-skills', category: 'zones' },
  { key: 'e', meta: true, label: 'The Exchange', display: '\u2318E', action: 'shortcut:zone-exchange', category: 'zones' },
  // UI
  { key: 'k', meta: true, label: 'Command Palette', display: '\u2318K', action: 'shortcut:toggle-palette', category: 'ui' },
  { key: ',', meta: true, label: 'Settings', display: '\u2318,', action: 'shortcut:settings', category: 'ui' },
  { key: 'Escape', meta: false, label: 'Close current panel', display: 'Esc', action: 'shortcut:escape', category: 'ui' },
  { key: '?', meta: false, shift: true, label: 'Shortcuts help', display: '?', action: 'shortcut:show-help', category: 'ui' },
  { key: '/', meta: true, label: 'Shortcuts help', display: '\u2318/', action: 'shortcut:show-help', category: 'ui' },
  // World
  { key: 'n', meta: true, label: 'New task', display: '\u2318N', action: 'shortcut:new-task', category: 'world' },
  { key: 'b', meta: true, shift: true, label: 'Morning Briefing', display: '\u2318\u21E7B', action: 'shortcut:morning-briefing', category: 'world' },
  { key: 't', meta: false, label: 'Theme picker', display: 'T', action: 'shortcut:theme-picker', category: 'world' },
  // Debug
  { key: 'd', meta: true, shift: true, label: 'Open DevTools', display: '\u2318\u21E7D', action: 'shortcut:devtools', category: 'debug' },
  { key: 'r', meta: true, label: 'Reload window', display: '\u2318R', action: 'shortcut:reload', category: 'debug' },
];


export class ShortcutManager {
  /**
   * @param {Object} deps
   * @param {import('./command-palette.js').CommandPalette} deps.palette
   * @param {import('./panels.js').PanelManager} deps.panels
   */
  constructor({ palette, panels } = {}) {
    this._palette = palette;
    this._panels = panels;
    this._overlay = new ShortcutsOverlay();

    this._handleKeyDown = this._handleKeyDown.bind(this);
    document.addEventListener('keydown', this._handleKeyDown);
  }

  /**
   * Check if the event target is an input field.
   * @param {KeyboardEvent} e
   * @returns {boolean}
   */
  _isTyping(e) {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) {
      return true;
    }
    return false;
  }

  /**
   * Main keydown handler.
   * @param {KeyboardEvent} e
   */
  _handleKeyDown(e) {
    const isMac = navigator.platform.includes('Mac');
    const metaKey = isMac ? e.metaKey : e.ctrlKey;

    // ── Meta combos (work even in inputs) ────────────────────

    // Cmd+K / Ctrl+K — command palette
    if (metaKey && e.key === 'k') {
      e.preventDefault();
      this._palette?.toggle();
      return;
    }

    // Cmd+/ — shortcuts overlay
    if (metaKey && e.key === '/') {
      e.preventDefault();
      this._overlay.toggle();
      return;
    }

    // Cmd+, — settings
    if (metaKey && !e.shiftKey && e.key === ',') {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('shortcut:settings', { bubbles: true }));
      return;
    }

    // Cmd+N — new task
    if (metaKey && !e.shiftKey && e.key === 'n') {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('shortcut:new-task', { bubbles: true }));
      return;
    }

    // Cmd+Shift+B — morning briefing
    if (metaKey && e.shiftKey && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('shortcut:morning-briefing', { bubbles: true }));
      return;
    }

    // Cmd+Shift+D — DevTools
    if (metaKey && e.shiftKey && (e.key === 'd' || e.key === 'D')) {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('shortcut:devtools', { bubbles: true }));
      return;
    }

    // Cmd+R — Reload
    if (metaKey && !e.shiftKey && e.key === 'r') {
      // Allow native reload in Electron; just dispatch event as well
      document.dispatchEvent(new CustomEvent('shortcut:reload', { bubbles: true }));
      return;
    }

    // ── Zone shortcuts (Cmd+key) ─────────────────────────────

    if (metaKey && !e.shiftKey) {
      const zoneMap = {
        d: 'dispatch',
        b: 'brain',
        l: 'legal',
        m: 'memory',
        s: 'skills',
        e: 'exchange',
      };
      const zoneId = zoneMap[e.key.toLowerCase()];
      if (zoneId) {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('shortcut:zone-navigate', {
          detail: { zoneId },
          bubbles: true,
        }));
        return;
      }
    }

    // ── Escape — layered close ───────────────────────────────

    if (e.key === 'Escape') {
      e.preventDefault();
      if (this._overlay.isVisible) {
        this._overlay.hide();
        return;
      }
      if (this._palette?.isOpen) {
        this._palette.close();
        return;
      }
      if (this._panels?.isOpen) {
        this._panels.close();
        return;
      }
      document.dispatchEvent(new CustomEvent('shortcut:escape', { bubbles: true }));
      return;
    }

    // "/" to open palette (when not typing)
    if (e.key === '/' && !this._isTyping(e) && !metaKey && !this._palette?.isOpen) {
      e.preventDefault();
      this._palette?.open();
      return;
    }

    // Don't fire remaining shortcuts when typing
    if (this._isTyping(e)) return;

    // ? — show shortcuts overlay
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      e.preventDefault();
      this._overlay.toggle();
      return;
    }

    // H — camera home
    if ((e.key === 'h' || e.key === 'H') && !metaKey) {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('shortcut:camera-home', { bubbles: true }));
      return;
    }

    // T — theme picker
    if ((e.key === 't' || e.key === 'T') && !metaKey) {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('shortcut:theme-picker', { bubbles: true }));
      return;
    }

    // Tab — cycle zones
    if (e.key === 'Tab') {
      e.preventDefault();
      const direction = e.shiftKey ? -1 : 1;
      document.dispatchEvent(new CustomEvent('shortcut:cycle-zones', {
        detail: { direction },
        bubbles: true,
      }));
      return;
    }

    // Space — toggle day cycle
    if (e.key === ' ') {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('shortcut:toggle-day-cycle', { bubbles: true }));
      return;
    }

    // 1-9 — jump to zone
    if (e.key >= '1' && e.key <= '9' && !metaKey && !e.altKey) {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('shortcut:jump-zone', {
        detail: { index: parseInt(e.key, 10) - 1 },
        bubbles: true,
      }));
      return;
    }
  }

  /** @returns {boolean} */
  get isHelpVisible() {
    return this._overlay.isVisible;
  }

  /** Tear down. */
  destroy() {
    document.removeEventListener('keydown', this._handleKeyDown);
    this._overlay.destroy();
  }
}
