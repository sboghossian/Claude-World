/**
 * vfx.js — Cinematic Visual Effects System for Claude World
 *
 * Layered on top of the existing PixiJS v8 world renderer.
 * All effects are self-contained: they create, animate, and destroy
 * their own Graphics/Container nodes on the shared VFX container.
 */

import {
  Container,
  Graphics,
  Text,
  TextStyle,
  BlurFilter,
  ColorMatrixFilter,
} from "pixi.js";
import { TILE_WIDTH, TILE_HEIGHT, GRID_SIZE, COLORS } from "./constants.js";

// ── Isometric helpers ─────────────────────────────────────────────────────────

/**
 * Convert tile (col, row) to screen (x, y) at the world-container origin.
 * Matches the formula used in tiles.js / buildings.js.
 */
function tileToScreen(tileX, tileY) {
  const x = (tileX - tileY) * (TILE_WIDTH / 2);
  const y = (tileX + tileY) * (TILE_HEIGHT / 2);
  return { x, y };
}

/** Map-center screen position (used for heartbeat origin) */
const MAP_CENTER_TILE_X = GRID_SIZE / 2;
const MAP_CENTER_TILE_Y = GRID_SIZE / 2;

// ── Zone accent colors ────────────────────────────────────────────────────────
const ZONE_ACCENT = {
  core: 0x4a90d9,
  business: 0x4caf50,
  advanced: 0x9c5ec7,
  edge: 0xe8893c,
  council: 0x7c3aed,
  default: 0xffd700,
};

// ── Tiny math helpers ─────────────────────────────────────────────────────────
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));

// ─────────────────────────────────────────────────────────────────────────────
// VFXSystem
// ─────────────────────────────────────────────────────────────────────────────

export class VFXSystem {
  constructor(app) {
    this._app = app;
    this._stage = app.stage;

    // Top-level overlay container — sits above everything
    this._container = new Container();
    this._stage.addChild(this._container);

    // Aurora layer (screen-space, fixed position)
    this._auroraContainer = new Container();
    this._container.addChild(this._auroraContainer);

    // World-space VFX (tile-positioned effects)
    this._worldVFX = new Container();
    this._container.addChild(this._worldVFX);

    // Screen-space overlays (HUD-level)
    this._screenVFX = new Container();
    this._container.addChild(this._screenVFX);

    this._effects = new Map(); // id → { type, state, gfx, … }
    this._time = 0; // accumulated seconds
    this._running = false;
    this._uid = 0;

    // Aurora state
    this._auroraEnabled = true;
    this._auroraGfx = null;
    this._auroraFilter = null;

    // Heartbeat state
    this._lastHeartbeat = -999;

    // Bind DOM events
    this._onTaskComplete = this._onTaskComplete.bind(this);
    this._onQuestComplete = this._onQuestComplete.bind(this);
    this._onIncident = this._onIncident.bind(this);
    this._onXPGained = this._onXPGained.bind(this);

    window.addEventListener("dispatch:task-complete", this._onTaskComplete);
    window.addEventListener("quest:complete", this._onQuestComplete);
    window.addEventListener("incident:filed", this._onIncident);
    window.addEventListener("world:xp-gained", this._onXPGained);
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  start() {
    if (this._running) return;
    this._running = true;
    this._app.ticker.add(this._tick, this);
    this._buildAurora();
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    this._app.ticker.remove(this._tick, this);
  }

  destroy() {
    this.stop();
    window.removeEventListener("dispatch:task-complete", this._onTaskComplete);
    window.removeEventListener("quest:complete", this._onQuestComplete);
    window.removeEventListener("incident:filed", this._onIncident);
    window.removeEventListener("world:xp-gained", this._onXPGained);
    this._container.destroy({ children: true });
  }

  // ── Main ticker ─────────────────────────────────────────────────────────────

  _tick(ticker) {
    const dt = ticker.deltaMS / 1000; // seconds
    this._time += dt;

    // Ambient heartbeat every 8 seconds
    if (this._time - this._lastHeartbeat >= 8) {
      this._lastHeartbeat = this._time;
      this._spawnHeartbeat();
    }

    // Tick all live effects
    for (const [id, fx] of this._effects) {
      const done = this._tickEffect(fx, dt);
      if (done) {
        this._removeEffect(id, fx);
      }
    }

    // Aurora shimmer
    if (this._auroraEnabled && this._auroraGfx) {
      this._tickAurora(dt);
    }
  }

  // ── Effect dispatch ─────────────────────────────────────────────────────────

  _tickEffect(fx, dt) {
    fx.elapsed += dt;
    const t = clamp(fx.elapsed / fx.duration, 0, 1);

    switch (fx.type) {
      case "zone-glow":
        return this._tickZoneGlow(fx, t, dt);
      case "xp-particle":
        return this._tickXPParticle(fx, t, dt);
      case "task-burst":
        return this._tickTaskBurst(fx, t);
      case "flash":
        return this._tickFlash(fx, t);
      case "gold-spark":
        return this._tickGoldSpark(fx, t, dt);
      case "heartbeat":
        return this._tickHeartbeat(fx, t);
      case "lightning":
        return this._tickLightning(fx, t);
      case "vignette":
        return this._tickVignette(fx, t);
      case "road-packet":
        return this._tickRoadPacket(fx, t, dt);
      default:
        return t >= 1;
    }
  }

  _removeEffect(id, fx) {
    if (fx.gfx) {
      fx.gfx.parent?.removeChild(fx.gfx);
      fx.gfx.destroy();
    }
    if (fx.extras) {
      for (const g of fx.extras) {
        g.parent?.removeChild(g);
        g.destroy();
      }
    }
    this._effects.delete(id);
  }

  _addEffect(type, gfx, duration, state = {}, parent = null) {
    const id = ++this._uid;
    const container = parent ?? this._worldVFX;
    container.addChild(gfx);
    this._effects.set(id, { type, gfx, duration, elapsed: 0, ...state });
    return id;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Effect 1 — Zone Activity Glow
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Pulse a colorful bloom ring around the tile.
   * @param {number} tileX
   * @param {number} tileY
   * @param {number} color   hex color
   * @param {number} intensity  0–1 multiplier on alpha
   */
  triggerZoneGlow(tileX, tileY, color = 0x7c3aed, intensity = 1.0) {
    const { x, y } = tileToScreen(tileX, tileY);
    const gfx = new Graphics();
    gfx.x = x;
    gfx.y = y;

    // Draw a diamond-shaped glow matching isometric tile outline
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 2;

    gfx.setStrokeStyle({ width: 3, color, alpha: 0.8 });
    gfx.moveTo(0, -hh);
    gfx.lineTo(hw, 0);
    gfx.lineTo(0, hh);
    gfx.lineTo(-hw, 0);
    gfx.closePath();
    gfx.stroke();

    const duration = 1.2;
    this._addEffect("zone-glow", gfx, duration, {
      intensity,
      baseColor: color,
    });
  }

  _tickZoneGlow(fx, t) {
    // scale: 1 → 1.4 → 1  (ease in-out via sine)
    const s = 1.0 + 0.4 * Math.sin(t * Math.PI);
    fx.gfx.scale.set(s);
    // alpha: 0.6 → 0
    fx.gfx.alpha = clamp(fx.intensity * 0.6 * (1 - t), 0, 1);
    return t >= 1;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Effect 2 — XP Fountain
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Spawn gold "+XP" text sprites floating upward from (screenX, screenY).
   * @param {number} screenX
   * @param {number} screenY
   * @param {number} amount   XP value shown in text
   */
  triggerXPFountain(screenX, screenY, amount = 10) {
    const count = randInt(20, 30);
    const style = new TextStyle({
      fontFamily: "monospace",
      fontSize: rand(10, 16),
      fontWeight: "bold",
      fill: 0xffd700,
      dropShadow: true,
      dropShadowColor: 0x000000,
      dropShadowBlur: 2,
      dropShadowDistance: 1,
    });

    for (let i = 0; i < count; i++) {
      const label = new Text({ text: `+${amount} XP`, style });
      label.x = screenX + rand(-40, 40);
      label.y = screenY + rand(-10, 10);
      label.anchor.set(0.5);

      const vx = rand(-30, 30); // px/s horizontal drift
      const vy = rand(-90, -160); // px/s upward speed
      const duration = 1.5;

      this._addEffect(
        "xp-particle",
        label,
        duration,
        { vx, vy },
        this._screenVFX,
      );
    }
  }

  _tickXPParticle(fx, t, dt) {
    fx.gfx.x += fx.vx * dt;
    fx.gfx.y += fx.vy * dt;
    fx.vy += 40 * dt; // gentle gravity pull-back
    // Fade out in second half
    fx.gfx.alpha = t < 0.5 ? 1.0 : 1.0 - (t - 0.5) * 2;
    return t >= 1;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Effect 3 — Task Completion Burst
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * 12-ray starburst from the tile center, purple→blue gradient, 0.8s.
   * @param {number} tileX
   * @param {number} tileY
   */
  triggerTaskBurst(tileX, tileY) {
    const { x, y } = tileToScreen(tileX, tileY);
    const gfx = new Graphics();
    gfx.x = x;
    gfx.y = y;

    const RAYS = 12;
    const LEN = 60;
    const duration = 0.8;

    this._addEffect("task-burst", gfx, duration, {
      rays: RAYS,
      len: LEN,
      phase: 0,
    });
  }

  _tickTaskBurst(fx, t) {
    const g = fx.gfx;
    g.clear();

    const RAYS = fx.rays;
    const len = fx.len * (1 - t * 0.3); // rays contract slightly

    for (let i = 0; i < RAYS; i++) {
      const angle = (i / RAYS) * Math.PI * 2;
      // Interpolate purple(0x8b5cf6) → blue(0x3b82f6)
      const ci = i / (RAYS - 1);
      const r = Math.round(lerp(0x8b, 0x3b, ci));
      const gn = Math.round(lerp(0x5c, 0x82, ci));
      const b = Math.round(lerp(0xf6, 0xf6, ci));
      const color = (r << 16) | (gn << 8) | b;
      const alpha = clamp((1 - t) * 0.9, 0, 1);
      const innerR = 6;
      const x1 = Math.cos(angle) * innerR;
      const y1 = Math.sin(angle) * innerR;
      const x2 = Math.cos(angle) * len;
      const y2 = Math.sin(angle) * len;

      g.setStrokeStyle({ width: 2.5, color, alpha });
      g.moveTo(x1, y1);
      g.lineTo(x2, y2);
      g.stroke();
    }
    return t >= 1;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Effect 4 — Building Level-Up Flash
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Full-screen white flash then gold sparks rain for 2s.
   * @param {number} tileX
   * @param {number} tileY
   * @param {string} zoneName
   */
  triggerBuildingComplete(tileX, tileY, zoneName = "") {
    const screenW = this._app.screen.width;
    const screenH = this._app.screen.height;

    // --- White flash overlay ---
    const flashGfx = new Graphics();
    flashGfx.rect(0, 0, screenW, screenH);
    flashGfx.fill({ color: 0xffffff, alpha: 1 });
    flashGfx.alpha = 0;
    this._addEffect("flash", flashGfx, 0.4, {}, this._screenVFX);

    // --- Gold sparks ---
    const { x, y } = tileToScreen(tileX, tileY);
    const SPARKS = 40;
    for (let i = 0; i < SPARKS; i++) {
      const spark = new Graphics();
      spark.circle(0, 0, rand(2, 5));
      spark.fill({ color: 0xffd700, alpha: 1 });
      spark.x = x + rand(-20, 20);
      spark.y = y + rand(-10, 10);

      const vx = rand(-60, 60);
      const vy = rand(-200, -80);
      this._addEffect("gold-spark", spark, 2.0, { vx, vy });
    }
  }

  _tickFlash(fx, t) {
    // alpha: 0 → 0.7 → 0
    fx.gfx.alpha = 0.7 * Math.sin(t * Math.PI);
    return t >= 1;
  }

  _tickGoldSpark(fx, t, dt) {
    fx.gfx.x += fx.vx * dt;
    fx.gfx.y += fx.vy * dt;
    fx.vy += 200 * dt; // gravity
    fx.gfx.alpha = clamp(1 - t, 0, 1);
    return t >= 1;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Effect 5 — Ambient City Heartbeat (auto, every 8s)
  // ─────────────────────────────────────────────────────────────────────────

  _spawnHeartbeat() {
    const { x, y } = tileToScreen(MAP_CENTER_TILE_X, MAP_CENTER_TILE_Y);
    const gfx = new Graphics();
    gfx.x = x;
    gfx.y = y;
    const duration = 2.5; // expand for 2.5s
    this._addEffect("heartbeat", gfx, duration, { maxRadius: 400 });
  }

  _tickHeartbeat(fx, t) {
    const g = fx.gfx;
    g.clear();
    const radius = lerp(10, fx.maxRadius, t);
    const alpha = 0.15 * (1 - t);
    g.setStrokeStyle({ width: 2, color: 0x7c3aed, alpha });
    g.circle(0, 0, radius);
    g.stroke();
    return t >= 1;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Effect 6 — Aurora / Sky Effect
  // ─────────────────────────────────────────────────────────────────────────

  _buildAurora() {
    if (this._auroraGfx) {
      this._auroraContainer.removeChild(this._auroraGfx);
      this._auroraGfx.destroy();
    }

    const screenW = this._app.screen.width;
    const screenH = this._app.screen.height;
    const bands = 8;
    const bandH = (screenH * 0.2) / bands;

    const gfx = new Graphics();
    for (let i = 0; i < bands; i++) {
      const alpha = lerp(0.12, 0.02, i / bands);
      gfx.rect(0, i * bandH, screenW, bandH);
      gfx.fill({ color: 0x7c3aed, alpha });
    }

    // Blur for softness
    const blur = new BlurFilter({ strength: 12, quality: 2 });
    gfx.filters = [blur];

    this._auroraFilter = new ColorMatrixFilter();
    this._auroraContainer.addChild(gfx);
    this._auroraGfx = gfx;
  }

  _tickAurora(dt) {
    // Cycle phase: 0–1 over 30s
    const phase = (this._time % 30) / 30;

    // purple(0x7c3aed) → blue(0x3b82f6) → teal(0x14b8a6) → purple
    // We sweep through hue by tinting via color matrix
    const hueShift = phase * 360; // degrees

    // Apply a hue-rotation via ColorMatrixFilter manually
    if (!this._auroraFilter) return;

    const f = this._auroraFilter;
    f.hue(hueShift, false);

    if (!this._auroraGfx.filters.includes(f)) {
      this._auroraGfx.filters = [...(this._auroraGfx.filters || []), f];
    }

    // Gentle vertical shimmer using y offset
    this._auroraGfx.y = Math.sin(this._time * 0.4) * 6;
  }

  /**
   * Toggle the aurora sky effect.
   * @param {boolean} enabled
   */
  setAurora(enabled) {
    this._auroraEnabled = enabled;
    if (this._auroraGfx) {
      this._auroraGfx.visible = enabled;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Effect 7 — Lightning (council zone)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Draw 3 jagged lightning bolts above the tile, each lasting ~0.12s.
   * @param {number} tileX
   * @param {number} tileY
   */
  triggerLightning(tileX, tileY) {
    const { x, y } = tileToScreen(tileX, tileY);
    const BOLTS = 3;

    for (let b = 0; b < BOLTS; b++) {
      const gfx = new Graphics();
      gfx.x = x;
      gfx.y = y;

      // Start from a random point ~80–140px above the zone center
      const startX = rand(-30, 30);
      const startY = rand(-140, -80);
      const endX = rand(-15, 15);
      const endY = 0; // zone center

      this._drawLightningBolt(gfx, startX, startY, endX, endY, 4);

      // Stagger each bolt slightly
      const delay = b * 0.04;
      const duration = 0.12;

      // Use a simple custom effect with a start-delay baked into elapsed
      this._addEffect("lightning", gfx, duration + delay, {
        delay,
        color: 0xc4b5fd,
      });
    }
  }

  _drawLightningBolt(gfx, x1, y1, x2, y2, segments) {
    const points = [{ x: x1, y: y1 }];
    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      points.push({
        x: lerp(x1, x2, t) + rand(-12, 12),
        y: lerp(y1, y2, t) + rand(-6, 6),
      });
    }
    points.push({ x: x2, y: y2 });

    gfx.setStrokeStyle({ width: 2, color: 0xc4b5fd, alpha: 0.95 });
    gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      gfx.lineTo(points[i].x, points[i].y);
    }
    gfx.stroke();

    // Bright core
    gfx.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.6 });
    gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      gfx.lineTo(points[i].x, points[i].y);
    }
    gfx.stroke();
  }

  _tickLightning(fx, t) {
    if (fx.elapsed < fx.delay) {
      fx.gfx.visible = false;
      return false;
    }
    fx.gfx.visible = true;
    // Rapid flicker: visible for 0.12s then gone
    const localT = (fx.elapsed - fx.delay) / (fx.duration - fx.delay);
    fx.gfx.alpha = clamp(1 - localT * 1.5, 0, 1);
    return localT >= 1;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Effect 8 — Screen Vignette Pulse (incident)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Red vignette corners pulsing for 2s.
   */
  triggerIncidentVignette() {
    const screenW = this._app.screen.width;
    const screenH = this._app.screen.height;

    const gfx = new Graphics();

    // Simulate a vignette with four dark-red corner rectangles of varying opacity
    const drawVignette = (alpha) => {
      gfx.clear();
      const size = Math.max(screenW, screenH) * 0.6;
      // corners: top-left, top-right, bottom-left, bottom-right
      const corners = [
        [0, 0],
        [screenW - size, 0],
        [0, screenH - size],
        [screenW - size, screenH - size],
      ];
      for (const [cx, cy] of corners) {
        gfx.rect(cx, cy, size, size);
        gfx.fill({ color: 0x7f0000, alpha });
      }
    };

    drawVignette(0);

    this._addEffect(
      "vignette",
      gfx,
      2.0,
      {
        screenW,
        screenH,
        drawVignette,
      },
      this._screenVFX,
    );
  }

  _tickVignette(fx, t) {
    // Pulse: 0 → 0.45 → 0.2 → 0.45 → 0 (two pulses then fade)
    let alpha;
    if (t < 0.25) {
      alpha = lerp(0, 0.45, t / 0.25);
    } else if (t < 0.45) {
      alpha = lerp(0.45, 0.2, (t - 0.25) / 0.2);
    } else if (t < 0.65) {
      alpha = lerp(0.2, 0.35, (t - 0.45) / 0.2);
    } else {
      alpha = lerp(0.35, 0, (t - 0.65) / 0.35);
    }
    fx.drawVignette(clamp(alpha, 0, 1));
    return t >= 1;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DOM event handlers
  // ─────────────────────────────────────────────────────────────────────────

  _onTaskComplete(e) {
    const {
      tileX = 20,
      tileY = 20,
      screenX,
      screenY,
      xp = 10,
    } = e.detail ?? {};
    this.triggerTaskBurst(tileX, tileY);
    const sx = screenX ?? this._app.screen.width / 2;
    const sy = screenY ?? this._app.screen.height * 0.85;
    this.triggerXPFountain(sx, sy, xp);
  }

  _onQuestComplete(e) {
    const { tileX = 20, tileY = 20, zoneName = "" } = e.detail ?? {};
    this.triggerBuildingComplete(tileX, tileY, zoneName);
  }

  _onIncident() {
    this.triggerIncidentVignette();
  }

  _onXPGained(e) {
    const { screenX, screenY, amount = 5 } = e.detail ?? {};
    const sx = screenX ?? this._app.screen.width / 2;
    const sy = screenY ?? this._app.screen.height * 0.85;
    this.triggerXPFountain(sx, sy, amount);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Road data-packet effect (used by CityLife, exposed here for reuse)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Fire a light-packet along a screen-space straight line.
   * @param {{x,y}} from  screen coords
   * @param {{x,y}} to    screen coords
   * @param {number} color
   */
  triggerRoadPacket(from, to, color = 0x4a90d9) {
    const gfx = new Graphics();
    gfx.circle(0, 0, 3);
    gfx.fill({ color, alpha: 0.9 });
    gfx.x = from.x;
    gfx.y = from.y;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const duration = dist / 200; // 200 px/s

    this._addEffect(
      "road-packet",
      gfx,
      duration,
      {
        fromX: from.x,
        fromY: from.y,
        toX: to.x,
        toY: to.y,
      },
      this._worldVFX,
    );
  }

  _tickRoadPacket(fx, t) {
    fx.gfx.x = lerp(fx.fromX, fx.toX, t);
    fx.gfx.y = lerp(fx.fromY, fx.toY, t);
    fx.gfx.alpha = t < 0.8 ? 0.9 : lerp(0.9, 0, (t - 0.8) / 0.2);
    return t >= 1;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create and start the VFX system.
 * @param {import('pixi.js').Application} app
 * @returns {VFXSystem}
 */
export function initVFX(app) {
  const vfx = new VFXSystem(app);
  vfx.start();
  return vfx;
}
