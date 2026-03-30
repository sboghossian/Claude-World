/**
 * market.js — The Market zone: skill/prompt/agent marketplace
 *
 * Browse a catalog of pre-built skills, prompt templates, and agent configs.
 * Users can install items (saved to their skills table), filter by category,
 * search, and view a featured section.
 *
 * Events emitted:
 *   market:install — { worldId, catalogItemId, name }
 *     Fired after a successful install.
 */

// ── Catalog data ──────────────────────────────────────────────────

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "prompt", label: "Prompt Templates" },
  { id: "agent", label: "Agent Configs" },
  { id: "integration", label: "Integrations" },
  { id: "workflow", label: "Workflows" },
];

const CATALOG = [
  {
    id: "seo-writer",
    name: "SEO Writer",
    category: "prompt",
    icon: "🔍",
    description:
      "Generate SEO-optimized blog posts and landing page copy with keyword-rich headings and meta descriptions.",
    stars: 4.8,
    installCount: 2340,
    featured: true,
  },
  {
    id: "code-reviewer",
    name: "Code Reviewer",
    category: "agent",
    icon: "🧑‍💻",
    description:
      "Automated code review agent that checks for bugs, style issues, security vulnerabilities, and suggests refactors.",
    stars: 4.7,
    installCount: 1890,
    featured: true,
  },
  {
    id: "bug-reporter",
    name: "Bug Reporter",
    category: "workflow",
    icon: "🐛",
    description:
      "Structured bug report generator. Takes a description and outputs a formatted issue ready for GitHub or Linear.",
    stars: 4.4,
    installCount: 987,
    featured: true,
  },
  {
    id: "email-summarizer",
    name: "Email Summarizer",
    category: "prompt",
    icon: "📧",
    description:
      "Distill long email threads into concise bullet-point summaries with action items highlighted.",
    stars: 4.6,
    installCount: 3120,
    featured: false,
  },
  {
    id: "meeting-notes",
    name: "Meeting Notes",
    category: "prompt",
    icon: "📋",
    description:
      "Transform raw meeting transcripts into clean structured notes with decisions, action items, and next steps.",
    stars: 4.5,
    installCount: 2780,
    featured: false,
  },
  {
    id: "data-analyzer",
    name: "Data Analyzer",
    category: "agent",
    icon: "📊",
    description:
      "Autonomous data analysis agent that reads CSV/JSON, identifies patterns, and produces charts and written insights.",
    stars: 4.3,
    installCount: 1420,
    featured: false,
  },
  {
    id: "github-pr-describer",
    name: "GitHub PR Describer",
    category: "integration",
    icon: "🐙",
    description:
      "Auto-generate pull request titles and descriptions from diffs. Works as a GitHub Action or manual prompt.",
    stars: 4.9,
    installCount: 4210,
    featured: false,
  },
  {
    id: "slack-digest",
    name: "Slack Digest",
    category: "integration",
    icon: "💬",
    description:
      "Daily summary of your Slack channels — surface important messages and decisions so you never miss the signal.",
    stars: 4.2,
    installCount: 1650,
    featured: false,
  },
  {
    id: "twitter-scheduler",
    name: "Twitter Scheduler",
    category: "workflow",
    icon: "🐦",
    description:
      "Plan, draft, and schedule Twitter/X threads with AI-assisted tone checks and optimal posting time suggestions.",
    stars: 4.1,
    installCount: 890,
    featured: false,
  },
  {
    id: "legal-clause-checker",
    name: "Legal Clause Checker",
    category: "prompt",
    icon: "⚖️",
    description:
      "Scan contracts for unusual or risky clauses. Highlights red flags and explains them in plain English.",
    stars: 4.6,
    installCount: 760,
    featured: false,
  },
  {
    id: "sales-email-writer",
    name: "Sales Email Writer",
    category: "prompt",
    icon: "💼",
    description:
      "Craft personalized cold outreach emails that convert. Supports multi-step drip sequences and A/B variants.",
    stars: 4.4,
    installCount: 2090,
    featured: false,
  },
  {
    id: "blog-outline-generator",
    name: "Blog Outline Generator",
    category: "prompt",
    icon: "✍️",
    description:
      "Turn a topic or keyword into a detailed blog outline with H2/H3 structure, talking points, and internal link suggestions.",
    stars: 4.5,
    installCount: 3350,
    featured: false,
  },
];

// ── Helpers ───────────────────────────────────────────────────────

/** Emit a custom event on document. */
function emit(name, detail = {}) {
  document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
}

/** Create an element with optional className and attribute map. */
function el(tag, className, attrs = {}) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "textContent") {
      e.textContent = v;
      continue;
    }
    if (k === "innerHTML") {
      e.innerHTML = v;
      continue;
    }
    e.setAttribute(k, v);
  }
  return e;
}

/** Format install count with K abbreviation. */
function fmtInstalls(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Build a star string like "4.8★". */
function fmtStars(n) {
  return n.toFixed(1) + "★";
}

/** Show a floating toast. */
function showToast(message, type = "info") {
  const toast = el("div", `market-zone__toast market-zone__toast--${type}`, {
    textContent: message,
  });
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = "opacity 0.3s";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 320);
  }, 2800);
}

// ── Safe API wrappers ─────────────────────────────────────────────

async function apiGetMarketInstalls(worldId) {
  try {
    if (window.api?.db?.getMarketInstalls) {
      const rows = await window.api.db.getMarketInstalls(worldId);
      if (Array.isArray(rows)) return rows;
    }
  } catch (err) {
    console.warn("[market] getMarketInstalls failed:", err);
  }
  return [];
}

async function apiInstallMarketItem(worldId, catalogItemId) {
  try {
    if (window.api?.db?.installMarketItem) {
      return await window.api.db.installMarketItem(worldId, catalogItemId);
    }
    // Try createSkill fallback
    const item = CATALOG.find((c) => c.id === catalogItemId);
    if (item && window.api?.db?.createSkill) {
      await window.api.db.createSkill(worldId, {
        name: item.name,
        description: item.description,
        category: item.category,
      });
      return { ok: true };
    }
  } catch (err) {
    console.warn("[market] installMarketItem failed:", err);
    throw err;
  }
  return { ok: true };
}

// ── Market class ──────────────────────────────────────────────────

export class Market {
  constructor() {
    this._worldId = null;
    this._activeCategory = "all";
    this._activeTab = "browse"; // 'browse' | 'installs'
    this._searchQuery = "";
    this._installs = new Set(); // catalog_item_ids already installed
    this._el = null;
    this._stylesLoaded = false;
    // DOM refs
    this._statsEl = null;
    this._searchInputEl = null;
    this._tabsEl = null;
    this._mainTabBrowse = null;
    this._mainTabInstalls = null;
    this._browseSection = null;
    this._installsSection = null;
    this._featuredGridEl = null;
    this._catalogGridEl = null;
    this._installsListEl = null;
  }

  // ── CSS loader ───────────────────────────────────────────────────

  _loadStyles() {
    if (this._stylesLoaded) return;
    if (document.getElementById("market-styles")) {
      this._stylesLoaded = true;
      return;
    }
    const link = document.createElement("link");
    link.id = "market-styles";
    link.rel = "stylesheet";
    link.href = "../zones/market.css";
    document.head.appendChild(link);
    this._stylesLoaded = true;
  }

  // ── Public: render ───────────────────────────────────────────────

  render() {
    this._loadStyles();

    const root = el("div", "market-zone");
    root.setAttribute("role", "region");
    root.setAttribute(
      "aria-label",
      "The Market — skill and prompt marketplace",
    );
    this._el = root;

    // Description
    root.appendChild(
      el("div", "market-zone__description", {
        textContent:
          "Browse and install skills, prompt templates, and agent configs for your world.",
      }),
    );

    // Stats
    this._statsEl = this._buildStats();
    root.appendChild(this._statsEl);

    // Main tabs (Browse / My Installs)
    root.appendChild(this._buildMainTabs());

    // Browse section
    this._browseSection = this._buildBrowseSection();
    root.appendChild(this._browseSection);

    // My installs section (hidden initially)
    this._installsSection = this._buildInstallsSection();
    this._installsSection.style.display = "none";
    root.appendChild(this._installsSection);

    // Show skeleton while loading
    this._renderSkeletons();

    return root;
  }

  // ── Public: init ─────────────────────────────────────────────────

  async init(worldId) {
    this._worldId = worldId;
    await this._loadData();
    this._renderAll();
  }

  // ── Data ─────────────────────────────────────────────────────────

  async _loadData() {
    const rows = await apiGetMarketInstalls(this._worldId);
    this._installs = new Set(
      rows.map((r) => r.catalog_item_id || r.catalogItemId || r.id),
    );
  }

  // ── Render ────────────────────────────────────────────────────────

  _renderAll() {
    this._renderStats();
    this._renderFeatured();
    this._renderCatalog();
    this._renderInstallsList();
  }

  // Stats bar
  _buildStats() {
    const bar = el("div", "market-zone__stats");
    bar.setAttribute("aria-live", "polite");
    const items = [
      {
        id: "mkt-stat-catalog",
        label: "In Catalog",
        value: String(CATALOG.length),
      },
      { id: "mkt-stat-installs", label: "Installed", value: "0" },
      {
        id: "mkt-stat-featured",
        label: "Featured",
        value: String(CATALOG.filter((c) => c.featured).length),
      },
    ];
    for (const item of items) {
      const wrap = el("div", "market-zone__stat-item");
      const val = el("div", "market-zone__stat-value", {
        textContent: item.value,
      });
      val.id = item.id;
      const lbl = el("div", "market-zone__stat-label", {
        textContent: item.label,
      });
      wrap.appendChild(val);
      wrap.appendChild(lbl);
      bar.appendChild(wrap);
    }
    return bar;
  }

  _renderStats() {
    const setVal = (id, v) => {
      const node = this._statsEl?.querySelector("#" + id);
      if (node) node.textContent = v;
    };
    setVal("mkt-stat-installs", this._installs.size);
  }

  // Main tabs (Browse / My Installs)
  _buildMainTabs() {
    const wrap = el("div", "market-zone__tabs");

    this._mainTabBrowse = el(
      "button",
      "market-zone__tab market-zone__tab--active",
      {
        textContent: "🛒 Browse",
      },
    );
    this._mainTabBrowse.setAttribute("aria-pressed", "true");

    this._mainTabInstalls = el("button", "market-zone__tab", {
      textContent: "📦 My Installs",
    });
    this._mainTabInstalls.setAttribute("aria-pressed", "false");

    this._mainTabBrowse.addEventListener("click", () =>
      this._switchMainTab("browse"),
    );
    this._mainTabInstalls.addEventListener("click", () =>
      this._switchMainTab("installs"),
    );

    wrap.appendChild(this._mainTabBrowse);
    wrap.appendChild(this._mainTabInstalls);
    return wrap;
  }

  _switchMainTab(tab) {
    this._activeTab = tab;
    if (tab === "browse") {
      this._browseSection.style.display = "";
      this._installsSection.style.display = "none";
      this._mainTabBrowse.classList.add("market-zone__tab--active");
      this._mainTabBrowse.setAttribute("aria-pressed", "true");
      this._mainTabInstalls.classList.remove("market-zone__tab--active");
      this._mainTabInstalls.setAttribute("aria-pressed", "false");
    } else {
      this._browseSection.style.display = "none";
      this._installsSection.style.display = "";
      this._mainTabInstalls.classList.add("market-zone__tab--active");
      this._mainTabInstalls.setAttribute("aria-pressed", "true");
      this._mainTabBrowse.classList.remove("market-zone__tab--active");
      this._mainTabBrowse.setAttribute("aria-pressed", "false");
      this._renderInstallsList();
    }
  }

  // Browse section: search + category tabs + featured + catalog grid
  _buildBrowseSection() {
    const section = el("div", "market-zone__browse");

    // Search
    const searchWrap = el("div", "market-zone__search-wrap");
    const searchIcon = el("span", "market-zone__search-icon", {
      textContent: "🔍",
    });
    searchIcon.setAttribute("aria-hidden", "true");
    this._searchInputEl = el("input", "market-zone__search-input");
    this._searchInputEl.type = "search";
    this._searchInputEl.placeholder = "Search catalog…";
    this._searchInputEl.setAttribute(
      "aria-label",
      "Search marketplace catalog",
    );
    this._searchInputEl.addEventListener("input", () => {
      this._searchQuery = this._searchInputEl.value.trim().toLowerCase();
      this._renderCatalog();
    });
    searchWrap.appendChild(searchIcon);
    searchWrap.appendChild(this._searchInputEl);
    section.appendChild(searchWrap);

    // Category tabs
    this._tabsEl = this._buildCategoryTabs();
    section.appendChild(this._tabsEl);

    // Featured
    const featTitle = el("div", "market-zone__section-title", {
      textContent: "Featured",
    });
    section.appendChild(featTitle);
    this._featuredGridEl = el(
      "div",
      "market-zone__grid market-zone__grid--featured",
    );
    this._featuredGridEl.setAttribute("role", "list");
    this._featuredGridEl.setAttribute("aria-label", "Featured items");
    section.appendChild(this._featuredGridEl);

    // All / filtered catalog
    const allTitle = el("div", "market-zone__section-title", {
      textContent: "Catalog",
    });
    section.appendChild(allTitle);
    this._catalogGridEl = el("div", "market-zone__grid");
    this._catalogGridEl.setAttribute("role", "list");
    this._catalogGridEl.setAttribute("aria-label", "Catalog items");
    section.appendChild(this._catalogGridEl);

    return section;
  }

  _buildCategoryTabs() {
    const wrap = el("div", "market-zone__tabs");
    wrap.setAttribute("role", "tablist");
    wrap.setAttribute("aria-label", "Filter by category");

    for (const cat of CATEGORIES) {
      const btn = el("button", "market-zone__tab", { textContent: cat.label });
      btn.setAttribute("role", "tab");
      btn.setAttribute(
        "aria-selected",
        cat.id === this._activeCategory ? "true" : "false",
      );
      if (cat.id === this._activeCategory) {
        btn.classList.add("market-zone__tab--active");
      }
      btn.addEventListener("click", () => {
        this._activeCategory = cat.id;
        // Update tab states
        wrap.querySelectorAll(".market-zone__tab").forEach((b, i) => {
          const isActive = CATEGORIES[i].id === cat.id;
          b.classList.toggle("market-zone__tab--active", isActive);
          b.setAttribute("aria-selected", isActive ? "true" : "false");
        });
        this._renderCatalog();
      });
      wrap.appendChild(btn);
    }
    return wrap;
  }

  _renderSkeletons() {
    if (this._featuredGridEl) {
      this._featuredGridEl.innerHTML = "";
      const sk = el("div", "market-zone__skeleton");
      sk.appendChild(el("div", "market-zone__skeleton-row"));
      this._featuredGridEl.appendChild(sk);
    }
    if (this._catalogGridEl) {
      this._catalogGridEl.innerHTML = "";
      const sk = el("div", "market-zone__skeleton");
      for (let i = 0; i < 3; i++) {
        sk.appendChild(el("div", "market-zone__skeleton-row"));
      }
      this._catalogGridEl.appendChild(sk);
    }
  }

  _filteredCatalog() {
    return CATALOG.filter((item) => {
      const matchCat =
        this._activeCategory === "all" ||
        item.category === this._activeCategory;
      const matchQ =
        !this._searchQuery ||
        item.name.toLowerCase().includes(this._searchQuery) ||
        item.description.toLowerCase().includes(this._searchQuery);
      return matchCat && matchQ;
    });
  }

  _renderFeatured() {
    if (!this._featuredGridEl) return;
    this._featuredGridEl.innerHTML = "";

    const featured = CATALOG.filter((c) => c.featured);
    if (featured.length === 0) {
      this._featuredGridEl.appendChild(
        el("div", "market-zone__empty", {
          textContent: "No featured items.",
        }),
      );
      return;
    }

    for (const item of featured) {
      this._featuredGridEl.appendChild(this._buildCard(item, true));
    }
  }

  _renderCatalog() {
    if (!this._catalogGridEl) return;
    this._catalogGridEl.innerHTML = "";

    const items = this._filteredCatalog().filter((i) => !i.featured);

    if (items.length === 0) {
      const empty = el("div", "market-zone__empty");
      empty.appendChild(
        el("div", "market-zone__empty-icon", { textContent: "🛒" }),
      );
      const msg = this._searchQuery
        ? `No results for "${this._searchQuery}"`
        : "No items in this category.";
      empty.appendChild(
        el("div", "market-zone__empty-text", { textContent: msg }),
      );
      this._catalogGridEl.appendChild(empty);
      return;
    }

    for (const item of items) {
      this._catalogGridEl.appendChild(this._buildCard(item, false));
    }
  }

  _buildCard(item, featured) {
    const isInstalled = this._installs.has(item.id);
    let cardClass = "market-zone__card";
    if (featured) cardClass += " market-zone__card--featured";
    if (isInstalled) cardClass += " market-zone__card--installed";

    const card = el("div", cardClass);
    card.setAttribute("role", "listitem");
    card.setAttribute("aria-label", item.name);

    // Header
    const header = el("div", "market-zone__card-header");
    const icon = el("div", "market-zone__card-icon", {
      textContent: item.icon,
    });
    icon.setAttribute("aria-hidden", "true");

    const titleWrap = el("div", "market-zone__card-title-wrap");
    titleWrap.appendChild(
      el("div", "market-zone__card-title", { textContent: item.name }),
    );
    const catLabel =
      CATEGORIES.find((c) => c.id === item.category)?.label || item.category;
    titleWrap.appendChild(
      el("span", "market-zone__card-category", { textContent: catLabel }),
    );

    header.appendChild(icon);
    header.appendChild(titleWrap);
    card.appendChild(header);

    // Description
    card.appendChild(
      el("div", "market-zone__card-desc", { textContent: item.description }),
    );

    // Meta row
    const meta = el("div", "market-zone__card-meta");

    const stars = el("div", "market-zone__stars");
    stars.appendChild(el("span", null, { textContent: fmtStars(item.stars) }));
    stars.appendChild(
      el("span", "market-zone__star-count", { textContent: `(${item.stars})` }),
    );
    meta.appendChild(stars);

    meta.appendChild(
      el("span", "market-zone__installs", {
        textContent: `${fmtInstalls(item.installCount)} installs`,
      }),
    );

    meta.appendChild(el("span", "market-zone__price", { textContent: "Free" }));
    card.appendChild(meta);

    // Install button
    let btnClass = "market-zone__install-btn";
    if (isInstalled) btnClass += " market-zone__install-btn--installed";
    const installBtn = el("button", btnClass, {
      textContent: isInstalled ? "✓ Installed" : "Install",
    });
    installBtn.setAttribute(
      "aria-label",
      isInstalled ? `${item.name} is installed` : `Install ${item.name}`,
    );
    if (isInstalled) installBtn.disabled = true;

    installBtn.addEventListener("click", () =>
      this._installItem(item, installBtn, card),
    );
    card.appendChild(installBtn);

    return card;
  }

  async _installItem(item, btn, card) {
    if (this._installs.has(item.id)) return;

    btn.disabled = true;
    btn.textContent = "Installing…";
    btn.classList.add("market-zone__install-btn--installing");

    try {
      await apiInstallMarketItem(this._worldId, item.id);

      this._installs.add(item.id);

      // Update button
      btn.textContent = "✓ Installed";
      btn.classList.remove("market-zone__install-btn--installing");
      btn.classList.add("market-zone__install-btn--installed");
      card.classList.add("market-zone__card--installed");

      // Update stats
      this._renderStats();

      // Emit event
      emit("market:install", {
        worldId: this._worldId,
        catalogItemId: item.id,
        name: item.name,
      });

      showToast(`${item.name} installed!`, "success");

      // Refresh My Installs list if visible
      if (this._activeTab === "installs") {
        this._renderInstallsList();
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Install";
      btn.classList.remove("market-zone__install-btn--installing");
      showToast(`Install failed: ${err.message || "Unknown error"}`, "error");
    }
  }

  // My Installs section
  _buildInstallsSection() {
    const section = el("div", "market-zone__installs-section");
    const title = el("div", "market-zone__section-title", {
      textContent: "My Installs",
    });
    section.appendChild(title);

    this._installsListEl = el("div", "market-zone__installs-list");
    this._installsListEl.setAttribute("role", "list");
    this._installsListEl.setAttribute("aria-label", "My installed items");
    section.appendChild(this._installsListEl);

    return section;
  }

  _renderInstallsList() {
    if (!this._installsListEl) return;
    this._installsListEl.innerHTML = "";

    if (this._installs.size === 0) {
      const empty = el("div", "market-zone__empty");
      empty.appendChild(
        el("div", "market-zone__empty-icon", { textContent: "📦" }),
      );
      empty.appendChild(
        el("div", "market-zone__empty-text", {
          textContent:
            "Nothing installed yet. Browse the catalog to get started.",
        }),
      );
      this._installsListEl.appendChild(empty);
      return;
    }

    const installed = CATALOG.filter((c) => this._installs.has(c.id));
    for (const item of installed) {
      const row = el("div", "market-zone__install-row");
      row.setAttribute("role", "listitem");
      row.setAttribute("aria-label", item.name);

      const iconEl = el("div", "market-zone__install-row-icon", {
        textContent: item.icon,
      });
      iconEl.setAttribute("aria-hidden", "true");
      row.appendChild(iconEl);

      const info = el("div", "market-zone__install-row-info");
      info.appendChild(
        el("div", "market-zone__install-row-name", { textContent: item.name }),
      );
      const catLabel =
        CATEGORIES.find((c) => c.id === item.category)?.label || item.category;
      info.appendChild(
        el("div", "market-zone__install-row-cat", { textContent: catLabel }),
      );
      row.appendChild(info);

      row.appendChild(
        el("div", "market-zone__install-row-badge", {
          textContent: "Installed",
        }),
      );
      this._installsListEl.appendChild(row);
    }
  }
}
