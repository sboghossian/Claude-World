/**
 * shortcuts-overlay.js — Beautiful keyboard shortcuts help overlay
 *
 * Full-screen glass morphism overlay showing all shortcuts organized by
 * category with styled key caps and a search/filter box.
 *
 * Triggered by pressing `?` or `Cmd+/`.
 *
 * Usage:
 *   import { ShortcutsOverlay } from './shortcuts-overlay.js';
 *   const overlay = new ShortcutsOverlay();
 *   overlay.toggle();
 */

import { SHORTCUTS_REGISTRY } from './shortcuts.js';

// ── Shortcut categories with accent mapping ────────────────────────────────

const CATEGORIES = [
  {
    id: 'navigation',
    label: 'Navigation',
    shortcuts: [
      { keys: ['\u2190', '\u2192', '\u2191', '\u2193'], label: 'Pan the camera' },
      { keys: ['Scroll'], label: 'Zoom in / out' },
      { keys: ['H'], label: 'Camera go home' },
      { keys: ['Tab'], label: 'Cycle zones forward' },
      { keys: ['Shift', 'Tab'], label: 'Cycle zones backward' },
      { keys: ['1'], keyTo: ['9'], label: 'Quick-jump to zone' },
      { keys: ['Space'], label: 'Pause / resume day cycle' },
    ],
  },
  {
    id: 'zones',
    label: 'Zones',
    shortcuts: [
      { keys: ['\u2318', 'D'], label: 'Dispatch Tower' },
      { keys: ['\u2318', 'B'], label: 'Brain Library' },
      { keys: ['\u2318', 'L'], label: 'Legal Tower' },
      { keys: ['\u2318', 'M'], label: 'Memory Vault' },
      { keys: ['\u2318', 'S'], label: 'Skills Academy' },
      { keys: ['\u2318', 'E'], label: 'The Exchange' },
    ],
  },
  {
    id: 'ui',
    label: 'UI',
    shortcuts: [
      { keys: ['\u2318', 'K'], label: 'Command Palette' },
      { keys: ['/'], label: 'Quick-open palette' },
      { keys: ['\u2318', ','], label: 'Settings' },
      { keys: ['Esc'], label: 'Close current panel' },
      { keys: ['?'], label: 'This shortcuts overlay' },
    ],
  },
  {
    id: 'world',
    label: 'World',
    shortcuts: [
      { keys: ['\u2318', 'N'], label: 'New task' },
      { keys: ['\u2318', 'Shift', 'B'], label: 'Morning Briefing' },
      { keys: ['T'], label: 'Theme picker' },
    ],
  },
  {
    id: 'debug',
    label: 'Debug',
    shortcuts: [
      { keys: ['\u2318', 'Shift', 'D'], label: 'Open DevTools' },
      { keys: ['\u2318', 'R'], label: 'Reload window' },
    ],
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Determine if a key string should use the wide variant.
 */
function isWideKey(key) {
  return ['Shift', 'Tab', 'Space', 'Esc', 'Scroll', 'Enter'].includes(key);
}

/**
 * Create a single key cap element.
 * @param {string} key
 * @returns {HTMLElement}
 */
function createKeyCap(key) {
  const kbd = document.createElement('kbd');
  kbd.className = 'shortcuts-overlay__keycap';
  if (isWideKey(key)) {
    kbd.classList.add('shortcuts-overlay__keycap--wide');
  }
  kbd.textContent = key;
  return kbd;
}

/**
 * Create the key caps group for a shortcut entry.
 * Handles ranges like keys=[1] keyTo=[9] rendering as "1 - 9".
 */
function createKeysGroup(shortcut) {
  const container = document.createElement('div');
  container.className = 'shortcuts-overlay__keys';

  for (let i = 0; i < shortcut.keys.length; i++) {
    if (i > 0) {
      // No separator — adjacent caps imply combo
    }
    container.appendChild(createKeyCap(shortcut.keys[i]));
  }

  if (shortcut.keyTo) {
    const sep = document.createElement('span');
    sep.className = 'shortcuts-overlay__keys-separator';
    sep.textContent = '\u2013'; // en-dash
    container.appendChild(sep);
    for (const k of shortcut.keyTo) {
      container.appendChild(createKeyCap(k));
    }
  }

  return container;
}

// ── ShortcutsOverlay class ──────────────────────────────────────────────────

export class ShortcutsOverlay {
  constructor() {
    /** @type {HTMLElement|null} */
    this._backdrop = null;
    /** @type {HTMLInputElement|null} */
    this._searchInput = null;
    /** @type {boolean} */
    this._visible = false;
    /** @type {Array<{row: HTMLElement, label: string, keys: string}>} */
    this._allRows = [];
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Show the overlay. */
  show() {
    if (this._visible) return;
    this._visible = true;
    this._build();
    document.body.appendChild(this._backdrop);

    // Force reflow then animate in
    void this._backdrop.offsetHeight;
    requestAnimationFrame(() => {
      this._backdrop.classList.add('open');
      this._searchInput?.focus();
    });
  }

  /** Hide the overlay with animation. */
  hide() {
    if (!this._visible) return;
    this._visible = false;

    if (this._backdrop) {
      this._backdrop.classList.remove('open');
      const backdrop = this._backdrop;
      setTimeout(() => {
        backdrop.remove();
      }, 260);
      this._backdrop = null;
      this._searchInput = null;
      this._allRows = [];
    }
  }

  /** Toggle visibility. */
  toggle() {
    if (this._visible) this.hide();
    else this.show();
  }

  /** Clean up. */
  destroy() {
    this.hide();
  }

  /** @returns {boolean} */
  get isVisible() {
    return this._visible;
  }

  // ── Build DOM ───────────────────────────────────────────────────

  /** @private */
  _build() {
    this._allRows = [];

    // Backdrop
    this._backdrop = document.createElement('div');
    this._backdrop.className = 'shortcuts-overlay-backdrop';
    this._backdrop.setAttribute('role', 'dialog');
    this._backdrop.setAttribute('aria-modal', 'true');
    this._backdrop.setAttribute('aria-label', 'Keyboard shortcuts');

    // Click outside to close
    this._backdrop.addEventListener('mousedown', (e) => {
      if (e.target === this._backdrop) this.hide();
    });

    // Panel
    const panel = document.createElement('div');
    panel.className = 'shortcuts-overlay';

    // Header
    const header = document.createElement('div');
    header.className = 'shortcuts-overlay__header';

    const title = document.createElement('h2');
    title.className = 'shortcuts-overlay__title';
    title.textContent = 'Keyboard Shortcuts';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'shortcuts-overlay__close';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '\u2715';
    closeBtn.addEventListener('click', () => this.hide());

    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Search
    const searchWrap = document.createElement('div');
    searchWrap.className = 'shortcuts-overlay__search-wrap';

    const searchIcon = document.createElement('span');
    searchIcon.className = 'shortcuts-overlay__search-icon';
    searchIcon.textContent = '\u2315'; // command key symbol as search hint
    searchWrap.appendChild(searchIcon);

    this._searchInput = document.createElement('input');
    this._searchInput.className = 'shortcuts-overlay__search';
    this._searchInput.type = 'text';
    this._searchInput.placeholder = 'Filter shortcuts\u2026';
    this._searchInput.setAttribute('autocomplete', 'off');
    this._searchInput.setAttribute('spellcheck', 'false');
    this._searchInput.addEventListener('input', () => this._onFilter());
    // Prevent keydown from propagating to the shortcut manager
    this._searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.hide();
        return;
      }
      e.stopPropagation();
    });
    searchWrap.appendChild(this._searchInput);
    panel.appendChild(searchWrap);

    // Columns grid
    const columns = document.createElement('div');
    columns.className = 'shortcuts-overlay__columns';

    // Empty state (hidden by default)
    this._emptyEl = document.createElement('div');
    this._emptyEl.className = 'shortcuts-overlay__empty';
    this._emptyEl.style.display = 'none';
    const emptyIcon = document.createElement('div');
    emptyIcon.className = 'shortcuts-overlay__empty-icon';
    emptyIcon.textContent = '\u2328'; // keyboard symbol
    const emptyText = document.createElement('div');
    emptyText.textContent = 'No matching shortcuts';
    this._emptyEl.appendChild(emptyIcon);
    this._emptyEl.appendChild(emptyText);

    // Build categories
    for (const cat of CATEGORIES) {
      const section = document.createElement('div');
      section.className = 'shortcuts-overlay__category';
      section.dataset.category = cat.id;

      const catHeader = document.createElement('h3');
      catHeader.className = 'shortcuts-overlay__category-header';
      catHeader.textContent = cat.label;
      section.appendChild(catHeader);

      for (const sc of cat.shortcuts) {
        const row = document.createElement('div');
        row.className = 'shortcuts-overlay__row';

        const label = document.createElement('span');
        label.className = 'shortcuts-overlay__label';
        label.textContent = sc.label;

        const keysGroup = createKeysGroup(sc);

        row.appendChild(label);
        row.appendChild(keysGroup);
        section.appendChild(row);

        // Track for filtering
        const keysText = sc.keys.join(' ') + (sc.keyTo ? ' ' + sc.keyTo.join(' ') : '');
        this._allRows.push({
          row,
          section,
          label: sc.label.toLowerCase(),
          keys: keysText.toLowerCase(),
        });
      }

      columns.appendChild(section);
    }

    columns.appendChild(this._emptyEl);
    panel.appendChild(columns);
    this._columnsEl = columns;

    // Footer
    const footer = document.createElement('div');
    footer.className = 'shortcuts-overlay__footer';

    const hintEsc = document.createElement('div');
    hintEsc.className = 'shortcuts-overlay__footer-hint';
    hintEsc.appendChild(createKeyCap('Esc'));
    const hintEscText = document.createElement('span');
    hintEscText.textContent = 'Close';
    hintEsc.appendChild(hintEscText);

    const hintSearch = document.createElement('div');
    hintSearch.className = 'shortcuts-overlay__footer-hint';
    const hintSearchText = document.createElement('span');
    hintSearchText.textContent = 'Type to filter';
    hintSearch.appendChild(hintSearchText);

    footer.appendChild(hintSearch);
    footer.appendChild(hintEsc);
    panel.appendChild(footer);

    this._backdrop.appendChild(panel);
  }

  // ── Filter logic ────────────────────────────────────────────────

  /** @private */
  _onFilter() {
    const query = (this._searchInput?.value || '').toLowerCase().trim();
    let visibleCount = 0;
    const visibleSections = new Set();

    for (const entry of this._allRows) {
      const matches = !query ||
        entry.label.includes(query) ||
        entry.keys.includes(query);

      if (matches) {
        entry.row.classList.remove('shortcuts-overlay__row--hidden');
        visibleSections.add(entry.section);
        visibleCount++;
      } else {
        entry.row.classList.add('shortcuts-overlay__row--hidden');
      }
    }

    // Hide entire category sections that have no visible rows
    for (const cat of this._columnsEl.querySelectorAll('.shortcuts-overlay__category')) {
      cat.style.display = visibleSections.has(cat) ? '' : 'none';
    }

    // Show/hide empty state
    this._emptyEl.style.display = visibleCount === 0 ? '' : 'none';
  }
}
