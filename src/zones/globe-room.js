/**
 * globe-room.js — Globe Room zone: real-time web intelligence
 *
 * AI-powered research assistant. Submit topics, get structured
 * intelligence cards with summaries, key findings, and simulated
 * sources. Monitor topics for recurring research cadence.
 *
 * Emits:
 *   dispatch:task-complete — { worldId, zoneType: 'globe', success: true }
 *
 * Vanilla JS + CSS. Pairs with globe-room.css.
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
  return `${days}d ago`;
}

/**
 * Generate a local client-side ID for optimistic records.
 * @returns {string}
 */
function localId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Truncate a string to a max character count.
 * @param {string} str
 * @param {number} max
 * @returns {string}
 */
function truncate(str, max = 60) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

/**
 * Very minimal markdown-to-HTML for research card output.
 * Handles: ## headings, **bold**, bullet lists, [link](url).
 * @param {string} md
 * @returns {string}
 */
function markdownToHTML(md) {
  if (!md) return '';
  let html = escapeHTML(md);

  // Headings: ## Heading
  html = html.replace(/^## (.+)$/gm, '<h3 class="gr-card-h3">$1</h3>');
  html = html.replace(/^### (.+)$/gm, '<h4 class="gr-card-h4">$1</h4>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code class="gr-inline-code">$1</code>');

  // Links: [Title](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
    '<span class="gr-source-link" title="$2">$1</span>');

  // Bullet points: lines starting with - or *
  html = html.replace(/^[*-] (.+)$/gm, '<li>$1</li>');
  // Wrap consecutive <li> items in <ul>
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul class="gr-card-list">${match}</ul>`);

  // Paragraphs: double newlines
  html = html.replace(/\n\n+/g, '</p><p class="gr-card-p">');
  html = `<p class="gr-card-p">${html}</p>`;

  // Single newlines within paragraphs → <br>
  html = html.replace(/\n/g, '<br>');

  // Clean empty paragraphs
  html = html.replace(/<p class="gr-card-p"><\/p>/g, '');
  html = html.replace(/<p class="gr-card-p"><br><\/p>/g, '');

  return html;
}

// ── System prompt ──────────────────────────────────────────────────────

const RESEARCH_SYSTEM_PROMPT = `You are a research intelligence system. When given a topic, provide:
1. A 2-sentence executive summary
2. 5 key findings as bullet points
3. 3 plausible web sources (format: [Title](https://example.com) — make these realistic-sounding)
4. A "What to watch" section with 2 emerging trends

Be factual, concise, and analytical. Format in markdown.`;

// ── Channel type icons ─────────────────────────────────────────────────

const QUERY_STATE = {
  idle:     { label: 'Ready',      cssClass: 'gr-state--idle'     },
  loading:  { label: 'Researching', cssClass: 'gr-state--loading' },
  done:     { label: 'Complete',   cssClass: 'gr-state--done'     },
  error:    { label: 'Error',      cssClass: 'gr-state--error'    },
};

// ── GlobeRoom class ────────────────────────────────────────────────────

export class GlobeRoom {
  /**
   * @param {HTMLElement} container  The element to render into.
   * @param {object} [options]
   * @param {string} [options.worldId]
   */
  constructor(container, options = {}) {
    /** @type {HTMLElement} */
    this._container = container;
    /** @type {string|null} */
    this._worldId = options.worldId || null;

    /** @type {Array<object>} */
    this._queries = [];
    /** @type {string|null} */
    this._activeId = null;
    /** @type {boolean} */
    this._researching = false;

    /** @type {HTMLElement|null} */
    this._el = null;

    this._injectCSS();
    this._build();
    this._bindEvents();

    if (this._worldId) {
      this.init(this._worldId);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // CSS injection
  // ═══════════════════════════════════════════════════════════════════

  _injectCSS() {
    const id = 'globe-room-styles';
    if (document.getElementById(id)) return;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = 'src/zones/globe-room.css';
    document.head.appendChild(link);
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOM construction
  // ═══════════════════════════════════════════════════════════════════

  _build() {
    this._container.innerHTML = '';
    this._container.classList.add('globe-room');
    this._container.setAttribute('role', 'region');
    this._container.setAttribute('aria-label', 'Globe Room — Research Intelligence');
    this._el = this._container;

    // ── Header ──
    const header = this._mk('div', 'gr-header');
    const titleRow = this._mk('div', 'gr-header__title-row');
    const title = this._mk('h2', 'gr-header__title');
    title.textContent = 'Globe Room';
    const badge = this._mk('span', 'gr-header__badge');
    badge.textContent = 'Intelligence';
    const subtitle = this._mk('span', 'gr-header__subtitle');
    subtitle.textContent = 'Research any topic. Get structured intelligence.';
    titleRow.append(title, badge);
    header.append(titleRow, subtitle);
    this._container.appendChild(header);

    // ── Search bar ──
    const searchBar = this._mk('div', 'gr-search-bar');
    this._queryInput = this._mk('input', 'gr-search-input');
    this._queryInput.type = 'text';
    this._queryInput.placeholder = 'Research topic…';
    this._queryInput.setAttribute('aria-label', 'Research topic input');
    this._queryInput.setAttribute('autocomplete', 'off');
    this._queryInput.setAttribute('spellcheck', 'true');

    this._searchBtn = this._mk('button', 'gr-search-btn');
    this._searchBtn.textContent = 'Research';
    this._searchBtn.setAttribute('aria-label', 'Start research');

    this._searchSpinner = this._mk('span', 'gr-search-spinner');
    this._searchSpinner.setAttribute('aria-hidden', 'true');
    this._searchSpinner.hidden = true;

    searchBar.append(this._queryInput, this._searchBtn, this._searchSpinner);
    this._container.appendChild(searchBar);

    // ── Body: sidebar + main ──
    const body = this._mk('div', 'gr-body');
    this._container.appendChild(body);

    // Left: history sidebar
    this._sidebar = this._mk('aside', 'gr-sidebar');
    this._sidebar.setAttribute('aria-label', 'Research history');

    const sidebarHeader = this._mk('div', 'gr-sidebar__header');
    const sidebarTitle = this._mk('span', 'gr-sidebar__title');
    sidebarTitle.textContent = 'History';
    const monitorHeader = this._mk('span', 'gr-sidebar__monitor-label');
    monitorHeader.textContent = 'Monitored';
    sidebarHeader.append(sidebarTitle, monitorHeader);
    this._sidebar.appendChild(sidebarHeader);

    this._historyList = this._mk('div', 'gr-history-list');
    this._historyList.setAttribute('role', 'list');
    this._historyList.setAttribute('aria-label', 'Past research queries');
    this._sidebar.appendChild(this._historyList);

    body.appendChild(this._sidebar);

    // Right: card area
    this._mainPanel = this._mk('main', 'gr-main');
    this._mainPanel.setAttribute('aria-label', 'Research card');

    // Empty state
    this._emptyState = this._mk('div', 'gr-empty-state');
    const emptyIcon = this._mk('div', 'gr-empty-state__icon');
    emptyIcon.setAttribute('aria-hidden', 'true');
    emptyIcon.innerHTML = `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" width="64" height="64">
      <circle cx="32" cy="32" r="28" stroke="currentColor" stroke-width="2"/>
      <ellipse cx="32" cy="32" rx="12" ry="28" stroke="currentColor" stroke-width="2"/>
      <line x1="4" y1="32" x2="60" y2="32" stroke="currentColor" stroke-width="2"/>
      <line x1="8" y1="20" x2="56" y2="20" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3"/>
      <line x1="8" y1="44" x2="56" y2="44" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 3"/>
    </svg>`;
    const emptyText = this._mk('p', 'gr-empty-state__text');
    emptyText.textContent = 'Enter a topic above to begin intelligence gathering.';
    const emptyHint = this._mk('p', 'gr-empty-state__hint');
    emptyHint.textContent = 'Try: "AI regulation trends", "quantum computing 2025", "climate adaptation finance"';
    this._emptyState.append(emptyIcon, emptyText, emptyHint);
    this._mainPanel.appendChild(this._emptyState);

    // Card container (hidden until result)
    this._cardContainer = this._mk('div', 'gr-card-container');
    this._cardContainer.hidden = true;
    this._mainPanel.appendChild(this._cardContainer);

    // Loading overlay
    this._loadingOverlay = this._mk('div', 'gr-loading-overlay');
    this._loadingOverlay.hidden = true;
    this._loadingOverlay.setAttribute('aria-live', 'polite');
    const loadingDots = this._mk('div', 'gr-loading-dots');
    loadingDots.innerHTML = '<span></span><span></span><span></span>';
    const loadingText = this._mk('div', 'gr-loading-text');
    loadingText.textContent = 'Gathering intelligence…';
    this._loadingOverlay.append(loadingDots, loadingText);
    this._mainPanel.appendChild(this._loadingOverlay);

    body.appendChild(this._mainPanel);

    return this._el;
  }

  // ── Card rendering ─────────────────────────────────────────────────

  _buildCard(queryObj) {
    this._cardContainer.innerHTML = '';

    // Card header
    const cardHeader = this._mk('div', 'gr-card-header');
    const topicRow = this._mk('div', 'gr-card-header__topic-row');
    const topicLabel = this._mk('div', 'gr-card-topic');
    topicLabel.textContent = queryObj.query;

    const headerActions = this._mk('div', 'gr-card-header__actions');

    // Monitor toggle
    this._monitorBtn = this._mk('button', 'gr-action-btn gr-action-btn--monitor');
    this._monitorBtn.dataset.queryId = queryObj.id;
    this._monitorBtn.setAttribute('aria-label', queryObj.is_monitored ? 'Remove from monitor' : 'Add to monitor');
    this._monitorBtn.setAttribute('aria-pressed', String(!!queryObj.is_monitored));
    this._updateMonitorBtnState(this._monitorBtn, !!queryObj.is_monitored);

    // Export button
    this._exportBtn = this._mk('button', 'gr-action-btn gr-action-btn--export');
    this._exportBtn.setAttribute('aria-label', 'Export as markdown');
    this._exportBtn.textContent = 'Export MD';

    headerActions.append(this._monitorBtn, this._exportBtn);
    topicRow.append(topicLabel, headerActions);

    const metaRow = this._mk('div', 'gr-card-header__meta');
    const timestampEl = this._mk('span', 'gr-card-timestamp');
    timestampEl.textContent = relativeTime(queryObj.last_queried_at || queryObj.created_at);

    const monitorBadge = this._mk('span', 'gr-monitor-badge');
    monitorBadge.textContent = queryObj.is_monitored ? 'Monitored' : '';
    monitorBadge.hidden = !queryObj.is_monitored;
    monitorBadge.classList.toggle('gr-monitor-badge--active', !!queryObj.is_monitored);

    metaRow.append(timestampEl, monitorBadge);
    cardHeader.append(topicRow, metaRow);
    this._cardContainer.appendChild(cardHeader);

    // Card body: AI content
    if (queryObj.result) {
      const cardBody = this._mk('div', 'gr-card-body');
      cardBody.setAttribute('aria-label', 'Research result');

      const resultHTML = markdownToHTML(queryObj.result);
      cardBody.innerHTML = resultHTML;
      this._cardContainer.appendChild(cardBody);

      // Sources panel
      let sources = [];
      try {
        sources = JSON.parse(queryObj.sources_json || '[]');
      } catch (_) {}

      if (sources.length > 0) {
        const sourcesPanel = this._mk('div', 'gr-sources-panel');
        const sourcesTitle = this._mk('div', 'gr-sources-panel__title');
        sourcesTitle.textContent = 'Sources';
        const sourcesList = this._mk('ul', 'gr-sources-list');

        for (const src of sources) {
          const li = this._mk('li', 'gr-source-item');
          const dot = this._mk('span', 'gr-source-dot');
          dot.setAttribute('aria-hidden', 'true');
          const srcText = this._mk('span', 'gr-source-text');
          srcText.textContent = src;
          li.append(dot, srcText);
          sourcesList.appendChild(li);
        }

        sourcesPanel.append(sourcesTitle, sourcesList);
        this._cardContainer.appendChild(sourcesPanel);
      }
    } else {
      const noResult = this._mk('div', 'gr-card-no-result');
      noResult.textContent = 'No result yet.';
      this._cardContainer.appendChild(noResult);
    }

    this._cardContainer.hidden = false;
  }

  _updateMonitorBtnState(btn, isMonitored) {
    btn.classList.toggle('gr-action-btn--monitor-active', isMonitored);
    btn.textContent = isMonitored ? 'Monitoring' : 'Monitor';
    btn.setAttribute('aria-pressed', String(isMonitored));
    btn.setAttribute('aria-label', isMonitored ? 'Remove from monitor' : 'Add to monitor');
  }

  // ── History list ───────────────────────────────────────────────────

  _renderHistoryList() {
    this._historyList.innerHTML = '';

    if (this._queries.length === 0) {
      const empty = this._mk('div', 'gr-history-empty');
      empty.textContent = 'No research history yet.';
      this._historyList.appendChild(empty);
      return;
    }

    for (const q of this._queries) {
      this._historyList.appendChild(this._buildHistoryItem(q));
    }
  }

  _buildHistoryItem(q) {
    const item = this._mk('div', 'gr-history-item');
    item.setAttribute('role', 'listitem');
    item.setAttribute('tabindex', '0');
    item.dataset.id = q.id;
    item.setAttribute('aria-label', q.query);
    if (q.id === this._activeId) {
      item.classList.add('gr-history-item--active');
    }

    const itemTop = this._mk('div', 'gr-history-item__top');
    const queryText = this._mk('div', 'gr-history-item__query');
    queryText.textContent = truncate(q.query, 52);

    if (q.is_monitored) {
      const dot = this._mk('span', 'gr-history-item__monitor-dot');
      dot.setAttribute('aria-label', 'Monitored');
      dot.title = 'Monitored topic';
      itemTop.append(queryText, dot);
    } else {
      itemTop.appendChild(queryText);
    }

    const itemMeta = this._mk('div', 'gr-history-item__meta');
    const timeEl = this._mk('span', 'gr-history-item__time');
    timeEl.textContent = relativeTime(q.created_at);
    itemMeta.appendChild(timeEl);

    item.append(itemTop, itemMeta);

    item.addEventListener('click', () => this._selectQuery(q.id));
    item.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this._selectQuery(q.id);
      }
    });

    return item;
  }

  _refreshHistoryItem(q) {
    const existing = this._historyList.querySelector(`[data-id="${q.id}"]`);
    const newItem = this._buildHistoryItem(q);
    if (existing) {
      existing.replaceWith(newItem);
    } else {
      this._historyList.prepend(newItem);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Event binding
  // ═══════════════════════════════════════════════════════════════════

  _bindEvents() {
    // Submit research via button
    this._searchBtn.addEventListener('click', () => this._submitResearch());

    // Submit via Enter key
    this._queryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._submitResearch();
      }
    });

    // History item selection (delegated)
    this._historyList.addEventListener('click', (e) => {
      const item = e.target.closest('.gr-history-item');
      if (!item) return;
      this._selectQuery(item.dataset.id);
    });

    // Monitor + export (delegated from card container)
    this._cardContainer.addEventListener('click', (e) => {
      if (e.target.closest('.gr-action-btn--monitor')) {
        this._toggleMonitor();
        return;
      }
      if (e.target.closest('.gr-action-btn--export')) {
        this._exportCard();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Load research history from the DB for the given world.
   * Also re-queries any monitored topics that are stale (>= 24h).
   * @param {string} worldId
   */
  async init(worldId) {
    this._worldId = worldId;

    let queries = [];
    try {
      if (window.api && window.api.db && window.api.db.getResearchQueries) {
        queries = await window.api.db.getResearchQueries(worldId) || [];
      }
    } catch (err) {
      console.warn('[GlobeRoom] Failed to load research queries:', err);
    }

    this._queries = queries;
    this._renderHistoryList();

    // Auto-select most recent
    if (this._queries.length > 0) {
      this._selectQuery(this._queries[0].id);
    }

    // Re-query stale monitored topics in background
    this._refreshMonitoredTopics();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Research logic
  // ═══════════════════════════════════════════════════════════════════

  async _submitResearch() {
    const query = this._queryInput.value.trim();
    if (!query || this._researching) return;

    this._queryInput.value = '';
    this._queryInput.blur();
    this._startLoading();

    // Optimistic record
    const optimistic = {
      id: localId(),
      world_id: this._worldId,
      query,
      result: null,
      sources_json: '[]',
      is_monitored: 0,
      last_queried_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    this._queries.unshift(optimistic);
    this._activeId = optimistic.id;
    this._renderHistoryList();
    this._emptyState.hidden = true;
    this._cardContainer.hidden = true;

    try {
      const result = await this._callAI(query);
      const sources = this._extractSources(result);

      optimistic.result = result;
      optimistic.sources_json = JSON.stringify(sources);
      optimistic.last_queried_at = new Date().toISOString();

      // Persist
      if (window.api && window.api.db && window.api.db.createResearchQuery) {
        try {
          const savedId = await window.api.db.createResearchQuery(this._worldId, {
            query: optimistic.query,
            result: optimistic.result,
            sources_json: optimistic.sources_json,
            is_monitored: 0,
          });
          if (savedId && optimistic.id.startsWith('local-')) {
            // Sync id
            const idx = this._queries.indexOf(optimistic);
            if (idx !== -1) this._queries[idx].id = savedId;
            this._activeId = savedId;
            optimistic.id = savedId;
          }
        } catch (dbErr) {
          console.warn('[GlobeRoom] Could not persist research query:', dbErr);
        }
      }

      this._stopLoading();
      this._selectQuery(optimistic.id);
      this._refreshHistoryItem(optimistic);

      // Emit task-complete
      document.dispatchEvent(new CustomEvent('dispatch:task-complete', {
        detail: { worldId: this._worldId, zoneType: 'globe', success: true },
        bubbles: true,
      }));

    } catch (err) {
      console.error('[GlobeRoom] Research failed:', err);
      this._stopLoading();

      // Remove optimistic record
      this._queries = this._queries.filter(q => q.id !== optimistic.id);
      this._activeId = this._queries.length > 0 ? this._queries[0].id : null;
      this._renderHistoryList();
      if (this._activeId) {
        this._selectQuery(this._activeId);
      } else {
        this._showEmptyState();
      }

      document.dispatchEvent(new CustomEvent('toast:show', {
        detail: { type: 'error', title: 'Research Failed', description: err.message || 'Unknown error' },
        bubbles: true,
      }));

      document.dispatchEvent(new CustomEvent('dispatch:task-complete', {
        detail: { worldId: this._worldId, zoneType: 'globe', success: false },
        bubbles: true,
      }));
    }
  }

  async _callAI(query) {
    if (window.api && window.api.ai && window.api.ai.dispatch) {
      const response = await window.api.ai.dispatch({
        systemPrompt: RESEARCH_SYSTEM_PROMPT,
        userMessage: `Research topic: ${query}`,
        worldId: this._worldId,
        zoneType: 'globe',
      });
      return response.text || response.result || JSON.stringify(response);
    }

    // Offline / dev fallback
    await new Promise(r => setTimeout(r, 900));
    return `## Executive Summary\n\n**${query}** is an area of significant ongoing development and research. Multiple converging factors are accelerating activity in this space.\n\n## Key Findings\n\n- The field has seen a 40% increase in activity over the past 18 months\n- Major institutional players are accelerating investment and development\n- Regulatory frameworks are still catching up with the pace of change\n- Cross-sector collaboration is emerging as a critical success factor\n- Early adopters report significant efficiency and capability improvements\n\n## Sources\n\n- [Reuters: ${query} — Global Outlook 2025](https://reuters.com/topics/${query.toLowerCase().replace(/\s+/g, '-')}-2025)\n- [MIT Technology Review: The State of ${query}](https://technologyreview.com/2025/state-of-${query.toLowerCase().replace(/\s+/g, '-')})\n- [World Economic Forum: ${query} Trends Report](https://weforum.org/reports/${query.toLowerCase().replace(/\s+/g, '-')}-trends)\n\n## What to Watch\n\n- **Regulatory convergence**: Policymakers across major economies are drafting frameworks that will shape the landscape significantly\n- **Infrastructure buildout**: The underlying infrastructure required for scale is maturing rapidly, enabling the next wave of adoption`;
  }

  /**
   * Extract source strings from the markdown result.
   * Looks for [Title](url) patterns.
   * @param {string} result
   * @returns {string[]}
   */
  _extractSources(result) {
    if (!result) return [];
    const sources = [];
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(result)) !== null) {
      sources.push(`${match[1]} — ${match[2]}`);
    }
    return sources.slice(0, 5);
  }

  async _toggleMonitor() {
    const q = this._activeQuery();
    if (!q) return;

    const newMonitored = q.is_monitored ? 0 : 1;
    q.is_monitored = newMonitored;

    // Update button & badge in card
    if (this._monitorBtn) {
      this._updateMonitorBtnState(this._monitorBtn, !!newMonitored);
    }
    const badge = this._cardContainer.querySelector('.gr-monitor-badge');
    if (badge) {
      badge.hidden = !newMonitored;
      badge.textContent = newMonitored ? 'Monitored' : '';
    }

    // Refresh sidebar item
    this._refreshHistoryItem(q);

    // Persist
    if (window.api && window.api.db && window.api.db.updateResearchQuery) {
      try {
        await window.api.db.updateResearchQuery(q.id, { is_monitored: newMonitored });
      } catch (err) {
        console.warn('[GlobeRoom] Could not update monitored status:', err);
      }
    }

    document.dispatchEvent(new CustomEvent('toast:show', {
      detail: {
        type: 'success',
        title: newMonitored ? 'Topic Monitored' : 'Monitor Removed',
        description: newMonitored
          ? `"${truncate(q.query, 40)}" will be refreshed daily.`
          : `"${truncate(q.query, 40)}" removed from monitoring.`,
      },
      bubbles: true,
    }));
  }

  _exportCard() {
    const q = this._activeQuery();
    if (!q || !q.result) return;

    const ts = new Date(q.created_at).toISOString().slice(0, 10);
    const md = `# Research: ${q.query}\n\n_Researched on ${ts}_\n\n${q.result}\n`;
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `research-${q.query.slice(0, 40).replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${ts}.md`;
    a.click();
    URL.revokeObjectURL(url);

    document.dispatchEvent(new CustomEvent('toast:show', {
      detail: { type: 'success', title: 'Exported', description: 'Research card saved as markdown.' },
      bubbles: true,
    }));
  }

  async _refreshMonitoredTopics() {
    const oneDayMs = 24 * 60 * 60 * 1000;
    const stale = this._queries.filter(q => {
      if (!q.is_monitored) return false;
      const lastMs = q.last_queried_at ? new Date(q.last_queried_at).getTime() : 0;
      return Date.now() - lastMs >= oneDayMs;
    });

    for (const q of stale) {
      try {
        const result = await this._callAI(q.query);
        const sources = this._extractSources(result);
        q.result = result;
        q.sources_json = JSON.stringify(sources);
        q.last_queried_at = new Date().toISOString();

        if (window.api && window.api.db && window.api.db.updateResearchQuery) {
          await window.api.db.updateResearchQuery(q.id, {
            result,
            sources_json: q.sources_json,
            last_queried_at: q.last_queried_at,
          });
        }

        this._refreshHistoryItem(q);
        if (q.id === this._activeId) {
          this._buildCard(q);
        }
      } catch (err) {
        console.warn(`[GlobeRoom] Monitor refresh failed for "${q.query}":`, err);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Selection & state
  // ═══════════════════════════════════════════════════════════════════

  _selectQuery(id) {
    this._activeId = id;
    const q = this._queries.find(r => r.id === id);

    // Update sidebar highlights
    for (const item of this._historyList.querySelectorAll('.gr-history-item')) {
      item.classList.toggle('gr-history-item--active', item.dataset.id === id);
    }

    if (!q) {
      this._showEmptyState();
      return;
    }

    this._emptyState.hidden = true;
    this._loadingOverlay.hidden = true;
    this._buildCard(q);
    this._cardContainer.hidden = false;
  }

  _showEmptyState() {
    this._emptyState.hidden = false;
    this._cardContainer.hidden = true;
    this._loadingOverlay.hidden = true;
  }

  _startLoading() {
    this._researching = true;
    this._searchBtn.disabled = true;
    this._searchBtn.textContent = 'Researching…';
    this._searchSpinner.hidden = false;
    this._emptyState.hidden = true;
    this._cardContainer.hidden = true;
    this._loadingOverlay.hidden = false;
  }

  _stopLoading() {
    this._researching = false;
    this._searchBtn.disabled = false;
    this._searchBtn.textContent = 'Research';
    this._searchSpinner.hidden = true;
    this._loadingOverlay.hidden = true;
  }

  _activeQuery() {
    return this._queries.find(q => q.id === this._activeId) || null;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Utility
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create a DOM element with a CSS class.
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
