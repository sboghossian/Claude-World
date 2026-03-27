/**
 * broadcast-tower.js — Broadcast Tower zone: outbound notification channels
 *
 * Configure webhook, Slack, email, and log broadcast channels.
 * Assign trigger events, send test payloads, and view broadcast history.
 *
 * Emits:
 *   broadcast:sent — { worldId, channelId, eventType }
 *
 * Vanilla JS + CSS. Pairs with broadcast-tower.css.
 */

// ── Helpers ───────────────────────────────────────────────────────────

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
 * Format an ISO datetime string to a short relative label.
 * @param {string|null} iso
 * @returns {string}
 */
function relativeTime(iso) {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Generate a local client-side ID for optimistic records.
 * @returns {string}
 */
function localId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Format an ISO string as a short human date.
 * @param {string} iso
 * @returns {string}
 */
function shortDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch (_) {
    return iso.slice(0, 16).replace('T', ' ');
  }
}

// ── Constants ──────────────────────────────────────────────────────────

const CHANNEL_TYPES = ['webhook', 'slack', 'email', 'log'];

const CHANNEL_TYPE_META = {
  webhook: { label: 'Webhook', icon: '🔗', placeholder: 'https://your-endpoint.com/hook', endpointLabel: 'Endpoint URL' },
  slack:   { label: 'Slack',   icon: '💬', placeholder: 'https://hooks.slack.com/services/...', endpointLabel: 'Webhook URL' },
  email:   { label: 'Email',   icon: '✉️',  placeholder: 'you@example.com', endpointLabel: 'Email Address' },
  log:     { label: 'Log',     icon: '📋', placeholder: '(no endpoint needed)', endpointLabel: 'Notes (optional)' },
};

const TRIGGER_EVENTS = [
  { value: 'task-complete',   label: 'Task Complete' },
  { value: 'quest-complete',  label: 'Quest Complete' },
  { value: 'daily-summary',   label: 'Daily Summary' },
  { value: 'incident-filed',  label: 'Incident Filed' },
];

const LOG_STATUS_META = {
  sent:    { label: 'Sent',    cssClass: 'bt-log-status--sent'    },
  failed:  { label: 'Failed',  cssClass: 'bt-log-status--failed'  },
  pending: { label: 'Pending', cssClass: 'bt-log-status--pending' },
  test:    { label: 'Test',    cssClass: 'bt-log-status--test'    },
};

/** Example payload templates per event type */
const PAYLOAD_TEMPLATES = {
  'task-complete': `{
  "event": "task-complete",
  "world_id": "{{worldId}}",
  "task": {
    "id": "{{taskId}}",
    "title": "{{taskTitle}}",
    "completed_at": "{{timestamp}}"
  }
}`,
  'quest-complete': `{
  "event": "quest-complete",
  "world_id": "{{worldId}}",
  "quest": {
    "id": "{{questId}}",
    "title": "{{questTitle}}",
    "xp_earned": {{xp}},
    "completed_at": "{{timestamp}}"
  }
}`,
  'daily-summary': `{
  "event": "daily-summary",
  "world_id": "{{worldId}}",
  "summary": {
    "tasks_completed": {{count}},
    "xp_earned": {{xp}},
    "top_zone": "{{zone}}",
    "date": "{{date}}"
  }
}`,
  'incident-filed': `{
  "event": "incident-filed",
  "world_id": "{{worldId}}",
  "incident": {
    "id": "{{incidentId}}",
    "title": "{{title}}",
    "severity": "{{severity}}",
    "filed_at": "{{timestamp}}"
  }
}`,
};

// ── BroadcastTower class ───────────────────────────────────────────────

export class BroadcastTower {
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

    /** @type {Array<object>} */
    this._channels = [];
    /** @type {Array<object>} */
    this._log = [];
    /** @type {string|null} */
    this._activeId = null;
    /** @type {boolean} */
    this._editorDirty = false;
    /** @type {boolean} */
    this._creating = false;

    /** @type {HTMLElement|null} */
    this._el = null;

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
    const id = 'broadcast-tower-styles';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'src/zones/broadcast-tower.css';
    document.head.appendChild(link);
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOM construction
  // ═══════════════════════════════════════════════════════════════════

  _build() {
    this._container.innerHTML = '';
    this._container.classList.add('broadcast-tower');
    this._container.setAttribute('role', 'region');
    this._container.setAttribute('aria-label', 'Broadcast Tower — Outbound Channels');
    this._el = this._container;

    // ── Header ──
    const header = this._mk('div', 'bt-header');
    const titleRow = this._mk('div', 'bt-header__title-row');
    const title = this._mk('h2', 'bt-header__title');
    title.textContent = 'Broadcast Tower';
    const badge = this._mk('span', 'bt-header__badge');
    badge.textContent = 'Outbound';
    titleRow.append(title, badge);

    const subtitle = this._mk('span', 'bt-header__subtitle');
    subtitle.textContent = 'Route events to webhooks, Slack, email, and logs.';

    header.append(titleRow, subtitle);
    this._container.appendChild(header);

    // ── Main layout ──
    const layout = this._mk('div', 'bt-layout');
    this._container.appendChild(layout);

    // Left: channels list
    this._channelsPanel = this._mk('aside', 'bt-channels-panel');
    this._channelsPanel.setAttribute('aria-label', 'Broadcast channels');
    this._buildChannelsPanel(this._channelsPanel);
    layout.appendChild(this._channelsPanel);

    // Right: editor + log
    const rightCol = this._mk('div', 'bt-right-col');
    layout.appendChild(rightCol);

    // Editor section
    this._editorSection = this._mk('div', 'bt-editor-section');
    this._buildEditorSection(this._editorSection);
    rightCol.appendChild(this._editorSection);

    // Log section
    this._logSection = this._mk('div', 'bt-log-section');
    this._buildLogSection(this._logSection);
    rightCol.appendChild(this._logSection);

    return this._el;
  }

  _buildChannelsPanel(panel) {
    const panelHeader = this._mk('div', 'bt-panel-header');
    const panelTitle = this._mk('span', 'bt-panel-title');
    panelTitle.textContent = 'Channels';

    this._newChannelBtn = this._mk('button', 'bt-new-btn');
    this._newChannelBtn.textContent = '+ Add';
    this._newChannelBtn.setAttribute('aria-label', 'Add a new channel');

    panelHeader.append(panelTitle, this._newChannelBtn);
    panel.appendChild(panelHeader);

    this._channelListEl = this._mk('div', 'bt-channel-list');
    this._channelListEl.setAttribute('role', 'list');
    this._channelListEl.setAttribute('aria-label', 'Configured channels');
    panel.appendChild(this._channelListEl);
  }

  _buildEditorSection(section) {
    // Empty state (shown when no channel selected)
    this._editorEmptyState = this._mk('div', 'bt-editor-empty');
    const emptyIcon = this._mk('div', 'bt-editor-empty__icon');
    emptyIcon.setAttribute('aria-hidden', 'true');
    emptyIcon.innerHTML = `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="48" height="48">
      <line x1="32" y1="4" x2="32" y2="28" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
      <circle cx="32" cy="36" r="8" stroke="currentColor" stroke-width="2"/>
      <path d="M14 28 Q8 20 8 12 Q8 6 14 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path d="M50 28 Q56 20 56 12 Q56 6 50 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path d="M20 34 Q10 28 6 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" stroke-dasharray="3 3"/>
      <path d="M44 34 Q54 28 58 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" stroke-dasharray="3 3"/>
      <circle cx="32" cy="60" r="3" fill="currentColor" opacity="0.4"/>
      <line x1="32" y1="44" x2="32" y2="57" stroke="currentColor" stroke-width="1.5" opacity="0.4"/>
    </svg>`;
    const emptyText = this._mk('p', 'bt-editor-empty__text');
    emptyText.textContent = 'Select a channel to configure it, or add a new one.';
    this._editorEmptyState.append(emptyIcon, emptyText);
    section.appendChild(this._editorEmptyState);

    // Editor form (hidden initially)
    this._editorForm = this._mk('div', 'bt-editor-form');
    this._editorForm.hidden = true;
    this._editorForm.setAttribute('role', 'form');
    this._editorForm.setAttribute('aria-label', 'Channel editor');
    this._buildEditorForm(this._editorForm);
    section.appendChild(this._editorForm);
  }

  _buildEditorForm(form) {
    const formHeader = this._mk('div', 'bt-editor-form__header');
    this._formTitle = this._mk('span', 'bt-editor-form__title');
    this._formTitle.textContent = 'New Channel';

    const formActions = this._mk('div', 'bt-editor-form__actions');
    this._saveBtn = this._mk('button', 'bt-btn bt-btn--primary');
    this._saveBtn.textContent = 'Save';
    this._saveBtn.setAttribute('aria-label', 'Save channel');

    this._testBtn = this._mk('button', 'bt-btn bt-btn--test');
    this._testBtn.textContent = 'Send Test';
    this._testBtn.setAttribute('aria-label', 'Send a test broadcast');

    this._deleteBtn = this._mk('button', 'bt-btn bt-btn--danger');
    this._deleteBtn.textContent = 'Delete';
    this._deleteBtn.setAttribute('aria-label', 'Delete this channel');

    formActions.append(this._testBtn, this._saveBtn, this._deleteBtn);
    formHeader.append(this._formTitle, formActions);
    form.appendChild(formHeader);

    const fields = this._mk('div', 'bt-editor-fields');

    // Name
    const nameGroup = this._mk('div', 'bt-field-group');
    const nameLabel = this._mk('label', 'bt-field-label');
    nameLabel.textContent = 'Channel Name';
    nameLabel.setAttribute('for', 'bt-field-name');
    this._nameInput = this._mk('input', 'bt-field-input');
    this._nameInput.id = 'bt-field-name';
    this._nameInput.type = 'text';
    this._nameInput.placeholder = 'e.g. Slack Alerts, My Webhook';
    this._nameInput.setAttribute('aria-required', 'true');
    nameGroup.append(nameLabel, this._nameInput);
    fields.appendChild(nameGroup);

    // Type + enabled row
    const typeRow = this._mk('div', 'bt-field-row');

    const typeGroup = this._mk('div', 'bt-field-group bt-field-group--flex');
    const typeLabel = this._mk('label', 'bt-field-label');
    typeLabel.textContent = 'Type';
    typeLabel.setAttribute('for', 'bt-field-type');
    this._typeSelect = this._mk('select', 'bt-field-select');
    this._typeSelect.id = 'bt-field-type';
    for (const t of CHANNEL_TYPES) {
      const meta = CHANNEL_TYPE_META[t];
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = `${meta.icon} ${meta.label}`;
      this._typeSelect.appendChild(opt);
    }
    typeGroup.append(typeLabel, this._typeSelect);

    const enabledGroup = this._mk('div', 'bt-field-group bt-field-group--flex bt-field-group--toggle');
    const enabledLabel = this._mk('label', 'bt-field-label');
    enabledLabel.textContent = 'Enabled';
    enabledLabel.setAttribute('for', 'bt-field-enabled');
    this._enabledToggle = this._mk('input', 'bt-toggle');
    this._enabledToggle.id = 'bt-field-enabled';
    this._enabledToggle.type = 'checkbox';
    this._enabledToggle.setAttribute('role', 'switch');
    enabledGroup.append(enabledLabel, this._enabledToggle);

    typeRow.append(typeGroup, enabledGroup);
    fields.appendChild(typeRow);

    // Endpoint
    const endpointGroup = this._mk('div', 'bt-field-group');
    this._endpointLabel = this._mk('label', 'bt-field-label');
    this._endpointLabel.textContent = 'Endpoint URL';
    this._endpointLabel.setAttribute('for', 'bt-field-endpoint');
    this._endpointInput = this._mk('input', 'bt-field-input');
    this._endpointInput.id = 'bt-field-endpoint';
    this._endpointInput.type = 'text';
    this._endpointInput.placeholder = CHANNEL_TYPE_META['webhook'].placeholder;
    endpointGroup.append(this._endpointLabel, this._endpointInput);
    fields.appendChild(endpointGroup);

    // Triggers
    const triggersGroup = this._mk('div', 'bt-field-group');
    const triggersLabel = this._mk('div', 'bt-field-label');
    triggersLabel.textContent = 'Trigger Events';
    this._triggersContainer = this._mk('div', 'bt-triggers');

    for (const ev of TRIGGER_EVENTS) {
      const chip = this._mk('label', 'bt-trigger-chip');
      const cb = this._mk('input', 'bt-trigger-cb');
      cb.type = 'checkbox';
      cb.value = ev.value;
      cb.setAttribute('aria-label', ev.label);
      const chipText = this._mk('span', 'bt-trigger-chip__text');
      chipText.textContent = ev.label;
      chip.append(cb, chipText);
      this._triggersContainer.appendChild(chip);
    }

    triggersGroup.append(triggersLabel, this._triggersContainer);
    fields.appendChild(triggersGroup);

    // Payload preview
    const previewGroup = this._mk('div', 'bt-field-group');
    const previewLabel = this._mk('div', 'bt-field-label');
    previewLabel.textContent = 'Payload Template';
    const previewHeader = this._mk('div', 'bt-preview-header');
    const previewHint = this._mk('span', 'bt-preview-hint');
    previewHint.textContent = 'Preview for selected event';
    this._previewEventSelect = this._mk('select', 'bt-preview-event-select');
    for (const ev of TRIGGER_EVENTS) {
      const opt = document.createElement('option');
      opt.value = ev.value;
      opt.textContent = ev.label;
      this._previewEventSelect.appendChild(opt);
    }
    previewHeader.append(previewHint, this._previewEventSelect);

    this._payloadPreview = this._mk('pre', 'bt-payload-preview');
    this._payloadPreview.setAttribute('tabindex', '0');
    this._payloadPreview.setAttribute('aria-label', 'Example payload');
    this._payloadPreview.textContent = PAYLOAD_TEMPLATES[TRIGGER_EVENTS[0].value];

    previewGroup.append(previewLabel, previewHeader, this._payloadPreview);
    fields.appendChild(previewGroup);

    form.appendChild(fields);
  }

  _buildLogSection(section) {
    const logHeader = this._mk('div', 'bt-log-header');
    const logTitle = this._mk('span', 'bt-log-title');
    logTitle.textContent = 'Broadcast Log';
    const logCount = this._mk('span', 'bt-log-count');
    logCount.textContent = '0 entries';
    this._logCountEl = logCount;
    logHeader.append(logTitle, logCount);
    section.appendChild(logHeader);

    this._logTableWrap = this._mk('div', 'bt-log-table-wrap');
    this._logTableWrap.setAttribute('role', 'region');
    this._logTableWrap.setAttribute('aria-label', 'Broadcast log entries');

    this._logTable = this._mk('table', 'bt-log-table');
    this._logTable.setAttribute('aria-label', 'Broadcast history');
    const thead = this._mk('thead', '');
    const headRow = this._mk('tr', '');
    for (const col of ['Time', 'Channel', 'Event', 'Status']) {
      const th = this._mk('th', 'bt-log-th');
      th.textContent = col;
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);

    this._logTbody = this._mk('tbody', 'bt-log-tbody');
    this._logTable.append(thead, this._logTbody);
    this._logTableWrap.appendChild(this._logTable);
    section.appendChild(this._logTableWrap);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Event binding
  // ═══════════════════════════════════════════════════════════════════

  _bindEvents() {
    // New channel
    this._newChannelBtn.addEventListener('click', () => this._createNewChannel());

    // Channel list selection (delegated)
    this._channelListEl.addEventListener('click', (e) => {
      // Enable toggle click
      if (e.target.closest('.bt-channel-toggle')) {
        const item = e.target.closest('.bt-channel-item');
        if (item) this._toggleChannelEnabled(item.dataset.id);
        return;
      }
      const item = e.target.closest('.bt-channel-item');
      if (item) this._selectChannel(item.dataset.id);
    });

    // Type change → update endpoint label + placeholder
    this._typeSelect.addEventListener('change', () => {
      const meta = CHANNEL_TYPE_META[this._typeSelect.value] || CHANNEL_TYPE_META.webhook;
      this._endpointLabel.textContent = meta.endpointLabel;
      this._endpointInput.placeholder = meta.placeholder;
      this._endpointInput.disabled = this._typeSelect.value === 'log';
    });

    // Payload preview event selector
    this._previewEventSelect.addEventListener('change', () => {
      const val = this._previewEventSelect.value;
      this._payloadPreview.textContent = PAYLOAD_TEMPLATES[val] || '{}';
    });

    // Save
    this._saveBtn.addEventListener('click', () => this._saveChannel());

    // Test broadcast
    this._testBtn.addEventListener('click', () => this._sendTest());

    // Delete
    this._deleteBtn.addEventListener('click', () => this._deleteChannel());

    // Mark dirty on any form change
    const markDirty = () => { this._editorDirty = true; };
    this._nameInput.addEventListener('input', markDirty);
    this._typeSelect.addEventListener('change', markDirty);
    this._endpointInput.addEventListener('input', markDirty);
    this._enabledToggle.addEventListener('change', markDirty);
    this._triggersContainer.addEventListener('change', markDirty);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Load channels and broadcast log from the DB.
   * @param {string} worldId
   */
  async init(worldId) {
    this._worldId = worldId;

    let channels = [];
    let log = [];

    try {
      if (window.api && window.api.db) {
        if (window.api.db.getBroadcastChannels) {
          channels = await window.api.db.getBroadcastChannels(worldId) || [];
        }
        if (window.api.db.getBroadcastLog) {
          log = await window.api.db.getBroadcastLog(worldId, 50) || [];
        }
      }
    } catch (err) {
      console.warn('[BroadcastTower] Failed to load data:', err);
    }

    this._channels = channels;
    this._log = log;

    this._renderChannelList();
    this._renderLog();

    if (this._channels.length > 0) {
      this._selectChannel(this._channels[0].id);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Channel list rendering
  // ═══════════════════════════════════════════════════════════════════

  _renderChannelList() {
    this._channelListEl.innerHTML = '';

    if (this._channels.length === 0) {
      const empty = this._mk('div', 'bt-channel-empty');
      empty.textContent = 'No channels configured yet.';
      this._channelListEl.appendChild(empty);
      return;
    }

    for (const ch of this._channels) {
      this._channelListEl.appendChild(this._buildChannelItem(ch));
    }
  }

  _buildChannelItem(ch) {
    const item = this._mk('div', 'bt-channel-item');
    item.setAttribute('role', 'listitem');
    item.setAttribute('tabindex', '0');
    item.dataset.id = ch.id;
    item.setAttribute('aria-label', `${ch.name} — ${ch.channel_type}`);
    if (ch.id === this._activeId) item.classList.add('bt-channel-item--active');
    if (!ch.enabled) item.classList.add('bt-channel-item--disabled');

    const meta = CHANNEL_TYPE_META[ch.channel_type] || CHANNEL_TYPE_META.webhook;

    const icon = this._mk('span', 'bt-channel-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = meta.icon;

    const info = this._mk('div', 'bt-channel-info');
    const nameEl = this._mk('div', 'bt-channel-name');
    nameEl.textContent = ch.name || 'Unnamed channel';
    const typeEl = this._mk('div', 'bt-channel-type');
    typeEl.textContent = `${meta.label} · ${relativeTime(ch.last_broadcast_at)}`;
    info.append(nameEl, typeEl);

    // Enabled toggle (mini)
    const toggleWrap = this._mk('label', 'bt-channel-toggle-wrap');
    const toggle = this._mk('input', 'bt-channel-toggle');
    toggle.type = 'checkbox';
    toggle.checked = !!ch.enabled;
    toggle.setAttribute('aria-label', ch.enabled ? 'Disable channel' : 'Enable channel');
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(!!ch.enabled));
    toggleWrap.appendChild(toggle);

    item.append(icon, info, toggleWrap);

    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._selectChannel(ch.id);
      }
    });

    return item;
  }

  _refreshChannelItem(ch) {
    const existing = this._channelListEl.querySelector(`[data-id="${ch.id}"]`);
    const newItem = this._buildChannelItem(ch);
    if (existing) {
      existing.replaceWith(newItem);
    } else {
      // Prepend newly created channels
      this._channelListEl.prepend(newItem);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Log rendering
  // ═══════════════════════════════════════════════════════════════════

  _renderLog() {
    this._logTbody.innerHTML = '';

    if (this._log.length === 0) {
      const tr = this._mk('tr', '');
      const td = this._mk('td', 'bt-log-empty');
      td.setAttribute('colspan', '4');
      td.textContent = 'No broadcasts yet.';
      tr.appendChild(td);
      this._logTbody.appendChild(tr);
      this._logCountEl.textContent = '0 entries';
      return;
    }

    this._logCountEl.textContent = `${this._log.length} entries`;

    for (const entry of this._log) {
      this._logTbody.appendChild(this._buildLogRow(entry));
    }
  }

  _buildLogRow(entry) {
    const tr = this._mk('tr', 'bt-log-row');

    const channel = this._channels.find(c => c.id === entry.channel_id);
    const statusMeta = LOG_STATUS_META[entry.status] || LOG_STATUS_META.sent;

    const tdTime = this._mk('td', 'bt-log-td bt-log-td--time');
    tdTime.textContent = shortDate(entry.created_at);

    const tdChannel = this._mk('td', 'bt-log-td bt-log-td--channel');
    if (channel) {
      const meta = CHANNEL_TYPE_META[channel.channel_type] || {};
      tdChannel.textContent = `${meta.icon || ''} ${channel.name}`.trim();
    } else {
      tdChannel.textContent = entry.channel_id ? '(deleted)' : '—';
      tdChannel.classList.add('bt-log-td--muted');
    }

    const tdEvent = this._mk('td', 'bt-log-td bt-log-td--event');
    tdEvent.textContent = entry.event_type;

    const tdStatus = this._mk('td', 'bt-log-td bt-log-td--status');
    const statusBadge = this._mk('span', `bt-log-status ${statusMeta.cssClass}`);
    statusBadge.textContent = statusMeta.label;
    tdStatus.appendChild(statusBadge);

    tr.append(tdTime, tdChannel, tdEvent, tdStatus);
    return tr;
  }

  _prependLogEntry(entry) {
    this._log.unshift(entry);
    this._logTbody.innerHTML = '';
    this._renderLog();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Channel CRUD
  // ═══════════════════════════════════════════════════════════════════

  _selectChannel(id) {
    this._activeId = id;
    const ch = this._channels.find(c => c.id === id);

    for (const item of this._channelListEl.querySelectorAll('.bt-channel-item')) {
      item.classList.toggle('bt-channel-item--active', item.dataset.id === id);
    }

    if (!ch) {
      this._showEditorEmptyState();
      return;
    }

    this._creating = false;
    this._showEditorForm(ch);
  }

  _showEditorEmptyState() {
    this._editorEmptyState.hidden = false;
    this._editorForm.hidden = true;
  }

  _showEditorForm(ch) {
    this._editorEmptyState.hidden = true;
    this._editorForm.hidden = false;
    this._editorDirty = false;

    const isNew = ch.id && ch.id.startsWith('local-');
    this._formTitle.textContent = isNew ? 'New Channel' : `Edit: ${escapeHTML(ch.name) || 'Untitled'}`;

    this._nameInput.value = ch.name || '';
    this._typeSelect.value = ch.channel_type || 'webhook';
    this._enabledToggle.checked = ch.enabled !== 0;
    this._endpointInput.value = ch.endpoint || '';

    const meta = CHANNEL_TYPE_META[ch.channel_type] || CHANNEL_TYPE_META.webhook;
    this._endpointLabel.textContent = meta.endpointLabel;
    this._endpointInput.placeholder = meta.placeholder;
    this._endpointInput.disabled = ch.channel_type === 'log';

    // Triggers
    let triggers = [];
    try {
      triggers = JSON.parse(ch.triggers_json || '[]');
    } catch (_) {}
    for (const cb of this._triggersContainer.querySelectorAll('input[type=checkbox]')) {
      cb.checked = triggers.includes(cb.value);
    }

    // Show delete btn only for persisted channels
    this._deleteBtn.hidden = isNew;
    this._testBtn.hidden = isNew;
  }

  _createNewChannel() {
    const optimistic = {
      id: localId(),
      world_id: this._worldId,
      name: '',
      channel_type: 'webhook',
      endpoint: '',
      triggers_json: '[]',
      enabled: 1,
      last_broadcast_at: null,
      created_at: new Date().toISOString(),
    };

    this._channels.unshift(optimistic);
    this._creating = true;
    this._activeId = optimistic.id;
    this._renderChannelList();
    this._showEditorForm(optimistic);
    this._nameInput.focus();
  }

  async _saveChannel() {
    const ch = this._activeChannel();
    if (!ch) return;

    const name = this._nameInput.value.trim();
    if (!name) {
      document.dispatchEvent(new CustomEvent('toast:show', {
        detail: { type: 'warning', title: 'Name Required', description: 'Please give this channel a name.' },
        bubbles: true,
      }));
      this._nameInput.focus();
      return;
    }

    const triggers = Array.from(
      this._triggersContainer.querySelectorAll('input[type=checkbox]:checked')
    ).map(cb => cb.value);

    const updates = {
      name,
      channel_type: this._typeSelect.value,
      endpoint: this._endpointInput.value.trim(),
      triggers_json: JSON.stringify(triggers),
      enabled: this._enabledToggle.checked ? 1 : 0,
    };

    // Apply locally
    Object.assign(ch, updates);

    const isNew = ch.id.startsWith('local-');

    if (window.api && window.api.db) {
      try {
        if (isNew && window.api.db.createBroadcastChannel) {
          const savedId = await window.api.db.createBroadcastChannel(this._worldId, updates);
          if (savedId) {
            const idx = this._channels.indexOf(ch);
            if (idx !== -1) this._channels[idx].id = savedId;
            ch.id = savedId;
            this._activeId = savedId;
          }
        } else if (!isNew && window.api.db.updateBroadcastChannel) {
          await window.api.db.updateBroadcastChannel(ch.id, updates);
        }
      } catch (err) {
        console.warn('[BroadcastTower] Could not persist channel:', err);
      }
    }

    this._creating = false;
    this._editorDirty = false;
    this._formTitle.textContent = `Edit: ${escapeHTML(ch.name)}`;
    this._deleteBtn.hidden = false;
    this._testBtn.hidden = false;

    this._refreshChannelItem(ch);

    document.dispatchEvent(new CustomEvent('toast:show', {
      detail: { type: 'success', title: 'Channel Saved', description: `"${ch.name}" has been saved.` },
      bubbles: true,
    }));
  }

  async _deleteChannel() {
    const ch = this._activeChannel();
    if (!ch) return;

    if (!confirm(`Delete channel "${ch.name}"? This cannot be undone.`)) return;

    const deletedId = ch.id;
    this._channels = this._channels.filter(c => c.id !== deletedId);
    this._renderChannelList();
    this._activeId = null;
    this._showEditorEmptyState();

    if (!deletedId.startsWith('local-') && window.api && window.api.db && window.api.db.deleteBroadcastChannel) {
      try {
        await window.api.db.deleteBroadcastChannel(deletedId);
      } catch (err) {
        console.warn('[BroadcastTower] Could not delete channel:', err);
      }
    }

    document.dispatchEvent(new CustomEvent('toast:show', {
      detail: { type: 'info', title: 'Channel Deleted', description: `"${ch.name}" removed.` },
      bubbles: true,
    }));
  }

  async _toggleChannelEnabled(id) {
    const ch = this._channels.find(c => c.id === id);
    if (!ch) return;

    ch.enabled = ch.enabled ? 0 : 1;
    this._refreshChannelItem(ch);

    // If this is the active channel, sync the toggle in the form
    if (id === this._activeId) {
      this._enabledToggle.checked = !!ch.enabled;
    }

    if (!id.startsWith('local-') && window.api && window.api.db && window.api.db.updateBroadcastChannel) {
      try {
        await window.api.db.updateBroadcastChannel(id, { enabled: ch.enabled });
      } catch (err) {
        console.warn('[BroadcastTower] Could not toggle channel enabled:', err);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Test broadcast
  // ═══════════════════════════════════════════════════════════════════

  async _sendTest() {
    const ch = this._activeChannel();
    if (!ch) return;

    const eventType = this._previewEventSelect.value || TRIGGER_EVENTS[0].value;
    const payloadRaw = PAYLOAD_TEMPLATES[eventType] || '{}';

    // Fill template placeholders with mock values
    const payload = payloadRaw
      .replace(/\{\{worldId\}\}/g, this._worldId || 'world-1')
      .replace(/\{\{taskId\}\}/g, 'task-abc123')
      .replace(/\{\{taskTitle\}\}/g, 'Example Task')
      .replace(/\{\{questId\}\}/g, 'quest-xyz')
      .replace(/\{\{questTitle\}\}/g, 'Example Quest')
      .replace(/\{\{incidentId\}\}/g, 'inc-001')
      .replace(/\{\{title\}\}/g, 'Example Incident')
      .replace(/\{\{severity\}\}/g, 'medium')
      .replace(/\{\{zone\}\}/g, 'globe-room')
      .replace(/\{\{xp\}\}/g, '150')
      .replace(/\{\{count\}\}/g, '5')
      .replace(/\{\{date\}\}/g, new Date().toISOString().slice(0, 10))
      .replace(/\{\{timestamp\}\}/g, new Date().toISOString());

    // Build log entry
    const logEntry = {
      id: localId(),
      world_id: this._worldId,
      channel_id: ch.id,
      event_type: eventType,
      payload_json: payload,
      status: 'test',
      created_at: new Date().toISOString(),
    };

    ch.last_broadcast_at = logEntry.created_at;
    this._refreshChannelItem(ch);
    this._prependLogEntry(logEntry);

    // Persist log
    if (window.api && window.api.db && window.api.db.createBroadcastLog) {
      try {
        await window.api.db.createBroadcastLog(this._worldId, {
          channel_id: ch.id.startsWith('local-') ? null : ch.id,
          event_type: eventType,
          payload_json: payload,
          status: 'test',
        });
      } catch (err) {
        console.warn('[BroadcastTower] Could not persist test log:', err);
      }
    }

    // Emit event
    document.dispatchEvent(new CustomEvent('broadcast:sent', {
      detail: { worldId: this._worldId, channelId: ch.id, eventType },
      bubbles: true,
    }));

    document.dispatchEvent(new CustomEvent('toast:show', {
      detail: {
        type: 'success',
        title: 'Test Sent',
        description: `Test broadcast for "${eventType}" logged to "${ch.name}".`,
      },
      bubbles: true,
    }));
  }

  // ═══════════════════════════════════════════════════════════════════
  // Utility
  // ═══════════════════════════════════════════════════════════════════

  _activeChannel() {
    return this._channels.find(c => c.id === this._activeId) || null;
  }

  /**
   * Create a DOM element with a CSS class.
   * @param {string} tag
   * @param {string} className
   * @returns {HTMLElement}
   */
  _mk(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }
}
