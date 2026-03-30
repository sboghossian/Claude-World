/**
 * panels.js — Slide-in side panel system for Claude World
 *
 * Supports ZonePanel, AgentPanel, SettingsPanel, and zone-specific panels.
 * Only one panel open at a time. Slides from the right, 400px wide.
 * Body gets class "panel-open" so HUD elements can shift.
 */

import { buildTreasuryContent, loadTreasuryStyles } from '../zones/treasury.js';
import { buildConnectorDocksContent, loadConnectorDocksStyles } from '../zones/connector-docks.js';
import { ChatRooms } from '../zones/chat-rooms.js';
import { MinionTunnels } from '../zones/minion-tunnels.js';
import { LegalTower } from '../zones/legal-tower.js';
import { buildCouncilContent, loadCouncilStyles } from '../zones/council.js';
import { Archive } from '../zones/archive.js';
import { RndLab } from '../zones/rnd-lab.js';
import { buildIdentityPanelContent } from '../zones/identity-panel.js';
import { SalesDistrict } from '../zones/sales-district.js';
import { MarketingPlaza } from '../zones/marketing-plaza.js';
import { Exchange } from '../zones/exchange.js';
import { Market } from '../zones/market.js';
import { Airport } from '../zones/airport.js';
import { GlobeRoom } from '../zones/globe-room.js';
import { BroadcastTower } from '../zones/broadcast-tower.js';
import { WorldVersions } from '../zones/world-versions.js';
import { MissionControl } from '../zones/mission-control.js';
import { Analytics } from '../zones/analytics.js';
import { Settings, buildSettingsContent } from '../zones/settings.js';
import { Reports } from '../zones/reports.js';
import { AchievementsPanel } from './achievements-panel.js';
import { Timeline } from '../zones/timeline.js';
import { HomeDashboard } from '../zones/home-dashboard.js';
import { Kanban } from '../zones/kanban.js';
import { KnowledgeGraph } from '../zones/knowledge-graph.js';
import { AutomationBuilder } from '../zones/automation-builder.js';
import { SkillTree } from '../zones/skill-tree.js';

// ── Panel content builders ──────────────────────────────────────

const ZONE_INFO = {
  dispatch: { icon: '\u{1F3F0}', desc: 'The central command hub of Claude World. All tasks originate here.' },
  brain: { icon: '\u{1F4DA}', desc: 'The Brain Library stores knowledge, context, and learned patterns.' },
  chat: { icon: '\u{1F4AC}', desc: 'Multi-room chat system for parallel conversations with agents.' },
  memory: { icon: '\u{1F5C4}', desc: 'Long-term memory vault. Stores facts, preferences, and history.' },
  skills: { icon: '\u{1F3AF}', desc: 'Where agents learn and practice new capabilities.' },
  minions: { icon: '\u{26CF}', desc: 'Autonomous worker tunnels for background task processing.' },
  treasury: { icon: '\u{1F4B0}', desc: 'Budget management, cost tracking, and financial controls.' },
  sales: { icon: '\u{1F4C8}', desc: 'Outreach automation, lead management, and pipeline tracking.' },
  marketing: { icon: '\u{1F4E3}', desc: 'Content creation, scheduling, and campaign management.' },
  exchange: { icon: '\u{1F504}', desc: 'API integration hub. Connect external services.' },
  market: { icon: '\u{1F6D2}', desc: 'Marketplace for skills, templates, and agent configs.' },
  council: { icon: '\u{1F3DB}', desc: 'Multi-agent deliberation for complex decisions.' },
  rnd: { icon: '\u{1F52C}', desc: 'Experimental lab for testing new approaches.' },
  legal: { icon: '\u{2696}', desc: 'Compliance, policy enforcement, and safety checks.' },
  archive: { icon: '\u{1F4DC}', desc: 'Deep archive of all past interactions and artifacts.' },
  docks: { icon: '\u{2693}', desc: 'Connect external tools, APIs, and data sources.' },
  airport: { icon: '\u{2708}', desc: 'Import/export data and deploy agents externally.' },
  globe: { icon: '\u{1F310}', desc: 'Web browsing and real-time information access.' },
  broadcast: { icon: '\u{1F4E1}', desc: 'Publish outputs, webhooks, and notifications.' },
  'mission-control': { icon: '\u{1F6F0}', desc: 'Real-time war room. All agents, zones, and events in one view.' },
  mission_control: { icon: '\u{1F6F0}', desc: 'Real-time war room. All agents, zones, and events in one view.' },
  analytics: { icon: '\u{1F4CA}', desc: 'Usage analytics, charts, and world health score.' },
  settings: { icon: '\u{2699}', desc: 'World settings, AI providers, appearance, audio, and privacy.' },
  reports: { icon: '\u{1F4CB}', desc: 'Generate and export weekly, cost, and performance reports.' },
  achievements: { icon: '\u{1F3C6}', desc: 'Badges, milestones, and progression tracking.' },
  timeline: { icon: '\u{1F4C5}', desc: 'Chronological history of everything that happened in your world.' },
  home: { icon: '\u{1F3E0}', desc: 'Your personalized dashboard with stats, agents, and quick actions.' },
  kanban: { icon: '\u{1F4CB}', desc: 'Kanban task board with drag-and-drop columns.' },
  'knowledge-graph': { icon: '\u{1F578}', desc: 'Force-directed graph of zones, agents, tasks, and skills.' },
  automations: { icon: '\u{2699}', desc: 'Visual workflow builder for automating tasks.' },
  'skill-tree': { icon: '\u{1F333}', desc: 'Agent skill trees with XP-based unlock progression.' },
};

const AGENT_INFO = {
  commander: { icon: '\u{1F451}', name: 'Commander', personality: 'Strategic, decisive, task-oriented', level: 3 },
  librarian: { icon: '\u{1F4DA}', name: 'Librarian', personality: 'Methodical, curious, knowledge-driven', level: 2 },
  archivist: { icon: '\u{1F4DC}', name: 'Archivist', personality: 'Meticulous, patient, detail-focused', level: 2 },
  instructor: { icon: '\u{1F393}', name: 'Instructor', personality: 'Patient, adaptive, skill-focused', level: 1 },
  dockmaster: { icon: '\u{2693}', name: 'Dockmaster', personality: 'Practical, reliable, integration-savvy', level: 1 },
};


/**
 * Build zone panel content.
 * @param {string} zoneId
 * @returns {HTMLElement}
 */
function buildZoneContent(zoneId) {
  // Zone-specific panel builders
  if (zoneId === 'treasury') {
    loadTreasuryStyles('../zones/');
    return buildTreasuryContent({ worldId: window.__claudeWorldId || null });
  }

  if (zoneId === 'docks') {
    loadConnectorDocksStyles('../zones/');
    return buildConnectorDocksContent({ worldId: window.__claudeWorldId || null });
  }

  if (zoneId === 'chat') {
    const chatRooms = new ChatRooms();
    const el = chatRooms.render();
    chatRooms.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'minions') {
    const minionTunnels = new MinionTunnels();
    const el = minionTunnels.render();
    minionTunnels.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'legal') {
    const legal = new LegalTower();
    const el = legal.render();
    legal.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'council') {
    loadCouncilStyles('../zones/');
    return buildCouncilContent(window.__claudeWorldId || 1);
  }

  if (zoneId === 'archive') {
    const archive = new Archive();
    const el = archive.render();
    archive.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'rnd') {
    const rnd = new RndLab();
    const el = rnd.render();
    rnd.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'identity') {
    return buildIdentityPanelContent({ worldId: window.__claudeWorldId || 1 });
  }

  if (zoneId === 'sales') {
    const sales = new SalesDistrict();
    const el = sales.render();
    sales.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'marketing') {
    const marketing = new MarketingPlaza();
    const el = marketing.render();
    marketing.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'exchange') {
    const exchange = new Exchange();
    const el = exchange.render();
    exchange.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'market') {
    const market = new Market();
    const el = market.render();
    market.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'airport') {
    const airport = new Airport();
    const el = airport.render();
    airport.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'globe') {
    const globe = new GlobeRoom();
    const el = globe.render();
    globe.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'broadcast') {
    const broadcast = new BroadcastTower();
    const el = broadcast.render();
    broadcast.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'versions') {
    const versions = new WorldVersions();
    const el = versions.render();
    versions.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'mission-control' || zoneId === 'mission_control') {
    const mc = new MissionControl();
    const el = mc.render();
    mc.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'analytics') {
    const analytics = new Analytics();
    const el = analytics.render();
    analytics.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'settings') {
    return buildSettingsContent({ worldId: window.__claudeWorldId || 1 });
  }

  if (zoneId === 'reports') {
    const reports = new Reports();
    const el = reports.render();
    reports.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'achievements') {
    const achievements = new AchievementsPanel();
    const el = achievements.render();
    achievements.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'timeline') {
    const timeline = new Timeline();
    const el = timeline.render();
    timeline.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'home') {
    const home = new HomeDashboard();
    const el = home.render();
    home.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'kanban') {
    const kanban = new Kanban();
    const el = kanban.render();
    kanban.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'knowledge-graph') {
    const kg = new KnowledgeGraph();
    const el = kg.render();
    kg.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'automations') {
    const ab = new AutomationBuilder();
    const el = ab.render();
    ab.init(window.__claudeWorldId || 1);
    return el;
  }

  if (zoneId === 'skill-tree') {
    const st = new SkillTree();
    const el = st.render();
    st.init(window.__claudeWorldId || 1);
    return el;
  }

  const info = ZONE_INFO[zoneId] || { icon: '\u{1F3D7}', desc: 'Unknown zone.' };
  const frag = document.createElement('div');

  // Description section
  const descSection = createSection('About', info.desc);
  frag.appendChild(descSection);

  // Agents section
  const agentsSection = document.createElement('div');
  agentsSection.className = 'panel__section';
  const agentsTitle = document.createElement('div');
  agentsTitle.className = 'panel__section-title';
  agentsTitle.textContent = 'Agents';
  agentsSection.appendChild(agentsTitle);

  const agentsList = Object.entries(AGENT_INFO)
    .filter(([, a]) => true) // Show all for now
    .slice(0, 3);

  if (agentsList.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'panel__section-content';
    empty.textContent = 'No agents assigned to this zone.';
    agentsSection.appendChild(empty);
  } else {
    for (const [id, agent] of agentsList) {
      const row = document.createElement('div');
      row.className = 'panel__stat-row';
      const label = document.createElement('span');
      label.className = 'panel__stat-label';
      label.textContent = `${agent.icon} ${agent.name}`;
      const value = document.createElement('span');
      value.className = 'panel__stat-value';
      value.textContent = `Lv.${agent.level}`;
      row.appendChild(label);
      row.appendChild(value);
      agentsSection.appendChild(row);
    }
  }
  frag.appendChild(agentsSection);

  // Recent tasks placeholder
  const tasksSection = createSection('Recent Tasks', 'No recent tasks in this zone.');
  frag.appendChild(tasksSection);

  // Quick actions
  const actionsSection = document.createElement('div');
  actionsSection.className = 'panel__section';
  const actionsTitle = document.createElement('div');
  actionsTitle.className = 'panel__section-title';
  actionsTitle.textContent = 'Quick Actions';
  actionsSection.appendChild(actionsTitle);

  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'panel__actions';
  for (const label of ['New Task', 'View History', 'Configure']) {
    const btn = document.createElement('button');
    btn.className = 'panel__action-btn';
    btn.textContent = label;
    btn.addEventListener('click', () => {
      document.dispatchEvent(new CustomEvent('panel:action', {
        detail: { zoneId, action: label.toLowerCase().replace(/\s+/g, '-') },
        bubbles: true,
      }));
    });
    actionsWrap.appendChild(btn);
  }
  actionsSection.appendChild(actionsWrap);
  frag.appendChild(actionsSection);

  return frag;
}

/**
 * Build agent panel content.
 * @param {string} agentId
 * @returns {HTMLElement}
 */
function buildAgentContent(agentId) {
  const info = AGENT_INFO[agentId] || { icon: '\u{1F916}', name: 'Unknown', personality: '...', level: 1 };
  const frag = document.createElement('div');

  // Avatar
  const avatar = document.createElement('div');
  avatar.className = 'panel__avatar';
  avatar.textContent = info.icon;
  frag.appendChild(avatar);

  // Stats
  const statsSection = document.createElement('div');
  statsSection.className = 'panel__section';

  const stats = [
    ['Personality', info.personality],
    ['Level', `${info.level}`],
    ['Status', 'Idle'],
    ['Tasks Completed', '0'],
  ];

  for (const [label, value] of stats) {
    const row = document.createElement('div');
    row.className = 'panel__stat-row';
    const labelEl = document.createElement('span');
    labelEl.className = 'panel__stat-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'panel__stat-value';
    valueEl.textContent = value;
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    statsSection.appendChild(row);
  }
  frag.appendChild(statsSection);

  // Dialogue area
  const dialogueSection = document.createElement('div');
  dialogueSection.className = 'panel__section';
  const dialogueTitle = document.createElement('div');
  dialogueTitle.className = 'panel__section-title';
  dialogueTitle.textContent = 'Dialogue';
  dialogueSection.appendChild(dialogueTitle);

  const dialogue = document.createElement('div');
  dialogue.className = 'panel__dialogue';
  dialogue.textContent = `${info.name} is awaiting your instructions...`;
  dialogueSection.appendChild(dialogue);
  frag.appendChild(dialogueSection);

  // Task input
  const inputSection = document.createElement('div');
  inputSection.className = 'panel__section';
  const inputTitle = document.createElement('div');
  inputTitle.className = 'panel__section-title';
  inputTitle.textContent = 'Assign Task';
  inputSection.appendChild(inputTitle);

  const inputWrap = document.createElement('div');
  inputWrap.className = 'panel__task-input-wrap';

  const input = document.createElement('input');
  input.className = 'panel__task-input';
  input.type = 'text';
  input.placeholder = `Ask ${info.name}...`;
  input.setAttribute('aria-label', `Task input for ${info.name}`);
  inputWrap.appendChild(input);

  const sendBtn = document.createElement('button');
  sendBtn.className = 'panel__task-btn';
  sendBtn.textContent = 'Send';
  sendBtn.addEventListener('click', () => {
    if (input.value.trim()) {
      document.dispatchEvent(new CustomEvent('panel:agent-task', {
        detail: { agentId, task: input.value.trim() },
        bubbles: true,
      }));
      input.value = '';
    }
  });
  inputWrap.appendChild(sendBtn);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      sendBtn.click();
    }
  });

  inputSection.appendChild(inputWrap);
  frag.appendChild(inputSection);

  return frag;
}

/**
 * Build settings panel content.
 * @returns {HTMLElement}
 */
function buildSettingsContent() {
  const frag = document.createElement('div');

  // API Keys
  const keysSection = document.createElement('div');
  keysSection.className = 'panel__section';
  const keysTitle = document.createElement('div');
  keysTitle.className = 'panel__section-title';
  keysTitle.textContent = 'API Keys';
  keysSection.appendChild(keysTitle);

  for (const provider of ['Anthropic', 'OpenAI', 'Google']) {
    const group = document.createElement('div');
    group.className = 'panel__form-group';

    const label = document.createElement('label');
    label.className = 'panel__form-label';
    label.textContent = `${provider} API Key`;

    const input = document.createElement('input');
    input.className = 'panel__form-input';
    input.type = 'password';
    input.placeholder = `sk-...`;
    input.setAttribute('aria-label', `${provider} API Key`);

    group.appendChild(label);
    group.appendChild(input);
    keysSection.appendChild(group);
  }
  frag.appendChild(keysSection);

  // Budget settings
  const budgetSection = document.createElement('div');
  budgetSection.className = 'panel__section';
  const budgetTitle = document.createElement('div');
  budgetTitle.className = 'panel__section-title';
  budgetTitle.textContent = 'Budget';
  budgetSection.appendChild(budgetTitle);

  const budgetGroup = document.createElement('div');
  budgetGroup.className = 'panel__form-group';
  const budgetLabel = document.createElement('label');
  budgetLabel.className = 'panel__form-label';
  budgetLabel.textContent = 'Monthly Budget ($)';
  const budgetInput = document.createElement('input');
  budgetInput.className = 'panel__form-input';
  budgetInput.type = 'number';
  budgetInput.value = '10.00';
  budgetInput.min = '0';
  budgetInput.step = '1';
  budgetInput.setAttribute('aria-label', 'Monthly budget in dollars');
  budgetGroup.appendChild(budgetLabel);
  budgetGroup.appendChild(budgetInput);
  budgetSection.appendChild(budgetGroup);
  frag.appendChild(budgetSection);

  // World settings
  const worldSection = document.createElement('div');
  worldSection.className = 'panel__section';
  const worldTitle = document.createElement('div');
  worldTitle.className = 'panel__section-title';
  worldTitle.textContent = 'World';
  worldSection.appendChild(worldTitle);

  const worldContent = document.createElement('div');
  worldContent.className = 'panel__section-content';
  worldContent.textContent = 'Additional world settings will appear here as features unlock.';
  worldSection.appendChild(worldContent);
  frag.appendChild(worldSection);

  return frag;
}


/**
 * Helper: create a simple section with title and text content.
 */
function createSection(title, text) {
  const section = document.createElement('div');
  section.className = 'panel__section';
  const titleEl = document.createElement('div');
  titleEl.className = 'panel__section-title';
  titleEl.textContent = title;
  section.appendChild(titleEl);
  const content = document.createElement('div');
  content.className = 'panel__section-content';
  content.textContent = text;
  section.appendChild(content);
  return section;
}


// ── PanelManager class ──────────────────────────────────────────

export class PanelManager {
  constructor() {
    /** @type {string|null} */
    this._currentType = null;
    /** @type {string|null} */
    this._currentId = null;

    this._createDOM();
    this._bindEvents();
  }

  _createDOM() {
    this._overlay = document.createElement('div');
    this._overlay.className = 'panel-overlay';
    this._overlay.setAttribute('role', 'complementary');
    this._overlay.setAttribute('aria-label', 'Side panel');

    this._panel = document.createElement('div');
    this._panel.className = 'panel';

    // Header
    this._header = document.createElement('div');
    this._header.className = 'panel__header';

    this._headerIcon = document.createElement('span');
    this._headerIcon.className = 'panel__header-icon';

    this._title = document.createElement('span');
    this._title.className = 'panel__title';

    this._closeBtn = document.createElement('button');
    this._closeBtn.className = 'panel__close';
    this._closeBtn.setAttribute('aria-label', 'Close panel');
    this._closeBtn.textContent = '\u00D7';

    this._header.appendChild(this._headerIcon);
    this._header.appendChild(this._title);
    this._header.appendChild(this._closeBtn);
    this._panel.appendChild(this._header);

    // Body
    this._body = document.createElement('div');
    this._body.className = 'panel__body';
    this._panel.appendChild(this._body);

    this._overlay.appendChild(this._panel);
    document.body.appendChild(this._overlay);
  }

  _bindEvents() {
    this._closeBtn.addEventListener('click', () => this.close());
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Open a zone panel.
   * @param {string} zoneId
   * @param {string} zoneName
   */
  openZone(zoneId, zoneName) {
    const info = ZONE_INFO[zoneId] || { icon: '\u{1F3D7}' };
    this._show('zone', zoneId, info.icon, zoneName, buildZoneContent(zoneId));
  }

  /**
   * Open an agent panel.
   * @param {string} agentId
   */
  openAgent(agentId) {
    const info = AGENT_INFO[agentId] || { icon: '\u{1F916}', name: 'Unknown' };
    this._show('agent', agentId, info.icon, info.name, buildAgentContent(agentId));
  }

  /**
   * Open the settings panel.
   */
  openSettings() {
    this._show('settings', 'settings', '\u{2699}\uFE0F', 'Settings', buildSettingsContent());
  }

  /**
   * Close the panel.
   */
  close() {
    this._overlay.classList.remove('open');
    document.body.classList.remove('panel-open');
    this._currentType = null;
    this._currentId = null;

    document.dispatchEvent(new CustomEvent('panel:closed', { bubbles: true }));
  }

  /** @returns {boolean} */
  get isOpen() {
    return this._overlay.classList.contains('open');
  }

  /** Tear down. */
  destroy() {
    this._overlay.remove();
    document.body.classList.remove('panel-open');
  }

  // ── Internal ────────────────────────────────────────────────────

  _show(type, id, icon, title, contentEl) {
    // If same panel already open, close instead (toggle)
    if (this._currentType === type && this._currentId === id && this.isOpen) {
      this.close();
      return;
    }

    this._currentType = type;
    this._currentId = id;
    this._headerIcon.textContent = icon;
    this._title.textContent = title;

    this._body.innerHTML = '';
    this._body.appendChild(contentEl);

    this._overlay.classList.add('open');
    document.body.classList.add('panel-open');

    document.dispatchEvent(new CustomEvent('panel:opened', {
      detail: { type, id },
      bubbles: true,
    }));
  }
}
