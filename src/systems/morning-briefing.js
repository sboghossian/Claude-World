/**
 * morning-briefing.js — Morning Briefing System for Claude World
 *
 * Displays a one-per-day briefing panel from the Commander agent when
 * the app first opens. Collects stats from the previous day and presents
 * a greeting, summary cards, and a "Today's Focus" suggestion.
 *
 * The briefing date is tracked in localStorage so it only fires once
 * per calendar day, regardless of how many times the app is restarted.
 *
 * Usage:
 *   import { MorningBriefing } from './morning-briefing.js';
 *   const briefing = new MorningBriefing();
 *   briefing.tryShow();
 */

// ── Constants ───────────────────────────────────────────────────────

const STORAGE_KEY = "claude-world:last-briefing-date";

/** Greeting by time of day */
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Format a date as YYYY-MM-DD */
function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

// ── MorningBriefing class ───────────────────────────────────────────

export class MorningBriefing {
  /**
   * @param {Object} [options]
   * @param {() => BriefingStats} [options.getStats] - Function to collect stats
   * @param {() => QuestInfo|null} [options.getActiveQuest] - Function to get current quest
   */
  constructor(options = {}) {
    this._getStats = options.getStats || MorningBriefing._defaultStats;
    this._getActiveQuest =
      options.getActiveQuest || MorningBriefing._defaultQuest;

    /** @type {HTMLElement|null} */
    this._overlay = null;

    /** @type {boolean} */
    this._shown = false;
  }

  // ── Public API ─────────────────────────────────────────────────────

  /**
   * Try to show the briefing. Only shows once per calendar day.
   * @returns {boolean} Whether the briefing was shown
   */
  tryShow() {
    if (this._hasShownToday()) {
      return false;
    }

    const stats = this._getStats();
    const quest = this._getActiveQuest();
    this._render(stats, quest);
    this._markShown();
    return true;
  }

  /**
   * Force-show the briefing regardless of whether it has been shown today.
   * Useful for testing.
   */
  forceShow() {
    const stats = this._getStats();
    const quest = this._getActiveQuest();
    this._render(stats, quest);
  }

  /**
   * Dismiss and destroy the briefing panel.
   */
  dismiss() {
    if (this._overlay) {
      this._overlay.classList.add("briefing--closing");

      // Wait for CSS transition to finish
      setTimeout(() => {
        if (this._overlay && this._overlay.parentNode) {
          this._overlay.parentNode.removeChild(this._overlay);
        }
        this._overlay = null;
        this._shown = false;

        // Emit event
        if (typeof document !== "undefined") {
          document.dispatchEvent(
            new CustomEvent("briefing:shown", { bubbles: true }),
          );
        }
      }, 300);
    }
  }

  /**
   * Destroy the briefing and clean up.
   */
  destroy() {
    if (this._overlay && this._overlay.parentNode) {
      this._overlay.parentNode.removeChild(this._overlay);
    }
    this._overlay = null;
  }

  // ── Date tracking ──────────────────────────────────────────────────

  /**
   * Check if the briefing has already been shown today.
   * @returns {boolean}
   * @private
   */
  _hasShownToday() {
    try {
      const lastDate = localStorage.getItem(STORAGE_KEY);
      return lastDate === dateKey();
    } catch {
      // localStorage unavailable
      return false;
    }
  }

  /**
   * Mark today's briefing as shown.
   * @private
   */
  _markShown() {
    try {
      localStorage.setItem(STORAGE_KEY, dateKey());
    } catch {
      // localStorage unavailable
    }
  }

  // ── Rendering ──────────────────────────────────────────────────────

  /**
   * Render the briefing panel into the DOM.
   * @param {BriefingStats} stats
   * @param {QuestInfo|null} quest
   * @private
   */
  _render(stats, quest) {
    // Remove existing if any
    this.destroy();

    // Overlay
    this._overlay = document.createElement("div");
    this._overlay.className = "briefing-overlay";
    this._overlay.setAttribute("role", "dialog");
    this._overlay.setAttribute("aria-label", "Morning Briefing");

    // Panel
    const panel = document.createElement("div");
    panel.className = "briefing-panel";

    // ── Commander header ──────────────────────────────────────────
    const header = document.createElement("div");
    header.className = "briefing-header";

    const avatar = document.createElement("div");
    avatar.className = "briefing-avatar";
    avatar.textContent = "\u{1F451}";

    const greeting = document.createElement("div");
    greeting.className = "briefing-greeting";

    const greetTitle = document.createElement("h2");
    greetTitle.className = "briefing-greeting__title";
    greetTitle.textContent = `${getGreeting()}, Commander`;

    const greetSub = document.createElement("p");
    greetSub.className = "briefing-greeting__subtitle";
    greetSub.textContent = this._getDateString();

    greeting.appendChild(greetTitle);
    greeting.appendChild(greetSub);
    header.appendChild(avatar);
    header.appendChild(greeting);
    panel.appendChild(header);

    // ── Stats cards ───────────────────────────────────────────────
    const cardsContainer = document.createElement("div");
    cardsContainer.className = "briefing-cards";

    const cards = [
      {
        label: "Tasks Completed",
        value: `${stats.tasksCompleted}`,
        icon: "\u2713",
        colorClass: "briefing-card--green",
      },
      {
        label: "Cost Yesterday",
        value: `$${stats.costYesterday.toFixed(2)}`,
        icon: "\u{1F4B0}",
        colorClass:
          stats.costYesterday > 5
            ? "briefing-card--amber"
            : "briefing-card--blue",
      },
      {
        label: "Active Agents",
        value: `${stats.activeAgents}`,
        icon: "\u{1F916}",
        colorClass: "briefing-card--blue",
      },
      {
        label: "Zones Unlocked",
        value: `${stats.zonesUnlocked}`,
        icon: "\u{1F5FA}",
        colorClass:
          stats.newZoneUnlocks > 0
            ? "briefing-card--gold"
            : "briefing-card--default",
      },
    ];

    for (const card of cards) {
      const cardEl = document.createElement("div");
      cardEl.className = `briefing-card ${card.colorClass}`;

      const iconEl = document.createElement("span");
      iconEl.className = "briefing-card__icon";
      iconEl.textContent = card.icon;

      const bodyEl = document.createElement("div");
      bodyEl.className = "briefing-card__body";

      const valueEl = document.createElement("div");
      valueEl.className = "briefing-card__value";
      valueEl.textContent = card.value;

      const labelEl = document.createElement("div");
      labelEl.className = "briefing-card__label";
      labelEl.textContent = card.label;

      bodyEl.appendChild(valueEl);
      bodyEl.appendChild(labelEl);
      cardEl.appendChild(iconEl);
      cardEl.appendChild(bodyEl);
      cardsContainer.appendChild(cardEl);
    }

    panel.appendChild(cardsContainer);

    // ── New zone unlocks ─────────────────────────────────────────
    if (stats.newZoneUnlocks > 0 && stats.newZoneNames.length > 0) {
      const unlockSection = document.createElement("div");
      unlockSection.className = "briefing-section";

      const unlockTitle = document.createElement("div");
      unlockTitle.className = "briefing-section__title";
      unlockTitle.textContent = "New Zone Unlocks";
      unlockSection.appendChild(unlockTitle);

      const unlockList = document.createElement("div");
      unlockList.className = "briefing-section__content";
      unlockList.textContent = stats.newZoneNames.join(", ");
      unlockSection.appendChild(unlockList);

      panel.appendChild(unlockSection);
    }

    // ── Today's Focus ────────────────────────────────────────────
    const focusSection = document.createElement("div");
    focusSection.className = "briefing-focus";

    const focusTitle = document.createElement("div");
    focusTitle.className = "briefing-focus__title";
    focusTitle.textContent = "Today's Focus";

    const focusContent = document.createElement("div");
    focusContent.className = "briefing-focus__content";

    if (quest) {
      const questName = document.createElement("div");
      questName.className = "briefing-focus__quest";
      questName.textContent = quest.name;

      const questProgress = document.createElement("div");
      questProgress.className = "briefing-focus__progress";

      const progressBar = document.createElement("div");
      progressBar.className = "briefing-focus__bar";

      const progressFill = document.createElement("div");
      progressFill.className = "briefing-focus__bar-fill";
      progressFill.style.width = `${Math.min(100, quest.progress * 100)}%`;

      progressBar.appendChild(progressFill);
      questProgress.appendChild(progressBar);

      const progressLabel = document.createElement("span");
      progressLabel.className = "briefing-focus__bar-label";
      progressLabel.textContent = `${Math.round(quest.progress * 100)}% complete`;
      questProgress.appendChild(progressLabel);

      // Next step hint
      const nextStep = quest.steps.find((s) => !s.completed);
      if (nextStep) {
        const hint = document.createElement("div");
        hint.className = "briefing-focus__hint";
        hint.textContent = `Next: ${nextStep.label}`;
        focusContent.appendChild(questName);
        focusContent.appendChild(questProgress);
        focusContent.appendChild(hint);
      } else {
        focusContent.appendChild(questName);
        focusContent.appendChild(questProgress);
      }
    } else {
      const noQuest = document.createElement("div");
      noQuest.className = "briefing-focus__empty";
      noQuest.textContent =
        "No active quest. Visit the Dispatch Tower to start one.";
      focusContent.appendChild(noQuest);
    }

    focusSection.appendChild(focusTitle);
    focusSection.appendChild(focusContent);
    panel.appendChild(focusSection);

    // ── Dismiss button ───────────────────────────────────────────
    const footer = document.createElement("div");
    footer.className = "briefing-footer";

    const dismissBtn = document.createElement("button");
    dismissBtn.className = "briefing-dismiss";
    dismissBtn.textContent = "Dismiss";
    dismissBtn.setAttribute("aria-label", "Dismiss briefing");
    dismissBtn.addEventListener("click", () => this.dismiss());

    footer.appendChild(dismissBtn);
    panel.appendChild(footer);

    this._overlay.appendChild(panel);
    document.body.appendChild(this._overlay);

    // Trigger entrance animation
    requestAnimationFrame(() => {
      this._overlay?.classList.add("briefing--open");
    });

    this._shown = true;

    // Allow clicking the overlay background to dismiss
    this._overlay.addEventListener("click", (e) => {
      if (e.target === this._overlay) {
        this.dismiss();
      }
    });

    // Escape key dismisses
    this._escHandler = (e) => {
      if (e.key === "Escape") {
        this.dismiss();
        document.removeEventListener("keydown", this._escHandler);
      }
    };
    document.addEventListener("keydown", this._escHandler);
  }

  /**
   * Get a formatted date string for the briefing subtitle.
   * @returns {string}
   * @private
   */
  _getDateString() {
    const now = new Date();
    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    return now.toLocaleDateString("en-US", options);
  }

  // ── Default stat providers ─────────────────────────────────────────

  /**
   * @typedef {Object} BriefingStats
   * @property {number} tasksCompleted  - Tasks completed yesterday
   * @property {number} costYesterday   - Total cost yesterday in USD
   * @property {number} activeAgents    - Currently active agents
   * @property {number} zonesUnlocked   - Total unlocked zones
   * @property {number} newZoneUnlocks  - Zones unlocked yesterday
   * @property {string[]} newZoneNames  - Names of newly unlocked zones
   */

  /**
   * @typedef {Object} QuestInfo
   * @property {string} name
   * @property {number} progress        - 0..1
   * @property {{ label: string, completed: boolean }[]} steps
   */

  /**
   * Default stats provider (returns placeholder data).
   * Replace with real data hooks when the database layer is connected.
   * @returns {BriefingStats}
   */
  static _defaultStats() {
    return {
      tasksCompleted: 0,
      costYesterday: 0.0,
      activeAgents: 2,
      zonesUnlocked: 5,
      newZoneUnlocks: 0,
      newZoneNames: [],
    };
  }

  /**
   * Default quest provider (returns placeholder quest).
   * Replace with real quest system integration.
   * @returns {QuestInfo}
   */
  static _defaultQuest() {
    return {
      name: "Welcome to Claude World",
      progress: 0.3,
      steps: [
        { label: "Open the Dispatch Tower", completed: true },
        { label: "Talk to the Commander", completed: false },
        { label: "Send your first task", completed: false },
      ],
    };
  }
}

// ── Inline styles ────────────────────────────────────────────────────
// Injected once to avoid requiring a separate CSS file for this module.

const BRIEFING_STYLES = `
.briefing-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  opacity: 0;
  transition: opacity 300ms ease;
  pointer-events: auto;
}

.briefing-overlay.briefing--open {
  opacity: 1;
}

.briefing-overlay.briefing--closing {
  opacity: 0;
}

.briefing-panel {
  background: var(--bg-primary, rgba(10, 10, 20, 0.95));
  border: 1px solid var(--border-light, rgba(255, 255, 255, 0.12));
  border-radius: var(--radius-lg, 16px);
  box-shadow: var(--shadow-lg, 0 16px 64px rgba(0, 0, 0, 0.6));
  backdrop-filter: var(--blur, blur(20px));
  width: 480px;
  max-width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  padding: 28px 32px;
  transform: translateY(20px) scale(0.97);
  transition: transform 300ms ease, opacity 300ms ease;
}

.briefing--open .briefing-panel {
  transform: translateY(0) scale(1);
}

.briefing--closing .briefing-panel {
  transform: translateY(20px) scale(0.97);
}

.briefing-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
}

.briefing-avatar {
  width: 56px;
  height: 56px;
  background: var(--bg-secondary, rgba(20, 25, 40, 0.9));
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  flex-shrink: 0;
  border: 2px solid var(--accent-gold, #ffd700);
  box-shadow: 0 0 16px rgba(255, 215, 0, 0.2);
}

.briefing-greeting__title {
  font-family: var(--font-sans, 'Inter', sans-serif);
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary, #e8e8f0);
  margin: 0 0 4px;
}

.briefing-greeting__subtitle {
  font-family: var(--font-sans, 'Inter', sans-serif);
  font-size: 13px;
  color: var(--text-secondary, #8888a0);
  margin: 0;
}

.briefing-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;
}

.briefing-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  background: var(--bg-secondary, rgba(20, 25, 40, 0.9));
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
}

.briefing-card__icon {
  font-size: 20px;
  flex-shrink: 0;
}

.briefing-card__value {
  font-family: var(--font-mono, 'SF Mono', monospace);
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary, #e8e8f0);
}

.briefing-card__label {
  font-family: var(--font-sans, 'Inter', sans-serif);
  font-size: 11px;
  color: var(--text-secondary, #8888a0);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.briefing-card--green .briefing-card__value {
  color: var(--accent-green, #4aff8a);
}

.briefing-card--blue .briefing-card__value {
  color: var(--accent-blue, #4a9eff);
}

.briefing-card--amber .briefing-card__value {
  color: var(--accent-amber, #ffb84a);
}

.briefing-card--gold .briefing-card__value {
  color: var(--accent-gold, #ffd700);
}

.briefing-card--default .briefing-card__value {
  color: var(--text-primary, #e8e8f0);
}

.briefing-section {
  margin-bottom: 16px;
}

.briefing-section__title {
  font-family: var(--font-sans, 'Inter', sans-serif);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary, #8888a0);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 8px;
}

.briefing-section__content {
  font-family: var(--font-sans, 'Inter', sans-serif);
  font-size: 14px;
  color: var(--accent-gold, #ffd700);
}

.briefing-focus {
  background: var(--bg-secondary, rgba(20, 25, 40, 0.9));
  border-radius: var(--radius-md, 10px);
  padding: 16px;
  margin-bottom: 20px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.08));
}

.briefing-focus__title {
  font-family: var(--font-sans, 'Inter', sans-serif);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary, #8888a0);
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 12px;
}

.briefing-focus__quest {
  font-family: var(--font-sans, 'Inter', sans-serif);
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary, #e8e8f0);
  margin-bottom: 10px;
}

.briefing-focus__progress {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.briefing-focus__bar {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  overflow: hidden;
}

.briefing-focus__bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-blue, #4a9eff), var(--accent-purple, #a855f7));
  border-radius: 3px;
  transition: width 600ms ease;
}

.briefing-focus__bar-label {
  font-family: var(--font-mono, 'SF Mono', monospace);
  font-size: 11px;
  color: var(--text-secondary, #8888a0);
  white-space: nowrap;
}

.briefing-focus__hint {
  font-family: var(--font-sans, 'Inter', sans-serif);
  font-size: 13px;
  color: var(--accent-amber, #ffb84a);
}

.briefing-focus__empty {
  font-family: var(--font-sans, 'Inter', sans-serif);
  font-size: 13px;
  color: var(--text-dim, #555570);
  font-style: italic;
}

.briefing-footer {
  display: flex;
  justify-content: center;
}

.briefing-dismiss {
  font-family: var(--font-sans, 'Inter', sans-serif);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary, #e8e8f0);
  background: var(--bg-hover, rgba(40, 50, 80, 0.8));
  border: 1px solid var(--border-light, rgba(255, 255, 255, 0.12));
  border-radius: var(--radius-sm, 6px);
  padding: 10px 40px;
  cursor: pointer;
  transition: background var(--transition-fast, 150ms ease),
              border-color var(--transition-fast, 150ms ease);
}

.briefing-dismiss:hover {
  background: var(--bg-selected, rgba(50, 70, 120, 0.7));
  border-color: var(--accent-blue, #4a9eff);
}

.briefing-dismiss:focus-visible {
  outline: 2px solid var(--accent-blue, #4a9eff);
  outline-offset: 2px;
}
`;

// Inject styles once
if (typeof document !== "undefined") {
  const existingStyle = document.getElementById("briefing-styles");
  if (!existingStyle) {
    const style = document.createElement("style");
    style.id = "briefing-styles";
    style.textContent = BRIEFING_STYLES;
    document.head.appendChild(style);
  }
}
