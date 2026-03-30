/**
 * prompt-library.js — Prompt Library zone module
 *
 * Save, organize, search, and reuse AI prompts with {{variable}} substitution.
 * Prompts can be starred, categorized, imported/exported, and dispatched.
 *
 * @module PromptLibrary
 */

// Load styles
const _styleLink = document.createElement('link');
_styleLink.rel = 'stylesheet';
_styleLink.href = '../zones/prompt-library.css';
if (!document.querySelector('link[href*="prompt-library.css"]')) {
  document.head.appendChild(_styleLink);
}

// ── Constants ────────────────────────────────────────────────────

const CATEGORIES = ['General', 'Code', 'Writing', 'Analysis', 'Creative', 'Custom'];

const SORT_OPTIONS = [
  { value: 'recent', label: 'Recently updated' },
  { value: 'usage', label: 'Most used' },
  { value: 'alpha', label: 'A-Z' },
  { value: 'starred', label: 'Starred first' },
];

const STARTER_PROMPTS = [
  {
    title: 'Summarize this text',
    category: 'General',
    template: 'Please summarize the following text in a concise manner, highlighting the key points:\n\n{{text}}',
    description: 'Get a clear, concise summary of any text.',
    tags: ['summary', 'condense'],
  },
  {
    title: 'Write a professional email',
    category: 'Writing',
    template: 'Write a professional email about {{topic}}.\n\nTone: {{tone}}\nRecipient: {{recipient}}\n\nKey points to include:\n{{key_points}}',
    description: 'Draft polished emails with the right tone and structure.',
    tags: ['email', 'professional', 'communication'],
  },
  {
    title: 'Code review',
    category: 'Code',
    template: 'Please review the following code for bugs, performance issues, and best practices:\n\nLanguage: {{language}}\n\n```\n{{code}}\n```\n\nFocus areas: {{focus_areas}}',
    description: 'Get a thorough review of your code with actionable feedback.',
    tags: ['review', 'bugs', 'best-practices'],
  },
  {
    title: 'Explain like I\'m 5',
    category: 'General',
    template: 'Explain the following concept in simple terms that a 5-year-old could understand. Use analogies and examples:\n\n{{concept}}',
    description: 'Break down complex topics into simple, easy-to-understand explanations.',
    tags: ['explain', 'simple', 'eli5'],
  },
  {
    title: 'Brainstorm ideas',
    category: 'Creative',
    template: 'Brainstorm {{count}} creative ideas for:\n\nTopic: {{topic}}\nConstraints: {{constraints}}\n\nBe creative and think outside the box.',
    description: 'Generate creative ideas for any topic with optional constraints.',
    tags: ['brainstorm', 'ideas', 'creative'],
  },
  {
    title: 'Debug this error',
    category: 'Code',
    template: 'I\'m getting the following error. Help me debug it:\n\nError message:\n{{error}}\n\nRelevant code:\n```\n{{code}}\n```\n\nContext: {{context}}',
    description: 'Quickly diagnose and fix errors in your code.',
    tags: ['debug', 'error', 'fix'],
  },
  {
    title: 'Write unit tests',
    category: 'Code',
    template: 'Write unit tests for the following {{language}} code using {{framework}}:\n\n```\n{{code}}\n```\n\nCover edge cases and error scenarios.',
    description: 'Generate comprehensive unit tests for any code.',
    tags: ['testing', 'unit-tests', 'coverage'],
  },
  {
    title: 'Create a plan',
    category: 'Analysis',
    template: 'Create a detailed plan for:\n\nGoal: {{goal}}\nTimeline: {{timeline}}\nResources: {{resources}}\n\nInclude milestones, risks, and success criteria.',
    description: 'Generate structured project plans with milestones.',
    tags: ['plan', 'project', 'strategy'],
  },
  {
    title: 'Translate to...',
    category: 'Writing',
    template: 'Translate the following text to {{target_language}}. Preserve tone and meaning:\n\n{{text}}',
    description: 'Translate text to any language while preserving meaning.',
    tags: ['translate', 'language'],
  },
  {
    title: 'Improve this writing',
    category: 'Writing',
    template: 'Improve the following text for clarity, grammar, and impact. Explain your changes:\n\nStyle: {{style}}\n\n{{text}}',
    description: 'Polish and refine your writing with detailed feedback.',
    tags: ['improve', 'edit', 'grammar'],
  },
];

// ── Helpers ──────────────────────────────────────────────────────

function generateId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Extract {{variable}} names from a template string. */
function extractVariables(template) {
  const matches = template.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.slice(2, -2)))];
}

/** Replace {{variable}} placeholders with provided values. */
function fillTemplate(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return values[key] !== undefined ? values[key] : match;
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── Main class ──────────────────────────────────────────────────

export class PromptLibrary {
  constructor() {
    this.worldId = null;
    this.prompts = [];
    this.filterCategory = 'All';
    this.filterSort = 'recent';
    this.searchQuery = '';
    this.el = null;
    this.gridEl = null;
  }

  /** Build the root DOM element (synchronous). */
  render() {
    const root = document.createElement('div');
    root.className = 'prompt-library';
    this.el = root;

    // ── Header
    const header = document.createElement('div');
    header.className = 'pl-header';
    header.innerHTML = `
      <div class="pl-header__title">Prompt Library</div>
      <div class="pl-header__actions">
        <button class="pl-btn pl-btn--small" data-action="import">Import</button>
        <button class="pl-btn pl-btn--small" data-action="export">Export</button>
        <button class="pl-btn pl-btn--primary" data-action="create">+ New Prompt</button>
      </div>
    `;
    root.appendChild(header);

    // ── Filters
    const filters = document.createElement('div');
    filters.className = 'pl-filters';

    const search = document.createElement('input');
    search.className = 'pl-search';
    search.type = 'text';
    search.placeholder = 'Search prompts...';
    search.addEventListener('input', () => {
      this.searchQuery = search.value.trim().toLowerCase();
      this._renderGrid();
    });
    filters.appendChild(search);

    const catSelect = document.createElement('select');
    catSelect.className = 'pl-select';
    catSelect.innerHTML = '<option value="All">All Categories</option>' +
      CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
    catSelect.addEventListener('change', () => {
      this.filterCategory = catSelect.value;
      this._renderGrid();
    });
    filters.appendChild(catSelect);

    const sortSelect = document.createElement('select');
    sortSelect.className = 'pl-select';
    sortSelect.innerHTML = SORT_OPTIONS.map(s =>
      `<option value="${s.value}">${s.label}</option>`
    ).join('');
    sortSelect.addEventListener('change', () => {
      this.filterSort = sortSelect.value;
      this._renderGrid();
    });
    filters.appendChild(sortSelect);

    root.appendChild(filters);

    // ── Grid container
    this.gridEl = document.createElement('div');
    this.gridEl.className = 'pl-grid';
    root.appendChild(this.gridEl);

    // ── Delegate header button clicks
    header.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'create') this._openCreateModal();
      if (action === 'import') this._importPrompts();
      if (action === 'export') this._exportPrompts();
    });

    return root;
  }

  /** Load data from DB (async, called after render). */
  async init(worldId) {
    this.worldId = worldId;
    await this._loadPrompts();

    // Seed starter prompts on first use
    if (this.prompts.length === 0) {
      await this._seedStarters();
      await this._loadPrompts();
    }

    this._renderGrid();
  }

  // ── Data layer ────────────────────────────────────────────────

  async _loadPrompts() {
    try {
      this.prompts = await window.api.db.getPrompts(this.worldId);
    } catch (err) {
      console.error('[PromptLibrary] Failed to load prompts:', err);
      this.prompts = [];
    }
  }

  async _seedStarters() {
    for (const sp of STARTER_PROMPTS) {
      try {
        await window.api.db.createPrompt(this.worldId, {
          id: generateId(),
          title: sp.title,
          category: sp.category,
          template: sp.template,
          description: sp.description,
          tags: JSON.stringify(sp.tags),
        });
      } catch (err) {
        console.warn('[PromptLibrary] Seed error:', err.message);
      }
    }
  }

  async _createPrompt(data) {
    try {
      const prompt = await window.api.db.createPrompt(this.worldId, {
        id: generateId(),
        ...data,
        tags: JSON.stringify(data.tags || []),
      });
      await this._loadPrompts();
      this._renderGrid();
      return prompt;
    } catch (err) {
      console.error('[PromptLibrary] Create failed:', err);
    }
  }

  async _updatePrompt(id, updates) {
    try {
      await window.api.db.updatePrompt(id, {
        ...updates,
        tags: updates.tags ? JSON.stringify(updates.tags) : undefined,
      });
      await this._loadPrompts();
      this._renderGrid();
    } catch (err) {
      console.error('[PromptLibrary] Update failed:', err);
    }
  }

  async _deletePrompt(id) {
    try {
      await window.api.db.deletePrompt(id);
      await this._loadPrompts();
      this._renderGrid();
    } catch (err) {
      console.error('[PromptLibrary] Delete failed:', err);
    }
  }

  async _toggleStar(id, currentVal) {
    await this._updatePrompt(id, { starred: currentVal ? 0 : 1 });
  }

  async _incrementUsage(id, currentCount) {
    await this._updatePrompt(id, { usage_count: currentCount + 1 });
  }

  // ── Filtering & sorting ───────────────────────────────────────

  _getFilteredPrompts() {
    let list = [...this.prompts];

    // Category filter
    if (this.filterCategory !== 'All') {
      list = list.filter(p => p.category === this.filterCategory);
    }

    // Text search
    if (this.searchQuery) {
      const q = this.searchQuery;
      list = list.filter(p => {
        const haystack = `${p.title} ${p.description} ${p.template} ${p.tags}`.toLowerCase();
        return haystack.includes(q);
      });
    }

    // Sort
    switch (this.filterSort) {
      case 'usage':
        list.sort((a, b) => b.usage_count - a.usage_count);
        break;
      case 'alpha':
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'starred':
        list.sort((a, b) => (b.starred - a.starred) || (b.updated_at > a.updated_at ? 1 : -1));
        break;
      case 'recent':
      default:
        list.sort((a, b) => (b.updated_at > a.updated_at ? 1 : -1));
        break;
    }

    return list;
  }

  // ── Grid rendering ────────────────────────────────────────────

  _renderGrid() {
    if (!this.gridEl) return;
    this.gridEl.innerHTML = '';

    const filtered = this._getFilteredPrompts();

    if (filtered.length === 0) {
      this.gridEl.innerHTML = `
        <div class="pl-empty">
          <div class="pl-empty__icon">&#x1F4DD;</div>
          <div class="pl-empty__text">${this.searchQuery || this.filterCategory !== 'All'
            ? 'No prompts match your filters.'
            : 'No prompts yet. Create your first one!'}</div>
        </div>
      `;
      return;
    }

    for (const prompt of filtered) {
      this.gridEl.appendChild(this._buildCard(prompt));
    }
  }

  _buildCard(prompt) {
    const card = document.createElement('div');
    card.className = 'pl-card';

    const tags = this._parseTags(prompt.tags);
    const variables = extractVariables(prompt.template);
    const preview = prompt.description || prompt.template.slice(0, 120);

    card.innerHTML = `
      <div class="pl-card__top">
        <div class="pl-card__title">${escapeHtml(prompt.title)}</div>
        <button class="pl-card__star ${prompt.starred ? 'pl-card__star--active' : ''}"
                data-action="star" title="${prompt.starred ? 'Unstar' : 'Star'}">
          ${prompt.starred ? '&#9733;' : '&#9734;'}
        </button>
      </div>
      <span class="pl-badge pl-badge--${escapeHtml(prompt.category)}">${escapeHtml(prompt.category)}</span>
      <div class="pl-card__preview">${escapeHtml(preview)}</div>
      <div class="pl-card__meta">
        <span class="pl-card__usage">Used ${prompt.usage_count} time${prompt.usage_count !== 1 ? 's' : ''}</span>
        <div class="pl-card__actions">
          <button class="pl-btn pl-btn--small" data-action="use">Use</button>
          <button class="pl-btn pl-btn--small" data-action="edit">Edit</button>
          <button class="pl-btn pl-btn--small pl-btn--danger" data-action="delete">&#x2715;</button>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'star') {
        e.stopPropagation();
        this._toggleStar(prompt.id, prompt.starred);
      } else if (action === 'use') {
        e.stopPropagation();
        this._openUseDialog(prompt);
      } else if (action === 'edit') {
        e.stopPropagation();
        this._openEditModal(prompt);
      } else if (action === 'delete') {
        e.stopPropagation();
        this._confirmDelete(prompt);
      }
    });

    return card;
  }

  _parseTags(raw) {
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw); } catch { return []; }
  }

  // ── Create / Edit modal ───────────────────────────────────────

  _openCreateModal() {
    this._openFormModal('Create Prompt', {
      title: '',
      category: 'General',
      template: '',
      description: '',
      tags: [],
    }, async (data) => {
      await this._createPrompt(data);
    });
  }

  _openEditModal(prompt) {
    this._openFormModal('Edit Prompt', {
      title: prompt.title,
      category: prompt.category,
      template: prompt.template,
      description: prompt.description,
      tags: this._parseTags(prompt.tags),
    }, async (data) => {
      await this._updatePrompt(prompt.id, data);
    });
  }

  _openFormModal(title, initial, onSave) {
    const overlay = document.createElement('div');
    overlay.className = 'pl-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'pl-modal';

    modal.innerHTML = `
      <div class="pl-modal__title">${escapeHtml(title)}</div>

      <div class="pl-field">
        <label class="pl-field__label">Title</label>
        <input class="pl-field__input" data-field="title" value="${escapeHtml(initial.title)}" placeholder="e.g. Summarize meeting notes" />
      </div>

      <div class="pl-field">
        <label class="pl-field__label">Category</label>
        <select class="pl-field__select" data-field="category">
          ${CATEGORIES.map(c => `<option value="${c}" ${c === initial.category ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>

      <div class="pl-field">
        <label class="pl-field__label">Prompt Template</label>
        <textarea class="pl-field__textarea" data-field="template" placeholder="Use {{variable_name}} for dynamic parts...">${escapeHtml(initial.template)}</textarea>
        <span class="pl-field__hint">Use &#123;&#123;variable&#125;&#125; syntax for dynamic inputs.</span>
      </div>

      <div class="pl-field">
        <label class="pl-field__label">Description</label>
        <input class="pl-field__input" data-field="description" value="${escapeHtml(initial.description)}" placeholder="Short description of what this prompt does" />
      </div>

      <div class="pl-field">
        <label class="pl-field__label">Tags (comma-separated)</label>
        <input class="pl-field__input" data-field="tags" value="${escapeHtml(initial.tags.join(', '))}" placeholder="e.g. email, professional, writing" />
      </div>

      <div class="pl-modal__footer">
        <button class="pl-btn" data-action="cancel">Cancel</button>
        <button class="pl-btn pl-btn--primary" data-action="save">Save</button>
      </div>
    `;

    overlay.appendChild(modal);

    // Close on background click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    // Button actions
    modal.addEventListener('click', async (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'cancel') {
        overlay.remove();
      } else if (action === 'save') {
        const titleVal = modal.querySelector('[data-field="title"]').value.trim();
        if (!titleVal) {
          modal.querySelector('[data-field="title"]').style.borderColor = 'var(--accent-red)';
          return;
        }
        const data = {
          title: titleVal,
          category: modal.querySelector('[data-field="category"]').value,
          template: modal.querySelector('[data-field="template"]').value,
          description: modal.querySelector('[data-field="description"]').value.trim(),
          tags: modal.querySelector('[data-field="tags"]').value
            .split(',')
            .map(t => t.trim())
            .filter(Boolean),
        };
        overlay.remove();
        await onSave(data);
      }
    });

    // ESC to close
    const onKey = (e) => {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    setTimeout(() => modal.querySelector('[data-field="title"]').focus(), 50);
  }

  // ── Use prompt dialog (variable fill) ─────────────────────────

  _openUseDialog(prompt) {
    const variables = extractVariables(prompt.template);

    // No variables — dispatch immediately
    if (variables.length === 0) {
      this._dispatchPrompt(prompt, prompt.template);
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'pl-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'pl-modal';

    let fieldsHtml = '';
    for (const v of variables) {
      const label = v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      fieldsHtml += `
        <div class="pl-var-field">
          <label class="pl-var-field__label">{{${escapeHtml(v)}}}</label>
          <input class="pl-var-field__input" data-var="${escapeHtml(v)}" placeholder="${escapeHtml(label)}" />
        </div>
      `;
    }

    modal.innerHTML = `
      <div class="pl-modal__title">Use: ${escapeHtml(prompt.title)}</div>
      <div class="pl-template-preview">${escapeHtml(prompt.template)}</div>
      <div style="margin-top:var(--space-4)">
        <div class="pl-field__label" style="margin-bottom:var(--space-2)">Fill in variables</div>
        <div class="pl-vars">${fieldsHtml}</div>
      </div>
      <div class="pl-modal__footer">
        <button class="pl-btn" data-action="cancel">Cancel</button>
        <button class="pl-btn pl-btn--primary" data-action="dispatch">Dispatch</button>
      </div>
    `;

    overlay.appendChild(modal);

    // Live preview
    const previewEl = modal.querySelector('.pl-template-preview');
    const updatePreview = () => {
      const values = {};
      modal.querySelectorAll('[data-var]').forEach(inp => {
        values[inp.dataset.var] = inp.value;
      });
      previewEl.textContent = fillTemplate(prompt.template, values);
    };
    modal.querySelectorAll('[data-var]').forEach(inp => {
      inp.addEventListener('input', updatePreview);
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    modal.addEventListener('click', async (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'cancel') {
        overlay.remove();
      } else if (action === 'dispatch') {
        const values = {};
        modal.querySelectorAll('[data-var]').forEach(inp => {
          values[inp.dataset.var] = inp.value;
        });
        const filledText = fillTemplate(prompt.template, values);
        overlay.remove();
        this._dispatchPrompt(prompt, filledText);
      }
    });

    const onKey = (e) => {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);

    document.body.appendChild(overlay);
    const firstInput = modal.querySelector('.pl-var-field__input');
    if (firstInput) setTimeout(() => firstInput.focus(), 50);
  }

  /** Dispatch filled prompt to the Dispatch zone. */
  async _dispatchPrompt(prompt, filledText) {
    // Increment usage
    await this._incrementUsage(prompt.id, prompt.usage_count);

    // Open Dispatch zone with the prompt pre-filled
    const event = new CustomEvent('zone:open', {
      detail: { zone: 'dispatch', prompt: filledText },
      bubbles: true,
    });
    this.el.dispatchEvent(event);

    // Also try directly via Dispatch if available
    try {
      const dispatchTextarea = document.querySelector('.dispatch-input__textarea');
      if (dispatchTextarea) {
        dispatchTextarea.value = filledText;
        dispatchTextarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch { /* Dispatch zone may not be open */ }
  }

  // ── Delete confirmation ───────────────────────────────────────

  _confirmDelete(prompt) {
    const overlay = document.createElement('div');
    overlay.className = 'pl-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'pl-modal';
    modal.style.maxWidth = '380px';

    modal.innerHTML = `
      <div class="pl-modal__title">Delete Prompt</div>
      <p style="color:var(--text-secondary);font-size:var(--font-size-sm);margin-bottom:var(--space-4)">
        Are you sure you want to delete <strong>${escapeHtml(prompt.title)}</strong>? This cannot be undone.
      </p>
      <div class="pl-modal__footer">
        <button class="pl-btn" data-action="cancel">Cancel</button>
        <button class="pl-btn pl-btn--danger" data-action="confirm">Delete</button>
      </div>
    `;

    overlay.appendChild(modal);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    modal.addEventListener('click', async (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'cancel') overlay.remove();
      if (action === 'confirm') {
        overlay.remove();
        await this._deletePrompt(prompt.id);
      }
    });

    document.body.appendChild(overlay);
  }

  // ── Import / Export ───────────────────────────────────────────

  async _exportPrompts() {
    const data = this.prompts.map(p => ({
      title: p.title,
      category: p.category,
      template: p.template,
      description: p.description,
      tags: this._parseTags(p.tags),
      starred: p.starred,
    }));

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt-library-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  _importPrompts() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const imported = JSON.parse(text);
        if (!Array.isArray(imported)) throw new Error('Expected an array of prompts');

        let count = 0;
        for (const p of imported) {
          if (!p.title || !p.template) continue;
          await window.api.db.createPrompt(this.worldId, {
            id: generateId(),
            title: p.title,
            category: CATEGORIES.includes(p.category) ? p.category : 'Custom',
            template: p.template,
            description: p.description || '',
            tags: JSON.stringify(Array.isArray(p.tags) ? p.tags : []),
            starred: p.starred ? 1 : 0,
          });
          count++;
        }

        await this._loadPrompts();
        this._renderGrid();
        console.log(`[PromptLibrary] Imported ${count} prompts`);
      } catch (err) {
        console.error('[PromptLibrary] Import failed:', err);
      }
    });
    input.click();
  }
}
