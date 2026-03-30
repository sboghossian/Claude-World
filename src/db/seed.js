"use strict";

/**
 * @fileoverview Seed functions for initialising a new Claude World.
 * Each function takes a Database instance (from database.js) and a worldId,
 * then inserts the canonical starting data for zones, agents, and quests.
 */

// ---------------------------------------------------------------------------
// Zone definitions
// ---------------------------------------------------------------------------

/** @type {Array<{id: string, zone_type: string, name: string, grid_x: number, grid_y: number, grid_w: number, grid_h: number, unlocked: 0|1}>} */
const ZONE_DEFS = [
  {
    id: "dispatch_tower",
    zone_type: "dispatch_tower",
    name: "Dispatch Tower",
    grid_x: 20,
    grid_y: 20,
    grid_w: 4,
    grid_h: 4,
    unlocked: 1,
  },
  {
    id: "brain_library",
    zone_type: "brain_library",
    name: "Brain Library",
    grid_x: 16,
    grid_y: 20,
    grid_w: 3,
    grid_h: 3,
    unlocked: 1,
  },
  {
    id: "skills_academy",
    zone_type: "skills_academy",
    name: "Skills Academy",
    grid_x: 14,
    grid_y: 24,
    grid_w: 3,
    grid_h: 3,
    unlocked: 1,
  },
  {
    id: "memory_vault",
    zone_type: "memory_vault",
    name: "Memory Vault",
    grid_x: 24,
    grid_y: 16,
    grid_w: 3,
    grid_h: 3,
    unlocked: 1,
  },
  {
    id: "connector_docks",
    zone_type: "connector_docks",
    name: "Connector Docks",
    grid_x: 8,
    grid_y: 30,
    grid_w: 4,
    grid_h: 3,
    unlocked: 1,
  },
  {
    id: "chat_rooms",
    zone_type: "chat_rooms",
    name: "Chat Rooms",
    grid_x: 14,
    grid_y: 16,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "treasury",
    zone_type: "treasury",
    name: "Treasury",
    grid_x: 28,
    grid_y: 20,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "minion_tunnels",
    zone_type: "minion_tunnels",
    name: "Minion Tunnels",
    grid_x: 24,
    grid_y: 24,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "legal_tower",
    zone_type: "legal_tower",
    name: "Legal Tower",
    grid_x: 16,
    grid_y: 12,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "sales_district",
    zone_type: "sales_district",
    name: "Sales District",
    grid_x: 28,
    grid_y: 26,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "marketing_plaza",
    zone_type: "marketing_plaza",
    name: "Marketing Plaza",
    grid_x: 22,
    grid_y: 30,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "the_exchange",
    zone_type: "the_exchange",
    name: "The Exchange",
    grid_x: 32,
    grid_y: 18,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "the_market",
    zone_type: "the_market",
    name: "The Market",
    grid_x: 32,
    grid_y: 24,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "the_council",
    zone_type: "the_council",
    name: "The Council",
    grid_x: 10,
    grid_y: 14,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "rd_lab",
    zone_type: "rd_lab",
    name: "R&D Lab",
    grid_x: 10,
    grid_y: 20,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "the_archive",
    zone_type: "the_archive",
    name: "The Archive",
    grid_x: 10,
    grid_y: 26,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "airport",
    zone_type: "airport",
    name: "Airport",
    grid_x: 34,
    grid_y: 10,
    grid_w: 4,
    grid_h: 4,
    unlocked: 0,
  },
  {
    id: "globe_room",
    zone_type: "globe_room",
    name: "Globe Room",
    grid_x: 28,
    grid_y: 10,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
  {
    id: "broadcast_tower",
    zone_type: "broadcast_tower",
    name: "Broadcast Tower",
    grid_x: 20,
    grid_y: 8,
    grid_w: 3,
    grid_h: 3,
    unlocked: 0,
  },
];

// ---------------------------------------------------------------------------
// Agent definitions (for the 5 unlocked starter zones)
// ---------------------------------------------------------------------------

/** @type {Array<{name: string, zone_id: string, role: string, personality: string, sprite_set: string, system_prompt: string}>} */
const AGENT_DEFS = [
  {
    name: "Commander",
    zone_id: "dispatch_tower",
    role: "dispatcher",
    personality: "strategic",
    sprite_set: "commander",
    system_prompt:
      "You are the Commander of the Dispatch Tower. You coordinate all task routing " +
      "across the city, prioritise workloads, and ensure every request reaches the " +
      "right agent. You are decisive, strategic, and always focused on throughput.",
  },
  {
    name: "Librarian",
    zone_id: "brain_library",
    role: "researcher",
    personality: "meticulous",
    sprite_set: "librarian",
    system_prompt:
      "You are the Librarian of the Brain Library. You catalogue knowledge, perform " +
      "deep research, and synthesise information from multiple sources. You are " +
      "meticulous, curious, and value accuracy above speed.",
  },
  {
    name: "Teacher",
    zone_id: "skills_academy",
    role: "trainer",
    personality: "patient",
    sprite_set: "teacher",
    system_prompt:
      "You are the Teacher at the Skills Academy. You design prompt templates, " +
      "train other agents on new skills, and refine techniques through practice. " +
      "You are patient, encouraging, and believe every problem is a learning opportunity.",
  },
  {
    name: "Archivist",
    zone_id: "memory_vault",
    role: "memory_keeper",
    personality: "thoughtful",
    sprite_set: "archivist",
    system_prompt:
      "You are the Archivist of the Memory Vault. You preserve conversation history, " +
      "organise long-term memories, and surface relevant context when needed. You are " +
      "thoughtful, precise, and have an excellent recall for detail.",
  },
  {
    name: "Harbor Master",
    zone_id: "connector_docks",
    role: "integrator",
    personality: "practical",
    sprite_set: "harbor_master",
    system_prompt:
      "You are the Harbor Master at the Connector Docks. You manage API connections, " +
      "validate credentials, and ensure data flows smoothly between external services " +
      "and the city. You are practical, reliable, and security-conscious.",
  },
];

// ---------------------------------------------------------------------------
// Quest chain definitions
// ---------------------------------------------------------------------------

/** @type {Array<{id: string, chain_id: string, title: string, description: string, status: string, sort_order: number, reward_xp: number, trigger_type: string, trigger_value: string}>} */
const QUEST_DEFS = [
  {
    id: "q_first_contact",
    chain_id: "onboarding",
    title: "First Contact",
    description: "Enter the Brain Library and meet the Librarian.",
    status: "active",
    sort_order: 0,
    reward_xp: 50,
    trigger_type: "zone_enter",
    trigger_value: "brain_library",
  },
  {
    id: "q_open_docks",
    chain_id: "onboarding",
    title: "Open the Docks",
    description: "Connect your first API key at the Connector Docks.",
    status: "locked",
    sort_order: 1,
    reward_xp: 80,
    trigger_type: "api_connect",
    trigger_value: "any",
  },
  {
    id: "q_dispatch_task",
    chain_id: "onboarding",
    title: "Dispatch a Task",
    description: "Send your first AI task from the Dispatch Tower.",
    status: "locked",
    sort_order: 2,
    reward_xp: 120,
    trigger_type: "task_complete",
    trigger_value: "any",
  },
  {
    id: "q_enroll_school",
    chain_id: "onboarding",
    title: "Enroll in School",
    description: "Create your first skill at the Skills Academy.",
    status: "locked",
    sort_order: 3,
    reward_xp: 100,
    trigger_type: "skill_create",
    trigger_value: "any",
  },
  {
    id: "q_deploy_minion",
    chain_id: "onboarding",
    title: "Deploy a Minion",
    description: "Schedule an automated task in the Minion Tunnels.",
    status: "locked",
    sort_order: 4,
    reward_xp: 150,
    trigger_type: "task_schedule",
    trigger_value: "any",
  },
  {
    id: "q_build_treasury",
    chain_id: "onboarding",
    title: "Build the Treasury",
    description: "Set a spending budget in the Treasury.",
    status: "locked",
    sort_order: 5,
    reward_xp: 100,
    trigger_type: "budget_set",
    trigger_value: "any",
  },
  {
    id: "q_hire_team",
    chain_id: "onboarding",
    title: "Hire your Team",
    description: "Connect three different API providers.",
    status: "locked",
    sort_order: 6,
    reward_xp: 200,
    trigger_type: "provider_count",
    trigger_value: "3",
  },
  {
    id: "q_go_to_market",
    chain_id: "onboarding",
    title: "Go to Market",
    description: "Publish a skill to The Market.",
    status: "locked",
    sort_order: 7,
    reward_xp: 300,
    trigger_type: "skill_publish",
    trigger_value: "any",
  },
];

// ---------------------------------------------------------------------------
// Template → extra zone unlocks
// ---------------------------------------------------------------------------

/** @type {Record<string, string[]>} */
const TEMPLATE_UNLOCKS = {
  startup_founder: ["legal_tower", "sales_district", "treasury"],
  freelancer: ["chat_rooms"],
  developer: ["minion_tunnels", "the_exchange"],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Seed the 19 default zones for a newly-created world.
 *
 * @param {import('./database.js').Database} db  The open Database instance.
 * @param {string} worldId  The ID of the world to seed.
 * @returns {Array<{id: string, zone_type: string}>}  Inserted zone rows (id + type).
 */
function seedDefaultZones(db, worldId) {
  const insertZone = db.db.prepare(`
    INSERT INTO zones (id, world_id, zone_type, name, grid_x, grid_y, grid_w, grid_h, unlocked, build_progress, discovered, unlocked_at, discovered_at)
    VALUES (@id, @world_id, @zone_type, @name, @grid_x, @grid_y, @grid_w, @grid_h, @unlocked, @build_progress, @discovered, @unlocked_at, @discovered_at)
  `);

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  const zones = [];
  for (const def of ZONE_DEFS) {
    const row = {
      id: def.id,
      world_id: worldId,
      zone_type: def.zone_type,
      name: def.name,
      grid_x: def.grid_x,
      grid_y: def.grid_y,
      grid_w: def.grid_w,
      grid_h: def.grid_h,
      unlocked: def.unlocked,
      build_progress: def.unlocked ? 1.0 : 0.0,
      discovered: def.unlocked ? 1 : 0,
      unlocked_at: def.unlocked ? now : null,
      discovered_at: def.unlocked ? now : null,
    };
    insertZone.run(row);
    zones.push({ id: def.id, zone_type: def.zone_type });
  }

  return zones;
}

/**
 * Seed the 5 starter agents, one for each unlocked zone.
 *
 * @param {import('./database.js').Database} db  The open Database instance.
 * @param {string} worldId  The ID of the world to seed.
 * @param {Array<{id: string, zone_type: string}>} zones  The zones previously created.
 * @returns {Array<{id: string, name: string}>}  Inserted agent rows.
 */
function seedDefaultAgents(db, worldId, zones) {
  const insertAgent = db.db.prepare(`
    INSERT INTO agents (world_id, zone_id, name, role, personality, sprite_set, system_prompt, tile_x, tile_y)
    VALUES (@world_id, @zone_id, @name, @role, @personality, @sprite_set, @system_prompt, @tile_x, @tile_y)
  `);

  const zoneMap = new Map(zones.map((z) => [z.id, z]));
  const agents = [];

  for (const def of AGENT_DEFS) {
    const zone = zoneMap.get(def.zone_id);
    if (!zone) continue;

    const info = insertAgent.run({
      world_id: worldId,
      zone_id: def.zone_id,
      name: def.name,
      role: def.role,
      personality: def.personality,
      sprite_set: def.sprite_set,
      system_prompt: def.system_prompt,
      tile_x: 1,
      tile_y: 1,
    });

    // better-sqlite3 does not return the generated id from DEFAULT, so we
    // retrieve the last inserted rowid and query back.
    const row = db.db
      .prepare("SELECT id FROM agents WHERE rowid = ?")
      .get(info.lastInsertRowid);

    agents.push({ id: row.id, name: def.name });
  }

  return agents;
}

/**
 * Seed the onboarding quest chain (8 quests, first one active).
 *
 * @param {import('./database.js').Database} db  The open Database instance.
 * @param {string} worldId  The ID of the world to seed.
 * @returns {void}
 */
function seedQuestChain(db, worldId) {
  const insertQuest = db.db.prepare(`
    INSERT INTO quests (id, world_id, chain_id, title, description, status, sort_order, reward_xp, trigger_type, trigger_value)
    VALUES (@id, @world_id, @chain_id, @title, @description, @status, @sort_order, @reward_xp, @trigger_type, @trigger_value)
  `);

  for (const def of QUEST_DEFS) {
    insertQuest.run({ ...def, world_id: worldId });
  }
}

/**
 * Unlock additional zones based on the chosen world template.
 *
 * @param {import('./database.js').Database} db  The open Database instance.
 * @param {string} worldId  The ID of the world to apply the template to.
 * @param {string|null|undefined} template  The template name (e.g. 'startup_founder').
 * @returns {void}
 */
function applyTemplate(db, worldId, template) {
  if (!template || !TEMPLATE_UNLOCKS[template]) return;

  const unlockStmt = db.db.prepare(`
    UPDATE zones
    SET unlocked = 1,
        build_progress = 1.0,
        discovered = 1,
        unlocked_at = datetime('now'),
        discovered_at = datetime('now')
    WHERE world_id = ? AND id = ? AND unlocked = 0
  `);

  for (const zoneId of TEMPLATE_UNLOCKS[template]) {
    unlockStmt.run(worldId, zoneId);
  }
}

module.exports = {
  seedDefaultZones,
  seedDefaultAgents,
  seedQuestChain,
  applyTemplate,
  ZONE_DEFS,
  AGENT_DEFS,
  QUEST_DEFS,
  TEMPLATE_UNLOCKS,
};
