/**
 * achievements-panel.js — Achievements gallery panel for Claude World
 *
 * Displays a grid of achievement badges with category filters,
 * progress tracking, and detail cards.
 */

import { getAchievementEngine, CATEGORIES, RARITY } from '../systems/achievements.js';

// ── Helpers ───────────────────────────────────────────────────

/**
 * Format an ISO date string.
 * @param {string|null} iso
 * @returns {string}
 */
function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/**
 * Create an element with optional className and textContent.
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ── AchievementsPanel ─────────────────────────────────────────

export class AchievementsPanel {
  constructor() {
    /** @type {HTMLElement|null} */
    this._overlay = null;
    /** @type {HTMLElement|null} */
    this._detailOverlay = null;
    /** @type {boolean} */
    this._open = false;
    /** @type {string} */
    this._activeCategory = 'all';
    /** @type {Map<string,string>} — achievement_id → unlocked_at from DB */
    this._unlockDates = new Map();

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onUpdated = this._onUpdated.bind(this);

    document.addEventListener('achievements-panel:open', () => this.open());
    document.addEventListener('achievements:updated', this._onUpdated);
  }

  // ── Lifecycle ─────────────────────────────────────────────

  /**
   * Initialize and load unlock dates.
   * @param {number} worldId
   */
  async init(worldId) {
    this._worldId = worldId;
    await this._loadUnlockDates();
  }

  async _loadUnlockDates() {
    try {
      const rows = await window.api.db.getAchievements(this._worldId);
      this._unlockDates.clear();
      for (const row of rows) {
        this._unlockDates.set(row.achievement_id, row.unlocked_at);
      }
    } catch (err) {
      console.warn('[achievements-panel] Could not load unlock dates:', err.message);
    }
  }

  // ── Open / Close ──────────────────────────────────────────

  open() {
    if (this._open) {
      this._refresh();
      return;
    }
    this._open = true;
    this._loadUnlockDates().then(() => this._createDOM());
    document.addEventListener('keydown', this._onKeyDown);
  }

  close() {
    if (!this._open) return;
    this._open = false;
    document.removeEventListener('keydown', this._onKeyDown);
    this._closeDetail();

    if (this._overlay) {
      this._overlay.classList.add('achievements-overlay--closing');
      setTimeout(() => {
        this._overlay?.remove();
        this._overlay = null;
      }, 150);
    }
  }

  // ── Rendering ─────────────────────────────────────────────

  /**
   * Build and mount the full panel DOM.
   */
  _createDOM() {
    const engine = getAchievementEngine();

    // Overlay
    const overlay = el('div', 'achievements-overlay');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.close();
    });

    // Panel
    const panel = el('div', 'achievements-panel');

    // Header
    const header = el('div', 'achievements-header');
    const title = el('h2', 'achievements-header__title', '\uD83C\uDFC5 Achievements');
    const closeBtn = el('button', 'achievements-header__close', '\u2715');
    closeBtn.addEventListener('click', () => this.close());
    header.append(title, closeBtn);

    // Completion bar
    const completion = this._renderCompletion(engine);

    // Category tabs
    const tabs = this._renderTabs();

    // Badge grid
    const grid = el('div', 'achievements-grid');
    this._populateGrid(grid, engine);

    panel.append(header, completion, tabs, grid);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    this._overlay = overlay;
  }

  /**
   * Render the overall completion bar.
   * @param {AchievementEngine} engine
   * @returns {HTMLElement}
   */
  _renderCompletion(engine) {
    const wrap = el('div', 'achievements-completion');
    const label = el('span', 'achievements-completion__label',
      `${engine.unlockedCount} / ${engine.totalCount} unlocked`);
    const bar = el('div', 'achievements-completion__bar');
    const fill = el('div', 'achievements-completion__fill');
    fill.style.width = `${engine.completionPercent}%`;
    bar.appendChild(fill);
    const pct = el('span', 'achievements-completion__pct', `${engine.completionPercent}%`);
    wrap.append(label, bar, pct);
    return wrap;
  }

  /**
   * Render category filter tabs.
   * @returns {HTMLElement}
   */
  _renderTabs() {
    const wrap = el('div', 'achievements-tabs');

    // "All" tab
    const allTab = el('button', 'achievements-tab', 'All');
    if (this._activeCategory === 'all') allTab.classList.add('achievements-tab--active');
    allTab.addEventListener('click', () => this._setCategory('all'));
    wrap.appendChild(allTab);

    for (const cat of CATEGORIES) {
      const tab = el('button', 'achievements-tab', `${cat.icon} ${cat.label}`);
      if (this._activeCategory === cat.id) tab.classList.add('achievements-tab--active');
      tab.addEventListener('click', () => this._setCategory(cat.id));
      wrap.appendChild(tab);
    }

    return wrap;
  }

  /**
   * Populate the badge grid.
   * @param {HTMLElement} grid
   * @param {AchievementEngine} engine
   */
  _populateGrid(grid, engine) {
    grid.innerHTML = '';
    const achievements = engine.getAll();
    const filtered = this._activeCategory === 'all'
      ? achievements
      : achievements.filter((a) => a.category === this._activeCategory);

    if (filtered.length === 0) {
      grid.appendChild(el('div', 'achievements-empty', 'No achievements in this category.'));
      return;
    }

    for (const ach of filtered) {
      grid.appendChild(this._renderBadge(ach));
    }
  }

  /**
   * Render a single achievement badge card.
   * @param {object} ach
   * @returns {HTMLElement}
   */
  _renderBadge(ach) {
    const card = el('div', 'achievement-badge');

    if (ach.unlocked) {
      card.classList.add(`achievement-badge--${ach.rarity}`);
    } else {
      card.classList.add('achievement-badge--locked');
    }

    // Icon
    const icon = el('div', 'achievement-badge__icon', ach.unlocked ? ach.icon : '\uD83D\uDD12');
    card.appendChild(icon);

    // Title
    const title = el('div', 'achievement-badge__title', ach.unlocked ? ach.title : '???');
    card.appendChild(title);

    // Progress bar for locked achievements
    if (!ach.unlocked && ach.progress) {
      const pct = Math.min(100, Math.round((ach.progress.current / ach.progress.target) * 100));
      const progWrap = el('div', 'achievement-badge__progress');
      const progFill = el('div', 'achievement-badge__progress-fill');
      progFill.style.width = `${pct}%`;
      progWrap.appendChild(progFill);
      card.appendChild(progWrap);
    }

    card.addEventListener('click', () => this._showDetail(ach));
    return card;
  }

  // ── Detail card ───────────────────────────────────────────

  /**
   * Show the detail card for an achievement.
   * @param {object} ach
   */
  _showDetail(ach) {
    this._closeDetail();

    const overlay = el('div', 'achievement-detail-overlay');
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this._closeDetail();
    });

    const card = el('div', 'achievement-detail');

    // Icon
    const icon = el('div', 'achievement-detail__icon', ach.icon);
    card.appendChild(icon);

    // Title
    const title = el('h3', 'achievement-detail__title', ach.title);
    card.appendChild(title);

    // Rarity badge
    const rarityInfo = RARITY[ach.rarity] || RARITY.common;
    const rarity = el('div', `achievement-detail__rarity achievement-detail__rarity--${ach.rarity}`,
      rarityInfo.label);
    card.appendChild(rarity);

    // Description
    const desc = el('p', 'achievement-detail__desc', ach.description);
    card.appendChild(desc);

    // Progress bar
    const progress = ach.progress || { current: ach.unlocked ? 1 : 0, target: 1 };
    const pct = Math.min(100, Math.round((progress.current / progress.target) * 100));

    const progBar = el('div', 'achievement-detail__progress');
    const progFill = el('div',
      `achievement-detail__progress-fill achievement-detail__progress-fill--${ach.rarity}`);
    progFill.style.width = `${pct}%`;
    progBar.appendChild(progFill);
    card.appendChild(progBar);

    const progText = el('div', 'achievement-detail__progress-text',
      `${progress.current} / ${progress.target}`);
    card.appendChild(progText);

    // Unlock date
    if (ach.unlocked) {
      const unlockDate = this._unlockDates.get(ach.id);
      const dateEl = el('div', 'achievement-detail__date',
        unlockDate ? `Unlocked ${formatDate(unlockDate)}` : 'Unlocked');
      card.appendChild(dateEl);
    }

    // Close button
    const closeBtn = el('button', 'achievement-detail__close', 'Close');
    closeBtn.addEventListener('click', () => this._closeDetail());
    card.appendChild(closeBtn);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    this._detailOverlay = overlay;
  }

  _closeDetail() {
    if (this._detailOverlay) {
      this._detailOverlay.remove();
      this._detailOverlay = null;
    }
  }

  // ── Category switching ────────────────────────────────────

  _setCategory(catId) {
    this._activeCategory = catId;
    this._refresh();
  }

  // ── Refresh ───────────────────────────────────────────────

  _refresh() {
    if (!this._open || !this._overlay) return;
    this._overlay.remove();
    this._overlay = null;
    this._createDOM();
  }

  _onUpdated() {
    this._loadUnlockDates().then(() => {
      if (this._open) this._refresh();
    });
  }

  // ── Keyboard ──────────────────────────────────────────────

  _onKeyDown(e) {
    if (e.key === 'Escape') {
      if (this._detailOverlay) {
        this._closeDetail();
      } else {
        this.close();
      }
    }
  }

  // ── Public render method ──────────────────────────────────

  /**
   * Render and return the panel element (for integration into zone panels).
   * Opens the panel inline rather than as an overlay.
   * @returns {HTMLElement}
   */
  render() {
    const engine = getAchievementEngine();
    const container = el('div', 'achievements-panel');

    const header = el('div', 'achievements-header');
    const title = el('h2', 'achievements-header__title', '\uD83C\uDFC5 Achievements');
    header.appendChild(title);

    const completion = this._renderCompletion(engine);
    const tabs = this._renderTabs();

    const grid = el('div', 'achievements-grid');
    this._populateGrid(grid, engine);

    container.append(header, completion, tabs, grid);
    return container;
  }
}
