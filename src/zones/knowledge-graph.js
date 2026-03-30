/**
 * knowledge-graph.js — Knowledge Graph / Network Visualization zone
 *
 * Force-directed graph rendered with Canvas 2D. Nodes represent zones,
 * agents, tasks, skills, and knowledge entries; edges show relationships.
 *
 * All rendering uses the Canvas 2D API — no external libraries.
 *
 * Node types:
 *   Zones      — hexagon, blue
 *   Agents     — circle, purple
 *   Tasks      — small dot, green
 *   Skills     — diamond, amber
 *   Knowledge  — square, cyan
 *
 * Public API:
 *   render()              → HTMLElement
 *   async init(worldId)   — fetch data, build graph, start simulation
 *   destroy()             — stop animation, remove listeners
 */

// ── Constants ──────────────────────────────────────────────────────────

const NODE_TYPES = {
  zone: { shape: "hexagon", color: "#3b82f6", label: "Zone", radius: 18 },
  agent: { shape: "circle", color: "#a855f7", label: "Agent", radius: 14 },
  task: { shape: "dot", color: "#22c55e", label: "Task", radius: 6 },
  skill: { shape: "diamond", color: "#f59e0b", label: "Skill", radius: 12 },
  knowledge: {
    shape: "square",
    color: "#22d3ee",
    label: "Knowledge",
    radius: 11,
  },
};

const EDGE_COLOR = "rgba(255,255,255,0.08)";
const EDGE_HIGHLIGHT = "rgba(255,255,255,0.35)";
const EDGE_DIM = "rgba(255,255,255,0.03)";
const LABEL_FONT = "10px Inter, -apple-system, sans-serif";
const FPS_INTERVAL = 1000 / 30; // 30 fps cap
const SEARCH_HIGHLIGHT = "#ffd700";

// Physics defaults
const DEFAULT_GRAVITY = 0.02;
const DEFAULT_REPULSION = 800;
const DEFAULT_LINK_DIST = 120;
const DAMPING = 0.92;
const MIN_VELOCITY = 0.01;

// ── Helpers ────────────────────────────────────────────────────────────

function dpr() {
  return window.devicePixelRatio || 1;
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function escHtml(s) {
  if (!s) return "";
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function truncate(s, max = 24) {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "\u2026" : s;
}

// ── KnowledgeGraph class ───────────────────────────────────────────────

export class KnowledgeGraph {
  constructor() {
    /** @type {string|number|null} */
    this._worldId = null;

    /** @type {HTMLElement|null} */
    this._el = null;

    /** @type {HTMLCanvasElement|null} */
    this._canvas = null;

    /** @type {CanvasRenderingContext2D|null} */
    this._ctx = null;

    /** @type {{ id: string, type: string, label: string, x: number, y: number, vx: number, vy: number, meta?: object }[]} */
    this._nodes = [];

    /** @type {{ source: string, target: string }[]} */
    this._edges = [];

    /** @type {Map<string, object>} id → node */
    this._nodeMap = new Map();

    // Interaction state
    this._dragNode = null;
    this._panStart = null;
    this._panOffset = { x: 0, y: 0 };
    this._hoveredNode = null;
    this._selectedNode = null;
    this._zoom = 1;

    // Filters — all visible by default
    this._filters = {
      zone: true,
      agent: true,
      task: true,
      skill: true,
      knowledge: true,
    };

    // Search
    this._searchQuery = "";

    // Physics tunables
    this._gravity = DEFAULT_GRAVITY;
    this._repulsion = DEFAULT_REPULSION;
    this._linkDist = DEFAULT_LINK_DIST;

    // Animation
    this._rafId = null;
    this._lastFrame = 0;
    this._running = false;

    // Bound handlers (for removal)
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
    this._onWheel = this._handleWheel.bind(this);
    this._onResize = this._handleResize.bind(this);
    this._onDblClick = this._handleDblClick.bind(this);
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
    el.className = "kg-zone";
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Knowledge Graph");
    this._el = el;

    // Canvas
    const canvas = document.createElement("canvas");
    canvas.className = "kg-canvas";
    this._canvas = canvas;
    el.appendChild(canvas);

    // Search bar
    el.insertAdjacentHTML("beforeend", this._buildSearchHTML());

    // Filter bar
    el.insertAdjacentHTML("beforeend", this._buildFilterHTML());

    // Physics panel
    el.insertAdjacentHTML("beforeend", this._buildPhysicsHTML());

    // Legend
    el.insertAdjacentHTML("beforeend", this._buildLegendHTML());

    // Tooltip
    const tooltip = document.createElement("div");
    tooltip.className = "kg-tooltip";
    this._tooltip = tooltip;
    el.appendChild(tooltip);

    // Sidebar
    el.insertAdjacentHTML("beforeend", this._buildSidebarHTML());

    // Empty state
    el.insertAdjacentHTML(
      "beforeend",
      `<div class="kg-empty" style="display:none;" data-ref="empty">
        <div class="kg-empty-icon">\u26A1</div>
        <div>No graph data yet.<br>Add zones, agents, or tasks to visualise.</div>
      </div>`,
    );

    // Wire events
    this._wireEvents();

    return el;
  }

  /**
   * Fetch world data and start the simulation.
   * @param {string|number} worldId
   */
  async init(worldId) {
    this._worldId = worldId;
    await this._fetchGraphData();
    this._layoutInitial();
    this._startSimulation();
  }

  /**
   * Stop animation, remove listeners.
   */
  destroy() {
    this._running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    if (this._canvas) {
      this._canvas.removeEventListener("mousedown", this._onMouseDown);
      this._canvas.removeEventListener("mousemove", this._onMouseMove);
      this._canvas.removeEventListener("mouseup", this._onMouseUp);
      this._canvas.removeEventListener("wheel", this._onWheel);
      this._canvas.removeEventListener("dblclick", this._onDblClick);
    }
    window.removeEventListener("resize", this._onResize);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CSS injection
  // ═══════════════════════════════════════════════════════════════════════

  _injectCSS() {
    const id = "knowledge-graph-styles";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "src/zones/knowledge-graph.css";
    document.head.appendChild(link);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HTML builders
  // ═══════════════════════════════════════════════════════════════════════

  _buildSearchHTML() {
    return `
      <div class="kg-search-bar">
        <span class="kg-search-icon">\uD83D\uDD0D</span>
        <input class="kg-search-input" type="text"
               placeholder="Search nodes\u2026" data-ref="search" />
      </div>`;
  }

  _buildFilterHTML() {
    const btns = Object.entries(NODE_TYPES)
      .map(
        ([key, cfg]) => `
      <button class="kg-filter-btn active" data-type="${key}">
        <span class="kg-filter-dot" style="background:${cfg.color}"></span>
        ${cfg.label}
      </button>
    `,
      )
      .join("");
    return `<div class="kg-filter-bar">${btns}</div>`;
  }

  _buildPhysicsHTML() {
    return `
      <div class="kg-physics-panel">
        <div class="kg-physics-title">Physics</div>
        <div class="kg-slider-row">
          <span class="kg-slider-label">Gravity</span>
          <input class="kg-slider" type="range" min="0" max="100" value="20"
                 data-param="gravity" />
          <span class="kg-slider-value" data-val="gravity">0.02</span>
        </div>
        <div class="kg-slider-row">
          <span class="kg-slider-label">Repulsion</span>
          <input class="kg-slider" type="range" min="100" max="3000" value="800"
                 data-param="repulsion" />
          <span class="kg-slider-value" data-val="repulsion">800</span>
        </div>
        <div class="kg-slider-row">
          <span class="kg-slider-label">Link dist</span>
          <input class="kg-slider" type="range" min="40" max="400" value="120"
                 data-param="linkDist" />
          <span class="kg-slider-value" data-val="linkDist">120</span>
        </div>
      </div>`;
  }

  _buildLegendHTML() {
    const items = Object.entries(NODE_TYPES)
      .map(([, cfg]) => {
        let svg;
        switch (cfg.shape) {
          case "hexagon":
            svg = `<svg class="kg-legend-shape" viewBox="0 0 10 10"><polygon points="5,0 9.3,2.5 9.3,7.5 5,10 0.7,7.5 0.7,2.5" fill="${cfg.color}"/></svg>`;
            break;
          case "circle":
            svg = `<svg class="kg-legend-shape" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4.5" fill="${cfg.color}"/></svg>`;
            break;
          case "dot":
            svg = `<svg class="kg-legend-shape" viewBox="0 0 10 10"><circle cx="5" cy="5" r="3" fill="${cfg.color}"/></svg>`;
            break;
          case "diamond":
            svg = `<svg class="kg-legend-shape" viewBox="0 0 10 10"><polygon points="5,0 10,5 5,10 0,5" fill="${cfg.color}"/></svg>`;
            break;
          case "square":
            svg = `<svg class="kg-legend-shape" viewBox="0 0 10 10"><rect x="1" y="1" width="8" height="8" rx="1" fill="${cfg.color}"/></svg>`;
            break;
        }
        return `<div class="kg-legend-item">${svg}<span>${cfg.label}</span></div>`;
      })
      .join("");
    return `<div class="kg-legend">${items}</div>`;
  }

  _buildSidebarHTML() {
    return `
      <div class="kg-sidebar" data-ref="sidebar">
        <div class="kg-sidebar-header">
          <span class="kg-sidebar-title" data-ref="sidebar-title">Node Details</span>
          <button class="kg-sidebar-close" data-ref="sidebar-close">\u2715</button>
        </div>
        <div class="kg-sidebar-body" data-ref="sidebar-body"></div>
      </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Event wiring
  // ═══════════════════════════════════════════════════════════════════════

  _wireEvents() {
    const el = this._el;

    // Canvas interactions
    this._canvas.addEventListener("mousedown", this._onMouseDown);
    this._canvas.addEventListener("mousemove", this._onMouseMove);
    this._canvas.addEventListener("mouseup", this._onMouseUp);
    this._canvas.addEventListener("mouseleave", this._onMouseUp);
    this._canvas.addEventListener("wheel", this._onWheel, { passive: false });
    this._canvas.addEventListener("dblclick", this._onDblClick);
    window.addEventListener("resize", this._onResize);

    // Filter buttons
    el.querySelectorAll(".kg-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.type;
        this._filters[type] = !this._filters[type];
        btn.classList.toggle("active", this._filters[type]);
      });
    });

    // Physics sliders
    el.querySelectorAll(".kg-slider").forEach((slider) => {
      slider.addEventListener("input", () => {
        const param = slider.dataset.param;
        const val = Number(slider.value);
        const display = el.querySelector(`[data-val="${param}"]`);
        if (param === "gravity") {
          this._gravity = val / 1000;
          if (display) display.textContent = this._gravity.toFixed(3);
        } else if (param === "repulsion") {
          this._repulsion = val;
          if (display) display.textContent = String(val);
        } else if (param === "linkDist") {
          this._linkDist = val;
          if (display) display.textContent = String(val);
        }
      });
    });

    // Search
    const searchInput = el.querySelector('[data-ref="search"]');
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        this._searchQuery = searchInput.value.trim().toLowerCase();
      });
    }

    // Sidebar close
    const closeBtn = el.querySelector('[data-ref="sidebar-close"]');
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        this._selectedNode = null;
        el.querySelector('[data-ref="sidebar"]').classList.remove("open");
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Data fetching
  // ═══════════════════════════════════════════════════════════════════════

  async _fetchGraphData() {
    this._nodes = [];
    this._edges = [];
    this._nodeMap.clear();

    const db = window.api?.db;
    if (!db) {
      this._showEmpty(true);
      return;
    }

    const wid = this._worldId;

    // Fetch all entity types in parallel, gracefully degrading
    const [zones, agents, tasks, skills, knowledge] = await Promise.all([
      db.getZones ? db.getZones(wid).catch(() => []) : Promise.resolve([]),
      db.getAgents ? db.getAgents(wid).catch(() => []) : Promise.resolve([]),
      db.getTasks
        ? db.getTasks(wid, { limit: 200 }).catch(() => [])
        : Promise.resolve([]),
      db.getSkills ? db.getSkills(wid).catch(() => []) : Promise.resolve([]),
      db.getKnowledge
        ? db.getKnowledge(wid).catch(() => [])
        : db.getBrainEntries
          ? db.getBrainEntries(wid).catch(() => [])
          : Promise.resolve([]),
    ]);

    // Build zone nodes
    for (const z of zones || []) {
      const id = `zone:${z.id || z.key || z.name}`;
      this._addNode(id, "zone", z.name || z.key || "Zone", { raw: z });
    }

    // Build agent nodes + edges to their zone
    for (const a of agents || []) {
      const id = `agent:${a.id || a.name}`;
      this._addNode(id, "agent", a.name || "Agent", { raw: a });
      // Edge: agent → zone
      if (a.zone_key || a.zone || a.zoneKey) {
        const zoneRef = a.zone_key || a.zone || a.zoneKey;
        const zoneId = this._findNodeId("zone", zoneRef);
        if (zoneId) this._edges.push({ source: id, target: zoneId });
      }
    }

    // Build task nodes + edges
    for (const t of tasks || []) {
      const id = `task:${t.id}`;
      const label = truncate(
        t.prompt || t.description || t.title || `Task #${t.id}`,
        20,
      );
      this._addNode(id, "task", label, { raw: t });
      // Edge: task → zone
      if (t.zone_key || t.zone || t.zoneKey) {
        const zoneRef = t.zone_key || t.zone || t.zoneKey;
        const zoneId = this._findNodeId("zone", zoneRef);
        if (zoneId) this._edges.push({ source: id, target: zoneId });
      }
      // Edge: task → agent
      if (t.agent_id || t.agentId || t.agent) {
        const agentRef = String(t.agent_id || t.agentId || t.agent);
        const agentId = this._findNodeId("agent", agentRef);
        if (agentId) this._edges.push({ source: id, target: agentId });
      }
    }

    // Build skill nodes + edges to agents
    for (const s of skills || []) {
      const id = `skill:${s.id || s.name}`;
      this._addNode(id, "skill", s.name || s.skill || "Skill", { raw: s });
      if (s.agent_id || s.agentId || s.agent) {
        const agentRef = String(s.agent_id || s.agentId || s.agent);
        const agentId = this._findNodeId("agent", agentRef);
        if (agentId) this._edges.push({ source: id, target: agentId });
      }
    }

    // Build knowledge nodes
    for (const k of knowledge || []) {
      const id = `knowledge:${k.id || k.key}`;
      this._addNode(id, "knowledge", k.title || k.key || "Entry", { raw: k });
    }

    this._showEmpty(this._nodes.length === 0);
  }

  _addNode(id, type, label, meta = {}) {
    if (this._nodeMap.has(id)) return;
    const node = { id, type, label, x: 0, y: 0, vx: 0, vy: 0, ...meta };
    this._nodes.push(node);
    this._nodeMap.set(id, node);
  }

  _findNodeId(type, ref) {
    const direct = `${type}:${ref}`;
    if (this._nodeMap.has(direct)) return direct;
    // Fuzzy match on label
    for (const [id, n] of this._nodeMap) {
      if (n.type === type && (n.label === ref || id.endsWith(`:${ref}`)))
        return id;
    }
    return null;
  }

  _showEmpty(show) {
    const el = this._el?.querySelector('[data-ref="empty"]');
    if (el) el.style.display = show ? "" : "none";
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Initial layout — place nodes in a circle
  // ═══════════════════════════════════════════════════════════════════════

  _layoutInitial() {
    const W = this._canvas?.parentElement?.clientWidth || 800;
    const H = this._canvas?.parentElement?.clientHeight || 600;
    const cx = W / 2;
    const cy = H / 2;
    const r = Math.min(W, H) * 0.3;

    this._nodes.forEach((node, i) => {
      const angle = (2 * Math.PI * i) / (this._nodes.length || 1);
      node.x = cx + r * Math.cos(angle) + (Math.random() - 0.5) * 20;
      node.y = cy + r * Math.sin(angle) + (Math.random() - 0.5) * 20;
      node.vx = 0;
      node.vy = 0;
    });

    // Center pan offset
    this._panOffset = { x: 0, y: 0 };
    this._zoom = 1;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Simulation loop
  // ═══════════════════════════════════════════════════════════════════════

  _startSimulation() {
    this._running = true;
    this._lastFrame = performance.now();
    this._tick();
  }

  _tick() {
    if (!this._running) return;
    this._rafId = requestAnimationFrame((now) => {
      if (now - this._lastFrame >= FPS_INTERVAL) {
        this._lastFrame = now;
        this._simulate();
        this._render();
      }
      this._tick();
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Physics simulation (per frame)
  // ═══════════════════════════════════════════════════════════════════════

  _simulate() {
    const nodes = this._visibleNodes();
    const edges = this._visibleEdges();
    const W = this._canvas?.parentElement?.clientWidth || 800;
    const H = this._canvas?.parentElement?.clientHeight || 600;
    const cx = W / 2;
    const cy = H / 2;

    // 1. Gravity toward center
    for (const n of nodes) {
      if (n === this._dragNode) continue;
      n.vx += (cx - n.x) * this._gravity;
      n.vy += (cy - n.y) * this._gravity;
    }

    // 2. Node-node repulsion (Coulomb)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = this._repulsion / (d * d);
        const fx = (dx / d) * force;
        const fy = (dy / d) * force;
        if (a !== this._dragNode) {
          a.vx += fx;
          a.vy += fy;
        }
        if (b !== this._dragNode) {
          b.vx -= fx;
          b.vy -= fy;
        }
      }
    }

    // 3. Edge spring forces (Hooke)
    for (const e of edges) {
      const a = this._nodeMap.get(e.source);
      const b = this._nodeMap.get(e.target);
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.sqrt(dx * dx + dy * dy) || 1;
      const displacement = d - this._linkDist;
      const force = displacement * 0.05;
      const fx = (dx / d) * force;
      const fy = (dy / d) * force;
      if (a !== this._dragNode) {
        a.vx += fx;
        a.vy += fy;
      }
      if (b !== this._dragNode) {
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // 4. Apply velocity + damping
    for (const n of nodes) {
      if (n === this._dragNode) {
        n.vx = 0;
        n.vy = 0;
        continue;
      }
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      if (Math.abs(n.vx) < MIN_VELOCITY) n.vx = 0;
      if (Math.abs(n.vy) < MIN_VELOCITY) n.vy = 0;
      n.x += n.vx;
      n.y += n.vy;
    }
  }

  _visibleNodes() {
    return this._nodes.filter((n) => this._filters[n.type]);
  }

  _visibleEdges() {
    return this._edges.filter((e) => {
      const a = this._nodeMap.get(e.source);
      const b = this._nodeMap.get(e.target);
      return a && b && this._filters[a.type] && this._filters[b.type];
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Canvas rendering
  // ═══════════════════════════════════════════════════════════════════════

  _render() {
    const canvas = this._canvas;
    if (!canvas) return;
    const parent = canvas.parentElement;
    const W = parent.clientWidth;
    const H = parent.clientHeight;

    // Resize canvas if needed
    if (canvas.width !== W * dpr() || canvas.height !== H * dpr()) {
      canvas.width = W * dpr();
      canvas.height = H * dpr();
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
    }

    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.setTransform(dpr(), 0, 0, dpr(), 0, 0);

    // Clear
    ctx.clearRect(0, 0, W, H);

    // Apply pan + zoom
    ctx.save();
    ctx.translate(this._panOffset.x, this._panOffset.y);
    ctx.translate(W / 2, H / 2);
    ctx.scale(this._zoom, this._zoom);
    ctx.translate(-W / 2, -H / 2);

    const nodes = this._visibleNodes();
    const edges = this._visibleEdges();
    const selected = this._selectedNode;
    const connectedIds = selected ? this._connectedNodeIds(selected.id) : null;
    const searchQ = this._searchQuery;

    // ── Draw edges ──
    for (const e of edges) {
      const a = this._nodeMap.get(e.source);
      const b = this._nodeMap.get(e.target);
      if (!a || !b) continue;

      let color = EDGE_COLOR;
      let width = 1;
      if (selected) {
        if (e.source === selected.id || e.target === selected.id) {
          color = EDGE_HIGHLIGHT;
          width = 2;
        } else {
          color = EDGE_DIM;
        }
      }

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    }

    // ── Draw nodes ──
    for (const node of nodes) {
      const cfg = NODE_TYPES[node.type];
      if (!cfg) continue;

      let alpha = 1;
      if (
        selected &&
        selected.id !== node.id &&
        connectedIds &&
        !connectedIds.has(node.id)
      ) {
        alpha = 0.2;
      }

      // Search highlight
      let isSearchMatch = false;
      if (searchQ && node.label.toLowerCase().includes(searchQ)) {
        isSearchMatch = true;
      }

      ctx.globalAlpha = alpha;

      // Glow for hovered / selected / search-matched
      if (node === this._hoveredNode || node === selected || isSearchMatch) {
        ctx.save();
        ctx.shadowColor = isSearchMatch ? SEARCH_HIGHLIGHT : cfg.color;
        ctx.shadowBlur = 16;
        this._drawNodeShape(ctx, node, cfg);
        ctx.restore();
      } else {
        this._drawNodeShape(ctx, node, cfg);
      }

      // Label
      if (cfg.radius >= 10 || node === this._hoveredNode || isSearchMatch) {
        ctx.font = LABEL_FONT;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = isSearchMatch
          ? SEARCH_HIGHLIGHT
          : "rgba(232,232,240,0.8)";
        ctx.fillText(truncate(node.label, 18), node.x, node.y + cfg.radius + 4);
      }

      ctx.globalAlpha = 1;
    }

    ctx.restore(); // pan/zoom
    ctx.restore(); // dpr
  }

  _drawNodeShape(ctx, node, cfg) {
    const { x, y } = node;
    const r = cfg.radius;

    ctx.fillStyle = cfg.color;
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.lineWidth = 1.5;

    switch (cfg.shape) {
      case "hexagon": {
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const angle = (Math.PI / 3) * i - Math.PI / 6;
          const px = x + r * Math.cos(angle);
          const py = y + r * Math.sin(angle);
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "circle":
      case "dot": {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        if (cfg.shape === "circle") ctx.stroke();
        break;
      }
      case "diamond": {
        ctx.beginPath();
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }
      case "square": {
        const half = r * 0.8;
        ctx.beginPath();
        ctx.roundRect(x - half, y - half, half * 2, half * 2, 3);
        ctx.fill();
        ctx.stroke();
        break;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Hit testing
  // ═══════════════════════════════════════════════════════════════════════

  _nodeAtPoint(mx, my) {
    // Convert screen coords to graph coords (reverse pan/zoom)
    const W = this._canvas?.parentElement?.clientWidth || 800;
    const H = this._canvas?.parentElement?.clientHeight || 600;
    const gx = (mx - this._panOffset.x - W / 2) / this._zoom + W / 2;
    const gy = (my - this._panOffset.y - H / 2) / this._zoom + H / 2;

    // Check nodes in reverse (top-most first)
    const nodes = this._visibleNodes();
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const cfg = NODE_TYPES[n.type];
      if (!cfg) continue;
      const hitR = cfg.radius + 4;
      if (dist({ x: gx, y: gy }, n) <= hitR) return n;
    }
    return null;
  }

  _connectedNodeIds(nodeId) {
    const ids = new Set();
    for (const e of this._edges) {
      if (e.source === nodeId) ids.add(e.target);
      if (e.target === nodeId) ids.add(e.source);
    }
    return ids;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Mouse handlers
  // ═══════════════════════════════════════════════════════════════════════

  _handleMouseDown(e) {
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const node = this._nodeAtPoint(mx, my);

    if (node) {
      this._dragNode = node;
      this._canvas.classList.add("grabbing");
    } else {
      // Start panning
      this._panStart = {
        x: e.clientX - this._panOffset.x,
        y: e.clientY - this._panOffset.y,
      };
      this._canvas.classList.add("grabbing");
    }
  }

  _handleMouseMove(e) {
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (this._dragNode) {
      // Move dragged node to cursor position in graph space
      const W = this._canvas?.parentElement?.clientWidth || 800;
      const H = this._canvas?.parentElement?.clientHeight || 600;
      this._dragNode.x = (mx - this._panOffset.x - W / 2) / this._zoom + W / 2;
      this._dragNode.y = (my - this._panOffset.y - H / 2) / this._zoom + H / 2;
      this._dragNode.vx = 0;
      this._dragNode.vy = 0;
      return;
    }

    if (this._panStart) {
      this._panOffset.x = e.clientX - this._panStart.x;
      this._panOffset.y = e.clientY - this._panStart.y;
      return;
    }

    // Hover detection
    const node = this._nodeAtPoint(mx, my);
    this._hoveredNode = node;
    this._canvas.classList.toggle("pointer", !!node);

    // Tooltip
    if (node && this._tooltip) {
      const cfg = NODE_TYPES[node.type];
      this._tooltip.innerHTML = `
        <div class="kg-tooltip-type">${cfg.label}</div>
        <div>${escHtml(node.label)}</div>`;
      this._tooltip.style.left = mx + 14 + "px";
      this._tooltip.style.top = my - 10 + "px";
      this._tooltip.classList.add("visible");
    } else if (this._tooltip) {
      this._tooltip.classList.remove("visible");
    }
  }

  _handleMouseUp(e) {
    if (this._dragNode) {
      // If it was a click (not a drag), select
      this._dragNode = null;
    }
    if (this._panStart) {
      this._panStart = null;
    }
    this._canvas.classList.remove("grabbing");
  }

  _handleDblClick(e) {
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const node = this._nodeAtPoint(mx, my);

    if (node) {
      this._selectedNode = node;
      this._openSidebar(node);
    } else {
      this._selectedNode = null;
      this._closeSidebar();
    }
  }

  _handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.92 : 1.08;
    this._zoom = clamp(this._zoom * delta, 0.15, 5);
  }

  _handleResize() {
    // Canvas will resize on next render frame automatically
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Sidebar
  // ═══════════════════════════════════════════════════════════════════════

  _openSidebar(node) {
    const sidebar = this._el?.querySelector('[data-ref="sidebar"]');
    const title = this._el?.querySelector('[data-ref="sidebar-title"]');
    const body = this._el?.querySelector('[data-ref="sidebar-body"]');
    if (!sidebar || !body) return;

    const cfg = NODE_TYPES[node.type];
    if (title) title.textContent = node.label;

    // Details
    let html = `
      <div class="kg-sidebar-section">
        <div class="kg-sidebar-section-title">Details</div>
        <div class="kg-sidebar-detail"><strong>Type:</strong> ${cfg.label}</div>
        <div class="kg-sidebar-detail"><strong>ID:</strong> ${escHtml(node.id)}</div>
    `;

    // Show raw metadata
    if (node.raw) {
      const raw = node.raw;
      const keys = Object.keys(raw).filter(
        (k) => k !== "id" && typeof raw[k] !== "object",
      );
      for (const k of keys.slice(0, 8)) {
        const val = raw[k];
        if (val != null && val !== "") {
          html += `<div class="kg-sidebar-detail"><strong>${escHtml(k)}:</strong> ${escHtml(String(val))}</div>`;
        }
      }
    }
    html += "</div>";

    // Connections
    const connected = this._connectedNodeIds(node.id);
    if (connected.size > 0) {
      html += `<div class="kg-sidebar-section">
        <div class="kg-sidebar-section-title">Connections (${connected.size})</div>`;
      for (const cid of connected) {
        const cn = this._nodeMap.get(cid);
        if (!cn) continue;
        const cc = NODE_TYPES[cn.type];
        html += `
          <div class="kg-connection-item" data-node-id="${escHtml(cid)}">
            <span class="kg-connection-dot" style="background:${cc.color}"></span>
            <span>${escHtml(cn.label)}</span>
          </div>`;
      }
      html += "</div>";
    }

    body.innerHTML = html;

    // Wire connection item clicks
    body.querySelectorAll(".kg-connection-item").forEach((item) => {
      item.addEventListener("click", () => {
        const nid = item.dataset.nodeId;
        const target = this._nodeMap.get(nid);
        if (target) {
          this._selectedNode = target;
          this._openSidebar(target);
        }
      });
    });

    sidebar.classList.add("open");
  }

  _closeSidebar() {
    const sidebar = this._el?.querySelector('[data-ref="sidebar"]');
    if (sidebar) sidebar.classList.remove("open");
  }
}
