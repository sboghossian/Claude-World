/**
 * agent-sprites.js — Animated agent sprite system for Claude World
 *
 * Renders 5 named agents as small isometric characters that wander between
 * zones on the city map.  Each agent is a PixiJS Container with body, head,
 * name label, status indicator, and shadow.  Movement uses smooth lerp
 * interpolation with a subtle walking bob.
 *
 * Uses PixiJS v8 Container, Graphics, Text, and Ticker.
 */

import { Container, Graphics, Text } from "pixi.js";
import { TILE_WIDTH, TILE_HEIGHT } from "./constants.js";
import { tileToScreen } from "./tiles.js";
import { ZONE_DEFS } from "./zones.js";
import { AGENT_PERSONALITIES } from "../systems/agent-personalities.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const randInt = (lo, hi) => Math.floor(rand(lo, hi + 1));
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/**
 * Parse a CSS hex color string (#rrggbb) into a numeric 0xRRGGBB value.
 * @param {string} hex
 * @returns {number}
 */
function hexToNum(hex) {
  return parseInt(hex.replace("#", ""), 16);
}

// ── Agent ↔ Zone mapping ─────────────────────────────────────────────────────

/**
 * Default home-zone assignments for the 5 personality keys.
 * Maps personality key → zone id from ZONE_DEFS.
 */
const HOME_ZONES = {
  commander: "dispatch",
  librarian: "brain",
  archivist: "memory",
  instructor: "skills",
  dockmaster: "docks",
};

/**
 * Zones each agent is allowed to wander to (home + nearby).
 * Keeps agents visually close to their domain.
 */
const WANDER_ZONES = {
  commander: ["dispatch", "brain", "memory", "skills", "chat", "minions"],
  librarian: ["brain", "dispatch", "chat", "memory", "council"],
  archivist: ["memory", "dispatch", "brain", "treasury", "archive"],
  instructor: ["skills", "dispatch", "brain", "minions", "rnd"],
  dockmaster: ["docks", "skills", "archive", "dispatch", "marketing"],
};

/** Seconds between random wander decisions. */
const WANDER_INTERVAL_MIN = 6;
const WANDER_INTERVAL_MAX = 14;

/** How long a walk takes in seconds. */
const WALK_DURATION_MIN = 2.0;
const WALK_DURATION_MAX = 3.5;

/** Bobbing amplitude in pixels during walk. */
const BOB_AMPLITUDE = 2.0;
/** Bobbing frequency (oscillations per second). */
const BOB_FREQUENCY = 3.5;

// ── Agent sprite dimensions ──────────────────────────────────────────────────

const BODY_W = 12;
const BODY_H = 20;
const HEAD_RADIUS = 6;
const SHADOW_RX = 10;
const SHADOW_RY = 4;
const STATUS_R = 3;

// ── Status colors ────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  active: 0x22c55e, // green
  thinking: 0xeab308, // yellow
  idle: 0x9ca3af, // gray
};

// ─────────────────────────────────────────────────────────────────────────────
// AgentSprite — one agent's visual + movement state
// ─────────────────────────────────────────────────────────────────────────────

class AgentSprite {
  /**
   * @param {string} id              — personality key (commander, librarian, …)
   * @param {object} personality     — entry from AGENT_PERSONALITIES
   * @param {Container} worldContainer
   */
  constructor(id, personality, worldContainer) {
    this.id = id;
    this.personality = personality;
    this.color = hexToNum(personality.color);
    this.homeZone = HOME_ZONES[id] || "dispatch";
    this.currentZone = this.homeZone;
    this.status = "idle"; // 'active' | 'thinking' | 'idle'

    // ── Position state (in screen px, relative to worldContainer) ──────
    const homeZoneDef =
      ZONE_DEFS.find((z) => z.id === this.homeZone) || ZONE_DEFS[0];
    const homeScreen = this._zoneCenterScreen(homeZoneDef);
    this.x = homeScreen.x + rand(-8, 8);
    this.y = homeScreen.y + rand(-8, 8);

    // ── Movement interpolation ────────────────────────────────────────
    this.moving = false;
    this.fromX = this.x;
    this.fromY = this.y;
    this.toX = this.x;
    this.toY = this.y;
    this.walkTime = 0; // elapsed seconds since walk start
    this.walkDur = 2.5; // total seconds for current walk
    this.facingRight = true;

    // ── Wander timer ─────────────────────────────────────────────────
    this.wanderTimer = rand(WANDER_INTERVAL_MIN, WANDER_INTERVAL_MAX);

    // ── Build PixiJS display objects ─────────────────────────────────
    this.container = new Container();
    this.container.sortableChildren = true;
    this.container.eventMode = "static";
    this.container.cursor = "pointer";

    this._buildGraphics();

    // Position container
    this.container.x = this.x;
    this.container.y = this.y;

    worldContainer.addChild(this.container);
  }

  // ── Build sub-sprites ──────────────────────────────────────────────────────

  _buildGraphics() {
    // Shadow (z = 0, drawn first)
    this._shadow = new Graphics();
    this._shadow.ellipse(0, 0, SHADOW_RX, SHADOW_RY);
    this._shadow.fill({ color: 0x000000, alpha: 0.25 });
    this._shadow.zIndex = 0;
    this.container.addChild(this._shadow);

    // Body — rounded rectangle / capsule
    this._body = new Graphics();
    this._drawBody();
    this._body.zIndex = 1;
    this.container.addChild(this._body);

    // Head — circle on top of body
    this._head = new Graphics();
    this._head.circle(0, -BODY_H - HEAD_RADIUS + 2, HEAD_RADIUS);
    this._head.fill({ color: this._lighten(this.color, 0.25) });
    this._head.zIndex = 2;
    this.container.addChild(this._head);

    // Status indicator dot — top-right of head
    this._statusDot = new Graphics();
    this._drawStatusDot();
    this._statusDot.zIndex = 3;
    this.container.addChild(this._statusDot);

    // Name label — tiny text below
    this._label = new Text({
      text: this.personality.name.split(" ").pop(), // last word of name
      style: {
        fontFamily: "monospace",
        fontSize: 8,
        fill: 0xffffff,
        align: "center",
        letterSpacing: 0.2,
      },
    });
    this._label.anchor.set(0.5, 0);
    this._label.y = 4;
    this._label.alpha = 0.75;
    this._label.zIndex = 4;
    this.container.addChild(this._label);
  }

  _drawBody() {
    this._body.clear();
    // Draw a rounded rectangle centered horizontally, above shadow
    this._body.roundRect(
      -BODY_W / 2,
      -BODY_H,
      BODY_W,
      BODY_H,
      4, // corner radius
    );
    this._body.fill({ color: this.color });
    // Subtle outline
    this._body.roundRect(-BODY_W / 2, -BODY_H, BODY_W, BODY_H, 4);
    this._body.stroke({ color: 0x000000, alpha: 0.3, width: 1 });
  }

  _drawStatusDot() {
    this._statusDot.clear();
    const statusColor = STATUS_COLORS[this.status] || STATUS_COLORS.idle;
    const dotX = HEAD_RADIUS - 1;
    const dotY = -BODY_H - HEAD_RADIUS * 2 + 4;
    this._statusDot.circle(dotX, dotY, STATUS_R);
    this._statusDot.fill({ color: statusColor });
    // Tiny border for visibility
    this._statusDot.circle(dotX, dotY, STATUS_R);
    this._statusDot.stroke({ color: 0x000000, alpha: 0.4, width: 0.5 });
  }

  /**
   * Lighten a hex color by mixing toward white.
   * @param {number} color
   * @param {number} amount  0–1
   * @returns {number}
   */
  _lighten(color, amount) {
    const r = clamp(Math.round(((color >> 16) & 0xff) + 255 * amount), 0, 255);
    const g = clamp(Math.round(((color >> 8) & 0xff) + 255 * amount), 0, 255);
    const b = clamp(Math.round((color & 0xff) + 255 * amount), 0, 255);
    return (r << 16) | (g << 8) | b;
  }

  // ── Zone helpers ───────────────────────────────────────────────────────────

  /**
   * Get the screen-space center of a zone's footprint.
   * @param {import('./zones.js').ZoneDef} zone
   * @returns {{ x: number, y: number }}
   */
  _zoneCenterScreen(zone) {
    // Center tile of the zone footprint
    const cx = zone.tileX + zone.w / 2;
    const cy = zone.tileY + zone.h / 2;
    return tileToScreen(cx, cy);
  }

  /**
   * Pick a random screen position near a zone center (slight offset for clustering).
   * @param {string} zoneId
   * @returns {{ x: number, y: number }}
   */
  _randomPosNearZone(zoneId) {
    const zone = ZONE_DEFS.find((z) => z.id === zoneId);
    if (!zone) {
      const fallback = ZONE_DEFS[0];
      const c = this._zoneCenterScreen(fallback);
      return { x: c.x, y: c.y };
    }
    const center = this._zoneCenterScreen(zone);
    return {
      x: center.x + rand(-16, 16),
      y: center.y + rand(-8, 8),
    };
  }

  // ── Movement ───────────────────────────────────────────────────────────────

  /**
   * Start walking to a specific zone.
   * @param {string} zoneId
   */
  walkToZone(zoneId) {
    const dest = this._randomPosNearZone(zoneId);
    this.fromX = this.x;
    this.fromY = this.y;
    this.toX = dest.x;
    this.toY = dest.y;
    this.walkTime = 0;

    // Duration proportional to distance, clamped to reasonable range
    const dx = this.toX - this.fromX;
    const dy = this.toY - this.fromY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    this.walkDur = clamp(dist / 80, WALK_DURATION_MIN, WALK_DURATION_MAX);

    this.moving = true;
    this.currentZone = zoneId;

    // Determine facing direction
    if (Math.abs(dx) > 2) {
      this.facingRight = dx > 0;
    }
  }

  /**
   * Pick a random wander destination and start walking.
   */
  wander() {
    const zones = WANDER_ZONES[this.id] || [this.homeZone];
    // Weighted: 40% chance to go home, 60% chance random wander zone
    const target =
      Math.random() < 0.4 ? this.homeZone : zones[randInt(0, zones.length - 1)];
    this.walkToZone(target);
  }

  // ── Update (called each frame) ─────────────────────────────────────────────

  /**
   * @param {number} dt  delta time in seconds
   */
  update(dt) {
    // ── Wander timer ──────────────────────────────────────────────────
    if (!this.moving) {
      this.wanderTimer -= dt;
      if (this.wanderTimer <= 0) {
        this.wander();
        this.wanderTimer = rand(WANDER_INTERVAL_MIN, WANDER_INTERVAL_MAX);
      }
    }

    // ── Walk interpolation ────────────────────────────────────────────
    if (this.moving) {
      this.walkTime += dt;
      const t = clamp(this.walkTime / this.walkDur, 0, 1);

      // Ease-in-out (smoothstep)
      const smooth = t * t * (3 - 2 * t);

      this.x = lerp(this.fromX, this.toX, smooth);
      this.y = lerp(this.fromY, this.toY, smooth);

      // Walking bob (oscillating Y offset)
      const bobOffset =
        Math.sin(this.walkTime * BOB_FREQUENCY * Math.PI * 2) * BOB_AMPLITUDE;

      this.container.x = this.x;
      this.container.y = this.y + bobOffset;

      // Flip sprite horizontally based on facing direction
      this.container.scale.x = this.facingRight ? 1 : -1;
      // Keep label unflipped
      this._label.scale.x = this.facingRight ? 1 : -1;

      if (t >= 1) {
        this.moving = false;
        this.x = this.toX;
        this.y = this.toY;
        this.container.x = this.x;
        this.container.y = this.y;
      }
    }

    // ── Depth sorting: agents further down screen render on top ──────
    // Use Y position for zIndex so agents overlap correctly
    this.container.zIndex = Math.round(this.y + 1000);
  }

  // ── Status updates ─────────────────────────────────────────────────────────

  /**
   * Set the agent's status indicator.
   * @param {'active'|'thinking'|'idle'} status
   */
  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this._drawStatusDot();
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  destroy() {
    this.container.parent?.removeChild(this.container);
    this.container.destroy({ children: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A* Pathfinding (simple grid-based)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simple A* pathfinder on the tile grid.  Returns an array of { tileX, tileY }
 * waypoints from start to goal.  Falls back to a direct line if no path found.
 *
 * Since agents walk smoothly between zones (not tile-by-tile), this is used
 * to generate intermediate waypoints that avoid water tiles.  For simplicity
 * the current implementation uses direct lerp between zone centers; this
 * pathfinder is reserved for future enhancement.
 *
 * @param {number} startX
 * @param {number} startY
 * @param {number} goalX
 * @param {number} goalY
 * @returns {{ tileX: number, tileY: number }[]}
 */
function findPath(startX, startY, goalX, goalY) {
  // For now, return a direct 2-point path (start → goal).
  // The smooth lerp in AgentSprite.walkToZone handles interpolation.
  // A full A* can be plugged in here without changing the rest of the system.
  return [
    { tileX: startX, tileY: startY },
    { tileX: goalX, tileY: goalY },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// AgentSpriteSystem — manages all agent sprites
// ─────────────────────────────────────────────────────────────────────────────

export class AgentSpriteSystem {
  /**
   * @param {import('pixi.js').Application} app
   * @param {import('pixi.js').Container}   worldContainer
   */
  constructor(app, worldContainer) {
    this._app = app;
    this._worldContainer = worldContainer;

    /** @type {Map<string, AgentSprite>} personality key → AgentSprite */
    this._agents = new Map();

    /** The PixiJS container that holds all agent containers (for z-sorting). */
    this._layer = new Container();
    this._layer.sortableChildren = true;
    this._layer.zIndex = 1; // above buildings but below fog
    this._worldContainer.addChild(this._layer);

    // Bind ticker callback
    this._tick = this._tick.bind(this);

    // Bind DOM event listeners (zone events trigger agent movement)
    this._boundEventHandlers = [];
    this._bindZoneEvents();
  }

  // ── Initialization ─────────────────────────────────────────────────────────

  /**
   * Create the 5 agent sprites and start the animation ticker.
   * Call after PixiJS app and BuildingManager are ready.
   *
   * @param {string[]} [agentKeys] — personality keys to spawn.
   *   Defaults to all 5: commander, librarian, archivist, instructor, dockmaster.
   */
  init(agentKeys) {
    const keys = agentKeys || Object.keys(HOME_ZONES);

    for (const key of keys) {
      const personality = AGENT_PERSONALITIES[key];
      if (!personality) {
        console.warn(`[AgentSprites] Unknown personality key: ${key}`);
        continue;
      }
      if (this._agents.has(key)) continue; // already created

      const sprite = new AgentSprite(key, personality, this._layer);
      this._agents.set(key, sprite);
    }

    // Start ticker
    this._app.ticker.add(this._tick);

    console.log(`[AgentSprites] Initialized ${this._agents.size} agents`);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Frame update — called by PixiJS ticker.
   * @param {import('pixi.js').Ticker} ticker
   */
  update(ticker) {
    const dt = ticker.deltaMS / 1000;
    for (const agent of this._agents.values()) {
      agent.update(dt);
    }
  }

  /**
   * Command an agent to walk to a specific zone.
   * @param {string} agentId     — personality key
   * @param {string} zoneType    — zone id (e.g. 'dispatch', 'brain')
   */
  moveAgentToZone(agentId, zoneType) {
    const agent = this._agents.get(agentId);
    if (!agent) {
      console.warn(`[AgentSprites] Agent not found: ${agentId}`);
      return;
    }
    agent.walkToZone(zoneType);
  }

  /**
   * Set an agent's status indicator color.
   * @param {string} agentId
   * @param {'active'|'thinking'|'idle'} status
   */
  setAgentStatus(agentId, status) {
    const agent = this._agents.get(agentId);
    if (agent) agent.setStatus(status);
  }

  /**
   * Get the AgentSprite instance for a given personality key.
   * @param {string} agentId
   * @returns {AgentSprite|undefined}
   */
  getAgent(agentId) {
    return this._agents.get(agentId);
  }

  /**
   * Get all agent IDs currently managed by the system.
   * @returns {string[]}
   */
  getAgentIds() {
    return [...this._agents.keys()];
  }

  /**
   * Tear down the entire agent sprite system.
   */
  destroy() {
    // Remove ticker
    this._app.ticker.remove(this._tick);

    // Destroy all agents
    for (const agent of this._agents.values()) {
      agent.destroy();
    }
    this._agents.clear();

    // Remove layer
    this._layer.parent?.removeChild(this._layer);
    this._layer.destroy({ children: true });

    // Unbind DOM events
    for (const { event, handler } of this._boundEventHandlers) {
      document.removeEventListener(event, handler);
    }
    this._boundEventHandlers = [];

    console.log("[AgentSprites] Destroyed");
  }

  // ── Internal: Ticker ───────────────────────────────────────────────────────

  /**
   * @param {import('pixi.js').Ticker} ticker
   */
  _tick(ticker) {
    this.update(ticker);
  }

  // ── Internal: Zone event wiring ────────────────────────────────────────────

  /**
   * Listen for zone-related custom events on `document` and move agents
   * in response.  Also wires up click detection on agent containers.
   */
  _bindZoneEvents() {
    // Map event names → which agent should respond and which zone to visit.
    const eventMap = [
      { event: "dispatch:task-assigned", agent: "commander", zone: "dispatch" },
      { event: "dispatch:task-complete", agent: "commander", zone: "dispatch" },
      { event: "dispatch:task-failed", agent: "commander", zone: "dispatch" },
      { event: "brain:query", agent: "librarian", zone: "brain" },
      { event: "brain:index-complete", agent: "librarian", zone: "brain" },
      { event: "memory:store", agent: "archivist", zone: "memory" },
      { event: "memory:recall", agent: "archivist", zone: "memory" },
      { event: "skills:train", agent: "instructor", zone: "skills" },
      { event: "skills:level-up", agent: "instructor", zone: "skills" },
      { event: "docks:connect", agent: "dockmaster", zone: "docks" },
      { event: "docks:transfer", agent: "dockmaster", zone: "docks" },
    ];

    for (const { event, agent, zone } of eventMap) {
      const handler = () => {
        this.moveAgentToZone(agent, zone);
        this.setAgentStatus(agent, "active");
        // Revert to idle after a few seconds
        setTimeout(() => this.setAgentStatus(agent, "idle"), 5000);
      };
      document.addEventListener(event, handler);
      this._boundEventHandlers.push({ event, handler });
    }

    // Generic zone-click: nearest agent walks to clicked zone
    const zoneClickHandler = (e) => {
      const detail = e.detail;
      if (!detail || !detail.id) return;
      this._sendNearestAgentToZone(detail.id);
    };
    document.addEventListener("zone-click", zoneClickHandler);
    this._boundEventHandlers.push({
      event: "zone-click",
      handler: zoneClickHandler,
    });
  }

  /**
   * Find the nearest idle agent and send them to a zone.
   * @param {string} zoneId
   */
  _sendNearestAgentToZone(zoneId) {
    const zoneDef = ZONE_DEFS.find((z) => z.id === zoneId);
    if (!zoneDef) return;

    const target = tileToScreen(
      zoneDef.tileX + zoneDef.w / 2,
      zoneDef.tileY + zoneDef.h / 2,
    );

    let nearest = null;
    let bestDist = Infinity;

    for (const agent of this._agents.values()) {
      if (agent.moving) continue; // prefer idle agents
      const dx = agent.x - target.x;
      const dy = agent.y - target.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) {
        bestDist = d;
        nearest = agent;
      }
    }

    // If all agents are moving, just pick the first one
    if (!nearest) {
      nearest = this._agents.values().next().value;
    }

    if (nearest) {
      nearest.walkToZone(zoneId);
    }
  }

  /**
   * Wire up click events on individual agent containers.
   * Called once per agent after creation.  The event is dispatched on `document`
   * so external systems can listen for 'agent-click'.
   */
  _wireAgentClicks() {
    for (const [id, agent] of this._agents) {
      agent.container.removeAllListeners?.("pointertap");
      agent.container.on("pointertap", (e) => {
        e.stopPropagation?.();
        const personality = AGENT_PERSONALITIES[id];
        document.dispatchEvent(
          new CustomEvent("agent-click", {
            detail: {
              agentId: id,
              name: personality?.name || id,
              role: personality?.role || "",
              color: personality?.color || "#ffffff",
              status: agent.status,
              zone: agent.currentZone,
              x: agent.x,
              y: agent.y,
            },
          }),
        );
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create, initialize, and return an AgentSpriteSystem.
 *
 * @param {import('pixi.js').Application} app
 * @param {import('pixi.js').Container}   worldContainer
 * @param {string[]} [agentKeys]  — personality keys to spawn (default: all 5)
 * @returns {AgentSpriteSystem}
 *
 * @example
 *   import { initAgentSprites } from './agent-sprites.js';
 *   const agents = initAgentSprites(getApp(), worldContainer);
 *   agents.moveAgentToZone('commander', 'brain');
 */
export function initAgentSprites(app, worldContainer, agentKeys) {
  const system = new AgentSpriteSystem(app, worldContainer);
  system.init(agentKeys);
  // Wire click events after agents are created
  system._wireAgentClicks();
  return system;
}
