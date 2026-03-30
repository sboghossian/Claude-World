/**
 * reports.js — Reports & Export zone
 *
 * Data export and visualisation system for Claude World. Provides four
 * report templates with Canvas 2D mini-charts, date range filtering,
 * and multi-format export (JSON / CSV / Markdown).
 *
 * Report templates:
 *   1. Weekly Summary     — tasks completed, XP earned, zones active, top agent
 *   2. Cost Analysis      — token usage by provider, cost per task, daily burn
 *   3. Agent Performance  — completion rate, response times, specialization map
 *   4. World Health       — trend over time, recommendations
 *
 * Public API:
 *   render()              → HTMLElement
 *   async init(worldId)   — fetch data, draw charts
 *   destroy()             — cleanup timers / listeners
 */

// ── Constants ──────────────────────────────────────────────────────────

const RANGES = [
  { key: "7d", label: "7 D", days: 7 },
  { key: "30d", label: "30 D", days: 30 },
  { key: "90d", label: "90 D", days: 90 },
];

const REPORT_TYPES = [
  { key: "weekly", label: "Weekly Summary", icon: "\u{1F4CB}" },
  { key: "cost", label: "Cost Analysis", icon: "\u{1F4B0}" },
  { key: "performance", label: "Agent Performance", icon: "\u{1F916}" },
  { key: "health", label: "World Health", icon: "\u{1F3E5}" },
];

const PROVIDER_COLORS = {
  anthropic: "#d97706",
  openai: "#10b981",
  google: "#6366f1",
  other: "#6b7280",
};

const PROVIDER_LABELS = {
  anthropic: "Claude",
  openai: "GPT",
  google: "Gemini",
  other: "Other",
};

const CHART_COLORS = {
  orange: "#f59e0b",
  blue: "#3b82f6",
  green: "#22c55e",
  cyan: "#22d3ee",
  purple: "#a78bfa",
  pink: "#f472b6",
  red: "#ef4444",
};

const COST_PER_1K_TOKENS = 0.008;

// ── Helpers ────────────────────────────────────────────────────────────

function escHtml(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function fmtNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(Math.round(n));
}

function fmtCost(usd) {
  if (usd >= 1) return "$" + usd.toFixed(2);
  if (usd >= 0.01) return "$" + usd.toFixed(3);
  return "$" + usd.toFixed(4);
}

function fmtMs(ms) {
  if (ms >= 60_000) return (ms / 60_000).toFixed(1) + "m";
  if (ms >= 1000) return (ms / 1000).toFixed(1) + "s";
  return Math.round(ms) + "ms";
}

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

function dpr() {
  return window.devicePixelRatio || 1;
}

function setupCanvas(canvas, w, h) {
  const ratio = dpr();
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  return ctx;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── Reports class ─────────────────────────────────────────────────────

export class Reports {
  constructor() {
    /** @type {string|number|null} */
    this._worldId = null;

    /** @type {HTMLElement|null} */
    this._el = null;

    /** @type {string} Current range key */
    this._range = "7d";

    /** @type {object|null} Fetched data */
    this._data = null;

    /** @type {boolean} Whether initial load is complete */
    this._loaded = false;

    /** @type {number|null} Refresh timer */
    this._refreshTimer = null;

    /** @type {string|null} Currently expanded report */
    this._expandedReport = null;
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

    const el = document.createElement("div");
    el.className = "reports-dashboard";
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Reports & Export");
    this._el = el;

    el.innerHTML = this._buildShellHTML();
    this._wireRangeButtons();
    this._wireReportActions();

    return el;
  }

  /**
   * Load data and render reports.
   * @param {string|number} worldId
   */
  async init(worldId) {
    this._worldId = worldId;
    await this._fetchAndRender();

    this._refreshTimer = setInterval(() => {
      this._fetchAndRender();
    }, 120_000);
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
    const id = "reports-styles";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "src/zones/reports.css";
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
      this._renderReports();
    } catch (err) {
      console.warn("[Reports] Failed to fetch data:", err);
      this._data = this._emptyData();
      this._loaded = true;
      this._renderReports();
    }
  }

  _emptyData() {
    const rangeCfg = RANGES.find((r) => r.key === this._range) || RANGES[0];
    const days = rangeCfg.days || 7;
    const dates = dateRange(days);
    return {
      tasksPerDay: dates.map((d) => ({ date: d, count: 0 })),
      zoneUsage: [],
      providerUsage: [],
      tokensPerDay: dates.map((d) => ({
        date: d,
        input_tokens: 0,
        output_tokens: 0,
        cost: 0,
      })),
      agentPerformance: [],
      healthScore: {
        score: 0,
        activityScore: 0,
        diversityScore: 0,
        questScore: 0,
      },
      healthHistory: dates.map((d) => ({ date: d, score: 0 })),
      summary: {
        totalTasks: 0,
        totalTokens: 0,
        totalCost: 0,
        avgLatency: 0,
        totalXp: 0,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Shell HTML
  // ═══════════════════════════════════════════════════════════════════════

  _buildShellHTML() {
    const rangeButtons = RANGES.map(
      (r) =>
        `<button class="rp-range-btn ${r.key === this._range ? "rp-range-btn--active" : ""}"
              data-range="${r.key}">${r.label}</button>`,
    ).join("");

    const cards = REPORT_TYPES.map(
      (rt) =>
        `<div class="rp-card" data-report="${rt.key}" id="rp-card-${rt.key}">
        <div class="rp-card__header">
          <span class="rp-card__icon">${rt.icon}</span>
          <span class="rp-card__title">${rt.label}</span>
          <button class="rp-card__generate-btn" data-report="${rt.key}">Generate Report</button>
        </div>
        <div class="rp-card__chart-wrap">
          <canvas class="rp-card__canvas" id="rp-canvas-${rt.key}"></canvas>
        </div>
        <div class="rp-card__summary" id="rp-summary-${rt.key}"></div>
        <div class="rp-card__detail" id="rp-detail-${rt.key}"></div>
        <div class="rp-card__export-bar" id="rp-export-${rt.key}">
          <button class="rp-export-btn rp-export-btn--json" data-report="${rt.key}" data-format="json">JSON</button>
          <button class="rp-export-btn rp-export-btn--csv" data-report="${rt.key}" data-format="csv">CSV</button>
          <button class="rp-export-btn rp-export-btn--md" data-report="${rt.key}" data-format="md">Markdown</button>
        </div>
      </div>`,
    ).join("");

    return `
      <header class="rp-header">
        <span class="rp-header__icon">\u{1F4E4}</span>
        <span class="rp-header__title">Reports & Export
          <span class="rp-header__subtitle">Generate, visualise &amp; download</span>
        </span>
        <div class="rp-range-selector">${rangeButtons}</div>
      </header>
      <div class="rp-body">
        <div class="rp-grid">${cards}</div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Event wiring
  // ═══════════════════════════════════════════════════════════════════════

  _wireRangeButtons() {
    if (!this._el) return;
    const selector = this._el.querySelector(".rp-range-selector");
    if (!selector) return;

    selector.addEventListener("click", (e) => {
      const btn = e.target.closest(".rp-range-btn");
      if (!btn) return;
      const range = btn.dataset.range;
      if (range === this._range) return;

      selector
        .querySelectorAll(".rp-range-btn")
        .forEach((b) => b.classList.remove("rp-range-btn--active"));
      btn.classList.add("rp-range-btn--active");

      this._range = range;
      this._fetchAndRender();
    });
  }

  _wireReportActions() {
    if (!this._el) return;

    this._el.addEventListener("click", (e) => {
      // Generate Report button
      const genBtn = e.target.closest(".rp-card__generate-btn");
      if (genBtn) {
        const key = genBtn.dataset.report;
        this._toggleDetail(key);
        return;
      }

      // Export buttons
      const expBtn = e.target.closest(".rp-export-btn");
      if (expBtn) {
        const key = expBtn.dataset.report;
        const fmt = expBtn.dataset.format;
        this._exportReport(key, fmt);
        return;
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Main render
  // ═══════════════════════════════════════════════════════════════════════

  _renderReports() {
    if (!this._el || !this._data) return;
    this._renderWeeklySummary();
    this._renderCostAnalysis();
    this._renderAgentPerformance();
    this._renderWorldHealth();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 1. Weekly Summary
  // ═══════════════════════════════════════════════════════════════════════

  _renderWeeklySummary() {
    const data = this._data;
    const summary = data.summary || {};
    const tasksPerDay = data.tasksPerDay || [];
    const agents = data.agentPerformance || [];
    const zones = data.zoneUsage || [];

    const totalTasks =
      summary.totalTasks || tasksPerDay.reduce((s, d) => s + d.count, 0);
    const totalXp = summary.totalXp || 0;
    const activeZones = zones.length;
    const topAgent =
      agents.length > 0
        ? agents.reduce((a, b) =>
            (b.tasks_completed || 0) > (a.tasks_completed || 0) ? b : a,
          )
        : null;

    // Summary stats
    const sumEl = this._el.querySelector("#rp-summary-weekly");
    if (sumEl) {
      sumEl.innerHTML = `
        <div class="rp-stats-row">
          <div class="rp-stat">
            <span class="rp-stat__value">${fmtNumber(totalTasks)}</span>
            <span class="rp-stat__label">Tasks Done</span>
          </div>
          <div class="rp-stat">
            <span class="rp-stat__value">${fmtNumber(totalXp)}</span>
            <span class="rp-stat__label">XP Earned</span>
          </div>
          <div class="rp-stat">
            <span class="rp-stat__value">${activeZones}</span>
            <span class="rp-stat__label">Zones Active</span>
          </div>
          <div class="rp-stat">
            <span class="rp-stat__value">${topAgent ? escHtml(topAgent.name || topAgent.agent_name || "N/A") : "--"}</span>
            <span class="rp-stat__label">Top Agent</span>
          </div>
        </div>
      `;
    }

    // Mini bar chart — tasks per day
    const canvas = this._el.querySelector("#rp-canvas-weekly");
    if (canvas) {
      this._drawBarChart(
        canvas,
        tasksPerDay.map((d) => d.count),
        CHART_COLORS.orange,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. Cost Analysis
  // ═══════════════════════════════════════════════════════════════════════

  _renderCostAnalysis() {
    const data = this._data;
    const providers = data.providerUsage || [];
    const tokensPerDay = data.tokensPerDay || [];
    const summary = data.summary || {};

    const totalCost =
      summary.totalCost || tokensPerDay.reduce((s, d) => s + (d.cost || 0), 0);
    const totalTasks = summary.totalTasks || 1;
    const costPerTask = totalTasks > 0 ? totalCost / totalTasks : 0;

    const rangeCfg = RANGES.find((r) => r.key === this._range) || RANGES[0];
    const days = rangeCfg.days || 7;
    const dailyBurn = days > 0 ? totalCost / days : 0;

    const providerBreakdown = providers.map((p) => {
      const name = PROVIDER_LABELS[p.provider] || p.provider || "Unknown";
      const tokens = p.total_tokens || 0;
      const cost = (tokens * COST_PER_1K_TOKENS) / 1000;
      return { name, tokens, cost, provider: p.provider };
    });

    const sumEl = this._el.querySelector("#rp-summary-cost");
    if (sumEl) {
      const providerHTML = providerBreakdown
        .map(
          (p) =>
            `<div class="rp-provider-row">
          <span class="rp-provider-dot" style="background:${PROVIDER_COLORS[p.provider] || CHART_COLORS.orange}"></span>
          <span class="rp-provider-name">${escHtml(p.name)}</span>
          <span class="rp-provider-tokens">${fmtNumber(p.tokens)} tok</span>
          <span class="rp-provider-cost">${fmtCost(p.cost)}</span>
        </div>`,
        )
        .join("");

      sumEl.innerHTML = `
        <div class="rp-stats-row">
          <div class="rp-stat">
            <span class="rp-stat__value">${fmtCost(totalCost)}</span>
            <span class="rp-stat__label">Total Cost</span>
          </div>
          <div class="rp-stat">
            <span class="rp-stat__value">${fmtCost(costPerTask)}</span>
            <span class="rp-stat__label">Cost / Task</span>
          </div>
          <div class="rp-stat">
            <span class="rp-stat__value">${fmtCost(dailyBurn)}</span>
            <span class="rp-stat__label">Daily Burn</span>
          </div>
        </div>
        <div class="rp-provider-list">${providerHTML}</div>
      `;
    }

    // Mini line chart — daily cost
    const canvas = this._el.querySelector("#rp-canvas-cost");
    if (canvas) {
      this._drawLineChart(
        canvas,
        tokensPerDay.map((d) => d.cost || 0),
        CHART_COLORS.orange,
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3. Agent Performance
  // ═══════════════════════════════════════════════════════════════════════

  _renderAgentPerformance() {
    const data = this._data;
    const agents = data.agentPerformance || [];
    const zones = data.zoneUsage || [];

    const sumEl = this._el.querySelector("#rp-summary-performance");
    if (sumEl) {
      if (agents.length === 0) {
        sumEl.innerHTML = '<div class="rp-empty">No agent data available</div>';
      } else {
        const rows = agents
          .slice(0, 6)
          .map((a, i) => {
            const name = a.name || a.agent_name || `Agent ${i + 1}`;
            const completed = a.tasks_completed || 0;
            const total = a.tasks_total || completed;
            const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
            const avgTime = a.avg_response_time || a.avg_latency || 0;
            return `
            <div class="rp-agent-row">
              <span class="rp-agent-rank">#${i + 1}</span>
              <span class="rp-agent-name">${escHtml(name)}</span>
              <span class="rp-agent-rate">${rate}%</span>
              <span class="rp-agent-time">${avgTime > 0 ? fmtMs(avgTime) : "--"}</span>
            </div>
          `;
          })
          .join("");

        sumEl.innerHTML = `
          <div class="rp-agent-header-row">
            <span></span>
            <span>Agent</span>
            <span>Rate</span>
            <span>Avg Time</span>
          </div>
          ${rows}
        `;
      }
    }

    // Specialization heat map on canvas
    const canvas = this._el.querySelector("#rp-canvas-performance");
    if (canvas) {
      this._drawHeatMap(canvas, agents, zones);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4. World Health
  // ═══════════════════════════════════════════════════════════════════════

  _renderWorldHealth() {
    const data = this._data;
    const health = data.healthScore || { score: 0 };
    const history = data.healthHistory || [];
    const score = health.score || 0;

    // Build recommendations
    const recommendations = [];
    if ((health.activityScore || 0) < 40) {
      recommendations.push("Increase task activity to improve world health.");
    }
    if ((health.diversityScore || 0) < 40) {
      recommendations.push("Try using more zones for better diversity.");
    }
    if ((health.questScore || 0) < 40) {
      recommendations.push("Complete more quests to boost your quest score.");
    }
    if (score >= 80) {
      recommendations.push("Excellent health! Keep up the great work.");
    }
    if (recommendations.length === 0) {
      recommendations.push("World is in good shape. Keep building!");
    }

    const sumEl = this._el.querySelector("#rp-summary-health");
    if (sumEl) {
      const recsHTML = recommendations
        .map((r) => `<div class="rp-rec-item">${escHtml(r)}</div>`)
        .join("");

      sumEl.innerHTML = `
        <div class="rp-health-score-wrap">
          <div class="rp-health-score" style="--score-color:${this._scoreColor(score)}">
            ${score}
          </div>
          <div class="rp-health-label">Health Score</div>
        </div>
        <div class="rp-health-breakdown">
          <div class="rp-health-factor">
            <span class="rp-health-factor__label">Activity</span>
            <div class="rp-health-bar"><div class="rp-health-bar__fill" style="width:${health.activityScore || 0}%;background:${CHART_COLORS.green}"></div></div>
          </div>
          <div class="rp-health-factor">
            <span class="rp-health-factor__label">Diversity</span>
            <div class="rp-health-bar"><div class="rp-health-bar__fill" style="width:${health.diversityScore || 0}%;background:${CHART_COLORS.blue}"></div></div>
          </div>
          <div class="rp-health-factor">
            <span class="rp-health-factor__label">Quests</span>
            <div class="rp-health-bar"><div class="rp-health-bar__fill" style="width:${health.questScore || 0}%;background:${CHART_COLORS.purple}"></div></div>
          </div>
        </div>
        <div class="rp-recommendations">
          <div class="rp-rec-title">Recommendations</div>
          ${recsHTML}
        </div>
      `;
    }

    // Trend line
    const canvas = this._el.querySelector("#rp-canvas-health");
    if (canvas) {
      const scores =
        history.length > 0 ? history.map((h) => h.score || 0) : [score];
      this._drawLineChart(canvas, scores, this._scoreColor(score));
    }
  }

  _scoreColor(score) {
    if (score >= 80) return CHART_COLORS.green;
    if (score >= 50) return CHART_COLORS.orange;
    return CHART_COLORS.red;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Toggle detail view
  // ═══════════════════════════════════════════════════════════════════════

  _toggleDetail(key) {
    const detailEl = this._el.querySelector(`#rp-detail-${key}`);
    if (!detailEl) return;

    const isExpanded = this._expandedReport === key;

    // Collapse any open detail
    this._el.querySelectorAll(".rp-card__detail").forEach((d) => {
      d.innerHTML = "";
      d.classList.remove("rp-card__detail--open");
    });

    if (isExpanded) {
      this._expandedReport = null;
      return;
    }

    this._expandedReport = key;
    detailEl.classList.add("rp-card__detail--open");
    detailEl.innerHTML = this._buildDetailContent(key);
  }

  _buildDetailContent(key) {
    const data = this._data;
    if (!data) return '<div class="rp-empty">No data</div>';

    switch (key) {
      case "weekly":
        return this._detailWeekly(data);
      case "cost":
        return this._detailCost(data);
      case "performance":
        return this._detailPerformance(data);
      case "health":
        return this._detailHealth(data);
      default:
        return "";
    }
  }

  _detailWeekly(data) {
    const tasksPerDay = data.tasksPerDay || [];
    const rows = tasksPerDay
      .map((d) => `<tr><td>${escHtml(d.date)}</td><td>${d.count}</td></tr>`)
      .join("");
    return `
      <div class="rp-detail-section">
        <h4 class="rp-detail-title">Daily Task Breakdown</h4>
        <table class="rp-detail-table">
          <thead><tr><th>Date</th><th>Tasks</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  _detailCost(data) {
    const tokensPerDay = data.tokensPerDay || [];
    const rows = tokensPerDay
      .map(
        (d) =>
          `<tr>
        <td>${escHtml(d.date)}</td>
        <td>${fmtNumber(d.input_tokens || 0)}</td>
        <td>${fmtNumber(d.output_tokens || 0)}</td>
        <td>${fmtCost(d.cost || 0)}</td>
      </tr>`,
      )
      .join("");
    return `
      <div class="rp-detail-section">
        <h4 class="rp-detail-title">Daily Token & Cost Breakdown</h4>
        <table class="rp-detail-table">
          <thead><tr><th>Date</th><th>Input</th><th>Output</th><th>Cost</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  _detailPerformance(data) {
    const agents = data.agentPerformance || [];
    if (agents.length === 0) return '<div class="rp-empty">No agent data</div>';

    const rows = agents
      .map((a, i) => {
        const name = a.name || a.agent_name || `Agent ${i + 1}`;
        const completed = a.tasks_completed || 0;
        const total = a.tasks_total || completed;
        const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
        const avgTime = a.avg_response_time || a.avg_latency || 0;
        const specialization = a.specialization || a.top_zone || "--";
        return `<tr>
        <td>${escHtml(name)}</td>
        <td>${completed}/${total}</td>
        <td>${rate}%</td>
        <td>${avgTime > 0 ? fmtMs(avgTime) : "--"}</td>
        <td>${escHtml(specialization)}</td>
      </tr>`;
      })
      .join("");

    return `
      <div class="rp-detail-section">
        <h4 class="rp-detail-title">Full Agent Breakdown</h4>
        <table class="rp-detail-table">
          <thead><tr><th>Agent</th><th>Done/Total</th><th>Rate</th><th>Avg Time</th><th>Specialization</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  _detailHealth(data) {
    const health = data.healthScore || {};
    const history = data.healthHistory || [];
    const rows = history
      .map((h) => `<tr><td>${escHtml(h.date)}</td><td>${h.score}</td></tr>`)
      .join("");

    return `
      <div class="rp-detail-section">
        <h4 class="rp-detail-title">Health Factors</h4>
        <div class="rp-detail-kv">
          <span>Activity Score:</span><span>${health.activityScore || 0}</span>
        </div>
        <div class="rp-detail-kv">
          <span>Diversity Score:</span><span>${health.diversityScore || 0}</span>
        </div>
        <div class="rp-detail-kv">
          <span>Quest Score:</span><span>${health.questScore || 0}</span>
        </div>
      </div>
      <div class="rp-detail-section">
        <h4 class="rp-detail-title">Score History</h4>
        <table class="rp-detail-table">
          <thead><tr><th>Date</th><th>Score</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Canvas 2D charts
  // ═══════════════════════════════════════════════════════════════════════

  _drawBarChart(canvas, values, color) {
    if (!values || values.length === 0) return;
    const w = canvas.parentElement?.offsetWidth || 300;
    const h = 100;
    const ctx = setupCanvas(canvas, w, h);

    ctx.clearRect(0, 0, w, h);

    const max = Math.max(...values, 1);
    const barW = Math.max(2, (w - 20) / values.length - 2);
    const gap = 2;

    values.forEach((v, i) => {
      const barH = (v / max) * (h - 20);
      const x = 10 + i * (barW + gap);
      const y = h - 10 - barH;

      ctx.fillStyle = color;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(x, y, barW, barH);
      ctx.globalAlpha = 1;

      // Bright top portion
      const topH = Math.min(barH, 4);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, barW, topH);
    });

    // Baseline
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, h - 10);
    ctx.lineTo(w - 10, h - 10);
    ctx.stroke();
  }

  _drawLineChart(canvas, values, color) {
    if (!values || values.length === 0) return;
    const w = canvas.parentElement?.offsetWidth || 300;
    const h = 100;
    const ctx = setupCanvas(canvas, w, h);

    ctx.clearRect(0, 0, w, h);

    const max = Math.max(...values, 1);
    const padX = 10;
    const padY = 10;
    const chartW = w - padX * 2;
    const chartH = h - padY * 2;

    // Fill gradient
    const grad = ctx.createLinearGradient(0, padY, 0, h - padY);
    grad.addColorStop(0, color + "33");
    grad.addColorStop(1, "transparent");

    ctx.beginPath();
    ctx.moveTo(padX, h - padY);

    values.forEach((v, i) => {
      const x = padX + (i / Math.max(values.length - 1, 1)) * chartW;
      const y = h - padY - (v / max) * chartH;
      ctx.lineTo(x, y);
    });

    ctx.lineTo(padX + chartW, h - padY);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    values.forEach((v, i) => {
      const x = padX + (i / Math.max(values.length - 1, 1)) * chartW;
      const y = h - padY - (v / max) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();

    // Dots
    values.forEach((v, i) => {
      const x = padX + (i / Math.max(values.length - 1, 1)) * chartW;
      const y = h - padY - (v / max) * chartH;
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });
  }

  _drawHeatMap(canvas, agents, zones) {
    const w = canvas.parentElement?.offsetWidth || 300;
    const h = 100;
    const ctx = setupCanvas(canvas, w, h);

    ctx.clearRect(0, 0, w, h);

    if (agents.length === 0 || zones.length === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.font = "11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No specialization data", w / 2, h / 2);
      return;
    }

    const agentSlice = agents.slice(0, 5);
    const zoneSlice = zones.slice(0, 6);
    const cols = zoneSlice.length;
    const rows = agentSlice.length;
    const cellW = Math.min(40, (w - 20) / (cols + 1));
    const cellH = Math.min(18, (h - 10) / (rows + 1));
    const startX = 10;
    const startY = 6;

    // Zone labels
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = `${Math.min(9, cellW * 0.4)}px Inter, sans-serif`;
    ctx.textAlign = "center";
    zoneSlice.forEach((z, ci) => {
      const x = startX + (ci + 1) * cellW + cellW / 2;
      const label = (z.zone || z.name || "").slice(0, 5);
      ctx.fillText(label, x, startY + cellH * 0.7);
    });

    // Rows
    agentSlice.forEach((a, ri) => {
      const y = startY + (ri + 1) * cellH;
      const name = (a.name || a.agent_name || "").slice(0, 6);

      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.textAlign = "right";
      ctx.fillText(name, startX + cellW - 2, y + cellH * 0.7);

      zoneSlice.forEach((z, ci) => {
        const x = startX + (ci + 1) * cellW;
        // Simulated intensity based on agent task count and zone popularity
        const intensity = ((a.tasks_completed || 0) * (z.count || 1)) / 100;
        const alpha = Math.min(0.9, Math.max(0.05, intensity / 10));

        ctx.fillStyle = `rgba(245, 158, 11, ${alpha})`;
        ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
      });
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Export
  // ═══════════════════════════════════════════════════════════════════════

  _exportReport(key, format) {
    const data = this._data;
    if (!data) return;

    const reportData = this._gatherReportData(key, data);
    const dateStr = todayStr();
    const filename = `claude-world-${key}-${this._range}-${dateStr}`;

    switch (format) {
      case "json":
        this._downloadJSON(reportData, filename + ".json");
        break;
      case "csv":
        this._downloadCSV(reportData, filename + ".csv");
        break;
      case "md":
        this._downloadMarkdown(reportData, key, filename + ".md");
        break;
    }
  }

  _gatherReportData(key, data) {
    switch (key) {
      case "weekly":
        return {
          report: "Weekly Summary",
          range: this._range,
          generated: new Date().toISOString(),
          totalTasks: data.summary?.totalTasks || 0,
          totalXp: data.summary?.totalXp || 0,
          activeZones: (data.zoneUsage || []).length,
          topAgent: this._topAgentName(data),
          dailyTasks: data.tasksPerDay || [],
        };
      case "cost":
        return {
          report: "Cost Analysis",
          range: this._range,
          generated: new Date().toISOString(),
          totalCost: data.summary?.totalCost || 0,
          totalTokens: data.summary?.totalTokens || 0,
          costPerTask:
            (data.summary?.totalCost || 0) /
            Math.max(data.summary?.totalTasks || 1, 1),
          dailyBurn:
            (data.summary?.totalCost || 0) /
            (RANGES.find((r) => r.key === this._range)?.days || 7),
          providers: (data.providerUsage || []).map((p) => ({
            name: PROVIDER_LABELS[p.provider] || p.provider,
            tokens: p.total_tokens || 0,
            cost: ((p.total_tokens || 0) * COST_PER_1K_TOKENS) / 1000,
          })),
          dailyTokens: data.tokensPerDay || [],
        };
      case "performance":
        return {
          report: "Agent Performance",
          range: this._range,
          generated: new Date().toISOString(),
          agents: (data.agentPerformance || []).map((a, i) => ({
            name: a.name || a.agent_name || `Agent ${i + 1}`,
            tasksCompleted: a.tasks_completed || 0,
            tasksTotal: a.tasks_total || a.tasks_completed || 0,
            completionRate:
              (a.tasks_total || a.tasks_completed || 0) > 0
                ? Math.round(
                    ((a.tasks_completed || 0) /
                      (a.tasks_total || a.tasks_completed || 1)) *
                      100,
                  )
                : 0,
            avgResponseTime: a.avg_response_time || a.avg_latency || 0,
            specialization: a.specialization || a.top_zone || "",
          })),
        };
      case "health":
        return {
          report: "World Health",
          range: this._range,
          generated: new Date().toISOString(),
          score: data.healthScore?.score || 0,
          activityScore: data.healthScore?.activityScore || 0,
          diversityScore: data.healthScore?.diversityScore || 0,
          questScore: data.healthScore?.questScore || 0,
          history: data.healthHistory || [],
        };
      default:
        return {};
    }
  }

  _topAgentName(data) {
    const agents = data.agentPerformance || [];
    if (agents.length === 0) return "N/A";
    const top = agents.reduce((a, b) =>
      (b.tasks_completed || 0) > (a.tasks_completed || 0) ? b : a,
    );
    return top.name || top.agent_name || "Unknown";
  }

  // ── JSON export ──────────────────────────────────────────────────────

  _downloadJSON(reportData, filename) {
    const json = JSON.stringify(reportData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    downloadBlob(blob, filename);
  }

  // ── CSV export ───────────────────────────────────────────────────────

  _downloadCSV(reportData, filename) {
    let csv = "";

    if (reportData.dailyTasks) {
      csv += "Date,Tasks\n";
      reportData.dailyTasks.forEach((d) => {
        csv += `${d.date},${d.count}\n`;
      });
    } else if (reportData.dailyTokens) {
      csv += "Date,Input Tokens,Output Tokens,Cost\n";
      reportData.dailyTokens.forEach((d) => {
        csv += `${d.date},${d.input_tokens || 0},${d.output_tokens || 0},${d.cost || 0}\n`;
      });
    } else if (reportData.agents) {
      csv +=
        "Name,Tasks Completed,Tasks Total,Completion Rate,Avg Response Time,Specialization\n";
      reportData.agents.forEach((a) => {
        csv += `"${a.name}",${a.tasksCompleted},${a.tasksTotal},${a.completionRate}%,${a.avgResponseTime},"${a.specialization}"\n`;
      });
    } else if (reportData.history) {
      csv += "Date,Score\n";
      reportData.history.forEach((h) => {
        csv += `${h.date},${h.score}\n`;
      });
    }

    const blob = new Blob([csv], { type: "text/csv" });
    downloadBlob(blob, filename);
  }

  // ── Markdown export ──────────────────────────────────────────────────

  _downloadMarkdown(reportData, key, filename) {
    let md = "";

    md += `# ${reportData.report || "Report"}\n\n`;
    md += `**Range:** ${reportData.range}  \n`;
    md += `**Generated:** ${reportData.generated}  \n\n`;

    switch (key) {
      case "weekly":
        md += `## Summary\n\n`;
        md += `| Metric | Value |\n|--------|-------|\n`;
        md += `| Tasks Completed | ${reportData.totalTasks} |\n`;
        md += `| XP Earned | ${reportData.totalXp} |\n`;
        md += `| Active Zones | ${reportData.activeZones} |\n`;
        md += `| Top Agent | ${reportData.topAgent} |\n\n`;
        md += `## Daily Tasks\n\n`;
        md += `| Date | Tasks |\n|------|-------|\n`;
        (reportData.dailyTasks || []).forEach((d) => {
          md += `| ${d.date} | ${d.count} |\n`;
        });
        break;

      case "cost":
        md += `## Summary\n\n`;
        md += `| Metric | Value |\n|--------|-------|\n`;
        md += `| Total Cost | ${fmtCost(reportData.totalCost)} |\n`;
        md += `| Cost / Task | ${fmtCost(reportData.costPerTask)} |\n`;
        md += `| Daily Burn | ${fmtCost(reportData.dailyBurn)} |\n\n`;
        md += `## Provider Breakdown\n\n`;
        md += `| Provider | Tokens | Cost |\n|----------|--------|------|\n`;
        (reportData.providers || []).forEach((p) => {
          md += `| ${p.name} | ${fmtNumber(p.tokens)} | ${fmtCost(p.cost)} |\n`;
        });
        break;

      case "performance":
        md += `## Agent Performance\n\n`;
        md += `| Agent | Done | Total | Rate | Avg Time | Specialization |\n`;
        md += `|-------|------|-------|------|----------|----------------|\n`;
        (reportData.agents || []).forEach((a) => {
          md += `| ${a.name} | ${a.tasksCompleted} | ${a.tasksTotal} | ${a.completionRate}% | ${a.avgResponseTime > 0 ? fmtMs(a.avgResponseTime) : "--"} | ${a.specialization || "--"} |\n`;
        });
        break;

      case "health":
        md += `## Health Score: ${reportData.score}/100\n\n`;
        md += `| Factor | Score |\n|--------|-------|\n`;
        md += `| Activity | ${reportData.activityScore} |\n`;
        md += `| Diversity | ${reportData.diversityScore} |\n`;
        md += `| Quests | ${reportData.questScore} |\n\n`;
        if (reportData.history && reportData.history.length > 0) {
          md += `## History\n\n`;
          md += `| Date | Score |\n|------|-------|\n`;
          reportData.history.forEach((h) => {
            md += `| ${h.date} | ${h.score} |\n`;
          });
        }
        break;
    }

    md += `\n---\n*Generated by Claude World*\n`;

    const blob = new Blob([md], { type: "text/markdown" });
    downloadBlob(blob, filename);
  }
}
