/**
 * dispatch.js — Dispatch Tower zone module
 *
 * THE core AI task feature of Claude World. All AI tasks originate here.
 * Users compose prompts, select models, dispatch tasks, and review results.
 *
 * Layout:
 *   Top (40%)    — Task input: textarea, model selector, temperature, dispatch button
 *   Bottom (60%) — Tabbed view: Active Tasks | History | Stats
 *
 * Uses window.api.ai.dispatch() for real AI dispatch.
 * Emits 'dispatch:task-complete' on completion.
 *
 * @module Dispatch
 */

// Load styles
const _styleLink = document.createElement('link');
_styleLink.rel = 'stylesheet';
_styleLink.href = '../zones/dispatch.css';
if (!document.querySelector('link[href*="dispatch.css"]')) {
  document.head.appendChild(_styleLink);
}

// ── Constants ────────────────────────────────────────────────────

const MODELS = [
  { group: 'Anthropic', id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  { group: 'Anthropic', id: 'claude-haiku-4-20250414', label: 'Claude Haiku 4' },
  { group: 'OpenAI', id: 'gpt-4o', label: 'GPT-4o' },
  { group: 'OpenAI', id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
];

const TEMPLATES = [
  { label: 'Summarize', prompt: 'Summarize the following content concisely, highlighting the key points:\n\n' },
  { label: 'Analyze', prompt: 'Analyze the following in depth. Identify patterns, strengths, weaknesses, and opportunities:\n\n' },
  { label: 'Draft email', prompt: 'Draft a professional email for the following context:\n\nTo: \nSubject: \nContext: ' },
  { label: 'Code review', prompt: 'Review the following code for bugs, performance issues, and best practices. Suggest improvements:\n\n```\n\n```' },
  { label: 'Brainstorm', prompt: 'Brainstorm 10 creative ideas for the following:\n\n' },
];

const STATUS_LABELS = {
  success: 'Success',
  fail: 'Failed',
  cancelled: 'Cancelled',
  pending: 'Pending',
};

// ── Utility functions ────────────────────────────────────────────

function generateId() {
  return `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(date) {
  const d = new Date(date);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatElapsed(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

function formatTokens(n) {
  if (!n) return '0';
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function formatCost(usd) {
  if (!usd || usd === 0) return '$0.00';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

/**
 * Simple markdown-like formatting for AI responses.
 * Handles: headers, code blocks, inline code, bold, italic, lists.
 */
function formatResponse(text) {
  if (!text) return '';

  // Escape HTML
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks: ```lang\n...\n```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<div class="dispatch-code-block" data-lang="${lang}">${code.trim()}</div>`;
  });

  // Inline code: `...`
  html = html.replace(/`([^`]+)`/g, '<span class="dispatch-inline-code">$1</span>');

  // Headers: ### / ## / #
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold: **...**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Italic: *...*
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // Unordered lists: - item
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Ordered lists: 1. item
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // Line breaks (outside of code blocks and HTML tags)
  html = html.replace(/\n/g, '<br>');

  // Clean up extra <br> around block elements
  html = html.replace(/<br><(h[123]|ul|ol|div|li)/g, '<$1');
  html = html.replace(/<\/(h[123]|ul|ol|div|li)><br>/g, '</$1>');

  return html;
}

// ── Dispatch class ───────────────────────────────────────────────

export class Dispatch {
  constructor() {
    /** @type {HTMLElement|null} */
    this.container = null;

    /** @type {string|null} */
    this.worldId = null;

    /** @type {Map<string, object>} Active (running) tasks keyed by ID */
    this.activeTasks = new Map();

    /** @type {Array<object>} Completed task history (newest first) */
    this.history = [];

    /** @type {object|null} Currently viewed task detail */
    this.detailTask = null;

    /** @type {object} Stats counters */
    this.stats = {
      tasksToday: 0,
      tokensToday: 0,
      costToday: 0,
      successCount: 0,
      failCount: 0,
      modelUsage: {},
    };

    /** @type {string} Currently active tab */
    this._activeTab = 'active';

    /** @type {Map<string, number>} Interval IDs for elapsed time updates */
    this._timerIntervals = new Map();
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Create and return the root DOM element.
   * @returns {HTMLElement}
   */
  render() {
    const el = document.createElement('div');
    el.className = 'dispatch-tower';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Dispatch Tower');

    el.innerHTML = `
      <!-- Top: Task Input Area -->
      <div class="dispatch-input-area">
        <div class="dispatch-input-area__header">
          <div class="dispatch-input-area__title">
            <span class="dispatch-input-area__title-icon">&#x1F3F0;</span>
            Dispatch Tower
          </div>
        </div>

        <div class="dispatch-templates" role="toolbar" aria-label="Quick templates">
          ${TEMPLATES.map(t => `<button class="dispatch-templates__btn" data-template="${t.label}" type="button">${t.label}</button>`).join('')}
        </div>

        <div class="dispatch-textarea-wrap">
          <textarea
            class="dispatch-textarea"
            placeholder="Describe your task... What do you need the AI to do?"
            aria-label="Task prompt"
            rows="4"
          ></textarea>
        </div>

        <div class="dispatch-controls">
          <select class="dispatch-model-select" aria-label="Model selector">
            ${this._renderModelOptions()}
          </select>

          <div class="dispatch-temp-wrap">
            <span class="dispatch-temp-label">Temp</span>
            <input type="range" class="dispatch-temp-slider" min="0" max="1" step="0.1" value="0.7" aria-label="Temperature">
            <span class="dispatch-temp-value">0.7</span>
          </div>

          <button class="dispatch-send-btn" type="button">
            Dispatch
            <span class="dispatch-send-btn__shortcut">&#x2318;&#x23CE;</span>
          </button>
        </div>
      </div>

      <!-- Bottom: Tabs + Content -->
      <div class="dispatch-bottom">
        <div class="dispatch-tabs" role="tablist">
          <button class="dispatch-tab dispatch-tab--active" data-tab="active" role="tab" aria-selected="true">
            Active
            <span class="dispatch-tab__badge" data-badge="active" style="display:none">0</span>
          </button>
          <button class="dispatch-tab" data-tab="history" role="tab" aria-selected="false">History</button>
          <button class="dispatch-tab" data-tab="stats" role="tab" aria-selected="false">Stats</button>
        </div>

        <div class="dispatch-tab-content">
          <div class="dispatch-tab-pane dispatch-tab-pane--active" data-pane="active">
            <div class="dispatch-active-list">
              ${this._renderActiveEmpty()}
            </div>
          </div>
          <div class="dispatch-tab-pane" data-pane="history">
            <div class="dispatch-history-list">
              ${this._renderHistoryEmpty()}
            </div>
          </div>
          <div class="dispatch-tab-pane" data-pane="stats">
            <div class="dispatch-stats-container">
              ${this._renderStats()}
            </div>
          </div>
        </div>
      </div>
    `;

    this.container = el;
    return el;
  }

  /**
   * Initialize the zone after mount.
   * Loads task history from DB and binds events.
   * @param {string|number} worldId
   */
  async init(worldId) {
    this.worldId = worldId;
    this._bindEvents();
    await this._loadHistory();
    this._updateStatsFromHistory();
    this._renderHistoryList();
    this._renderStatsView();
  }

  // ── Event binding ──────────────────────────────────────────────

  _bindEvents() {
    if (!this.container) return;

    // Template buttons
    this.container.querySelectorAll('.dispatch-templates__btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const label = btn.dataset.template;
        const template = TEMPLATES.find(t => t.label === label);
        if (template) {
          const textarea = this.container.querySelector('.dispatch-textarea');
          textarea.value = template.prompt;
          textarea.focus();
          // Place cursor at end
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
      });
    });

    // Temperature slider
    const slider = this.container.querySelector('.dispatch-temp-slider');
    const tempValue = this.container.querySelector('.dispatch-temp-value');
    slider.addEventListener('input', () => {
      tempValue.textContent = parseFloat(slider.value).toFixed(1);
    });

    // Dispatch button
    const sendBtn = this.container.querySelector('.dispatch-send-btn');
    sendBtn.addEventListener('click', () => this._handleDispatch());

    // Cmd+Enter shortcut on textarea
    const textarea = this.container.querySelector('.dispatch-textarea');
    textarea.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this._handleDispatch();
      }
    });

    // Tab switching
    this.container.querySelectorAll('.dispatch-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        this._switchTab(tabId);
      });
    });
  }

  // ── Tab management ─────────────────────────────────────────────

  _switchTab(tabId) {
    this._activeTab = tabId;

    // Update tab buttons
    this.container.querySelectorAll('.dispatch-tab').forEach(t => {
      const isActive = t.dataset.tab === tabId;
      t.classList.toggle('dispatch-tab--active', isActive);
      t.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    // Update panes
    this.container.querySelectorAll('.dispatch-tab-pane').forEach(p => {
      p.classList.toggle('dispatch-tab-pane--active', p.dataset.pane === tabId);
    });

    // If switching to history and we're in detail view, stay in detail view
    // (no extra logic needed since we replace pane content directly)
  }

  // ── Dispatch handler ───────────────────────────────────────────

  async _handleDispatch() {
    const textarea = this.container.querySelector('.dispatch-textarea');
    const prompt = textarea.value.trim();
    if (!prompt) return;

    const modelSelect = this.container.querySelector('.dispatch-model-select');
    const tempSlider = this.container.querySelector('.dispatch-temp-slider');
    const sendBtn = this.container.querySelector('.dispatch-send-btn');

    const model = modelSelect.value;
    const temperature = parseFloat(tempSlider.value);

    // Determine provider from model
    const modelInfo = MODELS.find(m => m.id === model);
    const provider = modelInfo ? (modelInfo.group === 'Anthropic' ? 'anthropic' : 'openai') : null;

    // Create task object
    const task = {
      id: generateId(),
      prompt,
      model,
      provider,
      temperature,
      status: 'running',
      startTime: Date.now(),
      elapsedMs: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      response: '',
    };

    // Add to active tasks
    this.activeTasks.set(task.id, task);

    // Clear textarea and disable button
    textarea.value = '';
    sendBtn.disabled = true;

    // Switch to active tab and render
    this._switchTab('active');
    this._renderActiveList();
    this._updateActiveBadge();

    // Start elapsed timer
    const timerId = setInterval(() => {
      task.elapsedMs = Date.now() - task.startTime;
      this._updateActiveTaskTimer(task.id);
    }, 100);
    this._timerIntervals.set(task.id, timerId);

    // Execute the dispatch
    try {
      const result = await window.api.ai.dispatch({
        worldId: this.worldId,
        zoneId: 'dispatch',
        provider: provider,
        model: model,
        messages: [{ role: 'user', content: prompt }],
        systemPrompt: null,
        maxTokens: 4096,
      });

      // Mark success
      task.status = 'success';
      task.response = result.text || '';
      task.inputTokens = result.inputTokens || 0;
      task.outputTokens = result.outputTokens || 0;
      task.costUsd = result.costUsd || 0;
      task.elapsedMs = result.latencyMs || (Date.now() - task.startTime);
      task.model = result.model || model;

    } catch (err) {
      task.status = 'fail';
      task.response = `Error: ${err.message || 'Unknown error'}`;
      task.elapsedMs = Date.now() - task.startTime;
    }

    // Stop timer
    clearInterval(this._timerIntervals.get(task.id));
    this._timerIntervals.delete(task.id);

    // Move from active to history
    this.activeTasks.delete(task.id);
    task.completedAt = Date.now();
    this.history.unshift(task);

    // Update stats
    this._updateStatsWithTask(task);

    // Re-enable button
    sendBtn.disabled = false;

    // Re-render
    this._renderActiveList();
    this._updateActiveBadge();
    this._renderHistoryList();
    this._renderStatsView();

    // Persist to DB (best effort)
    this._persistTask(task);

    // Dispatch completion event
    document.dispatchEvent(new CustomEvent('dispatch:task-complete', {
      detail: {
        taskId: task.id,
        status: task.status,
        model: task.model,
        tokens: task.inputTokens + task.outputTokens,
        costUsd: task.costUsd,
      },
      bubbles: true,
    }));
  }

  // ── Cancel handler ─────────────────────────────────────────────

  _cancelTask(taskId) {
    const task = this.activeTasks.get(taskId);
    if (!task) return;

    // Stop timer
    clearInterval(this._timerIntervals.get(taskId));
    this._timerIntervals.delete(taskId);

    // Mark cancelled
    task.status = 'cancelled';
    task.response = 'Task was cancelled by user.';
    task.elapsedMs = Date.now() - task.startTime;
    task.completedAt = Date.now();

    // Move to history
    this.activeTasks.delete(taskId);
    this.history.unshift(task);

    // Re-render
    this._renderActiveList();
    this._updateActiveBadge();
    this._renderHistoryList();
    this._renderStatsView();

    // Persist
    this._persistTask(task);
  }

  // ── Data loading ───────────────────────────────────────────────

  async _loadHistory() {
    try {
      if (window.api && window.api.db && window.api.db.getRecentTasks) {
        const tasks = await window.api.db.getRecentTasks(this.worldId, 100);
        if (Array.isArray(tasks)) {
          this.history = tasks.map(t => ({
            id: t.id || generateId(),
            prompt: t.prompt || t.input || '',
            model: t.model || 'unknown',
            provider: t.provider || null,
            status: t.status || 'success',
            response: t.response || t.output || '',
            inputTokens: t.input_tokens || t.inputTokens || 0,
            outputTokens: t.output_tokens || t.outputTokens || 0,
            costUsd: t.cost_usd || t.costUsd || 0,
            elapsedMs: t.latency_ms || t.latencyMs || 0,
            startTime: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
            completedAt: t.completed_at ? new Date(t.completed_at).getTime() : Date.now(),
            temperature: t.temperature || 0.7,
          }));
        }
      }
    } catch (err) {
      console.warn('[dispatch] Failed to load history:', err.message);
    }
  }

  async _persistTask(task) {
    try {
      if (window.api?.db?.createTask) {
        await window.api.db.createTask(this.worldId, {
          prompt: task.prompt,
          model: task.model,
          provider: task.provider,
          status: task.status,
          response: task.response,
          tokens_in: task.inputTokens || 0,
          tokens_out: task.outputTokens || 0,
          cost: task.costUsd || 0,
          completed_at: task.completedAt ? new Date(task.completedAt).toISOString() : null,
        });
      }
    } catch (err) {
      console.warn('[dispatch] Failed to persist task:', err.message);
    }
  }

  // ── Stats management ───────────────────────────────────────────

  _updateStatsFromHistory() {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    this.stats = {
      tasksToday: 0,
      tokensToday: 0,
      costToday: 0,
      successCount: 0,
      failCount: 0,
      modelUsage: {},
    };

    for (const task of this.history) {
      const taskTime = task.completedAt || task.startTime;
      if (taskTime >= todayMs) {
        this.stats.tasksToday++;
        this.stats.tokensToday += (task.inputTokens || 0) + (task.outputTokens || 0);
        this.stats.costToday += task.costUsd || 0;
      }
      if (task.status === 'success') this.stats.successCount++;
      if (task.status === 'fail') this.stats.failCount++;

      const m = task.model || 'unknown';
      this.stats.modelUsage[m] = (this.stats.modelUsage[m] || 0) + 1;
    }
  }

  _updateStatsWithTask(task) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const taskTime = task.completedAt || task.startTime;

    if (taskTime >= todayStart.getTime()) {
      this.stats.tasksToday++;
      this.stats.tokensToday += (task.inputTokens || 0) + (task.outputTokens || 0);
      this.stats.costToday += task.costUsd || 0;
    }
    if (task.status === 'success') this.stats.successCount++;
    if (task.status === 'fail') this.stats.failCount++;

    const m = task.model || 'unknown';
    this.stats.modelUsage[m] = (this.stats.modelUsage[m] || 0) + 1;
  }

  // ── Rendering: Model options ───────────────────────────────────

  _renderModelOptions() {
    let html = '';
    let currentGroup = '';
    for (const m of MODELS) {
      if (m.group !== currentGroup) {
        if (currentGroup) html += '</optgroup>';
        html += `<optgroup label="${m.group}">`;
        currentGroup = m.group;
      }
      html += `<option value="${m.id}">${m.label}</option>`;
    }
    if (currentGroup) html += '</optgroup>';
    return html;
  }

  // ── Rendering: Active tasks ────────────────────────────────────

  _renderActiveEmpty() {
    return `
      <div class="dispatch-active-empty">
        <span class="dispatch-active-empty__icon">&#x1F4E1;</span>
        No active tasks. Type a prompt above and hit Dispatch.
      </div>
    `;
  }

  _renderActiveList() {
    const listEl = this.container.querySelector('.dispatch-active-list');
    if (!listEl) return;

    if (this.activeTasks.size === 0) {
      listEl.innerHTML = this._renderActiveEmpty();
      return;
    }

    let html = '';
    for (const [id, task] of this.activeTasks) {
      html += `
        <div class="dispatch-active-task" data-task-id="${id}">
          <div class="dispatch-active-task__header">
            <span class="dispatch-active-task__model">${task.model}</span>
            <button class="dispatch-active-task__cancel" data-cancel="${id}" type="button">Cancel</button>
          </div>
          <div class="dispatch-active-task__prompt">${this._escapeHtml(task.prompt)}</div>
          <div class="dispatch-active-task__progress">
            <span class="dispatch-active-task__streaming">
              Streaming
              <span class="dispatch-streaming-dots"><span></span><span></span><span></span></span>
            </span>
            <span class="dispatch-active-task__elapsed" data-elapsed="${id}">${formatElapsed(task.elapsedMs)}</span>
            <span class="dispatch-active-task__tokens" data-tokens="${id}">${formatTokens(task.outputTokens)} tokens</span>
          </div>
          ${task.response ? `<div class="dispatch-active-task__stream-preview">${this._escapeHtml(task.response.slice(-200))}</div>` : ''}
        </div>
      `;
    }
    listEl.innerHTML = html;

    // Bind cancel buttons
    listEl.querySelectorAll('.dispatch-active-task__cancel').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._cancelTask(btn.dataset.cancel);
      });
    });
  }

  _updateActiveTaskTimer(taskId) {
    const el = this.container.querySelector(`[data-elapsed="${taskId}"]`);
    if (el) {
      const task = this.activeTasks.get(taskId);
      if (task) el.textContent = formatElapsed(task.elapsedMs);
    }
  }

  _updateActiveBadge() {
    const badge = this.container.querySelector('[data-badge="active"]');
    if (!badge) return;
    const count = this.activeTasks.size;
    badge.textContent = String(count);
    badge.style.display = count > 0 ? 'inline-flex' : 'none';
  }

  // ── Rendering: History ─────────────────────────────────────────

  _renderHistoryEmpty() {
    return `
      <div class="dispatch-history-empty">
        <span class="dispatch-history-empty__icon">&#x1F4DC;</span>
        No task history yet. Dispatch your first task above!
      </div>
    `;
  }

  _renderHistoryList() {
    const listEl = this.container.querySelector('.dispatch-history-list');
    if (!listEl) return;

    // If we're in detail view, don't overwrite
    if (this.detailTask) return;

    if (this.history.length === 0) {
      listEl.innerHTML = this._renderHistoryEmpty();
      return;
    }

    let html = '';
    for (const task of this.history) {
      const statusClass = task.status || 'pending';
      const totalTokens = (task.inputTokens || 0) + (task.outputTokens || 0);
      const responsePreview = (task.response || '').replace(/\n/g, ' ').slice(0, 80);

      html += `
        <div class="dispatch-history-card dispatch-history-card--${statusClass}" data-history-id="${task.id}">
          <div class="dispatch-history-card__top">
            <span class="dispatch-history-card__status dispatch-history-card__status--${statusClass}">
              ${STATUS_LABELS[statusClass] || statusClass}
            </span>
            <span class="dispatch-history-card__time">${formatTime(task.completedAt || task.startTime)}</span>
          </div>
          <div class="dispatch-history-card__prompt">${this._escapeHtml(task.prompt)}</div>
          <div class="dispatch-history-card__meta">
            <span>${task.model || 'unknown'}</span>
            <span>${formatTokens(totalTokens)} tok</span>
            <span>${formatCost(task.costUsd)}</span>
            <span>${formatElapsed(task.elapsedMs)}</span>
          </div>
          ${responsePreview ? `<div class="dispatch-history-card__response-preview">${this._escapeHtml(responsePreview)}</div>` : ''}
        </div>
      `;
    }
    listEl.innerHTML = html;

    // Bind click for detail view
    listEl.querySelectorAll('.dispatch-history-card').forEach(card => {
      card.addEventListener('click', () => {
        const id = card.dataset.historyId;
        const task = this.history.find(t => t.id === id);
        if (task) this._showDetail(task);
      });
    });
  }

  // ── Rendering: Task Detail ─────────────────────────────────────

  _showDetail(task) {
    this.detailTask = task;
    this._switchTab('history');

    const pane = this.container.querySelector('[data-pane="history"]');
    if (!pane) return;

    const totalTokens = (task.inputTokens || 0) + (task.outputTokens || 0);

    pane.innerHTML = `
      <div class="dispatch-detail">
        <button class="dispatch-detail__back" type="button">&#x2190; Back to history</button>

        <div class="dispatch-detail__section-title">Prompt</div>
        <div class="dispatch-detail__prompt-text">${this._escapeHtml(task.prompt)}</div>

        <div class="dispatch-detail__meta-row">
          <span class="dispatch-detail__meta-item">Model: <span>${task.model || 'unknown'}</span></span>
          <span class="dispatch-detail__meta-item">Status: <span>${STATUS_LABELS[task.status] || task.status}</span></span>
          <span class="dispatch-detail__meta-item">Tokens: <span>${formatTokens(task.inputTokens)} in / ${formatTokens(task.outputTokens)} out</span></span>
          <span class="dispatch-detail__meta-item">Cost: <span>${formatCost(task.costUsd)}</span></span>
          <span class="dispatch-detail__meta-item">Time: <span>${formatElapsed(task.elapsedMs)}</span></span>
        </div>

        <div class="dispatch-detail__section-title">Response</div>
        <div class="dispatch-detail__response">${formatResponse(task.response)}</div>

        <div class="dispatch-detail__actions">
          <button class="dispatch-detail__action-btn" data-action="copy" type="button">
            &#x1F4CB; Copy
          </button>
          <button class="dispatch-detail__action-btn" data-action="retry" type="button">
            &#x1F504; Retry
          </button>
          <button class="dispatch-detail__action-btn" data-action="save-brain" type="button">
            &#x1F9E0; Save to Brain
          </button>
        </div>
      </div>
    `;

    // Bind detail actions
    const backBtn = pane.querySelector('.dispatch-detail__back');
    backBtn.addEventListener('click', () => {
      this.detailTask = null;
      // Restore the history list container
      pane.innerHTML = '<div class="dispatch-history-list"></div>';
      this._renderHistoryList();
    });

    pane.querySelectorAll('.dispatch-detail__action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        if (action === 'copy') this._copyResponse(task);
        if (action === 'retry') this._retryTask(task);
        if (action === 'save-brain') this._saveToBrain(task);
      });
    });
  }

  // ── Detail actions ─────────────────────────────────────────────

  _copyResponse(task) {
    if (!task.response) return;
    navigator.clipboard.writeText(task.response).then(() => {
      this._showToast('Response copied to clipboard');
    }).catch(() => {
      this._showToast('Failed to copy');
    });
  }

  _retryTask(task) {
    // Pre-fill the textarea with the original prompt and go back
    this.detailTask = null;
    const pane = this.container.querySelector('[data-pane="history"]');
    if (pane) {
      pane.innerHTML = '<div class="dispatch-history-list"></div>';
      this._renderHistoryList();
    }

    const textarea = this.container.querySelector('.dispatch-textarea');
    if (textarea) {
      textarea.value = task.prompt;
      textarea.focus();
    }

    // Try to set the same model
    const modelSelect = this.container.querySelector('.dispatch-model-select');
    if (modelSelect && task.model) {
      const option = modelSelect.querySelector(`option[value="${task.model}"]`);
      if (option) modelSelect.value = task.model;
    }

    this._switchTab('active');
  }

  async _saveToBrain(task) {
    try {
      if (window.api && window.api.db && window.api.db.run) {
        await window.api.db.run(
          `INSERT INTO brain_items (id, world_id, title, content, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            generateId(),
            this.worldId,
            task.prompt.slice(0, 80),
            task.response,
            'dispatch',
            new Date().toISOString(),
          ]
        );
        this._showToast('Saved to Brain Library');
      } else {
        this._showToast('Brain Library not available');
      }
    } catch (err) {
      console.warn('[dispatch] Failed to save to brain:', err.message);
      this._showToast('Failed to save');
    }
  }

  // ── Rendering: Stats ───────────────────────────────────────────

  _renderStats() {
    const total = this.stats.successCount + this.stats.failCount;
    const rate = total > 0 ? Math.round((this.stats.successCount / total) * 100) : 0;

    // Find favorite model
    let favModel = 'None';
    let maxCount = 0;
    for (const [model, count] of Object.entries(this.stats.modelUsage)) {
      if (count > maxCount) { maxCount = count; favModel = model; }
    }
    // Shorten model name for display
    const modelInfo = MODELS.find(m => m.id === favModel);
    const favModelLabel = modelInfo ? modelInfo.label : favModel;

    return `
      <div class="dispatch-stats">
        <div class="dispatch-stat-card">
          <div class="dispatch-stat-card__value">${this.stats.tasksToday}</div>
          <div class="dispatch-stat-card__label">Tasks Today</div>
        </div>
        <div class="dispatch-stat-card">
          <div class="dispatch-stat-card__value">${formatTokens(this.stats.tokensToday)}</div>
          <div class="dispatch-stat-card__label">Tokens Today</div>
        </div>
        <div class="dispatch-stat-card">
          <div class="dispatch-stat-card__value">${formatCost(this.stats.costToday)}</div>
          <div class="dispatch-stat-card__label">Cost Today</div>
        </div>
        <div class="dispatch-stat-card">
          <div class="dispatch-stat-card__value">${rate}%</div>
          <div class="dispatch-stat-card__label">Success Rate</div>
        </div>
        <div class="dispatch-stat-card dispatch-stat-card--wide">
          <div class="dispatch-stat-card__value" style="font-size:14px">${favModelLabel}</div>
          <div class="dispatch-stat-card__label">Favorite Model (${maxCount} uses)</div>
        </div>
        <div class="dispatch-stat-card">
          <div class="dispatch-stat-card__value">${this.history.length}</div>
          <div class="dispatch-stat-card__label">Total Tasks</div>
        </div>
        <div class="dispatch-stat-card">
          <div class="dispatch-stat-card__value">${this.stats.failCount}</div>
          <div class="dispatch-stat-card__label">Failed</div>
        </div>
      </div>
    `;
  }

  _renderStatsView() {
    const container = this.container.querySelector('.dispatch-stats-container');
    if (container) {
      container.innerHTML = this._renderStats();
    }
  }

  // ── Toast notification ─────────────────────────────────────────

  _showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'dispatch-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  // ── Helpers ────────────────────────────────────────────────────

  _escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
