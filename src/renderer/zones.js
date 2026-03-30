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
 * @property {string} district - Color district key
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
    height: HEIGHT_DISPATCH, // 6 — tallest centerpiece
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
    height: HEIGHT_BRAIN, // 4
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
    height: 3,
    active: true,
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
    height: 3,
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
    height: 3,
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
    height: 3,
    active: true,
  },
  // Social zones near core
  {
    id: "conversations",
    name: "Conversations",
    tileX: 18,
    tileY: 16,
    w: 2,
    h: 2,
    ring: 1,
    district: "social",
    height: 2.5,
    active: true,
  },
  {
    id: "agent-profile",
    name: "Agent Profile",
    tileX: 24,
    tileY: 20,
    w: 2,
    h: 2,
    ring: 1,
    district: "social",
    height: 3,
    active: true,
  },
  {
    id: "identity",
    name: "Identity Hub",
    tileX: 18,
    tileY: 24,
    w: 2,
    h: 2,
    ring: 1,
    district: "social",
    height: 2.5,
    active: true,
  },
  {
    id: "home",
    name: "Dashboard",
    tileX: 20,
    tileY: 16,
    w: 3,
    h: 3,
    ring: 1,
    district: "core",
    height: 3.5,
    active: true,
  },

  // ── Ring 2 (Business / Management) ───────────────────────────────
  {
    id: "treasury",
    name: "Treasury",
    tileX: 28,
    tileY: 20,
    w: 3,
    h: 3,
    ring: 2,
    district: "business",
    height: 3,
    active: true,
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
    height: 3,
    active: true,
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
    height: 3,
    active: true,
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
    height: 3,
    active: true,
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
    height: 3,
    active: true,
  },
  // Management zones near business district
  {
    id: "kanban",
    name: "Kanban Board",
    tileX: 28,
    tileY: 14,
    w: 3,
    h: 2,
    ring: 2,
    district: "mgmt",
    height: 3,
    active: true,
  },
  {
    id: "calendar",
    name: "Calendar Tower",
    tileX: 32,
    tileY: 14,
    w: 2,
    h: 3,
    ring: 2,
    district: "mgmt",
    height: 3,
    active: true,
  },
  {
    id: "automations",
    name: "Automations Hub",
    tileX: 28,
    tileY: 30,
    w: 3,
    h: 2,
    ring: 2,
    district: "mgmt",
    height: 2.5,
    active: true,
  },
  {
    id: "timeline",
    name: "Timeline",
    tileX: 26,
    tileY: 28,
    w: 2,
    h: 2,
    ring: 2,
    district: "mgmt",
    height: 2.5,
    active: true,
  },
  {
    id: "leaderboard",
    name: "Leaderboard",
    tileX: 26,
    tileY: 20,
    w: 2,
    h: 2,
    ring: 2,
    district: "social",
    height: 3,
    active: true,
  },
  {
    id: "achievements",
    name: "Achievements",
    tileX: 26,
    tileY: 24,
    w: 2,
    h: 2,
    ring: 2,
    district: "social",
    height: 2.5,
    active: true,
  },
  {
    id: "sharing",
    name: "Sharing Hub",
    tileX: 32,
    tileY: 28,
    w: 2,
    h: 2,
    ring: 2,
    district: "infra",
    height: 2,
    active: true,
  },

  // ── Ring 3 (Advanced / Intelligence) ─────────────────────────────
  {
    id: "council",
    name: "The Council",
    tileX: 10,
    tileY: 14,
    w: 3,
    h: 3,
    ring: 3,
    district: "advanced",
    height: 3.5,
    active: true,
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
    height: 3,
    active: true,
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
    height: 4,
    active: true,
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
    height: 3,
    active: true,
  },
  // Intelligence zones
  {
    id: "analytics",
    name: "Analytics Center",
    tileX: 8,
    tileY: 18,
    w: 2,
    h: 3,
    ring: 3,
    district: "intel",
    height: 3.5,
    active: true,
  },
  {
    id: "reports",
    name: "Reports Office",
    tileX: 8,
    tileY: 22,
    w: 2,
    h: 2,
    ring: 3,
    district: "intel",
    height: 2.5,
    active: true,
  },
  {
    id: "knowledge-graph",
    name: "Knowledge Graph",
    tileX: 14,
    tileY: 12,
    w: 2,
    h: 2,
    ring: 3,
    district: "intel",
    height: 3.5,
    active: true,
  },
  {
    id: "skill-tree",
    name: "Skill Tree",
    tileX: 12,
    tileY: 24,
    w: 2,
    h: 2,
    ring: 3,
    district: "intel",
    height: 3,
    active: true,
  },
  {
    id: "settings",
    name: "Settings Depot",
    tileX: 14,
    tileY: 28,
    w: 2,
    h: 2,
    ring: 3,
    district: "advanced",
    height: 2,
    active: true,
  },
  {
    id: "prompt-library",
    name: "Prompt Library",
    tileX: 12,
    tileY: 10,
    w: 2,
    h: 3,
    ring: 3,
    district: "intel",
    height: 3,
    active: true,
  },
  // Mission Control — second tallest
  {
    id: "mission-control",
    name: "Mission Control",
    tileX: 18,
    tileY: 28,
    w: 3,
    h: 3,
    ring: 3,
    district: "mgmt",
    height: 5,
    active: true,
  },
  {
    id: "daily-digest",
    name: "Daily Digest",
    tileX: 16,
    tileY: 28,
    w: 2,
    h: 2,
    ring: 3,
    district: "mgmt",
    height: 2,
    active: true,
  },

  // ── Ring 4 (Edges / Infrastructure) ──────────────────────────────
  {
    id: "docks",
    name: "Connector Docks",
    tileX: 8,
    tileY: 30,
    w: 4,
    h: 3,
    ring: 4,
    district: "edge",
    height: 2.5,
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
    height: 2.5,
    active: true,
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
    height: 3,
    active: true,
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
    height: 3,
    active: true,
  },
  // Infrastructure zones near edges
  {
    id: "mcp-hub",
    name: "MCP Hub",
    tileX: 6,
    tileY: 28,
    w: 2,
    h: 2,
    ring: 4,
    district: "infra",
    height: 3,
    active: true,
  },
  {
    id: "plugins",
    name: "Plugin Bazaar",
    tileX: 6,
    tileY: 14,
    w: 3,
    h: 2,
    ring: 4,
    district: "infra",
    height: 2.5,
    active: true,
  },
  {
    id: "backups",
    name: "Backup Bunker",
    tileX: 6,
    tileY: 24,
    w: 2,
    h: 3,
    ring: 4,
    district: "infra",
    height: 2,
    active: true,
  },
  {
    id: "world-map",
    name: "World Map",
    tileX: 24,
    tileY: 8,
    w: 3,
    h: 2,
    ring: 4,
    district: "edge",
    height: 2.5,
    active: true,
  },
  {
    id: "world-versions",
    name: "World Versions",
    tileX: 34,
    tileY: 16,
    w: 2,
    h: 2,
    ring: 4,
    district: "infra",
    height: 2,
    active: true,
  },
  {
    id: "agent-profile-edge",
    name: "Agent Outpost",
    tileX: 34,
    tileY: 28,
    w: 2,
    h: 2,
    ring: 4,
    district: "social",
    height: 2,
    active: true,
  },
  {
    id: "world-versions-lab",
    name: "Version Lab",
    tileX: 36,
    tileY: 18,
    w: 2,
    h: 2,
    ring: 4,
    district: "infra",
    height: 2,
    active: true,
  },
  {
    id: "watchtower",
    name: "Watchtower",
    tileX: 8,
    tileY: 10,
    w: 2,
    h: 2,
    ring: 4,
    district: "edge",
    height: 3.5,
    active: true,
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
  // Dispatch to Dashboard (home)
  addPath(21, 20, 21, 18, true);
  // Dispatch to Agent Profile
  addPath(23, 21, 24, 21, false);

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
  // Memory to Kanban Board
  addPath(26, 16, 28, 15, false);
  // Kanban to Calendar
  addPath(30, 15, 32, 15, false);
  // Sales to Automations
  addPath(29, 28, 29, 30, false);
  // Sales to Timeline
  addPath(27, 27, 27, 28, false);
  // Agent Profile to Leaderboard
  addPath(25, 21, 26, 21, false);
  // Minions to Achievements
  addPath(26, 25, 27, 25, false);
  // Market to Sharing
  addPath(34, 26, 33, 28, false);

  // ── Secondary roads: Ring 1 to Ring 3 ─────────────────────────
  // Chat Rooms to Council
  addPath(14, 17, 11, 15, false);
  // Chat Rooms to Legal Tower
  addPath(15, 16, 17, 13, false);
  // Skills Academy to R&D Lab
  addPath(14, 25, 11, 21, false);
  // Skills Academy to Archive
  addPath(14, 26, 11, 27, false);
  // Chat to Knowledge Graph
  addPath(15, 16, 15, 13, false);
  // Knowledge Graph to Prompt Library
  addPath(14, 12, 13, 11, false);
  // R&D to Analytics
  addPath(10, 20, 9, 19, false);
  // Archive to Reports
  addPath(10, 26, 9, 23, false);
  // Skills to Skill Tree
  addPath(14, 25, 13, 25, false);
  // Skills to Settings
  addPath(15, 27, 15, 28, false);
  // Marketing to Mission Control
  addPath(22, 31, 19, 29, false);
  // Mission Control to Daily Digest
  addPath(18, 29, 17, 29, false);

  // ── Edge roads ────────────────────────────────────────────────
  // Archive to Docks
  addPath(11, 28, 9, 31, false);
  // Dispatch to Broadcast Tower
  addPath(21, 20, 21, 10, false);
  // Memory to Globe Room
  addPath(26, 16, 29, 11, false);
  // Exchange to Airport
  addPath(34, 19, 35, 13, false);
  // Broadcast to World Map
  addPath(22, 9, 24, 9, false);
  // Globe to World Map
  addPath(28, 11, 26, 9, false);
  // Council to Plugins
  addPath(10, 15, 8, 15, false);
  // Archive to Backups
  addPath(10, 27, 7, 25, false);
  // Docks to MCP Hub
  addPath(8, 30, 7, 29, false);
  // Exchange to World Versions
  addPath(34, 19, 35, 17, false);
  // Market to Agent Outpost (edge)
  addPath(34, 26, 35, 29, false);
  // World Versions to Version Lab
  addPath(35, 17, 36, 19, false);
  // Plugins to Watchtower
  addPath(7, 14, 9, 11, false);
  // Prompt Library to Watchtower
  addPath(12, 11, 9, 11, false);

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
