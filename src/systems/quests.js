/**
 * quests.js — Quest engine for Claude World
 *
 * Listens for CustomEvents on `document`, matches them against the active
 * quest's trigger, and drives the complete → reward → celebrate flow.
 *
 * All persistence goes through `window.api.db.*` (Electron IPC bridge).
 */

// ── Trigger mapping ────────────────────────────────────────────────
// Maps DOM event names to the trigger_type stored in the quests table.

const EVENT_TO_TRIGGER = {
  "zone-click": "zone_enter",
  "connector-docks:key-saved": "api_connect",
  "agent-dialogue:send": "task_complete",
  "skills-academy:create": "skill_create",
  "task:scheduled": "task_schedule",
  "treasury:budget-set": "budget_set",
  "connector-docks:provider-count": "provider_count",
  "skills-academy:publish": "skill_publish",
  "memory-vault:add": null, // incidental tracking, no quest trigger
};

// ── QuestEngine ────────────────────────────────────────────────────

export class QuestEngine {
  constructor() {
    /** @type {Array<Object>} quest rows loaded from DB */
    this.quests = [];

    /** @type {string|null} current world id */
    this._worldId = null;

    /** @type {Array<{event: string, handler: Function}>} registered listeners */
    this._listeners = [];

    /** @type {boolean} whether we are currently completing a quest (debounce) */
    this._completing = false;
  }

  // ── Lifecycle ──────────────────────────────────────────────────

  /**
   * Load all quests for a world from the database.
   * @param {string} worldId
   */
  async loadQuests(worldId) {
    this._worldId = worldId;
    try {
      const rows = await window.api.db.getQuests(worldId);
      this.quests = rows || [];
    } catch (err) {
      console.error("[QuestEngine] Failed to load quests:", err);
      this.quests = [];
    }
  }

  /**
   * Begin listening to DOM events that may satisfy quest triggers.
   * Safe to call multiple times — clears previous listeners first.
   */
  startListening() {
    this.stopListening();

    for (const [eventName, triggerType] of Object.entries(EVENT_TO_TRIGGER)) {
      const handler = (e) => this._handleEvent(eventName, triggerType, e);
      document.addEventListener(eventName, handler);
      this._listeners.push({ event: eventName, handler });
    }
  }

  /**
   * Remove all registered listeners.
   */
  stopListening() {
    for (const { event, handler } of this._listeners) {
      document.removeEventListener(event, handler);
    }
    this._listeners = [];
  }

  // ── Event handling ─────────────────────────────────────────────

  /**
   * Internal handler for every watched DOM event.
   * @param {string} eventName
   * @param {string|null} triggerType
   * @param {CustomEvent} e
   */
  _handleEvent(eventName, triggerType, e) {
    // Incidental events (memory-vault:add) have no trigger type
    if (!triggerType) return;

    const detail = e.detail || {};
    const triggerValue = detail.zoneId || detail.value || detail.count || "any";

    this.checkTrigger(triggerType, String(triggerValue));
  }

  // ── Trigger checking ───────────────────────────────────────────

  /**
   * Check if the currently-active quest matches the given trigger.
   * @param {string} triggerType
   * @param {string} triggerValue
   */
  checkTrigger(triggerType, triggerValue) {
    if (this._completing) return;

    const active = this.getActiveQuest();
    if (!active) return;

    // Type must match
    if (active.trigger_type !== triggerType) return;

    // Value must match: 'any' accepts everything, otherwise exact match
    if (active.trigger_value !== "any" && active.trigger_value !== triggerValue)
      return;

    // Trigger matched — complete the quest
    this.completeQuest(active);
  }

  // ── Quest completion ───────────────────────────────────────────

  /**
   * Complete a quest: persist to DB, award XP, celebrate, advance chain.
   * @param {Object} quest
   */
  async completeQuest(quest) {
    if (this._completing) return;
    this._completing = true;

    try {
      // 1. Mark quest as completed in DB
      await window.api.db.completeQuest(quest.id);

      // 2. Award XP
      const xpResult = await window.api.db.addXP(
        this._worldId,
        quest.reward_xp,
      );

      // 3. Update local state
      const idx = this.quests.findIndex((q) => q.id === quest.id);
      if (idx !== -1) {
        this.quests[idx].status = "completed";
        this.quests[idx].completed_at = new Date().toISOString();
      }

      // 4. Emit quest:completed event
      document.dispatchEvent(
        new CustomEvent("quest:completed", {
          detail: {
            quest,
            xp: quest.reward_xp,
            level: xpResult?.level,
            leveledUp: xpResult?.leveledUp,
            totalXP: xpResult?.xp,
          },
          bubbles: true,
        }),
      );

      // 5. Show celebration toast
      document.dispatchEvent(
        new CustomEvent("toast:show", {
          detail: {
            type: "achievement",
            title: `Quest Complete: ${quest.title}`,
            description: `+${quest.reward_xp} XP earned!`,
            duration: 5000,
          },
          bubbles: true,
        }),
      );

      // 6. If leveled up, show level-up toast after a brief delay
      if (xpResult?.leveledUp) {
        setTimeout(() => {
          document.dispatchEvent(
            new CustomEvent("toast:show", {
              detail: {
                type: "achievement",
                title: "Level Up!",
                description: `You are now Level ${xpResult.level}!`,
                duration: 5000,
              },
              bubbles: true,
            }),
          );
        }, 600);
      }

      // 7. Emit celebration event for renderer (confetti, etc.)
      document.dispatchEvent(
        new CustomEvent("quest:celebration", {
          detail: {
            quest,
            zoneId: quest.trigger_value,
          },
          bubbles: true,
        }),
      );

      // 8. Activate next quest in the chain
      await this._activateNextQuest(quest);

      // 9. Emit HUD update event
      document.dispatchEvent(
        new CustomEvent("quest:chain-updated", {
          detail: { quests: this.quests },
          bubbles: true,
        }),
      );
    } catch (err) {
      console.error("[QuestEngine] Failed to complete quest:", err);
    } finally {
      this._completing = false;
    }
  }

  /**
   * Find and activate the next quest in the same chain.
   * @param {Object} completedQuest
   */
  async _activateNextQuest(completedQuest) {
    const nextQuest = this.quests.find(
      (q) =>
        q.chain_id === completedQuest.chain_id &&
        q.sort_order === completedQuest.sort_order + 1 &&
        q.status === "locked",
    );

    if (!nextQuest) return;

    try {
      await window.api.db.activateQuest(nextQuest.id);
      nextQuest.status = "active";
    } catch (err) {
      console.error("[QuestEngine] Failed to activate next quest:", err);
    }
  }

  // ── Accessors ──────────────────────────────────────────────────

  /**
   * Get the current active quest (first quest with status 'active').
   * @returns {Object|null}
   */
  getActiveQuest() {
    return this.quests.find((q) => q.status === "active") || null;
  }

  /**
   * Get all quests with their current status.
   * @returns {Array<Object>}
   */
  getAllQuests() {
    return [...this.quests];
  }

  /**
   * Get the number of completed quests.
   * @returns {number}
   */
  getCompletedCount() {
    return this.quests.filter((q) => q.status === "completed").length;
  }

  /**
   * Get chain progress as a fraction (0..1).
   * @returns {number}
   */
  getProgress() {
    if (this.quests.length === 0) return 0;
    return this.getCompletedCount() / this.quests.length;
  }

  /**
   * Build HUD-compatible quest data for setQuest().
   * @returns {{ name: string, progress: number, steps: Array<{ label: string, completed: boolean, current?: boolean }> }}
   */
  toHUDData() {
    const active = this.getActiveQuest();
    const completed = this.getCompletedCount();
    const total = this.quests.length;

    return {
      name: active
        ? active.title
        : completed === total
          ? "All Quests Complete!"
          : "No Active Quest",
      progress: total > 0 ? completed / total : 0,
      steps: this.quests.map((q) => ({
        label: q.title,
        completed: q.status === "completed",
        current: q.status === "active",
      })),
    };
  }

  /**
   * Clean up: stop listening and clear state.
   */
  destroy() {
    this.stopListening();
    this.quests = [];
    this._worldId = null;
  }
}

// ── Singleton instance ─────────────────────────────────────────────

export const questEngine = new QuestEngine();
