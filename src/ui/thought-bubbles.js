/**
 * thought-bubbles.js — DOM overlay for ambient agent thought bubbles
 *
 * Renders charming speech balloons above agent positions on the isometric
 * canvas.  Bubbles appear automatically on a per-agent rotation, and
 * immediately in response to 'dispatch:task-complete' events.
 *
 * Usage:
 *   import { ThoughtBubbles } from './thought-bubbles.js';
 *   const bubbles = new ThoughtBubbles(canvasEl, personalityEngine);
 *   // Register agents after they are added to AgentManager:
 *   bubbles.trackAgent('agent-1', agentRef, 'commander');
 *   // In render loop:
 *   bubbles.update(dt);
 */

// ─────────────────────────────────────────────────────────────────────────────
//  Config
// ─────────────────────────────────────────────────────────────────────────────

const MAX_VISIBLE_BUBBLES   = 3;
const BUBBLE_DISPLAY_TIME   = { min: 4000, max: 6000 }; // ms
const FADE_DURATION_MS      = 300;
const TYPING_SPEED_MS       = 28;    // ms per character
const IDLE_BUBBLE_INTERVAL  = 20000; // ms between ambient bubbles per agent
const TASK_BUBBLE_PRIORITY  = true;  // task-done bubbles always show, displacing oldest

// Vertical offset above the sprite in screen px
const BUBBLE_OFFSET_Y = -64;

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

/**
 * Convert tile coordinates to canvas-relative screen coordinates using the
 * same formula as the renderer's tileToScreen().  We duplicate the math here
 * to avoid a hard import of the renderer module.
 *
 * Defaults match the constants in renderer/constants.js (TILE_WIDTH 64,
 * TILE_HEIGHT 32).  If your project uses different values, override via
 * ThoughtBubbles.setTileConstants(tileW, tileH).
 */
let _tileW = 64;
let _tileH = 32;

function tileToScreenLocal(tileX, tileY) {
  return {
    x: ((tileX - tileY) * _tileW) / 2,
    y: ((tileX + tileY) * _tileH) / 2,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  BubbleInstance  — one live DOM bubble
// ─────────────────────────────────────────────────────────────────────────────

class BubbleInstance {
  /**
   * @param {HTMLElement}   el        — the bubble DOM element
   * @param {string}        agentId
   * @param {number}        displayMs — how long to stay visible (ms)
   * @param {'task'|'idle'} kind
   */
  constructor(el, agentId, displayMs, kind = 'idle') {
    this.el       = el;
    this.agentId  = agentId;
    this.kind     = kind;
    this.phase    = 'in';       // 'in' | 'visible' | 'out' | 'dead'

    // Timers (all in ms)
    this._fadeInMs    = FADE_DURATION_MS;
    this._visibleMs   = displayMs;
    this._fadeOutMs   = FADE_DURATION_MS;
    this._elapsed     = 0;
  }

  get isDead() { return this.phase === 'dead'; }

  /**
   * Advance internal timers, updating element opacity.
   * @param {number} dtMs  delta time in milliseconds
   */
  tick(dtMs) {
    this._elapsed += dtMs;

    switch (this.phase) {
      case 'in': {
        const t = Math.min(this._elapsed / this._fadeInMs, 1);
        this.el.style.opacity = t;
        this.el.style.transform = `scale(${0.8 + 0.2 * t}) translateY(${(1 - t) * 8}px)`;
        if (t >= 1) {
          this.phase    = 'visible';
          this._elapsed = 0;
        }
        break;
      }
      case 'visible': {
        if (this._elapsed >= this._visibleMs) {
          this.phase    = 'out';
          this._elapsed = 0;
        }
        break;
      }
      case 'out': {
        const t = Math.min(this._elapsed / this._fadeOutMs, 1);
        this.el.style.opacity   = 1 - t;
        this.el.style.transform = `scale(1) translateY(${-t * 12}px)`;
        if (t >= 1) {
          this.phase = 'dead';
        }
        break;
      }
    }
  }

  /** Immediately begin fading out. */
  dismiss() {
    if (this.phase !== 'out' && this.phase !== 'dead') {
      this.phase    = 'out';
      this._elapsed = 0;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  TypingEffect — appends chars one at a time to a DOM element
// ─────────────────────────────────────────────────────────────────────────────

class TypingEffect {
  /**
   * @param {HTMLElement} textEl   — element that will receive the typed text
   * @param {HTMLElement} cursorEl — the blinking cursor element
   * @param {string}      text     — full string to type
   */
  constructor(textEl, cursorEl, text) {
    this._textEl    = textEl;
    this._cursorEl  = cursorEl;
    this._chars     = [...text];
    this._index     = 0;
    this._accMs     = 0;
    this.done       = false;
  }

  tick(dtMs) {
    if (this.done) return;

    this._accMs += dtMs;
    while (this._accMs >= TYPING_SPEED_MS && this._index < this._chars.length) {
      this._accMs -= TYPING_SPEED_MS;
      this._textEl.textContent += this._chars[this._index++];
    }

    if (this._index >= this._chars.length) {
      this.done = true;
      // Hide cursor after typing finishes (with a small delay)
      setTimeout(() => {
        if (this._cursorEl) this._cursorEl.style.display = 'none';
      }, 800);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ThoughtBubbles
// ─────────────────────────────────────────────────────────────────────────────

export class ThoughtBubbles {
  /**
   * @param {HTMLCanvasElement} canvasEl          — the PixiJS canvas
   * @param {import('../systems/agent-personalities.js').PersonalityEngine} personalities
   */
  constructor(canvasEl, personalities) {
    this._canvas  = canvasEl;
    this._engine  = personalities;

    /**
     * agentId → { agent: AgentRef, idleTimer: number, lastBubbleTime: number }
     * AgentRef: object with `.tileX`, `.tileY`, `.container.position` etc.
     */
    this._tracked = new Map();

    /** Currently live bubble instances */
    this._bubbles = [];

    /** agentId → TypingEffect (one active typer per agent) */
    this._typers  = new Map();

    // Root overlay container
    this._container = document.createElement('div');
    this._container.className = 'thought-bubbles';
    document.body.appendChild(this._container);

    this._bindEvents();
  }

  // ── Static tile constant override ─────────────────────────────────────────

  /**
   * Override tile dimensions if they differ from defaults (64×32).
   * @param {number} tileW
   * @param {number} tileH
   */
  setTileConstants(tileW, tileH) {
    _tileW = tileW;
    _tileH = tileH;
  }

  // ── Agent registration ────────────────────────────────────────────────────

  /**
   * Begin tracking an agent so thought bubbles will appear above it.
   *
   * @param {string}  agentId         — must already be registered with PersonalityEngine
   * @param {object}  agentRef        — live Agent object (has .tileX, .tileY)
   * @param {string}  [personalityKey]
   */
  trackAgent(agentId, agentRef, personalityKey) {
    if (!this._engine.getPersonality(agentId)) {
      this._engine.registerAgent(agentId, personalityKey);
    }

    this._tracked.set(agentId, {
      agent:         agentRef,
      idleTimer:     randRange(0, IDLE_BUBBLE_INTERVAL),  // stagger starts
      lastBubbleTime: 0,
    });
  }

  /** Stop tracking an agent (removes any active bubble for it too). */
  untrackAgent(agentId) {
    this._tracked.delete(agentId);
    this._dismissBubblesForAgent(agentId);
  }

  // ── Main update loop ──────────────────────────────────────────────────────

  /**
   * Call once per frame from the render loop.
   * @param {number} dt  delta time in **seconds**
   */
  update(dt) {
    const dtMs = dt * 1000;

    // Advance personality engine (mood timers, thought rotation)
    this._engine.update(dt);

    // Advance idle timers for tracked agents
    for (const [agentId, info] of this._tracked) {
      info.idleTimer -= dtMs;
      if (info.idleTimer <= 0) {
        this._maybeShowIdleBubble(agentId, info);
        info.idleTimer = IDLE_BUBBLE_INTERVAL + randRange(-3000, 3000);
      }
    }

    // Tick active bubbles and advance typers
    for (const bubble of this._bubbles) {
      if (bubble.isDead) continue;
      bubble.tick(dtMs);

      const typer = this._typers.get(bubble.agentId);
      if (typer && !typer.done) {
        typer.tick(dtMs);
      }
    }

    // Purge dead bubbles
    this._purgeDeadBubbles();

    // Reposition all bubbles to follow their agents
    this._syncPositions();
  }

  // ── Bubble creation ───────────────────────────────────────────────────────

  /**
   * Show a thought bubble for an agent with arbitrary text.
   * Displaces the oldest bubble if MAX_VISIBLE_BUBBLES is exceeded.
   *
   * @param {string}          agentId
   * @param {string}          text
   * @param {'task'|'idle'}   [kind='idle']
   */
  showBubble(agentId, text, kind = 'idle') {
    const personality = this._engine.getPersonality(agentId);
    const info        = this._tracked.get(agentId);
    if (!personality || !info) return;

    // Enforce maximum concurrent bubbles
    const visible = this._bubbles.filter(b => !b.isDead);
    if (visible.length >= MAX_VISIBLE_BUBBLES) {
      if (kind === 'task' && TASK_BUBBLE_PRIORITY) {
        // Dismiss the oldest idle bubble to make room
        const oldest = visible.find(b => b.kind === 'idle') || visible[0];
        if (oldest) oldest.dismiss();
      } else if (kind !== 'task') {
        // Don't add another idle bubble when at capacity
        return;
      }
    }

    const mood  = this._engine.getMood(agentId);
    const color = personality.color;
    const emoji = personality.emoji;

    const el = this._buildBubbleElement(emoji, text, color, mood, agentId);
    this._container.appendChild(el);

    const displayMs = randRange(BUBBLE_DISPLAY_TIME.min, BUBBLE_DISPLAY_TIME.max);
    const instance  = new BubbleInstance(el, agentId, displayMs, kind);
    this._bubbles.push(instance);

    // Set up typing effect
    const textEl   = el.querySelector('.tb-text');
    const cursorEl = el.querySelector('.tb-cursor');
    if (textEl && cursorEl) {
      textEl.textContent = '';
      const typer = new TypingEffect(textEl, cursorEl, text);
      this._typers.set(agentId, typer);
    }

    // Initial position
    this._positionBubble(instance, info.agent);
  }

  // ── DOM builder ───────────────────────────────────────────────────────────

  /**
   * Build and return a fully-structured bubble DOM element.
   * @private
   */
  _buildBubbleElement(emoji, text, color, mood, agentId) {
    const wrap = document.createElement('div');
    wrap.className = `thought-bubble thought-bubble--${mood}`;
    wrap.dataset.agentId = agentId;
    wrap.style.setProperty('--agent-color', color);

    // Tail
    const tail = document.createElement('div');
    tail.className = 'tb-tail';
    wrap.appendChild(tail);

    // Inner content
    const inner = document.createElement('div');
    inner.className = 'tb-inner';

    // Emoji avatar
    const avatar = document.createElement('span');
    avatar.className = 'tb-avatar';
    avatar.textContent = emoji;
    inner.appendChild(avatar);

    // Text area
    const textWrap = document.createElement('span');
    textWrap.className = 'tb-text-wrap';

    const textEl = document.createElement('span');
    textEl.className = 'tb-text';
    textWrap.appendChild(textEl);

    const cursor = document.createElement('span');
    cursor.className = 'tb-cursor';
    cursor.textContent = '|';
    textWrap.appendChild(cursor);

    inner.appendChild(textWrap);
    wrap.appendChild(inner);

    return wrap;
  }

  // ── Positioning ───────────────────────────────────────────────────────────

  /**
   * Position a bubble element above the agent's canvas location.
   * @private
   */
  _positionBubble(bubbleInstance, agentRef) {
    if (!agentRef || bubbleInstance.isDead) return;

    const canvas = this._canvas;
    if (!canvas) return;

    const canvasRect = canvas.getBoundingClientRect();

    // Get the pixi container's world position (already in screen px relative to canvas)
    let screenX, screenY;

    if (agentRef.container && agentRef.container.position) {
      // Use PixiJS container position directly (it's the canvas-space pixel pos)
      screenX = canvasRect.left + agentRef.container.position.x;
      screenY = canvasRect.top  + agentRef.container.position.y + BUBBLE_OFFSET_Y;
    } else {
      // Fallback: compute from tile coords
      const s = tileToScreenLocal(agentRef.tileX || 0, agentRef.tileY || 0);
      screenX = canvasRect.left + s.x;
      screenY = canvasRect.top  + s.y + BUBBLE_OFFSET_Y;
    }

    const el = bubbleInstance.el;
    // Center the bubble horizontally over the agent
    const halfW = (el.offsetWidth || 180) / 2;
    el.style.left = `${screenX - halfW}px`;
    el.style.top  = `${screenY}px`;
  }

  _syncPositions() {
    for (const bubble of this._bubbles) {
      if (bubble.isDead) continue;
      const info = this._tracked.get(bubble.agentId);
      if (info) {
        this._positionBubble(bubble, info.agent);
      }
    }
  }

  // ── Idle bubble scheduling ────────────────────────────────────────────────

  /**
   * @private
   */
  _maybeShowIdleBubble(agentId, info) {
    // Don't flood; ensure agent is still tracked
    if (!this._tracked.has(agentId)) return;

    // Rotate to a new thought and show it
    const thought = this._engine.rotateThought(agentId);
    if (thought) {
      this.showBubble(agentId, thought, 'idle');
    }
  }

  // ── Event listeners ───────────────────────────────────────────────────────

  _bindEvents() {
    if (typeof window === 'undefined') return;

    window.addEventListener('dispatch:task-complete', (e) => {
      const { agentId } = e.detail || {};
      if (!agentId || !this._tracked.has(agentId)) return;

      const msg = this._engine.getMessage(agentId, 'task_done');
      if (msg) this.showBubble(agentId, msg, 'task');
    });

    window.addEventListener('dispatch:task-failed', (e) => {
      const { agentId } = e.detail || {};
      if (!agentId || !this._tracked.has(agentId)) return;

      const msg = this._engine.getMessage(agentId, 'task_error');
      if (msg) this.showBubble(agentId, msg, 'task');
    });

    window.addEventListener('dispatch:task-assigned', (e) => {
      const { agentId } = e.detail || {};
      if (!agentId || !this._tracked.has(agentId)) return;

      const msg = this._engine.getMessage(agentId, 'task_start');
      if (msg) this.showBubble(agentId, msg, 'task');
    });

    window.addEventListener('dispatch:agent-greeted', (e) => {
      const { agentId } = e.detail || {};
      if (!agentId || !this._tracked.has(agentId)) return;

      const msg = this._engine.getMessage(agentId, 'greeting');
      if (msg) this.showBubble(agentId, msg, 'task');
    });
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  _dismissBubblesForAgent(agentId) {
    for (const b of this._bubbles) {
      if (b.agentId === agentId && !b.isDead) {
        b.dismiss();
      }
    }
  }

  _purgeDeadBubbles() {
    const kept = [];
    for (const b of this._bubbles) {
      if (b.isDead) {
        if (b.el.parentNode) b.el.parentNode.removeChild(b.el);
        // Clean up typer if this was the active one for the agent
        const typer = this._typers.get(b.agentId);
        if (typer && typer.done) {
          this._typers.delete(b.agentId);
        }
      } else {
        kept.push(b);
      }
    }
    this._bubbles = kept;
  }

  /** Tear down the overlay entirely. */
  destroy() {
    if (this._container && this._container.parentNode) {
      this._container.parentNode.removeChild(this._container);
    }
    this._bubbles  = [];
    this._typers.clear();
    this._tracked.clear();
  }
}
