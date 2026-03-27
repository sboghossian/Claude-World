/**
 * hud.js — Extraordinary heads-up display for Claude World
 *
 * Five areas:
 *   1. Top-left:    Commander Identity Bar (avatar + world name + level)
 *   2. Top-center:  World name + real-time clock + active zone
 *   3. Top-right:   XP bar + Gold budget + ⌘K hint
 *   4. Bottom-left: Active Agent Widgets (3 pills, animated)
 *   5. Bottom-right: Notification Center Bell + dropdown
 *
 * All containers have pointer-events: none; only interactive children opt in.
 * Keyboard: Cmd+M toggles minimap, Cmd+K opens command palette.
 */

// ── Zone positions for minimap (simplified) ─────────────────────
const MINIMAP_ZONES = [
  { id: 'dispatch',   x: 22, y: 22, active: true,  district: 'core' },
  { id: 'brain',      x: 17, y: 21, active: true,  district: 'core' },
  { id: 'chat',       x: 15, y: 17, active: false, district: 'core' },
  { id: 'memory',     x: 25, y: 17, active: true,  district: 'core' },
  { id: 'skills',     x: 15, y: 25, active: true,  district: 'core' },
  { id: 'minions',    x: 25, y: 25, active: false, district: 'core' },
  { id: 'treasury',   x: 29, y: 21, active: false, district: 'business' },
  { id: 'sales',      x: 29, y: 27, active: false, district: 'business' },
  { id: 'marketing',  x: 23, y: 31, active: false, district: 'business' },
  { id: 'exchange',   x: 33, y: 19, active: false, district: 'business' },
  { id: 'market',     x: 33, y: 25, active: false, district: 'business' },
  { id: 'council',    x: 11, y: 15, active: false, district: 'advanced' },
  { id: 'rnd',        x: 11, y: 21, active: false, district: 'advanced' },
  { id: 'legal',      x: 17, y: 13, active: false, district: 'advanced' },
  { id: 'archive',    x: 11, y: 27, active: false, district: 'advanced' },
  { id: 'docks',      x: 10, y: 31, active: true,  district: 'edge' },
  { id: 'airport',    x: 36, y: 12, active: false, district: 'edge' },
  { id: 'globe',      x: 29, y: 11, active: false, district: 'edge' },
  { id: 'broadcast',  x: 21, y:  9, active: false, district: 'edge' },
];

const DISTRICT_COLORS = {
  core:     '#4a9eff',
  business: '#4aff8a',
  advanced: '#a855f7',
  edge:     '#ffb84a',
};

const MINIMAP_CONNECTIONS = [
  ['dispatch', 'brain'],   ['dispatch', 'chat'],   ['dispatch', 'memory'],
  ['dispatch', 'skills'],  ['dispatch', 'minions'], ['memory', 'treasury'],
  ['minions',  'sales'],   ['minions',  'marketing'], ['treasury', 'exchange'],
  ['treasury', 'market'],  ['chat',     'council'], ['chat',    'legal'],
  ['skills',   'rnd'],     ['skills',   'archive'], ['archive', 'docks'],
  ['dispatch', 'broadcast'], ['memory', 'globe'],  ['exchange', 'airport'],
];

// Default agent data (replaced by setWorldState)
const DEFAULT_AGENTS = [
  { id: 'alpha',   emoji: '🤖', name: 'Alpha',   mood: 'idle',    working: false },
  { id: 'bravo',   emoji: '🧠', name: 'Bravo',   mood: 'active',  working: true  },
  { id: 'charlie', emoji: '⚡', name: 'Charlie', mood: 'idle',    working: false },
];

// Mood → color mapping
const MOOD_COLORS = {
  idle:     '#4aff8a',
  active:   '#4a9eff',
  busy:     '#ffb84a',
  overload: '#ff4a6a',
  error:    '#ff4a6a',
};

// ── Utility helpers ──────────────────────────────────────────────

/** Format a number with commas: 2450 → "2,450" */
function fmtNum(n) {
  return n.toLocaleString('en-US');
}

/** Format seconds elapsed to "Xm ago" / "Xs ago" etc. */
function timeAgo(timestamp) {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

/** Create a DOM element with optional class and innerHTML. */
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}


// ── Main HUD class ───────────────────────────────────────────────

export class HUD {
  constructor() {
    // ── State ──────────────────────────────────────────────────
    this._identity = {
      emoji:      '👤',
      color:      '#4a9eff',
      worldName:  'Claude World',
      level:      1,
    };

    this._xp = { xp: 0, xpMax: 100, level: 1 };
    this._budget = { spent: 0.0234, budget: 5.00 };
    this._currentZone = 'dispatch';
    this._activeZoneName = 'Dispatch Tower';

    this._agents = DEFAULT_AGENTS.map(a => ({ ...a }));

    this._notifications = [];
    this._notifUnread   = 0;
    this._notifOpen     = false;

    this._minimapVisible = true;
    this._clockInterval  = null;
    this._minimapPulsePhase = 0;
    this._minimapAnimFrame  = null;

    this._levelUpAnimating = false;

    // ── Build DOM ─────────────────────────────────────────────
    this._createTopLeft();
    this._createTopCenter();
    this._createTopRight();
    this._createBottomLeft();
    this._createBottomRight();
    this._createMinimap();

    // ── Wire events ───────────────────────────────────────────
    this._bindEvents();

    // ── Initial render ────────────────────────────────────────
    this._updateIdentity();
    this._updateXP();
    this._updateBudget();
    this._updateAgents();
    this._startClock();
    this._renderMinimap();
    this._tickMinimapPulse();
  }


  // ══════════════════════════════════════════════════════════════
  // 1. TOP-LEFT: Commander Identity Bar
  // ══════════════════════════════════════════════════════════════

  _createTopLeft() {
    this._topLeft = el('div', 'hud-tl');
    this._topLeft.setAttribute('aria-label', 'Commander identity');

    // Avatar button
    this._avatarBtn = el('button', 'hud-avatar');
    this._avatarBtn.setAttribute('aria-label', 'Open identity panel');
    this._avatarBtn.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('hud:avatar-click', { bubbles: true }));
    });

    this._avatarEmoji = el('span', 'hud-avatar__emoji');
    this._avatarBtn.appendChild(this._avatarEmoji);

    // Identity text
    const idText = el('div', 'hud-identity');

    this._worldNameEl = el('span', 'hud-identity__name');
    this._levelBadge  = el('span', 'hud-identity__level');

    idText.appendChild(this._worldNameEl);
    idText.appendChild(this._levelBadge);

    this._topLeft.appendChild(this._avatarBtn);
    this._topLeft.appendChild(idText);

    document.body.appendChild(this._topLeft);
  }

  _updateIdentity() {
    this._avatarEmoji.textContent = this._identity.emoji;
    this._avatarBtn.style.setProperty('--avatar-bg', this._identity.color);
    this._worldNameEl.textContent = this._identity.worldName;
    this._levelBadge.textContent  = `Level ${this._xp.level}`;
  }


  // ══════════════════════════════════════════════════════════════
  // 2. TOP-CENTER: World Name + Clock + Active Zone
  // ══════════════════════════════════════════════════════════════

  _createTopCenter() {
    this._topCenter = el('div', 'hud-tc');
    this._topCenter.setAttribute('aria-label', 'World status');

    this._tcWorldName = el('span', 'hud-tc__world');
    this._tcWorldName.textContent = this._identity.worldName;

    this._tcClock = el('span', 'hud-tc__clock');
    this._tcClock.setAttribute('aria-live', 'off');

    this._tcZone = el('span', 'hud-tc__zone');
    this._tcZone.textContent = this._activeZoneName;

    this._topCenter.appendChild(this._tcWorldName);
    this._topCenter.appendChild(this._tcClock);
    this._topCenter.appendChild(this._tcZone);

    document.body.appendChild(this._topCenter);
  }

  _startClock() {
    const tick = () => {
      const now = new Date();
      const hh  = String(now.getHours()).padStart(2, '0');
      const mm  = String(now.getMinutes()).padStart(2, '0');
      const ss  = String(now.getSeconds()).padStart(2, '0');
      this._tcClock.textContent = `${hh}:${mm}:${ss}`;
    };
    tick();
    this._clockInterval = setInterval(tick, 1000);
  }

  _updateActiveZone(zoneName) {
    this._activeZoneName = zoneName;
    this._tcZone.textContent = zoneName;
    // Brief flash animation
    this._tcZone.classList.remove('hud-tc__zone--flash');
    void this._tcZone.offsetWidth; // reflow
    this._tcZone.classList.add('hud-tc__zone--flash');
  }


  // ══════════════════════════════════════════════════════════════
  // 3. TOP-RIGHT: XP Bar + Budget + ⌘K
  // ══════════════════════════════════════════════════════════════

  _createTopRight() {
    this._topRight = el('div', 'hud-tr');
    this._topRight.setAttribute('aria-label', 'Resources');

    // ── XP row ──────────────────────────────────────────────
    const xpRow = el('div', 'hud-xp-row');

    const xpLabelEl = el('span', 'hud-xp-row__label', 'XP');
    xpRow.appendChild(xpLabelEl);

    const barWrap = el('div', 'hud-xp-row__bar-wrap');
    barWrap.setAttribute('role', 'progressbar');
    barWrap.setAttribute('aria-label', 'Experience');

    this._xpFill = el('div', 'hud-xp-row__bar-fill');
    barWrap.appendChild(this._xpFill);
    xpRow.appendChild(barWrap);

    this._xpText = el('span', 'hud-xp-row__text');
    xpRow.appendChild(this._xpText);

    this._topRight.appendChild(xpRow);

    // ── Budget + ⌘K row ─────────────────────────────────────
    const miscRow = el('div', 'hud-misc-row');

    this._budgetEl = el('span', 'hud-budget');
    miscRow.appendChild(this._budgetEl);

    const cmdK = el('button', 'hud-cmdk', '⌘K');
    cmdK.setAttribute('aria-label', 'Open command palette');
    cmdK.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('command-palette:open', { bubbles: true }));
    });
    miscRow.appendChild(cmdK);

    this._topRight.appendChild(miscRow);

    document.body.appendChild(this._topRight);
  }

  _updateXP() {
    const pct = Math.min(100, (this._xp.xp / this._xp.xpMax) * 100);
    this._xpFill.style.width = `${pct}%`;
    this._xpText.textContent = `${fmtNum(this._xp.xp)} / ${fmtNum(this._xp.xpMax)}`;
    // Sync level badge
    if (this._levelBadge) {
      this._levelBadge.textContent = `Level ${this._xp.level}`;
    }
  }

  _updateBudget() {
    const ratio = this._budget.spent / this._budget.budget;
    let colorVar = 'var(--accent-green)';
    if (ratio >= 0.8)      colorVar = 'var(--accent-red)';
    else if (ratio >= 0.5) colorVar = 'var(--accent-amber)';

    this._budgetEl.textContent = `💰 $${this._budget.spent.toFixed(4)}`;
    this._budgetEl.style.color = colorVar;
    this._budgetEl.setAttribute('title', `$${this._budget.spent.toFixed(4)} of $${this._budget.budget.toFixed(2)} daily budget`);
  }


  // ══════════════════════════════════════════════════════════════
  // 4. BOTTOM-LEFT: Active Agent Widgets
  // ══════════════════════════════════════════════════════════════

  _createBottomLeft() {
    this._bottomLeft = el('div', 'hud-bl');
    this._bottomLeft.setAttribute('aria-label', 'Active agents');
    document.body.appendChild(this._bottomLeft);
  }

  _updateAgents() {
    this._bottomLeft.innerHTML = '';

    this._agents.forEach((agent, idx) => {
      const pill = el('button', 'hud-agent-pill');
      pill.setAttribute('aria-label', `Agent ${agent.name}: ${agent.mood}`);
      pill.style.animationDelay = `${idx * 60}ms`;

      if (agent.working) {
        pill.classList.add('hud-agent-pill--working');
      }

      // Mood dot
      const dot = el('span', 'hud-agent-pill__dot');
      dot.style.background  = MOOD_COLORS[agent.mood] || MOOD_COLORS.idle;
      dot.style.boxShadow   = `0 0 6px ${MOOD_COLORS[agent.mood] || MOOD_COLORS.idle}`;

      const emojiEl  = el('span', 'hud-agent-pill__emoji', agent.emoji);
      const nameEl   = el('span', 'hud-agent-pill__name',  agent.name);

      pill.appendChild(dot);
      pill.appendChild(emojiEl);
      pill.appendChild(nameEl);

      if (agent.working) {
        const working = el('span', 'hud-agent-pill__working', 'working...');
        pill.appendChild(working);
      }

      pill.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('hud:agent-click', {
          detail: { agentId: agent.id },
          bubbles: true,
        }));
      });

      this._bottomLeft.appendChild(pill);
    });
  }


  // ══════════════════════════════════════════════════════════════
  // 5. BOTTOM-RIGHT: Notification Center Bell
  // ══════════════════════════════════════════════════════════════

  _createBottomRight() {
    this._bottomRight = el('div', 'hud-br');
    this._bottomRight.setAttribute('aria-label', 'Notifications');

    // Bell button
    this._bellBtn = el('button', 'hud-bell');
    this._bellBtn.setAttribute('aria-label', 'Toggle notifications');
    this._bellBtn.innerHTML = `<span class="hud-bell__icon">🔔</span>`;

    this._bellBadge = el('span', 'hud-bell__badge', '0');
    this._bellBtn.appendChild(this._bellBadge);

    this._bellBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleNotifications();
    });

    // Notification dropdown
    this._notifDropdown = el('div', 'hud-notif-dropdown');
    this._notifDropdown.setAttribute('role', 'dialog');
    this._notifDropdown.setAttribute('aria-label', 'Notifications panel');

    const notifHeader = el('div', 'hud-notif-dropdown__header');
    const notifTitle  = el('span', 'hud-notif-dropdown__title', 'Notifications');

    this._clearAllBtn = el('button', 'hud-notif-dropdown__clear', 'Clear all');
    this._clearAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._clearNotifications();
    });

    notifHeader.appendChild(notifTitle);
    notifHeader.appendChild(this._clearAllBtn);

    this._notifList = el('ul', 'hud-notif-list');
    this._notifList.setAttribute('role', 'list');

    this._notifDropdown.appendChild(notifHeader);
    this._notifDropdown.appendChild(this._notifList);

    this._bottomRight.appendChild(this._bellBtn);
    this._bottomRight.appendChild(this._notifDropdown);

    document.body.appendChild(this._bottomRight);
    this._updateBell();
  }

  _toggleNotifications() {
    this._notifOpen = !this._notifOpen;

    if (this._notifOpen) {
      // Mark all read
      this._notifUnread = 0;
      this._updateBell();
      this._renderNotifications();
      this._notifDropdown.classList.add('hud-notif-dropdown--open');
    } else {
      this._notifDropdown.classList.remove('hud-notif-dropdown--open');
    }
  }

  _closeNotifications() {
    if (this._notifOpen) {
      this._notifOpen = false;
      this._notifDropdown.classList.remove('hud-notif-dropdown--open');
    }
  }

  _updateBell() {
    const count = this._notifUnread;
    this._bellBadge.textContent = count > 9 ? '9+' : String(count);
    this._bellBadge.classList.toggle('hud-bell__badge--hidden', count === 0);
  }

  _renderNotifications() {
    this._notifList.innerHTML = '';
    const items = this._notifications.slice(0, 10);

    if (items.length === 0) {
      const empty = el('li', 'hud-notif-empty', 'No notifications yet');
      this._notifList.appendChild(empty);
      return;
    }

    for (const notif of items) {
      const li = el('li', 'hud-notif-item');
      li.setAttribute('role', 'listitem');

      const iconEl = el('span', 'hud-notif-item__icon', notif.icon || '📌');
      const bodyEl  = el('div', 'hud-notif-item__body');
      const titleEl = el('span', 'hud-notif-item__title', notif.title);
      const timeEl  = el('span', 'hud-notif-item__time', timeAgo(notif.timestamp));

      bodyEl.appendChild(titleEl);
      bodyEl.appendChild(timeEl);

      li.appendChild(iconEl);
      li.appendChild(bodyEl);
      this._notifList.appendChild(li);
    }
  }

  _clearNotifications() {
    this._notifications = [];
    this._notifUnread   = 0;
    this._notifOpen     = false;
    this._updateBell();
    this._notifDropdown.classList.remove('hud-notif-dropdown--open');
  }

  /**
   * Push a notification into the center.
   * @param {{ icon?: string, title: string }} notif
   */
  pushNotification(notif) {
    this._notifications.unshift({
      icon:      notif.icon || '📌',
      title:     notif.title,
      timestamp: Date.now(),
    });

    // Keep max 50 total
    if (this._notifications.length > 50) {
      this._notifications.length = 50;
    }

    this._notifUnread = Math.min(this._notifUnread + 1, 99);
    this._updateBell();

    // Ring the bell
    this._bellBtn.classList.remove('hud-bell--ring');
    void this._bellBtn.offsetWidth;
    this._bellBtn.classList.add('hud-bell--ring');

    // If dropdown open, refresh list
    if (this._notifOpen) {
      this._renderNotifications();
    }
  }


  // ══════════════════════════════════════════════════════════════
  // Minimap
  // ══════════════════════════════════════════════════════════════

  _createMinimap() {
    this._minimapContainer = el('div', 'hud-minimap');
    this._minimapContainer.setAttribute('role', 'navigation');
    this._minimapContainer.setAttribute('aria-label', 'World minimap');

    this._minimapCanvas = document.createElement('canvas');
    this._minimapCanvas.className = 'hud-minimap__canvas';
    this._minimapCanvas.width  = 180;
    this._minimapCanvas.height = 180;

    this._minimapCanvas.addEventListener('click', (e) => {
      const rect = this._minimapCanvas.getBoundingClientRect();
      this._handleMinimapClick(e.clientX - rect.left, e.clientY - rect.top);
    });

    this._minimapContainer.appendChild(this._minimapCanvas);
    document.body.appendChild(this._minimapContainer);
  }

  _renderMinimap() {
    const ctx = this._minimapCanvas.getContext('2d');
    const W = 180, H = 180;

    ctx.clearRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < W; i += 12) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke();
    }

    const MIN_TILE = 6, MAX_TILE = 40;
    const range = MAX_TILE - MIN_TILE;
    const sc = (v) => ((v - MIN_TILE) / range) * (W - 20) + 10;

    // Build zone lookup
    const zoneMap = {};
    for (const z of MINIMAP_ZONES) zoneMap[z.id] = z;

    // Connection lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (const [a, b] of MINIMAP_CONNECTIONS) {
      const za = zoneMap[a], zb = zoneMap[b];
      if (!za || !zb) continue;
      ctx.beginPath();
      ctx.moveTo(sc(za.x), sc(za.y));
      ctx.lineTo(sc(zb.x), sc(zb.y));
      ctx.stroke();
    }

    // Zone dots
    for (const z of MINIMAP_ZONES) {
      const cx = sc(z.x), cy = sc(z.y);
      const isCurrent = z.id === this._currentZone;
      const radius = isCurrent ? 5 : 3;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);

      if (isCurrent) {
        // Pulsing dot: oscillate radius and alpha
        const pulse = 0.5 + 0.5 * Math.sin(this._minimapPulsePhase);
        const glowR = radius + 4 * pulse;

        // Outer glow ring
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, 215, 0, ${0.2 + 0.3 * pulse})`;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffd700';
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 10;
      } else if (z.active) {
        const color = DISTRICT_COLORS[z.district] || '#4a9eff';
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 4;
      } else {
        ctx.fillStyle = 'rgba(100,100,120,0.5)';
        ctx.shadowBlur = 0;
      }

      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  _tickMinimapPulse() {
    this._minimapPulsePhase += 0.06;
    this._renderMinimap();
    this._minimapAnimFrame = requestAnimationFrame(() => this._tickMinimapPulse());
  }

  _handleMinimapClick(canvasX, canvasY) {
    const W = 180, MIN_TILE = 6, MAX_TILE = 40;
    const range  = MAX_TILE - MIN_TILE;
    const toTile = (px) => ((px - 10) / (W - 20)) * range + MIN_TILE;

    const tx = toTile(canvasX);
    const ty = toTile(canvasY);

    let nearest = null, nearestDist = Infinity;
    for (const z of MINIMAP_ZONES) {
      const dx = z.x - tx, dy = z.y - ty;
      const d  = dx * dx + dy * dy;
      if (d < nearestDist) { nearestDist = d; nearest = z; }
    }

    if (nearest && nearestDist < 16) {
      document.dispatchEvent(new CustomEvent('hud:navigate', {
        detail: { zoneId: nearest.id },
        bubbles: true,
      }));
    }
  }

  _toggleMinimap() {
    this._minimapVisible = !this._minimapVisible;
    this._minimapContainer.classList.toggle('hud-minimap--hidden', !this._minimapVisible);
  }


  // ══════════════════════════════════════════════════════════════
  // Event Binding
  // ══════════════════════════════════════════════════════════════

  _bindEvents() {
    // world:xp-gained → smooth XP fill
    document.addEventListener('world:xp-gained', (e) => {
      const { xp, xpMax, level } = e.detail || {};
      if (level !== undefined && level > this._xp.level) {
        this._animateLevelUp(xp ?? 0, xpMax ?? 100, level);
      } else {
        if (xp    !== undefined) this._xp.xp    = xp;
        if (xpMax !== undefined) this._xp.xpMax = xpMax;
        if (level !== undefined) this._xp.level  = level;
        this._updateXP();
        this._updateIdentity();
      }
    });

    // zone panel open → update active zone name
    document.addEventListener('zone-panel:open', (e) => {
      const name = e.detail?.zoneName || e.detail?.zoneId || 'Unknown Zone';
      this._updateActiveZone(name);
    });

    // Cmd+M → toggle minimap
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
        e.preventDefault();
        this._toggleMinimap();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        // ⌘K handled by command palette; HUD just closes notifs
        this._closeNotifications();
      }
    });

    // Close notif dropdown on outside click
    document.addEventListener('click', (e) => {
      if (this._notifOpen && !this._bottomRight.contains(e.target)) {
        this._closeNotifications();
      }
    });
  }

  // Level-up animation: bar flashes gold, empties, then refills
  _animateLevelUp(newXP, newXPMax, newLevel) {
    if (this._levelUpAnimating) return;
    this._levelUpAnimating = true;

    this._xpFill.classList.add('hud-xp-row__bar-fill--levelup');

    setTimeout(() => {
      // Empty the bar
      this._xpFill.style.transition = 'none';
      this._xpFill.style.width = '0%';

      setTimeout(() => {
        this._xpFill.classList.remove('hud-xp-row__bar-fill--levelup');
        this._xp = { xp: newXP, xpMax: newXPMax, level: newLevel };
        this._xpFill.style.transition = '';
        this._updateXP();
        this._updateIdentity();
        this._levelUpAnimating = false;
      }, 300);
    }, 700);
  }


  // ══════════════════════════════════════════════════════════════
  // Public API
  // ══════════════════════════════════════════════════════════════

  /**
   * Called by the boot sequence with a world snapshot.
   * Updates level, xp, xpToNext, worldName, agents, budget, identity.
   *
   * @param {{
   *   worldName?:  string,
   *   level?:      number,
   *   xp?:         number,
   *   xpToNext?:   number,
   *   agents?:     Array<{ id: string, emoji: string, name: string, mood: string, working: boolean }>,
   *   budget?:     number,
   *   spent?:      number,
   *   identity?:   { emoji: string, color: string },
   * }} state
   */
  setWorldState(state) {
    if (state.worldName) {
      this._identity.worldName = state.worldName;
      this._tcWorldName.textContent = state.worldName;
    }
    if (state.level   !== undefined) this._xp.level  = state.level;
    if (state.xp      !== undefined) this._xp.xp     = state.xp;
    if (state.xpToNext !== undefined) this._xp.xpMax = state.xpToNext;
    if (state.budget  !== undefined) this._budget.budget = state.budget;
    if (state.spent   !== undefined) this._budget.spent  = state.spent;
    if (state.identity) {
      if (state.identity.emoji) this._identity.emoji = state.identity.emoji;
      if (state.identity.color) this._identity.color = state.identity.color;
    }
    if (Array.isArray(state.agents)) {
      this._agents = state.agents.map(a => ({ ...a }));
    }

    this._updateIdentity();
    this._updateXP();
    this._updateBudget();
    this._updateAgents();
  }

  /**
   * Update XP bar and level.
   * @param {number} xp
   * @param {number} xpMax
   * @param {number} level
   */
  setXP(xp, xpMax, level) {
    this._xp = { xp, xpMax, level };
    this._updateXP();
    this._updateIdentity();
  }

  /**
   * Update budget display.
   * @param {number} spent
   * @param {number} budget
   */
  setBudget(spent, budget) {
    this._budget = { spent, budget };
    this._updateBudget();
  }

  /**
   * Update agent list.
   * @param {Array<{ id: string, emoji: string, name: string, mood: string, working: boolean }>} agents
   */
  setAgents(agents) {
    this._agents = agents.map(a => ({ ...a }));
    this._updateAgents();
  }

  /**
   * Mark a specific agent as working (or idle).
   * @param {string} agentId
   * @param {boolean} working
   */
  setAgentWorking(agentId, working) {
    const agent = this._agents.find(a => a.id === agentId);
    if (agent) {
      agent.working = working;
      if (working) agent.mood = 'active';
      this._updateAgents();
    }
  }

  /**
   * Set the current zone for minimap highlight.
   * @param {string} zoneId
   * @param {string} [zoneName]
   */
  setCurrentZone(zoneId, zoneName) {
    this._currentZone = zoneId;
    if (zoneName) this._updateActiveZone(zoneName);
  }

  /**
   * Set commander identity (avatar).
   * @param {{ emoji: string, color: string, worldName?: string }} identity
   */
  setIdentity(identity) {
    if (identity.emoji)     this._identity.emoji     = identity.emoji;
    if (identity.color)     this._identity.color     = identity.color;
    if (identity.worldName) this._identity.worldName = identity.worldName;
    this._updateIdentity();
  }

  /** Tear down all HUD DOM elements and timers. */
  destroy() {
    clearInterval(this._clockInterval);
    if (this._minimapAnimFrame !== null) {
      cancelAnimationFrame(this._minimapAnimFrame);
    }
    this._topLeft.remove();
    this._topCenter.remove();
    this._topRight.remove();
    this._bottomLeft.remove();
    this._bottomRight.remove();
    this._minimapContainer.remove();
  }
}
