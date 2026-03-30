/**
 * conversation-history.js — Conversation History zone
 *
 * Browsable archive of all past AI interactions (tasks + messages).
 * Split layout: left sidebar with conversation list, main area with
 * full prompt/response detail including markdown rendering.
 *
 * Features:
 *   - Conversation list grouped by date with model icons & token badges
 *   - Full-text search across all conversations
 *   - Filters by model, date range, zone, status
 *   - Sort by newest, oldest, most tokens, highest cost
 *   - Bulk select, delete, export as JSON
 *   - Infinite scroll (20 items at a time)
 *   - Markdown-like rendering (headers, code blocks, lists, bold, italic)
 *   - Copy prompt / copy response / retry / use-as-template actions
 *   - Token usage breakdown & cost display
 *
 * Vanilla JS + CSS. Pairs with conversation-history.css.
 */

// ── Constants ──────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const MODEL_COLORS = {
  "claude-3-opus": "#a855f7",
  "claude-3-sonnet": "#6366f1",
  "claude-3-haiku": "#06b6d4",
  "claude-3.5-sonnet": "#8b5cf6",
  "claude-4-opus": "#c084fc",
  "gpt-4": "#10b981",
  "gpt-4o": "#34d399",
  "gpt-3.5-turbo": "#6ee7b7",
  default: "#8888a0",
};

const SORT_OPTIONS = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "tokens", label: "Most tokens" },
  { key: "cost", label: "Highest cost" },
];

const STATUS_FILTERS = ["completed", "failed", "pending", "running"];

// ── Helpers ────────────────────────────────────────────────────────

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
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dateGroupKey(iso) {
  if (!iso) return "Unknown";
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (today - day) / 86400000;
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return "This Week";
  if (diff < 30) return "This Month";
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function modelColor(model) {
  if (!model) return MODEL_COLORS.default;
  const lower = model.toLowerCase();
  for (const [key, color] of Object.entries(MODEL_COLORS)) {
    if (lower.includes(key)) return color;
  }
  return MODEL_COLORS.default;
}

function formatTokens(n) {
  if (!n && n !== 0) return "?";
  if (n >= 1000) return (n / 1000).toFixed(1) + "k";
  return String(n);
}

function formatCost(usd) {
  if (!usd && usd !== 0) return "$0.00";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

/**
 * Very lightweight markdown-to-HTML renderer.
 * Handles: headers, code blocks, inline code, bold, italic, lists.
 */
function renderMarkdown(text) {
  if (!text) return "";
  let html = escapeHTML(text);

  // Code blocks: ```lang\n...\n```
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const langBadge = lang
      ? `<span class="conv-history__code-lang">${lang}</span>`
      : "";
    return `<pre>${langBadge}<code>${code}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold & italic
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>");
  // Collapse adjacent <ul> blocks
  html = html.replace(/<\/ul>\s*<ul>/g, "");

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  // Line breaks (outside pre blocks)
  html = html.replace(/\n/g, "<br>");
  // Clean up extra <br> inside pre/code blocks
  html = html.replace(/<pre>([\s\S]*?)<\/pre>/g, (_m, inner) => {
    return "<pre>" + inner.replace(/<br>/g, "\n") + "</pre>";
  });

  return html;
}

// ── ConversationHistory class ──────────────────────────────────────

export class ConversationHistory {
  constructor() {
    /** @type {string|number|null} */
    this._worldId = null;
    /** @type {HTMLElement|null} */
    this._root = null;

    /** @type {Array<object>} All conversation items (tasks) */
    this._allItems = [];
    /** @type {object|null} Currently selected conversation */
    this._selected = null;
    /** @type {Set<string>} Selected item IDs for bulk actions */
    this._bulkSelected = new Set();

    /** @type {string} Search query */
    this._searchQuery = "";
    /** @type {string} Sort key */
    this._sortKey = "newest";
    /** @type {Set<string>} Active status filters (empty = all) */
    this._statusFilters = new Set();
    /** @type {string|null} Model filter */
    this._modelFilter = null;

    /** @type {number} Items currently rendered in the list */
    this._renderedCount = 0;
    /** @type {IntersectionObserver|null} */
    this._scrollObserver = null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create and return the root DOM element.
   * @returns {HTMLElement}
   */
  render() {
    this._injectCSS();

    const root = document.createElement("div");
    root.className = "conv-history";
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "Conversation History");
    this._root = root;

    this._build();
    this._bindEvents();

    return root;
  }

  /**
   * Load data and populate the view.
   * @param {string|number} worldId
   */
  async init(worldId) {
    this._worldId = worldId;
    await this._fetchConversations();
    this._renderList();
  }

  /**
   * Cleanup.
   */
  destroy() {
    if (this._scrollObserver) {
      this._scrollObserver.disconnect();
      this._scrollObserver = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // CSS injection
  // ═══════════════════════════════════════════════════════════════════

  _injectCSS() {
    const id = "conversation-history-styles";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "src/zones/conversation-history.css";
    document.head.appendChild(link);
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOM construction
  // ═══════════════════════════════════════════════════════════════════

  _build() {
    this._root.innerHTML = "";

    // ── Toolbar (search) ──
    const toolbar = this._el("div", "conv-history__toolbar");
    this._searchInput = this._el("input", "conv-history__search");
    this._searchInput.type = "search";
    this._searchInput.placeholder = "Search conversations...";
    this._searchInput.setAttribute("aria-label", "Search conversations");
    toolbar.appendChild(this._searchInput);
    this._root.appendChild(toolbar);

    // ── Filters bar ──
    const filters = this._el("div", "conv-history__filters");

    // Status filter chips
    for (const status of STATUS_FILTERS) {
      const chip = this._el("button", "conv-history__filter-chip");
      chip.textContent = status;
      chip.dataset.status = status;
      chip.setAttribute("aria-pressed", "false");
      filters.appendChild(chip);
      chip.addEventListener("click", () =>
        this._toggleStatusFilter(status, chip),
      );
    }

    // Model filter select
    this._modelSelect = this._el("select", "conv-history__sort-select");
    const modelAll = this._el("option");
    modelAll.value = "";
    modelAll.textContent = "All models";
    this._modelSelect.appendChild(modelAll);
    filters.appendChild(this._modelSelect);

    // Sort dropdown
    this._sortSelect = this._el("select", "conv-history__sort-select");
    for (const opt of SORT_OPTIONS) {
      const option = this._el("option");
      option.value = opt.key;
      option.textContent = opt.label;
      this._sortSelect.appendChild(option);
    }
    filters.appendChild(this._sortSelect);

    // Bulk actions
    const bulkWrap = this._el("div", "conv-history__bulk-actions");
    this._selectAllBtn = this._el("button", "conv-history__bulk-btn");
    this._selectAllBtn.textContent = "Select all";
    bulkWrap.appendChild(this._selectAllBtn);

    this._exportBtn = this._el("button", "conv-history__bulk-btn");
    this._exportBtn.textContent = "Export JSON";
    bulkWrap.appendChild(this._exportBtn);

    this._deleteBtn = this._el(
      "button",
      "conv-history__bulk-btn conv-history__bulk-btn--danger",
    );
    this._deleteBtn.textContent = "Delete";
    bulkWrap.appendChild(this._deleteBtn);

    filters.appendChild(bulkWrap);
    this._root.appendChild(filters);

    // ── Body (split) ──
    const body = this._el("div", "conv-history__body");

    // Sidebar
    const sidebar = this._el("div", "conv-history__sidebar");
    this._listEl = this._el("div", "conv-history__list");
    sidebar.appendChild(this._listEl);
    this._sentinel = this._el("div", "conv-history__sentinel");
    sidebar.appendChild(this._sentinel);
    body.appendChild(sidebar);

    // Detail pane
    this._detailEl = this._el("div", "conv-history__detail");
    this._showDetailEmpty();
    body.appendChild(this._detailEl);

    this._root.appendChild(body);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Event binding
  // ═══════════════════════════════════════════════════════════════════

  _bindEvents() {
    // Search with debounce
    let searchTimer = null;
    this._searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this._searchQuery = this._searchInput.value.trim().toLowerCase();
        this._renderedCount = 0;
        this._renderList();
      }, 250);
    });

    // Sort
    this._sortSelect.addEventListener("change", () => {
      this._sortKey = this._sortSelect.value;
      this._renderedCount = 0;
      this._renderList();
    });

    // Model filter
    this._modelSelect.addEventListener("change", () => {
      this._modelFilter = this._modelSelect.value || null;
      this._renderedCount = 0;
      this._renderList();
    });

    // Select all
    this._selectAllBtn.addEventListener("click", () => this._toggleSelectAll());

    // Export
    this._exportBtn.addEventListener("click", () => this._exportSelected());

    // Delete
    this._deleteBtn.addEventListener("click", () => this._deleteSelected());

    // Infinite scroll
    this._scrollObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) this._loadMore();
        }
      },
      { rootMargin: "200px" },
    );
    this._scrollObserver.observe(this._sentinel);

    // List click delegation
    this._listEl.addEventListener("click", (e) => {
      const item = e.target.closest(".conv-history__item");
      if (!item) return;

      // If click was on the checkbox, handle bulk select
      if (e.target.classList.contains("conv-history__item-check")) {
        const id = item.dataset.id;
        if (this._bulkSelected.has(id)) {
          this._bulkSelected.delete(id);
          e.target.checked = false;
        } else {
          this._bulkSelected.add(id);
          e.target.checked = true;
        }
        return;
      }

      // Otherwise select conversation
      const id = item.dataset.id;
      const conv = this._allItems.find((c) => c.id === id);
      if (conv) this._selectConversation(conv, item);
    });
  }

  _toggleStatusFilter(status, chip) {
    if (this._statusFilters.has(status)) {
      this._statusFilters.delete(status);
      chip.classList.remove("conv-history__filter-chip--active");
      chip.setAttribute("aria-pressed", "false");
    } else {
      this._statusFilters.add(status);
      chip.classList.add("conv-history__filter-chip--active");
      chip.setAttribute("aria-pressed", "true");
    }
    this._renderedCount = 0;
    this._renderList();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Data fetching
  // ═══════════════════════════════════════════════════════════════════

  async _fetchConversations() {
    const items = [];
    const api = window.api && window.api.db;
    if (!api) {
      this._allItems = [];
      return;
    }

    try {
      // Fetch tasks (primary conversation source)
      const tasks = api.getRecentTasks
        ? await api.getRecentTasks(this._worldId, 500)
        : [];

      for (const t of tasks || []) {
        const inputTokens = t.input_tokens || 0;
        const outputTokens = t.output_tokens || 0;
        items.push({
          id: t.id,
          type: "task",
          title: this._extractTitle(t.prompt),
          prompt: t.prompt || "",
          response: t.response || "",
          systemPrompt: t.system_prompt || "",
          model: t.model || "unknown",
          provider: t.provider || "",
          status: t.status || "completed",
          zone_id: t.zone_id || null,
          agent_id: t.agent_id || null,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          cost: t.cost_usd || 0,
          latency: t.latency_ms || 0,
          created_at: t.created_at,
          completed_at: t.completed_at,
          error: t.error || null,
          metadata: t.metadata_json ? this._safeParse(t.metadata_json) : {},
        });
      }
    } catch (err) {
      console.warn("[ConversationHistory] Failed to load tasks:", err);
    }

    try {
      // Also fetch chat messages grouped by project
      const projects = api.getProjects
        ? await api.getProjects(this._worldId)
        : [];

      for (const proj of projects || []) {
        const messages = api.getMessages
          ? await api.getMessages(proj.id, 200)
          : [];
        if (!messages || messages.length === 0) continue;

        const totalTokens = messages.reduce(
          (s, m) => s + (m.tokens_used || 0),
          0,
        );
        const totalCost = messages.reduce((s, m) => s + (m.cost_usd || 0), 0);
        const userMsgs = messages.filter((m) => m.role === "user");
        const assistantMsgs = messages.filter((m) => m.role === "assistant");

        items.push({
          id: `proj-${proj.id}`,
          type: "chat",
          title: proj.name || this._extractTitle(userMsgs[0]?.content),
          prompt: userMsgs.map((m) => m.content).join("\n\n---\n\n"),
          response: assistantMsgs.map((m) => m.content).join("\n\n---\n\n"),
          systemPrompt: "",
          model: messages.find((m) => m.model)?.model || "unknown",
          provider: "",
          status: "completed",
          zone_id: null,
          agent_id: null,
          inputTokens: 0,
          outputTokens: totalTokens,
          totalTokens,
          cost: totalCost,
          latency: 0,
          created_at: proj.created_at || messages[0]?.created_at,
          completed_at:
            proj.updated_at || messages[messages.length - 1]?.created_at,
          error: null,
          metadata: {},
          _messages: messages,
        });
      }
    } catch (err) {
      console.warn("[ConversationHistory] Failed to load chat projects:", err);
    }

    // Sort chronologically descending by default
    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    this._allItems = items;

    // Populate model filter dropdown
    this._populateModelFilter();
  }

  _extractTitle(text) {
    if (!text) return "Untitled";
    const first = text.split("\n")[0].trim();
    return first.length > 80 ? first.slice(0, 80) + "..." : first;
  }

  _safeParse(json) {
    try {
      return JSON.parse(json);
    } catch {
      return {};
    }
  }

  _populateModelFilter() {
    const models = new Set();
    for (const item of this._allItems) {
      if (item.model && item.model !== "unknown") models.add(item.model);
    }
    // Clear existing options except "All models"
    while (this._modelSelect.options.length > 1) {
      this._modelSelect.remove(1);
    }
    for (const m of [...models].sort()) {
      const opt = this._el("option");
      opt.value = m;
      opt.textContent = m;
      this._modelSelect.appendChild(opt);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Filtering, sorting, rendering list
  // ═══════════════════════════════════════════════════════════════════

  _filteredItems() {
    let items = this._allItems;

    // Status filter
    if (this._statusFilters.size > 0) {
      items = items.filter((i) => this._statusFilters.has(i.status));
    }

    // Model filter
    if (this._modelFilter) {
      items = items.filter((i) => i.model === this._modelFilter);
    }

    // Search filter
    if (this._searchQuery) {
      const q = this._searchQuery;
      items = items.filter((i) => {
        const searchable = [i.title, i.prompt, i.response, i.model, i.status]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return searchable.includes(q);
      });
    }

    // Sort
    switch (this._sortKey) {
      case "oldest":
        items = [...items].sort(
          (a, b) => new Date(a.created_at) - new Date(b.created_at),
        );
        break;
      case "tokens":
        items = [...items].sort((a, b) => b.totalTokens - a.totalTokens);
        break;
      case "cost":
        items = [...items].sort((a, b) => b.cost - a.cost);
        break;
      default: // newest
        items = [...items].sort(
          (a, b) => new Date(b.created_at) - new Date(a.created_at),
        );
    }

    return items;
  }

  _renderList() {
    const items = this._filteredItems();
    this._listEl.innerHTML = "";
    this._renderedCount = Math.min(PAGE_SIZE, items.length);

    if (items.length === 0) {
      const empty = this._el("div", "conv-history__list-empty");
      empty.textContent = this._searchQuery
        ? "No conversations match your search."
        : "No conversations yet.";
      this._listEl.appendChild(empty);
      return;
    }

    this._appendItems(items, 0, this._renderedCount);
  }

  _loadMore() {
    const items = this._filteredItems();
    if (this._renderedCount >= items.length) return;
    const start = this._renderedCount;
    const end = Math.min(start + PAGE_SIZE, items.length);
    this._renderedCount = end;
    this._appendItems(items, start, end);
  }

  _appendItems(items, start, end) {
    const frag = document.createDocumentFragment();
    let lastGroup = null;

    // Get last group from existing list
    if (start > 0 && start - 1 >= 0) {
      lastGroup = dateGroupKey(items[start - 1].created_at);
    }

    for (let i = start; i < end; i++) {
      const item = items[i];
      const group = dateGroupKey(item.created_at);

      if (group !== lastGroup) {
        const header = this._el("div", "conv-history__date-header");
        header.textContent = group;
        frag.appendChild(header);
        lastGroup = group;
      }

      frag.appendChild(this._buildListItem(item));
    }

    this._listEl.appendChild(frag);
  }

  _buildListItem(item) {
    const el = this._el("div", "conv-history__item");
    el.dataset.id = item.id;
    if (this._selected && this._selected.id === item.id) {
      el.classList.add("conv-history__item--active");
    }

    // Checkbox for bulk select
    const check = document.createElement("input");
    check.type = "checkbox";
    check.className = "conv-history__item-check";
    check.checked = this._bulkSelected.has(item.id);
    check.setAttribute("aria-label", "Select conversation");
    el.appendChild(check);

    // Status dot
    const statusDot = this._el(
      "span",
      `conv-history__item-status conv-history__item-status--${item.status}`,
    );
    statusDot.title = item.status;
    el.appendChild(statusDot);

    // Body
    const body = this._el("div", "conv-history__item-body");

    const title = this._el("div", "conv-history__item-title");
    title.textContent = item.title;
    title.title = item.title;
    body.appendChild(title);

    const meta = this._el("div", "conv-history__item-meta");

    // Model icon
    const modelEl = this._el("span", "conv-history__item-model");
    const dot = this._el("span", "conv-history__item-model-icon");
    dot.style.backgroundColor = modelColor(item.model);
    modelEl.appendChild(dot);
    modelEl.appendChild(document.createTextNode(item.model || ""));
    meta.appendChild(modelEl);

    // Time
    meta.appendChild(document.createTextNode(relativeTime(item.created_at)));

    // Token badge
    if (item.totalTokens > 0) {
      const tokenBadge = this._el("span", "conv-history__item-tokens");
      tokenBadge.textContent = formatTokens(item.totalTokens);
      meta.appendChild(tokenBadge);
    }

    body.appendChild(meta);
    el.appendChild(body);

    return el;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Detail pane
  // ═══════════════════════════════════════════════════════════════════

  _showDetailEmpty() {
    this._detailEl.innerHTML = "";
    const empty = this._el("div", "conv-history__detail-empty");
    empty.textContent = "Select a conversation to view details.";
    this._detailEl.appendChild(empty);
  }

  _selectConversation(conv, itemEl) {
    this._selected = conv;

    // Update active state in sidebar
    const prev = this._listEl.querySelector(".conv-history__item--active");
    if (prev) prev.classList.remove("conv-history__item--active");
    if (itemEl) itemEl.classList.add("conv-history__item--active");

    this._renderDetail(conv);
  }

  _renderDetail(conv) {
    this._detailEl.innerHTML = "";

    // ── Header ──
    const header = this._el("div", "conv-history__detail-header");
    const title = this._el("div", "conv-history__detail-title");
    title.textContent = conv.title;
    header.appendChild(title);

    const actions = this._el("div", "conv-history__detail-actions");

    const copyPromptBtn = this._actionBtn("Copy Prompt", () =>
      this._copyText(conv.prompt),
    );
    const copyResponseBtn = this._actionBtn("Copy Response", () =>
      this._copyText(conv.response),
    );
    const retryBtn = this._actionBtn("Retry", () => this._retry(conv));
    const templateBtn = this._actionBtn("Use as Template", () =>
      this._useAsTemplate(conv),
    );

    actions.appendChild(copyPromptBtn);
    actions.appendChild(copyResponseBtn);
    actions.appendChild(retryBtn);
    actions.appendChild(templateBtn);
    header.appendChild(actions);
    this._detailEl.appendChild(header);

    // ── Stats bar ──
    const stats = this._el("div", "conv-history__stats");

    stats.appendChild(this._buildStat(formatTokens(conv.inputTokens), "Input"));
    stats.appendChild(
      this._buildStat(formatTokens(conv.outputTokens), "Output"),
    );
    stats.appendChild(this._buildStat(formatTokens(conv.totalTokens), "Total"));
    stats.appendChild(this._buildStat(formatCost(conv.cost), "Cost"));
    stats.appendChild(
      this._buildStat(
        conv.latency ? `${(conv.latency / 1000).toFixed(1)}s` : "-",
        "Response Time",
      ),
    );
    stats.appendChild(this._buildStat(conv.model || "-", "Model"));
    stats.appendChild(this._buildStat(conv.status, "Status"));

    this._detailEl.appendChild(stats);

    // ── Messages area ──
    const messagesEl = this._el("div", "conv-history__messages");

    // If this is a chat project with individual messages, show them
    if (conv._messages && conv._messages.length > 0) {
      for (const msg of conv._messages) {
        messagesEl.appendChild(this._buildMessage(msg.role, msg.content));
      }
    } else {
      // Otherwise show prompt/response as two messages
      if (conv.systemPrompt) {
        messagesEl.appendChild(this._buildMessage("system", conv.systemPrompt));
      }
      if (conv.prompt) {
        messagesEl.appendChild(this._buildMessage("user", conv.prompt));
      }
      if (conv.response) {
        messagesEl.appendChild(this._buildMessage("assistant", conv.response));
      }
      if (conv.error) {
        messagesEl.appendChild(
          this._buildMessage("system", `Error: ${conv.error}`),
        );
      }
    }

    this._detailEl.appendChild(messagesEl);
  }

  _buildMessage(role, content) {
    const wrapper = this._el(
      "div",
      `conv-history__message conv-history__message--${role}`,
    );

    const header = this._el("div", "conv-history__message-header");
    const roleBadge = this._el(
      "span",
      `conv-history__message-role conv-history__message-role--${role}`,
    );
    roleBadge.textContent = role;
    header.appendChild(roleBadge);

    const copyBtn = this._el("button", "conv-history__message-copy");
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => this._copyText(content));
    header.appendChild(copyBtn);

    wrapper.appendChild(header);

    const body = this._el("div", "conv-history__message-body");
    body.innerHTML = renderMarkdown(content);
    wrapper.appendChild(body);

    return wrapper;
  }

  _buildStat(value, label) {
    const stat = this._el("div", "conv-history__stat");
    const valEl = this._el("div", "conv-history__stat-value");
    valEl.textContent = value;
    const labelEl = this._el("div", "conv-history__stat-label");
    labelEl.textContent = label;
    stat.appendChild(valEl);
    stat.appendChild(labelEl);
    return stat;
  }

  _actionBtn(text, handler) {
    const btn = this._el("button", "conv-history__action-btn");
    btn.textContent = text;
    btn.addEventListener("click", handler);
    return btn;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════════════

  async _copyText(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  _retry(conv) {
    // Dispatch the same prompt again via event
    document.dispatchEvent(
      new CustomEvent("conversation-history:retry", {
        detail: {
          prompt: conv.prompt,
          systemPrompt: conv.systemPrompt,
          model: conv.model,
          provider: conv.provider,
          zone_id: conv.zone_id,
        },
        bubbles: true,
      }),
    );
  }

  _useAsTemplate(conv) {
    // Emit event so prompt library or dispatch zone can pick it up
    document.dispatchEvent(
      new CustomEvent("conversation-history:use-template", {
        detail: {
          prompt: conv.prompt,
          systemPrompt: conv.systemPrompt,
          model: conv.model,
          title: conv.title,
        },
        bubbles: true,
      }),
    );
  }

  _toggleSelectAll() {
    const items = this._filteredItems();
    if (this._bulkSelected.size === items.length) {
      // Deselect all
      this._bulkSelected.clear();
      this._selectAllBtn.textContent = "Select all";
    } else {
      // Select all
      for (const item of items) this._bulkSelected.add(item.id);
      this._selectAllBtn.textContent = "Deselect all";
    }
    // Update checkboxes
    const checks = this._listEl.querySelectorAll(".conv-history__item-check");
    for (const check of checks) {
      const itemEl = check.closest(".conv-history__item");
      check.checked = itemEl
        ? this._bulkSelected.has(itemEl.dataset.id)
        : false;
    }
  }

  _exportSelected() {
    const ids =
      this._bulkSelected.size > 0
        ? this._bulkSelected
        : new Set(this._filteredItems().map((i) => i.id));

    const data = this._allItems
      .filter((i) => ids.has(i.id))
      .map((i) => ({
        id: i.id,
        type: i.type,
        title: i.title,
        prompt: i.prompt,
        response: i.response,
        model: i.model,
        status: i.status,
        inputTokens: i.inputTokens,
        outputTokens: i.outputTokens,
        cost: i.cost,
        latency: i.latency,
        created_at: i.created_at,
        completed_at: i.completed_at,
      }));

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conversations-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  _deleteSelected() {
    if (this._bulkSelected.size === 0) return;

    const count = this._bulkSelected.size;
    const confirmed = confirm(
      `Delete ${count} conversation${count > 1 ? "s" : ""}? This cannot be undone.`,
    );
    if (!confirmed) return;

    // Remove from local state
    const toDelete = new Set(this._bulkSelected);
    this._allItems = this._allItems.filter((i) => !toDelete.has(i.id));
    this._bulkSelected.clear();

    // If selected item was deleted, clear detail
    if (this._selected && toDelete.has(this._selected.id)) {
      this._selected = null;
      this._showDetailEmpty();
    }

    this._renderedCount = 0;
    this._renderList();

    // Emit event so other parts of the app can handle DB deletion
    document.dispatchEvent(
      new CustomEvent("conversation-history:delete", {
        detail: { ids: [...toDelete] },
        bubbles: true,
      }),
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // Utility
  // ═══════════════════════════════════════════════════════════════════

  _el(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }
}
