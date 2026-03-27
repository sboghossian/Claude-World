/**
 * exchange.js — The Exchange zone: API integration hub
 *
 * Displays connected external services (GitHub, Notion, Slack, etc.) with
 * status indicators, latency pings, webhook event log, and an add-integration
 * form. Reads/writes integrations via window.api.db.* IPC calls.
 *
 * Events emitted:
 *   dispatch:task-complete — { worldId, zoneType: 'exchange', success: true }
 *     Fired after a successful ping.
 */

// ── Service icon map ──────────────────────────────────────────────

const SERVICE_ICONS = {
  github:    '🐙',
  notion:    '📝',
  slack:     '💬',
  discord:   '🎮',
  linear:    '📐',
  jira:      '🗂️',
  figma:     '🎨',
  stripe:    '💳',
  sendgrid:  '📧',
  twilio:    '📱',
  zapier:    '⚡',
  webhook:   '🪝',
  custom:    '🔌',
  airtable:  '📊',
  hubspot:   '🟠',
  salesforce:'☁️',
};

// ── Default seed integrations (shown when no DB data is available) ─

const SEED_INTEGRATIONS = [
  { id: 'seed-1', name: 'GitHub',  service: 'github',  status: 'connected',    latency_ms: 82,  webhook_count: 14, last_pinged_at: new Date(Date.now() - 300000).toISOString() },
  { id: 'seed-2', name: 'Notion',  service: 'notion',  status: 'connected',    latency_ms: 120, webhook_count: 3,  last_pinged_at: new Date(Date.now() - 900000).toISOString() },
  { id: 'seed-3', name: 'Slack',   service: 'slack',   status: 'disconnected', latency_ms: 0,   webhook_count: 0,  last_pinged_at: null },
  { id: 'seed-4', name: 'Stripe',  service: 'stripe',  status: 'error',        latency_ms: 0,   webhook_count: 5,  last_pinged_at: new Date(Date.now() - 7200000).toISOString() },
];

const SEED_WEBHOOKS = [
  { id: 'wh-1', direction: 'inbound',  event_type: 'push',            status: 'received', created_at: new Date(Date.now() - 120000).toISOString(),  integration_id: 'seed-1' },
  { id: 'wh-2', direction: 'outbound', event_type: 'notification',    status: 'sent',     created_at: new Date(Date.now() - 240000).toISOString(),  integration_id: 'seed-2' },
  { id: 'wh-3', direction: 'inbound',  event_type: 'pull_request',    status: 'received', created_at: new Date(Date.now() - 600000).toISOString(),  integration_id: 'seed-1' },
  { id: 'wh-4', direction: 'outbound', event_type: 'page_update',     status: 'sent',     created_at: new Date(Date.now() - 1800000).toISOString(), integration_id: 'seed-2' },
  { id: 'wh-5', direction: 'inbound',  event_type: 'payment.success', status: 'error',    created_at: new Date(Date.now() - 7200000).toISOString(), integration_id: 'seed-4' },
];

// ── Helpers ───────────────────────────────────────────────────────

/** Emit a custom event on document. */
function emit(name, detail = {}) {
  document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
}

/** Create an element with optional className and attribute map. */
function el(tag, className, attrs = {}) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'textContent') { e.textContent = v; continue; }
    if (k === 'innerHTML')   { e.innerHTML = v; continue; }
    e.setAttribute(k, v);
  }
  return e;
}

/** Format an ISO date string as relative time. */
function relativeTime(iso) {
  if (!iso) return 'never';
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  } catch {
    return '—';
  }
}

/** Format an ISO date string as HH:MM:SS. */
function timeStamp(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour12: false });
  } catch {
    return '??:??:??';
  }
}

/** Return the icon for a service key. */
function serviceIcon(service) {
  return SERVICE_ICONS[service] || SERVICE_ICONS.custom;
}

/** Classify latency (ms) into a CSS modifier. */
function latencyClass(ms) {
  if (!ms || ms <= 0) return 'unknown';
  if (ms < 200)  return 'good';
  if (ms < 800)  return 'ok';
  return 'slow';
}

/** Show a floating toast. */
function showToast(message, type = 'info') {
  const toast = el('div', `exchange-zone__toast exchange-zone__toast--${type}`, {
    textContent: message,
  });
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 320);
  }, 2800);
}

// ── Safe API wrappers ─────────────────────────────────────────────

async function apiGetIntegrations(worldId) {
  try {
    if (window.api?.db?.getIntegrations) {
      const rows = await window.api.db.getIntegrations(worldId);
      if (Array.isArray(rows) && rows.length > 0) return rows;
    }
  } catch (err) {
    console.warn('[exchange] getIntegrations failed:', err);
  }
  return SEED_INTEGRATIONS;
}

async function apiCreateIntegration(worldId, data) {
  try {
    if (window.api?.db?.createIntegration) {
      return await window.api.db.createIntegration(worldId, data);
    }
  } catch (err) {
    console.warn('[exchange] createIntegration failed:', err);
  }
  // Return a mock row so the UI can optimistically update
  return {
    id: 'local-' + Date.now(),
    world_id: worldId,
    ...data,
    status: 'disconnected',
    latency_ms: 0,
    webhook_count: 0,
    created_at: new Date().toISOString(),
  };
}

async function apiUpdateIntegration(integrationId, updates) {
  try {
    if (window.api?.db?.updateIntegration) {
      return await window.api.db.updateIntegration(integrationId, updates);
    }
  } catch (err) {
    console.warn('[exchange] updateIntegration failed:', err);
  }
  return null;
}

async function apiGetWebhookEvents(worldId, limit = 50) {
  try {
    if (window.api?.db?.getWebhookEvents) {
      const rows = await window.api.db.getWebhookEvents(worldId, limit);
      if (Array.isArray(rows) && rows.length > 0) return rows;
    }
  } catch (err) {
    console.warn('[exchange] getWebhookEvents failed:', err);
  }
  return SEED_WEBHOOKS;
}

async function apiPing(provider) {
  if (window.api?.ai?.ping) {
    return await window.api.ai.ping(provider);
  }
  // Simulate latency
  await new Promise(r => setTimeout(r, 60 + Math.random() * 200));
  return { ok: true };
}

// ── Exchange class ────────────────────────────────────────────────

export class Exchange {
  constructor() {
    this._worldId       = null;
    this._integrations  = [];
    this._webhooks      = [];
    this._el            = null;
    this._stylesLoaded  = false;
    // Internal DOM refs
    this._gridEl        = null;
    this._statsEl       = null;
    this._webhookBodyEl = null;
    this._addBodyEl     = null;
    this._addToggleEl   = null;
  }

  // ── CSS loader ───────────────────────────────────────────────────

  _loadStyles() {
    if (this._stylesLoaded) return;
    if (document.getElementById('exchange-styles')) {
      this._stylesLoaded = true;
      return;
    }
    const link = document.createElement('link');
    link.id   = 'exchange-styles';
    link.rel  = 'stylesheet';
    link.href = '../zones/exchange.css';
    document.head.appendChild(link);
    this._stylesLoaded = true;
  }

  // ── Public: render ───────────────────────────────────────────────

  render() {
    this._loadStyles();

    const root = el('div', 'exchange-zone');
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'The Exchange — API integration hub');
    this._el = root;

    // Description
    root.appendChild(el('div', 'exchange-zone__description', {
      textContent: 'Connect external services, monitor webhook traffic, and test integration health.',
    }));

    // Stats bar
    this._statsEl = this._buildStats();
    root.appendChild(this._statsEl);

    // Services section
    root.appendChild(this._buildSectionTitle('Connected Services'));
    this._gridEl = el('div', 'exchange-zone__grid');
    this._gridEl.setAttribute('role', 'list');
    root.appendChild(this._gridEl);

    // Webhook log
    root.appendChild(this._buildSectionTitle('Webhook Log'));
    root.appendChild(this._buildWebhookLog());

    // Add integration
    root.appendChild(this._buildSectionTitle('Add Integration'));
    root.appendChild(this._buildAddForm());

    // Render loading skeletons immediately
    this._renderSkeletons();

    return root;
  }

  // ── Public: init ─────────────────────────────────────────────────

  async init(worldId) {
    this._worldId = worldId;
    await this._loadData();
    this._renderAll();
  }

  // ── Data loading ──────────────────────────────────────────────────

  async _loadData() {
    const [integrations, webhooks] = await Promise.all([
      apiGetIntegrations(this._worldId),
      apiGetWebhookEvents(this._worldId, 50),
    ]);
    this._integrations = integrations;
    this._webhooks     = webhooks;
  }

  // ── Render helpers ────────────────────────────────────────────────

  _renderAll() {
    this._renderStats();
    this._renderGrid();
    this._renderWebhookLog();
  }

  _buildSectionTitle(text) {
    return el('div', 'exchange-zone__section-title', { textContent: text });
  }

  // Stats bar
  _buildStats() {
    const bar = el('div', 'exchange-zone__stats');
    bar.setAttribute('aria-live', 'polite');
    const items = [
      { id: 'stat-total',   label: 'Total',    value: '—' },
      { id: 'stat-active',  label: 'Active',   value: '—' },
      { id: 'stat-webhooks',label: 'Webhooks', value: '—' },
    ];
    for (const item of items) {
      const wrap = el('div', 'exchange-zone__stat-item');
      const val  = el('div', 'exchange-zone__stat-value', { textContent: item.value });
      val.id     = item.id;
      const lbl  = el('div', 'exchange-zone__stat-label', { textContent: item.label });
      wrap.appendChild(val);
      wrap.appendChild(lbl);
      bar.appendChild(wrap);
    }
    return bar;
  }

  _renderStats() {
    const total   = this._integrations.length;
    const active  = this._integrations.filter(i => i.status === 'connected').length;
    const webhooks = this._integrations.reduce((s, i) => s + (i.webhook_count || 0), 0);

    const setVal = (id, v) => {
      const el = this._statsEl?.querySelector('#' + id);
      if (el) el.textContent = v;
    };
    setVal('stat-total',    total);
    setVal('stat-active',   active);
    setVal('stat-webhooks', webhooks);
  }

  // Service grid
  _renderSkeletons() {
    if (!this._gridEl) return;
    this._gridEl.innerHTML = '';
    const skeletonWrap = el('div', 'exchange-zone__skeleton');
    for (let i = 0; i < 2; i++) {
      skeletonWrap.appendChild(el('div', 'exchange-zone__skeleton-row'));
    }
    this._gridEl.appendChild(skeletonWrap);
  }

  _renderGrid() {
    if (!this._gridEl) return;
    this._gridEl.innerHTML = '';

    if (this._integrations.length === 0) {
      const empty = el('div', 'exchange-zone__empty');
      const icon  = el('div', 'exchange-zone__empty-icon', { textContent: '🔌' });
      const text  = el('div', 'exchange-zone__empty-text', {
        textContent: 'No integrations yet. Add one below to get started.',
      });
      empty.appendChild(icon);
      empty.appendChild(text);
      this._gridEl.appendChild(empty);
      return;
    }

    for (const integration of this._integrations) {
      this._gridEl.appendChild(this._buildCard(integration));
    }
  }

  _buildCard(integration) {
    const card = el('div', `exchange-zone__card exchange-zone__card--${integration.status}`);
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', integration.name);

    // Header
    const header = el('div', 'exchange-zone__card-header');
    const icon   = el('div', 'exchange-zone__card-icon', {
      textContent: serviceIcon(integration.service),
    });
    icon.setAttribute('aria-hidden', 'true');
    const name = el('span', 'exchange-zone__card-name', { textContent: integration.name });
    const dot  = el('div', `exchange-zone__status-dot exchange-zone__status-dot--${integration.status}`);
    dot.setAttribute('aria-label', `Status: ${integration.status}`);
    header.appendChild(icon);
    header.appendChild(name);
    header.appendChild(dot);
    card.appendChild(header);

    // Info rows
    const info = el('div', 'exchange-zone__card-info');

    // Status
    const statusRow = el('div', 'exchange-zone__card-row');
    statusRow.appendChild(el('span', 'exchange-zone__card-label', { textContent: 'Status' }));
    statusRow.appendChild(el('span', 'exchange-zone__card-value', { textContent: integration.status }));
    info.appendChild(statusRow);

    // Last pinged
    const pingRow = el('div', 'exchange-zone__card-row');
    pingRow.appendChild(el('span', 'exchange-zone__card-label', { textContent: 'Last ping' }));
    const pingVal = el('span', 'exchange-zone__card-value', {
      textContent: relativeTime(integration.last_pinged_at),
    });
    pingRow.appendChild(pingVal);
    info.appendChild(pingRow);

    // Latency
    const latRow = el('div', 'exchange-zone__card-row');
    latRow.appendChild(el('span', 'exchange-zone__card-label', { textContent: 'Latency' }));
    const latEl = el('span', `exchange-zone__latency exchange-zone__latency--${latencyClass(integration.latency_ms)}`);
    latEl.textContent = integration.latency_ms > 0 ? `${integration.latency_ms}ms` : '—';
    latRow.appendChild(latEl);
    info.appendChild(latRow);

    // Webhooks
    const wbRow = el('div', 'exchange-zone__card-row');
    wbRow.appendChild(el('span', 'exchange-zone__card-label', { textContent: 'Webhooks' }));
    wbRow.appendChild(el('span', 'exchange-zone__card-value exchange-zone__card-value--accent', {
      textContent: integration.webhook_count || 0,
    }));
    info.appendChild(wbRow);

    card.appendChild(info);

    // Ping button
    const pingBtn = el('button', 'exchange-zone__ping-btn', { textContent: '⚡ Ping' });
    pingBtn.setAttribute('aria-label', `Ping ${integration.name}`);
    pingBtn.addEventListener('click', () => this._pingCard(integration, pingBtn, latEl, dot, pingVal));
    card.appendChild(pingBtn);

    return card;
  }

  async _pingCard(integration, btn, latEl, dot, pingValEl) {
    btn.disabled = true;
    btn.textContent = 'Pinging…';
    btn.classList.add('exchange-zone__ping-btn--pinging');

    // Show spinner in latency slot
    const spinner = el('div', 'exchange-zone__spinner');
    latEl.textContent = '';
    latEl.appendChild(spinner);

    try {
      const t0 = performance.now();
      await apiPing(integration.service);
      const ms = Math.round(performance.now() - t0);

      // Update local state
      integration.latency_ms    = ms;
      integration.last_pinged_at = new Date().toISOString();
      integration.status        = 'connected';

      // Persist
      await apiUpdateIntegration(integration.id, {
        latency_ms:     ms,
        last_pinged_at: integration.last_pinged_at,
        status:         'connected',
      });

      // Update DOM
      latEl.textContent = `${ms}ms`;
      latEl.className   = `exchange-zone__latency exchange-zone__latency--${latencyClass(ms)}`;
      dot.className     = 'exchange-zone__status-dot exchange-zone__status-dot--connected';
      dot.setAttribute('aria-label', 'Status: connected');
      pingValEl.textContent = 'just now';

      btn.textContent = '✓ Done';

      emit('dispatch:task-complete', {
        worldId:  this._worldId,
        zoneType: 'exchange',
        success:  true,
      });

      showToast(`${integration.name} responded in ${ms}ms`, 'success');
    } catch (err) {
      integration.status = 'error';
      dot.className = 'exchange-zone__status-dot exchange-zone__status-dot--error';
      dot.setAttribute('aria-label', 'Status: error');
      latEl.textContent = 'Error';
      latEl.className   = 'exchange-zone__latency exchange-zone__latency--slow';

      btn.textContent = '⚠ Retry';
      showToast(`Ping failed: ${err.message || 'Unknown error'}`, 'error');
    } finally {
      btn.disabled = false;
      btn.classList.remove('exchange-zone__ping-btn--pinging');
      setTimeout(() => {
        if (btn.textContent !== '⚡ Ping') {
          btn.textContent = '⚡ Ping';
        }
      }, 3000);
    }
  }

  // Webhook log
  _buildWebhookLog() {
    const container = el('div', 'exchange-zone__webhook-log');

    const header = el('div', 'exchange-zone__webhook-log-header');
    header.appendChild(el('div', 'exchange-zone__webhook-log-title', { textContent: 'Recent Events' }));
    const clearBtn = el('button', 'exchange-zone__webhook-log-clear', { textContent: 'Clear' });
    clearBtn.addEventListener('click', () => {
      this._webhooks = [];
      this._renderWebhookLog();
    });
    header.appendChild(clearBtn);
    container.appendChild(header);

    this._webhookBodyEl = el('div', 'exchange-zone__webhook-log-body');
    this._webhookBodyEl.setAttribute('role', 'log');
    this._webhookBodyEl.setAttribute('aria-live', 'polite');
    container.appendChild(this._webhookBodyEl);

    return container;
  }

  _renderWebhookLog() {
    if (!this._webhookBodyEl) return;
    this._webhookBodyEl.innerHTML = '';

    if (this._webhooks.length === 0) {
      this._webhookBodyEl.appendChild(el('div', 'exchange-zone__webhook-empty', {
        textContent: 'No webhook events yet.',
      }));
      return;
    }

    for (const event of this._webhooks) {
      const row = el('div', 'exchange-zone__webhook-row');

      // Time
      const timeEl = el('span', 'exchange-zone__webhook-time', {
        textContent: timeStamp(event.created_at),
      });
      row.appendChild(timeEl);

      // Direction badge
      const dirEl = el('span',
        `exchange-zone__webhook-dir exchange-zone__webhook-dir--${event.direction}`,
        { textContent: event.direction === 'inbound' ? 'IN' : 'OUT' },
      );
      row.appendChild(dirEl);

      // Event type
      const typeEl = el('span', 'exchange-zone__webhook-event', { textContent: event.event_type });
      row.appendChild(typeEl);

      // Status
      const statusEl = el('span', 'exchange-zone__webhook-status', { textContent: event.status });
      row.appendChild(statusEl);

      this._webhookBodyEl.appendChild(row);
    }

    // Scroll to bottom
    this._webhookBodyEl.scrollTop = this._webhookBodyEl.scrollHeight;
  }

  // Add integration form
  _buildAddForm() {
    const section = el('div', 'exchange-zone__add-section');

    // Collapsible header
    const header = el('div', 'exchange-zone__add-header');
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', 'false');
    header.setAttribute('aria-controls', 'exchange-add-body');

    const title  = el('div', 'exchange-zone__add-header-title', { textContent: '+ New Integration' });
    this._addToggleEl = el('span', 'exchange-zone__add-toggle', { textContent: '▼' });
    header.appendChild(title);
    header.appendChild(this._addToggleEl);
    section.appendChild(header);

    // Body (hidden by default)
    this._addBodyEl = el('div', 'exchange-zone__add-body exchange-zone__add-body--hidden');
    this._addBodyEl.id = 'exchange-add-body';

    // Name
    const nameField = el('div', 'exchange-zone__field');
    const nameLbl   = el('label', 'exchange-zone__field-label', { textContent: 'Service Name' });
    nameLbl.htmlFor = 'exchange-int-name';
    const nameInput = el('input', 'exchange-zone__field-input');
    nameInput.id          = 'exchange-int-name';
    nameInput.type        = 'text';
    nameInput.placeholder = 'e.g. My GitHub';
    nameField.appendChild(nameLbl);
    nameField.appendChild(nameInput);
    this._addBodyEl.appendChild(nameField);

    // Endpoint
    const epField = el('div', 'exchange-zone__field');
    const epLbl   = el('label', 'exchange-zone__field-label', { textContent: 'Endpoint URL' });
    epLbl.htmlFor = 'exchange-int-endpoint';
    const epInput = el('input', 'exchange-zone__field-input');
    epInput.id          = 'exchange-int-endpoint';
    epInput.type        = 'url';
    epInput.placeholder = 'https://api.example.com/webhook';
    epField.appendChild(epLbl);
    epField.appendChild(epInput);
    this._addBodyEl.appendChild(epField);

    // Auth token (display only)
    const authField = el('div', 'exchange-zone__field');
    const authLbl   = el('label', 'exchange-zone__field-label', { textContent: 'Auth Token (display only)' });
    authLbl.htmlFor = 'exchange-int-token';
    const authInput = el('input', 'exchange-zone__field-input');
    authInput.id          = 'exchange-int-token';
    authInput.type        = 'password';
    authInput.placeholder = 'Bearer token or API key…';
    authField.appendChild(authLbl);
    authField.appendChild(authInput);
    this._addBodyEl.appendChild(authField);

    // Submit
    const addBtn = el('button', 'exchange-zone__add-btn', { textContent: 'Add Integration' });
    addBtn.addEventListener('click', async () => {
      const name     = nameInput.value.trim();
      const endpoint = epInput.value.trim();
      if (!name) {
        nameInput.focus();
        nameInput.style.borderColor = 'var(--accent-red, #ef4444)';
        setTimeout(() => { nameInput.style.borderColor = ''; }, 1500);
        return;
      }

      addBtn.disabled    = true;
      addBtn.textContent = 'Adding…';

      try {
        const newIntegration = await apiCreateIntegration(this._worldId, {
          name,
          service:      this._guessService(name),
          endpoint_url: endpoint,
          status:       'disconnected',
        });

        this._integrations.unshift(newIntegration);
        this._renderGrid();
        this._renderStats();

        // Reset form
        nameInput.value  = '';
        epInput.value    = '';
        authInput.value  = '';
        this._toggleAddForm(false);

        showToast(`${name} integration added`, 'success');
      } catch (err) {
        showToast(`Failed to add: ${err.message || 'Unknown error'}`, 'error');
      } finally {
        addBtn.disabled    = false;
        addBtn.textContent = 'Add Integration';
      }
    });
    this._addBodyEl.appendChild(addBtn);
    section.appendChild(this._addBodyEl);

    // Toggle logic
    const toggle = () => {
      const isOpen = !this._addBodyEl.classList.contains('exchange-zone__add-body--hidden');
      this._toggleAddForm(!isOpen);
    };
    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });

    return section;
  }

  _toggleAddForm(open) {
    if (!this._addBodyEl || !this._addToggleEl) return;
    if (open) {
      this._addBodyEl.classList.remove('exchange-zone__add-body--hidden');
      this._addToggleEl.classList.add('exchange-zone__add-toggle--open');
    } else {
      this._addBodyEl.classList.add('exchange-zone__add-body--hidden');
      this._addToggleEl.classList.remove('exchange-zone__add-toggle--open');
    }
  }

  /** Guess service type from name string. */
  _guessService(name) {
    const lower = name.toLowerCase();
    for (const key of Object.keys(SERVICE_ICONS)) {
      if (lower.includes(key)) return key;
    }
    return 'custom';
  }
}
