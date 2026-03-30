/**
 * quick-actions.js — Floating quick-actions toolbar for Claude World
 *
 * A circular FAB (Floating Action Button) in the bottom-right that expands
 * into a radial semicircle of 8 action buttons. Each action dispatches
 * custom events following the same pattern as command-palette.js.
 *
 * Actions:
 *   1. New Task       (lightning)   — opens dispatch zone
 *   2. Quick Search   (magnifier)   — opens command palette
 *   3. Take Snapshot  (camera)      — saves world snapshot
 *   4. Toggle Theme   (palette)     — cycles to next theme
 *   5. Quick Note     (pencil)      — opens mini notepad overlay
 *   6. Screenshot     (frame)       — captures canvas as PNG
 *   7. Toggle Audio   (speaker)     — mute/unmute
 *   8. Help           (question)    — starts Getting Started tutorial
 *
 * Export: QuickActions { constructor(); mount(); destroy() }
 */

// ── SVG icon paths (inline, no deps) ────────────────────────────

const ICONS = {
  lightning: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 1L3 12h6l-1 7 8-11h-6l1-7z"/></svg>`,
  magnifier: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="8.5" cy="8.5" r="5.5"/><path d="M13 13l4 4"/></svg>`,
  camera: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 6a1 1 0 011-1h2.5l1.5-2h6l1.5 2H17a1 1 0 011 1v9a1 1 0 01-1 1H3a1 1 0 01-1-1V6z"/><circle cx="10" cy="10.5" r="3"/></svg>`,
  palette: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"/><circle cx="7" cy="8" r="1.2" fill="currentColor"/><circle cx="12" cy="7" r="1.2" fill="currentColor"/><circle cx="14" cy="11" r="1.2" fill="currentColor"/><circle cx="7" cy="12" r="1.2" fill="currentColor"/></svg>`,
  pencil: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2.5l3 3L6 17H3v-3L14.5 2.5z"/></svg>`,
  frame: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="16" height="16" rx="2"/><path d="M2 14l4-4 3 3 4-5 5 6"/></svg>`,
  speaker: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h3l4-4v12l-4-4H3V8z"/><path d="M14 7a4 4 0 010 6"/><path d="M16.5 5a7 7 0 010 10"/></svg>`,
  speakerOff: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h3l4-4v12l-4-4H3V8z"/><path d="M14 7l4 6m0-6l-4 6"/></svg>`,
  question: `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"/><path d="M7.5 7.5a2.5 2.5 0 014.5 1.5c0 1.5-2 2-2 3.5"/><circle cx="10" cy="15" r="0.5" fill="currentColor"/></svg>`,
  plus: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
};

// ── Action definitions ──────────────────────────────────────────

const ACTIONS = [
  {
    id: "new-task",
    label: "New Task",
    icon: "lightning",
    toggle: false,
  },
  {
    id: "quick-search",
    label: "Quick Search",
    icon: "magnifier",
    toggle: false,
  },
  {
    id: "take-snapshot",
    label: "Take Snapshot",
    icon: "camera",
    toggle: false,
  },
  {
    id: "toggle-theme",
    label: "Toggle Theme",
    icon: "palette",
    toggle: true,
  },
  {
    id: "quick-note",
    label: "Quick Note",
    icon: "pencil",
    toggle: false,
  },
  {
    id: "screenshot",
    label: "Screenshot",
    icon: "frame",
    toggle: false,
  },
  {
    id: "toggle-audio",
    label: "Toggle Audio",
    icon: "speaker",
    toggle: true,
  },
  {
    id: "help",
    label: "Help",
    icon: "question",
    toggle: false,
  },
];

// ── Radial layout constants ─────────────────────────────────────
// Semicircle spreading upward-left from the FAB center.
// Angle range: 180deg (left) to 360deg / 0deg (top).

const RADIAL_RADIUS = 90;
const START_ANGLE = 190; // degrees — just past left
const END_ANGLE = 350; // degrees — just before top-right
const ITEM_COUNT = ACTIONS.length;

// ── Utility ─────────────────────────────────────────────────────

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

// ── Main class ──────────────────────────────────────────────────

export class QuickActions {
  constructor() {
    /** @type {boolean} */
    this._open = false;

    /** @type {boolean} */
    this._audioMuted = false;

    /** @type {boolean} */
    this._themeActive = false;

    /** @type {boolean} */
    this._notepadVisible = false;

    /** @type {HTMLElement[]} */
    this._actionBtns = [];

    /** @type {number|null} */
    this._saveTimeout = null;

    // Build DOM
    this._createFAB();
    this._createRadialMenu();
    this._createBackdrop();
    this._createNotepad();

    // Bind events
    this._bindEvents();
  }

  // ══════════════════════════════════════════════════════════════
  // DOM creation
  // ══════════════════════════════════════════════════════════════

  _createFAB() {
    this._fab = el("button", "qa-fab");
    this._fab.setAttribute("aria-label", "Quick actions");
    this._fab.innerHTML = ICONS.plus;

    this._fab.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggle();
    });
  }

  _createRadialMenu() {
    this._radial = el("div", "qa-radial");

    ACTIONS.forEach((action, idx) => {
      const btn = el("button", "qa-action");
      btn.setAttribute("aria-label", action.label);
      btn.setAttribute("data-action", action.id);
      btn.innerHTML = ICONS[action.icon];

      // Add toggle modifier classes
      if (action.id === "toggle-theme") btn.classList.add("qa-action--theme");

      // Calculate position on the semicircle
      const angleStep = (END_ANGLE - START_ANGLE) / (ITEM_COUNT - 1);
      const angle = START_ANGLE + angleStep * idx;
      const rad = degToRad(angle);
      const x = Math.cos(rad) * RADIAL_RADIUS;
      const y = Math.sin(rad) * RADIAL_RADIUS;

      // Store the expanded position as a CSS custom property for hover scaling
      const expandedTransform = `translate(${x}px, ${y}px)`;
      btn.style.setProperty("--qa-expanded-pos", expandedTransform);
      btn.dataset.expandX = x;
      btn.dataset.expandY = y;

      // Tooltip
      const tooltip = el("span", "qa-tooltip", action.label);
      btn.appendChild(tooltip);

      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this._handleAction(action.id);
      });

      this._actionBtns.push(btn);
      this._radial.appendChild(btn);
    });
  }

  _createBackdrop() {
    this._backdrop = el("div", "qa-backdrop");
    this._backdrop.addEventListener("click", () => {
      this._close();
    });
  }

  _createNotepad() {
    this._notepad = el("div", "qa-notepad");

    // Header
    const header = el("div", "qa-notepad__header");
    const title = el("span", "qa-notepad__title", "Quick Note");
    this._notepadClose = el("button", "qa-notepad__close", "\u00D7");
    this._notepadClose.setAttribute("aria-label", "Close notepad");
    this._notepadClose.addEventListener("click", () =>
      this._toggleNotepad(false),
    );
    header.appendChild(title);
    header.appendChild(this._notepadClose);

    // Textarea
    this._textarea = document.createElement("textarea");
    this._textarea.className = "qa-notepad__textarea";
    this._textarea.placeholder = "Jot down a quick note...";
    this._textarea.spellcheck = false;

    // Load saved content
    const saved = localStorage.getItem("claude-world:quick-note");
    if (saved) this._textarea.value = saved;

    // Auto-save on input
    this._textarea.addEventListener("input", () => {
      this._scheduleSave();
      this._updateCharCount();
    });

    // Footer
    const footer = el("div", "qa-notepad__footer");
    this._charCount = el("span", "qa-notepad__charcount", "0 chars");
    this._savedIndicator = el("span", "qa-notepad__saved", "Saved");
    footer.appendChild(this._charCount);
    footer.appendChild(this._savedIndicator);

    this._notepad.appendChild(header);
    this._notepad.appendChild(this._textarea);
    this._notepad.appendChild(footer);

    this._updateCharCount();
  }

  // ══════════════════════════════════════════════════════════════
  // Mount / Destroy
  // ══════════════════════════════════════════════════════════════

  /**
   * Append all quick-action DOM elements to the document body.
   */
  mount() {
    document.body.appendChild(this._backdrop);
    document.body.appendChild(this._radial);
    document.body.appendChild(this._fab);
    document.body.appendChild(this._notepad);
  }

  /**
   * Remove all DOM elements and clean up listeners.
   */
  destroy() {
    this._close();
    this._toggleNotepad(false);

    document.removeEventListener("keydown", this._onKeyDown);

    if (this._saveTimeout) clearTimeout(this._saveTimeout);

    this._fab.remove();
    this._radial.remove();
    this._backdrop.remove();
    this._notepad.remove();
  }

  // ══════════════════════════════════════════════════════════════
  // Open / Close / Toggle
  // ══════════════════════════════════════════════════════════════

  _toggle() {
    if (this._open) {
      this._close();
    } else {
      this._openMenu();
    }
  }

  _openMenu() {
    if (this._open) return;
    this._open = true;

    this._fab.classList.add("qa-fab--open");
    this._backdrop.classList.add("qa-backdrop--visible");
    this._radial.classList.add("qa-radial--open");

    // Apply expanded transforms to each button
    this._actionBtns.forEach((btn) => {
      const x = parseFloat(btn.dataset.expandX);
      const y = parseFloat(btn.dataset.expandY);
      btn.style.transform = `translate(${x}px, ${y}px) scale(1)`;
    });
  }

  _close() {
    if (!this._open) return;
    this._open = false;

    this._fab.classList.remove("qa-fab--open");
    this._backdrop.classList.remove("qa-backdrop--visible");
    this._radial.classList.remove("qa-radial--open");

    // Reset transforms to center
    this._actionBtns.forEach((btn) => {
      btn.style.transform = "translate(0, 0) scale(0.3)";
    });
  }

  // ══════════════════════════════════════════════════════════════
  // Action handlers
  // ══════════════════════════════════════════════════════════════

  _handleAction(actionId) {
    switch (actionId) {
      case "new-task":
        this._close();
        document.dispatchEvent(
          new CustomEvent("command-palette:navigate", {
            detail: { zoneId: "dispatch", zoneName: "Dispatch Tower" },
            bubbles: true,
          }),
        );
        break;

      case "quick-search":
        this._close();
        document.dispatchEvent(
          new CustomEvent("command-palette:open", {
            bubbles: true,
          }),
        );
        break;

      case "take-snapshot": {
        this._close();
        const label = `snapshot-${new Date().toISOString().slice(0, 19).replace("T", "_")}`;
        document.dispatchEvent(
          new CustomEvent("command-palette:action", {
            detail: { action: "snapshot", label },
            bubbles: true,
          }),
        );
        document.dispatchEvent(
          new CustomEvent("toast:show", {
            detail: { type: "success", title: "Snapshot saved", body: label },
            bubbles: true,
          }),
        );
        break;
      }

      case "toggle-theme":
        this._themeActive = !this._themeActive;
        this._updateToggleState("toggle-theme", this._themeActive);
        document.dispatchEvent(
          new CustomEvent("command-palette:action", {
            detail: { action: "cycle-theme" },
            bubbles: true,
          }),
        );
        break;

      case "quick-note":
        this._close();
        this._toggleNotepad(!this._notepadVisible);
        break;

      case "screenshot":
        this._close();
        this._captureScreenshot();
        break;

      case "toggle-audio":
        this._audioMuted = !this._audioMuted;
        this._updateToggleState("toggle-audio", this._audioMuted);
        this._updateAudioIcon();
        document.dispatchEvent(
          new CustomEvent("command-palette:action", {
            detail: { action: "toggle-audio", muted: this._audioMuted },
            bubbles: true,
          }),
        );
        break;

      case "help":
        this._close();
        document.dispatchEvent(
          new CustomEvent("tutorial:start", {
            detail: { tutorialId: "getting-started" },
            bubbles: true,
          }),
        );
        break;
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Toggle state visuals
  // ══════════════════════════════════════════════════════════════

  _updateToggleState(actionId, active) {
    const btn = this._actionBtns.find((b) => b.dataset.action === actionId);
    if (btn) {
      btn.classList.toggle("qa-action--active", active);
    }
  }

  _updateAudioIcon() {
    const btn = this._actionBtns.find(
      (b) => b.dataset.action === "toggle-audio",
    );
    if (!btn) return;

    // Replace SVG but keep tooltip
    const tooltip = btn.querySelector(".qa-tooltip");
    btn.innerHTML = this._audioMuted ? ICONS.speakerOff : ICONS.speaker;
    if (tooltip) btn.appendChild(tooltip);
  }

  // ══════════════════════════════════════════════════════════════
  // Screenshot capture
  // ══════════════════════════════════════════════════════════════

  _captureScreenshot() {
    const canvas = document.querySelector("canvas");
    if (!canvas) {
      document.dispatchEvent(
        new CustomEvent("toast:show", {
          detail: { type: "error", title: "No canvas found" },
          bubbles: true,
        }),
      );
      return;
    }

    try {
      const dataURL = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/:/g, "-");
      link.download = `claude-world-${timestamp}.png`;
      link.href = dataURL;
      link.click();

      document.dispatchEvent(
        new CustomEvent("toast:show", {
          detail: {
            type: "success",
            title: "Screenshot saved",
            body: link.download,
          },
          bubbles: true,
        }),
      );
    } catch (err) {
      document.dispatchEvent(
        new CustomEvent("toast:show", {
          detail: {
            type: "error",
            title: "Screenshot failed",
            body: err.message,
          },
          bubbles: true,
        }),
      );
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Mini Notepad
  // ══════════════════════════════════════════════════════════════

  _toggleNotepad(visible) {
    this._notepadVisible = visible;
    this._notepad.classList.toggle("qa-notepad--visible", visible);

    if (visible) {
      // Focus textarea after CSS transition settles
      requestAnimationFrame(() => this._textarea.focus());
    }
  }

  _scheduleSave() {
    if (this._saveTimeout) clearTimeout(this._saveTimeout);

    this._savedIndicator.classList.remove("qa-notepad__saved--visible");

    this._saveTimeout = setTimeout(() => {
      localStorage.setItem("claude-world:quick-note", this._textarea.value);
      this._savedIndicator.classList.add("qa-notepad__saved--visible");

      setTimeout(() => {
        this._savedIndicator.classList.remove("qa-notepad__saved--visible");
      }, 1500);
    }, 400);
  }

  _updateCharCount() {
    const len = this._textarea.value.length;
    this._charCount.textContent = `${len} char${len !== 1 ? "s" : ""}`;
  }

  // ══════════════════════════════════════════════════════════════
  // Event binding
  // ══════════════════════════════════════════════════════════════

  _bindEvents() {
    this._onKeyDown = (e) => {
      if (e.key === "Escape") {
        if (this._notepadVisible) {
          this._toggleNotepad(false);
          e.stopPropagation();
          return;
        }
        if (this._open) {
          this._close();
          e.stopPropagation();
        }
      }
    };

    document.addEventListener("keydown", this._onKeyDown);
  }
}
