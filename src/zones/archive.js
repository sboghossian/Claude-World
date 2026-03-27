/**
 * archive.js — Archive zone: complete audit trail and world versioning
 *
 * Every task, message, incident, and minion run is indexed here.
 * Also provides world snapshot/versioning and data export.
 *
 * Emits:
 *   archive:snapshot-saved   — { snapshotId, label }
 *   archive:snapshot-restored — { snapshotId, label }
 *   archive:export            — { format }
 *
 * Vanilla JS + CSS. Pairs with archive.css.
 */

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Escape HTML entities for safe rendering.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Format an ISO datetime string to a human-readable relative label.
 * @param {string|null} iso
 * @returns {string}
 */
function relativeTime(iso) {
  if (!iso) return 'Unknown';
  const ms = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Format a full datetime for display.
 * @param {string|null} iso
 * @returns {string}
 */
function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Format USD cost.
 * @param {number|null} n
 * @returns {string}
 */
function usd(n) {
  if (!n || n <= 0) return '';
  return `$${n.toFixed(4)}`;
}

/**
 * Merge and sort activity arrays by created_at descending.
 * @param {...Array} arrays
 * @returns {Array}
 */
function mergeByDate(...arrays) {
  return arrays
    .flat()
    .filter(Boolean)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

// ── Archive class ────────────────────────────────────────────────────

export class Archive {
  /**
   * @param {HTMLElement} container  The element to render into.
   * @param {object} [options]
   * @param {string} [options.worldId]
   */
  constructor(container, options = {}) {
    /** @type {HTMLElement} */
    this._container = container;
    /** @type {string|null} */
    this._worldId = options.worldId || null;

    /** @type {'feed'|'snapshots'|'export'} */
    this._activeTab = 'feed';
    /** @type {'all'|'tasks'|'messages'|'incidents'|'minion_runs'} */
    this._activeFilter = 'all';
    /** @type {string} */
    this._searchQuery = '';

    /** @type {Array<object>} All activity events merged */
    this._allEvents = [];
    /** @type {Array<object>} Snapshots */
    this._snapshots = [];

    /** @type {number} Page size for activity feed */
    this._pageSize = 50;
    /** @type {number} Currently rendered count */
    this._renderedCount = 0;

    /** Stats */
    this._stats = { tasks: 0, messages: 0, incidents: 0, snapshots: 0 };

    this._injectCSS();
    this._build();
    this._bindEvents();

    if (this._worldId) {
      this.init(this._worldId);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // CSS injection
  // ═══════════════════════════════════════════════════════════════════

  _injectCSS() {
    const id = 'archive-styles';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'src/zones/archive.css';
    document.head.appendChild(link);
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOM construction
  // ═══════════════════════════════════════════════════════════════════

  _build() {
    this._container.innerHTML = '';
    this._container.classList.add('archive');
    this._container.setAttribute('role', 'region');
    this._container.setAttribute('aria-label', 'The Archive');

    // ── Header ──
    const header = this._el('div', 'archive__header');

    const titleRow = this._el('div', 'archive__title-row');
    const title = this._el('h2', 'archive__title');
    title.textContent = '🗄️ The Archive';
    const subtitle = this._el('span', 'archive__subtitle');
    subtitle.textContent = 'Everything that ever happened, indexed.';
    titleRow.appendChild(title);
    titleRow.appendChild(subtitle);
    header.appendChild(titleRow);

    this._statsEl = this._el('div', 'archive__stats');
    this._statsEl.setAttribute('aria-live', 'polite');
    this._statsEl.textContent = '0 tasks · 0 messages · 0 incidents · 0 snapshots';
    header.appendChild(this._statsEl);

    this._container.appendChild(header);

    // ── Tabs ──
    const tabBar = this._el('div', 'archive__tab-bar');
    tabBar.setAttribute('role', 'tablist');
    tabBar.setAttribute('aria-label', 'Archive sections');

    const tabs = [
      { id: 'feed', label: 'Activity Feed' },
      { id: 'snapshots', label: 'Snapshots' },
      { id: 'export', label: 'Export' },
    ];

    this._tabBtns = {};
    for (const tab of tabs) {
      const btn = this._el('button', 'archive__tab-btn');
      btn.textContent = tab.label;
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-controls', `archive-panel-${tab.id}`);
      btn.setAttribute('aria-selected', String(tab.id === this._activeTab));
      btn.dataset.tab = tab.id;
      tabBar.appendChild(btn);
      this._tabBtns[tab.id] = btn;
    }
    this._container.appendChild(tabBar);

    // ── Tab panels ──
    this._panels = {};

    // Feed panel
    const feedPanel = this._el('div', 'archive__panel');
    feedPanel.id = 'archive-panel-feed';
    feedPanel.setAttribute('role', 'tabpanel');
    feedPanel.setAttribute('aria-labelledby', 'archive-tab-feed');
    this._buildFeedPanel(feedPanel);
    this._panels.feed = feedPanel;
    this._container.appendChild(feedPanel);

    // Snapshots panel
    const snapshotsPanel = this._el('div', 'archive__panel');
    snapshotsPanel.id = 'archive-panel-snapshots';
    snapshotsPanel.setAttribute('role', 'tabpanel');
    snapshotsPanel.setAttribute('aria-labelledby', 'archive-tab-snapshots');
    this._buildSnapshotsPanel(snapshotsPanel);
    this._panels.snapshots = snapshotsPanel;
    this._container.appendChild(snapshotsPanel);

    // Export panel
    const exportPanel = this._el('div', 'archive__panel');
    exportPanel.id = 'archive-panel-export';
    exportPanel.setAttribute('role', 'tabpanel');
    exportPanel.setAttribute('aria-labelledby', 'archive-tab-export');
    this._buildExportPanel(exportPanel);
    this._panels.export = exportPanel;
    this._container.appendChild(exportPanel);

    this._applyTab(this._activeTab);
  }

  _buildFeedPanel(panel) {
    // Search bar
    const searchWrap = this._el('div', 'archive__search-wrap');
    this._searchInput = this._el('input', 'archive__search');
    this._searchInput.type = 'search';
    this._searchInput.placeholder = 'Search tasks, messages, incidents…';
    this._searchInput.setAttribute('aria-label', 'Search activity history');
    searchWrap.appendChild(this._searchInput);
    panel.appendChild(searchWrap);

    // Filter chips
    const filters = this._el('div', 'archive__filters');
    filters.setAttribute('role', 'group');
    filters.setAttribute('aria-label', 'Filter by type');

    const chips = [
      { id: 'all', label: 'All' },
      { id: 'tasks', label: 'Tasks' },
      { id: 'messages', label: 'Messages' },
      { id: 'incidents', label: 'Incidents' },
      { id: 'minion_runs', label: 'Minion Runs' },
    ];

    this._filterChips = {};
    for (const chip of chips) {
      const btn = this._el('button', 'archive__filter-chip');
      btn.textContent = chip.label;
      btn.dataset.filter = chip.id;
      btn.setAttribute('aria-pressed', String(chip.id === this._activeFilter));
      filters.appendChild(btn);
      this._filterChips[chip.id] = btn;
    }
    panel.appendChild(filters);

    // Activity list
    this._feedListEl = this._el('div', 'archive__feed-list');
    this._feedListEl.setAttribute('role', 'feed');
    this._feedListEl.setAttribute('aria-label', 'Activity history');
    panel.appendChild(this._feedListEl);

    // Load more
    this._loadMoreBtn = this._el('button', 'archive__load-more');
    this._loadMoreBtn.textContent = 'Load more';
    this._loadMoreBtn.hidden = true;
    panel.appendChild(this._loadMoreBtn);
  }

  _buildSnapshotsPanel(panel) {
    const snapshotHeader = this._el('div', 'archive__snapshot-header');
    this._saveSnapshotBtn = this._el('button', 'archive__save-snapshot-btn');
    this._saveSnapshotBtn.textContent = '📸 Save Snapshot';
    this._saveSnapshotBtn.setAttribute('aria-label', 'Save a world snapshot');
    snapshotHeader.appendChild(this._saveSnapshotBtn);
    panel.appendChild(snapshotHeader);

    this._snapshotListEl = this._el('div', 'archive__snapshot-list');
    this._snapshotListEl.setAttribute('role', 'list');
    this._snapshotListEl.setAttribute('aria-label', 'World snapshots');
    panel.appendChild(this._snapshotListEl);
  }

  _buildExportPanel(panel) {
    const exportGroup = this._el('div', 'archive__export-group');

    const exportJson = this._el('button', 'archive__export-btn');
    exportJson.textContent = '📦 Export as JSON';
    exportJson.dataset.format = 'json';
    exportJson.setAttribute('aria-label', 'Export full world state as JSON');
    exportGroup.appendChild(exportJson);

    const exportCsv = this._el('button', 'archive__export-btn');
    exportCsv.textContent = '📊 Export Tasks as CSV';
    exportCsv.dataset.format = 'csv';
    exportCsv.setAttribute('aria-label', 'Export tasks as CSV');
    exportGroup.appendChild(exportCsv);

    const exportMd = this._el('button', 'archive__export-btn');
    exportMd.textContent = '📝 Export Messages as Markdown';
    exportMd.dataset.format = 'markdown';
    exportMd.setAttribute('aria-label', 'Export messages as Markdown');
    exportGroup.appendChild(exportMd);

    panel.appendChild(exportGroup);

    const exportNote = this._el('p', 'archive__export-note');
    exportNote.textContent = 'Exports include all data for the current world.';
    panel.appendChild(exportNote);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Tab management
  // ═══════════════════════════════════════════════════════════════════

  _applyTab(tabId) {
    this._activeTab = tabId;
    for (const [id, panel] of Object.entries(this._panels)) {
      panel.hidden = id !== tabId;
    }
    for (const [id, btn] of Object.entries(this._tabBtns)) {
      btn.setAttribute('aria-selected', String(id === tabId));
      btn.classList.toggle('archive__tab-btn--active', id === tabId);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Event binding
  // ═══════════════════════════════════════════════════════════════════

  _bindEvents() {
    // Tabs
    for (const btn of Object.values(this._tabBtns)) {
      btn.addEventListener('click', () => this._applyTab(btn.dataset.tab));
    }

    // Filter chips
    for (const btn of Object.values(this._filterChips)) {
      btn.addEventListener('click', () => {
        this._activeFilter = btn.dataset.filter;
        for (const b of Object.values(this._filterChips)) {
          b.setAttribute('aria-pressed', String(b.dataset.filter === this._activeFilter));
          b.classList.toggle('archive__filter-chip--active', b.dataset.filter === this._activeFilter);
        }
        this._renderedCount = 0;
        this._renderFeed();
      });
    }

    // Search
    let searchTimer = null;
    this._searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this._searchQuery = this._searchInput.value.trim().toLowerCase();
        this._renderedCount = 0;
        this._renderFeed();
      }, 250);
    });

    // Load more
    this._loadMoreBtn.addEventListener('click', () => {
      this._renderedCount += this._pageSize;
      this._renderFeed(true);
    });

    // Snapshot save
    this._saveSnapshotBtn.addEventListener('click', () => {
      if (!this._worldId) return;
      const label = window.prompt('Snapshot label:', `Snapshot ${new Date().toLocaleDateString()}`);
      if (!label) return;
      this.saveSnapshot(this._worldId, label.trim());
    });

    // Export buttons
    this._panels.export.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-format]');
      if (!btn) return;
      this._handleExport(btn.dataset.format);
    });

    // Snapshot restore / delete (delegated)
    this._snapshotListEl.addEventListener('click', (e) => {
      const restoreBtn = e.target.closest('.archive__snapshot-restore');
      if (restoreBtn) {
        const id = restoreBtn.dataset.snapshotId;
        const snap = this._snapshots.find(s => s.id === id);
        if (!snap) return;
        if (window.confirm(`Restore snapshot "${escapeHTML(snap.label)}"? This will overwrite the current world state.`)) {
          this._restoreSnapshot(snap);
        }
      }
    });

    // Feed item expand (delegated)
    this._feedListEl.addEventListener('click', (e) => {
      const item = e.target.closest('.archive__feed-item');
      if (!item) return;
      item.classList.toggle('archive__feed-item--expanded');
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Load activity from all tables for the given world.
   * @param {string} worldId
   */
  async init(worldId) {
    this._worldId = worldId;

    let tasks = [];
    let messages = [];
    let incidents = [];
    let minionRuns = [];
    let snapshots = [];

    try {
      if (window.api && window.api.db) {
        const [t, m, i, mr, sn] = await Promise.allSettled([
          window.api.db.getRecentTasks(worldId, 500),
          window.api.db.getMessages ? window.api.db.getMessages(worldId, 500) : Promise.resolve([]),
          window.api.db.getIncidents ? window.api.db.getIncidents(worldId, 500) : Promise.resolve([]),
          window.api.db.getMinionRuns ? window.api.db.getMinionRuns(worldId, 500) : Promise.resolve([]),
          window.api.db.getWorldSnapshots ? window.api.db.getWorldSnapshots(worldId) : Promise.resolve([]),
        ]);

        tasks     = (t.status === 'fulfilled' && t.value)  ? t.value  : [];
        messages  = (m.status === 'fulfilled' && m.value)  ? m.value  : [];
        incidents = (i.status === 'fulfilled' && i.value)  ? i.value  : [];
        minionRuns = (mr.status === 'fulfilled' && mr.value) ? mr.value : [];
        snapshots = (sn.status === 'fulfilled' && sn.value) ? sn.value : [];
      }
    } catch (err) {
      console.warn('[Archive] Failed to load data from API:', err);
    }

    // Tag each event with its type
    const tagged = [
      ...tasks.map(e => ({ ...e, _type: 'tasks' })),
      ...messages.map(e => ({ ...e, _type: 'messages' })),
      ...incidents.map(e => ({ ...e, _type: 'incidents' })),
      ...minionRuns.map(e => ({ ...e, _type: 'minion_runs' })),
    ];

    this._allEvents = mergeByDate(tagged);
    this._snapshots = snapshots;

    this._stats = {
      tasks: tasks.length,
      messages: messages.length,
      incidents: incidents.length,
      snapshots: snapshots.length,
    };

    this._renderedCount = 0;
    this._updateStats();
    this._renderFeed();
    this._renderSnapshots();
  }

  /**
   * Save a world snapshot.
   * @param {string} worldId
   * @param {string} label
   */
  async saveSnapshot(worldId, label) {
    this._saveSnapshotBtn.disabled = true;
    this._saveSnapshotBtn.textContent = 'Saving…';

    try {
      let snapshotId = null;

      if (window.api && window.api.db && window.api.db.saveWorldSnapshot) {
        // Gather current state
        const stateJson = JSON.stringify({ savedAt: new Date().toISOString(), label });
        const xp = 0;
        const taskCount = this._stats.tasks;

        snapshotId = await window.api.db.saveWorldSnapshot(worldId, {
          label,
          state_json: stateJson,
          xp_at_snapshot: xp,
          task_count_at_snapshot: taskCount,
        });
      }

      // Add optimistic snapshot to list
      const snap = {
        id: snapshotId || `local-${Date.now()}`,
        world_id: worldId,
        label,
        state_json: '{}',
        xp_at_snapshot: 0,
        task_count_at_snapshot: this._stats.tasks,
        created_at: new Date().toISOString(),
      };

      this._snapshots.unshift(snap);
      this._stats.snapshots = this._snapshots.length;
      this._updateStats();
      this._renderSnapshots();

      document.dispatchEvent(new CustomEvent('archive:snapshot-saved', {
        detail: { snapshotId: snap.id, label },
        bubbles: true,
      }));

      document.dispatchEvent(new CustomEvent('toast:show', {
        detail: { type: 'success', title: 'Snapshot Saved', description: `"${label}" saved successfully.` },
        bubbles: true,
      }));
    } catch (err) {
      console.error('[Archive] Failed to save snapshot:', err);
      document.dispatchEvent(new CustomEvent('toast:show', {
        detail: { type: 'error', title: 'Snapshot Failed', description: err.message || 'Unknown error' },
        bubbles: true,
      }));
    } finally {
      this._saveSnapshotBtn.disabled = false;
      this._saveSnapshotBtn.textContent = '📸 Save Snapshot';
    }
  }

  /**
   * Search across all activity types.
   * @param {string} query
   */
  search(query) {
    this._searchQuery = (query || '').toLowerCase();
    this._searchInput.value = this._searchQuery;
    this._renderedCount = 0;
    this._renderFeed();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Rendering
  // ═══════════════════════════════════════════════════════════════════

  _updateStats() {
    const { tasks, messages, incidents, snapshots } = this._stats;
    this._statsEl.textContent =
      `${tasks} tasks · ${messages} messages · ${incidents} incidents · ${snapshots} snapshots`;
  }

  _filteredEvents() {
    let events = this._allEvents;

    if (this._activeFilter !== 'all') {
      events = events.filter(e => e._type === this._activeFilter);
    }

    if (this._searchQuery) {
      const q = this._searchQuery;
      events = events.filter(e => {
        const searchable = [
          e.prompt, e.response, e.content, e.message, e.description,
          e.name, e.status, e.error, e.model, e.provider,
        ].filter(Boolean).join(' ').toLowerCase();
        return searchable.includes(q);
      });
    }

    return events;
  }

  _renderFeed(append = false) {
    const events = this._filteredEvents();

    if (!append) {
      this._feedListEl.innerHTML = '';
      if (this._renderedCount === 0) this._renderedCount = this._pageSize;
    } else {
      this._renderedCount = Math.min(this._renderedCount, events.length);
    }

    const slice = events.slice(0, this._renderedCount);

    if (slice.length === 0) {
      this._feedListEl.innerHTML = '';
      const empty = this._el('div', 'archive__empty');
      empty.textContent = this._searchQuery
        ? 'No results found.'
        : 'Your world\'s history starts here.';
      this._feedListEl.appendChild(empty);
      this._loadMoreBtn.hidden = true;
      return;
    }

    if (!append) {
      this._feedListEl.innerHTML = '';
    }

    const frag = document.createDocumentFragment();
    const start = append ? slice.length - this._pageSize : 0;
    const renderSlice = slice.slice(Math.max(0, start));

    for (const event of renderSlice) {
      frag.appendChild(this._buildFeedItem(event));
    }
    this._feedListEl.appendChild(frag);

    // Show/hide load more
    this._loadMoreBtn.hidden = events.length <= this._renderedCount;
  }

  _buildFeedItem(event) {
    const item = this._el('div', 'archive__feed-item');
    item.setAttribute('role', 'article');
    item.setAttribute('tabindex', '0');

    const type = event._type || 'tasks';
    item.dataset.type = type;

    // Badge
    const badge = this._el('span', `archive__badge archive__badge--${type}`);
    const badgeLabels = {
      tasks: 'Task',
      messages: 'Message',
      incidents: 'Incident',
      minion_runs: 'Minion',
    };
    badge.textContent = badgeLabels[type] || type;

    // Description
    const desc = this._el('span', 'archive__feed-desc');
    desc.textContent = this._describeEvent(event);

    // Cost
    const cost = this._el('span', 'archive__feed-cost');
    const costStr = usd(event.cost_usd);
    if (costStr) cost.textContent = costStr;

    // Time
    const time = this._el('time', 'archive__feed-time');
    time.setAttribute('datetime', event.created_at || '');
    time.textContent = relativeTime(event.created_at);
    time.title = formatDateTime(event.created_at);

    // Summary row
    const summary = this._el('div', 'archive__feed-summary');
    summary.appendChild(badge);
    summary.appendChild(desc);
    summary.appendChild(cost);
    summary.appendChild(time);
    item.appendChild(summary);

    // Detail panel (shown on expand)
    const detail = this._el('div', 'archive__feed-detail');
    detail.appendChild(this._buildEventDetail(event));
    item.appendChild(detail);

    return item;
  }

  _describeEvent(event) {
    switch (event._type) {
      case 'tasks':
        return event.prompt
          ? (event.prompt.length > 80 ? event.prompt.slice(0, 80) + '…' : event.prompt)
          : `Task — ${event.status || 'unknown'}`;
      case 'messages':
        return event.content || event.message || 'Message';
      case 'incidents':
        return event.description || event.name || 'Incident';
      case 'minion_runs':
        return `Minion run: ${event.name || event.minion_id || 'unknown'}`;
      default:
        return event.description || event.name || 'Event';
    }
  }

  _buildEventDetail(event) {
    const wrap = this._el('div', 'archive__event-detail');

    const addRow = (label, value) => {
      if (!value && value !== 0) return;
      const row = this._el('div', 'archive__detail-row');
      const labelEl = this._el('span', 'archive__detail-label');
      labelEl.textContent = label;
      const valueEl = this._el('span', 'archive__detail-value');
      valueEl.textContent = String(value);
      row.appendChild(labelEl);
      row.appendChild(valueEl);
      wrap.appendChild(row);
    };

    addRow('Type', event._type);
    addRow('Status', event.status);
    addRow('Model', event.model);
    addRow('Provider', event.provider);
    addRow('Cost', usd(event.cost_usd));
    addRow('Input tokens', event.input_tokens);
    addRow('Output tokens', event.output_tokens);
    addRow('Created', formatDateTime(event.created_at));
    addRow('Completed', formatDateTime(event.completed_at));
    addRow('Error', event.error);

    if (event.response) {
      const responseWrap = this._el('div', 'archive__detail-response');
      const responseLabel = this._el('div', 'archive__detail-label');
      responseLabel.textContent = 'Response';
      const responseText = this._el('pre', 'archive__detail-pre');
      responseText.textContent = event.response.slice(0, 1000);
      if (event.response.length > 1000) {
        const more = this._el('span', 'archive__detail-more');
        more.textContent = `… (${event.response.length - 1000} more chars)`;
        responseWrap.appendChild(responseLabel);
        responseWrap.appendChild(responseText);
        responseWrap.appendChild(more);
      } else {
        responseWrap.appendChild(responseLabel);
        responseWrap.appendChild(responseText);
      }
      wrap.appendChild(responseWrap);
    }

    return wrap;
  }

  _renderSnapshots() {
    this._snapshotListEl.innerHTML = '';

    if (this._snapshots.length === 0) {
      const empty = this._el('div', 'archive__empty');
      empty.textContent = 'No snapshots yet. Save one to preserve your world state.';
      this._snapshotListEl.appendChild(empty);
      return;
    }

    let prevSnap = null;
    for (const snap of this._snapshots) {
      this._snapshotListEl.appendChild(this._buildSnapshotCard(snap, prevSnap));
      prevSnap = snap;
    }
  }

  _buildSnapshotCard(snap, prevSnap) {
    const card = this._el('div', 'archive__snapshot-card');
    card.setAttribute('role', 'listitem');

    const cardHeader = this._el('div', 'archive__snapshot-card-header');

    const label = this._el('div', 'archive__snapshot-label');
    label.textContent = snap.label || 'Untitled Snapshot';

    const dateEl = this._el('time', 'archive__snapshot-date');
    dateEl.setAttribute('datetime', snap.created_at || '');
    dateEl.textContent = formatDateTime(snap.created_at);

    cardHeader.appendChild(label);
    cardHeader.appendChild(dateEl);
    card.appendChild(cardHeader);

    // Stats row
    const statsRow = this._el('div', 'archive__snapshot-stats');
    const xp = this._el('span', 'archive__snapshot-stat');
    xp.textContent = `${snap.xp_at_snapshot || 0} XP`;
    const taskCount = this._el('span', 'archive__snapshot-stat');
    taskCount.textContent = `${snap.task_count_at_snapshot || 0} tasks`;
    statsRow.appendChild(xp);
    statsRow.appendChild(taskCount);

    // Delta from previous
    if (prevSnap) {
      const deltaTaskDiff = (snap.task_count_at_snapshot || 0) - (prevSnap.task_count_at_snapshot || 0);
      const deltaXpDiff = (snap.xp_at_snapshot || 0) - (prevSnap.xp_at_snapshot || 0);
      if (deltaTaskDiff !== 0 || deltaXpDiff !== 0) {
        const delta = this._el('span', 'archive__snapshot-delta');
        const parts = [];
        if (deltaTaskDiff !== 0) parts.push(`${deltaTaskDiff > 0 ? '+' : ''}${deltaTaskDiff} tasks`);
        if (deltaXpDiff !== 0) parts.push(`${deltaXpDiff > 0 ? '+' : ''}${deltaXpDiff} XP`);
        delta.textContent = parts.join(', ');
        statsRow.appendChild(delta);
      }
    }

    card.appendChild(statsRow);

    // Restore button
    const restoreBtn = this._el('button', 'archive__snapshot-restore');
    restoreBtn.textContent = 'Restore';
    restoreBtn.dataset.snapshotId = snap.id;
    restoreBtn.setAttribute('aria-label', `Restore snapshot: ${snap.label}`);
    card.appendChild(restoreBtn);

    return card;
  }

  async _restoreSnapshot(snap) {
    try {
      if (window.api && window.api.db && window.api.db.restoreWorldSnapshot) {
        await window.api.db.restoreWorldSnapshot(this._worldId, snap.id);
      }

      document.dispatchEvent(new CustomEvent('archive:snapshot-restored', {
        detail: { snapshotId: snap.id, label: snap.label },
        bubbles: true,
      }));

      document.dispatchEvent(new CustomEvent('toast:show', {
        detail: { type: 'success', title: 'Snapshot Restored', description: `"${snap.label}" restored.` },
        bubbles: true,
      }));
    } catch (err) {
      console.error('[Archive] Failed to restore snapshot:', err);
      document.dispatchEvent(new CustomEvent('toast:show', {
        detail: { type: 'error', title: 'Restore Failed', description: err.message || 'Unknown error' },
        bubbles: true,
      }));
    }
  }

  _handleExport(format) {
    try {
      if (format === 'json') {
        const data = {
          exportedAt: new Date().toISOString(),
          worldId: this._worldId,
          events: this._allEvents,
          snapshots: this._snapshots,
        };
        this._downloadFile(
          JSON.stringify(data, null, 2),
          `claude-world-archive-${new Date().toISOString().slice(0, 10)}.json`,
          'application/json',
        );
      } else if (format === 'csv') {
        const tasks = this._allEvents.filter(e => e._type === 'tasks');
        const headers = ['id', 'prompt', 'status', 'model', 'provider', 'cost_usd', 'input_tokens', 'output_tokens', 'created_at'];
        const rows = tasks.map(t => headers.map(h => `"${String(t[h] || '').replace(/"/g, '""')}"`).join(','));
        this._downloadFile(
          [headers.join(','), ...rows].join('\n'),
          `claude-world-tasks-${new Date().toISOString().slice(0, 10)}.csv`,
          'text/csv',
        );
      } else if (format === 'markdown') {
        const messages = this._allEvents.filter(e => e._type === 'messages');
        const lines = [
          `# Claude World — Messages Export`,
          `Exported: ${new Date().toLocaleString()}`,
          '',
          ...messages.map(m => [
            `## ${formatDateTime(m.created_at)}`,
            '',
            m.content || m.message || '',
            '',
          ].join('\n')),
        ];
        this._downloadFile(
          lines.join('\n'),
          `claude-world-messages-${new Date().toISOString().slice(0, 10)}.md`,
          'text/markdown',
        );
      }

      document.dispatchEvent(new CustomEvent('archive:export', {
        detail: { format },
        bubbles: true,
      }));
    } catch (err) {
      console.error('[Archive] Export failed:', err);
      document.dispatchEvent(new CustomEvent('toast:show', {
        detail: { type: 'error', title: 'Export Failed', description: err.message || 'Unknown error' },
        bubbles: true,
      }));
    }
  }

  _downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Utility
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create an element with a class name.
   * @param {string} tag
   * @param {string} className
   * @returns {HTMLElement}
   */
  _el(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }
}
