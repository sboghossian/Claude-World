/**
 * agents.js - Agent sprite rendering and state machine for Claude World
 *
 * Each agent is a small isometric figure drawn with PixiJS Graphics (no
 * sprite assets). Agents live inside zones, idle/wander when free, walk
 * to workstations when assigned a task, pulse while working, then raise
 * a hand to report completion before returning to idle.
 *
 * State machine:
 *   IDLE -> WALKING (task or wander)
 *   WALKING -> WORKING (arrived at workstation)
 *   WALKING -> IDLE   (arrived at wander destination)
 *   WORKING -> REPORTING (task complete)
 *   REPORTING -> IDLE (after 2s)
 */

import { Container, Graphics, Text } from "pixi.js";
import { tileToScreen } from "./tiles.js";
import { ZONE_DEFS } from "./zones.js";
import { TILE_WIDTH, TILE_HEIGHT } from "./constants.js";

// ── Agent states ─────────────────────────────────────────────────────
export const AgentState = Object.freeze({
  IDLE: "IDLE",
  WALKING: "WALKING",
  WORKING: "WORKING",
  REPORTING: "REPORTING",
});

// ── Role → color mapping ─────────────────────────────────────────────
const ROLE_COLORS = {
  dispatcher: 0x4a90d9, // blue
  researcher: 0x4caf50, // green
  trainer: 0xe8893c, // orange
  memory_keeper: 0x9c5ec7, // purple
  integrator: 0x00bcd4, // cyan
};

/** Fallback color when role is unknown */
const DEFAULT_COLOR = 0xaaaaaa;

// ── Movement speed (tiles per second) ────────────────────────────────
const WALK_SPEED = 1;

// ── Idle wander config ───────────────────────────────────────────────
/** Seconds between random wanders while idle */
const WANDER_INTERVAL_MIN = 3;
const WANDER_INTERVAL_MAX = 8;
/** Max wander distance from zone center in tiles */
const WANDER_RADIUS = 2;

// ── Reporting duration ───────────────────────────────────────────────
const REPORT_DURATION = 2; // seconds

// ── Sprite dimensions (in pixels) ────────────────────────────────────
const BODY_W = 10;
const BODY_H = 10;
const HEAD_R = 5;
const LEG_H = 4;
const SPRITE_W = 16;
const SPRITE_H = 24;

// ── Helper: random float in [min, max) ───────────────────────────────
function randRange(min, max) {
  return min + Math.random() * (max - min);
}

// ── Helper: clamp a value ────────────────────────────────────────────
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// ── Helper: find zone def by id ──────────────────────────────────────
function findZone(zoneId) {
  return ZONE_DEFS.find((z) => z.id === zoneId) || null;
}

/**
 * Compute the center tile of a zone.
 * @param {import('./zones.js').ZoneDef} zone
 * @returns {{ x: number, y: number }}
 */
function zoneCenter(zone) {
  return {
    x: zone.tileX + zone.w / 2,
    y: zone.tileY + zone.h / 2,
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Speech Bubble
// ─────────────────────────────────────────────────────────────────────

/**
 * Create a speech bubble Graphics + Text container.
 * The bubble starts visible and fades out over `duration` seconds.
 * @param {string} message - e.g. "..." or "✓"
 * @returns {Container}
 */
function createSpeechBubble(message) {
  const bubble = new Container();

  // Rounded rectangle background
  const bg = new Graphics();
  const bw = 24;
  const bh = 16;
  const pad = 2;
  // Background rect
  bg.roundRect(-bw / 2, -bh - 8, bw, bh, 4);
  bg.fill({ color: 0xffffff, alpha: 0.92 });
  // Small triangle pointer
  bg.poly([-4, -8, 4, -8, 0, -3]);
  bg.fill({ color: 0xffffff, alpha: 0.92 });
  bubble.addChild(bg);

  // Text label
  const label = new Text({
    text: message,
    style: {
      fontFamily: "monospace",
      fontSize: 9,
      fill: 0x333333,
      align: "center",
    },
  });
  label.anchor.set(0.5, 0.5);
  label.position.set(0, -bh / 2 - 8);
  bubble.addChild(label);

  return bubble;
}

// ─────────────────────────────────────────────────────────────────────
//  Agent visual builder
// ─────────────────────────────────────────────────────────────────────

/**
 * Draw a single frame of the agent figure into a Graphics object.
 *
 * @param {Graphics} gfx - cleared before drawing
 * @param {number} color - role color
 * @param {object} opts
 * @param {number} opts.legPhase    - 0 or 1 for alternating legs (walking)
 * @param {boolean} opts.handRaised - whether to draw the raised-hand line
 * @param {number} opts.glowAlpha   - 0-1 pulse glow intensity (working)
 */
function drawAgentBody(
  gfx,
  color,
  { legPhase = 0, handRaised = false, glowAlpha = 0 } = {},
) {
  gfx.clear();

  // ── Glow circle (behind body, for WORKING state) ───────────────
  if (glowAlpha > 0) {
    gfx.circle(0, -BODY_H / 2, HEAD_R + 6);
    gfx.fill({ color, alpha: glowAlpha * 0.35 });
  }

  // ── Legs ───────────────────────────────────────────────────────
  const legSpread = 3;
  const legOffsetL = legPhase === 0 ? 0 : 2;
  const legOffsetR = legPhase === 0 ? 2 : 0;

  gfx.moveTo(-legSpread, 0);
  gfx.lineTo(-legSpread, LEG_H + legOffsetL);
  gfx.stroke({ color: 0x333333, width: 2 });

  gfx.moveTo(legSpread, 0);
  gfx.lineTo(legSpread, LEG_H + legOffsetR);
  gfx.stroke({ color: 0x333333, width: 2 });

  // ── Body rectangle ─────────────────────────────────────────────
  gfx.roundRect(-BODY_W / 2, -BODY_H, BODY_W, BODY_H, 2);
  gfx.fill({ color });

  // ── Head (circle) ──────────────────────────────────────────────
  gfx.circle(0, -BODY_H - HEAD_R + 1, HEAD_R);
  gfx.fill({ color });
  // Lighter face highlight
  gfx.circle(-1.5, -BODY_H - HEAD_R, 1.5);
  gfx.fill({ color: 0xffffff, alpha: 0.3 });

  // ── Hand raised (REPORTING) ────────────────────────────────────
  if (handRaised) {
    gfx.moveTo(0, -BODY_H - HEAD_R * 2);
    gfx.lineTo(0, -BODY_H - HEAD_R * 2 - 6);
    gfx.stroke({ color, width: 2 });
    // Small dot at top
    gfx.circle(0, -BODY_H - HEAD_R * 2 - 7, 1.5);
    gfx.fill({ color });
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Single Agent object
// ─────────────────────────────────────────────────────────────────────

/**
 * Internal agent representation.
 */
class Agent {
  /**
   * @param {object} data
   * @param {string} data.id
   * @param {string} data.name
   * @param {string} data.role      - one of ROLE_COLORS keys
   * @param {string} data.zoneId    - home zone id
   */
  constructor(data) {
    this.id = data.id;
    this.name = data.name;
    this.role = data.role;
    this.zoneId = data.zoneId;
    this.color = ROLE_COLORS[data.role] || DEFAULT_COLOR;

    // Zone reference
    this.zone = findZone(data.zoneId);
    const center = this.zone ? zoneCenter(this.zone) : { x: 20, y: 20 };

    // Current tile position (fractional for smooth movement)
    this.tileX = center.x;
    this.tileY = center.y;

    // Target tile position (for WALKING state)
    this.targetTileX = this.tileX;
    this.targetTileY = this.tileY;

    // State machine
    this.state = AgentState.IDLE;

    /** Whether the walk destination is a workstation (triggers WORKING on arrival) */
    this._walkToWork = false;

    // Timers
    this._idleTimer = randRange(WANDER_INTERVAL_MIN, WANDER_INTERVAL_MAX);
    this._reportTimer = 0;
    this._stateTime = 0; // total time in current state

    // Animation phase counters
    this._bobPhase = Math.random() * Math.PI * 2; // randomize start
    this._legPhase = 0;
    this._legToggleTime = 0;
    this._glowPhase = 0;

    // ── PixiJS visual objects ────────────────────────────────────
    /** Root container positioned at agent's screen location */
    this.container = new Container();
    this.container.sortableChildren = true;

    /** Graphics for the body */
    this.bodyGfx = new Graphics();
    this.bodyGfx.zIndex = 0;
    this.container.addChild(this.bodyGfx);

    /** Speech bubble (created on demand) */
    this._bubble = null;
    this._bubbleTimer = 0;

    // Initial draw
    drawAgentBody(this.bodyGfx, this.color);
    this._syncPosition();
  }

  // ── Position sync ──────────────────────────────────────────────

  /** Update the container position from tile coords. */
  _syncPosition() {
    const screen = tileToScreen(this.tileX, this.tileY);
    this.container.position.set(screen.x, screen.y);

    // Depth sort: agents further down the screen render on top
    this.container.zIndex = this.tileX + this.tileY;
  }

  // ── State transitions ──────────────────────────────────────────

  /**
   * Transition to a new state, resetting timers appropriately.
   * @param {string} newState
   */
  _setState(newState) {
    this.state = newState;
    this._stateTime = 0;

    switch (newState) {
      case AgentState.IDLE:
        this._idleTimer = randRange(WANDER_INTERVAL_MIN, WANDER_INTERVAL_MAX);
        this._walkToWork = false;
        break;
      case AgentState.REPORTING:
        this._reportTimer = REPORT_DURATION;
        this._showBubble("\u2713"); // checkmark
        break;
      default:
        break;
    }
  }

  // ── Speech bubble management ───────────────────────────────────

  /**
   * Show a speech bubble above the agent.
   * @param {string} text
   */
  _showBubble(text) {
    this._removeBubble();
    this._bubble = createSpeechBubble(text);
    this._bubble.position.set(0, -SPRITE_H - 4);
    this._bubble.zIndex = 10;
    this.container.addChild(this._bubble);
    this._bubbleTimer = REPORT_DURATION;
  }

  /** Remove the speech bubble if present. */
  _removeBubble() {
    if (this._bubble) {
      this.container.removeChild(this._bubble);
      this._bubble.destroy({ children: true });
      this._bubble = null;
      this._bubbleTimer = 0;
    }
  }

  // ── Random wander target within zone bounds ────────────────────

  _pickWanderTarget() {
    if (!this.zone) return;
    const center = zoneCenter(this.zone);
    const dx = Math.round(randRange(-WANDER_RADIUS, WANDER_RADIUS));
    const dy = Math.round(randRange(-WANDER_RADIUS, WANDER_RADIUS));
    this.targetTileX = clamp(
      center.x + dx,
      this.zone.tileX,
      this.zone.tileX + this.zone.w - 1,
    );
    this.targetTileY = clamp(
      center.y + dy,
      this.zone.tileY,
      this.zone.tileY + this.zone.h - 1,
    );
  }

  // ── Per-frame update ───────────────────────────────────────────

  /**
   * Advance state machine and animations by dt seconds.
   * @param {number} dt - delta time in seconds
   */
  update(dt) {
    this._stateTime += dt;

    switch (this.state) {
      case AgentState.IDLE:
        this._updateIdle(dt);
        break;
      case AgentState.WALKING:
        this._updateWalking(dt);
        break;
      case AgentState.WORKING:
        this._updateWorking(dt);
        break;
      case AgentState.REPORTING:
        this._updateReporting(dt);
        break;
    }

    // Fade bubble over time
    if (this._bubble) {
      this._bubbleTimer -= dt;
      if (this._bubbleTimer <= 0) {
        this._removeBubble();
      } else {
        // Fade out in last 0.5s
        const alpha = this._bubbleTimer < 0.5 ? this._bubbleTimer / 0.5 : 1;
        this._bubble.alpha = alpha;
      }
    }

    this._syncPosition();
  }

  // ── IDLE ───────────────────────────────────────────────────────

  _updateIdle(dt) {
    // Gentle bob animation (sine wave, 2px amplitude, 1s period)
    this._bobPhase += dt * Math.PI * 2; // full cycle per second
    const bobY = Math.sin(this._bobPhase) * 2;
    this.bodyGfx.position.set(0, bobY);

    // Redraw static pose
    drawAgentBody(this.bodyGfx, this.color);

    // Countdown to random wander
    this._idleTimer -= dt;
    if (this._idleTimer <= 0) {
      this._pickWanderTarget();
      const dx = this.targetTileX - this.tileX;
      const dy = this.targetTileY - this.tileY;
      if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
        this._walkToWork = false;
        this._setState(AgentState.WALKING);
      } else {
        // Already at target, pick again later
        this._idleTimer = randRange(WANDER_INTERVAL_MIN, WANDER_INTERVAL_MAX);
      }
    }
  }

  // ── WALKING ────────────────────────────────────────────────────

  _updateWalking(dt) {
    const dx = this.targetTileX - this.tileX;
    const dy = this.targetTileY - this.tileY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 0.05) {
      // Arrived
      this.tileX = this.targetTileX;
      this.tileY = this.targetTileY;

      if (this._walkToWork) {
        this._setState(AgentState.WORKING);
      } else {
        this._setState(AgentState.IDLE);
      }
      return;
    }

    // Move toward target at WALK_SPEED tiles/second
    const step = Math.min(WALK_SPEED * dt, dist);
    this.tileX += (dx / dist) * step;
    this.tileY += (dy / dist) * step;

    // Leg animation: toggle every 0.25s
    this._legToggleTime += dt;
    if (this._legToggleTime >= 0.25) {
      this._legToggleTime -= 0.25;
      this._legPhase = this._legPhase === 0 ? 1 : 0;
    }

    // Bob slightly while walking
    this._bobPhase += dt * Math.PI * 4;
    const bobY = Math.sin(this._bobPhase) * 1;
    this.bodyGfx.position.set(0, bobY);

    drawAgentBody(this.bodyGfx, this.color, { legPhase: this._legPhase });
  }

  // ── WORKING ────────────────────────────────────────────────────

  _updateWorking(dt) {
    // Pulsing glow effect
    this._glowPhase += dt * Math.PI * 2; // 1-second glow cycle
    const glow = (Math.sin(this._glowPhase) + 1) / 2; // 0..1

    // Slight scale pulse
    const scale = 1 + glow * 0.05;
    this.bodyGfx.scale.set(scale, scale);

    drawAgentBody(this.bodyGfx, this.color, { glowAlpha: glow });
  }

  // ── REPORTING ──────────────────────────────────────────────────

  _updateReporting(dt) {
    this._reportTimer -= dt;

    // Gentle bob
    this._bobPhase += dt * Math.PI * 2;
    const bobY = Math.sin(this._bobPhase) * 1;
    this.bodyGfx.position.set(0, bobY);

    drawAgentBody(this.bodyGfx, this.color, { handRaised: true });

    if (this._reportTimer <= 0) {
      this._setState(AgentState.IDLE);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────
//  AgentManager
// ─────────────────────────────────────────────────────────────────────

/**
 * Manages all agent sprites and their state machines.
 *
 * Usage:
 *   const mgr = new AgentManager();
 *   worldContainer.addChild(mgr.container); // zIndex = 1.5
 *   mgr.addAgent({ id: 'a1', name: 'Scout', role: 'researcher', zoneId: 'brain' });
 *   // in render loop:
 *   mgr.update(dt);
 */
export class AgentManager {
  constructor() {
    /** Root container — add to worldContainer with zIndex 1.5 */
    this.container = new Container();
    this.container.sortableChildren = true;

    /** @type {Map<string, Agent>} */
    this._agents = new Map();
  }

  // ── Public API ─────────────────────────────────────────────────

  /**
   * Create and register a new agent from DB data.
   *
   * @param {object} agentData
   * @param {string} agentData.id      - unique identifier
   * @param {string} agentData.name    - display name
   * @param {string} agentData.role    - dispatcher | researcher | trainer | memory_keeper | integrator
   * @param {string} agentData.zoneId  - home zone id (must match a ZONE_DEFS entry)
   * @returns {Agent}
   */
  addAgent(agentData) {
    if (this._agents.has(agentData.id)) {
      console.warn(
        `[AgentManager] Agent "${agentData.id}" already exists, skipping.`,
      );
      return this._agents.get(agentData.id);
    }

    const agent = new Agent(agentData);
    this._agents.set(agent.id, agent);
    this.container.addChild(agent.container);

    console.log(
      `[AgentManager] Added agent "${agent.name}" (${agent.role}) in zone "${agent.zoneId}"`,
    );
    return agent;
  }

  /**
   * Update every agent's state machine and animations.
   * Call once per frame from the render loop.
   *
   * @param {number} dt - delta time in seconds
   */
  update(dt) {
    for (const agent of this._agents.values()) {
      agent.update(dt);
    }
  }

  /**
   * Return the agent occupying (or closest to) a given tile, or null.
   * Uses a 0.8-tile radius for hit detection.
   *
   * @param {number} tileX
   * @param {number} tileY
   * @returns {Agent | null}
   */
  getAgentAtTile(tileX, tileY) {
    const HIT_RADIUS = 0.8;
    let closest = null;
    let closestDist = HIT_RADIUS;

    for (const agent of this._agents.values()) {
      const dx = agent.tileX - tileX;
      const dy = agent.tileY - tileY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closest = agent;
      }
    }
    return closest;
  }

  /**
   * Trigger an agent to walk to their zone's workstation tile and begin
   * working.  Transitions: IDLE -> WALKING -> WORKING.
   *
   * If a target tile is provided it overrides the zone center.
   *
   * @param {string} agentId
   * @param {{ tileX?: number, tileY?: number }} [targetTile]
   */
  assignTask(agentId, targetTile) {
    const agent = this._agents.get(agentId);
    if (!agent) {
      console.warn(`[AgentManager] assignTask: unknown agent "${agentId}"`);
      return;
    }

    // Default target is zone center (the "workstation")
    if (targetTile) {
      agent.targetTileX = targetTile.tileX;
      agent.targetTileY = targetTile.tileY;
    } else if (agent.zone) {
      const center = zoneCenter(agent.zone);
      agent.targetTileX = center.x;
      agent.targetTileY = center.y;
    }

    agent._walkToWork = true;
    agent._setState(AgentState.WALKING);
  }

  /**
   * Signal that an agent's task is done.  Transitions: WORKING -> REPORTING -> IDLE.
   *
   * @param {string} agentId
   */
  completeTask(agentId) {
    const agent = this._agents.get(agentId);
    if (!agent) {
      console.warn(`[AgentManager] completeTask: unknown agent "${agentId}"`);
      return;
    }

    // Reset scale from working pulse
    agent.bodyGfx.scale.set(1, 1);

    agent._setState(AgentState.REPORTING);
  }

  /**
   * Retrieve an agent by id.
   * @param {string} id
   * @returns {Agent | undefined}
   */
  getAgent(id) {
    return this._agents.get(id);
  }

  /**
   * Remove an agent from the manager and the stage.
   * @param {string} id
   */
  removeAgent(id) {
    const agent = this._agents.get(id);
    if (!agent) return;
    agent._removeBubble();
    this.container.removeChild(agent.container);
    agent.container.destroy({ children: true });
    this._agents.delete(id);
  }

  /**
   * Return an array of all agent objects (useful for iteration / UI lists).
   * @returns {Agent[]}
   */
  getAllAgents() {
    return Array.from(this._agents.values());
  }
}
