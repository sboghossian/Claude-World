/**
 * splash-screen.js — Cinematic splash/loading screen for Claude World
 *
 * Shows immediately via inline HTML injected before any module loading.
 * This module enhances the inline splash with particle effects and
 * exposes a simple API for progress tracking and fade-out.
 *
 * Usage (in boot()):
 *   import { SplashScreen } from '../ui/splash-screen.js';
 *   const splash = new SplashScreen();
 *   splash.setProgress(1, 19, 'Initializing world renderer...');
 *   ...
 *   await splash.fadeOut();
 */

export class SplashScreen {
  /**
   * Enhance the inline #splash element that already exists in the DOM.
   * Loads the full CSS file and spawns floating particles.
   */
  constructor() {
    this.el = document.getElementById('splash');
    this.progressBar = this.el?.querySelector('.splash__progress-bar');
    this.progressLabel = this.el?.querySelector('.splash__progress-label');
    this.particlesContainer = this.el?.querySelector('.splash__particles');
    this._destroyed = false;

    if (!this.el) {
      console.warn('[SplashScreen] No #splash element found — skipping.');
      return;
    }

    // Load the full stylesheet
    this._loadCSS();

    // Spawn floating particle dots
    this._spawnParticles(28);

    // After the typewriter finishes (~2s), mark the title as done
    // so the caret stops blinking
    this._titleTimer = setTimeout(() => {
      const title = this.el.querySelector('.splash__title');
      if (title) title.classList.add('splash__title--done');
    }, 2800);
  }

  /* ────────────────────────────────────────────────────────────────── */
  /*  Public API                                                       */
  /* ────────────────────────────────────────────────────────────────── */

  /**
   * Update the progress bar and label.
   * @param {number} step   - Current boot step (1-based)
   * @param {number} total  - Total number of boot steps
   * @param {string} label  - Human-readable description of this step
   */
  setProgress(step, total, label) {
    if (this._destroyed || !this.el) return;

    const pct = Math.min(100, Math.round((step / total) * 100));

    if (this.progressBar) {
      this.progressBar.style.width = `${pct}%`;
    }
    if (this.progressLabel) {
      this.progressLabel.textContent = label || `Step ${step} of ${total}`;
    }
  }

  /**
   * Smoothly fade out and remove the splash screen.
   * Returns a promise that resolves when the transition ends.
   */
  fadeOut() {
    return new Promise((resolve) => {
      if (this._destroyed || !this.el) {
        resolve();
        return;
      }

      // Fill progress bar to 100%
      if (this.progressBar) {
        this.progressBar.style.width = '100%';
      }
      if (this.progressLabel) {
        this.progressLabel.textContent = 'Ready';
      }

      // Short pause at 100% before fading
      setTimeout(() => {
        this.el.classList.add('splash--hidden');

        const onDone = () => {
          this.el.removeEventListener('transitionend', onDone);
          this._destroy();
          resolve();
        };
        this.el.addEventListener('transitionend', onDone);

        // Safety timeout in case transitionend doesn't fire
        setTimeout(() => {
          this._destroy();
          resolve();
        }, 1200);
      }, 400);
    });
  }

  /* ────────────────────────────────────────────────────────────────── */
  /*  Private helpers                                                   */
  /* ────────────────────────────────────────────────────────────────── */

  /**
   * Load the full splash-screen.css stylesheet.
   */
  _loadCSS() {
    if (document.getElementById('splash-screen-css')) return;
    const link = document.createElement('link');
    link.id = 'splash-screen-css';
    link.rel = 'stylesheet';
    link.href = '../ui/splash-screen.css';
    document.head.appendChild(link);
  }

  /**
   * Create floating particle dots that rise upward like city lights.
   * @param {number} count - Number of particles to spawn
   */
  _spawnParticles(count) {
    if (!this.particlesContainer) return;

    const colors = [
      '#a855f7', // purple
      '#7c3aed', // deeper purple
      '#4a9eff', // blue
      '#60a5fa', // light blue
      '#f59e0b', // amber
      '#fcd34d', // gold
      '#c084fc', // lavender
    ];

    for (let i = 0; i < count; i++) {
      const dot = document.createElement('div');
      dot.className = 'splash__particle';

      const color = colors[Math.floor(Math.random() * colors.length)];
      const left = Math.random() * 100;
      const size = 2 + Math.random() * 3;
      const duration = 6 + Math.random() * 10;
      const delay = Math.random() * 8;
      const startY = 60 + Math.random() * 40; // start from bottom 40%

      dot.style.cssText = `
        left: ${left}%;
        bottom: -${Math.round(startY)}px;
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        box-shadow: 0 0 ${Math.round(size * 2)}px ${color};
        animation-duration: ${duration}s;
        animation-delay: ${delay}s;
      `;

      this.particlesContainer.appendChild(dot);
    }
  }

  /**
   * Remove the splash element from the DOM entirely.
   */
  _destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    clearTimeout(this._titleTimer);
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    // Also remove the CSS link
    const link = document.getElementById('splash-screen-css');
    if (link) link.remove();
  }
}
