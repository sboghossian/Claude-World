/**
 * city-life.js — Micro-animations that make Claude World feel alive
 *
 * Layered on the existing worldContainer (the isometric tile/building layer).
 * Uses PixiJS v8 Container, Graphics, Text, and Ticker — no extra libs.
 *
 * Micro-animations implemented:
 *  1. Window lights   — random yellow flickers on built tiles
 *  2. Smoke wisps     — grey spiral particles rising from rooftops
 *  3. Ground shadows  — soft ellipses beneath agent sprites
 *  4. City ambient glow — colored halos around active zones
 *  5. Road activity lines — light packets traveling between active zones
 */

import { Container, Graphics, Ticker } from 'pixi.js';
import { TILE_WIDTH, TILE_HEIGHT, GRID_SIZE, COLORS } from './constants.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const rand    = (lo, hi) => lo + Math.random() * (hi - lo);
const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
const lerp    = (a, b, t) => a + (b - a) * t;
const clamp   = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Isometric tile → world-container screen position (top vertex of tile). */
function tileToScreen(tileX, tileY) {
  return {
    x: (tileX - tileY) * (TILE_WIDTH  / 2),
    y: (tileX + tileY) * (TILE_HEIGHT / 2),
  };
}

/** Pick the accent color for a zone type string. */
function zoneColor(type = 'default') {
  const MAP = {
    core:     0x4a90d9,
    business: 0x4caf50,
    advanced: 0x9c5ec7,
    edge:     0xe8893c,
    council:  0x7c3aed,
    default:  0xffd700,
  };
  return MAP[type] ?? MAP.default;
}

// ── Internal data structures ──────────────────────────────────────────────────

/**
 * A lightweight particle tracked by CityLife.
 * @typedef {{ gfx: Graphics, elapsed: number, duration: number, update: Function }} Particle
 */

// ─────────────────────────────────────────────────────────────────────────────
// CityLife
// ─────────────────────────────────────────────────────────────────────────────

export class CityLife {
  /**
   * @param {import('pixi.js').Application} app
   * @param {import('pixi.js').Container}   worldContainer  — the isometric world layer
   */
  constructor(app, worldContainer) {
    this._app            = app;
    this._worldContainer = worldContainer;
    this._time           = 0;
    this._running        = false;

    // Sub-containers (all children of worldContainer so they depth-sort correctly)
    this._shadowLayer = new Container();   // under agents
    this._glowLayer   = new Container();   // zone halos
    this._lifeLayer   = new Container();   // smoke, windows, packets
    worldContainer.addChild(this._shadowLayer);
    worldContainer.addChild(this._glowLayer);
    worldContainer.addChild(this._lifeLayer);

    // Particle pool
    this._particles = [];   // array of { gfx, elapsed, duration, update }

    // Window light state
    this._windowLights = [];  // { gfx, nextFlipAt, on, tileX, tileY }

    // Smoke emitters (one per registered building)
    this._smokeEmitters = [];  // { tileX, tileY, particles: [], nextEmitAt }

    // Agent shadow registry: Map<agentId, Graphics>
    this._agentShadows = new Map();

    // Zone glow rings: Map<zoneKey, { gfx, phase }>
    this._zoneGlows = new Map();

    // Road packet scheduled intervals: array of { fromTile, toTile, color, nextAt }
    this._roadLinks = [];

    // Bind ticker
    this._tick = this._tick.bind(this);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  start() {
    if (this._running) return;
    this._running = true;
    this._app.ticker.add(this._tick);
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    this._app.ticker.remove(this._tick);
  }

  destroy() {
    this.stop();
    this._shadowLayer.destroy({ children: true });
    this._glowLayer.destroy({ children: true });
    this._lifeLayer.destroy({ children: true });
  }

  // ── Registration API ────────────────────────────────────────────────────────

  /**
   * Register a built tile so CityLife can spawn window lights on it.
   * @param {number} tileX
   * @param {number} tileY
   * @param {number} [windowCount=3]
   */
  registerBuiltTile(tileX, tileY, windowCount = 3) {
    const { x, y } = tileToScreen(tileX, tileY);

    for (let i = 0; i < windowCount; i++) {
      const gfx = new Graphics();
      // Position window randomly within the tile's footprint
      gfx.x = x + rand(-TILE_WIDTH * 0.3, TILE_WIDTH * 0.3);
      gfx.y = y + rand(-TILE_HEIGHT * 1.5, -TILE_HEIGHT * 0.2);

      this._drawWindowLight(gfx, true);
      this._lifeLayer.addChild(gfx);

      this._windowLights.push({
        gfx,
        on: true,
        nextFlipAt: this._time + rand(2, 8),
        tileX, tileY,
      });
    }
  }

  /**
   * Register a building for smoke particle emission from its rooftop.
   * @param {number} tileX
   * @param {number} tileY
   * @param {number} [heightPx=48]   roof height offset above tile origin
   */
  registerBuilding(tileX, tileY, heightPx = 48) {
    this._smokeEmitters.push({
      tileX, tileY, heightPx,
      particles: [],
      nextEmitAt: this._time + rand(0.3, 1.2),
    });
  }

  /**
   * Register an agent sprite so CityLife renders a shadow beneath it.
   * @param {string|number} agentId   — unique ID
   * @param {import('pixi.js').Container} sprite  — the agent's display object
   */
  registerAgent(agentId, sprite) {
    if (this._agentShadows.has(agentId)) return;

    const shadow = new Graphics();
    shadow.ellipse(0, 0, 14, 6);
    shadow.fill({ color: 0x000000, alpha: 0.3 });
    shadow.scale.set(0.8);
    this._shadowLayer.addChild(shadow);

    this._agentShadows.set(agentId, { shadow, sprite });
  }

  /**
   * Unregister an agent (e.g. when it despawns).
   * @param {string|number} agentId
   */
  unregisterAgent(agentId) {
    const entry = this._agentShadows.get(agentId);
    if (!entry) return;
    entry.shadow.parent?.removeChild(entry.shadow);
    entry.shadow.destroy();
    this._agentShadows.delete(agentId);
  }

  /**
   * Register an active zone so it gets a colored ambient ground glow.
   * @param {string} zoneKey    — unique zone identifier
   * @param {number} tileX
   * @param {number} tileY
   * @param {string} zoneType   — 'core' | 'business' | 'advanced' | 'edge' | 'council'
   */
  registerZoneGlow(zoneKey, tileX, tileY, zoneType = 'default') {
    if (this._zoneGlows.has(zoneKey)) return;

    const color  = zoneColor(zoneType);
    const { x, y } = tileToScreen(tileX, tileY);

    const gfx = new Graphics();
    gfx.x = x;
    gfx.y = y;
    this._glowLayer.addChild(gfx);

    this._zoneGlows.set(zoneKey, { gfx, phase: Math.random() * Math.PI * 2, color });
  }

  /**
   * Remove a zone glow (zone went inactive).
   * @param {string} zoneKey
   */
  unregisterZoneGlow(zoneKey) {
    const entry = this._zoneGlows.get(zoneKey);
    if (!entry) return;
    entry.gfx.parent?.removeChild(entry.gfx);
    entry.gfx.destroy();
    this._zoneGlows.delete(zoneKey);
  }

  /**
   * Register a road link between two active zones for data-packet animation.
   * @param {{tileX:number,tileY:number}} fromZone
   * @param {{tileX:number,tileY:number}} toZone
   * @param {string} zoneType
   */
  registerRoadLink(fromZone, toZone, zoneType = 'default') {
    this._roadLinks.push({
      fromZone,
      toZone,
      color: zoneColor(zoneType),
      nextAt: this._time + rand(0.5, 3),
    });
  }

  // ── Ticker ─────────────────────────────────────────────────────────────────

  _tick(ticker) {
    const dt = ticker.deltaMS / 1000;
    this._time += dt;

    this._updateWindowLights(dt);
    this._updateSmokeEmitters(dt);
    this._updateAgentShadows();
    this._updateZoneGlows();
    this._updateRoadPackets(dt);
    this._stepParticles(dt);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Window Lights
  // ─────────────────────────────────────────────────────────────────────────

  _drawWindowLight(gfx, on) {
    gfx.clear();
    if (on) {
      gfx.circle(0, 0, randInt(1, 2));
      gfx.fill({ color: COLORS.windowGlow, alpha: rand(0.7, 1.0) });
    }
    // When off, just clear (invisible)
  }

  _updateWindowLights() {
    for (const win of this._windowLights) {
      if (this._time >= win.nextFlipAt) {
        win.on = !win.on;
        this._drawWindowLight(win.gfx, win.on);
        win.nextFlipAt = this._time + rand(2, 8);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Smoke Wisps
  // ─────────────────────────────────────────────────────────────────────────

  _updateSmokeEmitters(dt) {
    for (const emitter of this._smokeEmitters) {
      // Emit new particles
      if (this._time >= emitter.nextEmitAt && emitter.particles.length < 5) {
        this._spawnSmokeParticle(emitter);
        emitter.nextEmitAt = this._time + rand(0.4, 1.1);
      }

      // Tick existing smoke particles
      const alive = [];
      for (const p of emitter.particles) {
        p.elapsed += dt;
        if (p.elapsed >= p.duration) {
          p.gfx.parent?.removeChild(p.gfx);
          p.gfx.destroy();
        } else {
          this._tickSmokeParticle(p, dt);
          alive.push(p);
        }
      }
      emitter.particles = alive;
    }
  }

  _spawnSmokeParticle(emitter) {
    const { tileX, tileY, heightPx } = emitter;
    const { x, y } = tileToScreen(tileX, tileY);

    const gfx = new Graphics();
    gfx.circle(0, 0, rand(3, 6));
    gfx.fill({ color: 0xaaaaaa, alpha: 0.45 });

    gfx.x = x + rand(-6, 6);
    gfx.y = y - heightPx + rand(-4, 4);

    this._lifeLayer.addChild(gfx);

    const duration = rand(2.5, 4.5);
    const spiralDir = Math.random() > 0.5 ? 1 : -1;
    const p = {
      gfx,
      elapsed:  0,
      duration,
      spiralDir,
      initX: gfx.x,
      initY: gfx.y,
      initSize: rand(3, 6),
    };
    emitter.particles.push(p);
  }

  _tickSmokeParticle(p, dt) {
    const t = p.elapsed / p.duration;
    const g = p.gfx;

    // Rise upward
    g.y -= 18 * dt;

    // Spiral horizontally
    g.x = p.initX + Math.sin(p.elapsed * 1.8 * p.spiralDir) * 8;

    // Grow and fade
    const scale = lerp(0.5, 1.8, t);
    g.scale.set(scale);
    g.alpha = clamp(0.45 * (1 - t * t), 0, 1);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Ground Shadows (agent sprites)
  // ─────────────────────────────────────────────────────────────────────────

  _updateAgentShadows() {
    for (const [, { shadow, sprite }] of this._agentShadows) {
      if (!sprite.parent) continue; // sprite not yet added to stage
      // Convert agent global position to shadow layer local
      const global = sprite.getGlobalPosition();
      const local  = this._shadowLayer.toLocal(global);
      shadow.x = local.x;
      shadow.y = local.y + (sprite.height ?? 16) * 0.45;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. City Ambient Zone Glow
  // ─────────────────────────────────────────────────────────────────────────

  _updateZoneGlows() {
    // Pulse at 0.5 Hz → period 2s
    const pulse = 0.5 + 0.5 * Math.sin(this._time * Math.PI); // 0..1

    for (const [, entry] of this._zoneGlows) {
      const { gfx, phase, color } = entry;
      const alpha = 0.08 + 0.04 * Math.sin(this._time * Math.PI * 2 * 0.5 + phase);
      gfx.clear();
      gfx.circle(0, 0, 60);
      gfx.fill({ color, alpha: clamp(alpha, 0, 0.15) });
      void pulse; // used implicitly via time-based alpha above
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Road Activity Lines (data packets)
  // ─────────────────────────────────────────────────────────────────────────

  _updateRoadPackets(dt) {
    void dt; // packets managed via particles; just check intervals
    for (const link of this._roadLinks) {
      if (this._time >= link.nextAt) {
        this._spawnRoadPacket(link);
        link.nextAt = this._time + rand(1.2, 3.5);
      }
    }
  }

  _spawnRoadPacket(link) {
    const from = tileToScreen(link.fromZone.tileX, link.fromZone.tileY);
    const to   = tileToScreen(link.toZone.tileX,   link.toZone.tileY);

    // Trail of 3 dots
    const TRAIL = 3;
    for (let i = 0; i < TRAIL; i++) {
      const gfx = new Graphics();
      const r   = clamp(3 - i, 1, 3);
      gfx.circle(0, 0, r);
      gfx.fill({ color: link.color, alpha: 0.9 - i * 0.25 });
      gfx.x = from.x;
      gfx.y = from.y;
      this._lifeLayer.addChild(gfx);

      const dx   = to.x - from.x;
      const dy   = to.y - from.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const spd  = 200; // px/s
      const duration = dist / spd;
      const startDelay = i * 0.06; // stagger trail dots

      this._particles.push({
        gfx,
        elapsed: -startDelay, // negative elapsed acts as delay
        duration,
        fromX: from.x, fromY: from.y,
        toX: to.x, toY: to.y,
        type: 'packet',
        trailAlpha: 0.9 - i * 0.25,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Generic particle stepper
  // ─────────────────────────────────────────────────────────────────────────

  _stepParticles(dt) {
    const alive = [];
    for (const p of this._particles) {
      p.elapsed += dt;
      if (p.elapsed < 0) {
        // Still in start delay — hide particle
        p.gfx.visible = false;
        alive.push(p);
        continue;
      }

      p.gfx.visible = true;
      const t = clamp(p.elapsed / p.duration, 0, 1);

      if (p.type === 'packet') {
        p.gfx.x = lerp(p.fromX, p.toX, t);
        p.gfx.y = lerp(p.fromY, p.toY, t);
        p.gfx.alpha = t < 0.85 ? p.trailAlpha : p.trailAlpha * (1 - (t - 0.85) / 0.15);
      }

      if (t >= 1) {
        p.gfx.parent?.removeChild(p.gfx);
        p.gfx.destroy();
      } else {
        alive.push(p);
      }
    }
    this._particles = alive;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create and start the CityLife system.
 *
 * @param {import('pixi.js').Application} app
 * @param {import('pixi.js').Container}   worldContainer
 * @returns {CityLife}
 *
 * @example
 * const cityLife = initCityLife(app, worldContainer);
 *
 * // After building a tile:
 * cityLife.registerBuiltTile(10, 12, 4);
 * cityLife.registerBuilding(10, 12, 64);
 *
 * // When an agent spawns:
 * cityLife.registerAgent(agent.id, agent.sprite);
 *
 * // When a zone becomes active:
 * cityLife.registerZoneGlow('zone-council', 18, 22, 'council');
 *
 * // Road between two active zones:
 * cityLife.registerRoadLink({ tileX: 10, tileY: 12 }, { tileX: 18, tileY: 22 }, 'advanced');
 */
export function initCityLife(app, worldContainer) {
  const cl = new CityLife(app, worldContainer);
  cl.start();
  return cl;
}
