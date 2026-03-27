/**
 * sales-district.js — Sales District zone: AI-powered outreach and pipeline management
 *
 * A kanban-style pipeline board for tracking leads from prospect to closed.
 * Includes an AI outreach writer and follow-up generator powered by window.api.ai.dispatch.
 *
 * Emits:
 *   dispatch:task-complete  — { worldId, zoneType: 'sales', success: true }
 *
 * Vanilla JS + CSS. Pairs with sales-district.css.
 */

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Escape HTML entities for safe rendering.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Format a number as a compact currency string.
 * @param {number} val
 * @returns {string}
 */
function formatCurrency(val) {
  if (!val && val !== 0) return '$0';
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}k`;
  return `$${val.toLocaleString()}`;
}

/**
 * Format an ISO datetime string to a human-readable relative label.
 * @param {string|null} iso
 * @returns {string}
 */
function relativeTime(iso) {
  if (!iso) return 'Never';
  const ms = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Check if an ISO date is within this calendar week (Mon–Sun).
 * @param {string|null} iso
 * @returns {boolean}
 */
function isThisWeek(iso) {
  if (!iso) return false;
  const now = new Date();
  const d = new Date(iso);
  const startOfWeek = new Date(now);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Monday
  return d >= startOfWeek;
}

// ── Stage configuration ───────────────────────────────────────────────

const STAGES = [
  { key: 'prospect',   label: 'Prospect',    emoji: '🔍', description: 'Potential leads to reach out to' },
  { key: 'contacted',  label: 'Contacted',   emoji: '📧', description: 'Outreach sent, awaiting response' },
  { key: 'qualified',  label: 'Qualified',   emoji: '✅', description: 'Interest confirmed, evaluating fit' },
  { key: 'closed_won', label: 'Closed Won',  emoji: '🏆', description: 'Deal closed successfully' },
];

const STAGE_KEYS = STAGES.map(s => s.key);

const OUTREACH_SYSTEM_PROMPT = `You are an expert sales copywriter. Write concise, personalized cold emails.
Keep emails under 150 words. Focus on value, not features.
Always end with a clear CTA. Never use buzzwords.`;

// ── SalesDistrict class ───────────────────────────────────────────────

export class SalesDistrict {
  constructor() {
    /** @type {string|null} */
    this._worldId = null;
    /** @type {Array<object>} */
    this._leads = [];
    /** @type {string} */
    this._activeStage = 'prospect';
    /** @type {HTMLElement|null} */
    this._el = null;

    // Internal state
    /** @type {string|null} */
    this._selectedLeadId = null;
    /** @type {boolean} */
    this._composerOpen = false;
    /** @type {boolean} */
    this._aiWorking = false;

    // DOM references (set in render())
    this._statsBar = null;
    this._kanbanBoard = null;
    this._composerPanel = null;
    this._outreachPanel = null;
    this._outreachOutput = null;
    this._composerForm = null;
    this._dragState = { leadId: null, fromStage: null };
  }

  // ═══════════════════════════════════════════════════════════════════
  // CSS injection
  // ═══════════════════════════════════════════════════════════════════

  _injectCSS() {
    if (document.getElementById('sales-district-styles')) return;
    const link = document.createElement('link');
    link.id = 'sales-district-styles';
    link.rel = 'stylesheet';
    link.href = '../zones/sales-district.css';
    document.head.appendChild(link);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Build and return the root DOM element. Call once before appending to the page.
   * @returns {HTMLElement}
   */
  render() {
    this._injectCSS();

    this._el = this._mk('div', 'sales-district');
    this._el.setAttribute('role', 'region');
    this._el.setAttribute('aria-label', 'Sales District');

    this._el.appendChild(this._buildHeader());
    this._el.appendChild(this._buildStatsBar());
    this._el.appendChild(this._buildMainArea());

    this._bindGlobalEvents();

    return this._el;
  }

  /**
   * Load leads from DB for the given world and refresh the UI.
   * @param {string|number} worldId
   */
  async init(worldId) {
    this._worldId = worldId;

    let leads = [];
    try {
      if (window.api && window.api.db && window.api.db.getLeads) {
        leads = await window.api.db.getLeads(worldId) || [];
      }
    } catch (err) {
      console.warn('[SalesDistrict] Failed to load leads:', err);
      this._showToast('error', 'Load Failed', 'Could not fetch leads from the database.');
    }

    this._leads = leads;
    this._refreshBoard();
    this._refreshStats();
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOM construction
  // ═══════════════════════════════════════════════════════════════════

  _buildHeader() {
    const header = this._mk('header', 'sd-header');

    const left = this._mk('div', 'sd-header__left');
    const title = this._mk('h2', 'sd-header__title');
    title.textContent = 'Sales District';
    const sub = this._mk('span', 'sd-header__subtitle');
    sub.textContent = 'AI-powered pipeline — prospect to close.';
    left.appendChild(title);
    left.appendChild(sub);

    const actions = this._mk('div', 'sd-header__actions');

    this._addLeadBtn = this._mk('button', 'sd-btn sd-btn--primary');
    this._addLeadBtn.textContent = '+ Add Lead';
    this._addLeadBtn.setAttribute('aria-label', 'Open lead composer');
    actions.appendChild(this._addLeadBtn);

    header.appendChild(left);
    header.appendChild(actions);

    return header;
  }

  _buildStatsBar() {
    this._statsBar = this._mk('div', 'sd-stats-bar');

    const stats = [
      { key: 'total',   label: 'Total Leads',    value: '0'  },
      { key: 'value',   label: 'Pipeline Value',  value: '$0' },
      { key: 'closed',  label: 'Closed This Week', value: '0' },
      { key: 'contacted', label: 'Awaiting Reply', value: '0' },
    ];

    this._statEls = {};
    for (const stat of stats) {
      const card = this._mk('div', 'sd-stat-card');
      const val = this._mk('div', 'sd-stat-card__value');
      val.textContent = stat.value;
      const lbl = this._mk('div', 'sd-stat-card__label');
      lbl.textContent = stat.label;
      card.appendChild(val);
      card.appendChild(lbl);
      this._statsBar.appendChild(card);
      this._statEls[stat.key] = val;
    }

    return this._statsBar;
  }

  _buildMainArea() {
    const area = this._mk('div', 'sd-main-area');

    // Left: kanban board
    this._kanbanBoard = this._mk('div', 'sd-kanban');
    this._kanbanBoard.setAttribute('role', 'list');
    this._kanbanBoard.setAttribute('aria-label', 'Pipeline board');

    for (const stage of STAGES) {
      this._kanbanBoard.appendChild(this._buildKanbanColumn(stage));
    }

    // Right: side panels (composer + outreach)
    this._sideArea = this._mk('div', 'sd-side-area');
    this._composerPanel = this._buildComposerPanel();
    this._outreachPanel = this._buildOutreachPanel();
    this._composerPanel.hidden = true;
    this._outreachPanel.hidden = true;
    this._sideArea.appendChild(this._composerPanel);
    this._sideArea.appendChild(this._outreachPanel);

    // Empty side placeholder
    this._sidePlaceholder = this._mk('div', 'sd-side-placeholder');
    this._sidePlaceholder.innerHTML = `
      <div class="sd-side-placeholder__icon">📈</div>
      <div class="sd-side-placeholder__text">Select a lead to draft outreach or click <strong>+ Add Lead</strong> to get started.</div>
    `;
    this._sideArea.appendChild(this._sidePlaceholder);

    area.appendChild(this._kanbanBoard);
    area.appendChild(this._sideArea);

    return area;
  }

  _buildKanbanColumn(stage) {
    const col = this._mk('div', 'sd-column');
    col.dataset.stage = stage.key;
    col.setAttribute('role', 'listitem');
    col.setAttribute('aria-label', `${stage.label} column`);

    // Drop zone behavior
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('sd-column--drag-over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('sd-column--drag-over'));
    col.addEventListener('drop', (e) => {
      e.preventDefault();
      col.classList.remove('sd-column--drag-over');
      this._handleDrop(stage.key);
    });

    const colHeader = this._mk('div', 'sd-column__header');
    const colTitle = this._mk('div', 'sd-column__title');
    colTitle.innerHTML = `<span class="sd-column__emoji">${stage.emoji}</span>${escapeHTML(stage.label)}`;
    this._mk('span', 'sd-column__count'); // count badge — updated in refresh
    const colCount = this._mk('span', 'sd-column__count');
    colCount.dataset.stageCount = stage.key;
    colHeader.appendChild(colTitle);
    colHeader.appendChild(colCount);

    const colDesc = this._mk('div', 'sd-column__desc');
    colDesc.textContent = stage.description;

    const cardsContainer = this._mk('div', 'sd-column__cards');
    cardsContainer.dataset.stageCards = stage.key;

    col.appendChild(colHeader);
    col.appendChild(colDesc);
    col.appendChild(cardsContainer);

    return col;
  }

  _buildComposerPanel() {
    const panel = this._mk('div', 'sd-composer');
    panel.setAttribute('role', 'form');
    panel.setAttribute('aria-label', 'Add new lead');

    const header = this._mk('div', 'sd-composer__header');
    const title = this._mk('h3', 'sd-composer__title');
    title.textContent = 'New Lead';
    const closeBtn = this._mk('button', 'sd-icon-btn');
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close composer');
    closeBtn.addEventListener('click', () => this._closeComposer());
    header.appendChild(title);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    const form = this._mk('form', 'sd-form');
    form.noValidate = true;
    this._composerForm = form;

    const fields = [
      { id: 'sd-f-name',    label: 'Name *',       type: 'text',   placeholder: 'Jane Smith',           key: 'name',        required: true  },
      { id: 'sd-f-company', label: 'Company',       type: 'text',   placeholder: 'Acme Corp',            key: 'company',     required: false },
      { id: 'sd-f-email',   label: 'Email',         type: 'email',  placeholder: 'jane@acme.com',        key: 'email',       required: false },
      { id: 'sd-f-value',   label: 'Deal Value ($)', type: 'number', placeholder: '5000',                 key: 'deal_value',  required: false },
    ];

    this._formInputs = {};

    for (const f of fields) {
      const group = this._mk('div', 'sd-form__group');
      const lbl = this._mk('label', 'sd-form__label');
      lbl.textContent = f.label;
      lbl.setAttribute('for', f.id);
      const input = this._mk('input', 'sd-form__input');
      input.id = f.id;
      input.type = f.type;
      input.placeholder = f.placeholder;
      if (f.required) input.setAttribute('aria-required', 'true');
      group.appendChild(lbl);
      group.appendChild(input);
      form.appendChild(group);
      this._formInputs[f.key] = input;
    }

    // Notes textarea
    const notesGroup = this._mk('div', 'sd-form__group');
    const notesLabel = this._mk('label', 'sd-form__label');
    notesLabel.textContent = 'Notes';
    notesLabel.setAttribute('for', 'sd-f-notes');
    const notesInput = this._mk('textarea', 'sd-form__textarea');
    notesInput.id = 'sd-f-notes';
    notesInput.placeholder = 'Any context about this lead…';
    notesInput.rows = 3;
    notesGroup.appendChild(notesLabel);
    notesGroup.appendChild(notesInput);
    form.appendChild(notesGroup);
    this._formInputs['notes'] = notesInput;

    // AI research button
    const aiResearchBtn = this._mk('button', 'sd-btn sd-btn--ghost sd-btn--full');
    aiResearchBtn.type = 'button';
    aiResearchBtn.textContent = '✨ AI Research Notes';
    aiResearchBtn.setAttribute('aria-label', 'Auto-fill research notes using AI');
    aiResearchBtn.addEventListener('click', () => this._aiResearchLead());
    form.appendChild(aiResearchBtn);

    // Submit
    const submitBtn = this._mk('button', 'sd-btn sd-btn--primary sd-btn--full');
    submitBtn.type = 'submit';
    submitBtn.textContent = 'Save Lead';
    form.appendChild(submitBtn);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this._submitLead();
    });

    panel.appendChild(form);
    return panel;
  }

  _buildOutreachPanel() {
    const panel = this._mk('div', 'sd-outreach');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Lead outreach');

    const header = this._mk('div', 'sd-outreach__header');
    this._outreachTitle = this._mk('h3', 'sd-outreach__title');
    this._outreachTitle.textContent = 'Outreach';
    const closeBtn = this._mk('button', 'sd-icon-btn');
    closeBtn.textContent = '✕';
    closeBtn.setAttribute('aria-label', 'Close outreach panel');
    closeBtn.addEventListener('click', () => this._closeOutreach());
    header.appendChild(this._outreachTitle);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Lead info card
    this._outreachLeadCard = this._mk('div', 'sd-outreach__lead-card');
    panel.appendChild(this._outreachLeadCard);

    // Action buttons
    const actions = this._mk('div', 'sd-outreach__actions');

    this._writeEmailBtn = this._mk('button', 'sd-btn sd-btn--primary');
    this._writeEmailBtn.textContent = '✍️ Write Cold Email';
    this._writeEmailBtn.setAttribute('aria-label', 'Generate a cold email for this lead');
    this._writeEmailBtn.addEventListener('click', () => this._generateColdEmail());
    actions.appendChild(this._writeEmailBtn);

    this._followUpBtn = this._mk('button', 'sd-btn sd-btn--secondary');
    this._followUpBtn.textContent = '🔄 Generate Follow-up';
    this._followUpBtn.setAttribute('aria-label', 'Generate a follow-up email for this lead');
    this._followUpBtn.addEventListener('click', () => this._generateFollowUp());
    panel.appendChild(actions); // add actions before follow-up so layout makes sense
    panel.insertBefore(actions, null);

    // Output area
    const outputWrap = this._mk('div', 'sd-outreach__output-wrap');
    const outputLabel = this._mk('div', 'sd-outreach__output-label');
    outputLabel.textContent = 'Generated Email';
    this._outreachOutput = this._mk('div', 'sd-outreach__output');
    this._outreachOutput.setAttribute('aria-live', 'polite');
    this._outreachOutput.setAttribute('aria-label', 'Generated email content');
    this._outreachOutput.setAttribute('contenteditable', 'true');
    this._outreachOutput.setAttribute('spellcheck', 'true');
    this._outreachOutput.dataset.placeholder = 'Generated email will appear here…';
    outputWrap.appendChild(outputLabel);
    outputWrap.appendChild(this._outreachOutput);

    // Copy button
    this._copyEmailBtn = this._mk('button', 'sd-btn sd-btn--ghost sd-btn--sm');
    this._copyEmailBtn.textContent = 'Copy';
    this._copyEmailBtn.setAttribute('aria-label', 'Copy email to clipboard');
    this._copyEmailBtn.addEventListener('click', () => this._copyEmail());
    outputWrap.appendChild(this._copyEmailBtn);

    panel.appendChild(outputWrap);

    // Stage move controls
    const stageMoveWrap = this._mk('div', 'sd-outreach__stage-move');
    const stageMoveLabel = this._mk('div', 'sd-outreach__stage-move-label');
    stageMoveLabel.textContent = 'Move to stage:';
    stageMoveWrap.appendChild(stageMoveLabel);

    const stageButtons = this._mk('div', 'sd-outreach__stage-btns');
    for (const stage of STAGES) {
      const btn = this._mk('button', 'sd-stage-pill');
      btn.dataset.targetStage = stage.key;
      btn.textContent = `${stage.emoji} ${stage.label}`;
      btn.setAttribute('aria-label', `Move lead to ${stage.label}`);
      btn.addEventListener('click', () => this._moveLeadToStage(stage.key));
      stageButtons.appendChild(btn);
    }
    stageMoveWrap.appendChild(stageButtons);
    panel.appendChild(stageMoveWrap);

    return panel;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Event binding
  // ═══════════════════════════════════════════════════════════════════

  _bindGlobalEvents() {
    this._addLeadBtn.addEventListener('click', () => this._openComposer());
  }

  // ═══════════════════════════════════════════════════════════════════
  // Composer
  // ═══════════════════════════════════════════════════════════════════

  _openComposer() {
    this._composerOpen = true;
    this._selectedLeadId = null;
    this._composerPanel.hidden = false;
    this._outreachPanel.hidden = true;
    this._sidePlaceholder.hidden = true;
    this._clearComposerForm();
    this._formInputs['name'].focus();
  }

  _closeComposer() {
    this._composerOpen = false;
    this._composerPanel.hidden = true;
    this._sidePlaceholder.hidden = false;
  }

  _clearComposerForm() {
    for (const input of Object.values(this._formInputs)) {
      input.value = '';
    }
  }

  async _submitLead() {
    const name = this._formInputs['name'].value.trim();
    if (!name) {
      this._showToast('warning', 'Name Required', 'Please enter the lead\'s name.');
      this._formInputs['name'].focus();
      return;
    }

    const data = {
      name,
      company:    this._formInputs['company'].value.trim(),
      email:      this._formInputs['email'].value.trim(),
      deal_value: parseFloat(this._formInputs['deal_value'].value) || 0,
      notes:      this._formInputs['notes'].value.trim(),
      stage:      'prospect',
    };

    let newLead = { id: `local-${Date.now()}`, ...data, world_id: this._worldId, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_contact_at: null };

    try {
      if (window.api && window.api.db && window.api.db.createLead) {
        const saved = await window.api.db.createLead(this._worldId, data);
        if (saved) newLead = saved;
      }
    } catch (err) {
      console.warn('[SalesDistrict] Failed to create lead:', err);
      this._showToast('error', 'Save Failed', 'Lead saved locally but DB write failed.');
    }

    this._leads.unshift(newLead);
    this._refreshBoard();
    this._refreshStats();
    this._closeComposer();
    this._showToast('success', 'Lead Added', `${name} added to Prospect.`);
    this._openOutreach(newLead.id);
  }

  async _aiResearchLead() {
    const name    = this._formInputs['name'].value.trim();
    const company = this._formInputs['company'].value.trim();

    if (!name && !company) {
      this._showToast('warning', 'Missing Info', 'Enter a name or company first so AI has something to research.');
      return;
    }

    this._formInputs['notes'].placeholder = 'Researching…';
    this._formInputs['notes'].disabled = true;

    try {
      const prompt = `Research this sales lead and write 3-4 concise bullet points of relevant context.
Lead: ${name || 'Unknown'}
Company: ${company || 'Unknown'}

Focus on: company size, industry, likely pain points, and any publicly known context that would help a salesperson. Be factual and concise.`;

      let result = '';

      if (window.api && window.api.ai && window.api.ai.dispatch) {
        const response = await window.api.ai.dispatch({
          messages: [{ role: 'user', content: prompt }],
          systemPrompt: 'You are a business research assistant. Provide factual, concise lead intelligence in bullet point format.',
          worldId: this._worldId,
          zoneId: 'sales',
        });
        result = typeof response === 'string' ? response : (response.text || response.content || JSON.stringify(response));
      } else {
        result = `• ${company || 'Company'} is a mid-market B2B SaaS company\n• Likely experiencing scaling challenges\n• Active on LinkedIn with recent product announcements\n• Decision-makers typically in VP+ roles`;
      }

      this._formInputs['notes'].value = result;
      this._emit('dispatch:task-complete', { worldId: this._worldId, zoneType: 'sales', success: true });
    } catch (err) {
      console.error('[SalesDistrict] AI research failed:', err);
      this._showToast('error', 'AI Research Failed', err.message || 'Unknown error');
    } finally {
      this._formInputs['notes'].placeholder = 'Any context about this lead…';
      this._formInputs['notes'].disabled = false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Outreach panel
  // ═══════════════════════════════════════════════════════════════════

  _openOutreach(leadId) {
    const lead = this._leads.find(l => l.id === leadId);
    if (!lead) return;

    this._selectedLeadId = leadId;
    this._composerPanel.hidden = true;
    this._outreachPanel.hidden = false;
    this._sidePlaceholder.hidden = true;

    this._renderOutreachLeadCard(lead);
    this._updateStagePillHighlight(lead.stage);
    this._outreachOutput.textContent = '';

    // Only show follow-up button for contacted leads
    this._followUpBtn.style.display = lead.stage === 'contacted' ? 'inline-flex' : 'none';
  }

  _closeOutreach() {
    this._selectedLeadId = null;
    this._outreachPanel.hidden = true;
    this._sidePlaceholder.hidden = false;

    // Deselect card in board
    for (const card of this._el.querySelectorAll('.sd-lead-card--selected')) {
      card.classList.remove('sd-lead-card--selected');
    }
  }

  _renderOutreachLeadCard(lead) {
    this._outreachLeadCard.innerHTML = '';
    this._outreachTitle.textContent = `Outreach — ${escapeHTML(lead.name)}`;

    const name = this._mk('div', 'sd-outreach-lead__name');
    name.textContent = lead.name;
    this._outreachLeadCard.appendChild(name);

    if (lead.company) {
      const company = this._mk('div', 'sd-outreach-lead__company');
      company.textContent = lead.company;
      this._outreachLeadCard.appendChild(company);
    }

    if (lead.email) {
      const email = this._mk('a', 'sd-outreach-lead__email');
      email.href = `mailto:${lead.email}`;
      email.textContent = lead.email;
      this._outreachLeadCard.appendChild(email);
    }

    const meta = this._mk('div', 'sd-outreach-lead__meta');
    const dealVal = this._mk('span', 'sd-outreach-lead__deal');
    dealVal.textContent = formatCurrency(lead.deal_value);
    const lastContact = this._mk('span', 'sd-outreach-lead__last-contact');
    lastContact.textContent = `Last contact: ${relativeTime(lead.last_contact_at)}`;
    meta.appendChild(dealVal);
    meta.appendChild(lastContact);
    this._outreachLeadCard.appendChild(meta);

    if (lead.notes) {
      const notes = this._mk('div', 'sd-outreach-lead__notes');
      notes.textContent = lead.notes;
      this._outreachLeadCard.appendChild(notes);
    }
  }

  async _generateColdEmail() {
    const lead = this._leads.find(l => l.id === this._selectedLeadId);
    if (!lead || this._aiWorking) return;

    this._setAiWorking(true, this._writeEmailBtn, '✍️ Writing…');
    this._outreachOutput.textContent = '';

    const userPrompt = `Write a cold outreach email to ${lead.name}${lead.company ? ` at ${lead.company}` : ''}.
${lead.email ? `Their email is: ${lead.email}` : ''}
${lead.notes ? `Context about this lead:\n${lead.notes}` : ''}
${lead.deal_value ? `Potential deal value: ${formatCurrency(lead.deal_value)}` : ''}

Write the full email including subject line.`;

    try {
      let text = '';

      if (window.api && window.api.ai && window.api.ai.dispatch) {
        const response = await window.api.ai.dispatch({
          messages: [{ role: 'user', content: userPrompt }],
          systemPrompt: OUTREACH_SYSTEM_PROMPT,
          worldId: this._worldId,
          zoneId: 'sales',
        });

        if (typeof response === 'string') {
          text = response;
        } else if (response && typeof response[Symbol.asyncIterator] === 'function') {
          // Streaming response
          for await (const chunk of response) {
            const delta = typeof chunk === 'string' ? chunk : (chunk.delta || chunk.text || '');
            text += delta;
            this._outreachOutput.textContent = text;
          }
        } else {
          text = response.text || response.content || JSON.stringify(response);
        }
      } else {
        // Offline fallback
        text = `Subject: Quick idea for ${lead.company || 'your team'}\n\nHi ${lead.name.split(' ')[0]},\n\nI noticed ${lead.company || 'your team'} is scaling fast — congrats on the momentum.\n\nWe help companies like yours cut onboarding time by 40% without adding headcount. Happy to share a quick case study if it's relevant.\n\nWorth a 15-min call this week?\n\n[Your name]`;
      }

      this._outreachOutput.textContent = text;

      // Update last_contact_at
      await this._touchLastContact(lead);

      this._emit('dispatch:task-complete', { worldId: this._worldId, zoneType: 'sales', success: true });
      this._showToast('success', 'Email Ready', `Cold email drafted for ${lead.name}.`);
    } catch (err) {
      console.error('[SalesDistrict] Cold email generation failed:', err);
      this._outreachOutput.textContent = '';
      this._showToast('error', 'Generation Failed', err.message || 'AI dispatch failed.');
      this._emit('dispatch:task-complete', { worldId: this._worldId, zoneType: 'sales', success: false });
    } finally {
      this._setAiWorking(false, this._writeEmailBtn, '✍️ Write Cold Email');
    }
  }

  async _generateFollowUp() {
    const lead = this._leads.find(l => l.id === this._selectedLeadId);
    if (!lead || this._aiWorking) return;

    this._setAiWorking(true, this._followUpBtn, '🔄 Writing…');
    this._outreachOutput.textContent = '';

    const userPrompt = `Write a follow-up email for ${lead.name}${lead.company ? ` at ${lead.company}` : ''}.
This is a follow-up to a previous cold outreach — they haven't replied yet.
Last contact: ${relativeTime(lead.last_contact_at)}.
${lead.notes ? `Context:\n${lead.notes}` : ''}

Keep it short (under 80 words). Be warm but direct. Include subject line.`;

    try {
      let text = '';

      if (window.api && window.api.ai && window.api.ai.dispatch) {
        const response = await window.api.ai.dispatch({
          messages: [{ role: 'user', content: userPrompt }],
          systemPrompt: OUTREACH_SYSTEM_PROMPT,
          worldId: this._worldId,
          zoneId: 'sales',
        });

        if (typeof response === 'string') {
          text = response;
        } else if (response && typeof response[Symbol.asyncIterator] === 'function') {
          for await (const chunk of response) {
            const delta = typeof chunk === 'string' ? chunk : (chunk.delta || chunk.text || '');
            text += delta;
            this._outreachOutput.textContent = text;
          }
        } else {
          text = response.text || response.content || JSON.stringify(response);
        }
      } else {
        text = `Subject: Re: Quick idea for ${lead.company || 'your team'}\n\nHi ${lead.name.split(' ')[0]},\n\nJust bumping this up — did my last note land?\n\nEven a quick "not interested" helps. If the timing's off, I'm happy to reconnect in Q3.\n\n[Your name]`;
      }

      this._outreachOutput.textContent = text;
      await this._touchLastContact(lead);

      this._emit('dispatch:task-complete', { worldId: this._worldId, zoneType: 'sales', success: true });
      this._showToast('success', 'Follow-up Ready', `Follow-up drafted for ${lead.name}.`);
    } catch (err) {
      console.error('[SalesDistrict] Follow-up generation failed:', err);
      this._outreachOutput.textContent = '';
      this._showToast('error', 'Generation Failed', err.message || 'AI dispatch failed.');
      this._emit('dispatch:task-complete', { worldId: this._worldId, zoneType: 'sales', success: false });
    } finally {
      this._setAiWorking(false, this._followUpBtn, '🔄 Generate Follow-up');
    }
  }

  async _touchLastContact(lead) {
    const now = new Date().toISOString();
    lead.last_contact_at = now;

    try {
      if (window.api && window.api.db && window.api.db.updateLead) {
        await window.api.db.updateLead(lead.id, { last_contact_at: now });
      }
    } catch (err) {
      console.warn('[SalesDistrict] Could not update last_contact_at:', err);
    }

    // Refresh the card in board
    const cardEl = this._el.querySelector(`.sd-lead-card[data-lead-id="${lead.id}"] .sd-lead-card__meta`);
    if (cardEl) {
      const contactEl = cardEl.querySelector('.sd-lead-card__contact');
      if (contactEl) contactEl.textContent = `Last contact: ${relativeTime(now)}`;
    }
  }

  _copyEmail() {
    const text = this._outreachOutput.textContent || this._outreachOutput.innerText;
    if (!text) {
      this._showToast('warning', 'Nothing to Copy', 'Generate an email first.');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      this._copyEmailBtn.textContent = 'Copied!';
      setTimeout(() => { this._copyEmailBtn.textContent = 'Copy'; }, 2000);
    }).catch(() => {
      this._showToast('error', 'Copy Failed', 'Could not access clipboard.');
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Board rendering
  // ═══════════════════════════════════════════════════════════════════

  _refreshBoard() {
    for (const stage of STAGES) {
      const container = this._el.querySelector(`[data-stage-cards="${stage.key}"]`);
      const countEl   = this._el.querySelector(`[data-stage-count="${stage.key}"]`);
      if (!container) continue;

      container.innerHTML = '';

      const stageLeads = this._leads.filter(l => l.stage === stage.key);

      if (countEl) {
        countEl.textContent = stageLeads.length;
        countEl.className = 'sd-column__count' + (stageLeads.length > 0 ? ' sd-column__count--has-leads' : '');
      }

      if (stageLeads.length === 0) {
        const empty = this._mk('div', 'sd-column__empty');
        empty.textContent = stage.key === 'prospect'
          ? 'Add your first lead to get started.'
          : `No leads in ${stage.label} yet.`;
        container.appendChild(empty);
        continue;
      }

      for (const lead of stageLeads) {
        container.appendChild(this._buildLeadCard(lead));
      }
    }
  }

  _buildLeadCard(lead) {
    const card = this._mk('div', 'sd-lead-card');
    card.dataset.leadId = lead.id;
    card.setAttribute('draggable', 'true');
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `${lead.name}${lead.company ? ` at ${lead.company}` : ''}`);

    if (lead.id === this._selectedLeadId) {
      card.classList.add('sd-lead-card--selected');
    }

    const cardTop = this._mk('div', 'sd-lead-card__top');
    const nameEl = this._mk('div', 'sd-lead-card__name');
    nameEl.textContent = lead.name;
    cardTop.appendChild(nameEl);

    if (lead.deal_value > 0) {
      const dealEl = this._mk('div', 'sd-lead-card__deal');
      dealEl.textContent = formatCurrency(lead.deal_value);
      cardTop.appendChild(dealEl);
    }

    card.appendChild(cardTop);

    if (lead.company) {
      const companyEl = this._mk('div', 'sd-lead-card__company');
      companyEl.textContent = lead.company;
      card.appendChild(companyEl);
    }

    const metaEl = this._mk('div', 'sd-lead-card__meta');

    if (lead.email) {
      const emailEl = this._mk('div', 'sd-lead-card__email');
      emailEl.textContent = lead.email;
      metaEl.appendChild(emailEl);
    }

    const contactEl = this._mk('div', 'sd-lead-card__contact');
    contactEl.className = 'sd-lead-card__contact';
    contactEl.textContent = `Last contact: ${relativeTime(lead.last_contact_at)}`;
    metaEl.appendChild(contactEl);

    card.appendChild(metaEl);

    // Drag events
    card.addEventListener('dragstart', (e) => {
      this._dragState = { leadId: lead.id, fromStage: lead.stage };
      card.classList.add('sd-lead-card--dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', lead.id);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('sd-lead-card--dragging');
    });

    // Click to open outreach
    card.addEventListener('click', () => {
      this._openOutreach(lead.id);
      // Highlight selection
      for (const c of this._el.querySelectorAll('.sd-lead-card')) {
        c.classList.remove('sd-lead-card--selected');
      }
      card.classList.add('sd-lead-card--selected');
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });

    return card;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Stage movement
  // ═══════════════════════════════════════════════════════════════════

  async _handleDrop(targetStage) {
    const { leadId, fromStage } = this._dragState;
    if (!leadId || fromStage === targetStage) return;
    this._dragState = { leadId: null, fromStage: null };
    await this._moveLeadToStage(targetStage, leadId);
  }

  async _moveLeadToStage(targetStage, leadId = null) {
    const id = leadId || this._selectedLeadId;
    const lead = this._leads.find(l => l.id === id);
    if (!lead || lead.stage === targetStage) return;

    const prevStage = lead.stage;
    lead.stage = targetStage;
    lead.updated_at = new Date().toISOString();

    try {
      if (window.api && window.api.db && window.api.db.updateLead) {
        await window.api.db.updateLead(lead.id, { stage: targetStage });
      }
    } catch (err) {
      console.warn('[SalesDistrict] Could not update lead stage:', err);
      lead.stage = prevStage; // revert
      this._showToast('error', 'Move Failed', 'Could not update stage in database.');
    }

    this._refreshBoard();
    this._refreshStats();

    const stageCfg = STAGES.find(s => s.key === targetStage);
    this._showToast('success', 'Lead Moved', `${lead.name} moved to ${stageCfg ? stageCfg.label : targetStage}.`);

    // If outreach panel is open for this lead, refresh it
    if (this._selectedLeadId === lead.id && !this._outreachPanel.hidden) {
      this._openOutreach(lead.id);
    }
  }

  _updateStagePillHighlight(currentStage) {
    for (const btn of this._outreachPanel.querySelectorAll('.sd-stage-pill')) {
      btn.classList.toggle('sd-stage-pill--active', btn.dataset.targetStage === currentStage);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Stats bar
  // ═══════════════════════════════════════════════════════════════════

  _refreshStats() {
    const total = this._leads.length;
    const pipelineValue = this._leads
      .filter(l => l.stage !== 'closed_won' && l.stage !== 'closed_lost')
      .reduce((sum, l) => sum + (l.deal_value || 0), 0);
    const closedThisWeek = this._leads
      .filter(l => l.stage === 'closed_won' && isThisWeek(l.updated_at))
      .length;
    const contactedCount = this._leads.filter(l => l.stage === 'contacted').length;

    if (this._statEls) {
      this._statEls['total'].textContent   = total;
      this._statEls['value'].textContent   = formatCurrency(pipelineValue);
      this._statEls['closed'].textContent  = closedThisWeek;
      this._statEls['contacted'].textContent = contactedCount;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // UI helpers
  // ═══════════════════════════════════════════════════════════════════

  _setAiWorking(working, btn, defaultLabel) {
    this._aiWorking = working;
    btn.disabled = working;
    btn.textContent = working ? '⏳ Working…' : defaultLabel;
    if (this._writeEmailBtn) this._writeEmailBtn.disabled = working;
    if (this._followUpBtn) this._followUpBtn.disabled = working;
  }

  _showToast(type, title, description) {
    document.dispatchEvent(new CustomEvent('toast:show', {
      detail: { type, title, description },
      bubbles: true,
    }));
  }

  /**
   * @param {string} name
   * @param {object} detail
   */
  _emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }

  /**
   * Create an element with a CSS class.
   * @param {string} tag
   * @param {string} className
   * @returns {HTMLElement}
   */
  _mk(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }
}
