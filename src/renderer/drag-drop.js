/**
 * drag-drop.js - Drag-and-drop system for rearranging zone buildings
 *
 * Long-press (500ms) on a zone building enters drag mode. The building
 * follows the cursor with reduced opacity. A ghost outline shows the
 * target position, highlighted green (valid) or red (invalid). On drop,
 * buildings swap positions and the new layout is persisted via the DB API.
 *
 * Integrates with the Camera (disables panning during drag) and the
 * BuildingManager (reads/writes building positions).
 */

import { Graphics } from "pixi.js";
import { TILE_WIDTH, TILE_HEIGHT, COLORS } from "./constants.js";
import { tileToScreen, screenToTile } from "./tiles.js";
import { ZONE_DEFS } from "./zones.js";

// ── Configuration ───────────────────────────────────────────────────
const LONG_PRESS_MS = 500;
const DRAG_ALPHA = 0.6;
const GHOST_VALID_COLOR = 0x44cc66;
const GHOST_INVALID_COLOR = 0xcc4444;
const GHOST_ALPHA = 0.35;
const SHIFT_ANIM_MS = 250;
const DRAG_THRESHOLD_PX = 4; // pixels moved before long-press cancels

/**
 * DragDropSystem provides long-press drag-and-drop reordering of zone
 * buildings on the isometric grid. It disables camera panning while a
 * drag is active and dispatches a 'zone:rearranged' CustomEvent on
 * successful drops.
 */
export class DragDropSystem {
  /**
   * @param {import('pixi.js').Application} app   - PixiJS application
   * @param {import('./camera.js').Camera}   camera - Camera instance
   * @param {import('./buildings.js').BuildingManager} buildingManager
   */
  constructor(app, camera, buildingManager) {
    /** @type {import('pixi.js').Application} */
    this._app = app;
    /** @type {import('./camera.js').Camera} */
    this._camera = camera;
    /** @type {import('./buildings.js').BuildingManager} */
    this._bm = buildingManager;

    // ── State ──────────────────────────────────────────────────────
    this._enabled = false;

    /** @type {import('./buildings.js').BuildingSprite | null} */
    this._dragEntry = null;
    this._dragging = false;

    // Long-press detection
    this._pressTimer = null;
    this._pressStartX = 0;
    this._pressStartY = 0;

    // Original position of the dragged building (tile coords)
    this._originTileX = 0;
    this._originTileY = 0;

    // Current hover tile for the ghost
    this._hoverTileX = -1;
    this._hoverTileY = -1;
    this._hoverValid = false;

    // Ghost outline graphic
    this._ghost = new Graphics();
    this._ghost.zIndex = 10;
    this._ghost.visible = false;

    // Track buildings currently animating their shift
    /** @type {Map<string, { startX: number, startY: number, endX: number, endY: number, elapsed: number, duration: number }>} */
    this._shiftAnims = new Map();

    // Bound handlers (so we can remove them)
    this._onPointerDown = this._handlePointerDown.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerUp = this._handlePointerUp.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onAnimFrame = this._animateShifts.bind(this);
    this._animRAF = null;
    this._lastAnimTime = 0;
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Activate the drag-drop system. Adds event listeners. */
  enable() {
    if (this._enabled) return;
    this._enabled = true;

    const canvas = this._camera.canvas;
    canvas.addEventListener("pointerdown", this._onPointerDown);
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerup", this._onPointerUp);
    window.addEventListener("keydown", this._onKeyDown);

    // Add the ghost overlay to the building container so it transforms with the world
    this._bm.container.addChild(this._ghost);
  }

  /** Deactivate the drag-drop system. Removes event listeners. */
  disable() {
    if (!this._enabled) return;
    this._cancelDrag();
    this._enabled = false;

    const canvas = this._camera.canvas;
    canvas.removeEventListener("pointerdown", this._onPointerDown);
    window.removeEventListener("pointermove", this._onPointerMove);
    window.removeEventListener("pointerup", this._onPointerUp);
    window.removeEventListener("keydown", this._onKeyDown);

    if (this._ghost.parent) {
      this._ghost.parent.removeChild(this._ghost);
    }
  }

  /** Tear down completely. */
  destroy() {
    this.disable();
    this._ghost.destroy();
    if (this._animRAF) {
      cancelAnimationFrame(this._animRAF);
      this._animRAF = null;
    }
  }

  // ── Event handlers ──────────────────────────────────────────────

  /** @param {PointerEvent} e */
  _handlePointerDown(e) {
    if (!this._enabled || e.button !== 0) return;
    if (this._dragging) return;

    // Test if press is on a zone building
    const worldPos = this._camera.screenToWorld(e.clientX, e.clientY);
    const hitZone = this._bm.hitTest(worldPos.x, worldPos.y);
    if (!hitZone) return;

    const entry = this._bm.buildings.find((b) => b.zoneId === hitZone.id);
    if (!entry) return;

    // Start long-press timer
    this._pressStartX = e.clientX;
    this._pressStartY = e.clientY;
    this._dragEntry = entry;

    this._pressTimer = setTimeout(() => {
      this._startDrag(e);
    }, LONG_PRESS_MS);
  }

  /** @param {PointerEvent} e */
  _handlePointerMove(e) {
    // If we are waiting for long-press, check threshold
    if (this._pressTimer && !this._dragging) {
      const dx = e.clientX - this._pressStartX;
      const dy = e.clientY - this._pressStartY;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD_PX) {
        this._clearPressTimer();
      }
      return;
    }

    if (!this._dragging || !this._dragEntry) return;

    // Move building to follow cursor
    const worldPos = this._camera.screenToWorld(e.clientX, e.clientY);
    this._dragEntry.gfx.position.set(worldPos.x, worldPos.y);

    // Compute the tile under the cursor for ghost placement
    const tile = screenToTile(worldPos.x, worldPos.y);
    const tileX = Math.floor(tile.tileX);
    const tileY = Math.floor(tile.tileY);

    if (tileX !== this._hoverTileX || tileY !== this._hoverTileY) {
      this._hoverTileX = tileX;
      this._hoverTileY = tileY;
      this._hoverValid = this._isValidDrop(tileX, tileY, this._dragEntry.zone);
      this._drawGhost(tileX, tileY, this._dragEntry.zone, this._hoverValid);
    }
  }

  /** @param {PointerEvent} _e */
  _handlePointerUp(_e) {
    this._clearPressTimer();

    if (!this._dragging || !this._dragEntry) return;

    if (
      this._hoverValid &&
      (this._hoverTileX !== this._originTileX ||
        this._hoverTileY !== this._originTileY)
    ) {
      this._executeDrop(this._hoverTileX, this._hoverTileY);
    } else {
      this._cancelDrag();
    }
  }

  /** @param {KeyboardEvent} e */
  _handleKeyDown(e) {
    if (e.code === "Escape" && this._dragging) {
      e.preventDefault();
      this._cancelDrag();
    }
  }

  // ── Drag lifecycle ──────────────────────────────────────────────

  /** @param {PointerEvent} _e */
  _startDrag(_e) {
    if (!this._dragEntry) return;
    this._dragging = true;

    const zone = this._dragEntry.zone;
    this._originTileX = zone.tileX;
    this._originTileY = zone.tileY;

    // Disable camera panning
    this._camera._dragDisabledByDragDrop = true;
    this._camera._dragging = false;

    // Visual: reduce alpha
    this._dragEntry.gfx.alpha = DRAG_ALPHA;

    // Raise z-index so it renders above all others
    this._dragEntry.gfx.zIndex = 100;
    this._bm.container.sortChildren();

    // Show ghost at origin
    this._hoverTileX = this._originTileX;
    this._hoverTileY = this._originTileY;
    this._hoverValid = true;
    this._drawGhost(this._originTileX, this._originTileY, zone, true);
    this._ghost.visible = true;

    // Change cursor
    this._camera.canvas.style.cursor = "grabbing";

    console.log(`[DragDrop] Started dragging: ${zone.name}`);
  }

  /** Cancel current drag, restore building to its original position. */
  _cancelDrag() {
    this._clearPressTimer();

    if (!this._dragging || !this._dragEntry) {
      this._dragEntry = null;
      return;
    }

    // Restore position
    const pos = tileToScreen(this._originTileX, this._originTileY);
    this._dragEntry.gfx.position.set(pos.x, pos.y);
    this._dragEntry.gfx.alpha = 1.0;
    this._dragEntry.gfx.zIndex = 1;
    this._bm.container.sortChildren();

    // Hide ghost
    this._ghost.visible = false;
    this._ghost.clear();

    // Re-enable camera panning
    this._camera._dragDisabledByDragDrop = false;
    this._camera.canvas.style.cursor = "default";

    this._dragging = false;
    this._dragEntry = null;

    console.log("[DragDrop] Drag cancelled");
  }

  /**
   * Execute a successful drop at the given tile coordinates.
   * If another building occupies that position, the two swap.
   * @param {number} tileX
   * @param {number} tileY
   */
  _executeDrop(tileX, tileY) {
    const draggedEntry = this._dragEntry;
    const draggedZone = draggedEntry.zone;

    // Find if another building occupies the target area
    const occupant = this._findOccupant(tileX, tileY, draggedZone);

    // Record old positions for the event and for animation
    const oldPositions = ZONE_DEFS.map((z) => ({
      id: z.id,
      tileX: z.tileX,
      tileY: z.tileY,
    }));

    if (occupant && occupant.zoneId !== draggedZone.id) {
      // Swap: move occupant to dragged building's original position
      const occupantZone = occupant.zone;
      const oldOccX = occupantZone.tileX;
      const oldOccY = occupantZone.tileY;

      // Update the zone defs (mutate in place as they are shared references)
      occupantZone.tileX = this._originTileX;
      occupantZone.tileY = this._originTileY;

      // Animate the occupant sliding to its new position
      const occupantStart = tileToScreen(oldOccX, oldOccY);
      const occupantEnd = tileToScreen(occupantZone.tileX, occupantZone.tileY);
      this._shiftAnims.set(occupant.zoneId, {
        startX: occupantStart.x,
        startY: occupantStart.y,
        endX: occupantEnd.x,
        endY: occupantEnd.y,
        elapsed: 0,
        duration: SHIFT_ANIM_MS,
      });
      this._startAnimLoop();
    }

    // Update dragged building's zone position
    draggedZone.tileX = tileX;
    draggedZone.tileY = tileY;

    // Snap building to new position
    const newPos = tileToScreen(tileX, tileY);
    draggedEntry.gfx.position.set(newPos.x, newPos.y);
    draggedEntry.gfx.alpha = 1.0;
    draggedEntry.gfx.zIndex = 1;
    this._bm.container.sortChildren();

    // Hide ghost
    this._ghost.visible = false;
    this._ghost.clear();

    // Re-enable camera
    this._camera._dragDisabledByDragDrop = false;
    this._camera.canvas.style.cursor = "default";

    this._dragging = false;
    this._dragEntry = null;

    // Build new positions map
    const newPositions = ZONE_DEFS.map((z) => ({
      id: z.id,
      tileX: z.tileX,
      tileY: z.tileY,
    }));

    // Dispatch rearranged event
    document.dispatchEvent(
      new CustomEvent("zone:rearranged", {
        detail: { oldPositions, newPositions },
      }),
    );

    // Persist via DB API
    this._persistPositions(newPositions);

    // Re-sort buildings by depth for correct painter's algorithm
    this._resortBuildings();

    console.log(
      `[DragDrop] Dropped ${draggedZone.name} at tile (${tileX}, ${tileY})`,
    );
  }

  // ── Ghost outline ───────────────────────────────────────────────

  /**
   * Draw a ghost outline at the target tile showing where the building would land.
   * @param {number} tileX
   * @param {number} tileY
   * @param {import('./zones.js').ZoneDef} zone
   * @param {boolean} valid
   */
  _drawGhost(tileX, tileY, zone, valid) {
    const gfx = this._ghost;
    gfx.clear();

    const pos = tileToScreen(tileX, tileY);
    gfx.position.set(pos.x, pos.y);

    const hw = TILE_WIDTH / 2;
    const hh = TILE_HEIGHT / 4;
    const w = zone.w;
    const h = zone.h;

    const color = valid ? GHOST_VALID_COLOR : GHOST_INVALID_COLOR;

    // Footprint diamond (filled)
    const topX = 0;
    const topY = 0;
    const rightX = w * hw;
    const rightY = w * hh;
    const botX = (w - h) * hw;
    const botY = (w + h) * hh;
    const leftX = -h * hw;
    const leftY = h * hh;

    gfx.poly([topX, topY, rightX, rightY, botX, botY, leftX, leftY]);
    gfx.fill({ color, alpha: GHOST_ALPHA });
    gfx.poly([topX, topY, rightX, rightY, botX, botY, leftX, leftY]);
    gfx.stroke({ color, alpha: GHOST_ALPHA + 0.3, width: 2 });

    gfx.visible = true;
  }

  // ── Validation ──────────────────────────────────────────────────

  /**
   * Check whether the dragged zone can be placed at (tileX, tileY).
   * A drop is valid if:
   *   - The footprint stays within grid bounds
   *   - No overlap with non-swappable buildings (only single overlap = swap)
   * @param {number} tileX
   * @param {number} tileY
   * @param {import('./zones.js').ZoneDef} zone
   * @returns {boolean}
   */
  _isValidDrop(tileX, tileY, zone) {
    // Check grid bounds (must stay within the playable area, avoid water border)
    if (tileX < 4 || tileY < 4) return false;
    if (tileX + zone.w > 36 || tileY + zone.h > 36) return false;

    // Count overlapping buildings (excluding the one being dragged)
    let overlapCount = 0;
    for (const entry of this._bm.buildings) {
      if (entry.zoneId === zone.id) continue;
      const oz = entry.zone;
      if (
        this._rectsOverlap(
          tileX,
          tileY,
          zone.w,
          zone.h,
          oz.tileX,
          oz.tileY,
          oz.w,
          oz.h,
        )
      ) {
        overlapCount++;
      }
    }

    // Allow at most one overlap (will swap with that building)
    return overlapCount <= 1;
  }

  /**
   * Find the building entry occupying the target area (if any), excluding the dragged building.
   * @param {number} tileX
   * @param {number} tileY
   * @param {import('./zones.js').ZoneDef} draggedZone
   * @returns {import('./buildings.js').BuildingSprite | null}
   */
  _findOccupant(tileX, tileY, draggedZone) {
    for (const entry of this._bm.buildings) {
      if (entry.zoneId === draggedZone.id) continue;
      const oz = entry.zone;
      if (
        this._rectsOverlap(
          tileX,
          tileY,
          draggedZone.w,
          draggedZone.h,
          oz.tileX,
          oz.tileY,
          oz.w,
          oz.h,
        )
      ) {
        return entry;
      }
    }
    return null;
  }

  /**
   * AABB overlap test for two rectangles in tile space.
   * @returns {boolean}
   */
  _rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // ── Shift animations ────────────────────────────────────────────

  /** Start the animation loop if not already running. */
  _startAnimLoop() {
    if (this._animRAF) return;
    this._lastAnimTime = performance.now();
    this._animRAF = requestAnimationFrame(this._onAnimFrame);
  }

  /** RAF callback: update all active shift animations. */
  _animateShifts(now) {
    const dt = now - this._lastAnimTime;
    this._lastAnimTime = now;

    let anyActive = false;
    for (const [zoneId, anim] of this._shiftAnims) {
      anim.elapsed += dt;
      const t = Math.min(anim.elapsed / anim.duration, 1);
      // Ease-out quad
      const eased = 1 - (1 - t) * (1 - t);

      const x = anim.startX + (anim.endX - anim.startX) * eased;
      const y = anim.startY + (anim.endY - anim.startY) * eased;

      const entry = this._bm.buildings.find((b) => b.zoneId === zoneId);
      if (entry) {
        entry.gfx.position.set(x, y);
      }

      if (t >= 1) {
        this._shiftAnims.delete(zoneId);
      } else {
        anyActive = true;
      }
    }

    if (anyActive || this._shiftAnims.size > 0) {
      this._animRAF = requestAnimationFrame(this._onAnimFrame);
    } else {
      this._animRAF = null;
    }
  }

  // ── Persistence ─────────────────────────────────────────────────

  /**
   * Persist new zone positions to the database.
   * @param {{ id: string, tileX: number, tileY: number }[]} positions
   */
  async _persistPositions(positions) {
    try {
      if (
        window.api &&
        window.api.db &&
        typeof window.api.db.updateZoneProgress === "function"
      ) {
        for (const pos of positions) {
          await window.api.db.updateZoneProgress(pos.id, {
            tileX: pos.tileX,
            tileY: pos.tileY,
          });
        }
        console.log("[DragDrop] Positions persisted to DB");
      }
    } catch (err) {
      console.warn("[DragDrop] Failed to persist positions:", err);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────

  /** Clear the long-press timer if active. */
  _clearPressTimer() {
    if (this._pressTimer) {
      clearTimeout(this._pressTimer);
      this._pressTimer = null;
    }
  }

  /**
   * Re-sort buildings by depth (tileX + tileY ascending) so the
   * painter's algorithm renders correctly after a position swap.
   */
  _resortBuildings() {
    this._bm.buildings.sort(
      (a, b) => a.zone.tileX + a.zone.tileY - (b.zone.tileX + b.zone.tileY),
    );

    // Re-order the children in the container to match
    for (let i = 0; i < this._bm.buildings.length; i++) {
      const entry = this._bm.buildings[i];
      this._bm.container.setChildIndex(entry.gfx, i);
    }
  }
}
