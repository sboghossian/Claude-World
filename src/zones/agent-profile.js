/**
 * agent-profile.js — Agent Profile zone for Claude World
 *
 * Detailed profile pages for each of the 5 agents. Includes personality traits,
 * stats, activity graphs (Canvas 2D), relationship map, recent tasks, and
 * shortcuts to AgentChat and SkillTree.
 *
 * Usage:
 *   import { AgentProfile } from './agent-profile.js';
 *   const profile = new AgentProfile();
 *   document.body.appendChild(profile.render());
 *   await profile.init(worldId, 'commander');
 */

import { AGENT_PERSONALITIES } from '../systems/agent-personalities.js';

// ─────────────────────────────────────────────────────────────────────────────
//  Load styles
// ─────────────────────────────────────────────────────────────────────────────

const _styleLink = document.createElement('link');
_styleLink.rel = 'stylesheet';
_styleLink.href = '../zones/agent-profile.css';
if (!document.querySelector('link[href*="agent-profile.css"]')) {
  document.head.appendChild(_styleLink);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Constants
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_KEYS = ['commander', 'librarian', 'archivist', 'instructor', 'dockmaster'];

/** Mood emoji lookup */
const MOOD_EMOJI = {
  focused:  '\u{1F3AF}',
  happy:    '\u{1F60A}',
  excited:  '\u{1F525}',
  tired:    '\u{1F634}',
  worried:  '\u{1F615}',
};

/** Trait definitions per agent (0-100 scale) */
const AGENT_TRAITS = {
  commander: {
    creativity:    55,
    precision:     85,
    speed:         90,
    friendliness:  35,
    independence:  95,
    commStyle:     'Direct and commanding. Prefers brief status-report exchanges. Rarely uses pleasantries.',
    zones:         ['dispatch', 'mission-control', 'council'],
  },
  librarian: {
    creativity:    75,
    precision:     95,
    speed:         50,
    friendliness:  80,
    independence:  60,
    commStyle:     'Verbose and enthusiastic. Loves tangential footnotes and cross-references. Always cites sources.',
    zones:         ['brain', 'archive', 'knowledge-graph'],
  },
  archivist: {
    creativity:    40,
    precision:     100,
    speed:         45,
    friendliness:  65,
    independence:  70,
    commStyle:     'Measured and precise. Speaks in timestamps. Nostalgic about past events.',
    zones:         ['archive', 'timeline', 'memory'],
  },
  instructor: {
    creativity:    80,
    precision:     70,
    speed:         85,
    friendliness:  95,
    independence:  50,
    commStyle:     'Energetic and encouraging. Uses sports metaphors. Always positive, even about failures.',
    zones:         ['skills', 'skill-tree', 'dispatch'],
  },
  dockmaster: {
    creativity:    30,
    precision:     80,
    speed:         95,
    friendliness:  40,
    independence:  85,
    commStyle:     'Terse and functional. One-word confirmations. Speaks in shipping/port metaphors.',
    zones:         ['exchange', 'docks', 'airport'],
  },
};

/** Relationships between agents */
const AGENT_RELATIONSHIPS = {
  commander: [
    { target: 'librarian',  type: 'neutral',  desc: 'Respects the knowledge but finds the verbosity slow' },
    { target: 'archivist',  type: 'like',     desc: 'Values the meticulous record-keeping' },
    { target: 'instructor', type: 'like',     desc: 'Appreciates the training efficiency' },
    { target: 'dockmaster', type: 'like',     desc: 'Kindred spirits in brevity and action' },
  ],
  librarian: [
    { target: 'commander',  type: 'neutral',  desc: 'Wishes the Commander would read more' },
    { target: 'archivist',  type: 'like',     desc: 'Fellow scholars, always sharing references' },
    { target: 'instructor', type: 'like',     desc: 'Great collaboration on knowledge transfer' },
    { target: 'dockmaster', type: 'dislike',  desc: 'Finds the terseness intellectually lacking' },
  ],
  archivist: [
    { target: 'commander',  type: 'like',     desc: 'Admires the decisive leadership' },
    { target: 'librarian',  type: 'like',     desc: 'Shares a love of cataloguing' },
    { target: 'instructor', type: 'neutral',  desc: 'Respects the energy, prefers calm' },
    { target: 'dockmaster', type: 'neutral',  desc: 'Both quiet types, coexist well' },
  ],
  instructor: [
    { target: 'commander',  type: 'like',     desc: 'Loves the challenge of training a leader' },
    { target: 'librarian',  type: 'like',     desc: 'Perfect study partner' },
    { target: 'archivist',  type: 'neutral',  desc: 'Appreciates history but prefers forward motion' },
    { target: 'dockmaster', type: 'neutral',  desc: 'Tries to coach, gets one-word answers' },
  ],
  dockmaster: [
    { target: 'commander',  type: 'like',     desc: 'Efficient chain of command' },
    { target: 'librarian',  type: 'dislike',  desc: 'Too many words, not enough action' },
    { target: 'archivist',  type: 'neutral',  desc: 'Respect for the quiet professionalism' },
    { target: 'instructor', type: 'neutral',  desc: 'Motivational speeches fall on deaf ears' },
  ],
};

/** Zone name display map */
const ZONE_DISPLAY = {
  dispatch:          'Dispatch Tower',
  'mission-control': 'Mission Control',
  council:           'Council',
  brain:             'Brain Library',
  archive:           'Archive',
  'knowledge-graph': 'Knowledge Graph',
  timeline:          'Timeline',
  memory:            'Memory Vault',
  skills:            'Skills Academy',
  'skill-tree':      'Skill Tree',
  exchange:          'Exchange',
  docks:             'Connector Docks',
  airport:           'Airport',
};

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: generate mock activity data (30 days of tasks/day)
// ─────────────────────────────────────────────────────────────────────────────

function generateActivityData(agentKey) {
  const seed = agentKey.charCodeAt(0) + agentKey.charCodeAt(1);
  const data = [];
  for (let i = 0; i < 30; i++) {
    // Seeded pseudo-random for consistency per agent
    const val = Math.abs(Math.sin(seed * (i + 1) * 0.7)) * 8 + 1;
    data.push(Math.round(val));
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: generate mock recent tasks
// ─────────────────────────────────────────────────────────────────────────────

const SAMPLE_PROMPTS = {
  commander: [
    'Coordinate deployment pipeline for v2.1',
    'Review resource allocation across zones',
    'Prioritize incoming task queue',
    'Analyze performance bottleneck in Zone 3',
    'Schedule agent rotations for next week',
    'Audit completed tasks for quality',
    'Generate daily ops report',
    'Delegate research task to Librarian',
    'Plan zone expansion strategy',
    'Run contingency drill',
  ],
  librarian: [
    'Research best practices for data indexing',
    'Cross-reference API documentation updates',
    'Compile bibliography on ML architectures',
    'Synthesize user feedback into knowledge base',
    'Update cross-reference links for Zone 5',
    'Catalog new research papers',
    'Annotate last week query results',
    'Build knowledge summary for onboarding',
    'Review and tag unclassified entries',
    'Create reading list for the team',
  ],
  archivist: [
    'Archive task logs from March 15-22',
    'Verify integrity of backup records',
    'Pattern-match recurring error types',
    'Timestamp and seal weekly report',
    'Diff world state against last checkpoint',
    'Catalog event anomalies from Tuesday',
    'Restore corrupted archive entry #4891',
    'Cross-check timeline consistency',
    'Generate historical trend analysis',
    'Update version control metadata',
  ],
  instructor: [
    'Design training module for new skill tree',
    'Evaluate agent performance benchmarks',
    'Create adaptive quiz for skill assessment',
    'Run practice drill for delegation skills',
    'Adjust difficulty curve for research module',
    'Celebrate milestone: 100 tasks completed',
    'Prepare skill gap analysis report',
    'Build onboarding tutorial flow',
    'Review training completion rates',
    'Design progressive overload schedule',
  ],
  dockmaster: [
    'Establish connection to external API',
    'Monitor port health across integrations',
    'Optimize data throughput on Channel 3',
    'Route incoming webhook to correct handler',
    'Scale connection pool for peak traffic',
    'Diagnose latency spike on Port 443',
    'Validate manifest for incoming data ship',
    'Run diagnostics on routing table',
    'Clear backlog in transfer queue',
    'Update connection credentials rotation',
  ],
};

function generateRecentTasks(agentKey) {
  const prompts = SAMPLE_PROMPTS[agentKey] || SAMPLE_PROMPTS.commander;
  const statuses = ['done', 'done', 'done', 'done', 'done', 'done', 'done', 'error', 'done', 'pending'];
  const now = Date.now();
  return prompts.map((prompt, i) => ({
    prompt,
    status: statuses[i],
    time: new Date(now - (i * 3600000 * 3 + i * 1800000)),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: format relative time
// ─────────────────────────────────────────────────────────────────────────────

function relativeTime(date) {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Helper: hex color to rgb components
// ─────────────────────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Mock stat values per agent
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_STATS = {
  commander: { tasksCompleted: 247, xpEarned: 3820, skillsUnlocked: 4, relationships: 4, favoriteZone: 'Dispatch Tower',  activeSince: '2026-01-15' },
  librarian: { tasksCompleted: 189, xpEarned: 2940, skillsUnlocked: 3, relationships: 4, favoriteZone: 'Brain Library',   activeSince: '2026-01-15' },
  archivist: { tasksCompleted: 156, xpEarned: 2210, skillsUnlocked: 3, relationships: 4, favoriteZone: 'Archive',         activeSince: '2026-01-18' },
  instructor:{ tasksCompleted: 203, xpEarned: 3150, skillsUnlocked: 3, relationships: 4, favoriteZone: 'Skills Academy',  activeSince: '2026-01-20' },
  dockmaster:{ tasksCompleted: 312, xpEarned: 4580, skillsUnlocked: 4, relationships: 4, favoriteZone: 'Exchange',        activeSince: '2026-01-22' },
};

// ─────────────────────────────────────────────────────────────────────────────
//  AgentProfile class
// ─────────────────────────────────────────────────────────────────────────────

export class AgentProfile {
  constructor() {
    /** @type {HTMLElement|null} */
    this._el = null;

    /** @type {string|null} */
    this._worldId = null;

    /** @type {string} */
    this._activeAgent = 'commander';

    /** @type {HTMLCanvasElement|null} */
    this._activityCanvas = null;

    /** @type {CanvasRenderingContext2D|null} */
    this._activityCtx = null;

    /** Bound resize handler */
    this._onResize = this._handleResize.bind(this);
  }

  // ── Public API ───────────────────────────────────────────────────

  /**
   * Build and return the root HTMLElement.
   * @returns {HTMLElement}
   */
  render() {
    this._el = document.createElement('div');
    this._el.className = 'agent-profile';
    this._el.innerHTML = '<div class="ap-loading">Loading agent profile\u2026</div>';
    return this._el;
  }

  /**
   * Initialize with world data and optionally a pre-selected agent.
   * @param {string} worldId
   * @param {string} [agentId='commander'] — agent key to show first
   */
  async init(worldId, agentId) {
    this._worldId = worldId;

    if (agentId && AGENT_KEYS.includes(agentId)) {
      this._activeAgent = agentId;
    }

    this._renderFull();
    window.addEventListener('resize', this._onResize);
  }

  /** Tear down. */
  destroy() {
    window.removeEventListener('resize', this._onResize);
    if (this._el) this._el.innerHTML = '';
  }

  // ── Full render ────────────────────────────────────────────────

  _renderFull() {
    if (!this._el) return;
    this._el.innerHTML = '';
    this._el.className = `agent-profile ap-agent--${this._activeAgent}`;

    // Tab bar
    this._el.appendChild(this._buildTabs());

    // Scrollable content
    const content = document.createElement('div');
    content.style.cssText = 'flex:1; overflow-y:auto; overflow-x:hidden;';

    // Profile header
    content.appendChild(this._buildHeader());

    // Stats grid
    content.appendChild(this._buildStats());

    // Activity graph
    content.appendChild(this._buildActivityGraph());

    // Personality panel
    content.appendChild(this._buildPersonality());

    // Relationship map
    content.appendChild(this._buildRelationships());

    // Recent tasks
    content.appendChild(this._buildRecentTasks());

    this._el.appendChild(content);

    // Action buttons (sticky bottom)
    this._el.appendChild(this._buildActions());

    // Draw canvas after layout settles
    requestAnimationFrame(() => {
      this._drawActivityGraph();
      this._animateTraitBars();
    });
  }

  // ── Tab bar ────────────────────────────────────────────────────

  _buildTabs() {
    const tabs = document.createElement('div');
    tabs.className = 'ap-tabs';

    for (const key of AGENT_KEYS) {
      const p = AGENT_PERSONALITIES[key];
      const tab = document.createElement('button');
      tab.className = `ap-tab ap-tab--${key}` + (key === this._activeAgent ? ' ap-tab--active' : '');
      tab.style.setProperty('--agent-color', p.color);

      const emoji = document.createElement('span');
      emoji.className = 'ap-tab__emoji';
      emoji.textContent = p.emoji;
      tab.appendChild(emoji);

      const name = document.createElement('span');
      name.className = 'ap-tab__name';
      name.textContent = p.name.split(' ')[0]; // First name only for tabs
      tab.appendChild(name);

      tab.addEventListener('click', () => {
        if (key === this._activeAgent) return;
        this._activeAgent = key;
        this._renderFull();
      });

      tabs.appendChild(tab);
    }

    return tabs;
  }

  // ── Profile header ─────────────────────────────────────────────

  _buildHeader() {
    const p = AGENT_PERSONALITIES[this._activeAgent];
    const stats = AGENT_STATS[this._activeAgent];
    const traits = AGENT_TRAITS[this._activeAgent];
    const mood = this._getAgentMood();

    const header = document.createElement('div');
    header.className = 'ap-header';

    // Avatar with glow
    const avatar = document.createElement('div');
    avatar.className = 'ap-avatar';
    avatar.textContent = p.emoji;
    header.appendChild(avatar);

    // Name
    const name = document.createElement('h2');
    name.className = 'ap-name';
    name.textContent = p.name;
    header.appendChild(name);

    // Role
    const role = document.createElement('div');
    role.className = 'ap-role';
    role.textContent = p.role;
    header.appendChild(role);

    // Badges row
    const badges = document.createElement('div');
    badges.className = 'ap-badges';

    // Level badge
    const levelBadge = document.createElement('span');
    levelBadge.className = 'ap-badge';
    const level = Math.floor(stats.xpEarned / 1000) + 1;
    levelBadge.textContent = `Lv. ${level}`;
    badges.appendChild(levelBadge);

    // Mood badge
    const moodBadge = document.createElement('span');
    moodBadge.className = 'ap-badge ap-badge--mood';
    moodBadge.textContent = `${MOOD_EMOJI[mood] || '\u{1F3AF}'} ${mood.charAt(0).toUpperCase() + mood.slice(1)}`;
    badges.appendChild(moodBadge);

    // Traits badge
    const traitBadge = document.createElement('span');
    traitBadge.className = 'ap-badge ap-badge--mood';
    traitBadge.textContent = p.traits.join(' \u00b7 ');
    badges.appendChild(traitBadge);

    header.appendChild(badges);

    // Description
    const desc = document.createElement('div');
    desc.className = 'ap-description';
    desc.textContent = traits.commStyle;
    header.appendChild(desc);

    return header;
  }

  // ── Stats grid ─────────────────────────────────────────────────

  _buildStats() {
    const stats = AGENT_STATS[this._activeAgent];
    const section = document.createElement('div');
    section.className = 'ap-section';

    const title = document.createElement('div');
    title.className = 'ap-section__title';
    title.textContent = '\u{1F4CA} Statistics';
    section.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'ap-stats-grid';

    const cards = [
      { icon: '\u{2705}', label: 'Tasks Completed', value: stats.tasksCompleted.toLocaleString(), sub: '' },
      { icon: '\u{2B50}', label: 'XP Earned',       value: stats.xpEarned.toLocaleString(),       sub: '' },
      { icon: '\u{1F513}', label: 'Skills Unlocked', value: `${stats.skillsUnlocked}/5`,          sub: '' },
      { icon: '\u{1F91D}', label: 'Relationships',   value: stats.relationships.toString(),        sub: '' },
      { icon: '\u{1F3E0}', label: 'Favorite Zone',   value: stats.favoriteZone,                   sub: '' },
      { icon: '\u{1F4C5}', label: 'Active Since',    value: stats.activeSince,                    sub: '' },
    ];

    for (const card of cards) {
      const el = document.createElement('div');
      el.className = 'ap-stat-card';

      const label = document.createElement('div');
      label.className = 'ap-stat-card__label';
      label.textContent = `${card.icon} ${card.label}`;
      el.appendChild(label);

      const value = document.createElement('div');
      value.className = 'ap-stat-card__value';
      value.textContent = card.value;
      el.appendChild(value);

      if (card.sub) {
        const sub = document.createElement('div');
        sub.className = 'ap-stat-card__sub';
        sub.textContent = card.sub;
        el.appendChild(sub);
      }

      grid.appendChild(el);
    }

    section.appendChild(grid);
    return section;
  }

  // ── Activity graph (Canvas 2D) ─────────────────────────────────

  _buildActivityGraph() {
    const section = document.createElement('div');
    section.className = 'ap-section';

    const title = document.createElement('div');
    title.className = 'ap-section__title';
    title.textContent = '\u{1F4C8} Activity (Last 30 Days)';
    section.appendChild(title);

    this._activityCanvas = document.createElement('canvas');
    this._activityCanvas.className = 'ap-activity-canvas';
    section.appendChild(this._activityCanvas);

    return section;
  }

  _drawActivityGraph() {
    const canvas = this._activityCanvas;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    this._activityCtx = ctx;

    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;
    const pad = { top: 12, right: 12, bottom: 24, left: 32 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;

    const data = generateActivityData(this._activeAgent);
    const maxVal = Math.max(...data, 1);

    const p = AGENT_PERSONALITIES[this._activeAgent];
    const rgb = hexToRgb(p.color);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (plotH * i) / 4;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
    }

    // Y-axis labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (plotH * i) / 4;
      const val = Math.round(maxVal * (1 - i / 4));
      ctx.fillText(val.toString(), pad.left - 6, y + 3);
    }

    // X-axis labels
    ctx.textAlign = 'center';
    const dayLabels = [0, 9, 19, 29];
    for (const idx of dayLabels) {
      const x = pad.left + (plotW * idx) / (data.length - 1);
      ctx.fillText(`${30 - idx}d`, x, h - 4);
    }

    // Area fill
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top + plotH);
    for (let i = 0; i < data.length; i++) {
      const x = pad.left + (plotW * i) / (data.length - 1);
      const y = pad.top + plotH - (data[i] / maxVal) * plotH;
      if (i === 0) ctx.lineTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(pad.left + plotW, pad.top + plotH);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.2)`);
    gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.01)`);
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = pad.left + (plotW * i) / (data.length - 1);
      const y = pad.top + plotH - (data[i] / maxVal) * plotH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Dots on data points (every 5th)
    for (let i = 0; i < data.length; i += 5) {
      const x = pad.left + (plotW * i) / (data.length - 1);
      const y = pad.top + plotH - (data[i] / maxVal) * plotH;

      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.3)`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  // ── Personality panel ──────────────────────────────────────────

  _buildPersonality() {
    const traits = AGENT_TRAITS[this._activeAgent];
    const section = document.createElement('div');
    section.className = 'ap-section';

    const title = document.createElement('div');
    title.className = 'ap-section__title';
    title.textContent = '\u{1F9E0} Personality';
    section.appendChild(title);

    // Trait bars
    const traitsDef = [
      { name: 'Creativity',    value: traits.creativity },
      { name: 'Precision',     value: traits.precision },
      { name: 'Speed',         value: traits.speed },
      { name: 'Friendliness',  value: traits.friendliness },
      { name: 'Independence',  value: traits.independence },
    ];

    const traitsWrap = document.createElement('div');
    traitsWrap.className = 'ap-traits';

    for (const t of traitsDef) {
      const trait = document.createElement('div');
      trait.className = 'ap-trait';

      const header = document.createElement('div');
      header.className = 'ap-trait__header';

      const tName = document.createElement('span');
      tName.className = 'ap-trait__name';
      tName.textContent = t.name;
      header.appendChild(tName);

      const tValue = document.createElement('span');
      tValue.className = 'ap-trait__value';
      tValue.textContent = `${t.value}/100`;
      header.appendChild(tValue);

      trait.appendChild(header);

      const barOuter = document.createElement('div');
      barOuter.className = 'ap-trait__bar-outer';

      const barInner = document.createElement('div');
      barInner.className = 'ap-trait__bar-inner';
      barInner.style.setProperty('--trait-width', `${t.value}%`);

      barOuter.appendChild(barInner);
      trait.appendChild(barOuter);
      traitsWrap.appendChild(trait);
    }

    section.appendChild(traitsWrap);

    // Communication style
    const commStyle = document.createElement('div');
    commStyle.className = 'ap-comm-style';

    const commLabel = document.createElement('div');
    commLabel.className = 'ap-comm-style__label';
    commLabel.textContent = 'Communication Style';
    commStyle.appendChild(commLabel);

    const commText = document.createElement('div');
    commText.className = 'ap-comm-style__text';
    commText.textContent = traits.commStyle;
    commStyle.appendChild(commText);

    section.appendChild(commStyle);

    // Preferred zones
    const zonesLabel = document.createElement('div');
    zonesLabel.className = 'ap-comm-style__label';
    zonesLabel.textContent = 'Preferred Zones';
    zonesLabel.style.marginTop = '12px';
    section.appendChild(zonesLabel);

    const zonesWrap = document.createElement('div');
    zonesWrap.className = 'ap-preferred-zones';

    for (const zoneId of traits.zones) {
      const chip = document.createElement('button');
      chip.className = 'ap-zone-chip';
      chip.textContent = ZONE_DISPLAY[zoneId] || zoneId;
      chip.addEventListener('click', () => {
        document.dispatchEvent(new CustomEvent('zone-open', {
          detail: { zoneId, zoneName: ZONE_DISPLAY[zoneId] || zoneId },
          bubbles: true,
        }));
      });
      zonesWrap.appendChild(chip);
    }

    section.appendChild(zonesWrap);
    return section;
  }

  // ── Animate trait bars ─────────────────────────────────────────

  _animateTraitBars() {
    // Trigger CSS transition by adding data-animated after a frame
    requestAnimationFrame(() => {
      const bars = this._el.querySelectorAll('.ap-trait__bar-inner');
      for (const bar of bars) {
        bar.setAttribute('data-animated', '');
      }
    });
  }

  // ── Relationship map ───────────────────────────────────────────

  _buildRelationships() {
    const rels = AGENT_RELATIONSHIPS[this._activeAgent] || [];
    const section = document.createElement('div');
    section.className = 'ap-section';

    const title = document.createElement('div');
    title.className = 'ap-section__title';
    title.textContent = '\u{1F91D} Relationships';
    section.appendChild(title);

    const wrap = document.createElement('div');
    wrap.className = 'ap-relationships';

    for (const rel of rels) {
      const target = AGENT_PERSONALITIES[rel.target];
      if (!target) continue;

      const row = document.createElement('div');
      row.className = 'ap-rel-row';
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        this._activeAgent = rel.target;
        this._renderFull();
      });

      // Avatar
      const avatar = document.createElement('div');
      avatar.className = 'ap-rel-avatar';
      avatar.style.background = `rgba(${hexToRgb(target.color).r}, ${hexToRgb(target.color).g}, ${hexToRgb(target.color).b}, 0.2)`;
      avatar.style.border = `1px solid ${target.color}`;
      avatar.textContent = target.emoji;
      row.appendChild(avatar);

      // Info
      const info = document.createElement('div');
      info.className = 'ap-rel-info';

      const name = document.createElement('div');
      name.className = 'ap-rel-name';
      name.textContent = target.name;
      info.appendChild(name);

      const typeDesc = document.createElement('div');
      typeDesc.className = 'ap-rel-type';
      typeDesc.textContent = rel.desc;
      info.appendChild(typeDesc);

      row.appendChild(info);

      // Colored relationship line
      const line = document.createElement('div');
      line.className = `ap-rel-line ap-rel-line--${rel.type}`;
      row.appendChild(line);

      wrap.appendChild(row);
    }

    section.appendChild(wrap);
    return section;
  }

  // ── Recent tasks ───────────────────────────────────────────────

  _buildRecentTasks() {
    const tasks = generateRecentTasks(this._activeAgent);
    const section = document.createElement('div');
    section.className = 'ap-section';

    const title = document.createElement('div');
    title.className = 'ap-section__title';
    title.textContent = '\u{1F4DD} Recent Tasks';
    section.appendChild(title);

    const wrap = document.createElement('div');
    wrap.className = 'ap-tasks';

    for (const task of tasks) {
      const row = document.createElement('div');
      row.className = 'ap-task-row';

      // Status dot
      const statusDot = document.createElement('div');
      statusDot.className = `ap-task-status ap-task-status--${task.status}`;
      row.appendChild(statusDot);

      // Content
      const content = document.createElement('div');
      content.className = 'ap-task-content';

      const prompt = document.createElement('div');
      prompt.className = 'ap-task-prompt';
      prompt.textContent = task.prompt;
      content.appendChild(prompt);

      const meta = document.createElement('div');
      meta.className = 'ap-task-meta';
      meta.textContent = `${task.status === 'done' ? 'Completed' : task.status === 'error' ? 'Failed' : 'Pending'} \u00b7 ${relativeTime(task.time)}`;
      content.appendChild(meta);

      row.appendChild(content);
      wrap.appendChild(row);
    }

    section.appendChild(wrap);
    return section;
  }

  // ── Action buttons ─────────────────────────────────────────────

  _buildActions() {
    const p = AGENT_PERSONALITIES[this._activeAgent];
    const actions = document.createElement('div');
    actions.className = 'ap-actions';

    // Talk to agent button
    const chatBtn = document.createElement('button');
    chatBtn.className = 'ap-action-btn ap-action-btn--primary';
    chatBtn.innerHTML = `\u{1F4AC} Talk to ${p.name.split(' ')[0]}`;
    chatBtn.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('agent-click', {
        detail: { agentId: this._activeAgent, agentKey: this._activeAgent },
        bubbles: true,
      }));
    });
    actions.appendChild(chatBtn);

    // View skills button
    const skillBtn = document.createElement('button');
    skillBtn.className = 'ap-action-btn ap-action-btn--secondary';
    skillBtn.innerHTML = `\u{1F333} View Skills`;
    skillBtn.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('zone-open', {
        detail: { zoneId: 'skill-tree', zoneName: 'Skill Tree', agentId: this._activeAgent },
        bubbles: true,
      }));
    });
    actions.appendChild(skillBtn);

    return actions;
  }

  // ── Helpers ────────────────────────────────────────────────────

  _getAgentMood() {
    // Try to read from the personality engine if available
    try {
      const engine = window.__personalityEngine;
      if (engine && engine.getMood) {
        return engine.getMood(this._activeAgent) || 'focused';
      }
    } catch (_) { /* ignore */ }
    return 'focused';
  }

  _handleResize() {
    if (this._activityCanvas) {
      this._drawActivityGraph();
    }
  }
}
