/**
 * zones.js - Zone definitions for Claude World
 *
 * Each zone has: id, name, grid position (tileX, tileY), size (w, h in tiles),
 * ring (for fog), district (for color), height, and active/locked state.
 */

import {
  HEIGHT_DISPATCH,
  HEIGHT_BRAIN,
  HEIGHT_DEFAULT,
  HEIGHT_RUIN,
} from "./constants.js";

/**
 * @typedef {Object} ZoneDef
 * @property {string} id       - Unique zone identifier
 * @property {string} name     - Human-readable name
 * @property {number} tileX    - Top-left tile X
 * @property {number} tileY    - Top-left tile Y
 * @property {number} w        - Width in tiles
 * @property {number} h        - Height in tiles
 * @property {number} ring     - Concentric ring (0-4)
 * @property {string} district - Color district key: core | business | advanced | edge
 * @property {number} height   - Building height in units
 * @property {boolean} active  - Whether unlocked for MVP
 */

/** @type {ZoneDef[]} */
export const ZONE_DEFS = [
  // ── Ring 0 (Center) ──────────────────────────────────────────────
  {
    id: "dispatch",
    name: "Dispatch Tower",
    tileX: 20,
    tileY: 20,
    w: 4,
    h: 4,
    ring: 0,
    district: "core",
    height: HEIGHT_DISPATCH,
    active: true,
  },
  {
    id: "brain",
    name: "Brain Library",
    tileX: 16,
    tileY: 20,
    w: 3,
    h: 3,
    ring: 0,
    district: "core",
    height: HEIGHT_BRAIN,
    active: true,
  },

  // ── Ring 1 (Core Ops) ────────────────────────────────────────────
  {
    id: "chat",
    name: "Chat Rooms",
    tileX: 14,
    tileY: 16,
    w: 3,
    h: 3,
    ring: 1,
    district: "core",
    height: HEIGHT_DEFAULT,
    active: false,
  },
  {
    id: "memory",
    name: "Memory Vault",
    tileX: 24,
    tileY: 16,
    w: 3,
    h: 3,
    ring: 1,
    district: "core",
    height: HEIGHT_DEFAULT,
    active: true,
  },
  {
    id: "skills",
    name: "Skills Academy",
    tileX: 14,
    tileY: 24,
    w: 3,
    h: 3,
    ring: 1,
    district: "core",
    height: HEIGHT_DEFAULT,
    active: true,
  },
  {
    id: "minions",
    name: "Minion Tunnels",
    tileX: 24,
    tileY: 24,
    w: 3,
    h: 3,
    ring: 1,
    district: "core",
    height: HEIGHT_DEFAULT,
    active: false,
  },

  // ── Ring 2 (Business) ────────────────────────────────────────────
  {
    id: "treasury",
    name: "Treasury",
    tileX: 28,
    tileY: 20,
    w: 3,
    h: 3,
    ring: 2,
    district: "business",
    height: HEIGHT_DEFAULT,
    active: false,
  },
  {
    id: "sales",
    name: "Sales District",
    tileX: 28,
    tileY: 26,
    w: 3,
    h: 3,
    ring: 2,
    district: "business",
    height: HEIGHT_DEFAULT,
    active: false,
  },
  {
    id: "marketing",
    name: "Marketing Plaza",
    tileX: 22,
    tileY: 30,
    w: 3,
    h: 3,
    ring: 2,
    district: "business",
    height: HEIGHT_DEFAULT,
    active: false,
  },
  {
    id: "exchange",
    name: "The Exchange",
    tileX: 32,
    tileY: 18,
    w: 3,
    h: 3,
    ring: 2,
    district: "business",
    height: HEIGHT_DEFAULT,
    active: false,
  },
  {
    id: "market",
    name: "The Market",
    tileX: 32,
    tileY: 24,
    w: 3,
    h: 3,
    ring: 2,
    district: "business",
    height: HEIGHT_DEFAULT,
    active: false,
  },

  // ── Ring 3 (Advanced) ────────────────────────────────────────────
  {
    id: "council",
    name: "The Council",
    tileX: 10,
    tileY: 14,
    w: 3,
    h: 3,
    ring: 3,
    district: "advanced",
    height: HEIGHT_DEFAULT,
    active: false,
  },
  {
    id: "rnd",
    name: "R&D Lab",
    tileX: 10,
    tileY: 20,
    w: 3,
    h: 3,
    ring: 3,
    district: "advanced",
    height: HEIGHT_DEFAULT,
    active: false,
  },
  {
    id: "legal",
    name: "Legal Tower",
    tileX: 16,
    tileY: 12,
    w: 3,
    h: 3,
    ring: 3,
    district: "advanced",
    height: HEIGHT_DEFAULT,
    active: false,
  },
  {
    id: "archive",
    name: "The Archive",
    tileX: 10,
    tileY: 26,
    w: 3,
    h: 3,
    ring: 3,
    district: "advanced",
    height: HEIGHT_DEFAULT,
    active: false,
  },

  // ── Edges ────────────────────────────────────────────────────────
  {
    id: "docks",
    name: "Connector Docks",
    tileX: 8,
    tileY: 30,
    w: 4,
    h: 3,
    ring: 4,
    district: "edge",
    height: HEIGHT_DEFAULT,
    active: true,
  },
  {
    id: "airport",
    name: "Airport",
    tileX: 34,
    tileY: 10,
    w: 4,
    h: 4,
    ring: 4,
    district: "edge",
    height: HEIGHT_DEFAULT,
    active: false,
  },
  {
    id: "globe",
    name: "Globe Room",
    tileX: 28,
    tileY: 10,
    w: 3,
    h: 3,
    ring: 4,
    district: "edge",
    height: HEIGHT_DEFAULT,
    active: false,
  },
  {
    id: "broadcast",
    name: "Broadcast Tower",
    tileX: 20,
    tileY: 8,
    w: 3,
    h: 3,
    ring: 4,
    district: "edge",
    height: HEIGHT_DEFAULT,
    active: false,
  },
];

/**
 * Path definitions connecting zones.
 * Each path is a list of {x, y} tile coords forming a route.
 * wide = true means 2-tile-wide road, false = 1-tile narrow.
 * @typedef {{ points: {x:number, y:number}[], wide: boolean }} PathDef
 */

/**
 * Generate tile coordinates for a straight-line path between two tile coords.
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @returns {{x:number, y:number}[]}
 */
function linePath(x0, y0, x1, y1) {
  const tiles = [];
  const dx = Math.sign(x1 - x0);
  const dy = Math.sign(y1 - y0);
  let x = x0,
    y = y0;

  // Walk X first, then Y (L-shaped paths)
  while (x !== x1) {
    tiles.push({ x, y });
    x += dx;
  }
  while (y !== y1) {
    tiles.push({ x, y });
    y += dy;
  }
  tiles.push({ x: x1, y: y1 });
  return tiles;
}

/**
 * Build the set of all path tile coordinates.
 * Returns a Set of "x,y" strings for O(1) lookup.
 * @returns {{ pathTiles: Set<string>, widePathTiles: Set<string> }}
 */
export function buildPathTiles() {
  const pathTiles = new Set();
  const widePathTiles = new Set();

  // Helper to add a line and its parallel (for wide roads)
  const addPath = (x0, y0, x1, y1, wide) => {
    const tiles = linePath(x0, y0, x1, y1);
    for (const t of tiles) {
      pathTiles.add(`${t.x},${t.y}`);
      if (wide) {
        widePathTiles.add(`${t.x},${t.y}`);
        // Parallel tile for width
        pathTiles.add(`${t.x + 1},${t.y}`);
        widePathTiles.add(`${t.x + 1},${t.y}`);
      }
    }
  };

  // ── Main roads: Dispatch (22,22 center) to Ring 1 ─────────────
  // Dispatch center ~(22,22) to Chat Rooms (15,17)
  addPath(20, 20, 15, 17, true);
  // Dispatch to Memory Vault (25, 17)
  addPath(23, 20, 25, 17, true);
  // Dispatch to Skills Academy (15, 25)
  addPath(20, 23, 15, 25, true);
  // Dispatch to Minion Tunnels (25, 25)
  addPath(23, 23, 25, 25, true);

  // ── Secondary roads: Ring 1 to Ring 2 ─────────────────────────
  // Memory Vault to Treasury
  addPath(26, 17, 28, 21, false);
  // Minion Tunnels to Sales District
  addPath(26, 25, 28, 27, false);
  // Minion Tunnels to Marketing Plaza
  addPath(25, 26, 23, 31, false);
  // Treasury to Exchange
  addPath(30, 21, 32, 19, false);
  // Treasury to Market
  addPath(30, 22, 32, 25, false);

  // ── Secondary roads: Ring 1 to Ring 3 ─────────────────────────
  // Chat Rooms to Council
  addPath(14, 17, 11, 15, false);
  // Chat Rooms to Legal Tower
  addPath(15, 16, 17, 13, false);
  // Skills Academy to R&D Lab
  addPath(14, 25, 11, 21, false);
  // Skills Academy to Archive
  addPath(14, 26, 11, 27, false);

  // ── Edge roads ────────────────────────────────────────────────
  // Archive to Docks
  addPath(11, 28, 9, 31, false);
  // Dispatch to Broadcast Tower
  addPath(21, 20, 21, 10, false);
  // Memory to Globe Room
  addPath(26, 16, 29, 11, false);
  // Exchange to Airport
  addPath(34, 19, 35, 13, false);

  return { pathTiles, widePathTiles };
}

/**
 * Returns the ring number for a given zone id.
 * @param {string} zoneId
 * @returns {number}
 */
export function getRing(zoneId) {
  const zone = ZONE_DEFS.find((z) => z.id === zoneId);
  return zone ? zone.ring : -1;
}
