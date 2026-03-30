/**
 * code-editor.js — Custom in-app code editor component
 *
 * Textarea-based editor with overlay syntax highlighting, line numbers,
 * minimap, find bar, auto-indent, bracket auto-close, and status bar.
 *
 * No external dependencies — vanilla JS + CSS.
 *
 * Usage:
 *   const editor = new CodeEditor(containerEl, { language: 'javascript' });
 *   editor.setValue('const x = 1;');
 *   editor.onSave((code) => { ... });
 */

// ── Syntax highlighting tokens ──────────────────────────────────────

const JS_KEYWORDS = new Set([
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "from",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "of",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

/**
 * Tokenize a line of JavaScript into spans with CSS classes.
 * Returns an HTML string with syntax highlighting spans.
 * @param {string} line
 * @returns {string}
 */
function highlightJS(line) {
  // We process the line character by character with regex slices.
  // Order matters: comments > strings > regex > numbers > keywords > functions > operators > brackets
  const tokens = [];
  let i = 0;
  const len = line.length;

  while (i < len) {
    let match;
    const rest = line.slice(i);

    // Single-line comment
    if (rest.startsWith("//")) {
      tokens.push({ type: "comment", text: rest });
      i = len;
      continue;
    }

    // Multi-line comment start (we highlight to end of line or */)
    if (rest.startsWith("/*")) {
      const end = rest.indexOf("*/", 2);
      if (end !== -1) {
        const text = rest.slice(0, end + 2);
        tokens.push({ type: "comment", text });
        i += text.length;
      } else {
        tokens.push({ type: "comment", text: rest });
        i = len;
      }
      continue;
    }

    // Template literal (backtick string)
    if (rest[0] === "`") {
      let j = 1;
      while (j < rest.length) {
        if (rest[j] === "\\") {
          j += 2;
          continue;
        }
        if (rest[j] === "`") {
          j++;
          break;
        }
        j++;
      }
      tokens.push({ type: "string", text: rest.slice(0, j) });
      i += j;
      continue;
    }

    // Double-quoted string
    if (rest[0] === '"') {
      let j = 1;
      while (j < rest.length) {
        if (rest[j] === "\\") {
          j += 2;
          continue;
        }
        if (rest[j] === '"') {
          j++;
          break;
        }
        j++;
      }
      tokens.push({ type: "string", text: rest.slice(0, j) });
      i += j;
      continue;
    }

    // Single-quoted string
    if (rest[0] === "'") {
      let j = 1;
      while (j < rest.length) {
        if (rest[j] === "\\") {
          j += 2;
          continue;
        }
        if (rest[j] === "'") {
          j++;
          break;
        }
        j++;
      }
      tokens.push({ type: "string", text: rest.slice(0, j) });
      i += j;
      continue;
    }

    // Numbers (including hex, binary, decimals)
    match = rest.match(
      /^(0[xXbBoO][\da-fA-F_]+|\d[\d_]*\.?[\d_]*(?:[eE][+-]?\d+)?)/,
    );
    if (match) {
      tokens.push({ type: "number", text: match[0] });
      i += match[0].length;
      continue;
    }

    // Identifiers and keywords
    match = rest.match(/^[a-zA-Z_$][\w$]*/);
    if (match) {
      const word = match[0];
      if (JS_KEYWORDS.has(word)) {
        tokens.push({ type: "keyword", text: word });
      } else {
        // Check if followed by ( => function call
        const afterWord = line.slice(i + word.length);
        if (/^\s*\(/.test(afterWord)) {
          tokens.push({ type: "function", text: word });
        } else {
          tokens.push({ type: "plain", text: word });
        }
      }
      i += word.length;
      continue;
    }

    // Operators
    match = rest.match(
      /^(===|!==|==|!=|<=|>=|=>|&&|\|\||\.\.\.|\?\?|\?\.|\+\+|--|[+\-*/%=<>!&|^~?:])/,
    );
    if (match) {
      tokens.push({ type: "operator", text: match[0] });
      i += match[0].length;
      continue;
    }

    // Brackets
    if ("()[]{}".includes(rest[0])) {
      tokens.push({ type: "bracket", text: rest[0] });
      i++;
      continue;
    }

    // Whitespace and other characters
    match = rest.match(/^(\s+)/);
    if (match) {
      tokens.push({ type: "plain", text: match[0] });
      i += match[0].length;
      continue;
    }

    // Any other single character
    tokens.push({ type: "plain", text: rest[0] });
    i++;
  }

  // Build HTML
  return tokens
    .map((t) => {
      const escaped = escapeHTML(t.text);
      if (t.type === "plain") return escaped;
      return `<span class="ce-tok-${t.type}">${escaped}</span>`;
    })
    .join("");
}

/**
 * Escape HTML special characters.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Bracket pairs ───────────────────────────────────────────────────

const BRACKET_PAIRS = {
  "(": ")",
  "[": "]",
  "{": "}",
  '"': '"',
  "'": "'",
  "`": "`",
};

const CLOSE_BRACKETS = new Set([")", "]", "}"]);

// ── CodeEditor class ────────────────────────────────────────────────

export class CodeEditor {
  /**
   * @param {HTMLElement} container  The element to render into.
   * @param {object} [opts]
   * @param {string} [opts.language='javascript']  Language for syntax highlighting.
   * @param {string} [opts.placeholder='']  Placeholder text.
   * @param {string} [opts.value='']  Initial value.
   * @param {number} [opts.minHeight=200]  Minimum editor height in px.
   */
  constructor(container, opts = {}) {
    this._container = container;
    this._language = opts.language || "javascript";
    this._placeholder = opts.placeholder || "";
    this._minHeight = opts.minHeight || 200;
    this._saveCallbacks = [];
    this._findVisible = false;
    this._findMatches = [];
    this._findIndex = -1;
    this._currentLine = 0;
    this._cursorCol = 0;
    this._isResizing = false;

    this._build();
    this._bindEvents();

    if (opts.value) {
      this.setValue(opts.value);
    } else {
      this._updateHighlight();
      this._updateGutter();
      this._updateStatusBar();
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // DOM construction
  // ═══════════════════════════════════════════════════════════════════

  _build() {
    this._container.innerHTML = "";
    this._container.classList.add("code-editor");
    this._container.style.minHeight = `${this._minHeight}px`;

    // ── Find bar ──
    this._findBar = this._el("div", "ce-find-bar");

    this._findInput = this._el("input", "ce-find-bar__input");
    this._findInput.type = "text";
    this._findInput.placeholder = "Find...";
    this._findInput.setAttribute("aria-label", "Search in code");

    this._findCount = this._el("span", "ce-find-bar__count");
    this._findCount.textContent = "0/0";

    this._findPrevBtn = this._el("button", "ce-find-bar__btn");
    this._findPrevBtn.textContent = "\u2191";
    this._findPrevBtn.setAttribute("aria-label", "Previous match");

    this._findNextBtn = this._el("button", "ce-find-bar__btn");
    this._findNextBtn.textContent = "\u2193";
    this._findNextBtn.setAttribute("aria-label", "Next match");

    this._findCloseBtn = this._el("button", "ce-find-bar__close");
    this._findCloseBtn.textContent = "\u00d7";
    this._findCloseBtn.setAttribute("aria-label", "Close find bar");

    this._findBar.appendChild(this._findInput);
    this._findBar.appendChild(this._findCount);
    this._findBar.appendChild(this._findPrevBtn);
    this._findBar.appendChild(this._findNextBtn);
    this._findBar.appendChild(this._findCloseBtn);

    // ── Main area ──
    this._main = this._el("div", "ce-main");

    // Gutter
    this._gutter = this._el("div", "ce-gutter");
    this._gutterInner = this._el("div", "ce-gutter__inner");
    this._gutter.appendChild(this._gutterInner);

    // Editor area
    this._editorArea = this._el("div", "ce-editor-area");
    this._scrollContainer = this._el("div", "ce-scroll-container");

    // Current line highlight
    this._currentLineEl = this._el(
      "div",
      "ce-current-line ce-current-line--animated",
    );
    this._currentLineEl.style.top = "10px";

    // Highlight overlay
    this._highlight = this._el("pre", "ce-highlight");
    this._highlightCode = this._el("code", "");
    this._highlight.appendChild(this._highlightCode);

    // Textarea
    this._textarea = this._el("textarea", "ce-textarea");
    this._textarea.setAttribute("spellcheck", "false");
    this._textarea.setAttribute("autocomplete", "off");
    this._textarea.setAttribute("autocorrect", "off");
    this._textarea.setAttribute("autocapitalize", "off");
    this._textarea.setAttribute("aria-label", "Code editor");
    if (this._placeholder) {
      this._textarea.placeholder = this._placeholder;
    }

    this._scrollContainer.appendChild(this._currentLineEl);
    this._scrollContainer.appendChild(this._highlight);
    this._scrollContainer.appendChild(this._textarea);
    this._editorArea.appendChild(this._scrollContainer);

    // Minimap
    this._minimap = this._el("div", "ce-minimap");
    this._minimapCanvas = document.createElement("canvas");
    this._minimapCtx = this._minimapCanvas.getContext("2d");
    this._minimapViewport = this._el("div", "ce-minimap__viewport");
    this._minimap.appendChild(this._minimapCanvas);
    this._minimap.appendChild(this._minimapViewport);

    this._main.appendChild(this._gutter);
    this._main.appendChild(this._editorArea);
    this._main.appendChild(this._minimap);

    // ── Status bar ──
    this._statusBar = this._el("div", "ce-status-bar");
    this._statusLeft = this._el("div", "ce-status-bar__left");
    this._statusRight = this._el("div", "ce-status-bar__right");

    this._statusLang = this._el(
      "span",
      "ce-status-bar__item ce-status-bar__item--lang",
    );
    this._statusLang.textContent = this._language;
    this._statusLines = this._el("span", "ce-status-bar__item");
    this._statusChars = this._el("span", "ce-status-bar__item");
    this._statusCursor = this._el("span", "ce-status-bar__item");

    this._statusLeft.appendChild(this._statusLang);
    this._statusLeft.appendChild(this._statusLines);
    this._statusLeft.appendChild(this._statusChars);
    this._statusRight.appendChild(this._statusCursor);
    this._statusBar.appendChild(this._statusLeft);
    this._statusBar.appendChild(this._statusRight);

    // ── Resize handle ──
    this._resizeHandle = this._el("div", "ce-resize-handle");

    // ── Assemble ──
    this._container.appendChild(this._findBar);
    this._container.appendChild(this._main);
    this._container.appendChild(this._statusBar);
    this._container.appendChild(this._resizeHandle);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Event binding
  // ═══════════════════════════════════════════════════════════════════

  _bindEvents() {
    // ── Textarea input ──
    this._textarea.addEventListener("input", () => {
      this._updateHighlight();
      this._updateGutter();
      this._updateStatusBar();
      this._updateMinimap();
      this._syncFindHighlights();
    });

    // ── Scroll sync ──
    this._scrollContainer.addEventListener("scroll", () => {
      this._gutter.scrollTop = this._scrollContainer.scrollTop;
      this._updateMinimapViewport();
    });

    // ── Cursor / selection tracking ──
    this._textarea.addEventListener("keyup", () => this._onCursorMove());
    this._textarea.addEventListener("click", () => this._onCursorMove());
    this._textarea.addEventListener("select", () => this._onCursorMove());

    // ── Key handling ──
    this._textarea.addEventListener("keydown", (e) => this._onKeyDown(e));

    // ── Find bar ──
    this._findInput.addEventListener("input", () => this._onFindInput());
    this._findNextBtn.addEventListener("click", () => this._findNext());
    this._findPrevBtn.addEventListener("click", () => this._findPrev());
    this._findCloseBtn.addEventListener("click", () => this._closeFindBar());

    this._findInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (e.shiftKey) this._findPrev();
        else this._findNext();
      }
      if (e.key === "Escape") {
        this._closeFindBar();
      }
    });

    // ── Minimap click ──
    this._minimap.addEventListener("mousedown", (e) => this._onMinimapClick(e));

    // ── Resize handle ──
    this._resizeHandle.addEventListener("mousedown", (e) =>
      this._onResizeStart(e),
    );

    // ── Global keydown (for Cmd+S, Cmd+F) ──
    this._globalKeyHandler = (e) => {
      if (!this._container.contains(document.activeElement)) return;

      const mod = e.metaKey || e.ctrlKey;

      // Cmd+S — save
      if (mod && e.key === "s") {
        e.preventDefault();
        this._emitSave();
      }

      // Cmd+F — find
      if (mod && e.key === "f") {
        e.preventDefault();
        this._openFindBar();
      }
    };
    document.addEventListener("keydown", this._globalKeyHandler);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Key handling
  // ═══════════════════════════════════════════════════════════════════

  _onKeyDown(e) {
    // Tab key — insert 2 spaces
    if (e.key === "Tab") {
      e.preventDefault();
      const start = this._textarea.selectionStart;
      const end = this._textarea.selectionEnd;
      const val = this._textarea.value;

      if (e.shiftKey) {
        // Outdent: remove up to 2 leading spaces from current line
        const lineStart = val.lastIndexOf("\n", start - 1) + 1;
        const lineText = val.slice(lineStart, end);
        const stripped = lineText.replace(/^ {1,2}/, "");
        const removed = lineText.length - stripped.length;
        this._textarea.value =
          val.slice(0, lineStart) + stripped + val.slice(end);
        this._textarea.selectionStart = Math.max(lineStart, start - removed);
        this._textarea.selectionEnd = Math.max(lineStart, start - removed);
      } else {
        this._textarea.value = val.slice(0, start) + "  " + val.slice(end);
        this._textarea.selectionStart = start + 2;
        this._textarea.selectionEnd = start + 2;
      }

      this._textarea.dispatchEvent(new Event("input"));
      return;
    }

    // Enter — auto-indent
    if (e.key === "Enter") {
      e.preventDefault();
      const start = this._textarea.selectionStart;
      const val = this._textarea.value;

      // Find indentation of current line
      const lineStart = val.lastIndexOf("\n", start - 1) + 1;
      const lineText = val.slice(lineStart, start);
      const indent = lineText.match(/^(\s*)/)[1];

      // Check if previous non-whitespace char is an opening bracket
      const charBefore = val.slice(0, start).trimEnd().slice(-1);
      let extra = "";
      if (charBefore === "{" || charBefore === "(" || charBefore === "[") {
        extra = "  ";
      }

      const insertion = "\n" + indent + extra;
      this._textarea.value = val.slice(0, start) + insertion + val.slice(start);
      this._textarea.selectionStart = start + insertion.length;
      this._textarea.selectionEnd = start + insertion.length;

      this._textarea.dispatchEvent(new Event("input"));
      return;
    }

    // Bracket auto-close
    if (BRACKET_PAIRS[e.key] && !e.metaKey && !e.ctrlKey) {
      const start = this._textarea.selectionStart;
      const end = this._textarea.selectionEnd;
      const val = this._textarea.value;
      const closing = BRACKET_PAIRS[e.key];

      // For quotes, only auto-close if there's no selection and we aren't inside a word
      if (e.key === '"' || e.key === "'" || e.key === "`") {
        const charBefore = val[start - 1] || "";
        const charAfter = val[end] || "";
        // Skip if closing the same quote
        if (charAfter === e.key) {
          e.preventDefault();
          this._textarea.selectionStart = end + 1;
          this._textarea.selectionEnd = end + 1;
          return;
        }
        // Don't auto-close after alphanumeric (likely inside a word)
        if (/\w/.test(charBefore)) return;
      }

      // Skip over closing bracket if it matches
      if (CLOSE_BRACKETS.has(e.key)) {
        const charAfter = val[start] || "";
        if (charAfter === e.key) {
          e.preventDefault();
          this._textarea.selectionStart = start + 1;
          this._textarea.selectionEnd = start + 1;
          return;
        }
      }

      // Wrap selection or auto-close
      if (start !== end) {
        // Wrap selection
        e.preventDefault();
        const selected = val.slice(start, end);
        this._textarea.value =
          val.slice(0, start) + e.key + selected + closing + val.slice(end);
        this._textarea.selectionStart = start + 1;
        this._textarea.selectionEnd = end + 1;
        this._textarea.dispatchEvent(new Event("input"));
      } else {
        // Auto-close
        e.preventDefault();
        this._textarea.value =
          val.slice(0, start) + e.key + closing + val.slice(end);
        this._textarea.selectionStart = start + 1;
        this._textarea.selectionEnd = start + 1;
        this._textarea.dispatchEvent(new Event("input"));
      }
      return;
    }

    // Skip over closing brackets
    if (CLOSE_BRACKETS.has(e.key) && !e.metaKey && !e.ctrlKey) {
      const start = this._textarea.selectionStart;
      const val = this._textarea.value;
      if (val[start] === e.key) {
        e.preventDefault();
        this._textarea.selectionStart = start + 1;
        this._textarea.selectionEnd = start + 1;
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Syntax highlighting
  // ═══════════════════════════════════════════════════════════════════

  _updateHighlight() {
    const code = this._textarea.value;
    const lines = code.split("\n");
    let html;

    if (this._language === "javascript") {
      html = lines.map((line) => highlightJS(line)).join("\n");
    } else {
      // Fallback: plain escaped text
      html = escapeHTML(code);
    }

    this._highlightCode.innerHTML = html;

    // Size the highlight and textarea to match content
    this._syncSizes();
  }

  _syncSizes() {
    // Ensure the pre and textarea expand to fit content.
    // We measure the scroll dimensions and apply them as min dimensions.
    requestAnimationFrame(() => {
      const sh = this._textarea.scrollHeight;
      const sw = this._textarea.scrollWidth;
      this._highlight.style.minHeight = `${sh}px`;
      this._highlight.style.minWidth = `${sw}px`;
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // Line numbers
  // ═══════════════════════════════════════════════════════════════════

  _updateGutter() {
    const lineCount = this._textarea.value.split("\n").length;
    const lines = [];
    for (let i = 1; i <= lineCount; i++) {
      const cls = i === this._currentLine + 1 ? " ce-gutter__line--active" : "";
      lines.push(`<span class="ce-gutter__line${cls}">${i}</span>`);
    }
    this._gutterInner.innerHTML = lines.join("\n");
  }

  // ═══════════════════════════════════════════════════════════════════
  // Cursor position tracking
  // ═══════════════════════════════════════════════════════════════════

  _onCursorMove() {
    const val = this._textarea.value;
    const pos = this._textarea.selectionStart;
    const textBefore = val.slice(0, pos);
    const lines = textBefore.split("\n");
    this._currentLine = lines.length - 1;
    this._cursorCol = lines[lines.length - 1].length;

    // Update current line highlight
    this._currentLineEl.style.top = `${10 + this._currentLine * 20}px`;

    // Update gutter active line
    this._updateGutter();
    this._updateStatusBar();
  }

  // ═══════════════════════════════════════════════════════════════════
  // Status bar
  // ═══════════════════════════════════════════════════════════════════

  _updateStatusBar() {
    const val = this._textarea.value;
    const lineCount = val.split("\n").length;
    const charCount = val.length;

    this._statusLines.textContent = `${lineCount} line${lineCount !== 1 ? "s" : ""}`;
    this._statusChars.textContent = `${charCount} char${charCount !== 1 ? "s" : ""}`;
    this._statusCursor.textContent = `Ln ${this._currentLine + 1}:Col ${this._cursorCol + 1}`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Find bar
  // ═══════════════════════════════════════════════════════════════════

  _openFindBar() {
    this._findVisible = true;
    this._findBar.classList.add("ce-find-bar--visible");
    this._findInput.focus();
    this._findInput.select();
    this._onFindInput();
  }

  _closeFindBar() {
    this._findVisible = false;
    this._findBar.classList.remove("ce-find-bar--visible");
    this._findMatches = [];
    this._findIndex = -1;
    this._findCount.textContent = "0/0";
    this._textarea.focus();
    // Re-render highlight without match markers
    this._updateHighlight();
  }

  _onFindInput() {
    const query = this._findInput.value;
    if (!query) {
      this._findMatches = [];
      this._findIndex = -1;
      this._findCount.textContent = "0/0";
      this._updateHighlight();
      return;
    }

    // Find all matches
    const code = this._textarea.value;
    this._findMatches = [];
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "gi");
    let m;
    while ((m = re.exec(code)) !== null) {
      this._findMatches.push({ start: m.index, end: m.index + m[0].length });
    }

    if (this._findMatches.length > 0) {
      // Find the closest match to cursor
      const cursorPos = this._textarea.selectionStart;
      this._findIndex = 0;
      for (let i = 0; i < this._findMatches.length; i++) {
        if (this._findMatches[i].start >= cursorPos) {
          this._findIndex = i;
          break;
        }
      }
    } else {
      this._findIndex = -1;
    }

    this._updateFindCount();
    this._syncFindHighlights();
  }

  _findNext() {
    if (this._findMatches.length === 0) return;
    this._findIndex = (this._findIndex + 1) % this._findMatches.length;
    this._updateFindCount();
    this._scrollToMatch();
    this._syncFindHighlights();
  }

  _findPrev() {
    if (this._findMatches.length === 0) return;
    this._findIndex =
      (this._findIndex - 1 + this._findMatches.length) %
      this._findMatches.length;
    this._updateFindCount();
    this._scrollToMatch();
    this._syncFindHighlights();
  }

  _updateFindCount() {
    const total = this._findMatches.length;
    const current = total > 0 ? this._findIndex + 1 : 0;
    this._findCount.textContent = `${current}/${total}`;
  }

  _scrollToMatch() {
    if (this._findIndex < 0 || this._findIndex >= this._findMatches.length)
      return;
    const match = this._findMatches[this._findIndex];
    this._textarea.selectionStart = match.start;
    this._textarea.selectionEnd = match.end;
    this._textarea.focus();

    // Scroll to the match line
    const textBefore = this._textarea.value.slice(0, match.start);
    const lineNum = textBefore.split("\n").length - 1;
    const scrollTarget = lineNum * 20 - this._scrollContainer.clientHeight / 2;
    this._scrollContainer.scrollTop = Math.max(0, scrollTarget);
  }

  /**
   * Re-render the syntax highlight with find match markers overlaid.
   * Instead of modifying the syntax highlight HTML (complex), we overlay
   * match highlights using absolute-positioned elements.
   */
  _syncFindHighlights() {
    // Remove existing match markers
    this._scrollContainer
      .querySelectorAll(".ce-match-overlay")
      .forEach((el) => el.remove());

    if (!this._findVisible || this._findMatches.length === 0) return;

    const code = this._textarea.value;
    const lines = code.split("\n");

    for (let idx = 0; idx < this._findMatches.length; idx++) {
      const match = this._findMatches[idx];
      const textBefore = code.slice(0, match.start);
      const lineNum = textBefore.split("\n").length - 1;
      const lineStart = textBefore.lastIndexOf("\n") + 1;
      const colStart = match.start - lineStart;
      const matchLen = match.end - match.start;

      const marker = this._el("div", "ce-match-overlay");
      marker.classList.add(
        idx === this._findIndex ? "ce-match--active" : "ce-match",
      );
      // Position: each line is 20px, padding top 10px, approx 7.8px per char
      marker.style.position = "absolute";
      marker.style.top = `${10 + lineNum * 20}px`;
      marker.style.left = `${12 + colStart * 7.8}px`;
      marker.style.width = `${matchLen * 7.8}px`;
      marker.style.height = "20px";
      marker.style.pointerEvents = "none";
      marker.style.zIndex = "0";
      this._scrollContainer.appendChild(marker);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Minimap
  // ═══════════════════════════════════════════════════════════════════

  _updateMinimap() {
    const code = this._textarea.value;
    const lines = code.split("\n");
    const canvas = this._minimapCanvas;
    const ctx = this._minimapCtx;
    const width = this._minimap.clientWidth || 60;
    const lineHeight = 2;
    const canvasHeight = Math.max(lines.length * lineHeight, 40);

    canvas.width = width;
    canvas.height = canvasHeight;

    ctx.clearRect(0, 0, width, canvasHeight);

    // Draw each line as a thin colored bar
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.replace(/^\s+/, "");
      if (!trimmed) continue;

      const indent = line.length - trimmed.length;
      const x = Math.min(indent * 1.5, width * 0.3);
      const w = Math.min(trimmed.length * 0.8, width - x - 2);

      // Color based on content
      let color = "rgba(232, 232, 240, 0.25)";
      if (/^\s*(\/\/|\/\*|\*)/.test(line)) color = "rgba(85, 85, 112, 0.3)";
      else if (/^\s*(function|class|const|let|var|export|import)/.test(line))
        color = "rgba(74, 158, 255, 0.35)";
      else if (/['"`]/.test(trimmed)) color = "rgba(74, 255, 138, 0.25)";

      ctx.fillStyle = color;
      ctx.fillRect(x, i * lineHeight, w, lineHeight - 0.5);
    }

    this._updateMinimapViewport();
  }

  _updateMinimapViewport() {
    const scrollEl = this._scrollContainer;
    const totalHeight = this._textarea.scrollHeight || 1;
    const visibleHeight = scrollEl.clientHeight;
    const scrollTop = scrollEl.scrollTop;
    const canvasHeight = this._minimapCanvas.height;

    const vpTop = (scrollTop / totalHeight) * canvasHeight;
    const vpHeight = Math.max((visibleHeight / totalHeight) * canvasHeight, 8);

    this._minimapViewport.style.top = `${vpTop}px`;
    this._minimapViewport.style.height = `${vpHeight}px`;
  }

  _onMinimapClick(e) {
    const rect = this._minimap.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const canvasHeight = this._minimapCanvas.height || 1;
    const ratio = y / canvasHeight;
    const totalHeight = this._textarea.scrollHeight;
    this._scrollContainer.scrollTop =
      ratio * totalHeight - this._scrollContainer.clientHeight / 2;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Resize
  // ═══════════════════════════════════════════════════════════════════

  _onResizeStart(e) {
    e.preventDefault();
    this._isResizing = true;
    const startY = e.clientY;
    const startHeight = this._container.offsetHeight;

    const onMove = (ev) => {
      if (!this._isResizing) return;
      const delta = ev.clientY - startY;
      const newHeight = Math.max(this._minHeight, startHeight + delta);
      this._container.style.height = `${newHeight}px`;
    };

    const onUp = () => {
      this._isResizing = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      this._updateMinimap();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ═══════════════════════════════════════════════════════════════════
  // Save event
  // ═══════════════════════════════════════════════════════════════════

  _emitSave() {
    const code = this._textarea.value;
    document.dispatchEvent(
      new CustomEvent("editor:save", {
        detail: { code },
        bubbles: true,
      }),
    );
    for (const cb of this._saveCallbacks) {
      cb(code);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Public API
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Set the editor content.
   * @param {string} code
   */
  setValue(code) {
    this._textarea.value = code;
    this._updateHighlight();
    this._updateGutter();
    this._updateStatusBar();
    this._updateMinimap();
    this._onCursorMove();
  }

  /**
   * Get the current editor content.
   * @returns {string}
   */
  getValue() {
    return this._textarea.value;
  }

  /**
   * Set the language for syntax highlighting.
   * @param {string} lang
   */
  setLanguage(lang) {
    this._language = lang;
    this._statusLang.textContent = lang;
    this._updateHighlight();
  }

  /**
   * Register a callback for save events.
   * @param {function} callback  Receives the code string.
   */
  onSave(callback) {
    this._saveCallbacks.push(callback);
  }

  /**
   * Tear down the editor and clean up event listeners.
   */
  destroy() {
    document.removeEventListener("keydown", this._globalKeyHandler);
    this._container.innerHTML = "";
    this._container.classList.remove("code-editor");
    this._container.style.height = "";
    this._container.style.minHeight = "";
    this._saveCallbacks = [];
  }

  // ═══════════════════════════════════════════════════════════════════
  // Helpers
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create an element with class name(s).
   * @param {string} tag
   * @param {string} className
   * @returns {HTMLElement}
   */
  _el(tag, className) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    return el;
  }
}
