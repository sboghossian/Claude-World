/**
 * plugin-store.js — Plugin Store zone for Claude World
 *
 * Browse, install, manage, and create plugins/extensions that add
 * new zones to Claude World. Three tabs:
 *   - Installed: list loaded plugins with enable/disable toggles
 *   - Browse: hardcoded community catalog (future: remote registry)
 *   - Create: template generator for scaffolding new plugins
 *
 * Class pattern: export class PluginStore { render() -> HTMLElement; async init(worldId) }
 *
 * @module PluginStore
 */

import {
  getPluginManager,
  generatePluginTemplate,
} from "../systems/plugin-api.js";

// ── Load styles ──────────────────────────────────────────────────

const _styleLink = document.createElement("link");
_styleLink.rel = "stylesheet";
_styleLink.href = "../zones/plugin-store.css";
if (!document.querySelector('link[href*="plugin-store.css"]')) {
  document.head.appendChild(_styleLink);
}

// ── Community catalog (hardcoded for now) ────────────────────────

const COMMUNITY_CATALOG = [
  {
    id: "pomodoro-timer",
    name: "Pomodoro Timer",
    version: "1.2.0",
    author: "Claude Community",
    authorInitial: "C",
    description:
      "Focus timer with Pomodoro technique. Track work sessions, breaks, and daily productivity stats.",
    icon: "\u{1F345}",
    color: "#ff4a6a",
    category: "productivity",
    tags: ["timer", "focus", "productivity"],
    permissions: ["db:read", "db:write", "notify", "events"],
    downloads: 1240,
  },
  {
    id: "code-snippets",
    name: "Code Snippets",
    version: "2.0.1",
    author: "DevTools Lab",
    authorInitial: "D",
    description:
      "Save, organize, and quickly access reusable code snippets with syntax highlighting and search.",
    icon: "\u{1F4DD}",
    color: "#4a9eff",
    category: "development",
    tags: ["code", "snippets", "dev"],
    permissions: ["db:read", "db:write", "events"],
    downloads: 890,
  },
  {
    id: "mood-tracker",
    name: "Mood Tracker",
    version: "1.0.0",
    author: "Wellness AI",
    authorInitial: "W",
    description:
      "Daily mood logging with emoji selection, journaling, and trend visualization over time.",
    icon: "\u{1F60A}",
    color: "#ffb84a",
    category: "wellness",
    tags: ["mood", "journal", "wellness"],
    permissions: ["db:read", "db:write", "notify"],
    downloads: 560,
  },
  {
    id: "research-assistant",
    name: "Research Assistant",
    version: "1.5.0",
    author: "AI Research Co",
    authorInitial: "A",
    description:
      "AI-powered research zone. Save sources, generate summaries, and build bibliographies automatically.",
    icon: "\u{1F50D}",
    color: "#a855f7",
    category: "ai",
    tags: ["research", "ai", "summary"],
    permissions: ["db:read", "db:write", "ai:dispatch", "events"],
    downloads: 2100,
  },
  {
    id: "habit-tracker",
    name: "Habit Streaks",
    version: "1.1.0",
    author: "Streak Labs",
    authorInitial: "S",
    description:
      "Track daily habits with streak counters, completion heatmaps, and motivational notifications.",
    icon: "\u{1F525}",
    color: "#f97316",
    category: "productivity",
    tags: ["habits", "streaks", "tracking"],
    permissions: ["db:read", "db:write", "notify", "events"],
    downloads: 1780,
  },
  {
    id: "api-playground",
    name: "API Playground",
    version: "0.9.0",
    author: "DevTools Lab",
    authorInitial: "D",
    description:
      "Test API endpoints directly inside Claude World. Supports REST, GraphQL, and WebSocket connections.",
    icon: "\u{1F6E0}",
    color: "#06b6d4",
    category: "development",
    tags: ["api", "testing", "dev"],
    permissions: ["db:read", "notify", "events"],
    downloads: 430,
  },
  {
    id: "meeting-notes",
    name: "Meeting Notes",
    version: "1.3.0",
    author: "Claude Community",
    authorInitial: "C",
    description:
      "Structured meeting notes with AI-generated action items, attendee tracking, and follow-up reminders.",
    icon: "\u{1F4CB}",
    color: "#14b8a6",
    category: "productivity",
    tags: ["meetings", "notes", "action-items"],
    permissions: ["db:read", "db:write", "ai:dispatch", "notify"],
    downloads: 960,
  },
  {
    id: "whiteboard",
    name: "Whiteboard",
    version: "0.8.0",
    author: "Canvas Co",
    authorInitial: "C",
    description:
      "Freeform drawing canvas for brainstorming. Supports shapes, sticky notes, and collaborative editing.",
    icon: "\u{1F3A8}",
    color: "#ec4899",
    category: "creative",
    tags: ["drawing", "brainstorm", "canvas"],
    permissions: ["db:read", "db:write", "events"],
    downloads: 710,
  },
];

const CATEGORIES = [
  { id: "all", label: "All" },
  { id: "productivity", label: "Productivity" },
  { id: "development", label: "Development" },
  { id: "ai", label: "AI-Powered" },
  { id: "creative", label: "Creative" },
  { id: "wellness", label: "Wellness" },
];

// ── Permission labels ────────────────────────────────────────────

const PERM_LABELS = {
  "db:read": "Read database",
  "db:write": "Write to database",
  "ai:dispatch": "Use AI dispatch",
  notify: "Show notifications",
  events: "Event bus access",
  "fs:read": "Read files",
};

// ── PluginStore class ────────────────────────────────────────────

export class PluginStore {
  constructor() {
    /** @type {HTMLElement|null} */
    this.el = null;
    /** @type {number} */
    this.worldId = 1;
    /** @type {string} */
    this._activeTab = "installed";
    /** @type {string} */
    this._activeCategory = "all";
    /** @type {object|null} */
    this._detailView = null;
    /** @type {PluginManager} */
    this._pm = getPluginManager();
  }

  /**
   * Build and return the root HTMLElement.
   * @returns {HTMLElement}
   */
  render() {
    this.el = document.createElement("div");
    this.el.className = "plugin-store";
    this._rebuild();
    return this.el;
  }

  /**
   * Initialize with world data.
   * @param {number} worldId
   */
  async init(worldId) {
    this.worldId = worldId;

    // Listen for plugin events to refresh the view
    document.addEventListener("plugin:loaded", () => this._rebuild());
    document.addEventListener("plugin:unloaded", () => this._rebuild());
    document.addEventListener("plugin:toggled", () => this._rebuild());
  }

  // ── Rebuild the entire UI ────────────────────────────────────

  _rebuild() {
    if (!this.el) return;
    this.el.innerHTML = "";

    // If showing detail view, render that instead
    if (this._detailView) {
      this.el.appendChild(this._buildDetailView(this._detailView));
      return;
    }

    // Tabs
    this.el.appendChild(this._buildTabs());

    // Content
    const content = document.createElement("div");
    content.className = "plugin-store__content";

    switch (this._activeTab) {
      case "installed":
        content.appendChild(this._buildInstalledTab());
        break;
      case "browse":
        content.appendChild(this._buildBrowseTab());
        break;
      case "create":
        content.appendChild(this._buildCreateTab());
        break;
    }

    this.el.appendChild(content);
  }

  // ── Tab bar ──────────────────────────────────────────────────

  _buildTabs() {
    const tabs = document.createElement("div");
    tabs.className = "plugin-store__tabs";

    const tabDefs = [
      { id: "installed", label: "Installed" },
      { id: "browse", label: "Browse" },
      { id: "create", label: "Create" },
    ];

    for (const def of tabDefs) {
      const btn = document.createElement("button");
      btn.className = "plugin-store__tab";
      if (def.id === this._activeTab)
        btn.classList.add("plugin-store__tab--active");
      btn.textContent = def.label;
      btn.addEventListener("click", () => {
        this._activeTab = def.id;
        this._detailView = null;
        this._rebuild();
      });
      tabs.appendChild(btn);
    }

    return tabs;
  }

  // ── Installed tab ────────────────────────────────────────────

  _buildInstalledTab() {
    const frag = document.createElement("div");
    const plugins = this._pm.list();

    if (plugins.length === 0) {
      frag.appendChild(
        this._buildEmpty(
          "\u{1F9E9}",
          "No plugins installed yet. Browse the catalog or create your own!",
        ),
      );
      return frag;
    }

    const grid = document.createElement("div");
    grid.className = "plugin-store__grid";

    for (const plugin of plugins) {
      grid.appendChild(this._buildInstalledCard(plugin));
    }

    frag.appendChild(grid);
    return frag;
  }

  /**
   * Build an installed plugin card with toggle.
   * @param {object} plugin
   * @returns {HTMLElement}
   */
  _buildInstalledCard(plugin) {
    const m = plugin.manifest;
    const card = document.createElement("div");
    card.className = "plugin-card plugin-card--installed";
    card.style.setProperty(
      "--plugin-accent",
      m.color || "var(--accent-purple)",
    );

    // Header row
    const header = document.createElement("div");
    header.className = "plugin-card__header";

    const icon = document.createElement("div");
    icon.className = "plugin-card__icon";
    icon.textContent = m.icon || "\u{1F9E9}";

    const info = document.createElement("div");
    info.className = "plugin-card__info";

    const name = document.createElement("div");
    name.className = "plugin-card__name";
    name.textContent = m.name;

    const authorLine = document.createElement("div");
    authorLine.className = "plugin-card__author";

    const avatar = document.createElement("span");
    avatar.className = "plugin-card__avatar";
    avatar.textContent = (m.author || "?")[0].toUpperCase();

    const authorText = document.createElement("span");
    authorText.textContent = m.author || "Unknown";

    authorLine.appendChild(avatar);
    authorLine.appendChild(authorText);

    info.appendChild(name);
    info.appendChild(authorLine);

    const version = document.createElement("span");
    version.className = "plugin-card__version";
    version.textContent = `v${m.version}`;

    // Toggle
    const toggle = this._buildToggle(plugin.id, plugin.enabled);

    header.appendChild(icon);
    header.appendChild(info);
    header.appendChild(version);
    header.appendChild(toggle);

    // Description
    const desc = document.createElement("div");
    desc.className = "plugin-card__description";
    desc.textContent = m.description || "";

    // Footer with actions
    const footer = document.createElement("div");
    footer.className = "plugin-card__footer";

    const tags = document.createElement("div");
    tags.className = "plugin-card__tags";
    if (m.permissions) {
      for (const perm of m.permissions.slice(0, 3)) {
        const tag = document.createElement("span");
        tag.className = "plugin-card__tag";
        tag.textContent = perm;
        tags.appendChild(tag);
      }
    }

    const detailBtn = document.createElement("button");
    detailBtn.className = "plugin-store__btn plugin-store__btn--sm";
    detailBtn.textContent = "Details";
    detailBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._detailView = { ...m, installed: true };
      this._rebuild();
    });

    const uninstallBtn = document.createElement("button");
    uninstallBtn.className =
      "plugin-store__btn plugin-store__btn--sm plugin-store__btn--danger";
    uninstallBtn.textContent = "Uninstall";
    uninstallBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._showConfirmation(
        "Uninstall Plugin",
        `Are you sure you want to uninstall "${m.name}"? This will remove the plugin from your system.`,
        async () => {
          try {
            await this._pm.unload(plugin.id);
            this._rebuild();
          } catch (err) {
            console.error("[PluginStore] Uninstall error:", err);
          }
        },
      );
    });

    footer.appendChild(tags);
    footer.appendChild(detailBtn);
    footer.appendChild(uninstallBtn);

    card.appendChild(header);
    card.appendChild(desc);
    card.appendChild(footer);

    return card;
  }

  // ── Browse tab ───────────────────────────────────────────────

  _buildBrowseTab() {
    const frag = document.createElement("div");

    // Category filters
    const cats = document.createElement("div");
    cats.className = "plugin-store__categories";

    for (const cat of CATEGORIES) {
      const btn = document.createElement("button");
      btn.className = "plugin-store__category";
      if (cat.id === this._activeCategory)
        btn.classList.add("plugin-store__category--active");
      btn.textContent = cat.label;
      btn.addEventListener("click", () => {
        this._activeCategory = cat.id;
        this._rebuild();
      });
      cats.appendChild(btn);
    }

    frag.appendChild(cats);

    // Filter catalog
    const filtered =
      this._activeCategory === "all"
        ? COMMUNITY_CATALOG
        : COMMUNITY_CATALOG.filter((p) => p.category === this._activeCategory);

    if (filtered.length === 0) {
      frag.appendChild(
        this._buildEmpty("\u{1F50E}", "No plugins in this category yet."),
      );
      return frag;
    }

    const grid = document.createElement("div");
    grid.className = "plugin-store__grid";

    for (const plugin of filtered) {
      grid.appendChild(this._buildCatalogCard(plugin));
    }

    frag.appendChild(grid);
    return frag;
  }

  /**
   * Build a catalog plugin card with install button.
   * @param {object} plugin
   * @returns {HTMLElement}
   */
  _buildCatalogCard(plugin) {
    const isInstalled = this._pm.has(plugin.id);

    const card = document.createElement("div");
    card.className = "plugin-card";
    if (isInstalled) card.classList.add("plugin-card--installed");
    card.style.setProperty(
      "--plugin-accent",
      plugin.color || "var(--accent-purple)",
    );

    // Header
    const header = document.createElement("div");
    header.className = "plugin-card__header";

    const icon = document.createElement("div");
    icon.className = "plugin-card__icon";
    icon.textContent = plugin.icon;

    const info = document.createElement("div");
    info.className = "plugin-card__info";

    const name = document.createElement("div");
    name.className = "plugin-card__name";
    name.textContent = plugin.name;

    const authorLine = document.createElement("div");
    authorLine.className = "plugin-card__author";

    const avatar = document.createElement("span");
    avatar.className = "plugin-card__avatar";
    avatar.textContent = plugin.authorInitial || plugin.author[0];

    const authorText = document.createElement("span");
    authorText.textContent = plugin.author;

    authorLine.appendChild(avatar);
    authorLine.appendChild(authorText);

    info.appendChild(name);
    info.appendChild(authorLine);

    const version = document.createElement("span");
    version.className = "plugin-card__version";
    version.textContent = `v${plugin.version}`;

    header.appendChild(icon);
    header.appendChild(info);
    header.appendChild(version);

    // Description
    const desc = document.createElement("div");
    desc.className = "plugin-card__description";
    desc.textContent = plugin.description;

    // Footer
    const footer = document.createElement("div");
    footer.className = "plugin-card__footer";

    const tags = document.createElement("div");
    tags.className = "plugin-card__tags";
    for (const t of plugin.tags || []) {
      const tag = document.createElement("span");
      tag.className = "plugin-card__tag";
      tag.textContent = t;
      tags.appendChild(tag);
    }

    const detailBtn = document.createElement("button");
    detailBtn.className = "plugin-store__btn plugin-store__btn--sm";
    detailBtn.textContent = "Details";
    detailBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._detailView = { ...plugin, installed: isInstalled };
      this._rebuild();
    });

    const installBtn = document.createElement("button");
    installBtn.className = `plugin-store__btn plugin-store__btn--sm ${isInstalled ? "" : "plugin-store__btn--install"}`;
    installBtn.textContent = isInstalled ? "Installed" : "Install";
    installBtn.disabled = isInstalled;
    if (!isInstalled) {
      installBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._installCatalogPlugin(plugin, installBtn);
      });
    }

    footer.appendChild(tags);
    footer.appendChild(detailBtn);
    footer.appendChild(installBtn);

    card.appendChild(header);
    card.appendChild(desc);
    card.appendChild(footer);

    // Click card for detail view
    card.addEventListener("click", () => {
      this._detailView = { ...plugin, installed: isInstalled };
      this._rebuild();
    });

    return card;
  }

  // ── Detail view ──────────────────────────────────────────────

  /**
   * @param {object} plugin
   * @returns {HTMLElement}
   */
  _buildDetailView(plugin) {
    const detail = document.createElement("div");
    detail.className = "plugin-detail";

    // Back button
    const backBtn = document.createElement("button");
    backBtn.className = "plugin-detail__back";
    backBtn.innerHTML = "&#8592; Back";
    backBtn.addEventListener("click", () => {
      this._detailView = null;
      this._rebuild();
    });
    detail.appendChild(backBtn);

    // Hero
    const hero = document.createElement("div");
    hero.className = "plugin-detail__hero";

    const icon = document.createElement("div");
    icon.className = "plugin-detail__icon";
    icon.textContent = plugin.icon || "\u{1F9E9}";

    const meta = document.createElement("div");
    meta.className = "plugin-detail__meta";

    const nameEl = document.createElement("div");
    nameEl.className = "plugin-detail__name";
    nameEl.textContent = plugin.name;

    const authorLine = document.createElement("div");
    authorLine.className = "plugin-detail__author-line";
    authorLine.textContent = `by ${plugin.author || "Unknown"} \u00B7 v${plugin.version}`;

    meta.appendChild(nameEl);
    meta.appendChild(authorLine);

    hero.appendChild(icon);
    hero.appendChild(meta);
    detail.appendChild(hero);

    // Description section
    const descSection = document.createElement("div");
    descSection.className = "plugin-detail__section";

    const descTitle = document.createElement("div");
    descTitle.className = "plugin-detail__section-title";
    descTitle.textContent = "Description";

    const descText = document.createElement("div");
    descText.className = "plugin-detail__description";
    descText.textContent = plugin.description || "No description provided.";

    descSection.appendChild(descTitle);
    descSection.appendChild(descText);
    detail.appendChild(descSection);

    // Permissions section
    const perms = plugin.permissions || [];
    if (perms.length > 0) {
      const permSection = document.createElement("div");
      permSection.className = "plugin-detail__section";

      const permTitle = document.createElement("div");
      permTitle.className = "plugin-detail__section-title";
      permTitle.textContent = "Permissions";

      const permList = document.createElement("ul");
      permList.className = "plugin-detail__permissions";

      for (const perm of perms) {
        const li = document.createElement("li");
        li.className = "plugin-detail__permission";
        li.textContent = PERM_LABELS[perm] || perm;
        permList.appendChild(li);
      }

      permSection.appendChild(permTitle);
      permSection.appendChild(permList);
      detail.appendChild(permSection);
    }

    // Actions
    const actions = document.createElement("div");
    actions.className = "plugin-detail__actions";

    const isInstalled = this._pm.has(plugin.id);

    if (isInstalled) {
      const uninstallBtn = document.createElement("button");
      uninstallBtn.className = "plugin-store__btn plugin-store__btn--danger";
      uninstallBtn.textContent = "Uninstall";
      uninstallBtn.addEventListener("click", () => {
        this._showConfirmation(
          "Uninstall Plugin",
          `Are you sure you want to uninstall "${plugin.name}"?`,
          async () => {
            try {
              await this._pm.unload(plugin.id);
              this._detailView = null;
              this._rebuild();
            } catch (err) {
              console.error("[PluginStore] Uninstall error:", err);
            }
          },
        );
      });
      actions.appendChild(uninstallBtn);
    } else {
      const installBtn = document.createElement("button");
      installBtn.className = "plugin-store__btn plugin-store__btn--install";
      installBtn.textContent = "Install Plugin";
      installBtn.addEventListener("click", () => {
        this._installCatalogPlugin(plugin, installBtn);
      });
      actions.appendChild(installBtn);
    }

    detail.appendChild(actions);
    return detail;
  }

  // ── Create tab ───────────────────────────────────────────────

  _buildCreateTab() {
    const frag = document.createElement("div");
    frag.className = "plugin-create";

    const intro = document.createElement("div");
    intro.className = "plugin-card__description";
    intro.textContent =
      'Generate a plugin scaffold to get started. Fill in the details below and hit "Generate" to create the template files.';
    frag.appendChild(intro);

    const form = document.createElement("div");
    form.className = "plugin-create__form";

    // Fields
    const fields = [
      {
        key: "id",
        label: "Plugin ID",
        placeholder: "my-cool-plugin",
        value: "",
      },
      {
        key: "name",
        label: "Display Name",
        placeholder: "My Cool Plugin",
        value: "",
      },
      { key: "author", label: "Author", placeholder: "Your Name", value: "" },
      {
        key: "description",
        label: "Description",
        placeholder: "What does your plugin do?",
        value: "",
      },
      {
        key: "icon",
        label: "Icon (emoji)",
        placeholder: "\u{1F9E9}",
        value: "",
      },
      {
        key: "color",
        label: "Accent Color",
        placeholder: "#a855f7",
        value: "",
      },
    ];

    const inputs = {};

    for (const f of fields) {
      const fieldEl = document.createElement("div");
      fieldEl.className = "plugin-create__field";

      const label = document.createElement("label");
      label.className = "plugin-create__label";
      label.textContent = f.label;

      const input = document.createElement("input");
      input.className = "plugin-create__input";
      input.type = "text";
      input.placeholder = f.placeholder;
      input.value = f.value;
      inputs[f.key] = input;

      fieldEl.appendChild(label);
      fieldEl.appendChild(input);
      form.appendChild(fieldEl);
    }

    frag.appendChild(form);

    // Preview area
    const previewLabel = document.createElement("div");
    previewLabel.className = "plugin-create__label";
    previewLabel.textContent = "Generated manifest.json";
    previewLabel.style.marginTop = "var(--space-4)";

    const preview = document.createElement("div");
    preview.className = "plugin-create__preview";
    preview.textContent = '// Fill in the fields above and click "Generate"';

    frag.appendChild(previewLabel);
    frag.appendChild(preview);

    // Buttons
    const actions = document.createElement("div");
    actions.className = "plugin-detail__actions";
    actions.style.marginTop = "var(--space-2)";

    const generateBtn = document.createElement("button");
    generateBtn.className = "plugin-store__btn plugin-store__btn--primary";
    generateBtn.textContent = "Generate Template";
    generateBtn.addEventListener("click", () => {
      const opts = {};
      for (const [key, input] of Object.entries(inputs)) {
        if (input.value.trim()) opts[key] = input.value.trim();
      }
      const template = generatePluginTemplate(opts);
      preview.textContent = template.manifest;
      this._generatedTemplate = template;
      saveBtn.disabled = false;
    });

    const saveBtn = document.createElement("button");
    saveBtn.className = "plugin-store__btn plugin-store__btn--install";
    saveBtn.textContent = "Save to Plugins Folder";
    saveBtn.disabled = true;
    saveBtn.addEventListener("click", async () => {
      if (!this._generatedTemplate) return;
      const id = inputs.id.value.trim() || "my-plugin";
      await this._savePlugin(id, this._generatedTemplate);
    });

    actions.appendChild(generateBtn);
    actions.appendChild(saveBtn);
    frag.appendChild(actions);

    return frag;
  }

  // ── Install from catalog ─────────────────────────────────────

  /**
   * Simulate installing a plugin from the community catalog.
   * In a real implementation this would download from a registry.
   * For now, we generate the template and save it.
   *
   * @param {object} plugin — catalog entry
   * @param {HTMLElement} btn — the install button (for progress feedback)
   */
  async _installCatalogPlugin(plugin, btn) {
    const originalText = btn.textContent;
    btn.textContent = "Installing...";
    btn.disabled = true;

    // Add a progress bar below the button's parent card
    const card = btn.closest(".plugin-card") || btn.closest(".plugin-detail");
    let progressEl = null;
    if (card) {
      progressEl = document.createElement("div");
      progressEl.className = "plugin-progress plugin-progress--active";
      const bar = document.createElement("div");
      bar.className = "plugin-progress__bar";
      progressEl.appendChild(bar);
      card.appendChild(progressEl);

      // Animate progress
      requestAnimationFrame(() => {
        bar.style.width = "30%";
      });
      setTimeout(() => {
        bar.style.width = "70%";
      }, 400);
      setTimeout(() => {
        bar.style.width = "100%";
      }, 800);
    }

    // Generate & save
    const template = generatePluginTemplate({
      id: plugin.id,
      name: plugin.name,
      author: plugin.author,
      description: plugin.description,
      icon: plugin.icon,
      color: plugin.color,
    });

    try {
      await this._savePlugin(plugin.id, template);

      // Try to load it
      const pluginPath = `${this._pm.pluginsDir}/${plugin.id}`;
      try {
        await this._pm.load(pluginPath);
      } catch (loadErr) {
        console.warn(
          "[PluginStore] Plugin saved but could not auto-load:",
          loadErr,
        );
      }

      btn.textContent = "Installed";
      if (progressEl) {
        setTimeout(() => progressEl.remove(), 1000);
      }

      // Notify
      document.dispatchEvent(
        new CustomEvent("toast:show", {
          detail: {
            message: `Installed "${plugin.name}" successfully!`,
            type: "success",
          },
          bubbles: true,
        }),
      );

      // Refresh after a beat
      setTimeout(() => this._rebuild(), 500);
    } catch (err) {
      console.error("[PluginStore] Install error:", err);
      btn.textContent = "Error";
      btn.disabled = false;
      if (progressEl) progressEl.remove();

      document.dispatchEvent(
        new CustomEvent("toast:show", {
          detail: {
            message: `Failed to install "${plugin.name}": ${err.message}`,
            type: "error",
          },
          bubbles: true,
        }),
      );

      setTimeout(() => {
        btn.textContent = originalText;
        btn.disabled = false;
      }, 2000);
    }
  }

  // ── Save plugin to disk ──────────────────────────────────────

  /**
   * @param {string} id
   * @param {{ manifest: string, entryPoint: string }} template
   */
  async _savePlugin(id, template) {
    const pluginDir = `${this._pm.pluginsDir}/${id}`;

    // Try preload bridge
    if (window.api && window.api.fs && window.api.fs.writeFile) {
      await window.api.fs.mkdir(pluginDir, { recursive: true });
      await window.api.fs.writeFile(
        `${pluginDir}/manifest.json`,
        template.manifest,
      );
      await window.api.fs.writeFile(
        `${pluginDir}/index.js`,
        template.entryPoint,
      );
      return;
    }

    // Try Node fs
    try {
      const fs = require("fs");
      const path = require("path");
      fs.mkdirSync(pluginDir, { recursive: true });
      fs.writeFileSync(
        path.join(pluginDir, "manifest.json"),
        template.manifest,
      );
      fs.writeFileSync(path.join(pluginDir, "index.js"), template.entryPoint);
      return;
    } catch (err) {
      throw new Error(`Cannot write plugin files: ${err.message}`);
    }
  }

  // ── Toggle switch ────────────────────────────────────────────

  /**
   * @param {string} pluginId
   * @param {boolean} enabled
   * @returns {HTMLElement}
   */
  _buildToggle(pluginId, enabled) {
    const label = document.createElement("label");
    label.className = "plugin-toggle";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = enabled;
    input.addEventListener("change", (e) => {
      e.stopPropagation();
      try {
        this._pm.setEnabled(pluginId, input.checked);
      } catch (err) {
        console.error("[PluginStore] Toggle error:", err);
        input.checked = !input.checked;
      }
    });

    const track = document.createElement("span");
    track.className = "plugin-toggle__track";

    label.appendChild(input);
    label.appendChild(track);
    return label;
  }

  // ── Confirmation dialog ──────────────────────────────────────

  /**
   * @param {string} title
   * @param {string} message
   * @param {Function} onConfirm
   */
  _showConfirmation(title, message, onConfirm) {
    const overlay = document.createElement("div");
    overlay.className = "plugin-confirm";

    const box = document.createElement("div");
    box.className = "plugin-confirm__box";

    const titleEl = document.createElement("div");
    titleEl.className = "plugin-confirm__title";
    titleEl.textContent = title;

    const msgEl = document.createElement("div");
    msgEl.className = "plugin-confirm__message";
    msgEl.textContent = message;

    const actions = document.createElement("div");
    actions.className = "plugin-confirm__actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "plugin-store__btn";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => overlay.remove());

    const confirmBtn = document.createElement("button");
    confirmBtn.className = "plugin-store__btn plugin-store__btn--danger";
    confirmBtn.textContent = "Confirm";
    confirmBtn.addEventListener("click", async () => {
      overlay.remove();
      await onConfirm();
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(confirmBtn);

    box.appendChild(titleEl);
    box.appendChild(msgEl);
    box.appendChild(actions);
    overlay.appendChild(box);

    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  // ── Empty state ──────────────────────────────────────────────

  /**
   * @param {string} icon
   * @param {string} text
   * @returns {HTMLElement}
   */
  _buildEmpty(icon, text) {
    const empty = document.createElement("div");
    empty.className = "plugin-store__empty";

    const iconEl = document.createElement("div");
    iconEl.className = "plugin-store__empty-icon";
    iconEl.textContent = icon;

    const textEl = document.createElement("div");
    textEl.className = "plugin-store__empty-text";
    textEl.textContent = text;

    empty.appendChild(iconEl);
    empty.appendChild(textEl);
    return empty;
  }
}
