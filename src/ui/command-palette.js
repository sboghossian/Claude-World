/**
 * command-palette.js — Cmd+K command palette for Claude World
 *
 * The defining feature of the product. A jaw-dropping mix of Linear's command
 * menu, Spotlight, and a sci-fi terminal. Opens with Cmd+K, closes with Escape.
 *
 * Five result categories:
 *   1. Navigate   — All 20 zones
 *   2. Quick Actions — Power actions
 *   3. Ask Claude — Freeform AI routing
 *   4. Recent Tasks — Last 5 from DB
 *   5. Search Tasks — Live DB search
 */

// ── Zone registry ────────────────────────────────────────────────────────────

const ZONES = [
  { id: 'dispatch',   name: 'Dispatch Tower',   emoji: '🗼', active: true  },
  { id: 'brain',      name: 'Brain Library',     emoji: '🧠', active: true  },
  { id: 'chat',       name: 'Chat Rooms',         emoji: '💬', active: false },
  { id: 'memory',     name: 'Memory Vault',       emoji: '🔒', active: true  },
  { id: 'skills',     name: 'Skills Academy',     emoji: '🎓', active: true  },
  { id: 'minions',    name: 'Minion Tunnels',     emoji: '🤖', active: false },
  { id: 'treasury',   name: 'Treasury',           emoji: '💰', active: false },
  { id: 'sales',      name: 'Sales District',     emoji: '📈', active: false },
  { id: 'marketing',  name: 'Marketing Plaza',    emoji: '📣', active: false },
  { id: 'exchange',   name: 'The Exchange',       emoji: '🔄', active: false },
  { id: 'market',     name: 'The Market',         emoji: '🏪', active: false },
  { id: 'council',    name: 'The Council',        emoji: '🏛️', active: false },
  { id: 'rnd',        name: 'R&D Lab',            emoji: '🔬', active: false },
  { id: 'legal',      name: 'Legal Tower',        emoji: '⚖️', active: false },
  { id: 'archive',    name: 'The Archive',        emoji: '📚', active: false },
  { id: 'docks',      name: 'Connector Docks',    emoji: '⚓', active: true  },
  { id: 'airport',    name: 'Airport',            emoji: '✈️', active: false },
  { id: 'globe',      name: 'Globe Room',         emoji: '🌐', active: false },
  { id: 'broadcast',  name: 'Broadcast Tower',    emoji: '📡', active: false },
  { id: 'missionctl', name: 'Mission Control',    emoji: '🎛️', active: false },
];

// ── Quick Actions registry ────────────────────────────────────────────────────

const QUICK_ACTIONS = [
  {
    id: 'qa-new-chat',
    label: 'New chat',
    subtitle: 'Open Chat Rooms and start a conversation',
    icon: '💬',
    shortcut: '↵ Open',
    action: () => {
      document.dispatchEvent(new CustomEvent('command-palette:navigate', {
        detail: { zoneId: 'chat', zoneName: 'Chat Rooms' }, bubbles: true,
      }));
    },
  },
  {
    id: 'qa-cold-email',
    label: 'Write cold email',
    subtitle: 'Open Sales District in outreach mode',
    icon: '✉️',
    shortcut: '↵ Open',
    action: () => {
      document.dispatchEvent(new CustomEvent('command-palette:navigate', {
        detail: { zoneId: 'sales', zoneName: 'Sales District', mode: 'outreach' }, bubbles: true,
      }));
    },
  },
  {
    id: 'qa-research',
    label: 'Research topic',
    subtitle: 'Open Globe Room for deep research',
    icon: '🔍',
    shortcut: '↵ Open',
    action: () => {
      document.dispatchEvent(new CustomEvent('command-palette:navigate', {
        detail: { zoneId: 'globe', zoneName: 'Globe Room' }, bubbles: true,
      }));
    },
  },
  {
    id: 'qa-run-minions',
    label: 'Run all minions',
    subtitle: 'Trigger all currently enabled minions',
    icon: '⚡',
    shortcut: '↵ Run',
    action: () => {
      document.dispatchEvent(new CustomEvent('command-palette:action', {
        detail: { action: 'run-all-minions' }, bubbles: true,
      }));
    },
  },
  {
    id: 'qa-snapshot',
    label: 'Save world snapshot',
    subtitle: 'Snapshot with timestamp label',
    icon: '📸',
    shortcut: '↵ Save',
    action: () => {
      const label = `snapshot-${new Date().toISOString().slice(0, 19).replace('T', '_')}`;
      document.dispatchEvent(new CustomEvent('command-palette:action', {
        detail: { action: 'snapshot', label }, bubbles: true,
      }));
    },
  },
  {
    id: 'qa-mission-ctrl',
    label: 'Open command center',
    subtitle: 'Open Mission Control',
    icon: '🎛️',
    shortcut: '↵ Open',
    action: () => {
      document.dispatchEvent(new CustomEvent('command-palette:navigate', {
        detail: { zoneId: 'missionctl', zoneName: 'Mission Control' }, bubbles: true,
      }));
    },
  },
  {
    id: 'qa-morning-brief',
    label: 'Generate morning brief',
    subtitle: 'Trigger the morning briefing agent',
    icon: '☀️',
    shortcut: '↵ Run',
    action: () => {
      document.dispatchEvent(new CustomEvent('command-palette:action', {
        detail: { action: 'morning-brief' }, bubbles: true,
      }));
    },
  },
  {
    id: 'qa-day-night',
    label: 'Toggle day/night',
    subtitle: 'Switch between day and night mode',
    icon: '🌙',
    shortcut: '↵ Toggle',
    action: () => {
      document.dispatchEvent(new CustomEvent('command-palette:toggle-day-night', {
        bubbles: true,
      }));
    },
  },
];

// ── URL detector ──────────────────────────────────────────────────────────────

function isURL(str) {
  return /^(https?:\/\/|www\.)[^\s]{2,}/.test(str.trim());
}

// ── AI intent detector ────────────────────────────────────────────────────────

const QUESTION_WORDS = new Set([
  'what', 'how', 'why', 'who', 'when', 'where', 'can', 'does', 'is',
  'will', 'should', 'could', 'would', 'which', 'whose', 'whom',
]);

const ACTION_VERBS = new Set([
  'write', 'draft', 'analyze', 'analyse', 'research', 'find', 'create',
  'generate', 'summarize', 'summarise', 'explain', 'compare', 'list',
  'help', 'make', 'build', 'suggest', 'improve', 'fix', 'edit', 'translate',
  'describe', 'outline', 'plan', 'schedule', 'send', 'check', 'review',
]);

function shouldPrioritizeAI(query) {
  if (!query || query.length < 3) return false;
  const words = query.trim().toLowerCase().split(/\s+/);
  if (QUESTION_WORDS.has(words[0])) return true;
  for (const w of words) {
    if (ACTION_VERBS.has(w)) return true;
  }
  return false;
}

// ── Special command detector ──────────────────────────────────────────────────

function detectSpecialCommand(query) {
  const q = query.trim().toLowerCase();
  if (q === '/snapshot' || q === '/snap') return 'snapshot';
  if (q === '/theme')                     return 'theme';
  if (q === '/help')                      return 'help';
  if (q === '/clear')                     return 'clear';
  return null;
}

// ── Fuzzy matcher ─────────────────────────────────────────────────────────────

/**
 * Score a candidate string against a query.
 * Returns null if no match, otherwise { score, indices }.
 * Scoring tiers: exact prefix (100+) > word start (80+) > word body (70+) > fuzzy (30+)
 *
 * @param {string} query     - Lowercased search query
 * @param {string} candidate - String to match against
 * @returns {{ score: number, indices: number[] } | null}
 */
function fuzzyMatch(query, candidate) {
  if (!query) return { score: 1, indices: [] };

  const lower = candidate.toLowerCase();

  // Exact prefix
  if (lower.startsWith(query)) {
    return { score: 100 + query.length, indices: Array.from({ length: query.length }, (_, i) => i) };
  }

  // Substring match (anywhere)
  const subIdx = lower.indexOf(query);
  if (subIdx !== -1) {
    return { score: 85 + query.length - subIdx * 0.1, indices: Array.from({ length: query.length }, (_, i) => subIdx + i) };
  }

  // Word start abbreviation match
  const words = [];
  const wordStarts = [];
  let inWord = false;
  for (let i = 0; i < lower.length; i++) {
    const ch = lower[i];
    const isBoundary = /[\s\-_/]/.test(ch);
    if (!inWord && !isBoundary) {
      words.push('');
      wordStarts.push(i);
      inWord = true;
    }
    if (!isBoundary) words[words.length - 1] += ch;
    else inWord = false;
  }

  let abbrev = '';
  for (const w of words) abbrev += w[0] || '';

  if (abbrev.startsWith(query)) {
    return { score: 80 + query.length, indices: wordStarts.slice(0, query.length) };
  }

  // Word body match
  for (let wi = 0; wi < words.length; wi++) {
    if (words[wi].startsWith(query)) {
      const start = wordStarts[wi];
      return { score: 70 + query.length, indices: Array.from({ length: query.length }, (_, i) => start + i) };
    }
  }

  // General fuzzy: all chars in order
  const indices = [];
  let qi = 0;
  for (let i = 0; i < lower.length && qi < query.length; i++) {
    if (lower[i] === query[qi]) { indices.push(i); qi++; }
  }

  if (qi === query.length) {
    let consecutiveBonus = 0;
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] === indices[i - 1] + 1) consecutiveBonus += 5;
    }
    const positionBonus = Math.max(0, 20 - indices[0]);
    return { score: 30 + consecutiveBonus + positionBonus, indices };
  }

  return null;
}

// ── HTML helpers ──────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Wrap matched characters in <mark> tags for highlighting.
 * @param {string} label
 * @param {number[]} indices
 * @returns {string} HTML string
 */
function highlightMatch(label, indices) {
  if (!indices || indices.length === 0) return escapeHtml(label);
  const set = new Set(indices);
  let html = '';
  let inMark = false;
  for (let i = 0; i < label.length; i++) {
    const ch = escapeHtml(label[i]);
    if (set.has(i)) {
      if (!inMark) { html += '<mark>'; inMark = true; }
      html += ch;
    } else {
      if (inMark) { html += '</mark>'; inMark = false; }
      html += ch;
    }
  }
  if (inMark) html += '</mark>';
  return html;
}

// ── Inline SVG icons ──────────────────────────────────────────────────────────

const SVG = {
  search: `<svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="8.5" cy="8.5" r="5.5"/>
    <line x1="12.5" y1="12.5" x2="17" y2="17"/>
  </svg>`,

  spinner: `<svg class="cp-spinner" width="16" height="16" viewBox="0 0 16 16" fill="none">
    <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" stroke-dasharray="28" stroke-dashoffset="10" stroke-linecap="round"/>
  </svg>`,

  globe: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <circle cx="8" cy="8" r="6"/>
    <path d="M8 2c-2 2-2 8 0 12M8 2c2 2 2 8 0 12M2 8h12"/>
  </svg>`,

  enter: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M10 2v4H2M2 6l3-3M2 6l3 3"/>
  </svg>`,
};

// ── Result type definitions ───────────────────────────────────────────────────

/**
 * @typedef {Object} ResultItem
 * @property {string} id
 * @property {string} category      — "Navigate" | "Quick Actions" | "Ask Claude" | "Recent Tasks" | "Search Tasks"
 * @property {string} icon
 * @property {string} label
 * @property {string} [subtitle]
 * @property {string} [shortcutBadge]
 * @property {boolean} [locked]
 * @property {number} [matchScore]
 * @property {number[]} [matchIndices]
 * @property {Function} execute     — Called when user selects this result
 */

// ── CommandPalette ────────────────────────────────────────────────────────────

export class CommandPalette {
  constructor() {
    /** @type {ResultItem[]} */
    this._results = [];
    /** @type {number} */
    this._selectedIndex = 0;
    /** @type {boolean} */
    this._isOpen = false;
    /** @type {number | null} */
    this._searchDebounceTimer = null;
    /** @type {boolean} */
    this._isSearching = false;
    /** @type {string} */
    this._lastQuery = '';
    /** @type {string | null} */
    this._worldId = null;

    this._createDOM();
    this._bindGlobalKeys();
    this._bindPaletteEvents();
  }

  // ── DOM Creation ─────────────────────────────────────────────────────────────

  _createDOM() {
    // Full-screen backdrop
    this._backdrop = document.createElement('div');
    this._backdrop.className = 'cp-backdrop';
    this._backdrop.setAttribute('role', 'dialog');
    this._backdrop.setAttribute('aria-modal', 'true');
    this._backdrop.setAttribute('aria-label', 'Command palette');

    // Centered modal
    this._modal = document.createElement('div');
    this._modal.className = 'cp-modal';

    // ── Input area
    const inputArea = document.createElement('div');
    inputArea.className = 'cp-input-area';

    this._searchIcon = document.createElement('span');
    this._searchIcon.className = 'cp-search-icon';
    this._searchIcon.innerHTML = SVG.search;
    inputArea.appendChild(this._searchIcon);

    this._input = document.createElement('input');
    this._input.className = 'cp-input';
    this._input.type = 'text';
    this._input.placeholder = 'Search your world...';
    this._input.setAttribute('aria-label', 'Search commands and tasks');
    this._input.setAttribute('autocomplete', 'off');
    this._input.setAttribute('spellcheck', 'false');
    this._input.setAttribute('autocorrect', 'off');
    this._input.setAttribute('autocapitalize', 'off');
    inputArea.appendChild(this._input);

    this._spinnerEl = document.createElement('span');
    this._spinnerEl.className = 'cp-spinner-wrap';
    this._spinnerEl.innerHTML = SVG.spinner;
    this._spinnerEl.style.display = 'none';
    inputArea.appendChild(this._spinnerEl);

    // Special command badge (shown when "/" commands are typed)
    this._commandBadge = document.createElement('span');
    this._commandBadge.className = 'cp-command-badge';
    this._commandBadge.style.display = 'none';
    inputArea.appendChild(this._commandBadge);

    this._modal.appendChild(inputArea);

    // ── Results container
    this._resultsEl = document.createElement('div');
    this._resultsEl.className = 'cp-results';
    this._resultsEl.setAttribute('role', 'listbox');
    this._modal.appendChild(this._resultsEl);

    // ── Footer
    const footer = document.createElement('div');
    footer.className = 'cp-footer';
    footer.innerHTML = `
      <div class="cp-footer-hints">
        <span class="cp-hint"><kbd>↑↓</kbd> navigate</span>
        <span class="cp-hint"><kbd>↵</kbd> select</span>
        <span class="cp-hint"><kbd>esc</kbd> close</span>
      </div>
      <div class="cp-footer-brand">
        <span class="cp-footer-dot"></span>
        Claude World
      </div>
    `;
    this._modal.appendChild(footer);

    this._backdrop.appendChild(this._modal);
    document.body.appendChild(this._backdrop);

    // ── Empty state (rendered once, shown/hidden)
    this._emptyEl = document.createElement('div');
    this._emptyEl.className = 'cp-empty';
    this._emptyEl.innerHTML = `
      <div class="cp-empty-cursor-wrap">
        <span class="cp-empty-text">Start typing to search your world</span><span class="cp-empty-cursor">_</span>
      </div>
      <div class="cp-empty-hints">
        <span class="cp-empty-hint"><kbd>/snapshot</kbd> save world</span>
        <span class="cp-empty-hint"><kbd>/theme</kbd> change theme</span>
        <span class="cp-empty-hint"><kbd>/help</kbd> keyboard shortcuts</span>
      </div>
    `;
  }

  // ── Global keyboard binding ──────────────────────────────────────────────────

  _bindGlobalKeys() {
    document.addEventListener('keydown', (e) => {
      const isMac = navigator.platform.includes('Mac');
      const modKey = isMac ? e.metaKey : e.ctrlKey;

      if (modKey && e.key === 'k') {
        e.preventDefault();
        this.toggle();
        return;
      }

      // Open with "/" when not focused in a text field
      if (e.key === '/' && !this._isOpen) {
        const active = document.activeElement;
        const isTextField = active && (
          active.tagName === 'INPUT' ||
          active.tagName === 'TEXTAREA' ||
          active.isContentEditable
        );
        if (!isTextField) {
          e.preventDefault();
          this.open();
        }
      }
    });
  }

  // ── Palette event binding ─────────────────────────────────────────────────────

  _bindPaletteEvents() {
    // Input typing
    this._input.addEventListener('input', () => {
      this._onInput();
    });

    // Keyboard navigation
    this._input.addEventListener('keydown', (e) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          this._moveSelection(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          this._moveSelection(-1);
          break;
        case 'Enter':
          e.preventDefault();
          this._executeSelected();
          break;
        case 'Escape':
          e.preventDefault();
          this.close();
          break;
        case 'Tab':
          e.preventDefault();
          this._moveSelection(e.shiftKey ? -1 : 1);
          break;
      }
    });

    // Backdrop click to dismiss
    this._backdrop.addEventListener('mousedown', (e) => {
      if (e.target === this._backdrop) this.close();
    });
  }

  // ── Input handler ──────────────────────────────────────────────────────────────

  _onInput() {
    const raw = this._input.value;
    const query = raw.trim();

    // Detect special /commands
    const special = detectSpecialCommand(query);
    if (special) {
      this._showSpecialCommand(special, query);
      return;
    }
    this._commandBadge.style.display = 'none';

    // URL detection
    if (isURL(query)) {
      this._showURLResult(query);
      return;
    }

    // Clear debounce timer for DB search
    if (this._searchDebounceTimer) {
      clearTimeout(this._searchDebounceTimer);
      this._searchDebounceTimer = null;
    }

    this._buildSyncResults(query);
    this._render();

    // Kick off async DB search with debounce
    if (query.length >= 2) {
      this._setSearching(true);
      this._searchDebounceTimer = setTimeout(() => {
        this._runAsyncSearch(query);
      }, 150);

      // Dispatch global search event for SearchResults integration
      document.dispatchEvent(new CustomEvent('command-palette:global-search', {
        detail: { query, worldId: this._worldId || (window.currentWorldId ?? null) },
        bubbles: true,
      }));
    } else {
      this._setSearching(false);
      // Hide global search results when query is too short
      document.dispatchEvent(new CustomEvent('command-palette:global-search-clear', {
        bubbles: true,
      }));
    }
  }

  // ── Special command handler ────────────────────────────────────────────────────

  _showSpecialCommand(type, query) {
    this._commandBadge.style.display = 'flex';

    const labels = {
      snapshot: '📸 Save Snapshot',
      theme:    '🎨 Open Theme Picker',
      help:     '⌨️ Keyboard Shortcuts',
      clear:    '🗑️ Clear Recent Tasks',
    };
    this._commandBadge.textContent = labels[type] || query;

    this._results = [{
      id: `special-${type}`,
      category: 'Quick Actions',
      icon: labels[type]?.slice(0, 2) || '⚡',
      label: labels[type]?.slice(3) || query,
      subtitle: 'Special command',
      shortcutBadge: '↵ Run',
      execute: () => this._executeSpecialCommand(type),
    }];

    this._selectedIndex = 0;
    this._render();
  }

  _executeSpecialCommand(type) {
    switch (type) {
      case 'snapshot': {
        const label = `snapshot-${new Date().toISOString().slice(0, 19).replace('T', '_')}`;
        document.dispatchEvent(new CustomEvent('command-palette:action', {
          detail: { action: 'snapshot', label }, bubbles: true,
        }));
        break;
      }
      case 'theme':
        document.dispatchEvent(new CustomEvent('command-palette:open-theme-picker', { bubbles: true }));
        break;
      case 'help':
        document.dispatchEvent(new CustomEvent('command-palette:show-help', { bubbles: true }));
        break;
      case 'clear':
        document.dispatchEvent(new CustomEvent('command-palette:clear-tasks', { bubbles: true }));
        break;
    }
  }

  // ── URL result ────────────────────────────────────────────────────────────────

  _showURLResult(url) {
    this._commandBadge.style.display = 'none';
    this._results = [{
      id: 'open-url',
      category: 'Quick Actions',
      icon: '🌐',
      label: `Open in Globe Room`,
      subtitle: url,
      shortcutBadge: '↵ Open',
      execute: () => {
        document.dispatchEvent(new CustomEvent('command-palette:navigate', {
          detail: { zoneId: 'globe', zoneName: 'Globe Room', url }, bubbles: true,
        }));
      },
    }];
    this._selectedIndex = 0;
    this._render();
  }

  // ── Sync result builder ────────────────────────────────────────────────────────

  _buildSyncResults(query) {
    const q = query.toLowerCase();
    const results = [];

    const prioritizeAI = shouldPrioritizeAI(query);

    // ── Ask Claude result (appears at top when AI-intent detected, or always present when query exists)
    if (query.length >= 2) {
      const askResult = {
        id: 'ask-claude',
        category: 'Ask Claude',
        icon: '✨',
        label: `Ask Claude: ${query}`,
        subtitle: 'Open Chat Rooms and pre-fill your query',
        shortcutBadge: '↵ Ask',
        _queryCapture: query,
        execute: () => {
          const capturedQuery = query;
          document.dispatchEvent(new CustomEvent('command-palette:navigate', {
            detail: { zoneId: 'chat', zoneName: 'Chat Rooms', prefill: capturedQuery }, bubbles: true,
          }));
        },
      };

      if (prioritizeAI) {
        results.push({ ...askResult, matchScore: 9999, category: 'Ask Claude' });
      } else {
        // will be added after navigate/actions
        results._askLater = askResult;
      }
    }

    // ── Navigate results
    const navResults = [];
    for (const zone of ZONES) {
      const match = fuzzyMatch(q, zone.name);
      if (!q || match) {
        navResults.push({
          id: `nav-${zone.id}`,
          category: 'Navigate',
          icon: zone.emoji,
          label: zone.name,
          subtitle: zone.active ? 'Active zone' : 'Coming soon',
          shortcutBadge: '↵ Open',
          locked: !zone.active,
          matchScore: match ? match.score : 1,
          matchIndices: match ? match.indices : [],
          execute: () => {
            document.dispatchEvent(new CustomEvent('command-palette:navigate', {
              detail: { zoneId: zone.id, zoneName: zone.name }, bubbles: true,
            }));
          },
        });
      }
    }
    navResults.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    results.push(...navResults);

    // ── Quick Actions results
    const qaResults = [];
    for (const qa of QUICK_ACTIONS) {
      const matchLabel = fuzzyMatch(q, qa.label);
      const matchSub   = q ? fuzzyMatch(q, qa.subtitle || '') : null;
      const match = matchLabel || matchSub;
      if (!q || match) {
        qaResults.push({
          id: qa.id,
          category: 'Quick Actions',
          icon: qa.icon,
          label: qa.label,
          subtitle: qa.subtitle,
          shortcutBadge: qa.shortcut,
          matchScore: matchLabel ? matchLabel.score : (matchSub ? matchSub.score - 5 : 1),
          matchIndices: matchLabel ? matchLabel.indices : [],
          execute: qa.action,
        });
      }
    }
    qaResults.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
    results.push(...qaResults);

    // Add "Ask Claude" after navigate/actions if not prioritized
    if (query.length >= 2 && !prioritizeAI && results._askLater) {
      results.push(results._askLater);
    }
    delete results._askLater;

    this._results = results;
    this._selectedIndex = 0;
  }

  // ── Async DB search ────────────────────────────────────────────────────────────

  async _runAsyncSearch(query) {
    const api = window.api;
    if (!api || !api.db) {
      this._setSearching(false);
      return;
    }

    try {
      const worldId = this._worldId || (window.currentWorldId ?? null);

      // Fetch recent tasks and search results in parallel
      const [recentTasks, searchResults] = await Promise.all([
        api.db.getRecentTasks ? api.db.getRecentTasks(worldId, 5).catch(() => []) : Promise.resolve([]),
        query.length >= 3 && api.db.searchTasks
          ? api.db.searchTasks(worldId, query).catch(() => [])
          : Promise.resolve([]),
      ]);

      // Only apply results if query hasn't changed
      if (this._input.value.trim() !== query) return;

      // Remove any existing task results from previous search
      this._results = this._results.filter(
        r => r.category !== 'Recent Tasks' && r.category !== 'Search Tasks'
      );

      // ── Recent Tasks
      if (recentTasks && recentTasks.length > 0) {
        for (const task of recentTasks.slice(0, 5)) {
          this._results.push({
            id: `recent-${task.id || task.taskId}`,
            category: 'Recent Tasks',
            icon: '📋',
            label: task.title || task.name || 'Untitled task',
            subtitle: [task.zone, task.cost ? `$${Number(task.cost).toFixed(4)}` : null]
              .filter(Boolean).join(' · '),
            shortcutBadge: '↵ Open',
            execute: () => {
              document.dispatchEvent(new CustomEvent('command-palette:open-task', {
                detail: { taskId: task.id || task.taskId }, bubbles: true,
              }));
            },
          });
        }
      }

      // ── Search Tasks (only shown when query >= 3 chars)
      if (searchResults && searchResults.length > 0) {
        for (const task of searchResults.slice(0, 8)) {
          this._results.push({
            id: `search-${task.id || task.taskId}`,
            category: 'Search Tasks',
            icon: '🔍',
            label: task.title || task.name || 'Untitled task',
            subtitle: [task.zone, task.cost ? `$${Number(task.cost).toFixed(4)}` : null]
              .filter(Boolean).join(' · '),
            shortcutBadge: '↵ Open',
            execute: () => {
              document.dispatchEvent(new CustomEvent('command-palette:open-task', {
                detail: { taskId: task.id || task.taskId }, bubbles: true,
              }));
            },
          });
        }
      }

      this._setSearching(false);
      this._render();
    } catch (err) {
      console.warn('[CommandPalette] Async search error:', err);
      this._setSearching(false);
    }
  }

  // ── Spinner helper ─────────────────────────────────────────────────────────────

  _setSearching(val) {
    this._isSearching = val;
    this._spinnerEl.style.display = val ? 'flex' : 'none';
  }

  // ── Rendering ──────────────────────────────────────────────────────────────────

  _render() {
    const query = this._input.value.trim();

    // Empty state
    if (!query && this._results.length === 0) {
      this._resultsEl.innerHTML = '';
      this._resultsEl.appendChild(this._emptyEl);
      return;
    }

    if (this._results.length === 0) {
      this._resultsEl.innerHTML = `
        <div class="cp-empty-search">
          <span class="cp-no-results-icon">🌫️</span>
          <span class="cp-no-results-text">No results for "<strong>${escapeHtml(query)}</strong>"</span>
          <span class="cp-no-results-sub">Try rephrasing, or ask Claude directly</span>
        </div>
      `;
      return;
    }

    // Group by category maintaining insertion order
    const categoryOrder = ['Ask Claude', 'Navigate', 'Quick Actions', 'Recent Tasks', 'Search Tasks'];
    const grouped = new Map();
    for (const cat of categoryOrder) grouped.set(cat, []);

    for (const result of this._results) {
      if (!grouped.has(result.category)) grouped.set(result.category, []);
      grouped.get(result.category).push(result);
    }

    // Build a flat list with section headers for item index tracking
    const flatItems = []; // just result items, no headers
    const sections = [];  // { category, items }

    for (const [cat, items] of grouped) {
      if (items.length > 0) {
        sections.push({ category: cat, items });
        for (const item of items) flatItems.push(item);
      }
    }

    // Clamp selectedIndex
    if (this._selectedIndex >= flatItems.length) this._selectedIndex = 0;

    // Render
    const fragment = document.createDocumentFragment();
    let flatIndex = 0;

    const CATEGORY_ICONS = {
      'Navigate':      '🏙️',
      'Quick Actions': '⚡',
      'Ask Claude':    '✨',
      'Recent Tasks':  '📋',
      'Search Tasks':  '🔍',
    };

    for (const section of sections) {
      // Category header
      const header = document.createElement('div');
      header.className = 'cp-section-header';
      header.innerHTML = `
        <span class="cp-section-icon">${CATEGORY_ICONS[section.category] || ''}</span>
        <span class="cp-section-label">${escapeHtml(section.category)}</span>
        <span class="cp-section-count">${section.items.length}</span>
      `;
      fragment.appendChild(header);

      // Result rows
      for (const result of section.items) {
        const itemIndex = flatIndex++;
        const isSelected = itemIndex === this._selectedIndex;

        const row = document.createElement('div');
        row.className = 'cp-row' + (isSelected ? ' cp-row--selected' : '') + (result.locked ? ' cp-row--locked' : '');
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        row.dataset.index = itemIndex;

        // Left: icon
        const iconEl = document.createElement('span');
        iconEl.className = 'cp-row-icon';
        iconEl.textContent = result.icon || '';
        row.appendChild(iconEl);

        // Center: label + subtitle
        const contentEl = document.createElement('span');
        contentEl.className = 'cp-row-content';

        const labelEl = document.createElement('span');
        labelEl.className = 'cp-row-label';
        labelEl.innerHTML = result.matchIndices && result.matchIndices.length > 0
          ? highlightMatch(result.label, result.matchIndices)
          : escapeHtml(result.label);
        contentEl.appendChild(labelEl);

        if (result.subtitle) {
          const subEl = document.createElement('span');
          subEl.className = 'cp-row-subtitle';
          subEl.textContent = result.subtitle;
          contentEl.appendChild(subEl);
        }

        row.appendChild(contentEl);

        // Right: shortcut badge + locked badge
        const rightEl = document.createElement('span');
        rightEl.className = 'cp-row-right';

        if (result.locked) {
          const lockBadge = document.createElement('span');
          lockBadge.className = 'cp-badge cp-badge--locked';
          lockBadge.textContent = 'Soon';
          rightEl.appendChild(lockBadge);
        } else if (result.shortcutBadge) {
          const badge = document.createElement('span');
          badge.className = 'cp-badge';
          badge.textContent = isSelected ? result.shortcutBadge : '';
          rightEl.appendChild(badge);
        }

        row.appendChild(rightEl);

        // Events
        row.addEventListener('click', () => {
          this._selectedIndex = itemIndex;
          this._executeSelected();
        });

        row.addEventListener('mouseenter', () => {
          this._selectedIndex = itemIndex;
          this._updateSelectionHighlight();
        });

        fragment.appendChild(row);
      }
    }

    // Animate old results out, new ones in
    this._resultsEl.classList.add('cp-results--transitioning');
    this._resultsEl.innerHTML = '';
    this._resultsEl.appendChild(fragment);

    // Staggered fade-in for each row
    const rows = this._resultsEl.querySelectorAll('.cp-row');
    rows.forEach((row, i) => {
      row.style.animationDelay = `${i * 20}ms`;
      row.classList.add('cp-row--animating');
    });

    requestAnimationFrame(() => {
      this._resultsEl.classList.remove('cp-results--transitioning');
    });

    this._scrollSelectedIntoView();
  }

  // ── Selection ─────────────────────────────────────────────────────────────────

  _moveSelection(delta) {
    const rows = this._resultsEl.querySelectorAll('.cp-row:not(.cp-row--locked)');
    if (rows.length === 0) return;

    // Build an array of valid (non-locked) indices
    const validIndices = [];
    this._resultsEl.querySelectorAll('.cp-row').forEach((row, i) => {
      if (!row.classList.contains('cp-row--locked')) validIndices.push(i);
    });

    const currentPos = validIndices.indexOf(this._selectedIndex);
    let nextPos = currentPos + delta;
    nextPos = ((nextPos % validIndices.length) + validIndices.length) % validIndices.length;
    this._selectedIndex = validIndices[nextPos];

    this._updateSelectionHighlight();
    this._scrollSelectedIntoView();
  }

  _updateSelectionHighlight() {
    const rows = this._resultsEl.querySelectorAll('.cp-row');
    rows.forEach((row, i) => {
      const isSelected = Number(row.dataset.index) === this._selectedIndex;
      row.classList.toggle('cp-row--selected', isSelected);
      row.setAttribute('aria-selected', isSelected ? 'true' : 'false');

      // Show/hide shortcut badge text
      const badge = row.querySelector('.cp-badge:not(.cp-badge--locked)');
      if (badge) {
        // Re-look up badge label from results
        const result = this._results.find(r => r.id && `${r.id}` === row.querySelector('[data-result-id]')?.dataset.resultId);
        if (isSelected && result?.shortcutBadge) {
          badge.textContent = result.shortcutBadge;
        } else if (!isSelected) {
          badge.textContent = '';
        }
      }
    });
  }

  _scrollSelectedIntoView() {
    const selected = this._resultsEl.querySelector('.cp-row--selected');
    if (selected) {
      selected.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  // ── Execution ──────────────────────────────────────────────────────────────────

  _executeSelected() {
    const rows = this._resultsEl.querySelectorAll('.cp-row');
    let targetIndex = -1;
    let rowIndex = 0;

    for (const row of rows) {
      if (Number(row.dataset.index) === this._selectedIndex) {
        targetIndex = rowIndex;
        break;
      }
      rowIndex++;
    }

    // Map flat DOM index back to result
    // We need to map selectedIndex (flat item index) to a result
    const flatResults = this._getFlatResults();
    const result = flatResults[this._selectedIndex];

    if (!result || result.locked) return;

    // Flash the selected row
    const selectedRow = this._resultsEl.querySelector('.cp-row--selected');
    if (selectedRow) {
      selectedRow.classList.add('cp-row--executing');
      setTimeout(() => this.close(), 80);
    } else {
      this.close();
    }

    // Execute after close animation
    setTimeout(() => {
      try {
        result.execute();
      } catch (err) {
        console.error('[CommandPalette] Execution error:', err);
      }
    }, 90);
  }

  /**
   * Build flat ordered list of results matching the render order.
   * @returns {ResultItem[]}
   */
  _getFlatResults() {
    const categoryOrder = ['Ask Claude', 'Navigate', 'Quick Actions', 'Recent Tasks', 'Search Tasks'];
    const grouped = new Map();
    for (const cat of categoryOrder) grouped.set(cat, []);
    for (const result of this._results) {
      if (!grouped.has(result.category)) grouped.set(result.category, []);
      grouped.get(result.category).push(result);
    }
    const flat = [];
    for (const [, items] of grouped) {
      for (const item of items) flat.push(item);
    }
    return flat;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  /** Open the command palette. */
  open() {
    if (this._isOpen) return;
    this._isOpen = true;

    this._input.value = '';
    this._commandBadge.style.display = 'none';
    this._setSearching(false);
    this._results = [];
    this._selectedIndex = 0;

    // Show empty state immediately
    this._resultsEl.innerHTML = '';
    this._resultsEl.appendChild(this._emptyEl);

    this._backdrop.classList.add('cp-backdrop--open');
    this._modal.classList.add('cp-modal--open');

    // Focus input after entrance animation begins
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this._input.focus();
      });
    });

    // Announce to screen readers
    document.dispatchEvent(new CustomEvent('command-palette:opened', { bubbles: true }));
  }

  /** Close the command palette. */
  close() {
    if (!this._isOpen) return;
    this._isOpen = false;

    this._backdrop.classList.remove('cp-backdrop--open');
    this._modal.classList.remove('cp-modal--open');
    this._modal.classList.add('cp-modal--closing');

    // Cancel any in-flight debounce
    if (this._searchDebounceTimer) {
      clearTimeout(this._searchDebounceTimer);
      this._searchDebounceTimer = null;
    }
    this._setSearching(false);

    setTimeout(() => {
      this._modal.classList.remove('cp-modal--closing');
    }, 140);

    document.dispatchEvent(new CustomEvent('command-palette:closed', { bubbles: true }));
  }

  /** Toggle open / close. */
  toggle() {
    if (this._isOpen) this.close();
    else this.open();
  }

  /** @returns {boolean} */
  get isOpen() {
    return this._isOpen;
  }

  /**
   * Set the current world ID for DB queries.
   * @param {string|number} id
   */
  setWorldId(id) {
    this._worldId = id;
  }

  /** Tear down DOM and event listeners. */
  destroy() {
    this._backdrop.remove();
  }
}
