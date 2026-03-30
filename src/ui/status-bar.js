/**
 * status-bar.js — VS Code-style bottom status bar for Claude World
 *
 * Fixed 28px bar at the very bottom of the screen.
 *   Left:   World name, current zone, zone status dot
 *   Center: Active task count / "idle", streaming indicator, keyboard hint
 *   Right:  Provider dots, DB size, uptime, version, quick toggles
 *
 * All interactive items dispatch document CustomEvents for navigation.
 * Updates reactively via document event listeners.
 */

const APP_VERSION = '0.1.0';

// ── Helpers ──────────────────────────────────────────────────────

/** Create a DOM element with optional class and text content. */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

/** Format bytes to human-readable string. */
function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format seconds to uptime string: "0h 5m" / "2h 13m" */
function fmtUptime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}


// ── Main class ───────────────────────────────────────────────────

export class StatusBar {
  constructor() {
    // ── State ──────────────────────────────────────────────────
    this._worldName     = 'Claude World';
    this._zoneName      = 'Dispatch Tower';
    this._zoneStatus    = 'green';   // green | amber | red
    this._taskCount     = 0;
    this._streaming     = false;
    this._providers     = [];        // [{ name, connected }]
    this._dbSize        = 0;         // bytes
    this._startTime     = Date.now();
    this._audioMuted    = false;
    this._focusMode     = false;
    this._themeIndex    = 0;
    this._themes        = ['dark', 'midnight', 'twilight'];
    this._cmdHeld       = false;
    this._uptimeInterval = null;

    // ── Build DOM ─────────────────────────────────────────────
    this._root = el('div', 'status-bar');
    this._root.setAttribute('role', 'status');
    this._root.setAttribute('aria-label', 'Status bar');

    this._buildLeft();
    this._buildCenter();
    this._buildRight();

    // ── Wire events ───────────────────────────────────────────
    this._bindEvents();

    // ── Tick uptime ───────────────────────────────────────────
    this._uptimeInterval = setInterval(() => this._updateUptime(), 60_000);
    this._updateUptime();
  }


  // ══════════════════════════════════════════════════════════════
  // Left section: world name, zone name, zone status dot
  // ══════════════════════════════════════════════════════════════

  _buildLeft() {
    this._left = el('div', 'status-bar__left');

    // World name (clickable → home dashboard)
    this._worldBtn = el('button', 'status-bar__item');
    this._worldBtn.setAttribute('aria-label', 'Open home dashboard');
    this._worldIcon = el('span', null, '\u{1F3D9}');  // cityscape emoji
    this._worldLabel = el('span', null, this._worldName);
    this._worldBtn.appendChild(this._worldIcon);
    this._worldBtn.appendChild(this._worldLabel);
    this._worldBtn.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('statusbar:navigate', {
        detail: { target: 'home' }, bubbles: true,
      }));
    });

    // Separator
    const sep1 = el('span', 'status-bar__sep');

    // Zone (clickable → open zone)
    this._zoneBtn = el('button', 'status-bar__item');
    this._zoneBtn.setAttribute('aria-label', 'Open current zone');
    this._zoneDot = el('span', 'status-bar__dot status-bar__dot--green');
    this._zoneLabel = el('span', null, this._zoneName);
    this._zoneBtn.appendChild(this._zoneDot);
    this._zoneBtn.appendChild(this._zoneLabel);
    this._zoneBtn.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('statusbar:navigate', {
        detail: { target: 'zone', zone: this._zoneName }, bubbles: true,
      }));
    });

    this._left.appendChild(this._worldBtn);
    this._left.appendChild(sep1);
    this._left.appendChild(this._zoneBtn);

    this._root.appendChild(this._left);
  }


  // ══════════════════════════════════════════════════════════════
  // Center section: task count / idle, streaming dots, shortcut hint
  // ══════════════════════════════════════════════════════════════

  _buildCenter() {
    this._center = el('div', 'status-bar__center');

    // Task text
    this._taskText = el('span', 'status-bar__task-text', 'idle');

    // Streaming indicator (3 bouncing dots, hidden by default)
    this._streamingEl = el('span', 'status-bar__streaming');
    for (let i = 0; i < 3; i++) {
      this._streamingEl.appendChild(el('span', 'status-bar__streaming-dot'));
    }
    this._streamingEl.style.display = 'none';

    // Keyboard shortcut hint (shown when Cmd is held)
    this._shortcutHint = el('span', 'status-bar__shortcut-hint',
      '\u2318K command palette  \u2318M minimap  \u2318/ focus');

    this._center.appendChild(this._taskText);
    this._center.appendChild(this._streamingEl);
    this._center.appendChild(this._shortcutHint);

    this._root.appendChild(this._center);
  }


  // ══════════════════════════════════════════════════════════════
  // Right section: providers, DB size, uptime, version, toggles
  // ══════════════════════════════════════════════════════════════

  _buildRight() {
    this._right = el('div', 'status-bar__right');

    // Providers (clickable → settings)
    this._providersBtn = el('button', 'status-bar__item');
    this._providersBtn.setAttribute('aria-label', 'Open provider settings');
    this._providersDotsEl = el('span', 'status-bar__providers');
    this._providersLabel = el('span', null, '0 providers');
    this._providersBtn.appendChild(this._providersDotsEl);
    this._providersBtn.appendChild(this._providersLabel);
    this._providersBtn.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('statusbar:navigate', {
        detail: { target: 'settings', section: 'providers' }, bubbles: true,
      }));
    });

    const sep2 = el('span', 'status-bar__sep');

    // DB size
    this._dbSizeEl = el('span', 'status-bar__item');
    this._dbSizeEl.style.cursor = 'default';
    this._dbSizeLabel = el('span', null, 'DB 0 B');
    this._dbSizeEl.appendChild(this._dbSizeLabel);

    const sep3 = el('span', 'status-bar__sep');

    // Uptime
    this._uptimeEl = el('span', 'status-bar__item');
    this._uptimeEl.style.cursor = 'default';
    this._uptimeLabel = el('span', null, '0m');
    this._uptimeEl.setAttribute('aria-label', 'App uptime');
    this._uptimeEl.appendChild(this._uptimeLabel);

    const sep4 = el('span', 'status-bar__sep');

    // Version
    this._versionEl = el('span', 'status-bar__item');
    this._versionEl.style.cursor = 'default';
    this._versionEl.textContent = `v${APP_VERSION}`;

    const sep5 = el('span', 'status-bar__sep');

    // ── Quick toggles ─────────────────────────────────────────

    // Audio mute
    this._muteBtn = el('button', 'status-bar__toggle');
    this._muteBtn.setAttribute('aria-label', 'Toggle audio');
    this._muteBtn.textContent = '\u{1F50A}';  // speaker
    this._muteBtn.addEventListener('click', () => {
      this._audioMuted = !this._audioMuted;
      this._updateMuteBtn();
      document.dispatchEvent(new CustomEvent('statusbar:toggle-audio', {
        detail: { muted: this._audioMuted }, bubbles: true,
      }));
    });

    // Theme cycle
    this._themeBtn = el('button', 'status-bar__toggle');
    this._themeBtn.setAttribute('aria-label', 'Cycle theme');
    this._themeBtn.textContent = '\u{1F3A8}';  // palette
    this._themeBtn.addEventListener('click', () => {
      this._themeIndex = (this._themeIndex + 1) % this._themes.length;
      document.dispatchEvent(new CustomEvent('statusbar:cycle-theme', {
        detail: { theme: this._themes[this._themeIndex] }, bubbles: true,
      }));
    });

    // Focus mode
    this._focusBtn = el('button', 'status-bar__toggle');
    this._focusBtn.setAttribute('aria-label', 'Toggle focus mode');
    this._focusBtn.textContent = '\u{1F441}';  // eye
    this._focusBtn.addEventListener('click', () => {
      this._focusMode = !this._focusMode;
      this._focusBtn.classList.toggle('status-bar__toggle--active', this._focusMode);
      document.dispatchEvent(new CustomEvent('statusbar:toggle-focus', {
        detail: { focusMode: this._focusMode }, bubbles: true,
      }));
    });

    // Assemble right section
    this._right.appendChild(this._providersBtn);
    this._right.appendChild(sep2);
    this._right.appendChild(this._dbSizeEl);
    this._right.appendChild(sep3);
    this._right.appendChild(this._uptimeEl);
    this._right.appendChild(sep4);
    this._right.appendChild(this._versionEl);
    this._right.appendChild(sep5);
    this._right.appendChild(this._muteBtn);
    this._right.appendChild(this._themeBtn);
    this._right.appendChild(this._focusBtn);

    this._root.appendChild(this._right);
  }


  // ══════════════════════════════════════════════════════════════
  // Event binding (reactive updates via document events)
  // ══════════════════════════════════════════════════════════════

  _bindEvents() {
    // Zone changes
    this._onZonePanel = (e) => {
      const name = e.detail?.zoneName || e.detail?.zoneId || 'Unknown Zone';
      this.setZone(name);
    };
    document.addEventListener('zone-panel:open', this._onZonePanel);

    // Task / streaming updates
    this._onTaskUpdate = (e) => {
      const { count, streaming } = e.detail || {};
      if (count !== undefined) this.setTaskCount(count);
      if (streaming !== undefined) this.setStreaming(streaming);
    };
    document.addEventListener('world:task-update', this._onTaskUpdate);

    // Provider status
    this._onProviderStatus = (e) => {
      if (Array.isArray(e.detail?.providers)) {
        this.setProviders(e.detail.providers);
      }
    };
    document.addEventListener('world:provider-status', this._onProviderStatus);

    // DB size
    this._onDbSize = (e) => {
      if (e.detail?.bytes !== undefined) {
        this.setDbSize(e.detail.bytes);
      }
    };
    document.addEventListener('world:db-size', this._onDbSize);

    // World state (bulk update from boot)
    this._onWorldState = (e) => {
      const s = e.detail || {};
      if (s.worldName) {
        this._worldName = s.worldName;
        this._worldLabel.textContent = s.worldName;
      }
    };
    document.addEventListener('world:state', this._onWorldState);

    // Cmd key held → show shortcut hints
    this._onKeyDown = (e) => {
      if (e.key === 'Meta' || e.key === 'Control') {
        this._cmdHeld = true;
        this._root.classList.add('status-bar--cmd-held');
      }
    };
    this._onKeyUp = (e) => {
      if (e.key === 'Meta' || e.key === 'Control') {
        this._cmdHeld = false;
        this._root.classList.remove('status-bar--cmd-held');
      }
    };
    document.addEventListener('keydown', this._onKeyDown);
    document.addEventListener('keyup', this._onKeyUp);
  }


  // ══════════════════════════════════════════════════════════════
  // Internal update helpers
  // ══════════════════════════════════════════════════════════════

  _updateTaskText() {
    if (this._taskCount === 0) {
      this._taskText.textContent = 'idle';
      this._taskText.style.color = '';
    } else {
      const label = this._taskCount === 1 ? '1 task running' : `${this._taskCount} tasks running`;
      this._taskText.textContent = label;
      this._taskText.style.color = 'var(--accent-blue)';
    }
  }

  _updateStreamingIndicator() {
    this._streamingEl.style.display = this._streaming ? 'inline-flex' : 'none';
  }

  _updateProviders() {
    // Dots
    this._providersDotsEl.innerHTML = '';
    for (const p of this._providers) {
      const dot = el('span', 'status-bar__provider-dot');
      dot.style.background = p.connected ? 'var(--accent-green)' : 'var(--accent-red)';
      dot.style.boxShadow  = `0 0 4px ${p.connected ? 'var(--accent-green)' : 'var(--accent-red)'}`;
      dot.title = `${p.name}: ${p.connected ? 'connected' : 'disconnected'}`;
      this._providersDotsEl.appendChild(dot);
    }

    const connected = this._providers.filter(p => p.connected).length;
    const total     = this._providers.length;
    this._providersLabel.textContent = total === 0
      ? '0 providers'
      : `${connected}/${total} providers`;
  }

  _updateUptime() {
    const seconds = Math.floor((Date.now() - this._startTime) / 1000);
    this._uptimeLabel.textContent = fmtUptime(seconds);
  }

  _updateMuteBtn() {
    this._muteBtn.textContent = this._audioMuted ? '\u{1F507}' : '\u{1F50A}';
    this._muteBtn.classList.toggle('status-bar__toggle--muted', this._audioMuted);
  }

  _updateZoneDot() {
    const base = 'status-bar__dot';
    const mod  = `status-bar__dot--${this._zoneStatus}`;
    this._zoneDot.className = `${base} ${mod}`;
  }


  // ══════════════════════════════════════════════════════════════
  // Public API
  // ══════════════════════════════════════════════════════════════

  /**
   * Append the status bar to the DOM.
   * @param {HTMLElement} [parent=document.body]
   */
  mount(parent) {
    (parent || document.body).appendChild(this._root);
  }

  /**
   * Set the current zone name and optional status.
   * @param {string} name
   * @param {'green'|'amber'|'red'} [status='green']
   */
  setZone(name, status) {
    this._zoneName = name;
    this._zoneLabel.textContent = name;
    if (status) {
      this._zoneStatus = status;
      this._updateZoneDot();
    }
  }

  /**
   * Set the active task count. 0 shows "idle".
   * @param {number} n
   */
  setTaskCount(n) {
    this._taskCount = n;
    this._updateTaskText();
  }

  /**
   * Show or hide the streaming indicator.
   * @param {boolean} active
   */
  setStreaming(active) {
    this._streaming = active;
    this._updateStreamingIndicator();
  }

  /**
   * Update provider list with connection status.
   * @param {Array<{ name: string, connected: boolean }>} providers
   */
  setProviders(providers) {
    this._providers = providers;
    this._updateProviders();
  }

  /**
   * Set the DB file size in bytes.
   * @param {number} bytes
   */
  setDbSize(bytes) {
    this._dbSize = bytes;
    this._dbSizeLabel.textContent = `DB ${fmtBytes(bytes)}`;
  }

  /**
   * Set the world name displayed on the left.
   * @param {string} name
   */
  setWorldName(name) {
    this._worldName = name;
    this._worldLabel.textContent = name;
  }

  /**
   * Tear down DOM, timers, and event listeners.
   */
  destroy() {
    clearInterval(this._uptimeInterval);

    document.removeEventListener('zone-panel:open', this._onZonePanel);
    document.removeEventListener('world:task-update', this._onTaskUpdate);
    document.removeEventListener('world:provider-status', this._onProviderStatus);
    document.removeEventListener('world:db-size', this._onDbSize);
    document.removeEventListener('world:state', this._onWorldState);
    document.removeEventListener('keydown', this._onKeyDown);
    document.removeEventListener('keyup', this._onKeyUp);

    this._root.remove();
  }
}
