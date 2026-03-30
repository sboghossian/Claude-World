/**
 * theme-picker.js — Claude World Theme Picker
 * A VSCode-style modal for switching world themes with live preview.
 */

// ---------------------------------------------------------------------------
// CSS — injected once into the document head
// ---------------------------------------------------------------------------

const PICKER_CSS = `
#cw-theme-picker-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 80px;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  opacity: 0;
  pointer-events: none;
  transition: opacity 180ms ease;
}

#cw-theme-picker-overlay.cw-tp-visible {
  opacity: 1;
  pointer-events: all;
}

#cw-theme-picker {
  width: 480px;
  max-height: 580px;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 24px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04);
  background: var(--cw-panel, #0d1117);
  transform: translateY(-18px);
  transition:
    transform 200ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 200ms ease,
    background 300ms ease;
  opacity: 0;
}

#cw-theme-picker-overlay.cw-tp-visible #cw-theme-picker {
  transform: translateY(0);
  opacity: 1;
}

/* Header */
.cw-tp-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--cw-border, #1e2432);
  flex-shrink: 0;
  background: var(--cw-panel, #0d1117);
  transition: background 300ms ease, border-color 300ms ease;
}

.cw-tp-header-icon {
  font-size: 20px;
  line-height: 1;
}

.cw-tp-header-text {
  flex: 1;
}

.cw-tp-header-title {
  font-family: var(--font-sans, 'Inter', -apple-system, sans-serif);
  font-size: 14px;
  font-weight: 600;
  color: var(--cw-text, #e2e8f0);
  letter-spacing: -0.01em;
  line-height: 1.3;
  transition: color 300ms ease;
}

.cw-tp-header-subtitle {
  font-family: var(--font-mono, 'SF Mono', monospace);
  font-size: 11px;
  color: var(--cw-text-dim, #64748b);
  margin-top: 2px;
  transition: color 300ms ease;
}

.cw-tp-close-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--cw-border, #1e2432);
  background: transparent;
  color: var(--cw-text-dim, #64748b);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 150ms ease, color 150ms ease, border-color 300ms ease;
  flex-shrink: 0;
}

.cw-tp-close-btn:hover {
  background: var(--cw-card, #161b22);
  color: var(--cw-text, #e2e8f0);
}

/* Scrollable theme list */
.cw-tp-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  scrollbar-width: thin;
  scrollbar-color: var(--cw-border, #1e2432) transparent;
}

.cw-tp-list::-webkit-scrollbar {
  width: 4px;
}
.cw-tp-list::-webkit-scrollbar-track {
  background: transparent;
}
.cw-tp-list::-webkit-scrollbar-thumb {
  background: var(--cw-border, #1e2432);
  border-radius: 4px;
}

/* Theme card */
.cw-tp-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 14px;
  border-radius: 10px;
  border: 1.5px solid var(--cw-border, #1e2432);
  background: var(--cw-card, #161b22);
  cursor: pointer;
  transition:
    border-color 150ms ease,
    background 150ms ease,
    transform 150ms ease,
    box-shadow 150ms ease;
  outline: none;
  user-select: none;
  -webkit-user-select: none;
}

.cw-tp-card:hover {
  border-color: var(--cw-accent, #7c3aed);
  background: var(--cw-card, #161b22);
  transform: translateY(-1px);
  box-shadow: 0 4px 20px rgba(0,0,0,0.3), 0 0 0 1px var(--cw-accent, #7c3aed) inset;
}

.cw-tp-card:focus-visible {
  border-color: var(--cw-accent, #7c3aed);
  box-shadow: 0 0 0 2px var(--cw-accent, #7c3aed);
}

.cw-tp-card.cw-tp-active {
  border-color: var(--cw-accent, #7c3aed);
  background: var(--cw-card, #161b22);
  box-shadow: 0 0 20px rgba(124, 58, 237, 0.15), 0 0 0 1px var(--cw-accent, #7c3aed) inset;
}

.cw-tp-card.cw-tp-focused {
  border-color: var(--cw-accent, #7c3aed);
  box-shadow: 0 0 0 2px var(--cw-accent, #7c3aed);
}

/* Emoji */
.cw-tp-card-emoji {
  font-size: 26px;
  line-height: 1;
  flex-shrink: 0;
  width: 32px;
  text-align: center;
}

/* Text block */
.cw-tp-card-body {
  flex: 1;
  min-width: 0;
}

.cw-tp-card-name {
  font-family: var(--font-sans, 'Inter', sans-serif);
  font-size: 13px;
  font-weight: 600;
  color: var(--cw-text, #e2e8f0);
  letter-spacing: -0.01em;
  line-height: 1.3;
  transition: color 300ms ease;
}

.cw-tp-card-desc {
  font-family: var(--font-sans, 'Inter', sans-serif);
  font-size: 11px;
  color: var(--cw-text-dim, #64748b);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 300ms ease;
}

/* Swatch row */
.cw-tp-swatches {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 7px;
}

.cw-tp-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.12);
  flex-shrink: 0;
  transition: transform 150ms ease;
}

.cw-tp-card:hover .cw-tp-swatch {
  transform: scale(1.15);
}

/* Active badge */
.cw-tp-badge {
  position: absolute;
  top: 10px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: 20px;
  background: var(--cw-accent, #7c3aed);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  pointer-events: none;
  transition: background 300ms ease;
}

.cw-tp-badge-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(255,255,255,0.7);
  animation: cw-tp-pulse 2s ease-in-out infinite;
}

@keyframes cw-tp-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(0.7); }
}

/* Footer hint */
.cw-tp-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 20px 12px;
  border-top: 1px solid var(--cw-border, #1e2432);
  flex-shrink: 0;
  background: var(--cw-panel, #0d1117);
  transition: background 300ms ease, border-color 300ms ease;
}

.cw-tp-hint {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--cw-text-dim, #64748b);
  transition: color 300ms ease;
}

.cw-tp-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 5px;
  border-radius: 4px;
  border: 1px solid var(--cw-border, #1e2432);
  background: var(--cw-card, #161b22);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
  color: var(--cw-text-dim, #64748b);
  line-height: 1.6;
  transition: background 300ms ease, border-color 300ms ease, color 300ms ease;
}

/* Transition shim: smooth CSS var transitions across the whole doc */
*, *::before, *::after {
  transition-property: background-color, border-color, color, box-shadow;
  transition-duration: 250ms;
  transition-timing-function: ease;
}
`;

// ---------------------------------------------------------------------------
// ThemePicker class
// ---------------------------------------------------------------------------

export class ThemePicker {
  constructor(themeEngine) {
    this._engine = themeEngine;
    this._overlay = null;
    this._container = null;
    this._open = false;
    this._focusedIndex = 0;
    this._hoverTheme = null; // theme being previewed on hover
    this._styleInjected = false;
    this._boundKeydown = this._onKeydown.bind(this);
    this._boundOverlayClick = this._onOverlayClick.bind(this);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Open the picker modal. */
  open() {
    if (this._open) return;
    this._ensureStyles();
    this._ensureDOM();
    this._syncCards();

    this._open = true;
    // Trigger entrance animation next frame
    requestAnimationFrame(() => {
      this._overlay.classList.add("cw-tp-visible");
    });

    document.addEventListener("keydown", this._boundKeydown);
    this._focusedIndex = this._getThemeIds().indexOf(this._engine.getCurrent());
    if (this._focusedIndex < 0) this._focusedIndex = 0;
    this._updateFocusHighlight();
  }

  /** Close the picker modal, reverting any hover preview. */
  close() {
    if (!this._open) return;
    this._open = false;

    // Revert hover preview if active
    if (this._hoverTheme !== null) {
      this._engine.apply(this._engine.getCurrent());
      this._hoverTheme = null;
    }

    this._overlay.classList.remove("cw-tp-visible");
    document.removeEventListener("keydown", this._boundKeydown);
  }

  /** Toggle open/closed. */
  toggle() {
    this._open ? this.close() : this.open();
  }

  // -------------------------------------------------------------------------
  // DOM construction
  // -------------------------------------------------------------------------

  _ensureStyles() {
    if (this._styleInjected) return;
    const el = document.createElement("style");
    el.id = "theme-picker-styles";
    el.textContent = PICKER_CSS;
    document.head.appendChild(el);
    this._styleInjected = true;
  }

  _ensureDOM() {
    if (this._overlay) return;

    // Overlay
    const overlay = document.createElement("div");
    overlay.id = "cw-theme-picker-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Choose Your World Theme");
    overlay.addEventListener("click", this._boundOverlayClick);

    // Modal container
    const container = document.createElement("div");
    container.id = "cw-theme-picker";

    // Header
    container.appendChild(this._buildHeader());

    // Theme list
    const list = document.createElement("div");
    list.className = "cw-tp-list";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", "Themes");

    const themes = this._engine.list();
    themes.forEach((theme, idx) => {
      list.appendChild(this._buildCard(theme, idx));
    });

    container.appendChild(list);
    container.appendChild(this._buildFooter());

    overlay.appendChild(container);
    document.body.appendChild(overlay);

    this._overlay = overlay;
    this._container = container;
  }

  _buildHeader() {
    const header = document.createElement("div");
    header.className = "cw-tp-header";

    const icon = document.createElement("span");
    icon.className = "cw-tp-header-icon";
    icon.textContent = "🎨";

    const text = document.createElement("div");
    text.className = "cw-tp-header-text";

    const title = document.createElement("div");
    title.className = "cw-tp-header-title";
    title.textContent = "Choose Your World Theme";

    const subtitle = document.createElement("div");
    subtitle.className = "cw-tp-header-subtitle";
    subtitle.textContent = "Live preview on hover — click to apply";

    text.appendChild(title);
    text.appendChild(subtitle);

    const closeBtn = document.createElement("button");
    closeBtn.className = "cw-tp-close-btn";
    closeBtn.setAttribute("aria-label", "Close theme picker");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => this.close());

    header.appendChild(icon);
    header.appendChild(text);
    header.appendChild(closeBtn);

    return header;
  }

  _buildCard(theme, idx) {
    const card = document.createElement("div");
    card.className = "cw-tp-card";
    card.setAttribute("role", "option");
    card.setAttribute("tabindex", "-1");
    card.setAttribute(
      "aria-selected",
      this._engine.getCurrent() === theme.id ? "true" : "false",
    );
    card.dataset.themeId = theme.id;
    card.dataset.idx = idx;

    if (this._engine.getCurrent() === theme.id) {
      card.classList.add("cw-tp-active");
    }

    // Emoji
    const emoji = document.createElement("span");
    emoji.className = "cw-tp-card-emoji";
    emoji.textContent = theme.emoji;

    // Body
    const body = document.createElement("div");
    body.className = "cw-tp-card-body";

    const name = document.createElement("div");
    name.className = "cw-tp-card-name";
    name.textContent = theme.name;

    const desc = document.createElement("div");
    desc.className = "cw-tp-card-desc";
    desc.textContent = theme.description;

    // Swatches
    const swatchRow = document.createElement("div");
    swatchRow.className = "cw-tp-swatches";

    const swatchColors = this._getSwatchColors(theme);
    swatchColors.forEach((color) => {
      const swatch = document.createElement("span");
      swatch.className = "cw-tp-swatch";
      swatch.style.background = color;
      if (this._isLight(color)) {
        swatch.style.borderColor = "rgba(0,0,0,0.15)";
      }
      swatchRow.appendChild(swatch);
    });

    body.appendChild(name);
    body.appendChild(desc);
    body.appendChild(swatchRow);

    card.appendChild(emoji);
    card.appendChild(body);

    // Active badge
    if (this._engine.getCurrent() === theme.id) {
      card.appendChild(this._buildBadge());
    }

    // Events
    card.addEventListener("mouseenter", () => this._onCardHover(theme.id));
    card.addEventListener("mouseleave", () => this._onCardUnhover());
    card.addEventListener("click", () => this._applyTheme(theme.id));
    card.addEventListener("focus", () => {
      this._focusedIndex = idx;
      this._updateFocusHighlight();
    });

    return card;
  }

  _buildBadge() {
    const badge = document.createElement("div");
    badge.className = "cw-tp-badge";

    const dot = document.createElement("span");
    dot.className = "cw-tp-badge-dot";

    badge.appendChild(dot);
    badge.appendChild(document.createTextNode("Active"));
    return badge;
  }

  _buildFooter() {
    const footer = document.createElement("div");
    footer.className = "cw-tp-footer";

    const hints = [
      { keys: ["↑", "↓"], label: "navigate" },
      { keys: ["↵"], label: "apply" },
      { keys: ["Esc"], label: "close" },
    ];

    hints.forEach(({ keys, label }) => {
      const hint = document.createElement("span");
      hint.className = "cw-tp-hint";

      keys.forEach((k) => {
        const key = document.createElement("kbd");
        key.className = "cw-tp-key";
        key.textContent = k;
        hint.appendChild(key);
      });

      const labelNode = document.createTextNode(" " + label);
      hint.appendChild(labelNode);
      footer.appendChild(hint);
    });

    return footer;
  }

  // -------------------------------------------------------------------------
  // Interaction
  // -------------------------------------------------------------------------

  _onCardHover(themeId) {
    if (themeId === this._engine.getCurrent()) return;
    this._hoverTheme = themeId;
    this._engine.apply(themeId);
  }

  _onCardUnhover() {
    if (this._hoverTheme !== null) {
      // Revert to committed theme
      this._engine.apply(this._engine.getCurrent());
      this._hoverTheme = null;
    }
  }

  _applyTheme(themeId) {
    this._hoverTheme = null;
    // Commit the current theme selection
    const previousCurrent = this._engine.getCurrent();
    this._engine.apply(themeId);

    // Rebuild cards to reflect new active state
    this._syncCards();
    this.close();
  }

  _onKeydown(e) {
    if (!this._open) return;

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        this.close();
        break;

      case "ArrowDown":
        e.preventDefault();
        this._moveFocus(1);
        break;

      case "ArrowUp":
        e.preventDefault();
        this._moveFocus(-1);
        break;

      case "Enter": {
        e.preventDefault();
        const ids = this._getThemeIds();
        if (ids[this._focusedIndex]) {
          this._applyTheme(ids[this._focusedIndex]);
        }
        break;
      }

      default:
        break;
    }
  }

  _onOverlayClick(e) {
    // Close if clicking outside the modal container
    if (e.target === this._overlay) {
      this.close();
    }
  }

  _moveFocus(delta) {
    const ids = this._getThemeIds();
    this._focusedIndex = (this._focusedIndex + delta + ids.length) % ids.length;
    this._updateFocusHighlight();

    // Live preview focused theme while navigating with keyboard
    const themeId = ids[this._focusedIndex];
    if (themeId && themeId !== this._engine.getCurrent()) {
      this._hoverTheme = themeId;
      this._engine.apply(themeId);
    }
  }

  _updateFocusHighlight() {
    if (!this._container) return;
    const cards = this._container.querySelectorAll(".cw-tp-card");
    cards.forEach((card, idx) => {
      card.classList.toggle("cw-tp-focused", idx === this._focusedIndex);
    });

    // Scroll focused card into view smoothly
    const focusedCard = cards[this._focusedIndex];
    if (focusedCard) {
      focusedCard.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Rebuild card states (active badge, aria-selected) without full re-render. */
  _syncCards() {
    if (!this._container) return;
    const current = this._engine.getCurrent();
    const cards = this._container.querySelectorAll(".cw-tp-card");

    cards.forEach((card) => {
      const id = card.dataset.themeId;
      const isActive = id === current;

      card.classList.toggle("cw-tp-active", isActive);
      card.setAttribute("aria-selected", isActive ? "true" : "false");

      // Remove existing badge
      const existingBadge = card.querySelector(".cw-tp-badge");
      if (existingBadge) existingBadge.remove();

      // Add badge if active
      if (isActive) {
        card.appendChild(this._buildBadge());
      }
    });
  }

  _getThemeIds() {
    return this._engine.list().map((t) => t.id);
  }

  /**
   * Pick 5 representative swatch colors from a theme.
   * @param {object} theme
   * @returns {string[]}
   */
  _getSwatchColors(theme) {
    const c = theme.colors;
    return [
      c["--cw-bg"],
      c["--cw-panel"] || c["--cw-card"],
      c["--cw-accent"],
      c["--cw-accent-2"],
      c["--cw-text"],
    ].filter(Boolean);
  }

  /**
   * Rough luminance check to decide swatch border color.
   * @param {string} hex
   * @returns {boolean}
   */
  _isLight(hex) {
    if (!hex || !hex.startsWith("#")) return false;
    const h = hex.replace("#", "");
    if (h.length < 6) return false;
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    // Perceived luminance
    return r * 0.299 + g * 0.587 + b * 0.114 > 180;
  }
}

// ---------------------------------------------------------------------------
// Keyboard shortcut registration
// ---------------------------------------------------------------------------

/**
 * Create a ThemePicker and wire up keyboard shortcuts + command palette support.
 * @param {import('../systems/themes').ThemeEngine} engine
 * @returns {ThemePicker}
 */
export function initThemePicker(engine) {
  const picker = new ThemePicker(engine);

  // Cmd+Shift+T (macOS) / Ctrl+Shift+T (other)
  document.addEventListener("keydown", (e) => {
    const isMac = navigator.platform.toUpperCase().includes("MAC");
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (mod && e.shiftKey && e.key === "T") {
      e.preventDefault();
      picker.toggle();
    }
  });

  // Command palette integration: listen for '/theme' command event
  document.addEventListener("command:theme", () => picker.open());

  // Also support a generic palette dispatch format
  document.addEventListener("palette:command", (e) => {
    if (e.detail && e.detail.command === "/theme") {
      picker.open();
    }
  });

  return picker;
}
