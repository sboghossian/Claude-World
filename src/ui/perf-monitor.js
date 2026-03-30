/**
 * perf-monitor.js — Developer performance monitoring overlay
 *
 * Toggles with Cmd+Shift+P or F12. Displays real-time FPS graph,
 * frame time, memory usage, PixiJS stats, DOM nodes, event listeners,
 * boot time, and DB query rate.
 *
 * Usage:
 *   import { PerfMonitor } from './perf-monitor.js';
 *   const perf = new PerfMonitor();
 *   perf.toggle();   // or perf.show() / perf.hide()
 */

import { getApp } from "../renderer/app.js";

// ── Constants ────────────────────────────────────────────────────────

const GRAPH_HISTORY = 120; // frames of FPS history
const GRAPH_HEIGHT = 40;
const SLOW_UPDATE_INTERVAL = 1000; // ms between "slow" metric refreshes
const FPS_GREEN = 24;
const FPS_YELLOW = 15;

// ── IPC call counter (monkey-patch hook) ─────────────────────────────

let _ipcCallCount = 0;
let _ipcCallsPerSec = 0;
let _ipcLastReset = performance.now();

/**
 * Wrap the Electron ipcRenderer.invoke / send methods to count DB calls.
 * Safe no-op if not running inside Electron.
 */
function _hookIPC() {
  try {
    const ipc = window.electronAPI ?? window.electron ?? null;
    if (!ipc) return;

    // Wrap any method that looks like an IPC call
    for (const key of Object.keys(ipc)) {
      const orig = ipc[key];
      if (typeof orig === "function") {
        ipc[key] = (...args) => {
          _ipcCallCount++;
          return orig.apply(ipc, args);
        };
      }
    }
  } catch {
    /* not in Electron — ignore */
  }
}

// ── Boot time tracking ───────────────────────────────────────────────

let _bootTime = null;

function _captureBootTime() {
  // Listen for the splash-screen fadeout as "boot complete" signal
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.removedNodes) {
        if (node.id === "splash" || node.classList?.contains("splash-screen")) {
          _bootTime = performance.now();
          observer.disconnect();
          return;
        }
      }
    }
    // Also check style changes (opacity → 0)
    for (const m of mutations) {
      if (m.type === "attributes" && m.attributeName === "style") {
        const el = m.target;
        if (
          (el.id === "splash" || el.classList?.contains("splash-screen")) &&
          (el.style.opacity === "0" || el.style.display === "none")
        ) {
          _bootTime = performance.now();
          observer.disconnect();
          return;
        }
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["style", "class"],
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

function fpsColor(fps) {
  if (fps >= FPS_GREEN) return "green";
  if (fps >= FPS_YELLOW) return "yellow";
  return "red";
}

function fpsHex(fps) {
  if (fps >= FPS_GREEN) return "#4aff8a";
  if (fps >= FPS_YELLOW) return "#ffb84a";
  return "#ff4a6a";
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

// ── PerfMonitor class ────────────────────────────────────────────────

export class PerfMonitor {
  constructor() {
    /** @type {HTMLElement|null} */
    this._el = null;
    /** @type {HTMLCanvasElement|null} */
    this._fpsCanvas = null;
    /** @type {CanvasRenderingContext2D|null} */
    this._fpsCtx = null;
    /** @type {HTMLCanvasElement|null} */
    this._memCanvas = null;
    /** @type {CanvasRenderingContext2D|null} */
    this._memCtx = null;

    this._visible = false;
    this._destroyed = false;

    // FPS tracking
    this._fpsHistory = new Float32Array(GRAPH_HISTORY);
    this._frameIdx = 0;
    this._lastFrameTs = 0;
    this._frameTimeMin = Infinity;
    this._frameTimeMax = 0;
    this._frameTimeSum = 0;
    this._frameCount = 0;

    // Memory tracking
    this._memHistory = new Float32Array(GRAPH_HISTORY);
    this._memIdx = 0;
    this._memMax = 1; // avoid div-by-zero

    // Slow-update cache
    this._slowCache = {};
    this._lastSlowUpdate = 0;

    // Drag state
    this._dragOffset = { x: 0, y: 0 };
    this._dragging = false;

    // RAF handle
    this._rafId = null;

    // Metric DOM refs (populated during _build)
    this._metricEls = {};

    // Bind handlers
    this._onKeyDown = this._onKeyDown.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
    this._tick = this._tick.bind(this);

    // Hook IPC and boot tracking
    _hookIPC();
    _captureBootTime();

    // Register keyboard shortcut
    document.addEventListener("keydown", this._onKeyDown);
  }

  // ── Public API ───────────────────────────────────────────────────

  toggle() {
    if (this._visible) this.hide();
    else this.show();
  }

  show() {
    if (this._destroyed) return;
    if (!this._el) this._build();
    this._el.classList.remove("hidden");
    this._visible = true;
    this._lastFrameTs = performance.now();
    this._frameTimeMin = Infinity;
    this._frameTimeMax = 0;
    this._frameTimeSum = 0;
    this._frameCount = 0;
    this._rafId = requestAnimationFrame(this._tick);
  }

  hide() {
    if (this._el) this._el.classList.add("hidden");
    this._visible = false;
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  destroy() {
    this._destroyed = true;
    this.hide();
    document.removeEventListener("keydown", this._onKeyDown);
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("mouseup", this._onMouseUp);
    if (this._el && this._el.parentNode) {
      this._el.parentNode.removeChild(this._el);
    }
    this._el = null;
  }

  // ── Build DOM ────────────────────────────────────────────────────

  _build() {
    const el = document.createElement("div");
    el.className = "perf-monitor hidden";

    el.innerHTML = `
      <div class="perf-monitor__header">
        <span class="perf-monitor__title">Perf Monitor</span>
        <button class="perf-monitor__close" aria-label="Close">&times;</button>
      </div>

      <div class="perf-monitor__graph-section">
        <div class="perf-monitor__graph-label">FPS</div>
        <canvas class="perf-monitor__canvas" data-graph="fps"></canvas>
      </div>

      <div class="perf-monitor__graph-section">
        <div class="perf-monitor__graph-label">Memory</div>
        <canvas class="perf-monitor__canvas" data-graph="mem"></canvas>
      </div>

      <div class="perf-monitor__metrics">
        <div class="perf-monitor__row">
          <span class="perf-monitor__label">FPS</span>
          <span class="perf-monitor__value" data-metric="fps">--</span>
        </div>
        <div class="perf-monitor__row">
          <span class="perf-monitor__label">Frame time</span>
          <span class="perf-monitor__value" data-metric="frameTime">--</span>
        </div>
        <div class="perf-monitor__row">
          <span class="perf-monitor__label">Frame min/max</span>
          <span class="perf-monitor__value" data-metric="frameMinMax">--</span>
        </div>
        <div class="perf-monitor__row">
          <span class="perf-monitor__label">JS Heap</span>
          <span class="perf-monitor__value" data-metric="memory">--</span>
        </div>
        <div class="perf-monitor__row">
          <span class="perf-monitor__label">Draw calls</span>
          <span class="perf-monitor__value" data-metric="drawCalls">--</span>
        </div>
        <div class="perf-monitor__row">
          <span class="perf-monitor__label">Textures</span>
          <span class="perf-monitor__value" data-metric="textures">--</span>
        </div>
        <div class="perf-monitor__row">
          <span class="perf-monitor__label">Containers</span>
          <span class="perf-monitor__value" data-metric="containers">--</span>
        </div>
        <div class="perf-monitor__row">
          <span class="perf-monitor__label">DOM nodes</span>
          <span class="perf-monitor__value" data-metric="domNodes">--</span>
        </div>
        <div class="perf-monitor__row">
          <span class="perf-monitor__label">Event listeners</span>
          <span class="perf-monitor__value" data-metric="listeners">--</span>
        </div>
        <div class="perf-monitor__row">
          <span class="perf-monitor__label">Boot time</span>
          <span class="perf-monitor__value" data-metric="boot">--</span>
        </div>
        <div class="perf-monitor__row">
          <span class="perf-monitor__label">DB queries/s</span>
          <span class="perf-monitor__value" data-metric="dbQps">--</span>
        </div>
      </div>

      <div class="perf-monitor__footer">
        <button class="perf-monitor__copy-btn">Copy Stats</button>
      </div>
    `;

    document.body.appendChild(el);
    this._el = el;

    // Cache metric elements
    el.querySelectorAll("[data-metric]").forEach((span) => {
      this._metricEls[span.dataset.metric] = span;
    });

    // FPS canvas
    this._fpsCanvas = el.querySelector('[data-graph="fps"]');
    this._fpsCanvas.width = 234; // 250 - 2*8 padding
    this._fpsCanvas.height = GRAPH_HEIGHT;
    this._fpsCtx = this._fpsCanvas.getContext("2d");

    // Memory canvas
    this._memCanvas = el.querySelector('[data-graph="mem"]');
    this._memCanvas.width = 234;
    this._memCanvas.height = GRAPH_HEIGHT;
    this._memCtx = this._memCanvas.getContext("2d");

    // Close button
    el.querySelector(".perf-monitor__close").addEventListener("click", () =>
      this.hide(),
    );

    // Copy button
    el.querySelector(".perf-monitor__copy-btn").addEventListener("click", () =>
      this._copyStats(),
    );

    // Drag handling on header
    const header = el.querySelector(".perf-monitor__header");
    header.addEventListener("mousedown", this._onMouseDown);
  }

  // ── Frame tick ───────────────────────────────────────────────────

  _tick(ts) {
    if (!this._visible || this._destroyed) return;

    // Calculate frame delta
    const dt = ts - this._lastFrameTs;
    this._lastFrameTs = ts;

    if (dt > 0 && dt < 1000) {
      const fps = 1000 / dt;

      // Rolling FPS history
      this._fpsHistory[this._frameIdx % GRAPH_HISTORY] = fps;
      this._frameIdx++;

      // Frame time stats
      this._frameTimeMin = Math.min(this._frameTimeMin, dt);
      this._frameTimeMax = Math.max(this._frameTimeMax, dt);
      this._frameTimeSum += dt;
      this._frameCount++;

      // Update FPS display every frame
      const avgFps = Math.round(fps);
      this._setMetric("fps", `${avgFps}`, fpsColor(avgFps));
      this._setMetric("frameTime", `${dt.toFixed(1)} ms`, fpsColor(fps));

      // Draw FPS graph
      this._drawFpsGraph();
    }

    // Slow metrics (every second)
    if (ts - this._lastSlowUpdate > SLOW_UPDATE_INTERVAL) {
      this._lastSlowUpdate = ts;
      this._updateSlowMetrics();
    }

    this._rafId = requestAnimationFrame(this._tick);
  }

  // ── FPS graph ────────────────────────────────────────────────────

  _drawFpsGraph() {
    const ctx = this._fpsCtx;
    const w = this._fpsCanvas.width;
    const h = this._fpsCanvas.height;
    const len = Math.min(this._frameIdx, GRAPH_HISTORY);

    ctx.clearRect(0, 0, w, h);

    // Background grid lines at 15 and 30 fps
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (const threshold of [15, 24, 30, 60]) {
      const y = h - (threshold / 60) * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (len < 2) return;

    const barW = w / GRAPH_HISTORY;
    const startIdx = this._frameIdx - len;

    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const fps = this._fpsHistory[(startIdx + i) % GRAPH_HISTORY];
      const x = i * barW;
      const y = h - Math.min(fps / 60, 1) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    // Gradient fill
    const lastFps = this._fpsHistory[(this._frameIdx - 1) % GRAPH_HISTORY];
    const color = fpsHex(lastFps);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Fill under curve
    const lastX = (len - 1) * barW;
    ctx.lineTo(lastX, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = color
      .replace(")", ",0.15)")
      .replace("rgb", "rgba")
      .replace("#", "");
    // Use a simpler alpha fill
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ── Memory graph ─────────────────────────────────────────────────

  _drawMemGraph(usedMB) {
    const ctx = this._memCtx;
    const w = this._memCanvas.width;
    const h = this._memCanvas.height;

    // Track history
    this._memHistory[this._memIdx % GRAPH_HISTORY] = usedMB;
    this._memIdx++;
    if (usedMB > this._memMax) this._memMax = usedMB;

    const len = Math.min(this._memIdx, GRAPH_HISTORY);

    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let frac = 0.25; frac <= 1; frac += 0.25) {
      const y = h - frac * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    if (len < 2) return;

    const barW = w / GRAPH_HISTORY;
    const startIdx = this._memIdx - len;
    const scale = this._memMax * 1.1; // 10% headroom

    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const val = this._memHistory[(startIdx + i) % GRAPH_HISTORY];
      const x = i * barW;
      const y = h - (val / scale) * h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.strokeStyle = "#4a9eff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Fill under
    const lastX = (len - 1) * barW;
    ctx.lineTo(lastX, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = "#4a9eff";
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ── Slow metrics update ──────────────────────────────────────────

  _updateSlowMetrics() {
    // Frame min/max/avg
    if (this._frameCount > 0) {
      const avg = (this._frameTimeSum / this._frameCount).toFixed(1);
      const min =
        this._frameTimeMin === Infinity ? "--" : this._frameTimeMin.toFixed(1);
      const max = this._frameTimeMax.toFixed(1);
      this._setMetric("frameMinMax", `${min} / ${max} ms`);

      // Reset for next interval
      this._frameTimeMin = Infinity;
      this._frameTimeMax = 0;
      this._frameTimeSum = 0;
      this._frameCount = 0;
    }

    // Memory (Chromium-only performance.memory)
    const mem = performance.memory;
    if (mem) {
      const usedMB = mem.usedJSHeapSize / 1048576;
      const totalMB = mem.totalJSHeapSize / 1048576;
      this._setMetric(
        "memory",
        `${usedMB.toFixed(1)} / ${totalMB.toFixed(0)} MB`,
        "blue",
      );
      this._drawMemGraph(usedMB);
    } else {
      this._setMetric("memory", "N/A");
    }

    // PixiJS stats
    this._updatePixiStats();

    // DOM nodes
    const domCount = document.querySelectorAll("*").length;
    this._setMetric("domNodes", `${domCount}`);

    // Event listeners estimate
    this._setMetric("listeners", `${this._estimateListeners()}`);

    // Boot time
    if (_bootTime !== null) {
      this._setMetric("boot", `${(_bootTime / 1000).toFixed(2)}s`, "green");
    } else {
      // Fall back to navigation timing
      const nav = performance.getEntriesByType?.("navigation")?.[0];
      if (nav) {
        this._setMetric(
          "boot",
          `${(nav.loadEventEnd / 1000).toFixed(2)}s`,
          "blue",
        );
      }
    }

    // DB queries per second
    const now = performance.now();
    const elapsed = (now - _ipcLastReset) / 1000;
    if (elapsed >= 1) {
      _ipcCallsPerSec = Math.round(_ipcCallCount / elapsed);
      _ipcCallCount = 0;
      _ipcLastReset = now;
    }
    this._setMetric(
      "dbQps",
      `${_ipcCallsPerSec}`,
      _ipcCallsPerSec > 50 ? "red" : _ipcCallsPerSec > 20 ? "yellow" : "green",
    );
  }

  // ── PixiJS stats ─────────────────────────────────────────────────

  _updatePixiStats() {
    const pixiApp = getApp();
    if (!pixiApp) {
      this._setMetric("drawCalls", "N/A");
      this._setMetric("textures", "N/A");
      this._setMetric("containers", "N/A");
      return;
    }

    // Draw calls — PixiJS v8 exposes renderer.renderPipes or lastObjectRendered
    let drawCalls = "--";
    try {
      const renderer = pixiApp.renderer;
      // v8: check for instrumentation or renderGroup info
      if (renderer.renderPipes?.batch?.renderer?._drawCallCount != null) {
        drawCalls = renderer.renderPipes.batch.renderer._drawCallCount;
      } else if (
        renderer.lastObjectRendered?.renderGroup?.structGroup?.instructionSet
          ?.instructions
      ) {
        drawCalls =
          renderer.lastObjectRendered.renderGroup.structGroup.instructionSet
            .instructions.length;
      } else if (renderer.gl) {
        // WebGL — estimate from render pipes
        drawCalls = "~";
      }
    } catch {
      /* ignore */
    }
    this._setMetric("drawCalls", `${drawCalls}`);

    // Texture count
    let texCount = "--";
    try {
      const renderer = pixiApp.renderer;
      if (renderer.texture?.managedTextures) {
        texCount = renderer.texture.managedTextures.length;
      } else if (renderer.texture?._managedTextures) {
        texCount = renderer.texture._managedTextures.length;
      }
    } catch {
      /* ignore */
    }
    this._setMetric("textures", `${texCount}`);

    // Container count (walk stage tree)
    let containerCount = 0;
    const walk = (node) => {
      containerCount++;
      if (node.children) {
        for (const child of node.children) walk(child);
      }
    };
    try {
      walk(pixiApp.stage);
    } catch {
      /* ignore */
    }
    this._setMetric("containers", `${containerCount}`);
  }

  // ── Listener estimation ──────────────────────────────────────────

  _estimateListeners() {
    // Use getEventListeners if available (Chrome DevTools protocol),
    // otherwise count elements with common event attributes
    let count = 0;
    const attrs = [
      "onclick",
      "onmousedown",
      "onmouseup",
      "onmousemove",
      "onkeydown",
      "onkeyup",
      "onchange",
      "oninput",
      "onscroll",
      "onwheel",
      "ontouchstart",
      "onpointerdown",
    ];
    const allEls = document.querySelectorAll("*");
    for (const el of allEls) {
      for (const attr of attrs) {
        if (el[attr]) count++;
      }
    }
    // Add a rough estimate for addEventListener-based listeners
    // This is inherently imprecise without Chrome DevTools protocol
    return `~${count}+`;
  }

  // ── DOM helpers ──────────────────────────────────────────────────

  _setMetric(key, value, colorClass) {
    const el = this._metricEls[key];
    if (!el) return;
    el.textContent = value;

    // Remove old color classes
    el.classList.remove(
      "perf-monitor__value--green",
      "perf-monitor__value--yellow",
      "perf-monitor__value--red",
      "perf-monitor__value--blue",
    );
    if (colorClass) {
      el.classList.add(`perf-monitor__value--${colorClass}`);
    }
  }

  // ── Copy stats to clipboard ──────────────────────────────────────

  _copyStats() {
    const lines = ["=== Claude World Perf Stats ==="];
    for (const [key, el] of Object.entries(this._metricEls)) {
      const label =
        el.closest(".perf-monitor__row")?.querySelector(".perf-monitor__label")
          ?.textContent ?? key;
      lines.push(`${label}: ${el.textContent}`);
    }
    lines.push(`Timestamp: ${new Date().toISOString()}`);
    const text = lines.join("\n");

    navigator.clipboard
      .writeText(text)
      .then(() => {
        const btn = this._el.querySelector(".perf-monitor__copy-btn");
        const orig = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => {
          btn.textContent = orig;
        }, 1200);
      })
      .catch(() => {
        console.warn("[PerfMonitor] Failed to copy to clipboard");
      });
  }

  // ── Keyboard shortcut ────────────────────────────────────────────

  _onKeyDown(e) {
    // Cmd+Shift+P (Mac) / Ctrl+Shift+P (Win)
    const modKey = e.metaKey || e.ctrlKey;
    if (modKey && e.shiftKey && e.code === "KeyP") {
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
      return;
    }
    // F12
    if (e.code === "F12") {
      e.preventDefault();
      this.toggle();
    }
  }

  // ── Drag handling ────────────────────────────────────────────────

  _onMouseDown(e) {
    if (e.button !== 0) return;
    this._dragging = true;
    const rect = this._el.getBoundingClientRect();
    this._dragOffset.x = e.clientX - rect.left;
    this._dragOffset.y = e.clientY - rect.top;
    document.addEventListener("mousemove", this._onMouseMove);
    document.addEventListener("mouseup", this._onMouseUp);
    e.preventDefault();
  }

  _onMouseMove(e) {
    if (!this._dragging || !this._el) return;
    const x = e.clientX - this._dragOffset.x;
    const y = e.clientY - this._dragOffset.y;

    // Clamp to viewport
    const maxX = window.innerWidth - this._el.offsetWidth;
    const maxY = window.innerHeight - this._el.offsetHeight;
    this._el.style.left = `${Math.max(0, Math.min(x, maxX))}px`;
    this._el.style.top = `${Math.max(0, Math.min(y, maxY))}px`;
    this._el.style.right = "auto";
  }

  _onMouseUp() {
    this._dragging = false;
    document.removeEventListener("mousemove", this._onMouseMove);
    document.removeEventListener("mouseup", this._onMouseUp);
  }
}
