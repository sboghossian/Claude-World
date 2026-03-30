/**
 * particles.js — Advanced Particle Effects System for Claude World
 *
 * PixiJS Graphics-based particle system with pooling, configurable emitters,
 * and pre-built presets for celebrations, ambience, and game events.
 * All rendering uses PixiJS Graphics primitives (no textures required).
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

const lerp  = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const rand  = (lo, hi) => lo + Math.random() * (hi - lo);
const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
const TAU = Math.PI * 2;

/** Ease-out cubic for smooth deceleration. */
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

/** Ease-in quad for acceleration. */
function easeInQuad(t) { return t * t; }

/**
 * Interpolate two 0xRRGGBB hex colors.
 * @param {number} c1
 * @param {number} c2
 * @param {number} t  0..1
 * @returns {number}
 */
function lerpColor(c1, c2, t) {
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  const r = Math.round(lerp(r1, r2, t));
  const g = Math.round(lerp(g1, g2, t));
  const b = Math.round(lerp(b1, b2, t));
  return (r << 16) | (g << 8) | b;
}

/** Pick a random element from an array. */
function pick(arr) { return arr[randInt(0, arr.length - 1)]; }

// ── Palette (matches design tokens) ──────────────────────────────────────────

const PALETTE = {
  purple:  0xa855f7,
  blue:    0x4a9eff,
  gold:    0xffd700,
  amber:   0xffb84a,
  green:   0x4aff8a,
  red:     0xff4a6a,
  white:   0xffffff,
  pink:    0xec4899,
  cyan:    0x22d3ee,
  orange:  0xff6b35,
};

// ── Particle struct ──────────────────────────────────────────────────────────

/**
 * A single particle. Properties are mutated in-place for performance.
 * The `gfx` Graphics object is reused across particle lifetimes (pooling).
 */
class Particle {
  constructor() {
    this.gfx = new Graphics();
    this.reset();
  }

  reset() {
    this.alive     = false;
    this.x         = 0;
    this.y         = 0;
    this.vx        = 0;
    this.vy        = 0;
    this.ax        = 0;
    this.ay        = 0;
    this.life      = 0;
    this.maxLife   = 1;
    this.size      = 4;
    this.sizeEnd   = 0;
    this.rotation  = 0;
    this.spin      = 0;
    this.colorStart = 0xffffff;
    this.colorEnd   = 0xffffff;
    this.alpha     = 1;
    this.fadeStart = 0.6;   // fraction of life when fade-out begins
    this.shape     = 'circle'; // 'circle' | 'rect' | 'star' | 'line' | 'text'
    this.width     = 4;     // for rect shape
    this.height    = 4;
    this.text      = '';    // for text shape
    this.gravity   = 0;
    this.drag      = 0;     // 0..1 per second
    this.custom    = null;  // arbitrary per-preset data
    this.gfx.visible = false;
    this.gfx.alpha = 0;
  }
}

// ── Particle Pool ────────────────────────────────────────────────────────────

const POOL_SIZE = 2000;

class ParticlePool {
  constructor(container) {
    /** @type {Particle[]} */
    this._pool = [];
    /** @type {Particle[]} */
    this._active = [];
    this._container = container;

    for (let i = 0; i < POOL_SIZE; i++) {
      const p = new Particle();
      this._pool.push(p);
      container.addChild(p.gfx);
    }
  }

  /** Acquire a dead particle from the pool. Returns null if exhausted. */
  acquire() {
    // Try pool first
    if (this._pool.length > 0) {
      const p = this._pool.pop();
      p.reset();
      p.alive = true;
      p.gfx.visible = true;
      this._active.push(p);
      return p;
    }
    // Pool exhausted — reclaim oldest active particle
    if (this._active.length > 0) {
      const p = this._active.shift();
      p.reset();
      p.alive = true;
      p.gfx.visible = true;
      this._active.push(p);
      return p;
    }
    return null;
  }

  /** Return a particle to the pool. */
  release(p) {
    p.alive = false;
    p.gfx.visible = false;
    p.gfx.clear();
    const idx = this._active.indexOf(p);
    if (idx !== -1) this._active.splice(idx, 1);
    this._pool.push(p);
  }

  /** Iterate active particles. Callback returns true to keep, false to release. */
  forEach(fn) {
    for (let i = this._active.length - 1; i >= 0; i--) {
      const p = this._active[i];
      if (!fn(p)) {
        this.release(p);
      }
    }
  }

  get activeCount() { return this._active.length; }

  destroy() {
    for (const p of this._active) {
      p.gfx.destroy();
    }
    for (const p of this._pool) {
      p.gfx.destroy();
    }
    this._active.length = 0;
    this._pool.length = 0;
  }
}

// ── Emitter ──────────────────────────────────────────────────────────────────

/**
 * Continuous emitter that spawns particles over time.
 * Configure via `config` then call `start()` / `stop()`.
 */
class Emitter {
  constructor(pool, config = {}) {
    this._pool = pool;
    this.x = config.x ?? 0;
    this.y = config.y ?? 0;
    this.areaWidth  = config.areaWidth  ?? 0;
    this.areaHeight = config.areaHeight ?? 0;
    this.direction  = config.direction  ?? -Math.PI / 2; // upward
    this.spread     = config.spread     ?? TAU;          // full circle
    this.rate       = config.rate       ?? 30;           // particles/sec
    this.config     = config;
    this._accum     = 0;
    this.active     = false;
  }

  start() { this.active = true; this._accum = 0; }
  stop()  { this.active = false; }

  update(dt) {
    if (!this.active) return;
    this._accum += dt * this.rate;
    while (this._accum >= 1) {
      this._accum -= 1;
      this._spawnOne();
    }
  }

  _spawnOne() {
    const p = this._pool.acquire();
    if (!p) return;
    const c = this.config;

    // Position (point or area)
    p.x = this.x + (this.areaWidth  ? rand(-this.areaWidth / 2, this.areaWidth / 2) : 0);
    p.y = this.y + (this.areaHeight ? rand(-this.areaHeight / 2, this.areaHeight / 2) : 0);

    // Direction + spread
    const angle = this.direction + rand(-this.spread / 2, this.spread / 2);
    const speed = rand(c.speedMin ?? 40, c.speedMax ?? 120);
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;

    // Acceleration / gravity
    p.ax = c.ax ?? 0;
    p.ay = c.ay ?? 0;
    p.gravity = c.gravity ?? 0;
    p.drag = c.drag ?? 0;

    // Lifetime
    p.life    = rand(c.lifeMin ?? 0.5, c.lifeMax ?? 1.5);
    p.maxLife = p.life;

    // Size
    p.size    = rand(c.sizeMin ?? 2, c.sizeMax ?? 6);
    p.sizeEnd = c.sizeEnd ?? 0;
    p.width   = c.width ?? p.size;
    p.height  = c.height ?? p.size;

    // Color
    p.colorStart = c.colorStart ?? 0xffffff;
    p.colorEnd   = c.colorEnd   ?? c.colorStart ?? 0xffffff;
    if (c.colors) {
      p.colorStart = pick(c.colors);
      p.colorEnd   = c.colorEnd ?? p.colorStart;
    }

    // Rotation
    p.rotation = rand(c.rotationMin ?? 0, c.rotationMax ?? TAU);
    p.spin     = rand(c.spinMin ?? 0, c.spinMax ?? 0);

    // Fade
    p.fadeStart = c.fadeStart ?? 0.6;

    // Shape
    p.shape = c.shape ?? 'circle';
    p.text  = c.text ?? '';
    if (c.texts) p.text = pick(c.texts);

    // Custom data
    if (c.customInit) c.customInit(p);

    return p;
  }
}

// ── Preset Definitions ───────────────────────────────────────────────────────

const PRESETS = {};

// (a) Fireworks — burst upward, explode into colored stars
PRESETS.fireworks = {
  /** Spawn a firework that launches, then bursts. */
  emit(system, x, y, opts = {}) {
    const count = opts.count ?? 3;
    for (let i = 0; i < count; i++) {
      const delay = i * rand(150, 400);
      setTimeout(() => system._launchFirework(
        x + rand(-80, 80),
        y,
        opts
      ), delay);
    }
  },
};

// (b) Confetti — colorful rectangles tumbling down
PRESETS.confetti = {
  emit(system, x, y, opts = {}) {
    const count = opts.count ?? 200;
    const spread = opts.spread ?? 400;
    const colors = [PALETTE.purple, PALETTE.blue, PALETTE.gold, PALETTE.pink, PALETTE.green, PALETTE.red, PALETTE.cyan];
    for (let i = 0; i < count; i++) {
      const p = system._pool.acquire();
      if (!p) break;
      p.x = x + rand(-spread / 2, spread / 2);
      p.y = y + rand(-spread, -20);
      p.vx = rand(-60, 60);
      p.vy = rand(30, 120);
      p.gravity = rand(60, 140);
      p.drag = 0.02;
      p.life = rand(2, 4);
      p.maxLife = p.life;
      p.rotation = rand(0, TAU);
      p.spin = rand(-4, 4);
      p.colorStart = pick(colors);
      p.colorEnd = p.colorStart;
      p.shape = Math.random() < 0.3 ? 'circle' : 'rect';
      p.size = rand(3, 8);
      p.sizeEnd = p.size;
      p.width = rand(4, 12);
      p.height = rand(4, 12);
      p.fadeStart = 0.75;
    }
  },
};

// (c) Sparkle trail — tiny star particles following a point
PRESETS.sparkle = {
  emit(system, x, y, opts = {}) {
    const count = opts.count ?? 12;
    for (let i = 0; i < count; i++) {
      const p = system._pool.acquire();
      if (!p) break;
      const angle = rand(0, TAU);
      const speed = rand(20, 80);
      p.x = x + rand(-6, 6);
      p.y = y + rand(-6, 6);
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = rand(0.3, 0.8);
      p.maxLife = p.life;
      p.size = rand(2, 5);
      p.sizeEnd = 0;
      p.colorStart = pick([PALETTE.gold, PALETTE.white, PALETTE.amber]);
      p.colorEnd = 0xffffff;
      p.shape = 'star';
      p.drag = 0.05;
      p.fadeStart = 0.3;
    }
  },
};

// (d) Smoke — soft gray circles rising slowly, expanding, fading
PRESETS.smoke = {
  emit(system, x, y, opts = {}) {
    const count = opts.count ?? 30;
    for (let i = 0; i < count; i++) {
      const p = system._pool.acquire();
      if (!p) break;
      p.x = x + rand(-10, 10);
      p.y = y + rand(-5, 5);
      p.vx = rand(-15, 15);
      p.vy = rand(-40, -80);
      p.life = rand(1.5, 3.0);
      p.maxLife = p.life;
      p.size = rand(6, 14);
      p.sizeEnd = rand(20, 40);
      p.colorStart = 0x888888;
      p.colorEnd = 0x444444;
      p.shape = 'circle';
      p.drag = 0.03;
      p.fadeStart = 0.3;
      p.gravity = -10;
    }
  },
};

// (e) Fire — orange-red particles rising fast, shrinking, yellow core
PRESETS.fire = {
  emit(system, x, y, opts = {}) {
    const count = opts.count ?? 40;
    for (let i = 0; i < count; i++) {
      const p = system._pool.acquire();
      if (!p) break;
      p.x = x + rand(-12, 12);
      p.y = y + rand(-4, 4);
      p.vx = rand(-20, 20);
      p.vy = rand(-120, -200);
      p.life = rand(0.4, 1.0);
      p.maxLife = p.life;
      p.size = rand(4, 10);
      p.sizeEnd = 0;
      p.gravity = -40;
      const isCore = Math.random() < 0.3;
      p.colorStart = isCore ? 0xffee44 : pick([0xff4500, 0xff6b35, 0xff8c00]);
      p.colorEnd = 0x330000;
      p.shape = 'circle';
      p.drag = 0.02;
      p.fadeStart = 0.4;
    }
  },
};

// (f) Magic dust — purple/blue glowing particles spiraling around a point
PRESETS.magicDust = {
  emit(system, x, y, opts = {}) {
    const count = opts.count ?? 40;
    for (let i = 0; i < count; i++) {
      const p = system._pool.acquire();
      if (!p) break;
      const angle = (i / count) * TAU;
      const radius = rand(20, 60);
      p.x = x + Math.cos(angle) * radius;
      p.y = y + Math.sin(angle) * radius;
      // Tangential velocity for spiral motion
      p.vx = -Math.sin(angle) * rand(40, 90);
      p.vy = Math.cos(angle) * rand(40, 90);
      p.life = rand(1.0, 2.0);
      p.maxLife = p.life;
      p.size = rand(2, 5);
      p.sizeEnd = 0;
      p.colorStart = pick([PALETTE.purple, 0x7c3aed, PALETTE.blue, PALETTE.cyan]);
      p.colorEnd = 0x1a1a2e;
      p.shape = 'circle';
      p.drag = 0.04;
      p.fadeStart = 0.4;
      p.gravity = -20;
      // Store spiral data
      p.custom = { cx: x, cy: y, angle, radius, angularSpeed: rand(2, 4) };
    }
  },
};

// (g) Level up — golden particles shooting up then raining down
PRESETS.levelUp = {
  emit(system, x, y, opts = {}) {
    const count = opts.count ?? 80;
    for (let i = 0; i < count; i++) {
      const p = system._pool.acquire();
      if (!p) break;
      const angle = rand(-Math.PI * 0.8, -Math.PI * 0.2); // mostly upward
      const speed = rand(150, 350);
      p.x = x + rand(-30, 30);
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.gravity = 200;
      p.life = rand(1.5, 3.0);
      p.maxLife = p.life;
      p.size = rand(3, 7);
      p.sizeEnd = 1;
      p.colorStart = pick([PALETTE.gold, PALETTE.amber, PALETTE.white, 0xffe066]);
      p.colorEnd = PALETTE.amber;
      p.shape = Math.random() < 0.4 ? 'star' : 'circle';
      p.drag = 0.01;
      p.fadeStart = 0.7;
      p.spin = rand(-3, 3);
      p.rotation = rand(0, TAU);
    }
  },
};

// (h) Zone complete — ring of particles expanding outward from zone center
PRESETS.zoneComplete = {
  emit(system, x, y, opts = {}) {
    const count = opts.count ?? 60;
    const color = opts.color ?? PALETTE.purple;
    for (let i = 0; i < count; i++) {
      const p = system._pool.acquire();
      if (!p) break;
      const angle = (i / count) * TAU;
      const speed = rand(80, 200);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = rand(1.0, 2.0);
      p.maxLife = p.life;
      p.size = rand(3, 6);
      p.sizeEnd = 0;
      p.colorStart = color;
      p.colorEnd = PALETTE.white;
      p.shape = 'circle';
      p.drag = 0.03;
      p.fadeStart = 0.5;
    }
  },
};

// (i) Rain of emojis — emoji text particles falling
PRESETS.emojiRain = {
  emit(system, x, y, opts = {}) {
    const count = opts.count ?? 30;
    const emojis = opts.emojis ?? ['🎉', '🏆', '⭐', '🎊', '✨', '🔥', '💎'];
    const spreadX = opts.spread ?? 600;
    for (let i = 0; i < count; i++) {
      const p = system._pool.acquire();
      if (!p) break;
      p.x = x + rand(-spreadX / 2, spreadX / 2);
      p.y = y + rand(-200, -40);
      p.vx = rand(-20, 20);
      p.vy = rand(40, 120);
      p.gravity = rand(20, 50);
      p.life = rand(2, 4);
      p.maxLife = p.life;
      p.size = rand(16, 32);
      p.sizeEnd = p.size;
      p.rotation = rand(-0.3, 0.3);
      p.spin = rand(-1.5, 1.5);
      p.shape = 'text';
      p.text = pick(emojis);
      p.colorStart = 0xffffff;
      p.colorEnd = 0xffffff;
      p.fadeStart = 0.7;
    }
  },
};

// (j) Digital matrix — green characters falling like The Matrix
PRESETS.matrix = {
  emit(system, x, y, opts = {}) {
    const count = opts.count ?? 80;
    const spreadX = opts.spread ?? 500;
    const chars = '01アイウエオカキクケコ日月火水木金土ABCDEF<>/{}[]'.split('');
    for (let i = 0; i < count; i++) {
      const p = system._pool.acquire();
      if (!p) break;
      p.x = x + rand(-spreadX / 2, spreadX / 2);
      p.y = y + rand(-300, -20);
      p.vx = 0;
      p.vy = rand(100, 300);
      p.life = rand(1.5, 3.5);
      p.maxLife = p.life;
      p.size = rand(10, 18);
      p.sizeEnd = p.size;
      p.shape = 'text';
      p.text = pick(chars);
      p.colorStart = 0x00ff41;
      p.colorEnd = 0x003300;
      p.fadeStart = 0.5;
      p.spin = 0;
      p.rotation = 0;
      // Randomize character mid-flight
      p.custom = { chars, changeInterval: rand(0.1, 0.3), changeTimer: 0 };
    }
  },
};

// ── ParticleSystem ───────────────────────────────────────────────────────────

export class ParticleSystem {
  /**
   * @param {import('pixi.js').Application} app  The PixiJS application
   */
  constructor(app) {
    this._app = app;

    // Container sits at the top of the stage for screen-space effects
    this._container = new Container();
    this._container.zIndex = 9999;
    this._container.sortableChildren = false;
    app.stage.addChild(this._container);

    // Particle pool
    this._pool = new ParticlePool(this._container);

    // Active emitters (continuous effects)
    /** @type {Emitter[]} */
    this._emitters = [];

    // Reusable text style cache (keyed by fontSize)
    this._textCache = new Map();

    // Bind update to ticker
    this._tick = this._tick.bind(this);
    app.ticker.add(this._tick);

    // Listen for game events
    this._bindEvents();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Emit a preset effect at the given position.
   * @param {string} preset   Preset name (e.g. 'fireworks', 'confetti', 'sparkle')
   * @param {number} x        Screen X
   * @param {number} y        Screen Y
   * @param {object} [opts]   Override options for the preset
   */
  emit(preset, x, y, opts = {}) {
    const def = PRESETS[preset];
    if (!def) {
      console.warn(`[ParticleSystem] Unknown preset: "${preset}"`);
      return;
    }
    def.emit(this, x, y, opts);
  }

  /**
   * Create a continuous emitter.
   * @param {object} config  Emitter config
   * @returns {Emitter}
   */
  createEmitter(config) {
    const emitter = new Emitter(this._pool, config);
    this._emitters.push(emitter);
    return emitter;
  }

  /**
   * Remove and stop an emitter.
   * @param {Emitter} emitter
   */
  removeEmitter(emitter) {
    emitter.stop();
    const idx = this._emitters.indexOf(emitter);
    if (idx !== -1) this._emitters.splice(idx, 1);
  }

  /**
   * Update all particles and emitters. Called automatically by the ticker.
   * @param {number} dt  Delta time in seconds (if calling manually)
   */
  update(dt) {
    // Update emitters
    for (const e of this._emitters) {
      e.update(dt);
    }

    // Update particles
    this._pool.forEach((p) => {
      p.life -= dt;
      if (p.life <= 0) return false; // release

      const t = 1 - (p.life / p.maxLife); // 0..1 normalized age

      // Physics
      p.vx += p.ax * dt;
      p.vy += (p.ay + p.gravity) * dt;
      if (p.drag > 0) {
        const factor = Math.pow(1 - p.drag, dt * 60);
        p.vx *= factor;
        p.vy *= factor;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.spin * dt;

      // Magic dust spiral update
      if (p.custom && p.custom.angularSpeed !== undefined) {
        p.custom.angle += p.custom.angularSpeed * dt;
        p.custom.radius *= (1 - 0.3 * dt); // slowly spiral inward
        const spiralX = p.custom.cx + Math.cos(p.custom.angle) * p.custom.radius;
        const spiralY = p.custom.cy + Math.sin(p.custom.angle) * p.custom.radius;
        p.x = lerp(p.x, spiralX, 0.05);
        p.y = lerp(p.y, spiralY, 0.05);
      }

      // Matrix character change
      if (p.custom && p.custom.chars) {
        p.custom.changeTimer += dt;
        if (p.custom.changeTimer >= p.custom.changeInterval) {
          p.custom.changeTimer = 0;
          p.text = pick(p.custom.chars);
        }
      }

      // Interpolated properties
      const currentSize = lerp(p.size, p.sizeEnd, t);
      const currentColor = lerpColor(p.colorStart, p.colorEnd, t);

      // Alpha with fade-out
      let alpha = 1;
      if (t > p.fadeStart) {
        alpha = 1 - (t - p.fadeStart) / (1 - p.fadeStart);
      }
      // Quick fade-in over first 5%
      if (t < 0.05) {
        alpha *= t / 0.05;
      }
      alpha = clamp(alpha, 0, 1);

      // Render
      this._renderParticle(p, currentSize, currentColor, alpha);

      return true; // keep alive
    });
  }

  /**
   * Destroy the particle system and free all resources.
   */
  destroy() {
    this._app.ticker.remove(this._tick);
    this._unbindEvents();
    for (const e of this._emitters) e.stop();
    this._emitters.length = 0;
    this._pool.destroy();
    this._container.destroy({ children: true });
    this._textCache.clear();
  }

  // ── Internal: Tick ─────────────────────────────────────────────────────────

  _tick(ticker) {
    const dt = ticker.deltaMS / 1000;
    this.update(dt);
  }

  // ── Internal: Render a single particle ─────────────────────────────────────

  _renderParticle(p, size, color, alpha) {
    const g = p.gfx;
    g.clear();
    g.x = p.x;
    g.y = p.y;
    g.rotation = p.rotation;
    g.alpha = alpha;

    switch (p.shape) {
      case 'circle':
        g.circle(0, 0, Math.max(0.5, size));
        g.fill({ color, alpha: 1 });
        break;

      case 'rect': {
        const w = lerp(p.width, p.width * (p.sizeEnd / Math.max(p.size, 0.01)), 1 - p.life / p.maxLife);
        const h = lerp(p.height, p.height * (p.sizeEnd / Math.max(p.size, 0.01)), 1 - p.life / p.maxLife);
        g.rect(-w / 2, -h / 2, Math.max(1, w), Math.max(1, h));
        g.fill({ color, alpha: 1 });
        break;
      }

      case 'star':
        this._drawStar(g, 0, 0, Math.max(0.5, size), Math.max(0.25, size * 0.4), 5);
        g.fill({ color, alpha: 1 });
        break;

      case 'line': {
        const len = Math.max(1, size * 2);
        g.moveTo(0, -len / 2);
        g.lineTo(0, len / 2);
        g.stroke({ width: 1.5, color, alpha: 1 });
        break;
      }

      case 'text':
        // Use a Text child — cache the text object on the Graphics node
        this._renderTextParticle(p, g, size, color, alpha);
        return; // skip default graphics rendering
    }
  }

  _renderTextParticle(p, g, size, color, alpha) {
    // We store a Text child on the gfx object for reuse
    if (!g.__textChild) {
      const style = new TextStyle({
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: 24,
        fill: 0xffffff,
      });
      const t = new Text({ text: p.text, style });
      t.anchor.set(0.5);
      g.addChild(t);
      g.__textChild = t;
    }
    const textObj = g.__textChild;
    textObj.text = p.text;
    textObj.style.fontSize = Math.max(8, Math.round(size));
    textObj.style.fill = color;
    textObj.alpha = 1;

    g.x = p.x;
    g.y = p.y;
    g.rotation = p.rotation;
    g.alpha = alpha;
  }

  _drawStar(g, cx, cy, outerR, innerR, points) {
    g.moveTo(cx, cy - outerR);
    for (let i = 1; i < points * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (i * Math.PI) / points - Math.PI / 2;
      g.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }
    g.closePath();
  }

  // ── Internal: Firework launch sequence ─────────────────────────────────────

  _launchFirework(x, y, opts = {}) {
    const launchX = x;
    const launchY = y;
    const peakY = launchY - rand(200, 400);
    const launchDuration = rand(0.5, 0.8);
    const trailCount = 8;

    // Launch trail particles
    let elapsed = 0;
    const trailInterval = launchDuration / trailCount;
    for (let i = 0; i < trailCount; i++) {
      const delay = i * trailInterval * 1000;
      setTimeout(() => {
        const frac = i / trailCount;
        const curX = launchX + rand(-3, 3);
        const curY = lerp(launchY, peakY, easeOutCubic(frac));
        // Trail spark
        const tp = this._pool.acquire();
        if (!tp) return;
        tp.x = curX;
        tp.y = curY;
        tp.vx = rand(-10, 10);
        tp.vy = rand(10, 30);
        tp.life = rand(0.2, 0.5);
        tp.maxLife = tp.life;
        tp.size = rand(1.5, 3);
        tp.sizeEnd = 0;
        tp.colorStart = PALETTE.amber;
        tp.colorEnd = 0x331100;
        tp.shape = 'circle';
        tp.fadeStart = 0.2;
      }, delay);
    }

    // Explosion at peak
    setTimeout(() => {
      this._fireworkBurst(launchX, peakY, opts);
    }, launchDuration * 1000);
  }

  _fireworkBurst(x, y, opts = {}) {
    const count = opts.burstCount ?? randInt(40, 70);
    const burstColor = opts.color ?? pick([
      PALETTE.purple, PALETTE.blue, PALETTE.gold, PALETTE.red,
      PALETTE.green, PALETTE.pink, PALETTE.cyan,
    ]);
    const secondaryColor = lerpColor(burstColor, PALETTE.white, 0.4);

    for (let i = 0; i < count; i++) {
      const p = this._pool.acquire();
      if (!p) break;
      const angle = rand(0, TAU);
      const speed = rand(60, 250);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.gravity = rand(40, 100);
      p.drag = 0.03;
      p.life = rand(0.6, 1.5);
      p.maxLife = p.life;
      p.size = rand(2, 5);
      p.sizeEnd = 0;
      p.colorStart = Math.random() < 0.3 ? secondaryColor : burstColor;
      p.colorEnd = 0x110000;
      p.shape = Math.random() < 0.2 ? 'star' : 'circle';
      p.fadeStart = 0.4;
      p.spin = rand(-2, 2);
      p.rotation = rand(0, TAU);
    }

    // Inner bright flash particles
    for (let i = 0; i < 8; i++) {
      const p = this._pool.acquire();
      if (!p) break;
      const angle = rand(0, TAU);
      const speed = rand(10, 40);
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = rand(0.1, 0.3);
      p.maxLife = p.life;
      p.size = rand(8, 16);
      p.sizeEnd = 0;
      p.colorStart = PALETTE.white;
      p.colorEnd = burstColor;
      p.shape = 'circle';
      p.fadeStart = 0.1;
    }
  }

  // ── Event Bindings ─────────────────────────────────────────────────────────

  _bindEvents() {
    this._onAchievement = (e) => {
      const x = e.detail?.screenX ?? this._app.screen.width / 2;
      const y = e.detail?.screenY ?? this._app.screen.height / 2;
      this.emit('fireworks', x, y, { count: 2 });
      this.emit('sparkle', x, y, { count: 20 });
    };

    this._onLevelUp = (e) => {
      const cx = this._app.screen.width / 2;
      const cy = this._app.screen.height / 2;
      this.emit('levelUp', cx, cy);
      setTimeout(() => this.emit('confetti', cx, 0, {
        count: 150,
        spread: this._app.screen.width,
      }), 300);
    };

    this._onQuestComplete = (e) => {
      const cx = this._app.screen.width / 2;
      const cy = this._app.screen.height / 2;
      this.emit('fireworks', cx, cy, { count: 2 });
      this.emit('magicDust', cx, cy, { count: 30 });
    };

    this._onZoneComplete = (e) => {
      const x = e.detail?.screenX ?? this._app.screen.width / 2;
      const y = e.detail?.screenY ?? this._app.screen.height / 2;
      const color = e.detail?.color ?? PALETTE.purple;
      this.emit('zoneComplete', x, y, { color, count: 80 });
      setTimeout(() => this.emit('emojiRain', this._app.screen.width / 2, 0, {
        count: 20,
        spread: this._app.screen.width,
        emojis: ['🏆', '⭐', '🎉', '✨'],
      }), 500);
    };

    this._onOnboardingComplete = () => {
      const cx = this._app.screen.width / 2;
      this.emit('confetti', cx, 0, { count: 250, spread: this._app.screen.width });
      setTimeout(() => this.emit('fireworks', cx, this._app.screen.height * 0.6, { count: 3 }), 400);
    };

    window.addEventListener('achievement:unlocked', this._onAchievement);
    window.addEventListener('world:level-up', this._onLevelUp);
    window.addEventListener('quest:complete', this._onQuestComplete);
    window.addEventListener('zone:complete', this._onZoneComplete);
    window.addEventListener('onboarding:complete', this._onOnboardingComplete);
  }

  _unbindEvents() {
    window.removeEventListener('achievement:unlocked', this._onAchievement);
    window.removeEventListener('world:level-up', this._onLevelUp);
    window.removeEventListener('quest:complete', this._onQuestComplete);
    window.removeEventListener('zone:complete', this._onZoneComplete);
    window.removeEventListener('onboarding:complete', this._onOnboardingComplete);
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create, attach, and return the particle system.
 * @param {import('pixi.js').Application} app
 * @returns {ParticleSystem}
 */
export function initParticles(app) {
  const particles = new ParticleSystem(app);
  return particles;
}
