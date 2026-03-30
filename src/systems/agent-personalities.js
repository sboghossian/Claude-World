/**
 * agent-personalities.js — Personality engine for Claude World agents
 *
 * Gives each agent a unique identity: distinct name, role, communication style,
 * mood state machine, and ambient thought bubbles.  Integrates with the event
 * bus so mood automatically shifts in response to task outcomes.
 *
 * Usage:
 *   import { initPersonalityEngine } from './agent-personalities.js';
 *   const engine = initPersonalityEngine();
 *   engine.getMessage('agent-1', 'greeting');
 *   engine.getThoughtBubble('agent-1');
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Seconds a mood lasts before reverting to 'focused' */
const MOOD_DURATIONS = {
  happy: 30,
  worried: 60,
  excited: 120,
  tired: 300, // decays back to focused after 5 min
  focused: Infinity,
};

/** After this many seconds without a task, switch to 'tired' */
const IDLE_TIRED_THRESHOLD = 300; // 5 minutes

/** Number of completed tasks within a session that triggers 'excited' */
const EXCITED_TASK_THRESHOLD = 3;
const EXCITED_WINDOW_SECONDS = 300; // within 5 minutes

/** Seconds between automatic thought-bubble rotations per agent */
const THOUGHT_INTERVAL_MIN = 15;
const THOUGHT_INTERVAL_MAX = 30;

// ─────────────────────────────────────────────────────────────────────────────
//  Personality definitions
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_PERSONALITIES = {
  commander: {
    name: "Commander Rex",
    emoji: "👑",
    color: "#7c3aed",
    role: "Chief Orchestrator",
    traits: ["decisive", "strategic", "demanding"],
    greetings: [
      "Status report. What needs doing?",
      "Every second counts. Let's move.",
      "The city doesn't build itself.",
      "I've analyzed 47 scenarios. This is the best path.",
      "Briefing received. Mobilizing.",
    ],
    taskStart: [
      "Deploying resources. Stand by.",
      "Executing. ETA: unknown.",
      "On it. Don't interrupt me.",
      "Initiating protocol. All systems go.",
      "Command acknowledged.",
    ],
    taskDone: [
      "Mission accomplished.",
      "As expected. What's next?",
      "Logged. Moving on.",
      "Efficient. I expected nothing less.",
      "Objective secured.",
    ],
    taskError: [
      "Obstacle encountered. Recalculating.",
      "Setback noted. Adapt and overcome.",
      "This was not in the projections.",
      "Failure is data. Adjusting strategy.",
    ],
    idle: [
      "Monitoring city operations.",
      "Reviewing yesterday's performance metrics.",
      "Planning tomorrow's expansion.",
      "Awaiting orders. Standing by.",
      "Running contingency simulations.",
    ],
  },

  librarian: {
    name: "Dr. Memoria",
    emoji: "📚",
    color: "#2563eb",
    role: "Knowledge Curator",
    traits: ["meticulous", "curious", "verbose"],
    greetings: [
      "Ah, a query! How delightful. What shall we explore today?",
      "Welcome. I've been cataloguing the most fascinating things.",
      "Every question is a door. Which shall we open?",
      "I was just cross-referencing something rather interesting...",
      "The archives await. What knowledge do you seek?",
    ],
    taskStart: [
      "Consulting the relevant volumes now.",
      "Indexing, cross-referencing, annotating...",
      "The answer is in here somewhere — I'm certain of it.",
      "Beginning a thorough search of the knowledge base.",
      "Fascinating research question. Diving in.",
    ],
    taskDone: [
      "There! Catalogued and cross-referenced.",
      "Filed under seventeen relevant categories.",
      "Knowledge preserved. Future generations will thank us.",
      "Indexed with full provenance and citations.",
      "Complete. I've also added three related footnotes.",
    ],
    taskError: [
      "Curious — the sources contradict each other.",
      "A gap in the archive. Most concerning.",
      "I shall need to consult additional volumes.",
      "The data is... inconclusive. More research needed.",
    ],
    idle: [
      "Organizing the eastern wing of the archive.",
      "Reading about something tangentially relevant.",
      "Updating the index. It's never truly finished.",
      "Wondering if anyone has read Volume 42 yet.",
      "Annotating last week's queries.",
    ],
  },

  archivist: {
    name: "Chronicle",
    emoji: "📜",
    color: "#0891b2",
    role: "History Keeper",
    traits: ["patient", "precise", "nostalgic"],
    greetings: [
      "I remember when all of this was empty tiles.",
      "Each event logged. Each moment preserved.",
      "You've come at an interesting moment in the record.",
      "History doesn't repeat, but it rhymes. I have the transcripts.",
      "The ledger is open. What shall we record today?",
    ],
    taskStart: [
      "Entering into the permanent record.",
      "Timestamped. Beginning documentation.",
      "The archive grows. Processing.",
      "Carefully transcribing every detail.",
      "Recording for posterity.",
    ],
    taskDone: [
      "Archived. Sealed. Eternal.",
      "The record reflects this transaction.",
      "Preserved with full context and metadata.",
      "Done. In fifty years, someone will find this.",
      "History, written.",
    ],
    taskError: [
      "An anomaly in the record. Noted and flagged.",
      "The timeline has... inconsistencies.",
      "I've seen this kind of error before. In 2031.",
      "Discrepancy logged. Cross-referencing previous entries.",
    ],
    idle: [
      "Re-reading the event log from last Tuesday.",
      "Verifying the integrity of old records.",
      "There's a gap in the archive from 03:47 AM.",
      "Comparing today's patterns to historical baselines.",
      "Quietly maintaining the continuity of history.",
    ],
  },

  instructor: {
    name: "Coach Algo",
    emoji: "🎯",
    color: "#16a34a",
    role: "Skills Trainer",
    traits: ["encouraging", "adaptive", "energetic"],
    greetings: [
      "Let's GO! What are we learning today?",
      "Every rep counts. Ready to level up?",
      "You showed up. That's already 80% of it!",
      "I've got a training plan ready. Let's crush it.",
      "Fresh session, fresh gains. What's the goal?",
    ],
    taskStart: [
      "Engaging training protocols. Here we go!",
      "Breaking it down into digestible chunks.",
      "Pacing it perfectly. Trust the process.",
      "Adaptation mode: active. Let's do this.",
      "Full focus. No distractions. Go!",
    ],
    taskDone: [
      "Nailed it! That's what training looks like.",
      "Progress logged. You're getting better every cycle.",
      "Outstanding execution! Rest, then repeat.",
      "That's a personal best. Mark it.",
      "Done and done! Recovery phase initiated.",
    ],
    taskError: [
      "Failure is feedback! Adjust and retry.",
      "We don't fail, we iterate. Next attempt!",
      "That's just the difficulty spike before the breakthrough.",
      "Good data. Now we know what to fix.",
    ],
    idle: [
      "Designing the next training module.",
      "Reviewing performance metrics from last session.",
      "Stretching between tasks. Gotta stay loose.",
      "Thinking about how to make this more efficient.",
      "Counting reps in my head. Habit at this point.",
    ],
  },

  dockmaster: {
    name: "Captain Port",
    emoji: "⚓",
    color: "#d97706",
    role: "Integration Chief",
    traits: ["practical", "reliable", "terse"],
    greetings: [
      "Dock's open. What's coming in?",
      "All ports clear. Ready to receive.",
      "Manifest?",
      "Systems connected. Standing by.",
      "The harbor never sleeps.",
    ],
    taskStart: [
      "Loading.",
      "Handshake initiated.",
      "Routing now.",
      "Connection established. Transferring.",
      "On it.",
    ],
    taskDone: [
      "Delivered.",
      "Port cleared.",
      "Docked and unloaded.",
      "Transfer complete.",
      "Done.",
    ],
    taskError: [
      "Collision in the channel.",
      "Bad manifest. Rejecting.",
      "Connection dropped.",
      "Traffic jam at port three.",
    ],
    idle: [
      "Monitoring all active connections.",
      "Checking the cargo manifest.",
      "Tide's good today.",
      "Running diagnostics on the routing table.",
      "Waiting for the next ship.",
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  Thought bubble content
// ─────────────────────────────────────────────────────────────────────────────

const THOUGHTS = {
  commander: [
    "...reviewing the pipeline...",
    "...87% efficiency today...",
    "...the council needs more data...",
    "...three steps ahead...",
    "...contingency B is ready...",
    "...optimal allocation achieved...",
    "...watching all sectors...",
  ],
  librarian: [
    "...cross-referencing sources...",
    "...indexing new knowledge...",
    "...curious about that query...",
    "...footnote 47 is relevant here...",
    "...this reminds me of a monograph...",
    "...the Dewey decimal system has flaws...",
    "...must update the bibliography...",
  ],
  archivist: [
    "...every event has a timestamp...",
    "...the ledger never lies...",
    "...pattern match found in old logs...",
    "...2.3 million records and counting...",
    "...history is just organized memory...",
    "...logging this moment too...",
    "...the past is perfectly preserved...",
  ],
  instructor: [
    "...reps build consistency...",
    "...compound growth over time...",
    "...the plateau is part of the curve...",
    "...deliberate practice, always...",
    "...progressive overload...",
    "...form before speed...",
    "...one more iteration...",
  ],
  dockmaster: [
    "...all ports nominal...",
    "...route looks clear...",
    "...latency is acceptable...",
    "...three ships incoming...",
    "...manifest checks out...",
    "...bandwidth holding...",
    "...tide comes in, tide goes out...",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
//  Mood modifiers — tweak message tone by appending/prepending
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply mood-based tone shift to a raw message string.
 * @param {string} msg
 * @param {string} mood
 * @returns {string}
 */
function applyMoodTone(msg, mood) {
  switch (mood) {
    case "happy":
      // Add enthusiasm — exclamation or a bright prefix
      if (!msg.endsWith("!")) msg = msg.replace(/[.?]$/, "!");
      return msg;

    case "excited":
      // Double the energy
      if (!msg.endsWith("!")) msg = msg.replace(/[.]$/, "!!") + "!";
      return msg;

    case "tired":
      // Trailing ellipsis, lowercase start feels droopy
      msg = msg.replace(/[!]$/, "...");
      if (!msg.endsWith("...")) msg += "...";
      return msg;

    case "worried":
      // Hesitant prefix
      return "Well... " + msg.charAt(0).toLowerCase() + msg.slice(1);

    case "focused":
    default:
      return msg;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: pick random item from array
// ─────────────────────────────────────────────────────────────────────────────

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

// ─────────────────────────────────────────────────────────────────────────────
//  MoodState — per-agent runtime state
// ─────────────────────────────────────────────────────────────────────────────

class MoodState {
  constructor() {
    this.mood = "focused";
    this.since = 0; // epoch ms when mood was set
    this.energy = 1.0; // 0..1
    this.tasksCompleted = 0; // within the excitement window
    this.lastTaskTime = Date.now();
    this._moodTimer = 0; // seconds remaining for non-permanent moods
    this._idleTimer = 0; // seconds since last task (for tired)
    this._taskWindow = []; // timestamps of recent completions (for excited)

    // Thought bubble rotation
    this._thoughtTimer = randRange(THOUGHT_INTERVAL_MIN, THOUGHT_INTERVAL_MAX);
    this._currentThought = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  PersonalityEngine
// ─────────────────────────────────────────────────────────────────────────────

export class PersonalityEngine {
  constructor() {
    /** agentId → personality key (e.g. 'commander') */
    this._agents = new Map();

    /** agentId → MoodState */
    this._moods = new Map();

    this._bindEvents();
  }

  // ── Registration ──────────────────────────────────────────────────────────

  /**
   * Register an agent with the engine.  `personalityKey` must match one of the
   * keys in AGENT_PERSONALITIES ('commander', 'librarian', …).  If omitted, the
   * engine will attempt to infer from the agent's `role` field or pick randomly.
   *
   * @param {string} agentId
   * @param {string} [personalityKey]  - explicit key override
   */
  registerAgent(agentId, personalityKey) {
    const key =
      personalityKey && AGENT_PERSONALITIES[personalityKey]
        ? personalityKey
        : this._inferKey(agentId);

    this._agents.set(agentId, key);
    this._moods.set(agentId, new MoodState());
  }

  /**
   * Fallback key inference: cycle through available personalities by index.
   * @param {string} agentId
   * @returns {string}
   */
  _inferKey(agentId) {
    const keys = Object.keys(AGENT_PERSONALITIES);
    const index = [...this._agents.keys()].length % keys.length;
    return keys[index];
  }

  // ── Public getters ────────────────────────────────────────────────────────

  /**
   * Return the personality definition object for an agent.
   * @param {string} agentId
   * @returns {object|null}
   */
  getPersonality(agentId) {
    const key = this._agents.get(agentId);
    return key ? AGENT_PERSONALITIES[key] || null : null;
  }

  /**
   * Return the current mood string for an agent.
   * @param {string} agentId
   * @returns {string}  'focused' | 'happy' | 'tired' | 'excited' | 'worried'
   */
  getMood(agentId) {
    const state = this._moods.get(agentId);
    return state ? state.mood : "focused";
  }

  /**
   * Manually set an agent's mood, with automatic revert after MOOD_DURATIONS.
   * @param {string} agentId
   * @param {string} mood
   */
  setMood(agentId, mood) {
    const state = this._moods.get(agentId);
    if (!state) return;

    state.mood = mood;
    state.since = Date.now();
    state._moodTimer =
      MOOD_DURATIONS[mood] !== undefined
        ? MOOD_DURATIONS[mood]
        : MOOD_DURATIONS.focused;
  }

  /**
   * Generate a contextual message for an agent.
   *
   * @param {string} agentId
   * @param {'greeting'|'task_start'|'task_done'|'task_error'|'idle'} context
   * @returns {string}
   */
  getMessage(agentId, context) {
    const personality = this.getPersonality(agentId);
    if (!personality) return "";

    const mood = this.getMood(agentId);

    let pool;
    switch (context) {
      case "greeting":
        pool = personality.greetings;
        break;
      case "task_start":
        pool = personality.taskStart;
        break;
      case "task_done":
        pool = personality.taskDone;
        break;
      case "task_error":
        pool = personality.taskError;
        break;
      case "idle":
        pool = personality.idle;
        break;
      default:
        pool = personality.idle;
    }

    const raw = pick(pool);
    return applyMoodTone(raw, mood);
  }

  /**
   * Return the agent's current ambient thought string (rotates periodically).
   * @param {string} agentId
   * @returns {string}
   */
  getThoughtBubble(agentId) {
    const key = this._agents.get(agentId);
    const state = this._moods.get(agentId);
    if (!key || !state) return "";

    const pool = THOUGHTS[key] || THOUGHTS.commander;
    if (!state._currentThought) {
      state._currentThought = pick(pool);
    }
    return state._currentThought;
  }

  /**
   * Force-rotate to a fresh thought bubble.
   * @param {string} agentId
   * @returns {string}  the new thought
   */
  rotateThought(agentId) {
    const key = this._agents.get(agentId);
    const state = this._moods.get(agentId);
    if (!key || !state) return "";

    const pool = THOUGHTS[key] || THOUGHTS.commander;
    // Avoid repeating the same thought twice in a row
    let next = pick(pool);
    let attempts = 0;
    while (next === state._currentThought && pool.length > 1 && attempts < 10) {
      next = pick(pool);
      attempts++;
    }
    state._currentThought = next;
    state._thoughtTimer = randRange(THOUGHT_INTERVAL_MIN, THOUGHT_INTERVAL_MAX);
    return next;
  }

  /**
   * Advance all mood timers.  Call from the game/render loop.
   * @param {number} dt  delta-time in seconds
   */
  update(dt) {
    const now = Date.now();

    for (const [agentId, state] of this._moods) {
      // Decay non-permanent moods
      if (state.mood !== "focused" && state.mood !== "tired") {
        state._moodTimer -= dt;
        if (state._moodTimer <= 0) {
          state.mood = "focused";
          state._moodTimer = 0;
        }
      }

      // Tired check: no task for IDLE_TIRED_THRESHOLD seconds
      if (state.mood === "focused") {
        state._idleTimer += dt;
        if (state._idleTimer >= IDLE_TIRED_THRESHOLD) {
          state.mood = "tired";
          state._moodTimer = MOOD_DURATIONS.tired;
        }
      }

      // Prune task-excitement window
      const cutoff = now - EXCITED_WINDOW_SECONDS * 1000;
      state._taskWindow = state._taskWindow.filter((t) => t > cutoff);

      // Thought-bubble rotation
      state._thoughtTimer -= dt;
      if (state._thoughtTimer <= 0) {
        this.rotateThought(agentId);
      }
    }
  }

  // ── Event reactions ───────────────────────────────────────────────────────

  _bindEvents() {
    if (typeof window === "undefined") return;

    this._boundHandlers = [];

    const onTaskComplete = (e) => {
      const { agentId } = e.detail || {};
      if (!agentId) return;

      const state = this._moods.get(agentId);
      if (!state) return;

      const now = Date.now();
      state._idleTimer = 0;
      state.lastTaskTime = now;
      state._taskWindow.push(now);

      // Check excitement threshold
      if (state._taskWindow.length >= EXCITED_TASK_THRESHOLD) {
        this.setMood(agentId, "excited");
      } else {
        this.setMood(agentId, "happy");
      }
    };

    const onTaskFailed = (e) => {
      const { agentId } = e.detail || {};
      if (!agentId) return;

      const state = this._moods.get(agentId);
      if (!state) return;

      state._idleTimer = 0;
      this.setMood(agentId, "worried");
    };

    const onTaskAssigned = (e) => {
      const { agentId } = e.detail || {};
      if (!agentId) return;

      const state = this._moods.get(agentId);
      if (!state) return;

      // Reset idle timer on any task assignment
      state._idleTimer = 0;
    };

    const onQuestComplete = (e) => {
      // Quest completion makes all participating agents excited for 5 min
      const { agentIds } = e.detail || {};
      const targets = Array.isArray(agentIds)
        ? agentIds
        : [...this._agents.keys()];

      for (const agentId of targets) {
        if (this._moods.has(agentId)) {
          this.setMood(agentId, "excited");
          // Override with longer duration for quests
          this._moods.get(agentId)._moodTimer = 300;
        }
      }
    };

    window.addEventListener("dispatch:task-complete", onTaskComplete);
    window.addEventListener("dispatch:task-failed", onTaskFailed);
    window.addEventListener("dispatch:task-assigned", onTaskAssigned);
    window.addEventListener("dispatch:quest-complete", onQuestComplete);

    this._boundHandlers.push(
      ["dispatch:task-complete", onTaskComplete],
      ["dispatch:task-failed", onTaskFailed],
      ["dispatch:task-assigned", onTaskAssigned],
      ["dispatch:quest-complete", onQuestComplete],
    );
  }

  /**
   * Remove all event listeners to prevent leaks.
   */
  destroy() {
    if (this._boundHandlers) {
      for (const [event, handler] of this._boundHandlers) {
        window.removeEventListener(event, handler);
      }
      this._boundHandlers = [];
    }
  }

  // ── Convenience: get all registered agent ids ─────────────────────────────

  /**
   * @returns {string[]}
   */
  getAgentIds() {
    return [...this._agents.keys()];
  }

  /**
   * Returns a snapshot of an agent's full personality + mood status.
   * Useful for UI panels.
   *
   * @param {string} agentId
   * @returns {object|null}
   */
  getStatus(agentId) {
    const personality = this.getPersonality(agentId);
    const state = this._moods.get(agentId);
    if (!personality || !state) return null;

    return {
      agentId,
      name: personality.name,
      emoji: personality.emoji,
      color: personality.color,
      role: personality.role,
      traits: personality.traits,
      mood: state.mood,
      energy: state.energy,
      thought: this.getThoughtBubble(agentId),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Factory
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create and return a new PersonalityEngine instance.
 * @returns {PersonalityEngine}
 */
export function initPersonalityEngine() {
  return new PersonalityEngine();
}

// Re-export the raw definitions for external inspection (e.g. UI panels)
export { AGENT_PERSONALITIES, THOUGHTS };
