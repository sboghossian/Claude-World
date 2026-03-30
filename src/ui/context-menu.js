/**
 * context-menu.js — Custom right-click context menu for zone buildings
 *
 * Appears on right-click over a zone building on the canvas.
 * Menu items vary by zone type. Supports submenus, keyboard navigation,
 * auto-positioning, and dispatches 'context-menu:action' events.
 */

// ── Constants ──────────────────────────────────────────────────────

const AGENT_LIST = [
  { id: 'commander',  icon: '\u{1F451}', name: 'Commander' },
  { id: 'librarian',  icon: '\u{1F4DA}', name: 'Librarian' },
  { id: 'archivist',  icon: '\u{1F4DC}', name: 'Archivist' },
  { id: 'instructor', icon: '\u{1F393}', name: 'Instructor' },
  { id: 'dockmaster', icon: '\u{2693}',  name: 'Dockmaster' },
];

const PRIORITY_OPTIONS = [
  { id: 'high',   label: 'High',   cssClass: 'ctx-menu__dot--high' },
  { id: 'medium', label: 'Medium', cssClass: 'ctx-menu__dot--medium' },
  { id: 'low',    label: 'Low',    cssClass: 'ctx-menu__dot--low' },
];

const ZONE_ICONS = {
  dispatch: '\u{1F3F0}', brain: '\u{1F4DA}', chat: '\u{1F4AC}',
  memory: '\u{1F5C4}', skills: '\u{1F3AF}', minions: '\u{26CF}',
  treasury: '\u{1F4B0}', sales: '\u{1F4C8}', marketing: '\u{1F4E3}',
  exchange: '\u{1F504}', market: '\u{1F6D2}', council: '\u{1F3DB}',
  rnd: '\u{1F52C}', legal: '\u{2696}', archive: '\u{1F4DC}',
  docks: '\u{2693}', airport: '\u{2708}', globe: '\u{1F310}',
  broadcast: '\u{1F4E1}', 'mission-control': '\u{1F6F0}',
  analytics: '\u{1F4CA}', settings: '\u{2699}',
};

// ── Helpers ────────────────────────────────────────────────────────

/** Load the CSS stylesheet once. */
let _cssLoaded = false;
function ensureCSS() {
  if (_cssLoaded) return;
  _cssLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./context-menu.css', import.meta.url).href;
  document.head.appendChild(link);
}

/**
 * Create a DOM element with optional class and text.
 * @param {string} tag
 * @param {string} [className]
 * @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

// ── ContextMenu class ──────────────────────────────────────────────

export class ContextMenu {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('../renderer/camera.js').Camera} camera
   * @param {import('../renderer/buildings.js').BuildingManager} buildingManager
   */
  constructor(canvas, camera, buildingManager) {
    /** @type {HTMLCanvasElement} */
    this._canvas = canvas;
    /** @type {import('../renderer/camera.js').Camera} */
    this._camera = camera;
    /** @type {import('../renderer/buildings.js').BuildingManager} */
    this._bm = buildingManager;

    /** @type {HTMLElement | null} */
    this._menuEl = null;
    /** @type {HTMLElement | null} */
    this._activeSubmenu = null;
    /** @type {import('../renderer/zones.js').ZoneDef | null} */
    this._zone = null;
    /** @type {number} Focus index for keyboard nav (-1 = none) */
    this._focusIdx = -1;
    /** @type {Map<string, string>} zoneId -> priority */
    this._priorities = new Map();
    /** @type {Set<string>} locked zone ids */
    this._lockedZones = new Set();

    // Bound handlers
    this._onContextMenu = this._handleContextMenu.bind(this);
    this._onDismiss = this._handleDismiss.bind(this);
    this._onKeyDown = this._handleKeyDown.bind(this);

    ensureCSS();
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Enable right-click listening on the canvas. */
  enable() {
    this._canvas.addEventListener('contextmenu', this._onContextMenu);
  }

  /** Disable right-click listening (does not remove existing menu). */
  disable() {
    this._canvas.removeEventListener('contextmenu', this._onContextMenu);
    this._close();
  }

  /** Full teardown. */
  destroy() {
    this.disable();
    this._priorities.clear();
    this._lockedZones.clear();
  }

  // ── Event handlers ──────────────────────────────────────────────

  /**
   * Handle right-click on canvas.
   * @param {MouseEvent} e
   */
  _handleContextMenu(e) {
    e.preventDefault();

    // Hit test against buildings
    const worldPos = this._camera.screenToWorld(e.clientX, e.clientY);
    const hitZone = this._bm.hitTest(worldPos.x, worldPos.y);

    // Close any existing menu first
    this._close();

    if (!hitZone) return;

    this._zone = hitZone;
    this._show(e.clientX, e.clientY);
  }

  /**
   * Dismiss on click outside or Escape.
   * @param {MouseEvent} e
   */
  _handleDismiss(e) {
    if (this._menuEl && !this._menuEl.contains(e.target)) {
      this._close();
    }
  }

  /**
   * Keyboard navigation.
   * @param {KeyboardEvent} e
   */
  _handleKeyDown(e) {
    if (!this._menuEl) return;

    const items = this._getVisibleItems();
    if (!items.length) return;

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        if (this._activeSubmenu) {
          this._closeSubmenu();
          // Re-focus the parent item
          this._setFocus(this._focusIdx);
        } else {
          this._close();
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        this._moveFocus(1, items);
        break;

      case 'ArrowUp':
        e.preventDefault();
        this._moveFocus(-1, items);
        break;

      case 'ArrowRight':
        e.preventDefault();
        this._tryOpenSubmenu(items);
        break;

      case 'ArrowLeft':
        e.preventDefault();
        if (this._activeSubmenu) {
          this._closeSubmenu();
          this._setFocus(this._focusIdx);
        }
        break;

      case 'Enter':
      case ' ':
        e.preventDefault();
        if (this._focusIdx >= 0 && this._focusIdx < items.length) {
          items[this._focusIdx].click();
        }
        break;
    }
  }

  // ── Menu construction ───────────────────────────────────────────

  /**
   * Build and display the context menu at the given screen position.
   * @param {number} x
   * @param {number} y
   */
  _show(x, y) {
    const zone = this._zone;
    if (!zone) return;

    const menu = el('div', 'ctx-menu');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', `Context menu for ${zone.name}`);

    const isLocked = this._lockedZones.has(zone.id);
    const icon = ZONE_ICONS[zone.id] || '\u{1F3D7}';

    // 1. Open zone
    this._addItem(menu, icon, `Open ${zone.name}`, () => {
      this._dispatch('open', { zoneId: zone.id });
      document.dispatchEvent(new CustomEvent('zone-click', { detail: zone }));
    });

    // 2. View Analytics
    this._addItem(menu, '\u{1F4CA}', 'View Analytics', () => {
      this._dispatch('view-analytics', { zoneId: zone.id });
      document.dispatchEvent(new CustomEvent('zone-click', {
        detail: { ...zone, id: 'analytics', name: 'Analytics', _filterZone: zone.id },
      }));
    });

    // 3. Assign Agent (submenu)
    this._addSubmenuTrigger(menu, '\u{1F916}', 'Assign Agent', (container) => {
      for (const agent of AGENT_LIST) {
        this._addItem(container, agent.icon, agent.name, () => {
          this._dispatch('assign-agent', { zoneId: zone.id, agentId: agent.id });
        });
      }
    });

    // 4. Set Priority (submenu)
    const currentPriority = this._priorities.get(zone.id) || null;
    this._addSubmenuTrigger(menu, '\u{2B50}', 'Set Priority', (container) => {
      for (const p of PRIORITY_OPTIONS) {
        const item = this._addItem(container, null, p.label, () => {
          this._priorities.set(zone.id, p.id);
          this._dispatch('set-priority', { zoneId: zone.id, priority: p.id });
        });
        // Insert colored dot before label
        const dot = el('span', `ctx-menu__dot ${p.cssClass}`);
        const iconSlot = item.querySelector('.ctx-menu__icon');
        if (iconSlot) {
          iconSlot.textContent = '';
          iconSlot.appendChild(dot);
        }
        // Mark current priority
        if (currentPriority === p.id) {
          const check = el('span', null, '\u{2713}');
          check.style.marginLeft = 'auto';
          check.style.opacity = '0.6';
          check.style.fontSize = '12px';
          item.appendChild(check);
        }
      }
    });

    // 5. Toggle Lock
    const lockLabel = isLocked ? 'Unlock Zone' : 'Lock Zone';
    const lockIcon = isLocked ? '\u{1F513}' : '\u{1F512}';
    this._addItem(menu, lockIcon, lockLabel, () => {
      if (isLocked) {
        this._lockedZones.delete(zone.id);
      } else {
        this._lockedZones.add(zone.id);
      }
      this._dispatch('toggle-lock', { zoneId: zone.id, locked: !isLocked });
    });

    // 6. Separator
    menu.appendChild(el('div', 'ctx-menu__separator'));

    // 7. Zone Info (mini card)
    this._addItem(menu, '\u{2139}\u{FE0F}', 'Zone Info', () => {
      this._showInfoCard(menu, zone);
    });

    // Position and attach
    document.body.appendChild(menu);
    this._menuEl = menu;
    this._focusIdx = -1;

    this._position(menu, x, y);

    // Bind dismiss listeners
    requestAnimationFrame(() => {
      document.addEventListener('mousedown', this._onDismiss, true);
      document.addEventListener('keydown', this._onKeyDown, true);
    });
  }

  /**
   * Add a regular menu item.
   * @param {HTMLElement} container
   * @param {string|null} icon
   * @param {string} label
   * @param {() => void} onClick
   * @returns {HTMLElement}
   */
  _addItem(container, icon, label, onClick) {
    const item = el('button', 'ctx-menu__item');
    item.setAttribute('role', 'menuitem');
    item.tabIndex = -1;

    const iconEl = el('span', 'ctx-menu__icon', icon || '');
    const labelEl = el('span', 'ctx-menu__label', label);

    item.appendChild(iconEl);
    item.appendChild(labelEl);

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
      this._close();
    });

    container.appendChild(item);
    return item;
  }

  /**
   * Add a menu item that triggers a submenu.
   * @param {HTMLElement} container
   * @param {string} icon
   * @param {string} label
   * @param {(submenu: HTMLElement) => void} buildSubmenu
   */
  _addSubmenuTrigger(container, icon, label, buildSubmenu) {
    const item = el('button', 'ctx-menu__item');
    item.setAttribute('role', 'menuitem');
    item.setAttribute('aria-haspopup', 'true');
    item.tabIndex = -1;

    const iconEl = el('span', 'ctx-menu__icon', icon);
    const labelEl = el('span', 'ctx-menu__label', label);
    const chevron = el('span', 'ctx-menu__chevron', '\u{25B6}');

    item.appendChild(iconEl);
    item.appendChild(labelEl);
    item.appendChild(chevron);

    // Store submenu builder
    item._buildSubmenu = buildSubmenu;
    item._isSubmenuTrigger = true;

    const showSub = () => {
      this._closeSubmenu();
      const sub = el('div', 'ctx-menu__submenu');
      sub.setAttribute('role', 'menu');
      buildSubmenu(sub);

      item.style.position = 'relative';
      item.appendChild(sub);
      this._activeSubmenu = sub;

      // Flip if near right edge
      const rect = sub.getBoundingClientRect();
      if (rect.right > window.innerWidth - 8) {
        sub.classList.add('ctx-menu__submenu--flip');
      }
      // Flip vertical if near bottom
      if (rect.bottom > window.innerHeight - 8) {
        sub.style.top = 'auto';
        sub.style.bottom = '-6px';
      }
    };

    item.addEventListener('mouseenter', showSub);
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      showSub();
    });

    container.appendChild(item);
    return item;
  }

  /**
   * Show a mini info card replacing the menu content.
   * @param {HTMLElement} menu
   * @param {import('../renderer/zones.js').ZoneDef} zone
   */
  _showInfoCard(menu, zone) {
    // Don't close the menu; replace its content with an info card
    // Actually, just show the info as a temporary tooltip-like thing
    const card = el('div', 'ctx-menu__info-card');

    const name = el('div', 'ctx-menu__info-name', `${ZONE_ICONS[zone.id] || ''} ${zone.name}`);
    card.appendChild(name);

    const district = el('div', 'ctx-menu__info-district', `${zone.district} district \u2022 Ring ${zone.ring}`);
    card.appendChild(district);

    const status = el('div', 'ctx-menu__info-status');
    const badge = el('span',
      `ctx-menu__info-badge ${zone.active ? 'ctx-menu__info-badge--active' : 'ctx-menu__info-badge--locked'}`,
      zone.active ? 'Active' : 'Locked'
    );
    status.appendChild(badge);

    const priority = this._priorities.get(zone.id);
    if (priority) {
      const pLabel = el('span', null, `Priority: ${priority}`);
      pLabel.style.fontSize = '11px';
      status.appendChild(pLabel);
    }
    card.appendChild(status);

    const sizeInfo = el('div', 'ctx-menu__info-status', `${zone.w}\u00D7${zone.h} tiles \u2022 Height ${zone.height}`);
    card.appendChild(sizeInfo);

    // Replace menu items with info card
    menu.innerHTML = '';
    menu.appendChild(card);

    // Dispatch event
    this._dispatch('zone-info', { zoneId: zone.id });
  }

  // ── Positioning ─────────────────────────────────────────────────

  /**
   * Position the menu near the cursor, flipping if near edges.
   * @param {HTMLElement} menu
   * @param {number} x - clientX
   * @param {number} y - clientY
   */
  _position(menu, x, y) {
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Place initially to measure
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    // Force layout so we get actual dimensions
    const rect = menu.getBoundingClientRect();

    // Flip horizontal
    let finalX = x;
    if (x + rect.width > vw - pad) {
      finalX = x - rect.width;
    }
    if (finalX < pad) finalX = pad;

    // Flip vertical
    let finalY = y;
    if (y + rect.height > vh - pad) {
      finalY = y - rect.height;
    }
    if (finalY < pad) finalY = pad;

    menu.style.left = `${finalX}px`;
    menu.style.top = `${finalY}px`;
  }

  // ── Keyboard navigation ─────────────────────────────────────────

  /**
   * Get all focusable items in the current menu context.
   * @returns {HTMLElement[]}
   */
  _getVisibleItems() {
    if (!this._menuEl) return [];

    // If a submenu is open, navigate within it
    const container = this._activeSubmenu || this._menuEl;
    return Array.from(container.querySelectorAll(':scope > .ctx-menu__item'));
  }

  /**
   * Move focus by a delta (-1 or +1).
   * @param {number} delta
   * @param {HTMLElement[]} items
   */
  _moveFocus(delta, items) {
    if (!items.length) return;

    let next = this._focusIdx + delta;
    if (next < 0) next = items.length - 1;
    if (next >= items.length) next = 0;

    this._setFocus(next);
  }

  /**
   * Set focus to a specific index.
   * @param {number} idx
   */
  _setFocus(idx) {
    const items = this._getVisibleItems();

    // Clear previous
    for (const item of items) {
      item.classList.remove('ctx-menu__item--focused');
    }

    if (idx >= 0 && idx < items.length) {
      this._focusIdx = idx;
      items[idx].classList.add('ctx-menu__item--focused');
      items[idx].focus();
    }
  }

  /**
   * Try to open a submenu from the currently focused item.
   * @param {HTMLElement[]} items
   */
  _tryOpenSubmenu(items) {
    if (this._focusIdx < 0 || this._focusIdx >= items.length) return;
    const item = items[this._focusIdx];
    if (item._isSubmenuTrigger) {
      // Trigger mouseenter to open submenu
      item.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      // Focus first item in submenu
      requestAnimationFrame(() => {
        this._focusIdx = -1;
        this._moveFocus(1, this._getVisibleItems());
      });
    }
  }

  // ── Submenu management ──────────────────────────────────────────

  /** Close the currently open submenu. */
  _closeSubmenu() {
    if (this._activeSubmenu) {
      this._activeSubmenu.remove();
      this._activeSubmenu = null;
    }
  }

  // ── Close & dispatch ────────────────────────────────────────────

  /** Close and clean up the menu. */
  _close() {
    this._closeSubmenu();

    if (this._menuEl) {
      this._menuEl.remove();
      this._menuEl = null;
    }

    this._zone = null;
    this._focusIdx = -1;

    document.removeEventListener('mousedown', this._onDismiss, true);
    document.removeEventListener('keydown', this._onKeyDown, true);
  }

  /**
   * Dispatch a context-menu:action custom event.
   * @param {string} action
   * @param {object} data
   */
  _dispatch(action, data = {}) {
    const detail = { action, zoneId: data.zoneId || this._zone?.id, data };
    document.dispatchEvent(new CustomEvent('context-menu:action', {
      detail,
      bubbles: true,
    }));
  }
}
