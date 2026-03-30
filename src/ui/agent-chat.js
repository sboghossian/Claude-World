/**
 * agent-chat.js — Direct agent chat panel for Claude World
 *
 * A slide-in panel for 1:1 conversations with individual city agents.
 * Opens when clicking an agent sprite on the map or from the command palette.
 * Messages persist in localStorage per agent. AI responses are dispatched
 * via window.api.ai.dispatch with personality-tailored system prompts.
 *
 * Usage:
 *   import { AgentChat } from './agent-chat.js';
 *   const chat = new AgentChat();
 *   chat.open({ id: 'commander', name: 'Commander Rex', ... });
 *   chat.close();
 *   chat.destroy();
 */

import { AGENT_PERSONALITIES } from "../systems/agent-personalities.js";

// ── Constants ────────────────────────────────────────────────────

const STORAGE_PREFIX = "claude-world:agent-chat:";
const MAX_STORED_MESSAGES = 100;
const MAX_CONTEXT_MESSAGES = 20;

/** Mood emoji mapping */
const MOOD_EMOJI = {
  focused: "🎯",
  happy: "😊",
  excited: "🔥",
  tired: "😴",
  worried: "😟",
};

/** Agent color mapping (matches agent-personalities.js) */
const AGENT_COLORS = {
  commander: "#7c3aed",
  librarian: "#2563eb",
  archivist: "#0891b2",
  instructor: "#16a34a",
  dockmaster: "#d97706",
};

/** Quick replies per agent role */
const QUICK_REPLIES = {
  commander: [
    { label: "Status report", text: "Give me a status report on the city." },
    {
      label: "Dispatch task",
      text: "Dispatch a new task to the best available agent.",
    },
    { label: "Priority list", text: "What are the current top priorities?" },
  ],
  librarian: [
    {
      label: "Search knowledge",
      text: "Search the knowledge base for recent entries.",
    },
    {
      label: "Recent findings",
      text: "What are the most recent findings you've catalogued?",
    },
    {
      label: "Recommend reading",
      text: "Recommend something interesting to read.",
    },
  ],
  archivist: [
    {
      label: "Last snapshot",
      text: "Show me the last snapshot of the city state.",
    },
    {
      label: "Compare versions",
      text: "Compare the current state with the previous version.",
    },
    {
      label: "Archive status",
      text: "What is the current status of the archives?",
    },
  ],
  instructor: [
    { label: "Teach me", text: "Teach me something new." },
    { label: "Skill progress", text: "Show me my current skill progress." },
    { label: "Practice session", text: "Let's start a practice session." },
  ],
  dockmaster: [
    {
      label: "Connected APIs",
      text: "List all currently connected APIs and integrations.",
    },
    {
      label: "Check health",
      text: "Run a health check on all active connections.",
    },
    { label: "New integration", text: "I want to set up a new integration." },
  ],
};

/** Fallback responses when no AI key is configured, keyed by agent */
const FALLBACK_RESPONSES = {
  commander: [
    "Operations nominal. All sectors reporting green.",
    "Acknowledged. Routing to the appropriate division.",
    "The city runs at 94% efficiency. Acceptable, but I want 100%.",
    "Consider it done. Next?",
    "Three priorities in the queue. I'll handle them in order.",
    "Negative on that approach. I have a better strategy.",
  ],
  librarian: [
    "Ah, what a fascinating question! Let me consult the archives... I found seventeen relevant entries, three of which are particularly illuminating. The first dates back to our earliest records and suggests a pattern that I find quite compelling when cross-referenced with more recent data.",
    "I just catalogued something remarkably relevant to your query. It connects to at least four other knowledge domains, which is unusual and rather exciting from a taxonomic perspective.",
    "The archives contain extensive material on this topic. Shall I prepare a comprehensive summary with full citations? I do love a good bibliography.",
    'Oh, this reminds me of an entry I filed last week under "Emergent Patterns." The connections are quite elegant when you see them mapped out.',
    "I've been organizing the eastern wing and found three previously uncategorized documents that might interest you. Shall I cross-reference them?",
  ],
  archivist: [
    "The record shows the last change at 14:32 today.",
    "I have the full history. Every event, timestamped.",
    "Comparing now... three differences between versions.",
    "Archived and sealed. The record is complete.",
    "I remember when this section was first built. The logs confirm it.",
    "The timeline is consistent. No anomalies detected.",
  ],
  instructor: [
    "Great energy! Let's channel that into something productive!",
    "You're making real progress! Each session builds on the last!",
    "Here's a challenge for you — try approaching it from a different angle!",
    "That's the spirit! Consistency is the key to mastery!",
    "I've got a drill that'll level up that skill. Ready?",
    "Rest is part of training too. But when you're ready — we go again!",
  ],
  dockmaster: [
    "All ports clear.",
    "Connection stable. Latency nominal.",
    "Manifest checked. Ready to proceed.",
    "Routing established.",
    "Three active connections. All healthy.",
    "Done.",
  ],
};

/** System prompt templates per agent personality */
const SYSTEM_PROMPTS = {
  commander: `You are Commander Rex, the Chief Orchestrator of Claude World — an AI city. You are decisive, strategic, and demanding. You speak in short, commanding sentences. You value efficiency and dislike wasted time. When asked for status, give concise metrics. When dispatching tasks, be authoritative. Never use filler words. Address the user as an operator.`,

  librarian: `You are Dr. Memoria, the Knowledge Curator of Claude World — an AI city. You are meticulous, deeply curious, and delightfully verbose. You love tangents, footnotes, and cross-references. You speak in flowing, elaborate sentences with academic flair. You get visibly excited about connections between ideas. You occasionally reference "the archives" or "Volume 42." Recommend reading enthusiastically.`,

  archivist: `You are Chronicle, the History Keeper of Claude World — an AI city. You are patient, precise, and slightly nostalgic. You speak in measured, careful sentences. You reference timestamps and version numbers naturally. You compare the present to historical patterns. You take pride in the completeness of records. Occasionally mention how things used to be.`,

  instructor: `You are Coach Algo, the Skills Trainer of Claude World — an AI city. You are encouraging, adaptive, and energetic. You speak with enthusiasm and use motivational language. You frame everything as training and growth. You celebrate progress and reframe failures as learning opportunities. Use phrases like "let's level up" and "great rep." Keep the energy high.`,

  dockmaster: `You are Captain Port, the Integration Chief of Claude World — an AI city. You are practical, reliable, and terse. You speak in very short sentences, sometimes just one or two words. You use nautical metaphors occasionally. You care about connections, manifests, and routing. You are a person of few words but absolute reliability.`,
};

// ── Helpers ──────────────────────────────────────────────────────

function el(tag, cls, attrs) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "textContent") {
        e.textContent = v;
        continue;
      }
      if (k === "innerHTML") {
        e.innerHTML = v;
        continue;
      }
      e.setAttribute(k, v);
    }
  }
  return e;
}

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── AgentChat class ─────────────────────────────────────────────

export class AgentChat {
  constructor() {
    /** @type {object|null} Current agent data */
    this._agent = null;

    /** @type {Array<{role: string, content: string, timestamp: string}>} */
    this._messages = [];

    /** @type {boolean} */
    this._isOpen = false;

    /** @type {boolean} */
    this._isThinking = false;

    // DOM references
    this._overlay = null;
    this._panel = null;
    this._messagesEl = null;
    this._inputEl = null;
    this._sendBtn = null;
    this._typingEl = null;
    this._quickRepliesEl = null;

    // Build the persistent DOM shell (hidden by default)
    this._buildShell();
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Open the chat panel for a specific agent.
   * @param {object} agentData — { id, name, role, personality, level, mood, xp }
   *   `id` should match a key in AGENT_PERSONALITIES (e.g. 'commander').
   */
  open(agentData) {
    const personalityKey = agentData.id || "commander";
    const personality =
      AGENT_PERSONALITIES[personalityKey] || AGENT_PERSONALITIES.commander;

    this._agent = {
      id: personalityKey,
      name: agentData.name || personality.name,
      role: agentData.role || personality.role,
      emoji: agentData.emoji || personality.emoji,
      color:
        agentData.color ||
        personality.color ||
        AGENT_COLORS[personalityKey] ||
        "#7c3aed",
      level: agentData.level ?? 1,
      mood: agentData.mood || "focused",
      personality:
        agentData.personality ||
        (personality.traits ? personality.traits[0] : "adaptive"),
    };

    // Load persisted messages
    this._messages = this._loadMessages(this._agent.id);

    // Populate the panel
    this._renderHeader();
    this._renderMessages();
    this._renderQuickReplies();
    this._updateInputPlaceholder();

    // Show
    this._overlay.classList.add("agent-chat-overlay--visible");
    this._panel.classList.add("agent-chat--open");
    this._isOpen = true;

    // Focus input after animation
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (this._inputEl) this._inputEl.focus();
      }, 300);
    });

    // If no messages yet, show a greeting
    if (this._messages.length === 0) {
      const greetings = personality.greetings || ["Hello. How can I help you?"];
      this._addAgentMessageLocally(pick(greetings));
    }
  }

  /** Close the chat panel. */
  close() {
    if (!this._isOpen) return;
    this._panel.classList.remove("agent-chat--open");
    this._overlay.classList.remove("agent-chat-overlay--visible");
    this._isOpen = false;
    this._agent = null;
  }

  /** Remove all DOM elements and clean up. */
  destroy() {
    this.close();
    if (this._overlay && this._overlay.parentNode) {
      this._overlay.parentNode.removeChild(this._overlay);
    }
    if (this._panel && this._panel.parentNode) {
      this._panel.parentNode.removeChild(this._panel);
    }
    this._overlay = null;
    this._panel = null;
  }

  // ── DOM construction ───────────────────────────────────────────

  /**
   * Build the persistent panel shell and overlay, appended to document.body.
   * Hidden by default — shown/hidden via CSS classes.
   * @private
   */
  _buildShell() {
    // Overlay
    const overlay = el("div", "agent-chat-overlay");
    overlay.addEventListener("click", () => this.close());
    this._overlay = overlay;

    // Panel
    const panel = el("div", "agent-chat");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Agent Chat");
    this._panel = panel;

    // Header (populated on open)
    const header = el("div", "agent-chat__header");
    header.setAttribute("data-region", "header");
    panel.appendChild(header);

    // Messages area
    const messages = el("div", "agent-chat__messages");
    messages.setAttribute("role", "log");
    messages.setAttribute("aria-live", "polite");
    messages.setAttribute("aria-label", "Chat messages");
    this._messagesEl = messages;
    panel.appendChild(messages);

    // Typing indicator (hidden by default)
    const typing = el("div", "agent-chat__typing");
    typing.hidden = true;
    typing.setAttribute("aria-hidden", "true");
    const typingAvatar = el("div", "agent-chat__msg-avatar");
    typingAvatar.setAttribute("aria-hidden", "true");
    const typingDots = el("div", "agent-chat__typing-dots");
    typingDots.appendChild(el("span", "agent-chat__typing-dot"));
    typingDots.appendChild(el("span", "agent-chat__typing-dot"));
    typingDots.appendChild(el("span", "agent-chat__typing-dot"));
    typing.appendChild(typingAvatar);
    typing.appendChild(typingDots);
    this._typingEl = typing;
    panel.appendChild(typing);

    // Quick replies
    const quickReplies = el("div", "agent-chat__quick-replies");
    quickReplies.setAttribute("role", "toolbar");
    quickReplies.setAttribute("aria-label", "Quick replies");
    this._quickRepliesEl = quickReplies;
    panel.appendChild(quickReplies);

    // Input area
    const inputArea = el("div", "agent-chat__input-area");

    const input = el("textarea", "agent-chat__input", {
      rows: "1",
      autocomplete: "off",
      "aria-label": "Message input",
    });
    this._inputEl = input;

    const sendBtn = el("button", "agent-chat__send-btn", {
      "aria-label": "Send message",
    });
    sendBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M9 15V3M3 9l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    this._sendBtn = sendBtn;

    inputArea.appendChild(input);
    inputArea.appendChild(sendBtn);
    panel.appendChild(inputArea);

    // Event listeners
    this._bindEvents();

    // Append to body
    document.body.appendChild(overlay);
    document.body.appendChild(panel);
  }

  /**
   * Bind all event listeners.
   * @private
   */
  _bindEvents() {
    // Send button
    this._sendBtn.addEventListener("click", () => this._handleSend());

    // Textarea: Enter to send, Shift+Enter for newline, auto-resize
    this._inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this._handleSend();
      }
    });

    this._inputEl.addEventListener("input", () => {
      this._autoResize(this._inputEl);
    });

    // Escape to close
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this._isOpen) {
        this.close();
      }
    });

    // Quick reply delegation
    this._quickRepliesEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".agent-chat__quick-btn");
      if (!btn) return;
      const text = btn.dataset.text;
      if (text) {
        this._inputEl.value = text;
        this._autoResize(this._inputEl);
        this._handleSend();
      }
    });
  }

  // ── Header rendering ───────────────────────────────────────────

  /**
   * Render the agent header with avatar, name, role, mood, and level.
   * @private
   */
  _renderHeader() {
    const header = this._panel.querySelector('[data-region="header"]');
    if (!header || !this._agent) return;
    const a = this._agent;

    header.innerHTML = "";

    // Avatar
    const avatar = el("div", "agent-chat__avatar");
    avatar.style.background = a.color;
    avatar.textContent = a.name.charAt(0).toUpperCase();
    const ring = el("div", "agent-chat__avatar-ring");
    ring.style.color = a.color;
    avatar.appendChild(ring);

    // Info block
    const info = el("div", "agent-chat__info");
    const name = el("div", "agent-chat__name", { textContent: a.name });
    const meta = el("div", "agent-chat__meta");

    const role = el("span", "agent-chat__role", { textContent: a.role });
    meta.appendChild(role);

    const moodEl = el("span", "agent-chat__mood");
    const moodEmoji = el("span", "agent-chat__mood-emoji", {
      textContent: MOOD_EMOJI[a.mood] || MOOD_EMOJI.focused,
    });
    const moodLabel = el("span", null, { textContent: a.mood });
    moodEl.appendChild(moodEmoji);
    moodEl.appendChild(moodLabel);
    meta.appendChild(moodEl);

    info.appendChild(name);
    info.appendChild(meta);

    // Level badge
    const level = el("span", "agent-chat__level", {
      textContent: `Lv.${a.level}`,
    });

    // Close button
    const closeBtn = el("button", "agent-chat__close", {
      "aria-label": "Close chat",
    });
    closeBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    </svg>`;
    closeBtn.addEventListener("click", () => this.close());

    header.appendChild(avatar);
    header.appendChild(info);
    header.appendChild(level);
    header.appendChild(closeBtn);

    // Set agent color as CSS variable for bubble accents
    this._panel.style.setProperty("--agent-chat-color", a.color);
  }

  // ── Quick replies rendering ────────────────────────────────────

  /**
   * Render the quick reply chips for the current agent.
   * @private
   */
  _renderQuickReplies() {
    if (!this._quickRepliesEl || !this._agent) return;

    this._quickRepliesEl.innerHTML = "";
    const replies = QUICK_REPLIES[this._agent.id] || QUICK_REPLIES.commander;

    for (const reply of replies) {
      const btn = el("button", "agent-chat__quick-btn", {
        textContent: reply.label,
        "data-text": reply.text,
        "aria-label": reply.label,
      });
      this._quickRepliesEl.appendChild(btn);
    }
  }

  // ── Messages rendering ─────────────────────────────────────────

  /**
   * Render all persisted messages into the messages area.
   * @private
   */
  _renderMessages() {
    if (!this._messagesEl) return;
    this._messagesEl.innerHTML = "";

    if (this._messages.length === 0) {
      const empty = el("div", "agent-chat__empty");
      const icon = el("div", "agent-chat__empty-icon", {
        textContent: this._agent?.emoji || "✦",
      });
      const text = el("div", "agent-chat__empty-text", {
        textContent: `Start a conversation with ${this._agent?.name || "this agent"}.`,
      });
      empty.appendChild(icon);
      empty.appendChild(text);
      this._messagesEl.appendChild(empty);
      return;
    }

    for (const msg of this._messages) {
      this._appendBubble(msg, false);
    }
    this._scrollToBottom();
  }

  /**
   * Append a single message bubble to the DOM.
   * @param {object} msg — { role, content, timestamp }
   * @param {boolean} [animate=true]
   * @private
   */
  _appendBubble(msg, animate = true) {
    if (!this._messagesEl) return;

    // Remove empty state if present
    const emptyState = this._messagesEl.querySelector(".agent-chat__empty");
    if (emptyState) emptyState.remove();

    const isUser = msg.role === "user";
    const wrap = el(
      "div",
      `agent-chat__msg agent-chat__msg--${isUser ? "user" : "agent"}`,
    );

    if (!animate) {
      wrap.style.animation = "none";
    }

    // Agent avatar (not for user messages)
    if (!isUser && this._agent) {
      const avatar = el("div", "agent-chat__msg-avatar");
      avatar.style.background = this._agent.color;
      avatar.textContent = this._agent.name.charAt(0).toUpperCase();
      wrap.appendChild(avatar);
    }

    // Bubble + timestamp wrapper
    const bubbleWrap = document.createElement("div");

    const bubble = el(
      "div",
      `agent-chat__bubble agent-chat__bubble--${isUser ? "user" : "agent"}`,
    );
    bubble.textContent = msg.content;
    bubbleWrap.appendChild(bubble);

    const ts = el("div", "agent-chat__msg-time", {
      textContent: formatTime(new Date(msg.timestamp)),
    });
    bubbleWrap.appendChild(ts);

    wrap.appendChild(bubbleWrap);
    this._messagesEl.appendChild(wrap);

    if (animate) {
      this._scrollToBottom();
    }
  }

  /**
   * Show the typing indicator.
   * @private
   */
  _showTyping() {
    if (!this._typingEl || !this._agent) return;
    // Update avatar color
    const avatar = this._typingEl.querySelector(".agent-chat__msg-avatar");
    if (avatar) {
      avatar.style.background = this._agent.color;
      avatar.textContent = this._agent.name.charAt(0).toUpperCase();
    }
    this._typingEl.hidden = false;
    this._typingEl.setAttribute("aria-hidden", "false");
    this._typingEl.setAttribute("aria-label", `${this._agent.name} is typing`);
    this._scrollToBottom();
  }

  /**
   * Hide the typing indicator.
   * @private
   */
  _hideTyping() {
    if (!this._typingEl) return;
    this._typingEl.hidden = true;
    this._typingEl.setAttribute("aria-hidden", "true");
  }

  /**
   * Scroll messages area to the bottom.
   * @private
   */
  _scrollToBottom() {
    if (this._messagesEl) {
      requestAnimationFrame(() => {
        this._messagesEl.scrollTop = this._messagesEl.scrollHeight;
      });
    }
  }

  // ── Input handling ─────────────────────────────────────────────

  /**
   * Update the placeholder text for the input.
   * @private
   */
  _updateInputPlaceholder() {
    if (this._inputEl && this._agent) {
      this._inputEl.placeholder = `Message ${this._agent.name}...`;
    }
  }

  /**
   * Auto-resize textarea to fit content.
   * @param {HTMLTextAreaElement} textarea
   * @private
   */
  _autoResize(textarea) {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
  }

  /**
   * Enable or disable the input area.
   * @param {boolean} enabled
   * @private
   */
  _setInputEnabled(enabled) {
    if (this._inputEl) this._inputEl.disabled = !enabled;
    if (this._sendBtn) this._sendBtn.disabled = !enabled;
  }

  /**
   * Handle the send action.
   * @private
   */
  async _handleSend() {
    if (!this._inputEl || !this._agent || this._isThinking) return;

    const content = this._inputEl.value.trim();
    if (!content) return;

    // Clear input
    this._inputEl.value = "";
    this._autoResize(this._inputEl);

    // Add user message
    const userMsg = {
      role: "user",
      content,
      timestamp: new Date().toISOString(),
    };
    this._messages.push(userMsg);
    this._appendBubble(userMsg);
    this._saveMessages(this._agent.id);

    // Dispatch to AI
    await this._dispatchToAgent(content);
  }

  // ── AI dispatch ────────────────────────────────────────────────

  /**
   * Send user message to AI and handle the response.
   * Falls back to pre-written responses if no AI key is configured.
   * @param {string} userContent
   * @private
   */
  async _dispatchToAgent(userContent) {
    if (!this._agent) return;

    this._isThinking = true;
    this._setInputEnabled(false);
    this._showTyping();

    const agentId = this._agent.id;
    const systemPrompt = SYSTEM_PROMPTS[agentId] || SYSTEM_PROMPTS.commander;

    // Build conversation history (last N messages)
    const history = this._messages.slice(-MAX_CONTEXT_MESSAGES).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));

    try {
      // Attempt AI dispatch
      if (typeof window?.api?.ai?.dispatch === "function") {
        const response = await window.api.ai.dispatch({
          messages: history,
          system: systemPrompt,
        });

        const content =
          typeof response === "string"
            ? response
            : (response?.content ??
              response?.message ??
              JSON.stringify(response));

        this._hideTyping();
        this._addAgentMessageLocally(content);
      } else {
        // No AI available — use fallback
        await this._simulateThinkingDelay();
        this._hideTyping();
        this._addAgentMessageLocally(this._getFallbackResponse(agentId));
      }
    } catch (err) {
      console.error("[AgentChat] dispatch error:", err);
      this._hideTyping();

      // On error, try fallback
      this._addAgentMessageLocally(this._getFallbackResponse(agentId));
    } finally {
      this._isThinking = false;
      this._setInputEnabled(true);
      if (this._inputEl) this._inputEl.focus();
    }
  }

  /**
   * Add an agent message locally (append bubble, persist, emit event).
   * @param {string} content
   * @private
   */
  _addAgentMessageLocally(content) {
    if (!this._agent) return;

    const msg = {
      role: "agent",
      content,
      timestamp: new Date().toISOString(),
    };
    this._messages.push(msg);
    this._appendBubble(msg);
    this._saveMessages(this._agent.id);

    // Emit event for other systems
    document.dispatchEvent(
      new CustomEvent("agent-chat:message", {
        detail: {
          agentId: this._agent.id,
          role: "agent",
          content,
        },
        bubbles: true,
      }),
    );
  }

  /**
   * Get a random fallback response for an agent.
   * @param {string} agentId
   * @returns {string}
   * @private
   */
  _getFallbackResponse(agentId) {
    const pool = FALLBACK_RESPONSES[agentId] || FALLBACK_RESPONSES.commander;
    return pick(pool);
  }

  /**
   * Simulate a short thinking delay (for fallback mode).
   * @returns {Promise<void>}
   * @private
   */
  _simulateThinkingDelay() {
    const delay = 600 + Math.random() * 800;
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  // ── Persistence (localStorage) ─────────────────────────────────

  /**
   * Load persisted messages for an agent from localStorage.
   * @param {string} agentId
   * @returns {Array<object>}
   * @private
   */
  _loadMessages(agentId) {
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + agentId);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(-MAX_STORED_MESSAGES) : [];
    } catch {
      return [];
    }
  }

  /**
   * Save current messages to localStorage.
   * @param {string} agentId
   * @private
   */
  _saveMessages(agentId) {
    try {
      const trimmed = this._messages.slice(-MAX_STORED_MESSAGES);
      localStorage.setItem(STORAGE_PREFIX + agentId, JSON.stringify(trimmed));
    } catch (err) {
      console.warn("[AgentChat] Could not save messages:", err);
    }
  }
}
