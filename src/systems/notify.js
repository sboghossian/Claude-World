/**
 * notify.js — Lightweight helper to dispatch notification events.
 *
 * Usage:
 *   import { notify } from '../systems/notify.js';
 *   notify('zone', 'Zone Unlocked', 'The Treasury is now available.', { zoneId: 'treasury' });
 *
 * Categories: system, zone, agent, quest, achievement
 */

/**
 * Dispatch a notification event that the NotificationCenter will pick up.
 *
 * @param {'system'|'zone'|'agent'|'quest'|'achievement'} category
 * @param {string} title
 * @param {string} body
 * @param {{ zoneId?: string, icon?: string }} [opts]
 */
export function notify(category, title, body, opts = {}) {
  document.dispatchEvent(
    new CustomEvent("notification:push", {
      detail: { category, title, body, ...opts },
    }),
  );
}

/**
 * Convenience shortcuts for each category.
 */
export const notifySystem = (title, body, opts) =>
  notify("system", title, body, opts);
export const notifyZone = (title, body, opts) =>
  notify("zone", title, body, opts);
export const notifyAgent = (title, body, opts) =>
  notify("agent", title, body, opts);
export const notifyQuest = (title, body, opts) =>
  notify("quest", title, body, opts);
export const notifyAchievement = (title, body, opts) =>
  notify("achievement", title, body, opts);
