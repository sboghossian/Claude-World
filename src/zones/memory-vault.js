/**
 * memory-vault.js — Memory Vault zone for Claude World
 *
 * Persistent cross-session context management.
 * Stores auto-memories, manual memories, and agent memories.
 * Emits events for integration with the broader system.
 */

const MEMORY_CATEGORIES = ["Preference", "Fact", "Context", "Instruction"];

const MEMORY_TYPES = {
  auto: {
    label: "Auto-memories",
    icon: "\u{1F916}",
    desc: "Automatically captured from conversations",
  },
  manual: {
    label: "Manual memories",
    icon: "\u{270F}\uFE0F",
    desc: "User-created notes and context",
  },
  agent: {
    label: "Agent memories",
    icon: "\u{1F9E0}",
    desc: "What each agent has learned about you",
  },
};

/**
 * Generate a short unique ID.
 * @returns {string}
 */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Format a timestamp for display.
 * @param {number} ts
 * @returns {string}
 */
function formatDate(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;

  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Highlight search matches in text by wrapping them in <mark>.
 * @param {string} text
 * @param {string} query
 * @returns {string} HTML string
 */
function highlightMatches(text, query) {
  if (!query) return escapeHtml(text);
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(${escaped})`, "gi");
  return escapeHtml(text).replace(re, '<mark class="mv-highlight">$1</mark>');
}

/**
 * Escape HTML entities.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ── MemoryVault class ──────────────────────────────────────────

export class MemoryVault {
  /**
   * @param {HTMLElement} container — the panel body to render into
   * @param {object} [options]
   * @param {Array} [options.memories] — initial memories array
   */
  constructor(container, options = {}) {
    /** @type {HTMLElement} */
    this._container = container;

    /** @type {Array<object>} */
    this._memories = options.memories || [];

    /** @type {string} */
    this._activeTab = "auto";

    /** @type {string} */
    this._searchQuery = "";

    /** @type {Set<string>} */
    this._expandedCards = new Set();

    /** @type {string|null} */
    this._editingId = null;

    /** @type {boolean} */
    this._addFormOpen = false;

    /** @type {string|null} */
    this._deleteConfirmId = null;

    this._render();
    this._bindGlobalEvents();
  }

  // ── Public API ──────────────────────────────────────────────

  /** @returns {Array<object>} */
  get memories() {
    return this._memories;
  }

  /** @returns {Array<object>} pinned memories for agent context */
  get pinnedMemories() {
    return this._memories.filter((m) => m.pinned);
  }

  /**
   * Add a memory programmatically (e.g. from agent).
   * @param {object} mem
   */
  addMemory(mem) {
    const memory = {
      id: uid(),
      text: mem.text,
      type: mem.type || "auto",
      category: mem.category || "Context",
      source: mem.source || "System",
      pinned: mem.pinned || false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this._memories.unshift(memory);
    this._emit("memory-vault:add", {
      text: memory.text,
      category: memory.category,
      pinned: memory.pinned,
    });
    this._render();
  }

  /** Tear down. */
  destroy() {
    this._container.innerHTML = "";
  }

  // ── Rendering ───────────────────────────────────────────────

  _render() {
    this._container.innerHTML = "";
    this._container.classList.add("mv-root");

    this._container.appendChild(this._buildHeader());
    this._container.appendChild(this._buildSearch());
    this._container.appendChild(this._buildTabs());

    const filtered = this._getFilteredMemories();
    if (filtered.length === 0) {
      this._container.appendChild(this._buildEmptyState());
    } else {
      this._container.appendChild(this._buildMemoryList(filtered));
    }

    if (this._addFormOpen) {
      this._container.appendChild(this._buildAddForm());
    } else {
      this._container.appendChild(this._buildAddButton());
    }

    this._container.appendChild(this._buildStats());
  }

  _buildHeader() {
    const header = document.createElement("div");
    header.className = "mv-header";

    const title = document.createElement("h2");
    title.className = "mv-title";
    title.textContent = "\u{1F9E0} Memory Vault";
    header.appendChild(title);

    const greeting = document.createElement("p");
    greeting.className = "mv-greeting";
    greeting.textContent =
      "Your memories are safe here. I remember everything.";
    header.appendChild(greeting);

    const stats = document.createElement("div");
    stats.className = "mv-header-stats";
    const count = this._memories.length;
    const lastUpdated =
      count > 0
        ? formatDate(Math.max(...this._memories.map((m) => m.updatedAt)))
        : "Never";
    stats.textContent = `${count} memor${count === 1 ? "y" : "ies"} | Last updated: ${lastUpdated}`;
    header.appendChild(stats);

    return header;
  }

  _buildSearch() {
    const wrap = document.createElement("div");
    wrap.className = "mv-search-wrap";

    const input = document.createElement("input");
    input.className = "mv-search-input";
    input.type = "search";
    input.placeholder = "Search memories...";
    input.value = this._searchQuery;
    input.setAttribute("aria-label", "Search memories");

    input.addEventListener("input", (e) => {
      this._searchQuery = e.target.value;
      this._emit("memory-vault:search", { query: this._searchQuery });
      this._render();
      // Restore focus to search input after re-render
      const newInput = this._container.querySelector(".mv-search-input");
      if (newInput) {
        newInput.focus();
        newInput.setSelectionRange(
          newInput.value.length,
          newInput.value.length,
        );
      }
    });

    wrap.appendChild(input);

    if (this._searchQuery) {
      const filtered = this._getFilteredMemories();
      const matchCount = document.createElement("span");
      matchCount.className = "mv-search-count";
      matchCount.textContent = `${filtered.length} match${filtered.length === 1 ? "" : "es"}`;
      matchCount.setAttribute("aria-live", "polite");
      wrap.appendChild(matchCount);
    }

    return wrap;
  }

  _buildTabs() {
    const bar = document.createElement("div");
    bar.className = "mv-tab-bar";
    bar.setAttribute("role", "tablist");
    bar.setAttribute("aria-label", "Memory types");

    for (const [key, info] of Object.entries(MEMORY_TYPES)) {
      const count = this._memories.filter((m) => m.type === key).length;
      const btn = document.createElement("button");
      btn.className =
        "mv-tab" + (this._activeTab === key ? " mv-tab--active" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute(
        "aria-selected",
        this._activeTab === key ? "true" : "false",
      );
      btn.setAttribute("aria-controls", "mv-memory-list");
      btn.innerHTML = `${info.icon} ${info.label} <span class="mv-tab-count">${count}</span>`;

      btn.addEventListener("click", () => {
        this._activeTab = key;
        this._render();
      });

      bar.appendChild(btn);
    }

    return bar;
  }

  _buildMemoryList(memories) {
    const list = document.createElement("div");
    list.className = "mv-memory-list";
    list.id = "mv-memory-list";
    list.setAttribute("role", "tabpanel");
    list.setAttribute(
      "aria-label",
      `${MEMORY_TYPES[this._activeTab].label} list`,
    );

    for (const mem of memories) {
      list.appendChild(this._buildMemoryCard(mem));
    }

    return list;
  }

  _buildMemoryCard(mem) {
    const card = document.createElement("article");
    card.className = "mv-card" + (mem.pinned ? " mv-card--pinned" : "");
    card.setAttribute("aria-label", `Memory: ${mem.text.slice(0, 60)}`);

    const isExpanded = this._expandedCards.has(mem.id);
    const isEditing = this._editingId === mem.id;
    const isConfirmingDelete = this._deleteConfirmId === mem.id;

    // Top row: badge + source + timestamp
    const meta = document.createElement("div");
    meta.className = "mv-card-meta";

    const badge = document.createElement("span");
    badge.className = `mv-badge mv-badge--${mem.type}`;
    badge.textContent = mem.type;
    meta.appendChild(badge);

    if (mem.category) {
      const catBadge = document.createElement("span");
      catBadge.className = "mv-badge mv-badge--category";
      catBadge.textContent = mem.category;
      meta.appendChild(catBadge);
    }

    const source = document.createElement("span");
    source.className = "mv-card-source";
    source.textContent = mem.source;
    meta.appendChild(source);

    const time = document.createElement("time");
    time.className = "mv-card-time";
    time.dateTime = new Date(mem.createdAt).toISOString();
    time.textContent = formatDate(mem.createdAt);
    meta.appendChild(time);

    card.appendChild(meta);

    // Content
    if (isEditing) {
      const editWrap = document.createElement("div");
      editWrap.className = "mv-edit-wrap";

      const textarea = document.createElement("textarea");
      textarea.className = "mv-edit-textarea";
      textarea.value = mem.text;
      textarea.setAttribute("aria-label", "Edit memory text");
      textarea.rows = 4;
      editWrap.appendChild(textarea);

      const editActions = document.createElement("div");
      editActions.className = "mv-edit-actions";

      const saveBtn = document.createElement("button");
      saveBtn.className = "mv-btn mv-btn--primary";
      saveBtn.textContent = "Save";
      saveBtn.addEventListener("click", () => {
        const newText = textarea.value.trim();
        if (newText && newText !== mem.text) {
          mem.text = newText;
          mem.updatedAt = Date.now();
          this._emit("memory-vault:edit", { memoryId: mem.id, text: newText });
        }
        this._editingId = null;
        this._render();
      });

      const cancelBtn = document.createElement("button");
      cancelBtn.className = "mv-btn mv-btn--ghost";
      cancelBtn.textContent = "Cancel";
      cancelBtn.addEventListener("click", () => {
        this._editingId = null;
        this._render();
      });

      editActions.appendChild(saveBtn);
      editActions.appendChild(cancelBtn);
      editWrap.appendChild(editActions);
      card.appendChild(editWrap);
    } else {
      const content = document.createElement("div");
      content.className =
        "mv-card-content" + (isExpanded ? " mv-card-content--expanded" : "");

      const textEl = document.createElement("div");
      textEl.className = "mv-card-text";
      textEl.innerHTML = highlightMatches(mem.text, this._searchQuery);
      content.appendChild(textEl);

      // Expand/collapse toggle for long text
      if (mem.text.split("\n").length > 2 || mem.text.length > 140) {
        const toggle = document.createElement("button");
        toggle.className = "mv-card-toggle";
        toggle.textContent = isExpanded ? "Show less" : "Show more";
        toggle.setAttribute("aria-expanded", isExpanded ? "true" : "false");
        toggle.addEventListener("click", () => {
          if (isExpanded) {
            this._expandedCards.delete(mem.id);
          } else {
            this._expandedCards.add(mem.id);
          }
          this._render();
        });
        content.appendChild(toggle);
      }

      card.appendChild(content);
    }

    // Actions row
    const actions = document.createElement("div");
    actions.className = "mv-card-actions";

    // Pin toggle
    const pinBtn = document.createElement("button");
    pinBtn.className =
      "mv-action-btn" + (mem.pinned ? " mv-action-btn--active" : "");
    pinBtn.innerHTML = mem.pinned ? "\u{1F4CC} Unpin" : "\u{1F4CC} Pin";
    pinBtn.title = mem.pinned
      ? "Remove from agent context"
      : "Always include in agent context";
    pinBtn.setAttribute("aria-pressed", mem.pinned ? "true" : "false");
    pinBtn.addEventListener("click", () => {
      mem.pinned = !mem.pinned;
      mem.updatedAt = Date.now();
      this._emit("memory-vault:pin", { memoryId: mem.id, pinned: mem.pinned });
      this._render();
    });
    actions.appendChild(pinBtn);

    // Edit button (for manual memories, or all)
    if (mem.type === "manual") {
      const editBtn = document.createElement("button");
      editBtn.className = "mv-action-btn";
      editBtn.textContent = "\u{270F}\uFE0F Edit";
      editBtn.addEventListener("click", () => {
        this._editingId = mem.id;
        this._render();
      });
      actions.appendChild(editBtn);
    }

    // Delete button with confirmation
    if (isConfirmingDelete) {
      const confirmWrap = document.createElement("span");
      confirmWrap.className = "mv-delete-confirm";

      const confirmLabel = document.createElement("span");
      confirmLabel.className = "mv-delete-confirm-label";
      confirmLabel.textContent = "Delete?";
      confirmWrap.appendChild(confirmLabel);

      const yesBtn = document.createElement("button");
      yesBtn.className = "mv-action-btn mv-action-btn--danger";
      yesBtn.textContent = "Yes";
      yesBtn.addEventListener("click", () => {
        this._memories = this._memories.filter((m) => m.id !== mem.id);
        this._deleteConfirmId = null;
        this._emit("memory-vault:delete", { memoryId: mem.id });
        this._render();
      });
      confirmWrap.appendChild(yesBtn);

      const noBtn = document.createElement("button");
      noBtn.className = "mv-action-btn";
      noBtn.textContent = "No";
      noBtn.addEventListener("click", () => {
        this._deleteConfirmId = null;
        this._render();
      });
      confirmWrap.appendChild(noBtn);

      actions.appendChild(confirmWrap);
    } else {
      const deleteBtn = document.createElement("button");
      deleteBtn.className = "mv-action-btn mv-action-btn--danger";
      deleteBtn.textContent = "\u{1F5D1} Delete";
      deleteBtn.addEventListener("click", () => {
        this._deleteConfirmId = mem.id;
        this._render();
      });
      actions.appendChild(deleteBtn);
    }

    card.appendChild(actions);
    return card;
  }

  _buildEmptyState() {
    const wrap = document.createElement("div");
    wrap.className = "mv-empty";

    const icon = document.createElement("div");
    icon.className = "mv-empty-icon";
    icon.textContent = "\u{1F5C4}";
    wrap.appendChild(icon);

    const text = document.createElement("p");
    text.className = "mv-empty-text";

    if (this._searchQuery) {
      text.textContent = `No memories match "${this._searchQuery}".`;
    } else {
      text.textContent =
        "No memories yet. As you work with your agents, I'll remember what matters.";
    }
    wrap.appendChild(text);

    return wrap;
  }

  _buildAddButton() {
    const wrap = document.createElement("div");
    wrap.className = "mv-add-wrap";

    const btn = document.createElement("button");
    btn.className = "mv-btn mv-btn--primary mv-add-btn";
    btn.textContent = "+ Add Memory";
    btn.addEventListener("click", () => {
      this._addFormOpen = true;
      this._render();
      const ta = this._container.querySelector(".mv-add-textarea");
      if (ta) ta.focus();
    });
    wrap.appendChild(btn);

    return wrap;
  }

  _buildAddForm() {
    const form = document.createElement("div");
    form.className = "mv-add-form";
    form.setAttribute("role", "form");
    form.setAttribute("aria-label", "Add a new memory");

    const formTitle = document.createElement("div");
    formTitle.className = "mv-add-form-title";
    formTitle.textContent = "New Memory";
    form.appendChild(formTitle);

    // Textarea
    const textareaLabel = document.createElement("label");
    textareaLabel.className = "mv-form-label";
    textareaLabel.textContent = "Memory content";
    textareaLabel.htmlFor = "mv-add-content";
    form.appendChild(textareaLabel);

    const textarea = document.createElement("textarea");
    textarea.className = "mv-add-textarea";
    textarea.id = "mv-add-content";
    textarea.placeholder = "What should I remember?";
    textarea.rows = 3;
    form.appendChild(textarea);

    // Category selector
    const catLabel = document.createElement("label");
    catLabel.className = "mv-form-label";
    catLabel.textContent = "Category";
    catLabel.htmlFor = "mv-add-category";
    form.appendChild(catLabel);

    const select = document.createElement("select");
    select.className = "mv-add-select";
    select.id = "mv-add-category";
    for (const cat of MEMORY_CATEGORIES) {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      select.appendChild(opt);
    }
    form.appendChild(select);

    // Always include checkbox
    const checkWrap = document.createElement("label");
    checkWrap.className = "mv-checkbox-wrap";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "mv-checkbox";
    checkbox.id = "mv-add-pinned";
    checkWrap.appendChild(checkbox);

    const checkLabel = document.createElement("span");
    checkLabel.className = "mv-checkbox-label";
    checkLabel.textContent = "Always include in agent context";
    checkWrap.appendChild(checkLabel);

    form.appendChild(checkWrap);

    // Action buttons
    const actions = document.createElement("div");
    actions.className = "mv-add-actions";

    const saveBtn = document.createElement("button");
    saveBtn.className = "mv-btn mv-btn--primary";
    saveBtn.textContent = "Save Memory";
    saveBtn.addEventListener("click", () => {
      const text = textarea.value.trim();
      if (!text) {
        textarea.focus();
        return;
      }
      this.addMemory({
        text,
        type: "manual",
        category: select.value,
        source: "User",
        pinned: checkbox.checked,
      });
      this._addFormOpen = false;
      this._render();
    });

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "mv-btn mv-btn--ghost";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => {
      this._addFormOpen = false;
      this._render();
    });

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    return form;
  }

  _buildStats() {
    const section = document.createElement("div");
    section.className = "mv-stats";

    const title = document.createElement("div");
    title.className = "mv-stats-title";
    title.textContent = "Memory Stats";
    section.appendChild(title);

    if (this._memories.length === 0) {
      const empty = document.createElement("div");
      empty.className = "mv-stats-empty";
      empty.textContent = "No data yet.";
      section.appendChild(empty);
      return section;
    }

    // Type distribution — horizontal bars
    const typeCounts = { auto: 0, manual: 0, agent: 0 };
    const sourceCounts = {};
    for (const m of this._memories) {
      typeCounts[m.type] = (typeCounts[m.type] || 0) + 1;
      if (m.type === "agent") {
        sourceCounts[m.source] = (sourceCounts[m.source] || 0) + 1;
      }
    }

    const total = this._memories.length;

    const barsWrap = document.createElement("div");
    barsWrap.className = "mv-stat-bars";

    for (const [type, info] of Object.entries(MEMORY_TYPES)) {
      const count = typeCounts[type];
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;

      const row = document.createElement("div");
      row.className = "mv-stat-bar-row";

      const label = document.createElement("div");
      label.className = "mv-stat-bar-label";
      label.textContent = `${info.icon} ${info.label}`;

      const barOuter = document.createElement("div");
      barOuter.className = "mv-stat-bar-outer";

      const barInner = document.createElement("div");
      barInner.className = `mv-stat-bar-inner mv-stat-bar--${type}`;
      barInner.style.width = `${pct}%`;

      const value = document.createElement("span");
      value.className = "mv-stat-bar-value";
      value.textContent = `${count} (${pct}%)`;

      barOuter.appendChild(barInner);
      row.appendChild(label);
      row.appendChild(barOuter);
      row.appendChild(value);
      barsWrap.appendChild(row);
    }
    section.appendChild(barsWrap);

    // Most active agent
    if (Object.keys(sourceCounts).length > 0) {
      const sorted = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]);
      const [topAgent, topCount] = sorted[0];

      const agentStat = document.createElement("div");
      agentStat.className = "mv-stat-row";
      agentStat.innerHTML = `<span class="mv-stat-label">Most active agent</span><span class="mv-stat-value">${escapeHtml(topAgent)} (${topCount})</span>`;
      section.appendChild(agentStat);
    }

    // Memory age distribution
    const now = Date.now();
    const ageBuckets = { Today: 0, "This week": 0, "This month": 0, Older: 0 };
    for (const m of this._memories) {
      const age = now - m.createdAt;
      if (age < 86_400_000) ageBuckets["Today"]++;
      else if (age < 604_800_000) ageBuckets["This week"]++;
      else if (age < 2_592_000_000) ageBuckets["This month"]++;
      else ageBuckets["Older"]++;
    }

    const ageWrap = document.createElement("div");
    ageWrap.className = "mv-stat-age";

    const ageTitle = document.createElement("div");
    ageTitle.className = "mv-stat-age-title";
    ageTitle.textContent = "Age distribution";
    ageWrap.appendChild(ageTitle);

    for (const [bucket, count] of Object.entries(ageBuckets)) {
      if (count === 0) continue;
      const row = document.createElement("div");
      row.className = "mv-stat-row";
      row.innerHTML = `<span class="mv-stat-label">${escapeHtml(bucket)}</span><span class="mv-stat-value">${count}</span>`;
      ageWrap.appendChild(row);
    }
    section.appendChild(ageWrap);

    return section;
  }

  // ── Helpers ─────────────────────────────────────────────────

  _getFilteredMemories() {
    let list = this._memories.filter((m) => m.type === this._activeTab);

    if (this._searchQuery) {
      const q = this._searchQuery.toLowerCase();
      list = list.filter(
        (m) =>
          m.text.toLowerCase().includes(q) ||
          m.source.toLowerCase().includes(q) ||
          m.category.toLowerCase().includes(q),
      );
    }

    return list;
  }

  /**
   * Dispatch a custom event on document.
   * @param {string} name
   * @param {object} detail
   */
  _emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }

  _bindGlobalEvents() {
    // Listen for external memory additions
    this._onExternalAdd = (e) => {
      if (e.detail && e.detail._fromVault) return; // avoid loops
      this.addMemory(e.detail);
    };
    document.addEventListener("memory-vault:external-add", this._onExternalAdd);
  }
}

// ── Builder function (matches panel pattern) ──────────────────

/**
 * Build the Memory Vault zone content.
 * Returns a container element with a MemoryVault instance attached.
 * @param {object} [options]
 * @param {Array} [options.memories] — pre-loaded memories
 * @returns {HTMLElement}
 */
export function buildMemoryVaultContent(options = {}) {
  const container = document.createElement("div");
  container.className = "mv-container";

  // Provide some demo memories if none given
  const memories = options.memories || [
    {
      id: uid(),
      type: "auto",
      text: "User prefers dark mode with high contrast.",
      category: "Preference",
      source: "Commander",
      pinned: true,
      createdAt: Date.now() - 86_400_000 * 3,
      updatedAt: Date.now() - 86_400_000 * 3,
    },
    {
      id: uid(),
      type: "auto",
      text: "Project uses Electron + Canvas + SQLite stack. Two-month roadmap targeting Product Hunt launch.",
      category: "Context",
      source: "Librarian",
      pinned: true,
      createdAt: Date.now() - 86_400_000 * 7,
      updatedAt: Date.now() - 86_400_000 * 2,
    },
    {
      id: uid(),
      type: "manual",
      text: "Always use vanilla JS, no frameworks. Keep CSS in separate files with BEM-like naming.",
      category: "Instruction",
      source: "User",
      pinned: true,
      createdAt: Date.now() - 86_400_000 * 5,
      updatedAt: Date.now() - 86_400_000 * 5,
    },
    {
      id: uid(),
      type: "agent",
      text: "User is building an AI-native OS called Claude World with an isometric city metaphor.",
      category: "Fact",
      source: "Archivist",
      pinned: false,
      createdAt: Date.now() - 86_400_000 * 10,
      updatedAt: Date.now() - 86_400_000 * 10,
    },
    {
      id: uid(),
      type: "agent",
      text: "User responds well to concise, direct communication. Prefers code over explanations.",
      category: "Preference",
      source: "Commander",
      pinned: false,
      createdAt: Date.now() - 86_400_000,
      updatedAt: Date.now() - 86_400_000,
    },
  ];

  // Attach instance for external access
  container._vault = new MemoryVault(container, { memories });
  return container;
}
