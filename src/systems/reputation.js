/**
 * reputation.js — Identity & Reputation system for Claude World
 *
 * Tracks user reputation points, awards, titles, and badges.
 * Listens for DOM events from other zones and awards points accordingly.
 */

// Point values per event type
const POINTS = {
  task_complete: 5,
  skill_create: 20,
  quest_complete: 50,
  zone_unlock: 30,
  minion_run: 3,
  api_connect: 25,
};

// Titles unlocked at each reputation threshold (ascending)
const TITLES = [
  [0, "World Builder"],
  [100, "Task Runner"],
  [300, "Skill Crafter"],
  [600, "Agent Commander"],
  [1000, "World Architect"],
  [2000, "AI Orchestrator"],
  [5000, "Claude Master"],
];

// Badge definitions — each badge has an id, label, icon, and a predicate
// that receives the identity row and the full reputation_events array.
const BADGE_DEFS = [
  {
    id: "first_task",
    icon: "🚀",
    label: "First Task",
    check: (identity, events) =>
      events.some((e) => e.event_type === "task_complete"),
  },
  {
    id: "connected",
    icon: "🔌",
    label: "Connected",
    check: (identity, events) =>
      events.some((e) => e.event_type === "api_connect"),
  },
  {
    id: "skill_master",
    icon: "🎓",
    label: "Skill Master",
    check: (identity, events) =>
      events.filter((e) => e.event_type === "skill_create").length >= 3,
  },
  {
    id: "commander",
    icon: "🤖",
    label: "Commander",
    check: (identity, events) =>
      events.filter((e) => e.event_type === "minion_run").length >= 5,
  },
  {
    id: "quest_hero",
    icon: "⚔️",
    label: "Quest Hero",
    check: (identity, events) =>
      events.some((e) => e.event_type === "quest_complete"),
  },
  {
    id: "explorer",
    icon: "🗺️",
    label: "Explorer",
    check: (identity, events) =>
      events.filter((e) => e.event_type === "zone_unlock").length >= 2,
  },
];

/**
 * Generate a short unique ID.
 * @returns {string}
 */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export class ReputationSystem {
  /**
   * @param {object} db — better-sqlite3 database instance (or compatible wrapper)
   */
  constructor(db) {
    /** @type {object} */
    this._db = db;

    this._bindDOMEvents();
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * Award reputation points for an event.
   * Creates an identity row for the world if one does not exist.
   * Updates the identity's reputation total and recalculates title + badges.
   *
   * @param {string} worldId
   * @param {string} eventType — key from POINTS map
   * @param {string} description — human-readable description of the event
   * @returns {Promise<{identity: object, event: object, points: number}>}
   */
  async award(worldId, eventType, description) {
    const points = POINTS[eventType] ?? 1;

    // Ensure identity row exists
    const identity = await this.getIdentity(worldId);

    // Insert reputation event
    const eventId = uid();
    this._db
      .prepare(
        `
      INSERT INTO reputation_events (id, world_id, event_type, points, description)
      VALUES (?, ?, ?, ?, ?)
    `,
      )
      .run(eventId, worldId, eventType, points, description);

    // Accumulate reputation
    const newRep = (identity.reputation || 0) + points;
    const newTitle = this.getTitle(newRep);

    // Re-derive badges from full history
    const allEvents = this._db
      .prepare("SELECT * FROM reputation_events WHERE world_id = ?")
      .all(worldId);
    const updatedIdentity = {
      ...identity,
      reputation: newRep,
      title: newTitle,
    };
    const badges = this.getBadges(updatedIdentity, allEvents);

    this._db
      .prepare(
        `
      UPDATE identity
      SET reputation = ?, title = ?, badges_json = ?, updated_at = datetime('now')
      WHERE world_id = ?
    `,
      )
      .run(newRep, newTitle, JSON.stringify(badges), worldId);

    const saved = await this.getIdentity(worldId);

    this._emit("reputation:awarded", {
      worldId,
      eventType,
      points,
      description,
      identity: saved,
    });

    return {
      identity: saved,
      points,
      event: { id: eventId, eventType, points, description },
    };
  }

  /**
   * Return the identity row for a world, creating a default one if missing.
   * @param {string} worldId
   * @returns {Promise<object>}
   */
  async getIdentity(worldId) {
    let row = this._db
      .prepare("SELECT * FROM identity WHERE world_id = ?")
      .get(worldId);

    if (!row) {
      const id = uid();
      this._db
        .prepare(
          `
        INSERT INTO identity (id, world_id, display_name, avatar_emoji, avatar_color, title, bio, reputation, badges_json)
        VALUES (?, ?, 'Commander', '🧠', '#7c3aed', 'World Builder', '', 0, '[]')
      `,
        )
        .run(id, worldId);
      row = this._db
        .prepare("SELECT * FROM identity WHERE world_id = ?")
        .get(worldId);
    }

    // Parse badges_json
    try {
      row.badges = JSON.parse(row.badges_json || "[]");
    } catch {
      row.badges = [];
    }

    return row;
  }

  /**
   * Update editable identity fields: display_name, avatar_emoji, avatar_color, bio.
   * @param {string} worldId
   * @param {{ display_name?: string, avatar_emoji?: string, avatar_color?: string, bio?: string }} updates
   * @returns {Promise<object>} updated identity
   */
  async updateIdentity(worldId, updates) {
    // Ensure row exists
    await this.getIdentity(worldId);

    const allowed = ["display_name", "avatar_emoji", "avatar_color", "bio"];
    const fields = Object.keys(updates).filter((k) => allowed.includes(k));

    if (fields.length === 0) return this.getIdentity(worldId);

    const setClauses = fields.map((f) => `${f} = ?`).join(", ");
    const values = fields.map((f) => updates[f]);
    values.push(worldId);

    this._db
      .prepare(
        `UPDATE identity SET ${setClauses}, updated_at = datetime('now') WHERE world_id = ?`,
      )
      .run(...values);

    const updated = await this.getIdentity(worldId);
    this._emit("identity:updated", { worldId, identity: updated });
    return updated;
  }

  /**
   * Return the most recent reputation events for a world.
   * @param {string} worldId
   * @param {number} [limit=20]
   * @returns {Promise<Array<object>>}
   */
  async getHistory(worldId, limit = 20) {
    const rows = this._db
      .prepare(
        `
      SELECT * FROM reputation_events
      WHERE world_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `,
      )
      .all(worldId, limit);
    return rows;
  }

  /**
   * Return the title string for a given reputation score.
   * @param {number} reputation
   * @returns {string}
   */
  getTitle(reputation) {
    let title = TITLES[0][1];
    for (const [threshold, label] of TITLES) {
      if (reputation >= threshold) {
        title = label;
      } else {
        break;
      }
    }
    return title;
  }

  /**
   * Derive the current badge array from identity + event history.
   * @param {object} identity
   * @param {Array<object>} [events] — pass pre-fetched events for efficiency
   * @returns {Array<{ id: string, icon: string, label: string }>}
   */
  getBadges(identity, events) {
    const evts =
      events ||
      this._db
        .prepare("SELECT * FROM reputation_events WHERE world_id = ?")
        .all(identity.world_id);

    return BADGE_DEFS.filter((b) => b.check(identity, evts)).map(
      ({ id, icon, label }) => ({ id, icon, label }),
    );
  }

  /**
   * Return title thresholds so the UI can draw a progress bar.
   * @returns {Array<[number, string]>}
   */
  getTitles() {
    return TITLES;
  }

  // ── DOM event wiring ─────────────────────────────────────────

  _bindDOMEvents() {
    const handle = (eventType, descFn) => {
      document.addEventListener(eventType, (e) => {
        const worldId = e.detail && e.detail.worldId;
        if (!worldId) return;
        const description = descFn(e.detail);
        this.award(
          worldId,
          eventType
            .replace("dispatch:", "")
            .replace("skills-academy:", "skill_")
            .replace("quest:", "quest_")
            .replace("zone:", "zone_"),
          description,
        ).catch(console.error);
      });
    };

    // task completed
    document.addEventListener("dispatch:task-complete", (e) => {
      const worldId = e.detail && e.detail.worldId;
      if (!worldId) return;
      this.award(
        worldId,
        "task_complete",
        e.detail.description || "Task completed",
      ).catch(console.error);
    });

    // skill created
    document.addEventListener("skills-academy:create", (e) => {
      const worldId = e.detail && e.detail.worldId;
      if (!worldId) return;
      const name =
        e.detail && e.detail.name
          ? `Skill "${e.detail.name}" created`
          : "Skill created";
      this.award(worldId, "skill_create", name).catch(console.error);
    });

    // quest completed
    document.addEventListener("quest:complete", (e) => {
      const worldId = e.detail && e.detail.worldId;
      if (!worldId) return;
      const name =
        e.detail && e.detail.name
          ? `Quest "${e.detail.name}" completed`
          : "Quest completed";
      this.award(worldId, "quest_complete", name).catch(console.error);
    });

    // zone unlocked
    document.addEventListener("zone:unlock", (e) => {
      const worldId = e.detail && e.detail.worldId;
      if (!worldId) return;
      const name =
        e.detail && e.detail.zone
          ? `Zone "${e.detail.zone}" unlocked`
          : "New zone unlocked";
      this.award(worldId, "zone_unlock", name).catch(console.error);
    });
  }

  // ── Helpers ──────────────────────────────────────────────────

  _emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }
}
