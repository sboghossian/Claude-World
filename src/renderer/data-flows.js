/**
 * data-flows.js — Animated data flow visualization between zones
 *
 * Draws glowing bezier curves between connected zones with animated
 * particles traveling along them. Different connection types have
 * distinct visual styles:
 *
 *   - Task flow  (dispatch → any):      blue particles along curve
 *   - Data sync  (brain ↔ memory):      purple bidirectional pulse
 *   - API calls  (exchange → external): orange dashed line + arrowheads
 *   - Agent move (any → any):           green dotted trail
 *   - Broadcast  (broadcast → all):     red expanding rings
 *
 * All rendering uses PixiJS v8 Graphics — no sprites or textures.
 */

import { Container, Graphics } from "pixi.js";
import { TILE_WIDTH, TILE_HEIGHT, HEIGHT_UNIT_PX } from "./constants.js";
import { ZONE_DEFS } from "./zones.js";
import { tileToScreen } from "./tiles.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Evaluate a quadratic bezier at t (0..1). */
function bezierPoint(p0x, p0y, cpx, cpy, p1x, p1y, t) {
  const mt = 1 - t;
  return {
    x: mt * mt * p0x + 2 * mt * t * cpx + t * t * p1x,
    y: mt * mt * p0y + 2 * mt * t * cpy + t * t * p1y,
  };
}

/** Get the screen-space center (top of roof) for a zone. */
function zoneCenterScreen(zoneId) {
  const zone = ZONE_DEFS.find((z) => z.id === zoneId);
  if (!zone) return null;
  const cx = zone.tileX + zone.w / 2;
  const cy = zone.tileY + zone.h / 2;
  const pos = tileToScreen(cx, cy);
  const hPx = (zone.active ? zone.height : 1) * HEIGHT_UNIT_PX;
  return { x: pos.x, y: pos.y - hPx * 0.5 };
}

// ── Flow type configs ────────────────────────────────────────────────────────

const FLOW_STYLES = {
  task: {
    color: 0x4a9eff, // blue
    glowColor: 0x4a9eff,
    particleSize: 3,
    particleCount: 5,
    speed: 0.4, // full traversal per second
    lineAlpha: 0.15,
    lineWidth: 1.5,
    dashed: false,
    bidirectional: false,
  },
  sync: {
    color: 0xa855f7, // purple
    glowColor: 0xa855f7,
    particleSize: 3.5,
    particleCount: 4,
    speed: 0.3,
    lineAlpha: 0.2,
    lineWidth: 2,
    dashed: false,
    bidirectional: true,
  },
  api: {
    color: 0xffb84a, // orange
    glowColor: 0xffb84a,
    particleSize: 2.5,
    particleCount: 3,
    speed: 0.5,
    lineAlpha: 0.2,
    lineWidth: 1.5,
    dashed: true,
    bidirectional: false,
  },
  agent: {
    color: 0x4aff8a, // green
    glowColor: 0x4aff8a,
    particleSize: 2,
    particleCount: 6,
    speed: 0.35,
    lineAlpha: 0.1,
    lineWidth: 1,
    dashed: true,
    bidirectional: false,
  },
  broadcast: {
    color: 0xff4a6a, // red
    glowColor: 0xff4a6a,
    particleSize: 0, // broadcast uses rings, not particles
    particleCount: 0,
    speed: 0.6,
    lineAlpha: 0,
    lineWidth: 0,
    dashed: false,
    bidirectional: false,
  },
};

// ── Internal flow data ───────────────────────────────────────────────────────

let _nextFlowId = 1;

/**
 * @typedef {Object} FlowEntry
 * @property {number}  id
 * @property {string}  fromZone
 * @property {string}  toZone
 * @property {string}  type       - 'task' | 'sync' | 'api' | 'agent' | 'broadcast'
 * @property {number}  intensity  - 0 (idle) .. 1 (max activity)
 * @property {number}  age        - seconds since creation
 * @property {{ x:number, y:number }} from
 * @property {{ x:number, y:number }} to
 * @property {{ x:number, y:number }} cp   - bezier control point
 * @property {number[]} particleTs - array of t-values (0..1) for each particle
 * @property {number}   ringT      - for broadcast rings (0..1)
 */

// ── DataFlowSystem ──────────────────────────────────────────────────────────

export class DataFlowSystem {
  /**
   * @param {import('pixi.js').Application} app
   * @param {import('./buildings.js').BuildingManager} buildingManager
   */
  constructor(app, buildingManager) {
    this._app = app;
    this._bm = buildingManager;

    /** @type {Container} */
    this.container = new Container();
    this.container.zIndex = 1.5; // between buildings (1) and fog (2)

    // Two layers: lines underneath, particles on top
    this._lineGfx = new Graphics();
    this._particleGfx = new Graphics();
    this.container.addChild(this._lineGfx);
    this.container.addChild(this._particleGfx);

    /** @type {Map<number, FlowEntry>} */
    this._flows = new Map();

    /** Broadcast ring state: array of { x, y, t, color } */
    this._rings = [];

    /** Whether the layer is visible */
    this._visible = true;

    /** Global opacity multiplier (0..1) */
    this._opacity = 0.85;

    // ── Keyboard toggle (V key) ──────────────────────────────────
    this._onKeyDown = this._onKeyDown.bind(this);
    document.addEventListener("keydown", this._onKeyDown);

    // ── Auto-listen to game events ───────────────────────────────
    this._boundListeners = [];
    this._wireEvents();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Add a data flow between two zones.
   * @param {string} fromZone  - zone id
   * @param {string} toZone    - zone id
   * @param {string} type      - 'task' | 'sync' | 'api' | 'agent' | 'broadcast'
   * @returns {number} flow id
   */
  addFlow(fromZone, toZone, type = "task") {
    const from = zoneCenterScreen(fromZone);
    const to = zoneCenterScreen(toZone);
    if (!from || !to) return -1;

    // Compute bezier control point: perpendicular offset for organic curve
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    // Offset perpendicular by 20-30% of distance for nice arcs
    const perpScale = 0.25 + Math.random() * 0.1;
    const side = Math.random() > 0.5 ? 1 : -1;
    const cp = {
      x: mx + (-dy / dist) * dist * perpScale * side,
      y: my + (dx / dist) * dist * perpScale * side,
    };

    const style = FLOW_STYLES[type] || FLOW_STYLES.task;

    // Stagger particle starting positions along the curve
    const particleTs = [];
    for (let i = 0; i < style.particleCount; i++) {
      particleTs.push(i / Math.max(1, style.particleCount));
    }

    const id = _nextFlowId++;
    /** @type {FlowEntry} */
    const entry = {
      id,
      fromZone,
      toZone,
      type,
      intensity: 0.5,
      age: 0,
      from,
      to,
      cp,
      particleTs,
      ringT: 0,
    };

    this._flows.set(id, entry);
    return id;
  }

  /**
   * Remove a flow by id.
   * @param {number} id
   */
  removeFlow(id) {
    this._flows.delete(id);
  }

  /**
   * Set flow intensity (controls particle speed and count).
   * @param {number} id
   * @param {number} intensity - 0 (idle) .. 1 (max)
   */
  setIntensity(id, intensity) {
    const f = this._flows.get(id);
    if (f) f.intensity = clamp(intensity, 0, 1);
  }

  /**
   * Toggle or set visibility of the entire flow layer.
   * @param {boolean} visible
   */
  setVisible(visible) {
    this._visible = visible;
    this.container.visible = visible;
  }

  /**
   * Set global opacity (integrates with settings).
   * @param {number} opacity - 0..1
   */
  setOpacity(opacity) {
    this._opacity = clamp(opacity, 0, 1);
  }

  /**
   * Main update loop. Called every frame from the render loop.
   * @param {number} dt - delta time in seconds
   */
  update(dt) {
    if (!this._visible) return;

    this._lineGfx.clear();
    this._particleGfx.clear();

    for (const [, flow] of this._flows) {
      flow.age += dt;

      if (flow.type === "broadcast") {
        this._updateBroadcast(flow, dt);
      } else {
        this._drawFlowLine(flow);
        this._updateParticles(flow, dt);
        this._drawParticles(flow);
      }
    }

    // Draw broadcast rings
    this._drawBroadcastRings(dt);
  }

  /**
   * Clean up all resources.
   */
  destroy() {
    document.removeEventListener("keydown", this._onKeyDown);
    for (const { event, handler } of this._boundListeners) {
      document.removeEventListener(event, handler);
    }
    this._boundListeners = [];
    this._flows.clear();
    this._rings = [];
    this.container.destroy({ children: true });
  }

  // ── Internals: Drawing ────────────────────────────────────────────────────

  /**
   * Draw the bezier curve line for a flow.
   * @param {FlowEntry} flow
   */
  _drawFlowLine(flow) {
    const style = FLOW_STYLES[flow.type] || FLOW_STYLES.task;
    if (style.lineAlpha <= 0) return;

    const gfx = this._lineGfx;
    const alpha = style.lineAlpha * this._opacity;
    const { from, to, cp } = flow;

    // Idle flows pulse slowly
    const pulseAlpha =
      flow.intensity < 0.3
        ? alpha * (0.5 + 0.5 * Math.sin(flow.age * 1.5))
        : alpha;

    if (style.dashed) {
      // Draw dashed bezier
      const segments = 30;
      const dashLen = 0.04;
      const gapLen = 0.03;
      let drawing = true;
      let accum = 0;
      let prev = bezierPoint(from.x, from.y, cp.x, cp.y, to.x, to.y, 0);

      for (let i = 1; i <= segments; i++) {
        const t = i / segments;
        const pt = bezierPoint(from.x, from.y, cp.x, cp.y, to.x, to.y, t);
        const seg = Math.sqrt((pt.x - prev.x) ** 2 + (pt.y - prev.y) ** 2);
        const segT =
          seg / (Math.sqrt((to.x - from.x) ** 2 + (to.y - from.y) ** 2) || 1);

        accum += segT;
        const threshold = drawing ? dashLen : gapLen;
        if (accum >= threshold) {
          accum = 0;
          drawing = !drawing;
        }

        if (drawing) {
          gfx.moveTo(prev.x, prev.y);
          gfx.lineTo(pt.x, pt.y);
          gfx.stroke({
            color: style.color,
            alpha: pulseAlpha,
            width: style.lineWidth,
          });
        }
        prev = pt;
      }

      // Arrowhead for API calls
      if (flow.type === "api") {
        this._drawArrowhead(gfx, flow, style, pulseAlpha);
      }
    } else {
      // Solid bezier curve
      gfx.moveTo(from.x, from.y);
      gfx.quadraticCurveTo(cp.x, cp.y, to.x, to.y);
      gfx.stroke({
        color: style.color,
        alpha: pulseAlpha,
        width: style.lineWidth,
      });

      // Soft glow underneath (slightly wider, more transparent)
      gfx.moveTo(from.x, from.y);
      gfx.quadraticCurveTo(cp.x, cp.y, to.x, to.y);
      gfx.stroke({
        color: style.glowColor,
        alpha: pulseAlpha * 0.3,
        width: style.lineWidth + 3,
      });
    }
  }

  /**
   * Draw an arrowhead at the end of a flow curve.
   * @param {Graphics} gfx
   * @param {FlowEntry} flow
   * @param {object} style
   * @param {number} alpha
   */
  _drawArrowhead(gfx, flow, style, alpha) {
    const { from, to, cp } = flow;
    // Tangent at t=0.95 for direction
    const t0 = 0.92;
    const t1 = 1.0;
    const p0 = bezierPoint(from.x, from.y, cp.x, cp.y, to.x, to.y, t0);
    const p1 = bezierPoint(from.x, from.y, cp.x, cp.y, to.x, to.y, t1);

    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len;
    const ny = dy / len;

    const arrowSize = 8;
    const ax = p1.x;
    const ay = p1.y;

    gfx.poly([
      ax,
      ay,
      ax - nx * arrowSize - ny * arrowSize * 0.5,
      ay - ny * arrowSize + nx * arrowSize * 0.5,
      ax - nx * arrowSize + ny * arrowSize * 0.5,
      ay - ny * arrowSize - nx * arrowSize * 0.5,
    ]);
    gfx.fill({ color: style.color, alpha: alpha * 1.5 });
  }

  /**
   * Advance particle positions along the bezier.
   * @param {FlowEntry} flow
   * @param {number} dt
   */
  _updateParticles(flow, dt) {
    const style = FLOW_STYLES[flow.type] || FLOW_STYLES.task;
    if (style.particleCount === 0) return;

    const speed = style.speed * (0.5 + flow.intensity * 1.5);

    for (let i = 0; i < flow.particleTs.length; i++) {
      flow.particleTs[i] += speed * dt;
      if (flow.particleTs[i] > 1) {
        flow.particleTs[i] -= 1;
      }
    }

    // For bidirectional flows, add reverse particles by drawing in _drawParticles
  }

  /**
   * Draw particles along the bezier curve.
   * @param {FlowEntry} flow
   */
  _drawParticles(flow) {
    const style = FLOW_STYLES[flow.type] || FLOW_STYLES.task;
    if (style.particleCount === 0) return;

    const gfx = this._particleGfx;
    const { from, to, cp } = flow;
    const baseAlpha = this._opacity * (0.6 + flow.intensity * 0.4);

    for (let i = 0; i < flow.particleTs.length; i++) {
      const t = flow.particleTs[i];
      const pt = bezierPoint(from.x, from.y, cp.x, cp.y, to.x, to.y, t);

      // Fade at endpoints
      const edgeFade = Math.min(t * 5, (1 - t) * 5, 1);
      const alpha = baseAlpha * edgeFade;

      // Glow halo
      gfx.circle(pt.x, pt.y, style.particleSize + 2);
      gfx.fill({ color: style.glowColor, alpha: alpha * 0.2 });

      // Core dot
      gfx.circle(pt.x, pt.y, style.particleSize);
      gfx.fill({ color: style.color, alpha });
    }

    // Bidirectional: draw reverse particles
    if (style.bidirectional) {
      for (let i = 0; i < flow.particleTs.length; i++) {
        const t = 1 - flow.particleTs[i]; // reversed
        const pt = bezierPoint(from.x, from.y, cp.x, cp.y, to.x, to.y, t);

        const edgeFade = Math.min(t * 5, (1 - t) * 5, 1);
        const alpha = baseAlpha * edgeFade * 0.7;

        gfx.circle(pt.x, pt.y, style.particleSize + 2);
        gfx.fill({ color: style.glowColor, alpha: alpha * 0.15 });

        gfx.circle(pt.x, pt.y, style.particleSize * 0.8);
        gfx.fill({ color: style.color, alpha });
      }
    }
  }

  // ── Broadcast rings ───────────────────────────────────────────────────────

  /**
   * Update broadcast flow — emits expanding ring pulses.
   * @param {FlowEntry} flow
   * @param {number} dt
   */
  _updateBroadcast(flow, dt) {
    flow.ringT += dt * 0.4 * (0.5 + flow.intensity);

    // Emit a new ring every ~2 seconds (faster at high intensity)
    const interval = 2.0 / (0.5 + flow.intensity);
    if (flow.ringT >= interval) {
      flow.ringT -= interval;
      this._rings.push({
        x: flow.from.x,
        y: flow.from.y,
        t: 0,
        maxRadius: 120 + flow.intensity * 80,
        color: FLOW_STYLES.broadcast.color,
      });
    }
  }

  /**
   * Draw and age broadcast rings.
   * @param {number} dt
   */
  _drawBroadcastRings(dt) {
    const gfx = this._particleGfx;
    const alive = [];

    for (const ring of this._rings) {
      ring.t += dt * 0.5;
      if (ring.t >= 1) continue; // expired

      const radius = ring.t * ring.maxRadius;
      const alpha = this._opacity * (1 - ring.t) * 0.35;

      // Outer ring
      gfx.circle(ring.x, ring.y, radius);
      gfx.stroke({ color: ring.color, alpha, width: 2 });

      // Inner glow
      gfx.circle(ring.x, ring.y, radius * 0.85);
      gfx.stroke({ color: ring.color, alpha: alpha * 0.4, width: 4 });

      alive.push(ring);
    }

    this._rings = alive;
  }

  // ── Keyboard toggle ───────────────────────────────────────────────────────

  /** @param {KeyboardEvent} e */
  _onKeyDown(e) {
    if (e.key === "v" || e.key === "V") {
      // Ignore if user is typing in an input
      if (
        e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        e.target.isContentEditable
      )
        return;
      this.setVisible(!this._visible);
    }
  }

  // ── Event wiring ──────────────────────────────────────────────────────────

  /** Auto-listen to game events and create/remove flows accordingly. */
  _wireEvents() {
    // Map of active event-driven flows so we can remove them later
    // key: string descriptor, value: flow id
    /** @type {Map<string, number>} */
    this._eventFlows = new Map();

    // ── Task flow: dispatch → zone on task dispatch ─────────────
    this._listen("dispatch:task-start", (e) => {
      const zone = e.detail?.zoneType;
      if (!zone) return;
      const key = `task:${zone}:${Date.now()}`;
      const id = this.addFlow("dispatch", zone, "task");
      if (id > 0) {
        this._eventFlows.set(key, id);
        this.setIntensity(id, 0.8);
        // Auto-remove after 8 seconds
        setTimeout(() => {
          this.removeFlow(id);
          this._eventFlows.delete(key);
        }, 8000);
      }
    });

    // ── Task complete: brief flash ──────────────────────────────
    this._listen("dispatch:task-complete", (e) => {
      const zone = e.detail?.zoneType;
      if (!zone) return;
      const key = `task-done:${zone}:${Date.now()}`;
      const id = this.addFlow("dispatch", zone, "task");
      if (id > 0) {
        this.setIntensity(id, 1.0);
        this._eventFlows.set(key, id);
        setTimeout(() => {
          this.removeFlow(id);
          this._eventFlows.delete(key);
        }, 3000);
      }
    });

    // ── Data sync: brain ↔ memory (persistent while both active) ─
    this._listen("zone:unlock", (e) => {
      const zone = e.detail?.zoneType;
      if (zone === "memory" || zone === "brain") {
        this._ensureSyncFlow();
      }
    });
    // Try to set up sync flow immediately if both zones exist
    setTimeout(() => this._ensureSyncFlow(), 1000);

    // ── API calls: exchange → external zones ────────────────────
    this._listen("connector-docks:api-call", (e) => {
      const target = e.detail?.targetZone || "docks";
      const key = `api:${target}:${Date.now()}`;
      const id = this.addFlow("exchange", target, "api");
      if (id > 0) {
        this.setIntensity(id, 0.9);
        this._eventFlows.set(key, id);
        setTimeout(() => {
          this.removeFlow(id);
          this._eventFlows.delete(key);
        }, 5000);
      }
    });

    // ── Agent movement: any → any ───────────────────────────────
    this._listen("agent:move", (e) => {
      const { fromZone, toZone } = e.detail || {};
      if (!fromZone || !toZone) return;
      const key = `agent:${fromZone}:${toZone}:${Date.now()}`;
      const id = this.addFlow(fromZone, toZone, "agent");
      if (id > 0) {
        this.setIntensity(id, 0.6);
        this._eventFlows.set(key, id);
        setTimeout(() => {
          this.removeFlow(id);
          this._eventFlows.delete(key);
        }, 6000);
      }
    });

    // ── Broadcast: broadcast tower → all active zones ───────────
    this._listen("broadcast:send", () => {
      const src = zoneCenterScreen("broadcast");
      if (!src) return;
      const key = `broadcast:${Date.now()}`;
      const id = this.addFlow("broadcast", "dispatch", "broadcast");
      if (id > 0) {
        this.setIntensity(id, 1.0);
        this._eventFlows.set(key, id);
        setTimeout(() => {
          this.removeFlow(id);
          this._eventFlows.delete(key);
        }, 4000);
      }
    });
  }

  /**
   * Register a DOM event listener and track it for cleanup.
   * @param {string} event
   * @param {Function} handler
   */
  _listen(event, handler) {
    document.addEventListener(event, handler);
    this._boundListeners.push({ event, handler });
  }

  /** Create the persistent brain ↔ memory sync flow if both zones exist. */
  _ensureSyncFlow() {
    if (this._eventFlows.has("sync:brain-memory")) return;
    const brain = zoneCenterScreen("brain");
    const memory = zoneCenterScreen("memory");
    if (!brain || !memory) return;
    const id = this.addFlow("brain", "memory", "sync");
    if (id > 0) {
      this.setIntensity(id, 0.3); // idle pulse
      this._eventFlows.set("sync:brain-memory", id);
    }
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create and return a DataFlowSystem, ready to be added to the world container.
 *
 * @param {import('pixi.js').Application} app
 * @param {import('./buildings.js').BuildingManager} buildingManager
 * @returns {DataFlowSystem}
 *
 * @example
 * const dataFlows = initDataFlows(app, buildingManager);
 * worldContainer.addChild(dataFlows.container);
 * // In render loop:
 * dataFlows.update(dt);
 */
export function initDataFlows(app, buildingManager) {
  return new DataFlowSystem(app, buildingManager);
}
