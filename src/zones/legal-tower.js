/**
 * legal-tower.js — Legal Tower zone
 *
 * AI-powered legal protection for projects and contracts.
 * Lex, your AI legal guardian, reviews documents, spots risks,
 * drafts protection clauses, and keeps your projects safe.
 *
 * Emits:
 *   dispatch:task-complete — { worldId, zoneType: 'legal', success: true }
 *
 * Vanilla JS + CSS. Follows the zone class pattern from skills-academy.js.
 */

/**
 * Escape HTML entities for safe rendering.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Format an ISO date string as a short human-readable date.
 * @param {string} iso
 * @returns {string}
 */
function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}

// ── LegalTower class ─────────────────────────────────────────────────

export class LegalTower {
  /**
   * @param {HTMLElement} container  The element to render into.
   * @param {object} [options]
   * @param {string} [options.worldId]  Current world ID.
   */
  constructor(container, options = {}) {
    /** @type {HTMLElement} */
    this._container = container;
    /** @type {string|null} */
    this._worldId = options.worldId || null;

    /** @type {Array<object>} Cached documents list */
    this._docs = [];
    /** @type {object|null} Document currently open in editor */
    this._activeDoc = null;
    /** @type {boolean} Whether an analysis is running */
    this._analyzing = false;

    this._build();
    this._bindEvents();

    if (this._worldId) {
      this.init(this._worldId);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Initialize the zone for a given world: load docs from the API.
   * @param {string} worldId
   */
  async init(worldId) {
    this._worldId = worldId;
    await this._loadDocs();
    this._renderDocList();
    this._updateStats();
  }

  /**
   * Set the world ID (e.g. when switching worlds).
   * @param {string} worldId
   */
  setWorldId(worldId) {
    this.init(worldId);
  }

  /**
   * Tear down and clean up.
   */
  destroy() {
    this._container.innerHTML = "";
    this._container.classList.remove("legal-tower");
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOM construction
  // ═══════════════════════════════════════════════════════════════════

  _build() {
    this._container.innerHTML = "";
    this._container.classList.add("legal-tower");
    this._container.setAttribute("role", "region");
    this._container.setAttribute("aria-label", "Legal Tower");

    // ── Header ──
    this._headerEl = this._el("header", "lt-header");

    const titleRow = this._el("div", "lt-header__title-row");
    const title = this._el("h2", "lt-header__title");
    title.textContent = "\u2696\uFE0F Legal Tower";
    const subtitle = this._el("p", "lt-header__subtitle");
    subtitle.textContent = "Lex \u2014 Your AI Legal Guardian";
    titleRow.appendChild(title);
    titleRow.appendChild(subtitle);

    const agentRow = this._el("div", "lt-header__agent-row");
    const avatar = this._el("div", "lt-agent-avatar");
    avatar.setAttribute("aria-hidden", "true");
    avatar.innerHTML =
      '<span class="lt-agent-avatar__icon">\u2696\uFE0F</span>';
    const agentInfo = this._el("div", "lt-agent-info");
    const agentName = this._el("span", "lt-agent-info__name");
    agentName.textContent = "Lex";
    this._agentStatusEl = this._el("span", "lt-agent-info__status");
    this._agentStatusEl.textContent = "Ready to protect your work";
    agentInfo.appendChild(agentName);
    agentInfo.appendChild(this._agentStatusEl);
    agentRow.appendChild(avatar);
    agentRow.appendChild(agentInfo);

    this._statsEl = this._el("div", "lt-header__stats");
    this._statDocsEl = this._el("span", "lt-stat-badge");
    this._statDocsEl.setAttribute("aria-live", "polite");
    this._statRisksEl = this._el("span", "lt-stat-badge lt-stat-badge--risk");
    this._statRisksEl.setAttribute("aria-live", "polite");
    this._statsEl.appendChild(this._statDocsEl);
    this._statsEl.appendChild(this._statRisksEl);

    this._headerEl.appendChild(titleRow);
    this._headerEl.appendChild(agentRow);
    this._headerEl.appendChild(this._statsEl);
    this._container.appendChild(this._headerEl);

    // ── Main body (list + editor) ──
    this._bodyEl = this._el("div", "lt-body");

    // Left panel: document list
    this._listPanelEl = this._el("aside", "lt-list-panel");
    this._listPanelEl.setAttribute("aria-label", "Documents");

    const listActions = this._el("div", "lt-list-panel__actions");
    this._newDocBtn = this._el("button", "lt-new-doc-btn");
    this._newDocBtn.textContent = "New Document +";
    this._newDocBtn.setAttribute("aria-label", "Create a new legal document");
    listActions.appendChild(this._newDocBtn);
    this._listPanelEl.appendChild(listActions);

    this._docListEl = this._el("div", "lt-doc-list");
    this._docListEl.setAttribute("role", "list");
    this._listPanelEl.appendChild(this._docListEl);

    // Right panel: editor + analysis
    this._editorPanelEl = this._el("section", "lt-editor-panel");
    this._editorPanelEl.setAttribute("aria-label", "Document editor");

    this._emptyStateEl = this._el("div", "lt-empty-state");
    const emptyIcon = this._el("div", "lt-empty-state__icon");
    emptyIcon.textContent = "\u2696\uFE0F";
    const emptyText = this._el("div", "lt-empty-state__text");
    emptyText.textContent =
      "Select a document or create a new one to get started.";
    this._emptyStateEl.appendChild(emptyIcon);
    this._emptyStateEl.appendChild(emptyText);
    this._editorPanelEl.appendChild(this._emptyStateEl);

    // Editor form (hidden until a doc is open)
    this._editorFormEl = this._el("div", "lt-editor-form");
    this._editorFormEl.setAttribute("aria-hidden", "true");
    this._buildEditorForm();
    this._editorPanelEl.appendChild(this._editorFormEl);

    this._bodyEl.appendChild(this._listPanelEl);
    this._bodyEl.appendChild(this._editorPanelEl);
    this._container.appendChild(this._bodyEl);
  }

  _buildEditorForm() {
    // Title field
    const titleField = this._el("div", "lt-field");
    const titleLabel = this._el("label", "lt-field__label");
    titleLabel.textContent = "Document Title";
    titleLabel.setAttribute("for", "lt-doc-title");
    this._docTitleInput = this._el("input", "lt-field__input");
    this._docTitleInput.id = "lt-doc-title";
    this._docTitleInput.type = "text";
    this._docTitleInput.placeholder =
      "e.g. Service Agreement, NDA with Acme Corp";
    this._docTitleInput.setAttribute("autocomplete", "off");
    titleField.appendChild(titleLabel);
    titleField.appendChild(this._docTitleInput);
    this._editorFormEl.appendChild(titleField);

    // Type selector
    const typeField = this._el("div", "lt-field lt-field--inline");
    const typeLabel = this._el("label", "lt-field__label");
    typeLabel.textContent = "Document Type";
    typeLabel.setAttribute("for", "lt-doc-type");
    this._docTypeSelect = this._el("select", "lt-field__select");
    this._docTypeSelect.id = "lt-doc-type";
    const docTypes = [
      { value: "contract", label: "Contract" },
      { value: "nda", label: "NDA" },
      { value: "terms", label: "Terms of Service" },
      { value: "policy", label: "Privacy Policy" },
      { value: "other", label: "Other" },
    ];
    for (const { value, label } of docTypes) {
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      this._docTypeSelect.appendChild(opt);
    }
    typeField.appendChild(typeLabel);
    typeField.appendChild(this._docTypeSelect);
    this._editorFormEl.appendChild(typeField);

    // Content textarea
    const contentField = this._el("div", "lt-field lt-field--grow");
    const contentLabel = this._el("label", "lt-field__label");
    contentLabel.textContent = "Document Content";
    contentLabel.setAttribute("for", "lt-doc-content");
    this._docContentTextarea = this._el("textarea", "lt-field__textarea");
    this._docContentTextarea.id = "lt-doc-content";
    this._docContentTextarea.placeholder =
      "Paste or type your contract, NDA, or legal document here\u2026";
    this._docContentTextarea.setAttribute("spellcheck", "true");
    contentField.appendChild(contentLabel);
    contentField.appendChild(this._docContentTextarea);
    this._editorFormEl.appendChild(contentField);

    // Editor action bar
    const editorActions = this._el("div", "lt-editor-actions");

    this._saveDocBtn = this._el("button", "lt-btn lt-btn--secondary");
    this._saveDocBtn.textContent = "Save";
    this._saveDocBtn.setAttribute("aria-label", "Save document");

    this._analyzeBtn = this._el("button", "lt-btn lt-btn--primary");
    this._analyzeBtn.textContent = "\uD83D\uDD0D Analyze with Lex";
    this._analyzeBtn.setAttribute("aria-label", "Analyze document with Lex");

    editorActions.appendChild(this._saveDocBtn);
    editorActions.appendChild(this._analyzeBtn);
    this._editorFormEl.appendChild(editorActions);

    // Analysis panel (hidden until analysis is done)
    this._analysisPanelEl = this._el("div", "lt-analysis-panel");
    this._analysisPanelEl.setAttribute("aria-hidden", "true");
    this._buildAnalysisPanel();
    this._editorFormEl.appendChild(this._analysisPanelEl);
  }

  _buildAnalysisPanel() {
    const panelHeader = this._el("div", "lt-analysis-panel__header");
    const panelTitle = this._el("h3", "lt-analysis-panel__title");
    panelTitle.textContent = "Lex\u2019s Analysis";
    this._riskBadgeEl = this._el("span", "lt-risk-badge");
    this._riskBadgeEl.setAttribute("aria-live", "polite");
    panelHeader.appendChild(panelTitle);
    panelHeader.appendChild(this._riskBadgeEl);
    this._analysisPanelEl.appendChild(panelHeader);

    this._analysisContentEl = this._el("div", "lt-analysis-content");
    this._analysisContentEl.setAttribute("role", "status");
    this._analysisContentEl.setAttribute("aria-live", "polite");
    this._analysisPanelEl.appendChild(this._analysisContentEl);

    const panelActions = this._el("div", "lt-analysis-panel__actions");
    this._generateClauseBtn = this._el("button", "lt-btn lt-btn--gold");
    this._generateClauseBtn.textContent =
      "\uD83D\uDCCB Generate Protection Clause";
    this._generateClauseBtn.setAttribute(
      "aria-label",
      "Generate a protection clause based on the analysis",
    );
    panelActions.appendChild(this._generateClauseBtn);
    this._analysisPanelEl.appendChild(panelActions);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Event binding
  // ═══════════════════════════════════════════════════════════════════

  _bindEvents() {
    this._newDocBtn.addEventListener("click", () => this._openNewDoc());
    this._saveDocBtn.addEventListener("click", () => this._onSaveDoc());
    this._analyzeBtn.addEventListener("click", () => this._onAnalyze());
    this._generateClauseBtn.addEventListener("click", () =>
      this._onGenerateClause(),
    );

    // Auto-save title changes back to the active doc object (in memory)
    this._docTitleInput.addEventListener("input", () => {
      if (this._activeDoc) {
        this._activeDoc.title = this._docTitleInput.value;
      }
    });

    // Keyboard: Escape clears active doc
    this._container.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this._activeDoc) {
        this._closeEditor();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Data layer
  // ═══════════════════════════════════════════════════════════════════

  async _loadDocs() {
    if (!this._worldId) {
      this._docs = [];
      return;
    }
    try {
      const docs = await window.api.db.getLegalDocs(this._worldId);
      this._docs = Array.isArray(docs) ? docs : [];
    } catch {
      this._docs = [];
    }
  }

  async _saveDocToDb(doc) {
    if (!this._worldId) return null;
    try {
      const now = new Date().toISOString().replace("T", " ").slice(0, 19);
      if (doc.id && !doc._isNew) {
        // Update existing
        await window.api.db.updateLegalDoc({
          id: doc.id,
          title: doc.title,
          doc_type: doc.doc_type,
          content: doc.content,
          analysis: doc.analysis || null,
          risk_level: doc.risk_level || null,
          status: doc.status || "draft",
          updated_at: now,
        });
        return doc;
      } else {
        // Insert new
        const saved = await window.api.db.createLegalDoc({
          world_id: this._worldId,
          title: doc.title || "Untitled Document",
          doc_type: doc.doc_type || "contract",
          content: doc.content || "",
        });
        return saved;
      }
    } catch {
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Rendering
  // ═══════════════════════════════════════════════════════════════════

  _renderDocList() {
    this._docListEl.innerHTML = "";

    if (this._docs.length === 0) {
      const empty = this._el("div", "lt-doc-list__empty");
      empty.textContent = "No documents yet. Create your first legal document.";
      this._docListEl.appendChild(empty);
      return;
    }

    for (const doc of this._docs) {
      this._docListEl.appendChild(this._renderDocCard(doc));
    }
  }

  /**
   * @param {object} doc
   * @returns {HTMLElement}
   */
  _renderDocCard(doc) {
    const card = this._el("div", "lt-doc-card");
    card.setAttribute("role", "listitem");
    card.setAttribute("tabindex", "0");
    card.dataset.docId = doc.id;

    if (this._activeDoc && this._activeDoc.id === doc.id) {
      card.classList.add("lt-doc-card--active");
    }

    const cardTop = this._el("div", "lt-doc-card__top");
    const cardTitle = this._el("span", "lt-doc-card__title");
    cardTitle.textContent = doc.title || "Untitled Document";
    cardTop.appendChild(cardTitle);

    const badges = this._el("div", "lt-doc-card__badges");
    const typeBadge = this._el(
      "span",
      `lt-type-badge lt-type-badge--${doc.doc_type || "other"}`,
    );
    typeBadge.textContent = this._typeLabel(doc.doc_type);
    badges.appendChild(typeBadge);

    if (doc.risk_level) {
      const riskBadge = this._el(
        "span",
        `lt-risk-badge lt-risk-badge--${doc.risk_level}`,
      );
      riskBadge.textContent = this._riskLabel(doc.risk_level);
      badges.appendChild(riskBadge);
    }

    const cardDate = this._el("span", "lt-doc-card__date");
    cardDate.textContent = formatDate(doc.updated_at || doc.created_at);

    card.appendChild(cardTop);
    card.appendChild(badges);
    card.appendChild(cardDate);

    card.addEventListener("click", () => this._openDoc(doc));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this._openDoc(doc);
      }
    });

    return card;
  }

  _updateStats() {
    const total = this._docs.length;
    const risksCount = this._docs.filter(
      (d) => d.risk_level === "high" || d.risk_level === "medium",
    ).length;

    this._statDocsEl.textContent = `${total} document${total !== 1 ? "s" : ""} reviewed`;
    this._statRisksEl.textContent = `${risksCount} risk${risksCount !== 1 ? "s" : ""} flagged`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Editor
  // ═══════════════════════════════════════════════════════════════════

  _openNewDoc() {
    const newDoc = {
      _isNew: true,
      id: null,
      title: "",
      doc_type: "contract",
      content: "",
      analysis: null,
      risk_level: null,
      status: "draft",
    };
    this._openDoc(newDoc);
    requestAnimationFrame(() => this._docTitleInput.focus());
  }

  /**
   * Load a document into the editor panel.
   * @param {object} doc
   */
  _openDoc(doc) {
    this._activeDoc = doc;

    // Populate fields
    this._docTitleInput.value = doc.title || "";
    this._docTypeSelect.value = doc.doc_type || "contract";
    this._docContentTextarea.value = doc.content || "";

    // Show / hide analysis panel
    if (doc.analysis) {
      this._showAnalysis(doc.analysis, doc.risk_level);
    } else {
      this._analysisPanelEl.setAttribute("aria-hidden", "true");
      this._analysisPanelEl.classList.remove("lt-analysis-panel--visible");
    }

    // Show editor form, hide empty state
    this._emptyStateEl.style.display = "none";
    this._editorFormEl.setAttribute("aria-hidden", "false");
    this._editorFormEl.style.display = "flex";

    // Update active highlight in list
    for (const card of this._docListEl.querySelectorAll(".lt-doc-card")) {
      card.classList.toggle(
        "lt-doc-card--active",
        card.dataset.docId === doc.id,
      );
    }
  }

  _closeEditor() {
    this._activeDoc = null;
    this._emptyStateEl.style.display = "";
    this._editorFormEl.setAttribute("aria-hidden", "true");
    this._editorFormEl.style.display = "none";
    this._analysisPanelEl.setAttribute("aria-hidden", "true");
    this._analysisPanelEl.classList.remove("lt-analysis-panel--visible");

    for (const card of this._docListEl.querySelectorAll(".lt-doc-card")) {
      card.classList.remove("lt-doc-card--active");
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Save
  // ═══════════════════════════════════════════════════════════════════

  async _onSaveDoc() {
    if (!this._activeDoc) return;

    this._activeDoc.title =
      this._docTitleInput.value.trim() || "Untitled Document";
    this._activeDoc.doc_type = this._docTypeSelect.value;
    this._activeDoc.content = this._docContentTextarea.value;

    this._saveDocBtn.disabled = true;
    this._saveDocBtn.textContent = "Saving\u2026";

    const saved = await this._saveDocToDb(this._activeDoc);

    if (saved) {
      if (this._activeDoc._isNew) {
        delete this._activeDoc._isNew;
        this._activeDoc.id = saved.id || this._activeDoc.id;
        this._docs.unshift(this._activeDoc);
      } else {
        const idx = this._docs.findIndex((d) => d.id === this._activeDoc.id);
        if (idx !== -1)
          this._docs[idx] = { ...this._docs[idx], ...this._activeDoc };
      }
      this._renderDocList();
      this._updateStats();
    }

    this._saveDocBtn.disabled = false;
    this._saveDocBtn.textContent = "Save";
  }

  // ═══════════════════════════════════════════════════════════════════
  // Analysis
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Analyze a document with Lex via the AI dispatch API.
   */
  async _onAnalyze() {
    if (!this._activeDoc || this._analyzing) return;

    const content = this._docContentTextarea.value.trim();
    if (!content) {
      this._docContentTextarea.focus();
      return;
    }

    // Save current state first
    this._activeDoc.title =
      this._docTitleInput.value.trim() || "Untitled Document";
    this._activeDoc.doc_type = this._docTypeSelect.value;
    this._activeDoc.content = content;

    this._analyzing = true;
    this._analyzeBtn.disabled = true;
    this._analyzeBtn.textContent = "Analyzing\u2026";
    this._agentStatusEl.textContent = "Reviewing your document\u2026";

    // Show analysis panel in loading state
    this._analysisPanelEl.setAttribute("aria-hidden", "false");
    this._analysisPanelEl.classList.add("lt-analysis-panel--visible");
    this._riskBadgeEl.className = "lt-risk-badge";
    this._riskBadgeEl.textContent = "";
    this._analysisContentEl.innerHTML =
      '<div class="lt-analysis-loading"><span class="lt-spinner"></span> Lex is reading the document\u2026</div>';

    const systemPrompt =
      "You are Lex, an AI legal guardian for a tech startup. Analyze the following document for risks, missing protections, and compliance issues. Be specific and practical. Format your response with clear sections: ## Key Issues Found, ## Suggested Protections, ## Missing Clauses, ## Overall Assessment.";

    const userPrompt = `Please analyze this legal document:\n\n${content}`;

    let fullAnalysis = "";

    try {
      await window.api.ai.dispatch({
        systemPrompt,
        userPrompt,
        onChunk: (chunk) => {
          fullAnalysis += chunk;
          this._analysisContentEl.innerHTML =
            this._formatAnalysis(fullAnalysis);
        },
        onDone: async () => {
          this._activeDoc.analysis = fullAnalysis;
          this._activeDoc.risk_level = this._detectRiskLevel(fullAnalysis);

          // Update risk badge
          this._setRiskBadge(this._activeDoc.risk_level);

          // Persist analysis
          await this._saveDocToDb(this._activeDoc);

          // Refresh list to show risk badge on card
          const idx = this._docs.findIndex((d) => d.id === this._activeDoc.id);
          if (idx !== -1) {
            this._docs[idx].analysis = fullAnalysis;
            this._docs[idx].risk_level = this._activeDoc.risk_level;
          } else if (this._activeDoc._isNew !== true) {
            // doc was saved earlier, add to list
            this._docs.unshift({ ...this._activeDoc });
          }
          this._renderDocList();
          this._updateStats();

          // Re-highlight active card
          for (const card of this._docListEl.querySelectorAll(".lt-doc-card")) {
            card.classList.toggle(
              "lt-doc-card--active",
              card.dataset.docId === this._activeDoc.id,
            );
          }

          this._agentStatusEl.textContent =
            "Analysis complete \u2014 your document is protected";
          this._analyzing = false;
          this._analyzeBtn.disabled = false;
          this._analyzeBtn.textContent = "\uD83D\uDD0D Analyze with Lex";

          // Emit task complete
          this._emit("dispatch:task-complete", {
            worldId: this._worldId,
            zoneType: "legal",
            success: true,
          });
        },
        onError: (err) => {
          this._analysisContentEl.innerHTML = `<div class="lt-analysis-error">Lex encountered an error: ${escapeHTML(String(err))}</div>`;
          this._agentStatusEl.textContent =
            "Analysis failed \u2014 please try again";
          this._analyzing = false;
          this._analyzeBtn.disabled = false;
          this._analyzeBtn.textContent = "\uD83D\uDD0D Analyze with Lex";
        },
      });
    } catch (err) {
      this._analysisContentEl.innerHTML = `<div class="lt-analysis-error">Could not reach Lex: ${escapeHTML(String(err))}</div>`;
      this._agentStatusEl.textContent =
        "Analysis failed \u2014 please try again";
      this._analyzing = false;
      this._analyzeBtn.disabled = false;
      this._analyzeBtn.textContent = "\uD83D\uDD0D Analyze with Lex";
    }
  }

  /**
   * Generate a protection clause based on the current analysis.
   */
  async _onGenerateClause() {
    if (!this._activeDoc || !this._activeDoc.analysis) return;

    this._generateClauseBtn.disabled = true;
    this._generateClauseBtn.textContent = "Generating\u2026";

    const systemPrompt =
      "You are Lex, an AI legal guardian for a tech startup. Based on the legal analysis provided, generate a single concise protection clause that addresses the most critical risk identified. Output only the clause text, ready to be inserted into a contract.";

    const userPrompt = `Based on this analysis:\n\n${this._activeDoc.analysis}\n\nGenerate a protection clause for the document titled "${this._activeDoc.title}".`;

    let clause = "";

    // Show clause area
    let clauseEl = this._analysisPanelEl.querySelector(".lt-generated-clause");
    if (!clauseEl) {
      clauseEl = this._el("div", "lt-generated-clause");
      this._analysisPanelEl.insertBefore(
        clauseEl,
        this._analysisPanelEl.querySelector(".lt-analysis-panel__actions"),
      );
    }
    clauseEl.innerHTML = "<em>Generating clause\u2026</em>";

    try {
      await window.api.ai.dispatch({
        systemPrompt,
        userPrompt,
        onChunk: (chunk) => {
          clause += chunk;
          clauseEl.textContent = clause;
        },
        onDone: () => {
          this._generateClauseBtn.disabled = false;
          this._generateClauseBtn.textContent =
            "\uD83D\uDCCB Generate Protection Clause";
        },
        onError: () => {
          clauseEl.textContent = "Failed to generate clause. Please try again.";
          this._generateClauseBtn.disabled = false;
          this._generateClauseBtn.textContent =
            "\uD83D\uDCCB Generate Protection Clause";
        },
      });
    } catch {
      clauseEl.textContent = "Failed to generate clause. Please try again.";
      this._generateClauseBtn.disabled = false;
      this._generateClauseBtn.textContent =
        "\uD83D\uDCCB Generate Protection Clause";
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Analysis helpers
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Render Lex's analysis markdown-like text as formatted HTML sections.
   * @param {string} text
   * @returns {string}
   */
  _formatAnalysis(text) {
    // Convert ## Section headers and basic formatting to HTML
    const lines = escapeHTML(text).split("\n");
    const html = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("## ")) {
        html.push(`<h4 class="lt-analysis-section">${trimmed.slice(3)}</h4>`);
      } else if (trimmed.startsWith("- ") || trimmed.startsWith("\u2022 ")) {
        html.push(`<li class="lt-analysis-item">${trimmed.slice(2)}</li>`);
      } else if (trimmed === "") {
        html.push("<br>");
      } else {
        html.push(`<p class="lt-analysis-p">${trimmed}</p>`);
      }
    }
    return html.join("");
  }

  /**
   * Heuristically detect risk level from analysis text.
   * @param {string} analysis
   * @returns {'high'|'medium'|'low'}
   */
  _detectRiskLevel(analysis) {
    const lower = analysis.toLowerCase();
    const highKeywords = [
      "high risk",
      "critical",
      "severe",
      "major concern",
      "immediately",
      "dangerous",
    ];
    const medKeywords = [
      "moderate",
      "medium risk",
      "some concern",
      "should consider",
      "potential issue",
    ];
    if (highKeywords.some((k) => lower.includes(k))) return "high";
    if (medKeywords.some((k) => lower.includes(k))) return "medium";
    return "low";
  }

  /**
   * Show the analysis panel with existing data.
   * @param {string} analysis
   * @param {string|null} riskLevel
   */
  _showAnalysis(analysis, riskLevel) {
    this._analysisPanelEl.setAttribute("aria-hidden", "false");
    this._analysisPanelEl.classList.add("lt-analysis-panel--visible");
    this._analysisContentEl.innerHTML = this._formatAnalysis(analysis);
    this._setRiskBadge(riskLevel);
  }

  /**
   * Set the risk badge display.
   * @param {string|null} level
   */
  _setRiskBadge(level) {
    this._riskBadgeEl.className = `lt-risk-badge lt-risk-badge--${level || "unknown"}`;
    this._riskBadgeEl.textContent = this._riskLabel(level);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Label helpers
  // ═══════════════════════════════════════════════════════════════════

  /**
   * @param {string} type
   * @returns {string}
   */
  _typeLabel(type) {
    const labels = {
      contract: "Contract",
      nda: "NDA",
      terms: "Terms",
      policy: "Policy",
      other: "Other",
    };
    return labels[type] || "Other";
  }

  /**
   * @param {string|null} level
   * @returns {string}
   */
  _riskLabel(level) {
    const labels = {
      low: "Low Risk",
      medium: "Medium Risk",
      high: "High Risk",
    };
    return labels[level] || "Unknown";
  }

  // ═══════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create an element with class name(s).
   * @param {string} tag
   * @param {string} className
   * @returns {HTMLElement}
   */
  _el(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }

  /**
   * Dispatch a custom event on the document.
   * @param {string} name
   * @param {object} detail
   */
  _emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }
}
