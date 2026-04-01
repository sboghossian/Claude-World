/**
 * live-sessions.js — Live Claude Code Sessions zone
 *
 * Displays real-time Claude Code CLI sessions detected on the user's machine.
 * Session cards show PID, working directory, CPU/memory, model, status, and uptime.
 * Includes a 24h timeline and aggregate stats.
 *
 * @module LiveSessions
 */

// Load styles
const _styleLink = document.createElement("link");
_styleLink.rel = "stylesheet";
_styleLink.href = "../zones/live-sessions.css";
if (!document.querySelector('link[href*="live-sessions.css"]')) {
  document.head.appendChild(_styleLink);
}

// ── Helpers ──────────────────────────────────────────────────────────────

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function shortPath(fullPath) {
  if (!fullPath) return "unknown";
  const home = "~";
  const homePath =
    typeof process !== "undefined"
      ? process.env?.HOME
      : fullPath.match(/^\/Users\/[^/]+/)?.[0];
  if (homePath && fullPath.startsWith(homePath)) {
    return home + fullPath.slice(homePath.length);
  }
  // Truncate to last 3 segments
  const parts = fullPath.split("/").filter(Boolean);
  if (parts.length > 3) {
    return ".../" + parts.slice(-3).join("/");
  }
  return fullPath;
}

function formatUptime(firstSeenMs) {
  if (!firstSeenMs) return "--";
  const elapsed = Date.now() - firstSeenMs;
  const secs = Math.floor(elapsed / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

function formatTime(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ── Cost estimate (rough, based on token count) ──────────────────────────

const COST_PER_1K_TOKENS = 0.003; // rough average

function estimateCost(tokens) {
  return (tokens / 1000) * COST_PER_1K_TOKENS;
}

// ── Session tracking for timeline ────────────────────────────────────────

/** @type {Array<{pid:number, start:number, end:number|null}>} */
let _sessionTimeline = [];

function updateTimeline(sessions) {
  const now = Date.now();
  const activePids = new Set(sessions.map((s) => s.pid));

  // Close ended sessions
  for (const entry of _sessionTimeline) {
    if (!entry.end && !activePids.has(entry.pid)) {
      entry.end = now;
    }
  }

  // Add new sessions
  for (const s of sessions) {
    if (!_sessionTimeline.find((e) => e.pid === s.pid)) {
      _sessionTimeline.push({
        pid: s.pid,
        start: s.firstSeen || now,
        end: null,
      });
    }
  }

  // Prune entries older than 24h
  const cutoff = now - 24 * 60 * 60 * 1000;
  _sessionTimeline = _sessionTimeline.filter(
    (e) => (e.end || now) > cutoff && e.start > cutoff - 60 * 60 * 1000,
  );
}

// ── LiveSessions class ──────────────────────────────────────────────────

export class LiveSessions {
  constructor() {
    this._root = null;
    this._cardsContainer = null;
    this._statsEl = null;
    this._timelineEl = null;
    this._historyEl = null;
    this._sessions = [];
    this._unsubscribe = null;
    this._refreshTimer = null;
  }

  /**
   * Build the DOM tree. Call once, returns the root element.
   * @returns {HTMLElement}
   */
  render() {
    this._root = el("div", "live-sessions");

    // ── Aggregate stats ──────────────────────────────────────────
    this._statsEl = el("div", "live-sessions__stats");
    this._root.appendChild(this._statsEl);
    this._renderStats([]);

    // ── Active sessions section ──────────────────────────────────
    const activeTitle = el(
      "div",
      "live-sessions__section-title",
      "Active Sessions",
    );
    this._root.appendChild(activeTitle);

    this._cardsContainer = el("div", "live-sessions__cards");
    this._root.appendChild(this._cardsContainer);
    this._renderEmpty();

    // ── Timeline section ─────────────────────────────────────────
    const timelineTitle = el(
      "div",
      "live-sessions__section-title",
      "24h Timeline",
    );
    this._root.appendChild(timelineTitle);

    this._timelineEl = el("div", "live-sessions__timeline");
    this._root.appendChild(this._timelineEl);

    // ── Recent history section ───────────────────────────────────
    const historyTitle = el(
      "div",
      "live-sessions__section-title",
      "Recent Session Files",
    );
    this._root.appendChild(historyTitle);

    this._historyEl = el("div", "live-sessions__history");
    this._root.appendChild(this._historyEl);

    return this._root;
  }

  /**
   * Initialize: fetch sessions, subscribe to updates.
   * @param {number} worldId
   */
  async init(worldId) {
    // Fetch initial data
    try {
      if (window.api?.sessions?.getActive) {
        const sessions = await window.api.sessions.getActive();
        this._updateSessions(sessions || []);
      }
    } catch (err) {
      console.warn(
        "[LiveSessions] Failed to get initial sessions:",
        err.message,
      );
    }

    // Load history
    try {
      if (window.api?.sessions?.getHistory) {
        const history = await window.api.sessions.getHistory();
        this._renderHistory(history || []);
      }
    } catch (err) {
      console.warn(
        "[LiveSessions] Failed to get session history:",
        err.message,
      );
    }

    // Subscribe to live updates
    if (window.api?.sessions?.onUpdate) {
      this._unsubscribe = window.api.sessions.onUpdate((sessions) => {
        this._updateSessions(sessions || []);
      });
    }

    // Also do a periodic refresh of the uptime display
    this._refreshTimer = setInterval(() => {
      if (this._sessions.length > 0) {
        this._renderCards(this._sessions);
      }
    }, 5000);
  }

  /**
   * Clean up subscriptions.
   */
  destroy() {
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
    if (this._refreshTimer) {
      clearInterval(this._refreshTimer);
      this._refreshTimer = null;
    }
  }

  // ── Internal rendering ──────────────────────────────────────────────────

  _updateSessions(sessions) {
    this._sessions = sessions;
    updateTimeline(sessions);
    this._renderStats(sessions);
    this._renderCards(sessions);
    this._renderTimeline();
  }

  _renderStats(sessions) {
    if (!this._statsEl) return;
    this._statsEl.innerHTML = "";

    const totalActive = sessions.length;
    const totalTokens = sessions.reduce((sum, s) => sum + (s.tokens || 0), 0);
    const totalCost = estimateCost(totalTokens);

    const stats = [
      { value: totalActive, label: "Active" },
      {
        value: totalTokens > 0 ? `${(totalTokens / 1000).toFixed(1)}k` : "0",
        label: "Tokens",
      },
      { value: `$${totalCost.toFixed(2)}`, label: "Est. Cost" },
    ];

    for (const stat of stats) {
      const card = el("div", "live-sessions__stat-card");
      card.appendChild(
        el("div", "live-sessions__stat-value", String(stat.value)),
      );
      card.appendChild(el("div", "live-sessions__stat-label", stat.label));
      this._statsEl.appendChild(card);
    }
  }

  _renderCards(sessions) {
    if (!this._cardsContainer) return;
    this._cardsContainer.innerHTML = "";

    if (sessions.length === 0) {
      this._renderEmpty();
      return;
    }

    for (const session of sessions) {
      this._cardsContainer.appendChild(this._buildCard(session));
    }
  }

  _buildCard(session) {
    const statusClass = `live-sessions__card--${session.status}`;
    const card = el("div", `live-sessions__card ${statusClass}`);

    // Header: status dot + PID + status badge
    const header = el("div", "live-sessions__card-header");

    const dot = el(
      "div",
      `live-sessions__status-dot live-sessions__status-dot--${session.status}`,
    );
    header.appendChild(dot);

    header.appendChild(el("span", "live-sessions__pid", `PID ${session.pid}`));

    // Streaming dots
    if (session.status === "streaming") {
      const dots = el("span", "live-sessions__streaming-dots");
      dots.appendChild(el("span"));
      dots.appendChild(el("span"));
      dots.appendChild(el("span"));
      header.appendChild(dots);
    }

    const badge = el(
      "span",
      `live-sessions__status-badge live-sessions__status-badge--${session.status}`,
      session.status,
    );
    header.appendChild(badge);

    card.appendChild(header);

    // Working directory
    card.appendChild(el("div", "live-sessions__cwd", shortPath(session.cwd)));

    // Model
    if (session.model) {
      const modelEl = el("div", "live-sessions__model");
      modelEl.innerHTML = `Model: <span>${session.model}</span>`;
      card.appendChild(modelEl);
    }

    // CPU / Memory bars
    const bars = el("div", "live-sessions__bars");

    // CPU bar
    const cpuGroup = el("div", "live-sessions__bar-group");
    const cpuLabel = el("div", "live-sessions__bar-label");
    cpuLabel.innerHTML = `<span>CPU</span><span>${session.cpu.toFixed(1)}%</span>`;
    cpuGroup.appendChild(cpuLabel);
    const cpuTrack = el("div", "live-sessions__bar-track");
    const cpuFill = el(
      "div",
      "live-sessions__bar-fill live-sessions__bar-fill--cpu",
    );
    cpuFill.style.width = `${Math.min(100, session.cpu)}%`;
    cpuTrack.appendChild(cpuFill);
    cpuGroup.appendChild(cpuTrack);
    bars.appendChild(cpuGroup);

    // Memory bar
    const memGroup = el("div", "live-sessions__bar-group");
    const memLabel = el("div", "live-sessions__bar-label");
    memLabel.innerHTML = `<span>MEM</span><span>${session.mem.toFixed(1)}%</span>`;
    memGroup.appendChild(memLabel);
    const memTrack = el("div", "live-sessions__bar-track");
    const memFill = el(
      "div",
      "live-sessions__bar-fill live-sessions__bar-fill--mem",
    );
    memFill.style.width = `${Math.min(100, session.mem)}%`;
    memTrack.appendChild(memFill);
    memGroup.appendChild(memTrack);
    bars.appendChild(memGroup);

    card.appendChild(bars);

    // Task snippet
    if (session.task) {
      card.appendChild(el("div", "live-sessions__task-snippet", session.task));
    }

    // Footer: uptime
    const footer = el("div", "live-sessions__card-footer");
    footer.appendChild(
      el(
        "span",
        "live-sessions__uptime",
        `Uptime: ${formatUptime(session.firstSeen)}`,
      ),
    );
    card.appendChild(footer);

    return card;
  }

  _renderEmpty() {
    if (!this._cardsContainer) return;
    this._cardsContainer.innerHTML = "";

    const empty = el("div", "live-sessions__empty");
    empty.appendChild(el("div", "live-sessions__empty-icon", "\u{1F4BB}"));
    empty.appendChild(
      el("div", "live-sessions__empty-title", "No Active Sessions"),
    );
    empty.appendChild(
      el(
        "div",
        "live-sessions__empty-hint",
        "Start a Claude Code session in your terminal to see it here.",
      ),
    );
    empty.appendChild(el("div", "live-sessions__empty-code", "$ claude"));

    this._cardsContainer.appendChild(empty);
  }

  _renderTimeline() {
    if (!this._timelineEl) return;
    this._timelineEl.innerHTML = "";

    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const totalMs = now - dayAgo;

    const track = el("div", "live-sessions__timeline-track");

    for (const entry of _sessionTimeline) {
      const start = Math.max(entry.start, dayAgo);
      const end = entry.end || now;
      const leftPct = ((start - dayAgo) / totalMs) * 100;
      const widthPct = ((end - start) / totalMs) * 100;

      if (widthPct < 0.2) continue; // too small to render

      const bar = el("div", "live-sessions__timeline-bar");
      bar.style.left = `${leftPct}%`;
      bar.style.width = `${Math.max(widthPct, 1)}%`;
      bar.textContent = `PID ${entry.pid}`;
      track.appendChild(bar);
    }

    this._timelineEl.appendChild(track);

    // Time labels
    const labels = el("div", "live-sessions__timeline-labels");
    labels.appendChild(el("span", null, formatTime(dayAgo)));
    labels.appendChild(el("span", null, formatTime(dayAgo + totalMs / 2)));
    labels.appendChild(el("span", null, formatTime(now)));
    this._timelineEl.appendChild(labels);
  }

  _renderHistory(history) {
    if (!this._historyEl) return;
    this._historyEl.innerHTML = "";

    if (!history || history.length === 0) {
      this._historyEl.appendChild(
        el(
          "div",
          "live-sessions__history-item",
          "No recent session files found",
        ),
      );
      return;
    }

    for (const item of history.slice(0, 10)) {
      const row = el("div", "live-sessions__history-item");
      row.appendChild(
        el("span", "live-sessions__history-time", formatTime(item.mtime)),
      );
      row.appendChild(
        el("span", "live-sessions__history-file", shortPath(item.file)),
      );
      this._historyEl.appendChild(row);
    }
  }
}
