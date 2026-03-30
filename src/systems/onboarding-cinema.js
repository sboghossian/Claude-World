/**
 * OnboardingCinema — magical first-90-seconds experience for Claude World
 *
 * Usage:
 *   const cinema = new OnboardingCinema({ getCamera, getBuildingManager });
 *   await cinema.play(worldId, worldName);
 */
export class OnboardingCinema {
  /**
   * @param {object} options
   * @param {Function} options.getCamera           — returns the camera instance
   * @param {Function} options.getBuildingManager  — returns BuildingManager
   */
  constructor(options = {}) {
    this._options = options;
    this._step = 0;
    this._overlay = null;
    this._skipped = false;
    this._skipResolvers = [];
    this._cssLoaded = false;
  }

  // ─────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────

  /**
   * Play the full cinematic sequence for a world.
   * @param {string} worldId
   * @param {string} worldName
   */
  async play(worldId, worldName) {
    this._skipped = false;
    this._skipResolvers = [];

    this._ensureCSS();
    this._buildOverlay(worldName);
    document.body.appendChild(this._overlay);

    // Small tick so the overlay is painted before we begin transitions
    await this._wait(30);

    try {
      await this._step0_fadeIn();
      await this._step1_cameraSweep(worldName);
      await this._step2_commanderIntro();
      await this._step3_zoneSpotlight();
      await this._step4_firstTask();
      await this._step5_fadeToPlay();
    } catch (e) {
      // Thrown by _skip() — safe to swallow
      if (e !== SKIP_SIGNAL) throw e;
    } finally {
      this._teardown();
      this._dispatchEvent("cinema:complete", { worldId, worldName });
      // Auto-open Dispatch panel
      this._dispatchEvent("zone:open", { zone: "dispatch" });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Cinematic Steps
  // ─────────────────────────────────────────────────────────────

  /** Step 0 — black overlay fades out revealing the city (0.5 s) */
  async _step0_fadeIn() {
    const curtain = this._overlay.querySelector(".oc-curtain");
    curtain.style.opacity = "1";
    await this._wait(50);
    curtain.style.transition = "opacity 0.5s ease-out";
    curtain.style.opacity = "0";
    await this._raceSkip(500);
    curtain.style.display = "none";
  }

  /** Step 1 — camera sweep + "Welcome to [worldName]" (2 s) */
  async _step1_cameraSweep(worldName) {
    const camera = this._options.getCamera?.();
    const bm = this._options.getBuildingManager?.();

    // Determine world center
    let cx = 0,
      cy = 0;
    if (bm) {
      const bounds = bm.getWorldBounds?.() ?? { cx: 0, cy: 0 };
      cx = bounds.cx ?? 0;
      cy = bounds.cy ?? 0;
    }

    // Pan camera left-to-right across the city
    camera?.panTo?.({ x: cx - 200, y: cy }, 2000);

    // Show welcome text
    const mainText = this._overlay.querySelector(".oc-main-text");
    mainText.textContent = `Welcome to ${worldName}`;
    await this._fadeIn(mainText, 400);

    await this._raceSkip(2000);

    await this._fadeOut(mainText, 300);
  }

  /** Step 2 — Commander introduction with typewriter effect (3 s) */
  async _step2_commanderIntro() {
    const mainText = this._overlay.querySelector(".oc-main-text");
    const subText = this._overlay.querySelector(".oc-sub-text");
    const commander = this._overlay.querySelector(".oc-commander");
    const dialogue =
      "Commander here. This is your world. " +
      "Every building is a tool. Every agent, a team member. " +
      "Let's build something great.";

    // Show commander emoji
    commander.style.opacity = "0";
    commander.style.display = "block";
    await this._fadeIn(commander, 300);

    // Typewriter into subText
    subText.textContent = "";
    subText.style.opacity = "1";

    await this._typewriter(subText, dialogue, 28);

    await this._raceSkip(1200);

    await Promise.all([
      this._fadeOut(commander, 300),
      this._fadeOut(subText, 300),
      this._fadeOut(mainText, 200),
    ]);
    commander.style.display = "none";
  }

  /** Step 3 — Zone spotlight: pan to each zone, highlight, name it (1 s each) */
  async _step3_zoneSpotlight() {
    const camera = this._options.getCamera?.();
    const bm = this._options.getBuildingManager?.();

    const zones = [
      {
        id: "dispatch",
        label: "Dispatch Center",
        tagline: "Send tasks. Direct your agents.",
        color: "#7c3aed",
      },
      {
        id: "brain",
        label: "The Brain",
        tagline: "Memory, knowledge, long-term thinking.",
        color: "#2563eb",
      },
      {
        id: "chat",
        label: "Chat Hub",
        tagline: "Talk to your world in real time.",
        color: "#f59e0b",
      },
    ];

    const mainText = this._overlay.querySelector(".oc-main-text");
    const subText = this._overlay.querySelector(".oc-sub-text");

    for (const zone of zones) {
      if (this._skipped) break;

      // Get zone position from building manager
      const pos = bm?.getBuildingPosition?.(zone.id) ?? { x: 0, y: 0 };
      camera?.panTo?.({ x: pos.x, y: pos.y }, 600);

      // Spotlight VFX event
      this._dispatchEvent("vfx:spotlight", {
        zone: zone.id,
        color: zone.color,
        duration: 1000,
      });

      // Overlay text
      mainText.textContent = zone.label;
      mainText.style.color = zone.color;
      subText.textContent = zone.tagline;
      subText.style.opacity = "1";

      await this._fadeIn(mainText, 250);
      await this._raceSkip(900);
      await this._fadeOut(mainText, 200);
      await this._fadeOut(subText, 150);
    }

    // Reset text color
    mainText.style.color = "";
  }

  /** Step 4 — "Your first task" with arrow animation + dispatch pulse (5 s) */
  async _step4_firstTask() {
    const camera = this._options.getCamera?.();
    const bm = this._options.getBuildingManager?.();
    const mainText = this._overlay.querySelector(".oc-main-text");
    const subText = this._overlay.querySelector(".oc-sub-text");
    const arrow = this._overlay.querySelector(".oc-arrow");

    // Pan back to dispatch center
    const dispatchPos = bm?.getBuildingPosition?.("dispatch") ?? { x: 0, y: 0 };
    camera?.panTo?.({ x: dispatchPos.x, y: dispatchPos.y }, 800);

    mainText.textContent = "Your first task is ready.";
    subText.textContent = "Let's dispatch something.";
    subText.style.opacity = "1";

    await this._fadeIn(mainText, 400);
    await this._fadeIn(arrow, 300);

    // Pulse dispatch zone 3 times
    for (let i = 0; i < 3; i++) {
      if (this._skipped) break;
      this._dispatchEvent("vfx:spotlight", {
        zone: "dispatch",
        color: "#7c3aed",
        duration: 600,
      });
      await this._raceSkip(700);
    }

    await this._raceSkip(2000);

    await Promise.all([
      this._fadeOut(mainText, 300),
      this._fadeOut(subText, 300),
      this._fadeOut(arrow, 300),
    ]);
  }

  /** Step 5 — fade to play, camera home, emit cinema:complete (0.5 s) */
  async _step5_fadeToPlay() {
    const camera = this._options.getCamera?.();
    const curtain = this._overlay.querySelector(".oc-curtain");

    // Fade to black briefly
    curtain.style.display = "block";
    curtain.style.transition = "opacity 0.4s ease-in";
    curtain.style.opacity = "0";
    await this._wait(20);
    curtain.style.opacity = "1";
    await this._raceSkip(400);

    // Return camera to default
    camera?.resetToDefault?.();

    // Fade back in
    curtain.style.transition = "opacity 0.4s ease-out";
    curtain.style.opacity = "0";
    await this._raceSkip(400);
    curtain.style.display = "none";
  }

  // ─────────────────────────────────────────────────────────────
  // Skip Logic
  // ─────────────────────────────────────────────────────────────

  _skip() {
    if (this._skipped) return;
    this._skipped = true;
    // Resolve all waiting promises immediately
    for (const resolve of this._skipResolvers) resolve();
    this._skipResolvers = [];
  }

  /**
   * Returns a promise that resolves after `ms` OR when the user skips.
   * Throws SKIP_SIGNAL if skipped, so the step chain stops.
   */
  _raceSkip(ms) {
    if (this._skipped) return Promise.reject(SKIP_SIGNAL);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._skipResolvers = this._skipResolvers.filter(
          (r) => r !== skipResolve,
        );
        resolve();
      }, ms);

      const skipResolve = () => {
        clearTimeout(timer);
        reject(SKIP_SIGNAL);
      };
      this._skipResolvers.push(skipResolve);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // DOM Construction
  // ─────────────────────────────────────────────────────────────

  _buildOverlay(worldName) {
    const el = document.createElement("div");
    el.className = "oc-overlay";
    el.innerHTML = `
      <div class="oc-curtain"></div>

      <div class="oc-content">
        <div class="oc-commander">👑</div>
        <div class="oc-main-text"></div>
        <div class="oc-sub-text"></div>
        <div class="oc-cursor"></div>
      </div>

      <div class="oc-arrow">
        <div class="oc-arrow-label">Dispatch Center</div>
        <div class="oc-arrow-icon">↓</div>
      </div>

      <button class="oc-skip-btn" aria-label="Skip intro">Skip intro →</button>
    `;

    // Skip button
    el.querySelector(".oc-skip-btn").addEventListener("click", () =>
      this._skip(),
    );

    // Escape key
    this._escHandler = (e) => {
      if (e.key === "Escape") this._skip();
    };
    document.addEventListener("keydown", this._escHandler);

    this._overlay = el;
  }

  _teardown() {
    document.removeEventListener("keydown", this._escHandler);
    if (this._overlay && this._overlay.parentNode) {
      // Fade out the entire overlay
      this._overlay.style.transition = "opacity 0.4s ease-out";
      this._overlay.style.opacity = "0";
      setTimeout(
        () => this._overlay?.parentNode?.removeChild(this._overlay),
        450,
      );
    }
    this._overlay = null;
  }

  // ─────────────────────────────────────────────────────────────
  // Animation Helpers
  // ─────────────────────────────────────────────────────────────

  _fadeIn(el, ms = 300) {
    return new Promise((resolve) => {
      el.style.transition = `opacity ${ms}ms ease-in`;
      el.style.opacity = "1";
      setTimeout(resolve, ms);
    });
  }

  _fadeOut(el, ms = 300) {
    return new Promise((resolve) => {
      el.style.transition = `opacity ${ms}ms ease-out`;
      el.style.opacity = "0";
      setTimeout(resolve, ms);
    });
  }

  _wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Typewriter effect — writes text character by character into `el`.
   * Respects skip: stops mid-word and shows full text immediately.
   */
  async _typewriter(el, text, charDelay = 30) {
    if (this._skipped) {
      el.textContent = text;
      return;
    }

    const cursor = this._overlay.querySelector(".oc-cursor");
    cursor.style.display = "inline-block";

    for (let i = 0; i <= text.length; i++) {
      if (this._skipped) {
        el.textContent = text;
        break;
      }
      el.textContent = text.slice(0, i);
      await this._wait(charDelay);
    }

    cursor.style.display = "none";
  }

  // ─────────────────────────────────────────────────────────────
  // Event Helpers
  // ─────────────────────────────────────────────────────────────

  _dispatchEvent(name, detail = {}) {
    window.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
  }

  // ─────────────────────────────────────────────────────────────
  // CSS Injection
  // ─────────────────────────────────────────────────────────────

  _ensureCSS() {
    if (this._cssLoaded) return;
    if (!document.getElementById("onboarding-cinema-styles")) {
      const link = document.createElement("link");
      link.id = "onboarding-cinema-styles";
      link.rel = "stylesheet";
      link.href = new URL("./onboarding-cinema.css", import.meta.url).href;
      document.head.appendChild(link);
    }
    this._cssLoaded = true;
  }
}

// Sentinel value used to signal a skip through Promise rejection
const SKIP_SIGNAL = Symbol("CINEMA_SKIP");
