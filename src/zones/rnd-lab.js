/**
 * rnd-lab.js — R&D Lab zone: experimental prompt sandbox
 *
 * A scratchpad for experimenting with prompts before they become
 * skills or minions. Run experiments, review results, and promote
 * what works.
 *
 * Emits:
 *   experiment:promote        — { experimentId, name, prompt }
 *   experiment:promote-minion — { experimentId, name, prompt }
 *
 * Vanilla JS + CSS. Pairs with rnd-lab.css.
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
 * Format an ISO datetime string to a human-readable label.
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
 * Generate a local ID for new experiments before DB persist.
 * @returns {string}
 */
function localId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Status config ─────────────────────────────────────────────────────

const STATUS_CONFIG = {
  draft:    { label: 'Draft',    cssClass: 'rnd-status--draft'    },
  running:  { label: 'Running',  cssClass: 'rnd-status--running'  },
  complete: { label: 'Complete', cssClass: 'rnd-status--complete' },
  error:    { label: 'Error',    cssClass: 'rnd-status--error'    },
};

// ── RndLab class ──────────────────────────────────────────────────────

export class RndLab {
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
    this._experiments = [];
    /** @type {string|null} */
    this._selectedId = null;
    /** @type {boolean} */
    this._running = false;

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
    const id = 'rnd-lab-styles';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'src/zones/rnd-lab.css';
    document.head.appendChild(link);
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOM construction
  // ═══════════════════════════════════════════════════════════════════

  _build() {
    this._container.innerHTML = '';
    this._container.classList.add('rnd-lab');
    this._container.setAttribute('role', 'region');
    this._container.setAttribute('aria-label', 'R&D Lab');

    // ── Header ──
    const header = this._el('div', 'rnd-header');
    const titleRow = this._el('div', 'rnd-header__title-row');
    const title = this._el('h2', 'rnd-header__title');
    title.textContent = '🔬 R&D Lab';
    const subtitle = this._el('span', 'rnd-header__subtitle');
    subtitle.textContent = 'Experiment freely. Deploy what works.';
    titleRow.appendChild(title);
    titleRow.appendChild(subtitle);
    header.appendChild(titleRow);
    this._container.appendChild(header);

    // ── Body: two-column layout ──
    const body = this._el('div', 'rnd-body');
    this._container.appendChild(body);

    // Left: experiment list
    this._leftPanel = this._el('aside', 'rnd-left');
    this._leftPanel.setAttribute('aria-label', 'Experiment list');

    this._newExperimentBtn = this._el('button', 'rnd-new-btn');
    this._newExperimentBtn.textContent = 'New Experiment +';
    this._newExperimentBtn.setAttribute('aria-label', 'Create a new experiment');
    this._leftPanel.appendChild(this._newExperimentBtn);

    this._experimentListEl = this._el('div', 'rnd-experiment-list');
    this._experimentListEl.setAttribute('role', 'list');
    this._experimentListEl.setAttribute('aria-label', 'Experiments');
    this._leftPanel.appendChild(this._experimentListEl);

    body.appendChild(this._leftPanel);

    // Right: editor
    this._rightPanel = this._el('section', 'rnd-right');
    this._rightPanel.setAttribute('aria-label', 'Experiment editor');
    this._buildEditor(this._rightPanel);
    body.appendChild(this._rightPanel);
  }

  _buildEditor(panel) {
    // Empty state
    this._emptyStateEl = this._el('div', 'rnd-empty-state');
    this._emptyStateEl.textContent = 'Select an experiment or create a new one.';
    panel.appendChild(this._emptyStateEl);

    // Editor form (hidden initially)
    this._editorEl = this._el('div', 'rnd-editor');
    this._editorEl.hidden = true;
    this._editorEl.setAttribute('role', 'form');
    this._editorEl.setAttribute('aria-label', 'Experiment editor');

    // Name
    const nameGroup = this._el('div', 'rnd-form-group');
    const nameLabel = this._el('label', 'rnd-form-label');
    nameLabel.textContent = 'Name';
    nameLabel.setAttribute('for', 'rnd-name');
    this._nameInput = this._el('input', 'rnd-form-input');
    this._nameInput.id = 'rnd-name';
    this._nameInput.type = 'text';
    this._nameInput.placeholder = 'Experiment name…';
    this._nameInput.setAttribute('aria-required', 'true');
    nameGroup.appendChild(nameLabel);
    nameGroup.appendChild(this._nameInput);
    this._editorEl.appendChild(nameGroup);

    // Description
    const descGroup = this._el('div', 'rnd-form-group');
    const descLabel = this._el('label', 'rnd-form-label');
    descLabel.textContent = 'Description';
    descLabel.setAttribute('for', 'rnd-description');
    this._descInput = this._el('textarea', 'rnd-form-textarea');
    this._descInput.id = 'rnd-description';
    this._descInput.placeholder = 'What are you testing?';
    this._descInput.rows = 2;
    descGroup.appendChild(descLabel);
    descGroup.appendChild(this._descInput);
    this._editorEl.appendChild(descGroup);

    // Prompt editor
    const promptGroup = this._el('div', 'rnd-form-group rnd-form-group--grow');
    const promptLabel = this._el('label', 'rnd-form-label');
    promptLabel.textContent = 'Prompt';
    promptLabel.setAttribute('for', 'rnd-prompt');
    this._promptInput = this._el('textarea', 'rnd-form-textarea rnd-form-textarea--code');
    this._promptInput.id = 'rnd-prompt';
    this._promptInput.placeholder = 'Write your prompt here…';
    this._promptInput.rows = 10;
    this._promptInput.setAttribute('aria-required', 'true');
    this._promptInput.setAttribute('spellcheck', 'false');
    promptGroup.appendChild(promptLabel);
    promptGroup.appendChild(this._promptInput);
    this._editorEl.appendChild(promptGroup);

    // Run button
    this._runBtn = this._el('button', 'rnd-run-btn');
    this._runBtn.textContent = '🧪 Run Experiment';
    this._runBtn.setAttribute('aria-label', 'Run this experiment');
    this._editorEl.appendChild(this._runBtn);

    // Result panel (hidden until run)
    this._resultPanel = this._el('div', 'rnd-result');
    this._resultPanel.hidden = true;
    this._resultPanel.setAttribute('aria-live', 'polite');
    this._resultPanel.setAttribute('aria-label', 'Experiment result');

    const resultTitle = this._el('div', 'rnd-result__title');
    resultTitle.textContent = 'Result';

    this._resultText = this._el('pre', 'rnd-result__text');
    this._resultText.setAttribute('tabindex', '0');

    this._resultMeta = this._el('div', 'rnd-result__meta');

    // Promote buttons
    this._promoteActions = this._el('div', 'rnd-promote-actions');
    this._promoteSkillBtn = this._el('button', 'rnd-promote-btn rnd-promote-btn--skill');
    this._promoteSkillBtn.textContent = '⬆️ Promote to Skill';
    this._promoteSkillBtn.setAttribute('aria-label', 'Promote this experiment to a skill');
    this._promoteMinionBtn = this._el('button', 'rnd-promote-btn rnd-promote-btn--minion');
    this._promoteMinionBtn.textContent = '🤖 Promote to Minion';
    this._promoteMinionBtn.setAttribute('aria-label', 'Promote this experiment to a minion');
    this._promoteActions.appendChild(this._promoteSkillBtn);
    this._promoteActions.appendChild(this._promoteMinionBtn);

    this._resultPanel.appendChild(resultTitle);
    this._resultPanel.appendChild(this._resultText);
    this._resultPanel.appendChild(this._resultMeta);
    this._resultPanel.appendChild(this._promoteActions);
    this._editorEl.appendChild(this._resultPanel);

    panel.appendChild(this._editorEl);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Event binding
  // ═══════════════════════════════════════════════════════════════════

  _bindEvents() {
    // New experiment
    this._newExperimentBtn.addEventListener('click', () => this._createNewExperiment());

    // Experiment list click (delegated)
    this._experimentListEl.addEventListener('click', (e) => {
      const card = e.target.closest('.rnd-experiment-card');
      if (!card) return;
      this._selectExperiment(card.dataset.id);
    });

    // Run experiment
    this._runBtn.addEventListener('click', () => this._runExperiment());

    // Promote to skill
    this._promoteSkillBtn.addEventListener('click', () => {
      const exp = this._selectedExperiment();
      if (!exp) return;
      document.dispatchEvent(new CustomEvent('experiment:promote', {
        detail: { experimentId: exp.id, name: exp.name, prompt: exp.prompt },
        bubbles: true,
      }));
      document.dispatchEvent(new CustomEvent('toast:show', {
        detail: { type: 'success', title: 'Promoted to Skill', description: `"${exp.name}" is now available as a skill.` },
        bubbles: true,
      }));
    });

    // Promote to minion
    this._promoteMinionBtn.addEventListener('click', () => {
      const exp = this._selectedExperiment();
      if (!exp) return;
      document.dispatchEvent(new CustomEvent('experiment:promote-minion', {
        detail: { experimentId: exp.id, name: exp.name, prompt: exp.prompt },
        bubbles: true,
      }));
      document.dispatchEvent(new CustomEvent('toast:show', {
        detail: { type: 'success', title: 'Promoted to Minion', description: `"${exp.name}" is now available as a minion.` },
        bubbles: true,
      }));
    });

    // Auto-save on input change
    let saveTimer = null;
    const scheduleAutoSave = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => this._saveCurrentToLocal(), 500);
    };
    this._nameInput.addEventListener('input', scheduleAutoSave);
    this._descInput.addEventListener('input', scheduleAutoSave);
    this._promptInput.addEventListener('input', scheduleAutoSave);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Load experiments from DB for the given world.
   * @param {string} worldId
   */
  async init(worldId) {
    this._worldId = worldId;

    let experiments = [];
    try {
      if (window.api && window.api.db && window.api.db.getExperiments) {
        experiments = await window.api.db.getExperiments(worldId) || [];
      }
    } catch (err) {
      console.warn('[RndLab] Failed to load experiments:', err);
    }

    this._experiments = experiments;
    this._renderExperimentList();

    // Auto-select first
    if (this._experiments.length > 0) {
      this._selectExperiment(this._experiments[0].id);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Rendering
  // ═══════════════════════════════════════════════════════════════════

  _renderExperimentList() {
    this._experimentListEl.innerHTML = '';

    if (this._experiments.length === 0) {
      const empty = this._el('div', 'rnd-list-empty');
      empty.textContent = 'No experiments yet.';
      this._experimentListEl.appendChild(empty);
      return;
    }

    for (const exp of this._experiments) {
      this._experimentListEl.appendChild(this._buildExperimentCard(exp));
    }
  }

  _buildExperimentCard(exp) {
    const card = this._el('div', 'rnd-experiment-card');
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');
    card.dataset.id = exp.id;
    card.setAttribute('aria-label', exp.name || 'Untitled experiment');

    if (exp.id === this._selectedId) {
      card.classList.add('rnd-experiment-card--selected');
    }

    const cardName = this._el('div', 'rnd-experiment-card__name');
    cardName.textContent = exp.name || 'Untitled';

    const cardMeta = this._el('div', 'rnd-experiment-card__meta');
    const statusConf = STATUS_CONFIG[exp.status] || STATUS_CONFIG.draft;
    const statusBadge = this._el('span', `rnd-status ${statusConf.cssClass}`);
    statusBadge.textContent = statusConf.label;

    const dateEl = this._el('span', 'rnd-experiment-card__date');
    dateEl.textContent = relativeTime(exp.created_at);

    cardMeta.appendChild(statusBadge);
    cardMeta.appendChild(dateEl);

    card.appendChild(cardName);
    card.appendChild(cardMeta);

    // Keyboard support
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._selectExperiment(exp.id);
      }
    });

    return card;
  }

  _selectExperiment(id) {
    this._selectedId = id;
    const exp = this._experiments.find(e => e.id === id);

    // Update list selection
    for (const card of this._experimentListEl.querySelectorAll('.rnd-experiment-card')) {
      card.classList.toggle('rnd-experiment-card--selected', card.dataset.id === id);
    }

    if (!exp) {
      this._showEmptyState();
      return;
    }

    this._showEditor(exp);
  }

  _showEmptyState() {
    this._emptyStateEl.hidden = false;
    this._editorEl.hidden = true;
  }

  _showEditor(exp) {
    this._emptyStateEl.hidden = true;
    this._editorEl.hidden = false;

    this._nameInput.value = exp.name || '';
    this._descInput.value = exp.description || '';
    this._promptInput.value = exp.prompt || '';

    // Show/hide result
    if (exp.result) {
      this._resultText.textContent = exp.result;
      this._resultMeta.textContent = '';
      this._resultPanel.hidden = false;
      this._promoteActions.hidden = exp.status !== 'complete';
    } else {
      this._resultPanel.hidden = true;
    }

    // Run button state
    this._runBtn.disabled = exp.status === 'running';
    this._runBtn.textContent = exp.status === 'running' ? '⏳ Running…' : '🧪 Run Experiment';
  }

  _createNewExperiment() {
    const exp = {
      id: localId(),
      world_id: this._worldId,
      name: '',
      description: '',
      prompt: '',
      result: null,
      status: 'draft',
      is_promoted: 0,
      created_at: new Date().toISOString(),
    };

    this._experiments.unshift(exp);
    this._renderExperimentList();
    this._selectExperiment(exp.id);
    this._nameInput.focus();
  }

  _saveCurrentToLocal() {
    const exp = this._selectedExperiment();
    if (!exp) return;

    exp.name = this._nameInput.value.trim() || 'Untitled';
    exp.description = this._descInput.value;
    exp.prompt = this._promptInput.value;

    // Update the card name in the list
    const card = this._experimentListEl.querySelector(`[data-id="${exp.id}"] .rnd-experiment-card__name`);
    if (card) card.textContent = exp.name;
  }

  async _runExperiment() {
    const exp = this._selectedExperiment();
    if (!exp) return;

    // Save current field values
    exp.name = this._nameInput.value.trim() || 'Untitled';
    exp.description = this._descInput.value;
    exp.prompt = this._promptInput.value.trim();

    if (!exp.prompt) {
      document.dispatchEvent(new CustomEvent('toast:show', {
        detail: { type: 'warning', title: 'Empty Prompt', description: 'Please enter a prompt before running.' },
        bubbles: true,
      }));
      return;
    }

    // Mark as running
    exp.status = 'running';
    this._running = true;
    this._runBtn.disabled = true;
    this._runBtn.textContent = '⏳ Running…';
    this._resultPanel.hidden = true;
    this._promoteActions.hidden = true;
    this._updateCardStatus(exp.id, 'running');

    const startedAt = Date.now();

    try {
      let result = null;
      let inputTokens = 0;
      let outputTokens = 0;
      let costUsd = 0;

      if (window.api && window.api.runPrompt) {
        const response = await window.api.runPrompt({
          worldId: this._worldId,
          prompt: exp.prompt,
          zoneType: 'rnd',
        });
        result = response.text || response.result || JSON.stringify(response);
        inputTokens = response.input_tokens || 0;
        outputTokens = response.output_tokens || 0;
        costUsd = response.cost_usd || 0;
      } else {
        // Simulate in dev/offline mode
        await new Promise(r => setTimeout(r, 800));
        result = `[Simulated result]\n\nPrompt received (${exp.prompt.length} chars). No API connected — this is a placeholder result.`;
      }

      const latencyMs = Date.now() - startedAt;

      exp.result = result;
      exp.status = 'complete';

      // Persist to DB if possible
      if (window.api && window.api.db && window.api.db.saveExperiment) {
        try {
          const savedId = await window.api.db.saveExperiment(this._worldId, {
            name: exp.name,
            description: exp.description,
            prompt: exp.prompt,
            result,
            status: 'complete',
          });
          if (savedId && exp.id.startsWith('local-')) {
            // Update local id to DB id
            exp.id = savedId;
          }
        } catch (dbErr) {
          console.warn('[RndLab] Could not persist experiment:', dbErr);
        }
      }

      // Show result
      this._resultText.textContent = result;

      const metaParts = [];
      if (inputTokens) metaParts.push(`${inputTokens.toLocaleString()} in`);
      if (outputTokens) metaParts.push(`${outputTokens.toLocaleString()} out`);
      if (costUsd) metaParts.push(`$${costUsd.toFixed(4)}`);
      metaParts.push(`${latencyMs}ms`);
      this._resultMeta.textContent = metaParts.join(' · ');

      this._resultPanel.hidden = false;
      this._promoteActions.hidden = false;

    } catch (err) {
      console.error('[RndLab] Experiment failed:', err);
      exp.result = `Error: ${err.message || 'Unknown error'}`;
      exp.status = 'error';

      this._resultText.textContent = exp.result;
      this._resultMeta.textContent = '';
      this._resultPanel.hidden = false;
      this._promoteActions.hidden = true;

      document.dispatchEvent(new CustomEvent('toast:show', {
        detail: { type: 'error', title: 'Experiment Failed', description: err.message || 'Unknown error' },
        bubbles: true,
      }));
    } finally {
      this._running = false;
      this._runBtn.disabled = false;
      this._runBtn.textContent = '🧪 Run Experiment';
      this._updateCardStatus(exp.id, exp.status);
    }
  }

  _updateCardStatus(id, status) {
    const card = this._experimentListEl.querySelector(`[data-id="${id}"]`);
    if (!card) return;

    const badge = card.querySelector('.rnd-status');
    if (!badge) return;

    const conf = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
    // Remove all status classes
    for (const cls of Object.values(STATUS_CONFIG)) {
      badge.classList.remove(cls.cssClass);
    }
    badge.classList.add(conf.cssClass);
    badge.textContent = conf.label;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Utility
  // ═══════════════════════════════════════════════════════════════════

  _selectedExperiment() {
    return this._experiments.find(e => e.id === this._selectedId) || null;
  }

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
