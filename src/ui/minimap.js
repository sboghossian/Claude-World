/**
 * minimap.js — Standalone minimap component for Claude World
 *
 * Renders a top-down simplified view of the 40x40 isometric city grid
 * onto a small Canvas 2D element (180x140px). Shows zone buildings as
 * colored rectangles, fog of war as dimmed areas, and a white viewport
 * outline tracking the current camera position.
 *
 * Features:
 *   - Click to pan camera to that world location
 *   - Hover shows zone name tooltip
 *   - Draggable viewport rectangle
 *   - Updates at 10fps for performance
 *   - Collapsible with a chevron toggle
 *
 * Usage (from boot sequence):
 *   import { Minimap } from '../ui/minimap.js';
 *   const minimap = new Minimap(canvas, camera, buildingManager);
 *   minimap.mount();
 */

import { GRID_SIZE, TILE_WIDTH, TILE_HEIGHT } from "../renderer/constants.js";
import { ZONE_DEFS } from "../renderer/zones.js";
import { tileToScreen } from "../renderer/tiles.js";

// ── Layout constants ────────────────────────────────────────────────
const MAP_W = 180;
const MAP_H = 140;
const PADDING = 6;
const UPDATE_INTERVAL = 100; // 10fps

// ── District accent colors (CSS strings for Canvas 2D) ──────────────
const DISTRICT_COLORS = {
  core: "#4a9eff",
  business: "#4aff8a",
  advanced: "#a855f7",
  edge: "#ffb84a",
};

// Fog ring opacities (matching fog.js ring definitions)
const FOG_RING_OPACITY = [0.0, 0.0, 0.2, 0.4, 0.6];

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Map a tile coordinate to minimap pixel coordinates.
 * The full 40x40 grid maps into the padded drawing area.
 */
function tileToMinimap(tileX, tileY) {
  const drawW = MAP_W - PADDING * 2;
  const drawH = MAP_H - PADDING * 2;
  return {
    x: PADDING + (tileX / GRID_SIZE) * drawW,
    y: PADDING + (tileY / GRID_SIZE) * drawH,
  };
}

/**
 * Inverse: minimap pixel to tile coordinates.
 */
function minimapToTile(mx, my) {
  const drawW = MAP_W - PADDING * 2;
  const drawH = MAP_H - PADDING * 2;
  return {
    tileX: ((mx - PADDING) / drawW) * GRID_SIZE,
    tileY: ((my - PADDING) / drawH) * GRID_SIZE,
  };
}

/**
 * Chebyshev distance from grid center — determines fog ring.
 */
function tileRing(tx, ty) {
  const cx = GRID_SIZE / 2;
  const cy = GRID_SIZE / 2;
  const dist = Math.max(Math.abs(tx - cx), Math.abs(ty - cy));
  if (dist < 5) return 0;
  if (dist < 10) return 1;
  if (dist < 15) return 2;
  if (dist < 20) return 3;
  return 4;
}

/**
 * Create a DOM element with an optional class name.
 */
function el(tag, cls) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}

// ── Minimap class ───────────────────────────────────────────────────

export class Minimap {
  /**
   * @param {HTMLCanvasElement} worldCanvas  - The main PixiJS canvas (for size reference)
   * @param {import('../renderer/camera.js').Camera} camera - Camera instance
   * @param {import('../renderer/buildings.js').BuildingManager} buildingManager
   */
  constructor(worldCanvas, camera, buildingManager) {
    /** @type {HTMLCanvasElement} */
    this._worldCanvas = worldCanvas;
    /** @type {import('../renderer/camera.js').Camera} */
    this._camera = camera;
    /** @type {import('../renderer/buildings.js').BuildingManager} */
    this._buildingManager = buildingManager;

    // State
    this._collapsed = false;
    this._mounted = false;
    this._hoveredZone = null;
    this._dragging = false;
    this._updateTimer = null;

    // DOM references (created in mount)
    this._root = null;
    this._body = null;
    this._canvas = null;
    this._ctx = null;
    this._tooltip = null;
    this._tooltipDot = null;
    this._tooltipText = null;

    // Pre-compute zone lookup
    this._zoneMap = new Map();
    for (const z of ZONE_DEFS) {
      this._zoneMap.set(z.id, z);
    }

    // Bind handlers
    this._onCanvasClick = this._onCanvasClick.bind(this);
    this._onCanvasMove = this._onCanvasMove.bind(this);
    this._onCanvasLeave = this._onCanvasLeave.bind(this);
    this._onCanvasDown = this._onCanvasDown.bind(this);
    this._onWindowMove = this._onWindowMove.bind(this);
    this._onWindowUp = this._onWindowUp.bind(this);
    this._onToggle = this._onToggle.bind(this);
    this._onKeydown = this._onKeydown.bind(this);
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Create DOM, attach to body, start update loop.
   */
  mount() {
    if (this._mounted) return;
    this._mounted = true;

    this._buildDOM();
    this._bindEvents();
    this._startUpdateLoop();
    this._render();

    console.log("[Minimap] Mounted");
  }

  /**
   * Force an immediate redraw (called externally if needed).
   */
  update() {
    if (this._mounted) this._render();
  }

  /**
   * Remove DOM, stop timers, unbind events.
   */
  destroy() {
    if (!this._mounted) return;
    this._mounted = false;

    this._stopUpdateLoop();
    this._unbindEvents();

    if (this._root && this._root.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }

    this._root = null;
    this._canvas = null;
    this._ctx = null;
    console.log("[Minimap] Destroyed");
  }

  // ── DOM construction ────────────────────────────────────────────

  _buildDOM() {
    // Root container
    this._root = el("div", "minimap");
    this._root.setAttribute("role", "navigation");
    this._root.setAttribute("aria-label", "World minimap");

    // Toggle button
    const toggle = el("button", "minimap__toggle");
    toggle.setAttribute("aria-label", "Toggle minimap");
    toggle.title = "Toggle minimap";
    const chevron = el("span", "minimap__toggle-icon");
    chevron.textContent = "\u25BC"; // down-pointing triangle
    toggle.appendChild(chevron);
    this._toggleBtn = toggle;

    // Body (canvas wrapper)
    this._body = el("div", "minimap__body");

    // Canvas
    this._canvas = document.createElement("canvas");
    this._canvas.className = "minimap__canvas";
    this._canvas.width = MAP_W;
    this._canvas.height = MAP_H;
    this._ctx = this._canvas.getContext("2d");

    // Tooltip
    this._tooltip = el("div", "minimap__tooltip");
    this._tooltipDot = el("span", "minimap__tooltip__dot");
    this._tooltipText = document.createTextNode("");
    this._tooltip.appendChild(this._tooltipDot);
    this._tooltip.appendChild(this._tooltipText);

    // Label
    const label = el("span", "minimap__label");
    label.textContent = "MAP";

    // Assemble
    this._body.appendChild(this._canvas);
    this._body.appendChild(this._tooltip);
    this._body.appendChild(label);
    this._root.appendChild(toggle);
    this._root.appendChild(this._body);
    document.body.appendChild(this._root);
  }

  // ── Event binding ───────────────────────────────────────────────

  _bindEvents() {
    this._canvas.addEventListener("click", this._onCanvasClick);
    this._canvas.addEventListener("mousemove", this._onCanvasMove);
    this._canvas.addEventListener("mouseleave", this._onCanvasLeave);
    this._canvas.addEventListener("mousedown", this._onCanvasDown);
    window.addEventListener("mousemove", this._onWindowMove);
    window.addEventListener("mouseup", this._onWindowUp);
    this._toggleBtn.addEventListener("click", this._onToggle);
    document.addEventListener("keydown", this._onKeydown);
  }

  _unbindEvents() {
    if (this._canvas) {
      this._canvas.removeEventListener("click", this._onCanvasClick);
      this._canvas.removeEventListener("mousemove", this._onCanvasMove);
      this._canvas.removeEventListener("mouseleave", this._onCanvasLeave);
      this._canvas.removeEventListener("mousedown", this._onCanvasDown);
    }
    window.removeEventListener("mousemove", this._onWindowMove);
    window.removeEventListener("mouseup", this._onWindowUp);
    if (this._toggleBtn) {
      this._toggleBtn.removeEventListener("click", this._onToggle);
    }
    document.removeEventListener("keydown", this._onKeydown);
  }

  // ── Update loop (10fps) ─────────────────────────────────────────

  _startUpdateLoop() {
    this._updateTimer = setInterval(() => {
      if (!this._collapsed) this._render();
    }, UPDATE_INTERVAL);
  }

  _stopUpdateLoop() {
    if (this._updateTimer !== null) {
      clearInterval(this._updateTimer);
      this._updateTimer = null;
    }
  }

  // ── Rendering ───────────────────────────────────────────────────

  _render() {
    const ctx = this._ctx;
    if (!ctx) return;

    ctx.clearRect(0, 0, MAP_W, MAP_H);

    this._drawFog(ctx);
    this._drawGrid(ctx);
    this._drawBuildings(ctx);
    this._drawViewport(ctx);
  }

  /**
   * Draw fog of war — dimmed overlay per ring.
   */
  _drawFog(ctx) {
    const drawW = MAP_W - PADDING * 2;
    const drawH = MAP_H - PADDING * 2;
    // Tile size in minimap pixels
    const tw = drawW / GRID_SIZE;
    const th = drawH / GRID_SIZE;

    // Build a set of active zone tiles (they punch through fog)
    const activeTiles = new Set();
    for (const zone of ZONE_DEFS) {
      const entry = this._buildingManager.buildings.find(
        (b) => b.zoneId === zone.id,
      );
      const isActive = entry ? entry.progress > 0 : zone.active;
      if (isActive) {
        for (let dx = 0; dx < zone.w; dx++) {
          for (let dy = 0; dy < zone.h; dy++) {
            activeTiles.add(`${zone.tileX + dx},${zone.tileY + dy}`);
          }
        }
      }
    }

    // Draw fog in coarse 4x4 tile blocks for performance
    const blockSize = 4;
    for (let bx = 0; bx < GRID_SIZE; bx += blockSize) {
      for (let by = 0; by < GRID_SIZE; by += blockSize) {
        const ring = tileRing(bx + blockSize / 2, by + blockSize / 2);
        const opacity = FOG_RING_OPACITY[ring] || 0;
        if (opacity <= 0) continue;

        // Check if any active tile is in this block
        let hasActive = false;
        for (let dx = 0; dx < blockSize && !hasActive; dx++) {
          for (let dy = 0; dy < blockSize && !hasActive; dy++) {
            if (activeTiles.has(`${bx + dx},${by + dy}`)) hasActive = true;
          }
        }
        if (hasActive) continue;

        const px = PADDING + (bx / GRID_SIZE) * drawW;
        const py = PADDING + (by / GRID_SIZE) * drawH;
        const pw = (blockSize / GRID_SIZE) * drawW;
        const ph = (blockSize / GRID_SIZE) * drawH;

        ctx.fillStyle = `rgba(10, 10, 30, ${opacity})`;
        ctx.fillRect(px, py, pw, ph);
      }
    }
  }

  /**
   * Draw a subtle background grid.
   */
  _drawGrid(ctx) {
    const drawW = MAP_W - PADDING * 2;
    const drawH = MAP_H - PADDING * 2;

    ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
    ctx.lineWidth = 0.5;

    // Draw lines every 8 tiles
    const step = 8;
    for (let t = 0; t <= GRID_SIZE; t += step) {
      const px = PADDING + (t / GRID_SIZE) * drawW;
      const py = PADDING + (t / GRID_SIZE) * drawH;

      ctx.beginPath();
      ctx.moveTo(px, PADDING);
      ctx.lineTo(px, PADDING + drawH);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(PADDING, py);
      ctx.lineTo(PADDING + drawW, py);
      ctx.stroke();
    }
  }

  /**
   * Draw each zone building as a colored rectangle.
   */
  _drawBuildings(ctx) {
    const drawW = MAP_W - PADDING * 2;
    const drawH = MAP_H - PADDING * 2;
    const tileW = drawW / GRID_SIZE;
    const tileH = drawH / GRID_SIZE;

    for (const zone of ZONE_DEFS) {
      const entry = this._buildingManager.buildings.find(
        (b) => b.zoneId === zone.id,
      );
      const progress = entry ? entry.progress : zone.active ? 1.0 : 0.0;
      const isActive = progress > 0;
      const isHovered = this._hoveredZone && this._hoveredZone.id === zone.id;

      const px = PADDING + (zone.tileX / GRID_SIZE) * drawW;
      const py = PADDING + (zone.tileY / GRID_SIZE) * drawH;
      const pw = zone.w * tileW;
      const ph = zone.h * tileH;

      if (isActive) {
        const color = DISTRICT_COLORS[zone.district] || "#4a9eff";

        // Glow
        ctx.shadowColor = color;
        ctx.shadowBlur = isHovered ? 8 : 4;

        // Fill with progress-based alpha
        const alpha = 0.4 + progress * 0.5;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fillRect(px, py, pw, ph);

        // Border
        ctx.globalAlpha = 0.7 + progress * 0.3;
        ctx.strokeStyle = color;
        ctx.lineWidth = isHovered ? 1.5 : 0.8;
        ctx.strokeRect(px, py, pw, ph);

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;
      } else {
        // Locked zone — dim dot
        ctx.globalAlpha = isHovered ? 0.4 : 0.2;
        ctx.fillStyle = "#555570";
        ctx.fillRect(px, py, pw, ph);

        ctx.globalAlpha = isHovered ? 0.5 : 0.25;
        ctx.strokeStyle = "#555570";
        ctx.lineWidth = 0.5;
        ctx.strokeRect(px, py, pw, ph);

        ctx.globalAlpha = 1.0;
      }
    }
  }

  /**
   * Draw the camera viewport as a white dashed rectangle.
   */
  _drawViewport(ctx) {
    const cam = this._camera;
    if (!cam) return;

    // The camera stores world-space offsets: cam.x, cam.y (negative of world center),
    // and cam.zoom. The canvas is screenW x screenH.
    const screenW = this._worldCanvas.width || window.innerWidth;
    const screenH = this._worldCanvas.height || window.innerHeight;

    // Visible world-space rectangle:
    // world position = (screenPos - canvas/2) / zoom - cam.{x,y}
    // Top-left corner in world coords:
    const worldLeft = -cam.x - screenW / 2 / cam.zoom;
    const worldTop = -cam.y - screenH / 2 / cam.zoom;
    const worldRight = -cam.x + screenW / 2 / cam.zoom;
    const worldBottom = -cam.y + screenH / 2 / cam.zoom;

    // Convert world coords to tile coords (inverse of tileToScreen).
    // tileToScreen: x = (tX - tY) * (TW/2), y = (tX + tY) * (TH/4)
    // Inverse: tX = x/(TW/2)/2 + y/(TH/4)/2 = x/TW + 2y/TH
    //          tY = 2y/TH - x/TW
    const hw = TILE_WIDTH;
    const hh = TILE_HEIGHT;
    const worldToTile = (wx, wy) => ({
      tileX: wx / hw + (2 * wy) / hh,
      tileY: (2 * wy) / hh - wx / hw,
    });

    const tl = worldToTile(worldLeft, worldTop);
    const br = worldToTile(worldRight, worldBottom);

    // Map tile coords to minimap pixels
    const mTL = tileToMinimap(tl.tileX, tl.tileY);
    const mBR = tileToMinimap(br.tileX, br.tileY);

    const rx = mTL.x;
    const ry = mTL.y;
    const rw = mBR.x - mTL.x;
    const rh = mBR.y - mTL.y;

    // Dashed white rectangle
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.setLineDash([]);

    // Subtle fill
    ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
    ctx.fillRect(rx, ry, rw, rh);
    ctx.restore();
  }

  // ── Interaction: click to pan ───────────────────────────────────

  _onCanvasClick(e) {
    if (this._dragging) return; // Ignore click after drag

    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const { tileX, tileY } = minimapToTile(mx, my);
    this._panCameraToTile(tileX, tileY);
  }

  /**
   * Pan camera so the given tile is centered.
   */
  _panCameraToTile(tileX, tileY) {
    const cam = this._camera;
    if (!cam) return;

    const screenPos = tileToScreen(tileX, tileY);
    cam.targetX = -screenPos.x;
    cam.targetY = -screenPos.y;
    cam._followTarget = null; // Break any follow

    // Dispatch event for other systems
    document.dispatchEvent(
      new CustomEvent("camera:pan-to", {
        detail: { tileX, tileY, worldX: screenPos.x, worldY: screenPos.y },
        bubbles: true,
      }),
    );
  }

  // ── Interaction: hover tooltip ──────────────────────────────────

  _onCanvasMove(e) {
    if (this._dragging) return;

    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const hit = this._hitTestZone(mx, my);

    if (hit && hit !== this._hoveredZone) {
      this._hoveredZone = hit;
      this._showTooltip(mx, my, hit);
    } else if (!hit && this._hoveredZone) {
      this._hoveredZone = null;
      this._hideTooltip();
    } else if (hit) {
      // Update tooltip position
      this._positionTooltip(mx, my);
    }
  }

  _onCanvasLeave() {
    if (this._hoveredZone) {
      this._hoveredZone = null;
      this._hideTooltip();
    }
  }

  /**
   * Hit-test zones at a minimap pixel coordinate.
   * @returns {import('../renderer/zones.js').ZoneDef | null}
   */
  _hitTestZone(mx, my) {
    const drawW = MAP_W - PADDING * 2;
    const drawH = MAP_H - PADDING * 2;
    const tileW = drawW / GRID_SIZE;
    const tileH = drawH / GRID_SIZE;

    for (const zone of ZONE_DEFS) {
      const px = PADDING + (zone.tileX / GRID_SIZE) * drawW;
      const py = PADDING + (zone.tileY / GRID_SIZE) * drawH;
      const pw = zone.w * tileW;
      const ph = zone.h * tileH;

      // Expand hit area slightly for small buildings
      const pad = 2;
      if (
        mx >= px - pad &&
        mx <= px + pw + pad &&
        my >= py - pad &&
        my <= py + ph + pad
      ) {
        return zone;
      }
    }
    return null;
  }

  _showTooltip(mx, my, zone) {
    const color = zone.active
      ? DISTRICT_COLORS[zone.district] || "#4a9eff"
      : "#555570";

    this._tooltipDot.style.background = color;
    this._tooltipText.textContent = zone.name;
    this._tooltip.classList.add("minimap__tooltip--visible");
    this._positionTooltip(mx, my);
  }

  _positionTooltip(mx, my) {
    // Position tooltip above the cursor, clamp to body bounds
    let tx = mx + 8;
    let ty = my - 24;
    if (tx + 100 > MAP_W) tx = mx - 100;
    if (ty < 0) ty = my + 12;

    this._tooltip.style.left = `${tx}px`;
    this._tooltip.style.top = `${ty}px`;
  }

  _hideTooltip() {
    this._tooltip.classList.remove("minimap__tooltip--visible");
  }

  // ── Interaction: draggable viewport ─────────────────────────────

  _onCanvasDown(e) {
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Check if click is inside viewport rectangle
    if (this._isInsideViewport(mx, my)) {
      e.preventDefault();
      e.stopPropagation();
      this._dragging = true;
      this._dragStartMX = mx;
      this._dragStartMY = my;
      this._dragStartCamX = this._camera.targetX;
      this._dragStartCamY = this._camera.targetY;
      this._body.classList.add("minimap__body--dragging");
    }
  }

  _onWindowMove(e) {
    if (!this._dragging || !this._canvas) return;

    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const dmx = mx - this._dragStartMX;
    const dmy = my - this._dragStartMY;

    // Convert minimap pixel delta to tile delta
    const drawW = MAP_W - PADDING * 2;
    const drawH = MAP_H - PADDING * 2;
    const dtileX = (dmx / drawW) * GRID_SIZE;
    const dtileY = (dmy / drawH) * GRID_SIZE;

    // Convert tile delta to world-space delta
    const worldDX = (dtileX - dtileY) * (TILE_WIDTH / 2);
    const worldDY = (dtileX + dtileY) * (TILE_HEIGHT / 4);

    // Camera position is negative world offset
    this._camera.targetX = this._dragStartCamX - worldDX;
    this._camera.targetY = this._dragStartCamY - worldDY;
    this._camera._followTarget = null;
  }

  _onWindowUp() {
    if (this._dragging) {
      // Small delay to prevent the click handler from firing
      setTimeout(() => {
        this._dragging = false;
      }, 50);
      this._body.classList.remove("minimap__body--dragging");
    }
  }

  /**
   * Check if a minimap pixel is inside the current viewport rectangle.
   */
  _isInsideViewport(mx, my) {
    const cam = this._camera;
    if (!cam) return false;

    const screenW = this._worldCanvas.width || window.innerWidth;
    const screenH = this._worldCanvas.height || window.innerHeight;

    const worldLeft = -cam.x - screenW / 2 / cam.zoom;
    const worldTop = -cam.y - screenH / 2 / cam.zoom;
    const worldRight = -cam.x + screenW / 2 / cam.zoom;
    const worldBottom = -cam.y + screenH / 2 / cam.zoom;

    const hw = TILE_WIDTH;
    const hh = TILE_HEIGHT;
    const worldToTile = (wx, wy) => ({
      tileX: wx / hw + (2 * wy) / hh,
      tileY: (2 * wy) / hh - wx / hw,
    });

    const tl = worldToTile(worldLeft, worldTop);
    const br = worldToTile(worldRight, worldBottom);

    const mTL = tileToMinimap(tl.tileX, tl.tileY);
    const mBR = tileToMinimap(br.tileX, br.tileY);

    return mx >= mTL.x && mx <= mBR.x && my >= mTL.y && my <= mBR.y;
  }

  // ── Toggle collapse ─────────────────────────────────────────────

  _onToggle(e) {
    e.stopPropagation();
    this._collapsed = !this._collapsed;
    this._root.classList.toggle("minimap--collapsed", this._collapsed);
  }

  _onKeydown(e) {
    // Cmd/Ctrl + Shift + M toggles minimap
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "m") {
      e.preventDefault();
      this._onToggle(e);
    }
  }
}
