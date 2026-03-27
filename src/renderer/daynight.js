/**
 * daynight.js - Day/night cycle for Claude World
 *
 * Applies a tint to the world container that cycles through
 * dawn, day, dusk, and night phases over a configurable period.
 */

import { ColorMatrixFilter } from 'pixi.js';
import { DAY_CYCLE_MS, DAY_PHASES } from './constants.js';

/**
 * Linearly interpolate between two hex colors.
 * @param {number} c1 - Start color (0xRRGGBB)
 * @param {number} c2 - End color (0xRRGGBB)
 * @param {number} t  - Progress 0..1
 * @returns {number}
 */
function lerpColor(c1, c2, t) {
  const r1 = (c1 >> 16) & 0xff, g1 = (c1 >> 8) & 0xff, b1 = c1 & 0xff;
  const r2 = (c2 >> 16) & 0xff, g2 = (c2 >> 8) & 0xff, b2 = c2 & 0xff;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return (r << 16) | (g << 8) | b;
}

/**
 * Linearly interpolate between two numbers.
 * @param {number} a
 * @param {number} b
 * @param {number} t
 * @returns {number}
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

export class DayNightCycle {
  /**
   * @param {import('pixi.js').Container} worldContainer
   */
  constructor(worldContainer) {
    this.world = worldContainer;
    this._startTime = performance.now();
    this._cycleDuration = DAY_CYCLE_MS;

    /** @type {ColorMatrixFilter} */
    this._filter = new ColorMatrixFilter();
    this.world.filters = [this._filter];

    /** Current normalized time-of-day (0..1) */
    this.timeOfDay = 0;
    /** Current phase name */
    this.phase = 'day';
    /** Night intensity 0..1 (for building glow) */
    this.nightIntensity = 0;
  }

  /**
   * Update the cycle. Call every frame.
   */
  update() {
    const elapsed = performance.now() - this._startTime;
    this.timeOfDay = (elapsed % this._cycleDuration) / this._cycleDuration;

    // Determine current phase and progress within it
    const phases = Object.entries(DAY_PHASES);
    let currentTint = 0xffffff;
    let currentBrightness = 1.0;
    this.nightIntensity = 0;

    for (let i = 0; i < phases.length; i++) {
      const [name, phase] = phases[i];
      if (this.timeOfDay >= phase.start && this.timeOfDay < phase.end) {
        this.phase = name;
        const phaseProgress = (this.timeOfDay - phase.start) / (phase.end - phase.start);

        // Get next phase for interpolation
        const nextIdx = (i + 1) % phases.length;
        const [, nextPhase] = phases[nextIdx];

        // Smooth transition: blend from current phase center to next phase
        if (phaseProgress > 0.7) {
          // Transition zone: blend toward next phase
          const blendT = (phaseProgress - 0.7) / 0.3;
          currentTint = lerpColor(phase.tint, nextPhase.tint, blendT);
          currentBrightness = lerp(phase.brightness, nextPhase.brightness, blendT);
        } else {
          currentTint = phase.tint;
          currentBrightness = phase.brightness;
        }

        // Night intensity for glow effects
        if (name === 'night') {
          this.nightIntensity = Math.sin(phaseProgress * Math.PI);
        } else if (name === 'dusk') {
          this.nightIntensity = phaseProgress * 0.5;
        }
        break;
      }
    }

    // Apply tint via ColorMatrixFilter
    this._applyTint(currentTint, currentBrightness);
  }

  /**
   * Apply a color tint and brightness via the color matrix filter.
   * @param {number} tint - 0xRRGGBB
   * @param {number} brightness - 0..1
   */
  _applyTint(tint, brightness) {
    const r = ((tint >> 16) & 0xff) / 255;
    const g = ((tint >> 8) & 0xff) / 255;
    const b = (tint & 0xff) / 255;

    // Reset to identity then apply tint + brightness
    this._filter.reset();
    this._filter.matrix[0] = r * brightness;
    this._filter.matrix[6] = g * brightness;
    this._filter.matrix[12] = b * brightness;
  }

  /**
   * Set the cycle duration.
   * @param {number} ms
   */
  setCycleDuration(ms) {
    this._cycleDuration = ms;
  }
}
