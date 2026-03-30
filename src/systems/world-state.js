/**
 * world-state.js — World State Manager for Claude World
 *
 * Tracks agent activity across the world and derives weather, mood,
 * and visual state. Emits change events so the renderer and HUD can
 * react to shifts in activity level.
 *
 * Activity states:
 *   idle     (0 tasks)   — Clear sky, slow ambient particles
 *   active   (1-2 tasks) — Light clouds, gentle pulse on active zones
 *   busy     (3-4 tasks) — Dynamic sky, buildings glow, energy particles
 *   overload (5+ tasks)  — Storm aesthetic, red warnings, building shake
 *
 * Weather is derived from moodScore (0 = storm, 1 = sunshine).
 */

/** @typedef {'idle'|'active'|'busy'|'overload'} ActivityState */
/** @typedef {'storm'|'rain'|'cloudy'|'clear'|'sunny'} Weather */
/** @typedef {(state: WorldSnapshot) => void} StateChangeCallback */

/**
 * @typedef {Object} WorldSnapshot
 * @property {ActivityState} state
 * @property {Weather} weather
 * @property {number} moodScore
 * @property {number} activeTasks
 * @property {number} recentSuccesses
 * @property {number} recentFailures
 * @property {number} timestamp
 */

// ── Tuning constants ────────────────────────────────────────────────

/** Mood bump per successful task completion */
const MOOD_SUCCESS_DELTA = 0.05;
/** Mood penalty per failed task */
const MOOD_FAILURE_DELTA = -0.1;
/** Mean-reversion speed per update tick (fraction toward 0.5) */
const MOOD_DECAY_RATE = 0.02;
/** Per-active-task mood pressure (pushes mood down slightly) */
const MOOD_TASK_PRESSURE = 0.015;
/** Minimum mood value */
const MOOD_MIN = 0.0;
/** Maximum mood value */
const MOOD_MAX = 1.0;
/** Default resting mood */
const MOOD_RESTING = 0.5;
/** How often updateMood() should be auto-called (ms) */
const AUTO_UPDATE_INTERVAL_MS = 3000;
/** Recent event half-life: events older than this decay to zero */
const RECENT_WINDOW_MS = 30_000;

class WorldStateManager {
  constructor() {
    /** @type {number} */
    this.activeTasks = 0;

    /** @type {ActivityState} */
    this.state = "idle";

    /** Mood score: 0 = storm, 1 = sunshine */
    this.moodScore = MOOD_RESTING;

    /** Rolling counter of recent failures (decays over time) */
    this.recentFailures = 0;

    /** Rolling counter of recent successes (decays over time) */
    this.recentSuccesses = 0;

    /** @type {Set<StateChangeCallback>} */
    this.listeners = new Set();

    /** Timestamped log of recent task completions for decay calculation */
    /** @type {Array<{time: number, success: boolean}>} */
    this._recentEvents = [];

    /** Interval handle for auto mood updates */
    this._updateTimer = null;

    /** Zones with currently running tasks */
    /** @type {Map<string, number>} zoneId -> active task count */
    this._activeZones = new Map();

    // Start the periodic mood updater
    this._startAutoUpdate();
  }

  // ── Task tracking ──────────────────────────────────────────────────

  /**
   * Signal that a new task has started.
   * @param {string} [zoneId] - Optional zone where the task is running
   */
  taskStarted(zoneId) {
    this.activeTasks++;

    if (zoneId) {
      const current = this._activeZones.get(zoneId) || 0;
      this._activeZones.set(zoneId, current + 1);
    }

    this._recalculateState();
    this._emit();
  }

  /**
   * Signal that a task has completed.
   * @param {boolean} success - Whether the task succeeded
   * @param {string} [zoneId] - Optional zone where the task was running
   */
  taskCompleted(success, zoneId) {
    this.activeTasks = Math.max(0, this.activeTasks - 1);

    if (zoneId) {
      const current = this._activeZones.get(zoneId) || 1;
      if (current <= 1) {
        this._activeZones.delete(zoneId);
      } else {
        this._activeZones.set(zoneId, current - 1);
      }
    }

    // Record event for rolling stats
    const now = Date.now();
    this._recentEvents.push({ time: now, success });

    // Immediate mood adjustment
    if (success) {
      this.moodScore = Math.min(MOOD_MAX, this.moodScore + MOOD_SUCCESS_DELTA);
      this.recentSuccesses++;
    } else {
      this.moodScore = Math.max(MOOD_MIN, this.moodScore + MOOD_FAILURE_DELTA);
      this.recentFailures++;
    }

    this._recalculateState();
    this._emit();
  }

  // ── Mood update ────────────────────────────────────────────────────

  /**
   * Periodic mood update. Applies mean reversion, task pressure,
   * and prunes stale events from the recent window.
   */
  updateMood() {
    const now = Date.now();

    // Prune events outside the recent window
    this._recentEvents = this._recentEvents.filter(
      (e) => now - e.time < RECENT_WINDOW_MS,
    );

    // Recalculate rolling counters from the pruned list
    this.recentSuccesses = this._recentEvents.filter((e) => e.success).length;
    this.recentFailures = this._recentEvents.filter((e) => !e.success).length;

    // Mean reversion: drift toward resting mood
    const drift = (MOOD_RESTING - this.moodScore) * MOOD_DECAY_RATE;
    this.moodScore += drift;

    // Task pressure: more active tasks push mood down slightly
    const pressure = this.activeTasks * MOOD_TASK_PRESSURE;
    this.moodScore = Math.max(MOOD_MIN, this.moodScore - pressure);

    // Clamp
    this.moodScore = Math.max(MOOD_MIN, Math.min(MOOD_MAX, this.moodScore));

    const prevState = this.state;
    this._recalculateState();

    // Only emit if something actually changed meaningfully
    if (this.state !== prevState) {
      this._emit();
    }
  }

  // ── Getters ────────────────────────────────────────────────────────

  /**
   * Get the full current state snapshot for the renderer.
   * @returns {WorldSnapshot}
   */
  getState() {
    return {
      state: this.state,
      weather: this.getWeather(),
      moodScore: this.moodScore,
      activeTasks: this.activeTasks,
      recentSuccesses: this.recentSuccesses,
      recentFailures: this.recentFailures,
      timestamp: Date.now(),
    };
  }

  /**
   * Derive weather string from current moodScore.
   * @returns {Weather}
   */
  getWeather() {
    if (this.moodScore < 0.2) return "storm";
    if (this.moodScore < 0.4) return "rain";
    if (this.moodScore < 0.6) return "cloudy";
    if (this.moodScore < 0.8) return "clear";
    return "sunny";
  }

  /**
   * Get which zones currently have active tasks.
   * @returns {Map<string, number>}
   */
  getActiveZones() {
    return new Map(this._activeZones);
  }

  /**
   * Check if a specific zone has running tasks.
   * @param {string} zoneId
   * @returns {boolean}
   */
  isZoneActive(zoneId) {
    return (this._activeZones.get(zoneId) || 0) > 0;
  }

  // ── Event subscription ─────────────────────────────────────────────

  /**
   * Subscribe to state changes.
   * @param {StateChangeCallback} callback
   * @returns {() => void} Unsubscribe function
   */
  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  // ── Cleanup ────────────────────────────────────────────────────────

  /**
   * Stop the auto-update timer and clean up listeners.
   */
  destroy() {
    if (this._updateTimer !== null) {
      clearInterval(this._updateTimer);
      this._updateTimer = null;
    }
    this.listeners.clear();
  }

  // ── Internal ───────────────────────────────────────────────────────

  /**
   * Recalculate activity state from active task count.
   * @private
   */
  _recalculateState() {
    if (this.activeTasks === 0) {
      this.state = "idle";
    } else if (this.activeTasks <= 2) {
      this.state = "active";
    } else if (this.activeTasks <= 4) {
      this.state = "busy";
    } else {
      this.state = "overload";
    }
  }

  /**
   * Emit the current state to all listeners.
   * @private
   */
  _emit() {
    const snapshot = this.getState();
    for (const cb of this.listeners) {
      try {
        cb(snapshot);
      } catch (err) {
        console.warn("[WorldState] Listener error:", err);
      }
    }

    // Also dispatch a DOM event for UI components
    if (typeof document !== "undefined") {
      document.dispatchEvent(
        new CustomEvent("world-state:changed", {
          detail: snapshot,
          bubbles: true,
        }),
      );
    }
  }

  /**
   * Start the periodic auto-update timer.
   * @private
   */
  _startAutoUpdate() {
    if (typeof setInterval !== "undefined") {
      this._updateTimer = setInterval(() => {
        this.updateMood();
      }, AUTO_UPDATE_INTERVAL_MS);
    }
  }
}

// ── Singleton export ──────────────────────────────────────────────────

/** @type {WorldStateManager} */
const worldState = new WorldStateManager();

export { WorldStateManager };
export default worldState;
