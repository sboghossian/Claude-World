/**
 * shortcuts.js — Global keyboard shortcut manager for Claude World
 *
 * Listens on document for key events and dispatches custom events.
 * Ignores shortcuts when user is typing in input/textarea.
 */

const SHORTCUT_DEFS = [
  { key: 'k', meta: true, label: 'Open command palette', display: '\u2318K', action: 'shortcut:toggle-palette' },
  { key: 'Escape', meta: false, label: 'Close / Back', display: 'Esc', action: 'shortcut:escape' },
  { key: 'h', meta: false, label: 'Camera go home', display: 'H', action: 'shortcut:camera-home' },
  { key: 'Tab', meta: false, label: 'Cycle zones', display: 'Tab', action: 'shortcut:cycle-zones' },
  { key: ' ', meta: false, label: 'Pause / Resume day cycle', display: 'Space', action: 'shortcut:toggle-day-cycle' },
  { key: '?', meta: false, shift: true, label: 'Show keyboard shortcuts', display: '?', action: 'shortcut:show-help' },
  { key: '1', meta: false, label: 'Jump to zone 1', display: '1', action: 'shortcut:jump-zone', detail: { index: 0 } },
  { key: '2', meta: false, label: 'Jump to zone 2', display: '2', action: 'shortcut:jump-zone', detail: { index: 1 } },
  { key: '3', meta: false, label: 'Jump to zone 3', display: '3', action: 'shortcut:jump-zone', detail: { index: 2 } },
  { key: '4', meta: false, label: 'Jump to zone 4', display: '4', action: 'shortcut:jump-zone', detail: { index: 3 } },
  { key: '5', meta: false, label: 'Jump to zone 5', display: '5', action: 'shortcut:jump-zone', detail: { index: 4 } },
  { key: '6', meta: false, label: 'Jump to zone 6', display: '6', action: 'shortcut:jump-zone', detail: { index: 5 } },
  { key: '7', meta: false, label: 'Jump to zone 7', display: '7', action: 'shortcut:jump-zone', detail: { index: 6 } },
  { key: '8', meta: false, label: 'Jump to zone 8', display: '8', action: 'shortcut:jump-zone', detail: { index: 7 } },
  { key: '9', meta: false, label: 'Jump to zone 9', display: '9', action: 'shortcut:jump-zone', detail: { index: 8 } },
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
    this._helpVisible = false;

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

    // Cmd+K / Ctrl+K — always works, even in inputs
    if (metaKey && e.key === 'k') {
      e.preventDefault();
      this._palette?.toggle();
      return;
    }

    // "/" to open palette (when not typing)
    if (e.key === '/' && !this._isTyping(e) && !this._palette?.isOpen) {
      e.preventDefault();
      this._palette?.open();
      return;
    }

    // Escape — layered close: help overlay > palette > panel
    if (e.key === 'Escape') {
      e.preventDefault();
      if (this._helpVisible) {
        this._hideHelp();
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
      // Generic escape event for other systems (e.g., exit follow mode)
      document.dispatchEvent(new CustomEvent('shortcut:escape', { bubbles: true }));
      return;
    }

    // Don't fire remaining shortcuts when typing
    if (this._isTyping(e)) return;

    // ? — show help
    if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
      e.preventDefault();
      this._toggleHelp();
      return;
    }

    // H — camera home
    if (e.key === 'h' || e.key === 'H') {
      e.preventDefault();
      document.dispatchEvent(new CustomEvent('shortcut:camera-home', { bubbles: true }));
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

  // ── Help overlay ────────────────────────────────────────────────

  _toggleHelp() {
    if (this._helpVisible) this._hideHelp();
    else this._showHelp();
  }

  _showHelp() {
    if (this._helpVisible) return;
    this._helpVisible = true;

    this._helpBackdrop = document.createElement('div');
    this._helpBackdrop.className = 'shortcut-help-backdrop';
    this._helpBackdrop.setAttribute('role', 'dialog');
    this._helpBackdrop.setAttribute('aria-modal', 'true');
    this._helpBackdrop.setAttribute('aria-label', 'Keyboard shortcuts');

    const panel = document.createElement('div');
    panel.className = 'shortcut-help';

    // Title
    const title = document.createElement('h2');
    title.className = 'shortcut-help__title';
    title.textContent = 'Keyboard Shortcuts';
    panel.appendChild(title);

    // Grid
    const grid = document.createElement('div');
    grid.className = 'shortcut-help__grid';

    // Unique display shortcuts (deduplicate jump-zone to "1-9")
    const displayItems = [
      { display: '\u2318K', label: 'Open command palette' },
      { display: '/', label: 'Quick open palette' },
      { display: 'Esc', label: 'Close / Back' },
      { display: 'H', label: 'Camera go home' },
      { display: 'Tab', label: 'Cycle zones forward' },
      { display: 'Shift+Tab', label: 'Cycle zones backward' },
      { display: 'Space', label: 'Pause / Resume day cycle' },
      { display: '1 - 9', label: 'Jump to zone by number' },
      { display: '?', label: 'Show this help' },
    ];

    for (const item of displayItems) {
      const row = document.createElement('div');
      row.className = 'shortcut-help__row';

      const kbd = document.createElement('kbd');
      kbd.className = 'shortcut-help__key';
      kbd.textContent = item.display;

      const label = document.createElement('span');
      label.className = 'shortcut-help__label';
      label.textContent = item.label;

      row.appendChild(kbd);
      row.appendChild(label);
      grid.appendChild(row);
    }

    panel.appendChild(grid);

    // Dismiss hint
    const hint = document.createElement('div');
    hint.className = 'shortcut-help__hint';
    hint.textContent = 'Press Esc or click outside to close';
    panel.appendChild(hint);

    this._helpBackdrop.appendChild(panel);
    document.body.appendChild(this._helpBackdrop);

    // Click outside to close
    this._helpBackdrop.addEventListener('mousedown', (e) => {
      if (e.target === this._helpBackdrop) {
        this._hideHelp();
      }
    });

    // Animate in
    requestAnimationFrame(() => {
      this._helpBackdrop.classList.add('open');
    });
  }

  _hideHelp() {
    if (!this._helpVisible) return;
    this._helpVisible = false;
    if (this._helpBackdrop) {
      this._helpBackdrop.classList.remove('open');
      setTimeout(() => {
        this._helpBackdrop?.remove();
        this._helpBackdrop = null;
      }, 200);
    }
  }

  /** @returns {boolean} */
  get isHelpVisible() {
    return this._helpVisible;
  }

  /** Tear down. */
  destroy() {
    document.removeEventListener('keydown', this._handleKeyDown);
    this._hideHelp();
  }
}
