/**
 * skills-academy.js — Skills Academy zone
 *
 * A custom skill / prompt-template builder for Claude World.
 * Lets users create, edit, test, and delete reusable prompt templates
 * with auto-detected {{variable}} patterns.
 *
 * Emits:
 *   skills-academy:create  — { name, description, promptTemplate }
 *   skills-academy:test    — { skillId, variables }
 *   skills-academy:delete  — { skillId }
 *
 * Vanilla JS + CSS. Full ARIA accessibility.
 */

// ── Template variable regex ─────────────────────────────────────────
const VAR_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Extract unique variable names from a prompt template string.
 * @param {string} template
 * @returns {string[]}
 */
function extractVariables(template) {
  const vars = [];
  const seen = new Set();
  let match;
  // Reset lastIndex for global regex
  const re = new RegExp(VAR_PATTERN.source, "g");
  while ((match = re.exec(template)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      vars.push(match[1]);
    }
  }
  return vars;
}

/**
 * Fill a template by replacing {{var}} placeholders with provided values.
 * @param {string} template
 * @param {Record<string, string>} values
 * @returns {string}
 */
function fillTemplate(template, values) {
  return template.replace(new RegExp(VAR_PATTERN.source, "g"), (full, name) => {
    return Object.prototype.hasOwnProperty.call(values, name)
      ? values[name]
      : full;
  });
}

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
 * Highlight {{variable}} patterns in a template string, returning safe HTML.
 * @param {string} template
 * @returns {string}
 */
function highlightVariables(template) {
  const escaped = escapeHTML(template);
  return escaped.replace(
    /\{\{(\w+)\}\}/g,
    '<span class="sa-var-highlight">{{$1}}</span>',
  );
}

// ── SkillsAcademy class ─────────────────────────────────────────────

export class SkillsAcademy {
  /**
   * @param {HTMLElement} container  The element to render into.
   * @param {object} [options]
   * @param {object} [options.db]  Database instance (for direct DB access).
   * @param {string} [options.worldId]  Current world ID.
   */
  constructor(container, options = {}) {
    /** @type {HTMLElement} */
    this._container = container;
    /** @type {object|null} */
    this._db = options.db || null;
    /** @type {string|null} */
    this._worldId = options.worldId || null;

    /** @type {Array<object>} Cached skills list */
    this._skills = [];
    /** @type {object|null} Skill currently being edited (null = creating new) */
    this._editingSkill = null;
    /** @type {string|null} Skill ID pending deletion */
    this._pendingDeleteId = null;

    this._build();
    this._bindEvents();
    this.refresh();
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOM construction
  // ═══════════════════════════════════════════════════════════════════

  _build() {
    this._container.innerHTML = "";
    this._container.classList.add("skills-academy");
    this._container.setAttribute("role", "region");
    this._container.setAttribute("aria-label", "Skills Academy");

    // ── Header ──
    this._headerEl = this._el("div", "sa-header");

    const title = this._el("h2", "sa-header__title");
    title.textContent = "\uD83C\uDF93 Skills Academy";

    this._greetingEl = this._el("p", "sa-header__greeting");
    this._greetingEl.textContent =
      "Welcome, student. Let\u2019s build something useful.";

    this._statsRow = this._el("div", "sa-header__stats");
    this._statBadge = this._el("span", "sa-header__stat");
    this._statBadge.setAttribute("aria-live", "polite");
    this._statBadge.textContent = "0 skills trained";
    this._statsRow.appendChild(this._statBadge);

    this._createBtn = this._el("button", "sa-header__create-btn");
    this._createBtn.textContent = "+ New Skill";
    this._createBtn.setAttribute("aria-label", "Create a new skill");
    this._statsRow.appendChild(this._createBtn);

    this._headerEl.appendChild(title);
    this._headerEl.appendChild(this._greetingEl);
    this._headerEl.appendChild(this._statsRow);
    this._container.appendChild(this._headerEl);

    // ── Skills list ──
    this._listEl = this._el("div", "sa-list");
    this._listEl.setAttribute("role", "list");
    this._listEl.setAttribute("aria-label", "Skills list");
    this._container.appendChild(this._listEl);

    // ── Editor overlay (slide-in) ──
    this._editorOverlay = this._el("div", "sa-editor-overlay");
    this._editorOverlay.setAttribute("aria-hidden", "true");
    this._editorOverlay.setAttribute("role", "dialog");
    this._editorOverlay.setAttribute("aria-label", "Skill editor");
    this._buildEditor();
    this._container.appendChild(this._editorOverlay);

    // ── Delete confirmation overlay ──
    this._confirmOverlay = this._el("div", "sa-confirm-overlay");
    this._confirmOverlay.setAttribute("aria-hidden", "true");
    this._confirmOverlay.setAttribute("role", "alertdialog");
    this._confirmOverlay.setAttribute("aria-label", "Confirm deletion");

    const confirmBox = this._el("div", "sa-confirm");
    this._confirmText = this._el("p", "sa-confirm__text");
    this._confirmText.textContent = "Delete this skill? This cannot be undone.";
    const confirmActions = this._el("div", "sa-confirm__actions");

    this._confirmCancelBtn = this._el(
      "button",
      "sa-confirm__btn sa-confirm__btn--cancel",
    );
    this._confirmCancelBtn.textContent = "Cancel";
    this._confirmDeleteBtn = this._el(
      "button",
      "sa-confirm__btn sa-confirm__btn--danger",
    );
    this._confirmDeleteBtn.textContent = "Delete";

    confirmActions.appendChild(this._confirmCancelBtn);
    confirmActions.appendChild(this._confirmDeleteBtn);
    confirmBox.appendChild(this._confirmText);
    confirmBox.appendChild(confirmActions);
    this._confirmOverlay.appendChild(confirmBox);
    this._container.appendChild(this._confirmOverlay);
  }

  _buildEditor() {
    // Header
    const header = this._el("div", "sa-editor__header");
    this._editorBackBtn = this._el("button", "sa-editor__back-btn");
    this._editorBackBtn.innerHTML = "&#8592;";
    this._editorBackBtn.setAttribute("aria-label", "Back to skills list");
    this._editorTitle = this._el("span", "sa-editor__title");
    this._editorTitle.textContent = "New Skill";
    header.appendChild(this._editorBackBtn);
    header.appendChild(this._editorTitle);
    this._editorOverlay.appendChild(header);

    // Body
    const body = this._el("div", "sa-editor__body");

    // Name field
    const nameField = this._el("div", "sa-field");
    const nameLabel = this._el(
      "label",
      "sa-field__label sa-field__label--required",
    );
    nameLabel.textContent = "Name";
    nameLabel.setAttribute("for", "sa-name-input");
    this._nameInput = this._el("input", "sa-field__input");
    this._nameInput.id = "sa-name-input";
    this._nameInput.type = "text";
    this._nameInput.placeholder = "e.g. Code Reviewer, Email Drafter";
    this._nameInput.setAttribute("aria-required", "true");
    this._nameInput.setAttribute("autocomplete", "off");
    nameField.appendChild(nameLabel);
    nameField.appendChild(this._nameInput);
    body.appendChild(nameField);

    // Description field
    const descField = this._el("div", "sa-field");
    const descLabel = this._el("label", "sa-field__label");
    descLabel.textContent = "Description";
    descLabel.setAttribute("for", "sa-desc-input");
    this._descInput = this._el("textarea", "sa-field__textarea");
    this._descInput.id = "sa-desc-input";
    this._descInput.rows = 2;
    this._descInput.placeholder = "What does this skill do?";
    descField.appendChild(descLabel);
    descField.appendChild(this._descInput);
    body.appendChild(descField);

    // Prompt template field
    const templateField = this._el("div", "sa-field");
    const templateLabel = this._el(
      "label",
      "sa-field__label sa-field__label--required",
    );
    templateLabel.textContent = "Prompt Template";
    templateLabel.setAttribute("for", "sa-template-input");

    this._templateWrap = this._el("div", "sa-template-wrap");
    this._templatePreview = this._el("div", "sa-template-preview");
    this._templatePreview.setAttribute("aria-hidden", "true");
    this._templateInput = this._el("textarea", "sa-template-editor");
    this._templateInput.id = "sa-template-input";
    this._templateInput.setAttribute("aria-required", "true");
    this._templateInput.setAttribute("spellcheck", "false");
    this._templateInput.placeholder =
      "You are a {{role}} specialist.\n" +
      "Given the following input: {{input}}\n" +
      "Please {{action}} and return the result in {{format}} format.";

    this._templateWrap.appendChild(this._templatePreview);
    this._templateWrap.appendChild(this._templateInput);
    templateField.appendChild(templateLabel);
    templateField.appendChild(this._templateWrap);
    body.appendChild(templateField);

    // Variables section
    this._variablesSection = this._el("div", "sa-variables");
    this._variablesTitle = this._el("div", "sa-variables__title");
    this._variablesTitle.textContent = "Detected Variables";
    this._variablesChips = this._el("div", "sa-variables__chips");
    this._variablesChips.setAttribute("aria-live", "polite");
    this._variablesSection.appendChild(this._variablesTitle);
    this._variablesSection.appendChild(this._variablesChips);
    body.appendChild(this._variablesSection);

    // Test area
    this._testSection = this._el("div", "sa-test");

    const testTitle = this._el("div", "sa-test__title");
    testTitle.textContent = "Test Skill";

    this._testVarFields = this._el("div", "sa-test__var-fields");
    this._testVarFields.setAttribute("role", "group");
    this._testVarFields.setAttribute(
      "aria-label",
      "Variable values for testing",
    );

    this._testBtn = this._el("button", "sa-test__btn");
    this._testBtn.textContent = "Test Skill";
    this._testBtn.setAttribute(
      "aria-label",
      "Run test with current variable values",
    );

    this._testResultWrap = this._el("div", "");
    this._testResultWrap.style.position = "relative";

    this._testResult = this._el(
      "div",
      "sa-test__result sa-test__result--empty",
    );
    this._testResult.setAttribute("role", "status");
    this._testResult.setAttribute("aria-live", "polite");
    this._testResult.textContent = "Test results will appear here.";

    this._testCopyBtn = this._el("button", "sa-test__copy-btn");
    this._testCopyBtn.innerHTML = "\uD83D\uDCCB";
    this._testCopyBtn.setAttribute("aria-label", "Copy test result");
    this._testCopyBtn.style.display = "none";

    this._testResultWrap.appendChild(this._testResult);
    this._testResultWrap.appendChild(this._testCopyBtn);

    this._testSection.appendChild(testTitle);
    this._testSection.appendChild(this._testVarFields);
    this._testSection.appendChild(this._testBtn);
    this._testSection.appendChild(this._testResultWrap);
    body.appendChild(this._testSection);

    this._editorOverlay.appendChild(body);

    // Footer
    const footer = this._el("div", "sa-editor__footer");
    this._saveBtn = this._el("button", "sa-editor__save-btn");
    this._saveBtn.textContent = "Save Skill";
    footer.appendChild(this._saveBtn);
    this._editorOverlay.appendChild(footer);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Event binding
  // ═══════════════════════════════════════════════════════════════════

  _bindEvents() {
    // Create button
    this._createBtn.addEventListener("click", () => this._openEditor(null));

    // Editor back
    this._editorBackBtn.addEventListener("click", () => this._closeEditor());

    // Template input → live variable detection + preview
    this._templateInput.addEventListener("input", () =>
      this._onTemplateChange(),
    );

    // Sync scroll between textarea and preview
    this._templateInput.addEventListener("scroll", () => {
      this._templatePreview.scrollTop = this._templateInput.scrollTop;
      this._templatePreview.scrollLeft = this._templateInput.scrollLeft;
    });

    // Save
    this._saveBtn.addEventListener("click", () => this._onSave());

    // Test
    this._testBtn.addEventListener("click", () => this._onTest());

    // Copy test result
    this._testCopyBtn.addEventListener("click", () => this._onCopyResult());

    // Delete confirm/cancel
    this._confirmCancelBtn.addEventListener("click", () =>
      this._closeConfirm(),
    );
    this._confirmDeleteBtn.addEventListener("click", () =>
      this._onConfirmDelete(),
    );

    // Keyboard: Escape to close editor or confirm dialog
    this._container.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (this._confirmOverlay.getAttribute("aria-hidden") === "false") {
          this._closeConfirm();
        } else if (
          this._editorOverlay.getAttribute("aria-hidden") === "false"
        ) {
          this._closeEditor();
        }
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Refresh the skills list from the database.
   */
  refresh() {
    this._loadSkills();
    this._renderList();
  }

  /**
   * Set the world ID (e.g. when switching worlds).
   * @param {string} worldId
   */
  setWorldId(worldId) {
    this._worldId = worldId;
    this.refresh();
  }

  /**
   * Set the database instance.
   * @param {object} db
   */
  setDatabase(db) {
    this._db = db;
    this.refresh();
  }

  /**
   * Tear down and clean up.
   */
  destroy() {
    this._container.innerHTML = "";
    this._container.classList.remove("skills-academy");
  }

  // ═══════════════════════════════════════════════════════════════════
  // Data layer
  // ═══════════════════════════════════════════════════════════════════

  _loadSkills() {
    if (!this._db || !this._worldId) {
      this._skills = [];
      return;
    }
    try {
      const rows = this._db.db
        .prepare(
          "SELECT * FROM skills WHERE world_id = ? ORDER BY created_at DESC",
        )
        .all(this._worldId);
      this._skills = rows.map((r) => ({ ...r }));
    } catch {
      this._skills = [];
    }
  }

  /**
   * Create or update a skill in the database.
   * @param {object} data
   * @param {string} data.name
   * @param {string} data.description
   * @param {string} data.promptTemplate
   * @param {string|null} [existingId]
   * @returns {object|null}
   */
  _saveSkill(data, existingId = null) {
    if (!this._db || !this._worldId) return null;

    const now = new Date().toISOString().replace("T", " ").slice(0, 19);

    if (existingId) {
      // Update
      this._db.db
        .prepare(
          `
        UPDATE skills SET name = ?, description = ?, prompt_template = ?, updated_at = ?
        WHERE id = ?
      `,
        )
        .run(
          data.name,
          data.description || "",
          data.promptTemplate,
          now,
          existingId,
        );

      return this._db.db
        .prepare("SELECT * FROM skills WHERE id = ?")
        .get(existingId);
    } else {
      // Insert
      const info = this._db.db
        .prepare(
          `
        INSERT INTO skills (world_id, name, description, prompt_template)
        VALUES (?, ?, ?, ?)
      `,
        )
        .run(
          this._worldId,
          data.name,
          data.description || "",
          data.promptTemplate,
        );

      const row = this._db.db
        .prepare("SELECT * FROM skills WHERE rowid = ?")
        .get(info.lastInsertRowid);
      return row || null;
    }
  }

  /**
   * Delete a skill by ID.
   * @param {string} skillId
   */
  _deleteSkill(skillId) {
    if (!this._db) return;
    this._db.db.prepare("DELETE FROM skills WHERE id = ?").run(skillId);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Rendering
  // ═══════════════════════════════════════════════════════════════════

  _renderList() {
    this._listEl.innerHTML = "";

    // Update stats
    const count = this._skills.length;
    this._statBadge.textContent = `${count} skill${count !== 1 ? "s" : ""} trained`;

    if (count === 0) {
      const empty = this._el("div", "sa-empty");
      const icon = this._el("div", "sa-empty__icon");
      icon.textContent = "\uD83D\uDCDA";
      const text = this._el("div", "sa-empty__text");
      text.textContent =
        "No skills yet. Create your first skill to teach your agents new tricks.";
      empty.appendChild(icon);
      empty.appendChild(text);
      this._listEl.appendChild(empty);
      return;
    }

    for (const skill of this._skills) {
      this._listEl.appendChild(this._renderCard(skill));
    }
  }

  /**
   * @param {object} skill
   * @returns {HTMLElement}
   */
  _renderCard(skill) {
    const card = this._el("div", "sa-card");
    card.setAttribute("role", "listitem");
    card.dataset.skillId = skill.id;

    // Top row: name + version
    const top = this._el("div", "sa-card__top");
    const name = this._el("span", "sa-card__name");
    name.textContent = skill.name;
    const version = this._el("span", "sa-card__version");
    version.textContent = `v${skill.version}`;
    top.appendChild(name);
    top.appendChild(version);
    card.appendChild(top);

    // Description
    const desc = this._el("div", "sa-card__desc");
    desc.textContent = skill.description || "No description.";
    card.appendChild(desc);

    // Action buttons
    const actions = this._el("div", "sa-card__actions");

    const testBtn = this._el("button", "sa-card__btn sa-card__btn--test");
    testBtn.textContent = "Test";
    testBtn.setAttribute("aria-label", `Test skill: ${skill.name}`);
    testBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._openEditor(skill, true);
    });

    const editBtn = this._el("button", "sa-card__btn");
    editBtn.textContent = "Edit";
    editBtn.setAttribute("aria-label", `Edit skill: ${skill.name}`);
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._openEditor(skill, false);
    });

    const deleteBtn = this._el("button", "sa-card__btn sa-card__btn--delete");
    deleteBtn.textContent = "Delete";
    deleteBtn.setAttribute("aria-label", `Delete skill: ${skill.name}`);
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._openConfirm(skill.id, skill.name);
    });

    actions.appendChild(testBtn);
    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    card.appendChild(actions);

    return card;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Editor
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Open the editor for a skill (or null for new).
   * @param {object|null} skill
   * @param {boolean} [focusTest=false]  Scroll to the test area.
   */
  _openEditor(skill, focusTest = false) {
    this._editingSkill = skill;

    if (skill) {
      this._editorTitle.textContent = "Edit Skill";
      this._nameInput.value = skill.name;
      this._descInput.value = skill.description || "";
      this._templateInput.value = skill.prompt_template || "";
    } else {
      this._editorTitle.textContent = "New Skill";
      this._nameInput.value = "";
      this._descInput.value = "";
      this._templateInput.value = "";
    }

    // Reset test area
    this._testResult.textContent = "Test results will appear here.";
    this._testResult.className = "sa-test__result sa-test__result--empty";
    this._testCopyBtn.style.display = "none";

    // Trigger variable detection
    this._onTemplateChange();

    // Show editor
    this._editorOverlay.setAttribute("aria-hidden", "false");

    // Focus
    if (focusTest) {
      requestAnimationFrame(() => {
        this._testSection.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    } else {
      requestAnimationFrame(() => this._nameInput.focus());
    }
  }

  _closeEditor() {
    this._editorOverlay.setAttribute("aria-hidden", "true");
    this._editingSkill = null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Template variable detection
  // ═══════════════════════════════════════════════════════════════════

  _onTemplateChange() {
    const template = this._templateInput.value;
    const vars = extractVariables(template);

    // Update preview with highlighted variables
    // We make the textarea transparent-text and overlay the highlighted version.
    // Actually, for simplicity and to avoid color conflicts, we just render chips.
    // The preview overlay approach requires matching fonts pixel-perfect.
    // We'll use the overlay approach with color:transparent on textarea.
    this._templateInput.style.color = "transparent";
    this._templateInput.style.caretColor = "var(--text-primary)";
    this._templatePreview.innerHTML = highlightVariables(template);

    // Update chips
    this._variablesChips.innerHTML = "";
    if (vars.length === 0) {
      const empty = this._el("span", "sa-variables__empty");
      empty.textContent =
        "Type {{variableName}} in the template to create variables.";
      this._variablesChips.appendChild(empty);
    } else {
      for (const v of vars) {
        const chip = this._el("span", "sa-chip");
        chip.textContent = v;
        this._variablesChips.appendChild(chip);
      }
    }

    // Update test variable input fields
    this._renderTestVarFields(vars);
  }

  /**
   * Render test input fields for each detected variable.
   * Preserves existing values when variables haven't changed.
   * @param {string[]} vars
   */
  _renderTestVarFields(vars) {
    // Gather current values
    const currentValues = {};
    for (const input of this._testVarFields.querySelectorAll(
      "input[data-var]",
    )) {
      currentValues[input.dataset.var] = input.value;
    }

    this._testVarFields.innerHTML = "";

    if (vars.length === 0) {
      const note = this._el("div", "sa-variables__empty");
      note.textContent = "No variables to fill.";
      this._testVarFields.appendChild(note);
      return;
    }

    for (const v of vars) {
      const group = this._el("div", "sa-test__var-group");

      const label = this._el("label", "sa-test__var-label");
      label.textContent = `{{${v}}}`;
      label.setAttribute("for", `sa-test-var-${v}`);

      const input = this._el("input", "sa-test__var-input");
      input.id = `sa-test-var-${v}`;
      input.type = "text";
      input.placeholder = `Value for ${v}`;
      input.dataset.var = v;
      input.setAttribute("aria-label", `Value for variable ${v}`);
      if (currentValues[v]) {
        input.value = currentValues[v];
      }

      group.appendChild(label);
      group.appendChild(input);
      this._testVarFields.appendChild(group);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Save
  // ═══════════════════════════════════════════════════════════════════

  _onSave() {
    const name = this._nameInput.value.trim();
    const description = this._descInput.value.trim();
    const promptTemplate = this._templateInput.value.trim();

    // Validate
    if (!name) {
      this._nameInput.focus();
      this._nameInput.setAttribute("aria-invalid", "true");
      return;
    }
    this._nameInput.removeAttribute("aria-invalid");

    if (!promptTemplate) {
      this._templateInput.focus();
      this._templateInput.setAttribute("aria-invalid", "true");
      return;
    }
    this._templateInput.removeAttribute("aria-invalid");

    const data = { name, description, promptTemplate };
    const existingId = this._editingSkill ? this._editingSkill.id : null;
    const saved = this._saveSkill(data, existingId);

    // Emit event
    const eventName = existingId
      ? "skills-academy:update"
      : "skills-academy:create";
    this._emit(eventName, {
      name,
      description,
      promptTemplate,
      skillId: saved ? saved.id : null,
    });

    // Refresh list and close editor
    this.refresh();
    this._closeEditor();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Test
  // ═══════════════════════════════════════════════════════════════════

  _onTest() {
    const template = this._templateInput.value.trim();
    if (!template) return;

    // Gather variable values
    const variables = {};
    for (const input of this._testVarFields.querySelectorAll(
      "input[data-var]",
    )) {
      variables[input.dataset.var] = input.value || `[${input.dataset.var}]`;
    }

    const filledPrompt = fillTemplate(template, variables);

    // Show loading state
    this._testResult.className = "sa-test__result sa-test__result--loading";
    this._testResult.textContent = "Sending test dispatch\u2026";
    this._testCopyBtn.style.display = "none";
    this._testBtn.disabled = true;

    // Emit the test event — the parent system handles the actual dispatch
    const skillId = this._editingSkill ? this._editingSkill.id : null;
    this._emit("skills-academy:test", { skillId, variables, filledPrompt });

    // If no dispatch system is connected, show the filled prompt as the result
    // after a brief delay (simulates processing).
    // The parent can call `showTestResult()` to override this.
    this._testTimeout = setTimeout(() => {
      this.showTestResult(filledPrompt, false);
    }, 600);
  }

  /**
   * Show a test result in the result area. Called externally by the dispatch
   * system when a result comes back, or internally as a fallback.
   * @param {string} text
   * @param {boolean} [isError=false]
   */
  showTestResult(text, isError = false) {
    if (this._testTimeout) {
      clearTimeout(this._testTimeout);
      this._testTimeout = null;
    }

    this._testBtn.disabled = false;

    if (isError) {
      this._testResult.className = "sa-test__result sa-test__result--error";
    } else {
      this._testResult.className = "sa-test__result";
    }

    this._testResult.textContent = text;
    this._testCopyBtn.style.display = "flex";
  }

  _onCopyResult() {
    const text = this._testResult.textContent;
    if (!text) return;

    navigator.clipboard
      .writeText(text)
      .then(() => {
        const original = this._testCopyBtn.innerHTML;
        this._testCopyBtn.textContent = "\u2713";
        setTimeout(() => {
          this._testCopyBtn.innerHTML = original;
        }, 1200);
      })
      .catch(() => {
        // Clipboard write failed silently
      });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Delete
  // ═══════════════════════════════════════════════════════════════════

  /**
   * @param {string} skillId
   * @param {string} skillName
   */
  _openConfirm(skillId, skillName) {
    this._pendingDeleteId = skillId;
    this._confirmText.textContent = `Delete "${skillName}"? This cannot be undone.`;
    this._confirmOverlay.setAttribute("aria-hidden", "false");
    this._confirmCancelBtn.focus();
  }

  _closeConfirm() {
    this._confirmOverlay.setAttribute("aria-hidden", "true");
    this._pendingDeleteId = null;
  }

  _onConfirmDelete() {
    if (!this._pendingDeleteId) return;

    const skillId = this._pendingDeleteId;
    this._deleteSkill(skillId);
    this._emit("skills-academy:delete", { skillId });

    this._closeConfirm();
    this.refresh();
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
