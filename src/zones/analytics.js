/**
 * analytics.js — Analytics Dashboard zone
 *
 * Data visualisation dashboard for Claude World. Shows activity trends,
 * zone usage, AI provider distribution, token consumption, agent
 * leaderboard, and an overall World Health Score.
 *
 * All charts are rendered with the Canvas 2D API — no external libraries.
 *
 * Sections:
 *   1. Activity Timeline   — bar chart, tasks/day (last N days)
 *   2. Zone Usage           — horizontal bar chart by task count
 *   3. AI Provider Stats    — pie chart (Claude / GPT / Gemini / Other)
 *   4. Token Consumption    — line chart of tokens/day + cost estimate
 *   5. Agent Performance    — leaderboard table
 *   6. World Health Score   — single 0-100 gauge
 *
 * Public API:
 *   render()              → HTMLElement
 *   async init(worldId)   — fetch data, draw charts
 *   destroy()             — cleanup timers / listeners
 */

// ── Constants ──────────────────────────────────────────────────────────

const RANGES = [
  { key: '7d',  label: '7 D',  days: 7  },
  { key: '30d', label: '30 D', days: 30 },
  { key: '90d', label: '90 D', days: 90 },
  { key: 'all', label: 'All',  days: 0  },
];

const PROVIDER_COLORS = {
  anthropic:  '#d97706',
  openai:     '#10b981',
  google:     '#6366f1',
  other:      '#6b7280',
};

const PROVIDER_LABELS = {
  anthropic:  'Claude',
  openai:     'GPT',
  google:     'Gemini',
  other:      'Other',
};

const CHART_COLORS = {
  blue:    '#3b82f6',
  cyan:    '#22d3ee',
  green:   '#22c55e',
  amber:   '#f59e0b',
  purple:  '#a78bfa',
  pink:    '#f472b6',
  red:     '#ef4444',
};

// Approximate cost per 1K tokens (blended input/output)
const COST_PER_1K_TOKENS = 0.008;

// ── Helpers ────────────────────────────────────────────────────────────

function escHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function fmtNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(Math.round(n));
}

function fmtCost(usd) {
  if (usd >= 1) return '$' + usd.toFixed(2);
  if (usd >= 0.01) return '$' + usd.toFixed(3);
  return '$' + usd.toFixed(4);
}

function fmtMs(ms) {
  if (ms >= 60_000) return (ms / 60_000).toFixed(1) + 'm';
  if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
  return Math.round(ms) + 'ms';
}

/** Return an array of date strings ['2026-03-01', ...] for the last N days. */
function dateRange(days) {
  const result = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    result.push(d.toISOString().slice(0, 10));
  }
  return result;
}

/** Get device pixel ratio for crisp canvases. */
function dpr() {
  return window.devicePixelRatio || 1;
}

/** Set up a canvas element with proper DPR scaling. */
function setupCanvas(canvas, w, h) {
  const ratio = dpr();
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  return ctx;
}

// ── Analytics class ────────────────────────────────────────────────────

export class Analytics {
  constructor() {
    /** @type {string|number|null} */
    this._worldId = null;

    /** @type {HTMLElement|null} */
    this._el = null;

    /** @type {string} Current range key */
    this._range = '30d';

    /** @type {object|null} Fetched analytics data */
    this._data = null;

    /** @type {number|null} Refresh timer */
    this._refreshTimer = null;

    /** @type {boolean} Whether initial load is complete */
    this._loaded = false;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Create and return the root DOM element.
   * @returns {HTMLElement}
   */
  render() {
    this._injectCSS();

    const el = document.createElement('div');
    el.className = 'analytics-dashboard';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Analytics Dashboard');
    this._el = el;

    el.innerHTML = this._buildShellHTML();
    this._wireRangeButtons();

    return el;
  }

  /**
   * Load data and render charts.
   * @param {string|number} worldId
   */
  async init(worldId) {
    this._worldId = worldId;
    await this._fetchAndRender();

    // Refresh every 60 seconds
    this._refreshTimer = setInterval(() => {
      this._fetchAndRender();
    }, 60_000);
  }

  /**
   * Cleanup timers.
   */
  destroy() {
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CSS injection
  // ═══════════════════════════════════════════════════════════════════════

  _injectCSS() {
    const id = 'analytics-styles';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'src/zones/analytics.css';
    document.head.appendChild(link);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Data fetching
  // ═══════════════════════════════════════════════════════════════════════

  async _fetchAndRender() {
    if (!this._worldId) return;

    try {
      const data = await window.api.db.getAnalytics(this._worldId, this._range);
      this._data = data;
      this._loaded = true;
      this._renderDashboard();
    } catch (err) {
      console.warn('[Analytics] Failed to fetch data:', err);
      // Render with empty/mock data
      this._data = this._emptyData();
      this._loaded = true;
      this._renderDashboard();
    }
  }

  _emptyData() {
    const rangeCfg = RANGES.find(r => r.key === this._range) || RANGES[1];
    const days = rangeCfg.days || 30;
    const dates = dateRange(days);
    return {
      tasksPerDay: dates.map(d => ({ date: d, count: 0 })),
      zoneUsage: [],
      providerUsage: [],
      tokensPerDay: dates.map(d => ({ date: d, input_tokens: 0, output_tokens: 0, cost: 0 })),
      agentPerformance: [],
      healthScore: { score: 0, activityScore: 0, diversityScore: 0, questScore: 0 },
      summary: { totalTasks: 0, totalTokens: 0, totalCost: 0, avgLatency: 0 },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Shell HTML (header + range selector + grid placeholders)
  // ═══════════════════════════════════════════════════════════════════════

  _buildShellHTML() {
    const rangeButtons = RANGES.map(r =>
      `<button class="an-range-btn ${r.key === this._range ? 'an-range-btn--active' : ''}"
              data-range="${r.key}">${r.label}</button>`
    ).join('');

    return `
      <header class="an-header">
        <span class="an-header__icon">\u{1F4CA}</span>
        <span class="an-header__title">Analytics Dashboard
          <span class="an-header__subtitle">Real-time metrics &amp; insights</span>
        </span>
        <div class="an-range-selector">${rangeButtons}</div>
      </header>
      <div class="an-body" id="an-body">
        <div class="an-grid" id="an-grid">
          <div class="an-card an-grid__full an-loading" id="an-card-timeline" style="min-height:200px"></div>
          <div class="an-card an-loading" id="an-card-zones" style="min-height:200px"></div>
          <div class="an-card an-loading" id="an-card-providers" style="min-height:200px"></div>
          <div class="an-card an-grid__full an-loading" id="an-card-tokens" style="min-height:200px"></div>
          <div class="an-card an-loading" id="an-card-agents" style="min-height:220px"></div>
          <div class="an-card an-loading" id="an-card-health" style="min-height:220px"></div>
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Range selector
  // ═══════════════════════════════════════════════════════════════════════

  _wireRangeButtons() {
    if (!this._el) return;
    const selector = this._el.querySelector('.an-range-selector');
    if (!selector) return;

    selector.addEventListener('click', (e) => {
      const btn = e.target.closest('.an-range-btn');
      if (!btn) return;
      const range = btn.dataset.range;
      if (range === this._range) return;

      this._range = range;

      // Update active state
      selector.querySelectorAll('.an-range-btn').forEach(b =>
        b.classList.toggle('an-range-btn--active', b.dataset.range === range)
      );

      // Show loading state
      this._el.querySelectorAll('.an-card').forEach(c => {
        c.classList.add('an-loading');
        c.innerHTML = '';
      });

      this._fetchAndRender();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Render dashboard (fill cards with data)
  // ═══════════════════════════════════════════════════════════════════════

  _renderDashboard() {
    if (!this._el || !this._data) return;

    // Remove loading states
    this._el.querySelectorAll('.an-card').forEach(c => c.classList.remove('an-loading'));

    this._renderActivityTimeline();
    this._renderZoneUsage();
    this._renderProviderStats();
    this._renderTokenConsumption();
    this._renderAgentPerformance();
    this._renderHealthScore();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 1. Activity Timeline — bar chart of tasks per day
  // ═══════════════════════════════════════════════════════════════════════

  _renderActivityTimeline() {
    const card = this._el.querySelector('#an-card-timeline');
    if (!card) return;

    const data = this._data.tasksPerDay || [];
    const totalTasks = this._data.summary?.totalTasks || data.reduce((s, d) => s + d.count, 0);

    card.innerHTML = `
      <div class="an-card__header">
        <span class="an-card__icon">\u{1F4C8}</span>
        <span class="an-card__title">Activity Timeline</span>
        <span class="an-card__badge">${fmtNumber(totalTasks)} tasks</span>
      </div>
      <div class="an-chart-wrap">
        <canvas id="an-chart-timeline" height="160"></canvas>
      </div>
    `;

    const canvas = card.querySelector('#an-chart-timeline');
    if (!canvas) return;

    // Wait for layout
    requestAnimationFrame(() => this._drawBarChart(canvas, data));
  }

  _drawBarChart(canvas, data) {
    const w = canvas.parentElement.clientWidth || 400;
    const h = 160;
    const ctx = setupCanvas(canvas, w, h);

    if (data.length === 0) {
      ctx.fillStyle = '#3a4560';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No activity data', w / 2, h / 2);
      return;
    }

    const padding = { top: 20, right: 12, bottom: 28, left: 40 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;
    const maxVal = Math.max(...data.map(d => d.count), 1);
    const barW = Math.max(2, (plotW / data.length) - 2);
    const gap = (plotW - barW * data.length) / (data.length + 1);

    // Grid lines
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.08)';
    ctx.lineWidth = 0.5;
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (plotH / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      // Y-axis labels
      const val = Math.round(maxVal - (maxVal / gridLines) * i);
      ctx.fillStyle = '#6b7a99';
      ctx.font = '9px SF Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(String(val), padding.left - 6, y + 3);
    }

    // Bars
    data.forEach((d, i) => {
      const x = padding.left + gap + i * (barW + gap);
      const barH = (d.count / maxVal) * plotH;
      const y = padding.top + plotH - barH;

      // Bar gradient
      const grad = ctx.createLinearGradient(x, y, x, padding.top + plotH);
      grad.addColorStop(0, CHART_COLORS.blue);
      grad.addColorStop(1, CHART_COLORS.blue + '44');
      ctx.fillStyle = grad;

      // Rounded top
      const radius = Math.min(3, barW / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + barW - radius, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + radius);
      ctx.lineTo(x + barW, padding.top + plotH);
      ctx.lineTo(x, padding.top + plotH);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.fill();

      // X-axis labels (show every Nth)
      const showEvery = Math.max(1, Math.floor(data.length / 8));
      if (i % showEvery === 0 || i === data.length - 1) {
        ctx.fillStyle = '#6b7a99';
        ctx.font = '8px SF Mono, monospace';
        ctx.textAlign = 'center';
        const label = d.date.slice(5); // MM-DD
        ctx.fillText(label, x + barW / 2, h - 6);
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. Zone Usage — horizontal bar chart
  // ═══════════════════════════════════════════════════════════════════════

  _renderZoneUsage() {
    const card = this._el.querySelector('#an-card-zones');
    if (!card) return;

    const data = (this._data.zoneUsage || []).slice(0, 10);

    card.innerHTML = `
      <div class="an-card__header">
        <span class="an-card__icon">\u{1F3D7}</span>
        <span class="an-card__title">Zone Usage</span>
        <span class="an-card__badge">Top ${data.length}</span>
      </div>
      <div class="an-chart-wrap">
        <canvas id="an-chart-zones" height="${Math.max(140, data.length * 26 + 20)}"></canvas>
      </div>
    `;

    const canvas = card.querySelector('#an-chart-zones');
    if (!canvas) return;

    requestAnimationFrame(() => this._drawHBarChart(canvas, data));
  }

  _drawHBarChart(canvas, data) {
    const w = canvas.parentElement.clientWidth || 300;
    const rowH = 24;
    const h = Math.max(140, data.length * rowH + 20);
    const ctx = setupCanvas(canvas, w, h);

    if (data.length === 0) {
      ctx.fillStyle = '#3a4560';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No zone data', w / 2, h / 2);
      return;
    }

    const labelW = 100;
    const barMax = w - labelW - 60;
    const maxVal = Math.max(...data.map(d => d.count), 1);

    const colors = [
      CHART_COLORS.blue, CHART_COLORS.cyan, CHART_COLORS.green,
      CHART_COLORS.amber, CHART_COLORS.purple, CHART_COLORS.pink,
      CHART_COLORS.red, '#64748b', '#84cc16', '#14b8a6',
    ];

    data.forEach((d, i) => {
      const y = 10 + i * rowH;
      const barW = (d.count / maxVal) * barMax;
      const color = colors[i % colors.length];

      // Label
      ctx.fillStyle = '#c8d0e0';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'right';
      const label = (d.zone_name || d.zone_type || 'Unknown').slice(0, 14);
      ctx.fillText(label, labelW - 8, y + 15);

      // Bar
      const grad = ctx.createLinearGradient(labelW, y, labelW + barW, y);
      grad.addColorStop(0, color);
      grad.addColorStop(1, color + '66');
      ctx.fillStyle = grad;

      const barH = 14;
      const radius = 4;
      ctx.beginPath();
      ctx.moveTo(labelW, y + 4);
      ctx.lineTo(labelW + barW - radius, y + 4);
      ctx.quadraticCurveTo(labelW + barW, y + 4, labelW + barW, y + 4 + radius);
      ctx.lineTo(labelW + barW, y + 4 + barH - radius);
      ctx.quadraticCurveTo(labelW + barW, y + 4 + barH, labelW + barW - radius, y + 4 + barH);
      ctx.lineTo(labelW, y + 4 + barH);
      ctx.closePath();
      ctx.fill();

      // Count label
      ctx.fillStyle = '#6b7a99';
      ctx.font = '9px SF Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText(String(d.count), labelW + barW + 6, y + 15);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3. AI Provider Stats — pie chart
  // ═══════════════════════════════════════════════════════════════════════

  _renderProviderStats() {
    const card = this._el.querySelector('#an-card-providers');
    if (!card) return;

    const data = this._data.providerUsage || [];
    const total = data.reduce((s, d) => s + d.count, 0) || 1;

    const legendItems = data.map(d => {
      const pKey = this._normalizeProvider(d.provider);
      const color = PROVIDER_COLORS[pKey] || PROVIDER_COLORS.other;
      const label = PROVIDER_LABELS[pKey] || d.provider || 'Unknown';
      const pct = ((d.count / total) * 100).toFixed(1);
      return `
        <div class="an-pie-legend__item">
          <span class="an-pie-legend__dot" style="background:${color}"></span>
          <span class="an-pie-legend__name">${escHtml(label)}</span>
          <span class="an-pie-legend__value">${d.count} (${pct}%)</span>
        </div>
      `;
    }).join('');

    card.innerHTML = `
      <div class="an-card__header">
        <span class="an-card__icon">\u{1F916}</span>
        <span class="an-card__title">AI Provider Stats</span>
        <span class="an-card__badge">${fmtNumber(total)} calls</span>
      </div>
      <div class="an-chart-wrap" style="display:flex;justify-content:center;">
        <canvas id="an-chart-providers" width="140" height="140"></canvas>
      </div>
      <div class="an-pie-legend">${legendItems || '<div class="an-empty"><span class="an-empty__icon">\u{1F50D}</span>No provider data yet</div>'}</div>
    `;

    const canvas = card.querySelector('#an-chart-providers');
    if (!canvas) return;

    requestAnimationFrame(() => this._drawPieChart(canvas, data, total));
  }

  _normalizeProvider(p) {
    if (!p) return 'other';
    const lp = p.toLowerCase();
    if (lp.includes('anthropic') || lp.includes('claude')) return 'anthropic';
    if (lp.includes('openai') || lp.includes('gpt')) return 'openai';
    if (lp.includes('google') || lp.includes('gemini')) return 'google';
    return 'other';
  }

  _drawPieChart(canvas, data, total) {
    const size = 140;
    const ctx = setupCanvas(canvas, size, size);
    const cx = size / 2;
    const cy = size / 2;
    const radius = 55;
    const innerRadius = 30;

    if (data.length === 0) {
      // Empty ring
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2, true);
      ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
      ctx.fill();
      ctx.fillStyle = '#3a4560';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No data', cx, cy + 4);
      return;
    }

    let angle = -Math.PI / 2;
    data.forEach(d => {
      const pKey = this._normalizeProvider(d.provider);
      const color = PROVIDER_COLORS[pKey] || PROVIDER_COLORS.other;
      const sliceAngle = (d.count / total) * Math.PI * 2;

      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * innerRadius, cy + Math.sin(angle) * innerRadius);
      ctx.arc(cx, cy, radius, angle, angle + sliceAngle);
      ctx.arc(cx, cy, innerRadius, angle + sliceAngle, angle, true);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      // Subtle border
      ctx.strokeStyle = '#06080e';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      angle += sliceAngle;
    });

    // Center text
    ctx.fillStyle = '#c8d0e0';
    ctx.font = 'bold 16px SF Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(fmtNumber(total), cx, cy + 2);
    ctx.fillStyle = '#6b7a99';
    ctx.font = '8px Inter, sans-serif';
    ctx.fillText('TOTAL', cx, cy + 14);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4. Token Consumption — line chart + cost summary
  // ═══════════════════════════════════════════════════════════════════════

  _renderTokenConsumption() {
    const card = this._el.querySelector('#an-card-tokens');
    if (!card) return;

    const data = this._data.tokensPerDay || [];
    const summary = this._data.summary || {};
    const totalTokens = summary.totalTokens || data.reduce((s, d) => s + (d.input_tokens || 0) + (d.output_tokens || 0), 0);
    const totalCost = summary.totalCost || data.reduce((s, d) => s + (d.cost || 0), 0);

    card.innerHTML = `
      <div class="an-card__header">
        <span class="an-card__icon">\u{1F4B0}</span>
        <span class="an-card__title">Token Consumption</span>
        <span class="an-card__badge">${fmtCost(totalCost)}</span>
      </div>
      <div class="an-chart-wrap">
        <canvas id="an-chart-tokens" height="140"></canvas>
      </div>
      <div class="an-token-summary">
        <div class="an-token-box">
          <span class="an-token-box__value" id="an-total-tokens">${fmtNumber(totalTokens)}</span>
          <span class="an-token-box__label">Total Tokens</span>
        </div>
        <div class="an-token-box">
          <span class="an-token-box__value" id="an-total-cost">${fmtCost(totalCost)}</span>
          <span class="an-token-box__label">Est. Cost</span>
        </div>
        <div class="an-token-box">
          <span class="an-token-box__value">${data.length > 0 ? fmtNumber(totalTokens / data.length) : '0'}</span>
          <span class="an-token-box__label">Avg/Day</span>
        </div>
        <div class="an-token-box">
          <span class="an-token-box__value">${data.length > 0 ? fmtCost(totalCost / data.length) : '$0'}</span>
          <span class="an-token-box__label">Avg Cost/Day</span>
        </div>
      </div>
    `;

    const canvas = card.querySelector('#an-chart-tokens');
    if (!canvas) return;

    requestAnimationFrame(() => this._drawLineChart(canvas, data));
  }

  _drawLineChart(canvas, data) {
    const w = canvas.parentElement.clientWidth || 400;
    const h = 140;
    const ctx = setupCanvas(canvas, w, h);

    if (data.length === 0) {
      ctx.fillStyle = '#3a4560';
      ctx.font = '12px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No token data', w / 2, h / 2);
      return;
    }

    const padding = { top: 16, right: 12, bottom: 28, left: 50 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;

    const values = data.map(d => (d.input_tokens || 0) + (d.output_tokens || 0));
    const costValues = data.map(d => d.cost || 0);
    const maxTokens = Math.max(...values, 1);

    const step = plotW / Math.max(values.length - 1, 1);

    // Grid lines
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.08)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (plotH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();

      const val = maxTokens - (maxTokens / 4) * i;
      ctx.fillStyle = '#6b7a99';
      ctx.font = '8px SF Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText(fmtNumber(val), padding.left - 6, y + 3);
    }

    // Fill under curve
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = padding.left + i * step;
      const y = padding.top + plotH - (v / maxTokens) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(padding.left + (values.length - 1) * step, padding.top + plotH);
    ctx.lineTo(padding.left, padding.top + plotH);
    ctx.closePath();
    const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + plotH);
    grad.addColorStop(0, CHART_COLORS.cyan + '33');
    grad.addColorStop(1, CHART_COLORS.cyan + '00');
    ctx.fillStyle = grad;
    ctx.fill();

    // Token line
    ctx.beginPath();
    ctx.strokeStyle = CHART_COLORS.cyan;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    values.forEach((v, i) => {
      const x = padding.left + i * step;
      const y = padding.top + plotH - (v / maxTokens) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Cost line (scaled to same axis)
    const maxCost = Math.max(...costValues, 0.001);
    ctx.beginPath();
    ctx.strokeStyle = CHART_COLORS.amber;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    costValues.forEach((v, i) => {
      const x = padding.left + i * step;
      const y = padding.top + plotH - (v / maxCost) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // X-axis labels
    const showEvery = Math.max(1, Math.floor(data.length / 8));
    data.forEach((d, i) => {
      if (i % showEvery === 0 || i === data.length - 1) {
        ctx.fillStyle = '#6b7a99';
        ctx.font = '8px SF Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(d.date.slice(5), padding.left + i * step, h - 6);
      }
    });

    // Dots on last point
    const lastX = padding.left + (values.length - 1) * step;
    const lastY = padding.top + plotH - (values[values.length - 1] / maxTokens) * plotH;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
    ctx.fillStyle = CHART_COLORS.cyan;
    ctx.fill();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 5. Agent Performance — leaderboard
  // ═══════════════════════════════════════════════════════════════════════

  _renderAgentPerformance() {
    const card = this._el.querySelector('#an-card-agents');
    if (!card) return;

    const agents = this._data.agentPerformance || [];

    const rows = agents.length > 0
      ? agents.map((a, i) => `
          <div class="an-leader-row">
            <span class="an-leader__rank">${i === 0 ? '\u{1F451}' : '#' + (i + 1)}</span>
            <span class="an-leader__name">${escHtml(a.name || a.agent_id || 'Agent')}</span>
            <span class="an-leader__tasks">${a.tasks_completed || 0} tasks</span>
            <span class="an-leader__time">${a.avg_latency ? fmtMs(a.avg_latency) : '--'} avg</span>
          </div>
        `).join('')
      : '<div class="an-empty"><span class="an-empty__icon">\u{1F464}</span>No agent data yet</div>';

    card.innerHTML = `
      <div class="an-card__header">
        <span class="an-card__icon">\u{1F3C6}</span>
        <span class="an-card__title">Agent Performance</span>
        <span class="an-card__badge">Leaderboard</span>
      </div>
      <div class="an-leaderboard">${rows}</div>
    `;

    // Animate counters
    this._animateCounters(card);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 6. World Health Score — big number gauge
  // ═══════════════════════════════════════════════════════════════════════

  _renderHealthScore() {
    const card = this._el.querySelector('#an-card-health');
    if (!card) return;

    const health = this._data.healthScore || { score: 0, activityScore: 0, diversityScore: 0, questScore: 0 };
    const score = Math.min(100, Math.max(0, health.score || 0));

    let scoreColor = CHART_COLORS.blue;
    if (score >= 80) scoreColor = CHART_COLORS.green;
    else if (score >= 50) scoreColor = CHART_COLORS.amber;
    else if (score > 0) scoreColor = CHART_COLORS.red;

    card.innerHTML = `
      <div class="an-card__header">
        <span class="an-card__icon">\u{1F49A}</span>
        <span class="an-card__title">World Health Score</span>
      </div>
      <div class="an-health">
        <div class="an-health__score" id="an-health-number" style="background:linear-gradient(135deg,${scoreColor},${CHART_COLORS.cyan});-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">
          0
        </div>
        <div class="an-health__label">Overall Health</div>
        <div class="an-health__bar-wrap">
          <div class="an-health__bar" id="an-health-bar" style="width:0%;background:linear-gradient(90deg,${scoreColor},${CHART_COLORS.cyan})"></div>
        </div>
        <div class="an-health__breakdown">
          <div class="an-health__breakdown-item">
            <span class="an-health__breakdown-dot" style="background:${CHART_COLORS.green}"></span>
            Activity: ${Math.round(health.activityScore || 0)}
          </div>
          <div class="an-health__breakdown-item">
            <span class="an-health__breakdown-dot" style="background:${CHART_COLORS.blue}"></span>
            Diversity: ${Math.round(health.diversityScore || 0)}
          </div>
          <div class="an-health__breakdown-item">
            <span class="an-health__breakdown-dot" style="background:${CHART_COLORS.purple}"></span>
            Quests: ${Math.round(health.questScore || 0)}
          </div>
        </div>
      </div>
    `;

    // Animate the score number and bar
    this._animateHealthScore(score);
  }

  _animateHealthScore(target) {
    const numEl = this._el?.querySelector('#an-health-number');
    const barEl = this._el?.querySelector('#an-health-bar');
    if (!numEl) return;

    let current = 0;
    const duration = 1200;
    const start = performance.now();

    const step = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      current = Math.round(eased * target);

      numEl.textContent = String(current);
      if (barEl) barEl.style.width = current + '%';

      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };

    requestAnimationFrame(step);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Animated counters
  // ═══════════════════════════════════════════════════════════════════════

  _animateCounters(container) {
    const statEls = container.querySelectorAll('.an-stat__value, .an-token-box__value');
    statEls.forEach(el => {
      const text = el.textContent.trim();
      const numMatch = text.match(/^[\$]?([\d,.]+)/);
      if (!numMatch) return;

      const target = parseFloat(numMatch[1].replace(/,/g, ''));
      if (isNaN(target) || target === 0) return;

      const prefix = text.startsWith('$') ? '$' : '';
      const suffix = text.replace(/^[\$]?[\d,.]+/, '');
      let current = 0;
      const duration = 800;
      const startTime = performance.now();

      const animate = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        current = eased * target;

        if (target >= 1000) {
          el.textContent = prefix + Math.round(current).toLocaleString() + suffix;
        } else if (target >= 1) {
          el.textContent = prefix + current.toFixed(2) + suffix;
        } else {
          el.textContent = prefix + current.toFixed(4) + suffix;
        }

        if (progress < 1) requestAnimationFrame(animate);
      };

      requestAnimationFrame(animate);
    });
  }
}
