/**
 * session-agents.js — Live Claude Code session sprites on the isometric map
 *
 * For each detected Claude Code CLI session, spawns a special agent sprite
 * that is larger, cyan-colored, with a pulsing glow. Sessions walk between
 * the Dispatch Tower and zones. When sessions end, agents fade out.
 * When new sessions start, agents materialize with a particle burst.
 *
 * Uses PixiJS v8 Container, Graphics, Text.
 */

import { Container, Graphics, Text } from "pixi.js";
import { ZONE_DEFS } from "./zones.js";
import { tileToScreen } from "./tiles.js";

// ── Constants ────────────────────────────────────────────────────────────

const BODY_W = 16;
const BODY_H = 24;
const HEAD_RADIUS = 8;
const SHADOW_RX = 13;
const SHADOW_RY = 5;
const STATUS_R = 4;

const AGENT_COLOR = 0x00d4ff;
const AGENT_COLOR_LIGHT = 0x66e8ff;
const GLOW_COLOR = 0x00d4ff;
const STREAMING_COLOR = 0x00ff88;

const LERP_SPEED = 0.02;
const BOB_AMPLITUDE = 2.5;
const BOB_FREQUENCY = 3.0;

const FADE_DURATION = 2.0; // seconds
const SPAWN_BURST_PARTICLES = 12;

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Find dispatch tower center ───────────────────────────────────────────

function getDispatchCenter() {
  const dispatch = ZONE_DEFS.find((z) => z.id === "dispatch") || ZONE_DEFS[0];
  return tileToScreen(
    dispatch.tileX + dispatch.w / 2,
    dispatch.tileY + dispatch.h / 2,
  );
}

function getZoneCenter(zoneId) {
  const zone = ZONE_DEFS.find((z) => z.id === zoneId);
  if (!zone) return getDispatchCenter();
  return tileToScreen(zone.tileX + zone.w / 2, zone.tileY + zone.h / 2);
}

/** Pick a zone for a session based on its working directory. */
function pickZoneForSession(session) {
  const cwd = (session.cwd || "").toLowerCase();
  if (cwd.includes("test")) return "rnd";
  if (cwd.includes("doc")) return "brain";
  if (cwd.includes("deploy") || cwd.includes("ci")) return "airport";
  if (cwd.includes("api") || cwd.includes("server")) return "docks";
  if (cwd.includes("ui") || cwd.includes("frontend") || cwd.includes("web"))
    return "marketing";
  // Default: wander near dispatch
  const zones = ["dispatch", "brain", "memory", "skills", "chat"];
  return zones[Math.floor(Math.random() * zones.length)];
}

// ── SessionAgentSprite ───────────────────────────────────────────────────

class SessionAgentSprite {
  /**
   * @param {object} session — SessionInfo from claude-sessions
   * @param {Container} worldContainer
   */
  constructor(session, worldContainer) {
    this.pid = session.pid;
    this.session = session;
    this.status = session.status || "idle";
    this.alive = true;
    this.fadingOut = false;
    this.fadeTimer = 0;
    this.spawnTimer = 0.5; // spawn burst period
    this.age = 0;

    // Position near dispatch
    const home = getDispatchCenter();
    this.x = home.x + rand(-20, 20);
    this.y = home.y + rand(-10, 10);

    // Movement
    this.moving = false;
    this.fromX = this.x;
    this.fromY = this.y;
    this.toX = this.x;
    this.toY = this.y;
    this.walkProgress = 0;
    this.walkDuration = 3.0;
    this.wanderTimer = rand(3, 8);
    this.homeZone = pickZoneForSession(session);
    this.atDispatch = true;

    // PixiJS container
    this.container = new Container();
    this.container.sortableChildren = true;
    this.container.x = this.x;
    this.container.y = this.y;
    this.container.zIndex = 10; // above default agents

    this._buildGraphics(session);
    worldContainer.addChild(this.container);

    // Particle burst
    this._particles = [];
    this._spawnBurst();
  }

  _buildGraphics(session) {
    // Glow ring
    this._glow = new Graphics();
    this._glow.circle(0, -BODY_H / 2, BODY_W + 8);
    this._glow.fill({ color: GLOW_COLOR, alpha: 0.08 });
    this._glow.zIndex = -1;
    this.container.addChild(this._glow);

    // Shadow
    this._shadow = new Graphics();
    this._shadow.ellipse(0, 0, SHADOW_RX, SHADOW_RY);
    this._shadow.fill({ color: 0x000000, alpha: 0.3 });
    this._shadow.zIndex = 0;
    this.container.addChild(this._shadow);

    // Body — larger rounded rect
    this._body = new Graphics();
    this._body.roundRect(-BODY_W / 2, -BODY_H, BODY_W, BODY_H, 5);
    this._body.fill({ color: AGENT_COLOR });
    this._body.roundRect(-BODY_W / 2, -BODY_H, BODY_W, BODY_H, 5);
    this._body.stroke({ color: 0x000000, alpha: 0.3, width: 1 });
    this._body.zIndex = 1;
    this.container.addChild(this._body);

    // Head
    this._head = new Graphics();
    this._head.circle(0, -BODY_H - HEAD_RADIUS + 3, HEAD_RADIUS);
    this._head.fill({ color: AGENT_COLOR_LIGHT });
    this._head.zIndex = 2;
    this.container.addChild(this._head);

    // Status dot
    this._statusDot = new Graphics();
    this._drawStatusDot();
    this._statusDot.zIndex = 3;
    this.container.addChild(this._statusDot);

    // Label: "Claude" + truncated cwd
    const cwdShort = this._shortDir(session.cwd);
    this._label = new Text({
      text: `Claude ${cwdShort}`,
      style: {
        fontFamily: "monospace",
        fontSize: 8,
        fill: 0x00d4ff,
        align: "center",
        letterSpacing: 0.2,
      },
    });
    this._label.anchor.set(0.5, 0);
    this._label.y = 6;
    this._label.alpha = 0.85;
    this._label.zIndex = 4;
    this.container.addChild(this._label);

    // Streaming indicator dots
    this._streamDots = new Graphics();
    this._streamDots.zIndex = 5;
    this._streamDots.visible = this.status === "streaming";
    this.container.addChild(this._streamDots);
  }

  _shortDir(cwd) {
    if (!cwd) return "";
    const parts = cwd.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    return last.length > 12 ? last.slice(0, 12) + ".." : last;
  }

  _drawStatusDot() {
    this._statusDot.clear();
    const colors = {
      active: 0x22c55e,
      streaming: 0x00ff88,
      idle: 0x9ca3af,
    };
    const color = colors[this.status] || colors.idle;
    const dotX = HEAD_RADIUS;
    const dotY = -BODY_H - HEAD_RADIUS * 2 + 5;
    this._statusDot.circle(dotX, dotY, STATUS_R);
    this._statusDot.fill({ color });
    this._statusDot.circle(dotX, dotY, STATUS_R);
    this._statusDot.stroke({ color: 0x000000, alpha: 0.4, width: 0.5 });
  }

  _spawnBurst() {
    for (let i = 0; i < SPAWN_BURST_PARTICLES; i++) {
      const angle = (Math.PI * 2 * i) / SPAWN_BURST_PARTICLES;
      const speed = rand(30, 80);
      this._particles.push({
        x: 0,
        y: -BODY_H / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        gfx: null, // created on first draw
      });
    }
  }

  // ── Update ──────────────────────────────────────────────────────────

  update(dt) {
    this.age += dt;

    // Fade out
    if (this.fadingOut) {
      this.fadeTimer += dt;
      const alpha = clamp(1 - this.fadeTimer / FADE_DURATION, 0, 1);
      this.container.alpha = alpha;
      if (alpha <= 0) {
        this.alive = false;
      }
      return;
    }

    // Spawn burst particles
    if (this.spawnTimer > 0) {
      this.spawnTimer -= dt;
      this._updateParticles(dt);
    }

    // Wander logic
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0 && !this.moving) {
      // Alternate between dispatch and home zone
      const targetZone = this.atDispatch ? this.homeZone : "dispatch";
      const dest = getZoneCenter(targetZone);
      this.fromX = this.x;
      this.fromY = this.y;
      this.toX = dest.x + rand(-16, 16);
      this.toY = dest.y + rand(-8, 8);
      this.walkProgress = 0;
      this.walkDuration = rand(2.5, 4.0);
      this.moving = true;
      this.atDispatch = !this.atDispatch;
      this.wanderTimer = rand(5, 12);
    }

    // Walk interpolation
    if (this.moving) {
      this.walkProgress += dt / this.walkDuration;
      if (this.walkProgress >= 1) {
        this.walkProgress = 1;
        this.moving = false;
      }
      const t = this.walkProgress;
      // Smooth ease in-out
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this.x = lerp(this.fromX, this.toX, ease);
      this.y = lerp(this.fromY, this.toY, ease);
    }

    // Walking bob
    const bob = this.moving
      ? Math.sin(this.age * BOB_FREQUENCY * Math.PI * 2) * BOB_AMPLITUDE
      : 0;

    this.container.x = this.x;
    this.container.y = this.y + bob;

    // Pulsing glow
    const glowPulse = 0.06 + Math.sin(this.age * 2) * 0.03;
    this._glow.alpha = this.status === "streaming" ? glowPulse * 2 : glowPulse;

    // Streaming dots animation
    this._streamDots.visible = this.status === "streaming";
    if (this.status === "streaming") {
      this._drawStreamDots();
    }

    // Sort by y for depth
    this.container.zIndex = 10 + Math.floor(this.y);
  }

  _updateParticles(dt) {
    for (const p of this._particles) {
      p.life -= dt * 2;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt; // gravity

      if (!p.gfx) {
        p.gfx = new Graphics();
        p.gfx.circle(0, 0, 2);
        p.gfx.fill({ color: AGENT_COLOR, alpha: 0.8 });
        p.gfx.zIndex = 6;
        this.container.addChild(p.gfx);
      }

      p.gfx.x = p.x;
      p.gfx.y = p.y;
      p.gfx.alpha = clamp(p.life, 0, 1);

      if (p.life <= 0 && p.gfx.parent) {
        this.container.removeChild(p.gfx);
        p.gfx.destroy();
        p.gfx = null;
      }
    }

    this._particles = this._particles.filter((p) => p.life > 0);
  }

  _drawStreamDots() {
    this._streamDots.clear();
    const baseY = -BODY_H - HEAD_RADIUS * 2 - 4;
    for (let i = 0; i < 3; i++) {
      const phase = this.age * 4 + i * 0.5;
      const alpha = 0.3 + Math.sin(phase) * 0.5;
      const dotY = baseY - Math.abs(Math.sin(phase)) * 4;
      this._streamDots.circle(-4 + i * 4, dotY, 1.5);
      this._streamDots.fill({
        color: STREAMING_COLOR,
        alpha: clamp(alpha, 0.1, 1),
      });
    }
  }

  // ── External API ──────────────────────────────────────────────────

  updateSession(session) {
    this.session = session;
    const newStatus = session.status || "idle";
    if (newStatus !== this.status) {
      this.status = newStatus;
      this._drawStatusDot();
    }
  }

  startFadeOut() {
    this.fadingOut = true;
    this.fadeTimer = 0;
  }

  destroy() {
    // Clean up particles
    for (const p of this._particles) {
      if (p.gfx?.parent) {
        this.container.removeChild(p.gfx);
        p.gfx.destroy();
      }
    }
    this._particles = [];

    if (this.container.parent) {
      this.container.parent.removeChild(this.container);
    }
    this.container.destroy({ children: true });
  }
}

// ── SessionAgents system ─────────────────────────────────────────────────

export class SessionAgents {
  /**
   * @param {import('pixi.js').Application} app
   * @param {Container} worldContainer
   */
  constructor(app, worldContainer) {
    this._app = app;
    this._worldContainer = worldContainer;
    /** @type {Map<number, SessionAgentSprite>} */
    this._agents = new Map();
    this._tick = this._tick.bind(this);
    this._started = false;
  }

  /**
   * Start the ticker.
   */
  start() {
    if (this._started) return;
    this._app.ticker.add(this._tick);
    this._started = true;
    console.log("[SessionAgents] Started");
  }

  /**
   * Update from a new list of sessions (from IPC).
   * Spawns new agents, removes ended ones.
   * @param {Array} sessions
   */
  updateSessions(sessions) {
    const activePids = new Set(sessions.map((s) => s.pid));

    // Fade out agents for ended sessions
    for (const [pid, agent] of this._agents) {
      if (!activePids.has(pid) && !agent.fadingOut) {
        agent.startFadeOut();
      }
    }

    // Spawn new agents for new sessions
    for (const session of sessions) {
      if (this._agents.has(session.pid)) {
        // Update existing
        this._agents.get(session.pid).updateSession(session);
      } else {
        // New session — spawn
        const sprite = new SessionAgentSprite(session, this._worldContainer);
        this._agents.set(session.pid, sprite);
      }
    }
  }

  /**
   * Per-frame update (called by PixiJS ticker).
   * @param {number} dt — delta time in seconds
   */
  update(dt) {
    for (const [pid, agent] of this._agents) {
      agent.update(dt);
      // Remove dead agents
      if (!agent.alive) {
        agent.destroy();
        this._agents.delete(pid);
      }
    }
  }

  /**
   * Tear down everything.
   */
  destroy() {
    if (this._started) {
      this._app.ticker.remove(this._tick);
      this._started = false;
    }
    for (const agent of this._agents.values()) {
      agent.destroy();
    }
    this._agents.clear();
    console.log("[SessionAgents] Destroyed");
  }

  // ── Private ────────────────────────────────────────────────────────

  /**
   * @param {import('pixi.js').Ticker} ticker
   */
  _tick(ticker) {
    const dt = ticker.deltaMS / 1000;
    this.update(dt);
  }
}
