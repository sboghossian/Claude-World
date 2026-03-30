/**
 * fog.js - Fog of war overlay for Claude World
 *
 * Semi-transparent dark overlays per ring that grow denser
 * toward the edges. Active zones punch through the fog.
 */

import { Container, Graphics } from "pixi.js";
import {
  TILE_WIDTH,
  TILE_HEIGHT,
  GRID_SIZE,
  COLORS,
  FOG_OPACITY,
} from "./constants.js";
import { tileToScreen } from "./tiles.js";
import { ZONE_DEFS } from "./zones.js";

/**
 * Ring boundary definitions.
 * Each ring is defined by a rectangular tile region.
 * We approximate rings as distance-from-center bands.
 */
const RING_BOUNDS = [
  { ring: 0, minDist: 0, maxDist: 5 },
  { ring: 1, minDist: 5, maxDist: 10 },
  { ring: 2, minDist: 10, maxDist: 15 },
  { ring: 3, minDist: 15, maxDist: 20 },
  { ring: 4, minDist: 20, maxDist: 40 },
];

/**
 * Get the ring number for a tile based on Chebyshev distance from center.
 * @param {number} tx
 * @param {number} ty
 * @returns {number}
 */
function tileRing(tx, ty) {
  const cx = GRID_SIZE / 2;
  const cy = GRID_SIZE / 2;
  const dist = Math.max(Math.abs(tx - cx), Math.abs(ty - cy));
  for (const rb of RING_BOUNDS) {
    if (dist >= rb.minDist && dist < rb.maxDist) return rb.ring;
  }
  return 4;
}

/**
 * Get fog opacity for a given ring.
 * @param {number} ring
 * @returns {number}
 */
function fogOpacityForRing(ring) {
  switch (ring) {
    case 0:
      return FOG_OPACITY.ring0;
    case 1:
      return FOG_OPACITY.ring1;
    case 2:
      return FOG_OPACITY.ring2;
    case 3:
      return FOG_OPACITY.ring3;
    default:
      return FOG_OPACITY.edge;
  }
}

export class FogOfWar {
  constructor() {
    /** @type {Container} */
    this.container = new Container();
    /** @type {Map<number, Graphics>} ring -> Graphics */
    this._ringGraphics = new Map();

    this._build();
  }

  /** Build fog overlays for each ring. */
  _build() {
    // Build a set of tiles that belong to active zones (no fog there)
    const activeTiles = new Set();
    for (const z of ZONE_DEFS) {
      if (!z.active) continue;
      for (let dx = -1; dx <= z.w; dx++) {
        for (let dy = -1; dy <= z.h; dy++) {
          activeTiles.add(`${z.tileX + dx},${z.tileY + dy}`);
        }
      }
    }

    // Group tiles by ring, skipping rings 0 and 1 (no fog)
    // For performance, we draw fog in large batched Graphics per ring
    for (let ring = 2; ring <= 4; ring++) {
      const opacity = fogOpacityForRing(ring);
      if (opacity <= 0) continue;

      const gfx = new Graphics();
      const hw = TILE_WIDTH / 2;
      const hh = TILE_HEIGHT / 2;

      for (let ty = 0; ty < GRID_SIZE; ty++) {
        for (let tx = 0; tx < GRID_SIZE; tx++) {
          if (tileRing(tx, ty) !== ring) continue;
          // Skip tiles near active zones
          if (activeTiles.has(`${tx},${ty}`)) continue;

          const { x: sx, y: sy } = tileToScreen(tx, ty);
          gfx.poly([
            sx,
            sy,
            sx + hw,
            sy + hh / 2,
            sx,
            sy + hh,
            sx - hw,
            sy + hh / 2,
          ]);
          gfx.fill({ color: COLORS.fogColor, alpha: opacity });
        }
      }

      this._ringGraphics.set(ring, gfx);
      this.container.addChild(gfx);
    }
  }

  /**
   * Dissolve fog for a specific ring (for future zone unlocking).
   * Animates the ring's fog alpha to 0 over the given duration.
   * @param {number} ring
   * @param {number} durationMs
   */
  dissolveFog(ring, durationMs = 2000) {
    const gfx = this._ringGraphics.get(ring);
    if (!gfx) return;

    const startAlpha = gfx.alpha;
    const startTime = performance.now();

    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      gfx.alpha = startAlpha * (1 - progress);
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        gfx.visible = false;
      }
    };
    requestAnimationFrame(animate);
  }
}
