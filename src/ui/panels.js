/**
 * panels.js — Slide-in side panel system for Claude World
 *
 * Supports ZonePanel, AgentPanel, SettingsPanel, and zone-specific panels.
 * Only one panel open at a time. Slides from the right, 400px wide.
 * Body gets class "panel-open" so HUD elements can shift.
 */

import { getPluginManager } from "../systems/plugin-api.js";

// ── Lazy module cache ──────────────────────────────────────────
// Caches dynamically imported zone modules so each is fetched only once.
const _moduleCache = new Map();

/**
 * Lazy-load a zone module and cache it.
 * @param {string} path - relative path to the module (e.g. "../zones/dispatch.js")
 * @returns {Promise<Object>} the module namespace
 */
async function _loadZoneModule(path) {
  if (_moduleCache.has(path)) return _moduleCache.get(path);
  const mod = await import(path);
  _moduleCache.set(path, mod);
  return mod;
}

/**
 * Create a small loading spinner element shown while a zone module loads.
 * @returns {HTMLElement}
 */
function _createLoadingIndicator() {
  const wrapper = document.createElement("div");
  wrapper.className = "panel__loading";
  wrapper.style.cssText =
    "display:flex;align-items:center;justify-content:center;padding:48px 0;gap:10px;color:#aaa;font-size:14px;";
  const spinner = document.createElement("div");
  spinner.style.cssText =
    "width:20px;height:20px;border:2px solid #555;border-top-color:#aaa;border-radius:50%;animation:panel-spin .6s linear infinite;";
  // Inject keyframes once
  if (!document.getElementById("panel-spin-style")) {
    const style = document.createElement("style");
    style.id = "panel-spin-style";
    style.textContent = "@keyframes panel-spin{to{transform:rotate(360deg)}}";
    document.head.appendChild(style);
  }
  const label = document.createElement("span");
  label.textContent = "Loading zone\u2026";
  wrapper.appendChild(spinner);
  wrapper.appendChild(label);
  return wrapper;
}

// ── Panel content builders ──────────────────────────────────────

const ZONE_INFO = {
  dispatch: {
    icon: "\u{1F3F0}",
    desc: "The central command hub of Claude World. All tasks originate here.",
  },
  brain: {
    icon: "\u{1F4DA}",
    desc: "The Brain Library stores knowledge, context, and learned patterns.",
  },
  chat: {
    icon: "\u{1F4AC}",
    desc: "Multi-room chat system for parallel conversations with agents.",
  },
  memory: {
    icon: "\u{1F5C4}",
    desc: "Long-term memory vault. Stores facts, preferences, and history.",
  },
  skills: {
    icon: "\u{1F3AF}",
    desc: "Where agents learn and practice new capabilities.",
  },
  minions: {
    icon: "\u{26CF}",
    desc: "Autonomous worker tunnels for background task processing.",
  },
  treasury: {
    icon: "\u{1F4B0}",
    desc: "Budget management, cost tracking, and financial controls.",
  },
  sales: {
    icon: "\u{1F4C8}",
    desc: "Outreach automation, lead management, and pipeline tracking.",
  },
  marketing: {
    icon: "\u{1F4E3}",
    desc: "Content creation, scheduling, and campaign management.",
  },
  exchange: {
    icon: "\u{1F504}",
    desc: "API integration hub. Connect external services.",
  },
  market: {
    icon: "\u{1F6D2}",
    desc: "Marketplace for skills, templates, and agent configs.",
  },
  council: {
    icon: "\u{1F3DB}",
    desc: "Multi-agent deliberation for complex decisions.",
  },
  rnd: {
    icon: "\u{1F52C}",
    desc: "Experimental lab for testing new approaches.",
  },
  legal: {
    icon: "\u{2696}",
    desc: "Compliance, policy enforcement, and safety checks.",
  },
  archive: {
    icon: "\u{1F4DC}",
    desc: "Deep archive of all past interactions and artifacts.",
  },
  docks: {
    icon: "\u{2693}",
    desc: "Connect external tools, APIs, and data sources.",
  },
  airport: {
    icon: "\u{2708}",
    desc: "Import/export data and deploy agents externally.",
  },
  globe: {
    icon: "\u{1F310}",
    desc: "Web browsing and real-time information access.",
  },
  broadcast: {
    icon: "\u{1F4E1}",
    desc: "Publish outputs, webhooks, and notifications.",
  },
  "mission-control": {
    icon: "\u{1F6F0}",
    desc: "Real-time war room. All agents, zones, and events in one view.",
  },
  mission_control: {
    icon: "\u{1F6F0}",
    desc: "Real-time war room. All agents, zones, and events in one view.",
  },
  analytics: {
    icon: "\u{1F4CA}",
    desc: "Usage analytics, charts, and world health score.",
  },
  settings: {
    icon: "\u{2699}",
    desc: "World settings, AI providers, appearance, audio, and privacy.",
  },
  reports: {
    icon: "\u{1F4CB}",
    desc: "Generate and export weekly, cost, and performance reports.",
  },
  achievements: {
    icon: "\u{1F3C6}",
    desc: "Badges, milestones, and progression tracking.",
  },
  timeline: {
    icon: "\u{1F4C5}",
    desc: "Chronological history of everything that happened in your world.",
  },
  home: {
    icon: "\u{1F3E0}",
    desc: "Your personalized dashboard with stats, agents, and quick actions.",
  },
  kanban: {
    icon: "\u{1F4CB}",
    desc: "Kanban task board with drag-and-drop columns.",
  },
  "knowledge-graph": {
    icon: "\u{1F578}",
    desc: "Force-directed graph of zones, agents, tasks, and skills.",
  },
  automations: {
    icon: "\u{2699}",
    desc: "Visual workflow builder for automating tasks.",
  },
  "skill-tree": {
    icon: "\u{1F333}",
    desc: "Agent skill trees with XP-based unlock progression.",
  },
  calendar: {
    icon: "\u{1F4C5}",
    desc: "Calendar with scheduled tasks, events, and milestones.",
  },
  sharing: { icon: "\u{1F4E4}", desc: "Export, import, and share your world." },
  leaderboard: {
    icon: "\u{1F3C6}",
    desc: "World stats, agent rankings, records & activity heatmap.",
  },
  "prompt-library": {
    icon: "\u{1F4DD}",
    desc: "Save, organize, and reuse AI prompts with variable substitution.",
  },
  prompt_library: {
    icon: "\u{1F4DD}",
    desc: "Save, organize, and reuse AI prompts with variable substitution.",
  },
  conversations: {
    icon: "\u{1F4AC}",
    desc: "Browse and search all past AI interactions with full detail.",
  },
  "world-map": {
    icon: "\u{1F5FA}",
    desc: "Top-down overview of the entire city with zone status and connections.",
  },
  world_map: {
    icon: "\u{1F5FA}",
    desc: "Top-down overview of the entire city with zone status and connections.",
  },
  plugins: {
    icon: "\u{1F9E9}",
    desc: "Browse, install, and manage community plugins and extensions.",
  },
  "agent-profile": {
    icon: "\u{1F464}",
    desc: "Detailed agent profile with stats, personality, and relationships.",
  },
  backups: {
    icon: "\u{1F4BE}",
    desc: "Backup and restore your world database. Auto-backup settings.",
  },
  "mcp-hub": {
    icon: "\u{1F50C}",
    desc: "Model Context Protocol hub. Connect AI agents to external tools and data sources.",
  },
  mcp_hub: {
    icon: "\u{1F50C}",
    desc: "Model Context Protocol hub. Connect AI agents to external tools and data sources.",
  },
  "daily-digest": {
    icon: "\u{1F4F0}",
    desc: "AI-powered daily summaries with stats, insights, goals, and weekly trends.",
  },
  daily_digest: {
    icon: "\u{1F4F0}",
    desc: "AI-powered daily summaries with stats, insights, goals, and weekly trends.",
  },
};

const AGENT_INFO = {
  commander: {
    icon: "\u{1F451}",
    name: "Commander",
    personality: "Strategic, decisive, task-oriented",
    level: 3,
  },
  librarian: {
    icon: "\u{1F4DA}",
    name: "Librarian",
    personality: "Methodical, curious, knowledge-driven",
    level: 2,
  },
  archivist: {
    icon: "\u{1F4DC}",
    name: "Archivist",
    personality: "Meticulous, patient, detail-focused",
    level: 2,
  },
  instructor: {
    icon: "\u{1F393}",
    name: "Instructor",
    personality: "Patient, adaptive, skill-focused",
    level: 1,
  },
  dockmaster: {
    icon: "\u{2693}",
    name: "Dockmaster",
    personality: "Practical, reliable, integration-savvy",
    level: 1,
  },
};

/**
 * Build zone panel content (lazy-loads the zone module on demand).
 * @param {string} zoneId
 * @returns {Promise<HTMLElement>}
 */
async function buildZoneContent(zoneId) {
  const wid = window.__claudeWorldId || 1;

  // Helper: instantiate a class-based zone (render + init pattern)
  function initZone(Ctor, ...initArgs) {
    const inst = new Ctor();
    const el = inst.render();
    inst.init(...initArgs);
    return el;
  }

  // Zone-specific panel builders (lazy-loaded)

  if (zoneId === "dispatch") {
    const { Dispatch } = await _loadZoneModule("../zones/dispatch.js");
    return initZone(Dispatch, wid);
  }

  if (zoneId === "treasury") {
    const { buildTreasuryContent, loadTreasuryStyles } = await _loadZoneModule(
      "../zones/treasury.js",
    );
    loadTreasuryStyles("../zones/");
    return buildTreasuryContent({ worldId: window.__claudeWorldId || null });
  }

  if (zoneId === "docks") {
    const { buildConnectorDocksContent, loadConnectorDocksStyles } =
      await _loadZoneModule("../zones/connector-docks.js");
    loadConnectorDocksStyles("../zones/");
    return buildConnectorDocksContent({
      worldId: window.__claudeWorldId || null,
    });
  }

  if (zoneId === "chat") {
    const { ChatRooms } = await _loadZoneModule("../zones/chat-rooms.js");
    return initZone(ChatRooms, wid);
  }

  if (zoneId === "minions") {
    const { MinionTunnels } = await _loadZoneModule(
      "../zones/minion-tunnels.js",
    );
    return initZone(MinionTunnels, wid);
  }

  if (zoneId === "legal") {
    const { LegalTower } = await _loadZoneModule("../zones/legal-tower.js");
    return initZone(LegalTower, wid);
  }

  if (zoneId === "council") {
    const { buildCouncilContent, loadCouncilStyles } = await _loadZoneModule(
      "../zones/council.js",
    );
    loadCouncilStyles("../zones/");
    return buildCouncilContent(wid);
  }

  if (zoneId === "archive") {
    const { Archive } = await _loadZoneModule("../zones/archive.js");
    return initZone(Archive, wid);
  }

  if (zoneId === "rnd") {
    const { RndLab } = await _loadZoneModule("../zones/rnd-lab.js");
    return initZone(RndLab, wid);
  }

  if (zoneId === "identity") {
    const { buildIdentityPanelContent } = await _loadZoneModule(
      "../zones/identity-panel.js",
    );
    return buildIdentityPanelContent({ worldId: wid });
  }

  if (zoneId === "sales") {
    const { SalesDistrict } = await _loadZoneModule(
      "../zones/sales-district.js",
    );
    return initZone(SalesDistrict, wid);
  }

  if (zoneId === "marketing") {
    const { MarketingPlaza } = await _loadZoneModule(
      "../zones/marketing-plaza.js",
    );
    return initZone(MarketingPlaza, wid);
  }

  if (zoneId === "exchange") {
    const { Exchange } = await _loadZoneModule("../zones/exchange.js");
    return initZone(Exchange, wid);
  }

  if (zoneId === "market") {
    const { Market } = await _loadZoneModule("../zones/market.js");
    return initZone(Market, wid);
  }

  if (zoneId === "airport") {
    const { Airport } = await _loadZoneModule("../zones/airport.js");
    return initZone(Airport, wid);
  }

  if (zoneId === "globe") {
    const { GlobeRoom } = await _loadZoneModule("../zones/globe-room.js");
    return initZone(GlobeRoom, wid);
  }

  if (zoneId === "broadcast") {
    const { BroadcastTower } = await _loadZoneModule(
      "../zones/broadcast-tower.js",
    );
    return initZone(BroadcastTower, wid);
  }

  if (zoneId === "versions") {
    const { WorldVersions } = await _loadZoneModule(
      "../zones/world-versions.js",
    );
    return initZone(WorldVersions, wid);
  }

  if (zoneId === "mission-control" || zoneId === "mission_control") {
    const { MissionControl } = await _loadZoneModule(
      "../zones/mission-control.js",
    );
    return initZone(MissionControl, wid);
  }

  if (zoneId === "analytics") {
    const { Analytics } = await _loadZoneModule("../zones/analytics.js");
    return initZone(Analytics, wid);
  }

  if (zoneId === "settings") {
    const { buildSettingsContent } = await _loadZoneModule(
      "../zones/settings.js",
    );
    return buildSettingsContent({ worldId: wid });
  }

  if (zoneId === "reports") {
    const { Reports } = await _loadZoneModule("../zones/reports.js");
    return initZone(Reports, wid);
  }

  if (zoneId === "achievements") {
    const { AchievementsPanel } = await _loadZoneModule(
      "./achievements-panel.js",
    );
    return initZone(AchievementsPanel, wid);
  }

  if (zoneId === "timeline") {
    const { Timeline } = await _loadZoneModule("../zones/timeline.js");
    return initZone(Timeline, wid);
  }

  if (zoneId === "home") {
    const { HomeDashboard } = await _loadZoneModule(
      "../zones/home-dashboard.js",
    );
    return initZone(HomeDashboard, wid);
  }

  if (zoneId === "kanban") {
    const { Kanban } = await _loadZoneModule("../zones/kanban.js");
    return initZone(Kanban, wid);
  }

  if (zoneId === "knowledge-graph") {
    const { KnowledgeGraph } = await _loadZoneModule(
      "../zones/knowledge-graph.js",
    );
    return initZone(KnowledgeGraph, wid);
  }

  if (zoneId === "automations") {
    const { AutomationBuilder } = await _loadZoneModule(
      "../zones/automation-builder.js",
    );
    return initZone(AutomationBuilder, wid);
  }

  if (zoneId === "skill-tree") {
    const { SkillTree } = await _loadZoneModule("../zones/skill-tree.js");
    return initZone(SkillTree, wid);
  }

  if (zoneId === "calendar") {
    const { Calendar } = await _loadZoneModule("../zones/calendar.js");
    return initZone(Calendar, wid);
  }

  if (zoneId === "sharing") {
    const { Sharing } = await _loadZoneModule("../zones/sharing.js");
    return initZone(Sharing, wid);
  }

  if (zoneId === "leaderboard") {
    const { Leaderboard } = await _loadZoneModule("../zones/leaderboard.js");
    return initZone(Leaderboard, wid);
  }

  if (zoneId === "brain") {
    const { BrainLibrary } = await _loadZoneModule("../zones/brain-library.js");
    return initZone(BrainLibrary, wid);
  }

  if (zoneId === "memory") {
    const { MemoryVault } = await _loadZoneModule("../zones/memory-vault.js");
    return initZone(MemoryVault, wid);
  }

  if (zoneId === "skills") {
    const { SkillsAcademy } = await _loadZoneModule(
      "../zones/skills-academy.js",
    );
    return initZone(SkillsAcademy, wid);
  }

  if (zoneId === "prompt-library" || zoneId === "prompt_library") {
    const { PromptLibrary } = await _loadZoneModule(
      "../zones/prompt-library.js",
    );
    return initZone(PromptLibrary, wid);
  }

  if (zoneId === "conversations") {
    const { ConversationHistory } = await _loadZoneModule(
      "../zones/conversation-history.js",
    );
    return initZone(ConversationHistory, wid);
  }

  if (zoneId === "world-map" || zoneId === "world_map") {
    const { WorldMap } = await _loadZoneModule("../zones/world-map.js");
    return initZone(WorldMap, wid);
  }

  if (zoneId === "plugins") {
    const { PluginStore } = await _loadZoneModule("../zones/plugin-store.js");
    return initZone(PluginStore, wid);
  }

  if (zoneId === "agent-profile") {
    const { AgentProfile } = await _loadZoneModule("../zones/agent-profile.js");
    const ap = new AgentProfile();
    const el = ap.render();
    ap.init(wid, window.__agentProfileTarget || "commander");
    window.__agentProfileTarget = null;
    return el;
  }

  if (zoneId === "backups") {
    const { Backups } = await _loadZoneModule("../zones/backups.js");
    return initZone(Backups, wid);
  }

  if (zoneId === "mcp-hub" || zoneId === "mcp_hub") {
    const { McpHub } = await _loadZoneModule("../zones/mcp-hub.js");
    return initZone(McpHub, wid);
  }

  if (zoneId === "daily-digest" || zoneId === "daily_digest") {
    const { DailyDigest } = await _loadZoneModule("../zones/daily-digest.js");
    return initZone(DailyDigest, wid);
  }

  // Check if this is a plugin-provided zone
  {
    const pm = getPluginManager();
    const pluginZone = pm.getZone(zoneId);
    if (pluginZone) {
      const el = pluginZone.render();
      pluginZone.init(wid);
      return el;
    }
  }

  const info = ZONE_INFO[zoneId] || {
    icon: "\u{1F3D7}",
    desc: "Unknown zone.",
  };
  const frag = document.createElement("div");

  // Description section
  const descSection = createSection("About", info.desc);
  frag.appendChild(descSection);

  // Agents section
  const agentsSection = document.createElement("div");
  agentsSection.className = "panel__section";
  const agentsTitle = document.createElement("div");
  agentsTitle.className = "panel__section-title";
  agentsTitle.textContent = "Agents";
  agentsSection.appendChild(agentsTitle);

  const agentsList = Object.entries(AGENT_INFO)
    .filter(([, a]) => true) // Show all for now
    .slice(0, 3);

  if (agentsList.length === 0) {
    const empty = document.createElement("div");
    empty.className = "panel__section-content";
    empty.textContent = "No agents assigned to this zone.";
    agentsSection.appendChild(empty);
  } else {
    for (const [id, agent] of agentsList) {
      const row = document.createElement("div");
      row.className = "panel__stat-row";
      const label = document.createElement("span");
      label.className = "panel__stat-label";
      label.textContent = `${agent.icon} ${agent.name}`;
      const value = document.createElement("span");
      value.className = "panel__stat-value";
      value.textContent = `Lv.${agent.level}`;
      row.appendChild(label);
      row.appendChild(value);
      agentsSection.appendChild(row);
    }
  }
  frag.appendChild(agentsSection);

  // Recent tasks placeholder
  const tasksSection = createSection(
    "Recent Tasks",
    "No recent tasks in this zone.",
  );
  frag.appendChild(tasksSection);

  // Quick actions
  const actionsSection = document.createElement("div");
  actionsSection.className = "panel__section";
  const actionsTitle = document.createElement("div");
  actionsTitle.className = "panel__section-title";
  actionsTitle.textContent = "Quick Actions";
  actionsSection.appendChild(actionsTitle);

  const actionsWrap = document.createElement("div");
  actionsWrap.className = "panel__actions";
  for (const label of ["New Task", "View History", "Configure"]) {
    const btn = document.createElement("button");
    btn.className = "panel__action-btn";
    btn.textContent = label;
    btn.addEventListener("click", () => {
      document.dispatchEvent(
        new CustomEvent("panel:action", {
          detail: { zoneId, action: label.toLowerCase().replace(/\s+/g, "-") },
          bubbles: true,
        }),
      );
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
  const info = AGENT_INFO[agentId] || {
    icon: "\u{1F916}",
    name: "Unknown",
    personality: "...",
    level: 1,
  };
  const frag = document.createElement("div");

  // Avatar
  const avatar = document.createElement("div");
  avatar.className = "panel__avatar";
  avatar.textContent = info.icon;
  frag.appendChild(avatar);

  // Stats
  const statsSection = document.createElement("div");
  statsSection.className = "panel__section";

  const stats = [
    ["Personality", info.personality],
    ["Level", `${info.level}`],
    ["Status", "Idle"],
    ["Tasks Completed", "0"],
  ];

  for (const [label, value] of stats) {
    const row = document.createElement("div");
    row.className = "panel__stat-row";
    const labelEl = document.createElement("span");
    labelEl.className = "panel__stat-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("span");
    valueEl.className = "panel__stat-value";
    valueEl.textContent = value;
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    statsSection.appendChild(row);
  }
  frag.appendChild(statsSection);

  // Dialogue area
  const dialogueSection = document.createElement("div");
  dialogueSection.className = "panel__section";
  const dialogueTitle = document.createElement("div");
  dialogueTitle.className = "panel__section-title";
  dialogueTitle.textContent = "Dialogue";
  dialogueSection.appendChild(dialogueTitle);

  const dialogue = document.createElement("div");
  dialogue.className = "panel__dialogue";
  dialogue.textContent = `${info.name} is awaiting your instructions...`;
  dialogueSection.appendChild(dialogue);
  frag.appendChild(dialogueSection);

  // Task input
  const inputSection = document.createElement("div");
  inputSection.className = "panel__section";
  const inputTitle = document.createElement("div");
  inputTitle.className = "panel__section-title";
  inputTitle.textContent = "Assign Task";
  inputSection.appendChild(inputTitle);

  const inputWrap = document.createElement("div");
  inputWrap.className = "panel__task-input-wrap";

  const input = document.createElement("input");
  input.className = "panel__task-input";
  input.type = "text";
  input.placeholder = `Ask ${info.name}...`;
  input.setAttribute("aria-label", `Task input for ${info.name}`);
  inputWrap.appendChild(input);

  const sendBtn = document.createElement("button");
  sendBtn.className = "panel__task-btn";
  sendBtn.textContent = "Send";
  sendBtn.addEventListener("click", () => {
    if (input.value.trim()) {
      document.dispatchEvent(
        new CustomEvent("panel:agent-task", {
          detail: { agentId, task: input.value.trim() },
          bubbles: true,
        }),
      );
      input.value = "";
    }
  });
  inputWrap.appendChild(sendBtn);

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.stopPropagation();
      sendBtn.click();
    }
  });

  inputSection.appendChild(inputWrap);
  frag.appendChild(inputSection);

  return frag;
}

/**
 * Build settings panel content (legacy fallback).
 * @returns {HTMLElement}
 */
function buildSettingsContentLegacy() {
  const frag = document.createElement("div");

  // API Keys
  const keysSection = document.createElement("div");
  keysSection.className = "panel__section";
  const keysTitle = document.createElement("div");
  keysTitle.className = "panel__section-title";
  keysTitle.textContent = "API Keys";
  keysSection.appendChild(keysTitle);

  for (const provider of ["Anthropic", "OpenAI", "Google"]) {
    const group = document.createElement("div");
    group.className = "panel__form-group";

    const label = document.createElement("label");
    label.className = "panel__form-label";
    label.textContent = `${provider} API Key`;

    const input = document.createElement("input");
    input.className = "panel__form-input";
    input.type = "password";
    input.placeholder = `sk-...`;
    input.setAttribute("aria-label", `${provider} API Key`);

    group.appendChild(label);
    group.appendChild(input);
    keysSection.appendChild(group);
  }
  frag.appendChild(keysSection);

  // Budget settings
  const budgetSection = document.createElement("div");
  budgetSection.className = "panel__section";
  const budgetTitle = document.createElement("div");
  budgetTitle.className = "panel__section-title";
  budgetTitle.textContent = "Budget";
  budgetSection.appendChild(budgetTitle);

  const budgetGroup = document.createElement("div");
  budgetGroup.className = "panel__form-group";
  const budgetLabel = document.createElement("label");
  budgetLabel.className = "panel__form-label";
  budgetLabel.textContent = "Monthly Budget ($)";
  const budgetInput = document.createElement("input");
  budgetInput.className = "panel__form-input";
  budgetInput.type = "number";
  budgetInput.value = "10.00";
  budgetInput.min = "0";
  budgetInput.step = "1";
  budgetInput.setAttribute("aria-label", "Monthly budget in dollars");
  budgetGroup.appendChild(budgetLabel);
  budgetGroup.appendChild(budgetInput);
  budgetSection.appendChild(budgetGroup);
  frag.appendChild(budgetSection);

  // World settings
  const worldSection = document.createElement("div");
  worldSection.className = "panel__section";
  const worldTitle = document.createElement("div");
  worldTitle.className = "panel__section-title";
  worldTitle.textContent = "World";
  worldSection.appendChild(worldTitle);

  const worldContent = document.createElement("div");
  worldContent.className = "panel__section-content";
  worldContent.textContent =
    "Additional world settings will appear here as features unlock.";
  worldSection.appendChild(worldContent);
  frag.appendChild(worldSection);

  return frag;
}

/**
 * Helper: create a simple section with title and text content.
 */
function createSection(title, text) {
  const section = document.createElement("div");
  section.className = "panel__section";
  const titleEl = document.createElement("div");
  titleEl.className = "panel__section-title";
  titleEl.textContent = title;
  section.appendChild(titleEl);
  const content = document.createElement("div");
  content.className = "panel__section-content";
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
    this._overlay = document.createElement("div");
    this._overlay.className = "panel-overlay";
    this._overlay.setAttribute("role", "complementary");
    this._overlay.setAttribute("aria-label", "Side panel");

    this._panel = document.createElement("div");
    this._panel.className = "panel";

    // Header
    this._header = document.createElement("div");
    this._header.className = "panel__header";

    this._headerIcon = document.createElement("span");
    this._headerIcon.className = "panel__header-icon";

    this._title = document.createElement("span");
    this._title.className = "panel__title";

    this._closeBtn = document.createElement("button");
    this._closeBtn.className = "panel__close";
    this._closeBtn.setAttribute("aria-label", "Close panel");
    this._closeBtn.textContent = "\u00D7";

    this._header.appendChild(this._headerIcon);
    this._header.appendChild(this._title);
    this._header.appendChild(this._closeBtn);
    this._panel.appendChild(this._header);

    // Body
    this._body = document.createElement("div");
    this._body.className = "panel__body";
    this._panel.appendChild(this._body);

    this._overlay.appendChild(this._panel);
    document.body.appendChild(this._overlay);
  }

  _bindEvents() {
    this._closeBtn.addEventListener("click", () => this.close());
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Open a zone panel.
   * @param {string} zoneId
   * @param {string} zoneName
   */
  async openZone(zoneId, zoneName) {
    const info = ZONE_INFO[zoneId] || { icon: "\u{1F3D7}" };

    // Show the panel immediately with a loading indicator
    this._show("zone", zoneId, info.icon, zoneName, _createLoadingIndicator());

    // Lazy-load the zone module and swap in the real content
    let contentEl;
    try {
      contentEl = await buildZoneContent(zoneId);
    } catch (err) {
      console.error(`[PanelManager] Failed to load zone "${zoneId}":`, err);
      // Only show the error if this zone is still the active panel
      if (
        this._currentType === "zone" &&
        this._currentId === zoneId &&
        this.isOpen
      ) {
        this._body.innerHTML = "";
        const errorEl = document.createElement("div");
        errorEl.style.cssText =
          "padding:32px 16px;text-align:center;color:#ff6b6b;font-size:14px;";
        errorEl.textContent = `Failed to load zone "${zoneId}". ${err.message || ""}`;
        this._body.appendChild(errorEl);
      }
      return;
    }

    // Only replace if this zone is still the active panel (user may have
    // navigated away or closed the panel while the module was loading)
    if (
      this._currentType === "zone" &&
      this._currentId === zoneId &&
      this.isOpen
    ) {
      this._body.innerHTML = "";
      this._body.appendChild(contentEl);
    }
  }

  /**
   * Open an agent panel.
   * @param {string} agentId
   */
  openAgent(agentId) {
    const info = AGENT_INFO[agentId] || { icon: "\u{1F916}", name: "Unknown" };
    this._show(
      "agent",
      agentId,
      info.icon,
      info.name,
      buildAgentContent(agentId),
    );
  }

  /**
   * Open the settings panel.
   */
  async openSettings() {
    // Show loading indicator immediately
    this._show(
      "settings",
      "settings",
      "\u{2699}\uFE0F",
      "Settings",
      _createLoadingIndicator(),
    );

    let contentEl;
    try {
      const { buildSettingsContent } = await _loadZoneModule(
        "../zones/settings.js",
      );
      contentEl = buildSettingsContent();
    } catch (err) {
      console.error("[PanelManager] Failed to load settings:", err);
      if (
        this._currentType === "settings" &&
        this._currentId === "settings" &&
        this.isOpen
      ) {
        this._body.innerHTML = "";
        const errorEl = document.createElement("div");
        errorEl.style.cssText =
          "padding:32px 16px;text-align:center;color:#ff6b6b;font-size:14px;";
        errorEl.textContent = `Failed to load settings. ${err.message || ""}`;
        this._body.appendChild(errorEl);
      }
      return;
    }

    if (
      this._currentType === "settings" &&
      this._currentId === "settings" &&
      this.isOpen
    ) {
      this._body.innerHTML = "";
      this._body.appendChild(contentEl);
    }
  }

  /**
   * Close the panel.
   */
  close() {
    this._overlay.classList.remove("open");
    document.body.classList.remove("panel-open");
    this._currentType = null;
    this._currentId = null;

    // Clear panel body to release DOM references and stop any zone-internal
    // timers / listeners that were attached to the now-closed panel content.
    this._body.innerHTML = "";

    document.dispatchEvent(new CustomEvent("panel:closed", { bubbles: true }));
  }

  /** @returns {boolean} */
  get isOpen() {
    return this._overlay.classList.contains("open");
  }

  /** Tear down. */
  destroy() {
    this._overlay.remove();
    document.body.classList.remove("panel-open");
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

    this._body.innerHTML = "";
    this._body.appendChild(contentEl);

    this._overlay.classList.add("open");
    document.body.classList.add("panel-open");

    document.dispatchEvent(
      new CustomEvent("panel:opened", {
        detail: { type, id },
        bubbles: true,
      }),
    );
  }
}
