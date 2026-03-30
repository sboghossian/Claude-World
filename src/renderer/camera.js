/**
 * camera.js - Camera system for the Claude World isometric renderer
 *
 * Provides pan (drag / WASD / arrows), zoom (scroll / pinch),
 * follow mode with lerp easing, and edge clamping.
 * Manipulates a PixiJS Container's position and scale.
 */

import {
  ZOOM_MIN, ZOOM_MAX, ZOOM_SPEED, PAN_SPEED,
  FOLLOW_EASING, CAMERA_LERP_SPEED,
  TILE_WIDTH, TILE_HEIGHT, GRID_SIZE,
} from './constants.js';
import { tileToScreen } from './tiles.js';

export class Camera {
  /**
   * @param {import('pixi.js').Container} worldContainer - The root world container to transform
   * @param {HTMLCanvasElement} canvas - The canvas element for event binding
   */
  constructor(worldContainer, canvas) {
    /** @type {import('pixi.js').Container} */
    this.world = worldContainer;
    /** @type {HTMLCanvasElement} */
    this.canvas = canvas;

    // Camera state
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.zoom = 1.0;
    this.targetZoom = 1.0;

    // Drag state
    this._dragging = false;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._camStartX = 0;
    this._camStartY = 0;

    // Follow target
    this._followTarget = null;

    // External drag-drop lock (set by DragDropSystem)
    this._dragDisabledByDragDrop = false;

    // Key state
    this._keys = new Set();

    // Compute world bounds (in screen-space pixels)
    const topLeft = tileToScreen(0, 0);
    const topRight = tileToScreen(GRID_SIZE, 0);
    const bottomLeft = tileToScreen(0, GRID_SIZE);
    const bottomRight = tileToScreen(GRID_SIZE, GRID_SIZE);
    this._worldMinX = topLeft.x - TILE_WIDTH;
    this._worldMaxX = topRight.x + TILE_WIDTH;
    this._worldMinY = topLeft.y - TILE_HEIGHT;
    this._worldMaxY = bottomRight.y + TILE_HEIGHT;

    this._bindEvents();
    this.goHome();
  }

  /** Snap camera to center of map (Dispatch Tower area). */
  goHome() {
    // Center on tile (22, 22) — middle of Dispatch Tower
    const center = tileToScreen(22, 22);
    this.targetX = -center.x;
    this.targetY = -center.y;
    this.targetZoom = 1.0;
  }

  /**
   * Follow an entity with lerp easing.
   * @param {{ x: number, y: number } | null} target - Object with screen-space x, y
   */
  follow(target) {
    this._followTarget = target;
  }

  /** Stop following. */
  unfollow() {
    this._followTarget = null;
  }

  /**
   * Update camera each frame. Call from the main loop.
   * @param {number} _dt - Delta time (unused currently, lerp is frame-based)
   */
  update(_dt) {
    // ── Keyboard panning ──────────────────────────────────────────
    const speed = PAN_SPEED / this.zoom;
    if (this._keys.has('ArrowLeft') || this._keys.has('KeyA'))  this.targetX += speed;
    if (this._keys.has('ArrowRight') || this._keys.has('KeyD')) this.targetX -= speed;
    if (this._keys.has('ArrowUp') || this._keys.has('KeyW'))    this.targetY += speed;
    if (this._keys.has('ArrowDown') || this._keys.has('KeyS'))  this.targetY -= speed;

    // ── Follow mode ───────────────────────────────────────────────
    if (this._followTarget) {
      this.targetX = -this._followTarget.x;
      this.targetY = -this._followTarget.y;
    }

    // ── Edge clamping ─────────────────────────────────────────────
    const hw = this.canvas.width / (2 * this.targetZoom);
    const hh = this.canvas.height / (2 * this.targetZoom);

    this.targetX = Math.max(-this._worldMaxX + hw, Math.min(-this._worldMinX - hw, this.targetX));
    this.targetY = Math.max(-this._worldMaxY + hh, Math.min(-this._worldMinY - hh, this.targetY));

    // ── Smooth lerp to target ─────────────────────────────────────
    const lerp = this._followTarget ? FOLLOW_EASING : CAMERA_LERP_SPEED;
    this.x += (this.targetX - this.x) * lerp;
    this.y += (this.targetY - this.y) * lerp;
    this.zoom += (this.targetZoom - this.zoom) * CAMERA_LERP_SPEED;

    // ── Apply to world container ──────────────────────────────────
    this.world.scale.set(this.zoom);
    this.world.position.set(
      this.canvas.width / 2 + this.x * this.zoom,
      this.canvas.height / 2 + this.y * this.zoom,
    );
  }

  /**
   * Convert screen (mouse) coordinates to world coordinates.
   * @param {number} screenX
   * @param {number} screenY
   * @returns {{ x: number, y: number }}
   */
  screenToWorld(screenX, screenY) {
    return {
      x: (screenX - this.world.position.x) / this.zoom,
      y: (screenY - this.world.position.y) / this.zoom,
    };
  }

  // ── Private: event binding ──────────────────────────────────────

  _bindEvents() {
    const c = this.canvas;

    // ── Mouse drag ────────────────────────────────────────────────
    c.addEventListener('pointerdown', (e) => {
      // Only start drag on primary button on empty space
      if (e.button !== 0) return;
      if (this._dragDisabledByDragDrop) return;
      this._dragging = true;
      this._dragStartX = e.clientX;
      this._dragStartY = e.clientY;
      this._camStartX = this.targetX;
      this._camStartY = this.targetY;
      this._followTarget = null; // Break follow on manual pan
    });

    window.addEventListener('pointermove', (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - this._dragStartX;
      const dy = e.clientY - this._dragStartY;
      this.targetX = this._camStartX + dx / this.zoom;
      this.targetY = this._camStartY + dy / this.zoom;
    });

    window.addEventListener('pointerup', () => {
      this._dragging = false;
    });

    // ── Scroll zoom ───────────────────────────────────────────────
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const direction = e.deltaY > 0 ? -1 : 1;
      this.targetZoom = Math.max(
        ZOOM_MIN,
        Math.min(ZOOM_MAX, this.targetZoom + direction * ZOOM_SPEED),
      );
    }, { passive: false });

    // ── Keyboard ──────────────────────────────────────────────────
    window.addEventListener('keydown', (e) => {
      this._keys.add(e.code);
      // Home key shortcut
      if (e.code === 'KeyH') this.goHome();
    });
    window.addEventListener('keyup', (e) => {
      this._keys.delete(e.code);
    });
  }
}
