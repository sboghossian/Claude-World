// ============================================================
// Claude World — AchievementEngine
// Tracks, evaluates, and unlocks achievements/badges.
// ============================================================

import { notify } from "./notify.js";

// ─── Rarity tiers ──────────────────────────────────────────

export const RARITY = {
  common: { label: "Common", color: "#888899" },
  rare: { label: "Rare", color: "#4a9eff" },
  epic: { label: "Epic", color: "#a855f7" },
  legendary: { label: "Legendary", color: "#ffd700" },
};

// ─── Achievement categories ────────────────────────────────

export const CATEGORIES = [
  { id: "explorer", label: "Explorer", icon: "\uD83E\uDDED" }, // compass
  { id: "builder", label: "Builder", icon: "\uD83D\uDD28" }, // hammer
  { id: "social", label: "Social", icon: "\uD83E\uDD1D" }, // handshake
  { id: "scholar", label: "Scholar", icon: "\uD83D\uDCDA" }, // books
  { id: "merchant", label: "Merchant", icon: "\uD83D\uDED2" }, // shopping cart
  { id: "pioneer", label: "Pioneer", icon: "\uD83D\uDE80" }, // rocket
  { id: "veteran", label: "Veteran", icon: "\u2B50" }, // star
  { id: "collector", label: "Collector", icon: "\uD83D\uDDC3\uFE0F" }, // card box
];

// ─── Achievement definitions ───────────────────────────────

/**
 * Each achievement:
 *   id           — unique string identifier
 *   title        — display name
 *   description  — short description
 *   icon         — emoji
 *   category     — one of CATEGORIES[].id
 *   rarity       — common | rare | epic | legendary
 *   condition    — async (ctx) => { current, target } — returns progress
 */
const ACHIEVEMENTS = [
  // ── Explorer ──────────────────────────────────────────────
  {
    id: "explorer_visit_5",
    title: "Wanderer",
    description: "Visit 5 different zones.",
    icon: "\uD83D\uDC63",
    category: "explorer",
    rarity: "common",
    condition: async (ctx) => {
      const zones = await ctx.getZones();
      const visited = zones.filter((z) => z.unlocked).length;
      return { current: visited, target: 5 };
    },
  },
  {
    id: "explorer_visit_10",
    title: "Pathfinder",
    description: "Visit 10 different zones.",
    icon: "\uD83E\uDDED",
    category: "explorer",
    rarity: "rare",
    condition: async (ctx) => {
      const zones = await ctx.getZones();
      const visited = zones.filter((z) => z.unlocked).length;
      return { current: visited, target: 10 };
    },
  },
  {
    id: "explorer_visit_all",
    title: "Cartographer",
    description: "Visit every zone in the world.",
    icon: "\uD83D\uDDFA\uFE0F",
    category: "explorer",
    rarity: "epic",
    condition: async (ctx) => {
      const zones = await ctx.getZones();
      const visited = zones.filter((z) => z.unlocked).length;
      return { current: visited, target: zones.length };
    },
  },
  {
    id: "explorer_all_buildings",
    title: "Grand Architect",
    description: "Unlock all buildings across zones.",
    icon: "\uD83C\uDFDB\uFE0F",
    category: "explorer",
    rarity: "legendary",
    condition: async (ctx) => {
      const progress = await ctx.getZoneProgress();
      const total = progress.length || 1;
      const complete = progress.filter((z) => z.progress >= 100).length;
      return { current: complete, target: total };
    },
  },

  // ── Builder ───────────────────────────────────────────────
  {
    id: "builder_tasks_10",
    title: "Apprentice",
    description: "Complete 10 tasks.",
    icon: "\u2705",
    category: "builder",
    rarity: "common",
    condition: async (ctx) => {
      const stats = await ctx.getTaskStats();
      return { current: stats.completed || 0, target: 10 };
    },
  },
  {
    id: "builder_tasks_50",
    title: "Journeyman",
    description: "Complete 50 tasks.",
    icon: "\uD83D\uDEE0\uFE0F",
    category: "builder",
    rarity: "rare",
    condition: async (ctx) => {
      const stats = await ctx.getTaskStats();
      return { current: stats.completed || 0, target: 50 };
    },
  },
  {
    id: "builder_tasks_100",
    title: "Master Builder",
    description: "Complete 100 tasks.",
    icon: "\uD83C\uDFD7\uFE0F",
    category: "builder",
    rarity: "epic",
    condition: async (ctx) => {
      const stats = await ctx.getTaskStats();
      return { current: stats.completed || 0, target: 100 };
    },
  },
  {
    id: "builder_zone_100",
    title: "Zone Master",
    description: "Reach 100% build progress on any zone.",
    icon: "\uD83C\uDFC6",
    category: "builder",
    rarity: "epic",
    condition: async (ctx) => {
      const progress = await ctx.getZoneProgress();
      const best = progress.reduce(
        (max, z) => Math.max(max, z.progress || 0),
        0,
      );
      return { current: best, target: 100 };
    },
  },

  // ── Social ────────────────────────────────────────────────
  {
    id: "social_council_5",
    title: "Advisor",
    description: "Use the council 5 times.",
    icon: "\uD83D\uDDE3\uFE0F",
    category: "social",
    rarity: "common",
    condition: async (ctx) => {
      const sessions = await ctx.getCouncilSessions();
      return { current: sessions.length, target: 5 };
    },
  },
  {
    id: "social_council_20",
    title: "Grand Councillor",
    description: "Use the council 20 times.",
    icon: "\uD83C\uDFDB\uFE0F",
    category: "social",
    rarity: "rare",
    condition: async (ctx) => {
      const sessions = await ctx.getCouncilSessions();
      return { current: sessions.length, target: 20 };
    },
  },
  {
    id: "social_relationships_3",
    title: "Networker",
    description: "Have 3 or more agent relationships.",
    icon: "\uD83E\uDD1D",
    category: "social",
    rarity: "rare",
    condition: async (ctx) => {
      const rels = await ctx.getAgentRelationships();
      return { current: rels.length, target: 3 };
    },
  },
  {
    id: "social_relationships_10",
    title: "Social Butterfly",
    description: "Have 10 or more agent relationships.",
    icon: "\uD83C\uDF1F",
    category: "social",
    rarity: "epic",
    condition: async (ctx) => {
      const rels = await ctx.getAgentRelationships();
      return { current: rels.length, target: 10 };
    },
  },

  // ── Scholar ───────────────────────────────────────────────
  {
    id: "scholar_skills_10",
    title: "Knowledge Seeker",
    description: "Create 10 skills.",
    icon: "\uD83D\uDCD6",
    category: "scholar",
    rarity: "common",
    condition: async (ctx) => {
      const skills = await ctx.getSkills();
      return { current: skills.length, target: 10 };
    },
  },
  {
    id: "scholar_skills_25",
    title: "Sage",
    description: "Create 25 skills.",
    icon: "\uD83E\uDDD9",
    category: "scholar",
    rarity: "rare",
    condition: async (ctx) => {
      const skills = await ctx.getSkills();
      return { current: skills.length, target: 25 };
    },
  },
  {
    id: "scholar_research_5",
    title: "Researcher",
    description: "Complete 5 research queries.",
    icon: "\uD83D\uDD2C",
    category: "scholar",
    rarity: "common",
    condition: async (ctx) => {
      const queries = await ctx.getResearchQueries();
      const completed = queries.filter(
        (q) => q.status === "completed" || q.status === "done",
      ).length;
      return { current: completed, target: 5 };
    },
  },
  {
    id: "scholar_research_20",
    title: "Professor",
    description: "Complete 20 research queries.",
    icon: "\uD83C\uDF93",
    category: "scholar",
    rarity: "epic",
    condition: async (ctx) => {
      const queries = await ctx.getResearchQueries();
      const completed = queries.filter(
        (q) => q.status === "completed" || q.status === "done",
      ).length;
      return { current: completed, target: 20 };
    },
  },

  // ── Merchant ──────────────────────────────────────────────
  {
    id: "merchant_market_5",
    title: "Shopper",
    description: "Install 5 market items.",
    icon: "\uD83D\uDED2",
    category: "merchant",
    rarity: "common",
    condition: async (ctx) => {
      const installs = await ctx.getMarketInstalls();
      return { current: installs.length, target: 5 };
    },
  },
  {
    id: "merchant_market_15",
    title: "Connoisseur",
    description: "Install 15 market items.",
    icon: "\uD83D\uDC8E",
    category: "merchant",
    rarity: "rare",
    condition: async (ctx) => {
      const installs = await ctx.getMarketInstalls();
      return { current: installs.length, target: 15 };
    },
  },
  {
    id: "merchant_integrations_3",
    title: "Connector",
    description: "Connect 3 integrations.",
    icon: "\uD83D\uDD17",
    category: "merchant",
    rarity: "rare",
    condition: async (ctx) => {
      const integrations = await ctx.getIntegrations();
      return { current: integrations.length, target: 3 };
    },
  },
  {
    id: "merchant_integrations_10",
    title: "Integration Master",
    description: "Connect 10 integrations.",
    icon: "\u26A1",
    category: "merchant",
    rarity: "epic",
    condition: async (ctx) => {
      const integrations = await ctx.getIntegrations();
      return { current: integrations.length, target: 10 };
    },
  },

  // ── Pioneer ───────────────────────────────────────────────
  {
    id: "pioneer_providers_3",
    title: "Multi-Model",
    description: "Use 3 different AI providers.",
    icon: "\uD83E\uDD16",
    category: "pioneer",
    rarity: "rare",
    condition: async (ctx) => {
      const keys = await ctx.listProviders();
      return { current: keys.length, target: 3 };
    },
  },
  {
    id: "pioneer_deploy_1",
    title: "Launch Operator",
    description: "Deploy an agent via the airport.",
    icon: "\u2708\uFE0F",
    category: "pioneer",
    rarity: "rare",
    condition: async (ctx) => {
      const log = await ctx.getAirportLog();
      return { current: log.length, target: 1 };
    },
  },
  {
    id: "pioneer_deploy_5",
    title: "Flight Commander",
    description: "Deploy 5 agents via the airport.",
    icon: "\uD83D\uDEEB",
    category: "pioneer",
    rarity: "epic",
    condition: async (ctx) => {
      const log = await ctx.getAirportLog();
      return { current: log.length, target: 5 };
    },
  },
  {
    id: "pioneer_experiment_3",
    title: "Lab Rat",
    description: "Create 3 experiments in the R&D Lab.",
    icon: "\uD83E\uDDEA",
    category: "pioneer",
    rarity: "common",
    condition: async (ctx) => {
      const experiments = await ctx.getExperiments();
      return { current: experiments.length, target: 3 };
    },
  },

  // ── Veteran ───────────────────────────────────────────────
  {
    id: "veteran_level_5",
    title: "Rising Star",
    description: "Reach level 5.",
    icon: "\u2B50",
    category: "veteran",
    rarity: "common",
    condition: async (ctx) => {
      const world = await ctx.getWorld();
      return { current: world.level || 1, target: 5 };
    },
  },
  {
    id: "veteran_level_10",
    title: "Seasoned Veteran",
    description: "Reach level 10.",
    icon: "\uD83C\uDF1F",
    category: "veteran",
    rarity: "rare",
    condition: async (ctx) => {
      const world = await ctx.getWorld();
      return { current: world.level || 1, target: 10 };
    },
  },
  {
    id: "veteran_level_20",
    title: "Legend",
    description: "Reach level 20.",
    icon: "\uD83D\uDC51",
    category: "veteran",
    rarity: "legendary",
    condition: async (ctx) => {
      const world = await ctx.getWorld();
      return { current: world.level || 1, target: 20 };
    },
  },
  {
    id: "veteran_xp_1000",
    title: "XP Hoarder",
    description: "Accumulate 1,000 total XP.",
    icon: "\uD83D\uDCB0",
    category: "veteran",
    rarity: "rare",
    condition: async (ctx) => {
      const world = await ctx.getWorld();
      return { current: world.xp || 0, target: 1000 };
    },
  },
  {
    id: "veteran_xp_5000",
    title: "XP Magnate",
    description: "Accumulate 5,000 total XP.",
    icon: "\uD83D\uDCB0",
    category: "veteran",
    rarity: "epic",
    condition: async (ctx) => {
      const world = await ctx.getWorld();
      return { current: world.xp || 0, target: 5000 };
    },
  },

  // ── Collector ─────────────────────────────────────────────
  {
    id: "collector_snapshots_10",
    title: "Archivist",
    description: "Save 10 world snapshots.",
    icon: "\uD83D\uDCF8",
    category: "collector",
    rarity: "common",
    condition: async (ctx) => {
      const snaps = await ctx.getSnapshots();
      return { current: snaps.length, target: 10 };
    },
  },
  {
    id: "collector_snapshots_50",
    title: "Historian",
    description: "Save 50 world snapshots.",
    icon: "\uD83D\uDCDC",
    category: "collector",
    rarity: "rare",
    condition: async (ctx) => {
      const snaps = await ctx.getSnapshots();
      return { current: snaps.length, target: 50 };
    },
  },
  {
    id: "collector_legal_20",
    title: "Legal Eagle",
    description: "Create 20 legal documents.",
    icon: "\u2696\uFE0F",
    category: "collector",
    rarity: "rare",
    condition: async (ctx) => {
      const docs = await ctx.getLegalDocs();
      return { current: docs.length, target: 20 };
    },
  },
  {
    id: "collector_content_10",
    title: "Content Creator",
    description: "Create 10 marketing content pieces.",
    icon: "\uD83D\uDCDD",
    category: "collector",
    rarity: "common",
    condition: async (ctx) => {
      const pieces = await ctx.getContentPieces();
      return { current: pieces.length, target: 10 };
    },
  },
];

// ─── Debounce helper ───────────────────────────────────────

function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, ms);
  };
}

// ─── Event → Achievement mapping ───────────────────────────
// Maps event types to the achievement IDs that should be rechecked.

const EVENT_MAP = {
  "zone:unlocked": [
    "explorer_visit_5",
    "explorer_visit_10",
    "explorer_visit_all",
  ],
  "zone:building-complete": ["explorer_all_buildings", "builder_zone_100"],
  "dispatch:task-complete": [
    "builder_tasks_10",
    "builder_tasks_50",
    "builder_tasks_100",
  ],
  "zone:progress-updated": ["builder_zone_100", "explorer_all_buildings"],
  "council:session-created": ["social_council_5", "social_council_20"],
  "agent:relationship-changed": [
    "social_relationships_3",
    "social_relationships_10",
  ],
  "skill:created": ["scholar_skills_10", "scholar_skills_25"],
  "research:completed": ["scholar_research_5", "scholar_research_20"],
  "market:installed": ["merchant_market_5", "merchant_market_15"],
  "integration:connected": [
    "merchant_integrations_3",
    "merchant_integrations_10",
  ],
  "provider:added": ["pioneer_providers_3"],
  "airport:deployed": ["pioneer_deploy_1", "pioneer_deploy_5"],
  "experiment:created": ["pioneer_experiment_3"],
  "world:level-up": ["veteran_level_5", "veteran_level_10", "veteran_level_20"],
  "world:xp-gained": ["veteran_xp_1000", "veteran_xp_5000"],
  "snapshot:saved": ["collector_snapshots_10", "collector_snapshots_50"],
  "legal:created": ["collector_legal_20"],
  "content:created": ["collector_content_10"],
};

// ─── AchievementEngine ─────────────────────────────────────

export class AchievementEngine {
  constructor() {
    /** @type {number|null} */
    this._worldId = null;
    /** @type {Set<string>} — IDs of unlocked achievements */
    this._unlocked = new Set();
    /** @type {Map<string, {current:number, target:number}>} — cached progress */
    this._progressCache = new Map();
    /** @type {boolean} */
    this._ready = false;

    // Debounced check so rapid events don't cause excessive DB queries
    this._debouncedCheck = debounce((eventType, data) => {
      this._evaluateForEvent(eventType, data);
    }, 500);
  }

  // ── Initialization ──────────────────────────────────────────

  /**
   * Load unlocked achievements from the database.
   * @param {number} worldId
   */
  async init(worldId) {
    this._worldId = worldId;
    try {
      const rows = await window.api.db.getAchievements(worldId);
      this._unlocked = new Set((rows || []).map((r) => r.achievement_id));
    } catch (err) {
      console.warn(
        "[achievements] Failed to load unlocked achievements:",
        err.message,
      );
      this._unlocked = new Set();
    }
    this._ready = true;
    this._bindEvents();
    // Run a full check at startup (non-blocking)
    this._evaluateAll();
  }

  // ── Event binding ───────────────────────────────────────────

  _bindEvents() {
    this._boundHandlers = [];

    const eventTypes = Object.keys(EVENT_MAP);
    for (const eventType of eventTypes) {
      const handler = (e) => {
        this._debouncedCheck(eventType, e.detail);
      };
      window.addEventListener(eventType, handler);
      this._boundHandlers.push([eventType, handler]);
    }

    // Also listen on generic dispatches
    const taskHandler = () => {
      this._debouncedCheck("dispatch:task-complete", {});
    };
    window.addEventListener("dispatch:task-complete", taskHandler);
    this._boundHandlers.push(["dispatch:task-complete", taskHandler]);
  }

  /**
   * Remove all event listeners to prevent leaks.
   */
  destroy() {
    if (this._boundHandlers) {
      for (const [event, handler] of this._boundHandlers) {
        window.removeEventListener(event, handler);
      }
      this._boundHandlers = [];
    }
    this._ready = false;
  }

  // ── Context builder ─────────────────────────────────────────

  /**
   * Build the context object that condition functions receive.
   * Wraps window.api.db calls for the current world.
   */
  _buildContext() {
    const wid = this._worldId;
    return {
      getWorld: () => window.api.db.getWorld(wid),
      getZones: () => window.api.db.getZones(wid),
      getZoneProgress: () => window.api.db.getZoneProgress(wid),
      getTaskStats: () => window.api.db.getTaskStats(wid),
      getCouncilSessions: () => window.api.db.getCouncilSessions(wid, 1000),
      getAgentRelationships: () => window.api.db.getAgentRelationships(wid),
      getSkills: () => window.api.db.getSkills(wid),
      getResearchQueries: () => window.api.db.getResearchQueries(wid),
      getMarketInstalls: () => window.api.db.getMarketInstalls(wid),
      getIntegrations: () => window.api.db.getIntegrations(wid),
      listProviders: () => window.api.keys.list(),
      getAirportLog: () => window.api.db.getAirportLog(wid),
      getExperiments: () => window.api.db.getExperiments(wid, 1000),
      getSnapshots: () => window.api.db.getSnapshots(wid, 1000),
      getLegalDocs: () => window.api.db.getLegalDocs(wid, 1000),
      getContentPieces: () => window.api.db.getContentPieces(wid, 1000),
    };
  }

  // ── Evaluation ──────────────────────────────────────────────

  /**
   * Evaluate only the achievements relevant to a specific event type.
   * @param {string} eventType
   * @param {object} _data  — event detail (unused currently, reserved for future)
   */
  async _evaluateForEvent(eventType, _data) {
    if (!this._ready) return;

    const ids = EVENT_MAP[eventType];
    if (!ids || ids.length === 0) return;

    try {
      const ctx = this._buildContext();
      for (const id of ids) {
        if (this._unlocked.has(id)) continue;
        const def = ACHIEVEMENTS.find((a) => a.id === id);
        if (!def) continue;
        await this._evaluateOne(def, ctx);
      }
    } catch (err) {
      console.warn(
        `[achievements] Error evaluating for ${eventType}:`,
        err.message,
      );
    }
  }

  /**
   * Evaluate all achievements (used at startup).
   */
  async _evaluateAll() {
    if (!this._ready) return;
    const ctx = this._buildContext();
    for (const def of ACHIEVEMENTS) {
      if (this._unlocked.has(def.id)) continue;
      try {
        await this._evaluateOne(def, ctx);
      } catch (err) {
        console.warn(`[achievements] Error checking ${def.id}:`, err.message);
      }
    }
  }

  /**
   * Evaluate a single achievement's condition and unlock if met.
   * @param {object} def  — achievement definition
   * @param {object} ctx  — context object
   */
  async _evaluateOne(def, ctx) {
    try {
      const progress = await def.condition(ctx);
      this._progressCache.set(def.id, progress);

      if (progress.current >= progress.target) {
        await this._unlock(def);
      }
    } catch (err) {
      // Silently skip — the relevant DB table might not exist yet
      console.debug(`[achievements] Skip ${def.id}:`, err.message);
    }
  }

  /**
   * Mark an achievement as unlocked.
   * @param {object} def
   */
  async _unlock(def) {
    if (this._unlocked.has(def.id)) return;
    this._unlocked.add(def.id);

    // Persist to DB
    try {
      await window.api.db.unlockAchievement(this._worldId, def.id);
    } catch (err) {
      console.error("[achievements] Failed to persist unlock:", err.message);
    }

    // Notification
    notify("achievement", `${def.icon} Achievement Unlocked!`, def.title, {
      icon: def.icon,
    });

    // Celebration effect
    window.dispatchEvent(
      new CustomEvent("achievement:unlocked", {
        detail: {
          id: def.id,
          title: def.title,
          description: def.description,
          icon: def.icon,
          rarity: def.rarity,
          category: def.category,
        },
      }),
    );

    // Dispatch panel refresh
    document.dispatchEvent(new CustomEvent("achievements:updated"));
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * Trigger a check for a specific event type.
   * @param {string} eventType
   * @param {object} [data]
   */
  check(eventType, data = {}) {
    this._debouncedCheck(eventType, data);
  }

  /**
   * Get all achievement definitions.
   * @returns {Array}
   */
  getAll() {
    return ACHIEVEMENTS.map((def) => ({
      ...def,
      unlocked: this._unlocked.has(def.id),
      progress: this._progressCache.get(def.id) || null,
      condition: undefined, // strip the function from serialized output
    }));
  }

  /**
   * Get only unlocked achievement definitions.
   * @returns {Array}
   */
  getUnlocked() {
    return this.getAll().filter((a) => a.unlocked);
  }

  /**
   * Get the progress for a specific achievement.
   * @param {string} achievementId
   * @returns {{ current: number, target: number } | null}
   */
  getProgress(achievementId) {
    return this._progressCache.get(achievementId) || null;
  }

  /**
   * Total number of achievements.
   * @returns {number}
   */
  get totalCount() {
    return ACHIEVEMENTS.length;
  }

  /**
   * Number of unlocked achievements.
   * @returns {number}
   */
  get unlockedCount() {
    return this._unlocked.size;
  }

  /**
   * Overall completion percentage (0-100).
   * @returns {number}
   */
  get completionPercent() {
    if (ACHIEVEMENTS.length === 0) return 0;
    return Math.round((this._unlocked.size / ACHIEVEMENTS.length) * 100);
  }
}

// ─── Singleton ──────────────────────────────────────────────

let _instance = null;

/**
 * Get or create the singleton AchievementEngine instance.
 * @returns {AchievementEngine}
 */
export function getAchievementEngine() {
  if (!_instance) {
    _instance = new AchievementEngine();
  }
  return _instance;
}

export { ACHIEVEMENTS };
