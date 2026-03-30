/**
 * brain-library.js — Brain Library zone module
 *
 * Manages knowledge sources that can be injected into agent context.
 * Supports adding text, URLs, and files. Each source can be toggled
 * on/off for inclusion in dispatched prompts.
 *
 * @module BrainLibrary
 */

export class BrainLibrary {
  constructor() {
    /** @type {Array<Object>} In-memory knowledge sources */
    this.sources = [];

    /** @type {HTMLElement|null} Root DOM element for the panel */
    this.container = null;

    /** @type {string} Current search/filter query */
    this.searchQuery = "";

    /** @type {string} Currently active add-knowledge tab */
    this._activeTab = "text";
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Create and return the DOM element for the Brain Library panel.
   * @returns {HTMLElement}
   */
  render() {
    const el = document.createElement("div");
    el.className = "brain-library";
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", "Brain Library — Knowledge Management");

    el.innerHTML = `
      <!-- Header -->
      <div class="brain-header">
        <h2 class="brain-header__title">
          <span aria-hidden="true">&#x1f9e0;</span> Brain Library
        </h2>
        <p class="brain-header__greeting">
          Your Librarian is ready. Add knowledge sources to enrich agent context.
        </p>
        <div class="brain-header__stats" aria-live="polite">
          <span class="brain-header__stat" data-stat="total">0 sources</span>
          <span class="brain-header__stat brain-header__stat--active" data-stat="active">0 active</span>
          <span class="brain-header__stat" data-stat="chars">0 chars</span>
        </div>
      </div>

      <!-- Search -->
      <div class="knowledge-search">
        <div class="knowledge-search__wrap">
          <span class="knowledge-search__icon" aria-hidden="true">&#x1f50d;</span>
          <input
            type="search"
            class="knowledge-search__input"
            placeholder="Search knowledge sources..."
            aria-label="Search knowledge sources"
          />
        </div>
      </div>

      <!-- Knowledge source list -->
      <div class="knowledge-list" role="list" aria-label="Knowledge sources">
        <!-- Cards or empty state rendered here -->
      </div>

      <!-- Add knowledge form -->
      <div class="add-knowledge">
        <div class="tab-bar" role="tablist" aria-label="Add knowledge method">
          <button
            class="tab-bar__btn tab-bar__btn--active"
            role="tab"
            aria-selected="true"
            aria-controls="tab-panel-text"
            data-tab="text"
            type="button"
          >Paste Text</button>
          <button
            class="tab-bar__btn"
            role="tab"
            aria-selected="false"
            aria-controls="tab-panel-url"
            data-tab="url"
            type="button"
          >Enter URL</button>
          <button
            class="tab-bar__btn"
            role="tab"
            aria-selected="false"
            aria-controls="tab-panel-file"
            data-tab="file"
            type="button"
          >Upload File</button>
        </div>

        <!-- Tab: Paste Text -->
        <div class="tab-panel tab-panel--active" id="tab-panel-text" role="tabpanel">
          <div class="add-knowledge__field">
            <label class="add-knowledge__label" for="bl-text-title">Title</label>
            <input
              id="bl-text-title"
              class="add-knowledge__input"
              type="text"
              placeholder="e.g. Meeting notes, API docs..."
            />
          </div>
          <div class="add-knowledge__field">
            <label class="add-knowledge__label" for="bl-text-content">Content</label>
            <textarea
              id="bl-text-content"
              class="knowledge-textarea"
              placeholder="Paste your knowledge here..."
              rows="5"
            ></textarea>
          </div>
          <button class="add-knowledge__btn" data-action="add-text" type="button">
            Add to Library
          </button>
        </div>

        <!-- Tab: Enter URL -->
        <div class="tab-panel" id="tab-panel-url" role="tabpanel">
          <div class="add-knowledge__field">
            <label class="add-knowledge__label" for="bl-url-input">URL</label>
            <input
              id="bl-url-input"
              class="add-knowledge__input"
              type="url"
              placeholder="https://example.com/docs"
            />
          </div>
          <button class="add-knowledge__btn add-knowledge__btn--fetch" data-action="fetch-url" type="button">
            Fetch &amp; Store
          </button>
        </div>

        <!-- Tab: Upload File -->
        <div class="tab-panel" id="tab-panel-file" role="tabpanel">
          <div class="drop-zone" data-action="drop-zone">
            <span class="drop-zone__icon" aria-hidden="true">&#x1f4c4;</span>
            <span class="drop-zone__text">Drop a file here or click to browse</span>
            <span class="drop-zone__hint">.txt, .md, .json supported</span>
            <input
              class="drop-zone__input"
              type="file"
              accept=".txt,.md,.json"
              aria-label="Upload a knowledge file"
            />
          </div>
        </div>
      </div>
    `;

    this.container = el;
    this._bindEvents();
    this._renderList();
    this._updateStats();

    return el;
  }

  /**
   * Open (show) the Brain Library panel.
   */
  open() {
    if (!this.container) {
      this.render();
    }
    this.container.style.display = "flex";
    this.container.setAttribute("aria-hidden", "false");
    this._emitEvent("brain-library:open");
  }

  /**
   * Close (hide) the Brain Library panel.
   */
  close() {
    if (this.container) {
      this.container.style.display = "none";
      this.container.setAttribute("aria-hidden", "true");
      this._emitEvent("brain-library:close");
    }
  }

  /**
   * Add a knowledge source to the library.
   * @param {'text'|'url'|'file'} type — Source type
   * @param {string} title — Human-readable title
   * @param {string} content — Raw content string
   * @returns {Object} The newly created source object
   */
  addSource(type, title, content) {
    const source = {
      id: crypto.randomUUID(),
      type,
      title,
      content,
      charCount: content.length,
      active: true,
      createdAt: new Date().toISOString(),
    };

    this.sources.push(source);
    this._renderList();
    this._updateStats();
    this._emitEvent("brain-library:add", { source });

    return source;
  }

  /**
   * Delete a knowledge source by ID.
   * @param {string} id — Source UUID
   */
  deleteSource(id) {
    const idx = this.sources.findIndex((s) => s.id === id);
    if (idx === -1) return;

    const [removed] = this.sources.splice(idx, 1);
    this._renderList();
    this._updateStats();
    this._emitEvent("brain-library:delete", { source: removed });
  }

  /**
   * Toggle a source's active (context inclusion) state.
   * @param {string} id — Source UUID
   */
  toggleSource(id) {
    const source = this.sources.find((s) => s.id === id);
    if (!source) return;

    source.active = !source.active;
    this._updateCardState(id, source.active);
    this._updateStats();
    this._emitEvent("brain-library:toggle", { source });
  }

  /**
   * Filter displayed sources by a search query.
   * @param {string} query — Search string
   */
  search(query) {
    this.searchQuery = query.toLowerCase().trim();
    this._renderList();
  }

  /**
   * Get concatenated content of all active sources.
   * Used to inject knowledge into dispatched agent context.
   * @returns {string}
   */
  getActiveContext() {
    return this.sources
      .filter((s) => s.active)
      .map((s) => s.content)
      .join("\n\n---\n\n");
  }

  // ── Private methods ─────────────────────────────────────────────

  /**
   * Bind all event listeners on the panel.
   * @private
   */
  _bindEvents() {
    const el = this.container;

    // Tab switching
    el.addEventListener("click", (e) => {
      const tabBtn = e.target.closest("[data-tab]");
      if (tabBtn) {
        this._switchTab(tabBtn.dataset.tab);
        return;
      }

      // Add text
      if (e.target.closest('[data-action="add-text"]')) {
        this._handleAddText();
        return;
      }

      // Fetch URL
      if (e.target.closest('[data-action="fetch-url"]')) {
        this._handleFetchUrl();
        return;
      }

      // Delete source
      const deleteBtn = e.target.closest(".knowledge-delete");
      if (deleteBtn) {
        const card = deleteBtn.closest(".knowledge-card");
        if (card) this.deleteSource(card.dataset.id);
        return;
      }
    });

    // Toggle source context inclusion
    el.addEventListener("change", (e) => {
      if (e.target.closest('.knowledge-toggle input[type="checkbox"]')) {
        const card = e.target.closest(".knowledge-card");
        if (card) this.toggleSource(card.dataset.id);
      }
    });

    // Search input (debounced)
    const searchInput = el.querySelector(".knowledge-search__input");
    let searchTimer = null;
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        this.search(searchInput.value);
      }, 200);
    });

    // File drop zone
    const dropZone = el.querySelector('[data-action="drop-zone"]');
    const fileInput = el.querySelector(".drop-zone__input");

    if (dropZone) {
      dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("drop-zone--dragover");
      });

      dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("drop-zone--dragover");
      });

      dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("drop-zone--dragover");
        const files = e.dataTransfer?.files;
        if (files?.length) this._handleFileUpload(files[0]);
      });
    }

    if (fileInput) {
      fileInput.addEventListener("change", () => {
        if (fileInput.files?.length) {
          this._handleFileUpload(fileInput.files[0]);
          fileInput.value = ""; // reset for re-upload of same file
        }
      });
    }
  }

  /**
   * Switch the active tab in the add-knowledge form.
   * @param {string} tab — 'text' | 'url' | 'file'
   * @private
   */
  _switchTab(tab) {
    this._activeTab = tab;
    const el = this.container;

    // Update tab buttons
    el.querySelectorAll(".tab-bar__btn").forEach((btn) => {
      const isActive = btn.dataset.tab === tab;
      btn.classList.toggle("tab-bar__btn--active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
    });

    // Update tab panels
    el.querySelectorAll(".tab-panel").forEach((panel) => {
      const isActive = panel.id === `tab-panel-${tab}`;
      panel.classList.toggle("tab-panel--active", isActive);
    });
  }

  /**
   * Handle adding a text source from the paste tab.
   * @private
   */
  _handleAddText() {
    const el = this.container;
    const titleInput = el.querySelector("#bl-text-title");
    const contentArea = el.querySelector("#bl-text-content");

    const title = titleInput.value.trim();
    const content = contentArea.value.trim();

    if (!content) {
      contentArea.focus();
      return;
    }

    this.addSource("text", title || "Untitled Text", content);

    // Clear form
    titleInput.value = "";
    contentArea.value = "";
    titleInput.focus();
  }

  /**
   * Handle fetching a URL. Emits an event for the main process to handle
   * actual network fetching (renderer cannot fetch arbitrary URLs directly).
   * @private
   */
  _handleFetchUrl() {
    const el = this.container;
    const urlInput = el.querySelector("#bl-url-input");
    const url = urlInput.value.trim();

    if (!url) {
      urlInput.focus();
      return;
    }

    // Validate URL format
    try {
      new URL(url);
    } catch {
      urlInput.classList.add("add-knowledge__input--error");
      setTimeout(
        () => urlInput.classList.remove("add-knowledge__input--error"),
        1500,
      );
      return;
    }

    // Emit event for main process to fetch the URL content
    this._emitEvent("brain-library:fetch-url", { url });

    // Add a placeholder source (main process will update content)
    this.addSource("url", url, `[Fetching content from ${url}...]`);

    urlInput.value = "";
  }

  /**
   * Handle file upload via drag-and-drop or file picker.
   * @param {File} file
   * @private
   */
  _handleFileUpload(file) {
    // Validate file type
    const allowedExtensions = [".txt", ".md", ".json"];
    const ext = "." + file.name.split(".").pop().toLowerCase();

    if (!allowedExtensions.includes(ext)) {
      this._emitEvent("brain-library:error", {
        message: `Unsupported file type: ${ext}. Use .txt, .md, or .json`,
      });
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const content = /** @type {string} */ (reader.result);
      this.addSource("file", file.name, content);
    };

    reader.onerror = () => {
      this._emitEvent("brain-library:error", {
        message: `Failed to read file: ${file.name}`,
      });
    };

    reader.readAsText(file);
  }

  /**
   * Render the knowledge source list (cards or empty state).
   * @private
   */
  _renderList() {
    const listEl = this.container?.querySelector(".knowledge-list");
    if (!listEl) return;

    // Filter sources by search query
    const filtered = this.searchQuery
      ? this.sources.filter(
          (s) =>
            s.title.toLowerCase().includes(this.searchQuery) ||
            s.content.toLowerCase().includes(this.searchQuery) ||
            s.type.toLowerCase().includes(this.searchQuery),
        )
      : this.sources;

    // Empty state
    if (filtered.length === 0) {
      const emptyMessage = this.searchQuery
        ? "No sources match your search."
        : "No knowledge sources yet. Add text, URLs, or files below.";

      listEl.innerHTML = `
        <div class="knowledge-empty">
          <span class="knowledge-empty__icon" aria-hidden="true">&#x1f4da;</span>
          <p class="knowledge-empty__title">Library is empty</p>
          <p class="knowledge-empty__text">${emptyMessage}</p>
        </div>
      `;
      return;
    }

    // Render cards
    listEl.innerHTML = filtered
      .map((source) => this._renderCard(source))
      .join("");
  }

  /**
   * Render a single knowledge card HTML string.
   * @param {Object} source
   * @returns {string}
   * @private
   */
  _renderCard(source) {
    const preview =
      source.content.length > 100
        ? source.content.slice(0, 100) + "..."
        : source.content;

    const charCount = source.charCount.toLocaleString();
    const badgeClass = `knowledge-type-badge--${source.type}`;
    const typeLabel =
      source.type.charAt(0).toUpperCase() + source.type.slice(1);
    const inactiveClass = source.active ? "" : " knowledge-card--inactive";
    const date = new Date(source.createdAt).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    return `
      <div class="knowledge-card${inactiveClass}" data-id="${source.id}" role="listitem">
        <div class="knowledge-card-header">
          <span class="knowledge-type-badge ${badgeClass}">${typeLabel}</span>
          <h4 class="knowledge-title">${this._escapeHtml(source.title)}</h4>
          <span class="knowledge-chars">${charCount} chars</span>
        </div>
        <p class="knowledge-preview">${this._escapeHtml(preview)}</p>
        <div class="knowledge-card-meta">Added ${date}</div>
        <div class="knowledge-card-actions">
          <label class="knowledge-toggle">
            <input type="checkbox" ${source.active ? "checked" : ""} aria-label="Include in context" />
            <span class="knowledge-toggle__switch" aria-hidden="true"></span>
            Include in context
          </label>
          <button class="knowledge-delete" type="button" aria-label="Delete ${this._escapeHtml(source.title)}">
            Delete
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Update a single card's visual state without full re-render.
   * @param {string} id — Source UUID
   * @param {boolean} active — New active state
   * @private
   */
  _updateCardState(id, active) {
    const card = this.container?.querySelector(
      `.knowledge-card[data-id="${id}"]`,
    );
    if (!card) return;
    card.classList.toggle("knowledge-card--inactive", !active);
  }

  /**
   * Update the stats display in the header.
   * @private
   */
  _updateStats() {
    if (!this.container) return;

    const totalEl = this.container.querySelector('[data-stat="total"]');
    const activeEl = this.container.querySelector('[data-stat="active"]');
    const charsEl = this.container.querySelector('[data-stat="chars"]');

    const total = this.sources.length;
    const active = this.sources.filter((s) => s.active).length;
    const chars = this.sources
      .filter((s) => s.active)
      .reduce((sum, s) => sum + s.charCount, 0);

    if (totalEl)
      totalEl.textContent = `${total} source${total !== 1 ? "s" : ""}`;
    if (activeEl) activeEl.textContent = `${active} active`;
    if (charsEl) charsEl.textContent = `${chars.toLocaleString()} chars`;
  }

  /**
   * Escape HTML special characters to prevent XSS.
   * @param {string} str
   * @returns {string}
   * @private
   */
  _escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Emit a custom event on the document for inter-module communication.
   * @param {string} name — Event name (e.g. 'brain-library:add')
   * @param {Object} [detail={}] — Event detail payload
   * @private
   */
  _emitEvent(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }
}
