/**
 * TutorialOverlay — Visual overlay for the interactive tutorial system
 *
 * Renders a full-screen dark overlay with an SVG cutout spotlight around
 * the target element, an animated tooltip card, step-counter dots, and
 * keyboard navigation (Enter = next, Escape = skip).
 *
 * Usage (internal — driven by TutorialEngine):
 *   const overlay = new TutorialOverlay();
 *   overlay.onNext = () => { ... };
 *   overlay.onBack = () => { ... };
 *   overlay.onSkip = () => { ... };
 *   overlay.showStep({ targetEl, text, position, stepIndex, totalSteps, isFirst, isLast, hasAction });
 *   overlay.destroy();
 */

// ── Constants ──────────────────────────────────────────────────────
const SPOTLIGHT_PADDING = 12;
const SPOTLIGHT_RADIUS = 10;
const TOOLTIP_GAP = 16;
const TRANSITION_MS = 350;

// ── Helper ─────────────────────────────────────────────────────────
function createElement(tag, cls, html) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html) el.innerHTML = html;
  return el;
}

export class TutorialOverlay {
  constructor() {
    /** @type {Function|null} */ this.onNext = null;
    /** @type {Function|null} */ this.onBack = null;
    /** @type {Function|null} */ this.onSkip = null;

    /** @type {HTMLElement|null} */ this._container = null;
    /** @type {SVGElement|null} */ this._svg = null;
    /** @type {HTMLElement|null} */ this._tooltip = null;
    /** @type {HTMLElement|null} */ this._dotsContainer = null;
    /** @type {HTMLElement|null} */ this._arrow = null;
    /** @type {HTMLElement|null} */ this._textEl = null;
    /** @type {HTMLElement|null} */ this._nextBtn = null;
    /** @type {HTMLElement|null} */ this._backBtn = null;
    /** @type {HTMLElement|null} */ this._skipBtn = null;
    /** @type {HTMLElement|null} */ this._counterEl = null;

    /** @type {{ x: number, y: number, w: number, h: number }|null} */
    this._currentSpotlight = null;

    /** @type {number} */ this._resizeRaf = 0;
    /** @type {object|null} */ this._currentStep = null;

    this._build();
    this._bindKeyboard();
  }

  // ─── Public API ──────────────────────────────────────────────────

  /**
   * Show a tutorial step.
   * @param {{
   *   targetEl:   HTMLElement|null,
   *   text:       string,
   *   position:   string,
   *   stepIndex:  number,
   *   totalSteps: number,
   *   isFirst:    boolean,
   *   isLast:     boolean,
   *   hasAction:  boolean,
   * }} step
   */
  showStep(step) {
    this._currentStep = step;

    // Ensure visible
    if (!this._container.parentNode) {
      document.body.appendChild(this._container);
      // Force paint before transition
      void this._container.offsetWidth;
      this._container.classList.add("tut-overlay--visible");
    }

    // Update spotlight
    this._updateSpotlight(step.targetEl);

    // Update tooltip content
    this._textEl.textContent = step.text;

    // Update buttons
    this._backBtn.style.display = step.isFirst ? "none" : "";
    this._nextBtn.textContent = step.isLast
      ? step.hasAction
        ? "Finish"
        : "Done"
      : "Next";
    this._skipBtn.style.display = step.isLast ? "none" : "";

    // Update counter
    this._counterEl.textContent = `${step.stepIndex + 1} / ${step.totalSteps}`;

    // Update dots
    this._renderDots(step.stepIndex, step.totalSteps);

    // Position tooltip
    requestAnimationFrame(() => {
      this._positionTooltip(step.targetEl, step.position);
      this._tooltip.classList.add("tut-tooltip--visible");
    });

    // Scroll target into view if needed
    if (step.targetEl) {
      step.targetEl.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    }
  }

  /**
   * Hide the overlay (without destroying it).
   */
  hide() {
    this._container.classList.remove("tut-overlay--visible");
    this._tooltip.classList.remove("tut-tooltip--visible");
  }

  /**
   * Destroy the overlay and remove all DOM / listeners.
   */
  destroy() {
    this._container.classList.remove("tut-overlay--visible");

    // Wait for fade-out transition, then remove
    setTimeout(() => {
      this._container.remove();
    }, TRANSITION_MS + 50);

    document.removeEventListener("keydown", this._keyHandler);
    window.removeEventListener("resize", this._resizeHandler);
    this.onNext = null;
    this.onBack = null;
    this.onSkip = null;
    this._currentStep = null;
  }

  // ─── DOM Construction ────────────────────────────────────────────

  _build() {
    // Root container
    this._container = createElement("div", "tut-overlay");
    this._container.setAttribute("role", "dialog");
    this._container.setAttribute("aria-label", "Tutorial guide");
    this._container.setAttribute("aria-modal", "true");

    // SVG overlay with spotlight cutout
    this._svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this._svg.classList.add("tut-overlay__svg");
    this._svg.setAttribute("width", "100%");
    this._svg.setAttribute("height", "100%");
    this._svg.innerHTML = `
      <defs>
        <mask id="tut-spotlight-mask">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          <rect class="tut-spotlight-cutout" x="0" y="0" width="0" height="0"
                rx="${SPOTLIGHT_RADIUS}" ry="${SPOTLIGHT_RADIUS}" fill="black" />
        </mask>
      </defs>
      <rect class="tut-overlay__bg" x="0" y="0" width="100%" height="100%"
            fill="rgba(0,0,0,0.72)" mask="url(#tut-spotlight-mask)" />
      <rect class="tut-spotlight-border" x="0" y="0" width="0" height="0"
            rx="${SPOTLIGHT_RADIUS}" ry="${SPOTLIGHT_RADIUS}"
            fill="none" stroke="rgba(74,158,255,0.5)" stroke-width="2" />
    `;
    this._container.appendChild(this._svg);

    // Pulse ring (separate element for animation)
    this._pulseRing = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    this._pulseRing.classList.add("tut-spotlight-pulse");
    this._pulseRing.setAttribute("rx", SPOTLIGHT_RADIUS);
    this._pulseRing.setAttribute("ry", SPOTLIGHT_RADIUS);
    this._pulseRing.setAttribute("fill", "none");
    this._pulseRing.setAttribute("stroke", "rgba(74,158,255,0.3)");
    this._pulseRing.setAttribute("stroke-width", "2");
    this._svg.appendChild(this._pulseRing);

    // Tooltip card
    this._tooltip = createElement("div", "tut-tooltip");

    // Arrow / caret
    this._arrow = createElement("div", "tut-tooltip__arrow");
    this._tooltip.appendChild(this._arrow);

    // Text body
    this._textEl = createElement("p", "tut-tooltip__text");
    this._tooltip.appendChild(this._textEl);

    // Dots container
    this._dotsContainer = createElement("div", "tut-tooltip__dots");
    this._tooltip.appendChild(this._dotsContainer);

    // Footer row: Back | Counter | Skip | Next
    const footer = createElement("div", "tut-tooltip__footer");

    this._backBtn = createElement("button", "tut-btn tut-btn--ghost", "← Back");
    this._backBtn.setAttribute("aria-label", "Previous step");
    this._backBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onBack?.();
    });

    this._counterEl = createElement("span", "tut-tooltip__counter", "1 / 5");

    this._skipBtn = createElement("button", "tut-btn tut-btn--ghost", "Skip");
    this._skipBtn.setAttribute("aria-label", "Skip tutorial");
    this._skipBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onSkip?.();
    });

    this._nextBtn = createElement("button", "tut-btn tut-btn--primary", "Next");
    this._nextBtn.setAttribute("aria-label", "Next step");
    this._nextBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.onNext?.();
    });

    footer.appendChild(this._backBtn);
    footer.appendChild(this._counterEl);
    footer.appendChild(this._skipBtn);
    footer.appendChild(this._nextBtn);

    this._tooltip.appendChild(footer);
    this._container.appendChild(this._tooltip);

    // Prevent clicks on the dark area from propagating (but allow clicks inside spotlight)
    this._container.addEventListener("click", (e) => {
      if (
        e.target === this._container ||
        e.target === this._svg ||
        e.target.tagName === "rect"
      ) {
        // Clicked the overlay background — do nothing (don't dismiss)
        e.stopPropagation();
      }
    });
  }

  // ─── Spotlight ───────────────────────────────────────────────────

  /**
   * Update the SVG cutout to spotlight around targetEl.
   * @param {HTMLElement|null} targetEl
   * @private
   */
  _updateSpotlight(targetEl) {
    const cutout = this._svg.querySelector(".tut-spotlight-cutout");
    const border = this._svg.querySelector(".tut-spotlight-border");

    if (!targetEl) {
      // No target — center a generic spotlight
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const spot = { x: cx - 100, y: cy - 30, w: 200, h: 60 };
      this._applySpotlightRect(cutout, spot);
      this._applySpotlightRect(border, spot);
      this._applySpotlightRect(this._pulseRing, spot);
      this._currentSpotlight = spot;
      return;
    }

    const rect = targetEl.getBoundingClientRect();
    const spot = {
      x: rect.left - SPOTLIGHT_PADDING,
      y: rect.top - SPOTLIGHT_PADDING,
      w: rect.width + SPOTLIGHT_PADDING * 2,
      h: rect.height + SPOTLIGHT_PADDING * 2,
    };

    this._applySpotlightRect(cutout, spot);
    this._applySpotlightRect(border, spot);
    this._applySpotlightRect(this._pulseRing, spot);
    this._currentSpotlight = spot;
  }

  /**
   * Set x/y/width/height attributes on an SVG rect element.
   * @param {SVGRectElement} svgRect
   * @param {{ x: number, y: number, w: number, h: number }} spot
   * @private
   */
  _applySpotlightRect(svgRect, spot) {
    svgRect.setAttribute("x", spot.x);
    svgRect.setAttribute("y", spot.y);
    svgRect.setAttribute("width", spot.w);
    svgRect.setAttribute("height", spot.h);
  }

  // ─── Tooltip Positioning ─────────────────────────────────────────

  /**
   * Position the tooltip relative to the target element.
   * @param {HTMLElement|null} targetEl
   * @param {string} position — 'top' | 'bottom' | 'left' | 'right' | 'bottom-left' | 'bottom-right'
   * @private
   */
  _positionTooltip(targetEl, position) {
    const tooltip = this._tooltip;
    const tooltipRect = tooltip.getBoundingClientRect();
    const tw = tooltipRect.width;
    const th = tooltipRect.height;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let top, left;

    if (!targetEl) {
      // Center tooltip
      top = (vh - th) / 2 + 60;
      left = (vw - tw) / 2;
    } else {
      const rect = targetEl.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      switch (position) {
        case "top":
          top = rect.top - th - TOOLTIP_GAP - SPOTLIGHT_PADDING;
          left = cx - tw / 2;
          this._setArrowPosition("bottom");
          break;

        case "bottom":
          top = rect.bottom + TOOLTIP_GAP + SPOTLIGHT_PADDING;
          left = cx - tw / 2;
          this._setArrowPosition("top");
          break;

        case "left":
          top = cy - th / 2;
          left = rect.left - tw - TOOLTIP_GAP - SPOTLIGHT_PADDING;
          this._setArrowPosition("right");
          break;

        case "right":
          top = cy - th / 2;
          left = rect.right + TOOLTIP_GAP + SPOTLIGHT_PADDING;
          this._setArrowPosition("left");
          break;

        case "bottom-left":
          top = rect.bottom + TOOLTIP_GAP + SPOTLIGHT_PADDING;
          left = rect.left - SPOTLIGHT_PADDING;
          this._setArrowPosition("top");
          break;

        case "bottom-right":
          top = rect.bottom + TOOLTIP_GAP + SPOTLIGHT_PADDING;
          left = rect.right - tw + SPOTLIGHT_PADDING;
          this._setArrowPosition("top");
          break;

        default:
          top = rect.bottom + TOOLTIP_GAP + SPOTLIGHT_PADDING;
          left = cx - tw / 2;
          this._setArrowPosition("top");
      }
    }

    // Clamp to viewport
    const margin = 16;
    left = Math.max(margin, Math.min(left, vw - tw - margin));
    top = Math.max(margin, Math.min(top, vh - th - margin));

    tooltip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }

  /**
   * Set the arrow direction class.
   * @param {'top'|'bottom'|'left'|'right'} dir — which side of the tooltip the arrow points FROM
   * @private
   */
  _setArrowPosition(dir) {
    this._arrow.className = `tut-tooltip__arrow tut-tooltip__arrow--${dir}`;
  }

  // ─── Step Dots ───────────────────────────────────────────────────

  /**
   * Render progress dots.
   * @param {number} current — zero-based
   * @param {number} total
   * @private
   */
  _renderDots(current, total) {
    this._dotsContainer.innerHTML = "";
    for (let i = 0; i < total; i++) {
      const dot = createElement("span", "tut-dot");
      if (i === current) dot.classList.add("tut-dot--active");
      if (i < current) dot.classList.add("tut-dot--done");
      this._dotsContainer.appendChild(dot);
    }
  }

  // ─── Keyboard ────────────────────────────────────────────────────

  _bindKeyboard() {
    this._keyHandler = (e) => {
      if (!this._container.parentNode) return;

      if (e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault();
        this.onNext?.();
      } else if (e.key === "Escape") {
        e.preventDefault();
        this.onSkip?.();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        this.onBack?.();
      }
    };

    document.addEventListener("keydown", this._keyHandler);

    // Re-position on resize
    this._resizeHandler = () => {
      cancelAnimationFrame(this._resizeRaf);
      this._resizeRaf = requestAnimationFrame(() => {
        if (this._currentStep) {
          this._updateSpotlight(this._currentStep.targetEl);
          this._positionTooltip(
            this._currentStep.targetEl,
            this._currentStep.position,
          );
        }
      });
    };

    window.addEventListener("resize", this._resizeHandler);
  }
}
