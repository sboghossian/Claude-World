/**
 * search-results.js — Global search results dropdown for Claude World
 *
 * Integrates into the existing command palette (Cmd+K). When the user types
 * in the palette and the input is not a command or URL, a global search runs
 * across all zone tables. Results are shown in a categorized dropdown below
 * the input, with keyboard navigation and click-to-open.
 *
 * Usage:
 *   import { SearchResults } from './search-results.js';
 *   const sr = new SearchResults(palette._modal);
 *   sr.show(results);
 */

import { GlobalSearch } from "../systems/global-search.js";

// ── Zone icons (matches command-palette.js ZONES) ────────────────────────────

const ZONE_ICONS = {
  dispatch: "\u{1F5FC}",
  legal: "\u2696\uFE0F",
  council: "\u{1F3DB}\uFE0F",
  sales: "\u{1F4C8}",
  marketing: "\u{1F4E3}",
  globe: "\u{1F310}",
  broadcast: "\u{1F4E1}",
  rnd: "\u{1F52C}",
  skills: "\u{1F393}",
  chat: "\u{1F4AC}",
};

const TYPE_LABELS = {
  tasks: "Task",
  legal_docs: "Legal Doc",
  council_sessions: "Council",
  leads: "Lead",
  content_pieces: "Content",
  research_queries: "Research",
  broadcast_log: "Broadcast",
  experiments: "Experiment",
  skills: "Skill",
  messages: "Message",
};

// ── HTML helpers ─────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── SearchResults class ──────────────────────────────────────────────────────

export class SearchResults {
  /**
   * @param {HTMLElement} paletteEl - The command palette modal element
   */
  constructor(paletteEl) {
    /** @type {HTMLElement} */
    this._paletteEl = paletteEl;
    /** @type {GlobalSearch} */
    this._search = new GlobalSearch();
    /** @type {Array} */
    this._results = [];
    /** @type {number} */
    this._selectedIndex = -1;
    /** @type {boolean} */
    this._visible = false;
    /** @type {boolean} */
    this._loading = false;
    /** @type {string} */
    this._lastQuery = "";

    this._createDOM();
    this._bindEvents();
  }

  // ── DOM creation ───────────────────────────────────────────────────────────

  _createDOM() {
    this._container = document.createElement("div");
    this._container.className = "sr-container";
    this._container.style.display = "none";

    this._listEl = document.createElement("div");
    this._listEl.className = "sr-list";
    this._listEl.setAttribute("role", "listbox");
    this._listEl.setAttribute("aria-label", "Global search results");
    this._container.appendChild(this._listEl);

    // Insert after the command palette input area, before the results
    const cpResults = this._paletteEl.querySelector(".cp-results");
    if (cpResults) {
      this._paletteEl.insertBefore(this._container, cpResults);
    } else {
      this._paletteEl.appendChild(this._container);
    }
  }

  // ── Event binding ──────────────────────────────────────────────────────────

  _bindEvents() {
    // Listen for clicks on result items
    this._listEl.addEventListener("click", (e) => {
      const row = e.target.closest(".sr-row");
      if (!row) return;
      const idx = parseInt(row.dataset.index, 10);
      if (!isNaN(idx) && this._results[idx]) {
        this._executeResult(this._results[idx]);
      }
    });

    // Keyboard navigation is handled externally by the command palette
    // We expose methods for the palette to call

    // Listen for command palette global search events
    this._onGlobalSearch = (e) => {
      const { query, worldId } = e.detail;
      this.runSearch(query, { worldId });
    };
    this._onGlobalSearchClear = () => {
      this.hide();
    };
    document.addEventListener(
      "command-palette:global-search",
      this._onGlobalSearch,
    );
    document.addEventListener(
      "command-palette:global-search-clear",
      this._onGlobalSearchClear,
    );
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Run a global search and display results.
   * @param {string} query
   * @param {Object} [opts]
   */
  async runSearch(query, opts = {}) {
    const q = query.trim();
    if (q.length < 2) {
      this.hide();
      return;
    }

    this._lastQuery = q;
    this._setLoading(true);
    this._show();

    const { results, total } = await this._search.searchDebounced(q, opts);

    // Only apply if query hasn't changed
    if (this._lastQuery !== q) return;

    this._results = results || [];
    this._selectedIndex = results.length > 0 ? 0 : -1;
    this._setLoading(false);
    this._render();
  }

  /**
   * Show pre-built results.
   * @param {{ results: Array, total: number }} data
   */
  show(data) {
    this._results = data.results || [];
    this._selectedIndex = this._results.length > 0 ? 0 : -1;
    this._setLoading(false);
    this._show();
    this._render();
  }

  /**
   * Hide the search results dropdown.
   */
  hide() {
    this._visible = false;
    this._container.style.display = "none";
    this._results = [];
    this._selectedIndex = -1;
    this._search.cancelPending();
  }

  /**
   * Move the selection cursor.
   * @param {number} delta - +1 for down, -1 for up
   * @returns {boolean} True if we handled the navigation
   */
  moveSelection(delta) {
    if (!this._visible || this._results.length === 0) return false;

    this._selectedIndex += delta;
    if (this._selectedIndex < 0) this._selectedIndex = this._results.length - 1;
    if (this._selectedIndex >= this._results.length) this._selectedIndex = 0;

    this._updateSelection();
    return true;
  }

  /**
   * Execute the currently selected result.
   * @returns {boolean} True if we handled the execution
   */
  executeSelected() {
    if (
      !this._visible ||
      this._selectedIndex < 0 ||
      !this._results[this._selectedIndex]
    ) {
      return false;
    }
    this._executeResult(this._results[this._selectedIndex]);
    return true;
  }

  /**
   * Check if search results are currently visible.
   * @returns {boolean}
   */
  get isVisible() {
    return this._visible;
  }

  /**
   * Get recent searches.
   * @returns {string[]}
   */
  getRecentSearches() {
    return this._search.getRecentSearches();
  }

  /**
   * Clear recent searches.
   */
  clearRecent() {
    this._search.clearRecent();
  }

  /**
   * Destroy and clean up.
   */
  destroy() {
    this._search.destroy();
    document.removeEventListener(
      "command-palette:global-search",
      this._onGlobalSearch,
    );
    document.removeEventListener(
      "command-palette:global-search-clear",
      this._onGlobalSearchClear,
    );
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _show() {
    this._visible = true;
    this._container.style.display = "block";
  }

  _setLoading(val) {
    this._loading = val;
    if (val && this._results.length === 0) {
      this._listEl.innerHTML = `
        <div class="sr-loading">
          <svg class="sr-spinner" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2"
              stroke-dasharray="28" stroke-dashoffset="10" stroke-linecap="round"/>
          </svg>
          <span>Searching across all zones...</span>
        </div>
      `;
    }
  }

  _render() {
    if (this._results.length === 0 && !this._loading) {
      this._listEl.innerHTML = `
        <div class="sr-empty">
          <span class="sr-empty-icon">\u{1F32B}\uFE0F</span>
          <span class="sr-empty-text">No results found</span>
          <span class="sr-empty-sub">Try different keywords or check spelling</span>
        </div>
      `;
      return;
    }

    if (this._loading) return; // keep the spinner

    // Group results by zone type
    const grouped = new Map();
    for (const r of this._results) {
      const key = r.type || "unknown";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(r);
    }

    const fragment = document.createDocumentFragment();
    let flatIndex = 0;

    for (const [type, items] of grouped) {
      const meta = GlobalSearch.getZoneMeta(type);
      const icon = meta ? meta.emoji : "\u{1F4CB}";
      const label = TYPE_LABELS[type] || type;

      // Category header
      const header = document.createElement("div");
      header.className = "sr-category-header";
      header.innerHTML = `
        <span class="sr-category-icon">${icon}</span>
        <span class="sr-category-label">${escapeHtml(meta ? meta.label : label)}</span>
        <span class="sr-category-count">${items.length}</span>
      `;
      fragment.appendChild(header);

      // Result rows
      for (const result of items) {
        const idx = flatIndex++;
        const isSelected = idx === this._selectedIndex;

        const row = document.createElement("div");
        row.className = "sr-row" + (isSelected ? " sr-row--selected" : "");
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", isSelected ? "true" : "false");
        row.dataset.index = idx;

        // Type badge
        const badge = document.createElement("span");
        badge.className = "sr-type-badge";
        badge.textContent = label;
        row.appendChild(badge);

        // Content (title + snippet)
        const contentEl = document.createElement("div");
        contentEl.className = "sr-row-content";

        const titleEl = document.createElement("span");
        titleEl.className = "sr-row-title";
        titleEl.textContent = result.title || "Untitled";
        contentEl.appendChild(titleEl);

        if (result.snippet) {
          const snippetEl = document.createElement("span");
          snippetEl.className = "sr-row-snippet";
          snippetEl.innerHTML = result.snippet; // already has <mark> tags
          contentEl.appendChild(snippetEl);
        }

        row.appendChild(contentEl);

        // Right: enter hint
        const rightEl = document.createElement("span");
        rightEl.className = "sr-row-right";
        rightEl.innerHTML = "<kbd>\u21B5</kbd>";
        row.appendChild(rightEl);

        fragment.appendChild(row);
      }
    }

    this._listEl.innerHTML = "";
    this._listEl.appendChild(fragment);
  }

  _updateSelection() {
    const rows = this._listEl.querySelectorAll(".sr-row");
    rows.forEach((row, i) => {
      const idx = parseInt(row.dataset.index, 10);
      const isSelected = idx === this._selectedIndex;
      row.classList.toggle("sr-row--selected", isSelected);
      row.setAttribute("aria-selected", isSelected ? "true" : "false");

      if (isSelected) {
        row.scrollIntoView({ block: "nearest" });
      }
    });
  }

  _executeResult(result) {
    if (!result) return;

    const zoneId = result.zoneId;
    const zoneMeta = GlobalSearch.getZoneMeta(result.type);

    // Dispatch navigation event (same pattern as command palette)
    document.dispatchEvent(
      new CustomEvent("command-palette:navigate", {
        detail: {
          zoneId: zoneId || (zoneMeta ? zoneMeta.zoneId : null),
          zoneName: zoneMeta ? zoneMeta.label : result.type,
          searchResultId: result.id,
          searchResultType: result.type,
        },
        bubbles: true,
      }),
    );

    // Also dispatch a specific search result event for zone panels to handle
    document.dispatchEvent(
      new CustomEvent("search:result-selected", {
        detail: { ...result },
        bubbles: true,
      }),
    );

    // Hide after selection
    this.hide();
  }
}
