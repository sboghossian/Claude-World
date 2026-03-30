/**
 * global-search.js — Cross-zone search engine for Claude World
 *
 * Queries across all zone tables (tasks, legal docs, council sessions,
 * leads, content pieces, research queries, broadcast log, experiments,
 * skills, messages) and returns unified, ranked results.
 *
 * Uses FTS5 where available (tasks, legal_docs, messages) and falls back
 * to LIKE queries for non-FTS tables. Results are grouped by zone type,
 * capped at 50, and ranked by relevance.
 *
 * Usage:
 *   import { GlobalSearch } from '../systems/global-search.js';
 *   const search = new GlobalSearch();
 *   const { results, total } = await search.search('quarterly report');
 */

// ── Zone metadata for mapping table results to zones ─────────────────────────

const ZONE_MAP = {
  tasks:            { zoneId: 'dispatch',   label: 'Dispatch Tower',   emoji: '\u{1F5FC}' },
  legal_docs:       { zoneId: 'legal',      label: 'Legal Tower',      emoji: '\u2696\uFE0F' },
  council_sessions: { zoneId: 'council',    label: 'The Council',      emoji: '\u{1F3DB}\uFE0F' },
  leads:            { zoneId: 'sales',      label: 'Sales District',   emoji: '\u{1F4C8}' },
  content_pieces:   { zoneId: 'marketing',  label: 'Marketing Plaza',  emoji: '\u{1F4E3}' },
  research_queries: { zoneId: 'globe',      label: 'Globe Room',       emoji: '\u{1F310}' },
  broadcast_log:    { zoneId: 'broadcast',  label: 'Broadcast Tower',  emoji: '\u{1F4E1}' },
  experiments:      { zoneId: 'rnd',        label: 'R&D Lab',          emoji: '\u{1F52C}' },
  skills:           { zoneId: 'skills',     label: 'Skills Academy',   emoji: '\u{1F393}' },
  messages:         { zoneId: 'chat',       label: 'Chat Rooms',       emoji: '\u{1F4AC}' },
};

// ── Score constants ──────────────────────────────────────────────────────────

const SCORE_FTS = 100;       // FTS match base score
const SCORE_LIKE_TITLE = 80; // LIKE match in title/name field
const SCORE_LIKE_BODY = 50;  // LIKE match in body/content field
const MAX_RESULTS = 50;
const DEBOUNCE_MS = 200;
const SNIPPET_LENGTH = 120;
const RECENT_SEARCHES_KEY = 'claude-world:recent-searches';
const MAX_RECENT = 10;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extract a snippet around the first occurrence of `query` in `text`.
 * Returns the snippet with the matched portion wrapped in <mark> tags.
 */
function extractSnippet(text, query) {
  if (!text || !query) return text ? text.slice(0, SNIPPET_LENGTH) : '';
  const lower = text.toLowerCase();
  const qLower = query.toLowerCase();
  const idx = lower.indexOf(qLower);

  if (idx === -1) {
    return text.slice(0, SNIPPET_LENGTH) + (text.length > SNIPPET_LENGTH ? '...' : '');
  }

  const start = Math.max(0, idx - 40);
  const end = Math.min(text.length, idx + query.length + 80);
  let snippet = '';

  if (start > 0) snippet += '...';
  const raw = text.slice(start, end);

  // Highlight match within the snippet
  const matchStart = idx - start;
  const matchEnd = matchStart + query.length;
  snippet += raw.slice(0, matchStart);
  snippet += '<mark>' + raw.slice(matchStart, matchEnd) + '</mark>';
  snippet += raw.slice(matchEnd);
  if (end < text.length) snippet += '...';

  return snippet;
}

/**
 * Sanitize a query string for safe use in LIKE patterns and FTS MATCH.
 */
function sanitizeQuery(query) {
  return query.replace(/['"\\%;]/g, '').trim();
}

// ── GlobalSearch class ───────────────────────────────────────────────────────

export class GlobalSearch {
  constructor() {
    /** @type {number|null} */
    this._debounceTimer = null;
    /** @type {string[]} */
    this._recentSearches = this._loadRecent();
  }

  /**
   * Search across all zone tables.
   * @param {string} query - The search query
   * @param {Object} [opts]
   * @param {number} [opts.worldId] - World ID to scope results
   * @param {number} [opts.limit] - Max results (default 50)
   * @param {string[]} [opts.zones] - Filter to specific zone types
   * @returns {Promise<{ results: Array<{ type: string, title: string, snippet: string, score: number, id: string, zoneId: string }>, total: number }>}
   */
  async search(query, opts = {}) {
    const q = sanitizeQuery(query);
    if (!q || q.length < 2) {
      return { results: [], total: 0 };
    }

    const worldId = opts.worldId || window.currentWorldId || 1;
    const limit = opts.limit || MAX_RESULTS;
    const api = window.api;

    if (!api || !api.db || !api.db.globalSearch) {
      console.warn('[GlobalSearch] api.db.globalSearch not available');
      return { results: [], total: 0 };
    }

    try {
      const result = await api.db.globalSearch(worldId, q, limit);

      // Store as recent search
      this._addRecent(q);

      return result;
    } catch (err) {
      console.error('[GlobalSearch] Search failed:', err);
      return { results: [], total: 0 };
    }
  }

  /**
   * Debounced search — cancels previous pending search.
   * @param {string} query
   * @param {Object} [opts]
   * @returns {Promise<{ results: Array, total: number }>}
   */
  searchDebounced(query, opts = {}) {
    return new Promise((resolve) => {
      if (this._debounceTimer) {
        clearTimeout(this._debounceTimer);
      }
      this._debounceTimer = setTimeout(async () => {
        this._debounceTimer = null;
        const result = await this.search(query, opts);
        resolve(result);
      }, DEBOUNCE_MS);
    });
  }

  /**
   * Cancel any pending debounced search.
   */
  cancelPending() {
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }
  }

  /**
   * Get the list of recent searches.
   * @returns {string[]}
   */
  getRecentSearches() {
    return [...this._recentSearches];
  }

  /**
   * Clear all recent searches from localStorage.
   */
  clearRecent() {
    this._recentSearches = [];
    try {
      localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch (_) { /* noop */ }
  }

  /**
   * Get zone metadata for a result type.
   * @param {string} type - Table/type name
   * @returns {{ zoneId: string, label: string, emoji: string }|null}
   */
  static getZoneMeta(type) {
    return ZONE_MAP[type] || null;
  }

  /**
   * Get all zone metadata entries.
   * @returns {Object}
   */
  static get zoneMap() {
    return ZONE_MAP;
  }

  /**
   * Extract a highlighted snippet from text.
   * @param {string} text
   * @param {string} query
   * @returns {string}
   */
  static extractSnippet(text, query) {
    return extractSnippet(text, query);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _addRecent(query) {
    const q = query.trim();
    if (!q || q.length < 2) return;

    // Remove duplicate if exists
    this._recentSearches = this._recentSearches.filter(s => s !== q);
    // Add to front
    this._recentSearches.unshift(q);
    // Cap at max
    if (this._recentSearches.length > MAX_RECENT) {
      this._recentSearches = this._recentSearches.slice(0, MAX_RECENT);
    }

    this._saveRecent();
  }

  _loadRecent() {
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.slice(0, MAX_RECENT);
      }
    } catch (_) { /* noop */ }
    return [];
  }

  _saveRecent() {
    try {
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(this._recentSearches));
    } catch (_) { /* noop */ }
  }

  /**
   * Destroy — clean up timers.
   */
  destroy() {
    this.cancelPending();
  }
}
