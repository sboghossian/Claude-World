/**
 * council.js — The Council zone: multi-model AI comparison
 *
 * Renders inside the panel system. Sends the same prompt to multiple
 * AI models simultaneously and displays responses side-by-side for comparison.
 *
 * Events emitted:
 *   dispatch:task-complete  — { provider, model, sessionId, responseId }
 */

// ── Provider definitions ──────────────────────────────────────────

const COUNCIL_PROVIDERS = [
  {
    id: 'anthropic',
    name: 'Claude',
    model: 'claude-3-5-sonnet-20241022',
    icon: '\uD83D\uDFE0',
    color: '#d97706',
    colorDim: '#d9770620',
    available: () => _hasKey('anthropic'),
    comingSoon: false,
  },
  {
    id: 'openai',
    name: 'GPT-4o',
    model: 'gpt-4o',
    icon: '\uD83D\uDFE2',
    color: '#10a37f',
    colorDim: '#10a37f20',
    available: () => _hasKey('openai'),
    comingSoon: false,
  },
  {
    id: 'google',
    name: 'Gemini',
    model: 'gemini-1.5-pro',
    icon: '\uD83D\uDD35',
    color: '#4285f4',
    colorDim: '#4285f420',
    available: () => false,
    comingSoon: true,
    hint: 'Add key in Docks',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    model: 'mistral-large-latest',
    icon: '\u26AB',
    color: '#9ca3af',
    colorDim: '#9ca3af20',
    available: () => false,
    comingSoon: true,
    hint: 'Add key in Docks',
  },
];

// ── Key availability cache ────────────────────────────────────────

const _keyCache = new Set();
let _keyCacheReady = false;

async function _loadKeyCache() {
  try {
    if (window.api && window.api.keys && window.api.keys.list) {
      const keys = await window.api.keys.list();
      _keyCache.clear();
      for (const k of keys) {
        if (k.is_active) _keyCache.add(k.provider);
      }
    }
  } catch (err) {
    console.warn('[council] Could not load key cache:', err);
  }
  _keyCacheReady = true;
}

function _hasKey(provider) {
  return _keyCache.has(provider);
}

// ── Helpers ───────────────────────────────────────────────────────

function emit(name, detail = {}) {
  document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
}

function el(tag, className, attrs = {}) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'textContent') { e.textContent = v; continue; }
    if (k === 'innerHTML') { e.innerHTML = v; continue; }
    e.setAttribute(k, v);
  }
  return e;
}

function formatCost(usd) {
  if (!usd || usd === 0) return '$0.000';
  if (usd < 0.001) return `$${usd.toFixed(5)}`;
  return `$${usd.toFixed(4)}`;
}

function countWords(text) {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ── DB helpers ────────────────────────────────────────────────────

async function _dbRun(sql, params = []) {
  try {
    if (window.api && window.api.db && window.api.db.run) {
      return await window.api.db.run(sql, params);
    }
  } catch (err) {
    console.warn('[council] DB run failed:', err);
  }
  return null;
}

async function _dbAll(sql, params = []) {
  try {
    if (window.api && window.api.db && window.api.db.all) {
      return await window.api.db.all(sql, params);
    }
  } catch (err) {
    console.warn('[council] DB all failed:', err);
  }
  return [];
}

async function _dbGet(sql, params = []) {
  try {
    if (window.api && window.api.db && window.api.db.get) {
      return await window.api.db.get(sql, params);
    }
  } catch (err) {
    console.warn('[council] DB get failed:', err);
  }
  return null;
}

function _generateId() {
  // Simple hex id matching the SQL DEFAULT pattern
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Council class ─────────────────────────────────────────────────

export class Council {
  constructor() {
    this._worldId = null;
    this._root = null;
    this._selectedModels = new Set();
    this._sessionInProgress = false;
    this._historyCollapsed = true;

    // DOM refs populated during render
    this._promptTextarea = null;
    this._conveneBtn = null;
    this._responseGrid = null;
    this._compareSection = null;
    this._historyList = null;
    this._memberCount = null;
  }

  // ── Public: render ──────────────────────────────────────────────

  render(worldId) {
    this._worldId = worldId;

    const root = el('div', 'council');
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'The Council — multi-model AI comparison');
    this._root = root;

    root.appendChild(this._buildHeader());
    root.appendChild(this._buildPromptArea());
    root.appendChild(this._buildResponseArea());
    root.appendChild(this._buildHistoryPanel());

    // Kick off async init
    this._init();

    return root;
  }

  // ── Init (async after render) ───────────────────────────────────

  async _init() {
    await _loadKeyCache();
    this._refreshModelSelector();
    this._updateConveneButton();
    await this.loadHistory(this._worldId);
  }

  // ── Header ──────────────────────────────────────────────────────

  _buildHeader() {
    const header = el('div', 'council__header');

    const titleBlock = el('div', 'council__title-block');
    const title = el('h2', 'council__title', { textContent: '\uD83C\uDFDB\uFE0F The Council' });
    const subtitle = el('p', 'council__subtitle', {
      textContent: 'One question. Many minds. You decide.',
    });
    titleBlock.appendChild(title);
    titleBlock.appendChild(subtitle);

    const meta = el('div', 'council__meta');
    const memberCount = el('span', 'council__member-count', { textContent: '\u2026' });
    this._memberCount = memberCount;
    meta.appendChild(memberCount);

    header.appendChild(titleBlock);
    header.appendChild(meta);
    return header;
  }

  // ── Prompt area ─────────────────────────────────────────────────

  _buildPromptArea() {
    const area = el('div', 'council__prompt-area');

    // Textarea
    const textarea = el('textarea', 'council__prompt-input');
    textarea.setAttribute('placeholder', 'Ask the Council\u2026');
    textarea.setAttribute('rows', '4');
    textarea.setAttribute('aria-label', 'Council prompt');
    textarea.addEventListener('input', () => this._updateConveneButton());
    this._promptTextarea = textarea;
    area.appendChild(textarea);

    // Model selector row
    const selectorRow = el('div', 'council__model-selector');
    selectorRow.setAttribute('role', 'group');
    selectorRow.setAttribute('aria-label', 'Select models for the council');
    this._selectorRow = selectorRow;
    area.appendChild(selectorRow);

    // Convene button
    const conveneBtn = el('button', 'council__convene-btn');
    conveneBtn.textContent = 'Convene the Council \u2192';
    conveneBtn.disabled = true;
    conveneBtn.setAttribute('aria-label', 'Convene the Council — send prompt to all selected models');
    conveneBtn.addEventListener('click', () => this._onConvene());
    this._conveneBtn = conveneBtn;
    area.appendChild(conveneBtn);

    return area;
  }

  _refreshModelSelector() {
    if (!this._selectorRow) return;
    this._selectorRow.innerHTML = '';

    let seated = 0;
    for (const provider of COUNCIL_PROVIDERS) {
      const isAvailable = !provider.comingSoon && provider.available();
      const chip = el('label', 'council__model-chip');
      chip.setAttribute('title', provider.comingSoon ? (provider.hint || 'Coming soon') : provider.name);

      if (!isAvailable) {
        chip.classList.add('council__model-chip--disabled');
      }

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.value = provider.id;
      checkbox.disabled = !isAvailable;
      checkbox.setAttribute('aria-label', provider.name);

      if (isAvailable && this._selectedModels.has(provider.id)) {
        checkbox.checked = true;
        seated++;
      }

      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this._selectedModels.add(provider.id);
        } else {
          this._selectedModels.delete(provider.id);
        }
        this._updateConveneButton();
        this._updateMemberCount();
      });

      const icon = el('span', 'council__model-icon', { textContent: provider.icon });
      icon.style.color = provider.color;
      icon.setAttribute('aria-hidden', 'true');

      const name = el('span', 'council__model-name', { textContent: provider.name });

      if (provider.comingSoon) {
        const badge = el('span', 'council__model-badge', { textContent: provider.hint || 'Soon' });
        chip.appendChild(checkbox);
        chip.appendChild(icon);
        chip.appendChild(name);
        chip.appendChild(badge);
      } else {
        chip.appendChild(checkbox);
        chip.appendChild(icon);
        chip.appendChild(name);
      }

      this._selectorRow.appendChild(chip);
    }

    this._updateMemberCount();
  }

  _updateMemberCount() {
    if (!this._memberCount) return;
    const count = this._selectedModels.size;
    this._memberCount.textContent = count === 0
      ? 'No councilors seated'
      : `${count} Councilor${count !== 1 ? 's' : ''} seated`;
  }

  _updateConveneButton() {
    if (!this._conveneBtn || !this._promptTextarea) return;
    const hasPrompt = this._promptTextarea.value.trim().length > 0;
    const hasModels = this._selectedModels.size >= 2;
    this._conveneBtn.disabled = !hasPrompt || !hasModels || this._sessionInProgress;
  }

  // ── Response area ───────────────────────────────────────────────

  _buildResponseArea() {
    const area = el('div', 'council__response-area');
    area.setAttribute('aria-live', 'polite');
    area.setAttribute('aria-label', 'Council responses');

    const grid = el('div', 'council__response-grid');
    this._responseGrid = grid;
    area.appendChild(grid);

    const compareSection = el('div', 'council__compare-section');
    compareSection.style.display = 'none';
    this._compareSection = compareSection;
    area.appendChild(compareSection);

    return area;
  }

  // ── History panel ───────────────────────────────────────────────

  _buildHistoryPanel() {
    const panel = el('div', 'council__history-panel');

    const toggle = el('button', 'council__history-toggle');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'council-history-list');

    const toggleIcon = el('span', 'council__history-toggle-icon', { textContent: '\u25B6' });
    const toggleLabel = el('span', null, { textContent: 'Recent Sessions' });
    toggle.appendChild(toggleIcon);
    toggle.appendChild(toggleLabel);

    toggle.addEventListener('click', () => {
      this._historyCollapsed = !this._historyCollapsed;
      toggleIcon.textContent = this._historyCollapsed ? '\u25B6' : '\u25BC';
      toggle.setAttribute('aria-expanded', String(!this._historyCollapsed));
      historyList.style.display = this._historyCollapsed ? 'none' : 'block';
    });

    panel.appendChild(toggle);

    const historyList = el('div', 'council__history-list');
    historyList.id = 'council-history-list';
    historyList.style.display = 'none';
    historyList.setAttribute('role', 'list');
    historyList.setAttribute('aria-label', 'Past council sessions');
    this._historyList = historyList;
    panel.appendChild(historyList);

    return panel;
  }

  // ── Convene logic ───────────────────────────────────────────────

  async _onConvene() {
    if (this._sessionInProgress) return;
    const prompt = this._promptTextarea.value.trim();
    if (!prompt || this._selectedModels.size < 2) return;

    const selectedProviders = COUNCIL_PROVIDERS.filter(p => this._selectedModels.has(p.id));
    await this.convene(this._worldId, prompt, selectedProviders);
  }

  /**
   * convene — Send a prompt to multiple models in parallel.
   * @param {string} worldId
   * @param {string} prompt
   * @param {Array}  selectedModels — array of provider objects
   */
  async convene(worldId, prompt, selectedModels) {
    this._sessionInProgress = true;
    this._updateConveneButton();

    // 1. Save council session
    const sessionId = _generateId();
    const modelsJson = JSON.stringify(selectedModels.map(p => ({ provider: p.id, model: p.model })));

    await _dbRun(
      `INSERT INTO council_sessions (id, world_id, prompt, models_json) VALUES (?, ?, ?, ?)`,
      [sessionId, worldId, prompt, modelsJson]
    );

    // 2. Build seat cards
    this._responseGrid.innerHTML = '';
    this._compareSection.style.display = 'none';

    // Set grid column count
    const colCount = Math.min(selectedModels.length, 4);
    this._responseGrid.style.gridTemplateColumns = `repeat(${colCount}, 1fr)`;

    const cards = {};
    const responseIds = {};

    for (const provider of selectedModels) {
      const responseId = _generateId();
      responseIds[provider.id] = responseId;

      // Insert pending response row
      await _dbRun(
        `INSERT INTO council_responses (id, session_id, provider, model, status) VALUES (?, ?, ?, ?, 'pending')`,
        [responseId, sessionId, provider.id, provider.model]
      );

      const card = this._buildSeatCard(provider);
      this._responseGrid.appendChild(card.el);
      cards[provider.id] = card;
    }

    // 3. Dispatch all models in parallel
    const results = {};

    const dispatches = selectedModels.map(async (provider) => {
      const startTime = Date.now();
      const card = cards[provider.id];
      const responseId = responseIds[provider.id];

      try {
        let response = null;

        if (window.api && window.api.ai && window.api.ai.dispatch) {
          response = await window.api.ai.dispatch({
            provider: provider.id,
            model: provider.model,
            prompt,
          });
        } else {
          // Graceful degradation for dev/testing
          await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
          response = {
            text: `[Dev mode] Response from ${provider.name} for: "${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}"`,
            cost_usd: Math.random() * 0.005,
            tokens_used: Math.floor(Math.random() * 500) + 100,
          };
        }

        const latencyMs = Date.now() - startTime;
        const text = response?.text || response?.content || String(response || '');
        const costUsd = response?.cost_usd || 0;
        const tokensUsed = response?.tokens_used || 0;

        results[provider.id] = { text, costUsd, tokensUsed, latencyMs, error: null };

        // Update DB
        await _dbRun(
          `UPDATE council_responses SET response=?, cost_usd=?, tokens_used=?, latency_ms=?, status='complete' WHERE id=?`,
          [text, costUsd, tokensUsed, latencyMs, responseId]
        );

        // Update card
        card.setResponse(text, costUsd, latencyMs);

        // Emit event
        emit('dispatch:task-complete', {
          provider: provider.id,
          model: provider.model,
          sessionId,
          responseId,
        });

      } catch (err) {
        const latencyMs = Date.now() - startTime;
        const errMsg = err?.message || 'Unknown error';

        results[provider.id] = { text: null, costUsd: 0, tokensUsed: 0, latencyMs, error: errMsg };

        await _dbRun(
          `UPDATE council_responses SET status='error', latency_ms=? WHERE id=?`,
          [latencyMs, responseId]
        );

        card.setError(errMsg);

        emit('dispatch:task-complete', {
          provider: provider.id,
          model: provider.model,
          sessionId,
          responseId,
          error: errMsg,
        });
      }
    });

    await Promise.all(dispatches);

    // 4. Show comparison table
    this._showCompare(selectedModels, results);

    // 5. Refresh history
    this._sessionInProgress = false;
    this._updateConveneButton();
    await this.loadHistory(worldId);
  }

  // ── Seat card builder ───────────────────────────────────────────

  _buildSeatCard(provider) {
    const card = el('div', 'council__seat-card council__seat-card--thinking');
    card.setAttribute('role', 'article');
    card.setAttribute('aria-label', `${provider.name} response`);

    // Card header
    const cardHeader = el('div', 'council__seat-header');
    const providerIcon = el('span', 'council__seat-icon', { textContent: provider.icon });
    providerIcon.style.color = provider.color;
    providerIcon.setAttribute('aria-hidden', 'true');
    const providerName = el('span', 'council__seat-name', { textContent: provider.name });
    const modelTag = el('span', 'council__seat-model', { textContent: provider.model });
    cardHeader.appendChild(providerIcon);
    cardHeader.appendChild(providerName);
    cardHeader.appendChild(modelTag);
    card.appendChild(cardHeader);

    // Thinking indicator
    const thinking = el('div', 'council__thinking');
    const spinner = el('div', 'council__thinking-spinner');
    spinner.setAttribute('aria-hidden', 'true');
    const thinkingLabel = el('span', 'council__thinking-label', { textContent: 'Thinking\u2026' });
    thinking.appendChild(spinner);
    thinking.appendChild(thinkingLabel);
    card.appendChild(thinking);

    // Response body (hidden initially)
    const body = el('div', 'council__seat-body');
    body.style.display = 'none';
    card.appendChild(body);

    // Footer
    const footer = el('div', 'council__seat-footer');
    footer.style.display = 'none';
    card.appendChild(footer);

    // Copy button
    const copyBtn = el('button', 'council__copy-btn', { textContent: 'Copy' });
    copyBtn.style.display = 'none';
    copyBtn.setAttribute('aria-label', `Copy ${provider.name} response`);
    card.appendChild(copyBtn);

    // Methods to update card state
    function setResponse(text, costUsd, latencyMs) {
      card.classList.remove('council__seat-card--thinking');
      card.classList.add('council__seat-card--complete');
      thinking.style.display = 'none';

      body.textContent = text;
      body.style.display = 'block';

      footer.textContent = `${formatCost(costUsd)} \u00B7 ${latencyMs}ms`;
      footer.style.display = 'block';

      copyBtn.style.display = 'inline-flex';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(text).catch(() => {});
        copyBtn.textContent = 'Copied!';
        setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
      });
    }

    function setError(errMsg) {
      card.classList.remove('council__seat-card--thinking');
      card.classList.add('council__seat-card--error');
      thinking.style.display = 'none';

      body.textContent = `Error: ${errMsg}`;
      body.classList.add('council__seat-body--error');
      body.style.display = 'block';
    }

    return { el: card, setResponse, setError };
  }

  // ── Compare table ───────────────────────────────────────────────

  _showCompare(providers, results) {
    this._compareSection.innerHTML = '';
    this._compareSection.style.display = 'block';

    const toggle = el('button', 'council__compare-toggle');
    toggle.textContent = '\uD83D\uDCCA Compare';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'council-compare-table');

    const table = el('div', 'council__compare-table');
    table.id = 'council-compare-table';
    table.style.display = 'none';
    table.setAttribute('role', 'table');
    table.setAttribute('aria-label', 'Model comparison');

    // Header row
    const headerRow = el('div', 'council__compare-row council__compare-row--header');
    headerRow.setAttribute('role', 'row');
    headerRow.appendChild(el('div', 'council__compare-cell council__compare-cell--label', { textContent: 'Model' }));
    headerRow.appendChild(el('div', 'council__compare-cell', { textContent: 'Words' }));
    headerRow.appendChild(el('div', 'council__compare-cell', { textContent: 'Cost' }));
    headerRow.appendChild(el('div', 'council__compare-cell', { textContent: 'Latency' }));
    table.appendChild(headerRow);

    for (const provider of providers) {
      const r = results[provider.id];
      if (!r) continue;
      const row = el('div', 'council__compare-row');
      row.setAttribute('role', 'row');

      const nameCell = el('div', 'council__compare-cell council__compare-cell--label');
      const rowIcon = el('span', null, { textContent: provider.icon });
      rowIcon.style.color = provider.color;
      rowIcon.setAttribute('aria-hidden', 'true');
      const rowName = el('span', null, { textContent: ' ' + provider.name });
      nameCell.appendChild(rowIcon);
      nameCell.appendChild(rowName);

      row.appendChild(nameCell);
      row.appendChild(el('div', 'council__compare-cell', {
        textContent: r.error ? '\u2014' : String(countWords(r.text)),
      }));
      row.appendChild(el('div', 'council__compare-cell', {
        textContent: r.error ? 'Error' : formatCost(r.costUsd),
      }));
      row.appendChild(el('div', 'council__compare-cell', {
        textContent: `${r.latencyMs}ms`,
      }));
      table.appendChild(row);
    }

    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      table.style.display = expanded ? 'none' : 'block';
      toggle.textContent = expanded ? '\uD83D\uDCCA Compare' : '\uD83D\uDCCA Hide Comparison';
    });

    this._compareSection.appendChild(toggle);
    this._compareSection.appendChild(table);
  }

  // ── History ─────────────────────────────────────────────────────

  /**
   * loadHistory — Load past council sessions for a world.
   * @param {string} worldId
   */
  async loadHistory(worldId) {
    if (!this._historyList) return;

    const sessions = await _dbAll(
      `SELECT cs.id, cs.prompt, cs.models_json, cs.created_at,
              COUNT(cr.id) AS response_count
       FROM council_sessions cs
       LEFT JOIN council_responses cr ON cr.session_id = cs.id
       WHERE cs.world_id = ?
       GROUP BY cs.id
       ORDER BY cs.created_at DESC
       LIMIT 10`,
      [worldId]
    );

    this._historyList.innerHTML = '';

    if (!sessions || sessions.length === 0) {
      const empty = el('div', 'council__history-empty', {
        textContent: 'No sessions yet. Convene your first council.',
      });
      this._historyList.appendChild(empty);
      return;
    }

    for (const session of sessions) {
      const item = this._buildHistoryItem(session);
      this._historyList.appendChild(item);
    }
  }

  _buildHistoryItem(session) {
    const item = el('div', 'council__history-item');
    item.setAttribute('role', 'listitem');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', `Council session: ${session.prompt.slice(0, 60)}`);

    let modelCount = 0;
    try {
      const parsed = JSON.parse(session.models_json || '[]');
      modelCount = parsed.length;
    } catch {}

    const preview = el('div', 'council__history-prompt', {
      textContent: session.prompt.length > 80
        ? session.prompt.slice(0, 80) + '\u2026'
        : session.prompt,
    });

    const meta = el('div', 'council__history-meta');
    const countBadge = el('span', 'council__history-badge', {
      textContent: `${modelCount} model${modelCount !== 1 ? 's' : ''}`,
    });
    const timeStr = _formatRelativeTime(session.created_at);
    const timeBadge = el('span', 'council__history-time', { textContent: timeStr });

    meta.appendChild(countBadge);
    meta.appendChild(timeBadge);

    item.appendChild(preview);
    item.appendChild(meta);

    const onClick = () => this._loadSession(session);
    item.addEventListener('click', onClick);
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    });

    return item;
  }

  async _loadSession(session) {
    // Populate prompt textarea
    if (this._promptTextarea) {
      this._promptTextarea.value = session.prompt;
    }

    // Load responses
    const responses = await _dbAll(
      `SELECT * FROM council_responses WHERE session_id = ? ORDER BY created_at ASC`,
      [session.id]
    );

    if (!responses || responses.length === 0) return;

    // Build provider list from responses
    const providers = responses.map(r => {
      const p = COUNCIL_PROVIDERS.find(p => p.id === r.provider);
      return p || {
        id: r.provider,
        name: r.provider,
        model: r.model,
        icon: '\u26AB',
        color: '#9ca3af',
        colorDim: '#9ca3af20',
      };
    });

    // Rebuild response grid
    this._responseGrid.innerHTML = '';
    this._compareSection.style.display = 'none';

    const colCount = Math.min(providers.length, 4);
    this._responseGrid.style.gridTemplateColumns = `repeat(${colCount}, 1fr)`;

    const results = {};

    for (let i = 0; i < providers.length; i++) {
      const provider = providers[i];
      const r = responses[i];
      const card = this._buildSeatCard(provider);
      this._responseGrid.appendChild(card.el);

      if (r.status === 'complete' && r.response) {
        card.setResponse(r.response, r.cost_usd || 0, r.latency_ms || 0);
        results[provider.id] = {
          text: r.response,
          costUsd: r.cost_usd || 0,
          tokensUsed: r.tokens_used || 0,
          latencyMs: r.latency_ms || 0,
          error: null,
        };
      } else if (r.status === 'error') {
        card.setError('Response failed');
        results[provider.id] = { text: null, costUsd: 0, tokensUsed: 0, latencyMs: r.latency_ms || 0, error: 'Response failed' };
      }
    }

    this._showCompare(providers, results);

    // Expand history panel so they can see
    if (this._historyCollapsed) {
      // scroll into view
      this._responseGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function _formatRelativeTime(dateStr) {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return 'Unknown';
  }
}

// ── Style loader ──────────────────────────────────────────────────

let _stylesLoaded = false;

/**
 * Dynamically load council.css if not already loaded.
 * @param {string} [basePath=''] — path prefix to the zones/ directory
 */
export function loadCouncilStyles(basePath = '') {
  if (_stylesLoaded) return;
  _stylesLoaded = true;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${basePath}council.css`;
  document.head.appendChild(link);
}

// ── Convenience builder (mirrors connector-docks pattern) ─────────

/**
 * Build the Council panel content element.
 * @param {string} worldId
 * @returns {HTMLElement}
 */
export function buildCouncilContent(worldId) {
  const council = new Council();
  return council.render(worldId);
}
