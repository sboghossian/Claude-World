/**
 * OnboardingSystem
 * Manages the first-time user experience for Claude World.
 */
export class OnboardingSystem {
  #state = 'not_started';
  #worldId = null;
  #worldName = null;
  #template = null;

  static STATES = Object.freeze({
    NOT_STARTED:     'not_started',
    NAMING:          'naming',
    TEMPLATE_SELECT: 'template_select',
    MEET_COMMANDER:  'meet_commander',
    FIRST_TASK:      'first_task',
    COMPLETE:        'complete',
  });

  static LS_KEY = 'cw:onboarding_complete';

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Check if onboarding is needed.
   * Emits 'onboarding:start' if the world has not been set up yet.
   */
  async check() {
    if (this.isComplete()) {
      this.#state = OnboardingSystem.STATES.COMPLETE;
      return;
    }

    let world = null;
    try {
      world = await window.api.db.getWorld(1);
    } catch (err) {
      console.warn('[OnboardingSystem] getWorld() failed — treating as no world.', err);
    }

    if (world) {
      // World already exists; mark complete silently.
      this.#worldId = world.id ?? 1;
      this.#state = OnboardingSystem.STATES.COMPLETE;
      localStorage.setItem(OnboardingSystem.LS_KEY, '1');
      return;
    }

    this.#state = OnboardingSystem.STATES.NAMING;
    this.#emit('onboarding:start');
  }

  /**
   * Create the world with the given name and template.
   * Calls window.api.db.createWorld(name, template) and emits 'onboarding:world-created'.
   * @param {string} name
   * @param {'startup_founder' | 'developer' | 'freelancer'} template
   */
  async createWorld(name, template) {
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      throw new Error('[OnboardingSystem] createWorld: name must be at least 2 characters.');
    }
    if (!template) {
      throw new Error('[OnboardingSystem] createWorld: template is required.');
    }

    this.#state = OnboardingSystem.STATES.MEET_COMMANDER;

    let result;
    try {
      result = await window.api.db.createWorld(name.trim(), template);
    } catch (err) {
      this.#state = OnboardingSystem.STATES.TEMPLATE_SELECT;
      throw err;
    }

    this.#worldId   = result?.id ?? result?.worldId ?? 1;
    this.#worldName = name.trim();
    this.#template  = template;

    this.#emit('onboarding:world-created', {
      worldId:   this.#worldId,
      worldName: this.#worldName,
      template:  this.#template,
    });
  }

  /**
   * Mark onboarding as complete.
   * Persists to localStorage and emits 'onboarding:complete'.
   */
  complete() {
    this.#state = OnboardingSystem.STATES.COMPLETE;
    localStorage.setItem(OnboardingSystem.LS_KEY, '1');
    this.#emit('onboarding:complete', { worldId: this.#worldId });
  }

  /**
   * Returns true if onboarding has already been completed.
   * @returns {boolean}
   */
  isComplete() {
    return localStorage.getItem(OnboardingSystem.LS_KEY) === '1';
  }

  // ─── Accessors ───────────────────────────────────────────────────────────────

  get state()     { return this.#state; }
  get worldId()   { return this.#worldId; }
  get worldName() { return this.#worldName; }
  get template()  { return this.#template; }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  #emit(eventName, detail = {}) {
    const event = new CustomEvent(eventName, { bubbles: true, detail });
    document.dispatchEvent(event);
  }
}
