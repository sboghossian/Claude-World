/**
 * quest-panel.js — Full quest chain panel for Claude World
 *
 * Opens when the user clicks the HUD quest card.
 * Displays a vertical timeline of all quests with status indicators,
 * progress bar, and XP rewards.
 */

import { questEngine } from "../systems/quests.js";

// ── Status helpers ─────────────────────────────────────────────────

const STATUS_ICON = {
  completed: "\u2713", // checkmark
  active: "\u25CF", // filled circle (glowing dot)
  locked: "\uD83D\uDD12", // lock
};

/**
 * Format a date string into a short human-readable form.
 * @param {string|null} iso
 * @returns {string}
 */
function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// ── QuestPanel ─────────────────────────────────────────────────────

export class QuestPanel {
  constructor() {
    /** @type {HTMLElement|null} */
    this._overlay = null;
    /** @type {HTMLElement|null} */
    this._panel = null;
    /** @type {boolean} */
    this._open = false;

    this._onQuestCardClick = this._onQuestCardClick.bind(this);
    this._onChainUpdated = this._onChainUpdated.bind(this);
    this._onKeyDown = this._onKeyDown.bind(this);

    // Listen for quest card clicks (the HUD card dispatches this via its own click)
    document.addEventListener("quest-panel:open", this._onQuestCardClick);
    document.addEventListener("quest:chain-updated", this._onChainUpdated);
  }

  // ── Open / Close ───────────────────────────────────────────────

  /**
   * Open the quest panel overlay.
   */
  open() {
    if (this._open) {
      this._refresh();
      return;
    }
    this._open = true;
    this._createDOM();
    document.addEventListener("keydown", this._onKeyDown);
  }

  /**
   * Close the quest panel overlay.
   */
  close() {
    if (!this._open) return;
    this._open = false;
    document.removeEventListener("keydown", this._onKeyDown);

    if (this._overlay) {
      this._overlay.classList.add("quest-panel-overlay--closing");
      setTimeout(() => {
        this._overlay?.remove();
        this._overlay = null;
        this._panel = null;
      }, 250);
    }
  }

  toggle() {
    if (this._open) this.close();
    else this.open();
  }

  // ── Event handlers ─────────────────────────────────────────────

  /** @param {Event} _e */
  _onQuestCardClick(_e) {
    this.toggle();
  }

  _onChainUpdated() {
    if (this._open) this._refresh();
  }

  /** @param {KeyboardEvent} e */
  _onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      this.close();
    }
  }

  // ── DOM construction ───────────────────────────────────────────

  _createDOM() {
    // Overlay backdrop
    this._overlay = document.createElement("div");
    this._overlay.className = "quest-panel-overlay";
    this._overlay.addEventListener("click", (e) => {
      if (e.target === this._overlay) this.close();
    });

    // Panel card
    this._panel = document.createElement("div");
    this._panel.className = "quest-panel";
    this._panel.setAttribute("role", "dialog");
    this._panel.setAttribute("aria-label", "Quest Progress");

    // Header
    const header = document.createElement("div");
    header.className = "quest-panel__header";

    const title = document.createElement("h2");
    title.className = "quest-panel__title";
    title.textContent = "Quest Chain";

    const closeBtn = document.createElement("button");
    closeBtn.className = "quest-panel__close";
    closeBtn.setAttribute("aria-label", "Close quest panel");
    closeBtn.textContent = "\u00D7";
    closeBtn.addEventListener("click", () => this.close());

    header.appendChild(title);
    header.appendChild(closeBtn);
    this._panel.appendChild(header);

    // Progress summary
    this._progressSection = document.createElement("div");
    this._progressSection.className = "quest-panel__progress";
    this._panel.appendChild(this._progressSection);

    // Timeline container
    this._timeline = document.createElement("div");
    this._timeline.className = "quest-panel__timeline";
    this._panel.appendChild(this._timeline);

    this._overlay.appendChild(this._panel);
    document.body.appendChild(this._overlay);

    // Animate in
    requestAnimationFrame(() => {
      this._overlay.classList.add("quest-panel-overlay--visible");
    });

    this._refresh();
  }

  // ── Rendering ──────────────────────────────────────────────────

  _refresh() {
    if (!this._panel) return;

    const quests = questEngine.getAllQuests();
    const completed = questEngine.getCompletedCount();
    const total = quests.length;

    // Progress bar
    this._renderProgress(completed, total);

    // Timeline
    this._renderTimeline(quests);
  }

  /**
   * Render the overall progress bar.
   * @param {number} completed
   * @param {number} total
   */
  _renderProgress(completed, total) {
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    this._progressSection.innerHTML = "";

    const label = document.createElement("div");
    label.className = "quest-panel__progress-label";
    label.textContent = `${completed} / ${total} quests completed`;

    const barWrap = document.createElement("div");
    barWrap.className = "quest-panel__progress-bar";
    barWrap.setAttribute("role", "progressbar");
    barWrap.setAttribute("aria-valuenow", String(pct));
    barWrap.setAttribute("aria-valuemin", "0");
    barWrap.setAttribute("aria-valuemax", "100");

    const fill = document.createElement("div");
    fill.className = "quest-panel__progress-fill";
    fill.style.width = `${pct}%`;

    const pctLabel = document.createElement("span");
    pctLabel.className = "quest-panel__progress-pct";
    pctLabel.textContent = `${pct}%`;

    barWrap.appendChild(fill);
    this._progressSection.appendChild(label);
    this._progressSection.appendChild(barWrap);
    this._progressSection.appendChild(pctLabel);
  }

  /**
   * Render the vertical quest timeline.
   * @param {Array<Object>} quests
   */
  _renderTimeline(quests) {
    this._timeline.innerHTML = "";

    for (let i = 0; i < quests.length; i++) {
      const q = quests[i];
      const isLast = i === quests.length - 1;
      const item = this._createTimelineItem(q, isLast);
      this._timeline.appendChild(item);
    }
  }

  /**
   * Create a single timeline item node.
   * @param {Object} quest
   * @param {boolean} isLast
   * @returns {HTMLElement}
   */
  _createTimelineItem(quest, isLast) {
    const item = document.createElement("div");
    item.className = `quest-panel__item quest-panel__item--${quest.status}`;

    // Left column: line + dot
    const rail = document.createElement("div");
    rail.className = "quest-panel__rail";

    const dot = document.createElement("div");
    dot.className = `quest-panel__dot quest-panel__dot--${quest.status}`;
    dot.textContent = STATUS_ICON[quest.status] || "";
    rail.appendChild(dot);

    if (!isLast) {
      const line = document.createElement("div");
      line.className = `quest-panel__line quest-panel__line--${quest.status}`;
      rail.appendChild(line);
    }

    item.appendChild(rail);

    // Right column: content
    const content = document.createElement("div");
    content.className = "quest-panel__content";

    const titleRow = document.createElement("div");
    titleRow.className = "quest-panel__item-title";
    titleRow.textContent = quest.title;
    content.appendChild(titleRow);

    // Description — only show for completed and active
    if (quest.status !== "locked") {
      const desc = document.createElement("div");
      desc.className = "quest-panel__item-desc";
      desc.textContent = quest.description;
      content.appendChild(desc);
    }

    // Meta row: XP + date
    const meta = document.createElement("div");
    meta.className = "quest-panel__item-meta";

    if (quest.status === "completed") {
      const xpBadge = document.createElement("span");
      xpBadge.className = "quest-panel__xp-badge quest-panel__xp-badge--earned";
      xpBadge.textContent = `+${quest.reward_xp} XP`;
      meta.appendChild(xpBadge);

      if (quest.completed_at) {
        const date = document.createElement("span");
        date.className = "quest-panel__item-date";
        date.textContent = formatDate(quest.completed_at);
        meta.appendChild(date);
      }
    } else if (quest.status === "active") {
      const xpBadge = document.createElement("span");
      xpBadge.className = "quest-panel__xp-badge";
      xpBadge.textContent = `${quest.reward_xp} XP`;
      meta.appendChild(xpBadge);

      const hint = document.createElement("span");
      hint.className = "quest-panel__item-hint";
      hint.textContent = this._getProgressHint(quest);
      meta.appendChild(hint);
    } else {
      // locked — just show XP dimmed
      const xpBadge = document.createElement("span");
      xpBadge.className = "quest-panel__xp-badge quest-panel__xp-badge--locked";
      xpBadge.textContent = `${quest.reward_xp} XP`;
      meta.appendChild(xpBadge);
    }

    content.appendChild(meta);
    item.appendChild(content);

    return item;
  }

  /**
   * Return a short contextual hint for the active quest.
   * @param {Object} quest
   * @returns {string}
   */
  _getProgressHint(quest) {
    const hints = {
      zone_enter: "Click the zone to enter",
      api_connect: "Add an API key at the Docks",
      task_complete: "Send a task from the Tower",
      skill_create: "Create a skill at the Academy",
      task_schedule: "Schedule a task in the Tunnels",
      budget_set: "Set a budget in the Treasury",
      provider_count: `Connect ${quest.trigger_value} providers`,
      skill_publish: "Publish a skill to the Market",
    };
    return hints[quest.trigger_type] || "";
  }

  // ── Teardown ───────────────────────────────────────────────────

  destroy() {
    this.close();
    document.removeEventListener("quest-panel:open", this._onQuestCardClick);
    document.removeEventListener("quest:chain-updated", this._onChainUpdated);
  }
}
