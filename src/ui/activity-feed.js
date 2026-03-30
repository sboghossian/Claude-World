/**
 * activity-feed.js — Live activity feed for Claude World
 *
 * Compact reverse-chronological ticker in the bottom-left corner.
 * Shows a stream of city events: tasks, zone unlocks, quests, XP, etc.
 *
 * Listens to:
 *   - 'activity:log'              { type, text, icon?, zoneId? }
 *   - 'dispatch:task-complete'    { taskId?, text? }
 *   - 'dispatch:task-dispatched'  { taskId?, text? }
 *   - 'zone:unlock'              { zoneId, zoneName? }
 *   - 'quest:complete'           { questId?, text? }
 *   - 'quest:progress'           { questId?, text? }
 *   - 'world:xp-gained'          { xp, level? }
 *   - 'skill:created'            { skillId?, name? }
 *   - 'minion:run'               { minionId?, name? }
 *   - 'council:vote'             { proposalId?, text? }
 *   - 'agent:moved'              { agentId?, zoneId?, text? }
 *   - 'reputation:change'        { delta?, text? }
 *
 * Export: ActivityFeed { constructor(); mount(); log(event); destroy() }
 */

// ── Event type configuration ─────────────────────────────────────

const EVENT_TYPES = {
  "task-dispatched": {
    icon: "\uD83D\uDCE4",
    color: "var(--accent-blue)",
    label: "Task dispatched",
  },
  "task-complete": {
    icon: "\u2705",
    color: "var(--accent-green)",
    label: "Task complete",
  },
  "zone-unlock": {
    icon: "\uD83D\uDD13",
    color: "var(--accent-gold)",
    label: "Zone unlocked",
  },
  "agent-moved": {
    icon: "\uD83E\uDD16",
    color: "var(--accent-blue)",
    label: "Agent moved",
  },
  "quest-progress": {
    icon: "\uD83D\uDCDC",
    color: "var(--accent-amber)",
    label: "Quest progress",
  },
  "quest-complete": {
    icon: "\uD83C\uDFC6",
    color: "var(--accent-gold)",
    label: "Quest complete",
  },
  "xp-earned": {
    icon: "\u2B50",
    color: "var(--accent-gold)",
    label: "XP earned",
  },
  "skill-created": {
    icon: "\u26A1",
    color: "var(--accent-purple)",
    label: "Skill created",
  },
  "minion-run": {
    icon: "\uD83D\uDC7E",
    color: "var(--accent-amber)",
    label: "Minion run",
  },
  "council-vote": {
    icon: "\uD83D\uDDF3",
    color: "var(--accent-purple)",
    label: "Council vote",
  },
  reputation: {
    icon: "\uD83D\uDCC8",
    color: "var(--accent-green)",
    label: "Reputation",
  },
  system: { icon: "\u2699", color: "var(--text-secondary)", label: "System" },
};

const MAX_EVENTS = 20;
const DEFAULT_FADE_MS = 60_000; // 60 seconds

// ── Utility helpers ──────────────────────────────────────────────

/** Create a DOM element with optional class and innerHTML. */
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Format seconds elapsed to a relative timestamp. */
function timeAgo(timestamp) {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 5) return "now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/** Generate a short unique id. */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ── Main class ───────────────────────────────────────────────────

export class ActivityFeed {
  /**
   * @param {{ fadeMs?: number }} [opts]
   */
  constructor(opts = {}) {
    /** @type {Array<{id: string, type: string, text: string, icon: string, color: string, zoneId?: string, timestamp: number, el?: HTMLElement}>} */
    this._events = [];
    this._fadeMs = opts.fadeMs ?? DEFAULT_FADE_MS;
    this._collapsed = false;
    this._mounted = false;

    // DOM refs
    this._rootEl = null;
    this._headerEl = null;
    this._listEl = null;
    this._styleEl = null;

    // Timers
    this._pruneInterval = null;
    this._timeUpdateInterval = null;

    // Bound handlers for cleanup
    this._boundHandlers = new Map();
  }

  // ══════════════════════════════════════════════════════════════
  // Public API
  // ══════════════════════════════════════════════════════════════

  /**
   * Mount the activity feed into the DOM.
   * Injects CSS, creates elements, wires event listeners.
   */
  mount() {
    if (this._mounted) return;
    this._mounted = true;

    this._injectCSS();
    this._createDOM();
    this._bindEvents();
    this._startTimers();
  }

  /**
   * Log an activity event programmatically.
   * @param {{ type?: string, text: string, icon?: string, zoneId?: string }} event
   */
  log(event) {
    const type = event.type || "system";
    const cfg = EVENT_TYPES[type] || EVENT_TYPES.system;

    const entry = {
      id: uid(),
      type,
      text: event.text,
      icon: event.icon || cfg.icon,
      color: cfg.color,
      zoneId: event.zoneId || null,
      timestamp: Date.now(),
      el: null,
    };

    this._events.unshift(entry);

    // Prune excess
    while (this._events.length > MAX_EVENTS) {
      const removed = this._events.pop();
      if (removed.el) {
        removed.el.classList.add("af-event--exit");
        setTimeout(() => removed.el.remove(), 300);
      }
    }

    // Render the new entry
    if (this._listEl) {
      const item = this._renderEvent(entry);
      entry.el = item;

      // Insert at top (reverse-chronological means newest first visually at the bottom
      // of the scrollable area — but since we use flex column-reverse, prepend)
      this._listEl.prepend(item);

      // Trigger entrance animation
      requestAnimationFrame(() => {
        item.classList.add("af-event--enter");
      });
    }

    return entry;
  }

  /**
   * Remove all DOM elements, timers, and event listeners.
   */
  destroy() {
    this._mounted = false;

    // Remove event listeners
    for (const [eventName, handler] of this._boundHandlers) {
      document.removeEventListener(eventName, handler);
    }
    this._boundHandlers.clear();

    // Clear timers
    if (this._pruneInterval) clearInterval(this._pruneInterval);
    if (this._timeUpdateInterval) clearInterval(this._timeUpdateInterval);

    // Remove DOM
    if (this._rootEl) this._rootEl.remove();
    if (this._styleEl) this._styleEl.remove();
  }

  // ══════════════════════════════════════════════════════════════
  // Private — CSS injection
  // ══════════════════════════════════════════════════════════════

  _injectCSS() {
    this._styleEl = document.createElement("link");
    this._styleEl.rel = "stylesheet";
    this._styleEl.href = new URL("./activity-feed.css", import.meta.url).href;
    document.head.appendChild(this._styleEl);
  }

  // ══════════════════════════════════════════════════════════════
  // Private — DOM creation
  // ══════════════════════════════════════════════════════════════

  _createDOM() {
    // Root container
    this._rootEl = el("div", "af-root");
    this._rootEl.setAttribute("role", "log");
    this._rootEl.setAttribute("aria-label", "Activity feed");
    this._rootEl.setAttribute("aria-live", "polite");

    // Header bar (toggle collapse)
    this._headerEl = el("div", "af-header");

    const headerIcon = el("span", "af-header__icon", "\uD83D\uDCE1");
    const headerLabel = el("span", "af-header__label", "Activity");
    this._countBadge = el("span", "af-header__count", "0");

    this._collapseBtn = el("button", "af-header__toggle");
    this._collapseBtn.setAttribute("aria-label", "Toggle activity feed");
    this._collapseBtn.innerHTML = "\u25BC"; // down caret
    this._collapseBtn.addEventListener("click", () => this._toggleCollapse());

    this._headerEl.appendChild(headerIcon);
    this._headerEl.appendChild(headerLabel);
    this._headerEl.appendChild(this._countBadge);
    this._headerEl.appendChild(this._collapseBtn);

    // Make the full header clickable for collapse
    this._headerEl.addEventListener("click", (e) => {
      if (e.target !== this._collapseBtn) {
        this._toggleCollapse();
      }
    });

    // Event list (scrollable)
    this._listEl = el("div", "af-list");

    this._rootEl.appendChild(this._headerEl);
    this._rootEl.appendChild(this._listEl);

    document.body.appendChild(this._rootEl);
  }

  _renderEvent(entry) {
    const item = el("div", `af-event af-event--${entry.type}`);
    item.dataset.id = entry.id;
    item.style.setProperty("--event-color", entry.color);

    if (entry.zoneId) {
      item.classList.add("af-event--clickable");
      item.dataset.zone = entry.zoneId;
      item.setAttribute("title", `Go to ${entry.zoneId}`);
    }

    // Icon
    const iconEl = el("span", "af-event__icon", entry.icon);
    item.appendChild(iconEl);

    // Text
    const textEl = el("span", "af-event__text");
    textEl.textContent = entry.text;
    item.appendChild(textEl);

    // Timestamp
    const timeEl = el("span", "af-event__time");
    timeEl.textContent = timeAgo(entry.timestamp);
    timeEl.dataset.ts = entry.timestamp;
    item.appendChild(timeEl);

    // Click handler for zone navigation
    if (entry.zoneId) {
      item.addEventListener("click", () => {
        document.dispatchEvent(
          new CustomEvent("hud:navigate", {
            detail: { zoneId: entry.zoneId },
            bubbles: true,
          }),
        );
      });
    }

    return item;
  }

  // ══════════════════════════════════════════════════════════════
  // Private — Collapse
  // ══════════════════════════════════════════════════════════════

  _toggleCollapse() {
    this._collapsed = !this._collapsed;
    this._rootEl.classList.toggle("af-root--collapsed", this._collapsed);
    this._collapseBtn.innerHTML = this._collapsed ? "\u25B2" : "\u25BC";
  }

  // ══════════════════════════════════════════════════════════════
  // Private — Event binding
  // ══════════════════════════════════════════════════════════════

  _bindEvents() {
    // Primary: activity:log
    this._listen("activity:log", (e) => {
      const d = e.detail || {};
      this.log({ type: d.type, text: d.text, icon: d.icon, zoneId: d.zoneId });
    });

    // Auto-capture existing system events
    this._listen("dispatch:task-complete", (e) => {
      const d = e.detail || {};
      this.log({
        type: "task-complete",
        text: d.text || `Task completed${d.taskId ? `: ${d.taskId}` : ""}`,
        zoneId: d.zoneId || "dispatch",
      });
    });

    this._listen("dispatch:task-dispatched", (e) => {
      const d = e.detail || {};
      this.log({
        type: "task-dispatched",
        text: d.text || `Task dispatched${d.taskId ? `: ${d.taskId}` : ""}`,
        zoneId: d.zoneId || "dispatch",
      });
    });

    this._listen("zone:unlock", (e) => {
      const d = e.detail || {};
      this.log({
        type: "zone-unlock",
        text: d.text || `Zone unlocked: ${d.zoneName || d.zoneId || "unknown"}`,
        zoneId: d.zoneId,
      });
    });

    this._listen("quest:complete", (e) => {
      const d = e.detail || {};
      this.log({
        type: "quest-complete",
        text: d.text || `Quest complete${d.questId ? `: ${d.questId}` : ""}`,
      });
    });

    this._listen("quest:progress", (e) => {
      const d = e.detail || {};
      this.log({
        type: "quest-progress",
        text: d.text || `Quest progress${d.questId ? ` on ${d.questId}` : ""}`,
      });
    });

    this._listen("world:xp-gained", (e) => {
      const d = e.detail || {};
      if (d.xp !== undefined) {
        this.log({
          type: "xp-earned",
          text: `+${d.xp} XP earned${d.level ? ` (Level ${d.level})` : ""}`,
        });
      }
    });

    this._listen("skill:created", (e) => {
      const d = e.detail || {};
      this.log({
        type: "skill-created",
        text: d.text || `Skill created: ${d.name || d.skillId || "new skill"}`,
        zoneId: "skills",
      });
    });

    this._listen("minion:run", (e) => {
      const d = e.detail || {};
      this.log({
        type: "minion-run",
        text: d.text || `Minion run: ${d.name || d.minionId || "minion"}`,
        zoneId: "minions",
      });
    });

    this._listen("council:vote", (e) => {
      const d = e.detail || {};
      this.log({
        type: "council-vote",
        text:
          d.text || `Council vote${d.proposalId ? ` on ${d.proposalId}` : ""}`,
        zoneId: "council",
      });
    });

    this._listen("agent:moved", (e) => {
      const d = e.detail || {};
      this.log({
        type: "agent-moved",
        text: d.text || `Agent moved${d.agentId ? ` (${d.agentId})` : ""}`,
        zoneId: d.zoneId,
      });
    });

    this._listen("reputation:change", (e) => {
      const d = e.detail || {};
      const delta = d.delta > 0 ? `+${d.delta}` : String(d.delta || "");
      this.log({
        type: "reputation",
        text: d.text || `Reputation ${delta || "changed"}`,
      });
    });
  }

  /**
   * Helper to add a document event listener and track it for cleanup.
   * @param {string} eventName
   * @param {Function} handler
   */
  _listen(eventName, handler) {
    const bound = handler.bind(this);
    document.addEventListener(eventName, bound);
    this._boundHandlers.set(eventName, bound);
  }

  // ══════════════════════════════════════════════════════════════
  // Private — Timers (prune + timestamp refresh)
  // ══════════════════════════════════════════════════════════════

  _startTimers() {
    // Prune expired events every 5 seconds
    this._pruneInterval = setInterval(() => this._pruneExpired(), 5000);

    // Refresh relative timestamps every 10 seconds
    this._timeUpdateInterval = setInterval(
      () => this._refreshTimestamps(),
      10000,
    );
  }

  _pruneExpired() {
    const cutoff = Date.now() - this._fadeMs;
    const kept = [];

    for (const entry of this._events) {
      if (entry.timestamp < cutoff) {
        // Fade out and remove
        if (entry.el) {
          entry.el.classList.add("af-event--fade");
          const domEl = entry.el;
          setTimeout(() => domEl.remove(), 400);
        }
      } else {
        kept.push(entry);
      }
    }

    this._events = kept;
    this._updateCount();
  }

  _refreshTimestamps() {
    if (!this._listEl) return;

    const timeEls = this._listEl.querySelectorAll(".af-event__time[data-ts]");
    for (const el of timeEls) {
      const ts = parseInt(el.dataset.ts, 10);
      if (!isNaN(ts)) {
        el.textContent = timeAgo(ts);
      }
    }

    this._updateCount();
  }

  _updateCount() {
    if (this._countBadge) {
      const count = this._events.length;
      this._countBadge.textContent = String(count);
      this._countBadge.classList.toggle(
        "af-header__count--hidden",
        count === 0,
      );
    }
  }
}
