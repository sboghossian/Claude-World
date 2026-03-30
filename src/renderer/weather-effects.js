/**
 * weather-effects.js — Visual weather effects for Claude World
 *
 * Renders rain, snow, thunderstorm, fog, clear/sunny, wind, and aurora
 * effects using PixiJS Graphics with particle pooling for performance.
 * Smooth 2-second crossfade transitions between weather states.
 * Respects day/night cycle for lighting adjustments.
 */

import { Container, Graphics } from "pixi.js";

// ── Constants ──────────────────────────────────────────────────────────

const RAIN_POOL_SIZE = 300;
const SNOW_POOL_SIZE = 200;
const SPLASH_POOL_SIZE = 60;
const STREAK_POOL_SIZE = 40;
const FOG_CLOUD_COUNT = 8;
const GOD_RAY_COUNT = 5;
const AURORA_BAND_COUNT = 3;
const TRANSITION_DURATION = 2.0; // seconds

/** Screen bounds with margin for spawning off-screen */
const BOUNDS = {
  left: -200,
  right: 1400,
  top: -200,
  bottom: 900,
  width: 1600,
  height: 1100,
};

// ── Utility ────────────────────────────────────────────────────────────

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function lerp(a, b, t) {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ── Particle structures ────────────────────────────────────────────────

/**
 * @typedef {Object} RainDrop
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {number} length
 * @property {number} alpha
 * @property {boolean} active
 */

/**
 * @typedef {Object} SnowFlake
 * @property {number} x
 * @property {number} y
 * @property {number} vy
 * @property {number} size
 * @property {number} alpha
 * @property {number} phase - sine wave phase for horizontal sway
 * @property {number} swaySpeed
 * @property {number} swayAmp
 * @property {boolean} active
 */

/**
 * @typedef {Object} Splash
 * @property {number} x
 * @property {number} y
 * @property {number} life
 * @property {number} maxLife
 * @property {number} size
 * @property {boolean} active
 */

// ── WeatherEffects class ───────────────────────────────────────────────

export class WeatherEffects {
  /**
   * @param {import('pixi.js').Application} app - The PixiJS Application
   * @param {import('pixi.js').Container} worldContainer - The root world container
   */
  constructor(app, worldContainer) {
    this._app = app;
    this._world = worldContainer;

    // Current and target weather for transitions
    this._currentWeather = "clear";
    this._targetWeather = "clear";
    this._intensity = 0.5;
    this._transitionProgress = 1.0; // 1 = fully transitioned
    this._nightLevel = 0;

    // Effective alpha for current and outgoing weather
    this._currentAlpha = 1.0;
    this._outgoingWeather = null;
    this._outgoingAlpha = 0.0;

    // Time accumulator for animations
    this._time = 0;

    // Lightning state
    this._lightningFlash = 0; // 0..1 flash brightness
    this._lightningTimer = 0;
    this._nextLightning = rand(3, 8);

    // Screen shake state
    this._shakeTimer = 0;
    this._shakeIntensity = 0;

    // Snow accumulation height (grows during snow)
    this._snowAccum = 0;

    // ── Create layers ──────────────────────────────────────────────
    // Effects layer sits above world content in the stage (screen-space)
    this._container = new Container();
    this._container.zIndex = 50;
    this._container.eventMode = "none";
    this._container.interactiveChildren = false;

    // We add to the stage so effects are in screen-space, not world-space
    app.stage.addChild(this._container);

    // Sub-containers for layering
    this._fogLayer = new Container();
    this._rainLayer = new Container();
    this._snowLayer = new Container();
    this._flashLayer = new Container();
    this._sunLayer = new Container();
    this._auroraLayer = new Container();
    this._windLayer = new Container();
    this._accumLayer = new Container();

    this._container.addChild(this._fogLayer);
    this._container.addChild(this._accumLayer);
    this._container.addChild(this._rainLayer);
    this._container.addChild(this._snowLayer);
    this._container.addChild(this._windLayer);
    this._container.addChild(this._sunLayer);
    this._container.addChild(this._auroraLayer);
    this._container.addChild(this._flashLayer);

    // ── Graphics objects ───────────────────────────────────────────
    this._rainGfx = new Graphics();
    this._rainLayer.addChild(this._rainGfx);

    this._splashGfx = new Graphics();
    this._rainLayer.addChild(this._splashGfx);

    this._snowGfx = new Graphics();
    this._snowLayer.addChild(this._snowGfx);

    this._fogGfx = new Graphics();
    this._fogLayer.addChild(this._fogGfx);

    this._flashGfx = new Graphics();
    this._flashLayer.addChild(this._flashGfx);

    this._sunGfx = new Graphics();
    this._sunLayer.addChild(this._sunGfx);

    this._auroraGfx = new Graphics();
    this._auroraLayer.addChild(this._auroraGfx);

    this._windGfx = new Graphics();
    this._windLayer.addChild(this._windGfx);

    this._accumGfx = new Graphics();
    this._accumLayer.addChild(this._accumGfx);

    // Fog overlay (semi-transparent screen tint for rain/fog)
    this._fogOverlay = new Graphics();
    this._fogLayer.addChild(this._fogOverlay);

    // ── Particle pools ─────────────────────────────────────────────
    /** @type {RainDrop[]} */
    this._rainPool = [];
    for (let i = 0; i < RAIN_POOL_SIZE; i++) {
      this._rainPool.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        length: 10,
        alpha: 0.4,
        active: false,
      });
    }

    /** @type {SnowFlake[]} */
    this._snowPool = [];
    for (let i = 0; i < SNOW_POOL_SIZE; i++) {
      this._snowPool.push({
        x: 0,
        y: 0,
        vy: 0,
        size: 2,
        alpha: 0.6,
        phase: 0,
        swaySpeed: 1,
        swayAmp: 20,
        active: false,
      });
    }

    /** @type {Splash[]} */
    this._splashPool = [];
    for (let i = 0; i < SPLASH_POOL_SIZE; i++) {
      this._splashPool.push({
        x: 0,
        y: 0,
        life: 0,
        maxLife: 0.3,
        size: 3,
        active: false,
      });
    }

    /** @type {Array<{x:number, y:number, vx:number, alpha:number, length:number, active:boolean}>} */
    this._streakPool = [];
    for (let i = 0; i < STREAK_POOL_SIZE; i++) {
      this._streakPool.push({
        x: 0,
        y: 0,
        vx: 0,
        alpha: 0.3,
        length: 30,
        active: false,
      });
    }
  }

  // ── Public API ────────────────────────────────────────────────────

  /**
   * Set the weather type and intensity.
   * @param {string} type - 'clear'|'sunny'|'cloudy'|'rain'|'storm'|'snow'|'fog'|'wind'|'aurora'
   * @param {number} [intensity=0.5] - 0..1 intensity
   */
  setWeather(type, intensity = 0.5) {
    if (
      type === this._targetWeather &&
      Math.abs(intensity - this._intensity) < 0.01
    ) {
      return;
    }

    // Start a transition
    this._outgoingWeather = this._currentWeather;
    this._outgoingAlpha = this._currentAlpha;
    this._targetWeather = type;
    this._intensity = clamp(intensity, 0, 1);
    this._transitionProgress = 0;
    this._currentAlpha = 0;
  }

  /**
   * Set the day/night intensity for adjusting effect brightness.
   * @param {number} nightLevel - 0 (day) to 1 (full night)
   */
  setDayNightIntensity(nightLevel) {
    this._nightLevel = clamp(nightLevel, 0, 1);
  }

  /**
   * Update all weather effects. Call once per frame.
   * @param {number} dt - Delta time in seconds
   */
  update(dt) {
    this._time += dt;

    // Get screen dimensions
    const w = this._app.screen.width;
    const h = this._app.screen.height;
    BOUNDS.right = w + 200;
    BOUNDS.bottom = h + 100;
    BOUNDS.width = BOUNDS.right - BOUNDS.left;
    BOUNDS.height = BOUNDS.bottom - BOUNDS.top;

    // Update transition
    this._updateTransition(dt);

    // Clear all graphics each frame
    this._rainGfx.clear();
    this._splashGfx.clear();
    this._snowGfx.clear();
    this._fogGfx.clear();
    this._flashGfx.clear();
    this._sunGfx.clear();
    this._auroraGfx.clear();
    this._windGfx.clear();
    this._accumGfx.clear();
    this._fogOverlay.clear();

    // Determine which effects to render
    const current = this._targetWeather;
    const outgoing = this._outgoingWeather;
    const cAlpha = this._currentAlpha;
    const oAlpha = this._outgoingAlpha;

    // Render outgoing weather (fading out)
    if (outgoing && oAlpha > 0.01) {
      this._renderWeatherType(outgoing, oAlpha, dt, w, h);
    }

    // Render current weather (fading in)
    if (cAlpha > 0.01) {
      this._renderWeatherType(current, cAlpha, dt, w, h);
    }

    // Lightning is always updated for storms
    this._updateLightning(dt, w, h);

    // Screen shake
    this._updateShake(dt);
  }

  /**
   * Destroy all resources.
   */
  destroy() {
    if (this._container.parent) {
      this._container.parent.removeChild(this._container);
    }
    this._container.destroy({ children: true });
  }

  // ── Transition ───────────────────────────────────────────────────

  /** @private */
  _updateTransition(dt) {
    if (this._transitionProgress >= 1.0) {
      this._currentWeather = this._targetWeather;
      this._currentAlpha = 1.0;
      this._outgoingAlpha = 0;
      this._outgoingWeather = null;
      return;
    }

    this._transitionProgress += dt / TRANSITION_DURATION;
    if (this._transitionProgress >= 1.0) {
      this._transitionProgress = 1.0;
    }

    // Smooth easing
    const t = this._transitionProgress;
    const ease = t * t * (3 - 2 * t); // smoothstep

    this._currentAlpha = ease;
    this._outgoingAlpha = 1.0 - ease;

    // When fully transitioned
    if (this._transitionProgress >= 1.0) {
      this._currentWeather = this._targetWeather;
      this._outgoingWeather = null;
    }
  }

  // ── Dispatch to weather renderers ────────────────────────────────

  /** @private */
  _renderWeatherType(type, alpha, dt, w, h) {
    switch (type) {
      case "rain":
        this._updateRain(dt, alpha, w, h, false);
        this._drawFogOverlay(alpha * 0.1, w, h, 0x4466aa);
        break;
      case "storm":
        this._updateRain(dt, alpha, w, h, true);
        this._drawFogOverlay(alpha * 0.15, w, h, 0x222244);
        break;
      case "snow":
        this._updateSnow(dt, alpha, w, h);
        this._updateSnowAccumulation(dt, alpha, w, h);
        break;
      case "fog":
      case "cloudy":
        this._updateFog(dt, alpha, w, h);
        break;
      case "sunny":
      case "clear":
        this._updateSunny(dt, alpha, w, h);
        break;
      case "wind":
        this._updateWind(dt, alpha, w, h);
        break;
      case "aurora":
        this._updateAurora(dt, alpha, w, h);
        break;
    }
  }

  // ── Rain ─────────────────────────────────────────────────────────

  /** @private */
  _updateRain(dt, alpha, w, h, isStorm) {
    const intensity = this._intensity;
    const spawnRate = isStorm ? 180 + intensity * 120 : 40 + intensity * 100;
    const nightMul = 1.0 - this._nightLevel * 0.3;

    // Spawn drops
    const toSpawn = Math.floor(spawnRate * dt);
    for (let i = 0; i < toSpawn; i++) {
      const drop = this._rainPool.find((d) => !d.active);
      if (!drop) break;

      drop.active = true;
      drop.x = rand(BOUNDS.left, BOUNDS.right + 200);
      drop.y = rand(BOUNDS.top - 100, BOUNDS.top);
      drop.vx = isStorm ? rand(-120, -60) : rand(-60, -30);
      drop.vy = isStorm ? rand(600, 900) : rand(350, 550);
      drop.length = isStorm ? rand(14, 22) : rand(8, 16);
      drop.alpha = (isStorm ? rand(0.3, 0.6) : rand(0.15, 0.4)) * nightMul;
    }

    // Update and draw drops
    for (const drop of this._rainPool) {
      if (!drop.active) continue;

      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;

      // Off-screen check
      if (drop.y > h + 50 || drop.x < BOUNDS.left - 50) {
        drop.active = false;

        // Spawn splash at ground level
        if (drop.y > h - 100) {
          this._spawnSplash(drop.x, h - rand(10, 60));
        }
        continue;
      }

      // Draw the raindrop as a line
      const endX = drop.x + (drop.vx / drop.vy) * drop.length;
      const endY = drop.y + drop.length;

      const dropAlpha = drop.alpha * alpha;
      const color = this._nightLevel > 0.5 ? 0x8899bb : 0xaabbee;

      this._rainGfx.moveTo(drop.x, drop.y);
      this._rainGfx.lineTo(endX, endY);
      this._rainGfx.stroke({
        color,
        alpha: dropAlpha,
        width: isStorm ? 1.5 : 1,
      });
    }

    // Update splashes
    for (const splash of this._splashPool) {
      if (!splash.active) continue;

      splash.life -= dt;
      if (splash.life <= 0) {
        splash.active = false;
        continue;
      }

      const lifeRatio = splash.life / splash.maxLife;
      const r = splash.size * (1 - lifeRatio);
      const sAlpha = lifeRatio * 0.4 * alpha;

      this._splashGfx.circle(splash.x, splash.y, r);
      this._splashGfx.stroke({ color: 0xaaccee, alpha: sAlpha, width: 1 });
    }
  }

  /** @private */
  _spawnSplash(x, y) {
    const splash = this._splashPool.find((s) => !s.active);
    if (!splash) return;
    splash.active = true;
    splash.x = x;
    splash.y = y;
    splash.life = rand(0.15, 0.35);
    splash.maxLife = splash.life;
    splash.size = rand(3, 7);
  }

  // ── Snow ─────────────────────────────────────────────────────────

  /** @private */
  _updateSnow(dt, alpha, w, h) {
    const intensity = this._intensity;
    const spawnRate = 15 + intensity * 60;
    const nightGlow = this._nightLevel > 0.4 ? 1.15 : 1.0;

    // Spawn flakes
    const toSpawn = Math.floor(spawnRate * dt);
    for (let i = 0; i < toSpawn; i++) {
      const flake = this._snowPool.find((f) => !f.active);
      if (!flake) break;

      flake.active = true;
      flake.x = rand(BOUNDS.left, BOUNDS.right);
      flake.y = rand(BOUNDS.top - 50, BOUNDS.top);
      flake.vy = rand(30, 80);
      flake.size = rand(1.5, 4.5);
      flake.alpha = rand(0.4, 0.8);
      flake.phase = rand(0, Math.PI * 2);
      flake.swaySpeed = rand(1.5, 3.0);
      flake.swayAmp = rand(15, 40);
    }

    // Update and draw
    for (const flake of this._snowPool) {
      if (!flake.active) continue;

      flake.y += flake.vy * dt;
      flake.phase += flake.swaySpeed * dt;

      const swayX = Math.sin(flake.phase) * flake.swayAmp * dt;
      flake.x += swayX;

      if (
        flake.y > h + 20 ||
        flake.x < BOUNDS.left - 30 ||
        flake.x > BOUNDS.right + 30
      ) {
        flake.active = false;
        continue;
      }

      const fAlpha = flake.alpha * alpha * nightGlow;
      const color = this._nightLevel > 0.5 ? 0xddeeff : 0xffffff;

      this._snowGfx.circle(flake.x, flake.y, flake.size);
      this._snowGfx.fill({ color, alpha: clamp(fAlpha, 0, 1) });
    }
  }

  /** @private */
  _updateSnowAccumulation(dt, alpha, w, h) {
    // Slowly grow snow accumulation while snowing
    if (this._targetWeather === "snow" && this._transitionProgress >= 0.5) {
      this._snowAccum = Math.min(this._snowAccum + dt * 1.5, 12);
    } else {
      // Melt away
      this._snowAccum = Math.max(this._snowAccum - dt * 3, 0);
    }

    if (this._snowAccum < 0.5) return;

    const accumAlpha = alpha * 0.7;
    const snowH = this._snowAccum;

    // Draw accumulation strips along the bottom
    for (let x = 0; x < w; x += 60) {
      const localH = snowH + Math.sin(x * 0.05 + this._time * 0.3) * 2;
      this._accumGfx.roundRect(x - 2, h - localH, 64, localH + 2, 3);
      this._accumGfx.fill({ color: 0xf0f4ff, alpha: accumAlpha });
    }
  }

  // ── Lightning ────────────────────────────────────────────────────

  /** @private */
  _updateLightning(dt, w, h) {
    const isStorm =
      this._targetWeather === "storm" ||
      (this._outgoingWeather === "storm" && this._outgoingAlpha > 0.3);

    // Decay flash
    if (this._lightningFlash > 0) {
      this._lightningFlash -= dt * 4; // fast decay
      if (this._lightningFlash < 0) this._lightningFlash = 0;

      const flashAlpha =
        this._lightningFlash * (this._nightLevel > 0.5 ? 0.7 : 0.4);
      this._flashGfx.rect(0, 0, w, h);
      this._flashGfx.fill({ color: 0xeeeeff, alpha: flashAlpha });
    }

    if (!isStorm) {
      this._lightningTimer = 0;
      this._nextLightning = rand(3, 8);
      return;
    }

    // Timer for next strike
    this._lightningTimer += dt;
    if (this._lightningTimer >= this._nextLightning) {
      this._lightningFlash = 1.0;
      this._nextLightning = rand(2, 7);
      this._lightningTimer = 0;

      // Trigger screen shake
      this._shakeTimer = 0.2;
      this._shakeIntensity = rand(2, 5);
    }
  }

  // ── Screen shake ─────────────────────────────────────────────────

  /** @private */
  _updateShake(dt) {
    if (this._shakeTimer <= 0) {
      this._container.position.set(0, 0);
      return;
    }

    this._shakeTimer -= dt;
    const t = this._shakeTimer / 0.2; // normalized remaining
    const amp = this._shakeIntensity * t;
    this._container.position.set(
      (Math.random() - 0.5) * amp * 2,
      (Math.random() - 0.5) * amp * 2,
    );
  }

  // ── Fog ──────────────────────────────────────────────────────────

  /** @private */
  _updateFog(dt, alpha, w, h) {
    const isCloudy =
      this._targetWeather === "cloudy" || this._outgoingWeather === "cloudy";
    const baseAlpha = isCloudy ? 0.08 : 0.18;
    const cloudAlpha = alpha * (isCloudy ? 0.12 : 0.2);

    // Draw drifting fog clouds using layered sine waves (perlin-like)
    for (let i = 0; i < FOG_CLOUD_COUNT; i++) {
      const phase = i * 1.3 + this._time * (0.02 + i * 0.008);
      const cx =
        (Math.sin(phase) * 0.5 + 0.5) * w + Math.cos(phase * 0.7) * 100;
      const cy = h * (0.2 + i * 0.09) + Math.sin(phase * 1.3 + i) * 40;
      const cloudW = 200 + Math.sin(phase * 0.5) * 60;
      const cloudH = 60 + Math.sin(phase * 0.8) * 20;
      const cAlpha = cloudAlpha * (0.5 + Math.sin(phase * 0.3) * 0.3);

      const color = this._nightLevel > 0.5 ? 0x445566 : 0x888899;

      this._fogGfx.ellipse(cx, cy, cloudW, cloudH);
      this._fogGfx.fill({ color, alpha: clamp(cAlpha, 0, 0.3) });
    }

    // Screen-wide fog overlay
    this._drawFogOverlay(
      baseAlpha * alpha,
      w,
      h,
      this._nightLevel > 0.5 ? 0x222233 : 0x999aaa,
    );
  }

  /** @private */
  _drawFogOverlay(alpha, w, h, color) {
    if (alpha < 0.005) return;
    this._fogOverlay.rect(0, 0, w, h);
    this._fogOverlay.fill({ color, alpha: clamp(alpha, 0, 0.4) });
  }

  // ── Sunny / Clear ────────────────────────────────────────────────

  /** @private */
  _updateSunny(dt, alpha, w, h) {
    // No sun effects at night
    if (this._nightLevel > 0.6) return;

    const dayStr = 1.0 - this._nightLevel;
    const isSunny = this._targetWeather === "sunny";
    const rayAlpha = alpha * dayStr * (isSunny ? 0.12 : 0.06);

    // God rays from top-right corner
    const originX = w * 0.85;
    const originY = -20;

    for (let i = 0; i < GOD_RAY_COUNT; i++) {
      const angleBase = 0.4 + i * 0.15;
      const angleOff = Math.sin(this._time * 0.3 + i * 2.1) * 0.08;
      const angle = angleBase + angleOff;

      const rayLen = h * 1.2;
      const spreadHalf = 0.04 + Math.sin(this._time * 0.5 + i) * 0.015;

      const x1 = originX + Math.cos(angle - spreadHalf) * rayLen;
      const y1 = originY + Math.sin(angle - spreadHalf) * rayLen;
      const x2 = originX + Math.cos(angle + spreadHalf) * rayLen;
      const y2 = originY + Math.sin(angle + spreadHalf) * rayLen;

      const rAlpha =
        rayAlpha * (0.6 + Math.sin(this._time * 0.7 + i * 1.5) * 0.4);
      const color = isSunny ? 0xfff8cc : 0xffffee;

      this._sunGfx.moveTo(originX, originY);
      this._sunGfx.lineTo(x1, y1);
      this._sunGfx.lineTo(x2, y2);
      this._sunGfx.closePath();
      this._sunGfx.fill({ color, alpha: clamp(rAlpha, 0, 0.15) });
    }

    // Lens flare dots
    if (isSunny) {
      const flareCount = 4;
      for (let i = 0; i < flareCount; i++) {
        const t = (i + 1) / (flareCount + 1);
        const fx = lerp(originX, w * 0.2, t);
        const fy = lerp(originY, h * 0.7, t);
        const fSize = 4 + Math.sin(this._time * 2 + i) * 2;
        const fAlpha = alpha * dayStr * 0.15 * (1 - t * 0.5);

        this._sunGfx.circle(fx, fy, fSize);
        this._sunGfx.fill({ color: 0xffeedd, alpha: clamp(fAlpha, 0, 0.2) });

        // Outer glow
        this._sunGfx.circle(fx, fy, fSize * 3);
        this._sunGfx.fill({
          color: 0xfff4cc,
          alpha: clamp(fAlpha * 0.3, 0, 0.08),
        });
      }
    }
  }

  // ── Wind ─────────────────────────────────────────────────────────

  /** @private */
  _updateWind(dt, alpha, w, h) {
    const spawnRate = 10 + this._intensity * 25;

    // Spawn streaks
    const toSpawn = Math.floor(spawnRate * dt);
    for (let i = 0; i < toSpawn; i++) {
      const streak = this._streakPool.find((s) => !s.active);
      if (!streak) break;

      streak.active = true;
      streak.x = BOUNDS.left - 50;
      streak.y = rand(0, h);
      streak.vx = rand(400, 800);
      streak.length = rand(20, 60);
      streak.alpha = rand(0.1, 0.25);
    }

    // Update and draw
    for (const streak of this._streakPool) {
      if (!streak.active) continue;

      streak.x += streak.vx * dt;

      if (streak.x > w + 100) {
        streak.active = false;
        continue;
      }

      const sAlpha = streak.alpha * alpha;
      const color = this._nightLevel > 0.5 ? 0x8899aa : 0xccccdd;

      this._windGfx.moveTo(streak.x, streak.y);
      this._windGfx.lineTo(streak.x + streak.length, streak.y + rand(-1, 1));
      this._windGfx.stroke({ color, alpha: sAlpha, width: 1 });
    }

    // Subtle sway on the world container (x-offset oscillation)
    const sway = Math.sin(this._time * 2) * 1.5 * this._intensity * alpha;
    this._world.pivot.x = sway;
  }

  // ── Aurora ───────────────────────────────────────────────────────

  /** @private */
  _updateAurora(dt, alpha, w, h) {
    // Aurora is best at night
    const nightBoost = 0.3 + this._nightLevel * 0.7;
    const bandAlpha = alpha * nightBoost * 0.15;

    const colors = [0x44ff88, 0x8844ff, 0x22ddaa];

    for (let b = 0; b < AURORA_BAND_COUNT; b++) {
      const baseY = 40 + b * 50;
      const color = colors[b % colors.length];
      const phaseShift = b * 2.0 + this._time * (0.15 + b * 0.05);

      // Draw the band as a series of connected quads
      const segments = 24;
      const segW = (w + 100) / segments;

      for (let s = 0; s < segments; s++) {
        const x1 = s * segW - 50;
        const x2 = (s + 1) * segW - 50;

        const y1Top =
          baseY +
          Math.sin(x1 * 0.008 + phaseShift) * 25 +
          Math.sin(x1 * 0.003 + phaseShift * 0.7) * 15;
        const y1Bot = y1Top + 30 + Math.sin(x1 * 0.005 + phaseShift * 1.3) * 10;

        const y2Top =
          baseY +
          Math.sin(x2 * 0.008 + phaseShift) * 25 +
          Math.sin(x2 * 0.003 + phaseShift * 0.7) * 15;
        const y2Bot = y2Top + 30 + Math.sin(x2 * 0.005 + phaseShift * 1.3) * 10;

        const segAlpha =
          bandAlpha * (0.5 + Math.sin(s * 0.5 + phaseShift) * 0.5);

        this._auroraGfx.moveTo(x1, y1Top);
        this._auroraGfx.lineTo(x2, y2Top);
        this._auroraGfx.lineTo(x2, y2Bot);
        this._auroraGfx.lineTo(x1, y1Bot);
        this._auroraGfx.closePath();
        this._auroraGfx.fill({ color, alpha: clamp(segAlpha, 0, 0.2) });
      }
    }
  }
}
