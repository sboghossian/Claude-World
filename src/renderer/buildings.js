/**
 * buildings.js - Isometric building renderer for Claude World
 *
 * Draws buildings as colored isometric boxes (top, left, right faces)
 * using PixiJS Graphics. Active buildings are full color; locked zones
 * are rendered as grey "ruins" with a dashed ghost outline.
 *
 * Construction progress system (0.0 → 1.0):
 *   0.0         — ruins (grey, height=1, dashed ghost outline)
 *   0.0–0.35    — scaffolding phase: ruins height + orange scaffold poles/planks
 *   0.35–0.75   — walls rising: fractional height, color mixing, scaffolding visible
 *   0.75–0.99   — near-complete: full height, district colors, windows appearing, scaffold fading
 *   1.0         — complete: full height, full colors, all windows, no scaffold
 */

import { Container, Graphics } from 'pixi.js';
import {
  TILE_WIDTH, TILE_HEIGHT, HEIGHT_UNIT_PX, HEIGHT_RUIN, COLORS,
} from './constants.js';
import { ZONE_DEFS } from './zones.js';
import { tileToScreen } from './tiles.js';

// ── Construction stage thresholds ────────────────────────────────────
const STAGE_SCAFFOLD_START = 0.0;
const STAGE_WALLS_START    = 0.35;
const STAGE_FINISH_START   = 0.75;
const STAGE_COMPLETE       = 1.0;

// Scaffold colors
const SCAFFOLD_POLE_COLOR  = 0xb85c20;  // dark orange-brown
const SCAFFOLD_PLANK_COLOR = 0xd4832a;  // lighter orange-brown

/**
 * @typedef {Object} BuildingSprite
 * @property {string}   zoneId
 * @property {Graphics} gfx        - The graphics object for this building
 * @property {Graphics} [glow]     - Optional warm glow overlay (active buildings)
 * @property {boolean}  hovered
 * @property {import('./zones.js').ZoneDef} zone - Reference to zone definition
 * @property {number}   progress   - Construction progress 0.0–1.0
 */

/**
 * Linear interpolation between two values.
 * @param {number} a
 * @param {number} b
 * @param {number} t  0–1
 * @returns {number}
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Linearly interpolate between two 24-bit hex colors channel by channel.
 * @param {number} colorA
 * @param {number} colorB
 * @param {number} t  0–1
 * @returns {number}
 */
function lerpColor(colorA, colorB, t) {
  const rA = (colorA >> 16) & 0xff;
  const gA = (colorA >>  8) & 0xff;
  const bA =  colorA        & 0xff;
  const rB = (colorB >> 16) & 0xff;
  const gB = (colorB >>  8) & 0xff;
  const bB =  colorB        & 0xff;
  const r  = Math.round(lerp(rA, rB, t));
  const g  = Math.round(lerp(gA, gB, t));
  const b  = Math.round(lerp(bA, bB, t));
  return (r << 16) | (g << 8) | b;
}

/**
 * Interpolate a full face palette (top/left/right) between two palettes.
 * @param {{ top: number, left: number, right: number }} palA
 * @param {{ top: number, left: number, right: number }} palB
 * @param {number} t  0–1
 * @returns {{ top: number, left: number, right: number }}
 */
function lerpPalette(palA, palB, t) {
  return {
    top:   lerpColor(palA.top,   palB.top,   t),
    left:  lerpColor(palA.left,  palB.left,  t),
    right: lerpColor(palA.right, palB.right, t),
  };
}

export class BuildingManager {
  constructor() {
    /** @type {Container} */
    this.container = new Container();
    /** @type {BuildingSprite[]} */
    this.buildings = [];

    this._buildAll();
  }

  // ── Initialisation ───────────────────────────────────────────────

  /** Build all zone buildings and add to container. */
  _buildAll() {
    // Sort zones by depth (tileX + tileY ascending) for painter's algorithm
    const sorted = [...ZONE_DEFS].sort((a, b) => (a.tileX + a.tileY) - (b.tileX + b.tileY));

    for (const zone of sorted) {
      const entry = this._createEntry(zone);
      this.buildings.push(entry);
      this.container.addChild(entry.gfx);
    }
  }

  /**
   * Allocate a BuildingSprite entry and do the first draw.
   * @param {import('./zones.js').ZoneDef} zone
   * @returns {BuildingSprite}
   */
  _createEntry(zone) {
    const gfx = new Graphics();

    // Position at the correct screen location (top-left tile of the zone)
    const pos = tileToScreen(zone.tileX, zone.tileY);
    gfx.position.set(pos.x, pos.y);

    // Store interactive flag
    gfx.eventMode = 'static';
    gfx.cursor = 'pointer';

    // Initial progress: 1.0 if already active, 0.0 if locked
    const progress = zone.active ? 1.0 : 0.0;

    /** @type {BuildingSprite} */
    const entry = { zoneId: zone.id, gfx, hovered: false, zone, progress };

    // Hover events
    gfx.on('pointerenter', () => this._onHover(entry, true));
    gfx.on('pointerleave', () => this._onHover(entry, false));

    // Draw initial appearance
    this._rebuildBuilding(entry);

    return entry;
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Set the construction progress for a specific zone and redraw it.
   * @param {string} zoneId
   * @param {number} progress  0.0 (ruin) → 1.0 (complete)
   */
  setZoneProgress(zoneId, progress) {
    const entry = this.buildings.find(b => b.zoneId === zoneId);
    if (!entry) return;
    entry.progress = Math.max(0, Math.min(1, progress));
    this._rebuildBuilding(entry);
  }

  /**
   * Get the current construction progress of a zone.
   * @param {string} zoneId
   * @returns {number}  0.0–1.0, or -1 if not found
   */
  getZoneProgress(zoneId) {
    const entry = this.buildings.find(b => b.zoneId === zoneId);
    return entry ? entry.progress : -1;
  }

  /**
   * Update all buildings from a DB zone array.
   * Each element must have `zone_type` (matches zone.id) and `build_progress` (0.0–1.0).
   * @param {{ zone_type: string, build_progress: number }[]} zones
   */
  updateAllFromDB(zones) {
    for (const row of zones) {
      this.setZoneProgress(row.zone_type, row.build_progress);
    }
  }

  /**
   * Test if a world-space point hits any building.
   * Returns the zone definition if hit, null otherwise.
   * @param {number} worldX
   * @param {number} worldY
   * @returns {import('./zones.js').ZoneDef | null}
   */
  hitTest(worldX, worldY) {
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 4;

    // Test in reverse order (front buildings first)
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b   = this.buildings[i];
      const zone = b.zone;
      const pos  = tileToScreen(zone.tileX, zone.tileY);

      // Effective visible height for hit-test
      const hPx = this._effectiveHeight(b) * HEIGHT_UNIT_PX;

      // Bounding box check (rough)
      const minX = pos.x - zone.h * hw;
      const maxX = pos.x + zone.w * hw;
      const minY = pos.y - hPx;
      const maxY = pos.y + (zone.w + zone.h) * hh;

      if (worldX >= minX && worldX <= maxX && worldY >= minY && worldY <= maxY) {
        return zone;
      }
    }
    return null;
  }

  /**
   * Set the night glow intensity on active buildings.
   * @param {number} intensity - 0 (day) to 1 (full night)
   */
  setNightGlow(intensity) {
    for (const b of this.buildings) {
      if (b.zone.active && b.glow) {
        b.glow.alpha = 0.3 + intensity * 0.7;
      }
    }
  }

  // ── Core rebuild ─────────────────────────────────────────────────

  /**
   * Clear and fully redraw a building sprite based on its current
   * zone definition and progress value.
   * @param {BuildingSprite} entry
   */
  _rebuildBuilding(entry) {
    const { gfx, zone, progress } = entry;

    // Clear previous drawing
    gfx.clear();

    const p = progress;

    if (p >= STAGE_COMPLETE) {
      // ── Fully complete ──────────────────────────────────────────
      this._drawIsoBox(gfx, zone, zone.height, COLORS[zone.district], false);
      this._drawWindowGlow(gfx, zone, zone.height, 1.0);

    } else if (p >= STAGE_FINISH_START) {
      // ── Near-complete (0.75–0.99) ───────────────────────────────
      // t runs 0→1 within this stage
      const t = (p - STAGE_FINISH_START) / (STAGE_COMPLETE - STAGE_FINISH_START);
      const palette = COLORS[zone.district];

      this._drawIsoBox(gfx, zone, zone.height, palette, false);

      // Windows appear progressively
      this._drawWindowGlow(gfx, zone, zone.height, t);

      // Scaffolding fades out
      const scaffoldAlpha = 1.0 - t;
      this._drawScaffolding(gfx, zone, zone.height, 1.0, scaffoldAlpha);

    } else if (p >= STAGE_WALLS_START) {
      // ── Walls rising (0.35–0.75) ────────────────────────────────
      // t runs 0→1 within this stage
      const t = (p - STAGE_WALLS_START) / (STAGE_FINISH_START - STAGE_WALLS_START);

      // Height grows from HEIGHT_RUIN up to full zone.height
      const currentHeight = lerp(HEIGHT_RUIN, zone.height, t);

      // Color mixes from ruin grey toward the district palette
      const palette = lerpPalette(COLORS.ruin, COLORS[zone.district], t);

      this._drawIsoBox(gfx, zone, currentHeight, palette, false);

      // Scaffolding at full density around the growing walls
      this._drawScaffolding(gfx, zone, zone.height, 1.0, 1.0);

    } else if (p > STAGE_SCAFFOLD_START) {
      // ── Scaffolding phase (0.0–0.35) ────────────────────────────
      // Ruins base, then scaffold density grows with progress
      const scaffoldDensity = p / STAGE_WALLS_START;  // 0→1

      this._drawIsoBox(gfx, zone, HEIGHT_RUIN, COLORS.ruin, true);
      this._drawGhostOutline(gfx, zone);
      this._drawScaffolding(gfx, zone, zone.height, scaffoldDensity, 1.0);

    } else {
      // ── Pure ruins (p === 0.0) ───────────────────────────────────
      this._drawIsoBox(gfx, zone, HEIGHT_RUIN, COLORS.ruin, true);
      this._drawGhostOutline(gfx, zone);
    }
  }

  // ── Drawing primitives ───────────────────────────────────────────

  /**
   * Compute the isometric footprint corner positions (relative to gfx origin).
   * @param {import('./zones.js').ZoneDef} zone
   * @returns {{ topX, topY, rightX, rightY, botX, botY, leftX, leftY }}
   */
  _footprint(zone) {
    const hw = TILE_WIDTH  / 2;
    const hh = TILE_HEIGHT / 4;
    const w  = zone.w;
    const h  = zone.h;
    return {
      topX:   0,
      topY:   0,
      rightX: w * hw,
      rightY: w * hh,
      botX:   (w - h) * hw,
      botY:   (w + h) * hh,
      leftX: -h * hw,
      leftY:  h * hh,
    };
  }

  /**
   * Draw an isometric box (3 visible faces).
   * @param {Graphics} gfx
   * @param {import('./zones.js').ZoneDef} zone
   * @param {number} height - height in units
   * @param {{ top: number, left: number, right: number }} palette
   * @param {boolean} isRuin
   */
  _drawIsoBox(gfx, zone, height, palette, isRuin) {
    const { topX, topY, rightX, rightY, botX, botY, leftX, leftY } = this._footprint(zone);
    const hPx = height * HEIGHT_UNIT_PX;
    const alpha = isRuin ? 0.6 : 1.0;

    // ── Top face ──────────────────────────────────────────────────
    gfx.poly([
      topX,   topY   - hPx,
      rightX, rightY - hPx,
      botX,   botY   - hPx,
      leftX,  leftY  - hPx,
    ]);
    gfx.fill({ color: palette.top, alpha });

    // ── Left face ─────────────────────────────────────────────────
    gfx.poly([
      leftX, leftY  - hPx,
      botX,  botY   - hPx,
      botX,  botY,
      leftX, leftY,
    ]);
    gfx.fill({ color: palette.left, alpha });

    // ── Right face ────────────────────────────────────────────────
    gfx.poly([
      rightX, rightY - hPx,
      botX,   botY   - hPx,
      botX,   botY,
      rightX, rightY,
    ]);
    gfx.fill({ color: palette.right, alpha });

    // ── Edge lines for definition ─────────────────────────────────
    const edgeAlpha = isRuin ? 0.3 : 0.5;

    // Top face outline
    gfx.poly([
      topX,   topY   - hPx,
      rightX, rightY - hPx,
      botX,   botY   - hPx,
      leftX,  leftY  - hPx,
    ]);
    gfx.stroke({ color: 0x000000, alpha: edgeAlpha, width: 1 });

    // Vertical edges
    const verts = [
      [topX,   topY   - hPx, topX,   topY],
      [rightX, rightY - hPx, rightX, rightY],
      [botX,   botY   - hPx, botX,   botY],
      [leftX,  leftY  - hPx, leftX,  leftY],
    ];
    for (const [x1, y1, x2, y2] of verts) {
      gfx.moveTo(x1, y1);
      gfx.lineTo(x2, y2);
      gfx.stroke({ color: 0x000000, alpha: edgeAlpha, width: 1 });
    }

    // Bottom face outline
    gfx.poly([topX, topY, rightX, rightY, botX, botY, leftX, leftY]);
    gfx.stroke({ color: 0x000000, alpha: edgeAlpha * 0.5, width: 0.5 });
  }

  /**
   * Draw a dashed ghost outline showing the full building height for ruins.
   * @param {Graphics} gfx
   * @param {import('./zones.js').ZoneDef} zone
   */
  _drawGhostOutline(gfx, zone) {
    const { topX, topY, rightX, rightY, botX, botY, leftX, leftY } = this._footprint(zone);
    const hPx = zone.height * HEIGHT_UNIT_PX;

    // Top face at full height
    gfx.poly([
      topX,   topY   - hPx,
      rightX, rightY - hPx,
      botX,   botY   - hPx,
      leftX,  leftY  - hPx,
    ]);
    gfx.stroke({ color: 0xaaaaaa, alpha: 0.3, width: 1 });

    // Dashed vertical edges to full height for the 3 visible corners
    const corners = [
      [rightX, rightY],
      [botX,   botY],
      [leftX,  leftY],
    ];
    for (const [cx, cy] of corners) {
      const dashLen  = 3;
      const gapLen   = 3;
      const totalH   = hPx - HEIGHT_RUIN * HEIGHT_UNIT_PX;
      let   drawn    = 0;
      const startY   = cy - HEIGHT_RUIN * HEIGHT_UNIT_PX;
      while (drawn < totalH) {
        const segStart = startY - drawn;
        const segEnd   = Math.max(segStart - dashLen, cy - hPx);
        gfx.moveTo(cx, segStart);
        gfx.lineTo(cx, segEnd);
        gfx.stroke({ color: 0xaaaaaa, alpha: 0.25, width: 1 });
        drawn += dashLen + gapLen;
      }
    }
  }

  /**
   * Draw scaffold poles and planks around the building footprint at a given
   * height.  `density` (0–1) controls how many planks appear (more = denser
   * scaffolding).  `alpha` allows the whole scaffold to fade.
   *
   * Poles are thin vertical lines at the 4 footprint corners raised to
   * `scaffoldHeight`.  Planks are thin horizontal lines crossing each pole
   * pair at evenly-spaced vertical intervals, gated by density.
   *
   * @param {Graphics} gfx
   * @param {import('./zones.js').ZoneDef} zone
   * @param {number} scaffoldHeight  - height in units the scaffold reaches
   * @param {number} density         - 0.0–1.0, fraction of planks to draw
   * @param {number} alpha           - overall scaffold opacity
   */
  _drawScaffolding(gfx, zone, scaffoldHeight, density, alpha) {
    if (alpha <= 0 || density <= 0) return;

    const { topX, topY, rightX, rightY, botX, botY, leftX, leftY } = this._footprint(zone);
    const hPx = scaffoldHeight * HEIGHT_UNIT_PX;

    // The 4 footprint corners we attach poles to
    const corners = [
      { x: topX,   y: topY   },
      { x: rightX, y: rightY },
      { x: botX,   y: botY   },
      { x: leftX,  y: leftY  },
    ];

    // ── Vertical poles ─────────────────────────────────────────────
    for (const c of corners) {
      gfx.moveTo(c.x, c.y);
      gfx.lineTo(c.x, c.y - hPx);
      gfx.stroke({ color: SCAFFOLD_POLE_COLOR, alpha, width: 1.5 });
    }

    // ── Horizontal planks ──────────────────────────────────────────
    // Space planks every ~8 px vertically.  Gate each plank by density so
    // they accumulate from the bottom up as density increases.
    const plankSpacing = 8;
    const totalPlanks  = Math.max(1, Math.floor(hPx / plankSpacing));

    // Pairs of corners to connect with planks (the 4 edges of the footprint)
    const edges = [
      [corners[0], corners[1]],  // top → right
      [corners[1], corners[2]],  // right → bottom
      [corners[2], corners[3]],  // bottom → left
      [corners[3], corners[0]],  // left → top
    ];

    for (let i = 0; i < totalPlanks; i++) {
      // i=0 is the lowest plank; i=totalPlanks-1 is the topmost
      const plankFraction = (i + 1) / totalPlanks;  // 0→1 from bottom
      if (plankFraction > density) break;            // density gates from bottom up

      const yOffset = -(i + 1) * plankSpacing;

      for (const [cA, cB] of edges) {
        gfx.moveTo(cA.x, cA.y + yOffset);
        gfx.lineTo(cB.x, cB.y + yOffset);
        gfx.stroke({ color: SCAFFOLD_PLANK_COLOR, alpha: alpha * 0.85, width: 1 });
      }
    }
  }

  /**
   * Draw warm window glow rectangles.
   * @param {Graphics} gfx
   * @param {import('./zones.js').ZoneDef} zone
   * @param {number} height         - building height in units
   * @param {number} completeFraction - 0.0–1.0, how many windows to show
   */
  _drawWindowGlow(gfx, zone, height, completeFraction) {
    if (completeFraction <= 0) return;

    const hw   = TILE_WIDTH  / 2;
    const hh   = TILE_HEIGHT / 4;
    const w    = zone.w;
    const h    = zone.h;
    const hPx  = height * HEIGHT_UNIT_PX;

    const rightX = w * hw;
    const rightY = w * hh;
    const botX   = (w - h) * hw;
    const botY   = (w + h) * hh;

    const windowCount = Math.min(zone.h, 3);
    const rowsPerCol  = Math.min(height - 1, 2);
    const totalWindows = windowCount * rowsPerCol;

    // Determine how many windows to illuminate based on completeFraction
    const lit = Math.ceil(totalWindows * completeFraction);
    let drawn = 0;

    outer:
    for (let i = 0; i < windowCount; i++) {
      const t  = (i + 0.5) / windowCount;
      const wx = rightX + (botX - rightX) * t;
      const wy = rightY + (botY - rightY) * t;

      for (let j = 0; j < rowsPerCol; j++) {
        if (drawn >= lit) break outer;
        const yOff = -hPx * 0.3 - j * (hPx * 0.25);
        gfx.rect(wx - 2, wy + yOff - 2, 4, 4);
        gfx.fill({ color: COLORS.windowGlow, alpha: 0.7 });
        drawn++;
      }
    }
  }

  // ── Interaction ──────────────────────────────────────────────────

  /**
   * Handle hover state change.
   * @param {BuildingSprite} entry
   * @param {boolean} hovered
   */
  _onHover(entry, hovered) {
    entry.hovered = hovered;
    entry.gfx.tint = hovered ? 0xddddff : 0xffffff;
  }

  // ── Helpers ──────────────────────────────────────────────────────

  /**
   * Return the effective rendered height for a given entry, used by hitTest.
   * @param {BuildingSprite} entry
   * @returns {number}  height in units
   */
  _effectiveHeight(entry) {
    const p    = entry.progress;
    const zone = entry.zone;

    if (p >= STAGE_COMPLETE) return zone.height;
    if (p >= STAGE_FINISH_START) return zone.height;
    if (p >= STAGE_WALLS_START) {
      const t = (p - STAGE_WALLS_START) / (STAGE_FINISH_START - STAGE_WALLS_START);
      return lerp(HEIGHT_RUIN, zone.height, t);
    }
    return HEIGHT_RUIN;
  }
}
