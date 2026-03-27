/**
 * buildings.js - Isometric building renderer for Claude World
 *
 * Draws buildings as colored isometric boxes (top, left, right faces)
 * using PixiJS Graphics. Active buildings are full color; locked zones
 * are rendered as grey "ruins" with a dashed ghost outline.
 */

import { Container, Graphics } from 'pixi.js';
import {
  TILE_WIDTH, TILE_HEIGHT, HEIGHT_UNIT_PX, HEIGHT_RUIN, COLORS,
} from './constants.js';
import { ZONE_DEFS } from './zones.js';
import { tileToScreen } from './tiles.js';

/**
 * @typedef {Object} BuildingSprite
 * @property {string} zoneId
 * @property {Graphics} gfx       - The graphics object for this building
 * @property {Graphics} [glow]    - Optional warm glow overlay (active buildings)
 * @property {boolean} hovered
 * @property {ZoneDef} zone       - Reference to zone definition
 */

export class BuildingManager {
  constructor() {
    /** @type {Container} */
    this.container = new Container();
    /** @type {BuildingSprite[]} */
    this.buildings = [];

    this._buildAll();
  }

  /** Build all zone buildings and add to container. */
  _buildAll() {
    // Sort zones by depth (tileX + tileY ascending) for painter's algorithm
    const sorted = [...ZONE_DEFS].sort((a, b) => (a.tileX + a.tileY) - (b.tileX + b.tileY));

    for (const zone of sorted) {
      const entry = this._createBuilding(zone);
      this.buildings.push(entry);
      this.container.addChild(entry.gfx);
    }
  }

  /**
   * Create a single building's graphics.
   * @param {import('./zones.js').ZoneDef} zone
   * @returns {BuildingSprite}
   */
  _createBuilding(zone) {
    const gfx = new Graphics();
    const isRuin = !zone.active;
    const height = isRuin ? HEIGHT_RUIN : zone.height;

    // Get palette
    const palette = isRuin ? COLORS.ruin : COLORS[zone.district];

    // Draw the isometric box
    this._drawIsoBox(gfx, zone, height, palette, isRuin);

    // Position at the correct screen location (top-left tile of the zone)
    const pos = tileToScreen(zone.tileX, zone.tileY);
    gfx.position.set(pos.x, pos.y);

    // If ruin, also draw ghost outline showing full height
    if (isRuin) {
      this._drawGhostOutline(gfx, zone);
    }

    // If active, add a warm glow effect
    if (zone.active) {
      this._drawWindowGlow(gfx, zone, height);
    }

    // Store interactive flag
    gfx.eventMode = 'static';
    gfx.cursor = 'pointer';

    const entry = { zoneId: zone.id, gfx, hovered: false, zone };

    // Hover events
    gfx.on('pointerenter', () => this._onHover(entry, true));
    gfx.on('pointerleave', () => this._onHover(entry, false));

    return entry;
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
    const w = zone.w;
    const h = zone.h;
    const hPx = height * HEIGHT_UNIT_PX;
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 4;

    // Key points of the footprint (relative to top-left tile screen pos)
    // Top corner (tile 0,0 top)
    const topX = 0;
    const topY = 0;
    // Right corner (tile w,0)
    const rightX = w * hw;
    const rightY = w * hh;
    // Bottom corner (tile w,h)
    const botX = (w - h) * hw;
    const botY = (w + h) * hh;
    // Left corner (tile 0,h)
    const leftX = -h * hw;
    const leftY = h * hh;

    const alpha = isRuin ? 0.6 : 1.0;

    // ── Top face ────────────────────────────────────────────────
    gfx.poly([
      topX,   topY - hPx,
      rightX, rightY - hPx,
      botX,   botY - hPx,
      leftX,  leftY - hPx,
    ]);
    gfx.fill({ color: palette.top, alpha });

    // ── Left face ───────────────────────────────────────────────
    gfx.poly([
      leftX,  leftY - hPx,
      botX,   botY - hPx,
      botX,   botY,
      leftX,  leftY,
    ]);
    gfx.fill({ color: palette.left, alpha });

    // ── Right face ──────────────────────────────────────────────
    gfx.poly([
      rightX, rightY - hPx,
      botX,   botY - hPx,
      botX,   botY,
      rightX, rightY,
    ]);
    gfx.fill({ color: palette.right, alpha });

    // ── Edge lines for definition ───────────────────────────────
    const edgeAlpha = isRuin ? 0.3 : 0.5;
    // Top face outline
    gfx.poly([
      topX, topY - hPx, rightX, rightY - hPx,
      botX, botY - hPx, leftX, leftY - hPx,
    ]);
    gfx.stroke({ color: 0x000000, alpha: edgeAlpha, width: 1 });

    // Vertical edges
    const verts = [
      [topX, topY - hPx, topX, topY],        // hidden usually
      [rightX, rightY - hPx, rightX, rightY],
      [botX, botY - hPx, botX, botY],
      [leftX, leftY - hPx, leftX, leftY],
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
    const fullHeight = zone.height;
    const hPx = fullHeight * HEIGHT_UNIT_PX;
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 4;
    const w = zone.w;
    const h = zone.h;

    const topX = 0, topY = 0;
    const rightX = w * hw, rightY = w * hh;
    const botX = (w - h) * hw, botY = (w + h) * hh;
    const leftX = -h * hw, leftY = h * hh;

    // Draw dashed outline of full-height box
    // Top face at full height
    gfx.poly([
      topX, topY - hPx, rightX, rightY - hPx,
      botX, botY - hPx, leftX, leftY - hPx,
    ]);
    gfx.stroke({ color: 0xaaaaaa, alpha: 0.3, width: 1 });

    // Vertical edges to full height (dashed effect via short segments)
    const corners = [
      [rightX, rightY],
      [botX, botY],
      [leftX, leftY],
    ];
    for (const [cx, cy] of corners) {
      const dashLen = 3;
      const gapLen = 3;
      const totalH = hPx - HEIGHT_RUIN * HEIGHT_UNIT_PX;
      let drawn = 0;
      const startY = cy - HEIGHT_RUIN * HEIGHT_UNIT_PX;
      while (drawn < totalH) {
        const segStart = startY - drawn;
        const segEnd = Math.max(segStart - dashLen, cy - hPx);
        gfx.moveTo(cx, segStart);
        gfx.lineTo(cx, segEnd);
        gfx.stroke({ color: 0xaaaaaa, alpha: 0.25, width: 1 });
        drawn += dashLen + gapLen;
      }
    }
  }

  /**
   * Draw warm window glow rectangles on active buildings.
   * @param {Graphics} gfx
   * @param {import('./zones.js').ZoneDef} zone
   * @param {number} height
   */
  _drawWindowGlow(gfx, zone, height) {
    const hPx = height * HEIGHT_UNIT_PX;
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 4;
    const w = zone.w;
    const h = zone.h;

    // Place small "window" rectangles on the right face
    const rightX = w * hw;
    const rightY = w * hh;
    const botX = (w - h) * hw;
    const botY = (w + h) * hh;

    // Interpolate a few window positions along the right face
    const windowCount = Math.min(zone.h, 3);
    for (let i = 0; i < windowCount; i++) {
      const t = (i + 0.5) / windowCount;
      const wx = rightX + (botX - rightX) * t;
      const wy = rightY + (botY - rightY) * t;

      // Two windows vertically
      for (let j = 0; j < Math.min(height - 1, 2); j++) {
        const yOff = -hPx * 0.3 - j * (hPx * 0.25);
        gfx.rect(wx - 2, wy + yOff - 2, 4, 4);
        gfx.fill({ color: COLORS.windowGlow, alpha: 0.7 });
      }
    }
  }

  /**
   * Handle hover state change.
   * @param {BuildingSprite} entry
   * @param {boolean} hovered
   */
  _onHover(entry, hovered) {
    entry.hovered = hovered;
    if (hovered) {
      // Brighten and add golden outline
      entry.gfx.tint = 0xddddff;
    } else {
      entry.gfx.tint = 0xffffff;
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
    // Test in reverse order (front buildings first)
    for (let i = this.buildings.length - 1; i >= 0; i--) {
      const b = this.buildings[i];
      const zone = b.zone;
      const pos = tileToScreen(zone.tileX, zone.tileY);

      const hw = TILE_WIDTH / 2;
      const hh = TILE_HEIGHT / 4;
      const hPx = (zone.active ? zone.height : HEIGHT_RUIN) * HEIGHT_UNIT_PX;

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
    // Future: animate window glow alpha based on time-of-day
    // For now this is a placeholder for the day/night cycle
    for (const b of this.buildings) {
      if (b.zone.active && b.glow) {
        b.glow.alpha = 0.3 + intensity * 0.7;
      }
    }
  }
}
