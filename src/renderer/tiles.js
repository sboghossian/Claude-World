/**
 * tiles.js - Isometric tile grid renderer for Claude World
 *
 * Handles the ground plane: grass, path, water tiles drawn as
 * colored diamonds using PixiJS Graphics.
 */

import { Graphics } from "pixi.js";
import { TILE_WIDTH, TILE_HEIGHT, GRID_SIZE, COLORS } from "./constants.js";
import { buildPathTiles, ZONE_DEFS } from "./zones.js";

// ── Isometric projection helpers ────────────────────────────────────

/**
 * Convert tile coordinates to screen (pixel) coordinates.
 * Origin (0,0) tile maps to the top of the isometric diamond.
 * @param {number} tileX
 * @param {number} tileY
 * @returns {{ x: number, y: number }}
 */
export function tileToScreen(tileX, tileY) {
  return {
    x: (tileX - tileY) * (TILE_WIDTH / 2),
    y: (tileX + tileY) * (TILE_HEIGHT / 4),
  };
}

/**
 * Reverse isometric transform: screen coords to tile coords.
 * Returns fractional tile coords - caller should Math.floor for grid lookup.
 * @param {number} screenX
 * @param {number} screenY
 * @returns {{ tileX: number, tileY: number }}
 */
export function screenToTile(screenX, screenY) {
  const tileX = (screenX / (TILE_WIDTH / 2) + screenY / (TILE_HEIGHT / 4)) / 2;
  const tileY = (screenY / (TILE_HEIGHT / 4) - screenX / (TILE_WIDTH / 2)) / 2;
  return { tileX, tileY };
}

/**
 * Determine the type of ground tile at a given coordinate.
 * @param {number} x - tile X
 * @param {number} y - tile Y
 * @param {Set<string>} pathTiles
 * @returns {'water' | 'path' | 'grass'}
 */
function getTileType(x, y, pathTiles) {
  // Water border: outer 2-tile ring
  if (x < 2 || y < 2 || x >= GRID_SIZE - 2 || y >= GRID_SIZE - 2) {
    return "water";
  }
  // Water: outer 4-tile ring with some variation
  if (x < 4 || y < 4 || x >= GRID_SIZE - 4 || y >= GRID_SIZE - 4) {
    // Slightly shallower water
    return "water";
  }
  // Path tiles
  if (pathTiles.has(`${x},${y}`)) {
    return "path";
  }
  return "grass";
}

/**
 * Draw a single isometric diamond tile.
 * @param {Graphics} gfx
 * @param {number} sx - screen X of tile center-top
 * @param {number} sy - screen Y of tile center-top
 * @param {number} color - fill color
 */
function drawDiamond(gfx, sx, sy, color) {
  const hw = TILE_WIDTH / 2;
  const hh = TILE_HEIGHT / 2;

  gfx.poly([
    sx,
    sy, // top
    sx + hw,
    sy + hh / 2, // right
    sx,
    sy + hh, // bottom
    sx - hw,
    sy + hh / 2, // left
  ]);
  gfx.fill({ color });
  // Subtle grid line
  gfx.poly([sx, sy, sx + hw, sy + hh / 2, sx, sy + hh, sx - hw, sy + hh / 2]);
  gfx.stroke({ color: 0x000000, alpha: 0.06, width: 0.5 });
}

/**
 * Build the tile grid container with all ground tiles.
 * Tiles are batched into a single Graphics object for performance.
 * @returns {Graphics}
 */
export function createTileGrid() {
  const gfx = new Graphics();
  const { pathTiles } = buildPathTiles();

  // Build a set of tiles occupied by zone buildings for slight tint
  const zoneTiles = new Set();
  for (const z of ZONE_DEFS) {
    for (let dx = 0; dx < z.w; dx++) {
      for (let dy = 0; dy < z.h; dy++) {
        zoneTiles.add(`${z.tileX + dx},${z.tileY + dy}`);
      }
    }
  }

  // Render tiles in back-to-front order (painter's algorithm)
  for (let ty = 0; ty < GRID_SIZE; ty++) {
    for (let tx = 0; tx < GRID_SIZE; tx++) {
      const type = getTileType(tx, ty, pathTiles);
      const { x: sx, y: sy } = tileToScreen(tx, ty);

      let color;
      switch (type) {
        case "water":
          // Deeper water at edges
          color =
            tx < 2 || ty < 2 || tx >= GRID_SIZE - 2 || ty >= GRID_SIZE - 2
              ? COLORS.waterDeep
              : COLORS.water;
          break;
        case "path":
          color = COLORS.path;
          break;
        default:
          // Alternate grass colors in a checkerboard
          color = (tx + ty) % 2 === 0 ? COLORS.grass : COLORS.grassAlt;
      }

      drawDiamond(gfx, sx, sy, color);
    }
  }

  return gfx;
}
