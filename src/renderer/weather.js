/**
 * weather.js — Visual weather effects for Claude World
 *
 * Renders particles, zone glow indicators, and screen-level effects
 * (vignette, camera shake) driven by the WorldStateManager.
 *
 * Uses PixiJS Graphics with a pre-allocated particle pool (200 particles).
 * Different emitter configurations drive idle dust motes, active sparkles,
 * busy energy trails, and overload warning particles.
 */

import { Container, Graphics, BlurFilter } from 'pixi.js';
import { TILE_WIDTH, TILE_HEIGHT } from './constants.js';
import { ZONE_DEFS } from './zones.js';
import { tileToScreen } from './tiles.js';

// ── Particle pool size ──────────────────────────────────────────────
const POOL_SIZE = 200;

// ── Emitter configs per weather/activity state ──────────────────────

/**
 * @typedef {Object} EmitterConfig
 * @property {number} maxActive   - Max particles alive at once
 * @property {number} spawnRate   - Particles spawned per second
 * @property {number} color       - Base color (hex)
 * @property {number} minSize     - Min radius in px
 * @property {number} maxSize     - Max radius in px
 * @property {number} minLife     - Min lifetime in seconds
 * @property {number} maxLife     - Max lifetime in seconds
 * @property {number} minSpeed    - Min speed px/s
 * @property {number} maxSpeed    - Max speed px/s
 * @property {number} alpha       - Starting alpha
 * @property {boolean} fadeOut    - Whether to fade alpha over lifetime
 * @property {'area'|'zone'|'edge'} emitMode - Where particles spawn
 */

/** @type {Record<string, EmitterConfig>} */
const EMITTER_CONFIGS = {
  idle: {
    maxActive: 20,
    spawnRate: 3,
    color: 0xffffff,
    minSize: 1,
    maxSize: 2,
    minLife: 4,
    maxLife: 8,
    minSpeed: 5,
    maxSpeed: 15,
    alpha: 0.3,
    fadeOut: true,
    emitMode: 'area',
  },
  active: {
    maxActive: 30,
    spawnRate: 8,
    color: 0xffd700,
    minSize: 1,
    maxSize: 3,
    minLife: 1.5,
    maxLife: 3,
    minSpeed: 15,
    maxSpeed: 35,
    alpha: 0.6,
    fadeOut: true,
    emitMode: 'zone',
  },
  busy: {
    maxActive: 60,
    spawnRate: 20,
    color: 0x4a9eff,
    minSize: 1,
    maxSize: 3,
    minLife: 0.8,
    maxLife: 2,
    minSpeed: 40,
    maxSpeed: 80,
    alpha: 0.7,
    fadeOut: true,
    emitMode: 'zone',
  },
  overload: {
    maxActive: 80,
    spawnRate: 30,
    color: 0xff4a6a,
    minSize: 2,
    maxSize: 4,
    minLife: 0.5,
    maxLife: 1.5,
    minSpeed: 50,
    maxSpeed: 100,
    alpha: 0.9,
    fadeOut: true,
    emitMode: 'edge',
  },
};

// ── Particle structure ──────────────────────────────────────────────

/**
 * @typedef {Object} Particle
 * @property {number} x
 * @property {number} y
 * @property {number} vx       - Velocity x (px/s)
 * @property {number} vy       - Velocity y (px/s)
 * @property {number} life     - Remaining life (seconds)
 * @property {number} maxLife  - Total lifetime (seconds)
 * @property {number} color    - Fill color
 * @property {number} size     - Radius in px
 * @property {number} alpha    - Current alpha
 * @property {boolean} active  - Whether in use
 * @property {Graphics} gfx    - PixiJS Graphics object
 */

// ── Utility ─────────────────────────────────────────────────────────

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

// ── WeatherSystem class ─────────────────────────────────────────────

export class WeatherSystem {
  /**
   * @param {import('pixi.js').Container} worldContainer - The root world container
   */
  constructor(worldContainer) {
    this._world = worldContainer;

    // Particle layer sits above fog (zIndex 3)
    this._particleContainer = new Container();
    this._particleContainer.zIndex = 3;
    this._particleContainer.sortableChildren = false;
    this._world.addChild(this._particleContainer);

    // Overlay layer for screen effects (vignette, tint) — added to stage
    this._overlayContainer = new Container();
    this._overlayContainer.zIndex = 100;

    // Zone activity indicator layer
    this._zoneIndicatorContainer = new Container();
    this._zoneIndicatorContainer.zIndex = 2.5;
    this._world.addChild(this._zoneIndicatorContainer);

    /** @type {Particle[]} */
    this._pool = [];

    /** @type {string} Current activity state */
    this._currentState = 'idle';

    /** @type {string} Current weather */
    this._currentWeather = 'cloudy';

    /** @type {number} Mood score 0..1 */
    this._moodScore = 0.5;

    /** @type {Map<string, number>} Active zone task counts */
    this._activeZones = new Map();

    /** @type {number} Spawn accumulator */
    this._spawnAccum = 0;

    /** @type {Graphics|null} Vignette overlay */
    this._vignette = null;

    /** @type {boolean} Whether vignette is currently shown */
    this._vignetteActive = false;

    /** @type {number} Camera shake offset x */
    this._shakeX = 0;
    /** @type {number} Camera shake offset y */
    this._shakeY = 0;
    /** @type {{ x: number, y: number }|null} Original world position before shake */
    this._preShakePos = null;

    /** @type {Map<string, Graphics>} Zone indicator graphics */
    this._zoneIndicators = new Map();

    /** @type {Map<string, Graphics>} Zone gear icons */
    this._zoneGears = new Map();

    /** @type {number} Gear rotation angle */
    this._gearAngle = 0;

    // Pre-allocate particle pool
    this._initPool();

    // Pre-compute zone screen positions
    this._zonePositions = new Map();
    for (const zone of ZONE_DEFS) {
      const pos = tileToScreen(
        zone.tileX + zone.w / 2,
        zone.tileY + zone.h / 2
      );
      this._zonePositions.set(zone.id, {
        x: pos.x,
        y: pos.y,
        zone,
      });
    }
  }

  // ── Initialization ─────────────────────────────────────────────────

  /**
   * Pre-allocate the particle pool.
   * @private
   */
  _initPool() {
    for (let i = 0; i < POOL_SIZE; i++) {
      const gfx = new Graphics();
      gfx.visible = false;
      this._particleContainer.addChild(gfx);

      this._pool.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        color: 0xffffff,
        size: 2,
        alpha: 1,
        active: false,
        gfx,
      });
    }
  }

  // ── State update from WorldStateManager ────────────────────────────

  /**
   * Update the weather system from a world state snapshot.
   * @param {{ state: string, weather: string, moodScore: number }} snapshot
   */
  setState(snapshot) {
    const stateChanged = this._currentState !== snapshot.state;

    this._currentState = snapshot.state;
    this._currentWeather = snapshot.weather;
    this._moodScore = snapshot.moodScore;

    if (stateChanged) {
      this._onStateChanged();
    }
  }

  /**
   * Update which zones have active tasks.
   * @param {Map<string, number>} activeZones
   */
  setActiveZones(activeZones) {
    this._activeZones = new Map(activeZones);
    this._updateZoneIndicators();
  }

  // ── Per-frame update ───────────────────────────────────────────────

  /**
   * Update all weather effects. Call once per frame.
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    const config = EMITTER_CONFIGS[this._currentState] || EMITTER_CONFIGS.idle;

    // Spawn new particles
    this._spawnAccum += config.spawnRate * dt;
    while (this._spawnAccum >= 1) {
      this._spawnAccum -= 1;
      this._spawnParticle(config);
    }

    // Update existing particles
    for (const p of this._pool) {
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.gfx.visible = false;
        continue;
      }

      // Move
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Fade out
      const lifeRatio = p.life / p.maxLife;
      const currentAlpha = config.fadeOut ? p.alpha * lifeRatio : p.alpha;

      // Redraw at new position
      p.gfx.clear();
      p.gfx.circle(0, 0, p.size);
      p.gfx.fill({ color: p.color, alpha: currentAlpha });
      p.gfx.position.set(p.x, p.y);
      p.gfx.visible = true;
    }

    // Update gear rotation for zone indicators
    this._gearAngle += dt * 2;
    this._updateGearRotations();

    // Screen effects
    this._updateScreenEffects(dt);
  }

  // ── Particle spawning ──────────────────────────────────────────────

  /**
   * Spawn a single particle using the given emitter config.
   * @param {EmitterConfig} config
   * @private
   */
  _spawnParticle(config) {
    // Count active particles
    const activeCount = this._pool.filter((p) => p.active).length;
    if (activeCount >= config.maxActive) return;

    // Find an inactive particle
    const p = this._pool.find((p) => !p.active);
    if (!p) return;

    // Determine spawn position based on emitMode
    const spawnPos = this._getSpawnPosition(config.emitMode);

    p.x = spawnPos.x;
    p.y = spawnPos.y;
    p.size = rand(config.minSize, config.maxSize);
    p.color = config.color;
    p.alpha = config.alpha;
    p.maxLife = rand(config.minLife, config.maxLife);
    p.life = p.maxLife;

    // Velocity: random direction with configured speed
    const speed = rand(config.minSpeed, config.maxSpeed);
    const angle = Math.random() * Math.PI * 2;

    // For idle state, bias upward (negative y)
    if (config.emitMode === 'area') {
      p.vx = Math.cos(angle) * speed * 0.3;
      p.vy = -Math.abs(Math.sin(angle)) * speed;
    } else if (config.emitMode === 'edge') {
      // Edge particles fly inward from screen edges
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
    } else {
      // Zone: upward sparkle
      p.vx = Math.cos(angle) * speed * 0.5;
      p.vy = -Math.abs(speed * 0.8) + Math.sin(angle) * speed * 0.3;
    }

    p.active = true;
    p.gfx.visible = true;
  }

  /**
   * Get a spawn position based on the emit mode.
   * @param {'area'|'zone'|'edge'} mode
   * @returns {{ x: number, y: number }}
   * @private
   */
  _getSpawnPosition(mode) {
    if (mode === 'zone') {
      // Spawn near an active zone, or fall back to random area
      const activeIds = [...this._activeZones.keys()];
      if (activeIds.length > 0) {
        const zoneId = activeIds[randInt(0, activeIds.length - 1)];
        const zp = this._zonePositions.get(zoneId);
        if (zp) {
          return {
            x: zp.x + rand(-TILE_WIDTH * 2, TILE_WIDTH * 2),
            y: zp.y + rand(-TILE_HEIGHT * 2, TILE_HEIGHT * 2),
          };
        }
      }
      // Fallback to area mode
      return this._getAreaSpawnPosition();
    }

    if (mode === 'edge') {
      // Spawn from screen edges — use a large area around the world center
      const centerX = 0;
      const centerY = 0;
      const radius = 600;
      const angle = Math.random() * Math.PI * 2;
      return {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      };
    }

    // 'area' mode: random position across the visible world
    return this._getAreaSpawnPosition();
  }

  /**
   * Get a random position across the world area.
   * @returns {{ x: number, y: number }}
   * @private
   */
  _getAreaSpawnPosition() {
    // Spread across the approximate world bounds
    return {
      x: rand(-400, 400),
      y: rand(-300, 300),
    };
  }

  // ── Zone activity indicators ───────────────────────────────────────

  /**
   * Update zone glow indicators based on active zones.
   * @private
   */
  _updateZoneIndicators() {
    // Remove indicators for zones that are no longer active
    for (const [zoneId, gfx] of this._zoneIndicators) {
      if (!this._activeZones.has(zoneId)) {
        this._zoneIndicatorContainer.removeChild(gfx);
        this._zoneIndicators.delete(zoneId);
      }
    }

    // Remove gear icons for inactive zones
    for (const [zoneId, gfx] of this._zoneGears) {
      if (!this._activeZones.has(zoneId)) {
        this._zoneIndicatorContainer.removeChild(gfx);
        this._zoneGears.delete(zoneId);
      }
    }

    // Create or update indicators for active zones
    for (const [zoneId, taskCount] of this._activeZones) {
      const zp = this._zonePositions.get(zoneId);
      if (!zp) continue;

      const isOverloaded = this._currentState === 'overload';

      // Upward glow rectangle
      if (!this._zoneIndicators.has(zoneId)) {
        const glow = new Graphics();
        this._zoneIndicatorContainer.addChild(glow);
        this._zoneIndicators.set(zoneId, glow);
      }

      const glow = this._zoneIndicators.get(zoneId);
      glow.clear();

      const glowWidth = zp.zone.w * TILE_WIDTH * 0.4;
      const glowHeight = 30;
      const glowColor = isOverloaded ? 0xff4a6a : 0x4a9eff;
      const glowAlpha = isOverloaded
        ? 0.3 + Math.sin(Date.now() / 200) * 0.15
        : 0.15 + taskCount * 0.05;

      // Draw gradient-like glow (bottom opaque, top transparent)
      for (let i = 0; i < 5; i++) {
        const t = i / 5;
        const yOff = -glowHeight * t;
        const segAlpha = glowAlpha * (1 - t);
        glow.rect(-glowWidth / 2, yOff - 4, glowWidth, 4);
        glow.fill({ color: glowColor, alpha: segAlpha });
      }

      glow.position.set(zp.x, zp.y - zp.zone.height * (TILE_HEIGHT / 2) - 10);

      // Gear icon for running tasks
      if (!this._zoneGears.has(zoneId)) {
        const gear = new Graphics();
        this._zoneIndicatorContainer.addChild(gear);
        this._zoneGears.set(zoneId, gear);
      }

      const gear = this._zoneGears.get(zoneId);
      this._drawGear(gear, isOverloaded ? 0xff4a6a : 0xffd700);
      gear.position.set(
        zp.x + zp.zone.w * TILE_WIDTH * 0.25,
        zp.y - zp.zone.height * (TILE_HEIGHT / 2) - 20
      );
    }
  }

  /**
   * Draw a small gear icon using Graphics.
   * @param {Graphics} gfx
   * @param {number} color
   * @private
   */
  _drawGear(gfx, color) {
    gfx.clear();
    const r = 4;
    const teeth = 6;
    const toothSize = 2;

    // Inner circle
    gfx.circle(0, 0, r);
    gfx.fill({ color, alpha: 0.8 });

    // Teeth
    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2 + this._gearAngle;
      const tx = Math.cos(angle) * (r + toothSize);
      const ty = Math.sin(angle) * (r + toothSize);
      gfx.circle(tx, ty, toothSize * 0.8);
      gfx.fill({ color, alpha: 0.6 });
    }

    // Center hole
    gfx.circle(0, 0, 1.5);
    gfx.fill({ color: 0x000000, alpha: 0.4 });
  }

  /**
   * Update gear icon rotations.
   * @private
   */
  _updateGearRotations() {
    for (const [, gear] of this._zoneGears) {
      gear.rotation = this._gearAngle;
    }
  }

  // ── Screen effects ─────────────────────────────────────────────────

  /**
   * Update screen-level effects (vignette, camera shake).
   * @param {number} dt - Delta time in seconds
   * @private
   */
  _updateScreenEffects(dt) {
    const isStorm = this._currentState === 'overload';

    // Camera shake during storms
    if (isStorm) {
      // Undo previous shake
      if (this._preShakePos) {
        this._world.position.set(
          this._preShakePos.x,
          this._preShakePos.y
        );
      }

      // Apply new shake
      this._preShakePos = {
        x: this._world.position.x,
        y: this._world.position.y,
      };
      this._shakeX = (Math.random() - 0.5) * 2;
      this._shakeY = (Math.random() - 0.5) * 2;
      this._world.position.x += this._shakeX;
      this._world.position.y += this._shakeY;
    } else if (this._preShakePos) {
      // Restore position when storm ends
      this._world.position.set(
        this._preShakePos.x,
        this._preShakePos.y
      );
      this._preShakePos = null;
      this._shakeX = 0;
      this._shakeY = 0;
    }

    // Vignette overlay during storms
    if (isStorm && !this._vignetteActive) {
      this._showVignette();
    } else if (!isStorm && this._vignetteActive) {
      this._hideVignette();
    }

    // Update vignette pulse during storm
    if (this._vignetteActive && this._vignette) {
      const pulse = 0.3 + Math.sin(Date.now() / 500) * 0.1;
      this._vignette.alpha = pulse;
    }
  }

  /**
   * Show the dark vignette overlay.
   * @private
   */
  _showVignette() {
    if (!this._vignette) {
      this._vignette = new Graphics();
      // Draw a dark border ring as a vignette approximation
      // Full-screen dark rectangle with a transparent center hole
      const w = 2000;
      const h = 2000;

      // Outer dark rect
      this._vignette.rect(-w / 2, -h / 2, w, h);
      this._vignette.fill({ color: 0x1a0000, alpha: 0.6 });

      // Cut out center (lighter area) by drawing a lighter ellipse on top
      this._vignette.ellipse(0, 0, w * 0.3, h * 0.3);
      this._vignette.fill({ color: 0x1a0000, alpha: 0 });
    }

    if (!this._vignette.parent) {
      // Add to stage directly so it overlays everything
      if (this._world.parent) {
        this._world.parent.addChild(this._vignette);
      }
    }
    this._vignette.visible = true;
    this._vignette.alpha = 0.3;
    this._vignetteActive = true;
  }

  /**
   * Hide the dark vignette overlay.
   * @private
   */
  _hideVignette() {
    if (this._vignette) {
      this._vignette.visible = false;
    }
    this._vignetteActive = false;
  }

  // ── State change handler ───────────────────────────────────────────

  /**
   * Handle transitions between activity states.
   * Clears particles that no longer match the new state's config.
   * @private
   */
  _onStateChanged() {
    // Kill all current particles for a clean transition
    for (const p of this._pool) {
      if (p.active) {
        // Give them a short remaining life so they fade out
        p.life = Math.min(p.life, 0.3);
      }
    }

    // Reset spawn accumulator
    this._spawnAccum = 0;

    // Update zone indicators for new state
    this._updateZoneIndicators();
  }

  // ── Sunny day integration ──────────────────────────────────────────

  /**
   * Get a brightness boost value for the DayNightCycle to apply
   * during sunny weather. Returns 0 for non-sunny, up to 0.1 for sunny.
   * @returns {number}
   */
  getSunnyBoost() {
    if (this._currentWeather === 'sunny') {
      return 0.08;
    }
    if (this._currentWeather === 'clear') {
      return 0.03;
    }
    return 0;
  }

  /**
   * Get a tint color modifier based on weather.
   * Returns a tint to blend with the day/night cycle.
   * @returns {number} Hex color tint
   */
  getWeatherTint() {
    switch (this._currentWeather) {
      case 'sunny': return 0xfff8e0; // Warm golden
      case 'clear': return 0xffffff; // Neutral
      case 'cloudy': return 0xe8e8f0; // Slightly cool
      case 'rain': return 0xc0c8d8; // Grey-blue
      case 'storm': return 0x8080a0; // Dark grey-purple
      default: return 0xffffff;
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────────

  /**
   * Destroy the weather system and clean up all graphics.
   */
  destroy() {
    // Remove all particles
    for (const p of this._pool) {
      p.gfx.destroy();
    }
    this._pool.length = 0;

    // Remove zone indicators
    for (const [, gfx] of this._zoneIndicators) {
      gfx.destroy();
    }
    this._zoneIndicators.clear();

    for (const [, gfx] of this._zoneGears) {
      gfx.destroy();
    }
    this._zoneGears.clear();

    // Remove containers
    if (this._particleContainer.parent) {
      this._particleContainer.parent.removeChild(this._particleContainer);
    }
    this._particleContainer.destroy({ children: true });

    if (this._zoneIndicatorContainer.parent) {
      this._zoneIndicatorContainer.parent.removeChild(this._zoneIndicatorContainer);
    }
    this._zoneIndicatorContainer.destroy({ children: true });

    // Remove vignette
    if (this._vignette) {
      if (this._vignette.parent) {
        this._vignette.parent.removeChild(this._vignette);
      }
      this._vignette.destroy();
      this._vignette = null;
    }
  }
}
