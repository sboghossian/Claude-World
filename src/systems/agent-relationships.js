/**
 * AgentRelationshipSystem — manages agent-to-agent relationships,
 * morning briefings, and incident filing for Claude World.
 *
 * Runs in the renderer process. Communicates with the main process
 * via window.api.db and window.api.ai.
 */

export class AgentRelationshipSystem {
  constructor() {
    /** @type {string|null} */
    this._worldId = null;

    /** @type {Array<object>} rows from agent_relationships */
    this._relationships = [];

    /** @type {Map<string, object>} agentId -> agent row */
    this._agents = new Map();

    /** @type {ReturnType<typeof setInterval>|null} */
    this._briefingTimer = null;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────

  /**
   * Initialise for a given world. Loads all relationships and agents
   * from the database so the system is ready to query synchronously.
   *
   * @param {string} worldId
   */
  async init(worldId) {
    this._worldId = worldId;

    // Load agents first so relationship lookups can resolve names/roles.
    const agents = await window.api.db.getAgents(worldId);
    this._agents.clear();
    for (const agent of agents) {
      this._agents.set(agent.id, agent);
    }

    // Load all agent_relationships for this world.
    this._relationships = await window.api.db.getAgentRelationships(worldId) || [];

    console.log(
      `[agent-relationships] Loaded ${this._relationships.length} relationships` +
      ` and ${this._agents.size} agents for world ${worldId}`
    );
  }

  // ── Queries ──────────────────────────────────────────────────────────

  /**
   * Return all relationships, each enriched with the agent objects for
   * both sides so callers can display names and roles directly.
   *
   * @returns {Array<object>}
   */
  getRelationships() {
    return this._relationships.map((rel) => ({
      ...rel,
      agentA: this._agents.get(rel.agent_a_id) ?? null,
      agentB: this._agents.get(rel.agent_b_id) ?? null,
    }));
  }

  /**
   * Return agents that are configured to brief the Commander each
   * morning (briefing_direction = 'to_commander').
   *
   * @returns {Array<object>} agent rows
   */
  getBriefingAgents() {
    const briefingAgentIds = new Set();

    for (const rel of this._relationships) {
      if (rel.briefing_direction === 'to_commander') {
        // The agent who delivers the briefing is agent_a.
        briefingAgentIds.add(rel.agent_a_id);
      }
    }

    const result = [];
    for (const id of briefingAgentIds) {
      const agent = this._agents.get(id);
      if (agent) result.push(agent);
    }
    return result;
  }

  // ── Briefings ────────────────────────────────────────────────────────

  /**
   * Ask an agent to generate a morning briefing by summarising their
   * zone's recent task activity.
   *
   * @param {string} agentId
   * @returns {Promise<string>} briefing text
   */
  async generateBriefing(agentId) {
    const agent = this._agents.get(agentId);
    if (!agent) {
      throw new Error(`[agent-relationships] Unknown agent: ${agentId}`);
    }

    // Fetch recent tasks for this agent's zone to give the AI context.
    const recentTasks = await window.api.db.getRecentTasks({
      worldId: this._worldId,
      zoneId: agent.zone_id ?? undefined,
      limit: 10,
    }) || [];

    const taskSummary = recentTasks.length > 0
      ? recentTasks
          .map(
            (t, i) =>
              `${i + 1}. [${t.status}] ${t.prompt.slice(0, 120)}${
                t.prompt.length > 120 ? '...' : ''
              }`
          )
          .join('\n')
      : 'No recent tasks recorded.';

    const systemPrompt =
      `You are ${agent.name}, a ${agent.role} in an AI-native city. ` +
      `Your personality: ${agent.personality}. ` +
      `Deliver a concise morning briefing to the Commander covering your zone's ` +
      `recent activity. Be direct and professional. Two to four sentences max.`;

    const result = await window.api.ai.dispatch({
      worldId: this._worldId,
      agentId,
      zoneId: agent.zone_id ?? undefined,
      systemPrompt,
      messages: [
        {
          role: 'user',
          content:
            `Here is recent activity in my zone:\n\n${taskSummary}\n\n` +
            `Please give your morning briefing.`,
        },
      ],
      maxTokens: 256,
    });

    return result.text ?? '';
  }

  // ── Incidents ────────────────────────────────────────────────────────

  /**
   * File a new incident report. Persists to the database and emits a
   * DOM event so the UI can react immediately.
   *
   * @param {string} worldId
   * @param {{
   *   title: string,
   *   description: string,
   *   severity?: 'critical'|'high'|'warning'|'info',
   *   reporterAgentId?: string,
   *   zoneId?: string
   * }} opts
   * @returns {Promise<object>} the created incident row
   */
  async fileIncident(worldId, { title, description, severity = 'info', reporterAgentId, zoneId }) {
    const incident = await window.api.db.createIncident({
      worldId,
      title,
      description,
      severity,
      reporterAgentId: reporterAgentId ?? null,
      zoneId: zoneId ?? null,
    });

    window.dispatchEvent(
      new CustomEvent('incident:filed', { detail: incident })
    );

    // If a reporting agent is specified, animate them walking to the
    // Dispatch Tower so the city feels alive.
    if (reporterAgentId) {
      this.triggerIncidentWalk(reporterAgentId);
    }

    return incident;
  }

  /**
   * Retrieve the most recent incidents for a world.
   *
   * @param {string} worldId
   * @param {number} [limit=10]
   * @returns {Promise<Array<object>>}
   */
  async getIncidents(worldId, limit = 10) {
    return window.api.db.getIncidents({ worldId, limit });
  }

  // ── Animation helpers ────────────────────────────────────────────────

  /**
   * Dispatch a DOM event that the city renderer listens to in order to
   * animate the given agent walking to the Dispatch Tower.
   *
   * @param {string} agentId
   */
  triggerIncidentWalk(agentId) {
    window.dispatchEvent(
      new CustomEvent('agent:walk-to-dispatch', { detail: { agentId } })
    );
  }
}
