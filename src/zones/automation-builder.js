/**
 * automation-builder.js — Visual Workflow Builder zone
 *
 * Canvas 2D node-based workflow editor with drag-and-drop palette,
 * bezier connections, properties panel, and execution visualization.
 *
 * Emits:
 *   dispatch:task-complete — { worldId, zoneType, success }
 *
 * Vanilla JS + CSS. Pairs with automation-builder.css.
 */

// ── Node type definitions ───────────────────────────────────────────

const NODE_CATEGORIES = {
  trigger: {
    label: "Trigger",
    color: "#4aff8a",
    items: [
      { type: "trigger", subtype: "on_schedule", label: "On schedule" },
      { type: "trigger", subtype: "on_zone_event", label: "On zone event" },
      {
        type: "trigger",
        subtype: "on_task_complete",
        label: "On task complete",
      },
      { type: "trigger", subtype: "manual", label: "Manual" },
    ],
  },
  action: {
    label: "AI Action",
    color: "#4a9eff",
    items: [
      { type: "action", subtype: "dispatch_task", label: "Dispatch task" },
      { type: "action", subtype: "ask_claude", label: "Ask Claude" },
      { type: "action", subtype: "summarize", label: "Summarize" },
      { type: "action", subtype: "classify", label: "Classify" },
    ],
  },
  data: {
    label: "Data",
    color: "#a855f7",
    items: [
      { type: "data", subtype: "read_zone", label: "Read from zone" },
      { type: "data", subtype: "write_zone", label: "Write to zone" },
      { type: "data", subtype: "transform", label: "Transform" },
      { type: "data", subtype: "filter", label: "Filter" },
    ],
  },
  control: {
    label: "Control",
    color: "#ffb84a",
    items: [
      { type: "control", subtype: "if_else", label: "If/else branch" },
      { type: "control", subtype: "loop", label: "Loop" },
      { type: "control", subtype: "delay", label: "Delay" },
      { type: "control", subtype: "parallel", label: "Parallel" },
    ],
  },
  output: {
    label: "Output",
    color: "#ff4a6a",
    items: [
      { type: "output", subtype: "notify", label: "Send notification" },
      { type: "output", subtype: "archive", label: "Save to archive" },
      { type: "output", subtype: "broadcast", label: "Broadcast" },
      { type: "output", subtype: "export", label: "Export" },
    ],
  },
};

const NODE_WIDTH = 160;
const NODE_HEIGHT = 56;
const PORT_RADIUS = 6;
const GRID_SIZE = 20;

function colorForType(type) {
  return NODE_CATEGORIES[type]?.color ?? "#888";
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function snapToGrid(v) {
  return Math.round(v / GRID_SIZE) * GRID_SIZE;
}

// ── AutomationBuilder class ─────────────────────────────────────────

export class AutomationBuilder {
  constructor(container, options = {}) {
    this._container = container;
    this._worldId = options.worldId || null;

    // Workflow data
    this._workflows = [];
    this._activeWorkflowId = null;
    this._nodes = [];
    this._connections = [];

    // Canvas state
    this._zoom = 1;
    this._panX = 0;
    this._panY = 0;
    this._draggingNode = null;
    this._dragOffsetX = 0;
    this._dragOffsetY = 0;
    this._connectingFrom = null;
    this._connectingMouse = null;
    this._isPanning = false;
    this._panStartX = 0;
    this._panStartY = 0;
    this._selectedNodeId = null;
    this._executing = false;
    this._executingNodeId = null;

    // Palette drag state
    this._paletteDrag = null;

    this._injectCSS();
    this._build();
    this._bindEvents();

    if (this._worldId) {
      this.init(this._worldId);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Build and return the root element (for external mounting).
   * @returns {HTMLElement}
   */
  render() {
    return this._container;
  }

  /**
   * Load workflows for a world.
   * @param {string} worldId
   */
  async init(worldId) {
    this._worldId = worldId;
    await this._loadWorkflows();
    this._renderWorkflowList();
    if (this._workflows.length > 0) {
      this._loadWorkflowIntoCanvas(this._workflows[0]);
    }
    this._draw();
  }

  destroy() {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    this._container.innerHTML = "";
    this._container.classList.remove("automation-builder");
  }

  // ═══════════════════════════════════════════════════════════════════
  // CSS injection
  // ═══════════════════════════════════════════════════════════════════

  _injectCSS() {
    const id = "automation-builder-styles";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "src/zones/automation-builder.css";
    document.head.appendChild(link);
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOM construction
  // ═══════════════════════════════════════════════════════════════════

  _build() {
    this._container.innerHTML = "";
    this._container.classList.add("automation-builder");
    this._container.setAttribute("role", "region");
    this._container.setAttribute("aria-label", "Automation Builder");

    // ── Left sidebar ──
    this._sidebarEl = this._el("div", "ab-sidebar");

    const header = this._el("div", "ab-sidebar__header");
    const title = this._el("div", "ab-sidebar__title");
    title.textContent = "Workflow Builder";
    const subtitle = this._el("div", "ab-sidebar__subtitle");
    subtitle.textContent = "Drag nodes onto the canvas";
    header.appendChild(title);
    header.appendChild(subtitle);
    this._sidebarEl.appendChild(header);

    // Palette
    this._paletteEl = this._el("div", "ab-palette");
    this._buildPalette();
    this._sidebarEl.appendChild(this._paletteEl);

    // Workflow list
    this._workflowListEl = this._el("div", "ab-workflows");
    const wfLabel = this._el("div", "ab-workflows__label");
    wfLabel.textContent = "Saved Workflows";
    this._workflowListEl.appendChild(wfLabel);
    this._workflowListInner = this._el("div", "ab-workflows__inner");
    this._workflowListEl.appendChild(this._workflowListInner);
    this._sidebarEl.appendChild(this._workflowListEl);

    this._container.appendChild(this._sidebarEl);

    // ── Canvas area ──
    this._canvasArea = this._el("div", "ab-canvas-area");

    this._canvas = document.createElement("canvas");
    this._canvas.className = "ab-canvas";
    this._ctx = this._canvas.getContext("2d");
    this._canvasArea.appendChild(this._canvas);

    // Toolbar
    this._toolbar = this._el("div", "ab-canvas-toolbar");

    this._runBtn = this._el("button", "ab-toolbar-btn ab-toolbar-btn--run");
    this._runBtn.textContent = "Run";
    this._toolbar.appendChild(this._runBtn);

    this._saveBtn = this._el("button", "ab-toolbar-btn ab-toolbar-btn--save");
    this._saveBtn.textContent = "Save";
    this._toolbar.appendChild(this._saveBtn);

    this._newBtn = this._el("button", "ab-toolbar-btn");
    this._newBtn.textContent = "+ New";
    this._toolbar.appendChild(this._newBtn);

    this._zoomLabel = this._el("span", "ab-zoom-label");
    this._zoomLabel.textContent = "100%";
    this._toolbar.appendChild(this._zoomLabel);

    this._canvasArea.appendChild(this._toolbar);
    this._container.appendChild(this._canvasArea);

    // ── Properties panel ──
    this._propsEl = this._el("div", "ab-props ab-props--hidden");

    this._propsHeader = this._el("div", "ab-props__header");
    this._propsTitle = this._el("div", "ab-props__title");
    this._propsTitle.textContent = "Properties";
    this._propsClose = this._el("button", "ab-props__close");
    this._propsClose.textContent = "\u2715";
    this._propsHeader.appendChild(this._propsTitle);
    this._propsHeader.appendChild(this._propsClose);
    this._propsEl.appendChild(this._propsHeader);

    this._propsBody = this._el("div", "ab-props__body");
    this._propsBody.innerHTML =
      '<div class="ab-props__empty">Select a node to edit</div>';
    this._propsEl.appendChild(this._propsBody);

    this._container.appendChild(this._propsEl);
  }

  _buildPalette() {
    this._paletteEl.innerHTML = "";
    for (const [catKey, cat] of Object.entries(NODE_CATEGORIES)) {
      const label = this._el("div", "ab-palette__group-label");
      label.textContent = cat.label;
      this._paletteEl.appendChild(label);

      for (const item of cat.items) {
        const row = this._el("div", "ab-palette__item");
        row.dataset.nodeType = item.type;
        row.dataset.nodeSubtype = item.subtype;
        row.setAttribute("draggable", "true");

        const dot = this._el(
          "span",
          `ab-palette__dot ab-palette__dot--${catKey}`,
        );
        row.appendChild(dot);

        const text = document.createTextNode(item.label);
        row.appendChild(text);

        this._paletteEl.appendChild(row);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Events
  // ═══════════════════════════════════════════════════════════════════

  _bindEvents() {
    // Resize canvas
    this._resizeObserver = new ResizeObserver(() => this._resizeCanvas());
    this._resizeObserver.observe(this._canvasArea);

    // Palette drag
    this._paletteEl.addEventListener("dragstart", (e) => {
      const item = e.target.closest(".ab-palette__item");
      if (!item) return;
      e.dataTransfer.setData(
        "text/plain",
        JSON.stringify({
          type: item.dataset.nodeType,
          subtype: item.dataset.nodeSubtype,
        }),
      );
      e.dataTransfer.effectAllowed = "copy";
    });

    // Canvas drop
    this._canvas.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    });

    this._canvas.addEventListener("drop", (e) => {
      e.preventDefault();
      let data;
      try {
        data = JSON.parse(e.dataTransfer.getData("text/plain"));
      } catch {
        return;
      }
      if (!data.type || !data.subtype) return;

      const rect = this._canvas.getBoundingClientRect();
      const cx = (e.clientX - rect.left - this._panX) / this._zoom;
      const cy = (e.clientY - rect.top - this._panY) / this._zoom;

      this._addNode(
        data.type,
        data.subtype,
        snapToGrid(cx - NODE_WIDTH / 2),
        snapToGrid(cy - NODE_HEIGHT / 2),
      );
      this._draw();
    });

    // Canvas mouse events
    this._canvas.addEventListener("mousedown", (e) =>
      this._onCanvasMouseDown(e),
    );
    this._canvas.addEventListener("mousemove", (e) =>
      this._onCanvasMouseMove(e),
    );
    this._canvas.addEventListener("mouseup", (e) => this._onCanvasMouseUp(e));
    this._canvas.addEventListener("wheel", (e) => this._onWheel(e), {
      passive: false,
    });
    this._canvas.addEventListener("dblclick", (e) => this._onCanvasDblClick(e));

    // Toolbar
    this._runBtn.addEventListener("click", () => this._executeWorkflow());
    this._saveBtn.addEventListener("click", () => this._saveWorkflow());
    this._newBtn.addEventListener("click", () => this._newWorkflow());

    // Props close
    this._propsClose.addEventListener("click", () => this._deselectNode());

    // Keyboard
    this._container.addEventListener("keydown", (e) => {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (
          this._selectedNodeId &&
          !e.target.closest("input, textarea, select")
        ) {
          this._deleteNode(this._selectedNodeId);
        }
      }
      if (e.key === "Escape") {
        this._deselectNode();
        this._connectingFrom = null;
        this._draw();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Canvas resize
  // ═══════════════════════════════════════════════════════════════════

  _resizeCanvas() {
    const rect = this._canvasArea.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = rect.width * dpr;
    this._canvas.height = rect.height * dpr;
    this._canvas.style.width = rect.width + "px";
    this._canvas.style.height = rect.height + "px";
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._draw();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Canvas mouse handling
  // ═══════════════════════════════════════════════════════════════════

  _canvasToWorld(clientX, clientY) {
    const rect = this._canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this._panX) / this._zoom,
      y: (clientY - rect.top - this._panY) / this._zoom,
    };
  }

  _hitTestNode(wx, wy) {
    // Reverse order so topmost node wins
    for (let i = this._nodes.length - 1; i >= 0; i--) {
      const n = this._nodes[i];
      if (
        wx >= n.x &&
        wx <= n.x + NODE_WIDTH &&
        wy >= n.y &&
        wy <= n.y + NODE_HEIGHT
      ) {
        return n;
      }
    }
    return null;
  }

  _hitTestPort(wx, wy) {
    for (const n of this._nodes) {
      // Output port (right center)
      const ox = n.x + NODE_WIDTH;
      const oy = n.y + NODE_HEIGHT / 2;
      if (Math.hypot(wx - ox, wy - oy) <= PORT_RADIUS + 4) {
        return { node: n, side: "output" };
      }
      // Input port (left center)
      const ix = n.x;
      const iy = n.y + NODE_HEIGHT / 2;
      if (Math.hypot(wx - ix, wy - iy) <= PORT_RADIUS + 4) {
        return { node: n, side: "input" };
      }
    }
    return null;
  }

  _onCanvasMouseDown(e) {
    const { x: wx, y: wy } = this._canvasToWorld(e.clientX, e.clientY);

    // Middle-click pan
    if (e.button === 1) {
      e.preventDefault();
      this._isPanning = true;
      this._panStartX = e.clientX - this._panX;
      this._panStartY = e.clientY - this._panY;
      return;
    }

    if (e.button !== 0) return;

    // Port hit?
    const port = this._hitTestPort(wx, wy);
    if (port && port.side === "output") {
      this._connectingFrom = port.node;
      this._connectingMouse = { x: wx, y: wy };
      return;
    }

    // Node hit?
    const node = this._hitTestNode(wx, wy);
    if (node) {
      this._selectNode(node.id);
      this._draggingNode = node;
      this._dragOffsetX = wx - node.x;
      this._dragOffsetY = wy - node.y;
      // Move to front
      const idx = this._nodes.indexOf(node);
      if (idx !== -1) {
        this._nodes.splice(idx, 1);
        this._nodes.push(node);
      }
      this._draw();
      return;
    }

    // Click empty space: deselect and start panning
    this._deselectNode();
    this._isPanning = true;
    this._panStartX = e.clientX - this._panX;
    this._panStartY = e.clientY - this._panY;
  }

  _onCanvasMouseMove(e) {
    if (this._isPanning) {
      this._panX = e.clientX - this._panStartX;
      this._panY = e.clientY - this._panStartY;
      this._draw();
      return;
    }

    if (this._draggingNode) {
      const { x: wx, y: wy } = this._canvasToWorld(e.clientX, e.clientY);
      this._draggingNode.x = snapToGrid(wx - this._dragOffsetX);
      this._draggingNode.y = snapToGrid(wy - this._dragOffsetY);
      this._draw();
      return;
    }

    if (this._connectingFrom) {
      const { x: wx, y: wy } = this._canvasToWorld(e.clientX, e.clientY);
      this._connectingMouse = { x: wx, y: wy };
      this._draw();
      return;
    }
  }

  _onCanvasMouseUp(e) {
    if (this._isPanning) {
      this._isPanning = false;
      return;
    }

    if (this._draggingNode) {
      this._draggingNode = null;
      return;
    }

    if (this._connectingFrom) {
      const { x: wx, y: wy } = this._canvasToWorld(e.clientX, e.clientY);
      const port = this._hitTestPort(wx, wy);
      if (
        port &&
        port.side === "input" &&
        port.node.id !== this._connectingFrom.id
      ) {
        // Avoid duplicate connections
        const exists = this._connections.some(
          (c) =>
            c.fromId === this._connectingFrom.id && c.toId === port.node.id,
        );
        if (!exists) {
          this._connections.push({
            id: uid(),
            fromId: this._connectingFrom.id,
            toId: port.node.id,
          });
        }
      }
      this._connectingFrom = null;
      this._connectingMouse = null;
      this._draw();
    }
  }

  _onWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    const newZoom = Math.max(0.2, Math.min(3, this._zoom + delta));

    // Zoom toward cursor position
    const rect = this._canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const scale = newZoom / this._zoom;
    this._panX = mx - (mx - this._panX) * scale;
    this._panY = my - (my - this._panY) * scale;

    this._zoom = newZoom;
    this._zoomLabel.textContent = Math.round(this._zoom * 100) + "%";
    this._draw();
  }

  _onCanvasDblClick(e) {
    const { x: wx, y: wy } = this._canvasToWorld(e.clientX, e.clientY);
    const node = this._hitTestNode(wx, wy);
    if (node) {
      this._selectNode(node.id);
      this._showProps();
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Canvas drawing
  // ═══════════════════════════════════════════════════════════════════

  _draw() {
    if (this._animFrame) cancelAnimationFrame(this._animFrame);
    this._animFrame = requestAnimationFrame(() => this._render());
  }

  _render() {
    const ctx = this._ctx;
    const w = this._canvas.width / (window.devicePixelRatio || 1);
    const h = this._canvas.height / (window.devicePixelRatio || 1);

    ctx.clearRect(0, 0, w, h);

    // Grid background
    this._drawGrid(ctx, w, h);

    ctx.save();
    ctx.translate(this._panX, this._panY);
    ctx.scale(this._zoom, this._zoom);

    // Connections
    for (const conn of this._connections) {
      this._drawConnection(ctx, conn);
    }

    // Connection in progress
    if (this._connectingFrom && this._connectingMouse) {
      const from = this._connectingFrom;
      const sx = from.x + NODE_WIDTH;
      const sy = from.y + NODE_HEIGHT / 2;
      const ex = this._connectingMouse.x;
      const ey = this._connectingMouse.y;
      this._drawBezier(
        ctx,
        sx,
        sy,
        ex,
        ey,
        "rgba(74, 158, 255, 0.5)",
        2,
        [6, 4],
      );
    }

    // Nodes
    for (const node of this._nodes) {
      this._drawNode(ctx, node);
    }

    ctx.restore();
  }

  _drawGrid(ctx, w, h) {
    const step = GRID_SIZE * this._zoom;
    const offX = this._panX % step;
    const offY = this._panY % step;

    ctx.fillStyle = "rgba(255,255,255,0.03)";
    for (let x = offX; x < w; x += step) {
      for (let y = offY; y < h; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawNode(ctx, node) {
    const x = node.x;
    const y = node.y;
    const color = colorForType(node.type);
    const isSelected = node.id === this._selectedNodeId;
    const isExecuting = node.id === this._executingNodeId;

    // Shadow
    ctx.save();
    ctx.shadowColor = isExecuting ? color : "rgba(0,0,0,0.4)";
    ctx.shadowBlur = isExecuting ? 18 : 8;
    ctx.shadowOffsetY = isExecuting ? 0 : 3;

    // Body
    ctx.fillStyle = isSelected
      ? "rgba(40, 50, 80, 0.95)"
      : "rgba(20, 25, 40, 0.92)";
    ctx.beginPath();
    ctx.roundRect(x, y, NODE_WIDTH, NODE_HEIGHT, 8);
    ctx.fill();
    ctx.restore();

    // Border
    ctx.strokeStyle = isSelected ? color : "rgba(255,255,255,0.1)";
    ctx.lineWidth = isSelected ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y, NODE_WIDTH, NODE_HEIGHT, 8);
    ctx.stroke();

    // Colored header bar
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, NODE_WIDTH, 4, [8, 8, 0, 0]);
    ctx.fill();

    // Execution glow
    if (isExecuting) {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(Date.now() / 200);
      ctx.beginPath();
      ctx.roundRect(x - 3, y - 3, NODE_WIDTH + 6, NODE_HEIGHT + 6, 10);
      ctx.stroke();
      ctx.restore();
    }

    // Label
    const cat = NODE_CATEGORIES[node.type];
    const item = cat?.items.find((i) => i.subtype === node.subtype);
    const label = node.label || item?.label || node.subtype;

    ctx.fillStyle = "#e8e8f0";
    ctx.font = "12px Inter, -apple-system, sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText(
      label,
      x + 12,
      y + 18 + (NODE_HEIGHT - 18) / 2,
      NODE_WIDTH - 24,
    );

    // Type label (small)
    ctx.fillStyle = color;
    ctx.font = "9px Inter, -apple-system, sans-serif";
    ctx.fillText(node.type.toUpperCase(), x + 12, y + 14);

    // Input port (left)
    this._drawPort(ctx, x, y + NODE_HEIGHT / 2, color);

    // Output port (right)
    this._drawPort(ctx, x + NODE_WIDTH, y + NODE_HEIGHT / 2, color);
  }

  _drawPort(ctx, cx, cy, color) {
    ctx.fillStyle = "rgba(20, 25, 40, 0.95)";
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, PORT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  _drawConnection(ctx, conn) {
    const fromNode = this._nodes.find((n) => n.id === conn.fromId);
    const toNode = this._nodes.find((n) => n.id === conn.toId);
    if (!fromNode || !toNode) return;

    const sx = fromNode.x + NODE_WIDTH;
    const sy = fromNode.y + NODE_HEIGHT / 2;
    const ex = toNode.x;
    const ey = toNode.y + NODE_HEIGHT / 2;

    const fromColor = colorForType(fromNode.type);
    this._drawBezier(ctx, sx, sy, ex, ey, fromColor, 2);
  }

  _drawBezier(ctx, sx, sy, ex, ey, color, width, dash) {
    const cpOffset = Math.max(60, Math.abs(ex - sx) * 0.4);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = 0.6;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(sx + cpOffset, sy, ex - cpOffset, ey, ex, ey);
    ctx.stroke();
    ctx.restore();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Node management
  // ═══════════════════════════════════════════════════════════════════

  _addNode(type, subtype, x, y) {
    const cat = NODE_CATEGORIES[type];
    const item = cat?.items.find((i) => i.subtype === subtype);
    const node = {
      id: uid(),
      type,
      subtype,
      label: item?.label || subtype,
      x: x || 100,
      y: y || 100,
      config: {},
    };
    this._nodes.push(node);
    this._selectNode(node.id);
    return node;
  }

  _deleteNode(nodeId) {
    this._nodes = this._nodes.filter((n) => n.id !== nodeId);
    this._connections = this._connections.filter(
      (c) => c.fromId !== nodeId && c.toId !== nodeId,
    );
    if (this._selectedNodeId === nodeId) {
      this._deselectNode();
    }
    this._draw();
  }

  _selectNode(nodeId) {
    this._selectedNodeId = nodeId;
    this._showProps();
    this._draw();
  }

  _deselectNode() {
    this._selectedNodeId = null;
    this._propsEl.classList.add("ab-props--hidden");
    this._draw();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Properties panel
  // ═══════════════════════════════════════════════════════════════════

  _showProps() {
    const node = this._nodes.find((n) => n.id === this._selectedNodeId);
    if (!node) {
      this._propsBody.innerHTML =
        '<div class="ab-props__empty">Select a node to edit</div>';
      this._propsEl.classList.add("ab-props--hidden");
      return;
    }

    this._propsEl.classList.remove("ab-props--hidden");
    this._propsTitle.textContent = node.label || node.subtype;
    this._propsBody.innerHTML = "";

    // Type badge
    const badge = this._el(
      "div",
      `ab-props__type-badge ab-props__type-badge--${node.type}`,
    );
    badge.textContent = node.type;
    this._propsBody.appendChild(badge);

    // Label field
    this._propsBody.appendChild(
      this._buildField("Label", "text", node.label, (val) => {
        node.label = val;
        this._draw();
      }),
    );

    // Type-specific fields
    this._buildTypeFields(node);

    // Notes field
    this._propsBody.appendChild(
      this._buildField("Notes", "textarea", node.config.notes || "", (val) => {
        node.config.notes = val;
      }),
    );

    // Delete button
    const delBtn = this._el("button", "ab-props__delete-btn");
    delBtn.textContent = "Delete Node";
    delBtn.addEventListener("click", () => this._deleteNode(node.id));
    this._propsBody.appendChild(delBtn);
  }

  _buildTypeFields(node) {
    switch (node.type) {
      case "trigger":
        if (node.subtype === "on_schedule") {
          this._propsBody.appendChild(
            this._buildSelectField(
              "Schedule",
              [
                { value: "every_5m", label: "Every 5 minutes" },
                { value: "every_1h", label: "Every hour" },
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" },
              ],
              node.config.schedule || "daily",
              (val) => {
                node.config.schedule = val;
              },
            ),
          );
        }
        if (node.subtype === "on_zone_event") {
          this._propsBody.appendChild(
            this._buildField("Zone", "text", node.config.zone || "", (val) => {
              node.config.zone = val;
            }),
          );
          this._propsBody.appendChild(
            this._buildField(
              "Event",
              "text",
              node.config.event || "",
              (val) => {
                node.config.event = val;
              },
            ),
          );
        }
        break;

      case "action":
        this._propsBody.appendChild(
          this._buildField(
            "Prompt",
            "textarea",
            node.config.prompt || "",
            (val) => {
              node.config.prompt = val;
            },
          ),
        );
        this._propsBody.appendChild(
          this._buildSelectField(
            "Provider",
            [
              { value: "auto", label: "Auto (best available)" },
              { value: "anthropic", label: "Anthropic (Claude)" },
              { value: "openai", label: "OpenAI (GPT)" },
            ],
            node.config.provider || "auto",
            (val) => {
              node.config.provider = val;
            },
          ),
        );
        break;

      case "data":
        if (node.subtype === "read_zone" || node.subtype === "write_zone") {
          this._propsBody.appendChild(
            this._buildField(
              "Zone type",
              "text",
              node.config.zoneType || "",
              (val) => {
                node.config.zoneType = val;
              },
            ),
          );
        }
        if (node.subtype === "transform" || node.subtype === "filter") {
          this._propsBody.appendChild(
            this._buildField(
              "Expression",
              "textarea",
              node.config.expression || "",
              (val) => {
                node.config.expression = val;
              },
            ),
          );
        }
        break;

      case "control":
        if (node.subtype === "if_else") {
          this._propsBody.appendChild(
            this._buildField(
              "Condition",
              "textarea",
              node.config.condition || "",
              (val) => {
                node.config.condition = val;
              },
            ),
          );
        }
        if (node.subtype === "loop") {
          this._propsBody.appendChild(
            this._buildField(
              "Iterations",
              "text",
              node.config.iterations || "3",
              (val) => {
                node.config.iterations = val;
              },
            ),
          );
        }
        if (node.subtype === "delay") {
          this._propsBody.appendChild(
            this._buildField(
              "Delay (ms)",
              "text",
              node.config.delayMs || "1000",
              (val) => {
                node.config.delayMs = val;
              },
            ),
          );
        }
        break;

      case "output":
        if (node.subtype === "notify") {
          this._propsBody.appendChild(
            this._buildField(
              "Message",
              "textarea",
              node.config.message || "",
              (val) => {
                node.config.message = val;
              },
            ),
          );
        }
        if (node.subtype === "broadcast") {
          this._propsBody.appendChild(
            this._buildField(
              "Channel",
              "text",
              node.config.channel || "",
              (val) => {
                node.config.channel = val;
              },
            ),
          );
        }
        break;
    }
  }

  _buildField(label, type, value, onChange) {
    const field = this._el("div", "ab-field");
    const lbl = this._el("label", "ab-field__label");
    lbl.textContent = label;
    field.appendChild(lbl);

    let input;
    if (type === "textarea") {
      input = this._el("textarea", "ab-field__textarea");
      input.rows = 3;
    } else {
      input = this._el("input", "ab-field__input");
      input.type = type;
    }
    input.value = value || "";
    input.addEventListener("input", () => onChange(input.value));
    field.appendChild(input);
    return field;
  }

  _buildSelectField(label, options, value, onChange) {
    const field = this._el("div", "ab-field");
    const lbl = this._el("label", "ab-field__label");
    lbl.textContent = label;
    field.appendChild(lbl);

    const select = this._el("select", "ab-field__select");
    for (const opt of options) {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      if (opt.value === value) o.selected = true;
      select.appendChild(o);
    }
    select.addEventListener("change", () => onChange(select.value));
    field.appendChild(select);
    return field;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Workflow persistence
  // ═══════════════════════════════════════════════════════════════════

  async _loadWorkflows() {
    if (!this._worldId) {
      this._workflows = [];
      return;
    }
    try {
      this._workflows = (await window.api.db.getWorkflows(this._worldId)) || [];
    } catch {
      this._workflows = [];
    }
  }

  async _saveWorkflow() {
    if (!this._worldId) return;

    const config = JSON.stringify({
      nodes: this._nodes,
      connections: this._connections,
      viewport: { zoom: this._zoom, panX: this._panX, panY: this._panY },
    });

    try {
      if (this._activeWorkflowId) {
        await window.api.db.saveWorkflow(this._worldId, {
          id: this._activeWorkflowId,
          name: this._workflowName || "Untitled Workflow",
          config,
        });
      } else {
        const wf = await window.api.db.saveWorkflow(this._worldId, {
          name: this._workflowName || "Untitled Workflow",
          config,
        });
        if (wf) this._activeWorkflowId = wf.id;
      }
      await this._loadWorkflows();
      this._renderWorkflowList();
    } catch (err) {
      console.error("[AutomationBuilder] save failed:", err);
    }
  }

  async _deleteWorkflow(workflowId) {
    try {
      await window.api.db.deleteWorkflow(workflowId);
      if (this._activeWorkflowId === workflowId) {
        this._activeWorkflowId = null;
        this._nodes = [];
        this._connections = [];
        this._deselectNode();
      }
      await this._loadWorkflows();
      this._renderWorkflowList();
      this._draw();
    } catch (err) {
      console.error("[AutomationBuilder] delete failed:", err);
    }
  }

  _loadWorkflowIntoCanvas(wf) {
    this._activeWorkflowId = wf.id;
    this._workflowName = wf.name;
    let parsed = {};
    try {
      parsed = JSON.parse(wf.config || "{}");
    } catch {
      /* empty */
    }
    this._nodes = parsed.nodes || [];
    this._connections = parsed.connections || [];
    if (parsed.viewport) {
      this._zoom = parsed.viewport.zoom || 1;
      this._panX = parsed.viewport.panX || 0;
      this._panY = parsed.viewport.panY || 0;
      this._zoomLabel.textContent = Math.round(this._zoom * 100) + "%";
    }
    this._deselectNode();
    this._draw();
  }

  _newWorkflow() {
    this._activeWorkflowId = null;
    this._workflowName = "Untitled Workflow";
    this._nodes = [];
    this._connections = [];
    this._zoom = 1;
    this._panX = 0;
    this._panY = 0;
    this._zoomLabel.textContent = "100%";
    this._deselectNode();
    this._renderWorkflowList();
    this._draw();
  }

  _renderWorkflowList() {
    this._workflowListInner.innerHTML = "";

    if (this._workflows.length === 0) {
      const empty = this._el("div", "ab-workflow-card__meta");
      empty.textContent = "No saved workflows yet.";
      empty.style.padding = "8px 0";
      this._workflowListInner.appendChild(empty);
      return;
    }

    for (const wf of this._workflows) {
      const card = this._el(
        "div",
        "ab-workflow-card" +
          (wf.id === this._activeWorkflowId ? " ab-workflow-card--active" : ""),
      );
      card.dataset.workflowId = wf.id;

      const name = this._el("div", "ab-workflow-card__name");
      name.textContent = wf.name;
      card.appendChild(name);

      const meta = this._el("div", "ab-workflow-card__meta");
      meta.textContent =
        wf.status + " \u00b7 " + (wf.updated_at || wf.created_at || "");
      card.appendChild(meta);

      const actions = this._el("div", "ab-workflow-card__actions");

      const loadBtn = this._el("button", "ab-workflow-card__btn");
      loadBtn.textContent = "Load";
      loadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._loadWorkflowIntoCanvas(wf);
        this._renderWorkflowList();
      });
      actions.appendChild(loadBtn);

      const delBtn = this._el(
        "button",
        "ab-workflow-card__btn ab-workflow-card__btn--delete",
      );
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._deleteWorkflow(wf.id);
      });
      actions.appendChild(delBtn);

      card.appendChild(actions);

      card.addEventListener("click", () => {
        this._loadWorkflowIntoCanvas(wf);
        this._renderWorkflowList();
      });

      this._workflowListInner.appendChild(card);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Execution (simulated)
  // ═══════════════════════════════════════════════════════════════════

  async _executeWorkflow() {
    if (this._executing) return;
    if (this._nodes.length === 0) return;

    this._executing = true;
    this._runBtn.classList.add("ab-toolbar-btn--executing");
    this._runBtn.textContent = "Running...";

    // Build execution order (topological sort)
    const order = this._topologicalSort();

    for (const nodeId of order) {
      this._executingNodeId = nodeId;
      this._draw();

      // Animate for a moment
      await this._sleep(600);

      // Dispatch event for each step
      const node = this._nodes.find((n) => n.id === nodeId);
      if (node) {
        this._emit("dispatch:workflow-step", {
          worldId: this._worldId,
          workflowId: this._activeWorkflowId,
          nodeId: node.id,
          nodeType: node.type,
          nodeSubtype: node.subtype,
          config: node.config,
        });
      }
    }

    this._executingNodeId = null;
    this._executing = false;
    this._runBtn.classList.remove("ab-toolbar-btn--executing");
    this._runBtn.textContent = "Run";
    this._draw();

    this._emit("dispatch:task-complete", {
      worldId: this._worldId,
      zoneType: "automation-builder",
      success: true,
    });
  }

  _topologicalSort() {
    // Map nodeId -> list of successor nodeIds
    const adj = new Map();
    const inDeg = new Map();
    for (const n of this._nodes) {
      adj.set(n.id, []);
      inDeg.set(n.id, 0);
    }
    for (const c of this._connections) {
      if (adj.has(c.fromId) && inDeg.has(c.toId)) {
        adj.get(c.fromId).push(c.toId);
        inDeg.set(c.toId, inDeg.get(c.toId) + 1);
      }
    }

    const queue = [];
    for (const [id, deg] of inDeg) {
      if (deg === 0) queue.push(id);
    }

    const order = [];
    while (queue.length > 0) {
      const curr = queue.shift();
      order.push(curr);
      for (const next of adj.get(curr) || []) {
        const d = inDeg.get(next) - 1;
        inDeg.set(next, d);
        if (d === 0) queue.push(next);
      }
    }

    // Include any unconnected nodes at the end
    for (const n of this._nodes) {
      if (!order.includes(n.id)) order.push(n.id);
    }

    return order;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════

  _el(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  _emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
