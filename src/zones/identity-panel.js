/**
 * identity-panel.js — Identity & Reputation zone for Claude World
 *
 * Displays user avatar, title, reputation score, badges, and activity feed.
 * Opens from the HUD avatar button (top-left corner).
 */

import { ReputationSystem } from '../systems/reputation.js';

// Avatar emoji options for the picker
const AVATAR_EMOJIS = [
  '🧠', '🤖', '👾', '🦾', '🧬', '⚡', '🔮', '🌌',
  '🚀', '🛸', '🧿', '💡', '🔭', '⚙️', '🌐', '🎯',
  '🦉', '🐉', '🌟', '💎',
];

// Preset avatar colors
const AVATAR_COLORS = [
  '#7c3aed', // violet (default)
  '#2563eb', // blue
  '#059669', // emerald
  '#dc2626', // red
  '#d97706', // amber
  '#db2777', // pink
  '#0891b2', // cyan
  '#64748b', // slate
];

/**
 * Format a timestamp for display.
 * @param {string} isoString
 * @returns {string}
 */
function formatAgo(isoString) {
  const d = new Date(isoString);
  const now = Date.now();
  const diff = now - d.getTime();

  if (diff < 60_000) return 'Just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/**
 * Escape HTML entities.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ── IdentityPanel class ─────────────────────────────────────────

export class IdentityPanel {
  /**
   * @param {HTMLElement} container — the panel body to render into
   * @param {object} [options]
   * @param {object} [options.db] — database instance (passed to ReputationSystem)
   */
  constructor(container, options = {}) {
    /** @type {HTMLElement} */
    this._container = container;
    this._container.classList.add('ip-root');

    /** @type {ReputationSystem|null} */
    this._rep = options.db ? new ReputationSystem(options.db) : null;

    /** @type {string|null} */
    this._worldId = null;

    /** @type {object|null} */
    this._identity = null;

    /** @type {Array<object>} */
    this._history = [];

    // UI state
    /** @type {boolean} */
    this._editingName = false;

    /** @type {boolean} */
    this._editingBio = false;

    /** @type {boolean} */
    this._showEmojiPicker = false;

    /** @type {boolean} */
    this._showColorPicker = false;

    this._render();
    this._bindGlobalEvents();
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * Load identity and reputation history for a world.
   * @param {string} worldId
   */
  async init(worldId) {
    this._worldId = worldId;

    if (this._rep) {
      this._identity = await this._rep.getIdentity(worldId);
      this._history  = await this._rep.getHistory(worldId, 20);
    } else {
      // Demo data when no DB is wired
      this._identity = {
        world_id:     worldId,
        display_name: 'Commander',
        avatar_emoji: '🧠',
        avatar_color: '#7c3aed',
        title:        'World Architect',
        bio:          'Building the future, one zone at a time.',
        reputation:   847,
        badges:       [
          { id: 'first_task',  icon: '🚀', label: 'First Task'  },
          { id: 'connected',   icon: '🔌', label: 'Connected'   },
          { id: 'skill_master',icon: '🎓', label: 'Skill Master' },
          { id: 'commander',   icon: '🤖', label: 'Commander'   },
        ],
      };
      this._history = [
        { id: '1', event_type: 'task_complete',  points: 5,  description: 'Task completed',       created_at: new Date(Date.now() - 2 * 60_000).toISOString() },
        { id: '2', event_type: 'skill_create',   points: 20, description: 'Skill "Summarize" created', created_at: new Date(Date.now() - 60 * 60_000).toISOString() },
        { id: '3', event_type: 'zone_unlock',    points: 30, description: 'Zone "Brain Library" unlocked', created_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString() },
      ];
    }

    this._render();
  }

  /** Tear down. */
  destroy() {
    this._container.innerHTML = '';
    if (this._repListener) {
      document.removeEventListener('reputation:awarded', this._repListener);
    }
    if (this._identityListener) {
      document.removeEventListener('identity:updated', this._identityListener);
    }
  }

  // ── Rendering ────────────────────────────────────────────────

  _render() {
    this._container.innerHTML = '';

    if (!this._identity) {
      this._container.appendChild(this._buildLoading());
      return;
    }

    this._container.appendChild(this._buildHeader());
    this._container.appendChild(this._buildAvatar());
    this._container.appendChild(this._buildRepBar());
    this._container.appendChild(this._buildDivider());
    this._container.appendChild(this._buildEditControls());
    this._container.appendChild(this._buildDivider());
    this._container.appendChild(this._buildBadges());
    this._container.appendChild(this._buildDivider());
    this._container.appendChild(this._buildActivity());
  }

  _buildLoading() {
    const wrap = document.createElement('div');
    wrap.className = 'ip-loading';
    wrap.textContent = 'Loading identity…';
    return wrap;
  }

  _buildHeader() {
    const header = document.createElement('div');
    header.className = 'ip-header';

    const title = document.createElement('h2');
    title.className = 'ip-header-title';
    const safeWorld = escapeHtml(
      this._identity.display_name ? `${this._identity.display_name}'s World` : 'My World'
    );
    title.innerHTML = `${this._identity.avatar_emoji}  ${safeWorld}`;
    header.appendChild(title);

    return header;
  }

  _buildAvatar() {
    const section = document.createElement('div');
    section.className = 'ip-avatar-section';

    // Big avatar circle
    const avatar = document.createElement('div');
    avatar.className = 'ip-avatar';
    avatar.style.background = `radial-gradient(circle at 35% 35%, ${this._lighten(this._identity.avatar_color)}, ${this._identity.avatar_color})`;
    avatar.textContent = this._identity.avatar_emoji;
    section.appendChild(avatar);

    // Name (editable inline)
    if (this._editingName) {
      const nameWrap = document.createElement('div');
      nameWrap.className = 'ip-name-edit-wrap';

      const input = document.createElement('input');
      input.className = 'ip-name-input';
      input.type = 'text';
      input.value = this._identity.display_name;
      input.maxLength = 40;
      input.setAttribute('aria-label', 'Display name');

      const saveBtn = document.createElement('button');
      saveBtn.className = 'ip-btn ip-btn--primary ip-btn--sm';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', () => this._saveName(input.value));

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'ip-btn ip-btn--ghost ip-btn--sm';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => { this._editingName = false; this._render(); });

      nameWrap.appendChild(input);
      nameWrap.appendChild(saveBtn);
      nameWrap.appendChild(cancelBtn);
      section.appendChild(nameWrap);
    } else {
      const name = document.createElement('div');
      name.className = 'ip-display-name';
      name.textContent = this._identity.display_name;
      section.appendChild(name);
    }

    // Title + reputation
    const titleRow = document.createElement('div');
    titleRow.className = 'ip-title-row';

    const titleBadge = document.createElement('span');
    titleBadge.className = 'ip-title-badge';
    titleBadge.textContent = this._identity.title;
    titleRow.appendChild(titleBadge);

    const repScore = document.createElement('span');
    repScore.className = 'ip-rep-score';
    repScore.innerHTML = `⭐ ${this._identity.reputation.toLocaleString()} rep`;
    titleRow.appendChild(repScore);

    section.appendChild(titleRow);

    // Bio (editable inline)
    if (this._editingBio) {
      const bioWrap = document.createElement('div');
      bioWrap.className = 'ip-bio-edit-wrap';

      const textarea = document.createElement('textarea');
      textarea.className = 'ip-bio-input';
      textarea.value = this._identity.bio || '';
      textarea.placeholder = 'Add a bio…';
      textarea.maxLength = 200;
      textarea.rows = 2;

      const saveBtn = document.createElement('button');
      saveBtn.className = 'ip-btn ip-btn--primary ip-btn--sm';
      saveBtn.textContent = 'Save';
      saveBtn.addEventListener('click', () => this._saveBio(textarea.value));

      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'ip-btn ip-btn--ghost ip-btn--sm';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => { this._editingBio = false; this._render(); });

      bioWrap.appendChild(textarea);
      const bioActions = document.createElement('div');
      bioActions.className = 'ip-bio-actions';
      bioActions.appendChild(saveBtn);
      bioActions.appendChild(cancelBtn);
      bioWrap.appendChild(bioActions);
      section.appendChild(bioWrap);
    } else if (this._identity.bio) {
      const bio = document.createElement('p');
      bio.className = 'ip-bio';
      bio.textContent = this._identity.bio;
      bio.addEventListener('click', () => { this._editingBio = true; this._render(); });
      section.appendChild(bio);
    }

    // Emoji picker
    if (this._showEmojiPicker) {
      section.appendChild(this._buildEmojiPicker());
    }

    // Color picker
    if (this._showColorPicker) {
      section.appendChild(this._buildColorPicker());
    }

    return section;
  }

  _buildEmojiPicker() {
    const picker = document.createElement('div');
    picker.className = 'ip-emoji-picker';

    const label = document.createElement('div');
    label.className = 'ip-picker-label';
    label.textContent = 'Choose avatar';
    picker.appendChild(label);

    const grid = document.createElement('div');
    grid.className = 'ip-emoji-grid';

    for (const emoji of AVATAR_EMOJIS) {
      const btn = document.createElement('button');
      btn.className = 'ip-emoji-btn' + (emoji === this._identity.avatar_emoji ? ' ip-emoji-btn--active' : '');
      btn.textContent = emoji;
      btn.setAttribute('aria-label', `Set avatar to ${emoji}`);
      btn.addEventListener('click', () => this._saveEmoji(emoji));
      grid.appendChild(btn);
    }

    picker.appendChild(grid);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ip-btn ip-btn--ghost ip-btn--sm';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => { this._showEmojiPicker = false; this._render(); });
    picker.appendChild(closeBtn);

    return picker;
  }

  _buildColorPicker() {
    const picker = document.createElement('div');
    picker.className = 'ip-color-picker';

    const label = document.createElement('div');
    label.className = 'ip-picker-label';
    label.textContent = 'Avatar color';
    picker.appendChild(label);

    const swatches = document.createElement('div');
    swatches.className = 'ip-color-swatches';

    for (const color of AVATAR_COLORS) {
      const btn = document.createElement('button');
      btn.className = 'ip-color-swatch' + (color === this._identity.avatar_color ? ' ip-color-swatch--active' : '');
      btn.style.background = color;
      btn.setAttribute('aria-label', `Set avatar color to ${color}`);
      btn.addEventListener('click', () => this._saveColor(color));
      swatches.appendChild(btn);
    }

    picker.appendChild(swatches);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'ip-btn ip-btn--ghost ip-btn--sm';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', () => { this._showColorPicker = false; this._render(); });
    picker.appendChild(closeBtn);

    return picker;
  }

  _buildRepBar() {
    const section = document.createElement('div');
    section.className = 'ip-rep-bar-section';

    const rep = this._identity.reputation;
    const titles = this._rep ? this._rep.getTitles() : [
      [0, 'World Builder'], [100, 'Task Runner'], [300, 'Skill Crafter'],
      [600, 'Agent Commander'], [1000, 'World Architect'], [2000, 'AI Orchestrator'], [5000, 'Claude Master'],
    ];

    // Find current and next thresholds
    let currentThreshold = 0;
    let nextThreshold = null;
    let nextTitle = null;

    for (let i = 0; i < titles.length; i++) {
      if (rep >= titles[i][0]) {
        currentThreshold = titles[i][0];
        if (i + 1 < titles.length) {
          nextThreshold = titles[i + 1][0];
          nextTitle = titles[i + 1][1];
        }
      }
    }

    if (nextThreshold !== null) {
      const progress = Math.min(((rep - currentThreshold) / (nextThreshold - currentThreshold)) * 100, 100);

      const label = document.createElement('div');
      label.className = 'ip-rep-bar-label';
      label.innerHTML = `<span>Progress to <strong>${escapeHtml(nextTitle)}</strong></span><span>${rep} / ${nextThreshold}</span>`;
      section.appendChild(label);

      const barOuter = document.createElement('div');
      barOuter.className = 'ip-rep-bar-outer';
      barOuter.setAttribute('role', 'progressbar');
      barOuter.setAttribute('aria-valuenow', rep);
      barOuter.setAttribute('aria-valuemin', currentThreshold);
      barOuter.setAttribute('aria-valuemax', nextThreshold);

      const barInner = document.createElement('div');
      barInner.className = 'ip-rep-bar-inner';
      barInner.style.width = `${progress}%`;
      barOuter.appendChild(barInner);
      section.appendChild(barOuter);
    } else {
      const maxed = document.createElement('div');
      maxed.className = 'ip-rep-bar-maxed';
      maxed.textContent = '🏆 Maximum title achieved!';
      section.appendChild(maxed);
    }

    return section;
  }

  _buildEditControls() {
    const row = document.createElement('div');
    row.className = 'ip-edit-controls';

    const editNameBtn = document.createElement('button');
    editNameBtn.className = 'ip-btn ip-btn--secondary';
    editNameBtn.textContent = '✏️ Edit Name';
    editNameBtn.addEventListener('click', () => {
      this._editingName = true;
      this._editingBio = false;
      this._showEmojiPicker = false;
      this._showColorPicker = false;
      this._render();
    });
    row.appendChild(editNameBtn);

    const changeAvatarBtn = document.createElement('button');
    changeAvatarBtn.className = 'ip-btn ip-btn--secondary';
    changeAvatarBtn.textContent = '🎨 Change Avatar';
    changeAvatarBtn.addEventListener('click', () => {
      this._showEmojiPicker = !this._showEmojiPicker;
      this._showColorPicker = false;
      this._render();
    });
    row.appendChild(changeAvatarBtn);

    const changeColorBtn = document.createElement('button');
    changeColorBtn.className = 'ip-btn ip-btn--secondary';
    changeColorBtn.textContent = '🎨 Color';
    changeColorBtn.addEventListener('click', () => {
      this._showColorPicker = !this._showColorPicker;
      this._showEmojiPicker = false;
      this._render();
    });
    row.appendChild(changeColorBtn);

    const editBioBtn = document.createElement('button');
    editBioBtn.className = 'ip-btn ip-btn--ghost';
    editBioBtn.textContent = this._identity.bio ? '✏️ Edit Bio' : '+ Add Bio';
    editBioBtn.addEventListener('click', () => {
      this._editingBio = true;
      this._editingName = false;
      this._showEmojiPicker = false;
      this._showColorPicker = false;
      this._render();
    });
    row.appendChild(editBioBtn);

    return row;
  }

  _buildBadges() {
    const section = document.createElement('div');
    section.className = 'ip-badges-section';

    const heading = document.createElement('div');
    heading.className = 'ip-section-heading';
    heading.textContent = '🏅 Badges';
    section.appendChild(heading);

    const badges = this._identity.badges || [];

    if (badges.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'ip-badges-empty';
      empty.textContent = 'Complete tasks to earn badges.';
      section.appendChild(empty);
      return section;
    }

    const grid = document.createElement('div');
    grid.className = 'ip-badges-grid';

    for (const badge of badges) {
      const pill = document.createElement('div');
      pill.className = 'ip-badge-pill';
      pill.title = badge.label;
      pill.innerHTML = `<span class="ip-badge-icon">${badge.icon}</span><span class="ip-badge-label">${escapeHtml(badge.label)}</span>`;
      grid.appendChild(pill);
    }

    section.appendChild(grid);
    return section;
  }

  _buildActivity() {
    const section = document.createElement('div');
    section.className = 'ip-activity-section';

    const heading = document.createElement('div');
    heading.className = 'ip-section-heading';
    heading.textContent = '📈 Recent Activity';
    section.appendChild(heading);

    if (this._history.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'ip-activity-empty';
      empty.textContent = 'No activity yet. Start exploring!';
      section.appendChild(empty);
      return section;
    }

    const feed = document.createElement('ul');
    feed.className = 'ip-activity-feed';

    for (const event of this._history) {
      const item = document.createElement('li');
      item.className = 'ip-activity-item';

      const points = document.createElement('span');
      points.className = 'ip-activity-points';
      points.textContent = `+${event.points}`;

      const desc = document.createElement('span');
      desc.className = 'ip-activity-desc';
      desc.textContent = event.description;

      const time = document.createElement('span');
      time.className = 'ip-activity-time';
      time.textContent = formatAgo(event.created_at);

      item.appendChild(points);
      item.appendChild(desc);
      item.appendChild(time);
      feed.appendChild(item);
    }

    section.appendChild(feed);
    return section;
  }

  _buildDivider() {
    const hr = document.createElement('hr');
    hr.className = 'ip-divider';
    return hr;
  }

  // ── Actions ──────────────────────────────────────────────────

  async _saveName(value) {
    const trimmed = value.trim();
    if (!trimmed || !this._worldId) { this._editingName = false; this._render(); return; }
    if (this._rep) {
      this._identity = await this._rep.updateIdentity(this._worldId, { display_name: trimmed });
    } else {
      this._identity.display_name = trimmed;
    }
    this._editingName = false;
    this._render();
  }

  async _saveBio(value) {
    if (!this._worldId) { this._editingBio = false; this._render(); return; }
    if (this._rep) {
      this._identity = await this._rep.updateIdentity(this._worldId, { bio: value.trim() });
    } else {
      this._identity.bio = value.trim();
    }
    this._editingBio = false;
    this._render();
  }

  async _saveEmoji(emoji) {
    if (!this._worldId) return;
    if (this._rep) {
      this._identity = await this._rep.updateIdentity(this._worldId, { avatar_emoji: emoji });
    } else {
      this._identity.avatar_emoji = emoji;
    }
    this._showEmojiPicker = false;
    this._render();
  }

  async _saveColor(color) {
    if (!this._worldId) return;
    if (this._rep) {
      this._identity = await this._rep.updateIdentity(this._worldId, { avatar_color: color });
    } else {
      this._identity.avatar_color = color;
    }
    this._showColorPicker = false;
    this._render();
  }

  // ── Helpers ──────────────────────────────────────────────────

  /**
   * Produce a slightly lighter hex color for gradient effect.
   * @param {string} hex
   * @returns {string}
   */
  _lighten(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, ((n >> 16) & 0xff) + 60);
    const g = Math.min(255, ((n >> 8)  & 0xff) + 60);
    const b = Math.min(255, ((n)       & 0xff) + 60);
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  }

  _emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }

  _bindGlobalEvents() {
    // Re-render when reputation is awarded to this world
    this._repListener = (e) => {
      if (!this._worldId || e.detail.worldId !== this._worldId) return;
      this._identity = e.detail.identity;
      this._rep && this._rep.getHistory(this._worldId, 20).then(h => {
        this._history = h;
        this._render();
      });
    };
    document.addEventListener('reputation:awarded', this._repListener);

    this._identityListener = (e) => {
      if (!this._worldId || e.detail.worldId !== this._worldId) return;
      this._identity = e.detail.identity;
      this._render();
    };
    document.addEventListener('identity:updated', this._identityListener);
  }
}

// ── Builder function (matches panel pattern) ──────────────────

/**
 * Build the Identity Panel zone content.
 * Returns a container element with an IdentityPanel instance attached.
 *
 * @param {object} [options]
 * @param {object} [options.db]     — database instance
 * @param {string} [options.worldId] — world ID to load on init
 * @returns {HTMLElement}
 */
export function buildIdentityPanelContent(options = {}) {
  const container = document.createElement('div');
  container.className = 'ip-container';

  const panel = new IdentityPanel(container, { db: options.db });

  if (options.worldId) {
    panel.init(options.worldId);
  }

  container._panel = panel;
  return container;
}
