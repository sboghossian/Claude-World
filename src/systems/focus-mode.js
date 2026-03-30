/**
 * focus-mode.js — Focus/Zen mode for Claude World
 *
 * Hides all UI chrome so only the isometric city canvas remains.
 * Features:
 *   - Toggle with Cmd+Shift+F or F11
 *   - Smooth fade-out of HUD, minimap, activity feed, notifications
 *   - Vignette overlay with pointer-events: none
 *   - Minimal floating clock (bottom-right)
 *   - Ambient auto-pan: camera slowly drifts across the city
 *   - Meditation mode: slows day/night cycle, calms weather
 *   - Quick-exit: Escape or mouse to top edge (thin exit bar)
 *   - Remembers and restores prior UI visibility state
 *   - Dispatches 'focus:enter' and 'focus:exit' events
 *
 * Usage:
 *   import { FocusMode } from '../systems/focus-mode.js';
 *   const focus = new FocusMode({ getCamera, getDayNight });
 *   // toggle via keyboard or:
 *   focus.toggle();
 */

// ── UI selectors that get hidden in focus mode ───────────────────────
const UI_SELECTORS = [
  '.hud-tl',
  '.hud-tc',
  '.hud-tr',
  '.hud-bl',
  '.hud-br',
  '.hud-minimap',
  '.activity-feed',
  '.notification-center',
  '.minimap-container',
  '[data-focus-hide]',
];

// ── Ambient auto-pan waypoints (tile coords) ─────────────────────────
const PAN_WAYPOINTS = [
  { x: 22, y: 22 },  // Dispatch Tower (center)
  { x: 15, y: 17 },  // Chat zone
  { x: 25, y: 17 },  // Memory zone
  { x: 29, y: 21 },  // Treasury
  { x: 17, y: 25 },  // Skills area
  { x: 11, y: 21 },  // R&D
  { x: 29, y: 27 },  // Sales
  { x: 15, y: 25 },  // Skills
  { x: 33, y: 19 },  // Exchange
  { x: 10, y: 31 },  // Docks
];

// ── Helpers ──────────────────────────────────────────────────────────

/** Create a DOM element with optional class and inner HTML. */
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Format current time as HH:MM. */
function formatTime() {
  const now = new Date();
  const hh  = String(now.getHours()).padStart(2, '0');
  const mm  = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ── Focus Mode class ─────────────────────────────────────────────────

export class FocusMode {
  /**
   * @param {Object} opts
   * @param {Function} [opts.getCamera]    — returns the Camera instance
   * @param {Function} [opts.getDayNight]  — returns the DayNightCycle instance
   * @param {boolean}  [opts.ambient=true] — enable ambient auto-pan by default
   * @param {boolean}  [opts.meditation=false] — start in meditation mode
   */
  constructor(opts = {}) {
    this._opts = opts;
    this._active = false;
    this._meditation = opts.meditation ?? false;
    this._ambientEnabled = opts.ambient ?? true;

    // Ambient pan state
    this._waypointIdx = 0;
    this._panFrame = null;
    this._panStartTime = 0;
    this._panDuration = 6000; // ms per waypoint transition

    // Saved state for restoration
    this._savedVisibility = new Map();
    this._savedCycleDuration = null;

    // Clock interval
    this._clockInterval = null;

    // CSS loaded flag
    this._cssLoaded = false;

    // DOM elements (created lazily)
    this._vignette = null;
    this._exitBar = null;
    this._clock = null;
    this._ambientBadge = null;

    // Bound handlers for cleanup
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onExitBarClick = this._handleExitBarClick.bind(this);

    // Register global keyboard shortcut
    document.addEventListener('keydown', this._onKeyDown);
  }

  // ══════════════════════════════════════════════════════════════════
  // Public API
  // ══════════════════════════════════════════════════════════════════

  /** Enter focus mode. */
  enter() {
    if (this._active) return;
    this._active = true;

    this._ensureCSS();
    this._createDOM();
    this._saveUIState();
    this._hideUI();

    // Activate vignette
    requestAnimationFrame(() => {
      this._vignette.classList.add('focus-vignette--active');
      this._clock.classList.add('focus-clock--active');
      this._exitBar.classList.add('focus-exit-bar--visible');
    });

    // Body class for CSS-driven hide
    document.body.classList.add('focus-mode-active');

    // Start clock
    this._updateClock();
    this._clockInterval = setInterval(() => this._updateClock(), 10_000);

    // Start ambient pan if enabled
    if (this._ambientEnabled) {
      this._startAmbientPan();
    }

    // Meditation: slow down day/night cycle
    if (this._meditation) {
      this._enterMeditation();
    }

    // Mouse listener for exit bar reveal
    document.addEventListener('mousemove', this._onMouseMove);

    // Dispatch event
    document.dispatchEvent(new CustomEvent('focus:enter', {
      bubbles: true,
      detail: { meditation: this._meditation, ambient: this._ambientEnabled },
    }));

    console.log('[FocusMode] Entered focus mode');
  }

  /** Exit focus mode and restore UI. */
  exit() {
    if (!this._active) return;
    this._active = false;

    // Remove body class
    document.body.classList.remove('focus-mode-active');

    // Fade out vignette and clock
    if (this._vignette) this._vignette.classList.remove('focus-vignette--active');
    if (this._clock) this._clock.classList.remove('focus-clock--active');
    if (this._exitBar) this._exitBar.classList.remove('focus-exit-bar--visible');
    if (this._ambientBadge) this._ambientBadge.classList.remove('focus-ambient-badge--active');

    // Stop clock
    clearInterval(this._clockInterval);
    this._clockInterval = null;

    // Stop ambient pan
    this._stopAmbientPan();

    // Exit meditation
    if (this._meditation) {
      this._exitMeditation();
    }

    // Restore UI after fade completes
    setTimeout(() => {
      this._restoreUIState();
      this._removeDOM();
    }, 550);

    // Remove mouse listener
    document.removeEventListener('mousemove', this._onMouseMove);

    // Dispatch event
    document.dispatchEvent(new CustomEvent('focus:exit', {
      bubbles: true,
      detail: { meditation: this._meditation },
    }));

    console.log('[FocusMode] Exited focus mode');
  }

  /** Toggle focus mode on/off. */
  toggle() {
    if (this._active) {
      this.exit();
    } else {
      this.enter();
    }
  }

  /** Whether focus mode is currently active. */
  isActive() {
    return this._active;
  }

  /**
   * Enable or disable meditation mode.
   * If focus mode is active, applies/removes immediately.
   * @param {boolean} [on]
   */
  setMeditation(on) {
    const wasOn = this._meditation;
    this._meditation = on ?? !this._meditation;

    if (this._active && this._meditation && !wasOn) {
      this._enterMeditation();
    } else if (this._active && !this._meditation && wasOn) {
      this._exitMeditation();
    }

    // Update clock label
    this._updateClock();
  }

  /**
   * Enable or disable ambient camera pan.
   * @param {boolean} [on]
   */
  setAmbient(on) {
    this._ambientEnabled = on ?? !this._ambientEnabled;

    if (this._active && this._ambientEnabled) {
      this._startAmbientPan();
    } else if (this._active && !this._ambientEnabled) {
      this._stopAmbientPan();
    }
  }

  /** Tear down all DOM and listeners. */
  destroy() {
    if (this._active) this.exit();
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('mousemove', this._onMouseMove);
    this._removeDOM();
  }

  // ══════════════════════════════════════════════════════════════════
  // DOM Creation
  // ══════════════════════════════════════════════════════════════════

  /** Ensure the focus-mode.css stylesheet is loaded. */
  _ensureCSS() {
    if (this._cssLoaded) return;
    if (document.querySelector('link[href*="focus-mode"]')) {
      this._cssLoaded = true;
      return;
    }

    const link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = new URL('./focus-mode.css', import.meta.url).href;
    document.head.appendChild(link);
    this._cssLoaded = true;
  }

  /** Create all focus-mode DOM elements. */
  _createDOM() {
    if (this._vignette) return; // Already created

    // ── Vignette ─────────────────────────────────────────────────
    this._vignette = el('div', 'focus-vignette');
    this._vignette.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this._vignette);

    // ── Exit bar ─────────────────────────────────────────────────
    this._exitBar = el('div', 'focus-exit-bar');
    this._exitBar.setAttribute('role', 'button');
    this._exitBar.setAttribute('aria-label', 'Exit focus mode');
    this._exitBar.setAttribute('tabindex', '0');

    const exitLabel = el('span', 'focus-exit-bar__label', 'Exit Focus Mode');
    this._exitBar.appendChild(exitLabel);

    this._exitBar.addEventListener('click', this._onExitBarClick);
    this._exitBar.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.exit();
      }
    });
    document.body.appendChild(this._exitBar);

    // ── Floating clock ───────────────────────────────────────────
    this._clock = el('div', 'focus-clock');
    this._clock.setAttribute('aria-live', 'off');

    this._clockTime = el('span', 'focus-clock__time');
    this._clock.appendChild(this._clockTime);

    this._clockMedLabel = el('span', 'focus-clock__meditation');
    this._clock.appendChild(this._clockMedLabel);

    document.body.appendChild(this._clock);

    // ── Ambient badge ────────────────────────────────────────────
    this._ambientBadge = el('div', 'focus-ambient-badge');
    this._ambientBadge.setAttribute('aria-hidden', 'true');

    const dot = el('span', 'focus-ambient-badge__dot');
    this._ambientBadge.appendChild(dot);
    this._ambientBadge.appendChild(document.createTextNode('Ambient'));

    document.body.appendChild(this._ambientBadge);
  }

  /** Remove all focus-mode DOM elements. */
  _removeDOM() {
    if (this._vignette) { this._vignette.remove(); this._vignette = null; }
    if (this._exitBar)  { this._exitBar.removeEventListener('click', this._onExitBarClick); this._exitBar.remove(); this._exitBar = null; }
    if (this._clock)    { this._clock.remove(); this._clock = null; this._clockTime = null; this._clockMedLabel = null; }
    if (this._ambientBadge) { this._ambientBadge.remove(); this._ambientBadge = null; }
  }

  // ══════════════════════════════════════════════════════════════════
  // UI Visibility (save / hide / restore)
  // ══════════════════════════════════════════════════════════════════

  /** Save current visibility state of all UI elements. */
  _saveUIState() {
    this._savedVisibility.clear();

    for (const selector of UI_SELECTORS) {
      const elements = document.querySelectorAll(selector);
      for (const elem of elements) {
        const style = window.getComputedStyle(elem);
        this._savedVisibility.set(elem, {
          opacity: elem.style.opacity || '',
          pointerEvents: elem.style.pointerEvents || '',
          display: style.display,
        });
      }
    }
  }

  /** Hide all UI elements (CSS class does the heavy lifting). */
  _hideUI() {
    // The body.focus-mode-active class handles opacity via CSS.
    // This method is a hook for any additional imperative hiding.
  }

  /** Restore all UI elements to their saved state. */
  _restoreUIState() {
    for (const [elem, saved] of this._savedVisibility) {
      if (!elem.isConnected) continue;
      elem.style.opacity = saved.opacity;
      elem.style.pointerEvents = saved.pointerEvents;
    }
    this._savedVisibility.clear();
  }

  // ══════════════════════════════════════════════════════════════════
  // Clock
  // ══════════════════════════════════════════════════════════════════

  _updateClock() {
    if (!this._clockTime) return;
    this._clockTime.textContent = formatTime();
    this._clockMedLabel.textContent = this._meditation ? 'meditation' : '';
    this._clockMedLabel.style.display = this._meditation ? 'block' : 'none';
  }

  // ══════════════════════════════════════════════════════════════════
  // Ambient Auto-Pan
  // ══════════════════════════════════════════════════════════════════

  _startAmbientPan() {
    if (this._panFrame !== null) return;

    const camera = this._opts.getCamera?.();
    if (!camera) {
      console.warn('[FocusMode] No camera available for ambient pan');
      return;
    }

    // Show ambient badge
    if (this._ambientBadge) {
      this._ambientBadge.classList.add('focus-ambient-badge--active');
    }

    this._waypointIdx = 0;
    this._panStartTime = performance.now();

    const tick = () => {
      if (!this._active || !this._ambientEnabled) return;

      const cam = this._opts.getCamera?.();
      if (!cam) return;

      const elapsed = performance.now() - this._panStartTime;
      const progress = Math.min(1, elapsed / this._panDuration);

      // Ease in-out cubic
      const t = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      const current = PAN_WAYPOINTS[this._waypointIdx];
      const next    = PAN_WAYPOINTS[(this._waypointIdx + 1) % PAN_WAYPOINTS.length];

      // Interpolate tile coordinates and convert to screen-space camera target
      // Camera uses negative world coords, so we approximate with tile-based offset
      // Each tile unit is roughly 32px in isometric space
      const TILE_PX = 32;
      const cx = current.x + (next.x - current.x) * t;
      const cy = current.y + (next.y - current.y) * t;

      // Set camera target (camera stores negative world coords)
      cam.targetX = -cx * TILE_PX;
      cam.targetY = -cy * TILE_PX;

      if (progress >= 1) {
        // Move to next waypoint
        this._waypointIdx = (this._waypointIdx + 1) % PAN_WAYPOINTS.length;
        this._panStartTime = performance.now();
      }

      this._panFrame = requestAnimationFrame(tick);
    };

    this._panFrame = requestAnimationFrame(tick);
  }

  _stopAmbientPan() {
    if (this._panFrame !== null) {
      cancelAnimationFrame(this._panFrame);
      this._panFrame = null;
    }

    if (this._ambientBadge) {
      this._ambientBadge.classList.remove('focus-ambient-badge--active');
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // Meditation Mode
  // ══════════════════════════════════════════════════════════════════

  /** Slow day/night cycle and dispatch calming event. */
  _enterMeditation() {
    const dayNight = this._opts.getDayNight?.();
    if (dayNight) {
      this._savedCycleDuration = dayNight._cycleDuration;
      // Slow cycle to 4x normal duration
      dayNight.setCycleDuration(this._savedCycleDuration * 4);
    }

    document.dispatchEvent(new CustomEvent('focus:meditation-enter', {
      bubbles: true,
    }));
  }

  /** Restore original day/night cycle speed. */
  _exitMeditation() {
    const dayNight = this._opts.getDayNight?.();
    if (dayNight && this._savedCycleDuration !== null) {
      dayNight.setCycleDuration(this._savedCycleDuration);
      this._savedCycleDuration = null;
    }

    document.dispatchEvent(new CustomEvent('focus:meditation-exit', {
      bubbles: true,
    }));
  }

  // ══════════════════════════════════════════════════════════════════
  // Event Handlers
  // ══════════════════════════════════════════════════════════════════

  /**
   * Global keydown handler.
   * - Cmd+Shift+F or F11 → toggle focus mode
   * - Escape → exit focus mode
   * @param {KeyboardEvent} e
   */
  _handleKeyDown(e) {
    // Cmd+Shift+F (macOS) or Ctrl+Shift+F (other)
    const isFocusToggle =
      (e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'f';

    // F11 — traditional fullscreen/zen shortcut
    const isF11 = e.key === 'F11';

    if (isFocusToggle || isF11) {
      e.preventDefault();
      this.toggle();
      return;
    }

    // Escape exits focus mode
    if (e.key === 'Escape' && this._active) {
      e.preventDefault();
      this.exit();
      return;
    }

    // M toggles meditation while in focus mode
    if (e.key === 'm' && this._active && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      this.setMeditation();
      return;
    }

    // A toggles ambient pan while in focus mode
    if (e.key === 'a' && this._active && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      this.setAmbient();
      return;
    }
  }

  /**
   * Mouse move handler — shows exit bar when cursor is near the top.
   * @param {MouseEvent} e
   */
  _handleMouseMove(e) {
    if (!this._active || !this._exitBar) return;

    if (e.clientY <= 6) {
      this._exitBar.classList.add('focus-exit-bar--visible');
    } else if (e.clientY > 48) {
      // Only hide if not hovering the bar itself
      if (!this._exitBar.matches(':hover')) {
        this._exitBar.classList.remove('focus-exit-bar--visible');
      }
    }
  }

  /** Exit bar click handler. */
  _handleExitBarClick() {
    this.exit();
  }
}
