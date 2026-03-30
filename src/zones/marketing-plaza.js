/**
 * marketing-plaza.js — Marketing Plaza zone: AI content factory
 *
 * Generate blog posts, Twitter threads, newsletters, LinkedIn posts,
 * and ad copy using AI. Content is stored as a persistent library
 * and can be copied to clipboard instantly.
 *
 * Emits:
 *   dispatch:task-complete — { worldId, zoneType: 'marketing', success: true }
 *
 * Vanilla JS + CSS. Pairs with marketing-plaza.css.
 */

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Escape HTML entities for safe rendering.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Format an ISO datetime string to a relative human-readable label.
 * @param {string|null} iso
 * @returns {string}
 */
function relativeTime(iso) {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return "Just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Count words in a string.
 * @param {string} text
 * @returns {number}
 */
function wordCount(text) {
  if (!text || !text.trim()) return 0;
  return text.trim().split(/\s+/).length;
}

/**
 * Format a word count with commas.
 * @param {number} n
 * @returns {string}
 */
function fmtWords(n) {
  return n.toLocaleString();
}

// ── Content type config ───────────────────────────────────────────────

const CONTENT_TYPES = {
  blog: {
    label: "Blog Post",
    icon: "📝",
    placeholder: 'e.g. "How AI is transforming content marketing in 2025"',
  },
  tweet: {
    label: "Twitter Thread",
    icon: "🐦",
    placeholder: 'e.g. "5 productivity tips for remote teams"',
  },
  newsletter: {
    label: "Newsletter",
    icon: "📧",
    placeholder: 'e.g. "Weekly roundup: top AI tools to try this week"',
  },
  linkedin: {
    label: "LinkedIn Post",
    icon: "💼",
    placeholder: 'e.g. "Lessons learned after 3 years building a startup"',
  },
  ad: {
    label: "Ad Copy",
    icon: "📢",
    placeholder:
      'e.g. "Launch campaign for our new SaaS product targeting CTOs"',
  },
};

const TONES = {
  professional: { label: "Professional", emoji: "🎩" },
  casual: { label: "Casual", emoji: "😎" },
  witty: { label: "Witty", emoji: "🃏" },
  urgent: { label: "Urgent", emoji: "🔥" },
};

const SYSTEM_PROMPTS = {
  blog: "You are an expert blogger. Write engaging, SEO-friendly blog posts with clear headings and actionable insights.",
  tweet:
    "You are a social media expert. Write a Twitter thread (5-7 tweets) with hook, value, and CTA. Number each tweet.",
  newsletter:
    "You are a newsletter writer. Write a concise, value-packed newsletter with a strong subject line.",
  linkedin:
    "You are a LinkedIn content strategist. Write a professional post that drives engagement.",
  ad: "You are an advertising copywriter. Write compelling ad copy with headline, body, and CTA. Under 100 words.",
};

// ── MarketingPlaza class ──────────────────────────────────────────────

export class MarketingPlaza {
  constructor() {
    /** @type {string|null} */
    this._worldId = null;
    /** @type {Array<object>} */
    this._pieces = [];
    /** @type {string} */
    this._activeType = "blog";
    /** @type {string} */
    this._activeTone = "professional";
    /** @type {boolean} */
    this._generating = false;
    /** @type {HTMLElement|null} */
    this._el = null;

    // Sub-element refs — set during render()
    this._statsTotal = null;
    this._statsWords = null;
    this._statsTopType = null;
    this._libraryGrid = null;
    this._generatorForm = null;
    this._briefInput = null;
    this._titleInput = null;
    this._generateBtn = null;
    this._streamOutput = null;
    this._streamMeta = null;
    this._copyBtn = null;
    this._outputSection = null;
    this._typePills = {};
    this._tonePills = {};
    this._streamCursor = null;
    this._currentContent = "";
  }

  // ═══════════════════════════════════════════════════════════════════
  // CSS injection
  // ═══════════════════════════════════════════════════════════════════

  _injectCSS() {
    const id = "marketing-plaza-styles";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "src/zones/marketing-plaza.css";
    document.head.appendChild(link);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public render() — creates and returns root element
  // ═══════════════════════════════════════════════════════════════════

  render() {
    this._injectCSS();

    const root = this._el("div", "marketing-plaza");
    root.setAttribute("role", "region");
    root.setAttribute("aria-label", "Marketing Plaza");
    this._el_root = root;

    // Header
    root.appendChild(this._buildHeader());

    // Stats row
    root.appendChild(this._buildStats());

    // Main body: library + generator
    const body = this._el("div", "mp-body");
    body.appendChild(this._buildLibrary());
    body.appendChild(this._buildGenerator());
    root.appendChild(body);

    this._el = root;
    this._bindEvents();
    return root;
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOM construction helpers
  // ═══════════════════════════════════════════════════════════════════

  _buildHeader() {
    const header = this._el("header", "mp-header");

    const titleRow = this._el("div", "mp-header__title-row");
    const title = this._el("h2", "mp-header__title");
    title.textContent = "📣 Marketing Plaza";
    const subtitle = this._el("span", "mp-header__subtitle");
    subtitle.textContent =
      "AI-powered content factory. Generate, store, and copy.";
    titleRow.appendChild(title);
    titleRow.appendChild(subtitle);
    header.appendChild(titleRow);

    return header;
  }

  _buildStats() {
    const bar = this._el("div", "mp-stats-bar");

    const stats = [
      { label: "Pieces Generated", ref: "_statsTotal", value: "0" },
      { label: "Words This Week", ref: "_statsWords", value: "0" },
      { label: "Top Type", ref: "_statsTopType", value: "—" },
    ];

    for (const s of stats) {
      const item = this._el("div", "mp-stat");
      const val = this._el("span", "mp-stat__value");
      val.textContent = s.value;
      const lbl = this._el("span", "mp-stat__label");
      lbl.textContent = s.label;
      item.appendChild(val);
      item.appendChild(lbl);
      bar.appendChild(item);
      this[s.ref] = val;
    }

    return bar;
  }

  _buildLibrary() {
    const panel = this._el("section", "mp-library");
    panel.setAttribute("aria-label", "Content Library");

    const head = this._el("div", "mp-library__head");
    const heading = this._el("h3", "mp-library__heading");
    heading.textContent = "Content Library";
    head.appendChild(heading);
    panel.appendChild(head);

    // Grid
    const grid = this._el("div", "mp-grid");
    grid.setAttribute("role", "list");
    grid.setAttribute("aria-label", "Content pieces");
    panel.appendChild(grid);
    this._libraryGrid = grid;

    // Initial empty state
    this._renderLibraryEmpty();

    return panel;
  }

  _buildGenerator() {
    const panel = this._el("section", "mp-generator");
    panel.setAttribute("aria-label", "Content Generator");

    // Panel heading
    const heading = this._el("h3", "mp-generator__heading");
    heading.textContent = "Generate Content";
    panel.appendChild(heading);

    // Content type pills
    const typeLabel = this._el("div", "mp-field-label");
    typeLabel.textContent = "Content Type";
    panel.appendChild(typeLabel);

    const typePillRow = this._el("div", "mp-pills");
    typePillRow.setAttribute("role", "group");
    typePillRow.setAttribute("aria-label", "Content type selector");

    for (const [key, cfg] of Object.entries(CONTENT_TYPES)) {
      const pill = this._el(
        "button",
        `mp-pill${key === this._activeType ? " mp-pill--active" : ""}`,
      );
      pill.dataset.type = key;
      pill.setAttribute(
        "aria-pressed",
        key === this._activeType ? "true" : "false",
      );
      pill.setAttribute("aria-label", cfg.label);
      pill.textContent = `${cfg.icon} ${cfg.label}`;
      typePillRow.appendChild(pill);
      this._typePills[key] = pill;
    }

    panel.appendChild(typePillRow);

    // Tone selector
    const toneLabel = this._el("div", "mp-field-label");
    toneLabel.textContent = "Tone";
    panel.appendChild(toneLabel);

    const tonePillRow = this._el("div", "mp-pills mp-pills--tone");
    tonePillRow.setAttribute("role", "group");
    tonePillRow.setAttribute("aria-label", "Tone selector");

    for (const [key, cfg] of Object.entries(TONES)) {
      const pill = this._el(
        "button",
        `mp-pill mp-pill--sm${key === this._activeTone ? " mp-pill--active" : ""}`,
      );
      pill.dataset.tone = key;
      pill.setAttribute(
        "aria-pressed",
        key === this._activeTone ? "true" : "false",
      );
      pill.setAttribute("aria-label", cfg.label);
      pill.textContent = `${cfg.emoji} ${cfg.label}`;
      tonePillRow.appendChild(pill);
      this._tonePills[key] = pill;
    }

    panel.appendChild(tonePillRow);

    // Title input
    const titleLabel = this._el("label", "mp-field-label");
    titleLabel.textContent = "Title / Headline";
    titleLabel.setAttribute("for", "mp-title-input");
    panel.appendChild(titleLabel);

    this._titleInput = this._el("input", "mp-input");
    this._titleInput.id = "mp-title-input";
    this._titleInput.type = "text";
    this._titleInput.placeholder = "Give this piece a title…";
    this._titleInput.setAttribute("aria-required", "true");
    panel.appendChild(this._titleInput);

    // Brief / topic textarea
    const briefLabel = this._el("label", "mp-field-label");
    briefLabel.textContent = "Topic / Brief";
    briefLabel.setAttribute("for", "mp-brief-input");
    panel.appendChild(briefLabel);

    this._briefInput = this._el("textarea", "mp-textarea");
    this._briefInput.id = "mp-brief-input";
    this._briefInput.rows = 4;
    this._briefInput.setAttribute("aria-required", "true");
    this._briefInput.setAttribute(
      "aria-label",
      "Topic or brief for content generation",
    );
    this._updateBriefPlaceholder();
    panel.appendChild(this._briefInput);

    // Generate button
    this._generateBtn = this._el("button", "mp-generate-btn");
    this._generateBtn.textContent = "✨ Generate";
    this._generateBtn.setAttribute("aria-label", "Generate content with AI");
    panel.appendChild(this._generateBtn);

    // Output section (hidden until generation)
    const outputSection = this._el("div", "mp-output");
    outputSection.hidden = true;
    outputSection.setAttribute("aria-live", "polite");
    outputSection.setAttribute("aria-label", "Generated content");
    this._outputSection = outputSection;

    const outputHead = this._el("div", "mp-output__head");
    const outputLabel = this._el("div", "mp-output__label");
    outputLabel.textContent = "Output";

    this._copyBtn = this._el("button", "mp-copy-btn");
    this._copyBtn.textContent = "Copy";
    this._copyBtn.setAttribute(
      "aria-label",
      "Copy generated content to clipboard",
    );
    this._copyBtn.setAttribute("title", "Copy to clipboard");

    outputHead.appendChild(outputLabel);
    outputHead.appendChild(this._copyBtn);
    outputSection.appendChild(outputHead);

    this._streamOutput = this._el("pre", "mp-stream-output");
    this._streamOutput.setAttribute("tabindex", "0");
    this._streamOutput.setAttribute("aria-label", "Generated content text");
    outputSection.appendChild(this._streamOutput);

    this._streamMeta = this._el("div", "mp-stream-meta");
    outputSection.appendChild(this._streamMeta);

    panel.appendChild(outputSection);

    return panel;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Event binding
  // ═══════════════════════════════════════════════════════════════════

  _bindEvents() {
    // Type pill selection
    for (const [key, pill] of Object.entries(this._typePills)) {
      pill.addEventListener("click", () => this._selectType(key));
    }

    // Tone pill selection
    for (const [key, pill] of Object.entries(this._tonePills)) {
      pill.addEventListener("click", () => this._selectTone(key));
    }

    // Generate button
    this._generateBtn.addEventListener("click", () => this._generate());

    // Copy button
    this._copyBtn.addEventListener("click", () => this._copyToClipboard());

    // Library grid delegated click — open modal
    this._libraryGrid.addEventListener("click", (e) => {
      const card = e.target.closest(".mp-card");
      if (!card) return;
      const id = card.dataset.id;
      const piece = this._pieces.find((p) => p.id === id);
      if (piece) this._openPieceModal(piece);
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Load content pieces from DB for the given world.
   * @param {string} worldId
   */
  async init(worldId) {
    this._worldId = worldId;

    let pieces = [];
    try {
      if (window.api && window.api.db && window.api.db.getContentPieces) {
        pieces = (await window.api.db.getContentPieces(worldId, 100)) || [];
      }
    } catch (err) {
      console.warn("[MarketingPlaza] Failed to load content pieces:", err);
    }

    this._pieces = pieces;
    this._renderLibrary();
    this._updateStats();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Type / Tone selection
  // ═══════════════════════════════════════════════════════════════════

  _selectType(key) {
    if (!CONTENT_TYPES[key]) return;
    this._activeType = key;

    for (const [k, pill] of Object.entries(this._typePills)) {
      const active = k === key;
      pill.classList.toggle("mp-pill--active", active);
      pill.setAttribute("aria-pressed", active ? "true" : "false");
    }

    this._updateBriefPlaceholder();
  }

  _selectTone(key) {
    if (!TONES[key]) return;
    this._activeTone = key;

    for (const [k, pill] of Object.entries(this._tonePills)) {
      const active = k === key;
      pill.classList.toggle("mp-pill--active", active);
      pill.setAttribute("aria-pressed", active ? "true" : "false");
    }
  }

  _updateBriefPlaceholder() {
    if (!this._briefInput) return;
    const cfg = CONTENT_TYPES[this._activeType];
    this._briefInput.placeholder = cfg
      ? cfg.placeholder
      : "Describe what you want to write about…";
  }

  // ═══════════════════════════════════════════════════════════════════
  // Content generation
  // ═══════════════════════════════════════════════════════════════════

  async _generate() {
    if (this._generating) return;

    const brief = this._briefInput ? this._briefInput.value.trim() : "";
    const title = this._titleInput ? this._titleInput.value.trim() : "";

    if (!brief) {
      this._toast(
        "warning",
        "Missing Brief",
        "Please enter a topic or brief before generating.",
      );
      this._briefInput && this._briefInput.focus();
      return;
    }

    if (!title) {
      this._toast(
        "warning",
        "Missing Title",
        "Please give this piece a title.",
      );
      this._titleInput && this._titleInput.focus();
      return;
    }

    this._generating = true;
    this._generateBtn.disabled = true;
    this._generateBtn.textContent = "⏳ Generating…";
    this._currentContent = "";

    // Show output panel with streaming state
    this._outputSection.hidden = false;
    this._streamOutput.textContent = "";
    this._streamMeta.textContent = "";
    this._copyBtn.disabled = true;

    // Add typewriter cursor
    this._streamCursor = this._el("span", "mp-cursor");
    this._streamCursor.textContent = "▋";
    this._streamOutput.appendChild(this._streamCursor);

    const typeCfg = CONTENT_TYPES[this._activeType];
    const systemPrompt = SYSTEM_PROMPTS[this._activeType];
    const toneInstruction = `Tone: ${TONES[this._activeTone].label}.`;
    const userPrompt = `${toneInstruction}\n\nTitle: ${title}\n\nBrief: ${brief}`;

    const startedAt = Date.now();

    try {
      let content = "";
      let tokensUsed = 0;
      let costUsd = 0;

      if (window.api && window.api.ai && window.api.ai.dispatch) {
        const task = {
          worldId: this._worldId,
          zoneType: "marketing",
          contentType: this._activeType,
          tone: this._activeTone,
          systemPrompt,
          userPrompt,
          title,
          brief,
        };

        const result = await window.api.ai.dispatch(task);
        content =
          result.text ||
          result.content ||
          result.result ||
          JSON.stringify(result);
        tokensUsed = (result.input_tokens || 0) + (result.output_tokens || 0);
        costUsd = result.cost_usd || 0;

        // Simulate streaming character by character for visual effect
        await this._streamText(content);
      } else {
        // Dev/offline simulation with realistic streaming
        content = this._simulatedContent(this._activeType, title, brief);
        await this._streamText(content);
      }

      // Remove cursor after streaming
      if (this._streamCursor && this._streamCursor.parentNode) {
        this._streamCursor.parentNode.removeChild(this._streamCursor);
      }
      this._streamCursor = null;

      this._currentContent = content;
      const wc = wordCount(content);
      const latencyMs = Date.now() - startedAt;

      // Meta info
      const metaParts = [`${fmtWords(wc)} words`];
      if (tokensUsed) metaParts.push(`${tokensUsed.toLocaleString()} tokens`);
      if (costUsd) metaParts.push(`$${costUsd.toFixed(4)}`);
      metaParts.push(`${(latencyMs / 1000).toFixed(1)}s`);
      this._streamMeta.textContent = metaParts.join(" · ");

      this._copyBtn.disabled = false;

      // Persist to DB
      let savedId = null;
      try {
        if (window.api && window.api.db && window.api.db.createContentPiece) {
          const newPiece = await window.api.db.createContentPiece(
            this._worldId,
            {
              content_type: this._activeType,
              title,
              brief,
              content,
              tone: this._activeTone,
              word_count: wc,
              tokens_used: tokensUsed,
              cost_usd: costUsd,
            },
          );
          if (newPiece) {
            savedId = newPiece.id || newPiece;
          }
        }
      } catch (dbErr) {
        console.warn("[MarketingPlaza] Could not persist piece:", dbErr);
      }

      // Add to local pieces array
      const piece = {
        id: savedId || `local-${Date.now()}`,
        world_id: this._worldId,
        content_type: this._activeType,
        title,
        brief,
        content,
        tone: this._activeTone,
        word_count: wc,
        tokens_used: tokensUsed,
        cost_usd: costUsd,
        created_at: new Date().toISOString(),
      };

      this._pieces.unshift(piece);
      this._renderLibrary();
      this._updateStats();

      // Emit task-complete event
      document.dispatchEvent(
        new CustomEvent("dispatch:task-complete", {
          detail: {
            worldId: this._worldId,
            zoneType: "marketing",
            success: true,
          },
          bubbles: true,
        }),
      );

      this._toast(
        "success",
        "Content Generated",
        `"${title}" is ready and saved to your library.`,
      );
    } catch (err) {
      console.error("[MarketingPlaza] Generation failed:", err);

      if (this._streamCursor && this._streamCursor.parentNode) {
        this._streamCursor.parentNode.removeChild(this._streamCursor);
      }
      this._streamCursor = null;
      this._streamOutput.textContent = `Error: ${err.message || "Generation failed. Please try again."}`;
      this._streamMeta.textContent = "";

      this._toast(
        "error",
        "Generation Failed",
        err.message || "An unexpected error occurred.",
      );
    } finally {
      this._generating = false;
      this._generateBtn.disabled = false;
      this._generateBtn.textContent = "✨ Generate";
    }
  }

  /**
   * Stream text into the output element character by character.
   * Uses a fast interval for a typewriter effect.
   * @param {string} text
   * @returns {Promise<void>}
   */
  async _streamText(text) {
    return new Promise((resolve) => {
      let idx = 0;
      const chars = Array.from(text);
      const total = chars.length;
      // Speed: ~40 chars/frame at 16ms = ~2500 chars/sec
      const BATCH = 6;

      const tick = () => {
        if (idx >= total) {
          resolve();
          return;
        }

        const end = Math.min(idx + BATCH, total);
        const chunk = chars.slice(idx, end).join("");
        idx = end;

        // Insert text before the cursor
        const textNode = document.createTextNode(chunk);
        if (this._streamCursor && this._streamCursor.parentNode) {
          this._streamCursor.parentNode.insertBefore(
            textNode,
            this._streamCursor,
          );
        } else {
          this._streamOutput.appendChild(textNode);
        }

        // Scroll to bottom
        this._streamOutput.scrollTop = this._streamOutput.scrollHeight;

        requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Clipboard copy
  // ═══════════════════════════════════════════════════════════════════

  async _copyToClipboard(text) {
    const content = text || this._currentContent;
    if (!content) return;

    try {
      await navigator.clipboard.writeText(content);
      const btn = this._copyBtn;
      const original = btn.textContent;
      btn.textContent = "Copied!";
      btn.classList.add("mp-copy-btn--copied");
      setTimeout(() => {
        btn.textContent = original;
        btn.classList.remove("mp-copy-btn--copied");
      }, 2000);
    } catch (err) {
      console.warn("[MarketingPlaza] Clipboard write failed:", err);
      this._toast(
        "error",
        "Copy Failed",
        "Could not access clipboard. Please copy manually.",
      );
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Library rendering
  // ═══════════════════════════════════════════════════════════════════

  _renderLibrary() {
    if (!this._libraryGrid) return;
    this._libraryGrid.innerHTML = "";

    if (this._pieces.length === 0) {
      this._renderLibraryEmpty();
      return;
    }

    for (const piece of this._pieces) {
      this._libraryGrid.appendChild(this._buildCard(piece));
    }
  }

  _renderLibraryEmpty() {
    if (!this._libraryGrid) return;
    this._libraryGrid.innerHTML = "";

    const empty = this._el("div", "mp-empty-state");
    const emptyIcon = this._el("div", "mp-empty-state__icon");
    emptyIcon.textContent = "📝";
    const emptyMsg = this._el("div", "mp-empty-state__msg");
    emptyMsg.textContent = "No content yet. Generate your first piece!";
    empty.appendChild(emptyIcon);
    empty.appendChild(emptyMsg);
    this._libraryGrid.appendChild(empty);
  }

  _buildCard(piece) {
    const typeCfg = CONTENT_TYPES[piece.content_type] || CONTENT_TYPES.blog;
    const wc = piece.word_count || wordCount(piece.content || "");

    const card = this._el("article", "mp-card");
    card.setAttribute("role", "listitem");
    card.setAttribute("tabindex", "0");
    card.dataset.id = piece.id;
    card.setAttribute("aria-label", `${typeCfg.label}: ${piece.title}`);

    // Card header
    const cardHead = this._el("div", "mp-card__head");

    const typeBadge = this._el(
      "span",
      `mp-type-badge mp-type-badge--${piece.content_type}`,
    );
    typeBadge.textContent = `${typeCfg.icon} ${typeCfg.label}`;

    const toneBadge = this._el("span", "mp-tone-badge");
    toneBadge.textContent = piece.tone || "professional";

    cardHead.appendChild(typeBadge);
    cardHead.appendChild(toneBadge);
    card.appendChild(cardHead);

    // Title
    const cardTitle = this._el("h4", "mp-card__title");
    cardTitle.textContent = piece.title;
    card.appendChild(cardTitle);

    // Brief excerpt
    if (piece.brief) {
      const cardBrief = this._el("p", "mp-card__brief");
      cardBrief.textContent =
        piece.brief.length > 80 ? piece.brief.slice(0, 80) + "…" : piece.brief;
      card.appendChild(cardBrief);
    }

    // Footer
    const cardFoot = this._el("div", "mp-card__foot");

    const wordEl = this._el("span", "mp-card__meta");
    wordEl.textContent = `${fmtWords(wc)} words`;

    const dateEl = this._el("span", "mp-card__meta");
    dateEl.textContent = relativeTime(piece.created_at);

    cardFoot.appendChild(wordEl);
    cardFoot.appendChild(dateEl);
    card.appendChild(cardFoot);

    // Keyboard support
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._openPieceModal(piece);
      }
    });

    return card;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Piece modal (full content viewer)
  // ═══════════════════════════════════════════════════════════════════

  _openPieceModal(piece) {
    // Remove existing modal if any
    const existing = document.getElementById("mp-modal");
    if (existing) existing.remove();

    const typeCfg = CONTENT_TYPES[piece.content_type] || CONTENT_TYPES.blog;
    const wc = piece.word_count || wordCount(piece.content || "");

    const overlay = this._el("div", "mp-modal-overlay");
    overlay.id = "mp-modal";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", piece.title);

    const modal = this._el("div", "mp-modal");

    // Modal header
    const modalHead = this._el("div", "mp-modal__head");

    const headLeft = this._el("div", "mp-modal__head-left");
    const modalBadge = this._el(
      "span",
      `mp-type-badge mp-type-badge--${piece.content_type}`,
    );
    modalBadge.textContent = `${typeCfg.icon} ${typeCfg.label}`;
    const modalTitle = this._el("h3", "mp-modal__title");
    modalTitle.textContent = piece.title;
    headLeft.appendChild(modalBadge);
    headLeft.appendChild(modalTitle);

    const headRight = this._el("div", "mp-modal__head-right");

    const modalCopyBtn = this._el("button", "mp-copy-btn");
    modalCopyBtn.textContent = "Copy";
    modalCopyBtn.setAttribute("aria-label", "Copy content to clipboard");
    modalCopyBtn.addEventListener("click", async () => {
      await navigator.clipboard.writeText(piece.content || "").catch(() => {});
      const orig = modalCopyBtn.textContent;
      modalCopyBtn.textContent = "Copied!";
      modalCopyBtn.classList.add("mp-copy-btn--copied");
      setTimeout(() => {
        modalCopyBtn.textContent = orig;
        modalCopyBtn.classList.remove("mp-copy-btn--copied");
      }, 2000);
    });

    const closeBtn = this._el("button", "mp-modal__close");
    closeBtn.textContent = "✕";
    closeBtn.setAttribute("aria-label", "Close modal");
    closeBtn.addEventListener("click", () => overlay.remove());

    headRight.appendChild(modalCopyBtn);
    headRight.appendChild(closeBtn);

    modalHead.appendChild(headLeft);
    modalHead.appendChild(headRight);
    modal.appendChild(modalHead);

    // Meta bar
    const metaBar = this._el("div", "mp-modal__meta");
    const metaItems = [
      { label: "Tone", value: piece.tone || "professional" },
      { label: "Words", value: fmtWords(wc) },
      { label: "Created", value: relativeTime(piece.created_at) },
    ];
    if (piece.cost_usd) {
      metaItems.push({ label: "Cost", value: `$${piece.cost_usd.toFixed(4)}` });
    }
    for (const m of metaItems) {
      const metaItem = this._el("span", "mp-modal__meta-item");
      metaItem.innerHTML = `<strong>${escapeHTML(m.label)}:</strong> ${escapeHTML(String(m.value))}`;
      metaBar.appendChild(metaItem);
    }
    modal.appendChild(metaBar);

    // Brief if present
    if (piece.brief) {
      const briefEl = this._el("div", "mp-modal__brief");
      briefEl.textContent = piece.brief;
      modal.appendChild(briefEl);
    }

    // Content body
    const contentEl = this._el("pre", "mp-modal__content");
    contentEl.textContent = piece.content || "";
    contentEl.setAttribute("tabindex", "0");
    modal.appendChild(contentEl);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Close on Escape
    const escHandler = (e) => {
      if (e.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);

    // Focus the modal
    closeBtn.focus();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Stats
  // ═══════════════════════════════════════════════════════════════════

  _updateStats() {
    if (!this._statsTotal) return;

    const total = this._pieces.length;
    this._statsTotal.textContent = total.toLocaleString();

    // Words this week
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weeklyWords = this._pieces
      .filter((p) => new Date(p.created_at).getTime() > oneWeekAgo)
      .reduce(
        (sum, p) => sum + (p.word_count || wordCount(p.content || "")),
        0,
      );
    this._statsWords.textContent = fmtWords(weeklyWords);

    // Most popular type
    if (total === 0) {
      this._statsTopType.textContent = "—";
    } else {
      const typeCounts = {};
      for (const p of this._pieces) {
        typeCounts[p.content_type] = (typeCounts[p.content_type] || 0) + 1;
      }
      const topKey = Object.entries(typeCounts).sort(
        (a, b) => b[1] - a[1],
      )[0][0];
      const topCfg = CONTENT_TYPES[topKey];
      this._statsTopType.textContent = topCfg
        ? `${topCfg.icon} ${topCfg.label}`
        : topKey;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Dev/offline simulation
  // ═══════════════════════════════════════════════════════════════════

  _simulatedContent(type, title, brief) {
    const timestamp = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const templates = {
      blog: `# ${title}

*Published ${timestamp}*

## Introduction

${brief} — this is a topic that deserves serious attention in today's fast-moving landscape. Whether you're a seasoned professional or just getting started, understanding the nuances here can make or break your strategy.

## Why This Matters

The shift we're seeing isn't incremental — it's fundamental. Here are three reasons this topic is reshaping the industry:

1. **Speed of adoption** — Teams that act now will build compounding advantages.
2. **Competitive pressure** — Your competitors are already exploring this.
3. **Customer expectations** — The bar is rising whether you're ready or not.

## Key Takeaways

- Start with a clear goal before diving into tactics.
- Measure early, iterate often, and document what works.
- Build systems, not one-off campaigns.

## Conclusion

${brief} isn't a destination — it's a mindset. The organizations that treat it as an ongoing practice, not a one-time project, will be the ones still standing in five years.

---
*Generated by Marketing Plaza · Claude World*`,

      tweet: `1/ ${title} — a thread 🧵

2/ The setup: ${brief}. Most people don't realize how much this changes everything.

3/ Here's what the data actually shows: early movers consistently outperform laggards by 3x over 24 months. This isn't an accident.

4/ The three things that separate winners from everyone else:
→ Clear positioning
→ Consistent output
→ Ruthless measurement

5/ The mistake I see constantly: people focus on tactics before strategy. It's backwards. Strategy first. Always.

6/ Practical next step: audit what you're doing today. Does every piece of content serve a specific goal? If not, cut it.

7/ TL;DR: ${brief} is your leverage point. Use it intentionally or your competitors will use it against you.

Follow for more threads on growth and strategy. ♻️ Retweet if this was useful.`,

      newsletter: `Subject: ${title}

---

Hi there,

This week I want to talk about something that's been on my radar: ${brief}.

**What's happening**

The landscape is shifting quickly, and those paying attention are already adjusting. Here's what I'm seeing:

- Teams are moving faster than ever, but not always smarter
- The tools have improved dramatically — the bottleneck is now strategy
- Distribution matters more than production volume

**What to do about it**

Start small. Pick one channel, one format, one audience segment. Get great at that before expanding. Depth beats breadth in today's noise-saturated environment.

**One resource I'd recommend**

If you haven't thought deeply about ${brief} recently, now is the time. Block two hours this week, turn off notifications, and just think.

Until next time,

— The Marketing Plaza Team

*P.S. If a friend sent you this, you can subscribe here.*`,

      linkedin: `${title}

${brief} — I've been thinking about this a lot lately.

Here's what I keep coming back to:

The companies winning right now aren't necessarily the biggest or the best-funded. They're the most intentional.

They know exactly who they're serving, what problem they're solving, and how they're different. That clarity creates speed.

Three things I'd tell my younger self:

→ Consistency compounds. Show up even when it doesn't feel worth it.
→ Distribution is strategy. Great content no one sees doesn't exist.
→ Feedback is the product. Build with your audience, not for them.

What's one thing you'd add? Drop it in the comments — I read every one.

#Marketing #Strategy #ContentMarketing #Growth`,

      ad: `**${title}**

${brief}?

You're not alone — and there's a smarter way.

Introducing the solution designed for teams who can't afford to waste time on content that doesn't convert.

✅ AI-powered generation
✅ Proven frameworks
✅ Done in minutes

**Try it free. No credit card required.**

[Get Started Today →]`,
    };

    return templates[type] || templates.blog;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Toast notifications
  // ═══════════════════════════════════════════════════════════════════

  _toast(type, title, description) {
    document.dispatchEvent(
      new CustomEvent("toast:show", {
        detail: { type, title, description },
        bubbles: true,
      }),
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // Utility
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create an element with a class string.
   * @param {string} tag
   * @param {string} [className]
   * @returns {HTMLElement}
   */
  _el(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }
}
