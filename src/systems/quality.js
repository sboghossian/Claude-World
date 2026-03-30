/**
 * quality.js — Performance / Quality settings manager for Claude World
 *
 * Provides 3 quality presets (High, Medium, Low) that control weather effects,
 * particles, VFX, city life, agent sprites, data flows, target FPS, and
 * resolution scale.  Auto-detects the appropriate preset on first run using
 * navigator.hardwareConcurrency, deviceMemory, and an initial FPS probe.
 *
 * Settings are persisted in localStorage under `claude-world:quality`.
 * Systems are toggled at runtime via the window.__* globals exposed
 * by the boot sequence in index.html.
 *
 * Initialize early in the boot sequence (before VFX/particles are created)
 * so downstream systems can read quality settings during their own init.
 */

// ── Storage key ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "claude-world:quality";

// ── Preset definitions ───────────────────────────────────────────────────────

const PRESETS = {
  high: {
    weather: true,
    particles: true,
    particleMax: 2000,
    vfx: true,
    cityLife: true,
    agentSprites: true,
    dataFlows: true,
    targetFPS: 60,
    resolutionScale: 1.0,
  },
  medium: {
    weather: false,
    particles: true,
    particleMax: 500,
    vfx: true,
    cityLife: true,
    agentSprites: true,
    dataFlows: true,
    targetFPS: 30,
    resolutionScale: 0.75,
  },
  low: {
    weather: false,
    particles: false,
    particleMax: 100,
    vfx: false,
    cityLife: true,
    agentSprites: true,
    dataFlows: false,
    targetFPS: 15,
    resolutionScale: 0.5,
  },
};

// ── Default (fallback) settings ──────────────────────────────────────────────

const DEFAULT_SETTINGS = { ...PRESETS.medium };

// ── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Deep-merge source into target (1 level — flat object is fine here).
 * @param {object} target
 * @param {object} source
 * @returns {object}
 */
function merge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source)) {
    if (key in out) out[key] = source[key];
  }
  return out;
}

// ── QualityManager ───────────────────────────────────────────────────────────

export class QualityManager {
  constructor() {
    /** @type {string} Current preset name ('high' | 'medium' | 'low' | 'custom') */
    this._preset = "medium";

    /** @type {object} Active settings object */
    this._settings = { ...DEFAULT_SETTINGS };

    /** @type {boolean} Whether settings have been applied at least once */
    this._applied = false;

    // Load persisted settings (if any)
    this._load();

    console.log(
      `[Quality] Initialized — preset: ${this._preset}, FPS: ${this._settings.targetFPS}`,
    );
  }

  // ── Persistence ──────────────────────────────────────────────────────────

  /** @private */
  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return; // first run — will auto-detect later
      const saved = JSON.parse(raw);
      if (saved && typeof saved === "object") {
        this._preset = saved._preset || "custom";
        this._settings = merge(DEFAULT_SETTINGS, saved.settings || {});
      }
    } catch {
      // Corrupted data — fall back to defaults
    }
  }

  /** @private */
  _save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          _preset: this._preset,
          settings: this._settings,
        }),
      );
    } catch {
      // localStorage may be unavailable in some contexts
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────

  /**
   * Get the name of the current preset.
   * @returns {string} 'high' | 'medium' | 'low' | 'custom'
   */
  getPreset() {
    return this._preset;
  }

  /**
   * Apply a named preset, persist, and push changes to all systems.
   * @param {'high' | 'medium' | 'low'} name
   */
  setPreset(name) {
    const preset = PRESETS[name];
    if (!preset) {
      console.warn(`[Quality] Unknown preset: ${name}`);
      return;
    }
    this._preset = name;
    this._settings = { ...preset };
    this._save();
    this._apply();
    this._dispatch();
  }

  /**
   * Read a single setting value.
   * @param {string} key
   * @returns {*}
   */
  getSetting(key) {
    return this._settings[key];
  }

  /**
   * Update a single setting, mark preset as 'custom', persist, and apply.
   * @param {string} key
   * @param {*} value
   */
  setSetting(key, value) {
    if (!(key in this._settings)) {
      console.warn(`[Quality] Unknown setting key: ${key}`);
      return;
    }
    this._settings[key] = value;
    this._preset = this._matchPreset() || "custom";
    this._save();
    this._apply();
    this._dispatch();
  }

  /**
   * Return a shallow copy of all current settings.
   * @returns {object}
   */
  getAllSettings() {
    return { ...this._settings };
  }

  /**
   * Auto-detect the best quality preset for this device.
   * Uses hardware concurrency, device memory, and a short FPS probe.
   * Persists and applies the result.
   *
   * @returns {Promise<string>} The detected preset name.
   */
  async autoDetect() {
    let score = 0; // higher = more capable

    // ── CPU cores ──────────────────────────────────────────────────
    const cores = navigator.hardwareConcurrency || 4;
    if (cores >= 8) score += 3;
    else if (cores >= 4) score += 2;
    else score += 1;

    // ── Device memory (GB, Chrome-only) ────────────────────────────
    const mem = /** @type {any} */ (navigator).deviceMemory;
    if (mem !== undefined) {
      if (mem >= 8) score += 3;
      else if (mem >= 4) score += 2;
      else score += 1;
    } else {
      // Assume mid-range if API unavailable
      score += 2;
    }

    // ── FPS probe: measure requestAnimationFrame throughput ────────
    const probeFPS = await this._measureFPS(500); // 500ms sample
    if (probeFPS >= 55) score += 3;
    else if (probeFPS >= 35) score += 2;
    else score += 1;

    // ── Map score to preset ────────────────────────────────────────
    let preset;
    if (score >= 8) preset = "high";
    else if (score >= 5) preset = "medium";
    else preset = "low";

    console.log(
      `[Quality] Auto-detect — cores: ${cores}, mem: ${mem ?? "?"}GB, ` +
        `probeFPS: ${Math.round(probeFPS)}, score: ${score} → ${preset}`,
    );

    this.setPreset(preset);
    return preset;
  }

  /**
   * Clean up event listeners. Call when tearing down the app.
   */
  destroy() {
    // Nothing to clean up currently; reserved for future use
    // (e.g., MutationObserver, ResizeObserver, etc.)
  }

  // ── Internal: FPS measurement ────────────────────────────────────────────

  /**
   * Measure raw rAF throughput for `durationMs` milliseconds.
   * @param {number} durationMs
   * @returns {Promise<number>} Measured FPS.
   * @private
   */
  _measureFPS(durationMs) {
    return new Promise((resolve) => {
      let frames = 0;
      let startTime = 0;

      const tick = (timestamp) => {
        if (startTime === 0) {
          startTime = timestamp;
        }
        frames++;
        const elapsed = timestamp - startTime;
        if (elapsed >= durationMs) {
          resolve((frames / elapsed) * 1000);
        } else {
          requestAnimationFrame(tick);
        }
      };

      requestAnimationFrame(tick);
    });
  }

  // ── Internal: apply settings to live systems ─────────────────────────────

  /** @private */
  _apply() {
    this._applied = true;

    // ── Weather effects ───────────────────────────────────────────
    const weatherEffects = window.__weatherEffects;
    if (weatherEffects) {
      if (this._settings.weather) {
        weatherEffects.container?.parent &&
          (weatherEffects._container.visible = true);
      } else {
        if (weatherEffects._container)
          weatherEffects._container.visible = false;
      }
    }

    // ── Particles ─────────────────────────────────────────────────
    const particles = window.__particles;
    if (particles) {
      if (this._settings.particles) {
        particles._container && (particles._container.visible = true);
        if (typeof particles.setMaxParticles === "function") {
          particles.setMaxParticles(this._settings.particleMax);
        }
      } else {
        particles._container && (particles._container.visible = false);
      }
    }

    // ── VFX ───────────────────────────────────────────────────────
    const vfx = window.__vfx;
    if (vfx) {
      if (this._settings.vfx) {
        if (!vfx._running) vfx.start();
        vfx._container && (vfx._container.visible = true);
      } else {
        vfx.stop();
        vfx._container && (vfx._container.visible = false);
      }
    }

    // ── City life ─────────────────────────────────────────────────
    const cityLife = window.__cityLife;
    if (cityLife) {
      if (this._settings.cityLife) {
        if (!cityLife._running) cityLife.start();
      } else {
        cityLife.stop();
      }
    }

    // ── Agent sprites ─────────────────────────────────────────────
    const agentSprites = window.__agentSprites;
    if (agentSprites) {
      if (agentSprites._layer) {
        agentSprites._layer.visible = this._settings.agentSprites;
      }
    }

    // ── Data flows ────────────────────────────────────────────────
    const dataFlows = window.__dataFlows;
    if (dataFlows) {
      dataFlows.setVisible(this._settings.dataFlows);
    }

    // ── Resolution scale ──────────────────────────────────────────
    this._applyResolution();

    console.log(`[Quality] Applied — preset: ${this._preset}`, this._settings);
  }

  /** @private */
  _applyResolution() {
    const app = window.__pixiApp;
    if (!app || !app.renderer) return;

    const baseResolution = window.devicePixelRatio || 1;
    const scaled = baseResolution * this._settings.resolutionScale;
    const clamped = clamp(scaled, 0.5, baseResolution);

    // Only update if it actually changed to avoid unnecessary resize
    if (Math.abs(app.renderer.resolution - clamped) > 0.01) {
      app.renderer.resolution = clamped;
      app.renderer.resize(window.innerWidth, window.innerHeight);
    }
  }

  // ── Internal: dispatch change event ──────────────────────────────────────

  /** @private */
  _dispatch() {
    const event = new CustomEvent("quality:changed", {
      detail: {
        preset: this._preset,
        settings: { ...this._settings },
      },
    });
    document.dispatchEvent(event);
  }

  // ── Internal: check if current settings match a named preset ─────────────

  /**
   * @returns {string|null} Matched preset name or null.
   * @private
   */
  _matchPreset() {
    for (const [name, preset] of Object.entries(PRESETS)) {
      let match = true;
      for (const key of Object.keys(preset)) {
        if (this._settings[key] !== preset[key]) {
          match = false;
          break;
        }
      }
      if (match) return name;
    }
    return null;
  }
}

// ── Singleton factory ────────────────────────────────────────────────────────

/** @type {QualityManager | null} */
let _instance = null;

/**
 * Get or create the singleton QualityManager.
 * On first call with `firstRun = true`, runs auto-detection if no saved
 * settings exist.
 *
 * @param {{ firstRun?: boolean }} [options]
 * @returns {QualityManager}
 */
export function getQualityManager(options = {}) {
  if (!_instance) {
    _instance = new QualityManager();

    // Auto-detect on first run when no persisted settings exist
    if (options.firstRun && !localStorage.getItem(STORAGE_KEY)) {
      _instance.autoDetect().catch((err) => {
        console.warn("[Quality] Auto-detect failed:", err);
      });
    }
  }
  return _instance;
}
