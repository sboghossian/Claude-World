/**
 * tiles.js - Isometric tile grid renderer for Claude World
 *
 * Handles the ground plane with district-specific terrain, roads with
 * markings, parks, water borders, and ambient details. The entire grid
 * is drawn once into a cached Graphics object for performance.
 */

import { Graphics } from "pixi.js";
import { TILE_WIDTH, TILE_HEIGHT, GRID_SIZE, COLORS } from "./constants.js";
import { buildPathTiles } from "./zones.js";

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

// ── Constants ───────────────────────────────────────────────────────

const CENTER = GRID_SIZE / 2; // 20
const WATER_BORDER = 4; // tiles of water at each edge
const hw = TILE_WIDTH / 2;
const hh = TILE_HEIGHT / 2;

// Park locations (2x2 tile clusters in open areas between buildings)
const PARKS = [
  { x: 18, y: 17, w: 2, h: 2 }, // between Brain Library and Chat Rooms
  { x: 26, y: 20, w: 2, h: 2 }, // east of Dispatch
  { x: 18, y: 27, w: 2, h: 2 }, // south of Skills Academy
  { x: 12, y: 22, w: 2, h: 2 }, // west between R&D and Archive
];

// ── Seeded pseudo-random for deterministic variation ────────────────

function tileHash(x, y) {
  // Simple hash for deterministic per-tile variation
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = ((h ^ (h >> 13)) * 1274126177) >>> 0;
  return (h ^ (h >> 16)) >>> 0;
}

// ── District ring classification ────────────────────────────────────

/**
 * Determine which district ring a tile belongs to based on
 * Chebyshev distance from center.
 * @param {number} x
 * @param {number} y
 * @returns {number} ring 0-4, or -1 for water
 */
function getRing(x, y) {
  if (
    x < WATER_BORDER ||
    y < WATER_BORDER ||
    x >= GRID_SIZE - WATER_BORDER ||
    y >= GRID_SIZE - WATER_BORDER
  ) {
    return -1; // water
  }
  const dist = Math.max(Math.abs(x - CENTER), Math.abs(y - CENTER));
  if (dist <= 3) return 0;
  if (dist <= 6) return 1;
  if (dist <= 10) return 2;
  if (dist <= 14) return 3;
  return 4;
}

// ── Park tile lookup ────────────────────────────────────────────────

function buildParkSet() {
  const set = new Set();
  for (const p of PARKS) {
    for (let dx = 0; dx < p.w; dx++) {
      for (let dy = 0; dy < p.h; dy++) {
        set.add(`${p.x + dx},${p.y + dy}`);
      }
    }
  }
  return set;
}

// ── Intersection detection ──────────────────────────────────────────

function buildIntersectionSet(pathTiles) {
  const set = new Set();
  for (const key of pathTiles) {
    const [x, y] = key.split(",").map(Number);
    // Count how many adjacent path tiles (4-connected)
    let adj = 0;
    if (pathTiles.has(`${x - 1},${y}`)) adj++;
    if (pathTiles.has(`${x + 1},${y}`)) adj++;
    if (pathTiles.has(`${x},${y - 1}`)) adj++;
    if (pathTiles.has(`${x},${y + 1}`)) adj++;
    if (adj >= 3) set.add(key);
  }
  return set;
}

// ── Diamond drawing helpers ─────────────────────────────────────────

function drawDiamond(gfx, sx, sy, color, alpha = 1) {
  gfx.poly([sx, sy, sx + hw, sy + hh / 2, sx, sy + hh, sx - hw, sy + hh / 2]);
  gfx.fill({ color, alpha });
}

function drawDiamondStroke(gfx, sx, sy, color, alpha, width) {
  gfx.poly([sx, sy, sx + hw, sy + hh / 2, sx, sy + hh, sx - hw, sy + hh / 2]);
  gfx.stroke({ color, alpha, width });
}

// ── Specialized tile renderers ──────────────────────────────────────

function drawWaterTile(gfx, sx, sy, tx, ty) {
  const dist = Math.min(tx, ty, GRID_SIZE - 1 - tx, GRID_SIZE - 1 - ty);
  let color;
  if (dist < 1) {
    color = COLORS.waterDeepAlt;
  } else if (dist < 2) {
    color = COLORS.waterDeep;
  } else if (dist < 3) {
    color = COLORS.waterMid;
  } else {
    color = COLORS.waterShallow;
  }
  // Slight per-tile variation
  const variation = (tileHash(tx, ty) % 3) - 1; // -1, 0, or 1
  const r = ((color >> 16) & 0xff) + variation * 3;
  const g = ((color >> 8) & 0xff) + variation * 2;
  const b = (color & 0xff) + variation * 4;
  const finalColor =
    (Math.max(0, Math.min(255, r)) << 16) |
    (Math.max(0, Math.min(255, g)) << 8) |
    Math.max(0, Math.min(255, b));
  drawDiamond(gfx, sx, sy, finalColor);
  // Wave lines - subtle horizontal dashes
  if ((tx + ty) % 3 === 0) {
    const cy = sy + hh / 2;
    const cx = sx;
    gfx.moveTo(cx - 6, cy);
    gfx.lineTo(cx + 6, cy);
    gfx.stroke({ color: 0xffffff, alpha: 0.08, width: 0.5 });
  }
}

function drawCoreTile(gfx, sx, sy, tx, ty) {
  const colors = COLORS.ground.core;
  const idx = tileHash(tx, ty) % colors.length;
  drawDiamond(gfx, sx, sy, colors[idx]);
  // Subtle grid lines for polished stone look
  drawDiamondStroke(gfx, sx, sy, COLORS.ground.coreGrid, 0.15, 0.5);
  // Inner cross pattern for stone slabs
  const cx = sx;
  const cy = sy + hh / 2;
  gfx.moveTo(cx - hw * 0.3, cy);
  gfx.lineTo(cx + hw * 0.3, cy);
  gfx.stroke({ color: COLORS.ground.coreGrid, alpha: 0.08, width: 0.3 });
}

function drawBusinessTile(gfx, sx, sy, tx, ty) {
  const colors = COLORS.ground.business;
  const idx = tileHash(tx, ty) % colors.length;
  drawDiamond(gfx, sx, sy, colors[idx]);
  drawDiamondStroke(gfx, sx, sy, COLORS.ground.businessGrid, 0.12, 0.5);
}

function drawAdvancedTile(gfx, sx, sy, tx, ty) {
  const colors = COLORS.ground.advanced;
  const idx = tileHash(tx, ty) % colors.length;
  drawDiamond(gfx, sx, sy, colors[idx]);
  // Circuit board pattern: subtle glowing lines
  const cx = sx;
  const cy = sy + hh / 2;
  const hash = tileHash(tx, ty);
  // Horizontal circuit trace
  if (hash % 5 < 2) {
    const offset = (((hash >> 4) % 3) - 1) * 2;
    gfx.moveTo(cx - hw * 0.4, cy + offset);
    gfx.lineTo(cx + hw * 0.4, cy + offset);
    gfx.stroke({ color: COLORS.ground.advancedGlow, alpha: 0.2, width: 0.5 });
  }
  // Vertical circuit trace (in iso space = diagonal on screen)
  if (hash % 7 < 2) {
    gfx.moveTo(cx, sy + hh * 0.2);
    gfx.lineTo(cx, sy + hh * 0.8);
    gfx.stroke({ color: COLORS.ground.advancedGlow, alpha: 0.15, width: 0.5 });
  }
  // Occasional node dot at intersections
  if (hash % 11 === 0) {
    gfx.circle(cx, cy, 1.2);
    gfx.fill({ color: COLORS.ground.advancedGlow, alpha: 0.3 });
  }
}

function drawEdgeTile(gfx, sx, sy, tx, ty) {
  const hash = tileHash(tx, ty);
  // Mix grass and dirt patches
  if (hash % 7 < 2) {
    // Dirt patch
    const colors = COLORS.ground.edgeDirt;
    const idx = hash % colors.length;
    drawDiamond(gfx, sx, sy, colors[idx]);
  } else {
    // Grass
    const colors = COLORS.ground.edge;
    const idx = hash % colors.length;
    drawDiamond(gfx, sx, sy, colors[idx]);
  }
  // Subtle grass texture dots
  if (hash % 4 === 0) {
    const cx = sx + (((hash >> 3) % 7) - 3);
    const cy = sy + hh / 2 + (((hash >> 6) % 5) - 2);
    gfx.circle(cx, cy, 0.6);
    gfx.fill({ color: 0x3d6a28, alpha: 0.3 });
  }
}

function drawRoadTile(gfx, sx, sy, tx, ty, isWide, isIntersection, pathTiles) {
  // Base road color
  const baseColor = isIntersection
    ? COLORS.road.intersection
    : isWide
      ? COLORS.road.main
      : COLORS.road.secondary;
  drawDiamond(gfx, sx, sy, baseColor);

  // Curb lines (slightly darker edge)
  drawDiamondStroke(gfx, sx, sy, COLORS.road.curb, 0.4, 1);

  // Center line markings on wide roads (dashed)
  if (isWide && !isIntersection) {
    const cx = sx;
    const cy = sy + hh / 2;
    // Determine road direction by checking neighbors
    const hasLeft = pathTiles.has(`${tx - 1},${ty}`);
    const hasRight = pathTiles.has(`${tx + 1},${ty}`);
    const hasUp = pathTiles.has(`${tx},${ty - 1}`);
    const hasDown = pathTiles.has(`${tx},${ty + 1}`);

    if ((tx + ty) % 3 !== 0) {
      // dashed pattern
      if (hasLeft || hasRight) {
        // Road runs along X axis (iso: top-left to bottom-right)
        gfx.moveTo(cx - hw * 0.3, cy - hh * 0.15);
        gfx.lineTo(cx + hw * 0.3, cy + hh * 0.15);
        gfx.stroke({ color: COLORS.road.marking, alpha: 0.35, width: 0.7 });
      }
      if (hasUp || hasDown) {
        // Road runs along Y axis (iso: top-right to bottom-left)
        gfx.moveTo(cx - hw * 0.3, cy + hh * 0.15);
        gfx.lineTo(cx + hw * 0.3, cy - hh * 0.15);
        gfx.stroke({ color: COLORS.road.marking, alpha: 0.35, width: 0.7 });
      }
    }
  }

  // Occasional manhole covers on road tiles
  if (tileHash(tx, ty) % 17 === 0) {
    const cx = sx;
    const cy = sy + hh / 2;
    gfx.circle(cx, cy, 2.5);
    gfx.fill({ color: COLORS.road.manhole });
    gfx.circle(cx, cy, 2.5);
    gfx.stroke({ color: COLORS.road.manholeRim, alpha: 0.6, width: 0.5 });
    // Cross pattern on manhole
    gfx.moveTo(cx - 1.5, cy);
    gfx.lineTo(cx + 1.5, cy);
    gfx.stroke({ color: COLORS.road.manholeRim, alpha: 0.4, width: 0.3 });
    gfx.moveTo(cx, cy - 1.5);
    gfx.lineTo(cx, cy + 1.5);
    gfx.stroke({ color: COLORS.road.manholeRim, alpha: 0.4, width: 0.3 });
  }
}

function drawParkTile(gfx, sx, sy, tx, ty) {
  const hash = tileHash(tx, ty);
  const color = hash % 2 === 0 ? COLORS.park.grass : COLORS.park.grassAlt;
  drawDiamond(gfx, sx, sy, color);

  // Tree markers (small circles representing tree canopy)
  if (hash % 3 === 0) {
    const cx = sx + (((hash >> 4) % 5) - 2);
    const cy = sy + hh / 2 + (((hash >> 7) % 3) - 1);
    // Trunk
    gfx.circle(cx, cy + 1.5, 0.8);
    gfx.fill({ color: COLORS.park.trunk, alpha: 0.6 });
    // Canopy (larger circle)
    gfx.circle(cx, cy, 3);
    gfx.fill({ color: COLORS.park.tree, alpha: 0.7 });
    // Highlight
    gfx.circle(cx - 0.5, cy - 0.8, 1.5);
    gfx.fill({ color: COLORS.park.grass, alpha: 0.4 });
  }
  // Extra grass detail
  if (hash % 5 === 0) {
    const cx = sx + (((hash >> 2) % 9) - 4);
    const cy = sy + hh / 2 + (((hash >> 5) % 5) - 2);
    gfx.circle(cx, cy, 0.5);
    gfx.fill({ color: COLORS.park.treeDark, alpha: 0.25 });
  }
}

// ── District boundary markers ───────────────────────────────────────

function drawDistrictBorder(gfx, sx, sy, tx, ty) {
  const ring = getRing(tx, ty);
  if (ring < 0) return;

  // Check if any neighbor has a different ring
  const neighbors = [
    [tx - 1, ty],
    [tx + 1, ty],
    [tx, ty - 1],
    [tx, ty + 1],
  ];
  for (const [nx, ny] of neighbors) {
    const nRing = getRing(nx, ny);
    if (nRing !== ring && nRing >= 0) {
      // District boundary - draw a thin colored accent line
      let borderColor;
      switch (ring) {
        case 0:
        case 1:
          borderColor = 0x4a90d9;
          break; // core blue
        case 2:
          borderColor = 0x4caf50;
          break; // business green
        case 3:
          borderColor = 0x9c5ec7;
          break; // advanced purple
        default:
          borderColor = 0xe8893c;
          break; // edge orange
      }
      drawDiamondStroke(gfx, sx, sy, borderColor, 0.25, 1);
      return; // only draw once per tile
    }
  }
}

// ── Main grid builder ───────────────────────────────────────────────

/**
 * Build the tile grid container with all ground tiles.
 * Tiles are batched into a single Graphics object for performance.
 * The Graphics object is drawn once and cached automatically by PixiJS.
 * @returns {Graphics}
 */
export function createTileGrid() {
  const gfx = new Graphics();
  const { pathTiles, widePathTiles } = buildPathTiles();
  const parkTiles = buildParkSet();
  const intersections = buildIntersectionSet(pathTiles);

  // Render tiles in back-to-front order (painter's algorithm)
  for (let ty = 0; ty < GRID_SIZE; ty++) {
    for (let tx = 0; tx < GRID_SIZE; tx++) {
      const { x: sx, y: sy } = tileToScreen(tx, ty);
      const key = `${tx},${ty}`;
      const ring = getRing(tx, ty);

      // Water border
      if (ring === -1) {
        drawWaterTile(gfx, sx, sy, tx, ty);
        continue;
      }

      // Parks override ground tiles (but not roads)
      if (parkTiles.has(key) && !pathTiles.has(key)) {
        drawParkTile(gfx, sx, sy, tx, ty);
        continue;
      }

      // Roads
      if (pathTiles.has(key)) {
        const isWide = widePathTiles.has(key);
        const isIntersection = intersections.has(key);
        drawRoadTile(gfx, sx, sy, tx, ty, isWide, isIntersection, pathTiles);
        continue;
      }

      // District-specific ground
      switch (ring) {
        case 0:
        case 1:
          drawCoreTile(gfx, sx, sy, tx, ty);
          break;
        case 2:
          drawBusinessTile(gfx, sx, sy, tx, ty);
          break;
        case 3:
          drawAdvancedTile(gfx, sx, sy, tx, ty);
          break;
        default:
          drawEdgeTile(gfx, sx, sy, tx, ty);
          break;
      }

      // District boundary markings
      drawDistrictBorder(gfx, sx, sy, tx, ty);
    }
  }

  return gfx;
}
