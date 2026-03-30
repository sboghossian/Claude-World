/**
 * notification-center.js — Slide-out notification panel for Claude World
 *
 * Bell icon in top-right HUD area with unread count badge.
 * Click opens a slide-out panel from the right side with a timeline
 * of notifications grouped by date.
 *
 * Categories: system, zone, agent, quest, achievement
 * Stores state in localStorage (lightweight, no DB).
 * Max 100 notifications, auto-prunes oldest.
 *
 * Listens to: document 'notification:push' events
 *   detail: { category, title, body, zoneId?, icon? }
 */

const STORAGE_KEY = "cw:notifications";
const MAX_NOTIFICATIONS = 100;

const CATEGORY_ICONS = {
  system: "\u2699", // gear
  zone: "\uD83C\uDFD7", // building
  agent: "\uD83E\uDD16", // robot
  quest: "\uD83D\uDCDC", // scroll
  achievement: "\u2B50", // star
};

const CATEGORY_LABELS = {
  system: "System",
  zone: "Zone",
  agent: "Agent",
  quest: "Quest",
  achievement: "Achievement",
};

// ── Utility helpers ──────────────────────────────────────────────

/** Create a DOM element with optional class and innerHTML. */
function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Generate a short unique id. */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Format a timestamp to a readable time string. */
function fmtTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Format a timestamp into a relative or absolute date label for grouping. */
function fmtDateGroup(ts) {
  const now = new Date();
  const d = new Date(ts);

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (dateOnly.getTime() === today.getTime()) return "Today";
  if (dateOnly.getTime() === yesterday.getTime()) return "Yesterday";

  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Get a date-only key for grouping. */
function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Main class ───────────────────────────────────────────────────

export class NotificationCenter {
  constructor() {
    /** @type {Array<{id: string, category: string, title: string, body: string, icon?: string, zoneId?: string, timestamp: number, read: boolean}>} */
    this._notifications = [];
    this._open = false;
    this._bellEl = null;
    this._panelEl = null;
    this._overlayEl = null;
    this._listEl = null;
    this._styleEl = null;

    // Bound handlers for cleanup
    this._onPush = this._handlePush.bind(this);
    this._onKeydown = this._handleKeydown.bind(this);
    this._onOutsideClick = this._handleOverlayClick.bind(this);
  }

  /**
   * Mount the notification center into the DOM.
   * Injects CSS, creates bell + panel, loads persisted state, wires events.
   */
  mount() {
    this._injectCSS();
    this._loadState();
    this._createBell();
    this._createOverlay();
    this._createPanel();
    this._updateBadge();

    // Wire events
    document.addEventListener("notification:push", this._onPush);
    document.addEventListener("keydown", this._onKeydown);
  }

  /**
   * Push a notification programmatically.
   * @param {{ category?: string, title: string, body?: string, icon?: string, zoneId?: string }} notification
   */
  push(notification) {
    const entry = {
      id: uid(),
      category: notification.category || "system",
      title: notification.title || "Notification",
      body: notification.body || "",
      icon:
        notification.icon ||
        CATEGORY_ICONS[notification.category] ||
        CATEGORY_ICONS.system,
      zoneId: notification.zoneId || null,
      timestamp: Date.now(),
      read: false,
    };

    this._notifications.unshift(entry);

    // Auto-prune
    if (this._notifications.length > MAX_NOTIFICATIONS) {
      this._notifications.length = MAX_NOTIFICATIONS;
    }

    this._saveState();
    this._updateBadge();
    this._ringBell();

    // Re-render list if panel is open
    if (this._open) {
      this._renderList();
    }

    return entry;
  }

  /** @returns {number} Current unread count. */
  getUnreadCount() {
    return this._notifications.filter((n) => !n.read).length;
  }

  /** Mark all notifications as read. */
  markAllRead() {
    let changed = false;
    for (const n of this._notifications) {
      if (!n.read) {
        n.read = true;
        changed = true;
      }
    }
    if (changed) {
      this._saveState();
      this._updateBadge();
      if (this._open) this._renderList();
    }
  }

  /** Remove all DOM elements, timers, and event listeners. */
  destroy() {
    document.removeEventListener("notification:push", this._onPush);
    document.removeEventListener("keydown", this._onKeydown);

    if (this._bellEl) this._bellEl.remove();
    if (this._panelEl) this._panelEl.remove();
    if (this._overlayEl) this._overlayEl.remove();
    if (this._styleEl) this._styleEl.remove();
  }

  // ══════════════════════════════════════════════════════════════
  // Private — CSS injection
  // ══════════════════════════════════════════════════════════════

  _injectCSS() {
    // Inject link tag for our stylesheet (self-contained pattern)
    this._styleEl = document.createElement("link");
    this._styleEl.rel = "stylesheet";
    this._styleEl.href = new URL(
      "./notification-center.css",
      import.meta.url,
    ).href;
    document.head.appendChild(this._styleEl);
  }

  // ══════════════════════════════════════════════════════════════
  // Private — DOM creation
  // ══════════════════════════════════════════════════════════════

  _createBell() {
    this._bellEl = el("button", "nc-bell");
    this._bellEl.setAttribute("aria-label", "Open notification center");

    this._bellIconEl = el("span", "nc-bell__icon", "\uD83D\uDD14");
    this._bellEl.appendChild(this._bellIconEl);

    this._badgeEl = el("span", "nc-bell__badge", "0");
    this._bellEl.appendChild(this._badgeEl);

    this._bellEl.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggle();
    });

    document.body.appendChild(this._bellEl);
  }

  _createOverlay() {
    this._overlayEl = el("div", "nc-overlay");
    this._overlayEl.addEventListener("click", this._onOutsideClick);
    document.body.appendChild(this._overlayEl);
  }

  _createPanel() {
    this._panelEl = el("div", "nc-panel");
    this._panelEl.setAttribute("role", "dialog");
    this._panelEl.setAttribute("aria-label", "Notification center");

    // Header
    const header = el("div", "nc-header");

    const titleEl = el("span", "nc-header__title", "Notifications");
    header.appendChild(titleEl);

    const actions = el("div", "nc-header__actions");

    const markReadBtn = el("button", "nc-header__btn", "Mark all read");
    markReadBtn.addEventListener("click", () => this.markAllRead());
    actions.appendChild(markReadBtn);

    const closeBtn = el("button", "nc-header__close", "\u00D7");
    closeBtn.setAttribute("aria-label", "Close notification center");
    closeBtn.addEventListener("click", () => this._close());
    actions.appendChild(closeBtn);

    header.appendChild(actions);
    this._panelEl.appendChild(header);

    // Scrollable list
    this._listEl = el("ul", "nc-list");
    this._listEl.setAttribute("role", "list");
    this._panelEl.appendChild(this._listEl);

    document.body.appendChild(this._panelEl);

    // Initial render
    this._renderList();
  }

  // ══════════════════════════════════════════════════════════════
  // Private — Rendering
  // ══════════════════════════════════════════════════════════════

  _renderList() {
    this._listEl.innerHTML = "";

    if (this._notifications.length === 0) {
      const empty = el("div", "nc-empty");
      const emptyIcon = el("div", "nc-empty__icon", "\uD83D\uDD14");
      const emptyText = el("div", "nc-empty__text", "No notifications yet");
      empty.appendChild(emptyIcon);
      empty.appendChild(emptyText);
      this._listEl.appendChild(empty);
      return;
    }

    // Group by date
    const groups = new Map();
    for (const n of this._notifications) {
      const key = dateKey(n.timestamp);
      if (!groups.has(key)) {
        groups.set(key, { label: fmtDateGroup(n.timestamp), items: [] });
      }
      groups.get(key).items.push(n);
    }

    for (const [, group] of groups) {
      // Date header
      const dateHeader = el("li", "nc-date-group", group.label);
      this._listEl.appendChild(dateHeader);

      // Notification items
      for (const n of group.items) {
        const item = this._renderItem(n);
        this._listEl.appendChild(item);
      }
    }
  }

  _renderItem(n) {
    const item = el("li", `nc-item nc-item--${n.category}`);
    item.setAttribute("role", "listitem");
    item.dataset.id = n.id;

    if (!n.read) {
      item.classList.add("nc-item--unread");
    }

    // Icon
    const iconEl = el(
      "div",
      "nc-item__icon",
      n.icon || CATEGORY_ICONS[n.category] || CATEGORY_ICONS.system,
    );
    item.appendChild(iconEl);

    // Content
    const content = el("div", "nc-item__content");

    const titleEl = el("div", "nc-item__title");
    titleEl.textContent = n.title;
    content.appendChild(titleEl);

    if (n.body) {
      const bodyEl = el("div", "nc-item__body");
      bodyEl.textContent = n.body;
      content.appendChild(bodyEl);
    }

    // Meta: timestamp + zone link
    const meta = el("div", "nc-item__meta");

    const timeEl = el("span", "nc-item__time", fmtTime(n.timestamp));
    meta.appendChild(timeEl);

    if (n.zoneId) {
      const zoneLink = el("span", "nc-item__zone-link", `\u2192 ${n.zoneId}`);
      zoneLink.addEventListener("click", (e) => {
        e.stopPropagation();
        document.dispatchEvent(
          new CustomEvent("hud:navigate", {
            detail: { zoneId: n.zoneId },
            bubbles: true,
          }),
        );
        this._close();
      });
      meta.appendChild(zoneLink);
    }

    content.appendChild(meta);
    item.appendChild(content);

    // Click to mark as read
    item.addEventListener("click", () => {
      if (!n.read) {
        n.read = true;
        item.classList.remove("nc-item--unread");
        this._saveState();
        this._updateBadge();
      }

      // If there is a zone link, navigate to it
      if (n.zoneId) {
        document.dispatchEvent(
          new CustomEvent("hud:navigate", {
            detail: { zoneId: n.zoneId },
            bubbles: true,
          }),
        );
        this._close();
      }
    });

    return item;
  }

  // ══════════════════════════════════════════════════════════════
  // Private — Open / Close
  // ══════════════════════════════════════════════════════════════

  _toggle() {
    if (this._open) {
      this._close();
    } else {
      this._openPanel();
    }
  }

  _openPanel() {
    this._open = true;
    this._panelEl.classList.add("nc-panel--open");
    this._overlayEl.classList.add("nc-overlay--visible");
    this._renderList();
  }

  _close() {
    this._open = false;
    this._panelEl.classList.remove("nc-panel--open");
    this._overlayEl.classList.remove("nc-overlay--visible");
  }

  _handleOverlayClick() {
    if (this._open) this._close();
  }

  _handleKeydown(e) {
    if (e.key === "Escape" && this._open) {
      e.preventDefault();
      this._close();
    }
  }

  // ══════════════════════════════════════════════════════════════
  // Private — Badge & Bell
  // ══════════════════════════════════════════════════════════════

  _updateBadge() {
    const count = this.getUnreadCount();
    this._badgeEl.textContent = count > 99 ? "99+" : String(count);
    this._badgeEl.classList.toggle("nc-bell__badge--hidden", count === 0);
    this._badgeEl.classList.toggle("nc-bell__badge--pulse", count > 0);
  }

  _ringBell() {
    this._bellEl.classList.remove("nc-bell--ring");
    void this._bellEl.offsetWidth; // force reflow
    this._bellEl.classList.add("nc-bell--ring");
  }

  // ══════════════════════════════════════════════════════════════
  // Private — Event handlers
  // ══════════════════════════════════════════════════════════════

  _handlePush(e) {
    const detail = e.detail || {};
    this.push({
      category: detail.category,
      title: detail.title,
      body: detail.body,
      icon: detail.icon,
      zoneId: detail.zoneId,
    });
  }

  // ══════════════════════════════════════════════════════════════
  // Private — localStorage persistence
  // ══════════════════════════════════════════════════════════════

  _loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this._notifications = parsed.slice(0, MAX_NOTIFICATIONS);
        }
      }
    } catch {
      // Corrupted data — start fresh
      this._notifications = [];
    }
  }

  _saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._notifications));
    } catch {
      // localStorage full or unavailable — silently ignore
    }
  }
}
