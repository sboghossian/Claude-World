/**
 * TutorialEngine — Interactive guided-tour system for Claude World
 *
 * Provides step-by-step tutorials for each zone/feature, with spotlight
 * effects, tooltips, and progress tracking via localStorage.
 *
 * Usage:
 *   import { TutorialEngine } from './tutorial.js';
 *   const tutorial = new TutorialEngine();
 *   tutorial.start('getting-started');
 */

import { TutorialOverlay } from "../ui/tutorial-overlay.js";

// ── localStorage key prefix ────────────────────────────────────────
const LS_PREFIX = "cw:tutorial:";

// ── Tutorial Definitions ───────────────────────────────────────────

const TUTORIALS = {
  // ─── Getting Started (5 steps) ──────────────────────────────────
  "getting-started": {
    id: "getting-started",
    title: "Getting Started",
    icon: "🚀",
    description: "Learn the basics of navigating Claude World.",
    steps: [
      {
        target: ".hud-tc",
        text: "This is your HUD — it shows your world name, the current time, and which zone you're viewing. Keep an eye on it as you explore.",
        position: "bottom",
        action: null,
      },
      {
        target: ".hud-cmdk",
        text: "Press ⌘K (or click here) to open the Command Palette. It's the fastest way to do anything — search zones, run tasks, change settings.",
        position: "bottom-left",
        action: { type: "event", event: "command-palette:open" },
      },
      {
        target: ".hud-minimap",
        text: "Click any dot on the minimap to navigate to that zone. Gold dot = your current location. Colored dots = active zones.",
        position: "left",
        action: { type: "event", event: "hud:navigate" },
      },
      {
        target: '[data-zone="dispatch"], .zone-dispatch, .hud-minimap',
        text: 'Let\'s dispatch your first task. Click the Dispatch zone on the map or use ⌘K and type "dispatch".',
        position: "bottom",
        action: {
          type: "event",
          event: "zone:open",
          match: { zone: "dispatch" },
        },
      },
      {
        target: ".hud-bell",
        text: "Notifications appear here. Click the bell to see task results, system alerts, and agent updates. You're all set!",
        position: "left",
        action: null,
      },
    ],
  },

  // ─── Dispatch Tutorial (4 steps) ────────────────────────────────
  dispatch: {
    id: "dispatch",
    title: "Dispatch Tutorial",
    icon: "⚡",
    description: "Learn how to create, configure, and run tasks.",
    steps: [
      {
        target:
          ".dispatch-input, .panel-dispatch .panel-body textarea, .dispatch-panel",
        text: "Type your task here. Be specific — describe what you want your agents to accomplish.",
        position: "bottom",
        action: null,
      },
      {
        target:
          ".model-selector, .dispatch-model-select, .panel-dispatch .model-picker",
        text: "Choose which AI model to use. Different models have different strengths — speed vs. depth.",
        position: "bottom",
        action: null,
      },
      {
        target:
          '.dispatch-run-btn, .dispatch-send, .panel-dispatch button[type="submit"]',
        text: "Hit Run to dispatch the task. Your agent will pick it up and start working immediately.",
        position: "top",
        action: { type: "event", event: "task:dispatched" },
      },
      {
        target: ".task-result, .dispatch-result, .panel-dispatch .result-area",
        text: "Results appear here once the agent finishes. You can copy, save to Brain, or dispatch a follow-up.",
        position: "top",
        action: null,
      },
    ],
  },

  // ─── Brain Library (3 steps) ────────────────────────────────────
  brain: {
    id: "brain",
    title: "Brain Library",
    icon: "🧠",
    description: "Store and retrieve knowledge for your world.",
    steps: [
      {
        target: ".brain-add, .panel-brain .add-btn, .brain-panel .brain-input",
        text: "Add knowledge to the Brain. Paste text, URLs, or notes — your agents can reference this when working on tasks.",
        position: "bottom",
        action: null,
      },
      {
        target:
          '.brain-search, .panel-brain input[type="search"], .brain-panel .search-bar',
        text: "Search your stored knowledge instantly. The Brain uses semantic search to find relevant memories.",
        position: "bottom",
        action: null,
      },
      {
        target: ".brain-list, .panel-brain .memory-list, .brain-panel .entries",
        text: "Browse all your memories here. Click any entry to view, edit, or delete it.",
        position: "top",
        action: null,
      },
    ],
  },

  // ─── Zone Explorer (4 steps) ────────────────────────────────────
  "zone-explorer": {
    id: "zone-explorer",
    title: "Zone Explorer",
    icon: "🗺️",
    description: "Master navigation and zone management.",
    steps: [
      {
        target: ".hud-minimap__canvas",
        text: "The minimap is your bird's-eye view. Each dot is a zone — hover to see its name, click to navigate there.",
        position: "left",
        action: null,
      },
      {
        target: ".zone-tooltip, .building-tooltip, canvas",
        text: "Hover over buildings on the main canvas to see zone tooltips with status information.",
        position: "top",
        action: null,
      },
      {
        target: ".panel-header, .zone-panel, .panel",
        text: "Click a zone to open its panel. Each zone has its own interface — dispatch, brain, chat, and more.",
        position: "right",
        action: { type: "event", event: "zone-panel:open" },
      },
      {
        target: ".hud-tr, .hud-xp-row",
        text: "Track your progress here — XP, level, and budget. Completing tasks earns XP and unlocks new zones.",
        position: "bottom-left",
        action: null,
      },
    ],
  },
};

// ── Sentinel for skipping ──────────────────────────────────────────
const SKIP_SIGNAL = Symbol("TUTORIAL_SKIP");

// ── TutorialEngine ─────────────────────────────────────────────────

export class TutorialEngine {
  constructor() {
    /** @type {TutorialOverlay|null} */
    this._overlay = null;

    /** @type {string|null} Current tutorial id */
    this._activeTutorialId = null;

    /** @type {number} Current step index */
    this._stepIndex = -1;

    /** @type {boolean} True while a tutorial is active */
    this._running = false;

    /** @type {Function|null} Bound handler for action-matching events */
    this._actionListener = null;

    /** @type {Function|null} Resolve function for awaiting an action */
    this._actionResolve = null;

    /** @type {boolean} */
    this._cssLoaded = false;

    this._ensureCSS();
  }

  // ─── Public API ──────────────────────────────────────────────────

  /**
   * Start a tutorial by id.
   * @param {string} tutorialId — one of 'getting-started', 'dispatch', 'brain', 'zone-explorer'
   */
  async start(tutorialId) {
    const tutorial = TUTORIALS[tutorialId];
    if (!tutorial) {
      console.warn(`[TutorialEngine] Unknown tutorial: "${tutorialId}"`);
      return;
    }

    // Stop any currently running tutorial
    if (this._running) {
      this.stop();
    }

    this._activeTutorialId = tutorialId;
    this._stepIndex = -1;
    this._running = true;

    // Create the overlay
    this._overlay = new TutorialOverlay();

    // Wire overlay navigation callbacks
    this._overlay.onNext = () => this._advance();
    this._overlay.onBack = () => this._goBack();
    this._overlay.onSkip = () => this.stop();

    this._emit("tutorial:start", { tutorialId, title: tutorial.title });

    // Begin at step 0
    await this._advance();
  }

  /**
   * Stop the current tutorial (skip / complete).
   */
  stop() {
    if (!this._running) return;

    const tutorialId = this._activeTutorialId;
    const tutorial = TUTORIALS[tutorialId];
    const wasLastStep =
      tutorial && this._stepIndex >= tutorial.steps.length - 1;

    this._running = false;
    this._clearActionListener();

    if (this._actionResolve) {
      this._actionResolve(SKIP_SIGNAL);
      this._actionResolve = null;
    }

    if (this._overlay) {
      this._overlay.destroy();
      this._overlay = null;
    }

    // If the user viewed all steps, mark complete
    if (wasLastStep) {
      this._markComplete(tutorialId);
      this._emit("tutorial:complete", { tutorialId });
    } else {
      this._emit("tutorial:skip", { tutorialId, stepIndex: this._stepIndex });
    }

    this._activeTutorialId = null;
    this._stepIndex = -1;
  }

  /**
   * Check if a tutorial has been completed.
   * @param {string} tutorialId
   * @returns {boolean}
   */
  isComplete(tutorialId) {
    return localStorage.getItem(LS_PREFIX + tutorialId) === "1";
  }

  /**
   * Get all available tutorials with completion status.
   * @returns {Array<{id: string, title: string, icon: string, description: string, complete: boolean}>}
   */
  getAvailable() {
    return Object.values(TUTORIALS).map((t) => ({
      id: t.id,
      title: t.title,
      icon: t.icon,
      description: t.description,
      complete: this.isComplete(t.id),
    }));
  }

  /**
   * Reset completion status for a specific tutorial (for replay).
   * @param {string} tutorialId
   */
  reset(tutorialId) {
    localStorage.removeItem(LS_PREFIX + tutorialId);
  }

  /**
   * Reset all tutorials.
   */
  resetAll() {
    for (const id of Object.keys(TUTORIALS)) {
      localStorage.removeItem(LS_PREFIX + id);
    }
  }

  /** @returns {boolean} True if a tutorial is currently running. */
  get running() {
    return this._running;
  }

  /** @returns {string|null} The id of the currently active tutorial. */
  get activeTutorialId() {
    return this._activeTutorialId;
  }

  // ─── Navigation ──────────────────────────────────────────────────

  /**
   * Advance to the next step.
   * @private
   */
  async _advance() {
    if (!this._running) return;

    const tutorial = TUTORIALS[this._activeTutorialId];
    if (!tutorial) return;

    this._clearActionListener();

    this._stepIndex++;

    // Tutorial finished
    if (this._stepIndex >= tutorial.steps.length) {
      this.stop();
      return;
    }

    await this._showCurrentStep();
  }

  /**
   * Go back to the previous step.
   * @private
   */
  async _goBack() {
    if (!this._running) return;
    if (this._stepIndex <= 0) return;

    this._clearActionListener();
    this._stepIndex--;

    await this._showCurrentStep();
  }

  /**
   * Show the current step in the overlay.
   * @private
   */
  async _showCurrentStep() {
    const tutorial = TUTORIALS[this._activeTutorialId];
    if (!tutorial || !this._overlay) return;

    const stepDef = tutorial.steps[this._stepIndex];
    const totalSteps = tutorial.steps.length;

    // Resolve target element
    const targetEl = this._resolveTarget(stepDef.target);

    // Build step object for the overlay
    const step = {
      targetEl,
      text: stepDef.text,
      position: stepDef.position || "bottom",
      stepIndex: this._stepIndex,
      totalSteps,
      isFirst: this._stepIndex === 0,
      isLast: this._stepIndex === totalSteps - 1,
      hasAction: !!stepDef.action,
    };

    this._overlay.showStep(step);

    this._emit("tutorial:step", {
      tutorialId: this._activeTutorialId,
      stepIndex: this._stepIndex,
      totalSteps,
    });

    // If this step has an action trigger, listen for it
    if (stepDef.action) {
      this._listenForAction(stepDef.action);
    }
  }

  // ─── Target Resolution ───────────────────────────────────────────

  /**
   * Try multiple comma-separated selectors and return the first match.
   * @param {string} selectorList
   * @returns {HTMLElement|null}
   * @private
   */
  _resolveTarget(selectorList) {
    if (!selectorList) return null;

    const selectors = selectorList.split(",").map((s) => s.trim());
    for (const sel of selectors) {
      try {
        const el = document.querySelector(sel);
        if (el) return el;
      } catch {
        // Invalid selector — skip
      }
    }
    return null;
  }

  // ─── Action Listening ────────────────────────────────────────────

  /**
   * Listen for a DOM event that signals the user completed the step action.
   * Auto-advances when the matching event fires.
   * @param {{ type: string, event: string, match?: object }} actionDef
   * @private
   */
  _listenForAction(actionDef) {
    if (!actionDef || actionDef.type !== "event") return;

    const eventName = actionDef.event;
    const matchCriteria = actionDef.match || null;

    this._actionListener = (e) => {
      // If match criteria given, verify event detail contains matching keys
      if (matchCriteria) {
        const detail = e.detail || {};
        const matches = Object.entries(matchCriteria).every(
          ([key, val]) => detail[key] === val,
        );
        if (!matches) return;
      }

      // Action completed — auto-advance
      this._clearActionListener();

      // Brief delay so the user sees the result of their action
      setTimeout(() => {
        if (this._running) this._advance();
      }, 400);
    };

    // Listen on both document and window (events may bubble to either)
    document.addEventListener(eventName, this._actionListener);
    window.addEventListener(eventName, this._actionListener);
  }

  /**
   * Remove the current action listener.
   * @private
   */
  _clearActionListener() {
    if (!this._actionListener) return;

    // We don't know which event name was used, so remove from both targets.
    // This is safe — removeEventListener is a no-op if the listener isn't registered.
    const tutorial = TUTORIALS[this._activeTutorialId];
    if (
      tutorial &&
      this._stepIndex >= 0 &&
      this._stepIndex < tutorial.steps.length
    ) {
      const action = tutorial.steps[this._stepIndex]?.action;
      if (action?.event) {
        document.removeEventListener(action.event, this._actionListener);
        window.removeEventListener(action.event, this._actionListener);
      }
    }

    this._actionListener = null;
  }

  // ─── Persistence ─────────────────────────────────────────────────

  /**
   * Mark a tutorial as complete in localStorage.
   * @param {string} tutorialId
   * @private
   */
  _markComplete(tutorialId) {
    localStorage.setItem(LS_PREFIX + tutorialId, "1");
  }

  // ─── Event Helpers ───────────────────────────────────────────────

  /**
   * Dispatch a custom event on document.
   * @param {string} name
   * @param {object} detail
   * @private
   */
  _emit(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
  }

  // ─── CSS Injection ───────────────────────────────────────────────

  /**
   * Ensure the tutorial-overlay.css stylesheet is loaded.
   * @private
   */
  _ensureCSS() {
    if (this._cssLoaded) return;
    if (document.querySelector('link[href*="tutorial-overlay"]')) {
      this._cssLoaded = true;
      return;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = new URL("../ui/tutorial-overlay.css", import.meta.url).href;
    document.head.appendChild(link);
    this._cssLoaded = true;
  }
}
