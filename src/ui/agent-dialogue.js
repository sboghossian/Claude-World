/**
 * agent-dialogue.js — Rich agent dialogue panel for Claude World
 *
 * Replaces the placeholder agent panel with a full chat-style dialogue UI.
 * Integrates with PanelManager via its openAgent slot.
 *
 * Usage:
 *   import { AgentDialogue } from './agent-dialogue.js';
 *   const dialogue = new AgentDialogue(panelManager);
 *   dialogue.open({ id: 'commander', name: 'Commander', role: 'Dispatcher', ... });
 */

// ── Constants ────────────────────────────────────────────────────

const MAX_MESSAGES = 50;
const TYPEWRITER_DELAY_MS = 20;

/** Agent role to CSS color variable mapping. */
const ROLE_COLORS = {
  dispatcher: "var(--agent-dispatcher)",
  researcher: "var(--agent-researcher)",
  trainer: "var(--agent-trainer)",
  memory: "var(--agent-memory)",
  integrator: "var(--agent-integrator)",
};

/** Default greeting lines keyed by agent id. */
const GREETINGS = {
  commander: "The tower is operational. What needs dispatching?",
  librarian: "The archives are quiet today. What knowledge shall we catalog?",
  instructor: "Welcome to the academy. Ready to train a new skill?",
  archivist: "Memory banks are stable. What would you like me to remember?",
  dockmaster: "The docks are clear. Any new connections to establish?",
};

/** Quick-action sets keyed by role (lowercase). Falls back to default. */
const QUICK_ACTIONS = {
  dispatcher: [
    {
      label: "Route Task",
      prompt: "Route the following task to the best agent: ",
    },
    { label: "Summarize", prompt: "Summarize the current task queue." },
    { label: "Analyze", prompt: "Analyze the overall system workload." },
    { label: "Draft", prompt: "Draft a task delegation plan for: " },
  ],
  researcher: [
    { label: "Research", prompt: "Research the following topic: " },
    { label: "Summarize", prompt: "Summarize the key findings on: " },
    { label: "Analyze", prompt: "Analyze the data for: " },
    { label: "Draft", prompt: "Draft a research brief on: " },
  ],
  trainer: [
    { label: "Create Skill", prompt: "Create a new skill for: " },
    { label: "Summarize", prompt: "Summarize training progress for: " },
    { label: "Analyze", prompt: "Analyze skill gaps in: " },
    { label: "Draft", prompt: "Draft a training plan for: " },
  ],
  memory: [
    { label: "Remember", prompt: "Remember the following: " },
    { label: "Recall", prompt: "Recall everything about: " },
    { label: "Summarize", prompt: "Summarize stored memories about: " },
    { label: "Analyze", prompt: "Analyze memory patterns for: " },
  ],
  integrator: [
    { label: "Connect", prompt: "Establish a new connection to: " },
    { label: "Summarize", prompt: "Summarize active integrations." },
    { label: "Analyze", prompt: "Analyze integration health for: " },
    { label: "Draft", prompt: "Draft an integration plan for: " },
  ],
  _default: [
    { label: "Ask", prompt: "" },
    { label: "Summarize", prompt: "Summarize: " },
    { label: "Analyze", prompt: "Analyze: " },
    { label: "Draft", prompt: "Draft: " },
  ],
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

// ── AgentDialogue class ─────────────────────────────────────────

export class AgentDialogue {
  /**
   * @param {import('./panels.js').PanelManager} panelManager
   */
  constructor(panelManager) {
    /** @type {import('./panels.js').PanelManager} */
    this._panel = panelManager;

    /** @type {object|null} Current agent data. */
    this._agent = null;

    /** @type {Array<{role: string, text: string, timestamp: Date}>} */
    this._messages = [];

    /** @type {boolean} */
    this._isOpen = false;

    // DOM references (created lazily in _buildDOM)
    this._root = null;
    this._messagesEl = null;
    this._inputEl = null;
    this._sendBtn = null;
    this._typingEl = null;
    this._actionsEl = null;

    /** @type {number|null} Active typewriter interval id. */
    this._typewriterTimer = null;
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Open the dialogue panel for an agent.
   * @param {object} agentData — { id, name, role, personality, level, xp? }
   *   `role` is the functional role string (e.g. "Dispatcher").
   *   `personality` is the trait label (e.g. "Strategic").
   *   `level` defaults to 1. `xp` defaults to 0 (0-100).
   */
  open(agentData) {
    this._agent = {
      id: agentData.id || "unknown",
      name: agentData.name || "Unknown",
      role: agentData.role || "Agent",
      personality: agentData.personality || "Adaptive",
      level: agentData.level ?? 1,
      xp: agentData.xp ?? 0,
      colorKey:
        agentData.colorKey || agentData.role?.toLowerCase() || "dispatcher",
    };

    this._messages = [];
    this._clearTypewriter();

    const content = this._buildDOM();

    // Use PanelManager's internal _show to inject our rich content
    const color = ROLE_COLORS[this._agent.colorKey] || ROLE_COLORS.dispatcher;
    const initial = this._agent.name.charAt(0).toUpperCase();

    this._panel._show(
      "agent-dialogue",
      this._agent.id,
      "", // no emoji icon — we render our own avatar
      this._agent.name,
      content,
    );

    this._isOpen = true;

    // Show greeting with typewriter effect
    const greeting =
      GREETINGS[this._agent.id] ||
      `Greetings. I am ${this._agent.name}. How can I assist you?`;
    this.addMessage("agent", greeting);

    // Focus the input after opening
    requestAnimationFrame(() => {
      if (this._inputEl) this._inputEl.focus();
    });
  }

  /** Close the dialogue panel. */
  close() {
    this._clearTypewriter();
    this._isOpen = false;
    this._panel.close();
  }

  /**
   * Append a message to the dialogue.
   * Agent messages use typewriter effect; user messages appear instantly.
   * @param {'agent'|'user'} role
   * @param {string} text
   */
  addMessage(role, text) {
    const msg = { role, text, timestamp: new Date() };
    this._messages.push(msg);

    // Trim to max
    if (this._messages.length > MAX_MESSAGES) {
      this._messages.shift();
      // Remove oldest DOM node
      if (this._messagesEl && this._messagesEl.firstChild) {
        this._messagesEl.removeChild(this._messagesEl.firstChild);
      }
    }

    if (!this._messagesEl) return;

    if (role === "user") {
      this._appendMessageDOM(msg, text);
      this._scrollToBottom();
    } else {
      // Agent: show typing indicator, then typewriter
      this.showLoading();
      this._typewriterTimer = setTimeout(
        () => {
          this.hideLoading();
          this._typewriteMessage(msg);
        },
        400 + Math.random() * 200,
      );
    }
  }

  /** Show the three-dot typing indicator. */
  showLoading() {
    if (this._typingEl) {
      this._typingEl.hidden = false;
      this._typingEl.setAttribute("aria-hidden", "false");
      this._scrollToBottom();
    }
  }

  /** Hide the typing indicator. */
  hideLoading() {
    if (this._typingEl) {
      this._typingEl.hidden = true;
      this._typingEl.setAttribute("aria-hidden", "true");
    }
  }

  // ── DOM construction ────────────────────────────────────────────

  /** @returns {HTMLElement} The full dialogue panel content. */
  _buildDOM() {
    const agent = this._agent;
    const roleColor = ROLE_COLORS[agent.colorKey] || ROLE_COLORS.dispatcher;

    const root = el("div", "agent-dialogue");
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", `Dialogue with ${agent.name}`);
    this._root = root;

    // ── Header ────────────────────────────────────────────────────
    const header = el("div", "agent-dialogue__header");

    const avatar = el("div", "agent-dialogue__avatar");
    avatar.style.background = roleColor;
    avatar.textContent = agent.name.charAt(0).toUpperCase();
    avatar.setAttribute("aria-hidden", "true");

    const info = el("div", "agent-dialogue__info");

    const name = el("div", "agent-dialogue__name", { textContent: agent.name });

    const badges = el("div", "agent-dialogue__badges");
    const roleBadge = el(
      "span",
      "agent-dialogue__badge agent-dialogue__badge--role",
      { textContent: agent.role },
    );
    const personalityBadge = el(
      "span",
      "agent-dialogue__badge agent-dialogue__badge--personality",
      { textContent: agent.personality },
    );
    badges.appendChild(roleBadge);
    badges.appendChild(personalityBadge);

    const level = el("div", "agent-dialogue__level");
    const levelText = el("span", "agent-dialogue__level-text", {
      textContent: `Lv. ${agent.level}`,
    });
    const xpBar = el("div", "agent-dialogue__xp-bar");
    xpBar.setAttribute("role", "progressbar");
    xpBar.setAttribute("aria-label", `Experience: ${agent.xp}%`);
    xpBar.setAttribute("aria-valuenow", String(agent.xp));
    xpBar.setAttribute("aria-valuemin", "0");
    xpBar.setAttribute("aria-valuemax", "100");
    const xpFill = el("div", "agent-dialogue__xp-fill");
    xpFill.style.width = `${agent.xp}%`;
    xpFill.style.background = roleColor;
    xpBar.appendChild(xpFill);
    level.appendChild(levelText);
    level.appendChild(xpBar);

    info.appendChild(name);
    info.appendChild(badges);
    info.appendChild(level);
    header.appendChild(avatar);
    header.appendChild(info);
    root.appendChild(header);

    // ── Messages area ─────────────────────────────────────────────
    const messages = el("div", "agent-dialogue__messages");
    messages.setAttribute("role", "log");
    messages.setAttribute("aria-label", "Message history");
    messages.setAttribute("aria-live", "polite");
    messages.setAttribute("aria-relevant", "additions");
    this._messagesEl = messages;
    root.appendChild(messages);

    // ── Typing indicator (hidden by default) ──────────────────────
    const typing = el("div", "agent-dialogue__typing");
    typing.hidden = true;
    typing.setAttribute("aria-hidden", "true");
    typing.setAttribute("aria-label", `${agent.name} is typing`);

    const typingAvatar = el(
      "div",
      "agent-dialogue__avatar agent-dialogue__avatar--small",
    );
    typingAvatar.style.background = roleColor;
    typingAvatar.textContent = agent.name.charAt(0).toUpperCase();
    typingAvatar.setAttribute("aria-hidden", "true");

    const dots = el("div", "agent-dialogue__typing-dots");
    dots.appendChild(el("span", "agent-dialogue__typing-dot"));
    dots.appendChild(el("span", "agent-dialogue__typing-dot"));
    dots.appendChild(el("span", "agent-dialogue__typing-dot"));

    typing.appendChild(typingAvatar);
    typing.appendChild(dots);
    this._typingEl = typing;
    root.appendChild(typing);

    // ── Quick actions ─────────────────────────────────────────────
    const actionsData = QUICK_ACTIONS[agent.colorKey] || QUICK_ACTIONS._default;
    const actions = el("div", "agent-dialogue__actions");
    actions.setAttribute("role", "toolbar");
    actions.setAttribute("aria-label", "Quick actions");
    this._actionsEl = actions;

    for (const action of actionsData) {
      const btn = el("button", "agent-dialogue__action-btn", {
        textContent: action.label,
        "aria-label": `${action.label} action`,
      });
      btn.addEventListener("click", () => this._handleQuickAction(action));
      actions.appendChild(btn);
    }
    root.appendChild(actions);

    // ── Input bar ─────────────────────────────────────────────────
    const inputBar = el("div", "agent-dialogue__input-bar");

    const input = el("input", "agent-dialogue__input", {
      type: "text",
      placeholder: `Ask ${agent.name} something...`,
      "aria-label": `Message input for ${agent.name}`,
      autocomplete: "off",
    });
    this._inputEl = input;

    const sendBtn = el("button", "agent-dialogue__send-btn", {
      textContent: "Send",
      "aria-label": "Send message",
    });
    this._sendBtn = sendBtn;

    sendBtn.addEventListener("click", () => this._handleSend());

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        this._handleSend();
      }
    });

    inputBar.appendChild(input);
    inputBar.appendChild(sendBtn);
    root.appendChild(inputBar);

    return root;
  }

  // ── Message rendering ───────────────────────────────────────────

  /**
   * Append a fully-rendered message to the DOM.
   * @param {{role: string, text: string, timestamp: Date}} msg
   * @param {string} displayText — the text to show (may differ during typewriter)
   * @returns {HTMLElement} The bubble element (for typewriter updates)
   */
  _appendMessageDOM(msg, displayText) {
    const agent = this._agent;
    const roleColor = ROLE_COLORS[agent.colorKey] || ROLE_COLORS.dispatcher;

    const wrap = el(
      "div",
      `agent-dialogue__msg agent-dialogue__msg--${msg.role}`,
    );
    wrap.setAttribute("role", "article");
    wrap.setAttribute(
      "aria-label",
      `${msg.role === "agent" ? agent.name : "You"} at ${formatTime(msg.timestamp)}`,
    );

    if (msg.role === "agent") {
      const av = el(
        "div",
        "agent-dialogue__avatar agent-dialogue__avatar--small",
      );
      av.style.background = roleColor;
      av.textContent = agent.name.charAt(0).toUpperCase();
      av.setAttribute("aria-hidden", "true");
      wrap.appendChild(av);
    }

    const bubbleWrap = el("div");

    const bubble = el("div", "agent-dialogue__bubble", {
      textContent: displayText,
    });
    bubbleWrap.appendChild(bubble);

    const ts = el("div", "agent-dialogue__timestamp", {
      textContent: formatTime(msg.timestamp),
    });
    bubbleWrap.appendChild(ts);

    wrap.appendChild(bubbleWrap);
    this._messagesEl.appendChild(wrap);

    return bubble;
  }

  /**
   * Render agent message with typewriter effect.
   * @param {{role: string, text: string, timestamp: Date}} msg
   */
  _typewriteMessage(msg) {
    const bubble = this._appendMessageDOM(msg, "");
    let i = 0;
    const text = msg.text;

    this._clearTypewriter();
    this._typewriterTimer = setInterval(() => {
      i++;
      bubble.textContent = text.slice(0, i);
      this._scrollToBottom();

      if (i >= text.length) {
        this._clearTypewriter();
      }
    }, TYPEWRITER_DELAY_MS);
  }

  _clearTypewriter() {
    if (this._typewriterTimer != null) {
      clearInterval(this._typewriterTimer);
      clearTimeout(this._typewriterTimer);
      this._typewriterTimer = null;
    }
  }

  _scrollToBottom() {
    if (this._messagesEl) {
      this._messagesEl.scrollTop = this._messagesEl.scrollHeight;
    }
  }

  // ── Event handlers ──────────────────────────────────────────────

  _handleSend() {
    if (!this._inputEl) return;
    const text = this._inputEl.value.trim();
    if (!text) return;

    this._inputEl.value = "";

    // Add user message
    this.addMessage("user", text);

    // Emit event for the dispatch system
    document.dispatchEvent(
      new CustomEvent("agent-dialogue:send", {
        detail: { agentId: this._agent.id, message: text },
        bubbles: true,
      }),
    );
  }

  /**
   * Handle a quick-action button press.
   * If the prompt is empty, just focus the input (for "Ask").
   * Otherwise pre-fill the input with the prompt text and focus.
   * @param {{label: string, prompt: string}} action
   */
  _handleQuickAction(action) {
    if (!this._inputEl) return;

    if (action.prompt) {
      this._inputEl.value = action.prompt;
    }
    this._inputEl.focus();

    // Place cursor at end
    const len = this._inputEl.value.length;
    this._inputEl.setSelectionRange(len, len);
  }
}
