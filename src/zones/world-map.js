/**
 * world-map.js — World Map overview zone
 *
 * Full-panel Canvas 2D top-down view of the entire Claude World city.
 * Each zone is drawn as a coloured block with name label, build progress
 * bar, status indicator, agent-count badge, and activity sparkline.
 * Connections are drawn between related zones.
 *
 * Public API:
 *   render()              -> HTMLElement
 *   async init(worldId)   -> fetch data, draw initial frame, start loop
 *   destroy()             -> stop animation, clean up
 */

import { ZONE_DEFS } from "../renderer/zones.js";
import { GRID_SIZE, TILE_WIDTH, TILE_HEIGHT } from "../renderer/constants.js";

// ── Style injection ────────────────────────────────────────────────────

let _styleInjected = false;
function injectStyles() {
  if (_styleInjected) return;
  _styleInjected = true;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./world-map.css", import.meta.url).href;
  document.head.appendChild(link);
}

// ── Category definitions ──────────────────────────────────────────────

const CATEGORIES = {
  core: {
    label: "Core",
    color: "#4a9eff",
    ids: ["dispatch", "brain", "memory", "skills", "chat"],
  },
  operations: {
    label: "Operations",
    color: "#4aff8a",
    ids: ["treasury", "sales", "marketing", "market"],
  },
  infrastructure: {
    label: "Infrastructure",
    color: "#f97316",
    ids: ["exchange", "docks", "airport", "broadcast"],
  },
  intelligence: {
    label: "Intelligence",
    color: "#a855f7",
    ids: ["council", "rnd", "archive", "globe", "legal"],
  },
  management: { label: "Management", color: "#ffb84a", ids: ["minions"] },
};

// Build reverse lookup: zoneId -> categoryKey
const ZONE_CAT = {};
for (const [catKey, cat] of Object.entries(CATEGORIES)) {
  for (const id of cat.ids) ZONE_CAT[id] = catKey;
}

// Zone icon mapping
const ZONE_ICONS = {
  dispatch: "\u{1F3F0}",
  brain: "\u{1F4DA}",
  memory: "\u{1F5C4}",
  skills: "\u{1F3AF}",
  chat: "\u{1F4AC}",
  minions: "\u{26CF}",
  treasury: "\u{1F4B0}",
  sales: "\u{1F4C8}",
  marketing: "\u{1F4E3}",
  exchange: "\u{1F504}",
  market: "\u{1F6D2}",
  council: "\u{1F3DB}",
  rnd: "\u{1F52C}",
  legal: "\u{2696}",
  archive: "\u{1F4DC}",
  docks: "\u{2693}",
  airport: "\u{2708}",
  globe: "\u{1F310}",
  broadcast: "\u{1F4E1}",
};

// Zone connection definitions (from -> to)
const CONNECTIONS = [
  // Dispatch connects to all Ring 1
  ["dispatch", "brain"],
  ["dispatch", "chat"],
  ["dispatch", "memory"],
  ["dispatch", "skills"],
  ["dispatch", "minions"],
  // Brain connects to memory and archive
  ["brain", "memory"],
  ["brain", "archive"],
  // Memory to archive
  ["memory", "archive"],
  // Skills to rnd
  ["skills", "rnd"],
  // Business chain
  ["treasury", "sales"],
  ["sales", "marketing"],
  // Exchange links
  ["exchange", "docks"],
  ["exchange", "airport"],
  // Council links
  ["council", "legal"],
  ["council", "rnd"],
  // Broadcast and globe
  ["globe", "broadcast"],
];

// ── Helpers ───────────────────────────────────────────────────────────

function dpr() {
  return window.devicePixelRatio || 1;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Convert grid tile coords to top-down pixel position (no isometric). */
function tileToMapPx(tileX, tileY) {
  return { x: tileX * 14, y: tileY * 14 };
}

/** Generate fake sparkline data (8 points, 0-1). */
function fakeSparkline() {
  const pts = [];
  let v = 0.3 + Math.random() * 0.4;
  for (let i = 0; i < 8; i++) {
    v = clamp(v + (Math.random() - 0.48) * 0.25, 0, 1);
    pts.push(v);
  }
  return pts;
}

/** Hex color to rgba string */
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── WorldMap class ────────────────────────────────────────────────────

export class WorldMap {
  constructor() {
    /** @type {HTMLElement|null} */
    this._root = null;
    /** @type {HTMLCanvasElement|null} */
    this._canvas = null;
    /** @type {CanvasRenderingContext2D|null} */
    this._ctx = null;

    // Camera / transform
    this._offsetX = 0;
    this._offsetY = 0;
    this._zoom = 1.0;

    // Interaction
    this._dragging = false;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._dragOffsetX = 0;
    this._dragOffsetY = 0;
    this._hoveredZone = null;
    this._mouseX = 0;
    this._mouseY = 0;

    // State
    this._activeFilter = null; // category key or null
    this._searchQuery = "";
    this._worldId = null;
    this._zoneData = []; // enriched zone objects
    this._animFrame = null;
    this._pulsePhase = 0;
    this._destroyed = false;

    // Tooltip element
    this._tooltip = null;
  }

  // ── Render (returns DOM) ──────────────────────────────────────────

  render() {
    injectStyles();

    const root = document.createElement("div");
    root.className = "wm-zone";
    this._root = root;

    // Canvas
    const canvas = document.createElement("canvas");
    canvas.className = "wm-canvas";
    root.appendChild(canvas);
    this._canvas = canvas;

    // Top bar (search + filters)
    root.appendChild(this._buildTopBar());

    // Stats bar (top-right)
    root.appendChild(this._buildStatsBar());

    // Legend (bottom-left)
    root.appendChild(this._buildLegend());

    // Controls (bottom-right)
    root.appendChild(this._buildControls());

    // Tooltip
    const tip = document.createElement("div");
    tip.className = "wm-tooltip";
    root.appendChild(tip);
    this._tooltip = tip;

    return root;
  }

  // ── Init (async) ──────────────────────────────────────────────────

  async init(worldId) {
    this._worldId = worldId;
    this._buildZoneData();
    this._setupCanvas();
    this._bindEvents();
    this._centerCamera();
    this._startLoop();
  }

  // ── Destroy ───────────────────────────────────────────────────────

  destroy() {
    this._destroyed = true;
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
  }

  // ── Build enriched zone data ──────────────────────────────────────

  _buildZoneData() {
    this._zoneData = ZONE_DEFS.map((z) => {
      const pos = tileToMapPx(z.tileX, z.tileY);
      const w = z.w * 14;
      const h = z.h * 14;
      return {
        ...z,
        mapX: pos.x,
        mapY: pos.y,
        mapW: w,
        mapH: h,
        category: ZONE_CAT[z.id] || "core",
        icon: ZONE_ICONS[z.id] || "\u{1F3D7}",
        agentCount: z.active ? Math.floor(Math.random() * 4) : 0,
        buildProgress: z.active
          ? 0.6 + Math.random() * 0.4
          : Math.random() * 0.3,
        sparkline: fakeSparkline(),
        activeTasks: z.active ? Math.floor(Math.random() * 6) : 0,
      };
    });
  }

  // ── Canvas setup ──────────────────────────────────────────────────

  _setupCanvas() {
    const canvas = this._canvas;
    const rect = this._root.getBoundingClientRect();
    const d = dpr();
    canvas.width = rect.width * d;
    canvas.height = rect.height * d;
    canvas.style.width = rect.width + "px";
    canvas.style.height = rect.height + "px";
    this._ctx = canvas.getContext("2d");
    this._ctx.scale(d, d);
    this._canvasW = rect.width;
    this._canvasH = rect.height;
  }

  _centerCamera() {
    // Center on the dispatch tower area
    const dispatch = this._zoneData.find((z) => z.id === "dispatch");
    if (dispatch) {
      this._offsetX = this._canvasW / 2 - (dispatch.mapX + dispatch.mapW / 2);
      this._offsetY = this._canvasH / 2 - (dispatch.mapY + dispatch.mapH / 2);
    }
  }

  // ── Event binding ─────────────────────────────────────────────────

  _bindEvents() {
    const c = this._canvas;

    c.addEventListener("mousedown", (e) => this._onMouseDown(e));
    c.addEventListener("mousemove", (e) => this._onMouseMove(e));
    c.addEventListener("mouseup", (e) => this._onMouseUp(e));
    c.addEventListener("mouseleave", () => this._onMouseLeave());
    c.addEventListener("wheel", (e) => this._onWheel(e), { passive: false });
    c.addEventListener("click", (e) => this._onClick(e));
    c.addEventListener("dblclick", (e) => this._onDblClick(e));

    // Resize observer
    this._resizeObs = new ResizeObserver(() => {
      if (!this._destroyed) this._setupCanvas();
    });
    this._resizeObs.observe(this._root);
  }

  // ── Mouse handlers ────────────────────────────────────────────────

  _screenToWorld(sx, sy) {
    return {
      x: (sx - this._offsetX) / this._zoom,
      y: (sy - this._offsetY) / this._zoom,
    };
  }

  _onMouseDown(e) {
    this._dragging = true;
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;
    this._dragOffsetX = this._offsetX;
    this._dragOffsetY = this._offsetY;
    this._canvas.classList.add("grabbing");
  }

  _onMouseMove(e) {
    const rect = this._canvas.getBoundingClientRect();
    this._mouseX = e.clientX - rect.left;
    this._mouseY = e.clientY - rect.top;

    if (this._dragging) {
      this._offsetX = this._dragOffsetX + (e.clientX - this._dragStartX);
      this._offsetY = this._dragOffsetY + (e.clientY - this._dragStartY);
      return;
    }

    // Hit test
    const world = this._screenToWorld(this._mouseX, this._mouseY);
    const hit = this._hitTest(world.x, world.y);
    this._hoveredZone = hit;

    this._canvas.classList.toggle("pointer", !!hit);
    this._updateTooltip(hit);
  }

  _onMouseUp() {
    this._dragging = false;
    this._canvas.classList.remove("grabbing");
  }

  _onMouseLeave() {
    this._dragging = false;
    this._hoveredZone = null;
    this._canvas.classList.remove("grabbing");
    this._canvas.classList.remove("pointer");
    this._hideTooltip();
  }

  _onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    const oldZoom = this._zoom;
    this._zoom = clamp(this._zoom + delta, 0.3, 3.0);

    // Zoom toward cursor
    const ratio = this._zoom / oldZoom;
    this._offsetX = this._mouseX - (this._mouseX - this._offsetX) * ratio;
    this._offsetY = this._mouseY - (this._mouseY - this._offsetY) * ratio;
  }

  _onClick(e) {
    if (!this._hoveredZone) return;
    // Navigate to zone panel
    document.dispatchEvent(
      new CustomEvent("panel:open-zone", {
        detail: {
          zoneId: this._hoveredZone.id,
          zoneName: this._hoveredZone.name,
        },
        bubbles: true,
      }),
    );
  }

  _onDblClick(e) {
    // Zoom to fit on double-click
    this._zoomToFit();
  }

  // ── Hit testing ───────────────────────────────────────────────────

  _hitTest(wx, wy) {
    for (let i = this._zoneData.length - 1; i >= 0; i--) {
      const z = this._zoneData[i];
      if (this._isZoneDimmed(z)) continue;
      if (
        wx >= z.mapX &&
        wx <= z.mapX + z.mapW &&
        wy >= z.mapY &&
        wy <= z.mapY + z.mapH
      ) {
        return z;
      }
    }
    return null;
  }

  // ── Tooltip ───────────────────────────────────────────────────────

  _updateTooltip(zone) {
    if (!zone) {
      this._hideTooltip();
      return;
    }

    const cat = CATEGORIES[zone.category];
    const status = zone.active ? "Active" : "Locked";

    this._tooltip.innerHTML = "";

    const nameEl = document.createElement("div");
    nameEl.className = "wm-tooltip-name";
    nameEl.textContent = `${zone.icon} ${zone.name}`;
    this._tooltip.appendChild(nameEl);

    const catEl = document.createElement("div");
    catEl.className = "wm-tooltip-category";
    catEl.textContent = cat ? cat.label : zone.category;
    catEl.style.color = cat ? cat.color : "#888";
    this._tooltip.appendChild(catEl);

    const stats = document.createElement("div");
    stats.className = "wm-tooltip-stats";

    const rows = [
      ["Status", status],
      ["Build", Math.round(zone.buildProgress * 100) + "%"],
      ["Agents", String(zone.agentCount)],
      ["Tasks", String(zone.activeTasks)],
      ["Ring", String(zone.ring)],
    ];

    for (const [lbl, val] of rows) {
      const row = document.createElement("div");
      row.className = "wm-tooltip-stat";
      const l = document.createElement("span");
      l.className = "wm-tooltip-stat-label";
      l.textContent = lbl;
      const v = document.createElement("span");
      v.className = "wm-tooltip-stat-value";
      v.textContent = val;
      row.appendChild(l);
      row.appendChild(v);
      stats.appendChild(row);
    }
    this._tooltip.appendChild(stats);

    // Position tooltip near cursor
    const tipW = 220;
    let tx = this._mouseX + 16;
    let ty = this._mouseY - 10;
    if (tx + tipW > this._canvasW) tx = this._mouseX - tipW - 8;
    if (ty < 10) ty = 10;

    this._tooltip.style.left = tx + "px";
    this._tooltip.style.top = ty + "px";
    this._tooltip.classList.add("visible");
  }

  _hideTooltip() {
    if (this._tooltip) this._tooltip.classList.remove("visible");
  }

  // ── Zoom to fit ───────────────────────────────────────────────────

  _zoomToFit() {
    if (!this._zoneData.length) return;
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const z of this._zoneData) {
      minX = Math.min(minX, z.mapX);
      minY = Math.min(minY, z.mapY);
      maxX = Math.max(maxX, z.mapX + z.mapW);
      maxY = Math.max(maxY, z.mapY + z.mapH);
    }
    const worldW = maxX - minX + 80;
    const worldH = maxY - minY + 80;
    this._zoom = Math.min(this._canvasW / worldW, this._canvasH / worldH, 2.5);
    this._offsetX = this._canvasW / 2 - (minX + worldW / 2 - 40) * this._zoom;
    this._offsetY = this._canvasH / 2 - (minY + worldH / 2 - 40) * this._zoom;
  }

  // ── Filter / search logic ─────────────────────────────────────────

  _isZoneDimmed(z) {
    // Filter by category
    if (this._activeFilter && z.category !== this._activeFilter) return true;
    // Filter by search
    if (this._searchQuery) {
      const q = this._searchQuery.toLowerCase();
      if (
        !z.name.toLowerCase().includes(q) &&
        !z.id.toLowerCase().includes(q)
      ) {
        return true;
      }
    }
    return false;
  }

  // ── Animation loop ────────────────────────────────────────────────

  _startLoop() {
    const loop = () => {
      if (this._destroyed) return;
      this._pulsePhase += 0.03;
      this._draw();
      this._animFrame = requestAnimationFrame(loop);
    };
    this._animFrame = requestAnimationFrame(loop);
  }

  // ── Main draw ─────────────────────────────────────────────────────

  _draw() {
    const ctx = this._ctx;
    if (!ctx) return;
    const w = this._canvasW;
    const h = this._canvasH;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = "#080816";
    ctx.fillRect(0, 0, w, h);

    // Draw subtle grid
    ctx.save();
    ctx.translate(this._offsetX, this._offsetY);
    ctx.scale(this._zoom, this._zoom);
    this._drawGrid(ctx);
    this._drawConnections(ctx);
    this._drawZones(ctx);
    ctx.restore();
  }

  // ── Grid background ───────────────────────────────────────────────

  _drawGrid(ctx) {
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 0.5;
    const step = 14; // matches tile scale
    const minX = 0;
    const minY = 0;
    const maxX = GRID_SIZE * step;
    const maxY = GRID_SIZE * step;

    for (let x = minX; x <= maxX; x += step * 4) {
      ctx.beginPath();
      ctx.moveTo(x, minY);
      ctx.lineTo(x, maxY);
      ctx.stroke();
    }
    for (let y = minY; y <= maxY; y += step * 4) {
      ctx.beginPath();
      ctx.moveTo(minX, y);
      ctx.lineTo(maxX, y);
      ctx.stroke();
    }
  }

  // ── Connection lines ──────────────────────────────────────────────

  _drawConnections(ctx) {
    ctx.lineWidth = 1.2;

    for (const [fromId, toId] of CONNECTIONS) {
      const from = this._zoneData.find((z) => z.id === fromId);
      const to = this._zoneData.find((z) => z.id === toId);
      if (!from || !to) continue;

      const dimFrom = this._isZoneDimmed(from);
      const dimTo = this._isZoneDimmed(to);

      if (dimFrom && dimTo) {
        ctx.strokeStyle = "rgba(255,255,255,0.015)";
      } else if (dimFrom || dimTo) {
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
      } else {
        const cat = CATEGORIES[from.category];
        ctx.strokeStyle = hexToRgba(cat ? cat.color : "#4a9eff", 0.15);
      }

      const fx = from.mapX + from.mapW / 2;
      const fy = from.mapY + from.mapH / 2;
      const tx = to.mapX + to.mapW / 2;
      const ty = to.mapY + to.mapH / 2;

      // Draw curved line
      const mx = (fx + tx) / 2;
      const my = (fy + ty) / 2;
      const dx = tx - fx;
      const dy = ty - fy;
      const cx = mx - dy * 0.15;
      const cy = my + dx * 0.15;

      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.quadraticCurveTo(cx, cy, tx, ty);
      ctx.stroke();
    }
  }

  // ── Zone blocks ───────────────────────────────────────────────────

  _drawZones(ctx) {
    for (const z of this._zoneData) {
      this._drawZoneBlock(ctx, z);
    }
  }

  _drawZoneBlock(ctx, z) {
    const dimmed = this._isZoneDimmed(z);
    const hovered = this._hoveredZone && this._hoveredZone.id === z.id;
    const cat = CATEGORIES[z.category];
    const baseColor = cat ? cat.color : "#4a9eff";
    const alpha = dimmed ? 0.08 : 1.0;

    const x = z.mapX;
    const y = z.mapY;
    const w = z.mapW;
    const h = z.mapH;
    const r = 4;

    // ── Pulse glow for zones with active tasks ────────────────────
    if (!dimmed && z.activeTasks > 0 && z.active) {
      const pulse = Math.sin(this._pulsePhase + z.mapX * 0.05) * 0.5 + 0.5;
      ctx.save();
      ctx.shadowBlur = 12 + pulse * 10;
      ctx.shadowColor = hexToRgba(baseColor, 0.3 + pulse * 0.2);
      ctx.fillStyle = "transparent";
      this._roundRect(ctx, x - 2, y - 2, w + 4, h + 4, r + 2);
      ctx.fill();
      ctx.restore();
    }

    // ── Block background ──────────────────────────────────────────
    ctx.save();
    ctx.globalAlpha = alpha;

    // Fill
    const bgAlpha = z.active ? 0.25 : 0.1;
    ctx.fillStyle = hexToRgba(baseColor, bgAlpha);
    this._roundRect(ctx, x, y, w, h, r);
    ctx.fill();

    // Border
    const borderAlpha = hovered ? 0.7 : z.active ? 0.4 : 0.15;
    ctx.strokeStyle = hexToRgba(baseColor, borderAlpha);
    ctx.lineWidth = hovered ? 2 : 1;
    this._roundRect(ctx, x, y, w, h, r);
    ctx.stroke();

    // Hover highlight
    if (hovered && !dimmed) {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      this._roundRect(ctx, x, y, w, h, r);
      ctx.fill();
    }

    ctx.globalAlpha = alpha;

    // ── Status indicator (top-left dot) ───────────────────────────
    const statusColor = z.active ? "#22c55e" : "#555570";
    ctx.fillStyle = statusColor;
    ctx.beginPath();
    ctx.arc(x + 6, y + 6, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // ── Zone name label ───────────────────────────────────────────
    ctx.font = "bold 7px Inter, -apple-system, sans-serif";
    ctx.fillStyle = dimmed
      ? "rgba(255,255,255,0.15)"
      : "rgba(255,255,255,0.88)";
    ctx.textBaseline = "top";

    // Truncate name if needed
    const maxLabelW = w - 12;
    let label = z.name;
    while (ctx.measureText(label).width > maxLabelW && label.length > 4) {
      label = label.slice(0, -2) + "\u2026";
    }
    ctx.fillText(label, x + 5, y + 13);

    // ── Build progress bar ────────────────────────────────────────
    const barY = y + h - 10;
    const barW = w - 10;
    const barH = 3;
    const barX = x + 5;

    // Track
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    this._roundRect(ctx, barX, barY, barW, barH, 1.5);
    ctx.fill();

    // Fill
    const prog = clamp(z.buildProgress, 0, 1);
    if (prog > 0) {
      const progColor = z.active ? baseColor : "#555570";
      ctx.fillStyle = hexToRgba(progColor, 0.7);
      this._roundRect(ctx, barX, barY, barW * prog, barH, 1.5);
      ctx.fill();
    }

    // Progress text
    ctx.font = "5px SF Mono, Consolas, monospace";
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.textBaseline = "bottom";
    ctx.fillText(Math.round(prog * 100) + "%", barX, barY - 1);

    // ── Agent count badge (top-right) ─────────────────────────────
    if (z.agentCount > 0 && !dimmed) {
      const badgeX = x + w - 12;
      const badgeY = y + 3;
      ctx.fillStyle = hexToRgba(baseColor, 0.6);
      this._roundRect(ctx, badgeX, badgeY, 10, 8, 3);
      ctx.fill();

      ctx.font = "bold 5px Inter, -apple-system, sans-serif";
      ctx.fillStyle = "#fff";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(String(z.agentCount), badgeX + 5, badgeY + 4.5);
      ctx.textAlign = "left";
    }

    // ── Activity sparkline ────────────────────────────────────────
    if (z.active && z.sparkline.length > 1 && !dimmed) {
      const spX = x + 5;
      const spY = y + 24;
      const spW = w - 10;
      const spH = Math.min(10, h - 38);

      if (spH > 4) {
        ctx.beginPath();
        for (let i = 0; i < z.sparkline.length; i++) {
          const px = spX + (i / (z.sparkline.length - 1)) * spW;
          const py = spY + spH - z.sparkline[i] * spH;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = hexToRgba(baseColor, 0.5);
        ctx.lineWidth = 1;
        ctx.stroke();

        // Fill under sparkline
        const lastI = z.sparkline.length - 1;
        ctx.lineTo(spX + spW, spY + spH);
        ctx.lineTo(spX, spY + spH);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(baseColor, 0.08);
        ctx.fill();
      }
    }

    // ── Locked overlay ────────────────────────────────────────────
    if (!z.active && !dimmed) {
      ctx.font = "12px Inter, -apple-system, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText("\u{1F512}", x + w / 2, y + h / 2 - 2);
      ctx.textAlign = "left";
    }

    ctx.restore();
  }

  // ── Rounded rect helper ───────────────────────────────────────────

  _roundRect(ctx, x, y, w, h, r) {
    if (w < 0) w = 0;
    if (h < 0) h = 0;
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  }

  // ── UI builders ───────────────────────────────────────────────────

  _buildTopBar() {
    const bar = document.createElement("div");
    bar.className = "wm-top-bar";

    // Search
    const search = document.createElement("div");
    search.className = "wm-search";
    const icon = document.createElement("span");
    icon.className = "wm-search-icon";
    icon.textContent = "\u{1F50D}";
    search.appendChild(icon);

    const input = document.createElement("input");
    input.className = "wm-search-input";
    input.type = "text";
    input.placeholder = "Search zones...";
    input.setAttribute("aria-label", "Search zones");
    input.addEventListener("input", () => {
      this._searchQuery = input.value.trim();
    });
    input.addEventListener("keydown", (e) => e.stopPropagation());
    search.appendChild(input);
    bar.appendChild(search);

    // Separator
    const sep = document.createElement("div");
    sep.style.cssText =
      "width:1px;height:20px;background:rgba(255,255,255,0.1);flex-shrink:0;";
    bar.appendChild(sep);

    // Category filter pills
    const filters = document.createElement("div");
    filters.className = "wm-filters";

    // "All" pill
    const allPill = this._makePill("All", null, "#888");
    allPill.classList.add("active");
    filters.appendChild(allPill);

    const pills = [allPill];

    for (const [key, cat] of Object.entries(CATEGORIES)) {
      const pill = this._makePill(cat.label, key, cat.color);
      pill.dataset.cat = key;
      filters.appendChild(pill);
      pills.push(pill);
    }

    // Click handling
    filters.addEventListener("click", (e) => {
      const pill = e.target.closest(".wm-filter-pill");
      if (!pill) return;
      const catKey = pill.dataset.filterKey || null;
      this._activeFilter = catKey;
      for (const p of pills) p.classList.remove("active");
      pill.classList.add("active");
    });

    bar.appendChild(filters);
    return bar;
  }

  _makePill(label, catKey, color) {
    const pill = document.createElement("button");
    pill.className = "wm-filter-pill";
    if (catKey) pill.dataset.cat = catKey;
    pill.dataset.filterKey = catKey || "";

    if (color && catKey) {
      const dot = document.createElement("span");
      dot.className = "wm-filter-dot";
      dot.style.background = color;
      pill.appendChild(dot);
    }

    const txt = document.createElement("span");
    txt.textContent = label;
    pill.appendChild(txt);

    return pill;
  }

  _buildStatsBar() {
    const bar = document.createElement("div");
    bar.className = "wm-stats-bar";

    const activeCount = ZONE_DEFS.filter((z) => z.active).length;
    const totalCount = ZONE_DEFS.length;

    const chip1 = document.createElement("div");
    chip1.className = "wm-stat-chip";
    chip1.innerHTML = `<strong>${activeCount}</strong>/${totalCount} zones active`;
    bar.appendChild(chip1);

    const chip2 = document.createElement("div");
    chip2.className = "wm-stat-chip";
    chip2.innerHTML = `<strong>${ZONE_DEFS.filter((z) => z.ring <= 1).length}</strong> core`;
    bar.appendChild(chip2);

    this._statsBar = bar;
    return bar;
  }

  _buildLegend() {
    const legend = document.createElement("div");
    legend.className = "wm-legend";

    const title = document.createElement("div");
    title.className = "wm-legend-title";
    title.textContent = "Zone Categories";
    legend.appendChild(title);

    for (const [, cat] of Object.entries(CATEGORIES)) {
      const row = document.createElement("div");
      row.className = "wm-legend-row";

      const swatch = document.createElement("div");
      swatch.className = "wm-legend-swatch";
      swatch.style.background = cat.color;
      row.appendChild(swatch);

      const lbl = document.createElement("span");
      lbl.textContent = `${cat.label} (${cat.ids.length})`;
      row.appendChild(lbl);

      legend.appendChild(row);
    }

    // Status indicators
    const sep = document.createElement("div");
    sep.style.cssText =
      "height:1px;background:rgba(255,255,255,0.06);margin:8px 0;";
    legend.appendChild(sep);

    for (const [label, color] of [
      ["Active", "#22c55e"],
      ["Locked", "#555570"],
    ]) {
      const row = document.createElement("div");
      row.className = "wm-legend-row";

      const dot = document.createElement("div");
      dot.className = "wm-legend-swatch";
      dot.style.background = color;
      dot.style.borderRadius = "50%";
      dot.style.width = "8px";
      dot.style.height = "8px";
      row.appendChild(dot);

      const lbl = document.createElement("span");
      lbl.textContent = label;
      row.appendChild(lbl);

      legend.appendChild(row);
    }

    return legend;
  }

  _buildControls() {
    const wrap = document.createElement("div");
    wrap.className = "wm-controls";

    // Zoom in
    const zoomIn = document.createElement("button");
    zoomIn.className = "wm-ctrl-btn";
    zoomIn.textContent = "+";
    zoomIn.title = "Zoom in";
    zoomIn.addEventListener("click", () => {
      this._zoom = clamp(this._zoom + 0.15, 0.3, 3.0);
    });
    wrap.appendChild(zoomIn);

    // Zoom out
    const zoomOut = document.createElement("button");
    zoomOut.className = "wm-ctrl-btn";
    zoomOut.textContent = "\u2212";
    zoomOut.title = "Zoom out";
    zoomOut.addEventListener("click", () => {
      this._zoom = clamp(this._zoom - 0.15, 0.3, 3.0);
    });
    wrap.appendChild(zoomOut);

    // Fit all
    const fitAll = document.createElement("button");
    fitAll.className = "wm-ctrl-btn";
    fitAll.textContent = "\u2922";
    fitAll.title = "Fit all zones";
    fitAll.addEventListener("click", () => this._zoomToFit());
    wrap.appendChild(fitAll);

    // Re-center
    const center = document.createElement("button");
    center.className = "wm-ctrl-btn";
    center.textContent = "\u2316";
    center.title = "Center on Dispatch";
    center.addEventListener("click", () => {
      this._zoom = 1.0;
      this._centerCamera();
    });
    wrap.appendChild(center);

    // Separator
    const sep = document.createElement("div");
    sep.style.cssText =
      "height:1px;background:rgba(255,255,255,0.08);width:100%;";
    wrap.appendChild(sep);

    // Unlock all (dev/debug)
    const unlock = document.createElement("button");
    unlock.className = "wm-ctrl-btn wm-unlock-btn danger";
    unlock.textContent = "\u{1F513} ALL";
    unlock.title = "Unlock all zones (debug)";
    unlock.addEventListener("click", () => {
      for (const z of this._zoneData) {
        z.active = true;
        z.buildProgress = 0.8 + Math.random() * 0.2;
        z.agentCount = Math.floor(Math.random() * 4) + 1;
        z.activeTasks = Math.floor(Math.random() * 8);
        z.sparkline = fakeSparkline();
      }
      this._updateStatsBar();
    });
    wrap.appendChild(unlock);

    return wrap;
  }

  _updateStatsBar() {
    if (!this._statsBar) return;
    const activeCount = this._zoneData.filter((z) => z.active).length;
    const totalCount = this._zoneData.length;
    const chips = this._statsBar.querySelectorAll(".wm-stat-chip");
    if (chips[0]) {
      chips[0].innerHTML = `<strong>${activeCount}</strong>/${totalCount} zones active`;
    }
  }
}
