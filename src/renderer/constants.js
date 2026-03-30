/**
 * constants.js - Shared constants for the Claude World isometric renderer
 */

// ── Tile Geometry ────────────────────────────────────────────────────
/** Width of a single isometric tile in pixels */
export const TILE_WIDTH = 64;
/** Height of a single isometric tile in pixels */
export const TILE_HEIGHT = 32;
/** Number of tiles along each axis */
export const GRID_SIZE = 40;

// ── Camera ───────────────────────────────────────────────────────────
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2.0;
export const ZOOM_SPEED = 0.1;
export const PAN_SPEED = 8;
export const FOLLOW_EASING = 0.08;
export const CAMERA_LERP_SPEED = 0.1;

// ── Frame Rate ───────────────────────────────────────────────────────
export const TARGET_FPS = 30;
export const FRAME_INTERVAL = 1000 / TARGET_FPS;

// ── Building Heights (in isometric units, 1 unit = TILE_HEIGHT/2 px) ─
export const HEIGHT_DISPATCH = 5;
export const HEIGHT_BRAIN = 3;
export const HEIGHT_DEFAULT = 2;
export const HEIGHT_RUIN = 1;

// ── Unit conversion: 1 height unit in pixels ─────────────────────────
export const HEIGHT_UNIT_PX = TILE_HEIGHT / 2;

// ── Colors ───────────────────────────────────────────────────────────
export const COLORS = {
  // Ground tiles
  grass: 0x5a8f3c,
  grassAlt: 0x4e7d34,
  path: 0xc4b28a,
  pathEdge: 0xb3a07a,
  water: 0x3a7cbf,
  waterDeep: 0x2d6199,

  // District palette  (top, left, right faces)
  core: {
    top: 0x4a90d9,
    left: 0x3a72b0,
    right: 0x2e5a8c,
  },
  business: {
    top: 0x4caf50,
    left: 0x3d8b40,
    right: 0x2e6830,
  },
  advanced: {
    top: 0x9c5ec7,
    left: 0x7d4ba0,
    right: 0x5e387a,
  },
  edge: {
    top: 0xe8893c,
    left: 0xba6e30,
    right: 0x8c5324,
  },

  // Ruin (locked) palette
  ruin: {
    top: 0x888888,
    left: 0x6a6a6a,
    right: 0x555555,
  },

  // UI
  hoverOutline: 0xffd700,
  windowGlow: 0xffcc44,
  fogColor: 0x1a1a2e,
};

// ── Day/Night Cycle ──────────────────────────────────────────────────
/** Full day cycle duration in milliseconds */
export const DAY_CYCLE_MS = 60_000;

export const DAY_PHASES = {
  dawn: { start: 0.0, end: 0.2, tint: 0xffccaa, brightness: 0.9 },
  day: { start: 0.2, end: 0.5, tint: 0xffffff, brightness: 1.0 },
  dusk: { start: 0.5, end: 0.7, tint: 0xcc99dd, brightness: 0.85 },
  night: { start: 0.7, end: 1.0, tint: 0x6688cc, brightness: 0.6 },
};

// ── Fog ──────────────────────────────────────────────────────────────
export const FOG_OPACITY = {
  ring0: 0.0,
  ring1: 0.0,
  ring2: 0.2,
  ring3: 0.4,
  edge: 0.6,
};
