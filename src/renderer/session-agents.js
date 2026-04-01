/**
 * session-agents.js — Rich per-agent sprites for live Claude Code sessions
 *
 * For each detected Claude Code CLI session, reads the agents array and
 * spawns individual sprites with role-specific visuals and activity
 * animations. Agents walk to zones relevant to their current activity.
 *
 * Uses PixiJS v8 Container, Graphics, Text.
 */

import { Container, Graphics, Text } from "pixi.js";
import { ZONE_DEFS } from "./zones.js";
import { tileToScreen } from "./tiles.js";

// ── Constants ────────────────────────────────────────────────────────────

const FADE_DURATION = 2.0;
const SPAWN_BURST_PARTICLES = 10;
const DONE_PARTICLE_COUNT = 6;

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Role config ─────────────────────────────────────────────────────────

const ROLE_CONFIG = {
  main: {
    color: 0x00d4ff,
    bodyW: 14,
    bodyH: 22,
    headR: 7,
    label: "Main",
  },
  coder: {
    color: 0x22c55e,
    bodyW: 12,
    bodyH: 20,
    headR: 6,
    label: "Coder",
  },
  researcher: {
    color: 0x8b5cf6,
    bodyW: 12,
    bodyH: 20,
    headR: 6,
    label: "Researcher",
  },
  explorer: {
    color: 0xf59e0b,
    bodyW: 12,
    bodyH: 20,
    headR: 6,
    label: "Explorer",
  },
  reviewer: {
    color: 0xef4444,
    bodyW: 12,
    bodyH: 20,
    headR: 6,
    label: "Reviewer",
  },
  builder: {
    color: 0x3b82f6,
    bodyW: 12,
    bodyH: 20,
    headR: 6,
    label: "Builder",
  },
};

// ── Activity → zone mapping ─────────────────────────────────────────────

const ACTIVITY_ZONES = {
  reading: ["dispatch", "brain"],
  writing: ["dispatch", "brain"],
  searching: ["globe", "archive"],
  thinking: ["dispatch", "brain"],
  building: ["minions", "skills"],
  testing: ["rnd"],
  idle: ["chat", "memory"],
  chatting: ["chat", "conversations"],
};

// ── Zone helpers ────────────────────────────────────────────────────────

function getZoneCenter(zoneId) {
  const zone = ZONE_DEFS.find((z) => z.id === zoneId);
  if (!zone) {
    const fallback = ZONE_DEFS[0];
    return tileToScreen(
      fallback.tileX + fallback.w / 2,
      fallback.tileY + fallback.h / 2,
    );
  }
  return tileToScreen(zone.tileX + zone.w / 2, zone.tileY + zone.h / 2);
}

function pickZoneForActivity(activity) {
  const zones = ACTIVITY_ZONES[activity] || ACTIVITY_ZONES.idle;
  return zones[Math.floor(Math.random() * zones.length)];
}

// ── Color helpers ───────────────────────────────────────────────────────

function lighten(color, amount) {
  const r = clamp(Math.round(((color >> 16) & 0xff) + 255 * amount), 0, 255);
  const g = clamp(Math.round(((color >> 8) & 0xff) + 255 * amount), 0, 255);
  const b = clamp(Math.round((color & 0xff) + 255 * amount), 0, 255);
  return (r << 16) | (g << 8) | b;
}

// ── SessionSubAgentSprite ───────────────────────────────────────────────

class SessionSubAgentSprite {
  /**
   * @param {object} agentInfo — AgentInfo from claude-sessions
   * @param {object} session   — parent SessionInfo
   * @param {Container} layer
   * @param {number} indexInSession — for offset positioning
   */
  constructor(agentInfo, session, layer, indexInSession) {
    this.id = agentInfo.id;
    this.sessionPid = agentInfo.sessionPid;
    this.role = agentInfo.role || "main";
    this.activity = agentInfo.activity || "idle";
    this.target = agentInfo.target || null;
    this.tool = agentInfo.tool || null;
    this.session = session;
    this.indexInSession = indexInSession;

    this.alive = true;
    this.fadingOut = false;
    this.fadeTimer = 0;
    this.spawnTimer = 0.6;
    this.age = 0;

    const cfg = ROLE_CONFIG[this.role] || ROLE_CONFIG.main;
    this._cfg = cfg;

    // Position near a zone matching activity
    const zone = pickZoneForActivity(this.activity);
    const center = getZoneCenter(zone);
    this.x = center.x + rand(-20, 20) + indexInSession * 18;
    this.y = center.y + rand(-10, 10);

    // Movement
    this.moving = false;
    this.fromX = this.x;
    this.fromY = this.y;
    this.toX = this.x;
    this.toY = this.y;
    this.walkProgress = 0;
    this.walkDuration = 3.0;
    this.wanderTimer = rand(4, 10);
    this.currentZone = zone;

    // PixiJS container
    this.container = new Container();
    this.container.sortableChildren = true;
    this.container.x = this.x;
    this.container.y = this.y;
    this.container.zIndex = 10;
    this.container.eventMode = "static";
    this.container.cursor = "pointer";

    this._buildGraphics();
    layer.addChild(this.container);

    // Particles
    this._particles = [];
    this._spawnBurst();

    // Activity-specific state
    this._activityGfx = new Graphics();
    this._activityGfx.zIndex = 6;
    this.container.addChild(this._activityGfx);

    // Desk for writing activity
    this._deskGfx = null;
  }

  // ── Build ───────────────────────────────────────────────────────────

  _buildGraphics() {
    const cfg = this._cfg;

    // Glow ring
    this._glow = new Graphics();
    this._glow.circle(0, -cfg.bodyH / 2, cfg.bodyW + 6);
    this._glow.fill({ color: cfg.color, alpha: 0.07 });
    this._glow.zIndex = -1;
    this.container.addChild(this._glow);

    // Shadow
    this._shadow = new Graphics();
    this._shadow.ellipse(0, 0, 10, 4);
    this._shadow.fill({ color: 0x000000, alpha: 0.25 });
    this._shadow.zIndex = 0;
    this.container.addChild(this._shadow);

    // Body capsule
    this._body = new Graphics();
    this._body.roundRect(
      -cfg.bodyW / 2,
      -cfg.bodyH,
      cfg.bodyW,
      cfg.bodyH,
      5,
    );
    this._body.fill({ color: cfg.color });
    this._body.roundRect(
      -cfg.bodyW / 2,
      -cfg.bodyH,
      cfg.bodyW,
      cfg.bodyH,
      5,
    );
    this._body.stroke({ color: 0x000000, alpha: 0.3, width: 1 });
    this._body.zIndex = 1;
    this.container.addChild(this._body);

    // Head
    this._head = new Graphics();
    this._head.circle(0, -cfg.bodyH - cfg.headR + 3, cfg.headR);
    this._head.fill({ color: lighten(cfg.color, 0.25) });
    this._head.zIndex = 2;
    this.container.addChild(this._head);

    // Role accessory
    this._accessory = new Graphics();
    this._accessory.zIndex = 3;
    this._drawAccessory();
    this.container.addChild(this._accessory);

    // Name label
    this._label = new Text({
      text: this._getLabelText(),
      style: {
        fontFamily: "monospace",
        fontSize: 7,
        fill: cfg.color,
        align: "center",
        letterSpacing: 0.2,
      },
    });
    this._label.anchor.set(0.5, 0);
    this._label.y = 5;
    this._label.alpha = 0.85;
    this._label.zIndex = 4;
    this.container.addChild(this._label);

    // Activity label
    this._activityLabel = new Text({
      text: this._getActivityText(),
      style: {
        fontFamily: "monospace",
        fontSize: 6,
        fill: 0x999999,
        align: "center",
        letterSpacing: 0.1,
      },
    });
    this._activityLabel.anchor.set(0.5, 0);
    this._activityLabel.y = 14;
    this._activityLabel.alpha = 0.7;
    this._activityLabel.zIndex = 4;
    this.container.addChild(this._activityLabel);
  }

  _getLabelText() {
    const cfg = ROLE_CONFIG[this.role] || ROLE_CONFIG.main;
    return cfg.label;
  }

  _getActivityText() {
    if (!this.target) return this.activity;
    const short =
      this.target.length > 20 ? this.target.slice(0, 20) + ".." : this.target;
    // Extract just the filename from a path
    const parts = short.split("/");
    return `${this.activity} ${parts[parts.length - 1]}`;
  }

  _drawAccessory() {
    this._accessory.clear();
    const cfg = this._cfg;
    const topY = -cfg.bodyH - cfg.headR * 2 + 2;

    switch (this.role) {
      case "main": {
        // Crown/star on head
        const cx = 0;
        const cy = topY - 2;
        // Simple 3-point crown
        this._accessory.moveTo(cx - 4, cy + 3);
        this._accessory.lineTo(cx - 3, cy);
        this._accessory.lineTo(cx, cy + 2);
        this._accessory.lineTo(cx + 3, cy);
        this._accessory.lineTo(cx + 4, cy + 3);
        this._accessory.stroke({ color: 0xffd700, alpha: 0.9, width: 1.2 });
        break;
      }
      case "coder": {
        // Tiny laptop in front
        const lx = cfg.bodyW / 2 + 2;
        const ly = -cfg.bodyH / 2;
        this._accessory.rect(lx, ly, 6, 4);
        this._accessory.fill({ color: 0x333333, alpha: 0.8 });
        this._accessory.rect(lx + 0.5, ly + 0.5, 5, 2.5);
        this._accessory.fill({ color: 0x66ff66, alpha: 0.5 });
        break;
      }
      case "researcher": {
        // Magnifying glass
        const mx = cfg.bodyW / 2 + 1;
        const my = -cfg.bodyH + 4;
        this._accessory.circle(mx + 3, my, 3);
        this._accessory.stroke({ color: 0xdddddd, alpha: 0.8, width: 1 });
        this._accessory.moveTo(mx + 1, my + 2);
        this._accessory.lineTo(mx - 1, my + 5);
        this._accessory.stroke({ color: 0xbbbbbb, alpha: 0.7, width: 1.2 });
        break;
      }
      case "explorer": {
        // Binoculars (two small circles)
        const ex = 0;
        const ey = topY;
        this._accessory.circle(ex - 2, ey + 4, 2);
        this._accessory.fill({ color: 0x444444, alpha: 0.8 });
        this._accessory.circle(ex + 2, ey + 4, 2);
        this._accessory.fill({ color: 0x444444, alpha: 0.8 });
        this._accessory.circle(ex - 2, ey + 4, 1.2);
        this._accessory.fill({ color: 0x88ccff, alpha: 0.5 });
        this._accessory.circle(ex + 2, ey + 4, 1.2);
        this._accessory.fill({ color: 0x88ccff, alpha: 0.5 });
        break;
      }
      case "reviewer": {
        // Clipboard
        const rx = -cfg.bodyW / 2 - 6;
        const ry = -cfg.bodyH + 2;
        this._accessory.rect(rx, ry, 5, 7);
        this._accessory.fill({ color: 0xddddbb, alpha: 0.8 });
        this._accessory.rect(rx + 1, ry + 1, 3, 0.8);
        this._accessory.fill({ color: 0x666666, alpha: 0.5 });
        this._accessory.rect(rx + 1, ry + 2.5, 3, 0.8);
        this._accessory.fill({ color: 0x666666, alpha: 0.5 });
        this._accessory.rect(rx + 1, ry + 4, 2, 0.8);
        this._accessory.fill({ color: 0x666666, alpha: 0.5 });
        break;
      }
      case "builder": {
        // Hammer (T shape)
        const bx = cfg.bodyW / 2 + 2;
        const by = -cfg.bodyH + 6;
        // Handle
        this._accessory.moveTo(bx + 2, by);
        this._accessory.lineTo(bx + 2, by + 6);
        this._accessory.stroke({ color: 0x8b6b3e, alpha: 0.8, width: 1.5 });
        // Head
        this._accessory.rect(bx, by - 1, 4, 2.5);
        this._accessory.fill({ color: 0x888888, alpha: 0.8 });
        break;
      }
    }
  }

  // ── Spawn burst ─────────────────────────────────────────────────────

  _spawnBurst() {
    const cfg = this._cfg;
    for (let i = 0; i < SPAWN_BURST_PARTICLES; i++) {
      const angle = (Math.PI * 2 * i) / SPAWN_BURST_PARTICLES;
      const speed = rand(25, 60);
      this._particles.push({
        x: 0,
        y: -cfg.bodyH / 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color: cfg.color,
        gfx: null,
      });
    }
  }

  _spawnDoneParticles() {
    const cfg = this._cfg;
    for (let i = 0; i < DONE_PARTICLE_COUNT; i++) {
      this._particles.push({
        x: rand(-5, 5),
        y: -cfg.bodyH - cfg.headR,
        vx: rand(-10, 10),
        vy: rand(-30, -10),
        life: 1.0,
        color: 0x22c55e,
        gfx: null,
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
      if (alpha <= 0) this.alive = false;
      this._updateParticles(dt);
      return;
    }

    // Spawn particles
    if (this.spawnTimer > 0) {
      this.spawnTimer -= dt;
      this._updateParticles(dt);
    }

    // Wander / activity zone walk
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0 && !this.moving) {
      const zone = pickZoneForActivity(this.activity);
      const dest = getZoneCenter(zone);
      this.fromX = this.x;
      this.fromY = this.y;
      this.toX = dest.x + rand(-18, 18);
      this.toY = dest.y + rand(-8, 8);
      this.walkProgress = 0;
      this.walkDuration = rand(2.5, 4.5);
      this.moving = true;
      this.currentZone = zone;

      // Activity-specific wander patterns
      if (this.activity === "searching") {
        this.wanderTimer = rand(3, 6); // brisk
      } else if (this.activity === "testing") {
        this.wanderTimer = rand(2, 4); // pacing
        // Pace in small area
        this.toX = this.x + rand(-30, 30);
        this.toY = this.y + rand(-15, 15);
      } else if (this.activity === "idle") {
        this.wanderTimer = rand(10, 18); // slow
      } else {
        this.wanderTimer = rand(5, 12);
      }
    }

    // Walk interpolation
    if (this.moving) {
      this.walkProgress += dt / this.walkDuration;
      if (this.walkProgress >= 1) {
        this.walkProgress = 1;
        this.moving = false;
      }
      const t = this.walkProgress;
      const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      this.x = lerp(this.fromX, this.toX, ease);
      this.y = lerp(this.fromY, this.toY, ease);
    }

    // Walking bob
    const bobAmp = this.moving
      ? this.activity === "searching"
        ? 3
        : 2
      : this.activity === "idle"
        ? 0.8
        : 0;
    const bobFreq = this.moving ? 3.5 : 1.5;
    const bob = Math.sin(this.age * bobFreq * Math.PI * 2) * bobAmp;

    this.container.x = this.x;
    this.container.y = this.y + bob;

    // Pulsing glow
    const glowBase = 0.06;
    const glowPulse = glowBase + Math.sin(this.age * 2.5) * 0.04;
    this._glow.alpha =
      this.activity === "idle" ? glowPulse * 0.5 : glowPulse * 1.5;

    // Activity animation
    this._drawActivityAnimation();

    // Depth sort
    this.container.zIndex = 10 + Math.floor(this.y);
  }

  _drawActivityAnimation() {
    this._activityGfx.clear();
    const cfg = this._cfg;
    const topY = -cfg.bodyH - cfg.headR * 2;

    switch (this.activity) {
      case "reading": {
        // Page particles floating up
        const phase = this.age * 2;
        for (let i = 0; i < 3; i++) {
          const t = ((phase + i * 0.7) % 2) / 2;
          const py = -cfg.bodyH * 0.3 - t * 15;
          const px = Math.sin(t * Math.PI) * 4 - 2;
          const alpha = (1 - t) * 0.5;
          this._activityGfx.rect(px - 1.5, py - 1, 3, 2);
          this._activityGfx.fill({ color: 0xffffff, alpha });
        }
        break;
      }
      case "writing": {
        // Small dots moving near a desk
        const wx = cfg.bodyW / 2 + 3;
        const wy = -3;
        // Desk
        this._activityGfx.rect(wx - 1, wy, 8, 2);
        this._activityGfx.fill({ color: 0x5a4030, alpha: 0.6 });
        // Typing dots
        for (let i = 0; i < 3; i++) {
          const phase = this.age * 6 + i * 1.2;
          const dy = Math.sin(phase) * 1.5;
          this._activityGfx.circle(wx + 1 + i * 2, wy - 1 + dy, 0.7);
          this._activityGfx.fill({ color: cfg.color, alpha: 0.6 });
        }
        break;
      }
      case "searching": {
        // Magnifying glass bobs if researcher
        if (this.role === "researcher" || this.role === "explorer") {
          const bobY = Math.sin(this.age * 3) * 2;
          this._accessory.y = bobY;
        }
        break;
      }
      case "thinking": {
        // Thought bubble with cycling dots
        const bx = cfg.bodyW / 2 + 4;
        const by = topY - 2;
        // Bubble
        this._activityGfx.circle(bx + 5, by, 6);
        this._activityGfx.fill({ color: 0xffffff, alpha: 0.15 });
        this._activityGfx.circle(bx + 5, by, 6);
        this._activityGfx.stroke({ color: 0xffffff, alpha: 0.2, width: 0.5 });
        // Three dots cycling
        for (let i = 0; i < 3; i++) {
          const phase = this.age * 3 + i * 0.6;
          const dotAlpha = 0.3 + Math.sin(phase) * 0.4;
          this._activityGfx.circle(bx + 2 + i * 2.5, by, 1);
          this._activityGfx.fill({
            color: 0xffffff,
            alpha: clamp(dotAlpha, 0.1, 0.8),
          });
        }
        // Small connector bubbles
        this._activityGfx.circle(bx, by + 4, 1.5);
        this._activityGfx.fill({ color: 0xffffff, alpha: 0.12 });
        this._activityGfx.circle(bx - 1, by + 6, 1);
        this._activityGfx.fill({ color: 0xffffff, alpha: 0.08 });
        break;
      }
      case "building": {
        // Sparks flying
        for (let i = 0; i < 4; i++) {
          const phase = this.age * 5 + i * 1.3;
          const t = (phase % 1.5) / 1.5;
          const angle = (i / 4) * Math.PI - Math.PI / 2;
          const dist = t * 10;
          const sx = Math.cos(angle) * dist;
          const sy = -cfg.bodyH * 0.5 + Math.sin(angle) * dist - t * 5;
          const alpha = (1 - t) * 0.7;
          this._activityGfx.circle(sx, sy, 1);
          this._activityGfx.fill({ color: 0xffdd44, alpha });
        }
        break;
      }
      case "testing": {
        // Checkmark/X flashing
        const phase = Math.floor(this.age * 2) % 4;
        const tx = 0;
        const ty = topY - 4;
        if (phase < 3) {
          // Checkmark
          this._activityGfx.moveTo(tx - 3, ty);
          this._activityGfx.lineTo(tx - 1, ty + 2);
          this._activityGfx.lineTo(tx + 3, ty - 2);
          this._activityGfx.stroke({
            color: 0x22c55e,
            alpha: 0.7,
            width: 1.2,
          });
        } else {
          // X mark
          this._activityGfx.moveTo(tx - 2, ty - 2);
          this._activityGfx.lineTo(tx + 2, ty + 2);
          this._activityGfx.moveTo(tx + 2, ty - 2);
          this._activityGfx.lineTo(tx - 2, ty + 2);
          this._activityGfx.stroke({
            color: 0xef4444,
            alpha: 0.7,
            width: 1.2,
          });
        }
        break;
      }
      case "idle": {
        // Gentle breathing bob is already in the main update
        // Draw a small bench
        const bx2 = 6;
        const by2 = -2;
        this._activityGfx.rect(bx2, by2, 10, 2);
        this._activityGfx.fill({ color: 0x5a4030, alpha: 0.4 });
        this._activityGfx.rect(bx2, by2 + 2, 1, 3);
        this._activityGfx.fill({ color: 0x5a4030, alpha: 0.3 });
        this._activityGfx.rect(bx2 + 9, by2 + 2, 1, 3);
        this._activityGfx.fill({ color: 0x5a4030, alpha: 0.3 });
        break;
      }
      case "chatting": {
        // Speech arcs emanating
        for (let i = 0; i < 3; i++) {
          const phase = this.age * 2 + i * 0.8;
          const t = (phase % 2) / 2;
          const radius = 4 + t * 8;
          const alpha = (1 - t) * 0.3;
          const startAngle = -Math.PI / 3;
          const endAngle = Math.PI / 6;
          this._activityGfx.arc(
            cfg.bodyW / 2 + 2,
            -cfg.bodyH,
            radius,
            startAngle,
            endAngle,
          );
          this._activityGfx.stroke({ color: 0xffffff, alpha, width: 0.8 });
        }
        break;
      }
    }
  }

  _updateParticles(dt) {
    for (const p of this._particles) {
      p.life -= dt * 2;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt;

      if (!p.gfx) {
        p.gfx = new Graphics();
        p.gfx.circle(0, 0, 1.5);
        p.gfx.fill({ color: p.color, alpha: 0.7 });
        p.gfx.zIndex = 7;
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

  // ── External API ──────────────────────────────────────────────────

  updateFromInfo(agentInfo, session) {
    this.session = session;
    const newActivity = agentInfo.activity || "idle";
    const newRole = agentInfo.role || this.role;
    this.target = agentInfo.target || this.target;
    this.tool = agentInfo.tool || this.tool;

    if (newActivity !== this.activity) {
      this.activity = newActivity;
      this._activityLabel.text = this._getActivityText();
      // Walk to new zone for the activity
      this.wanderTimer = rand(0.5, 2);
    }

    if (newRole !== this.role) {
      this.role = newRole;
      this._cfg = ROLE_CONFIG[this.role] || ROLE_CONFIG.main;
      this._label.text = this._getLabelText();
    }
  }

  startFadeOut() {
    this.fadingOut = true;
    this.fadeTimer = 0;
    this._spawnDoneParticles();
  }

  destroy() {
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

  /** Hit test for tooltip. */
  containsPoint(globalX, globalY) {
    const bounds = this.container.getBounds();
    return bounds.contains(globalX, globalY);
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

    /** @type {Map<string, SessionSubAgentSprite>} agentId → sprite */
    this._agents = new Map();

    this._layer = new Container();
    this._layer.sortableChildren = true;
    this._layer.zIndex = 2;
    this._worldContainer.addChild(this._layer);

    // Session connector lines
    this._lineGfx = new Graphics();
    this._lineGfx.zIndex = -1;
    this._layer.addChild(this._lineGfx);

    this._tick = this._tick.bind(this);
    this._started = false;

    // Tooltip state
    this._tooltip = null;
    this._hoveredAgent = null;
    this._setupTooltip();
  }

  start() {
    if (this._started) return;
    this._app.ticker.add(this._tick);
    this._started = true;
    console.log("[SessionAgents] Started (multi-agent mode)");
  }

  /**
   * Update from a new list of sessions (from IPC).
   * Each session now contains an agents[] array.
   * @param {Array} sessions
   */
  updateSessions(sessions) {
    const activeIds = new Set();

    for (const session of sessions) {
      const agents = session.agents || [];

      // If no agents array (legacy), create one from session
      if (agents.length === 0) {
        agents.push({
          id: `session-${session.pid}-agent-0`,
          sessionPid: session.pid,
          role: "main",
          activity:
            session.status === "streaming"
              ? "thinking"
              : session.status === "active"
                ? "chatting"
                : "idle",
          target: session.task || null,
          tool: null,
        });
      }

      for (let i = 0; i < agents.length; i++) {
        const agentInfo = agents[i];
        const id = agentInfo.id;
        activeIds.add(id);

        if (this._agents.has(id)) {
          this._agents.get(id).updateFromInfo(agentInfo, session);
        } else {
          const sprite = new SessionSubAgentSprite(
            agentInfo,
            session,
            this._layer,
            i,
          );
          this._agents.set(id, sprite);
        }
      }
    }

    // Fade out removed agents
    for (const [id, agent] of this._agents) {
      if (!activeIds.has(id) && !agent.fadingOut) {
        agent.startFadeOut();
      }
    }
  }

  update(dt) {
    // Update all agents
    for (const [id, agent] of this._agents) {
      agent.update(dt);
      if (!agent.alive) {
        agent.destroy();
        this._agents.delete(id);
      }
    }

    // Draw session connector lines
    this._drawSessionLines();

    // Update tooltip position
    this._updateTooltipPosition();
  }

  _drawSessionLines() {
    this._lineGfx.clear();

    // Group agents by session PID
    const bySession = new Map();
    for (const agent of this._agents.values()) {
      if (agent.fadingOut) continue;
      const pid = agent.sessionPid;
      if (!bySession.has(pid)) bySession.set(pid, []);
      bySession.get(pid).push(agent);
    }

    // Draw faint lines between agents of the same session
    for (const agents of bySession.values()) {
      if (agents.length < 2) continue;
      const color = (ROLE_CONFIG[agents[0].role] || ROLE_CONFIG.main).color;
      for (let i = 1; i < agents.length; i++) {
        const a = agents[0];
        const b = agents[i];
        this._lineGfx.moveTo(a.x, a.y - 5);
        this._lineGfx.lineTo(b.x, b.y - 5);
        this._lineGfx.stroke({ color, alpha: 0.08, width: 0.8 });
      }
    }
  }

  // ── Tooltip ───────────────────────────────────────────────────────

  _setupTooltip() {
    // Create DOM tooltip element
    const tip = document.createElement("div");
    tip.id = "session-agent-tooltip";
    tip.style.cssText = `
      position: fixed;
      display: none;
      pointer-events: none;
      z-index: 9999;
      background: rgba(15, 15, 25, 0.92);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px;
      padding: 8px 12px;
      font-family: monospace;
      font-size: 11px;
      color: #e0e0e0;
      max-width: 280px;
      backdrop-filter: blur(6px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.4);
      line-height: 1.5;
    `;
    document.body.appendChild(tip);
    this._tooltip = tip;

    // Track mouse for hover detection
    this._mouseX = 0;
    this._mouseY = 0;
    const canvas = this._app.canvas;
    if (canvas) {
      canvas.addEventListener("mousemove", (e) => {
        this._mouseX = e.clientX;
        this._mouseY = e.clientY;
        this._checkHover(e);
      });
      canvas.addEventListener("mouseleave", () => {
        this._hideTooltip();
      });
    }
  }

  _checkHover(e) {
    // Convert client coords to global pixi coords
    const rect = this._app.canvas.getBoundingClientRect();
    const globalX = e.clientX - rect.left;
    const globalY = e.clientY - rect.top;

    let found = null;
    for (const agent of this._agents.values()) {
      if (agent.fadingOut) continue;
      if (agent.containsPoint(globalX, globalY)) {
        found = agent;
        break;
      }
    }

    if (found && found !== this._hoveredAgent) {
      this._hoveredAgent = found;
      this._showTooltip(found);
    } else if (!found && this._hoveredAgent) {
      this._hoveredAgent = null;
      this._hideTooltip();
    }
  }

  _showTooltip(agent) {
    if (!this._tooltip) return;
    const cfg = ROLE_CONFIG[agent.role] || ROLE_CONFIG.main;
    const colorHex = "#" + cfg.color.toString(16).padStart(6, "0");
    const session = agent.session || {};
    const cwd = session.cwd || "unknown";
    const cwdShort =
      cwd.length > 40 ? "..." + cwd.slice(-37) : cwd;
    const target = agent.target || "none";
    const targetShort =
      target.length > 40 ? "..." + target.slice(-37) : target;

    this._tooltip.innerHTML = `
      <div style="color:${colorHex};font-weight:bold;margin-bottom:4px;">
        ${cfg.label} Agent
        <span style="color:#666;font-weight:normal;font-size:10px;">
          PID ${agent.sessionPid}
        </span>
      </div>
      <div style="color:#aaa;font-size:10px;margin-bottom:3px;">
        ${cwdShort}
      </div>
      <div>
        <span style="color:${colorHex};">${agent.role}</span>
        &middot;
        <span style="color:#ddd;">${agent.activity}</span>
      </div>
      <div style="color:#888;font-size:10px;">
        Tool: ${agent.tool || "none"} &middot; Target: ${targetShort}
      </div>
      <div style="color:#555;font-size:10px;margin-top:3px;">
        CPU ${session.cpu?.toFixed(1) || "?"}%
        &middot; MEM ${session.mem?.toFixed(1) || "?"}%
      </div>
    `;
    this._tooltip.style.display = "block";
  }

  _updateTooltipPosition() {
    if (!this._tooltip || this._tooltip.style.display === "none") return;
    this._tooltip.style.left = this._mouseX + 14 + "px";
    this._tooltip.style.top = this._mouseY - 10 + "px";
  }

  _hideTooltip() {
    if (this._tooltip) this._tooltip.style.display = "none";
  }

  destroy() {
    if (this._started) {
      this._app.ticker.remove(this._tick);
      this._started = false;
    }
    for (const agent of this._agents.values()) {
      agent.destroy();
    }
    this._agents.clear();
    if (this._layer.parent) {
      this._layer.parent.removeChild(this._layer);
    }
    this._layer.destroy({ children: true });
    if (this._tooltip?.parentNode) {
      this._tooltip.parentNode.removeChild(this._tooltip);
    }
    console.log("[SessionAgents] Destroyed");
  }

  /** @param {import('pixi.js').Ticker} ticker */
  _tick(ticker) {
    const dt = ticker.deltaMS / 1000;
    this.update(dt);
  }
}
