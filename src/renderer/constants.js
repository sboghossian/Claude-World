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
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 3.0;
export const ZOOM_SPEED = 0.12;
export const PAN_SPEED = 12;
export const FOLLOW_EASING = 0.08;
export const CAMERA_LERP_SPEED = 0.1;

// ── Frame Rate ───────────────────────────────────────────────────────
export const TARGET_FPS = 30;
export const FRAME_INTERVAL = 1000 / TARGET_FPS;

// ── Building Heights (in isometric units, 1 unit = TILE_HEIGHT/2 px) ─
export const HEIGHT_DISPATCH = 6;
export const HEIGHT_BRAIN = 4;
export const HEIGHT_DEFAULT = 2;
export const HEIGHT_RUIN = 1;

// ── Unit conversion: 1 height unit in pixels ─────────────────────────
export const HEIGHT_UNIT_PX = TILE_HEIGHT / 2;

// ── Colors ───────────────────────────────────────────────────────────
export const COLORS = {
  // Ground tiles - legacy (kept for compat)
  grass: 0x5a8f3c,
  grassAlt: 0x4e7d34,
  path: 0xc4b28a,
  pathEdge: 0xb3a07a,
  water: 0x3a7cbf,
  waterDeep: 0x2d6199,

  // District ground palettes
  ground: {
    // Ring 0-1: Dark polished stone
    core: [0x3a3a42, 0x35353d, 0x404048],
    coreGrid: 0x50505a,
    // Ring 2: Lighter concrete
    business: [0x8a857d, 0x837e76, 0x918c84],
    businessGrid: 0x9e998f,
    // Ring 3: Tech dark floor with circuit accents
    advanced: [0x1e1e2a, 0x1a1a26, 0x22222e],
    advancedGlow: 0x2288cc,
    // Ring 4: Rough terrain / grass
    edge: [0x4a7a30, 0x437226, 0x528838],
    edgeDirt: [0x7a6b50, 0x716248, 0x836f55],
  },

  // Road colors
  road: {
    main: 0x555555,
    secondary: 0x606060,
    marking: 0x999999,
    intersection: 0x4a4a4a,
    curb: 0x3a3a3a,
    manhole: 0x2a2a2a,
    manholeRim: 0x444444,
  },

  // Park colors
  park: {
    grass: 0x3a6e22,
    grassAlt: 0x347020,
    tree: 0x2d5a1a,
    treeDark: 0x1e4010,
    trunk: 0x5a4030,
  },

  // Water (expanded)
  waterShallow: 0x4a90cc,
  waterMid: 0x3a7cbf,
  waterDeepAlt: 0x264f80,

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

  // Intelligence district (analytics, reports, knowledge-graph)
  intel: {
    top: 0x7c4dff,
    left: 0x6539cc,
    right: 0x4e2d99,
  },

  // Social district (conversations, agent-profile, leaderboard)
  social: {
    top: 0xe8577a,
    left: 0xc04563,
    right: 0x98354d,
  },

  // Infrastructure district (mcp-hub, plugins, backups, sharing)
  infra: {
    top: 0x6b8fa3,
    left: 0x567386,
    right: 0x415869,
  },

  // Management district (kanban, calendar, automations)
  mgmt: {
    top: 0x26a69a,
    left: 0x1e857b,
    right: 0x17665e,
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
