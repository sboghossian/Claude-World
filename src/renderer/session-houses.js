/**
 * session-houses.js — Per-session "house" buildings for Claude World
 *
 * Each active Claude Code session gets its own house on the map.
 * Houses show agents working inside at different zoom levels:
 *   < 1.5x  — glowing building outline with session label + agent count badge
 *   1.5-2.5x — transparent building, small agent dots around desks
 *   > 2.5x  — full detail: role icons, activity animations, names, work targets
 *
 * Replaces the session-agents free-roaming visual with a building-centric view.
 */

import { Container, Graphics, Text } from "pixi.js";
import { TILE_WIDTH, TILE_HEIGHT, HEIGHT_UNIT_PX } from "./constants.js";
import { ZONE_DEFS } from "./zones.js";
import { tileToScreen } from "./tiles.js";

// ── Constants ──────────────────────────────────────────────────────────────

const HOUSE_WIDTH_TILES = 3;
const HOUSE_HEIGHT_TILES = 3;
const HOUSE_HEIGHT_UNITS = 3;
const FADE_IN_DURATION = 1.5;
const FADE_OUT_DURATION = 2.0;
const ZOOM_CLOSE = 2.5;
const ZOOM_MED = 1.5;

const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── Role palette ───────────────────────────────────────────────────────────

const ROLE_PALETTE = {
  main:       { color: 0x00d4ff, icon: "crown",   label: "Main" },
  coder:      { color: 0x22c55e, icon: "laptop",  label: "Coder" },
  researcher: { color: 0x8b5cf6, icon: "search",  label: "Researcher" },
  explorer:   { color: 0xf59e0b, icon: "radar",   label: "Explorer" },
  reviewer:   { color: 0xef4444, icon: "check",   label: "Reviewer" },
  builder:    { color: 0x3b82f6, icon: "gear",    label: "Builder" },
};

// ── House palette ──────────────────────────────────────────────────────────

const HOUSE_PALETTE = {
  top:   0x2a4a6a,
  left:  0x1e3850,
  right: 0x162c40,
  glow:  0x00d4ff,
  desk:  0x5a4030,
  monitor: 0x222222,
  monitorScreen: 0x1a3a1a,
  floor: 0x1a1a28,
};

// ── Placement tiles near Dispatch Tower (center at 22,22) ──────────────────

const PLACEMENT_SLOTS = [
  { tileX: 20, tileY: 26 },
  { tileX: 24, tileY: 26 },
  { tileX: 17, tileY: 20 },
  { tileX: 26, tileY: 18 },
  { tileX: 17, tileY: 24 },
  { tileX: 26, tileY: 22 },
  { tileX: 20, tileY: 14 },
  { tileX: 24, tileY: 14 },
];

/**
 * Check if a tile slot overlaps any existing zone building.
 * @param {number} tx
 * @param {number} ty
 * @param {number} w
 * @param {number} h
 * @returns {boolean}
 */
function slotOverlapsZone(tx, ty, w, h) {
  for (const z of ZONE_DEFS) {
    const overlapX = tx < z.tileX + z.w && tx + w > z.tileX;
    const overlapY = ty < z.tileY + z.h && ty + h > z.tileY;
    if (overlapX && overlapY) return true;
  }
  return false;
}

/**
 * Get non-overlapping placement slots.
 * @returns {{ tileX: number, tileY: number }[]}
 */
function getAvailableSlots() {
  return PLACEMENT_SLOTS.filter(
    (s) => !slotOverlapsZone(s.tileX, s.tileY, HOUSE_WIDTH_TILES, HOUSE_HEIGHT_TILES),
  );
}

// ── Interior agent seat layout (relative offsets inside house) ─────────────

function getSeatPositions(agentCount) {
  const hw = TILE_WIDTH / 2;
  const hh = TILE_HEIGHT / 4;
  // Center of house footprint
  const cx = (HOUSE_WIDTH_TILES - HOUSE_HEIGHT_TILES) * hw * 0.5;
  const cy = (HOUSE_WIDTH_TILES + HOUSE_HEIGHT_TILES) * hh * 0.5;
  // Head of table (main agent)
  const seats = [{ x: cx, y: cy - 14 }];
  // Around a central table
  const offsets = [
    { x: cx - 16, y: cy - 6 },
    { x: cx + 16, y: cy - 6 },
    { x: cx - 10, y: cy + 4 },
    { x: cx + 10, y: cy + 4 },
    { x: cx,      y: cy + 10 },
    { x: cx - 18, y: cy + 10 },
    { x: cx + 18, y: cy + 10 },
  ];
  for (let i = 1; i < agentCount && i <= offsets.length; i++) {
    seats.push(offsets[i - 1]);
  }
  return seats;
}

// ── HouseAgent — single agent inside a house ──────────────────────────────

class HouseAgent {
  /**
   * @param {object} info — agent info from session
   * @param {{ x: number, y: number }} seat — local position in house
   * @param {Container} parent
   */
  constructor(info, seat, parent) {
    this.id = info.id;
    this.sessionPid = info.sessionPid;
    this.role = info.role || "main";
    this.activity = info.activity || "idle";
    this.target = info.target || null;
    this.tool = info.tool || null;
    this.toolCalls = [];
    this.tokens = info.tokens || 0;
    this.elapsed = info.elapsed || 0;

    this.seatX = seat.x;
    this.seatY = seat.y;
    this.age = 0;

    const pal = ROLE_PALETTE[this.role] || ROLE_PALETTE.main;
    this._color = pal.color;
    this._label = pal.label;

    this.container = new Container();
    this.container.position.set(seat.x, seat.y);
    this.container.sortableChildren = true;
    this.container.eventMode = "static";
    this.container.cursor = "pointer";
    parent.addChild(this.container);

    this._gfx = new Graphics();
    this._gfx.zIndex = 2;
    this.container.addChild(this._gfx);

    this._actGfx = new Graphics();
    this._actGfx.zIndex = 3;
    this.container.addChild(this._actGfx);

    this._nameLabel = null;
    this._actLabel = null;
  }

  updateFromInfo(info) {
    const newActivity = info.activity || "idle";
    if (newActivity !== this.activity) {
      // Record tool call for feed
      if (info.tool && info.target) {
        this.toolCalls.unshift({
          tool: info.tool,
          target: info.target,
          time: Date.now(),
        });
        if (this.toolCalls.length > 20) this.toolCalls.pop();
      }
    }
    this.activity = newActivity;
    this.target = info.target || this.target;
    this.tool = info.tool || this.tool;
    this.role = info.role || this.role;
    this.tokens = info.tokens || this.tokens;
    this.elapsed = info.elapsed || this.elapsed;
    this._color = (ROLE_PALETTE[this.role] || ROLE_PALETTE.main).color;
    this._label = (ROLE_PALETTE[this.role] || ROLE_PALETTE.main).label;
  }

  /**
   * Draw the agent at the given zoom detail level.
   * @param {number} zoom
   * @param {number} dt
   */
  draw(zoom, dt) {
    this.age += dt;
    this._gfx.clear();
    this._actGfx.clear();

    if (zoom < ZOOM_MED) {
      // Dot only
      this._gfx.circle(0, 0, 3);
      this._gfx.fill({ color: this._color, alpha: 0.8 });
      this._removeLabels();
      return;
    }

    if (zoom < ZOOM_CLOSE) {
      // Small dot with color + tiny workstation
      this._drawWorkstation(false);
      this._gfx.circle(0, -6, 4);
      this._gfx.fill({ color: this._color, alpha: 0.9 });
      this._removeLabels();
      return;
    }

    // Full detail
    this._drawWorkstation(true);
    this._drawAgentBody();
    this._drawActivityIndicator();
    this._ensureLabels();
  }

  _drawWorkstation(detailed) {
    // Monitor
    this._gfx.rect(-5, -16, 10, 7);
    this._gfx.fill({ color: HOUSE_PALETTE.monitor, alpha: 0.9 });
    this._gfx.rect(-4, -15, 8, 5);
    this._gfx.fill({ color: HOUSE_PALETTE.monitorScreen, alpha: 0.8 });
    // Monitor stand
    this._gfx.rect(-1, -9, 2, 2);
    this._gfx.fill({ color: HOUSE_PALETTE.monitor, alpha: 0.7 });
    // Desk surface
    this._gfx.rect(-8, -7, 16, 3);
    this._gfx.fill({ color: HOUSE_PALETTE.desk, alpha: 0.7 });

    if (detailed && this.activity === "writing") {
      // Animated code lines on monitor
      for (let i = 0; i < 3; i++) {
        const lineW = 3 + Math.sin(this.age * 4 + i * 1.5) * 2;
        const alpha = 0.4 + Math.sin(this.age * 3 + i) * 0.2;
        this._gfx.rect(-3, -14 + i * 1.8, lineW, 1);
        this._gfx.fill({ color: this._color, alpha });
      }
    }
  }

  _drawAgentBody() {
    // Body
    this._gfx.roundRect(-5, -4, 10, 12, 3);
    this._gfx.fill({ color: this._color, alpha: 0.9 });
    this._gfx.roundRect(-5, -4, 10, 12, 3);
    this._gfx.stroke({ color: 0x000000, alpha: 0.2, width: 0.5 });
    // Head
    const headY = -8;
    this._gfx.circle(0, headY, 4);
    this._gfx.fill({ color: lighten(this._color, 0.2), alpha: 0.95 });
    // Role icon above head
    this._drawRoleIcon(0, headY - 7);
  }

  _drawRoleIcon(x, y) {
    const pal = ROLE_PALETTE[this.role] || ROLE_PALETTE.main;
    switch (pal.icon) {
      case "crown":
        this._gfx.moveTo(x - 3, y + 2);
        this._gfx.lineTo(x - 2, y);
        this._gfx.lineTo(x, y + 1.5);
        this._gfx.lineTo(x + 2, y);
        this._gfx.lineTo(x + 3, y + 2);
        this._gfx.stroke({ color: 0xffd700, alpha: 0.9, width: 1 });
        break;
      case "laptop":
        this._gfx.rect(x - 2.5, y, 5, 3);
        this._gfx.fill({ color: 0x333333, alpha: 0.8 });
        this._gfx.rect(x - 2, y + 0.3, 4, 2);
        this._gfx.fill({ color: 0x66ff66, alpha: 0.4 });
        break;
      case "search":
        this._gfx.circle(x + 1, y, 2.5);
        this._gfx.stroke({ color: 0xdddddd, alpha: 0.7, width: 0.8 });
        this._gfx.moveTo(x - 0.5, y + 1.5);
        this._gfx.lineTo(x - 2, y + 3.5);
        this._gfx.stroke({ color: 0xbbbbbb, alpha: 0.6, width: 1 });
        break;
      case "radar":
        this._gfx.circle(x, y + 1, 3);
        this._gfx.stroke({ color: this._color, alpha: 0.4, width: 0.6 });
        // Sweep line
        {
          const angle = this.age * 3;
          const sx = Math.cos(angle) * 3;
          const sy = Math.sin(angle) * 3;
          this._gfx.moveTo(x, y + 1);
          this._gfx.lineTo(x + sx, y + 1 + sy);
          this._gfx.stroke({ color: this._color, alpha: 0.7, width: 1 });
        }
        break;
      case "gear":
        {
          const teeth = 6;
          const r1 = 2.5, r2 = 3.5;
          const angleOff = this.age * 2;
          for (let i = 0; i < teeth; i++) {
            const a1 = angleOff + (Math.PI * 2 * i) / teeth;
            const a2 = a1 + Math.PI / teeth;
            this._gfx.moveTo(x + Math.cos(a1) * r1, y + 1 + Math.sin(a1) * r1);
            this._gfx.lineTo(x + Math.cos(a1) * r2, y + 1 + Math.sin(a1) * r2);
            this._gfx.lineTo(x + Math.cos(a2) * r2, y + 1 + Math.sin(a2) * r2);
            this._gfx.lineTo(x + Math.cos(a2) * r1, y + 1 + Math.sin(a2) * r1);
          }
          this._gfx.stroke({ color: 0x888888, alpha: 0.7, width: 0.6 });
        }
        break;
      case "check":
        this._gfx.rect(x - 2, y, 4, 5);
        this._gfx.fill({ color: 0xddddbb, alpha: 0.7 });
        // Check marks
        for (let i = 0; i < 2; i++) {
          const cy = y + 1 + i * 1.8;
          this._gfx.moveTo(x - 1, cy);
          this._gfx.lineTo(x - 0.3, cy + 0.7);
          this._gfx.lineTo(x + 1, cy - 0.5);
          this._gfx.stroke({ color: 0x22c55e, alpha: 0.6, width: 0.6 });
        }
        break;
    }
  }

  _drawActivityIndicator() {
    switch (this.activity) {
      case "writing":
      case "reading": {
        // Code lines streaming on monitor
        for (let i = 0; i < 3; i++) {
          const phase = this.age * 4 + i * 0.8;
          const t = (phase % 2) / 2;
          const lineW = 2 + t * 4;
          const alpha = (1 - t) * 0.5;
          this._actGfx.rect(-3, -14 + i * 1.6, lineW, 0.8);
          this._actGfx.fill({ color: this._color, alpha });
        }
        break;
      }
      case "searching": {
        // Books/pages floating around
        for (let i = 0; i < 3; i++) {
          const phase = this.age * 1.5 + i * 1.2;
          const t = (phase % 3) / 3;
          const px = Math.sin(t * Math.PI * 2) * 8;
          const py = -12 - Math.cos(t * Math.PI) * 6;
          const alpha = 0.2 + Math.sin(t * Math.PI) * 0.3;
          this._actGfx.rect(px - 1.5, py - 1, 3, 2);
          this._actGfx.fill({ color: 0xffffff, alpha });
        }
        break;
      }
      case "building": {
        // Gear rotating above head (already in role icon for builder)
        // Add sparks
        for (let i = 0; i < 3; i++) {
          const phase = this.age * 5 + i * 1.5;
          const t = (phase % 1.5) / 1.5;
          const angle = (i / 3) * Math.PI - Math.PI / 2;
          const dist = t * 8;
          const sx = Math.cos(angle) * dist;
          const sy = -10 + Math.sin(angle) * dist;
          const alpha = (1 - t) * 0.6;
          this._actGfx.circle(sx, sy, 0.8);
          this._actGfx.fill({ color: 0xffdd44, alpha });
        }
        break;
      }
      case "testing": {
        // Checklist items checking off
        const checks = 3;
        for (let i = 0; i < checks; i++) {
          const cx = 10;
          const cy = -14 + i * 3;
          this._actGfx.rect(cx, cy, 6, 2);
          this._actGfx.fill({ color: 0x444444, alpha: 0.4 });
          const done = (Math.floor(this.age * 1.5) % checks) >= i;
          if (done) {
            this._actGfx.moveTo(cx + 0.5, cy + 1);
            this._actGfx.lineTo(cx + 1.5, cy + 2);
            this._actGfx.lineTo(cx + 3, cy);
            this._actGfx.stroke({ color: 0x22c55e, alpha: 0.7, width: 0.8 });
          }
        }
        break;
      }
      case "thinking": {
        // Thought bubble
        const bx = 10;
        const by = -16;
        this._actGfx.circle(bx + 4, by, 5);
        this._actGfx.fill({ color: 0xffffff, alpha: 0.1 });
        this._actGfx.circle(bx + 4, by, 5);
        this._actGfx.stroke({ color: 0xffffff, alpha: 0.15, width: 0.5 });
        for (let i = 0; i < 3; i++) {
          const phase = this.age * 3 + i * 0.6;
          const dotAlpha = 0.2 + Math.sin(phase) * 0.3;
          this._actGfx.circle(bx + 1.5 + i * 2, by, 0.8);
          this._actGfx.fill({ color: 0xffffff, alpha: clamp(dotAlpha, 0.1, 0.6) });
        }
        // Connector
        this._actGfx.circle(bx, by + 3.5, 1.2);
        this._actGfx.fill({ color: 0xffffff, alpha: 0.08 });
        break;
      }
    }
  }

  _ensureLabels() {
    if (!this._nameLabel) {
      this._nameLabel = new Text({
        text: this._label,
        style: { fontFamily: "monospace", fontSize: 6, fill: this._color, align: "center" },
      });
      this._nameLabel.anchor.set(0.5, 0);
      this._nameLabel.y = 10;
      this._nameLabel.zIndex = 4;
      this.container.addChild(this._nameLabel);
    } else {
      this._nameLabel.text = this._label;
      this._nameLabel.style.fill = this._color;
    }

    const actText = this._getActivityText();
    if (!this._actLabel) {
      this._actLabel = new Text({
        text: actText,
        style: { fontFamily: "monospace", fontSize: 5, fill: 0x999999, align: "center" },
      });
      this._actLabel.anchor.set(0.5, 0);
      this._actLabel.y = 17;
      this._actLabel.zIndex = 4;
      this.container.addChild(this._actLabel);
    } else {
      this._actLabel.text = actText;
    }
  }

  _removeLabels() {
    if (this._nameLabel) {
      this.container.removeChild(this._nameLabel);
      this._nameLabel.destroy();
      this._nameLabel = null;
    }
    if (this._actLabel) {
      this.container.removeChild(this._actLabel);
      this._actLabel.destroy();
      this._actLabel = null;
    }
  }

  _getActivityText() {
    if (!this.target) return this.activity;
    const parts = this.target.split("/");
    const file = parts[parts.length - 1];
    const short = file.length > 18 ? file.slice(0, 18) + ".." : file;
    return `${this.activity} ${short}`;
  }

  /** Get formatted tool call feed entries. */
  getFeedItems() {
    return this.toolCalls.map((tc) => {
      const parts = (tc.target || "").split("/");
      const file = parts[parts.length - 1] || tc.target;
      let desc = `${tc.tool}: ${file}`;
      switch (tc.tool) {
        case "Read":
          desc = `Reading ${file}...`;
          break;
        case "Write":
          desc = `Writing ${file}`;
          break;
        case "Bash":
          desc = `Running ${file.slice(0, 30)}...`;
          break;
        case "Grep":
          desc = `Searching for '${file}'...`;
          break;
        case "Edit":
          desc = `Editing ${file}`;
          break;
      }
      return { desc, time: tc.time };
    });
  }

  destroy() {
    this._removeLabels();
    if (this.container.parent) {
      this.container.parent.removeChild(this.container);
    }
    this.container.destroy({ children: true });
  }
}

// ── Lighten color helper ───────────────────────────────────────────────────

function lighten(color, amount) {
  const r = clamp(Math.round(((color >> 16) & 0xff) + 255 * amount), 0, 255);
  const g = clamp(Math.round(((color >> 8) & 0xff) + 255 * amount), 0, 255);
  const b = clamp(Math.round((color & 0xff) + 255 * amount), 0, 255);
  return (r << 16) | (g << 8) | b;
}

// ── SessionHouse — building for one session ────────────────────────────────

class SessionHouse {
  /**
   * @param {object} session — session info
   * @param {{ tileX: number, tileY: number }} slot — tile placement
   * @param {Container} worldLayer
   */
  constructor(session, slot, worldLayer) {
    this.pid = session.pid;
    this.session = session;
    this.slot = slot;
    this.alive = true;
    this.fadingOut = false;
    this.fadeTimer = 0;
    this.spawnTimer = 0;
    this.age = 0;

    const pos = tileToScreen(slot.tileX, slot.tileY);
    this.screenX = pos.x;
    this.screenY = pos.y;

    // Root container
    this.container = new Container();
    this.container.position.set(pos.x, pos.y);
    this.container.sortableChildren = true;
    this.container.zIndex = 1 + Math.floor(pos.y);
    this.container.alpha = 0;
    worldLayer.addChild(this.container);

    // Building shell graphics
    this._shellGfx = new Graphics();
    this._shellGfx.zIndex = 0;
    this.container.addChild(this._shellGfx);

    // Interior layer (agents, desks)
    this._interiorContainer = new Container();
    this._interiorContainer.sortableChildren = true;
    this._interiorContainer.zIndex = 1;
    this.container.addChild(this._interiorContainer);

    // Glow layer
    this._glowGfx = new Graphics();
    this._glowGfx.zIndex = -1;
    this.container.addChild(this._glowGfx);

    // Label above house
    this._labelContainer = new Container();
    this._labelContainer.zIndex = 10;
    this.container.addChild(this._labelContainer);

    /** @type {Map<string, HouseAgent>} */
    this._agents = new Map();

    this._buildLabel(session);
  }

  _buildLabel(session) {
    // Working directory name
    const cwd = session.cwd || "unknown";
    const parts = cwd.split("/");
    const dirName = parts[parts.length - 1] || parts[parts.length - 2] || cwd;
    const truncDir = dirName.length > 20 ? dirName.slice(0, 20) + ".." : dirName;

    this._dirLabel = new Text({
      text: truncDir,
      style: {
        fontFamily: "monospace",
        fontSize: 8,
        fill: 0xcccccc,
        align: "center",
        dropShadow: { alpha: 0.6, angle: 0, blur: 2, color: 0x000000, distance: 0 },
      },
    });
    this._dirLabel.anchor.set(0.5, 1);
    this._dirLabel.position.set(0, -HOUSE_HEIGHT_UNITS * HEIGHT_UNIT_PX - 12);
    this._labelContainer.addChild(this._dirLabel);

    // Agent count badge
    this._countBadge = new Text({
      text: "0 agents",
      style: {
        fontFamily: "monospace",
        fontSize: 7,
        fill: 0x00d4ff,
        align: "center",
      },
    });
    this._countBadge.anchor.set(0.5, 1);
    this._countBadge.position.set(0, -HOUSE_HEIGHT_UNITS * HEIGHT_UNIT_PX - 3);
    this._labelContainer.addChild(this._countBadge);

    // Status dot
    this._statusDot = new Graphics();
    this._statusDot.position.set(
      this._dirLabel.width / 2 + 6,
      -HOUSE_HEIGHT_UNITS * HEIGHT_UNIT_PX - 15,
    );
    this._labelContainer.addChild(this._statusDot);
  }

  /**
   * Footprint corners for the isometric box.
   */
  _footprint() {
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 4;
    const w = HOUSE_WIDTH_TILES;
    const h = HOUSE_HEIGHT_TILES;
    return {
      topX: 0, topY: 0,
      rightX: w * hw, rightY: w * hh,
      botX: (w - h) * hw, botY: (w + h) * hh,
      leftX: -h * hw, leftY: h * hh,
    };
  }

  /**
   * Draw the house building shell depending on zoom level.
   * @param {number} zoom
   */
  _drawShell(zoom) {
    this._shellGfx.clear();
    this._glowGfx.clear();

    const fp = this._footprint();
    const hPx = HOUSE_HEIGHT_UNITS * HEIGHT_UNIT_PX;

    if (zoom < ZOOM_MED) {
      // Normal zoom: solid building with glow outline
      this._drawSolidBox(fp, hPx, 0.8);
      this._drawGlowOutline(fp, hPx);
    } else if (zoom < ZOOM_CLOSE) {
      // Medium zoom: semi-transparent
      this._drawSolidBox(fp, hPx, 0.3);
      this._drawFloor(fp);
      this._drawCentralDesk(fp);
    } else {
      // Close zoom: walls barely visible, interior fully revealed
      this._drawSolidBox(fp, hPx, 0.12);
      this._drawFloor(fp);
      this._drawCentralDesk(fp);
    }
  }

  _drawSolidBox(fp, hPx, alpha) {
    const g = this._shellGfx;
    // Top face
    g.poly([fp.topX, fp.topY - hPx, fp.rightX, fp.rightY - hPx,
            fp.botX, fp.botY - hPx, fp.leftX, fp.leftY - hPx]);
    g.fill({ color: HOUSE_PALETTE.top, alpha });
    // Left face
    g.poly([fp.leftX, fp.leftY - hPx, fp.botX, fp.botY - hPx,
            fp.botX, fp.botY, fp.leftX, fp.leftY]);
    g.fill({ color: HOUSE_PALETTE.left, alpha });
    // Right face
    g.poly([fp.rightX, fp.rightY - hPx, fp.botX, fp.botY - hPx,
            fp.botX, fp.botY, fp.rightX, fp.rightY]);
    g.fill({ color: HOUSE_PALETTE.right, alpha });
    // Edges
    g.poly([fp.topX, fp.topY - hPx, fp.rightX, fp.rightY - hPx,
            fp.botX, fp.botY - hPx, fp.leftX, fp.leftY - hPx]);
    g.stroke({ color: HOUSE_PALETTE.glow, alpha: alpha * 0.5, width: 1 });
  }

  _drawGlowOutline(fp, hPx) {
    const g = this._glowGfx;
    const pulse = 0.15 + Math.sin(this.age * 2) * 0.08;
    // Glow ellipse beneath
    const cx = (fp.botX + fp.topX) / 2;
    const cy = (fp.botY + fp.topY) / 2;
    g.ellipse(cx, cy + 4, 30, 12);
    g.fill({ color: HOUSE_PALETTE.glow, alpha: pulse * 0.5 });
    // Outline glow
    g.poly([fp.topX, fp.topY - hPx, fp.rightX, fp.rightY - hPx,
            fp.botX, fp.botY - hPx, fp.leftX, fp.leftY - hPx]);
    g.stroke({ color: HOUSE_PALETTE.glow, alpha: pulse, width: 1.5 });
    // Vertical glow edges
    const corners = [
      [fp.topX, fp.topY], [fp.rightX, fp.rightY],
      [fp.botX, fp.botY], [fp.leftX, fp.leftY],
    ];
    for (const [cx2, cy2] of corners) {
      g.moveTo(cx2, cy2 - hPx);
      g.lineTo(cx2, cy2);
      g.stroke({ color: HOUSE_PALETTE.glow, alpha: pulse * 0.6, width: 1 });
    }
  }

  _drawFloor(fp) {
    const g = this._shellGfx;
    g.poly([fp.topX, fp.topY, fp.rightX, fp.rightY,
            fp.botX, fp.botY, fp.leftX, fp.leftY]);
    g.fill({ color: HOUSE_PALETTE.floor, alpha: 0.6 });
    g.poly([fp.topX, fp.topY, fp.rightX, fp.rightY,
            fp.botX, fp.botY, fp.leftX, fp.leftY]);
    g.stroke({ color: 0x333344, alpha: 0.4, width: 0.5 });
  }

  _drawCentralDesk(fp) {
    const g = this._shellGfx;
    // Small isometric table in center
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 4;
    const cx = (HOUSE_WIDTH_TILES - HOUSE_HEIGHT_TILES) * hw * 0.5;
    const cy = (HOUSE_WIDTH_TILES + HOUSE_HEIGHT_TILES) * hh * 0.5 - 6;
    const tw = 12, th = 8;
    // Table top (diamond shape)
    g.poly([cx, cy - th / 2, cx + tw / 2, cy, cx, cy + th / 2, cx - tw / 2, cy]);
    g.fill({ color: HOUSE_PALETTE.desk, alpha: 0.7 });
    g.poly([cx, cy - th / 2, cx + tw / 2, cy, cx, cy + th / 2, cx - tw / 2, cy]);
    g.stroke({ color: 0x000000, alpha: 0.2, width: 0.5 });
  }

  /**
   * Update status indicator dot.
   */
  _drawStatusDot() {
    this._statusDot.clear();
    const isActive = this.session.status === "streaming" || this.session.status === "active";
    const color = isActive ? 0x22c55e : 0xf59e0b;
    const pulse = 0.5 + Math.sin(this.age * (isActive ? 4 : 2)) * 0.3;
    this._statusDot.circle(0, 0, 3);
    this._statusDot.fill({ color, alpha: pulse });
    // Outer ring
    this._statusDot.circle(0, 0, 5);
    this._statusDot.fill({ color, alpha: pulse * 0.2 });
  }

  /**
   * Sync agents from session data.
   * @param {object} session
   */
  updateSession(session) {
    this.session = session;
    const agents = session.agents || [];

    // If no agents array, create one from session
    if (agents.length === 0) {
      agents.push({
        id: `session-${session.pid}-agent-0`,
        sessionPid: session.pid,
        role: "main",
        activity: session.status === "streaming" ? "thinking"
                : session.status === "active" ? "chatting" : "idle",
        target: session.task || null,
        tool: null,
      });
    }

    const seats = getSeatPositions(agents.length);
    const activeIds = new Set();

    for (let i = 0; i < agents.length; i++) {
      const info = agents[i];
      const id = info.id;
      activeIds.add(id);

      if (this._agents.has(id)) {
        this._agents.get(id).updateFromInfo(info);
      } else {
        const seat = seats[i] || seats[seats.length - 1];
        const ha = new HouseAgent(info, seat, this._interiorContainer);
        this._agents.set(id, ha);
      }
    }

    // Remove departed agents
    for (const [id, ha] of this._agents) {
      if (!activeIds.has(id)) {
        ha.destroy();
        this._agents.delete(id);
      }
    }

    // Update badge
    this._countBadge.text = `${this._agents.size} agent${this._agents.size !== 1 ? "s" : ""}`;

    // Update dir label
    const cwd = session.cwd || "unknown";
    const parts = cwd.split("/");
    const dirName = parts[parts.length - 1] || parts[parts.length - 2] || cwd;
    const truncDir = dirName.length > 20 ? dirName.slice(0, 20) + ".." : dirName;
    this._dirLabel.text = truncDir;
  }

  /**
   * Per-frame update.
   * @param {number} dt
   * @param {number} zoom — current camera zoom
   */
  update(dt, zoom) {
    this.age += dt;

    // Fade in
    if (!this.fadingOut) {
      this.spawnTimer += dt;
      this.container.alpha = clamp(this.spawnTimer / FADE_IN_DURATION, 0, 1);
    }

    // Fade out
    if (this.fadingOut) {
      this.fadeTimer += dt;
      this.container.alpha = clamp(1 - this.fadeTimer / FADE_OUT_DURATION, 0, 1);
      if (this.container.alpha <= 0) this.alive = false;
      return;
    }

    // Draw building shell
    this._drawShell(zoom);

    // Status dot
    this._drawStatusDot();

    // Show/hide interior based on zoom
    this._interiorContainer.visible = zoom >= ZOOM_MED;

    // Update agents
    for (const ha of this._agents.values()) {
      ha.draw(zoom, dt);
    }

    // Depth sort
    this.container.zIndex = 1 + Math.floor(this.screenY);
  }

  /**
   * Hit test for this house.
   * @param {number} worldX
   * @param {number} worldY
   * @returns {boolean}
   */
  hitTest(worldX, worldY) {
    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 4;
    const hPx = HOUSE_HEIGHT_UNITS * HEIGHT_UNIT_PX;
    const w = HOUSE_WIDTH_TILES, h = HOUSE_HEIGHT_TILES;
    const minX = this.screenX - h * hw;
    const maxX = this.screenX + w * hw;
    const minY = this.screenY - hPx;
    const maxY = this.screenY + (w + h) * hh;
    return worldX >= minX && worldX <= maxX && worldY >= minY && worldY <= maxY;
  }

  /**
   * Hit test individual agents inside this house.
   * @param {number} worldX
   * @param {number} worldY
   * @returns {HouseAgent | null}
   */
  hitTestAgent(worldX, worldY) {
    const localX = worldX - this.screenX;
    const localY = worldY - this.screenY;
    for (const ha of this._agents.values()) {
      const dx = localX - ha.seatX;
      const dy = localY - ha.seatY;
      if (Math.abs(dx) < 12 && Math.abs(dy) < 16) return ha;
    }
    return null;
  }

  startFadeOut() {
    this.fadingOut = true;
    this.fadeTimer = 0;
  }

  destroy() {
    for (const ha of this._agents.values()) {
      ha.destroy();
    }
    this._agents.clear();
    if (this.container.parent) {
      this.container.parent.removeChild(this.container);
    }
    this.container.destroy({ children: true });
  }
}

// ── Agent detail panel (DOM overlay) ───────────────────────────────────────

class AgentDetailPanel {
  constructor() {
    this._el = null;
    this._visible = false;
    this._currentAgentId = null;
    this._feedInterval = null;
    this._build();
  }

  _build() {
    const el = document.createElement("div");
    el.id = "agent-detail-panel";
    el.style.cssText = `
      position: fixed;
      right: -360px;
      top: 60px;
      width: 340px;
      max-height: calc(100vh - 120px);
      background: rgba(12, 12, 20, 0.95);
      border: 1px solid rgba(0, 212, 255, 0.2);
      border-radius: 8px 0 0 8px;
      padding: 16px;
      font-family: monospace;
      font-size: 12px;
      color: #e0e0e0;
      z-index: 10000;
      overflow-y: auto;
      backdrop-filter: blur(10px);
      box-shadow: -4px 0 24px rgba(0,0,0,0.5);
      transition: right 0.3s ease;
    `;
    el.innerHTML = `
      <div id="adp-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <div id="adp-title" style="font-size:14px;font-weight:bold;color:#00d4ff;"></div>
        <button id="adp-close" style="background:none;border:none;color:#666;cursor:pointer;font-size:16px;font-family:monospace;">&times;</button>
      </div>
      <div id="adp-meta" style="color:#888;font-size:11px;margin-bottom:10px;line-height:1.6;"></div>
      <div id="adp-stats" style="display:flex;gap:12px;margin-bottom:12px;"></div>
      <div style="border-top:1px solid rgba(255,255,255,0.06);margin:8px 0;"></div>
      <div style="font-size:11px;color:#666;margin-bottom:6px;">LIVE ACTIVITY</div>
      <div id="adp-feed" style="max-height:300px;overflow-y:auto;"></div>
      <div style="border-top:1px solid rgba(255,255,255,0.06);margin:8px 0;"></div>
      <button id="adp-terminal-btn" style="
        width:100%;padding:8px;
        background:rgba(0,212,255,0.08);
        border:1px solid rgba(0,212,255,0.2);
        border-radius:4px;
        color:#00d4ff;
        cursor:pointer;
        font-family:monospace;
        font-size:11px;
      ">Open in Terminal</button>
    `;
    document.body.appendChild(el);
    this._el = el;

    el.querySelector("#adp-close").addEventListener("click", () => this.hide());
    el.querySelector("#adp-terminal-btn").addEventListener("click", () => {
      // Placeholder for terminal integration
      document.dispatchEvent(
        new CustomEvent("open-agent-terminal", { detail: { agentId: this._currentAgentId } }),
      );
    });
  }

  /**
   * Show panel for a specific agent.
   * @param {HouseAgent} agent
   * @param {object} session
   */
  show(agent, session) {
    this._currentAgentId = agent.id;
    this._visible = true;

    const pal = ROLE_PALETTE[agent.role] || ROLE_PALETTE.main;
    const colorHex = "#" + pal.color.toString(16).padStart(6, "0");

    this._el.querySelector("#adp-title").innerHTML =
      `<span style="color:${colorHex}">${pal.label}</span> Agent`;

    const cwd = session.cwd || "unknown";
    const cwdShort = cwd.length > 45 ? "..." + cwd.slice(-42) : cwd;
    this._el.querySelector("#adp-meta").innerHTML = `
      <div>PID: <span style="color:#aaa">${agent.sessionPid}</span></div>
      <div>Dir: <span style="color:#aaa">${cwdShort}</span></div>
      <div>Activity: <span style="color:${colorHex}">${agent.activity}</span></div>
      <div>Target: <span style="color:#aaa">${agent.target || "none"}</span></div>
    `;

    const statsEl = this._el.querySelector("#adp-stats");
    statsEl.innerHTML = `
      <div style="flex:1;background:rgba(255,255,255,0.03);border-radius:4px;padding:6px 8px;text-align:center;">
        <div style="font-size:10px;color:#666;">Tokens</div>
        <div style="color:#fff;font-size:13px;">${(agent.tokens || 0).toLocaleString()}</div>
      </div>
      <div style="flex:1;background:rgba(255,255,255,0.03);border-radius:4px;padding:6px 8px;text-align:center;">
        <div style="font-size:10px;color:#666;">Elapsed</div>
        <div style="color:#fff;font-size:13px;">${formatElapsed(agent.elapsed || 0)}</div>
      </div>
    `;

    this._updateFeed(agent);
    this._el.style.right = "0px";

    // Live feed updates
    if (this._feedInterval) clearInterval(this._feedInterval);
    this._feedInterval = setInterval(() => {
      if (this._visible) this._updateFeed(agent);
    }, 2000);
  }

  _updateFeed(agent) {
    const feedEl = this._el.querySelector("#adp-feed");
    const items = agent.getFeedItems().slice(0, 15);
    if (items.length === 0) {
      feedEl.innerHTML = '<div style="color:#444;font-style:italic;">No activity yet</div>';
      return;
    }
    feedEl.innerHTML = items
      .map((item) => {
        const timeStr = new Date(item.time).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        });
        return `<div style="padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.03);display:flex;gap:8px;">
          <span style="color:#555;font-size:10px;white-space:nowrap;">${timeStr}</span>
          <span style="color:#bbb;font-size:11px;">${escapeHtml(item.desc)}</span>
        </div>`;
      })
      .join("");
  }

  hide() {
    this._visible = false;
    this._currentAgentId = null;
    this._el.style.right = "-360px";
    if (this._feedInterval) {
      clearInterval(this._feedInterval);
      this._feedInterval = null;
    }
  }

  get visible() {
    return this._visible;
  }

  destroy() {
    this.hide();
    if (this._el?.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
  }
}

function formatElapsed(seconds) {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── SessionHouses — main exported system ───────────────────────────────────

export class SessionHouses {
  /**
   * @param {import('pixi.js').Application} app
   * @param {Container} worldContainer
   * @param {import('./camera.js').Camera} camera
   * @param {import('./buildings.js').BuildingManager} buildingManager
   */
  constructor(app, worldContainer, camera, buildingManager) {
    this._app = app;
    this._worldContainer = worldContainer;
    this._camera = camera;
    this._buildingManager = buildingManager;

    /** @type {Map<number, SessionHouse>} pid -> house */
    this._houses = new Map();

    this._layer = new Container();
    this._layer.sortableChildren = true;
    this._layer.zIndex = 2;
    this._worldContainer.addChild(this._layer);

    this._availableSlots = getAvailableSlots();
    this._usedSlots = new Map(); // pid -> slot index

    // Detail panel
    this._detailPanel = new AgentDetailPanel();

    // Zoom state
    this._zoomedIntoPid = null;

    // Bind tick
    this._tick = this._tick.bind(this);
    this._started = false;

    // Keyboard listener for Escape
    this._onKeyDown = this._onKeyDown.bind(this);
    window.addEventListener("keydown", this._onKeyDown);
  }

  start() {
    if (this._started) return;
    this._app.ticker.add(this._tick);
    this._started = true;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * Update from a list of sessions (from IPC).
   * @param {Array} sessions
   */
  updateSessions(sessions) {
    const activePids = new Set();

    for (const session of sessions) {
      const pid = session.pid;
      activePids.add(pid);

      if (this._houses.has(pid)) {
        this._houses.get(pid).updateSession(session);
      } else {
        // Allocate a slot
        const slotIdx = this._findSlot(pid);
        if (slotIdx === -1) continue; // no room
        const slot = this._availableSlots[slotIdx];
        this._usedSlots.set(pid, slotIdx);

        const house = new SessionHouse(session, slot, this._layer);
        this._houses.set(pid, house);
      }
    }

    // Fade out removed sessions
    for (const [pid, house] of this._houses) {
      if (!activePids.has(pid) && !house.fadingOut) {
        house.startFadeOut();
      }
    }
  }

  /**
   * Called per-frame.
   * @param {number} dt
   */
  update(dt) {
    const zoom = this._camera.zoom;

    for (const [pid, house] of this._houses) {
      house.update(dt, zoom);
      if (!house.alive) {
        house.destroy();
        this._houses.delete(pid);
        // Free slot
        if (this._usedSlots.has(pid)) {
          this._usedSlots.delete(pid);
        }
      }
    }
  }

  // ── Click handling (called from app.js) ────────────────────────────────

  /**
   * Handle a click in world coordinates. Returns true if consumed.
   * @param {number} worldX
   * @param {number} worldY
   * @param {boolean} isDoubleClick
   * @returns {boolean}
   */
  handleClick(worldX, worldY, isDoubleClick) {
    // Double-click or ESC: zoom out
    if (isDoubleClick && this._zoomedIntoPid !== null) {
      this._zoomOut();
      return true;
    }

    const zoom = this._camera.zoom;

    // If already zoomed in, check for agent clicks
    if (this._zoomedIntoPid !== null && zoom >= ZOOM_CLOSE - 0.3) {
      const house = this._houses.get(this._zoomedIntoPid);
      if (house) {
        const agent = house.hitTestAgent(worldX, worldY);
        if (agent) {
          this._detailPanel.show(agent, house.session);
          return true;
        }
      }
      // Click outside the house while zoomed — zoom out
      const hitHouse = this._hitTestHouses(worldX, worldY);
      if (!hitHouse) {
        this._zoomOut();
        return true;
      }
    }

    // Click on a house: zoom in
    for (const [pid, house] of this._houses) {
      if (house.fadingOut) continue;
      if (house.hitTest(worldX, worldY)) {
        this._zoomInto(pid);
        return true;
      }
    }

    return false;
  }

  /**
   * Hit test all houses, return the first hit.
   * @param {number} worldX
   * @param {number} worldY
   * @returns {SessionHouse | null}
   */
  _hitTestHouses(worldX, worldY) {
    for (const house of this._houses.values()) {
      if (house.fadingOut) continue;
      if (house.hitTest(worldX, worldY)) return house;
    }
    return null;
  }

  // ── Zoom control ───────────────────────────────────────────────────────

  _zoomInto(pid) {
    const house = this._houses.get(pid);
    if (!house) return;

    this._zoomedIntoPid = pid;
    this._camera.targetZoom = ZOOM_CLOSE;
    this._camera.targetX = -house.screenX;
    this._camera.targetY = -house.screenY;
    this._camera.unfollow();

    document.dispatchEvent(
      new CustomEvent("session-house-zoom", { detail: { pid, zoomed: true } }),
    );
  }

  _zoomOut() {
    this._zoomedIntoPid = null;
    this._camera.targetZoom = 1.0;
    this._detailPanel.hide();

    document.dispatchEvent(
      new CustomEvent("session-house-zoom", { detail: { pid: null, zoomed: false } }),
    );
  }

  /** @returns {number | null} */
  get zoomedIntoPid() {
    return this._zoomedIntoPid;
  }

  // ── Keyboard ───────────────────────────────────────────────────────────

  _onKeyDown(e) {
    if (e.code === "Escape" && this._zoomedIntoPid !== null) {
      this._zoomOut();
    }
  }

  // ── Slot allocation ────────────────────────────────────────────────────

  _findSlot(pid) {
    const used = new Set(this._usedSlots.values());
    for (let i = 0; i < this._availableSlots.length; i++) {
      if (!used.has(i)) return i;
    }
    return -1;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  /** @param {import('pixi.js').Ticker} ticker */
  _tick(ticker) {
    const dt = ticker.deltaMS / 1000;
    this.update(dt);
  }

  destroy() {
    window.removeEventListener("keydown", this._onKeyDown);
    if (this._started) {
      this._app.ticker.remove(this._tick);
      this._started = false;
    }
    for (const house of this._houses.values()) {
      house.destroy();
    }
    this._houses.clear();
    if (this._layer.parent) {
      this._layer.parent.removeChild(this._layer);
    }
    this._layer.destroy({ children: true });
    this._detailPanel.destroy();
  }
}
