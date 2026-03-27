/**
 * chat-rooms.js — Chat Rooms zone module
 *
 * The primary interaction zone. A multi-project chat interface (Slack/Linear-inspired)
 * where users have real conversations with AI agents. Each "project" is a named
 * conversation context with persistent history stored in SQLite.
 *
 * Layout:
 *   Left sidebar  — project list (new project button + project cards)
 *   Right panel   — active conversation (messages + input bar)
 *
 * @module ChatRooms
 */

export class ChatRooms {
  constructor() {
    /** @type {HTMLElement|null} Root DOM element */
    this.container = null;

    /** @type {string|null} Current world ID */
    this.worldId = null;

    /** @type {Array<Object>} Loaded projects */
    this.projects = [];

    /** @type {Object|null} Currently active project */
    this.activeProject = null;

    /** @type {Array<Object>} Messages for active project */
    this.messages = [];

    /** @type {boolean} Whether a response is currently streaming */
    this.isThinking = false;

    /** @type {HTMLElement|null} Thinking bubble element (for live update) */
    this._thinkingBubble = null;

    /** @type {ResizeObserver|null} Observer for textarea auto-resize */
    this._resizeObserver = null;
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Create and return the root DOM element for the Chat Rooms zone.
   * @returns {HTMLElement}
   */
  render() {
    const el = document.createElement('div');
    el.className = 'chat-rooms';
    el.setAttribute('role', 'region');
    el.setAttribute('aria-label', 'Chat Rooms');

    el.innerHTML = `
      <!-- Left sidebar: project list -->
      <aside class="chat-sidebar" aria-label="Projects">
        <div class="chat-sidebar__header">
          <span class="chat-sidebar__title">Projects</span>
          <button class="chat-sidebar__new-btn" data-action="new-project" type="button" title="New Project">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 2v12M2 8h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            New Project
          </button>
        </div>
        <div class="chat-sidebar__projects" role="list" aria-label="Project list">
          <!-- Project cards rendered here -->
        </div>
      </aside>

      <!-- Right panel: active conversation -->
      <main class="chat-main" aria-label="Conversation">
        <!-- Conversation header -->
        <div class="chat-header">
          <div class="chat-header__info">
            <span class="chat-header__icon" aria-hidden="true">💬</span>
            <span class="chat-header__name">Select a project</span>
          </div>
        </div>

        <!-- Message thread -->
        <div class="chat-thread" role="log" aria-live="polite" aria-label="Messages">
          <div class="chat-empty-state">
            <div class="chat-empty-state__icon" aria-hidden="true">✦</div>
            <p class="chat-empty-state__title">Commander is ready</p>
            <p class="chat-empty-state__subtitle">Select or create a project to start a conversation.</p>
          </div>
        </div>

        <!-- Input bar -->
        <div class="chat-input-bar">
          <div class="chat-input-wrap">
            <textarea
              class="chat-input"
              placeholder="Message Commander... (Enter to send, Shift+Enter for newline)"
              rows="1"
              aria-label="Message input"
              disabled
            ></textarea>
            <button class="chat-send-btn" data-action="send" type="button" aria-label="Send message" disabled>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
                <path d="M9 15V3M3 9l6-6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
          <div class="chat-input-hint">
            <kbd>Enter</kbd> to send &nbsp;·&nbsp; <kbd>Shift+Enter</kbd> for newline
          </div>
        </div>
      </main>

      <!-- New project modal -->
      <div class="chat-modal" data-modal="new-project" role="dialog" aria-modal="true" aria-labelledby="modal-title" hidden>
        <div class="chat-modal__overlay" data-action="close-modal"></div>
        <div class="chat-modal__box">
          <h3 class="chat-modal__title" id="modal-title">New Project</h3>
          <div class="chat-modal__field">
            <label class="chat-modal__label" for="new-project-icon">Icon</label>
            <input id="new-project-icon" class="chat-modal__icon-input" type="text" maxlength="2" value="💬" />
          </div>
          <div class="chat-modal__field">
            <label class="chat-modal__label" for="new-project-name">Name</label>
            <input id="new-project-name" class="chat-modal__input" type="text" placeholder="e.g. Research, Coding, Planning..." />
          </div>
          <div class="chat-modal__actions">
            <button class="chat-modal__cancel" data-action="close-modal" type="button">Cancel</button>
            <button class="chat-modal__create" data-action="confirm-new-project" type="button">Create</button>
          </div>
        </div>
      </div>
    `;

    this.container = el;
    this._bindEvents();

    return el;
  }

  /**
   * Initialize the zone for a specific world: loads projects and activates the first one.
   * @param {string} worldId
   */
  async init(worldId) {
    this.worldId = worldId;

    try {
      let projects = await window.api.db.getProjects(worldId);

      // Ensure a default "General" project always exists
      if (!projects || projects.length === 0) {
        const general = await this.createProject(worldId, 'General', '💬');
        projects = [general];
      }

      this.projects = projects;
      this._renderProjectList();

      // Auto-select first (pinned or most recent)
      const first = this.projects.find(p => p.pinned) || this.projects[0];
      if (first) {
        await this._selectProject(first);
      }
    } catch (err) {
      console.error('[ChatRooms] init error:', err);
    }
  }

  /**
   * Create a new project and persist it to the DB.
   * @param {string} worldId
   * @param {string} name
   * @param {string} [icon='💬']
   * @returns {Promise<Object>} Created project record
   */
  async createProject(worldId, name, icon = '💬') {
    const project = await window.api.db.createProject({ worldId, name, icon });
    return project;
  }

  /**
   * Send a user message in the active project, dispatch to AI, persist response.
   * @param {string} content
   */
  async sendMessage(content) {
    if (!content.trim() || !this.activeProject || this.isThinking) return;

    const project = this.activeProject;
    this.isThinking = true;
    this._setInputEnabled(false);

    // 1. Persist user message
    const userMsg = await window.api.db.saveMessage({
      projectId: project.id,
      worldId: this.worldId,
      role: 'user',
      content: content.trim(),
    });

    this.messages.push(userMsg || { role: 'user', content: content.trim(), created_at: new Date().toISOString() });

    // 2. Render user bubble immediately
    this._appendMessageBubble({ role: 'user', content: content.trim() });
    this._updateProjectPreview(project.id, content.trim());

    // 3. Show thinking animation
    this._showThinking();

    // 4. Build conversation history (last 20 messages)
    const history = this.messages.slice(-20).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));

    try {
      // 5. Dispatch to AI
      const response = await window.api.ai.dispatch({ messages: history });

      const assistantContent = (typeof response === 'string')
        ? response
        : (response?.content ?? response?.message ?? JSON.stringify(response));

      // 6. Replace thinking bubble with real response
      this._resolveThinking(assistantContent);

      // 7. Persist assistant message
      const assistantMsg = await window.api.db.saveMessage({
        projectId: project.id,
        worldId: this.worldId,
        role: 'assistant',
        content: assistantContent,
        agentName: 'Commander',
        model: response?.model ?? null,
        costUsd: response?.cost_usd ?? 0,
        tokensUsed: response?.tokens_used ?? 0,
      });

      this.messages.push(assistantMsg || {
        role: 'assistant',
        content: assistantContent,
        agent_name: 'Commander',
        created_at: new Date().toISOString(),
      });

      this._updateProjectPreview(project.id, assistantContent, true);

      // 8. Emit completion event
      this._emitEvent('dispatch:task-complete', {
        worldId: this.worldId,
        zoneType: 'chat',
        success: true,
      });
    } catch (err) {
      console.error('[ChatRooms] sendMessage error:', err);
      this._resolveThinking('Sorry, something went wrong. Please try again.', true);
      this._emitEvent('dispatch:task-complete', {
        worldId: this.worldId,
        zoneType: 'chat',
        success: false,
        error: err?.message,
      });
    } finally {
      this.isThinking = false;
      this._setInputEnabled(true);
      this._focusInput();
    }
  }

  // ── Private: Project management ─────────────────────────────────

  /**
   * Select a project as active, loading its message history.
   * @param {Object} project
   * @private
   */
  async _selectProject(project) {
    this.activeProject = project;

    // Update sidebar active state
    this.container?.querySelectorAll('.chat-project-card').forEach(card => {
      card.classList.toggle('chat-project-card--active', card.dataset.id === project.id);
      card.setAttribute('aria-selected', String(card.dataset.id === project.id));
    });

    // Update header
    const headerIcon = this.container?.querySelector('.chat-header__icon');
    const headerName = this.container?.querySelector('.chat-header__name');
    if (headerIcon) headerIcon.textContent = project.icon || '💬';
    if (headerName) headerName.textContent = project.name;

    // Enable input
    this._setInputEnabled(true);

    // Clear thread
    const thread = this.container?.querySelector('.chat-thread');
    if (thread) thread.innerHTML = '';

    // Load message history
    try {
      const msgs = await window.api.db.getMessages(project.id);
      this.messages = msgs || [];

      if (this.messages.length === 0) {
        thread.innerHTML = `
          <div class="chat-empty-state">
            <div class="chat-empty-state__icon" aria-hidden="true">✦</div>
            <p class="chat-empty-state__title">Start the conversation</p>
            <p class="chat-empty-state__subtitle">Type a message below to begin chatting with Commander.</p>
          </div>
        `;
      } else {
        this.messages.forEach(msg => this._appendMessageBubble(msg));
      }
    } catch (err) {
      console.error('[ChatRooms] _selectProject load messages error:', err);
      this.messages = [];
    }

    this._scrollToBottom();
    this._focusInput();
  }

  /**
   * Render the full project list in the sidebar.
   * @private
   */
  _renderProjectList() {
    const listEl = this.container?.querySelector('.chat-sidebar__projects');
    if (!listEl) return;

    if (this.projects.length === 0) {
      listEl.innerHTML = `<p class="chat-sidebar__empty">No projects yet.</p>`;
      return;
    }

    listEl.innerHTML = this.projects
      .map(p => this._renderProjectCard(p))
      .join('');
  }

  /**
   * Render a single project card HTML string.
   * @param {Object} project
   * @returns {string}
   * @private
   */
  _renderProjectCard(project) {
    const isActive = this.activeProject?.id === project.id;
    const preview = project._lastMessage
      ? this._truncate(project._lastMessage, 40)
      : 'No messages yet';
    const time = project.updated_at
      ? this._formatTime(project.updated_at)
      : '';

    return `
      <div
        class="chat-project-card${isActive ? ' chat-project-card--active' : ''}"
        data-id="${project.id}"
        role="listitem button"
        tabindex="0"
        aria-selected="${isActive}"
        aria-label="${this._escapeHtml(project.name)} project"
      >
        <span class="chat-project-card__icon" aria-hidden="true">${this._escapeHtml(project.icon || '💬')}</span>
        <div class="chat-project-card__body">
          <div class="chat-project-card__top">
            <span class="chat-project-card__name">${this._escapeHtml(project.name)}</span>
            ${time ? `<span class="chat-project-card__time">${time}</span>` : ''}
          </div>
          <span class="chat-project-card__preview">${this._escapeHtml(preview)}</span>
        </div>
      </div>
    `;
  }

  /**
   * Update the preview snippet shown on a project card.
   * @param {string} projectId
   * @param {string} content
   * @param {boolean} [isAssistant=false]
   * @private
   */
  _updateProjectPreview(projectId, content, isAssistant = false) {
    const project = this.projects.find(p => p.id === projectId);
    if (project) {
      project._lastMessage = (isAssistant ? 'Commander: ' : 'You: ') + content;
      project.updated_at = new Date().toISOString();
    }

    const card = this.container?.querySelector(`.chat-project-card[data-id="${projectId}"]`);
    if (!card) return;

    const previewEl = card.querySelector('.chat-project-card__preview');
    const timeEl = card.querySelector('.chat-project-card__time');

    if (previewEl) {
      const label = isAssistant ? 'Commander: ' : 'You: ';
      previewEl.textContent = label + this._truncate(content, 40);
    }
    if (timeEl) {
      timeEl.textContent = this._formatTime(new Date().toISOString());
    }
  }

  // ── Private: Message rendering ───────────────────────────────────

  /**
   * Append a message bubble to the thread.
   * @param {Object} msg — { role, content, agent_name? }
   * @private
   */
  _appendMessageBubble(msg) {
    const thread = this.container?.querySelector('.chat-thread');
    if (!thread) return;

    // Remove empty state if present
    const emptyState = thread.querySelector('.chat-empty-state');
    if (emptyState) emptyState.remove();

    const wrapper = document.createElement('div');
    wrapper.className = `chat-message chat-message--${msg.role}`;

    if (msg.role === 'user') {
      wrapper.innerHTML = `
        <div class="chat-bubble chat-bubble--user">
          <p class="chat-bubble__text">${this._escapeHtml(msg.content)}</p>
        </div>
      `;
    } else {
      const agentName = msg.agent_name || 'Commander';
      wrapper.innerHTML = `
        <div class="chat-agent-avatar" aria-hidden="true" title="${this._escapeHtml(agentName)}">C</div>
        <div class="chat-bubble chat-bubble--assistant">
          <p class="chat-bubble__text">${this._escapeHtml(msg.content)}</p>
        </div>
      `;
    }

    // Trigger fade-in on next frame
    wrapper.style.opacity = '0';
    thread.appendChild(wrapper);
    requestAnimationFrame(() => {
      wrapper.style.opacity = '';
      wrapper.classList.add('chat-message--enter');
    });

    this._scrollToBottom();
  }

  /**
   * Inject the animated "thinking" bubble while waiting for a response.
   * @private
   */
  _showThinking() {
    const thread = this.container?.querySelector('.chat-thread');
    if (!thread) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'chat-message chat-message--assistant chat-message--thinking';
    wrapper.innerHTML = `
      <div class="chat-agent-avatar chat-agent-avatar--pulse" aria-hidden="true">C</div>
      <div class="chat-bubble chat-bubble--assistant chat-bubble--thinking" aria-label="Commander is thinking">
        <span class="chat-thinking-dot"></span>
        <span class="chat-thinking-dot"></span>
        <span class="chat-thinking-dot"></span>
      </div>
    `;

    thread.appendChild(wrapper);
    this._thinkingBubble = wrapper;
    this._scrollToBottom();
  }

  /**
   * Replace the thinking bubble with the final assistant response.
   * @param {string} content
   * @param {boolean} [isError=false]
   * @private
   */
  _resolveThinking(content, isError = false) {
    if (!this._thinkingBubble) {
      // Fallback: just append
      this._appendMessageBubble({ role: 'assistant', content });
      return;
    }

    const bubble = this._thinkingBubble.querySelector('.chat-bubble--thinking');
    if (bubble) {
      bubble.classList.remove('chat-bubble--thinking');
      bubble.innerHTML = `<p class="chat-bubble__text${isError ? ' chat-bubble__text--error' : ''}">${this._escapeHtml(content)}</p>`;
    }

    const avatar = this._thinkingBubble.querySelector('.chat-agent-avatar--pulse');
    if (avatar) avatar.classList.remove('chat-agent-avatar--pulse');

    this._thinkingBubble.classList.remove('chat-message--thinking');
    this._thinkingBubble = null;

    this._scrollToBottom();
  }

  // ── Private: Input handling ──────────────────────────────────────

  /**
   * Bind all UI event listeners.
   * @private
   */
  _bindEvents() {
    const el = this.container;

    // Delegated click handler
    el.addEventListener('click', async (e) => {
      // New project button
      if (e.target.closest('[data-action="new-project"]')) {
        this._openNewProjectModal();
        return;
      }

      // Close modal
      if (e.target.closest('[data-action="close-modal"]')) {
        this._closeNewProjectModal();
        return;
      }

      // Confirm new project creation
      if (e.target.closest('[data-action="confirm-new-project"]')) {
        await this._handleCreateProject();
        return;
      }

      // Send button
      if (e.target.closest('[data-action="send"]')) {
        await this._handleSend();
        return;
      }

      // Project card selection
      const card = e.target.closest('.chat-project-card');
      if (card && card.dataset.id) {
        const project = this.projects.find(p => p.id === card.dataset.id);
        if (project) await this._selectProject(project);
        return;
      }
    });

    // Keyboard: project cards
    el.addEventListener('keydown', async (e) => {
      const card = e.target.closest('.chat-project-card');
      if (card && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        const project = this.projects.find(p => p.id === card.dataset.id);
        if (project) await this._selectProject(project);
        return;
      }

      // Close modal on Escape
      if (e.key === 'Escape') {
        this._closeNewProjectModal();
        return;
      }

      // Modal Enter key on name input
      const nameInput = e.target.closest('#new-project-name');
      if (nameInput && e.key === 'Enter') {
        await this._handleCreateProject();
        return;
      }
    });

    // Textarea input: auto-resize + send on Enter
    const textarea = el.querySelector('.chat-input');
    if (textarea) {
      textarea.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          await this._handleSend();
        }
      });

      textarea.addEventListener('input', () => {
        this._autoResizeTextarea(textarea);
      });
    }
  }

  /**
   * Handle the send action from button or keyboard.
   * @private
   */
  async _handleSend() {
    const textarea = this.container?.querySelector('.chat-input');
    if (!textarea) return;
    const content = textarea.value;
    if (!content.trim()) return;
    textarea.value = '';
    this._autoResizeTextarea(textarea);
    await this.sendMessage(content);
  }

  /**
   * Auto-resize the textarea to fit its content.
   * @param {HTMLTextAreaElement} el
   * @private
   */
  _autoResizeTextarea(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  /**
   * Enable or disable the input bar.
   * @param {boolean} enabled
   * @private
   */
  _setInputEnabled(enabled) {
    const textarea = this.container?.querySelector('.chat-input');
    const sendBtn = this.container?.querySelector('[data-action="send"]');
    if (textarea) textarea.disabled = !enabled;
    if (sendBtn) sendBtn.disabled = !enabled;
  }

  /**
   * Focus the message textarea.
   * @private
   */
  _focusInput() {
    const textarea = this.container?.querySelector('.chat-input');
    if (textarea && !textarea.disabled) {
      textarea.focus();
    }
  }

  // ── Private: New project modal ───────────────────────────────────

  /**
   * Open the "New Project" modal.
   * @private
   */
  _openNewProjectModal() {
    const modal = this.container?.querySelector('[data-modal="new-project"]');
    if (!modal) return;
    modal.hidden = false;
    const nameInput = modal.querySelector('#new-project-name');
    if (nameInput) {
      nameInput.value = '';
      nameInput.focus();
    }
  }

  /**
   * Close the "New Project" modal.
   * @private
   */
  _closeNewProjectModal() {
    const modal = this.container?.querySelector('[data-modal="new-project"]');
    if (modal) modal.hidden = true;
  }

  /**
   * Read modal fields, create the project, update the sidebar.
   * @private
   */
  async _handleCreateProject() {
    const modal = this.container?.querySelector('[data-modal="new-project"]');
    if (!modal) return;

    const nameInput = modal.querySelector('#new-project-name');
    const iconInput = modal.querySelector('#new-project-icon');

    const name = nameInput?.value.trim();
    const icon = iconInput?.value.trim() || '💬';

    if (!name) {
      nameInput?.focus();
      nameInput?.classList.add('chat-modal__input--error');
      setTimeout(() => nameInput?.classList.remove('chat-modal__input--error'), 1500);
      return;
    }

    this._closeNewProjectModal();

    try {
      const project = await this.createProject(this.worldId, name, icon);
      this.projects.unshift(project);
      this._renderProjectList();
      await this._selectProject(project);
    } catch (err) {
      console.error('[ChatRooms] _handleCreateProject error:', err);
    }
  }

  // ── Private: Utilities ───────────────────────────────────────────

  /**
   * Scroll the message thread to the bottom.
   * @private
   */
  _scrollToBottom() {
    const thread = this.container?.querySelector('.chat-thread');
    if (thread) {
      thread.scrollTop = thread.scrollHeight;
    }
  }

  /**
   * Format an ISO timestamp to a short human-readable form.
   * @param {string} iso
   * @returns {string}
   * @private
   */
  _formatTime(iso) {
    const date = new Date(iso);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /**
   * Truncate a string to a maximum length.
   * @param {string} str
   * @param {number} max
   * @returns {string}
   * @private
   */
  _truncate(str, max) {
    if (!str) return '';
    return str.length <= max ? str : str.slice(0, max) + '…';
  }

  /**
   * Escape HTML special characters to prevent XSS.
   * @param {string} str
   * @returns {string}
   * @private
   */
  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Emit a custom event on the document for inter-module communication.
   * @param {string} name
   * @param {Object} [detail={}]
   * @private
   */
  _emitEvent(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }
}
