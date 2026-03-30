/**
 * zone-tooltips.js — Floating tooltip system for zone buildings
 *
 * Shows a rich tooltip when hovering over a zone building on the isometric
 * map.  Uses mousemove on the canvas + camera.screenToWorld +
 * buildingManager.hitTest to detect the hovered zone.
 *
 * Usage (mount after camera & buildingManager are ready):
 *
 *   import { ZoneTooltips } from './zone-tooltips.js';
 *
 *   const tooltips = new ZoneTooltips(canvasEl, camera, buildingManager);
 *   tooltips.enable();
 *
 *   // Later:
 *   tooltips.destroy();
 */

import worldState from '../systems/world-state.js';

// ── Config ──────────────────────────────────────────────────────────────

/** Cursor offset when positioned to the right/below */
const OFFSET_X = 12;
const OFFSET_Y = 8;
/** Edge margin before flipping axis (px) */
const EDGE_MARGIN = 16;
/** Delay before showing the tooltip (ms), prevents flicker on fast sweeps */
const SHOW_DELAY_MS = 150;
/** Throttle interval for mousemove hit-testing (ms) */
const THROTTLE_MS = 60;

// ── Zone metadata ───────────────────────────────────────────────────────
// Maps zone id to an icon and short description.  Kept here rather than in
// zones.js so that the renderer stays data-light.

/** @type {Record<string, { icon: string, desc: string }>} */
const ZONE_META = {
  dispatch:   { icon: '\u{1F3E2}', desc: 'Central task dispatcher & orchestrator' },
  brain:      { icon: '\u{1F4DA}', desc: 'Knowledge base & reasoning engine' },
  chat:       { icon: '\u{1F4AC}', desc: 'Conversational interface rooms' },
  memory:     { icon: '\u{1F5C4}\uFE0F', desc: 'Persistent memory & context vault' },
  skills:     { icon: '\u{1F393}', desc: 'Agent skill training academy' },
  minions:    { icon: '\u{26CF}\uFE0F', desc: 'Sub-agent tunnel network' },
  treasury:   { icon: '\u{1F4B0}', desc: 'Budget & resource management' },
  sales:      { icon: '\u{1F4C8}', desc: 'Revenue & outreach district' },
  marketing:  { icon: '\u{1F4E3}', desc: 'Campaign & brand plaza' },
  exchange:   { icon: '\u{1F504}', desc: 'API & data exchange hub' },
  market:     { icon: '\u{1F6D2}', desc: 'Marketplace for tools & plugins' },
  council:    { icon: '\u{1F3DB}\uFE0F', desc: 'Governance & decision council' },
  rnd:        { icon: '\u{1F52C}', desc: 'Research & development lab' },
  legal:      { icon: '\u{2696}\uFE0F', desc: 'Compliance & policy tower' },
  archive:    { icon: '\u{1F4DC}', desc: 'Historical data archive' },
  docks:      { icon: '\u{2693}', desc: 'External connector docks' },
  airport:    { icon: '\u{2708}\uFE0F', desc: 'Cross-platform transit hub' },
  globe:      { icon: '\u{1F310}', desc: 'Global communications room' },
  broadcast:  { icon: '\u{1F4E1}', desc: 'Broadcast & notification tower' },
};

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Create the tooltip DOM element tree.  Returns the root element plus
 * references to the dynamic inner nodes.
 */
function createTooltipDOM() {
  const root = document.createElement('div');
  root.className = 'zone-tooltip';
  root.setAttribute('role', 'tooltip');

  const caret = document.createElement('div');
  caret.className = 'zone-tooltip__caret';

  const card = document.createElement('div');
  card.className = 'zone-tooltip__card';

  // Header
  const header = document.createElement('div');
  header.className = 'zone-tooltip__header';

  const icon = document.createElement('span');
  icon.className = 'zone-tooltip__icon';

  const name = document.createElement('span');
  name.className = 'zone-tooltip__name';

  const lockedTag = document.createElement('span');
  lockedTag.className = 'zone-tooltip__locked-tag';

  header.append(icon, name, lockedTag);

  // Description
  const desc = document.createElement('div');
  desc.className = 'zone-tooltip__desc';

  // Progress row
  const progressRow = document.createElement('div');
  progressRow.className = 'zone-tooltip__progress';

  const progressTrack = document.createElement('div');
  progressTrack.className = 'zone-tooltip__progress-track';

  const progressFill = document.createElement('div');
  progressFill.className = 'zone-tooltip__progress-fill';

  progressTrack.appendChild(progressFill);

  const progressLabel = document.createElement('span');
  progressLabel.className = 'zone-tooltip__progress-label';

  progressRow.append(progressTrack, progressLabel);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'zone-tooltip__footer';

  const agents = document.createElement('span');
  agents.className = 'zone-tooltip__agents';

  const status = document.createElement('span');
  status.className = 'zone-tooltip__status';

  const statusDot = document.createElement('span');
  statusDot.className = 'zone-tooltip__status-dot';

  const statusLabel = document.createElement('span');

  status.append(statusDot, statusLabel);
  footer.append(agents, status);

  card.append(header, desc, progressRow, footer);
  root.append(caret, card);

  return {
    root,
    caret,
    icon,
    name,
    lockedTag,
    desc,
    progressFill,
    progressLabel,
    agents,
    statusDot,
    statusLabel,
  };
}

// ── ZoneTooltips class ──────────────────────────────────────────────────

export class ZoneTooltips {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../renderer/camera.js').Camera} camera
   * @param {import('../renderer/buildings.js').BuildingManager} buildingManager
   */
  constructor(canvas, camera, buildingManager) {
    /** @private */ this._canvas = canvas;
    /** @private */ this._camera = camera;
    /** @private */ this._bm = buildingManager;

    /** @private */ this._dom = createTooltipDOM();
    /** @private */ this._mounted = false;
    /** @private */ this._enabled = false;

    /** Currently displayed zone id (null = hidden) @private */
    this._currentZoneId = null;
    /** Timer for show delay @private */
    this._showTimer = null;
    /** Last throttle timestamp @private */
    this._lastMoveTime = 0;
    /** Pending zone from latest throttled move @private */
    this._pendingZone = null;
    /** Latest cursor screen coords @private */
    this._cursorX = 0;
    /** @private */
    this._cursorY = 0;

    // Bind event handlers so we can add/remove them cleanly
    /** @private */ this._onMouseMove = this._handleMouseMove.bind(this);
    /** @private */ this._onMouseLeave = this._handleMouseLeave.bind(this);
  }

  // ── Public API ──────────────────────────────────────────────────────

  /** Activate the tooltip system — attaches DOM + listeners. */
  enable() {
    if (this._enabled) return;
    this._enabled = true;

    if (!this._mounted) {
      document.body.appendChild(this._dom.root);
      this._mounted = true;
    }

    this._canvas.addEventListener('mousemove', this._onMouseMove);
    this._canvas.addEventListener('mouseleave', this._onMouseLeave);
  }

  /** Deactivate the tooltip — removes listeners, hides tooltip. */
  disable() {
    if (!this._enabled) return;
    this._enabled = false;

    this._canvas.removeEventListener('mousemove', this._onMouseMove);
    this._canvas.removeEventListener('mouseleave', this._onMouseLeave);
    this._hide();
  }

  /** Full teardown — removes DOM node and all references. */
  destroy() {
    this.disable();
    if (this._mounted) {
      this._dom.root.remove();
      this._mounted = false;
    }
  }

  // ── Event handlers ──────────────────────────────────────────────────

  /**
   * Throttled mousemove handler.
   * @param {MouseEvent} e
   * @private
   */
  _handleMouseMove(e) {
    const now = performance.now();
    this._cursorX = e.clientX;
    this._cursorY = e.clientY;

    // Throttle hit-testing
    if (now - this._lastMoveTime < THROTTLE_MS) return;
    this._lastMoveTime = now;

    const worldPos = this._camera.screenToWorld(e.clientX, e.clientY);
    const hitZone = this._bm.hitTest(worldPos.x, worldPos.y);

    if (!hitZone) {
      this._hide();
      return;
    }

    // Same zone — just reposition
    if (hitZone.id === this._currentZoneId) {
      this._position(e.clientX, e.clientY);
      return;
    }

    // New zone — start show delay
    this._pendingZone = hitZone;
    this._clearShowTimer();
    this._showTimer = setTimeout(() => {
      if (this._pendingZone && this._pendingZone.id === hitZone.id) {
        this._show(hitZone, e.clientX, e.clientY);
      }
    }, SHOW_DELAY_MS);
  }

  /**
   * @private
   */
  _handleMouseLeave() {
    this._hide();
  }

  // ── Show / hide / position ────────────────────────────────────────

  /**
   * Populate tooltip content and display it.
   * @param {import('../renderer/zones.js').ZoneDef} zone
   * @param {number} cx - cursor screen X
   * @param {number} cy - cursor screen Y
   * @private
   */
  _show(zone, cx, cy) {
    this._currentZoneId = zone.id;

    const meta = ZONE_META[zone.id] || { icon: '\u{1F3D7}\uFE0F', desc: 'Zone' };
    const progress = this._bm.getZoneProgress(zone.id);
    const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
    const isLocked = !zone.active && progress === 0;
    const isActive = worldState.isZoneActive(zone.id);
    const agentCount = worldState.getActiveZones().get(zone.id) || 0;

    // Icon + name
    this._dom.icon.textContent = meta.icon;
    this._dom.name.textContent = zone.name;

    // Locked tag
    if (isLocked) {
      this._dom.lockedTag.textContent = '\u{1F512} Locked';
      this._dom.lockedTag.style.display = '';
    } else {
      this._dom.lockedTag.style.display = 'none';
    }

    // Description
    this._dom.desc.textContent = meta.desc;

    // Progress bar
    const isComplete = pct >= 100;
    this._dom.progressFill.style.width = `${pct}%`;
    this._dom.progressFill.classList.toggle('zone-tooltip__progress-fill--complete', isComplete);
    this._dom.progressLabel.textContent = `${pct}%`;

    // Agent count
    this._dom.agents.textContent = agentCount > 0
      ? `${agentCount} agent${agentCount !== 1 ? 's' : ''}`
      : 'No agents';

    // Status indicator
    let statusState;
    if (isLocked) {
      statusState = 'locked';
    } else if (isActive) {
      statusState = 'active';
    } else {
      statusState = 'idle';
    }

    this._dom.statusDot.className = `zone-tooltip__status-dot zone-tooltip__status-dot--${statusState}`;
    this._dom.statusLabel.textContent = statusState.charAt(0).toUpperCase() + statusState.slice(1);

    // Position and reveal
    this._position(cx, cy);
    this._dom.root.classList.add('visible');
  }

  /**
   * Hide the tooltip immediately.
   * @private
   */
  _hide() {
    this._clearShowTimer();
    this._currentZoneId = null;
    this._pendingZone = null;
    this._dom.root.classList.remove('visible');
  }

  /**
   * Position the tooltip near the cursor, flipping at screen edges.
   * @param {number} cx - cursor screen X
   * @param {number} cy - cursor screen Y
   * @private
   */
  _position(cx, cy) {
    const el = this._dom.root;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Measure tooltip dimensions (needs to be in DOM and display:block)
    const rect = el.getBoundingClientRect();
    const w = rect.width || 220;
    const h = rect.height || 80;

    // Default: right of cursor, below
    let x = cx + OFFSET_X;
    let y = cy + OFFSET_Y;
    let flipX = false;
    let flipY = false;

    // Flip horizontally if too close to right edge
    if (x + w + EDGE_MARGIN > vw) {
      x = cx - OFFSET_X - w;
      flipX = true;
    }

    // Flip vertically if too close to bottom edge
    if (y + h + EDGE_MARGIN > vh) {
      y = cy - OFFSET_Y - h;
      flipY = true;
    }

    // Clamp to screen
    x = Math.max(EDGE_MARGIN, Math.min(x, vw - w - EDGE_MARGIN));
    y = Math.max(EDGE_MARGIN, Math.min(y, vh - h - EDGE_MARGIN));

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;

    // Update caret direction classes
    el.classList.toggle('zone-tooltip--above', flipY);
    el.classList.toggle('zone-tooltip--below', !flipY);
    el.classList.toggle('zone-tooltip--flip-x', flipX);
  }

  /**
   * @private
   */
  _clearShowTimer() {
    if (this._showTimer !== null) {
      clearTimeout(this._showTimer);
      this._showTimer = null;
    }
  }
}
