/**
 * mission-control.js — Mission Control zone
 *
 * Real-time war room / command centre. NASA mission control meets Bloomberg
 * terminal. Shows everything happening in the Claude World RIGHT NOW.
 *
 * Layout (3-column):
 *   Left  (30%) — Agent status board (5 agents, live state, XP)
 *   Centre(40%) — Live activity feed (auto-scrolling event stream)
 *   Right (30%) — Zone health grid (20 zones, colour-coded cards)
 *
 * Top bar: World stats ticker + DEFCON indicator
 * Bottom: 4 sparkline charts (tasks/hr, XP/hr, cost/hr, active zones)
 *
 * Emits nothing. Listens to:
 *   dispatch:task-complete, quest:complete, incident:filed,
 *   zone:building-complete, minion:run-complete, agent:mood-change,
 *   agent:xp-gain, zone:activity, world:state-change
 */

// ── Constants ──────────────────────────────────────────────────────────

const MC_MAX_FEED = 200;
const MC_SPARKLINE_POINTS = 24; // 24 hours of hourly buckets

const DEFCON_LEVELS = [
  { level: 5, label: "DEFCON 5", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  {
    level: 4,
    label: "DEFCON 4",
    color: "#84cc16",
    bg: "rgba(132,204,22,0.12)",
  },
  {
    level: 3,
    label: "DEFCON 3",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.15)",
  },
  {
    level: 2,
    label: "DEFCON 2",
    color: "#f97316",
    bg: "rgba(249,115,22,0.18)",
  },
  { level: 1, label: "DEFCON 1", color: "#ef4444", bg: "rgba(239,68,68,0.22)" },
];

/** Canonical agent definitions (mirrors seed.js) */
const AGENT_DEFS = [
  {
    id: "commander",
    emoji: "\u{1F451}",
    name: "Commander",
    role: "Dispatcher",
    zone: "dispatch_tower",
  },
  {
    id: "librarian",
    emoji: "\u{1F4DA}",
    name: "Librarian",
    role: "Researcher",
    zone: "brain_library",
  },
  {
    id: "teacher",
    emoji: "\u{1F393}",
    name: "Teacher",
    role: "Trainer",
    zone: "skills_academy",
  },
  {
    id: "archivist",
    emoji: "\u{1F4DC}",
    name: "Archivist",
    role: "Memory Keeper",
    zone: "memory_vault",
  },
  {
    id: "harbormaster",
    emoji: "\u{2693}",
    name: "Harbor Master",
    role: "Integrator",
    zone: "connector_docks",
  },
];

/** All 20 zones — matches seed.js ZONE_DEFS order */
const ZONE_DEFS = [
  { id: "dispatch_tower", icon: "\u{1F3F0}", name: "Dispatch Tower" },
  { id: "brain_library", icon: "\u{1F4DA}", name: "Brain Library" },
  { id: "skills_academy", icon: "\u{1F3AF}", name: "Skills Academy" },
  { id: "memory_vault", icon: "\u{1F5C4}", name: "Memory Vault" },
  { id: "connector_docks", icon: "\u{2693}", name: "Connector Docks" },
  { id: "chat_rooms", icon: "\u{1F4AC}", name: "Chat Rooms" },
  { id: "treasury", icon: "\u{1F4B0}", name: "Treasury" },
  { id: "minion_tunnels", icon: "\u{26CF}", name: "Minion Tunnels" },
  { id: "legal_tower", icon: "\u{2696}", name: "Legal Tower" },
  { id: "sales_district", icon: "\u{1F4C8}", name: "Sales District" },
  { id: "marketing_plaza", icon: "\u{1F4E3}", name: "Marketing Plaza" },
  { id: "the_exchange", icon: "\u{1F504}", name: "The Exchange" },
  { id: "the_market", icon: "\u{1F6D2}", name: "The Market" },
  { id: "the_council", icon: "\u{1F3DB}", name: "The Council" },
  { id: "rd_lab", icon: "\u{1F52C}", name: "R&D Lab" },
  { id: "the_archive", icon: "\u{1F4DC}", name: "The Archive" },
  { id: "airport", icon: "\u{2708}", name: "Airport" },
  { id: "globe_room", icon: "\u{1F310}", name: "Globe Room" },
  { id: "broadcast_tower", icon: "\u{1F4E1}", name: "Broadcast Tower" },
  { id: "mission_control", icon: "\u{1F6F0}", name: "Mission Control" },
];

/** Event-type display config */
const EVENT_TYPE_CONFIG = {
  task: { badge: "TASK", color: "#22c55e" },
  quest: { badge: "QUEST", color: "#a78bfa" },
  incident: { badge: "INCIDENT", color: "#ef4444" },
  zone: { badge: "ZONE", color: "#38bdf8" },
  minion: { badge: "MINION", color: "#fb923c" },
  agent: { badge: "AGENT", color: "#fbbf24" },
  world: { badge: "WORLD", color: "#6ee7b7" },
  system: { badge: "SYS", color: "#94a3b8" },
};

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Escape HTML entities.
 * @param {string} str
 * @returns {string}
 */
function escHtml(str) {
  if (!str) return "";
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

/**
 * Format a Date as HH:MM:SS.
 * @param {Date} [d]
 * @returns {string}
 */
function fmtTime(d = new Date()) {
  return d.toTimeString().slice(0, 8);
}

/**
 * Format milliseconds as human uptime string.
 * @param {number} ms
 * @returns {string}
 */
function fmtUptime(ms) {
  const secs = Math.floor(ms / 1000);
  const m = Math.floor(secs / 60) % 60;
  const h = Math.floor(secs / 3600) % 24;
  const d = Math.floor(secs / 86400);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${secs % 60}s`;
}

/**
 * Relative time label.
 * @param {string|null} iso
 * @returns {string}
 */
function relativeTime(iso) {
  if (!iso) return "—";
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
 * Draw a simple sparkline onto a canvas element.
 * @param {HTMLCanvasElement} canvas
 * @param {number[]} data
 * @param {string} color
 */
function drawSparkline(canvas, data, color) {
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  if (!data || data.length < 2) return;

  const max = Math.max(...data, 0.001);
  const step = w / (data.length - 1);

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.lineJoin = "round";

  data.forEach((v, i) => {
    const x = i * step;
    const y = h - (v / max) * (h - 2) - 1;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Fill under curve
  ctx.lineTo((data.length - 1) * step, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = color
    .replace(")", ", 0.12)")
    .replace("rgb(", "rgba(")
    .replace("#", "");
  // Simple fill using gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, color + "33");
  grad.addColorStop(1, color + "00");
  ctx.fillStyle = grad;
  ctx.fill();
}

// ── MissionControl class ───────────────────────────────────────────────

export class MissionControl {
  constructor() {
    /** @type {string|null} */
    this._worldId = null;

    /** @type {Array<object>} Live feed items (max MC_MAX_FEED) */
    this._feed = [];

    /** @type {HTMLElement|null} Root element */
    this._el = null;

    /** @type {boolean} */
    this._fullscreen = false;

    /** @type {Map<string, object>} Agent state by agent id */
    this._agentState = new Map();

    /** @type {Map<string, object>} Zone state by zone id */
    this._zoneState = new Map();

    /** @type {number} DEFCON level 1-5 */
    this._defcon = 5;

    /** @type {number} Total XP across world */
    this._totalXP = 0;

    /** @type {number} Tasks completed today */
    this._tasksToday = 0;

    /** @type {number} Active agents count */
    this._activeAgents = 0;

    /** @type {number|null} World start timestamp (ms) */
    this._worldStart = null;

    /** @type {number|null} Interval handle for clock/sparklines refresh */
    this._ticker = null;

    /** @type {number|null} Interval handle for data refresh */
    this._refreshTimer = null;

    /** Sparkline data buckets: 24 hourly slots */
    this._sparkTasksPerHour = new Array(MC_SPARKLINE_POINTS).fill(0);
    this._sparkXPPerHour = new Array(MC_SPARKLINE_POINTS).fill(0);
    this._sparkCostPerHour = new Array(MC_SPARKLINE_POINTS).fill(0);
    this._sparkActiveZones = new Array(MC_SPARKLINE_POINTS).fill(0);

    /** @type {Map<string, Function>} Bound DOM event listeners for cleanup */
    this._listeners = new Map();

    // Initialise agent state placeholders
    for (const a of AGENT_DEFS) {
      this._agentState.set(a.id, {
        ...a,
        mood: "idle",
        lastAction: null,
        xpToday: 0,
        busy: false,
      });
    }

    // Initialise zone state placeholders
    for (const z of ZONE_DEFS) {
      this._zoneState.set(z.id, {
        ...z,
        status: "ruin",
        buildProgress: 0,
        lastActivity: null,
        unlocked: false,
      });
    }
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
    el.className = "mission-control";
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Mission Control");
    this._el = el;

    el.innerHTML = this._buildHTML();
    this._wireInternalEvents();

    return el;
  }

  /**
   * Load initial data and start listening for live events.
   * @param {string|number} worldId
   */
  async init(worldId) {
    this._worldId = worldId;
    await this._loadInitialData();
    this._attachGlobalListeners();
    this._startTicker();

    // Initial boot feed entry
    this._appendFeedItem(
      "\u{1F6F0}",
      "system",
      "Mission Control online. All systems nominal.",
      "#22c55e",
    );
  }

  /**
   * Append an item to the live feed.
   * @param {string} icon       Emoji or character
   * @param {string} type       Event type key (maps to EVENT_TYPE_CONFIG)
   * @param {string} description
   * @param {string} [color]    Override color
   */
  _appendFeedItem(icon, type, description, color) {
    const cfg = EVENT_TYPE_CONFIG[type] || EVENT_TYPE_CONFIG["system"];
    const itemColor = color || cfg.color;
    const ts = fmtTime();
    const item = {
      icon,
      type,
      description,
      color: itemColor,
      ts,
      id: Date.now() + Math.random(),
    };

    this._feed.unshift(item);
    if (this._feed.length > MC_MAX_FEED) {
      this._feed.length = MC_MAX_FEED;
    }

    this._prependFeedDOM(item, cfg);
  }

  /**
   * Remove event listeners and stop timers.
   */
  destroy() {
    if (this._ticker) clearInterval(this._ticker);
    if (this._refreshTimer) clearInterval(this._refreshTimer);
    this._ticker = null;
    this._refreshTimer = null;

    for (const [evtName, handler] of this._listeners) {
      window.removeEventListener(evtName, handler);
    }
    this._listeners.clear();

    if (this._fullscreen) this._exitFullscreen();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CSS injection
  // ═══════════════════════════════════════════════════════════════════════

  _injectCSS() {
    const id = "mission-control-styles";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "src/zones/mission-control.css";
    document.head.appendChild(link);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HTML template
  // ═══════════════════════════════════════════════════════════════════════

  _buildHTML() {
    const agentCards = AGENT_DEFS.map((a) => this._agentCardHTML(a)).join("");
    const zoneCards = ZONE_DEFS.map((z) => this._zoneCardHTML(z)).join("");

    return `
      <!-- ── Top bar ─────────────────────────────── -->
      <header class="mc-topbar" id="mc-topbar">
        <div class="mc-topbar__defcon" id="mc-defcon">
          <span class="mc-defcon__level" id="mc-defcon-label">DEFCON 5</span>
          <span class="mc-defcon__dots" id="mc-defcon-dots">
            ${[1, 2, 3, 4, 5].map((i) => `<span class="mc-defcon__dot mc-defcon__dot--${i}" data-level="${i}"></span>`).join("")}
          </span>
        </div>

        <div class="mc-ticker" id="mc-ticker" aria-live="polite">
          <span class="mc-ticker__item">
            <span class="mc-ticker__label">XP</span>
            <span class="mc-ticker__value" id="mc-stat-xp">0</span>
          </span>
          <span class="mc-ticker__sep">//</span>
          <span class="mc-ticker__item">
            <span class="mc-ticker__label">AGENTS</span>
            <span class="mc-ticker__value" id="mc-stat-agents">0 / 5</span>
          </span>
          <span class="mc-ticker__sep">//</span>
          <span class="mc-ticker__item">
            <span class="mc-ticker__label">TASKS TODAY</span>
            <span class="mc-ticker__value" id="mc-stat-tasks">0</span>
          </span>
          <span class="mc-ticker__sep">//</span>
          <span class="mc-ticker__item">
            <span class="mc-ticker__label">UPTIME</span>
            <span class="mc-ticker__value" id="mc-stat-uptime">—</span>
          </span>
          <span class="mc-ticker__sep">//</span>
          <span class="mc-ticker__item">
            <span class="mc-ticker__label">CLOCK</span>
            <span class="mc-ticker__value mc-clock" id="mc-clock">00:00:00</span>
          </span>
        </div>

        <div class="mc-topbar__actions">
          <button class="mc-btn mc-btn--ghost" id="mc-fullscreen-btn" title="Toggle fullscreen">
            &#x26F6; Expand
          </button>
        </div>
      </header>

      <!-- ── Main 3-column grid ──────────────────── -->
      <main class="mc-grid">

        <!-- Left: Agent status board -->
        <section class="mc-col mc-col--left" aria-label="Agent Status Board">
          <div class="mc-panel-header">
            <span class="mc-panel-header__icon">\u{1F916}</span>
            <span class="mc-panel-header__title">AGENT STATUS</span>
            <span class="mc-panel-header__badge" id="mc-agents-badge">LIVE</span>
          </div>
          <div class="mc-agents" id="mc-agents">
            ${agentCards}
          </div>
        </section>

        <!-- Centre: Live activity feed -->
        <section class="mc-col mc-col--center" aria-label="Live Activity Feed">
          <div class="mc-panel-header">
            <span class="mc-panel-header__icon">\u{1F4E1}</span>
            <span class="mc-panel-header__title">LIVE FEED</span>
            <span class="mc-panel-header__badge mc-panel-header__badge--pulse">STREAM</span>
          </div>
          <div class="mc-feed" id="mc-feed" role="log" aria-live="polite" aria-label="Activity feed">
            <div class="mc-feed__empty" id="mc-feed-empty">
              <span>Awaiting events&hellip;</span>
              <span class="mc-cursor">_</span>
            </div>
          </div>
        </section>

        <!-- Right: Zone health grid -->
        <section class="mc-col mc-col--right" aria-label="Zone Health Grid">
          <div class="mc-panel-header">
            <span class="mc-panel-header__icon">\u{1F5FA}</span>
            <span class="mc-panel-header__title">ZONE GRID</span>
            <span class="mc-panel-header__badge" id="mc-zones-badge">20 ZONES</span>
          </div>
          <div class="mc-zone-grid" id="mc-zone-grid">
            ${zoneCards}
          </div>
        </section>

      </main>

      <!-- ── Metrics row (sparklines) ────────────── -->
      <footer class="mc-metrics" id="mc-metrics">
        <div class="mc-metric">
          <div class="mc-metric__label">TASKS / HR</div>
          <canvas class="mc-sparkline" id="mc-spark-tasks" width="80" height="32" aria-hidden="true"></canvas>
          <div class="mc-metric__value" id="mc-spark-tasks-val">0</div>
        </div>
        <div class="mc-metric">
          <div class="mc-metric__label">XP / HR</div>
          <canvas class="mc-sparkline" id="mc-spark-xp" width="80" height="32" aria-hidden="true"></canvas>
          <div class="mc-metric__value" id="mc-spark-xp-val">0</div>
        </div>
        <div class="mc-metric">
          <div class="mc-metric__label">COST / HR</div>
          <canvas class="mc-sparkline" id="mc-spark-cost" width="80" height="32" aria-hidden="true"></canvas>
          <div class="mc-metric__value" id="mc-spark-cost-val">$0.000</div>
        </div>
        <div class="mc-metric">
          <div class="mc-metric__label">ACTIVE ZONES</div>
          <canvas class="mc-sparkline" id="mc-spark-zones" width="80" height="32" aria-hidden="true"></canvas>
          <div class="mc-metric__value" id="mc-spark-zones-val">0</div>
        </div>
      </footer>
    `;
  }

  /** @param {{emoji:string, name:string, role:string, id:string}} a */
  _agentCardHTML(a) {
    return `
      <div class="mc-agent" id="mc-agent-${a.id}" data-agent="${a.id}" role="button" tabindex="0"
           aria-label="Agent ${a.name}">
        <div class="mc-agent__header">
          <span class="mc-agent__emoji">${a.emoji}</span>
          <div class="mc-agent__info">
            <span class="mc-agent__name">${escHtml(a.name)}</span>
            <span class="mc-agent__role">${escHtml(a.role)}</span>
          </div>
          <span class="mc-agent__mood-dot mc-agent__mood-dot--idle" id="mc-agent-mood-${a.id}"
                title="Mood: idle"></span>
        </div>
        <div class="mc-agent__body">
          <div class="mc-agent__last-action" id="mc-agent-action-${a.id}">Awaiting first task&hellip;</div>
          <div class="mc-agent__xp">
            <span class="mc-agent__xp-label">XP TODAY</span>
            <span class="mc-agent__xp-value" id="mc-agent-xp-${a.id}">0</span>
          </div>
        </div>
      </div>
    `;
  }

  /** @param {{icon:string, name:string, id:string}} z */
  _zoneCardHTML(z) {
    return `
      <div class="mc-zone-card mc-zone-card--ruin" id="mc-zone-${z.id}" data-zone="${z.id}"
           title="${escHtml(z.name)}" aria-label="${escHtml(z.name)}">
        <div class="mc-zone-card__header">
          <span class="mc-zone-card__icon">${z.icon}</span>
          <span class="mc-zone-card__name">${escHtml(z.name)}</span>
          <span class="mc-zone-card__dot" id="mc-zone-dot-${z.id}"></span>
        </div>
        <div class="mc-zone-card__progress">
          <div class="mc-zone-card__bar" id="mc-zone-bar-${z.id}" style="width:0%"></div>
        </div>
        <div class="mc-zone-card__activity" id="mc-zone-activity-${z.id}">—</div>
      </div>
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Internal DOM wiring
  // ═══════════════════════════════════════════════════════════════════════

  _wireInternalEvents() {
    if (!this._el) return;

    // Fullscreen toggle
    const fsBtn = this._el.querySelector("#mc-fullscreen-btn");
    if (fsBtn) {
      fsBtn.addEventListener("click", () => this._toggleFullscreen());
    }

    // Agent card click → agent dialogue
    this._el.querySelectorAll(".mc-agent").forEach((card) => {
      card.addEventListener("click", () => {
        const agentId = card.dataset.agent;
        window.dispatchEvent(
          new CustomEvent("ui:open-agent", { detail: { agentId } }),
        );
      });
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          card.click();
        }
      });
    });

    // Zone card hover tooltip is handled via CSS title attribute
    // Zone card click → open zone panel
    this._el.querySelectorAll(".mc-zone-card").forEach((card) => {
      card.addEventListener("click", () => {
        const zoneId = card.dataset.zone;
        window.dispatchEvent(
          new CustomEvent("ui:open-zone", { detail: { zoneId } }),
        );
      });
    });

    // Escape key exits fullscreen
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this._fullscreen) this._exitFullscreen();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Global event listeners (DOM events from the rest of the app)
  // ═══════════════════════════════════════════════════════════════════════

  _attachGlobalListeners() {
    const listen = (evtName, handler) => {
      const bound = (e) => handler(e.detail || {});
      this._listeners.set(evtName, bound);
      window.addEventListener(evtName, bound);
    };

    listen("dispatch:task-complete", (d) => this._onTaskComplete(d));
    listen("dispatch:task-start", (d) => this._onTaskStart(d));
    listen("dispatch:task-fail", (d) => this._onTaskFail(d));
    listen("quest:complete", (d) => this._onQuestComplete(d));
    listen("incident:filed", (d) => this._onIncidentFiled(d));
    listen("incident:resolved", (d) => this._onIncidentResolved(d));
    listen("zone:building-complete", (d) => this._onZoneBuildComplete(d));
    listen("zone:activity", (d) => this._onZoneActivity(d));
    listen("minion:run-complete", (d) => this._onMinionComplete(d));
    listen("minion:run-start", (d) => this._onMinionStart(d));
    listen("agent:mood-change", (d) => this._onAgentMoodChange(d));
    listen("agent:xp-gain", (d) => this._onAgentXPGain(d));
    listen("world:state-change", (d) => this._onWorldStateChange(d));
    listen("zone:unlocked", (d) => this._onZoneUnlocked(d));
  }

  // ── Event handlers ────────────────────────────────────────────────

  _onTaskComplete(d) {
    const agentId = d.agentId || d.agent_id || null;
    const agent = agentId
      ? AGENT_DEFS.find((a) => a.id === agentId || a.zone === agentId) || null
      : null;
    const icon = agent ? agent.emoji : "\u2705";
    const xp = d.xp || d.xp_earned || 0;
    const cost = d.cost_usd || 0;

    this._tasksToday++;
    this._totalXP += xp;
    this._pushSparkBucket(this._sparkTasksPerHour, 1);
    this._pushSparkBucket(this._sparkXPPerHour, xp);
    this._pushSparkBucket(this._sparkCostPerHour, cost);

    if (agent) {
      const st = this._agentState.get(agent.id);
      if (st) {
        st.busy = false;
        st.xpToday += xp;
        st.lastAction = `Completed: ${d.taskTitle || d.prompt?.slice(0, 40) || "task"}`;
        st.mood = "satisfied";
        this._agentState.set(agent.id, st);
        this._updateAgentCard(agent.id);
      }
    }

    if (d.zoneId || d.zone_id) {
      this._touchZone(d.zoneId || d.zone_id);
    }

    this._appendFeedItem(
      icon,
      "task",
      `Task complete${agent ? ` [${agent.name}]` : ""}${xp ? ` +${xp}XP` : ""}${cost ? ` $${cost.toFixed(4)}` : ""}: ${escHtml(d.taskTitle || d.prompt?.slice(0, 60) || "—")}`,
    );

    this._updateTopBar();
    this._renderSparklines();
    this._recalcDefcon();
  }

  _onTaskStart(d) {
    const agentId = d.agentId || d.agent_id || null;
    const agent =
      AGENT_DEFS.find((a) => a.id === agentId || a.zone === agentId) || null;
    const icon = agent ? agent.emoji : "\u{1F504}";

    if (agent) {
      const st = this._agentState.get(agent.id);
      if (st) {
        st.busy = true;
        st.mood = "working";
        st.lastAction = `Working on: ${d.taskTitle || d.prompt?.slice(0, 40) || "…"}`;
        this._agentState.set(agent.id, st);
        this._updateAgentCard(agent.id);
      }
    }

    this._activeAgents = [...this._agentState.values()].filter(
      (a) => a.busy,
    ).length;
    this._appendFeedItem(
      icon,
      "task",
      `Task started${agent ? ` [${agent.name}]` : ""}: ${escHtml(d.taskTitle || d.prompt?.slice(0, 60) || "—")}`,
    );
    this._updateTopBar();
  }

  _onTaskFail(d) {
    const agentId = d.agentId || d.agent_id || null;
    const agent =
      AGENT_DEFS.find((a) => a.id === agentId || a.zone === agentId) || null;
    const icon = agent ? agent.emoji : "\u274C";

    if (agent) {
      const st = this._agentState.get(agent.id);
      if (st) {
        st.busy = false;
        st.mood = "error";
        st.lastAction = `Failed: ${d.error || d.reason || "unknown error"}`;
        this._agentState.set(agent.id, st);
        this._updateAgentCard(agent.id);
      }
    }

    this._appendFeedItem(
      icon,
      "incident",
      `Task FAILED${agent ? ` [${agent.name}]` : ""}: ${escHtml(d.error || d.reason || "—")}`,
      "#ef4444",
    );
    this._recalcDefcon(true);
  }

  _onQuestComplete(d) {
    this._appendFeedItem(
      "\u{1F3C6}",
      "quest",
      `Quest complete: ${escHtml(d.questTitle || d.title || d.id || "—")}${d.xp ? ` +${d.xp}XP` : ""}`,
    );
    if (d.xp) {
      this._totalXP += d.xp;
      this._updateTopBar();
    }
  }

  _onIncidentFiled(d) {
    const severity = d.severity || 1;
    this._appendFeedItem(
      "\u26A0\uFE0F",
      "incident",
      `INCIDENT filed [sev:${severity}]: ${escHtml(d.title || d.description || "—")}`,
      "#ef4444",
    );
    this._recalcDefcon(false, severity);
  }

  _onIncidentResolved(d) {
    this._appendFeedItem(
      "\u2705",
      "incident",
      `Incident resolved: ${escHtml(d.title || d.id || "—")}`,
      "#22c55e",
    );
    this._recalcDefcon();
  }

  _onZoneBuildComplete(d) {
    const zoneId = d.zoneId || d.zone_id || d.id;
    const zone = ZONE_DEFS.find((z) => z.id === zoneId);
    this._appendFeedItem(
      "\u{1F3D7}",
      "zone",
      `Zone built: ${zone ? zone.name : escHtml(zoneId)}`,
    );
    if (zoneId) {
      const st = this._zoneState.get(zoneId);
      if (st) {
        st.status = "active";
        st.buildProgress = 100;
        st.unlocked = true;
        st.lastActivity = new Date().toISOString();
        this._zoneState.set(zoneId, st);
        this._updateZoneCard(zoneId);
      }
    }
    this._pushSparkBucket(this._sparkActiveZones, 1);
    this._renderSparklines();
  }

  _onZoneActivity(d) {
    const zoneId = d.zoneId || d.zone_id || d.id;
    if (zoneId) this._touchZone(zoneId);
  }

  _onMinionComplete(d) {
    const icon = "\u26CF";
    this._appendFeedItem(
      icon,
      "minion",
      `Minion run complete [${escHtml(d.minionName || d.name || "—")}]: ${escHtml(d.result?.slice(0, 60) || "done")}`,
    );
    this._tasksToday++;
    this._pushSparkBucket(this._sparkTasksPerHour, 1);
    if (d.cost_usd) this._pushSparkBucket(this._sparkCostPerHour, d.cost_usd);
    this._updateTopBar();
    this._renderSparklines();
  }

  _onMinionStart(d) {
    this._appendFeedItem(
      "\u26CF",
      "minion",
      `Minion activated: ${escHtml(d.minionName || d.name || "—")}`,
    );
  }

  _onAgentMoodChange(d) {
    const agentId = d.agentId || d.agent_id;
    if (!agentId) return;
    const agent = AGENT_DEFS.find(
      (a) => a.id === agentId || a.zone === agentId,
    );
    if (!agent) return;
    const st = this._agentState.get(agent.id);
    if (st) {
      st.mood = d.mood || "idle";
      this._agentState.set(agent.id, st);
      this._updateAgentCard(agent.id);
    }
    this._appendFeedItem(
      agent.emoji,
      "agent",
      `${agent.name} mood changed to: ${escHtml(d.mood || "—")}`,
    );
  }

  _onAgentXPGain(d) {
    const agentId = d.agentId || d.agent_id;
    if (!agentId) return;
    const agent = AGENT_DEFS.find(
      (a) => a.id === agentId || a.zone === agentId,
    );
    if (!agent) return;
    const st = this._agentState.get(agent.id);
    if (st && d.xp) {
      st.xpToday += d.xp;
      this._agentState.set(agent.id, st);
      this._updateAgentCard(agent.id);
    }
    this._totalXP += d.xp || 0;
    this._updateTopBar();
  }

  _onWorldStateChange(d) {
    const state = d.state || "idle";
    const icons = {
      idle: "\u{1F4A4}",
      active: "\u{1F7E2}",
      busy: "\u{1F7E1}",
      overload: "\u{1F534}",
    };
    this._appendFeedItem(
      icons[state] || "\u{1F310}",
      "world",
      `World state changed: ${state.toUpperCase()}`,
    );
    if (state === "overload") this._recalcDefcon(true, 3);
    else if (state === "busy") this._recalcDefcon(false, 1);
  }

  _onZoneUnlocked(d) {
    const zoneId = d.zoneId || d.zone_id || d.id;
    const zone = ZONE_DEFS.find((z) => z.id === zoneId);
    if (zoneId) {
      const st = this._zoneState.get(zoneId);
      if (st) {
        st.unlocked = true;
        st.status = "building";
        st.lastActivity = new Date().toISOString();
        this._zoneState.set(zoneId, st);
        this._updateZoneCard(zoneId);
      }
    }
    this._appendFeedItem(
      "\u{1F513}",
      "zone",
      `Zone unlocked: ${zone ? zone.name : escHtml(zoneId)}`,
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Data loading
  // ═══════════════════════════════════════════════════════════════════════

  async _loadInitialData() {
    if (!window.api?.db) return;

    try {
      const worldId = this._worldId;

      // Load zones
      const zones = await window.api.db.getZones(worldId).catch(() => []);
      for (const z of zones) {
        const st = this._zoneState.get(z.zone_type || z.id);
        if (st) {
          st.unlocked = !!z.unlocked;
          st.buildProgress = z.build_progress ?? (z.unlocked ? 100 : 0);
          st.status = z.unlocked
            ? z.build_progress < 100
              ? "building"
              : "active"
            : "ruin";
          st.lastActivity = z.last_activity_at || null;
          this._zoneState.set(z.zone_type || z.id, st);
        }
      }

      // Load agents
      const agents = await window.api.db.getAgents(worldId).catch(() => []);
      for (const a of agents) {
        const def = AGENT_DEFS.find(
          (d) => d.zone === a.zone_id || d.name === a.name,
        );
        if (def) {
          const st = this._agentState.get(def.id);
          if (st) {
            st.mood = a.mood || "idle";
            this._agentState.set(def.id, st);
          }
        }
      }

      // Load today's tasks
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const tasks = await window.api.db
        .getTasks(worldId, { limit: 1000 })
        .catch(() => []);
      const todayTasks = tasks.filter(
        (t) => t.created_at && new Date(t.created_at) >= todayStart,
      );
      this._tasksToday = todayTasks.length;
      this._totalXP = tasks.reduce((s, t) => s + (t.xp_earned || 0), 0);

      // Build hourly sparkline data from tasks
      this._buildSparklineHistory(tasks);

      // World start time
      if (tasks.length > 0) {
        const oldest = tasks.reduce((a, b) =>
          new Date(a.created_at) < new Date(b.created_at) ? a : b,
        );
        this._worldStart = new Date(oldest.created_at).getTime();
      }

      // Load incidents for DEFCON
      const incidents = await window.api.db
        .getIncidents?.(worldId, { status: "open" })
        .catch(() => []);
      if (incidents.length > 0) {
        const maxSev = Math.max(...incidents.map((i) => i.severity || 1));
        this._recalcDefcon(false, maxSev);
      }
    } catch (err) {
      console.warn("[MissionControl] Initial data load error:", err);
    }

    // Apply loaded state to DOM
    this._renderAgentCards();
    this._renderZoneGrid();
    this._updateTopBar();
    this._renderSparklines();
  }

  /**
   * Build sparkline history from tasks array.
   * @param {object[]} tasks
   */
  _buildSparklineHistory(tasks) {
    const now = Date.now();
    const msPerBucket = 3600 * 1000; // 1 hour

    for (const t of tasks) {
      if (!t.created_at) continue;
      const age = now - new Date(t.created_at).getTime();
      const bucketIdx = MC_SPARKLINE_POINTS - 1 - Math.floor(age / msPerBucket);
      if (bucketIdx < 0 || bucketIdx >= MC_SPARKLINE_POINTS) continue;

      this._sparkTasksPerHour[bucketIdx] += 1;
      this._sparkXPPerHour[bucketIdx] += t.xp_earned || 0;
      this._sparkCostPerHour[bucketIdx] += t.cost_usd || 0;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Ticker / clock
  // ═══════════════════════════════════════════════════════════════════════

  _startTicker() {
    // Update clock every second
    this._ticker = setInterval(() => {
      this._updateClock();
    }, 1000);

    // Refresh data from DB every 30s
    this._refreshTimer = setInterval(() => {
      this._loadInitialData();
    }, 30_000);

    this._updateClock();
  }

  _updateClock() {
    const clockEl = this._el?.querySelector("#mc-clock");
    if (clockEl) clockEl.textContent = fmtTime();

    const uptimeEl = this._el?.querySelector("#mc-stat-uptime");
    if (uptimeEl) {
      uptimeEl.textContent = this._worldStart
        ? fmtUptime(Date.now() - this._worldStart)
        : "—";
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DOM update helpers
  // ═══════════════════════════════════════════════════════════════════════

  _updateTopBar() {
    const xpEl = this._el?.querySelector("#mc-stat-xp");
    const agentsEl = this._el?.querySelector("#mc-stat-agents");
    const tasksEl = this._el?.querySelector("#mc-stat-tasks");

    if (xpEl) xpEl.textContent = this._totalXP.toLocaleString();
    if (agentsEl)
      agentsEl.textContent = `${this._activeAgents} / ${AGENT_DEFS.length}`;
    if (tasksEl) tasksEl.textContent = this._tasksToday.toLocaleString();
  }

  _renderAgentCards() {
    for (const a of AGENT_DEFS) {
      this._updateAgentCard(a.id);
    }
  }

  /** @param {string} agentId */
  _updateAgentCard(agentId) {
    if (!this._el) return;
    const st = this._agentState.get(agentId);
    if (!st) return;

    const card = this._el.querySelector(`#mc-agent-${agentId}`);
    const dotEl = this._el.querySelector(`#mc-agent-mood-${agentId}`);
    const actionEl = this._el.querySelector(`#mc-agent-action-${agentId}`);
    const xpEl = this._el.querySelector(`#mc-agent-xp-${agentId}`);

    if (!card) return;

    // Active glow
    card.classList.toggle("mc-agent--active", !!st.busy);
    card.classList.toggle("mc-agent--error", st.mood === "error");

    // Mood dot
    if (dotEl) {
      dotEl.className = `mc-agent__mood-dot mc-agent__mood-dot--${st.mood || "idle"}`;
      dotEl.title = `Mood: ${st.mood || "idle"}`;
    }

    if (actionEl)
      actionEl.textContent = st.lastAction || "Awaiting first task\u2026";
    if (xpEl) xpEl.textContent = (st.xpToday || 0).toLocaleString();
  }

  _renderZoneGrid() {
    for (const z of ZONE_DEFS) {
      this._updateZoneCard(z.id);
    }
    this._updateActiveZoneCount();
  }

  /** @param {string} zoneId */
  _updateZoneCard(zoneId) {
    if (!this._el) return;
    const st = this._zoneState.get(zoneId);
    if (!st) return;

    const card = this._el.querySelector(`#mc-zone-${zoneId}`);
    const dot = this._el.querySelector(`#mc-zone-dot-${zoneId}`);
    const bar = this._el.querySelector(`#mc-zone-bar-${zoneId}`);
    const activityEl = this._el.querySelector(`#mc-zone-activity-${zoneId}`);

    if (!card) return;

    card.className = `mc-zone-card mc-zone-card--${st.status || "ruin"}`;
    if (dot)
      dot.className = `mc-zone-card__dot mc-zone-card__dot--${st.status || "ruin"}`;
    if (bar) bar.style.width = `${st.buildProgress || 0}%`;
    if (activityEl) activityEl.textContent = relativeTime(st.lastActivity);
  }

  _touchZone(zoneId) {
    const st = this._zoneState.get(zoneId);
    if (st) {
      st.lastActivity = new Date().toISOString();
      if (st.unlocked && st.status === "ruin") st.status = "active";
      this._zoneState.set(zoneId, st);
      this._updateZoneCard(zoneId);
    }
    this._updateActiveZoneCount();
  }

  _updateActiveZoneCount() {
    const active = [...this._zoneState.values()].filter(
      (z) => z.status === "active",
    ).length;
    this._pushSparkBucket(this._sparkActiveZones, 0); // just update current reading

    const el = this._el?.querySelector("#mc-spark-zones-val");
    if (el) el.textContent = active;

    // Update the last sparkline bucket to current active count
    this._sparkActiveZones[MC_SPARKLINE_POINTS - 1] = active;
  }

  // ── Feed DOM ──────────────────────────────────────────────────────

  /** @param {object} item @param {object} cfg */
  _prependFeedDOM(item, cfg) {
    const feed = this._el?.querySelector("#mc-feed");
    if (!feed) return;

    // Hide empty state
    const empty = feed.querySelector("#mc-feed-empty");
    if (empty) empty.style.display = "none";

    const el = document.createElement("div");
    el.className = "mc-feed__item mc-feed__item--new";
    el.innerHTML = `
      <span class="mc-feed__ts">${escHtml(item.ts)}</span>
      <span class="mc-feed__icon">${item.icon}</span>
      <span class="mc-feed__badge" style="--badge-color:${item.color}">${escHtml(cfg.badge)}</span>
      <span class="mc-feed__desc">${escHtml(item.description)}</span>
      <span class="mc-cursor mc-feed__cursor">_</span>
    `;

    // Remove cursor from previous last item
    feed.querySelectorAll(".mc-feed__cursor").forEach((c) => c.remove());

    feed.prepend(el);

    // Remove animation class after it plays
    requestAnimationFrame(() => {
      setTimeout(() => el.classList.remove("mc-feed__item--new"), 220);
    });

    // Prune DOM to max entries
    const items = feed.querySelectorAll(".mc-feed__item");
    if (items.length > MC_MAX_FEED) {
      for (let i = MC_MAX_FEED; i < items.length; i++) {
        items[i].remove();
      }
    }

    // Add blinking cursor to first item
    const firstCursor = el.querySelector(".mc-feed__cursor");
    if (firstCursor) firstCursor.style.display = "inline";
  }

  // ── Sparklines ────────────────────────────────────────────────────

  /**
   * Push a value into the current (last) bucket of a sparkline array.
   * @param {number[]} arr
   * @param {number} delta
   */
  _pushSparkBucket(arr, delta) {
    arr[arr.length - 1] = (arr[arr.length - 1] || 0) + delta;
  }

  _renderSparklines() {
    if (!this._el) return;

    const taskCanvas = this._el.querySelector("#mc-spark-tasks");
    const xpCanvas = this._el.querySelector("#mc-spark-xp");
    const costCanvas = this._el.querySelector("#mc-spark-cost");
    const zonesCanvas = this._el.querySelector("#mc-spark-zones");

    if (taskCanvas)
      drawSparkline(taskCanvas, this._sparkTasksPerHour, "#22c55e");
    if (xpCanvas) drawSparkline(xpCanvas, this._sparkXPPerHour, "#a78bfa");
    if (costCanvas)
      drawSparkline(costCanvas, this._sparkCostPerHour, "#f59e0b");
    if (zonesCanvas)
      drawSparkline(zonesCanvas, this._sparkActiveZones, "#38bdf8");

    // Update value labels
    const lastTask = this._sparkTasksPerHour[MC_SPARKLINE_POINTS - 1] || 0;
    const lastXP = this._sparkXPPerHour[MC_SPARKLINE_POINTS - 1] || 0;
    const lastCost = this._sparkCostPerHour[MC_SPARKLINE_POINTS - 1] || 0;
    const lastZones = this._sparkActiveZones[MC_SPARKLINE_POINTS - 1] || 0;

    const setVal = (id, v) => {
      const el = this._el.querySelector(id);
      if (el) el.textContent = v;
    };
    setVal("#mc-spark-tasks-val", lastTask);
    setVal("#mc-spark-xp-val", lastXP);
    setVal("#mc-spark-cost-val", `$${lastCost.toFixed(3)}`);
    setVal("#mc-spark-zones-val", lastZones);
  }

  // ── DEFCON ────────────────────────────────────────────────────────

  /**
   * Recalculate DEFCON level.
   * @param {boolean} [failure]   Whether a failure just occurred
   * @param {number}  [severity]  Incident severity (1-5)
   */
  _recalcDefcon(failure = false, severity = 0) {
    // DEFCON 5 = peace, DEFCON 1 = max alert
    // Driven by incident severity and failures
    let newLevel = 5;
    if (failure) newLevel = Math.min(newLevel, 3);
    if (severity >= 4) newLevel = 1;
    else if (severity >= 3) newLevel = 2;
    else if (severity >= 2) newLevel = Math.min(newLevel, 3);
    else if (severity >= 1) newLevel = Math.min(newLevel, 4);

    // Escalate but allow de-escalation over time (handled by data refresh)
    this._defcon = Math.min(this._defcon, newLevel);
    this._renderDefcon();
  }

  _renderDefcon() {
    const cfg =
      DEFCON_LEVELS.find((d) => d.level === this._defcon) || DEFCON_LEVELS[0];
    const topbar = this._el?.querySelector("#mc-topbar");
    const label = this._el?.querySelector("#mc-defcon-label");
    const dotsEl = this._el?.querySelector("#mc-defcon-dots");

    if (label) label.textContent = cfg.label;
    if (topbar) {
      topbar.style.setProperty("--defcon-color", cfg.color);
      topbar.style.setProperty("--defcon-bg", cfg.bg);
    }

    if (dotsEl) {
      dotsEl.querySelectorAll(".mc-defcon__dot").forEach((dot) => {
        const lvl = parseInt(dot.dataset.level, 10);
        // Levels <= (6 - defcon) are lit (DEFCON 5 = 1 lit, DEFCON 1 = 5 lit)
        dot.classList.toggle("mc-defcon__dot--active", lvl <= 6 - this._defcon);
        dot.style.setProperty("--dot-color", cfg.color);
      });
    }
  }

  // ── Fullscreen ────────────────────────────────────────────────────

  _toggleFullscreen() {
    if (this._fullscreen) this._exitFullscreen();
    else this._enterFullscreen();
  }

  _enterFullscreen() {
    if (!this._el) return;
    this._el.classList.add("mission-control--fullscreen");
    this._fullscreen = true;
    const btn = this._el.querySelector("#mc-fullscreen-btn");
    if (btn) btn.innerHTML = "&#x2716; Collapse";
    document.body.classList.add("mc-fullscreen-active");
  }

  _exitFullscreen() {
    if (!this._el) return;
    this._el.classList.remove("mission-control--fullscreen");
    this._fullscreen = false;
    const btn = this._el.querySelector("#mc-fullscreen-btn");
    if (btn) btn.innerHTML = "&#x26F6; Expand";
    document.body.classList.remove("mc-fullscreen-active");
  }
}
