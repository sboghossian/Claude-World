/**
 * home-dashboard.js — Home Dashboard zone
 *
 * Personalized landing screen shown after onboarding. Provides a
 * quick overview of the world: stats, agents, quests, activity, weather,
 * and quick actions — all in a bento grid layout.
 *
 * All charts are rendered with the Canvas 2D API — no external libraries.
 *
 * Public API:
 *   render()              → HTMLElement
 *   async init(worldId)   — fetch data, populate dashboard
 *   destroy()             — cleanup timers / listeners
 */

// ── Constants ──────────────────────────────────────────────────────────

/** Canonical agent definitions (mirrors seed.js / mission-control.js) */
const AGENT_DEFS = [
  {
    id: "commander",
    emoji: "\u{1F451}",
    name: "Commander Rex",
    role: "Chief Orchestrator",
    color: "#7c3aed",
  },
  {
    id: "librarian",
    emoji: "\u{1F4DA}",
    name: "Dr. Memoria",
    role: "Knowledge Curator",
    color: "#2563eb",
  },
  {
    id: "archivist",
    emoji: "\u{1F4DC}",
    name: "Chronicle",
    role: "History Keeper",
    color: "#0891b2",
  },
  {
    id: "instructor",
    emoji: "\u{1F3AF}",
    name: "Coach Algo",
    role: "Skills Trainer",
    color: "#16a34a",
  },
  {
    id: "dockmaster",
    emoji: "\u{2693}",
    name: "Captain Port",
    role: "Integration Chief",
    color: "#d97706",
  },
];

/** All 20 zones for spotlight (id, icon, name, short desc) */
const ZONE_DEFS = [
  {
    id: "dispatch_tower",
    icon: "\u{1F3F0}",
    name: "Dispatch Tower",
    desc: "Command centre for task orchestration and agent coordination.",
  },
  {
    id: "brain_library",
    icon: "\u{1F4DA}",
    name: "Brain Library",
    desc: "Research hub for RAG queries and knowledge retrieval.",
  },
  {
    id: "skills_academy",
    icon: "\u{1F3AF}",
    name: "Skills Academy",
    desc: "Training ground for levelling up agent capabilities.",
  },
  {
    id: "memory_vault",
    icon: "\u{1F5C4}",
    name: "Memory Vault",
    desc: "Long-term memory storage and conversation archives.",
  },
  {
    id: "connector_docks",
    icon: "\u{2693}",
    name: "Connector Docks",
    desc: "Integration hub for APIs and external services.",
  },
  {
    id: "chat_rooms",
    icon: "\u{1F4AC}",
    name: "Chat Rooms",
    desc: "Multi-agent conversation spaces and collaboration.",
  },
  {
    id: "treasury",
    icon: "\u{1F4B0}",
    name: "Treasury",
    desc: "Token budgets, cost tracking, and resource management.",
  },
  {
    id: "minion_tunnels",
    icon: "\u{26CF}",
    name: "Minion Tunnels",
    desc: "Background task runners and automation pipelines.",
  },
  {
    id: "legal_tower",
    icon: "\u{2696}",
    name: "Legal Tower",
    desc: "Policy rules, compliance checks, and guardrails.",
  },
  {
    id: "sales_district",
    icon: "\u{1F4C8}",
    name: "Sales District",
    desc: "Lead management and sales pipeline tracking.",
  },
  {
    id: "marketing_plaza",
    icon: "\u{1F4E3}",
    name: "Marketing Plaza",
    desc: "Content generation and campaign management.",
  },
  {
    id: "the_exchange",
    icon: "\u{1F504}",
    name: "The Exchange",
    desc: "Data transformation and format conversion hub.",
  },
  {
    id: "the_market",
    icon: "\u{1F6D2}",
    name: "The Market",
    desc: "Plugin marketplace for extensions and tools.",
  },
  {
    id: "the_council",
    icon: "\u{1F3DB}",
    name: "The Council",
    desc: "Multi-agent deliberation and decision making.",
  },
  {
    id: "rd_lab",
    icon: "\u{1F52C}",
    name: "R&D Lab",
    desc: "Experimental prompt engineering and A/B testing.",
  },
  {
    id: "the_archive",
    icon: "\u{1F4DC}",
    name: "The Archive",
    desc: "Historical event timeline and world changelog.",
  },
  {
    id: "airport",
    icon: "\u{2708}",
    name: "Airport",
    desc: "Import/export hub for data and configurations.",
  },
  {
    id: "globe_room",
    icon: "\u{1F310}",
    name: "Globe Room",
    desc: "Global context and world-wide knowledge overview.",
  },
  {
    id: "broadcast_tower",
    icon: "\u{1F4E1}",
    name: "Broadcast Tower",
    desc: "Notifications, webhooks, and outbound messaging.",
  },
  {
    id: "mission_control",
    icon: "\u{1F6F0}",
    name: "Mission Control",
    desc: "Real-time war room with live feeds and DEFCON status.",
  },
];

/** Weather state config: icon, label, mood descriptor */
const WEATHER_CONFIG = {
  sunny: {
    icon: "\u{2600}\u{FE0F}",
    label: "Sunny",
    mood: "World mood is excellent",
  },
  clear: {
    icon: "\u{1F324}\u{FE0F}",
    label: "Clear",
    mood: "World mood is positive",
  },
  cloudy: {
    icon: "\u{2601}\u{FE0F}",
    label: "Cloudy",
    mood: "World mood is neutral",
  },
  rain: { icon: "\u{1F327}\u{FE0F}", label: "Rain", mood: "World mood is low" },
  storm: {
    icon: "\u{26C8}\u{FE0F}",
    label: "Storm",
    mood: "World mood is critical",
  },
};

/** Activity-feed event icons by status/type */
const ACTIVITY_ICONS = {
  completed: "\u{2705}",
  failed: "\u{274C}",
  running: "\u{1F504}",
  pending: "\u{23F3}",
  quest: "\u{1F3C6}",
  zone: "\u{1F3D7}",
  default: "\u{1F4CB}",
};

/** Auto-refresh interval: 30 seconds */
const REFRESH_INTERVAL = 30_000;

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

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
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

/**
 * Draw a sparkline onto a small canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} data
 * @param {string} color  Hex color
 */
function drawSparkline(canvas, data, color) {
  const w = 80;
  const h = 30;
  const ctx = setupCanvas(canvas, w, h);
  ctx.clearRect(0, 0, w, h);

  if (!data || data.length < 2) {
    // Draw a flat line if no data
    ctx.beginPath();
    ctx.strokeStyle = color + "44";
    ctx.lineWidth = 1;
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
    return;
  }

  const max = Math.max(...data, 0.001);
  const step = w / (data.length - 1);

  // Line
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  data.forEach((v, i) => {
    const x = i * step;
    const y = h - (v / max) * (h - 4) - 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Fill under curve
  ctx.lineTo((data.length - 1) * step, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color + "33");
  grad.addColorStop(1, color + "00");
  ctx.fillStyle = grad;
  ctx.fill();
}

/**
 * Derive time-of-day greeting variant.
 * @returns {'morning'|'afternoon'|'evening'}
 */
function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

/**
 * Relative time label from ISO string.
 * @param {string|null} iso
 * @returns {string}
 */
function relativeTime(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Generate synthetic sparkline data from task list (last 7 data points).
 * @param {object[]} tasks
 * @returns {number[]}
 */
function buildSparklineData(tasks, field = "created_at", buckets = 7) {
  const now = Date.now();
  const bucketMs = (7 * 24 * 60 * 60 * 1000) / buckets;
  const data = new Array(buckets).fill(0);

  for (const t of tasks) {
    const ts = t[field] ? new Date(t[field]).getTime() : 0;
    const age = now - ts;
    const idx = buckets - 1 - Math.floor(age / bucketMs);
    if (idx >= 0 && idx < buckets) data[idx]++;
  }
  return data;
}

// ── HomeDashboard class ────────────────────────────────────────────────

export class HomeDashboard {
  constructor() {
    /** @type {string|number|null} */
    this._worldId = null;

    /** @type {HTMLElement|null} */
    this._el = null;

    /** @type {number|null} Refresh timer */
    this._refreshTimer = null;

    /** @type {object|null} Cached world data */
    this._world = null;

    /** @type {object[]} Cached zones */
    this._zones = [];

    /** @type {object[]} Cached agents */
    this._agents = [];

    /** @type {object[]} Cached tasks */
    this._tasks = [];

    /** @type {object[]} Cached quests */
    this._quests = [];

    /** @type {object|null} Cached task stats */
    this._taskStats = null;

    /** @type {string} Current weather */
    this._weather = "clear";
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
    el.className = "home-dashboard";
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Home Dashboard");
    this._el = el;

    el.innerHTML = this._buildShellHTML();
    return el;
  }

  /**
   * Load data and populate the dashboard.
   * @param {string|number} worldId
   */
  async init(worldId) {
    this._worldId = worldId;
    await this._fetchAndRender();

    // Auto-refresh every 30 seconds
    this._refreshTimer = setInterval(() => {
      this._fetchAndRender();
    }, REFRESH_INTERVAL);

    // Wire up interactive elements
    this._wireEvents();
  }

  /**
   * Cleanup timers and listeners.
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
    const id = "home-dashboard-styles";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "src/zones/home-dashboard.css";
    document.head.appendChild(link);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Data fetching
  // ═══════════════════════════════════════════════════════════════════════

  async _fetchAndRender() {
    if (!this._worldId) return;

    try {
      // Fetch all data sources in parallel
      const [world, zones, agents, tasks, quests, taskStats] =
        await Promise.all([
          this._safeCall("getWorld", this._worldId),
          this._safeCall("getZones", this._worldId),
          this._safeCall("getAgents", this._worldId),
          this._safeCall("getRecentTasks", this._worldId, 50),
          this._safeCall("getQuests", this._worldId),
          this._safeCall("getTaskStats", this._worldId),
        ]);

      this._world = world || { name: "World", xp: 0, level: 1 };
      this._zones = Array.isArray(zones) ? zones : [];
      this._agents = Array.isArray(agents) ? agents : [];
      this._tasks = Array.isArray(tasks) ? tasks : [];
      this._quests = Array.isArray(quests) ? quests : [];
      this._taskStats = taskStats || {
        totalTasks: 0,
        totalCost: 0,
        avgLatency: 0,
        tasksByStatus: {},
      };

      // Derive weather from world-state if available
      this._deriveWeather();

      // Populate the dashboard
      this._populateDashboard();
    } catch (err) {
      console.warn("[HomeDashboard] Failed to fetch data:", err);
    }
  }

  /**
   * Safely call a window.api.db method, returning null on any error.
   */
  async _safeCall(method, ...args) {
    try {
      if (
        window.api &&
        window.api.db &&
        typeof window.api.db[method] === "function"
      ) {
        return await window.api.db[method](...args);
      }
    } catch (e) {
      console.warn(`[HomeDashboard] db.${method} failed:`, e);
    }
    return null;
  }

  /**
   * Derive weather from the world state system if it exposes its state,
   * otherwise derive from task success/failure ratio.
   */
  _deriveWeather() {
    // Try to read from the global world-state instance
    if (
      window.__worldState &&
      typeof window.__worldState.getWeather === "function"
    ) {
      this._weather = window.__worldState.getWeather();
      return;
    }

    // Fallback: derive from recent task success ratio
    const recent = this._tasks.slice(0, 20);
    if (recent.length === 0) {
      this._weather = "clear";
      return;
    }
    const successes = recent.filter((t) => t.status === "completed").length;
    const ratio = successes / recent.length;
    if (ratio >= 0.8) this._weather = "sunny";
    else if (ratio >= 0.6) this._weather = "clear";
    else if (ratio >= 0.4) this._weather = "cloudy";
    else if (ratio >= 0.2) this._weather = "rain";
    else this._weather = "storm";
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Shell HTML
  // ═══════════════════════════════════════════════════════════════════════

  _buildShellHTML() {
    return `
      <div class="hd-container">
        <div class="hd-greeting">
          <div class="hd-greeting__text" id="hd-greeting-text">Welcome back</div>
          <div class="hd-greeting__sub" id="hd-greeting-sub"></div>
        </div>

        <div class="hd-bento">
          <!-- Stat Cards (row 1, 4 cols) -->
          <div class="hd-card hd-stat-card hd-stat-card--tasks" id="hd-stat-tasks">
            <div class="hd-stat__label">Total Tasks</div>
            <div class="hd-stat__value hd-stat__value--blue" id="hd-val-tasks">0</div>
            <canvas class="hd-stat__sparkline" id="hd-spark-tasks"></canvas>
          </div>
          <div class="hd-card hd-stat-card hd-stat-card--zones" id="hd-stat-zones">
            <div class="hd-stat__label">Active Zones</div>
            <div class="hd-stat__value hd-stat__value--green" id="hd-val-zones">0</div>
            <canvas class="hd-stat__sparkline" id="hd-spark-zones"></canvas>
          </div>
          <div class="hd-card hd-stat-card hd-stat-card--level" id="hd-stat-level">
            <div class="hd-stat__label">World Level</div>
            <div class="hd-stat__value hd-stat__value--purple" id="hd-val-level">1</div>
            <canvas class="hd-stat__sparkline" id="hd-spark-level"></canvas>
          </div>
          <div class="hd-card hd-stat-card hd-stat-card--health" id="hd-stat-health">
            <div class="hd-stat__label">Health Score</div>
            <div class="hd-stat__value hd-stat__value--amber" id="hd-val-health">--</div>
            <canvas class="hd-stat__sparkline" id="hd-spark-health"></canvas>
          </div>

          <!-- Quick Actions (row 2, span 4) -->
          <div class="hd-card hd-quick-actions" id="hd-quick-actions">
            <button class="hd-quick-btn" data-action="new-task">
              <span class="hd-quick-btn__icon">\u{2795}</span> New Task
            </button>
            <button class="hd-quick-btn" data-action="command-palette">
              <span class="hd-quick-btn__icon">\u{2318}</span> Command Palette
            </button>
            <button class="hd-quick-btn" data-action="snapshot">
              <span class="hd-quick-btn__icon">\u{1F4F8}</span> Take Snapshot
            </button>
            <button class="hd-quick-btn" data-action="analytics">
              <span class="hd-quick-btn__icon">\u{1F4CA}</span> View Analytics
            </button>
          </div>

          <!-- Recent Activity (left, span 2 cols, span 2 rows) -->
          <div class="hd-card hd-activity" id="hd-activity">
            <div class="hd-card__title">
              <span class="hd-card__title-icon">\u{1F4CB}</span> Recent Activity
            </div>
            <ul class="hd-activity__list" id="hd-activity-list">
              <li class="hd-activity__empty">No recent activity</li>
            </ul>
          </div>

          <!-- Agent Status (right, span 2 cols, span 2 rows) -->
          <div class="hd-card hd-agents" id="hd-agents">
            <div class="hd-card__title">
              <span class="hd-card__title-icon">\u{1F916}</span> Agent Status
            </div>
            <div class="hd-agents__grid" id="hd-agents-grid"></div>
          </div>

          <!-- Active Quests (left, span 2) -->
          <div class="hd-card hd-quests" id="hd-quests">
            <div class="hd-card__title">
              <span class="hd-card__title-icon">\u{1F3C6}</span> Active Quests
            </div>
            <div class="hd-quests__list" id="hd-quests-list">
              <div class="hd-quests__empty">No active quests</div>
            </div>
          </div>

          <!-- Zone Spotlight (right, span 2) -->
          <div class="hd-card hd-spotlight" id="hd-spotlight">
            <div class="hd-card__title">
              <span class="hd-card__title-icon">\u{2728}</span> Zone Spotlight
            </div>
            <div id="hd-spotlight-content"></div>
          </div>

          <!-- Today's Goal (left, span 2) -->
          <div class="hd-card hd-goal" id="hd-goal">
            <div class="hd-card__title">
              <span class="hd-card__title-icon">\u{1F3AF}</span> Today's Goal
            </div>
            <input
              type="text"
              class="hd-goal__input"
              id="hd-goal-input"
              placeholder="What do you want to accomplish today?"
              maxlength="200"
            />
          </div>

          <!-- Weather (right, span 2) -->
          <div class="hd-card" id="hd-weather">
            <div class="hd-card__title">
              <span class="hd-card__title-icon">\u{1F326}</span> World Weather
            </div>
            <div class="hd-weather" id="hd-weather-content"></div>
          </div>
        </div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Populate dashboard sections
  // ═══════════════════════════════════════════════════════════════════════

  _populateDashboard() {
    if (!this._el) return;

    this._renderGreeting();
    this._renderStats();
    this._renderActivity();
    this._renderAgents();
    this._renderQuests();
    this._renderSpotlight();
    this._renderWeather();
    this._loadGoal();
  }

  // ── Greeting ──────────────────────────────────────────────────────────

  _renderGreeting() {
    const greetingEl = this._el.querySelector("#hd-greeting-text");
    const subEl = this._el.querySelector("#hd-greeting-sub");
    if (!greetingEl) return;

    const tod = getTimeOfDay();
    const greetingMap = {
      morning: "Good morning",
      afternoon: "Good afternoon",
      evening: "Good evening",
    };
    const worldName = this._world?.name || "World";
    greetingEl.textContent = `${greetingMap[tod]}, ${worldName}`;

    if (subEl) {
      const dateStr = new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
      });
      const taskCount = this._taskStats?.totalTasks || 0;
      subEl.textContent = `${dateStr} \u{2022} ${fmtNumber(taskCount)} tasks completed all time`;
    }
  }

  // ── Stat Cards ────────────────────────────────────────────────────────

  _renderStats() {
    // Total Tasks
    const totalTasks = this._taskStats?.totalTasks || 0;
    this._setText("#hd-val-tasks", fmtNumber(totalTasks));

    // Active Zones (zones with status != 'ruin' or that are unlocked)
    const activeZones = this._zones.filter(
      (z) => z.status !== "ruin" && z.status !== "locked",
    ).length;
    this._setText("#hd-val-zones", String(activeZones));

    // World Level
    const level = this._world?.level || 1;
    this._setText("#hd-val-level", String(level));

    // Health Score — derive from task success rate and zone activity
    const healthScore = this._computeHealthScore();
    this._setText(
      "#hd-val-health",
      healthScore >= 0 ? String(healthScore) : "--",
    );

    // Draw sparklines
    this._drawStatSparklines();
  }

  _computeHealthScore() {
    let score = 50; // Base score

    // Task success component (0-40 points)
    const recent = this._tasks.slice(0, 20);
    if (recent.length > 0) {
      const successes = recent.filter((t) => t.status === "completed").length;
      score = Math.round((successes / recent.length) * 40);
    } else {
      score = 20; // No tasks = moderate baseline
    }

    // Active zones component (0-30 points)
    const totalZones = this._zones.length || 1;
    const activeZones = this._zones.filter(
      (z) => z.status !== "ruin" && z.status !== "locked",
    ).length;
    score += Math.round((activeZones / totalZones) * 30);

    // Quest progress component (0-30 points)
    const activeQuests = this._quests.filter((q) => q.status === "active");
    if (activeQuests.length > 0) {
      const avgProgress =
        activeQuests.reduce((sum, q) => sum + (q.progress || 0), 0) /
        activeQuests.length;
      score += Math.round(avgProgress * 30);
    } else if (this._quests.some((q) => q.status === "completed")) {
      score += 20; // Completed quests count for something
    }

    return Math.min(100, Math.max(0, score));
  }

  _drawStatSparklines() {
    // Tasks sparkline — tasks per day over last 7 days
    const sparkTasks = this._el.querySelector("#hd-spark-tasks");
    if (sparkTasks) {
      const data = buildSparklineData(this._tasks, "created_at", 7);
      drawSparkline(sparkTasks, data, "#4a9eff");
    }

    // Zones sparkline — synthetic upward trend based on zone count
    const sparkZones = this._el.querySelector("#hd-spark-zones");
    if (sparkZones) {
      const activeCount = this._zones.filter(
        (z) => z.status !== "ruin" && z.status !== "locked",
      ).length;
      // Generate a gentle upward curve
      const data = Array.from({ length: 7 }, (_, i) =>
        Math.max(1, activeCount - (6 - i)),
      );
      drawSparkline(sparkZones, data, "#4aff8a");
    }

    // Level sparkline — steady growth
    const sparkLevel = this._el.querySelector("#hd-spark-level");
    if (sparkLevel) {
      const lv = this._world?.level || 1;
      const data = Array.from({ length: 7 }, (_, i) =>
        Math.max(1, lv - (6 - i) * 0.3),
      );
      drawSparkline(sparkLevel, data, "#a855f7");
    }

    // Health sparkline — recent health trend
    const sparkHealth = this._el.querySelector("#hd-spark-health");
    if (sparkHealth) {
      const hs = this._computeHealthScore();
      // Generate slight variance around current score
      const data = Array.from({ length: 7 }, (_, i) => {
        const variance = (Math.random() - 0.5) * 10;
        return Math.max(0, Math.min(100, hs + variance - (6 - i) * 2));
      });
      drawSparkline(sparkHealth, data, "#ffb84a");
    }
  }

  // ── Recent Activity ───────────────────────────────────────────────────

  _renderActivity() {
    const listEl = this._el.querySelector("#hd-activity-list");
    if (!listEl) return;

    const recentTasks = this._tasks.slice(0, 10);

    if (recentTasks.length === 0) {
      listEl.innerHTML =
        '<li class="hd-activity__empty">No recent activity yet</li>';
      return;
    }

    listEl.innerHTML = recentTasks
      .map((task) => {
        const icon = ACTIVITY_ICONS[task.status] || ACTIVITY_ICONS.default;
        const prompt = escHtml(
          task.prompt || task.description || task.type || "Task",
        );
        const truncated =
          prompt.length > 60 ? prompt.slice(0, 57) + "..." : prompt;
        const time = relativeTime(task.created_at || task.updated_at);
        const zone = escHtml(task.zone_id || "");

        return `
        <li class="hd-activity__item">
          <span class="hd-activity__icon">${icon}</span>
          <span class="hd-activity__text">${truncated}${zone ? ` <span style="color:var(--hd-text-dim)">\u{2022} ${zone}</span>` : ""}</span>
          <span class="hd-activity__time">${time}</span>
        </li>
      `;
      })
      .join("");
  }

  // ── Agent Status ──────────────────────────────────────────────────────

  _renderAgents() {
    const gridEl = this._el.querySelector("#hd-agents-grid");
    if (!gridEl) return;

    // Merge db agents with canonical defs for display
    const agentCards = AGENT_DEFS.map((def) => {
      const dbAgent = this._agents.find(
        (a) =>
          a.id === def.id || a.agent_key === def.id || a.role_key === def.id,
      );

      const mood = dbAgent?.mood || "focused";
      const lastTask = dbAgent?.last_task || dbAgent?.current_task || null;
      const activity = lastTask
        ? escHtml(
            typeof lastTask === "string"
              ? lastTask
              : lastTask.prompt || lastTask.description || "Working...",
          )
        : "Idle";
      const truncActivity =
        activity.length > 40 ? activity.slice(0, 37) + "..." : activity;

      return `
        <div class="hd-agent-card">
          <div class="hd-agent-card__avatar" style="background:${def.color}22; border-color:${def.color}44">
            ${def.emoji}
          </div>
          <div class="hd-agent-card__info">
            <div class="hd-agent-card__name">${escHtml(def.name)}</div>
            <div class="hd-agent-card__role">${escHtml(def.role)}</div>
            <div class="hd-agent-card__activity">${truncActivity}</div>
          </div>
          <span class="hd-agent-card__mood hd-agent-card__mood--${escHtml(mood)}">${escHtml(mood)}</span>
        </div>
      `;
    });

    gridEl.innerHTML = agentCards.join("");
  }

  // ── Active Quests ─────────────────────────────────────────────────────

  _renderQuests() {
    const listEl = this._el.querySelector("#hd-quests-list");
    if (!listEl) return;

    const activeQuests = this._quests.filter((q) => q.status === "active");

    if (activeQuests.length === 0) {
      listEl.innerHTML =
        '<div class="hd-quests__empty">No active quests right now</div>';
      return;
    }

    listEl.innerHTML = activeQuests
      .slice(0, 4)
      .map((quest) => {
        const name = escHtml(quest.name || quest.title || "Quest");
        const desc = escHtml(quest.description || "");
        const progress = Math.min(1, Math.max(0, quest.progress || 0));
        const pct = Math.round(progress * 100);

        return `
        <div class="hd-quest-item">
          <div class="hd-quest-item__header">
            <span class="hd-quest-item__name">${name}</span>
            <span class="hd-quest-item__pct">${pct}%</span>
          </div>
          <div class="hd-quest-item__bar">
            <div class="hd-quest-item__fill" style="width:${pct}%"></div>
          </div>
          ${desc ? `<div class="hd-quest-item__desc">${desc.length > 80 ? desc.slice(0, 77) + "..." : desc}</div>` : ""}
        </div>
      `;
      })
      .join("");
  }

  // ── Zone Spotlight ────────────────────────────────────────────────────

  _renderSpotlight() {
    const contentEl = this._el.querySelector("#hd-spotlight-content");
    if (!contentEl) return;

    // Pick a random unlocked zone, or any zone if none unlocked
    const unlocked = this._zones.filter(
      (z) => z.status !== "ruin" && z.status !== "locked",
    );
    const pool = unlocked.length > 0 ? unlocked : this._zones;

    if (pool.length === 0) {
      // Fallback to static ZONE_DEFS
      const fallback = pick(ZONE_DEFS);
      this._renderSpotlightZone(contentEl, fallback);
      return;
    }

    const chosen = pick(pool);
    // Merge with our richer ZONE_DEFS data
    const def =
      ZONE_DEFS.find((z) => z.id === chosen.zone_id || z.id === chosen.id) ||
      {};
    const merged = { ...def, ...chosen };
    this._renderSpotlightZone(contentEl, merged);
  }

  _renderSpotlightZone(el, zone) {
    const icon = zone.icon || "\u{1F3D7}";
    const name = escHtml(zone.name || zone.zone_id || zone.id || "Zone");
    const desc = escHtml(
      zone.desc ||
        zone.description ||
        "Explore this zone to discover its capabilities.",
    );

    el.innerHTML = `
      <div class="hd-spotlight__zone">
        <div class="hd-spotlight__icon">${icon}</div>
        <div class="hd-spotlight__info">
          <div class="hd-spotlight__name">${name}</div>
          <div class="hd-spotlight__desc">${desc}</div>
          <button class="hd-spotlight__open-btn" data-zone="${escHtml(zone.id || zone.zone_id || "")}">
            Open Zone \u{2192}
          </button>
        </div>
      </div>
    `;
  }

  // ── Weather ───────────────────────────────────────────────────────────

  _renderWeather() {
    const contentEl = this._el.querySelector("#hd-weather-content");
    if (!contentEl) return;

    const cfg = WEATHER_CONFIG[this._weather] || WEATHER_CONFIG.clear;

    contentEl.innerHTML = `
      <span class="hd-weather__icon">${cfg.icon}</span>
      <div class="hd-weather__info">
        <div class="hd-weather__state">${escHtml(cfg.label)}</div>
        <div class="hd-weather__mood">${escHtml(cfg.mood)}</div>
      </div>
    `;
  }

  // ── Today's Goal ──────────────────────────────────────────────────────

  _loadGoal() {
    const input = this._el.querySelector("#hd-goal-input");
    if (!input) return;

    const key = `hd-goal-${this._worldId || "default"}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      input.value = saved;
    }
  }

  _saveGoal() {
    const input = this._el.querySelector("#hd-goal-input");
    if (!input) return;

    const key = `hd-goal-${this._worldId || "default"}`;
    localStorage.setItem(key, input.value);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Event wiring
  // ═══════════════════════════════════════════════════════════════════════

  _wireEvents() {
    if (!this._el) return;

    // Goal input — save on change
    const goalInput = this._el.querySelector("#hd-goal-input");
    if (goalInput) {
      goalInput.addEventListener("input", () => this._saveGoal());
      goalInput.addEventListener("blur", () => this._saveGoal());
    }

    // Quick action buttons
    this._el.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (btn) {
        this._handleQuickAction(btn.dataset.action);
        return;
      }

      const spotlightBtn = e.target.closest("[data-zone]");
      if (spotlightBtn && spotlightBtn.dataset.zone) {
        this._openZone(spotlightBtn.dataset.zone);
      }
    });
  }

  _handleQuickAction(action) {
    switch (action) {
      case "new-task":
        window.dispatchEvent(
          new CustomEvent("ui:open-zone", {
            detail: { zoneId: "dispatch_tower" },
          }),
        );
        break;
      case "command-palette":
        window.dispatchEvent(new CustomEvent("ui:toggle-command-palette"));
        break;
      case "snapshot":
        window.dispatchEvent(new CustomEvent("ui:take-snapshot"));
        break;
      case "analytics":
        window.dispatchEvent(
          new CustomEvent("ui:open-zone", { detail: { zoneId: "analytics" } }),
        );
        break;
    }
  }

  _openZone(zoneId) {
    if (zoneId) {
      window.dispatchEvent(
        new CustomEvent("ui:open-zone", { detail: { zoneId } }),
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Utility
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Set text content of a selector within this._el.
   */
  _setText(selector, text) {
    const el = this._el?.querySelector(selector);
    if (el) el.textContent = text;
  }
}
