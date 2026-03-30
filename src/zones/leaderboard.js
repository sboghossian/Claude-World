/**
 * leaderboard.js — World Stats & Leaderboard zone
 *
 * Comprehensive stats dashboard showing world-level metrics, agent rankings,
 * zone usage, personal records, and a GitHub-style activity heatmap.
 *
 * All charts are rendered with the Canvas 2D API — no external libraries.
 *
 * Sections:
 *   1. World Stats         — big number cards with animated counters
 *   2. Agent Leaderboard   — ranked table + bar chart comparing agents
 *   3. Zone Leaderboard    — ranked zones by usage with progress bars
 *   4. Personal Records    — fastest task, most tokens, longest session, etc.
 *   5. Activity Heatmap    — GitHub-style contribution graph (Canvas 2D)
 *
 * Public API:
 *   render()              → HTMLElement
 *   async init(worldId)   — fetch data, draw charts
 *   destroy()             — cleanup timers / listeners
 */

// ── Constants ──────────────────────────────────────────────────────────

const AGENT_ICONS = {
  commander: "\u{1F451}",
  librarian: "\u{1F4DA}",
  archivist: "\u{1F4DC}",
  instructor: "\u{1F393}",
  dockmaster: "\u{2693}",
};

const AGENT_COLORS = ["#a855f7", "#3b82f6", "#22c55e", "#f59e0b", "#ec4899"];

const HEATMAP_COLORS = [
  "rgba(168, 85, 247, 0.05)", // level 0 — empty
  "rgba(168, 85, 247, 0.2)", // level 1
  "rgba(168, 85, 247, 0.4)", // level 2
  "rgba(168, 85, 247, 0.6)", // level 3
  "rgba(168, 85, 247, 0.85)", // level 4 — max
];

const ZONE_COLORS = [
  "#a855f7",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
  "#22d3ee",
  "#ef4444",
  "#6366f1",
  "#14b8a6",
  "#f97316",
];

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

function fmtDuration(ms) {
  if (ms >= 3_600_000) return (ms / 3_600_000).toFixed(1) + "h";
  if (ms >= 60_000) return (ms / 60_000).toFixed(1) + "m";
  if (ms >= 1000) return (ms / 1000).toFixed(1) + "s";
  return Math.round(ms) + "ms";
}

function fmtMs(ms) {
  if (ms >= 60_000) return (ms / 60_000).toFixed(1) + "m";
  if (ms >= 1000) return (ms / 1000).toFixed(1) + "s";
  return Math.round(ms) + "ms";
}

/** Return an array of date strings for the last N days. */
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
  canvas.style.width = w + "px";
  canvas.style.height = h + "px";
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  return ctx;
}

/** Determine hour-of-day label from 0-23. */
function fmtHour(h) {
  if (h === 0) return "12am";
  if (h < 12) return h + "am";
  if (h === 12) return "12pm";
  return h - 12 + "pm";
}

/** Medal emoji for position. */
function medalFor(pos) {
  if (pos === 1) return "\u{1F947}";
  if (pos === 2) return "\u{1F948}";
  if (pos === 3) return "\u{1F949}";
  return "";
}

// ── Leaderboard class ──────────────────────────────────────────────────

export class Leaderboard {
  constructor() {
    /** @type {string|number|null} */
    this._worldId = null;

    /** @type {HTMLElement|null} */
    this._el = null;

    /** @type {object|null} Fetched data */
    this._data = null;

    /** @type {number|null} Refresh timer */
    this._refreshTimer = null;

    /** @type {boolean} */
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

    const el = document.createElement("div");
    el.className = "lb-dashboard";
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "World Stats & Leaderboard");
    this._el = el;

    el.innerHTML = this._buildShellHTML();

    return el;
  }

  /**
   * Load data and render everything.
   * @param {string|number} worldId
   */
  async init(worldId) {
    this._worldId = worldId;
    await this._fetchAndRender();

    // Refresh every 90 seconds
    this._refreshTimer = setInterval(() => {
      this._fetchAndRender();
    }, 90_000);
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
    const id = "leaderboard-styles";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "src/zones/leaderboard.css";
    document.head.appendChild(link);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Shell HTML
  // ═══════════════════════════════════════════════════════════════════════

  _buildShellHTML() {
    return `
      <header class="lb-header">
        <span class="lb-header__icon">\u{1F3C6}</span>
        <span class="lb-header__title">World Stats & Leaderboard
          <span class="lb-header__subtitle">Rankings, records & achievements</span>
        </span>
      </header>
      <div class="lb-body" id="lb-body">
        <div id="lb-stats-section"></div>
        <div id="lb-agents-section"></div>
        <div id="lb-zones-section"></div>
        <div id="lb-records-section"></div>
        <div id="lb-heatmap-section"></div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Data fetching
  // ═══════════════════════════════════════════════════════════════════════

  async _fetchAndRender() {
    if (!this._worldId) return;

    try {
      const data = await this._fetchLeaderboardData();
      this._data = data;
      this._loaded = true;
      this._renderAll();
    } catch (err) {
      console.warn("[Leaderboard] Failed to fetch data:", err);
      this._data = this._emptyData();
      this._loaded = true;
      this._renderAll();
    }
  }

  async _fetchLeaderboardData() {
    const db = window.api?.db;
    if (!db) return this._emptyData();

    const wid = this._worldId;

    // Fetch everything in parallel where possible
    const [analytics, world, agents, zones, achievements, tasks, heatmapData] =
      await Promise.all([
        db.getAnalytics?.(wid, "all").catch(() => null),
        db.getWorld?.(wid).catch(() => null),
        db.getAgents?.(wid).catch(() => []),
        db.getZones?.(wid).catch(() => []),
        db.getAchievements?.(wid).catch(() => []),
        db.getTasks?.(wid).catch(() => []),
        db.getActivityHeatmap?.(wid).catch(() => []),
      ]);

    // Compute world age
    const createdAt = world?.created_at || world?.createdAt;
    const worldAgeDays = createdAt
      ? Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000)
      : 0;

    // Compute total stats
    const totalTasks = analytics?.summary?.totalTasks || tasks?.length || 0;
    const totalTokens = analytics?.summary?.totalTokens || 0;

    // Compute XP from agents
    const agentList = Array.isArray(agents) ? agents : [];
    const totalXP = agentList.reduce((sum, a) => sum + (a.xp || 0), 0);

    // Zones unlocked
    const zoneList = Array.isArray(zones) ? zones : [];
    const totalZones = Object.keys(ZONE_COLORS).length || 20;
    const unlockedZones =
      zoneList.filter((z) => z.unlocked !== false).length || zoneList.length;

    // Achievements
    const achieveList = Array.isArray(achievements) ? achievements : [];
    const totalAchievements = achieveList.length;
    const unlockedAchievements = achieveList.filter(
      (a) => a.unlocked || a.earned,
    ).length;

    // Streak calculation from tasks
    const taskList = Array.isArray(tasks) ? tasks : [];
    const longestStreak = this._computeStreak(taskList);

    // Agent leaderboard data
    const agentLeaderboard = agentList
      .map((a) => ({
        id: a.id || a.role,
        name: a.name || a.role || "Unknown",
        role: a.role || a.id || "agent",
        tasks: a.tasks_completed || a.tasksCompleted || 0,
        xp: a.xp || 0,
        skills: a.skills_unlocked || a.skillsUnlocked || 0,
        avgResponseTime: a.avg_response_time || a.avgResponseTime || 0,
      }))
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 5);

    // Zone usage from analytics
    const zoneUsage = (analytics?.zoneUsage || [])
      .sort((a, b) => (b.count || 0) - (a.count || 0))
      .slice(0, 10);

    // Personal records
    const records = await this._computeRecords(taskList, db, wid);

    // Activity heatmap (365 days)
    const heatmap =
      Array.isArray(heatmapData) && heatmapData.length > 0
        ? heatmapData
        : this._buildHeatmapFromTasks(taskList);

    return {
      totalTasks,
      totalTokens,
      totalXP,
      worldAgeDays,
      unlockedZones,
      totalZones,
      unlockedAchievements,
      totalAchievements,
      longestStreak,
      agentLeaderboard,
      zoneUsage,
      records,
      heatmap,
    };
  }

  _emptyData() {
    return {
      totalTasks: 0,
      totalTokens: 0,
      totalXP: 0,
      worldAgeDays: 0,
      unlockedZones: 0,
      totalZones: 20,
      unlockedAchievements: 0,
      totalAchievements: 0,
      longestStreak: 0,
      agentLeaderboard: [],
      zoneUsage: [],
      records: {
        fastestTask: 0,
        mostTokens: 0,
        longestSession: 0,
        mostTasksInDay: 0,
      },
      heatmap: [],
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Compute helpers
  // ═══════════════════════════════════════════════════════════════════════

  _computeStreak(tasks) {
    if (!tasks || tasks.length === 0) return 0;

    // Get unique active days
    const days = new Set();
    tasks.forEach((t) => {
      const d =
        t.completed_at || t.completedAt || t.created_at || t.createdAt || "";
      if (d) days.add(d.slice(0, 10));
    });

    const sorted = [...days].sort();
    if (sorted.length === 0) return 0;

    let maxStreak = 1;
    let current = 1;

    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1]);
      const curr = new Date(sorted[i]);
      const diff = (curr - prev) / 86_400_000;

      if (diff === 1) {
        current++;
        maxStreak = Math.max(maxStreak, current);
      } else {
        current = 1;
      }
    }

    return maxStreak;
  }

  async _computeRecords(tasks, db, wid) {
    const records = {
      fastestTask: 0,
      fastestTaskName: "",
      mostTokens: 0,
      mostTokensTask: "",
      longestSession: 0,
      longestSessionDate: "",
      mostTasksInDay: 0,
      mostTasksDate: "",
    };

    if (!tasks || tasks.length === 0) return records;

    // Fastest task completion
    let fastest = Infinity;
    tasks.forEach((t) => {
      const dur = t.duration || t.elapsed_ms || t.elapsedMs || 0;
      if (dur > 0 && dur < fastest) {
        fastest = dur;
        records.fastestTask = dur;
        records.fastestTaskName = t.name || t.title || t.zone || "task";
      }
    });
    if (fastest === Infinity) records.fastestTask = 0;

    // Most tokens in single task
    tasks.forEach((t) => {
      const tokens =
        (t.input_tokens || 0) + (t.output_tokens || 0) + (t.tokens || 0);
      if (tokens > records.mostTokens) {
        records.mostTokens = tokens;
        records.mostTokensTask = t.name || t.title || t.zone || "task";
      }
    });

    // Most tasks in one day
    const dayBuckets = {};
    tasks.forEach((t) => {
      const d = (
        t.completed_at ||
        t.completedAt ||
        t.created_at ||
        t.createdAt ||
        ""
      ).slice(0, 10);
      if (d) dayBuckets[d] = (dayBuckets[d] || 0) + 1;
    });
    for (const [day, count] of Object.entries(dayBuckets)) {
      if (count > records.mostTasksInDay) {
        records.mostTasksInDay = count;
        records.mostTasksDate = day;
      }
    }

    // Longest session — approximate from consecutive task timestamps
    const sorted = tasks
      .map((t) =>
        new Date(
          t.completed_at || t.completedAt || t.created_at || t.createdAt || 0,
        ).getTime(),
      )
      .filter((ts) => ts > 0)
      .sort((a, b) => a - b);

    if (sorted.length >= 2) {
      let sessionStart = sorted[0];
      let sessionEnd = sorted[0];
      let maxSession = 0;

      for (let i = 1; i < sorted.length; i++) {
        // If gap < 30 min, same session
        if (sorted[i] - sorted[i - 1] < 30 * 60 * 1000) {
          sessionEnd = sorted[i];
        } else {
          const dur = sessionEnd - sessionStart;
          if (dur > maxSession) {
            maxSession = dur;
            records.longestSessionDate = new Date(sessionStart)
              .toISOString()
              .slice(0, 10);
          }
          sessionStart = sorted[i];
          sessionEnd = sorted[i];
        }
      }
      const finalDur = sessionEnd - sessionStart;
      if (finalDur > maxSession) {
        maxSession = finalDur;
        records.longestSessionDate = new Date(sessionStart)
          .toISOString()
          .slice(0, 10);
      }
      records.longestSession = maxSession;
    }

    return records;
  }

  _buildHeatmapFromTasks(tasks) {
    const dayMap = {};
    (tasks || []).forEach((t) => {
      const d = (
        t.completed_at ||
        t.completedAt ||
        t.created_at ||
        t.createdAt ||
        ""
      ).slice(0, 10);
      if (d) dayMap[d] = (dayMap[d] || 0) + 1;
    });

    const dates = dateRange(365);
    return dates.map((d) => ({ date: d, count: dayMap[d] || 0 }));
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Render all sections
  // ═══════════════════════════════════════════════════════════════════════

  _renderAll() {
    if (!this._el || !this._data) return;

    this._renderWorldStats();
    this._renderAgentLeaderboard();
    this._renderZoneLeaderboard();
    this._renderPersonalRecords();
    this._renderActivityHeatmap();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 1. World Stats — big number cards
  // ═══════════════════════════════════════════════════════════════════════

  _renderWorldStats() {
    const section = this._el.querySelector("#lb-stats-section");
    if (!section) return;

    const d = this._data;

    section.innerHTML = `
      <div class="lb-section-title">
        <span class="lb-section-title__icon">\u{1F4CA}</span> World Stats
      </div>
      <div class="lb-stats-grid">
        <div class="lb-card lb-stat-card lb-stat-card--tasks">
          <span class="lb-stat-card__label">Tasks Completed</span>
          <span class="lb-stat-card__value">${fmtNumber(d.totalTasks)}</span>
          <span class="lb-stat-card__sub">all time</span>
        </div>
        <div class="lb-card lb-stat-card lb-stat-card--tokens">
          <span class="lb-stat-card__label">Tokens Consumed</span>
          <span class="lb-stat-card__value">${fmtNumber(d.totalTokens)}</span>
          <span class="lb-stat-card__sub">input + output</span>
        </div>
        <div class="lb-card lb-stat-card lb-stat-card--xp">
          <span class="lb-stat-card__label">Total XP Earned</span>
          <span class="lb-stat-card__value">${fmtNumber(d.totalXP)}</span>
          <span class="lb-stat-card__sub">across all agents</span>
        </div>
        <div class="lb-card lb-stat-card lb-stat-card--age">
          <span class="lb-stat-card__label">World Age</span>
          <span class="lb-stat-card__value">${d.worldAgeDays}</span>
          <span class="lb-stat-card__sub">days since creation</span>
        </div>
        <div class="lb-card lb-stat-card lb-stat-card--zones">
          <span class="lb-stat-card__label">Zones Unlocked</span>
          <span class="lb-stat-card__value">${d.unlockedZones} / ${d.totalZones}</span>
          <span class="lb-stat-card__sub">exploration progress</span>
        </div>
        <div class="lb-card lb-stat-card lb-stat-card--achieve">
          <span class="lb-stat-card__label">Achievements</span>
          <span class="lb-stat-card__value">${d.unlockedAchievements} / ${d.totalAchievements || "?"}</span>
          <span class="lb-stat-card__sub">unlocked</span>
        </div>
        <div class="lb-card lb-stat-card lb-stat-card--streak" style="grid-column: 1 / -1;">
          <span class="lb-stat-card__label">Longest Streak</span>
          <span class="lb-stat-card__value">${d.longestStreak} day${d.longestStreak !== 1 ? "s" : ""}</span>
          <span class="lb-stat-card__sub">consecutive days active</span>
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 2. Agent Leaderboard — table + Canvas bar chart
  // ═══════════════════════════════════════════════════════════════════════

  _renderAgentLeaderboard() {
    const section = this._el.querySelector("#lb-agents-section");
    if (!section) return;

    const agents = this._data.agentLeaderboard || [];

    let tableRows = "";
    if (agents.length === 0) {
      tableRows = `<tr><td colspan="6" style="text-align:center;color:var(--lb-text-dim);padding:16px;">No agent data yet</td></tr>`;
    } else {
      agents.forEach((a, i) => {
        const pos = i + 1;
        const posClass = pos <= 3 ? `lb-pos--${pos}` : "lb-pos--other";
        const icon = AGENT_ICONS[a.role] || "\u{1F916}";
        const medal = medalFor(pos);

        tableRows += `
          <tr>
            <td style="text-align:center"><span class="lb-pos ${posClass}">${medal || pos}</span></td>
            <td><span class="lb-agent-name"><span class="lb-agent-name__icon">${icon}</span>${escHtml(a.name)}</span></td>
            <td class="lb-agent-stat">${fmtNumber(a.tasks)}</td>
            <td class="lb-agent-stat">${fmtNumber(a.xp)}</td>
            <td class="lb-agent-stat">${a.skills}</td>
            <td class="lb-agent-stat">${a.avgResponseTime ? fmtMs(a.avgResponseTime) : "-"}</td>
          </tr>
        `;
      });
    }

    section.innerHTML = `
      <div class="lb-section-title">
        <span class="lb-section-title__icon">\u{1F451}</span> Agent Leaderboard
      </div>
      <div class="lb-card" style="padding:8px 0;">
        <table class="lb-agent-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Agent</th>
              <th>Tasks</th>
              <th>XP</th>
              <th>Skills</th>
              <th>Avg Time</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
      <div class="lb-card" style="margin-top:8px;">
        <div class="lb-chart-wrap">
          <canvas id="lb-agent-chart" height="120"></canvas>
        </div>
      </div>
    `;

    // Draw the bar chart
    if (agents.length > 0) {
      const canvas = section.querySelector("#lb-agent-chart");
      if (canvas) {
        requestAnimationFrame(() => this._drawAgentBarChart(canvas, agents));
      }
    }
  }

  _drawAgentBarChart(canvas, agents) {
    const w = canvas.parentElement.clientWidth || 340;
    const h = 120;
    const ctx = setupCanvas(canvas, w, h);

    if (agents.length === 0) {
      ctx.fillStyle = "#3a4560";
      ctx.font = "11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No agent data", w / 2, h / 2);
      return;
    }

    const padding = { top: 12, right: 12, bottom: 24, left: 72 };
    const plotW = w - padding.left - padding.right;
    const plotH = h - padding.top - padding.bottom;
    const maxVal = Math.max(...agents.map((a) => a.xp), 1);
    const barH = Math.min(18, plotH / agents.length - 4);
    const gap = (plotH - barH * agents.length) / (agents.length + 1);

    agents.forEach((a, i) => {
      const y = padding.top + gap + i * (barH + gap);
      const barW = (a.xp / maxVal) * plotW;

      // Agent name label
      ctx.fillStyle = "#c8d0e0";
      ctx.font = "10px Inter, sans-serif";
      ctx.textAlign = "right";
      ctx.fillText(a.name, padding.left - 8, y + barH / 2 + 3);

      // Bar gradient
      const color = AGENT_COLORS[i % AGENT_COLORS.length];
      const grad = ctx.createLinearGradient(
        padding.left,
        y,
        padding.left + barW,
        y,
      );
      grad.addColorStop(0, color);
      grad.addColorStop(1, color + "66");
      ctx.fillStyle = grad;

      // Rounded bar
      const radius = Math.min(4, barH / 2);
      ctx.beginPath();
      ctx.moveTo(padding.left + radius, y);
      ctx.lineTo(padding.left + barW - radius, y);
      ctx.arcTo(
        padding.left + barW,
        y,
        padding.left + barW,
        y + radius,
        radius,
      );
      ctx.lineTo(padding.left + barW, y + barH - radius);
      ctx.arcTo(
        padding.left + barW,
        y + barH,
        padding.left + barW - radius,
        y + barH,
        radius,
      );
      ctx.lineTo(padding.left + radius, y + barH);
      ctx.arcTo(
        padding.left,
        y + barH,
        padding.left,
        y + barH - radius,
        radius,
      );
      ctx.lineTo(padding.left, y + radius);
      ctx.arcTo(padding.left, y, padding.left + radius, y, radius);
      ctx.closePath();
      ctx.fill();

      // Value label
      ctx.fillStyle = "#c8d0e0";
      ctx.font = "9px SF Mono, Consolas, monospace";
      ctx.textAlign = "left";
      ctx.fillText(
        fmtNumber(a.xp) + " XP",
        padding.left + barW + 6,
        y + barH / 2 + 3,
      );
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 3. Zone Leaderboard — ranked list with progress bars
  // ═══════════════════════════════════════════════════════════════════════

  _renderZoneLeaderboard() {
    const section = this._el.querySelector("#lb-zones-section");
    if (!section) return;

    const zones = this._data.zoneUsage || [];
    const maxCount = Math.max(...zones.map((z) => z.count || 0), 1);

    let items = "";
    if (zones.length === 0) {
      items = `<li class="lb-zone-item" style="justify-content:center;color:var(--lb-text-dim);">No zone usage data</li>`;
    } else {
      zones.forEach((z, i) => {
        const pct = (((z.count || 0) / maxCount) * 100).toFixed(1);
        const peakHour =
          z.peak_hour != null
            ? fmtHour(z.peak_hour)
            : z.peakHour != null
              ? fmtHour(z.peakHour)
              : "-";

        items += `
          <li class="lb-zone-item">
            <span class="lb-zone-item__rank">${i + 1}</span>
            <span class="lb-zone-item__name">${escHtml(z.zone || z.name || "Unknown")}</span>
            <span class="lb-zone-item__bar-wrap">
              <span class="lb-zone-item__bar" style="width:${pct}%;background:linear-gradient(90deg,${ZONE_COLORS[i % ZONE_COLORS.length]},${ZONE_COLORS[i % ZONE_COLORS.length]}66);"></span>
            </span>
            <span class="lb-zone-item__count">${fmtNumber(z.count || 0)}</span>
            <span class="lb-zone-item__time">${peakHour}</span>
          </li>
        `;
      });
    }

    section.innerHTML = `
      <div class="lb-section-title">
        <span class="lb-section-title__icon">\u{1F3D7}</span> Zone Leaderboard
      </div>
      <div class="lb-card">
        <ul class="lb-zone-list">
          <li class="lb-zone-item" style="padding-bottom:2px;border-bottom:1px solid var(--lb-border);">
            <span class="lb-zone-item__rank" style="font-size:8px;color:var(--lb-text-dim);">#</span>
            <span class="lb-zone-item__name" style="font-size:9px;color:var(--lb-text-dim);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Zone</span>
            <span class="lb-zone-item__bar-wrap" style="visibility:hidden;"></span>
            <span class="lb-zone-item__count" style="font-size:9px;color:var(--lb-text-dim);font-weight:600;">Uses</span>
            <span class="lb-zone-item__time" style="font-size:9px;color:var(--lb-text-dim);font-weight:600;">Peak</span>
          </li>
          ${items}
        </ul>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 4. Personal Records — stat cards
  // ═══════════════════════════════════════════════════════════════════════

  _renderPersonalRecords() {
    const section = this._el.querySelector("#lb-records-section");
    if (!section) return;

    const r = this._data.records || {};

    section.innerHTML = `
      <div class="lb-section-title">
        <span class="lb-section-title__icon">\u{26A1}</span> Personal Records
      </div>
      <div class="lb-records-grid">
        <div class="lb-card lb-record-card">
          <span class="lb-record-card__icon">\u{1F3CE}</span>
          <span class="lb-record-card__label">Fastest Task</span>
          <span class="lb-record-card__value">${r.fastestTask ? fmtDuration(r.fastestTask) : "-"}</span>
          <span class="lb-record-card__detail">${escHtml(r.fastestTaskName) || "no records yet"}</span>
        </div>
        <div class="lb-card lb-record-card">
          <span class="lb-record-card__icon">\u{1F4A0}</span>
          <span class="lb-record-card__label">Most Tokens (single)</span>
          <span class="lb-record-card__value">${r.mostTokens ? fmtNumber(r.mostTokens) : "-"}</span>
          <span class="lb-record-card__detail">${escHtml(r.mostTokensTask) || "no records yet"}</span>
        </div>
        <div class="lb-card lb-record-card">
          <span class="lb-record-card__icon">\u{23F1}</span>
          <span class="lb-record-card__label">Longest Session</span>
          <span class="lb-record-card__value">${r.longestSession ? fmtDuration(r.longestSession) : "-"}</span>
          <span class="lb-record-card__detail">${r.longestSessionDate || "no records yet"}</span>
        </div>
        <div class="lb-card lb-record-card">
          <span class="lb-record-card__icon">\u{1F525}</span>
          <span class="lb-record-card__label">Most Tasks in a Day</span>
          <span class="lb-record-card__value">${r.mostTasksInDay || "-"}</span>
          <span class="lb-record-card__detail">${r.mostTasksDate || "no records yet"}</span>
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 5. Activity Heatmap — GitHub-style contribution graph (Canvas 2D)
  // ═══════════════════════════════════════════════════════════════════════

  _renderActivityHeatmap() {
    const section = this._el.querySelector("#lb-heatmap-section");
    if (!section) return;

    const heatmap = this._data.heatmap || [];
    const totalActivity = heatmap.reduce((s, d) => s + (d.count || 0), 0);

    section.innerHTML = `
      <div class="lb-section-title">
        <span class="lb-section-title__icon">\u{1F5D3}</span> Activity Heatmap
      </div>
      <div class="lb-card lb-heatmap-wrap">
        <div class="lb-heatmap-header">
          <span class="lb-heatmap-title">${heatmap.length} days of activity</span>
          <span class="lb-heatmap-total">${fmtNumber(totalActivity)} total actions</span>
        </div>
        <canvas id="lb-heatmap-canvas" class="lb-heatmap-canvas" height="100"></canvas>
        <div class="lb-heatmap-legend">
          <span>Less</span>
          <span class="lb-heatmap-legend__box" style="background:${HEATMAP_COLORS[0]};"></span>
          <span class="lb-heatmap-legend__box" style="background:${HEATMAP_COLORS[1]};"></span>
          <span class="lb-heatmap-legend__box" style="background:${HEATMAP_COLORS[2]};"></span>
          <span class="lb-heatmap-legend__box" style="background:${HEATMAP_COLORS[3]};"></span>
          <span class="lb-heatmap-legend__box" style="background:${HEATMAP_COLORS[4]};"></span>
          <span>More</span>
        </div>
      </div>
    `;

    const canvas = section.querySelector("#lb-heatmap-canvas");
    if (canvas) {
      requestAnimationFrame(() => this._drawHeatmap(canvas, heatmap));
    }
  }

  _drawHeatmap(canvas, data) {
    const w = canvas.parentElement.clientWidth - 20 || 340;
    const cellSize = 10;
    const cellGap = 2;
    const cellTotal = cellSize + cellGap;
    const rows = 7; // days of week
    const labelW = 20; // left labels (Mon, Wed, Fri)

    // Compute number of weeks to display
    const numDays = data.length || 365;
    const cols = Math.ceil(numDays / 7);
    const totalW = labelW + cols * cellTotal;
    const totalH = rows * cellTotal + 20; // +20 for month labels

    const ctx = setupCanvas(canvas, Math.max(w, totalW), totalH);

    // Determine max count for color scaling
    const maxCount = Math.max(...data.map((d) => d.count || 0), 1);

    // Month labels along top
    ctx.fillStyle = "#6b7a99";
    ctx.font = "8px Inter, sans-serif";
    ctx.textAlign = "center";

    let lastMonth = -1;
    for (let col = 0; col < cols; col++) {
      const dayIdx = col * 7;
      if (dayIdx < data.length) {
        const dateStr = data[dayIdx]?.date;
        if (dateStr) {
          const month = new Date(dateStr).getMonth();
          if (month !== lastMonth) {
            lastMonth = month;
            const monthNames = [
              "Jan",
              "Feb",
              "Mar",
              "Apr",
              "May",
              "Jun",
              "Jul",
              "Aug",
              "Sep",
              "Oct",
              "Nov",
              "Dec",
            ];
            ctx.fillText(
              monthNames[month],
              labelW + col * cellTotal + cellSize / 2,
              10,
            );
          }
        }
      }
    }

    // Day labels (Mon, Wed, Fri)
    ctx.fillStyle = "#6b7a99";
    ctx.font = "8px Inter, sans-serif";
    ctx.textAlign = "right";
    const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];
    for (let row = 0; row < rows; row++) {
      if (dayLabels[row]) {
        ctx.fillText(
          dayLabels[row],
          labelW - 4,
          18 + row * cellTotal + cellSize - 1,
        );
      }
    }

    // Draw cells
    for (let i = 0; i < numDays; i++) {
      const col = Math.floor(i / 7);
      const row = i % 7;
      const x = labelW + col * cellTotal;
      const y = 16 + row * cellTotal;

      const count = data[i]?.count || 0;
      let level;
      if (count === 0) level = 0;
      else if (count <= maxCount * 0.25) level = 1;
      else if (count <= maxCount * 0.5) level = 2;
      else if (count <= maxCount * 0.75) level = 3;
      else level = 4;

      ctx.fillStyle = HEATMAP_COLORS[level];
      ctx.beginPath();
      ctx.roundRect(x, y, cellSize, cellSize, 2);
      ctx.fill();
    }
  }
}
