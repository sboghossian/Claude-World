/**
 * hud.js — Persistent heads-up display for Claude World
 *
 * Renders top bar (logo + XP), bottom bar (budget + agents + state),
 * quest card (bottom-left), and minimap (bottom-right).
 * All pointer-events pass through to the canvas except interactive elements.
 */

// ── Zone positions for minimap (simplified) ─────────────────────
const MINIMAP_ZONES = [
  { id: 'dispatch', x: 22, y: 22, active: true, district: 'core' },
  { id: 'brain', x: 17, y: 21, active: true, district: 'core' },
  { id: 'chat', x: 15, y: 17, active: false, district: 'core' },
  { id: 'memory', x: 25, y: 17, active: true, district: 'core' },
  { id: 'skills', x: 15, y: 25, active: true, district: 'core' },
  { id: 'minions', x: 25, y: 25, active: false, district: 'core' },
  { id: 'treasury', x: 29, y: 21, active: false, district: 'business' },
  { id: 'sales', x: 29, y: 27, active: false, district: 'business' },
  { id: 'marketing', x: 23, y: 31, active: false, district: 'business' },
  { id: 'exchange', x: 33, y: 19, active: false, district: 'business' },
  { id: 'market', x: 33, y: 25, active: false, district: 'business' },
  { id: 'council', x: 11, y: 15, active: false, district: 'advanced' },
  { id: 'rnd', x: 11, y: 21, active: false, district: 'advanced' },
  { id: 'legal', x: 17, y: 13, active: false, district: 'advanced' },
  { id: 'archive', x: 11, y: 27, active: false, district: 'advanced' },
  { id: 'docks', x: 10, y: 31, active: true, district: 'edge' },
  { id: 'airport', x: 36, y: 12, active: false, district: 'edge' },
  { id: 'globe', x: 29, y: 11, active: false, district: 'edge' },
  { id: 'broadcast', x: 21, y: 9, active: false, district: 'edge' },
];

const DISTRICT_COLORS = {
  core: '#4a9eff',
  business: '#4aff8a',
  advanced: '#a855f7',
  edge: '#ffb84a',
};


export class HUD {
  constructor() {
    /** @type {{ xp: number, xpMax: number, level: number }} */
    this._xp = { xp: 0, xpMax: 100, level: 1 };
    /** @type {{ spent: number, budget: number }} */
    this._budget = { spent: 0.00, budget: 10.00 };
    /** @type {number} */
    this._agentCount = 2;
    /** @type {'idle'|'active'|'busy'|'overload'} */
    this._worldState = 'idle';
    /** @type {string} */
    this._currentZone = 'dispatch';
    /** @type {boolean} */
    this._questExpanded = false;

    // Quest state
    this._quest = {
      name: 'Welcome to Claude World',
      progress: 0.3,
      steps: [
        { label: 'Open the Dispatch Tower', completed: true },
        { label: 'Talk to the Commander', completed: false, current: true },
        { label: 'Send your first task', completed: false },
      ],
    };

    this._createDOM();
    this._renderMinimap();
  }

  // ── DOM creation ────────────────────────────────────────────────

  _createDOM() {
    this._createTopBar();
    this._createBottomBar();
    this._createQuestCard();
    this._createMinimap();
  }

  _createTopBar() {
    this._topBar = document.createElement('div');
    this._topBar.className = 'hud-top';
    this._topBar.setAttribute('aria-label', 'Top HUD bar');

    // Logo
    const logo = document.createElement('div');
    logo.className = 'hud-logo';
    logo.innerHTML = `<span class="hud-logo__dot"></span> Claude World`;
    this._topBar.appendChild(logo);

    // XP section
    const xpSection = document.createElement('div');
    xpSection.className = 'hud-xp';

    this._xpLabel = document.createElement('span');
    this._xpLabel.className = 'hud-xp__label';

    const barWrap = document.createElement('div');
    barWrap.className = 'hud-xp__bar-wrap';
    barWrap.setAttribute('role', 'progressbar');
    barWrap.setAttribute('aria-label', 'Experience progress');

    this._xpFill = document.createElement('div');
    this._xpFill.className = 'hud-xp__bar-fill';
    barWrap.appendChild(this._xpFill);

    this._xpLevel = document.createElement('span');
    this._xpLevel.className = 'hud-xp__level';

    xpSection.appendChild(this._xpLabel);
    xpSection.appendChild(barWrap);
    xpSection.appendChild(this._xpLevel);
    this._topBar.appendChild(xpSection);

    document.body.appendChild(this._topBar);
    this._updateXP();
  }

  _createBottomBar() {
    this._bottomBar = document.createElement('div');
    this._bottomBar.className = 'hud-bottom';
    this._bottomBar.setAttribute('aria-label', 'Bottom HUD bar');

    // Budget
    this._budgetStat = document.createElement('div');
    this._budgetStat.className = 'hud-stat';

    // Agent count
    this._agentStat = document.createElement('div');
    this._agentStat.className = 'hud-stat';

    // World state
    this._stateStat = document.createElement('div');
    this._stateStat.className = 'hud-stat';

    this._bottomBar.appendChild(this._budgetStat);
    this._bottomBar.appendChild(this._agentStat);
    this._bottomBar.appendChild(this._stateStat);

    document.body.appendChild(this._bottomBar);
    this._updateBudget();
    this._updateAgents();
    this._updateWorldState();
  }

  _createQuestCard() {
    this._questCard = document.createElement('div');
    this._questCard.className = 'hud-quest';
    this._questCard.setAttribute('role', 'region');
    this._questCard.setAttribute('aria-label', 'Active quest');

    // Header
    const header = document.createElement('div');
    header.className = 'hud-quest__header';
    header.innerHTML = `<span class="hud-quest__header-icon">\u{1F4CB}</span>`;

    this._questLabel = document.createElement('span');
    this._questLabel.className = 'hud-quest__header-label';
    header.appendChild(this._questLabel);
    this._questCard.appendChild(header);

    // Progress
    const progress = document.createElement('div');
    progress.className = 'hud-quest__progress';

    const progressBar = document.createElement('div');
    progressBar.className = 'hud-quest__progress-bar';

    this._questFill = document.createElement('div');
    this._questFill.className = 'hud-quest__progress-fill';
    progressBar.appendChild(this._questFill);
    progress.appendChild(progressBar);

    this._questProgressText = document.createElement('div');
    this._questProgressText.className = 'hud-quest__progress-text';
    progress.appendChild(this._questProgressText);

    this._questCard.appendChild(progress);

    // Expandable body
    this._questBody = document.createElement('div');
    this._questBody.className = 'hud-quest__body';

    this._questChain = document.createElement('ul');
    this._questChain.className = 'hud-quest__chain';
    this._questBody.appendChild(this._questChain);
    this._questCard.appendChild(this._questBody);

    // Click to open the full quest panel
    this._questCard.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('quest-panel:open', { bubbles: true }));
    });

    document.body.appendChild(this._questCard);
    this._updateQuest();
  }

  _createMinimap() {
    this._minimapContainer = document.createElement('div');
    this._minimapContainer.className = 'hud-minimap';
    this._minimapContainer.setAttribute('role', 'navigation');
    this._minimapContainer.setAttribute('aria-label', 'World minimap');

    this._minimapCanvas = document.createElement('canvas');
    this._minimapCanvas.className = 'hud-minimap__canvas';
    this._minimapCanvas.width = 180;
    this._minimapCanvas.height = 180;
    this._minimapContainer.appendChild(this._minimapCanvas);

    // Click on minimap to navigate
    this._minimapCanvas.addEventListener('click', (e) => {
      const rect = this._minimapCanvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this._handleMinimapClick(x, y);
    });

    document.body.appendChild(this._minimapContainer);
  }

  // ── Minimap rendering ───────────────────────────────────────────

  _renderMinimap() {
    const ctx = this._minimapCanvas.getContext('2d');
    const w = 180;
    const h = 180;

    ctx.clearRect(0, 0, w, h);

    // Background grid hint
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < w; i += 12) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(w, i);
      ctx.stroke();
    }

    // Map tile coords to canvas coords
    // Tile range roughly 8-38 x, 8-34 y
    const minTile = 6;
    const maxTile = 40;
    const tileRange = maxTile - minTile;
    const scale = (v) => ((v - minTile) / tileRange) * (w - 20) + 10;

    // Draw connection lines (dim)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    const connections = [
      ['dispatch', 'brain'], ['dispatch', 'chat'], ['dispatch', 'memory'],
      ['dispatch', 'skills'], ['dispatch', 'minions'], ['memory', 'treasury'],
      ['minions', 'sales'], ['minions', 'marketing'], ['treasury', 'exchange'],
      ['treasury', 'market'], ['chat', 'council'], ['chat', 'legal'],
      ['skills', 'rnd'], ['skills', 'archive'], ['archive', 'docks'],
      ['dispatch', 'broadcast'], ['memory', 'globe'], ['exchange', 'airport'],
    ];

    const zoneMap = {};
    for (const z of MINIMAP_ZONES) zoneMap[z.id] = z;

    for (const [a, b] of connections) {
      const za = zoneMap[a];
      const zb = zoneMap[b];
      if (!za || !zb) continue;
      ctx.beginPath();
      ctx.moveTo(scale(za.x), scale(za.y));
      ctx.lineTo(scale(zb.x), scale(zb.y));
      ctx.stroke();
    }

    // Draw zone dots
    for (const z of MINIMAP_ZONES) {
      const cx = scale(z.x);
      const cy = scale(z.y);
      const isCurrent = z.id === this._currentZone;
      const radius = isCurrent ? 5 : 3;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);

      if (isCurrent) {
        ctx.fillStyle = '#ffd700';
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 8;
      } else if (z.active) {
        const color = DISTRICT_COLORS[z.district] || '#4a9eff';
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 4;
      } else {
        ctx.fillStyle = 'rgba(100, 100, 120, 0.5)';
        ctx.shadowBlur = 0;
      }

      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  _handleMinimapClick(canvasX, canvasY) {
    const w = 180;
    const minTile = 6;
    const maxTile = 40;
    const tileRange = maxTile - minTile;
    const toTile = (px) => ((px - 10) / (w - 20)) * tileRange + minTile;

    const clickTileX = toTile(canvasX);
    const clickTileY = toTile(canvasY);

    // Find nearest zone
    let nearest = null;
    let nearestDist = Infinity;
    for (const z of MINIMAP_ZONES) {
      const dx = z.x - clickTileX;
      const dy = z.y - clickTileY;
      const dist = dx * dx + dy * dy;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = z;
      }
    }

    // Must be within ~4 tiles to register
    if (nearest && nearestDist < 16) {
      document.dispatchEvent(new CustomEvent('hud:navigate', {
        detail: { zoneId: nearest.id },
        bubbles: true,
      }));
    }
  }

  // ── Update methods ──────────────────────────────────────────────

  _updateXP() {
    const pct = Math.min(100, (this._xp.xp / this._xp.xpMax) * 100);
    this._xpFill.style.width = `${pct}%`;
    this._xpLabel.textContent = `${this._xp.xp} / ${this._xp.xpMax} XP`;
    this._xpLevel.textContent = `Lv.${this._xp.level}`;
  }

  _updateBudget() {
    const ratio = this._budget.spent / this._budget.budget;
    let colorClass = 'hud-stat--green';
    if (ratio > 0.8) colorClass = 'hud-stat--red';
    else if (ratio > 0.5) colorClass = 'hud-stat--amber';

    this._budgetStat.className = `hud-stat ${colorClass}`;
    this._budgetStat.innerHTML = `
      <span class="hud-stat__icon">\u{1F4B0}</span>
      $${this._budget.spent.toFixed(2)} / $${this._budget.budget.toFixed(2)}
    `;
  }

  _updateAgents() {
    this._agentStat.className = 'hud-stat hud-stat--blue';
    this._agentStat.innerHTML = `
      <span class="hud-stat__icon">\u{1F916}</span>
      ${this._agentCount} agent${this._agentCount !== 1 ? 's' : ''} active
    `;
  }

  _updateWorldState() {
    this._stateStat.innerHTML = `
      <span class="hud-stat__dot hud-stat__dot--${this._worldState}"></span>
      ${this._worldState}
    `;
  }

  _updateQuest() {
    this._questLabel.textContent = this._quest.name;

    const pct = Math.min(100, this._quest.progress * 100);
    this._questFill.style.width = `${pct}%`;

    const completed = this._quest.steps.filter(s => s.completed).length;
    this._questProgressText.textContent = `${completed} / ${this._quest.steps.length} steps`;

    // Check if completable
    const isCompletable = this._quest.progress >= 1;
    this._questCard.classList.toggle('completable', isCompletable);

    // Render chain steps
    this._questChain.innerHTML = '';
    for (const step of this._quest.steps) {
      const li = document.createElement('li');
      li.className = 'hud-quest__chain-item';
      if (step.completed) li.classList.add('completed');
      if (step.current) li.classList.add('current');

      const marker = step.completed ? '\u2713' : step.current ? '\u25B6' : '\u25CB';
      li.textContent = `${marker} ${step.label}`;
      this._questChain.appendChild(li);
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Update XP values and re-render.
   * @param {number} xp
   * @param {number} xpMax
   * @param {number} level
   */
  setXP(xp, xpMax, level) {
    this._xp = { xp, xpMax, level };
    this._updateXP();
  }

  /**
   * Update budget values.
   * @param {number} spent
   * @param {number} budget
   */
  setBudget(spent, budget) {
    this._budget = { spent, budget };
    this._updateBudget();
  }

  /**
   * Update agent count.
   * @param {number} count
   */
  setAgentCount(count) {
    this._agentCount = count;
    this._updateAgents();
  }

  /**
   * Update world state.
   * @param {'idle'|'active'|'busy'|'overload'} state
   */
  setWorldState(state) {
    this._worldState = state;
    this._updateWorldState();
  }

  /**
   * Update the active quest.
   * @param {{ name: string, progress: number, steps: { label: string, completed: boolean, current?: boolean }[] }} quest
   */
  setQuest(quest) {
    this._quest = quest;
    this._updateQuest();
  }

  /**
   * Set the current zone for minimap highlight.
   * @param {string} zoneId
   */
  setCurrentZone(zoneId) {
    this._currentZone = zoneId;
    this._renderMinimap();
  }

  /** Tear down all DOM. */
  destroy() {
    this._topBar.remove();
    this._bottomBar.remove();
    this._questCard.remove();
    this._minimapContainer.remove();
  }
}
