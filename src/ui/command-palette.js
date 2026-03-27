/**
 * command-palette.js — Cmd+K command palette for Claude World
 *
 * A VS Code / Linear / Notion style command palette.
 * Opens with Cmd+K (Mac) or Ctrl+K. Also opens with "/" when not in a text input.
 * Emits custom events on the document when commands are selected.
 */

// ── Zone data (imported from renderer for zone names) ───────────
// We define a lightweight copy here to avoid circular deps with renderer.
const ZONES = [
  { id: 'dispatch', name: 'Dispatch Tower', active: true },
  { id: 'brain', name: 'Brain Library', active: true },
  { id: 'chat', name: 'Chat Rooms', active: false },
  { id: 'memory', name: 'Memory Vault', active: true },
  { id: 'skills', name: 'Skills Academy', active: true },
  { id: 'minions', name: 'Minion Tunnels', active: false },
  { id: 'treasury', name: 'Treasury', active: false },
  { id: 'sales', name: 'Sales District', active: false },
  { id: 'marketing', name: 'Marketing Plaza', active: false },
  { id: 'exchange', name: 'The Exchange', active: false },
  { id: 'market', name: 'The Market', active: false },
  { id: 'council', name: 'The Council', active: false },
  { id: 'rnd', name: 'R&D Lab', active: false },
  { id: 'legal', name: 'Legal Tower', active: false },
  { id: 'archive', name: 'The Archive', active: false },
  { id: 'docks', name: 'Connector Docks', active: true },
  { id: 'airport', name: 'Airport', active: false },
  { id: 'globe', name: 'Globe Room', active: false },
  { id: 'broadcast', name: 'Broadcast Tower', active: false },
];

const AGENTS = [
  { id: 'commander', name: 'Commander', zone: 'dispatch' },
  { id: 'librarian', name: 'Librarian', zone: 'brain' },
  { id: 'archivist', name: 'Archivist', zone: 'memory' },
  { id: 'instructor', name: 'Instructor', zone: 'skills' },
  { id: 'dockmaster', name: 'Dockmaster', zone: 'docks' },
];

/**
 * Build the full command list.
 * @returns {CommandDef[]}
 *
 * @typedef {Object} CommandDef
 * @property {string} id
 * @property {string} label
 * @property {string} category   - "Navigate" | "Agents" | "Actions" | "Quick Tasks"
 * @property {string} icon
 * @property {string} [shortcut] - Display string for keyboard shortcut
 * @property {boolean} [locked]  - If the target zone is not yet active
 * @property {string} eventName  - Custom event name to dispatch
 * @property {Object} [eventDetail] - Payload for the custom event
 */
function buildCommands() {
  const commands = [];

  // ── Navigate ────────────────────────────────────────────────────
  for (const z of ZONES) {
    commands.push({
      id: `nav-${z.id}`,
      label: `Go to ${z.name}`,
      category: 'Navigate',
      icon: '\u{1F3D7}',  // building construction
      locked: !z.active,
      eventName: 'command-palette:navigate',
      eventDetail: { zoneId: z.id, zoneName: z.name },
    });
  }

  // ── Agents ──────────────────────────────────────────────────────
  for (const a of AGENTS) {
    commands.push({
      id: `agent-talk-${a.id}`,
      label: `Talk to ${a.name}`,
      category: 'Agents',
      icon: '\u{1F4AC}',  // speech bubble
      eventName: 'command-palette:agent',
      eventDetail: { agentId: a.id, action: 'talk' },
    });
    commands.push({
      id: `agent-follow-${a.id}`,
      label: `Follow ${a.name}`,
      category: 'Agents',
      icon: '\u{1F440}',  // eyes
      eventName: 'command-palette:agent',
      eventDetail: { agentId: a.id, action: 'follow' },
    });
  }

  // ── Actions ─────────────────────────────────────────────────────
  commands.push(
    {
      id: 'action-new-task',
      label: 'New Task',
      category: 'Actions',
      icon: '\u{2795}',
      shortcut: '\u2318N',
      eventName: 'command-palette:action',
      eventDetail: { action: 'new-task' },
    },
    {
      id: 'action-new-skill',
      label: 'New Skill',
      category: 'Actions',
      icon: '\u{1F9E0}',
      eventName: 'command-palette:action',
      eventDetail: { action: 'new-skill' },
    },
    {
      id: 'action-add-api-key',
      label: 'Add API Key',
      category: 'Actions',
      icon: '\u{1F511}',
      eventName: 'command-palette:action',
      eventDetail: { action: 'add-api-key' },
    },
    {
      id: 'action-snapshot',
      label: 'Take Snapshot',
      category: 'Actions',
      icon: '\u{1F4F8}',
      eventName: 'command-palette:action',
      eventDetail: { action: 'snapshot' },
    },
    {
      id: 'action-settings',
      label: 'Open Settings',
      category: 'Actions',
      icon: '\u{2699}\uFE0F',
      shortcut: '\u2318,',
      eventName: 'command-palette:action',
      eventDetail: { action: 'settings' },
    },
  );

  // ── Quick Tasks ─────────────────────────────────────────────────
  commands.push(
    {
      id: 'quick-ask',
      label: 'Ask Claude...',
      category: 'Quick Tasks',
      icon: '\u{1F4A1}',
      eventName: 'command-palette:quick',
      eventDetail: { task: 'ask-claude' },
    },
    {
      id: 'quick-compare',
      label: 'Compare Models...',
      category: 'Quick Tasks',
      icon: '\u{1F504}',
      eventName: 'command-palette:quick',
      eventDetail: { task: 'compare-models' },
    },
    {
      id: 'quick-search',
      label: 'Search Archive...',
      category: 'Quick Tasks',
      icon: '\u{1F50D}',
      eventName: 'command-palette:quick',
      eventDetail: { task: 'search-archive' },
    },
  );

  return commands;
}


// ── Fuzzy matcher ───────────────────────────────────────────────

/**
 * Score a candidate string against a query.
 * Returns -1 if no match, otherwise a score (higher = better).
 * Also returns the matched character indices for highlighting.
 *
 * Scoring: exact prefix > word start > fuzzy match
 *
 * @param {string} query - Lowercased query
 * @param {string} candidate - The string to match against
 * @returns {{ score: number, indices: number[] } | null}
 */
function fuzzyMatch(query, candidate) {
  if (!query) return { score: 1, indices: [] };

  const lower = candidate.toLowerCase();

  // Exact prefix match — highest score
  if (lower.startsWith(query)) {
    const indices = [];
    for (let i = 0; i < query.length; i++) indices.push(i);
    return { score: 100 + query.length, indices };
  }

  // Word start match — check if query chars match word starts
  const words = lower.split(/[\s\-]/);
  let wordAbbrev = '';
  const wordStartIndices = [];
  let pos = 0;
  for (const w of words) {
    const idx = lower.indexOf(w, pos);
    if (w.length > 0) {
      wordAbbrev += w[0];
      wordStartIndices.push(idx);
    }
    pos = idx + w.length + 1;
  }

  if (wordAbbrev.startsWith(query)) {
    return { score: 80 + query.length, indices: wordStartIndices.slice(0, query.length) };
  }

  // Check if each word starts with the query (for single-word queries)
  for (let wi = 0; wi < words.length; wi++) {
    if (words[wi].startsWith(query)) {
      const startIdx = lower.indexOf(words[wi]);
      const indices = [];
      for (let i = 0; i < query.length; i++) indices.push(startIdx + i);
      return { score: 70 + query.length, indices };
    }
  }

  // General fuzzy: all query chars appear in order
  const indices = [];
  let qi = 0;
  for (let i = 0; i < lower.length && qi < query.length; i++) {
    if (lower[i] === query[qi]) {
      indices.push(i);
      qi++;
    }
  }

  if (qi === query.length) {
    // Bonus for consecutive matches and early matches
    let consecutiveBonus = 0;
    for (let i = 1; i < indices.length; i++) {
      if (indices[i] === indices[i - 1] + 1) consecutiveBonus += 5;
    }
    const positionBonus = Math.max(0, 20 - indices[0]);
    return { score: 30 + consecutiveBonus + positionBonus, indices };
  }

  return null;
}

/**
 * Highlight matched characters in a label.
 * @param {string} label
 * @param {number[]} indices
 * @returns {string} HTML with <mark> around matched chars
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

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


// ── SVG icons (inline, no dependencies) ─────────────────────────
const SEARCH_ICON_SVG = `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
  <circle cx="8.5" cy="8.5" r="5.5"/>
  <line x1="12.5" y1="12.5" x2="17" y2="17"/>
</svg>`;


// ── CommandPalette class ────────────────────────────────────────

export class CommandPalette {
  constructor() {
    /** @type {CommandDef[]} */
    this._commands = buildCommands();
    /** @type {CommandDef[]} */
    this._filtered = [];
    /** @type {number} */
    this._selectedIndex = 0;
    /** @type {boolean} */
    this._isOpen = false;

    this._createDOM();
    this._bindEvents();
  }

  // ── DOM creation ────────────────────────────────────────────────

  _createDOM() {
    // Backdrop
    this._backdrop = document.createElement('div');
    this._backdrop.className = 'command-palette-backdrop';
    this._backdrop.setAttribute('role', 'dialog');
    this._backdrop.setAttribute('aria-modal', 'true');
    this._backdrop.setAttribute('aria-label', 'Command palette');

    // Palette container
    this._palette = document.createElement('div');
    this._palette.className = 'command-palette';

    // Input area
    const inputWrap = document.createElement('div');
    inputWrap.className = 'command-palette__input-wrap';

    const iconEl = document.createElement('span');
    iconEl.className = 'command-palette__icon';
    iconEl.innerHTML = SEARCH_ICON_SVG;
    inputWrap.appendChild(iconEl);

    this._input = document.createElement('input');
    this._input.className = 'command-palette__input';
    this._input.type = 'text';
    this._input.placeholder = 'Type a command...';
    this._input.setAttribute('aria-label', 'Search commands');
    this._input.setAttribute('autocomplete', 'off');
    this._input.setAttribute('spellcheck', 'false');
    inputWrap.appendChild(this._input);

    this._palette.appendChild(inputWrap);

    // Results
    this._resultsList = document.createElement('div');
    this._resultsList.className = 'command-palette__results';
    this._resultsList.setAttribute('role', 'listbox');
    this._palette.appendChild(this._resultsList);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'command-palette__footer';
    footer.innerHTML = `
      <span class="command-palette__hint"><kbd>\u2191\u2193</kbd> navigate</span>
      <span class="command-palette__hint"><kbd>\u21B5</kbd> select</span>
      <span class="command-palette__hint"><kbd>esc</kbd> close</span>
    `;
    this._palette.appendChild(footer);

    this._backdrop.appendChild(this._palette);
    document.body.appendChild(this._backdrop);
  }

  // ── Events ──────────────────────────────────────────────────────

  _bindEvents() {
    // Input typing
    this._input.addEventListener('input', () => {
      this._filter();
      this._render();
    });

    // Keyboard navigation within palette
    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._moveSelection(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._moveSelection(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this._executeSelected();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });

    // Click outside to close
    this._backdrop.addEventListener('mousedown', (e) => {
      if (e.target === this._backdrop) {
        this.close();
      }
    });
  }

  // ── Filtering ───────────────────────────────────────────────────

  _filter() {
    const query = this._input.value.trim().toLowerCase();

    if (!query) {
      // Show all commands, no scoring needed
      this._filtered = this._commands.map(cmd => ({ ...cmd, matchIndices: [], matchScore: 1 }));
    } else {
      this._filtered = [];
      for (const cmd of this._commands) {
        const result = fuzzyMatch(query, cmd.label);
        if (result) {
          this._filtered.push({ ...cmd, matchIndices: result.indices, matchScore: result.score });
        }
      }
      // Sort by score descending
      this._filtered.sort((a, b) => b.matchScore - a.matchScore);
    }

    this._selectedIndex = 0;
  }

  // ── Rendering ───────────────────────────────────────────────────

  _render() {
    this._resultsList.innerHTML = '';

    if (this._filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'command-palette__empty';
      empty.textContent = 'No matching commands';
      this._resultsList.appendChild(empty);
      return;
    }

    let lastCategory = '';

    for (let i = 0; i < this._filtered.length; i++) {
      const cmd = this._filtered[i];

      // Category divider (only when showing all — when filtered, show inline)
      if (!this._input.value.trim() && cmd.category !== lastCategory) {
        const catEl = document.createElement('div');
        catEl.className = 'command-palette__category';
        catEl.textContent = cmd.category;
        this._resultsList.appendChild(catEl);
        lastCategory = cmd.category;
      }

      const row = document.createElement('div');
      row.className = 'command-palette__row';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', i === this._selectedIndex ? 'true' : 'false');

      if (i === this._selectedIndex) row.classList.add('selected');
      if (cmd.locked) row.classList.add('locked');

      // Category label (inline when searching)
      if (this._input.value.trim()) {
        const catSpan = document.createElement('span');
        catSpan.className = 'command-palette__row-category';
        catSpan.textContent = cmd.category;
        row.appendChild(catSpan);
      }

      // Icon
      const iconSpan = document.createElement('span');
      iconSpan.className = 'command-palette__row-icon';
      iconSpan.textContent = cmd.icon;
      row.appendChild(iconSpan);

      // Label (with highlight)
      const labelSpan = document.createElement('span');
      labelSpan.className = 'command-palette__row-label';
      labelSpan.innerHTML = highlightMatch(cmd.label, cmd.matchIndices);
      row.appendChild(labelSpan);

      // Shortcut badge
      if (cmd.shortcut) {
        const shortcutSpan = document.createElement('span');
        shortcutSpan.className = 'command-palette__row-shortcut';
        shortcutSpan.textContent = cmd.shortcut;
        row.appendChild(shortcutSpan);
      }

      // Locked indicator
      if (cmd.locked) {
        const lockSpan = document.createElement('span');
        lockSpan.className = 'command-palette__row-shortcut';
        lockSpan.textContent = 'locked';
        row.appendChild(lockSpan);
      }

      // Click handler
      row.addEventListener('click', () => {
        this._selectedIndex = i;
        this._executeSelected();
      });

      // Hover to select
      row.addEventListener('mouseenter', () => {
        this._selectedIndex = i;
        this._updateSelection();
      });

      this._resultsList.appendChild(row);
    }
  }

  // ── Selection navigation ────────────────────────────────────────

  _moveSelection(delta) {
    // Skip locked items
    let next = this._selectedIndex + delta;
    const len = this._filtered.length;
    if (len === 0) return;

    // Wrap around
    next = ((next % len) + len) % len;

    // Try to skip locked items (up to full loop)
    let attempts = 0;
    while (this._filtered[next].locked && attempts < len) {
      next = ((next + delta) % len + len) % len;
      attempts++;
    }

    this._selectedIndex = next;
    this._updateSelection();
  }

  _updateSelection() {
    const rows = this._resultsList.querySelectorAll('.command-palette__row');
    rows.forEach((row, i) => {
      const isSelected = i === this._selectedIndex;
      row.classList.toggle('selected', isSelected);
      row.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    });

    // Scroll selected into view
    const selectedRow = rows[this._selectedIndex];
    if (selectedRow) {
      selectedRow.scrollIntoView({ block: 'nearest' });
    }
  }

  // ── Command execution ───────────────────────────────────────────

  _executeSelected() {
    const cmd = this._filtered[this._selectedIndex];
    if (!cmd || cmd.locked) return;

    this.close();

    // Dispatch custom event
    document.dispatchEvent(new CustomEvent(cmd.eventName, {
      detail: cmd.eventDetail,
      bubbles: true,
    }));
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Open the command palette. */
  open() {
    if (this._isOpen) return;
    this._isOpen = true;

    this._input.value = '';
    this._filter();
    this._render();

    this._backdrop.classList.add('open');

    // Focus input after transition
    requestAnimationFrame(() => {
      this._input.focus();
    });
  }

  /** Close the command palette. */
  close() {
    if (!this._isOpen) return;
    this._isOpen = false;
    this._backdrop.classList.remove('open');
  }

  /** Toggle open/close. */
  toggle() {
    if (this._isOpen) this.close();
    else this.open();
  }

  /** @returns {boolean} Whether the palette is currently open. */
  get isOpen() {
    return this._isOpen;
  }

  /** Tear down DOM. */
  destroy() {
    this._backdrop.remove();
  }
}
