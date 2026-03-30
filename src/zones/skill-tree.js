/**
 * skill-tree.js — Agent Skill Tree zone for Claude World
 *
 * Displays a canvas-based skill tree per agent with branching progression,
 * unlock mechanics, XP tracking, and celebration particles.
 *
 * Usage:
 *   import { SkillTree } from './skill-tree.js';
 *   const tree = new SkillTree();
 *   document.body.appendChild(tree.render());
 *   await tree.init(worldId);
 */

import { AGENT_PERSONALITIES } from "../systems/agent-personalities.js";

// ─────────────────────────────────────────────────────────────────────────────
//  Skill tree definitions per agent
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_KEYS = [
  "commander",
  "librarian",
  "archivist",
  "instructor",
  "dockmaster",
];

const SKILL_TREES = {
  commander: [
    {
      id: "cmd_leadership",
      name: "Leadership",
      tier: 1,
      icon: "🎖️",
      prereq: null,
      xp: 0,
      desc: "Foundation of command. Enables basic task delegation to a single agent.",
      effect: "+10% task speed for delegated tasks",
    },
    {
      id: "cmd_delegation",
      name: "Delegation",
      tier: 2,
      icon: "📋",
      prereq: "cmd_leadership",
      xp: 50,
      desc: "Assign tasks to multiple agents simultaneously with priority queuing.",
      effect: "Unlock parallel task assignment",
    },
    {
      id: "cmd_multitask",
      name: "Multi-task",
      tier: 2,
      icon: "⚡",
      prereq: "cmd_leadership",
      xp: 75,
      desc: "Manage concurrent operations across different zones without penalties.",
      effect: "+1 concurrent task slot",
    },
    {
      id: "cmd_strategy",
      name: "Strategy",
      tier: 3,
      icon: "🗺️",
      prereq: "cmd_delegation",
      xp: 150,
      desc: "Advanced planning algorithms unlock predictive task scheduling.",
      effect: "Auto-schedule tasks based on priority",
    },
    {
      id: "cmd_warroom",
      name: "War Room",
      tier: 3,
      icon: "🏛️",
      prereq: "cmd_multitask",
      xp: 200,
      desc: "Unlock the War Room — a real-time operations dashboard with full agent oversight.",
      effect: "Unlock War Room zone overlay",
    },
  ],
  librarian: [
    {
      id: "lib_research",
      name: "Research",
      tier: 1,
      icon: "🔍",
      prereq: null,
      xp: 0,
      desc: "Basic research capability. Query the knowledge base for simple lookups.",
      effect: "+5% research accuracy",
    },
    {
      id: "lib_deepsearch",
      name: "Deep Search",
      tier: 2,
      icon: "🕳️",
      prereq: "lib_research",
      xp: 50,
      desc: "Recursive search through nested knowledge structures and linked documents.",
      effect: "Search depth +2 levels",
    },
    {
      id: "lib_crossref",
      name: "Cross-ref",
      tier: 2,
      icon: "🔗",
      prereq: "lib_research",
      xp: 75,
      desc: "Automatically find connections between disparate knowledge entries.",
      effect: "Auto-link related entries",
    },
    {
      id: "lib_synthesis",
      name: "Synthesis",
      tier: 3,
      icon: "🧪",
      prereq: "lib_deepsearch",
      xp: 150,
      desc: "Combine multiple sources into coherent summaries with source attribution.",
      effect: "Generate synthesis reports",
    },
    {
      id: "lib_knowledgeweb",
      name: "Knowledge Web",
      tier: 3,
      icon: "🕸️",
      prereq: "lib_crossref",
      xp: 200,
      desc: "Visualize the entire knowledge graph as an interactive web of connections.",
      effect: "Unlock Knowledge Graph zone",
    },
  ],
  archivist: [
    {
      id: "arc_recall",
      name: "Recall",
      tier: 1,
      icon: "💭",
      prereq: null,
      xp: 0,
      desc: "Access basic event history. Retrieve timestamped records from the archive.",
      effect: "+50 recall buffer size",
    },
    {
      id: "arc_pattern",
      name: "Pattern Match",
      tier: 2,
      icon: "🧩",
      prereq: "arc_recall",
      xp: 50,
      desc: "Detect recurring patterns across historical events and task outcomes.",
      effect: "Pattern detection alerts",
    },
    {
      id: "arc_vcs",
      name: "Version Ctrl",
      tier: 2,
      icon: "📝",
      prereq: "arc_recall",
      xp: 75,
      desc: "Track and diff changes to world state over time with rollback capability.",
      effect: "Unlock state diffing",
    },
    {
      id: "arc_timeline",
      name: "Timeline",
      tier: 3,
      icon: "📅",
      prereq: "arc_pattern",
      xp: 150,
      desc: "Interactive timeline visualization of all world events with filtering.",
      effect: "Unlock Timeline zone",
    },
    {
      id: "arc_prophecy",
      name: "Prophecy",
      tier: 3,
      icon: "🔮",
      prereq: "arc_vcs",
      xp: 200,
      desc: "Predict future events based on historical patterns and current trajectories.",
      effect: "Predictive event forecasting",
    },
  ],
  instructor: [
    {
      id: "ins_teach",
      name: "Teach",
      tier: 1,
      icon: "📖",
      prereq: null,
      xp: 0,
      desc: "Basic teaching protocols. Create simple skill templates for other agents.",
      effect: "+10% skill creation speed",
    },
    {
      id: "ins_adapt",
      name: "Adapt",
      tier: 2,
      icon: "🔄",
      prereq: "ins_teach",
      xp: 50,
      desc: "Dynamically adjust teaching methods based on learner performance data.",
      effect: "Adaptive difficulty scaling",
    },
    {
      id: "ins_evaluate",
      name: "Evaluate",
      tier: 2,
      icon: "📊",
      prereq: "ins_teach",
      xp: 75,
      desc: "Comprehensive evaluation framework with scoring rubrics and progress tracking.",
      effect: "Unlock evaluation reports",
    },
    {
      id: "ins_specialize",
      name: "Specialize",
      tier: 3,
      icon: "🎯",
      prereq: "ins_adapt",
      xp: 150,
      desc: "Create specialized training programs targeting specific skill gaps.",
      effect: "Custom training paths",
    },
    {
      id: "ins_mastery",
      name: "Mastery",
      tier: 3,
      icon: "🏆",
      prereq: "ins_evaluate",
      xp: 200,
      desc: "Ultimate teaching proficiency. Agents learn 2x faster with perfect retention.",
      effect: "2x agent learning rate",
    },
  ],
  dockmaster: [
    {
      id: "doc_connect",
      name: "Connect",
      tier: 1,
      icon: "🔌",
      prereq: null,
      xp: 0,
      desc: "Establish basic connections to external services and APIs.",
      effect: "+1 connection slot",
    },
    {
      id: "doc_monitor",
      name: "Monitor",
      tier: 2,
      icon: "📡",
      prereq: "doc_connect",
      xp: 50,
      desc: "Real-time health monitoring of all active connections with alerts.",
      effect: "Connection health dashboard",
    },
    {
      id: "doc_optimize",
      name: "Optimize",
      tier: 2,
      icon: "⚙️",
      prereq: "doc_connect",
      xp: 75,
      desc: "Optimize data throughput and reduce latency across all integration channels.",
      effect: "-20% connection latency",
    },
    {
      id: "doc_scale",
      name: "Scale",
      tier: 3,
      icon: "📈",
      prereq: "doc_monitor",
      xp: 150,
      desc: "Auto-scale connection capacity based on load with intelligent queueing.",
      effect: "Auto-scaling connections",
    },
    {
      id: "doc_orchestrate",
      name: "Orchestrate",
      tier: 3,
      icon: "🎼",
      prereq: "doc_optimize",
      xp: 200,
      desc: "Full integration orchestration — chain services into complex workflows.",
      effect: "Unlock workflow builder",
    },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
//  Layout constants
// ─────────────────────────────────────────────────────────────────────────────

const NODE_RADIUS = 28;
const NODE_GAP_X = 160;
const NODE_GAP_Y = 120;
const TREE_ORIGIN_X = 0; // centered dynamically
const TREE_ORIGIN_Y = 80;
const LOCK_ICON = "🔒";

// ─────────────────────────────────────────────────────────────────────────────
//  SkillTree class
// ─────────────────────────────────────────────────────────────────────────────

export class SkillTree {
  constructor() {
    /** @type {HTMLElement|null} */
    this._el = null;

    /** @type {string|null} */
    this._worldId = null;

    /** @type {string} */
    this._activeAgent = "commander";

    /** @type {Map<string, Set<string>>} agentKey → Set of unlocked skill ids */
    this._unlocked = new Map();

    /** @type {Map<string, number>} agentKey → xp pool */
    this._agentXP = new Map();

    /** @type {object|null} currently selected skill */
    this._selectedSkill = null;

    // Canvas state
    /** @type {HTMLCanvasElement|null} */
    this._canvas = null;
    /** @type {CanvasRenderingContext2D|null} */
    this._ctx = null;
    this._panX = 0;
    this._panY = 0;
    this._zoom = 1;
    this._dragging = false;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._panStartX = 0;
    this._panStartY = 0;

    // Node hit areas (screen coords after transform)
    /** @type {Array<{skill: object, x: number, y: number}>} */
    this._nodePositions = [];

    // Hover
    this._hoveredSkill = null;

    // Tooltip element
    this._tooltip = null;

    // Particle system
    this._particles = [];
    this._animFrame = null;

    // Detail panel element
    this._detailEl = null;

    // Bound handlers for cleanup
    this._onResize = this._handleResize.bind(this);
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Build and return the root HTMLElement.
   * @returns {HTMLElement}
   */
  render() {
    if (!document.getElementById("skill-tree-styles")) {
      const link = document.createElement("link");
      link.id = "skill-tree-styles";
      link.rel = "stylesheet";
      link.href = new URL("./skill-tree.css", import.meta.url).href;
      document.head.appendChild(link);
    }

    this._el = document.createElement("div");
    this._el.className = "skill-tree";
    this._el.innerHTML =
      '<div class="st-loading">Loading skill tree\u2026</div>';
    return this._el;
  }

  /**
   * Initialize with world data.
   * @param {string} worldId
   */
  async init(worldId) {
    this._worldId = worldId;

    // Initialize XP pools (demo defaults)
    for (const key of AGENT_KEYS) {
      this._agentXP.set(key, 300);
      this._unlocked.set(key, new Set());
    }

    // Load persisted skills from DB
    await this._loadSkills();

    // Auto-unlock tier-1 (free) skills
    for (const key of AGENT_KEYS) {
      const tree = SKILL_TREES[key];
      const tier1 = tree.find((s) => s.tier === 1);
      if (tier1 && !this._unlocked.get(key).has(tier1.id)) {
        this._unlocked.get(key).add(tier1.id);
        // Persist
        this._persistUnlock(key, tier1.id);
      }
    }

    this._renderFull();
    window.addEventListener("resize", this._onResize);
  }

  /** Tear down. */
  destroy() {
    window.removeEventListener("resize", this._onResize);
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    if (this._el) this._el.innerHTML = "";
  }

  // ── Data loading ────────────────────────────────────────────────

  async _loadSkills() {
    try {
      const rows = await window.api.db.getAgentSkills(this._worldId);
      if (Array.isArray(rows)) {
        for (const row of rows) {
          if (!this._unlocked.has(row.agent_id)) {
            this._unlocked.set(row.agent_id, new Set());
          }
          this._unlocked.get(row.agent_id).add(row.skill_id);
        }
      }
    } catch (_) {
      // DB may not have table yet — use defaults
    }
  }

  async _persistUnlock(agentKey, skillId) {
    try {
      await window.api.db.unlockAgentSkill(this._worldId, agentKey, skillId);
    } catch (_) {
      // Silently fail if DB is unavailable
    }
  }

  // ── Full render ─────────────────────────────────────────────────

  _renderFull() {
    if (!this._el) return;
    this._el.innerHTML = "";

    // Header
    this._el.appendChild(this._buildHeader());

    // XP bar
    this._el.appendChild(this._buildXPBar());

    // Canvas container
    const canvasWrap = document.createElement("div");
    canvasWrap.className = "st-canvas-wrap";

    this._canvas = document.createElement("canvas");
    this._canvas.className = "st-canvas";
    canvasWrap.appendChild(this._canvas);

    // Hint
    const hint = document.createElement("div");
    hint.className = "st-canvas-hint";
    hint.textContent =
      "Scroll to zoom \u00b7 Drag to pan \u00b7 Click a node for details";
    canvasWrap.appendChild(hint);

    // Tooltip
    this._tooltip = document.createElement("div");
    this._tooltip.className = "st-tooltip";
    canvasWrap.appendChild(this._tooltip);

    // Detail panel
    this._detailEl = document.createElement("div");
    this._detailEl.className = "st-detail";
    canvasWrap.appendChild(this._detailEl);

    this._el.appendChild(canvasWrap);

    // Setup canvas
    this._ctx = this._canvas.getContext("2d");
    this._resizeCanvas();
    this._centerView();
    this._bindCanvasEvents();
    this._drawLoop();
  }

  // ── Header with agent tabs ──────────────────────────────────────

  _buildHeader() {
    const header = document.createElement("div");
    header.className = "st-header";

    const title = document.createElement("h2");
    title.className = "st-header__title";
    title.textContent = "\u2728 Agent Skill Trees";
    header.appendChild(title);

    const subtitle = document.createElement("div");
    subtitle.className = "st-header__subtitle";
    subtitle.textContent =
      "Develop unique abilities for each agent by spending XP.";
    header.appendChild(subtitle);

    // Tabs
    const tabs = document.createElement("div");
    tabs.className = "st-tabs";

    for (const key of AGENT_KEYS) {
      const p = AGENT_PERSONALITIES[key];
      const tab = document.createElement("button");
      tab.className =
        `st-tab st-tab--${key}` +
        (key === this._activeAgent ? " st-tab--active" : "");

      const emoji = document.createElement("span");
      emoji.className = "st-tab__emoji";
      emoji.textContent = p.emoji;
      tab.appendChild(emoji);

      const name = document.createElement("span");
      name.className = "st-tab__name";
      name.textContent = p.name;
      tab.appendChild(name);

      tab.addEventListener("click", () => {
        this._activeAgent = key;
        this._selectedSkill = null;
        this._closeDetail();
        this._centerView();
        this._updateTabs();
        this._updateXPBar();
      });

      tabs.appendChild(tab);
    }

    header.appendChild(tabs);
    return header;
  }

  _updateTabs() {
    if (!this._el) return;
    const tabs = this._el.querySelectorAll(".st-tab");
    tabs.forEach((tab, i) => {
      const key = AGENT_KEYS[i];
      tab.className =
        `st-tab st-tab--${key}` +
        (key === this._activeAgent ? " st-tab--active" : "");
    });
  }

  // ── XP bar ──────────────────────────────────────────────────────

  _buildXPBar() {
    const section = document.createElement("div");
    section.className = "st-xp-section";
    section.id = "st-xp-section";

    this._renderXPBarContent(section);
    return section;
  }

  _renderXPBarContent(section) {
    section.innerHTML = "";
    const p = AGENT_PERSONALITIES[this._activeAgent];
    const xp = this._agentXP.get(this._activeAgent) || 0;
    const tree = SKILL_TREES[this._activeAgent];
    const unlocked = this._unlocked.get(this._activeAgent) || new Set();

    // Find next locked skill cost
    const nextSkill = tree.find(
      (s) =>
        !unlocked.has(s.id) &&
        s.xp > 0 &&
        this._prereqMet(this._activeAgent, s),
    );
    const nextCost = nextSkill ? nextSkill.xp : 0;
    const progress = nextCost > 0 ? Math.min((xp / nextCost) * 100, 100) : 100;

    const label = document.createElement("div");
    label.className = "st-xp-label";
    label.innerHTML = `<strong>${p.emoji} ${p.name}</strong>`;
    section.appendChild(label);

    const barOuter = document.createElement("div");
    barOuter.className = "st-xp-bar-outer";

    const barInner = document.createElement("div");
    barInner.className = "st-xp-bar-inner";
    barInner.style.width = `${progress}%`;
    barInner.style.background = `linear-gradient(90deg, ${p.color}, ${this._lighten(p.color)})`;
    barOuter.appendChild(barInner);
    section.appendChild(barOuter);

    const count = document.createElement("div");
    count.className = "st-xp-count";
    count.textContent = nextCost > 0 ? `${xp} / ${nextCost} XP` : `${xp} XP`;
    section.appendChild(count);
  }

  _updateXPBar() {
    const section = this._el?.querySelector("#st-xp-section");
    if (section) this._renderXPBarContent(section);
  }

  // ── Canvas rendering ────────────────────────────────────────────

  _resizeCanvas() {
    if (!this._canvas) return;
    const rect = this._canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = rect.width * dpr;
    this._canvas.height = rect.height * dpr;
    this._canvas.style.width = rect.width + "px";
    this._canvas.style.height = rect.height + "px";
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _centerView() {
    if (!this._canvas) return;
    const rect = this._canvas.parentElement.getBoundingClientRect();
    this._panX = rect.width / 2;
    this._panY = 40;
    this._zoom = 1;
  }

  _drawLoop() {
    this._draw();
    this._animFrame = requestAnimationFrame(() => this._drawLoop());
  }

  _draw() {
    const ctx = this._ctx;
    if (!ctx || !this._canvas) return;

    const w = this._canvas.clientWidth;
    const h = this._canvas.clientHeight;

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(this._panX, this._panY);
    ctx.scale(this._zoom, this._zoom);

    const tree = SKILL_TREES[this._activeAgent];
    const unlocked = this._unlocked.get(this._activeAgent) || new Set();
    const color = AGENT_PERSONALITIES[this._activeAgent].color;

    // Compute node positions
    this._nodePositions = this._computeLayout(tree);

    // Draw connection lines
    for (const node of this._nodePositions) {
      if (node.skill.prereq) {
        const parent = this._nodePositions.find(
          (n) => n.skill.id === node.skill.prereq,
        );
        if (parent) {
          const isActive = unlocked.has(parent.skill.id);
          ctx.beginPath();
          ctx.moveTo(parent.x, parent.y + NODE_RADIUS);

          // Curved line
          const midY = (parent.y + node.y) / 2;
          ctx.bezierCurveTo(
            parent.x,
            midY,
            node.x,
            midY,
            node.x,
            node.y - NODE_RADIUS,
          );

          ctx.strokeStyle = isActive ? color + "80" : "rgba(255,255,255,0.08)";
          ctx.lineWidth = isActive ? 2.5 : 1.5;
          ctx.stroke();

          // Animated dot along the line if active
          if (isActive && unlocked.has(node.skill.id)) {
            const t = (Date.now() % 2000) / 2000;
            const dotX = this._bezierPoint(
              parent.x,
              parent.x,
              node.x,
              node.x,
              t,
            );
            const dotY = this._bezierPoint(
              parent.y + NODE_RADIUS,
              midY,
              midY,
              node.y - NODE_RADIUS,
              t,
            );
            ctx.beginPath();
            ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
          }
        }
      }
    }

    // Draw nodes
    for (const node of this._nodePositions) {
      const isUnlocked = unlocked.has(node.skill.id);
      const isSelected =
        this._selectedSkill && this._selectedSkill.id === node.skill.id;
      const isHovered =
        this._hoveredSkill && this._hoveredSkill.id === node.skill.id;

      // Glow for unlocked nodes
      if (isUnlocked) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = isSelected ? 24 : 16;
        ctx.beginPath();
        ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = color + "30";
        ctx.fill();
        ctx.restore();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);

      if (isUnlocked) {
        const grad = ctx.createRadialGradient(
          node.x - 6,
          node.y - 6,
          4,
          node.x,
          node.y,
          NODE_RADIUS,
        );
        grad.addColorStop(0, this._lighten(color));
        grad.addColorStop(1, color);
        ctx.fillStyle = grad;
      } else {
        ctx.fillStyle = "rgba(30, 35, 55, 0.9)";
      }
      ctx.fill();

      // Border
      ctx.lineWidth = isSelected ? 3 : isHovered ? 2.5 : 1.5;
      ctx.strokeStyle = isUnlocked ? color : "rgba(255,255,255,0.12)";
      if (isSelected) ctx.strokeStyle = "#fff";
      ctx.stroke();

      // Icon
      ctx.font = isUnlocked ? "20px serif" : "16px serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = isUnlocked ? "#fff" : "rgba(255,255,255,0.3)";
      ctx.fillText(isUnlocked ? node.skill.icon : LOCK_ICON, node.x, node.y);

      // Name below
      ctx.font = "11px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = isUnlocked
        ? "rgba(255,255,255,0.9)"
        : "rgba(255,255,255,0.3)";
      ctx.fillText(node.skill.name, node.x, node.y + NODE_RADIUS + 8);
    }

    // Draw particles
    this._drawParticles(ctx);

    ctx.restore();
  }

  _computeLayout(tree) {
    // Layout: tier 1 at top center, tier 2 spread, tier 3 spread further
    const tiers = { 1: [], 2: [], 3: [] };
    for (const skill of tree) {
      if (tiers[skill.tier]) tiers[skill.tier].push(skill);
    }

    const positions = [];

    for (const [tierStr, skills] of Object.entries(tiers)) {
      const tier = parseInt(tierStr);
      const y = TREE_ORIGIN_Y + (tier - 1) * NODE_GAP_Y;
      const totalWidth = (skills.length - 1) * NODE_GAP_X;
      const startX = TREE_ORIGIN_X - totalWidth / 2;

      for (let i = 0; i < skills.length; i++) {
        positions.push({
          skill: skills[i],
          x: startX + i * NODE_GAP_X,
          y,
        });
      }
    }

    return positions;
  }

  _bezierPoint(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return (
      u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3
    );
  }

  // ── Canvas events ───────────────────────────────────────────────

  _bindCanvasEvents() {
    const c = this._canvas;
    if (!c) return;

    c.addEventListener("mousedown", (e) => {
      this._dragging = true;
      this._dragStartX = e.clientX;
      this._dragStartY = e.clientY;
      this._panStartX = this._panX;
      this._panStartY = this._panY;
    });

    c.addEventListener("mousemove", (e) => {
      if (this._dragging) {
        this._panX = this._panStartX + (e.clientX - this._dragStartX);
        this._panY = this._panStartY + (e.clientY - this._dragStartY);
        return;
      }

      // Hit test for hover
      const hit = this._hitTest(e);
      this._hoveredSkill = hit;
      c.style.cursor = hit ? "pointer" : "grab";

      // Tooltip
      if (hit && this._tooltip) {
        const rect = c.getBoundingClientRect();
        this._tooltip.textContent = hit.name;
        this._tooltip.style.left = e.clientX - rect.left + 12 + "px";
        this._tooltip.style.top = e.clientY - rect.top - 30 + "px";
        this._tooltip.classList.add("st-tooltip--visible");
      } else if (this._tooltip) {
        this._tooltip.classList.remove("st-tooltip--visible");
      }
    });

    c.addEventListener("mouseup", (e) => {
      const wasDrag =
        Math.abs(e.clientX - this._dragStartX) > 4 ||
        Math.abs(e.clientY - this._dragStartY) > 4;
      this._dragging = false;

      if (!wasDrag) {
        const hit = this._hitTest(e);
        if (hit) {
          this._selectedSkill = hit;
          this._openDetail(hit);
        } else {
          this._selectedSkill = null;
          this._closeDetail();
        }
      }
    });

    c.addEventListener("mouseleave", () => {
      this._dragging = false;
      this._hoveredSkill = null;
      if (this._tooltip) this._tooltip.classList.remove("st-tooltip--visible");
    });

    c.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(0.4, Math.min(2.5, this._zoom * factor));

        // Zoom toward cursor
        const rect = c.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        this._panX = mx - (mx - this._panX) * (newZoom / this._zoom);
        this._panY = my - (my - this._panY) * (newZoom / this._zoom);
        this._zoom = newZoom;
      },
      { passive: false },
    );
  }

  _hitTest(e) {
    const rect = this._canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left - this._panX) / this._zoom;
    const my = (e.clientY - rect.top - this._panY) / this._zoom;

    for (const node of this._nodePositions) {
      const dx = mx - node.x;
      const dy = my - node.y;
      if (dx * dx + dy * dy <= NODE_RADIUS * NODE_RADIUS) {
        return node.skill;
      }
    }
    return null;
  }

  // ── Detail panel ────────────────────────────────────────────────

  _openDetail(skill) {
    if (!this._detailEl) return;
    const agent = this._activeAgent;
    const p = AGENT_PERSONALITIES[agent];
    const unlocked = this._unlocked.get(agent) || new Set();
    const isUnlocked = unlocked.has(skill.id);
    const prereqMet = this._prereqMet(agent, skill);
    const xp = this._agentXP.get(agent) || 0;
    const canAfford = xp >= skill.xp;

    this._detailEl.innerHTML = "";
    this._detailEl.classList.add("st-detail--open");

    // Header
    const header = document.createElement("div");
    header.className = "st-detail__header";

    const icon = document.createElement("div");
    icon.className = "st-detail__icon";
    icon.style.background = isUnlocked
      ? `linear-gradient(135deg, ${p.color}, ${this._lighten(p.color)})`
      : "rgba(255,255,255,0.06)";
    icon.textContent = skill.icon;
    header.appendChild(icon);

    const info = document.createElement("div");
    info.className = "st-detail__info";

    const name = document.createElement("div");
    name.className = "st-detail__name";
    name.textContent = skill.name;
    info.appendChild(name);

    const tier = document.createElement("div");
    tier.className = "st-detail__tier";
    tier.textContent = `Tier ${skill.tier} \u00b7 ${p.name}`;
    info.appendChild(tier);

    header.appendChild(info);

    const closeBtn = document.createElement("button");
    closeBtn.className = "st-detail__close";
    closeBtn.textContent = "\u2715";
    closeBtn.addEventListener("click", () => {
      this._selectedSkill = null;
      this._closeDetail();
    });
    header.appendChild(closeBtn);

    this._detailEl.appendChild(header);

    // Body
    const body = document.createElement("div");
    body.className = "st-detail__body";

    const desc = document.createElement("p");
    desc.className = "st-detail__desc";
    desc.textContent = skill.desc;
    body.appendChild(desc);

    // Meta
    const meta = document.createElement("div");
    meta.className = "st-detail__meta";

    const xpRow = document.createElement("div");
    xpRow.className = "st-detail__meta-row";
    xpRow.innerHTML = `<span class="st-detail__meta-label">XP Cost</span><span class="st-detail__meta-value">${skill.xp === 0 ? "Free" : skill.xp + " XP"}</span>`;
    meta.appendChild(xpRow);

    const tierRow = document.createElement("div");
    tierRow.className = "st-detail__meta-row";
    tierRow.innerHTML = `<span class="st-detail__meta-label">Tier</span><span class="st-detail__meta-value">${skill.tier} of 3</span>`;
    meta.appendChild(tierRow);

    body.appendChild(meta);

    // Effect
    const effect = document.createElement("div");
    effect.className = "st-detail__effect";
    effect.textContent = skill.effect;
    body.appendChild(effect);

    // Prerequisite
    if (skill.prereq) {
      const prereqSkill = SKILL_TREES[agent].find((s) => s.id === skill.prereq);
      if (prereqSkill) {
        const prereq = document.createElement("div");
        prereq.className = "st-detail__prereq";
        const met = unlocked.has(skill.prereq);
        prereq.textContent =
          (met ? "\u2705" : "\u26a0\ufe0f") + ` Requires: ${prereqSkill.name}`;
        body.appendChild(prereq);
      }
    }

    // Status
    const status = document.createElement("div");
    status.className = `st-detail__status st-detail__status--${isUnlocked ? "unlocked" : "locked"}`;
    status.textContent = isUnlocked ? "\u2713 Unlocked" : "\ud83d\udd12 Locked";
    body.appendChild(status);

    this._detailEl.appendChild(body);

    // Footer with unlock button
    if (!isUnlocked && skill.xp > 0) {
      const footer = document.createElement("div");
      footer.className = "st-detail__footer";

      const btn = document.createElement("button");
      btn.className = `st-unlock-btn st-unlock-btn--${agent}`;
      btn.textContent =
        canAfford && prereqMet
          ? `Unlock for ${skill.xp} XP`
          : !prereqMet
            ? "Prerequisite not met"
            : `Need ${skill.xp - xp} more XP`;
      btn.disabled = !canAfford || !prereqMet;

      btn.addEventListener("click", () => this._unlockSkill(skill));

      footer.appendChild(btn);
      this._detailEl.appendChild(footer);
    }
  }

  _closeDetail() {
    if (this._detailEl) {
      this._detailEl.classList.remove("st-detail--open");
    }
  }

  // ── Unlock logic ────────────────────────────────────────────────

  _prereqMet(agentKey, skill) {
    if (!skill.prereq) return true;
    const unlocked = this._unlocked.get(agentKey) || new Set();
    return unlocked.has(skill.prereq);
  }

  async _unlockSkill(skill) {
    const agent = this._activeAgent;
    const xp = this._agentXP.get(agent) || 0;

    if (xp < skill.xp) return;
    if (!this._prereqMet(agent, skill)) return;

    const unlocked = this._unlocked.get(agent);
    if (unlocked.has(skill.id)) return;

    // Deduct XP and unlock
    this._agentXP.set(agent, xp - skill.xp);
    unlocked.add(skill.id);

    // Persist to DB
    this._persistUnlock(agent, skill.id);

    // Spawn celebration particles
    const node = this._nodePositions.find((n) => n.skill.id === skill.id);
    if (node) {
      this._spawnParticles(node.x, node.y, AGENT_PERSONALITIES[agent].color);
    }

    // Dispatch event for other systems
    document.dispatchEvent(
      new CustomEvent("skill-tree:unlocked", {
        detail: { worldId: this._worldId, agentId: agent, skillId: skill.id },
        bubbles: true,
      }),
    );

    // Refresh UI
    this._updateXPBar();
    this._openDetail(skill);
  }

  // ── Particle system ─────────────────────────────────────────────

  _spawnParticles(x, y, color) {
    const count = 24;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 60 + Math.random() * 80;
      this._particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        decay: 0.015 + Math.random() * 0.01,
        size: 3 + Math.random() * 4,
        color,
      });
    }
  }

  _drawParticles(ctx) {
    const dt = 1 / 60;
    this._particles = this._particles.filter((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt; // gravity
      p.life -= p.decay;

      if (p.life <= 0) return false;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fillStyle =
        p.color +
        Math.floor(p.life * 255)
          .toString(16)
          .padStart(2, "0");
      ctx.fill();

      return true;
    });
  }

  // ── Helpers ─────────────────────────────────────────────────────

  _lighten(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 0xff) + 60);
    const g = Math.min(255, ((n >> 8) & 0xff) + 60);
    const b = Math.min(255, (n & 0xff) + 60);
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }

  _handleResize() {
    this._resizeCanvas();
  }
}

// ── Builder function (matches zone pattern) ──────────────────────

/**
 * Build the Skill Tree zone content.
 * @param {object} [options]
 * @param {string} [options.worldId] — world ID to load on init
 * @returns {HTMLElement}
 */
export function buildSkillTreeContent(options = {}) {
  const tree = new SkillTree();
  const el = tree.render();

  if (options.worldId) {
    tree.init(options.worldId);
  }

  el._skillTree = tree;
  return el;
}
