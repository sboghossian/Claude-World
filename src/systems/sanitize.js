/**
 * sanitize.js — HTML sanitization utilities for rendering AI response content.
 *
 * Strips dangerous markup (script tags, event handlers, javascript: URLs)
 * and provides a plain-text escaper for safe DOM insertion.
 */

// Matches <script>...</script> (including attributes), case-insensitive
const SCRIPT_TAG_RE = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script\s*>/gi;

// Matches on* event handler attributes (onclick, onerror, onload, etc.)
const EVENT_HANDLER_RE = /\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

// Matches javascript: URLs in href, src, action, formaction, data, etc.
const JS_URL_RE =
  /(href|src|action|formaction|data)\s*=\s*(?:"javascript:[^"]*"|'javascript:[^']*')/gi;

// Matches <iframe>, <object>, <embed>, <applet> tags
const DANGEROUS_TAGS_RE = /<\/?\s*(iframe|object|embed|applet)\b[^>]*>/gi;

/**
 * Sanitize an HTML string by removing dangerous content.
 *
 * Strips: <script> tags, on* event handlers, javascript: URLs,
 * and dangerous embed tags (<iframe>, <object>, <embed>, <applet>).
 *
 * @param {string} html — raw HTML string (e.g. from AI response)
 * @returns {string} — sanitized HTML safe for innerHTML insertion
 */
export function sanitizeHTML(html) {
  if (typeof html !== "string") return "";

  let clean = html;

  // Remove <script>...</script> blocks (run twice for nested edge cases)
  clean = clean.replace(SCRIPT_TAG_RE, "");
  clean = clean.replace(SCRIPT_TAG_RE, "");

  // Remove event handler attributes
  clean = clean.replace(EVENT_HANDLER_RE, "");

  // Remove javascript: URLs
  clean = clean.replace(JS_URL_RE, "");

  // Remove dangerous embed tags
  clean = clean.replace(DANGEROUS_TAGS_RE, "");

  return clean;
}

/**
 * Escape a plain-text string so it is safe for insertion into HTML.
 * Converts &, <, >, ", and ' to their HTML entity equivalents.
 *
 * @param {string} text — raw text
 * @returns {string} — escaped text safe for innerHTML / attribute values
 */
export function escapeHTML(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
