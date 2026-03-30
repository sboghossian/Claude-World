/**
 * timeline.js — World Timeline zone: chronological event history
 *
 * Displays every meaningful event in the world as a vertical scrollable
 * timeline with category-colored event cards, time markers, a Canvas 2D
 * activity heatmap (GitHub contribution graph style), search, filters,
 * zoom levels, and infinite scroll.
 *
 * Event categories:
 *   Tasks       (blue)   — dispatched, completed, failed
 *   Zones       (green)  — unlocked, progress milestones
 *   Agents      (purple) — relationships formed, level ups
 *   System      (gray)   — world created, snapshots, settings changed
 *   Achievements (gold)  — badges unlocked
 *   Quests      (amber)  — started, completed
 *
 * Emits:
 *   timeline:event-click  — { event }
 *   timeline:filter-change — { categories }
 *
 * Vanilla JS + CSS. Pairs with timeline.css.
 */

// ── Constants ──────────────────────────────────────────────────────────

const CATEGORIES = {
  tasks: { label: "Tasks", color: "#4a9eff", icon: "\u2611" },
  zones: { label: "Zones", color: "#4aff8a", icon: "\u25a3" },
  agents: { label: "Agents", color: "#a855f7", icon: "\u263a" },
  system: { label: "System", color: "#8888a0", icon: "\u2699" },
  achievements: { label: "Achievements", color: "#ffd700", icon: "\u2605" },
  quests: { label: "Quests", color: "#ffb84a", icon: "\u2691" },
};

const ZOOM_LEVELS = [
  { key: "hour", label: "Hour" },
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

const PAGE_SIZE = 50;

const HEATMAP_CELL = 13;
const HEATMAP_GAP = 3;
const HEATMAP_WEEKS = 26; // ~6 months

// ── Helpers ────────────────────────────────────────────────────────────

function escapeHTML(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function relativeTime(iso) {
  if (!iso) return "Unknown";
  const ms = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return "Just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toDateKey(iso) {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

function isSameDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function isYesterday(date) {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  return isSameDay(date, y);
}

function isToday(date) {
  return isSameDay(date, new Date());
}

function dateHeader(iso) {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
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

/**
 * Group events into zoom-level buckets and check visibility window.
 */
function eventMatchesZoom(iso, zoomKey) {
  // All events are shown — zoom only affects time marker grouping
  return true;
}

function getTimeMarkerLabel(iso, zoomKey) {
  const d = new Date(iso);
  switch (zoomKey) {
    case "hour":
      return d.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      });
    case "day":
      return dateHeader(iso);
    case "week": {
      const weekStart = new Date(d);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      return `Week of ${weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
    }
    case "month":
      return d.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
    default:
      return dateHeader(iso);
  }
}

function getTimeMarkerKey(iso, zoomKey) {
  const d = new Date(iso);
  switch (zoomKey) {
    case "hour":
      return `${toDateKey(iso)}-${d.getHours()}`;
    case "day":
      return toDateKey(iso);
    case "week": {
      const weekStart = new Date(d);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      return toDateKey(weekStart.toISOString());
    }
    case "month":
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    default:
      return toDateKey(iso);
  }
}

// ── Timeline class ─────────────────────────────────────────────────────

export class Timeline {
  constructor() {
    /** @type {string|number|null} */
    this._worldId = null;

    /** @type {HTMLElement|null} */
    this._root = null;

    /** @type {Array<object>} All timeline events */
    this._allEvents = [];

    /** @type {Set<string>} Active category filters */
    this._activeCategories = new Set(Object.keys(CATEGORIES));

    /** @type {string} Current zoom level */
    this._zoom = "day";

    /** @type {string} Search query */
    this._searchQuery = "";

    /** @type {number} Number of events currently rendered */
    this._renderedCount = 0;

    /** @type {IntersectionObserver|null} */
    this._scrollObserver = null;

    /** @type {object} Day -> count map for heatmap */
    this._heatmapData = {};
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

    const root = document.createElement("div");
    root.className = "timeline";
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "World Timeline");
    this._root = root;

    this._build();
    this._bindEvents();

    return root;
  }

  /**
   * Load data and render timeline.
   * @param {string|number} worldId
   */
  async init(worldId) {
    this._worldId = worldId;
    await this._fetchEvents();
    this._buildHeatmapData();
    this._drawHeatmap();
    this._renderTimeline();
  }

  /**
   * Cleanup observers.
   */
  destroy() {
    if (this._scrollObserver) {
      this._scrollObserver.disconnect();
      this._scrollObserver = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CSS injection
  // ═══════════════════════════════════════════════════════════════════════

  _injectCSS() {
    const id = "timeline-styles";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "src/zones/timeline.css";
    document.head.appendChild(link);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DOM construction
  // ═══════════════════════════════════════════════════════════════════════

  _build() {
    this._root.innerHTML = "";

    // ── Header ──
    const header = this._el("div", "timeline__header");
    const titleRow = this._el("div", "timeline__title-row");
    const title = this._el("h2", "timeline__title");
    title.textContent = "World Timeline";
    const subtitle = this._el("span", "timeline__subtitle");
    subtitle.textContent = "Every event in your world, chronologically.";
    titleRow.appendChild(title);
    titleRow.appendChild(subtitle);
    header.appendChild(titleRow);
    this._root.appendChild(header);

    // ── Heatmap section ──
    const heatmapSection = this._el("div", "timeline__heatmap-section");
    const heatmapLabel = this._el("div", "timeline__heatmap-label");
    heatmapLabel.textContent = "Activity (last 6 months)";
    heatmapSection.appendChild(heatmapLabel);

    this._heatmapCanvas = document.createElement("canvas");
    this._heatmapCanvas.className = "timeline__heatmap-canvas";
    this._heatmapCanvas.setAttribute("aria-label", "Activity heatmap");
    heatmapSection.appendChild(this._heatmapCanvas);

    this._heatmapTooltip = this._el("div", "timeline__heatmap-tooltip");
    this._heatmapTooltip.hidden = true;
    heatmapSection.appendChild(this._heatmapTooltip);

    this._root.appendChild(heatmapSection);

    // ── Controls bar ──
    const controls = this._el("div", "timeline__controls");

    // Search
    const searchWrap = this._el("div", "timeline__search-wrap");
    this._searchInput = this._el("input", "timeline__search");
    this._searchInput.type = "search";
    this._searchInput.placeholder = "Search events...";
    this._searchInput.setAttribute("aria-label", "Search timeline events");
    searchWrap.appendChild(this._searchInput);
    controls.appendChild(searchWrap);

    // Zoom controls
    const zoomGroup = this._el("div", "timeline__zoom-group");
    const zoomLabel = this._el("span", "timeline__zoom-label");
    zoomLabel.textContent = "Zoom:";
    zoomGroup.appendChild(zoomLabel);

    this._zoomBtns = {};
    for (const z of ZOOM_LEVELS) {
      const btn = this._el("button", "timeline__zoom-btn");
      btn.textContent = z.label;
      btn.dataset.zoom = z.key;
      btn.setAttribute("aria-pressed", String(z.key === this._zoom));
      if (z.key === this._zoom) btn.classList.add("timeline__zoom-btn--active");
      zoomGroup.appendChild(btn);
      this._zoomBtns[z.key] = btn;
    }
    controls.appendChild(zoomGroup);

    this._root.appendChild(controls);

    // ── Category filters ──
    const filters = this._el("div", "timeline__filters");
    filters.setAttribute("role", "group");
    filters.setAttribute("aria-label", "Filter by category");

    this._filterBtns = {};
    for (const [key, cat] of Object.entries(CATEGORIES)) {
      const btn = this._el("button", "timeline__filter-btn");
      btn.innerHTML = `<span class="timeline__filter-icon">${cat.icon}</span> ${escapeHTML(cat.label)}`;
      btn.dataset.category = key;
      btn.style.setProperty("--cat-color", cat.color);
      btn.setAttribute("aria-pressed", "true");
      btn.classList.add("timeline__filter-btn--active");
      filters.appendChild(btn);
      this._filterBtns[key] = btn;
    }
    this._root.appendChild(filters);

    // ── Stats bar ──
    this._statsEl = this._el("div", "timeline__stats");
    this._statsEl.setAttribute("aria-live", "polite");
    this._root.appendChild(this._statsEl);

    // ── Timeline container ──
    this._timelineContainer = this._el("div", "timeline__container");
    this._timelineContainer.setAttribute("role", "feed");
    this._timelineContainer.setAttribute("aria-label", "Timeline events");
    this._root.appendChild(this._timelineContainer);

    // ── Sentinel for infinite scroll ──
    this._sentinel = this._el("div", "timeline__sentinel");
    this._root.appendChild(this._sentinel);

    // ── Empty state ──
    this._emptyEl = this._el("div", "timeline__empty");
    this._emptyEl.textContent =
      "No events yet. Your world history starts here.";
    this._emptyEl.hidden = true;
    this._root.appendChild(this._emptyEl);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Event binding
  // ═══════════════════════════════════════════════════════════════════════

  _bindEvents() {
    // Category filter toggles
    for (const [key, btn] of Object.entries(this._filterBtns)) {
      btn.addEventListener("click", () => {
        if (this._activeCategories.has(key)) {
          this._activeCategories.delete(key);
          btn.setAttribute("aria-pressed", "false");
          btn.classList.remove("timeline__filter-btn--active");
        } else {
          this._activeCategories.add(key);
          btn.setAttribute("aria-pressed", "true");
          btn.classList.add("timeline__filter-btn--active");
        }
        this._renderedCount = 0;
        this._renderTimeline();

        document.dispatchEvent(
          new CustomEvent("timeline:filter-change", {
            detail: { categories: [...this._activeCategories] },
            bubbles: true,
          }),
        );
      });
    }

    // Zoom buttons
    for (const [key, btn] of Object.entries(this._zoomBtns)) {
      btn.addEventListener("click", () => {
        this._zoom = key;
        for (const [k, b] of Object.entries(this._zoomBtns)) {
          b.setAttribute("aria-pressed", String(k === key));
          b.classList.toggle("timeline__zoom-btn--active", k === key);
        }
        this._renderedCount = 0;
        this._renderTimeline();
      });
    }

    // Search
    let searchTimer = null;
    this._searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this._searchQuery = this._searchInput.value.trim().toLowerCase();
        this._renderedCount = 0;
        this._renderTimeline();
      }, 250);
    });

    // Infinite scroll via IntersectionObserver
    this._scrollObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this._loadMore();
          }
        }
      },
      { rootMargin: "200px" },
    );
    this._scrollObserver.observe(this._sentinel);

    // Heatmap hover
    this._heatmapCanvas.addEventListener("mousemove", (e) =>
      this._handleHeatmapHover(e),
    );
    this._heatmapCanvas.addEventListener("mouseleave", () => {
      this._heatmapTooltip.hidden = true;
    });

    // Event card click delegation
    this._timelineContainer.addEventListener("click", (e) => {
      const card = e.target.closest(".timeline__event-card");
      if (!card) return;
      card.classList.toggle("timeline__event-card--expanded");

      const eventIdx = card.dataset.eventIndex;
      if (eventIdx !== undefined) {
        document.dispatchEvent(
          new CustomEvent("timeline:event-click", {
            detail: { event: this._allEvents[parseInt(eventIdx, 10)] },
            bubbles: true,
          }),
        );
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Data fetching
  // ═══════════════════════════════════════════════════════════════════════

  async _fetchEvents() {
    try {
      if (window.api && window.api.db && window.api.db.getTimelineEvents) {
        const events = await window.api.db.getTimelineEvents(
          this._worldId,
          2000,
        );
        this._allEvents = Array.isArray(events) ? events : [];
      } else {
        // Fallback: aggregate from individual tables
        await this._fetchFromTables();
      }
    } catch (err) {
      console.warn("[Timeline] Failed to load events:", err);
      // Try fallback
      try {
        await this._fetchFromTables();
      } catch (e2) {
        console.warn("[Timeline] Fallback also failed:", e2);
        this._allEvents = [];
      }
    }

    // Ensure chronological descending order
    this._allEvents.sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at),
    );
  }

  async _fetchFromTables() {
    const events = [];
    const api = window.api && window.api.db;
    if (!api) return;

    const [tasks, quests, achievements, zones, agents] =
      await Promise.allSettled([
        api.getRecentTasks
          ? api.getRecentTasks(this._worldId, 500)
          : Promise.resolve([]),
        api.getQuests ? api.getQuests(this._worldId) : Promise.resolve([]),
        api.getAchievements
          ? api.getAchievements(this._worldId)
          : Promise.resolve([]),
        api.getZones ? api.getZones(this._worldId) : Promise.resolve([]),
        api.getAgents ? api.getAgents(this._worldId) : Promise.resolve([]),
      ]);

    const taskArr =
      tasks.status === "fulfilled" && tasks.value ? tasks.value : [];
    for (const t of taskArr) {
      events.push({
        category: "tasks",
        title:
          t.status === "completed"
            ? "Task Completed"
            : t.status === "failed"
              ? "Task Failed"
              : "Task Dispatched",
        description: t.prompt
          ? t.prompt.length > 120
            ? t.prompt.slice(0, 120) + "..."
            : t.prompt
          : `Task ${t.status || "dispatched"}`,
        created_at: t.created_at,
        zone_link: t.zone_id || null,
        meta: { status: t.status, model: t.model, cost: t.cost_usd },
      });
    }

    const questArr =
      quests.status === "fulfilled" && quests.value ? quests.value : [];
    for (const q of questArr) {
      events.push({
        category: "quests",
        title:
          q.status === "completed"
            ? `Quest Completed: ${q.title}`
            : `Quest Started: ${q.title}`,
        description: q.description || "",
        created_at: q.completed_at || q.created_at,
        zone_link: null,
        meta: { xp_reward: q.xp_reward, status: q.status },
      });
    }

    const achieveArr =
      achievements.status === "fulfilled" && achievements.value
        ? achievements.value
        : [];
    for (const a of achieveArr) {
      events.push({
        category: "achievements",
        title: `Achievement Unlocked: ${a.achievement_id || a.name || "Badge"}`,
        description: a.description || "A new achievement was unlocked.",
        created_at: a.unlocked_at || a.created_at,
        zone_link: null,
        meta: {},
      });
    }

    const zoneArr =
      zones.status === "fulfilled" && zones.value ? zones.value : [];
    for (const z of zoneArr) {
      if (z.unlocked) {
        events.push({
          category: "zones",
          title: `Zone Unlocked: ${z.name || z.slug}`,
          description: `The ${z.name || z.slug} zone is now accessible.`,
          created_at: z.unlocked_at || z.created_at,
          zone_link: z.slug,
          meta: { color: z.color },
        });
      }
    }

    const agentArr =
      agents.status === "fulfilled" && agents.value ? agents.value : [];
    for (const a of agentArr) {
      events.push({
        category: "agents",
        title: `Agent Joined: ${a.name}`,
        description: `${a.name} (${a.role || "agent"}) entered the world.`,
        created_at: a.created_at,
        zone_link: null,
        meta: { role: a.role, state: a.state },
      });
    }

    this._allEvents = events;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Heatmap
  // ═══════════════════════════════════════════════════════════════════════

  _buildHeatmapData() {
    this._heatmapData = {};
    for (const evt of this._allEvents) {
      const key = toDateKey(evt.created_at);
      if (!key) continue;
      this._heatmapData[key] = (this._heatmapData[key] || 0) + 1;
    }
  }

  _drawHeatmap() {
    const canvas = this._heatmapCanvas;
    if (!canvas) return;

    const cellSize = HEATMAP_CELL;
    const gap = HEATMAP_GAP;
    const weeks = HEATMAP_WEEKS;
    const rows = 7; // days of week

    const w = weeks * (cellSize + gap) + gap + 30; // extra for day labels
    const h = rows * (cellSize + gap) + gap + 20; // extra for month labels

    const ctx = setupCanvas(canvas, w, h);
    ctx.clearRect(0, 0, w, h);

    // Find max count for color intensity
    const counts = Object.values(this._heatmapData);
    const maxCount = Math.max(1, ...counts);

    // Day labels
    const dayLabels = ["", "Mon", "", "Wed", "", "Fri", ""];
    ctx.fillStyle = "#8888a0";
    ctx.font = "10px Inter, sans-serif";
    ctx.textAlign = "right";
    for (let r = 0; r < rows; r++) {
      if (dayLabels[r]) {
        ctx.fillText(
          dayLabels[r],
          26,
          20 + r * (cellSize + gap) + cellSize - 2,
        );
      }
    }

    // Calculate start date (HEATMAP_WEEKS weeks ago, aligned to Sunday)
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - weeks * 7 + (7 - today.getDay()));

    // Store cell positions for hover detection
    this._heatmapCells = [];

    let prevMonth = -1;
    ctx.textAlign = "center";

    for (let col = 0; col < weeks; col++) {
      for (let row = 0; row < rows; row++) {
        const cellDate = new Date(startDate);
        cellDate.setDate(cellDate.getDate() + col * 7 + row);

        // Don't draw future dates
        if (cellDate > today) continue;

        const dateKey = cellDate.toISOString().slice(0, 10);
        const count = this._heatmapData[dateKey] || 0;

        const x = 30 + col * (cellSize + gap);
        const y = 20 + row * (cellSize + gap);

        // Month label at top
        const month = cellDate.getMonth();
        if (row === 0 && month !== prevMonth) {
          ctx.fillStyle = "#8888a0";
          ctx.font = "10px Inter, sans-serif";
          ctx.fillText(
            cellDate.toLocaleDateString(undefined, { month: "short" }),
            x + cellSize / 2,
            12,
          );
          prevMonth = month;
        }

        // Cell color
        if (count === 0) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
        } else {
          const intensity = Math.min(count / maxCount, 1);
          const alpha = 0.15 + intensity * 0.85;
          ctx.fillStyle = `rgba(74, 158, 255, ${alpha})`;
        }

        ctx.beginPath();
        ctx.roundRect(x, y, cellSize, cellSize, 2);
        ctx.fill();

        this._heatmapCells.push({
          x,
          y,
          w: cellSize,
          h: cellSize,
          date: dateKey,
          count,
        });
      }
    }
  }

  _handleHeatmapHover(e) {
    if (!this._heatmapCells) return;

    const rect = this._heatmapCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    for (const cell of this._heatmapCells) {
      if (
        mx >= cell.x &&
        mx <= cell.x + cell.w &&
        my >= cell.y &&
        my <= cell.y + cell.h
      ) {
        this._heatmapTooltip.textContent = `${cell.date}: ${cell.count} event${cell.count !== 1 ? "s" : ""}`;
        this._heatmapTooltip.style.left = cell.x + cell.w / 2 + "px";
        this._heatmapTooltip.style.top = cell.y - 8 + "px";
        this._heatmapTooltip.hidden = false;
        return;
      }
    }

    this._heatmapTooltip.hidden = true;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Filtering & rendering
  // ═══════════════════════════════════════════════════════════════════════

  _filteredEvents() {
    let events = this._allEvents;

    // Category filter
    if (this._activeCategories.size < Object.keys(CATEGORIES).length) {
      events = events.filter((e) => this._activeCategories.has(e.category));
    }

    // Search filter
    if (this._searchQuery) {
      const q = this._searchQuery;
      events = events.filter((e) => {
        const searchable = [e.title, e.description, e.category]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchable.includes(q);
      });
    }

    return events;
  }

  _renderTimeline() {
    const events = this._filteredEvents();

    this._timelineContainer.innerHTML = "";
    this._renderedCount = Math.min(PAGE_SIZE, events.length);

    // Update stats
    this._updateStats(events.length);

    if (events.length === 0) {
      this._emptyEl.hidden = false;
      this._emptyEl.textContent = this._searchQuery
        ? "No events match your search."
        : "No events yet. Your world history starts here.";
      return;
    }

    this._emptyEl.hidden = true;
    this._appendEvents(events, 0, this._renderedCount);
  }

  _loadMore() {
    const events = this._filteredEvents();
    if (this._renderedCount >= events.length) return;

    const start = this._renderedCount;
    const end = Math.min(start + PAGE_SIZE, events.length);
    this._renderedCount = end;
    this._appendEvents(events, start, end);
  }

  _appendEvents(events, start, end) {
    const frag = document.createDocumentFragment();
    let lastMarkerKey = null;

    // If appending, get the last marker from existing content
    if (start > 0 && start - 1 >= 0) {
      lastMarkerKey = getTimeMarkerKey(
        events[start - 1].created_at,
        this._zoom,
      );
    }

    for (let i = start; i < end; i++) {
      const event = events[i];
      const markerKey = getTimeMarkerKey(event.created_at, this._zoom);

      // Insert time marker if new group
      if (markerKey !== lastMarkerKey) {
        const marker = this._buildTimeMarker(event.created_at);
        frag.appendChild(marker);
        lastMarkerKey = markerKey;
      }

      frag.appendChild(this._buildEventCard(event, i));
    }

    this._timelineContainer.appendChild(frag);
  }

  _buildTimeMarker(iso) {
    const marker = this._el("div", "timeline__time-marker");
    const badge = this._el("span", "timeline__time-badge");
    badge.textContent = getTimeMarkerLabel(iso, this._zoom);
    marker.appendChild(badge);
    return marker;
  }

  _buildEventCard(event, index) {
    const card = this._el("div", "timeline__event-card");
    card.setAttribute("role", "article");
    card.setAttribute("tabindex", "0");
    card.dataset.eventIndex = String(index);
    card.dataset.category = event.category;

    const cat = CATEGORIES[event.category] || CATEGORIES.system;
    card.style.setProperty("--card-accent", cat.color);

    // Icon
    const iconEl = this._el("span", "timeline__event-icon");
    iconEl.textContent = cat.icon;
    iconEl.style.backgroundColor = cat.color + "20";
    iconEl.style.color = cat.color;

    // Content
    const content = this._el("div", "timeline__event-content");

    const titleRow = this._el("div", "timeline__event-title-row");
    const titleEl = this._el("span", "timeline__event-title");
    titleEl.textContent = event.title || "Event";
    const timeEl = this._el("time", "timeline__event-time");
    timeEl.setAttribute("datetime", event.created_at || "");
    timeEl.textContent = relativeTime(event.created_at);
    timeEl.title = formatDateTime(event.created_at);
    titleRow.appendChild(titleEl);
    titleRow.appendChild(timeEl);

    const descEl = this._el("div", "timeline__event-desc");
    descEl.textContent = event.description || "";

    content.appendChild(titleRow);
    content.appendChild(descEl);

    // Zone link
    if (event.zone_link) {
      const link = this._el("span", "timeline__event-zone-link");
      link.textContent = event.zone_link;
      link.dataset.zone = event.zone_link;
      content.appendChild(link);
    }

    // Detail panel (shown on expand)
    const detail = this._el("div", "timeline__event-detail");
    if (event.meta) {
      for (const [key, val] of Object.entries(event.meta)) {
        if (val === null || val === undefined || val === "") continue;
        const row = this._el("div", "timeline__detail-row");
        const label = this._el("span", "timeline__detail-label");
        label.textContent = key;
        const value = this._el("span", "timeline__detail-value");
        value.textContent =
          typeof val === "number" && key === "cost"
            ? `$${val.toFixed(4)}`
            : String(val);
        row.appendChild(label);
        row.appendChild(value);
        detail.appendChild(row);
      }
    }
    const fullTimeRow = this._el("div", "timeline__detail-row");
    const fullTimeLabel = this._el("span", "timeline__detail-label");
    fullTimeLabel.textContent = "Exact time";
    const fullTimeValue = this._el("span", "timeline__detail-value");
    fullTimeValue.textContent = formatDateTime(event.created_at);
    fullTimeRow.appendChild(fullTimeLabel);
    fullTimeRow.appendChild(fullTimeValue);
    detail.appendChild(fullTimeRow);

    content.appendChild(detail);

    // Category badge
    const badge = this._el("span", "timeline__event-badge");
    badge.textContent = cat.label;
    badge.style.color = cat.color;
    badge.style.borderColor = cat.color + "40";

    // Assemble card
    card.appendChild(iconEl);
    card.appendChild(content);
    card.appendChild(badge);

    return card;
  }

  _updateStats(filteredCount) {
    const total = this._allEvents.length;
    const catCounts = {};
    for (const key of Object.keys(CATEGORIES)) catCounts[key] = 0;
    for (const evt of this._allEvents) {
      if (catCounts[evt.category] !== undefined) catCounts[evt.category]++;
    }

    const parts = [];
    parts.push(`${filteredCount} of ${total} events`);
    for (const [key, cat] of Object.entries(CATEGORIES)) {
      if (catCounts[key] > 0) {
        parts.push(`${catCounts[key]} ${cat.label.toLowerCase()}`);
      }
    }
    this._statsEl.textContent = parts.join(" \u00b7 ");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Utility
  // ═══════════════════════════════════════════════════════════════════════

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
