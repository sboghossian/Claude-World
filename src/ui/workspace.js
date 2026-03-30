/**
 * workspace.js — Multi-panel workspace system for Claude World
 *
 * Wraps the existing PanelManager to support multiple simultaneous panels
 * with a tab bar, split views, drag-to-reorder tabs, and keyboard shortcuts.
 *
 * Keyboard shortcuts:
 *   Cmd+\      Toggle split view mode (single -> horizontal -> vertical)
 *   Cmd+W      Close current tab
 *   Cmd+1-9    Switch to tab by position
 */

const STORAGE_KEY = 'claude-world-workspace-tabs';
const MAX_PANELS = 4;

// ── Tab data structure ─────────────────────────────────────────────

/**
 * @typedef {Object} TabInfo
 * @property {string} id       — Unique tab id (= zoneId or agentId)
 * @property {string} type     — 'zone' | 'agent' | 'settings'
 * @property {string} title    — Display name
 * @property {string} icon     — Emoji icon
 */

// ── Split modes ────────────────────────────────────────────────────

const SPLIT_NONE       = 'single';
const SPLIT_HORIZONTAL = 'horizontal'; // side by side
const SPLIT_VERTICAL   = 'vertical';   // top / bottom

const SPLIT_CYCLE = [SPLIT_NONE, SPLIT_HORIZONTAL, SPLIT_VERTICAL];

// ── Workspace class ────────────────────────────────────────────────

export class Workspace {
  /**
   * @param {import('./panels.js').PanelManager} panelManager
   */
  constructor(panelManager) {
    /** @type {import('./panels.js').PanelManager} */
    this._pm = panelManager;

    /** @type {TabInfo[]} */
    this._tabs = [];

    /** @type {string|null} — id of active tab in the primary pane */
    this._activeTabId = null;

    /** @type {string|null} — id of active tab in the secondary (split) pane */
    this._splitTabId = null;

    /** @type {string} */
    this._splitMode = SPLIT_NONE;

    /** @type {number} — divider position as a fraction 0-1 */
    this._dividerRatio = 0.5;

    /** @type {boolean} */
    this._mounted = false;

    // DOM references (created in mount)
    this._root = null;
    this._tabBar = null;
    this._tabScroller = null;
    this._paneContainer = null;
    this._primaryPane = null;
    this._secondaryPane = null;
    this._divider = null;

    // Drag state
    this._dragTabId = null;
    this._dragGhost = null;
    this._dragStartX = 0;

    // Divider drag state
    this._isDraggingDivider = false;

    // Bound handlers
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onPanelOpened = this._handlePanelOpened.bind(this);
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Mount the workspace into the DOM.
   * Intercepts the existing PanelManager overlay and wraps it.
   */
  mount() {
    if (this._mounted) return;
    this._mounted = true;

    this._createDOM();
    this._injectIntoPanel();
    this._restoreTabs();
    this._bindEvents();
    this._render();
  }

  /**
   * Toggle through split modes: single -> horizontal -> vertical -> single
   */
  splitView() {
    const idx = SPLIT_CYCLE.indexOf(this._splitMode);
    this._splitMode = SPLIT_CYCLE[(idx + 1) % SPLIT_CYCLE.length];

    // When entering split mode and we have 2+ tabs, assign second tab to split pane
    if (this._splitMode !== SPLIT_NONE && !this._splitTabId && this._tabs.length >= 2) {
      const other = this._tabs.find(t => t.id !== this._activeTabId);
      if (other) this._splitTabId = other.id;
    }

    // When leaving split mode, collapse split tab
    if (this._splitMode === SPLIT_NONE) {
      this._splitTabId = null;
    }

    this._render();
  }

  /**
   * Close a tab by id.
   * @param {string} id
   */
  closeTab(id) {
    const idx = this._tabs.findIndex(t => t.id === id);
    if (idx === -1) return;

    this._tabs.splice(idx, 1);

    // Update active tab references
    if (this._activeTabId === id) {
      this._activeTabId = this._tabs.length > 0
        ? this._tabs[Math.min(idx, this._tabs.length - 1)].id
        : null;
    }
    if (this._splitTabId === id) {
      this._splitTabId = null;
    }

    // If no tabs left, close the whole panel overlay
    if (this._tabs.length === 0) {
      this._pm.close();
    }

    this._saveTabs();
    this._render();
  }

  /**
   * Switch to a tab by id.
   * @param {string} id
   */
  switchTab(id) {
    if (!this._tabs.find(t => t.id === id)) return;

    // If the tab is already in the split pane, swap focus
    if (this._splitTabId === id) {
      [this._activeTabId, this._splitTabId] = [this._splitTabId, this._activeTabId];
    } else {
      this._activeTabId = id;
    }

    this._loadTabContent(id, this._primaryPane);
    this._saveTabs();
    this._render();
  }

  /**
   * Tear down the workspace.
   */
  destroy() {
    this._unbindEvents();
    if (this._root && this._root.parentNode) {
      this._root.remove();
    }
    this._mounted = false;
  }

  // ── DOM creation ─────────────────────────────────────────────────

  _createDOM() {
    // Root workspace container
    this._root = document.createElement('div');
    this._root.className = 'workspace';

    // Tab bar
    this._tabBar = document.createElement('div');
    this._tabBar.className = 'workspace__tab-bar';

    this._tabScroller = document.createElement('div');
    this._tabScroller.className = 'workspace__tab-scroller';
    this._tabBar.appendChild(this._tabScroller);

    // Split toggle button
    const splitBtn = document.createElement('button');
    splitBtn.className = 'workspace__split-btn';
    splitBtn.setAttribute('aria-label', 'Toggle split view');
    splitBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="5" height="12" rx="1" stroke="currentColor" stroke-width="1.5"/><rect x="8" y="1" width="5" height="12" rx="1" stroke="currentColor" stroke-width="1.5"/></svg>';
    splitBtn.addEventListener('click', () => this.splitView());
    this._tabBar.appendChild(splitBtn);

    this._root.appendChild(this._tabBar);

    // Pane container
    this._paneContainer = document.createElement('div');
    this._paneContainer.className = 'workspace__panes';

    this._primaryPane = document.createElement('div');
    this._primaryPane.className = 'workspace__pane workspace__pane--primary';

    this._divider = document.createElement('div');
    this._divider.className = 'workspace__divider';
    this._divider.innerHTML = '<div class="workspace__divider-handle"></div>';

    this._secondaryPane = document.createElement('div');
    this._secondaryPane.className = 'workspace__pane workspace__pane--secondary';

    this._paneContainer.appendChild(this._primaryPane);
    this._paneContainer.appendChild(this._divider);
    this._paneContainer.appendChild(this._secondaryPane);

    this._root.appendChild(this._paneContainer);
  }

  /**
   * Inject workspace into the existing panel overlay, between header and body.
   */
  _injectIntoPanel() {
    const panel = this._pm._panel;
    if (!panel) return;

    // Insert our root before the panel body
    const body = this._pm._body;
    panel.insertBefore(this._root, body);

    // Move the original body into the primary pane as the default content host
    this._primaryPane.appendChild(body);
  }

  // ── Tab rendering ────────────────────────────────────────────────

  _render() {
    this._renderTabBar();
    this._renderPanes();
    this._renderSplitMode();
  }

  _renderTabBar() {
    this._tabScroller.innerHTML = '';

    for (const tab of this._tabs) {
      const el = document.createElement('div');
      el.className = 'workspace__tab';
      el.dataset.tabId = tab.id;

      if (tab.id === this._activeTabId) {
        el.classList.add('workspace__tab--active');
      }
      if (tab.id === this._splitTabId) {
        el.classList.add('workspace__tab--split');
      }

      // Icon
      const icon = document.createElement('span');
      icon.className = 'workspace__tab-icon';
      icon.textContent = tab.icon;
      el.appendChild(icon);

      // Label
      const label = document.createElement('span');
      label.className = 'workspace__tab-label';
      label.textContent = tab.title;
      el.appendChild(label);

      // Close button
      const closeBtn = document.createElement('button');
      closeBtn.className = 'workspace__tab-close';
      closeBtn.setAttribute('aria-label', `Close ${tab.title}`);
      closeBtn.textContent = '\u00D7';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeTab(tab.id);
      });
      el.appendChild(closeBtn);

      // Click to switch
      el.addEventListener('click', () => this.switchTab(tab.id));

      // Drag to reorder
      el.draggable = true;
      el.addEventListener('dragstart', (e) => this._onDragStart(e, tab.id));
      el.addEventListener('dragover', (e) => this._onDragOver(e, tab.id));
      el.addEventListener('dragend', () => this._onDragEnd());
      el.addEventListener('drop', (e) => this._onDrop(e, tab.id));

      this._tabScroller.appendChild(el);
    }

    // Show/hide tab bar based on tab count
    this._tabBar.classList.toggle('workspace__tab-bar--hidden', this._tabs.length <= 1);
  }

  _renderPanes() {
    // Load active tab content into primary pane (using PanelManager internals)
    if (this._activeTabId) {
      this._loadTabContent(this._activeTabId, this._primaryPane);
    }

    // Load split tab content into secondary pane
    if (this._splitTabId && this._splitMode !== SPLIT_NONE) {
      this._loadTabContent(this._splitTabId, this._secondaryPane);
    }
  }

  _renderSplitMode() {
    // Update container classes
    this._paneContainer.classList.remove(
      'workspace__panes--single',
      'workspace__panes--horizontal',
      'workspace__panes--vertical',
    );
    this._paneContainer.classList.add(`workspace__panes--${this._splitMode}`);

    // Show/hide divider and secondary pane
    const isSplit = this._splitMode !== SPLIT_NONE;
    this._divider.classList.toggle('workspace__divider--visible', isSplit);
    this._secondaryPane.classList.toggle('workspace__pane--visible', isSplit);

    // Apply divider ratio
    this._applyDividerRatio();
  }

  _applyDividerRatio() {
    const r = this._dividerRatio;

    if (this._splitMode === SPLIT_HORIZONTAL) {
      this._primaryPane.style.width = `${r * 100}%`;
      this._primaryPane.style.height = '';
      this._secondaryPane.style.width = `${(1 - r) * 100}%`;
      this._secondaryPane.style.height = '';
    } else if (this._splitMode === SPLIT_VERTICAL) {
      this._primaryPane.style.height = `${r * 100}%`;
      this._primaryPane.style.width = '';
      this._secondaryPane.style.height = `${(1 - r) * 100}%`;
      this._secondaryPane.style.width = '';
    } else {
      this._primaryPane.style.width = '';
      this._primaryPane.style.height = '';
      this._secondaryPane.style.width = '';
      this._secondaryPane.style.height = '';
    }
  }

  // ── Tab content loading ──────────────────────────────────────────

  _loadTabContent(tabId, pane) {
    const tab = this._tabs.find(t => t.id === tabId);
    if (!tab) return;

    // Update the PanelManager header to match active tab
    if (pane === this._primaryPane && this._pm._headerIcon && this._pm._title) {
      this._pm._headerIcon.textContent = tab.icon;
      this._pm._title.textContent = tab.title;
    }

    // The PanelManager already loaded content into its body for the most recent
    // openZone/openAgent call. We only need to reload if switching tabs.
    // Trigger the panel manager to open the tab's zone/agent silently.
    if (tabId === this._pm._currentId) return; // already showing

    // Use PanelManager's open methods which build the content
    if (tab.type === 'zone') {
      this._pm.openZone(tab.id, tab.title);
    } else if (tab.type === 'agent') {
      this._pm.openAgent(tab.id);
    } else if (tab.type === 'settings') {
      this._pm.openSettings();
    }
  }

  // ── Tab management ───────────────────────────────────────────────

  /**
   * Add or activate a tab. Called when PanelManager opens something.
   * @param {TabInfo} info
   */
  _addOrActivateTab(info) {
    const existing = this._tabs.find(t => t.id === info.id);
    if (existing) {
      this._activeTabId = info.id;
    } else {
      // Enforce max panels
      if (this._tabs.length >= MAX_PANELS) {
        // Remove the oldest non-active tab
        const removeIdx = this._tabs.findIndex(t =>
          t.id !== this._activeTabId && t.id !== this._splitTabId
        );
        if (removeIdx !== -1) {
          this._tabs.splice(removeIdx, 1);
        }
      }
      this._tabs.push(info);
      this._activeTabId = info.id;
    }

    this._saveTabs();
    this._render();
  }

  // ── Drag and drop for tab reordering ─────────────────────────────

  _onDragStart(e, tabId) {
    this._dragTabId = tabId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tabId);

    // Style the dragged tab
    const tabEl = e.currentTarget;
    requestAnimationFrame(() => tabEl.classList.add('workspace__tab--dragging'));
  }

  _onDragOver(e, tabId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!this._dragTabId || this._dragTabId === tabId) return;

    // Reorder in real time
    const fromIdx = this._tabs.findIndex(t => t.id === this._dragTabId);
    const toIdx = this._tabs.findIndex(t => t.id === tabId);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = this._tabs.splice(fromIdx, 1);
    this._tabs.splice(toIdx, 0, moved);

    this._renderTabBar();
  }

  _onDrop(e, tabId) {
    e.preventDefault();
    this._saveTabs();
  }

  _onDragEnd() {
    this._dragTabId = null;
    // Remove dragging class from all tabs
    const dragging = this._tabScroller.querySelectorAll('.workspace__tab--dragging');
    dragging.forEach(el => el.classList.remove('workspace__tab--dragging'));
  }

  // ── Divider dragging ─────────────────────────────────────────────

  _initDividerDrag(e) {
    e.preventDefault();
    this._isDraggingDivider = true;
    this._root.classList.add('workspace--resizing');

    const onMove = (me) => {
      if (!this._isDraggingDivider) return;
      const rect = this._paneContainer.getBoundingClientRect();

      if (this._splitMode === SPLIT_HORIZONTAL) {
        this._dividerRatio = Math.max(0.2, Math.min(0.8, (me.clientX - rect.left) / rect.width));
      } else {
        this._dividerRatio = Math.max(0.2, Math.min(0.8, (me.clientY - rect.top) / rect.height));
      }

      this._applyDividerRatio();
    };

    const onUp = () => {
      this._isDraggingDivider = false;
      this._root.classList.remove('workspace--resizing');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Event handling ───────────────────────────────────────────────

  _bindEvents() {
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('panel:opened', this._onPanelOpened);

    this._divider.addEventListener('mousedown', (e) => this._initDividerDrag(e));
  }

  _unbindEvents() {
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('panel:opened', this._onPanelOpened);
  }

  /**
   * Intercept panel:opened events from PanelManager to create tabs.
   */
  _handlePanelOpened(e) {
    const { type, id } = e.detail;
    const icon = this._pm._headerIcon?.textContent || '';
    const title = this._pm._title?.textContent || id;

    this._addOrActivateTab({ id, type, title, icon });
  }

  /**
   * Keyboard shortcuts.
   */
  _handleKeyDown(e) {
    const isMeta = e.metaKey || e.ctrlKey;

    // Cmd+\ — toggle split view
    if (isMeta && e.key === '\\') {
      e.preventDefault();
      if (this._pm.isOpen) {
        this.splitView();
      }
      return;
    }

    // Cmd+W — close current tab
    if (isMeta && e.key === 'w') {
      if (this._pm.isOpen && this._activeTabId) {
        e.preventDefault();
        this.closeTab(this._activeTabId);
      }
      return;
    }

    // Cmd+1-9 — switch to tab by position
    if (isMeta && e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key, 10) - 1;
      if (this._pm.isOpen && idx < this._tabs.length) {
        e.preventDefault();
        this.switchTab(this._tabs[idx].id);
      }
      return;
    }
  }

  // ── Persistence ──────────────────────────────────────────────────

  _saveTabs() {
    try {
      const data = {
        tabs: this._tabs,
        activeTabId: this._activeTabId,
        splitTabId: this._splitTabId,
        splitMode: this._splitMode,
        dividerRatio: this._dividerRatio,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Silently ignore storage errors
    }
  }

  _restoreTabs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const data = JSON.parse(raw);
      if (Array.isArray(data.tabs)) {
        this._tabs = data.tabs.slice(0, MAX_PANELS);
      }
      if (data.activeTabId) {
        this._activeTabId = data.activeTabId;
      }
      if (data.splitTabId) {
        this._splitTabId = data.splitTabId;
      }
      if (data.splitMode && SPLIT_CYCLE.includes(data.splitMode)) {
        this._splitMode = data.splitMode;
      }
      if (typeof data.dividerRatio === 'number') {
        this._dividerRatio = Math.max(0.2, Math.min(0.8, data.dividerRatio));
      }
    } catch {
      // Silently ignore parse errors
    }
  }
}
