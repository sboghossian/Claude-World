/**
 * minion-tunnels.js — Minion Tunnels zone
 *
 * Underground automated task runners — cron-like scheduled agents
 * that run AI prompts on a defined schedule or on-demand.
 *
 * Emits:
 *   dispatch:task-complete — { worldId, zoneType, success }
 *
 * Vanilla JS + CSS. Pairs with minion-tunnels.css.
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
 * Human label for a schedule value.
 * @param {string} schedule
 * @returns {string}
 */
function scheduleLabel(schedule) {
  switch (schedule) {
    case 'manual':  return 'Manual';
    case 'hourly':  return 'Hourly';
    case 'daily':   return 'Daily';
    case 'event':   return 'On event';
    default:        return schedule;
  }
}

// ── MinionTunnels class ──────────────────────────────────────────────

export class MinionTunnels {
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
    this._minions = [];
    /** @type {boolean} */
    this._formOpen = false;
    /** @type {Map<string, boolean>} Running state per minion id */
    this._running = new Map();

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
    const id = 'minion-tunnels-styles';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    // Resolve relative to this module if possible, otherwise assume flat dist
    link.href = 'src/zones/minion-tunnels.css';
    document.head.appendChild(link);
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOM construction
  // ═══════════════════════════════════════════════════════════════════

  _build() {
    this._container.innerHTML = '';
    this._container.classList.add('minion-tunnels');
    this._container.setAttribute('role', 'region');
    this._container.setAttribute('aria-label', 'Minion Tunnels');

    // ── Header ──
    this._headerEl = this._el('div', 'mt-header');

    const titleRow = this._el('div', 'mt-header__title-row');
    const title = this._el('h2', 'mt-header__title');
    title.textContent = '\u26CF\uFE0F Minion Tunnels';
    const subtitle = this._el('span', 'mt-header__subtitle');
    subtitle.textContent = 'Automated underground agents';
    titleRow.appendChild(title);
    titleRow.appendChild(subtitle);
    this._headerEl.appendChild(titleRow);

    // Stats bar
    this._statsBar = this._el('div', 'mt-stats');
    this._statActive = this._el('span', 'mt-stat');
    this._statActive.setAttribute('aria-live', 'polite');
    this._statRuns = this._el('span', 'mt-stat');
    this._statCost = this._el('span', 'mt-stat');
    this._statsBar.appendChild(this._statActive);
    this._statsBar.appendChild(this._statRuns);
    this._statsBar.appendChild(this._statCost);
    this._headerEl.appendChild(this._statsBar);

    this._container.appendChild(this._headerEl);

    // ── Minion list ──
    this._listEl = this._el('div', 'mt-list');
    this._listEl.setAttribute('role', 'list');
    this._listEl.setAttribute('aria-label', 'Minion list');
    this._container.appendChild(this._listEl);

    // ── Footer: create button + inline form ──
    this._footerEl = this._el('div', 'mt-footer');

    this._createBtn = this._el('button', 'mt-create-btn');
    this._createBtn.textContent = '+ Create Minion';
    this._createBtn.setAttribute('aria-expanded', 'false');
    this._createBtn.setAttribute('aria-controls', 'mt-create-form');
    this._footerEl.appendChild(this._createBtn);

    this._formEl = this._el('div', 'mt-form');
    this._formEl.id = 'mt-create-form';
    this._formEl.setAttribute('aria-hidden', 'true');
    this._formEl.setAttribute('role', 'form');
    this._formEl.setAttribute('aria-label', 'Create new minion');
    this._buildForm();
    this._footerEl.appendChild(this._formEl);

    this._container.appendChild(this._footerEl);

    this._updateStats();
  }

  _buildForm() {
    // Name
    const nameField = this._el('div', 'mt-field');
    const nameLabel = this._el('label', 'mt-field__label mt-field__label--required');
    nameLabel.textContent = 'Name';
    nameLabel.setAttribute('for', 'mt-name-input');
    this._nameInput = this._el('input', 'mt-field__input');
    this._nameInput.id = 'mt-name-input';
    this._nameInput.type = 'text';
    this._nameInput.placeholder = 'e.g. Daily Digest, Repo Summarizer';
    this._nameInput.setAttribute('aria-required', 'true');
    this._nameInput.setAttribute('autocomplete', 'off');
    nameField.appendChild(nameLabel);
    nameField.appendChild(this._nameInput);
    this._formEl.appendChild(nameField);

    // Prompt
    const promptField = this._el('div', 'mt-field');
    const promptLabel = this._el('label', 'mt-field__label mt-field__label--required');
    promptLabel.textContent = 'Prompt';
    promptLabel.setAttribute('for', 'mt-prompt-input');
    const promptHint = this._el('span', 'mt-field__hint');
    promptHint.textContent = 'What should this minion do when it runs?';
    this._promptInput = this._el('textarea', 'mt-field__textarea');
    this._promptInput.id = 'mt-prompt-input';
    this._promptInput.rows = 4;
    this._promptInput.placeholder =
      'Summarize today\'s news headlines and return a 5-bullet digest.';
    this._promptInput.setAttribute('aria-required', 'true');
    promptField.appendChild(promptLabel);
    promptField.appendChild(promptHint);
    promptField.appendChild(this._promptInput);
    this._formEl.appendChild(promptField);

    // Two-column row: schedule + provider
    const row = this._el('div', 'mt-field-row');

    const scheduleField = this._el('div', 'mt-field');
    const scheduleLabel = this._el('label', 'mt-field__label');
    scheduleLabel.textContent = 'Schedule';
    scheduleLabel.setAttribute('for', 'mt-schedule-select');
    this._scheduleSelect = this._el('select', 'mt-field__select');
    this._scheduleSelect.id = 'mt-schedule-select';
    [
      { value: 'manual',  label: 'Manual — run on demand' },
      { value: 'hourly',  label: 'Hourly — every 60 minutes' },
      { value: 'daily',   label: 'Daily — once per day' },
      { value: 'event',   label: 'On event — triggered by world events' },
    ].forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      this._scheduleSelect.appendChild(opt);
    });
    scheduleField.appendChild(scheduleLabel);
    scheduleField.appendChild(this._scheduleSelect);
    row.appendChild(scheduleField);

    const providerField = this._el('div', 'mt-field');
    const providerLabel = this._el('label', 'mt-field__label');
    providerLabel.textContent = 'Provider';
    providerLabel.setAttribute('for', 'mt-provider-select');
    this._providerSelect = this._el('select', 'mt-field__select');
    this._providerSelect.id = 'mt-provider-select';
    [
      { value: 'auto',       label: 'Auto — best available' },
      { value: 'anthropic',  label: 'Anthropic (Claude)' },
      { value: 'openai',     label: 'OpenAI (GPT)' },
    ].forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      this._providerSelect.appendChild(opt);
    });
    providerField.appendChild(providerLabel);
    providerField.appendChild(this._providerSelect);
    row.appendChild(providerField);

    this._formEl.appendChild(row);

    // Form actions
    const actions = this._el('div', 'mt-form__actions');
    this._cancelFormBtn = this._el('button', 'mt-form__btn mt-form__btn--cancel');
    this._cancelFormBtn.type = 'button';
    this._cancelFormBtn.textContent = 'Cancel';
    this._saveFormBtn = this._el('button', 'mt-form__btn mt-form__btn--save');
    this._saveFormBtn.type = 'button';
    this._saveFormBtn.textContent = 'Save Minion';
    actions.appendChild(this._cancelFormBtn);
    actions.appendChild(this._saveFormBtn);
    this._formEl.appendChild(actions);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Event binding
  // ═══════════════════════════════════════════════════════════════════

  _bindEvents() {
    this._createBtn.addEventListener('click', () => this._toggleForm());
    this._cancelFormBtn.addEventListener('click', () => this._closeForm());
    this._saveFormBtn.addEventListener('click', () => this._onSave());

    this._container.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._formOpen) {
        this._closeForm();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Load minions for a world and render them.
   * @param {string} worldId
   */
  async init(worldId) {
    this._worldId = worldId;
    await this._loadMinions();
    this._renderList();
    this._updateStats();
  }

  /**
   * Create a minion and persist it.
   * @param {string} worldId
   * @param {object} config
   * @returns {Promise<object|null>}
   */
  async createMinion(worldId, config) {
    try {
      const minion = await window.api.db.createMinion(worldId, config);
      return minion;
    } catch (err) {
      console.error('[MinionTunnels] createMinion failed:', err);
      return null;
    }
  }

  /**
   * Run a minion immediately.
   * @param {string} minionId
   */
  async runMinion(minionId) {
    const minion = this._minions.find((m) => m.id === minionId);
    if (!minion) return;
    if (this._running.get(minionId)) return;

    this._running.set(minionId, true);
    this._setMinionStatus(minionId, 'running');
    this._renderCard(minion);

    let success = false;
    let output = null;

    try {
      const result = await window.api.ai.dispatch({
        messages: [{ role: 'user', content: minion.prompt }],
        provider: minion.provider !== 'auto' ? minion.provider : undefined,
        model: minion.model || undefined,
      });

      output = typeof result === 'string'
        ? result
        : (result?.content ?? result?.text ?? JSON.stringify(result));

      success = true;
      this._setMinionStatus(minionId, 'idle');
    } catch (err) {
      output = err?.message || String(err);
      this._setMinionStatus(minionId, 'error');
    }

    this._running.set(minionId, false);

    // Persist run result if API available
    try {
      await window.api.db.recordMinionRun(minionId, this._worldId, {
        status: success ? 'success' : 'error',
        output,
      });
    } catch (_) {
      // Best-effort
    }

    // Update local cache
    const idx = this._minions.findIndex((m) => m.id === minionId);
    if (idx !== -1) {
      this._minions[idx].last_run = new Date().toISOString();
      this._minions[idx].last_output = output;
      this._minions[idx].status = success ? 'idle' : 'error';
      this._minions[idx].run_count = (this._minions[idx].run_count || 0) + 1;
    }

    this._renderList();
    this._updateStats();

    this._emit('dispatch:task-complete', {
      worldId: this._worldId,
      zoneType: 'minions',
      success,
    });
  }

  /**
   * Tear down and clean up.
   */
  destroy() {
    this._container.innerHTML = '';
    this._container.classList.remove('minion-tunnels');
  }

  // ═══════════════════════════════════════════════════════════════════
  // Data layer
  // ═══════════════════════════════════════════════════════════════════

  async _loadMinions() {
    if (!this._worldId) {
      this._minions = [];
      return;
    }
    try {
      this._minions = await window.api.db.getMinions(this._worldId) || [];
    } catch {
      this._minions = [];
    }
  }

  _setMinionStatus(minionId, status) {
    const idx = this._minions.findIndex((m) => m.id === minionId);
    if (idx !== -1) this._minions[idx].status = status;
    // Re-render just that card
    const existing = this._listEl.querySelector(`[data-minion-id="${minionId}"]`);
    const minion = this._minions[idx];
    if (existing && minion) {
      const fresh = this._buildCard(minion);
      existing.replaceWith(fresh);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Rendering
  // ═══════════════════════════════════════════════════════════════════

  _renderList() {
    this._listEl.innerHTML = '';

    if (this._minions.length === 0) {
      const empty = this._el('div', 'mt-empty');
      const icon = this._el('div', 'mt-empty__icon');
      icon.textContent = '\u26CF\uFE0F';
      const text = this._el('div', 'mt-empty__text');
      text.textContent = 'No minions yet. Create one below to automate tasks underground.';
      empty.appendChild(icon);
      empty.appendChild(text);
      this._listEl.appendChild(empty);
      return;
    }

    for (const minion of this._minions) {
      this._listEl.appendChild(this._buildCard(minion));
    }
  }

  /** Alias used in runMinion path — rebuilds and replaces card in list */
  _renderCard(minion) {
    const existing = this._listEl.querySelector(`[data-minion-id="${minion.id}"]`);
    if (!existing) return;
    const fresh = this._buildCard(minion);
    existing.replaceWith(fresh);
  }

  /**
   * Build a minion card element.
   * @param {object} minion
   * @returns {HTMLElement}
   */
  _buildCard(minion) {
    const isRunning = this._running.get(minion.id) || minion.status === 'running';
    const isError = minion.status === 'error';
    const isDisabled = !minion.enabled;

    let cardClass = 'mt-card';
    if (isRunning) cardClass += ' mt-card--running';
    else if (isError) cardClass += ' mt-card--error';
    else if (isDisabled) cardClass += ' mt-card--disabled';

    const card = this._el('div', cardClass);
    card.setAttribute('role', 'listitem');
    card.dataset.minionId = minion.id;

    // ── Top row: name + status badge ──
    const top = this._el('div', 'mt-card__top');

    const name = this._el('span', 'mt-card__name');
    name.textContent = minion.name;
    top.appendChild(name);

    const badgeClass = isRunning ? 'mt-badge mt-badge--running'
      : isError              ? 'mt-badge mt-badge--error'
      : isDisabled           ? 'mt-badge mt-badge--disabled'
      :                        'mt-badge mt-badge--idle';
    const badge = this._el('span', badgeClass);
    badge.textContent = isRunning ? 'running' : isError ? 'error' : isDisabled ? 'disabled' : 'idle';
    top.appendChild(badge);

    card.appendChild(top);

    // ── Description ──
    if (minion.description) {
      const desc = this._el('div', 'mt-card__desc');
      desc.textContent = minion.description;
      card.appendChild(desc);
    }

    // ── Meta row: schedule + last run ──
    const meta = this._el('div', 'mt-card__meta');

    const schedTag = this._el('span', 'mt-card__schedule');
    schedTag.textContent = scheduleLabel(minion.schedule);
    meta.appendChild(schedTag);

    const lastRun = this._el('span', 'mt-card__last-run');
    lastRun.textContent = 'Last run: ' + relativeTime(minion.last_run);
    meta.appendChild(lastRun);

    card.appendChild(meta);

    // ── Output preview ──
    if (minion.last_output) {
      const preview = this._el('div', 'mt-card__output');
      const raw = minion.last_output.slice(0, 80);
      preview.textContent = raw + (minion.last_output.length > 80 ? '\u2026' : '');
      card.appendChild(preview);
    }

    // ── Action buttons ──
    const actions = this._el('div', 'mt-card__actions');

    const runBtn = this._el('button', 'mt-card__btn mt-card__btn--run');
    runBtn.textContent = '\u25B6 Run Now';
    runBtn.setAttribute('aria-label', `Run minion: ${escapeHTML(minion.name)}`);
    runBtn.disabled = isRunning;
    runBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.runMinion(minion.id);
    });
    actions.appendChild(runBtn);

    const editBtn = this._el('button', 'mt-card__btn');
    editBtn.textContent = '\u270F\uFE0F Edit';
    editBtn.setAttribute('aria-label', `Edit minion: ${escapeHTML(minion.name)}`);
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._openEditForm(minion);
    });
    actions.appendChild(editBtn);

    const toggleBtn = this._el('button', 'mt-card__btn mt-card__btn--toggle');
    toggleBtn.textContent = isDisabled ? '\u25B6 Enable' : '\u23F8 Disable';
    toggleBtn.setAttribute(
      'aria-label',
      `${isDisabled ? 'Enable' : 'Disable'} minion: ${escapeHTML(minion.name)}`
    );
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleEnabled(minion);
    });
    actions.appendChild(toggleBtn);

    card.appendChild(actions);
    return card;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Stats bar
  // ═══════════════════════════════════════════════════════════════════

  _updateStats() {
    const activeCount = this._minions.filter((m) => m.enabled).length;
    const runningCount = [...this._running.values()].filter(Boolean).length;

    // Runs today: count minions whose last_run is today
    const today = new Date().toDateString();
    const runsToday = this._minions.filter((m) => {
      if (!m.last_run) return false;
      return new Date(m.last_run).toDateString() === today;
    }).length;

    this._statActive.textContent =
      `${activeCount} minion${activeCount !== 1 ? 's' : ''} active` +
      (runningCount > 0 ? ` (${runningCount} running)` : '');
    this._statRuns.textContent = `${runsToday} run${runsToday !== 1 ? 's' : ''} today`;
    this._statCost.textContent = 'Total cost: $0.00';
  }

  // ═══════════════════════════════════════════════════════════════════
  // Form (create)
  // ═══════════════════════════════════════════════════════════════════

  _toggleForm() {
    if (this._formOpen) {
      this._closeForm();
    } else {
      this._openForm();
    }
  }

  _openForm() {
    this._formOpen = true;
    this._nameInput.value = '';
    this._promptInput.value = '';
    this._scheduleSelect.value = 'manual';
    this._providerSelect.value = 'auto';

    this._formEl.setAttribute('aria-hidden', 'false');
    this._formEl.classList.add('mt-form--open');
    this._createBtn.setAttribute('aria-expanded', 'true');
    this._createBtn.textContent = '\u2212 Cancel';

    requestAnimationFrame(() => this._nameInput.focus());
  }

  _closeForm() {
    this._formOpen = false;
    this._formEl.setAttribute('aria-hidden', 'true');
    this._formEl.classList.remove('mt-form--open');
    this._createBtn.setAttribute('aria-expanded', 'false');
    this._createBtn.textContent = '+ Create Minion';
  }

  /** Open form pre-filled for editing (best-effort; full edit UI is inline) */
  _openEditForm(minion) {
    this._openForm();
    this._nameInput.value = minion.name || '';
    this._promptInput.value = minion.prompt || '';
    this._scheduleSelect.value = minion.schedule || 'manual';
    this._providerSelect.value = minion.provider || 'auto';
    // Store editing ID so save knows to update
    this._editingId = minion.id;
  }

  async _onSave() {
    const name = this._nameInput.value.trim();
    const prompt = this._promptInput.value.trim();

    if (!name) {
      this._nameInput.focus();
      this._nameInput.setAttribute('aria-invalid', 'true');
      return;
    }
    this._nameInput.removeAttribute('aria-invalid');

    if (!prompt) {
      this._promptInput.focus();
      this._promptInput.setAttribute('aria-invalid', 'true');
      return;
    }
    this._promptInput.removeAttribute('aria-invalid');

    const config = {
      name,
      prompt,
      schedule: this._scheduleSelect.value,
      provider: this._providerSelect.value,
    };

    this._saveFormBtn.disabled = true;
    this._saveFormBtn.textContent = 'Saving\u2026';

    const minion = await this.createMinion(this._worldId, config);

    this._saveFormBtn.disabled = false;
    this._saveFormBtn.textContent = 'Save Minion';
    this._editingId = null;

    if (minion) {
      this._minions.unshift(minion);
    }

    this._closeForm();
    this._renderList();
    this._updateStats();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Toggle enabled
  // ═══════════════════════════════════════════════════════════════════

  async _toggleEnabled(minion) {
    const newState = minion.enabled ? 0 : 1;
    try {
      await window.api.db.updateMinion(minion.id, { enabled: newState });
    } catch (_) {
      // Best-effort
    }
    const idx = this._minions.findIndex((m) => m.id === minion.id);
    if (idx !== -1) this._minions[idx].enabled = newState;
    this._renderList();
    this._updateStats();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create an element with class name(s).
   * @param {string} tag
   * @param {string} className
   * @returns {HTMLElement}
   */
  _el(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  /**
   * Dispatch a custom event on the document.
   * @param {string} name
   * @param {object} detail
   */
  _emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }
}
