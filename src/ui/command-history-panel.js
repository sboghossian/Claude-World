/**
 * command-history-panel.js — History viewer panel for Claude World
 *
 * Displays a scrollable list of recent commands with action icons,
 * timestamps, undo buttons for reversible actions, and type filters.
 *
 * Opened via Cmd+K → "Command History" or Cmd+Shift+H.
 *
 * Usage:
 *   import { CommandHistoryPanel } from './command-history-panel.js';
 *   const panel = new CommandHistoryPanel();
 *   panel.show();
 */

import { getCommandHistory, ACTION_LABELS } from '../systems/command-history.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Create an element with optional className and textContent.
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Format a timestamp to a human-readable relative string.
 * @param {number} ts
 * @returns {string}
 */
function formatTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── CommandHistoryPanel ─────────────────────────────────────────────────────

export class CommandHistoryPanel {
  constructor() {
    /** @type {HTMLElement|null} */
    this._overlay = null;

    /** @type {string} Active filter — 'all' or a specific type */
    this._activeFilter = 'all';

    /** @type {Function|null} */
    this._onExecuted = null;
    this._onUndone = null;
    this._onRedone = null;
    this._onCleared = null;
    this._toggleHandler = null;

    this._bindToggle();
  }

  // ── Public API ────────────────────────────────────────────────────

  /**
   * Render the panel DOM tree and return it.
   * @returns {HTMLElement}
   */
  render() {
    if (this._overlay) {
      this._overlay.remove();
    }

    const history = getCommandHistory();
    const overlay = el('div', 'cmd-history-overlay');

    const panel = el('div', 'cmd-history-panel');
    overlay.appendChild(panel);

    // ── Header
    const header = el('div', 'cmd-history__header');
    header.appendChild(el('span', 'cmd-history__header-icon', '📜'));
    header.appendChild(el('h2', 'cmd-history__title', 'Command History'));

    const closeBtn = el('button', 'cmd-history__close', '×');
    closeBtn.title = 'Close (Esc)';
    closeBtn.addEventListener('click', () => this.hide());
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // ── Filter bar
    const filters = el('div', 'cmd-history__filters');
    this._renderFilters(filters, history);
    panel.appendChild(filters);

    // ── List
    const list = el('div', 'cmd-history__list');
    this._renderList(list, history);
    panel.appendChild(list);

    // ── Footer
    const footer = el('div', 'cmd-history__footer');
    const count = el('span', 'cmd-history__count');
    count.textContent = `${history.getHistory(200).length} commands`;
    footer.appendChild(count);

    const clearBtn = el('button', 'cmd-history__clear-btn', 'Clear history');
    clearBtn.addEventListener('click', () => {
      history.clearHistory();
      this._refresh();
    });
    footer.appendChild(clearBtn);
    panel.appendChild(footer);

    // Store refs
    this._overlay = overlay;
    this._listEl = list;
    this._countEl = count;
    this._filtersEl = filters;

    document.body.appendChild(overlay);

    // Listen for updates
    this._onExecuted = () => this._refresh();
    this._onUndone = () => this._refresh();
    this._onRedone = () => this._refresh();
    this._onCleared = () => this._refresh();

    document.addEventListener('command:executed', this._onExecuted);
    document.addEventListener('command:undone', this._onUndone);
    document.addEventListener('command:redone', this._onRedone);
    document.addEventListener('command:history-cleared', this._onCleared);

    return overlay;
  }

  /**
   * Show the panel (slide in).
   */
  show() {
    if (!this._overlay) this.render();
    this._refresh();

    // Force a reflow before adding .open for the transition
    void this._overlay.offsetWidth;
    this._overlay.classList.add('open');

    // Escape to close
    this._escHandler = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.hide();
      }
    };
    document.addEventListener('keydown', this._escHandler, { capture: true });
  }

  /**
   * Hide the panel (slide out).
   */
  hide() {
    if (this._overlay) {
      this._overlay.classList.remove('open');
    }
    if (this._escHandler) {
      document.removeEventListener('keydown', this._escHandler, { capture: true });
      this._escHandler = null;
    }
  }

  /**
   * Toggle visibility.
   */
  toggle() {
    if (this._overlay?.classList.contains('open')) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Clean up DOM and listeners.
   */
  destroy() {
    this.hide();
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = null;
    }
    if (this._onExecuted) document.removeEventListener('command:executed', this._onExecuted);
    if (this._onUndone) document.removeEventListener('command:undone', this._onUndone);
    if (this._onRedone) document.removeEventListener('command:redone', this._onRedone);
    if (this._onCleared) document.removeEventListener('command:history-cleared', this._onCleared);
    if (this._toggleHandler) document.removeEventListener('command-history:toggle-panel', this._toggleHandler);
  }

  // ── Private ───────────────────────────────────────────────────────

  _bindToggle() {
    this._toggleHandler = () => this.toggle();
    document.addEventListener('command-history:toggle-panel', this._toggleHandler);
  }

  /**
   * Render filter buttons.
   * @param {HTMLElement} container
   * @param {import('../systems/command-history.js').CommandHistory} history
   */
  _renderFilters(container, history) {
    container.innerHTML = '';

    const types = ['all', ...history.getActionTypes()];

    for (const type of types) {
      const label = type === 'all' ? 'All' : (ACTION_LABELS[type] || type).replace(/^(Opened|Closed|Dispatched|Changed|Created|Unlocked|Switched|Toggled|Used|Searched)\s/, '');
      const btn = el('button', 'cmd-history__filter-btn', label);
      if (type === this._activeFilter) btn.classList.add('active');

      btn.addEventListener('click', () => {
        this._activeFilter = type;
        this._refresh();
      });

      container.appendChild(btn);
    }
  }

  /**
   * Render the command list.
   * @param {HTMLElement} container
   * @param {import('../systems/command-history.js').CommandHistory} history
   */
  _renderList(container, history) {
    container.innerHTML = '';

    let items = history.getHistory(100);

    // Apply filter
    if (this._activeFilter !== 'all') {
      items = items.filter(cmd => cmd.type === this._activeFilter);
    }

    if (items.length === 0) {
      const empty = el('div', 'cmd-history__empty');
      empty.appendChild(el('div', 'cmd-history__empty-icon', '📭'));
      empty.appendChild(el('div', 'cmd-history__empty-text', this._activeFilter === 'all'
        ? 'No commands recorded yet'
        : `No "${this._activeFilter}" commands`));
      container.appendChild(empty);
      return;
    }

    for (const cmd of items) {
      container.appendChild(this._renderItem(cmd, history));
    }
  }

  /**
   * Render a single command list item.
   * @param {Object} cmd
   * @param {import('../systems/command-history.js').CommandHistory} history
   * @returns {HTMLElement}
   */
  _renderItem(cmd, history) {
    const row = el('div', 'cmd-history__item');

    // Icon
    const icon = el('div', 'cmd-history__item-icon', cmd.icon || '▸');
    row.appendChild(icon);

    // Body
    const body = el('div', 'cmd-history__item-body');
    body.appendChild(el('div', 'cmd-history__item-desc', cmd.description || cmd.type));
    body.appendChild(el('div', 'cmd-history__item-time', formatTime(cmd.timestamp)));
    row.appendChild(body);

    // Undo button or "logged" badge
    if (cmd.reversible) {
      // Check if this command is in the undo stack (has _undoFn or is a reversible type in the stack)
      const undoBtn = el('button', 'cmd-history__item-undo', 'Undo');
      undoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // We can only undo the most recent reversible action via the stack.
        // For simplicity, perform a single undo which pops the top of the stack.
        history.undo();
      });
      row.appendChild(undoBtn);
    } else {
      row.appendChild(el('span', 'cmd-history__item-badge', 'logged'));
    }

    return row;
  }

  /**
   * Re-render the list and filters with current data.
   */
  _refresh() {
    if (!this._overlay) return;

    const history = getCommandHistory();

    if (this._listEl) this._renderList(this._listEl, history);
    if (this._filtersEl) this._renderFilters(this._filtersEl, history);
    if (this._countEl) this._countEl.textContent = `${history.getHistory(200).length} commands`;
  }
}
