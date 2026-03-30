/**
 * task-stream.js — Real-time task streaming overlay for Claude World
 *
 * Full-width bottom drawer that visualises AI responses as they stream in.
 * Terminal-style monospace display with typewriter effect, syntax highlighting,
 * sidebar stats (model, tokens, cost, elapsed time), and tab support for
 * concurrent streams.
 *
 * Listens to:
 *   task:stream-start   — { id, model, provider }
 *   task:stream-chunk   — { id, text }
 *   task:stream-end     — { id, inputTokens, outputTokens, costUsd, latencyMs, error? }
 *   task:cancel          — (dispatched by Stop button)
 *
 * Usage:
 *   const stream = new TaskStream();
 *   stream.mount();          // attaches to DOM + event bus
 *   stream.destroy();        // tears everything down
 */

// ── Constants ──────────────────────────────────────────────────────────

const AUTO_COLLAPSE_MS = 3000;
const TYPEWRITER_INTERVAL_MS = 12;
const TOKEN_ANIM_MS = 200;

/** Basic keyword sets for syntax highlighting */
const JS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'if', 'else', 'for',
  'while', 'do', 'switch', 'case', 'break', 'continue', 'class',
  'extends', 'new', 'this', 'import', 'export', 'from', 'default',
  'async', 'await', 'try', 'catch', 'throw', 'typeof', 'instanceof',
  'true', 'false', 'null', 'undefined', 'yield', 'of', 'in',
]);

const PROVIDER_ABBREV = {
  anthropic: 'A',
  openai:    'O',
  google:    'G',
};

// ── Helpers ────────────────────────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function fmtElapsed(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function fmtCost(usd) {
  if (usd == null || usd === 0) return '$0.000';
  if (usd < 0.001) return `$${usd.toFixed(5)}`;
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

function fmtTokens(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/** Rudimentary syntax highlight for a code block string. Returns HTML. */
function highlightCode(code) {
  // Escape first
  let html = esc(code);

  // Comments (single-line)
  html = html.replace(/(\/\/.*)/g, '<span class="ts-comment">$1</span>');

  // Strings (double and single quoted — simple, non-nested)
  html = html.replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;|`[^`]*?`)/g,
    '<span class="ts-string">$1</span>');

  // Numbers
  html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="ts-number">$1</span>');

  // Keywords
  const kwPat = new RegExp(
    '\\b(' + [...JS_KEYWORDS].join('|') + ')\\b', 'g'
  );
  html = html.replace(kwPat, '<span class="ts-keyword">$1</span>');

  return html;
}

/**
 * Parse raw streamed text and return HTML with code blocks highlighted.
 * Handles fenced code blocks (```lang ... ```).
 */
function renderStreamedText(raw) {
  const parts = raw.split(/(```[\s\S]*?```)/g);
  let html = '';
  for (const part of parts) {
    if (part.startsWith('```')) {
      const lines = part.slice(3, -3).split('\n');
      const lang = lines[0].trim();
      const code = lines.slice(lang ? 1 : 0).join('\n');
      html += '<span class="ts-code-block">';
      if (lang) {
        html += `<span class="ts-code-lang">${esc(lang)}</span>`;
      }
      html += highlightCode(code);
      html += '</span>';
    } else {
      html += esc(part);
    }
  }
  return html;
}

// ── StreamTab (internal data model for one stream) ─────────────────────

class StreamTab {
  constructor(id, model, provider) {
    this.id = id;
    this.model = model || 'unknown';
    this.provider = provider || 'default';
    this.chunks = [];         // raw text chunks received
    this.displayedLen = 0;    // chars already rendered
    this.status = 'streaming'; // streaming | done | error
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.costUsd = 0;
    this.startTime = Date.now();
    this.endTime = null;
    this.pinned = false;
    this.collapseTimer = null;
  }

  get fullText() {
    return this.chunks.join('');
  }

  get elapsedMs() {
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }
}

// ── TaskStream (exported class) ────────────────────────────────────────

export class TaskStream {
  constructor() {
    /** @type {Map<string, StreamTab>} */
    this._tabs = new Map();
    /** @type {string|null} Active tab id */
    this._activeId = null;
    /** @type {HTMLElement|null} */
    this._root = null;
    /** @type {number|null} */
    this._typewriterTimer = null;
    /** @type {number|null} */
    this._elapsedTimer = null;
    /** @type {boolean} */
    this._mounted = false;

    // Bound handlers
    this._onStreamStart = this._handleStreamStart.bind(this);
    this._onStreamChunk = this._handleStreamChunk.bind(this);
    this._onStreamEnd = this._handleStreamEnd.bind(this);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  mount() {
    if (this._mounted) return;
    this._mounted = true;

    this._buildDOM();
    document.body.appendChild(this._root);

    // Listen to task events on the window
    window.addEventListener('task:stream-start', this._onStreamStart);
    window.addEventListener('task:stream-chunk', this._onStreamChunk);
    window.addEventListener('task:stream-end', this._onStreamEnd);

    // Elapsed timer — update every second
    this._elapsedTimer = setInterval(() => this._tickElapsed(), 1000);
  }

  destroy() {
    if (!this._mounted) return;
    this._mounted = false;

    window.removeEventListener('task:stream-start', this._onStreamStart);
    window.removeEventListener('task:stream-chunk', this._onStreamChunk);
    window.removeEventListener('task:stream-end', this._onStreamEnd);

    if (this._typewriterTimer) {
      clearInterval(this._typewriterTimer);
      this._typewriterTimer = null;
    }
    if (this._elapsedTimer) {
      clearInterval(this._elapsedTimer);
      this._elapsedTimer = null;
    }

    // Clear collapse timers
    for (const tab of this._tabs.values()) {
      if (tab.collapseTimer) clearTimeout(tab.collapseTimer);
    }
    this._tabs.clear();

    if (this._root && this._root.parentNode) {
      this._root.parentNode.removeChild(this._root);
    }
    this._root = null;
  }

  // ── DOM construction ───────────────────────────────────────────────

  _buildDOM() {
    const root = document.createElement('div');
    root.className = 'task-stream';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'AI Task Stream');

    // Tab bar
    const tabs = document.createElement('div');
    tabs.className = 'task-stream__tabs';
    root.appendChild(tabs);

    // Body (sidebar + output)
    const body = document.createElement('div');
    body.className = 'task-stream__body';

    // Sidebar
    const sidebar = document.createElement('div');
    sidebar.className = 'task-stream__sidebar';
    body.appendChild(sidebar);

    // Output wrap
    const outputWrap = document.createElement('div');
    outputWrap.className = 'task-stream__output-wrap';

    const output = document.createElement('div');
    output.className = 'task-stream__output';
    output.setAttribute('role', 'log');
    output.setAttribute('aria-live', 'polite');
    outputWrap.appendChild(output);
    body.appendChild(outputWrap);

    root.appendChild(body);

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'task-stream__toolbar';
    root.appendChild(toolbar);

    this._root = root;
    this._els = {
      tabs,
      sidebar,
      output,
      outputWrap,
      toolbar,
    };
  }

  // ── Event handlers ─────────────────────────────────────────────────

  _handleStreamStart(evt) {
    const { id, model, provider } = evt.detail || {};
    if (!id) return;

    const tab = new StreamTab(id, model, provider);
    this._tabs.set(id, tab);
    this._activeId = id;

    this._open();
    this._renderTabs();
    this._renderSidebar();
    this._renderOutput();
    this._renderToolbar();
    this._startTypewriter();
  }

  _handleStreamChunk(evt) {
    const { id, text } = evt.detail || {};
    if (!id || !text) return;
    const tab = this._tabs.get(id);
    if (!tab || tab.status !== 'streaming') return;

    tab.chunks.push(text);
    tab.outputTokens += Math.ceil(text.length / 4); // rough token estimate

    // If this tab is active, the typewriter will pick it up
    if (id === this._activeId) {
      this._updateTokenCounter();
    }
  }

  _handleStreamEnd(evt) {
    const { id, inputTokens, outputTokens, costUsd, latencyMs, error } = evt.detail || {};
    if (!id) return;
    const tab = this._tabs.get(id);
    if (!tab) return;

    tab.status = error ? 'error' : 'done';
    tab.endTime = Date.now();
    if (inputTokens != null) tab.inputTokens = inputTokens;
    if (outputTokens != null) tab.outputTokens = outputTokens;
    if (costUsd != null) tab.costUsd = costUsd;

    // Flush remaining text immediately
    if (id === this._activeId) {
      this._flushOutput(tab);
      this._renderSidebar();
      this._renderToolbar();
    }
    this._renderTabs();

    // Auto-collapse after delay unless pinned
    if (!tab.pinned) {
      tab.collapseTimer = setTimeout(() => {
        // Only collapse if this is still the only/active stream and all are done
        const allDone = [...this._tabs.values()].every(t => t.status !== 'streaming');
        const anyPinned = [...this._tabs.values()].some(t => t.pinned);
        if (allDone && !anyPinned) {
          this._close();
        }
      }, AUTO_COLLAPSE_MS);
    }
  }

  // ── Drawer open / close ────────────────────────────────────────────

  _open() {
    if (!this._root) return;
    this._root.classList.remove('task-stream--collapsing');
    // Force reflow before adding open class for animation
    void this._root.offsetHeight;
    this._root.classList.add('task-stream--open');
  }

  _close() {
    if (!this._root) return;
    this._root.classList.remove('task-stream--open');
    this._root.classList.add('task-stream--collapsing');
    // After animation, clean up finished tabs
    setTimeout(() => {
      if (!this._root) return;
      this._root.classList.remove('task-stream--collapsing');
      // Remove done/error tabs that aren't pinned
      for (const [id, tab] of this._tabs) {
        if (tab.status !== 'streaming' && !tab.pinned) {
          this._tabs.delete(id);
        }
      }
      if (this._tabs.size === 0) {
        this._activeId = null;
      }
    }, 400);
  }

  // ── Typewriter engine ──────────────────────────────────────────────

  _startTypewriter() {
    if (this._typewriterTimer) return;
    this._typewriterTimer = setInterval(() => this._typewriterTick(), TYPEWRITER_INTERVAL_MS);
  }

  _typewriterTick() {
    const tab = this._tabs.get(this._activeId);
    if (!tab) return;

    const full = tab.fullText;
    if (tab.displayedLen >= full.length) {
      // Nothing new to render
      if (tab.status !== 'streaming') {
        clearInterval(this._typewriterTimer);
        this._typewriterTimer = null;
      }
      return;
    }

    // Advance by a few chars per tick for speed
    const charsPerTick = Math.max(1, Math.floor((full.length - tab.displayedLen) / 8));
    const advance = Math.min(charsPerTick, 3);
    tab.displayedLen = Math.min(tab.displayedLen + advance, full.length);

    this._renderOutputContent(tab);
  }

  _flushOutput(tab) {
    tab.displayedLen = tab.fullText.length;
    this._renderOutputContent(tab);
  }

  _renderOutputContent(tab) {
    if (!this._els) return;
    const displayed = tab.fullText.slice(0, tab.displayedLen);
    let html = renderStreamedText(displayed);

    // Add cursor if still streaming
    if (tab.status === 'streaming') {
      html += '<span class="task-stream__cursor"></span>';
    }

    this._els.output.innerHTML = html;

    // Auto-scroll to bottom
    this._els.output.scrollTop = this._els.output.scrollHeight;
  }

  // ── Render: tabs ───────────────────────────────────────────────────

  _renderTabs() {
    if (!this._els) return;
    const container = this._els.tabs;
    container.innerHTML = '';

    for (const [id, tab] of this._tabs) {
      const btn = document.createElement('button');
      btn.className = 'task-stream__tab';
      if (id === this._activeId) btn.classList.add('task-stream__tab--active');

      // Status indicator
      const dot = document.createElement('span');
      dot.className = 'task-stream__tab-indicator';
      if (tab.status === 'streaming') dot.classList.add('task-stream__tab-indicator--streaming');
      else if (tab.status === 'done') dot.classList.add('task-stream__tab-indicator--done');
      else dot.classList.add('task-stream__tab-indicator--error');
      btn.appendChild(dot);

      // Label
      const label = document.createElement('span');
      label.textContent = tab.model;
      btn.appendChild(label);

      // Close button
      const close = document.createElement('button');
      close.className = 'task-stream__tab-close';
      close.textContent = '\u2715';
      close.title = 'Close tab';
      close.addEventListener('click', (e) => {
        e.stopPropagation();
        this._closeTab(id);
      });
      btn.appendChild(close);

      btn.addEventListener('click', () => this._switchTab(id));
      container.appendChild(btn);
    }
  }

  _switchTab(id) {
    if (!this._tabs.has(id)) return;
    this._activeId = id;
    this._renderTabs();
    this._renderSidebar();
    this._renderOutput();
    this._renderToolbar();
    this._startTypewriter();
  }

  _closeTab(id) {
    const tab = this._tabs.get(id);
    if (!tab) return;
    if (tab.collapseTimer) clearTimeout(tab.collapseTimer);
    this._tabs.delete(id);

    if (this._activeId === id) {
      const remaining = [...this._tabs.keys()];
      this._activeId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
    }

    if (this._tabs.size === 0) {
      this._close();
    } else {
      this._renderTabs();
      this._renderSidebar();
      this._renderOutput();
      this._renderToolbar();
    }
  }

  // ── Render: sidebar ────────────────────────────────────────────────

  _renderSidebar() {
    if (!this._els) return;
    const tab = this._tabs.get(this._activeId);
    if (!tab) {
      this._els.sidebar.innerHTML = '';
      return;
    }

    const providerKey = (tab.provider || 'default').toLowerCase();
    const abbrev = PROVIDER_ABBREV[providerKey] || '?';
    const iconClass = `task-stream__provider-icon--${providerKey in PROVIDER_ABBREV ? providerKey : 'default'}`;

    this._els.sidebar.innerHTML = `
      <div class="task-stream__stat">
        <span class="task-stream__stat-label">Provider</span>
        <span class="task-stream__stat-value">
          <span class="task-stream__provider-icon ${iconClass}">${esc(abbrev)}</span>
          ${esc(tab.provider)}
        </span>
      </div>
      <div class="task-stream__stat">
        <span class="task-stream__stat-label">Model</span>
        <span class="task-stream__stat-value task-stream__stat-value--model">${esc(tab.model)}</span>
      </div>
      <div class="task-stream__stat">
        <span class="task-stream__stat-label">Output Tokens</span>
        <span class="task-stream__stat-value task-stream__stat-value--tokens" data-role="token-count">
          ${fmtTokens(tab.outputTokens)}
        </span>
      </div>
      <div class="task-stream__stat">
        <span class="task-stream__stat-label">Input Tokens</span>
        <span class="task-stream__stat-value">${fmtTokens(tab.inputTokens)}</span>
      </div>
      <div class="task-stream__stat">
        <span class="task-stream__stat-label">Elapsed</span>
        <span class="task-stream__stat-value task-stream__stat-value--time" data-role="elapsed">
          ${fmtElapsed(tab.elapsedMs)}
        </span>
      </div>
      <div class="task-stream__stat">
        <span class="task-stream__stat-label">Est. Cost</span>
        <span class="task-stream__stat-value task-stream__stat-value--cost">${fmtCost(tab.costUsd)}</span>
      </div>
    `;
  }

  _updateTokenCounter() {
    if (!this._els) return;
    const el = this._els.sidebar.querySelector('[data-role="token-count"]');
    const tab = this._tabs.get(this._activeId);
    if (!el || !tab) return;

    el.textContent = fmtTokens(tab.outputTokens);
    el.classList.remove('ts-animating');
    void el.offsetHeight; // trigger reflow
    el.classList.add('ts-animating');
    setTimeout(() => el.classList.remove('ts-animating'), TOKEN_ANIM_MS);
  }

  _tickElapsed() {
    if (!this._els) return;
    const tab = this._tabs.get(this._activeId);
    if (!tab || tab.status !== 'streaming') return;
    const el = this._els.sidebar.querySelector('[data-role="elapsed"]');
    if (el) {
      el.textContent = fmtElapsed(tab.elapsedMs);
    }
  }

  // ── Render: output ─────────────────────────────────────────────────

  _renderOutput() {
    const tab = this._tabs.get(this._activeId);
    if (!tab) {
      if (this._els) this._els.output.innerHTML = '';
      return;
    }
    this._renderOutputContent(tab);
  }

  // ── Render: toolbar ────────────────────────────────────────────────

  _renderToolbar() {
    if (!this._els) return;
    const tab = this._tabs.get(this._activeId);
    const toolbar = this._els.toolbar;
    toolbar.innerHTML = '';

    if (!tab) return;

    // Status indicator
    const status = document.createElement('div');
    status.className = 'task-stream__status';

    if (tab.status === 'streaming') {
      const dot = document.createElement('span');
      dot.className = 'task-stream__status-dot task-stream__status-dot--streaming';
      status.appendChild(dot);
      const label = document.createElement('span');
      label.textContent = 'Streaming\u2026';
      status.appendChild(label);
    } else if (tab.status === 'done') {
      const check = document.createElement('span');
      check.className = 'task-stream__status-check';
      check.textContent = '\u2713';
      status.appendChild(check);
      const label = document.createElement('span');
      label.textContent = 'Complete';
      status.appendChild(label);
    } else {
      const dot = document.createElement('span');
      dot.className = 'task-stream__status-dot task-stream__status-dot--error';
      status.appendChild(dot);
      const label = document.createElement('span');
      label.textContent = 'Error';
      status.appendChild(label);
    }
    toolbar.appendChild(status);

    // Spacer
    const spacer = document.createElement('div');
    spacer.className = 'task-stream__spacer';
    toolbar.appendChild(spacer);

    // Stop button (only while streaming)
    if (tab.status === 'streaming') {
      const stopBtn = document.createElement('button');
      stopBtn.className = 'task-stream__btn task-stream__btn--stop';
      stopBtn.innerHTML = '\u25A0 Stop';
      stopBtn.title = 'Cancel this stream';
      stopBtn.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('task:cancel', { detail: { id: tab.id } }));
      });
      toolbar.appendChild(stopBtn);
    }

    // Copy button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'task-stream__btn task-stream__btn--copy';
    copyBtn.innerHTML = '\u2398 Copy';
    copyBtn.title = 'Copy response to clipboard';
    copyBtn.addEventListener('click', () => {
      const text = tab.fullText;
      navigator.clipboard.writeText(text).then(() => {
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = '\u2713 Copied';
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = '\u2398 Copy';
        }, 1500);
      }).catch(() => {
        // Fallback: select text
        const range = document.createRange();
        range.selectNodeContents(this._els.output);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      });
    });
    toolbar.appendChild(copyBtn);

    // Pin button
    const pinBtn = document.createElement('button');
    pinBtn.className = 'task-stream__btn task-stream__btn--pin';
    if (tab.pinned) pinBtn.classList.add('active');
    pinBtn.innerHTML = '\u{1F4CC} Pin';
    pinBtn.title = tab.pinned ? 'Unpin (auto-collapse when done)' : 'Pin drawer open';
    pinBtn.addEventListener('click', () => {
      tab.pinned = !tab.pinned;
      if (tab.pinned && tab.collapseTimer) {
        clearTimeout(tab.collapseTimer);
        tab.collapseTimer = null;
      }
      this._renderToolbar();
    });
    toolbar.appendChild(pinBtn);

    // Close / minimize button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'task-stream__btn';
    closeBtn.innerHTML = '\u2715 Close';
    closeBtn.title = 'Close drawer';
    closeBtn.addEventListener('click', () => this._close());
    toolbar.appendChild(closeBtn);
  }
}
