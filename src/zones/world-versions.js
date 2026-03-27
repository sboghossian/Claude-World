/**
 * world-versions.js — World Versions zone for Claude World
 *
 * Time-machine / version control UI for browsing, comparing, creating,
 * and restoring world snapshots. Uses the world_snapshots table (migration 008).
 *
 * IPC calls:
 *   window.api.db.getSnapshots(worldId, limit)
 *   window.api.db.saveWorldSnapshot(worldId, label)
 *   window.api.db.deleteSnapshot(snapshotId)
 *   window.api.db.restoreSnapshot(worldId, snapshotId)
 *
 * Emits:
 *   toast:show — { type, title, description }
 *
 * Pairs with world-versions.css.
 */

// ── CSS injection ──────────────────────────────────────────────────────

(function injectCSS() {
  if (document.getElementById('world-versions-styles')) return;
  const link = document.createElement('link');
  link.id = 'world-versions-styles';
  link.rel = 'stylesheet';
  link.href = '../zones/world-versions.css';
  document.head.appendChild(link);
})();

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Escape HTML entities.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * Format an ISO datetime string to a relative label.
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
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
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
 * Syntax-highlight a JSON string using CSS classes.
 * @param {string} jsonStr
 * @returns {string} HTML string
 */
function highlightJSON(jsonStr) {
  let pretty;
  try {
    pretty = JSON.stringify(JSON.parse(jsonStr), null, 2);
  } catch {
    return escapeHTML(jsonStr);
  }
  return pretty
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        if (/^"/.test(match)) {
          if (/:$/.test(match)) {
            return `<span class="wv-json-key">${match}</span>`;
          }
          return `<span class="wv-json-string">${match}</span>`;
        }
        if (/true|false/.test(match)) {
          return `<span class="wv-json-bool">${match}</span>`;
        }
        if (/null/.test(match)) {
          return `<span class="wv-json-null">${match}</span>`;
        }
        return `<span class="wv-json-number">${match}</span>`;
      }
    );
}

/**
 * Parse state_json safely.
 * @param {string} jsonStr
 * @returns {object}
 */
function parseState(jsonStr) {
  try {
    return JSON.parse(jsonStr) || {};
  } catch {
    return {};
  }
}

/**
 * Extract zones unlocked from state JSON.
 * @param {object} state
 * @returns {string[]}
 */
function extractZones(state) {
  const z = state.zones_unlocked || state.zonesUnlocked || state.zones || [];
  return Array.isArray(z) ? z : Object.keys(z);
}

/**
 * Dispatch a custom event.
 * @param {string} name
 * @param {object} detail
 */
function emit(name, detail) {
  document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
}

// ── WorldVersions ──────────────────────────────────────────────────────

export class WorldVersions {
  constructor() {
    /** @type {string|null} */
    this._worldId = null;

    /** @type {Array<object>} */
    this._snapshots = [];

    /** @type {object|null} */
    this._activeSnapshot = null;

    /** @type {object|null} */
    this._compareSnapshot = null;

    /** @type {HTMLElement|null} */
    this._el = null;

    /** @type {boolean} */
    this._jsonExpanded = false;

    /** @type {string|null} */
    this._deleteConfirmId = null;

    /** @type {string|null} */
    this._editingLabelId = null;

    /** @type {boolean} */
    this._compareMode = false;

    /** @type {boolean} */
    this._saving = false;
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Render the zone shell (empty). Call init() to load data.
   * @returns {HTMLElement}
   */
  render() {
    const root = document.createElement('div');
    root.className = 'wv-root';
    this._el = root;

    // Loading placeholder
    const loading = document.createElement('div');
    loading.className = 'wv-loading';
    loading.textContent = 'Loading snapshots…';
    root.appendChild(loading);

    return root;
  }

  /**
   * Load data and render the full UI.
   * @param {string} worldId
   */
  async init(worldId) {
    this._worldId = worldId;
    try {
      this._snapshots = await window.api.db.getSnapshots(worldId, 50) || [];
    } catch (err) {
      console.error('[WorldVersions] Failed to load snapshots:', err);
      this._snapshots = [];
    }
    this._render();
  }

  // ── Core render ────────────────────────────────────────────────────

  _render() {
    if (!this._el) return;
    this._el.innerHTML = '';
    this._el.appendChild(this._buildTopBar());
    this._el.appendChild(this._buildBanner());

    const body = document.createElement('div');
    body.className = 'wv-body';
    body.appendChild(this._buildTimeline());
    body.appendChild(this._buildDetail());
    this._el.appendChild(body);
  }

  // ── Top bar ────────────────────────────────────────────────────────

  _buildTopBar() {
    const bar = document.createElement('div');
    bar.className = 'wv-topbar';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'wv-topbar-title';
    titleWrap.innerHTML = `<span class="wv-topbar-icon">&#128248;</span><span>World Versions</span>`;
    bar.appendChild(titleWrap);

    const form = document.createElement('div');
    form.className = 'wv-save-form';

    const input = document.createElement('input');
    input.className = 'wv-save-input';
    input.type = 'text';
    input.placeholder = 'Snapshot label (e.g. Before big refactor)';
    input.maxLength = 120;
    input.setAttribute('aria-label', 'Snapshot label');

    const btn = document.createElement('button');
    btn.className = 'wv-btn wv-btn--primary';
    btn.textContent = 'Save Snapshot';
    btn.disabled = this._saving;

    btn.addEventListener('click', async () => {
      const label = input.value.trim();
      if (!label) {
        input.focus();
        return;
      }
      if (!this._worldId) return;

      btn.disabled = true;
      btn.textContent = 'Saving…';
      this._saving = true;

      try {
        await window.api.db.saveWorldSnapshot(this._worldId, label);
        input.value = '';
        emit('toast:show', { type: 'success', title: 'Snapshot saved', description: label });
        // Reload
        this._snapshots = await window.api.db.getSnapshots(this._worldId, 50) || [];
        this._saving = false;
        this._render();
      } catch (err) {
        console.error('[WorldVersions] Save failed:', err);
        emit('toast:show', { type: 'error', title: 'Save failed', description: String(err) });
        btn.disabled = false;
        btn.textContent = 'Save Snapshot';
        this._saving = false;
      }
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btn.click();
    });

    form.appendChild(input);
    form.appendChild(btn);
    bar.appendChild(form);

    return bar;
  }

  // ── Info banner ────────────────────────────────────────────────────

  _buildBanner() {
    const banner = document.createElement('div');
    banner.className = 'wv-banner';
    banner.innerHTML = `
      <span class="wv-banner-icon">&#8505;</span>
      <span>Snapshots are <strong>auto-created</strong> on quest completion and world unlock. Use the form above to save a manual checkpoint anytime.</span>
    `;
    return banner;
  }

  // ── Timeline panel ─────────────────────────────────────────────────

  _buildTimeline() {
    const panel = document.createElement('div');
    panel.className = 'wv-timeline-panel';

    const header = document.createElement('div');
    header.className = 'wv-panel-header';
    header.innerHTML = `<span class="wv-panel-title">Timeline</span><span class="wv-panel-count">${this._snapshots.length} snapshot${this._snapshots.length === 1 ? '' : 's'}</span>`;
    panel.appendChild(header);

    const list = document.createElement('div');
    list.className = 'wv-timeline';

    // Live / current state entry (always at top)
    list.appendChild(this._buildLiveEntry());

    if (this._snapshots.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'wv-empty';
      empty.innerHTML = `<span class="wv-empty-icon">&#128248;</span><p>No snapshots yet. Save one above!</p>`;
      list.appendChild(empty);
    } else {
      for (const snap of this._snapshots) {
        list.appendChild(this._buildTimelineEntry(snap));
      }
    }

    panel.appendChild(list);
    return panel;
  }

  _buildLiveEntry() {
    const entry = document.createElement('div');
    entry.className = 'wv-timeline-entry wv-timeline-entry--live';

    const dot = document.createElement('div');
    dot.className = 'wv-dot wv-dot--live';
    entry.appendChild(dot);

    const content = document.createElement('div');
    content.className = 'wv-entry-content';

    const label = document.createElement('div');
    label.className = 'wv-entry-label';
    label.innerHTML = `<span class="wv-live-badge">LIVE</span> Current state`;
    content.appendChild(label);

    const meta = document.createElement('div');
    meta.className = 'wv-entry-meta';
    meta.textContent = 'Auto-updates as you work';
    content.appendChild(meta);

    entry.appendChild(content);
    return entry;
  }

  _buildTimelineEntry(snap) {
    const isActive = this._activeSnapshot && this._activeSnapshot.id === snap.id;
    const isCompare = this._compareSnapshot && this._compareSnapshot.id === snap.id;
    const isConfirming = this._deleteConfirmId === snap.id;

    const entry = document.createElement('div');
    entry.className = 'wv-timeline-entry' +
      (isActive ? ' wv-timeline-entry--active' : '') +
      (isCompare ? ' wv-timeline-entry--compare' : '');
    entry.setAttribute('role', 'button');
    entry.setAttribute('tabindex', '0');
    entry.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    entry.setAttribute('aria-label', `Snapshot: ${snap.label}`);

    const dot = document.createElement('div');
    dot.className = 'wv-dot' + (isActive ? ' wv-dot--active' : '');
    entry.appendChild(dot);

    const content = document.createElement('div');
    content.className = 'wv-entry-content';

    // Label (possibly editing)
    if (this._editingLabelId === snap.id) {
      const editInput = document.createElement('input');
      editInput.className = 'wv-label-edit-input';
      editInput.type = 'text';
      editInput.value = snap.label;
      editInput.maxLength = 120;

      const saveLabel = async () => {
        const newLabel = editInput.value.trim();
        if (newLabel && newLabel !== snap.label) {
          snap.label = newLabel;
          // No direct API for label update — update in-memory and persist via future API
        }
        this._editingLabelId = null;
        this._render();
      };

      editInput.addEventListener('blur', saveLabel);
      editInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveLabel();
        if (e.key === 'Escape') { this._editingLabelId = null; this._render(); }
      });

      content.appendChild(editInput);
      // Focus after render
      requestAnimationFrame(() => editInput.focus());
    } else {
      const labelEl = document.createElement('div');
      labelEl.className = 'wv-entry-label';
      labelEl.textContent = snap.label;
      content.appendChild(labelEl);
    }

    const meta = document.createElement('div');
    meta.className = 'wv-entry-meta';
    const xpStr = snap.xp_at_snapshot != null ? `${snap.xp_at_snapshot.toLocaleString()} XP` : '';
    const taskStr = snap.task_count_at_snapshot != null ? `${snap.task_count_at_snapshot} tasks` : '';
    const parts = [relativeTime(snap.created_at), xpStr, taskStr].filter(Boolean);
    meta.textContent = parts.join(' · ');
    content.appendChild(meta);

    // Action buttons
    const actions = document.createElement('div');
    actions.className = 'wv-entry-actions';

    if (isConfirming) {
      const confirmText = document.createElement('span');
      confirmText.className = 'wv-confirm-text';
      confirmText.textContent = 'Delete?';
      actions.appendChild(confirmText);

      const yesBtn = document.createElement('button');
      yesBtn.className = 'wv-action-btn wv-action-btn--danger';
      yesBtn.textContent = 'Yes';
      yesBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this._deleteSnapshot(snap);
      });
      actions.appendChild(yesBtn);

      const noBtn = document.createElement('button');
      noBtn.className = 'wv-action-btn';
      noBtn.textContent = 'No';
      noBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteConfirmId = null;
        this._render();
      });
      actions.appendChild(noBtn);
    } else {
      const restoreBtn = document.createElement('button');
      restoreBtn.className = 'wv-action-btn wv-action-btn--restore';
      restoreBtn.textContent = 'Restore';
      restoreBtn.title = 'Restore world to this snapshot';
      restoreBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this._restoreSnapshot(snap);
      });
      actions.appendChild(restoreBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'wv-action-btn wv-action-btn--danger';
      deleteBtn.textContent = 'Delete';
      deleteBtn.title = 'Delete this snapshot';
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._deleteConfirmId = snap.id;
        this._render();
      });
      actions.appendChild(deleteBtn);
    }

    content.appendChild(actions);
    entry.appendChild(content);

    // Click to select
    entry.addEventListener('click', () => {
      if (this._compareMode) {
        if (this._activeSnapshot && this._activeSnapshot.id !== snap.id) {
          this._compareSnapshot = snap;
          this._compareMode = false;
          this._render();
        }
      } else {
        this._activeSnapshot = isActive ? null : snap;
        this._compareSnapshot = null;
        this._deleteConfirmId = null;
        this._jsonExpanded = false;
        this._render();
      }
    });

    entry.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        entry.click();
      }
    });

    return entry;
  }

  // ── Detail panel ───────────────────────────────────────────────────

  _buildDetail() {
    const panel = document.createElement('div');
    panel.className = 'wv-detail-panel';

    if (!this._activeSnapshot) {
      const placeholder = document.createElement('div');
      placeholder.className = 'wv-detail-placeholder';
      placeholder.innerHTML = `
        <span class="wv-placeholder-icon">&#128247;</span>
        <p>Select a snapshot from the timeline to view details.</p>
      `;
      panel.appendChild(placeholder);
      return panel;
    }

    const snap = this._activeSnapshot;

    // Compare view
    if (this._compareSnapshot) {
      panel.appendChild(this._buildDiffView(snap, this._compareSnapshot));
      return panel;
    }

    // Normal detail view
    panel.appendChild(this._buildDetailView(snap));
    return panel;
  }

  _buildDetailView(snap) {
    const wrap = document.createElement('div');
    wrap.className = 'wv-detail-view';

    // Header
    const header = document.createElement('div');
    header.className = 'wv-detail-header';

    const labelWrap = document.createElement('div');
    labelWrap.className = 'wv-detail-label-wrap';

    const labelEl = document.createElement('div');
    labelEl.className = 'wv-detail-label';
    labelEl.textContent = snap.label;
    labelEl.title = 'Click to edit label';
    labelEl.addEventListener('click', () => {
      this._editingLabelId = snap.id;
      this._render();
    });
    labelWrap.appendChild(labelEl);

    const editHint = document.createElement('span');
    editHint.className = 'wv-edit-hint';
    editHint.textContent = 'Click to edit';
    labelWrap.appendChild(editHint);

    header.appendChild(labelWrap);

    const restoreCTA = document.createElement('button');
    restoreCTA.className = 'wv-btn wv-btn--primary';
    restoreCTA.textContent = 'Restore this snapshot';
    restoreCTA.addEventListener('click', () => this._restoreSnapshot(snap));
    header.appendChild(restoreCTA);

    wrap.appendChild(header);

    // Metadata grid
    const metaGrid = document.createElement('div');
    metaGrid.className = 'wv-meta-grid';

    const metaItems = [
      { label: 'Created', value: formatDateTime(snap.created_at) },
      { label: 'Relative', value: relativeTime(snap.created_at) },
      { label: 'XP', value: snap.xp_at_snapshot != null ? snap.xp_at_snapshot.toLocaleString() : '—' },
      { label: 'Tasks', value: snap.task_count_at_snapshot != null ? String(snap.task_count_at_snapshot) : '—' },
    ];

    for (const item of metaItems) {
      const cell = document.createElement('div');
      cell.className = 'wv-meta-cell';
      cell.innerHTML = `<span class="wv-meta-label">${escapeHTML(item.label)}</span><span class="wv-meta-value">${escapeHTML(item.value)}</span>`;
      metaGrid.appendChild(cell);
    }

    wrap.appendChild(metaGrid);

    // Compare button
    const compareWrap = document.createElement('div');
    compareWrap.className = 'wv-compare-wrap';
    const compareBtn = document.createElement('button');
    compareBtn.className = 'wv-btn wv-btn--ghost';
    compareBtn.textContent = this._compareMode
      ? 'Select another snapshot from the timeline…'
      : 'Compare with another snapshot';
    compareBtn.disabled = this._snapshots.length < 2;
    compareBtn.addEventListener('click', () => {
      this._compareMode = !this._compareMode;
      this._compareSnapshot = null;
      this._render();
    });
    compareWrap.appendChild(compareBtn);
    wrap.appendChild(compareWrap);

    // State JSON viewer
    const jsonSection = document.createElement('div');
    jsonSection.className = 'wv-json-section';

    const jsonHeader = document.createElement('div');
    jsonHeader.className = 'wv-json-header';

    const jsonTitle = document.createElement('span');
    jsonTitle.className = 'wv-json-title';
    jsonTitle.textContent = 'State JSON';
    jsonHeader.appendChild(jsonTitle);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'wv-json-toggle';
    toggleBtn.textContent = this._jsonExpanded ? 'Collapse' : 'Expand';
    toggleBtn.setAttribute('aria-expanded', this._jsonExpanded ? 'true' : 'false');
    toggleBtn.addEventListener('click', () => {
      this._jsonExpanded = !this._jsonExpanded;
      this._render();
    });
    jsonHeader.appendChild(toggleBtn);

    jsonSection.appendChild(jsonHeader);

    if (this._jsonExpanded) {
      const pre = document.createElement('pre');
      pre.className = 'wv-json-pre';
      pre.innerHTML = highlightJSON(snap.state_json || '{}');
      jsonSection.appendChild(pre);
    } else {
      const preview = document.createElement('div');
      preview.className = 'wv-json-preview';
      const stateObj = parseState(snap.state_json || '{}');
      const keys = Object.keys(stateObj);
      preview.textContent = keys.length > 0
        ? `{ ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? `, +${keys.length - 5} more` : ''} }`
        : '{}';
      jsonSection.appendChild(preview);
    }

    wrap.appendChild(jsonSection);
    return wrap;
  }

  // ── Diff / Compare view ────────────────────────────────────────────

  _buildDiffView(snapA, snapB) {
    const wrap = document.createElement('div');
    wrap.className = 'wv-diff-view';

    const header = document.createElement('div');
    header.className = 'wv-diff-header';
    header.innerHTML = `<span class="wv-diff-title">Comparing snapshots</span>`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'wv-btn wv-btn--ghost';
    closeBtn.textContent = 'Close comparison';
    closeBtn.addEventListener('click', () => {
      this._compareSnapshot = null;
      this._compareMode = false;
      this._render();
    });
    header.appendChild(closeBtn);

    wrap.appendChild(header);

    // Snapshot labels row
    const labelRow = document.createElement('div');
    labelRow.className = 'wv-diff-labels';
    labelRow.innerHTML = `
      <div class="wv-diff-label-a">
        <span class="wv-diff-badge wv-diff-badge--a">A</span>
        <span>${escapeHTML(snapA.label)}</span>
        <span class="wv-diff-date">${relativeTime(snapA.created_at)}</span>
      </div>
      <div class="wv-diff-arrow">&#8594;</div>
      <div class="wv-diff-label-b">
        <span class="wv-diff-badge wv-diff-badge--b">B</span>
        <span>${escapeHTML(snapB.label)}</span>
        <span class="wv-diff-date">${relativeTime(snapB.created_at)}</span>
      </div>
    `;
    wrap.appendChild(labelRow);

    // Diff table
    const stateA = parseState(snapA.state_json || '{}');
    const stateB = parseState(snapB.state_json || '{}');
    const zonesA = extractZones(stateA);
    const zonesB = extractZones(stateB);

    const xpDelta = (snapB.xp_at_snapshot || 0) - (snapA.xp_at_snapshot || 0);
    const taskDelta = (snapB.task_count_at_snapshot || 0) - (snapA.task_count_at_snapshot || 0);

    const newZones = zonesB.filter(z => !zonesA.includes(z));
    const removedZones = zonesA.filter(z => !zonesB.includes(z));

    const table = document.createElement('table');
    table.className = 'wv-diff-table';

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th>Metric</th>
        <th>Snapshot A</th>
        <th>Snapshot B</th>
        <th>Delta</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    // XP row
    tbody.appendChild(this._buildDiffRow(
      'XP',
      (snapA.xp_at_snapshot || 0).toLocaleString(),
      (snapB.xp_at_snapshot || 0).toLocaleString(),
      xpDelta,
    ));

    // Task count row
    tbody.appendChild(this._buildDiffRow(
      'Tasks',
      String(snapA.task_count_at_snapshot || 0),
      String(snapB.task_count_at_snapshot || 0),
      taskDelta,
    ));

    // Zones row
    tbody.appendChild(this._buildDiffRow(
      'Zones unlocked',
      String(zonesA.length),
      String(zonesB.length),
      zonesB.length - zonesA.length,
    ));

    table.appendChild(tbody);
    wrap.appendChild(table);

    // New zones list
    if (newZones.length > 0) {
      const zoneSection = document.createElement('div');
      zoneSection.className = 'wv-diff-zones';
      zoneSection.innerHTML = `<div class="wv-diff-zones-title">Zones gained in B</div>`;
      const zoneList = document.createElement('div');
      zoneList.className = 'wv-diff-zone-list';
      for (const z of newZones) {
        const badge = document.createElement('span');
        badge.className = 'wv-zone-badge wv-zone-badge--gain';
        badge.textContent = z;
        zoneList.appendChild(badge);
      }
      zoneSection.appendChild(zoneList);
      wrap.appendChild(zoneSection);
    }

    if (removedZones.length > 0) {
      const zoneSection = document.createElement('div');
      zoneSection.className = 'wv-diff-zones';
      zoneSection.innerHTML = `<div class="wv-diff-zones-title">Zones lost in B</div>`;
      const zoneList = document.createElement('div');
      zoneList.className = 'wv-diff-zone-list';
      for (const z of removedZones) {
        const badge = document.createElement('span');
        badge.className = 'wv-zone-badge wv-zone-badge--loss';
        badge.textContent = z;
        zoneList.appendChild(badge);
      }
      zoneSection.appendChild(zoneList);
      wrap.appendChild(zoneSection);
    }

    return wrap;
  }

  /**
   * @param {string} label
   * @param {string} valA
   * @param {string} valB
   * @param {number} delta
   * @returns {HTMLTableRowElement}
   */
  _buildDiffRow(label, valA, valB, delta) {
    const tr = document.createElement('tr');
    tr.className = 'wv-diff-row';

    const tdLabel = document.createElement('td');
    tdLabel.className = 'wv-diff-metric';
    tdLabel.textContent = label;
    tr.appendChild(tdLabel);

    const tdA = document.createElement('td');
    tdA.className = 'wv-diff-val';
    tdA.textContent = valA;
    tr.appendChild(tdA);

    const tdB = document.createElement('td');
    tdB.className = 'wv-diff-val';
    tdB.textContent = valB;
    tr.appendChild(tdB);

    const tdDelta = document.createElement('td');
    tdDelta.className = 'wv-diff-delta' +
      (delta > 0 ? ' wv-diff-delta--gain' : delta < 0 ? ' wv-diff-delta--loss' : '');
    tdDelta.textContent = delta > 0 ? `+${delta}` : delta === 0 ? '—' : String(delta);
    tr.appendChild(tdDelta);

    return tr;
  }

  // ── IPC actions ────────────────────────────────────────────────────

  async _restoreSnapshot(snap) {
    if (!this._worldId) return;
    try {
      await window.api.db.restoreSnapshot(this._worldId, snap.id);
      emit('toast:show', { type: 'info', title: 'Restored', description: snap.label });
    } catch (err) {
      console.error('[WorldVersions] Restore failed:', err);
      emit('toast:show', { type: 'error', title: 'Restore failed', description: String(err) });
    }
  }

  async _deleteSnapshot(snap) {
    try {
      await window.api.db.deleteSnapshot(snap.id);
      this._snapshots = this._snapshots.filter(s => s.id !== snap.id);
      if (this._activeSnapshot && this._activeSnapshot.id === snap.id) {
        this._activeSnapshot = null;
        this._compareSnapshot = null;
      }
      if (this._compareSnapshot && this._compareSnapshot.id === snap.id) {
        this._compareSnapshot = null;
      }
      this._deleteConfirmId = null;
      emit('toast:show', { type: 'success', title: 'Snapshot deleted', description: snap.label });
      this._render();
    } catch (err) {
      console.error('[WorldVersions] Delete failed:', err);
      emit('toast:show', { type: 'error', title: 'Delete failed', description: String(err) });
      this._deleteConfirmId = null;
      this._render();
    }
  }
}

// ── Builder function (matches panel pattern) ───────────────────────────

/**
 * Build the World Versions zone element.
 * Calls render() immediately and init() asynchronously.
 * @param {string} worldId
 * @returns {HTMLElement}
 */
export function buildWorldVersionsContent(worldId) {
  const zone = new WorldVersions();
  const el = zone.render();
  if (worldId) {
    zone.init(worldId).catch(err => {
      console.error('[WorldVersions] init error:', err);
    });
  }
  return el;
}
