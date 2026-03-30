/**
 * toasts.js — Slide-in notification system for Claude World
 *
 * Supports types: success, info, warning, error, achievement.
 * Stacks up to 3 toasts, auto-dismisses after configurable duration.
 */

const TOAST_ICONS = {
  success: "\u2713",
  info: "\u2139",
  warning: "\u26A0",
  error: "\u2717",
  achievement: "\u2605",
};

const MAX_TOASTS = 3;
const DEFAULT_DURATION = 4000;

export class ToastManager {
  constructor() {
    /** @type {HTMLElement[]} */
    this._toasts = [];
    this._createContainer();
  }

  _createContainer() {
    this._container = document.createElement("div");
    this._container.className = "toast-container";
    this._container.setAttribute("role", "status");
    this._container.setAttribute("aria-live", "polite");
    this._container.setAttribute("aria-label", "Notifications");
    document.body.appendChild(this._container);
  }

  /**
   * Show a toast notification.
   * @param {Object} options
   * @param {'success'|'info'|'warning'|'error'|'achievement'} options.type
   * @param {string} options.title
   * @param {string} [options.description]
   * @param {number} [options.duration] - Auto-dismiss in ms. 0 = manual dismiss only.
   * @returns {HTMLElement} The toast element (for manual removal).
   */
  show({
    type = "info",
    title,
    description,
    duration = DEFAULT_DURATION,
  } = {}) {
    // Enforce max toasts
    while (this._toasts.length >= MAX_TOASTS) {
      this._dismiss(this._toasts[0]);
    }

    const toast = document.createElement("div");
    toast.className = `toast toast--${type}`;
    toast.setAttribute("role", "alert");

    // Icon
    const iconEl = document.createElement("span");
    iconEl.className = "toast__icon";
    iconEl.textContent = TOAST_ICONS[type] || TOAST_ICONS.info;
    toast.appendChild(iconEl);

    // Content
    const contentEl = document.createElement("div");
    contentEl.className = "toast__content";

    const titleEl = document.createElement("div");
    titleEl.className = "toast__title";
    titleEl.textContent = title;
    contentEl.appendChild(titleEl);

    if (description) {
      const descEl = document.createElement("div");
      descEl.className = "toast__desc";
      descEl.textContent = description;
      contentEl.appendChild(descEl);
    }

    toast.appendChild(contentEl);

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.className = "toast__close";
    closeBtn.setAttribute("aria-label", "Dismiss notification");
    closeBtn.textContent = "\u00D7";
    closeBtn.addEventListener("click", () => this._dismiss(toast));
    toast.appendChild(closeBtn);

    this._container.appendChild(toast);
    this._toasts.push(toast);

    // Trigger entrance animation
    requestAnimationFrame(() => {
      toast.classList.add("toast--visible");
    });

    // Auto-dismiss
    if (duration > 0) {
      toast._dismissTimer = setTimeout(() => this._dismiss(toast), duration);
    }

    return toast;
  }

  /**
   * Dismiss a toast with exit animation.
   * @param {HTMLElement} toast
   */
  _dismiss(toast) {
    if (!toast || !toast.parentNode) return;

    clearTimeout(toast._dismissTimer);
    toast.classList.remove("toast--visible");
    toast.classList.add("toast--exiting");

    setTimeout(() => {
      toast.remove();
      const idx = this._toasts.indexOf(toast);
      if (idx !== -1) this._toasts.splice(idx, 1);
    }, 300);
  }

  /** Dismiss all toasts. */
  dismissAll() {
    for (const toast of [...this._toasts]) {
      this._dismiss(toast);
    }
  }

  /** Destroy the container. */
  destroy() {
    this.dismissAll();
    this._container.remove();
  }
}
