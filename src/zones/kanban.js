/**
 * kanban.js — Kanban Board zone: drag-and-drop task management
 *
 * A 4-column board (Backlog, In Progress, Review, Done) with cards
 * that can be dragged between columns. Includes filtering, detail view,
 * and a new-task modal.
 *
 * Emits:
 *   dispatch:task-complete  — { worldId, zoneType: 'kanban', success: true }
 *
 * Vanilla JS + CSS. Pairs with kanban.css.
 */

// ── Helpers ───────────────────────────────────────────────────────────

function escapeHTML(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function relativeTime(iso) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return "Just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ── Column configuration ─────────────────────────────────────────────

const COLUMNS = [
  { key: "backlog", label: "Backlog", emoji: "\uD83D\uDCCB" },
  { key: "in_progress", label: "In Progress", emoji: "\u26A1" },
  { key: "review", label: "Review", emoji: "\uD83D\uDD0D" },
  { key: "done", label: "Done", emoji: "\u2705" },
];

const COLUMN_KEYS = COLUMNS.map((c) => c.key);

const PRIORITIES = [
  { key: "high", label: "High", color: "var(--accent-red)" },
  { key: "medium", label: "Medium", color: "var(--accent-amber)" },
  { key: "low", label: "Low", color: "var(--accent-green)" },
];

// ── Kanban class ─────────────────────────────────────────────────────

export class Kanban {
  constructor() {
    /** @type {string|null} */
    this._worldId = null;
    /** @type {Array<object>} */
    this._cards = [];
    /** @type {Array<object>} */
    this._agents = [];
    /** @type {Array<object>} */
    this._zones = [];
    /** @type {HTMLElement|null} */
    this._el = null;

    // Filter state
    this._filterAgent = null;
    this._filterZone = null;
    this._filterPriority = null;
    this._filterSearch = "";

    // Drag state
    this._dragCardId = null;
    this._dragFromColumn = null;

    // Collapsed columns
    this._collapsedColumns = new Set();

    // Detail view
    this._detailCardId = null;

    // DOM refs
    this._boardEl = null;
    this._columnEls = {};
    this._columnBodyEls = {};
    this._columnCountEls = {};
    this._modalOverlay = null;
    this._detailContainer = null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // CSS injection
  // ═══════════════════════════════════════════════════════════════════

  _injectCSS() {
    if (document.getElementById("kanban-styles")) return;
    const link = document.createElement("link");
    link.id = "kanban-styles";
    link.rel = "stylesheet";
    link.href = "../zones/kanban.css";
    document.head.appendChild(link);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Build and return the root DOM element. Call once before appending to the page.
   * @returns {HTMLElement}
   */
  render() {
    this._injectCSS();

    this._el = this._mk("div", "kanban");
    this._el.setAttribute("role", "region");
    this._el.setAttribute("aria-label", "Kanban Board");

    this._el.appendChild(this._buildHeader());
    this._el.appendChild(this._buildFilterBar());
    this._boardEl = this._buildBoard();
    this._el.appendChild(this._boardEl);

    // Detail view container (hidden by default)
    this._detailContainer = this._mk("div", "kb-detail");
    this._detailContainer.hidden = true;
    this._el.appendChild(this._detailContainer);

    return this._el;
  }

  /**
   * Load cards from DB for the given world and refresh the UI.
   * @param {string|number} worldId
   */
  async init(worldId) {
    this._worldId = worldId;

    // Load cards, agents, zones in parallel
    const [cards, agents, zones] = await Promise.all([
      this._dbGetCards(worldId),
      this._dbGetAgents(worldId),
      this._dbGetZones(worldId),
    ]);

    this._cards = cards;
    this._agents = agents;
    this._zones = zones;

    this._refreshBoard();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Database helpers
  // ═══════════════════════════════════════════════════════════════════

  async _dbGetCards(worldId) {
    try {
      if (window.api?.db?.getKanbanCards) {
        return (await window.api.db.getKanbanCards(worldId)) || [];
      }
      // Fallback: raw query
      if (window.api?.db?.all) {
        return (
          (await window.api.db.all(
            "SELECT * FROM kanban_cards WHERE world_id = ? ORDER BY sort_order ASC, created_at DESC",
            [worldId],
          )) || []
        );
      }
    } catch (err) {
      console.warn("[Kanban] Failed to load cards:", err);
    }
    return [];
  }

  async _dbGetAgents(worldId) {
    try {
      if (window.api?.db?.getAgents) {
        return (await window.api.db.getAgents(worldId)) || [];
      }
    } catch (err) {
      console.warn("[Kanban] Failed to load agents:", err);
    }
    return [];
  }

  async _dbGetZones(worldId) {
    try {
      if (window.api?.db?.getZones) {
        return (await window.api.db.getZones(worldId)) || [];
      }
    } catch (err) {
      console.warn("[Kanban] Failed to load zones:", err);
    }
    return [];
  }

  async _dbCreateCard(data) {
    try {
      if (window.api?.db?.createKanbanCard) {
        return await window.api.db.createKanbanCard(this._worldId, data);
      }
      if (window.api?.db?.run) {
        const id = generateId();
        await window.api.db.run(
          `INSERT INTO kanban_cards (id, world_id, title, description, priority, column_key, zone_tag, agent_id, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
          [
            id,
            this._worldId,
            data.title,
            data.description || "",
            data.priority || "medium",
            data.column_key || "backlog",
            data.zone_tag || "",
            data.agent_id || null,
            data.sort_order || 0,
          ],
        );
        return {
          id,
          ...data,
          world_id: this._worldId,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
    } catch (err) {
      console.error("[Kanban] Failed to create card:", err);
    }
    // Offline fallback
    const card = {
      id: generateId(),
      ...data,
      world_id: this._worldId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return card;
  }

  async _dbUpdateCard(cardId, updates) {
    try {
      if (window.api?.db?.updateKanbanCard) {
        return await window.api.db.updateKanbanCard(cardId, updates);
      }
      if (window.api?.db?.run) {
        const allowed = [
          "title",
          "description",
          "priority",
          "column_key",
          "zone_tag",
          "agent_id",
          "sort_order",
        ];
        const fields = Object.keys(updates).filter((k) => allowed.includes(k));
        if (fields.length === 0) return;
        const sets = fields.map((f) => `${f} = ?`).join(", ");
        const vals = fields.map((f) => updates[f]);
        await window.api.db.run(
          `UPDATE kanban_cards SET ${sets}, updated_at = datetime('now') WHERE id = ?`,
          [...vals, cardId],
        );
      }
    } catch (err) {
      console.error("[Kanban] Failed to update card:", err);
    }
  }

  async _dbDeleteCard(cardId) {
    try {
      if (window.api?.db?.deleteKanbanCard) {
        return await window.api.db.deleteKanbanCard(cardId);
      }
      if (window.api?.db?.run) {
        await window.api.db.run("DELETE FROM kanban_cards WHERE id = ?", [
          cardId,
        ]);
      }
    } catch (err) {
      console.error("[Kanban] Failed to delete card:", err);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOM construction
  // ═══════════════════════════════════════════════════════════════════

  _buildHeader() {
    const header = this._mk("header", "kb-header");

    const left = this._mk("div", "kb-header__left");
    const title = this._mk("h2", "kb-header__title");
    title.textContent = "Kanban Board";
    const sub = this._mk("span", "kb-header__subtitle");
    sub.textContent = "Drag cards between columns to track progress.";
    left.appendChild(title);
    left.appendChild(sub);

    header.appendChild(left);
    return header;
  }

  _buildFilterBar() {
    const bar = this._mk("div", "kb-filter-bar");

    // Search
    const search = this._mk("input", "kb-filter-search");
    search.type = "text";
    search.placeholder = "Search tasks...";
    search.addEventListener("input", () => {
      this._filterSearch = search.value.trim().toLowerCase();
      this._refreshBoard();
    });
    bar.appendChild(search);

    // Priority filter
    const prioGroup = this._mk("div", "kb-filter-group");
    const prioLabel = this._mk("span", "kb-filter-label");
    prioLabel.textContent = "Priority";
    prioGroup.appendChild(prioLabel);

    for (const p of PRIORITIES) {
      const pill = this._mk(
        "button",
        `kb-filter-pill kb-filter-pill--priority-${p.key}`,
      );
      pill.textContent = p.label;
      pill.dataset.priority = p.key;
      pill.addEventListener("click", () => {
        if (this._filterPriority === p.key) {
          this._filterPriority = null;
          pill.classList.remove("kb-filter-pill--active");
        } else {
          this._filterPriority = p.key;
          prioGroup
            .querySelectorAll(".kb-filter-pill")
            .forEach((b) => b.classList.remove("kb-filter-pill--active"));
          pill.classList.add("kb-filter-pill--active");
        }
        this._refreshBoard();
      });
      prioGroup.appendChild(pill);
    }
    bar.appendChild(prioGroup);

    // Agent filter (populated after init)
    this._agentFilterGroup = this._mk("div", "kb-filter-group");
    this._agentFilterGroup.hidden = true;
    const agentLabel = this._mk("span", "kb-filter-label");
    agentLabel.textContent = "Agent";
    this._agentFilterGroup.appendChild(agentLabel);
    bar.appendChild(this._agentFilterGroup);

    // Zone filter (populated after init)
    this._zoneFilterGroup = this._mk("div", "kb-filter-group");
    this._zoneFilterGroup.hidden = true;
    const zoneLabel = this._mk("span", "kb-filter-label");
    zoneLabel.textContent = "Zone";
    this._zoneFilterGroup.appendChild(zoneLabel);
    bar.appendChild(this._zoneFilterGroup);

    return bar;
  }

  _buildBoard() {
    const board = this._mk("div", "kb-board");

    for (const col of COLUMNS) {
      board.appendChild(this._buildColumn(col));
    }

    return board;
  }

  _buildColumn(col) {
    const column = this._mk("div", "kb-column");
    column.dataset.column = col.key;
    this._columnEls[col.key] = column;

    // Header
    const header = this._mk("div", "kb-column__header");

    const title = this._mk("span", "kb-column__title");
    title.textContent = `${col.emoji} ${col.label}`;

    const count = this._mk("span", "kb-column__count");
    count.textContent = "0";
    this._columnCountEls[col.key] = count;

    const toggle = this._mk("button", "kb-column__toggle");
    toggle.textContent = "\u25C0";
    toggle.title = "Collapse column";
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggleColumn(col.key);
    });

    header.appendChild(title);
    header.appendChild(count);
    header.appendChild(toggle);
    column.appendChild(header);

    // Click on collapsed column header to expand
    header.addEventListener("click", () => {
      if (this._collapsedColumns.has(col.key)) {
        this._toggleColumn(col.key);
      }
    });

    // Body (card list / drop zone)
    const body = this._mk("div", "kb-column__body");
    body.dataset.column = col.key;
    this._columnBodyEls[col.key] = body;

    // Drag-and-drop events on the body
    body.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      body.classList.add("kb-column__body--drag-over");
    });

    body.addEventListener("dragleave", (e) => {
      // Only remove if we actually left the body
      if (!body.contains(e.relatedTarget)) {
        body.classList.remove("kb-column__body--drag-over");
      }
    });

    body.addEventListener("drop", (e) => {
      e.preventDefault();
      body.classList.remove("kb-column__body--drag-over");
      this._onDrop(col.key);
    });

    column.appendChild(body);

    // Add Task button
    const addBtn = this._mk("button", "kb-column__add-btn");
    addBtn.textContent = "+ Add Task";
    addBtn.addEventListener("click", () => this._openNewTaskModal(col.key));
    column.appendChild(addBtn);

    return column;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Board rendering
  // ═══════════════════════════════════════════════════════════════════

  _refreshBoard() {
    this._populateFilterOptions();

    const filtered = this._getFilteredCards();

    for (const col of COLUMNS) {
      const body = this._columnBodyEls[col.key];
      body.innerHTML = "";

      const colCards = filtered.filter((c) => c.column_key === col.key);
      this._columnCountEls[col.key].textContent = String(colCards.length);

      if (colCards.length === 0) {
        const empty = this._mk("div", "kb-empty");
        const icon = this._mk("div", "kb-empty__icon");
        icon.textContent = col.emoji;
        const text = this._mk("div");
        text.textContent = "No tasks";
        empty.appendChild(icon);
        empty.appendChild(text);
        body.appendChild(empty);
      } else {
        for (const card of colCards) {
          body.appendChild(this._renderCard(card));
        }
      }
    }
  }

  _getFilteredCards() {
    let cards = [...this._cards];

    if (this._filterSearch) {
      const q = this._filterSearch;
      cards = cards.filter(
        (c) =>
          (c.title || "").toLowerCase().includes(q) ||
          (c.description || "").toLowerCase().includes(q),
      );
    }

    if (this._filterPriority) {
      cards = cards.filter((c) => c.priority === this._filterPriority);
    }

    if (this._filterAgent) {
      cards = cards.filter((c) => c.agent_id === this._filterAgent);
    }

    if (this._filterZone) {
      cards = cards.filter((c) => c.zone_tag === this._filterZone);
    }

    return cards;
  }

  _populateFilterOptions() {
    // Agent pills
    if (
      this._agents.length > 0 &&
      this._agentFilterGroup.childElementCount <= 1
    ) {
      this._agentFilterGroup.hidden = false;
      for (const agent of this._agents) {
        const pill = this._mk("button", "kb-filter-pill");
        pill.textContent = agent.name || agent.id;
        pill.addEventListener("click", () => {
          if (this._filterAgent === agent.id) {
            this._filterAgent = null;
            pill.classList.remove("kb-filter-pill--active");
          } else {
            this._filterAgent = agent.id;
            this._agentFilterGroup
              .querySelectorAll(".kb-filter-pill")
              .forEach((b) => b.classList.remove("kb-filter-pill--active"));
            pill.classList.add("kb-filter-pill--active");
          }
          this._refreshBoard();
        });
        this._agentFilterGroup.appendChild(pill);
      }
    }

    // Zone pills
    if (
      this._zones.length > 0 &&
      this._zoneFilterGroup.childElementCount <= 1
    ) {
      this._zoneFilterGroup.hidden = false;
      for (const zone of this._zones) {
        const pill = this._mk("button", "kb-filter-pill");
        pill.textContent = zone.name || zone.slug;
        pill.addEventListener("click", () => {
          if (this._filterZone === (zone.slug || zone.name)) {
            this._filterZone = null;
            pill.classList.remove("kb-filter-pill--active");
          } else {
            this._filterZone = zone.slug || zone.name;
            this._zoneFilterGroup
              .querySelectorAll(".kb-filter-pill")
              .forEach((b) => b.classList.remove("kb-filter-pill--active"));
            pill.classList.add("kb-filter-pill--active");
          }
          this._refreshBoard();
        });
        this._zoneFilterGroup.appendChild(pill);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Card rendering
  // ═══════════════════════════════════════════════════════════════════

  _renderCard(card) {
    const el = this._mk("div", `kb-card kb-card--${card.priority || "medium"}`);
    el.dataset.cardId = card.id;
    el.draggable = true;

    // Drag events
    el.addEventListener("dragstart", (e) => {
      this._dragCardId = card.id;
      this._dragFromColumn = card.column_key;
      el.classList.add("kb-card--dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", card.id);
    });

    el.addEventListener("dragend", () => {
      el.classList.remove("kb-card--dragging");
      // Remove all drag-over highlights
      for (const key of COLUMN_KEYS) {
        this._columnBodyEls[key].classList.remove("kb-column__body--drag-over");
      }
      this._dragCardId = null;
      this._dragFromColumn = null;
    });

    // Click to expand detail
    el.addEventListener("click", (e) => {
      if (e.defaultPrevented) return;
      this._openDetail(card.id);
    });

    // Top row: title + priority dot
    const top = this._mk("div", "kb-card__top");

    const titleEl = this._mk("div", "kb-card__title");
    titleEl.textContent = card.title || "Untitled";
    top.appendChild(titleEl);

    const dot = this._mk(
      "div",
      `kb-card__priority-dot kb-card__priority-dot--${card.priority || "medium"}`,
    );
    top.appendChild(dot);

    el.appendChild(top);

    // Description preview
    if (card.description) {
      const desc = this._mk("div", "kb-card__desc");
      desc.textContent = card.description;
      el.appendChild(desc);
    }

    // Footer: zone tag, agent avatar, date
    const footer = this._mk("div", "kb-card__footer");

    const tags = this._mk("div", "kb-card__tags");
    if (card.zone_tag) {
      const tag = this._mk("span", "kb-card__zone-tag");
      tag.textContent = card.zone_tag;
      tags.appendChild(tag);
    }
    footer.appendChild(tags);

    // Agent avatar
    if (card.agent_id) {
      const agent = this._agents.find((a) => a.id === card.agent_id);
      const agentEl = this._mk("div", "kb-card__agent");
      const avatar = this._mk("div", "kb-card__agent-avatar");
      avatar.textContent = (agent?.name || "?")[0].toUpperCase();
      agentEl.appendChild(avatar);
      if (agent?.name) {
        const name = this._mk("span");
        name.textContent = agent.name;
        agentEl.appendChild(name);
      }
      footer.appendChild(agentEl);
    }

    // Date
    if (card.created_at) {
      const dateEl = this._mk("span", "kb-card__date");
      dateEl.textContent = relativeTime(card.created_at);
      footer.appendChild(dateEl);
    }

    el.appendChild(footer);
    return el;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Drag-and-drop
  // ═══════════════════════════════════════════════════════════════════

  _onDrop(targetColumn) {
    if (!this._dragCardId) return;
    if (this._dragFromColumn === targetColumn) return;

    const card = this._cards.find((c) => c.id === this._dragCardId);
    if (!card) return;

    const oldColumn = card.column_key;
    card.column_key = targetColumn;
    card.updated_at = new Date().toISOString();

    // Add history entry
    if (!card._history) card._history = [];
    card._history.push({
      action: "moved",
      from: oldColumn,
      to: targetColumn,
      at: new Date().toISOString(),
    });

    // Persist
    this._dbUpdateCard(card.id, { column_key: targetColumn });

    // Animate and refresh
    this._refreshBoard();

    // Apply move animation to the dropped card
    requestAnimationFrame(() => {
      const droppedEl = this._el.querySelector(`[data-card-id="${card.id}"]`);
      if (droppedEl) {
        droppedEl.classList.add("kb-card--moving");
        droppedEl.addEventListener(
          "animationend",
          () => {
            droppedEl.classList.remove("kb-card--moving");
          },
          { once: true },
        );
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Column collapse/expand
  // ═══════════════════════════════════════════════════════════════════

  _toggleColumn(key) {
    const colEl = this._columnEls[key];
    if (this._collapsedColumns.has(key)) {
      this._collapsedColumns.delete(key);
      colEl.classList.remove("kb-column--collapsed");
    } else {
      this._collapsedColumns.add(key);
      colEl.classList.add("kb-column--collapsed");
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // New Task Modal
  // ═══════════════════════════════════════════════════════════════════

  _openNewTaskModal(defaultColumn = "backlog") {
    // Remove existing modal
    this._closeModal();

    const overlay = this._mk("div", "kb-modal-overlay");
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this._closeModal();
    });

    const modal = this._mk("div", "kb-modal");

    // Header
    const header = this._mk("div", "kb-modal__header");
    const title = this._mk("h3", "kb-modal__title");
    title.textContent = "New Task";
    const closeBtn = this._mk("button", "kb-modal__close");
    closeBtn.textContent = "\u2715";
    closeBtn.addEventListener("click", () => this._closeModal());
    header.appendChild(title);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Form
    const form = this._mk("form", "");

    // Title
    const titleGroup = this._mk("div", "kb-form__group");
    const titleLabel = this._mk("label", "kb-form__label");
    titleLabel.textContent = "Title";
    const titleInput = this._mk("input", "kb-form__input");
    titleInput.type = "text";
    titleInput.placeholder = "What needs to be done?";
    titleInput.required = true;
    titleGroup.appendChild(titleLabel);
    titleGroup.appendChild(titleInput);
    form.appendChild(titleGroup);

    // Description
    const descGroup = this._mk("div", "kb-form__group");
    const descLabel = this._mk("label", "kb-form__label");
    descLabel.textContent = "Description";
    const descInput = this._mk("textarea", "kb-form__textarea");
    descInput.placeholder = "Add details, context, or acceptance criteria...";
    descInput.rows = 3;
    descGroup.appendChild(descLabel);
    descGroup.appendChild(descInput);
    form.appendChild(descGroup);

    // Row: Priority + Column
    const row1 = this._mk("div", "kb-form__row");

    const prioGroup = this._mk("div", "kb-form__group");
    const prioLabel = this._mk("label", "kb-form__label");
    prioLabel.textContent = "Priority";
    const prioSelect = this._mk("select", "kb-form__select");
    for (const p of PRIORITIES) {
      const opt = this._mk("option", "");
      opt.value = p.key;
      opt.textContent = p.label;
      if (p.key === "medium") opt.selected = true;
      prioSelect.appendChild(opt);
    }
    prioGroup.appendChild(prioLabel);
    prioGroup.appendChild(prioSelect);
    row1.appendChild(prioGroup);

    const colGroup = this._mk("div", "kb-form__group");
    const colLabel = this._mk("label", "kb-form__label");
    colLabel.textContent = "Column";
    const colSelect = this._mk("select", "kb-form__select");
    for (const c of COLUMNS) {
      const opt = this._mk("option", "");
      opt.value = c.key;
      opt.textContent = `${c.emoji} ${c.label}`;
      if (c.key === defaultColumn) opt.selected = true;
      colSelect.appendChild(opt);
    }
    colGroup.appendChild(colLabel);
    colGroup.appendChild(colSelect);
    row1.appendChild(colGroup);

    form.appendChild(row1);

    // Row: Zone + Agent
    const row2 = this._mk("div", "kb-form__row");

    const zoneGroup = this._mk("div", "kb-form__group");
    const zoneLabel = this._mk("label", "kb-form__label");
    zoneLabel.textContent = "Zone";
    const zoneSelect = this._mk("select", "kb-form__select");
    const zoneNone = this._mk("option", "");
    zoneNone.value = "";
    zoneNone.textContent = "None";
    zoneSelect.appendChild(zoneNone);
    for (const z of this._zones) {
      const opt = this._mk("option", "");
      opt.value = z.slug || z.name;
      opt.textContent = z.name || z.slug;
      zoneSelect.appendChild(opt);
    }
    zoneGroup.appendChild(zoneLabel);
    zoneGroup.appendChild(zoneSelect);
    row2.appendChild(zoneGroup);

    const agentGroup = this._mk("div", "kb-form__group");
    const agentLabel = this._mk("label", "kb-form__label");
    agentLabel.textContent = "Assign Agent";
    const agentSelect = this._mk("select", "kb-form__select");
    const agentNone = this._mk("option", "");
    agentNone.value = "";
    agentNone.textContent = "Unassigned";
    agentSelect.appendChild(agentNone);
    for (const a of this._agents) {
      const opt = this._mk("option", "");
      opt.value = a.id;
      opt.textContent = a.name || a.id;
      agentSelect.appendChild(opt);
    }
    agentGroup.appendChild(agentLabel);
    agentGroup.appendChild(agentSelect);
    row2.appendChild(agentGroup);

    form.appendChild(row2);

    // Actions
    const actions = this._mk("div", "kb-form__actions");
    const cancelBtn = this._mk("button", "kb-btn");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => this._closeModal());

    const submitBtn = this._mk("button", "kb-btn kb-btn--primary");
    submitBtn.type = "submit";
    submitBtn.textContent = "Create Task";

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    form.appendChild(actions);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = {
        title: titleInput.value.trim(),
        description: descInput.value.trim(),
        priority: prioSelect.value,
        column_key: colSelect.value,
        zone_tag: zoneSelect.value,
        agent_id: agentSelect.value || null,
        sort_order: this._cards.filter((c) => c.column_key === colSelect.value)
          .length,
      };

      if (!data.title) return;

      const card = await this._dbCreateCard(data);
      if (card) {
        card._history = [
          {
            action: "created",
            at: card.created_at || new Date().toISOString(),
          },
        ];
        this._cards.push(card);
        this._refreshBoard();
      }

      this._closeModal();
    });

    modal.appendChild(form);
    overlay.appendChild(modal);

    this._modalOverlay = overlay;
    document.body.appendChild(overlay);

    // Focus title input
    requestAnimationFrame(() => titleInput.focus());
  }

  _closeModal() {
    if (this._modalOverlay) {
      this._modalOverlay.remove();
      this._modalOverlay = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Detail view
  // ═══════════════════════════════════════════════════════════════════

  _openDetail(cardId) {
    const card = this._cards.find((c) => c.id === cardId);
    if (!card) return;

    this._detailCardId = cardId;
    this._boardEl.hidden = true;
    this._detailContainer.hidden = false;
    this._detailContainer.innerHTML = "";

    // Back button
    const backBtn = this._mk("button", "kb-detail__back");
    backBtn.innerHTML = "&#8592; Back to board";
    backBtn.addEventListener("click", () => this._closeDetail());
    this._detailContainer.appendChild(backBtn);

    // Title
    const title = this._mk("h2", "kb-detail__title");
    title.textContent = card.title || "Untitled";
    this._detailContainer.appendChild(title);

    // Meta row
    const meta = this._mk("div", "kb-detail__meta");

    // Priority
    const priMeta = this._mk("span", "kb-detail__meta-item");
    const priDot = this._mk(
      "span",
      `kb-card__priority-dot kb-card__priority-dot--${card.priority || "medium"}`,
    );
    priDot.style.display = "inline-block";
    priMeta.appendChild(priDot);
    const priText = this._mk("span");
    priText.textContent =
      (card.priority || "medium").charAt(0).toUpperCase() +
      (card.priority || "medium").slice(1) +
      " priority";
    priMeta.appendChild(priText);
    meta.appendChild(priMeta);

    // Column
    const colMeta = this._mk("span", "kb-detail__meta-item");
    const colDef = COLUMNS.find((c) => c.key === card.column_key);
    colMeta.textContent = colDef
      ? `${colDef.emoji} ${colDef.label}`
      : card.column_key;
    meta.appendChild(colMeta);

    // Zone
    if (card.zone_tag) {
      const zoneMeta = this._mk("span", "kb-detail__meta-item");
      zoneMeta.textContent = card.zone_tag;
      meta.appendChild(zoneMeta);
    }

    // Agent
    if (card.agent_id) {
      const agent = this._agents.find((a) => a.id === card.agent_id);
      const agMeta = this._mk("span", "kb-detail__meta-item");
      agMeta.textContent = agent ? agent.name : card.agent_id;
      meta.appendChild(agMeta);
    }

    // Date
    if (card.created_at) {
      const dateMeta = this._mk("span", "kb-detail__meta-item");
      dateMeta.textContent = `Created ${relativeTime(card.created_at)}`;
      meta.appendChild(dateMeta);
    }

    this._detailContainer.appendChild(meta);

    // Description
    if (card.description) {
      const desc = this._mk("div", "kb-detail__description");
      desc.textContent = card.description;
      this._detailContainer.appendChild(desc);
    }

    // History
    const histTitle = this._mk("div", "kb-detail__section-title");
    histTitle.textContent = "History";
    this._detailContainer.appendChild(histTitle);

    const histList = this._mk("div", "kb-detail__history");
    const history = card._history || [
      { action: "created", at: card.created_at },
    ];

    if (history.length === 0) {
      const noHist = this._mk("div", "kb-detail__history-item");
      noHist.textContent = "No history yet.";
      histList.appendChild(noHist);
    } else {
      for (const entry of history) {
        const item = this._mk("div", "kb-detail__history-item");
        if (entry.action === "created") {
          item.textContent = `Task created ${relativeTime(entry.at)}`;
        } else if (entry.action === "moved") {
          const fromCol = COLUMNS.find((c) => c.key === entry.from);
          const toCol = COLUMNS.find((c) => c.key === entry.to);
          item.textContent = `Moved from ${fromCol?.label || entry.from} to ${toCol?.label || entry.to} ${relativeTime(entry.at)}`;
        } else {
          item.textContent = `${entry.action} ${relativeTime(entry.at)}`;
        }
        histList.appendChild(item);
      }
    }
    this._detailContainer.appendChild(histList);

    // Action buttons
    const actions = this._mk("div", "kb-detail__actions");

    // Move to next column
    const colIdx = COLUMN_KEYS.indexOf(card.column_key);
    if (colIdx < COLUMN_KEYS.length - 1) {
      const nextCol = COLUMNS[colIdx + 1];
      const moveBtn = this._mk("button", "kb-btn kb-btn--primary");
      moveBtn.textContent = `Move to ${nextCol.emoji} ${nextCol.label}`;
      moveBtn.addEventListener("click", () => {
        card.column_key = nextCol.key;
        card.updated_at = new Date().toISOString();
        if (!card._history) card._history = [];
        card._history.push({
          action: "moved",
          from: COLUMN_KEYS[colIdx],
          to: nextCol.key,
          at: new Date().toISOString(),
        });
        this._dbUpdateCard(card.id, { column_key: nextCol.key });
        this._closeDetail();
        this._refreshBoard();
      });
      actions.appendChild(moveBtn);
    }

    // Edit button (re-opens modal with pre-filled data)
    const editBtn = this._mk("button", "kb-btn");
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => {
      this._closeDetail();
      this._openEditModal(card);
    });
    actions.appendChild(editBtn);

    // Delete
    const delBtn = this._mk("button", "kb-btn");
    delBtn.textContent = "Delete";
    delBtn.style.color = "var(--accent-red)";
    delBtn.addEventListener("click", async () => {
      await this._dbDeleteCard(card.id);
      this._cards = this._cards.filter((c) => c.id !== card.id);
      this._closeDetail();
      this._refreshBoard();
    });
    actions.appendChild(delBtn);

    this._detailContainer.appendChild(actions);
  }

  _closeDetail() {
    this._detailCardId = null;
    this._boardEl.hidden = false;
    this._detailContainer.hidden = true;
    this._detailContainer.innerHTML = "";
  }

  // ═══════════════════════════════════════════════════════════════════
  // Edit Modal
  // ═══════════════════════════════════════════════════════════════════

  _openEditModal(card) {
    this._closeModal();

    const overlay = this._mk("div", "kb-modal-overlay");
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) this._closeModal();
    });

    const modal = this._mk("div", "kb-modal");

    // Header
    const header = this._mk("div", "kb-modal__header");
    const title = this._mk("h3", "kb-modal__title");
    title.textContent = "Edit Task";
    const closeBtn = this._mk("button", "kb-modal__close");
    closeBtn.textContent = "\u2715";
    closeBtn.addEventListener("click", () => this._closeModal());
    header.appendChild(title);
    header.appendChild(closeBtn);
    modal.appendChild(header);

    const form = this._mk("form", "");

    // Title
    const titleGroup = this._mk("div", "kb-form__group");
    const titleLabel = this._mk("label", "kb-form__label");
    titleLabel.textContent = "Title";
    const titleInput = this._mk("input", "kb-form__input");
    titleInput.type = "text";
    titleInput.value = card.title || "";
    titleInput.required = true;
    titleGroup.appendChild(titleLabel);
    titleGroup.appendChild(titleInput);
    form.appendChild(titleGroup);

    // Description
    const descGroup = this._mk("div", "kb-form__group");
    const descLabel = this._mk("label", "kb-form__label");
    descLabel.textContent = "Description";
    const descInput = this._mk("textarea", "kb-form__textarea");
    descInput.value = card.description || "";
    descInput.rows = 4;
    descGroup.appendChild(descLabel);
    descGroup.appendChild(descInput);
    form.appendChild(descGroup);

    // Row: Priority + Column
    const row1 = this._mk("div", "kb-form__row");

    const prioGroup = this._mk("div", "kb-form__group");
    const prioLabel = this._mk("label", "kb-form__label");
    prioLabel.textContent = "Priority";
    const prioSelect = this._mk("select", "kb-form__select");
    for (const p of PRIORITIES) {
      const opt = this._mk("option", "");
      opt.value = p.key;
      opt.textContent = p.label;
      if (p.key === card.priority) opt.selected = true;
      prioSelect.appendChild(opt);
    }
    prioGroup.appendChild(prioLabel);
    prioGroup.appendChild(prioSelect);
    row1.appendChild(prioGroup);

    const colGroup = this._mk("div", "kb-form__group");
    const colLabel = this._mk("label", "kb-form__label");
    colLabel.textContent = "Column";
    const colSelect = this._mk("select", "kb-form__select");
    for (const c of COLUMNS) {
      const opt = this._mk("option", "");
      opt.value = c.key;
      opt.textContent = `${c.emoji} ${c.label}`;
      if (c.key === card.column_key) opt.selected = true;
      colSelect.appendChild(opt);
    }
    colGroup.appendChild(colLabel);
    colGroup.appendChild(colSelect);
    row1.appendChild(colGroup);

    form.appendChild(row1);

    // Row: Zone + Agent
    const row2 = this._mk("div", "kb-form__row");

    const zoneGroup = this._mk("div", "kb-form__group");
    const zoneLabel = this._mk("label", "kb-form__label");
    zoneLabel.textContent = "Zone";
    const zoneSelect = this._mk("select", "kb-form__select");
    const zoneNone = this._mk("option", "");
    zoneNone.value = "";
    zoneNone.textContent = "None";
    zoneSelect.appendChild(zoneNone);
    for (const z of this._zones) {
      const opt = this._mk("option", "");
      opt.value = z.slug || z.name;
      opt.textContent = z.name || z.slug;
      if ((z.slug || z.name) === card.zone_tag) opt.selected = true;
      zoneSelect.appendChild(opt);
    }
    zoneGroup.appendChild(zoneLabel);
    zoneGroup.appendChild(zoneSelect);
    row2.appendChild(zoneGroup);

    const agentGroup = this._mk("div", "kb-form__group");
    const agentLabel = this._mk("label", "kb-form__label");
    agentLabel.textContent = "Assign Agent";
    const agentSelect = this._mk("select", "kb-form__select");
    const agentNone = this._mk("option", "");
    agentNone.value = "";
    agentNone.textContent = "Unassigned";
    agentSelect.appendChild(agentNone);
    for (const a of this._agents) {
      const opt = this._mk("option", "");
      opt.value = a.id;
      opt.textContent = a.name || a.id;
      if (a.id == card.agent_id) opt.selected = true;
      agentSelect.appendChild(opt);
    }
    agentGroup.appendChild(agentLabel);
    agentGroup.appendChild(agentSelect);
    row2.appendChild(agentGroup);

    form.appendChild(row2);

    // Actions
    const actions = this._mk("div", "kb-form__actions");
    const cancelBtn = this._mk("button", "kb-btn");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => this._closeModal());

    const submitBtn = this._mk("button", "kb-btn kb-btn--primary");
    submitBtn.type = "submit";
    submitBtn.textContent = "Save Changes";

    actions.appendChild(cancelBtn);
    actions.appendChild(submitBtn);
    form.appendChild(actions);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const updates = {
        title: titleInput.value.trim(),
        description: descInput.value.trim(),
        priority: prioSelect.value,
        column_key: colSelect.value,
        zone_tag: zoneSelect.value,
        agent_id: agentSelect.value || null,
      };

      if (!updates.title) return;

      // Update local
      Object.assign(card, updates);
      card.updated_at = new Date().toISOString();

      // Persist
      await this._dbUpdateCard(card.id, updates);
      this._refreshBoard();
      this._closeModal();
    });

    modal.appendChild(form);
    overlay.appendChild(modal);

    this._modalOverlay = overlay;
    document.body.appendChild(overlay);

    requestAnimationFrame(() => titleInput.focus());
  }

  // ═══════════════════════════════════════════════════════════════════
  // Utility
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create an element with a CSS class.
   * @param {string} tag
   * @param {string} className
   * @returns {HTMLElement}
   */
  _mk(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }
}
