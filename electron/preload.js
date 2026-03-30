const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  // ── Database operations ────────────────────────────────────────────
  db: {
    getWorld: (id) => ipcRenderer.invoke("db:getWorld", id),
    createWorld: (name, template) =>
      ipcRenderer.invoke("db:createWorld", name, template),
    getZones: (worldId) => ipcRenderer.invoke("db:getZones", worldId),
    getAgents: (worldId) => ipcRenderer.invoke("db:getAgents", worldId),
    getQuests: (worldId) => ipcRenderer.invoke("db:getQuests", worldId),
    addXP: (worldId, amount) => ipcRenderer.invoke("db:addXP", worldId, amount),
    updateAgentState: (id, state, tileX, tileY) =>
      ipcRenderer.invoke("db:updateAgentState", id, state, tileX, tileY),
    getRecentTasks: (worldId, limit) =>
      ipcRenderer.invoke("db:getRecentTasks", worldId, limit),
    searchTasks: (worldId, query) =>
      ipcRenderer.invoke("db:searchTasks", worldId, query),
    getTaskStats: (worldId) => ipcRenderer.invoke("db:getTaskStats", worldId),
    completeQuest: (questId) => ipcRenderer.invoke("db:completeQuest", questId),
    updateZoneProgress: (worldId, zoneType, progress) =>
      ipcRenderer.invoke("db:updateZoneProgress", worldId, zoneType, progress),
    getZoneProgress: (worldId) =>
      ipcRenderer.invoke("db:getZoneProgress", worldId),
    unlockZone: (worldId, zoneType) =>
      ipcRenderer.invoke("db:unlockZone", worldId, zoneType),
    // Chat
    getProjects: (worldId) => ipcRenderer.invoke("db:getProjects", worldId),
    createProject: (worldId, name, icon) =>
      ipcRenderer.invoke("db:createProject", worldId, name, icon),
    getMessages: (projectId, limit) =>
      ipcRenderer.invoke("db:getMessages", projectId, limit),
    saveMessage: (projectId, worldId, role, content, meta) =>
      ipcRenderer.invoke(
        "db:saveMessage",
        projectId,
        worldId,
        role,
        content,
        meta,
      ),
    // Incidents
    getIncidents: (worldId, limit) =>
      ipcRenderer.invoke("db:getIncidents", worldId, limit),
    createIncident: (worldId, data) =>
      ipcRenderer.invoke("db:createIncident", worldId, data),
    updateIncident: (incidentId, status) =>
      ipcRenderer.invoke("db:updateIncident", incidentId, status),
    // Minions
    getMinions: (worldId) => ipcRenderer.invoke("db:getMinions", worldId),
    createMinion: (worldId, config) =>
      ipcRenderer.invoke("db:createMinion", worldId, config),
    updateMinion: (minionId, updates) =>
      ipcRenderer.invoke("db:updateMinion", minionId, updates),
    recordMinionRun: (minionId, worldId, runData) =>
      ipcRenderer.invoke("db:recordMinionRun", minionId, worldId, runData),
    // Airport
    getAirportLog: (worldId) => ipcRenderer.invoke("db:getAirportLog", worldId),
    createAirportLog: (worldId, data) =>
      ipcRenderer.invoke("db:createAirportLog", worldId, data),
    getDeployToken: (worldId) =>
      ipcRenderer.invoke("db:getDeployToken", worldId),
    upsertDeployToken: (worldId, token) =>
      ipcRenderer.invoke("db:upsertDeployToken", worldId, token),
    // Globe Room
    getResearchQueries: (worldId) =>
      ipcRenderer.invoke("db:getResearchQueries", worldId),
    createResearchQuery: (worldId, data) =>
      ipcRenderer.invoke("db:createResearchQuery", worldId, data),
    updateResearchQuery: (queryId, updates) =>
      ipcRenderer.invoke("db:updateResearchQuery", queryId, updates),
    // Broadcast Tower
    getBroadcastChannels: (worldId) =>
      ipcRenderer.invoke("db:getBroadcastChannels", worldId),
    createBroadcastChannel: (worldId, data) =>
      ipcRenderer.invoke("db:createBroadcastChannel", worldId, data),
    updateBroadcastChannel: (channelId, updates) =>
      ipcRenderer.invoke("db:updateBroadcastChannel", channelId, updates),
    deleteBroadcastChannel: (channelId) =>
      ipcRenderer.invoke("db:deleteBroadcastChannel", channelId),
    getBroadcastLog: (worldId, limit) =>
      ipcRenderer.invoke("db:getBroadcastLog", worldId, limit),
    createBroadcastLog: (worldId, data) =>
      ipcRenderer.invoke("db:createBroadcastLog", worldId, data),
    // World Versions
    deleteSnapshot: (snapshotId) =>
      ipcRenderer.invoke("db:deleteSnapshot", snapshotId),
    restoreSnapshot: (worldId, snapshotId) =>
      ipcRenderer.invoke("db:restoreSnapshot", worldId, snapshotId),
    // Sales District
    getLeads: (worldId) => ipcRenderer.invoke("db:getLeads", worldId),
    createLead: (worldId, data) =>
      ipcRenderer.invoke("db:createLead", worldId, data),
    updateLead: (leadId, updates) =>
      ipcRenderer.invoke("db:updateLead", leadId, updates),
    deleteLead: (leadId) => ipcRenderer.invoke("db:deleteLead", leadId),
    // Marketing Plaza
    getContentPieces: (worldId, limit) =>
      ipcRenderer.invoke("db:getContentPieces", worldId, limit),
    createContentPiece: (worldId, data) =>
      ipcRenderer.invoke("db:createContentPiece", worldId, data),
    // The Exchange
    getIntegrations: (worldId) =>
      ipcRenderer.invoke("db:getIntegrations", worldId),
    createIntegration: (worldId, data) =>
      ipcRenderer.invoke("db:createIntegration", worldId, data),
    updateIntegration: (integrationId, updates) =>
      ipcRenderer.invoke("db:updateIntegration", integrationId, updates),
    getWebhookEvents: (worldId, limit) =>
      ipcRenderer.invoke("db:getWebhookEvents", worldId, limit),
    createWebhookEvent: (worldId, data) =>
      ipcRenderer.invoke("db:createWebhookEvent", worldId, data),
    // The Market
    getMarketInstalls: (worldId) =>
      ipcRenderer.invoke("db:getMarketInstalls", worldId),
    installMarketItem: (worldId, catalogItemId) =>
      ipcRenderer.invoke("db:installMarketItem", worldId, catalogItemId),
    // Identity & Reputation
    getIdentity: (worldId) => ipcRenderer.invoke("db:getIdentity", worldId),
    updateIdentity: (worldId, updates) =>
      ipcRenderer.invoke("db:updateIdentity", worldId, updates),
    awardReputation: (worldId, eventType, points, description) =>
      ipcRenderer.invoke(
        "db:awardReputation",
        worldId,
        eventType,
        points,
        description,
      ),
    getReputationHistory: (worldId, limit) =>
      ipcRenderer.invoke("db:getReputationHistory", worldId, limit),
    // Legal Tower
    getLegalDocs: (worldId, limit) =>
      ipcRenderer.invoke("db:getLegalDocs", worldId, limit),
    createLegalDoc: (worldId, data) =>
      ipcRenderer.invoke("db:createLegalDoc", worldId, data),
    updateLegalDoc: (docId, updates) =>
      ipcRenderer.invoke("db:updateLegalDoc", docId, updates),
    // Council
    getCouncilSessions: (worldId, limit) =>
      ipcRenderer.invoke("db:getCouncilSessions", worldId, limit),
    createCouncilSession: (worldId, prompt, models) =>
      ipcRenderer.invoke("db:createCouncilSession", worldId, prompt, models),
    saveCouncilResponse: (sessionId, data) =>
      ipcRenderer.invoke("db:saveCouncilResponse", sessionId, data),
    getCouncilResponses: (sessionId) =>
      ipcRenderer.invoke("db:getCouncilResponses", sessionId),
    // Archive & Snapshots
    getSnapshots: (worldId, limit) =>
      ipcRenderer.invoke("db:getSnapshots", worldId, limit),
    saveWorldSnapshot: (worldId, label) =>
      ipcRenderer.invoke("db:saveWorldSnapshot", worldId, label),
    // R&D Lab
    getExperiments: (worldId, limit) =>
      ipcRenderer.invoke("db:getExperiments", worldId, limit),
    createExperiment: (worldId, data) =>
      ipcRenderer.invoke("db:createExperiment", worldId, data),
    updateExperiment: (experimentId, updates) =>
      ipcRenderer.invoke("db:updateExperiment", experimentId, updates),
    saveExperiment: (worldId, data) =>
      ipcRenderer.invoke("db:saveExperiment", worldId, data),
    // Quest activation
    activateQuest: (questId) => ipcRenderer.invoke("db:activateQuest", questId),
    // Skills
    getSkills: (worldId) => ipcRenderer.invoke("db:getSkills", worldId),
    createSkill: (worldId, data) =>
      ipcRenderer.invoke("db:createSkill", worldId, data),
    importSkills: (worldId, skills) =>
      ipcRenderer.invoke("db:importSkills", worldId, skills),
    // Tasks
    getTasks: (worldId, opts) =>
      ipcRenderer.invoke("db:getTasks", worldId, opts),
    createTask: (worldId, data) =>
      ipcRenderer.invoke("db:createTask", worldId, data),
    // Kanban Board
    getKanbanCards: (worldId) =>
      ipcRenderer.invoke("db:getKanbanCards", worldId),
    createKanbanCard: (worldId, data) =>
      ipcRenderer.invoke("db:createKanbanCard", worldId, data),
    updateKanbanCard: (cardId, updates) =>
      ipcRenderer.invoke("db:updateKanbanCard", cardId, updates),
    deleteKanbanCard: (cardId) =>
      ipcRenderer.invoke("db:deleteKanbanCard", cardId),
    // Calendar Events
    getCalendarEvents: (worldId) =>
      ipcRenderer.invoke("db:getCalendarEvents", worldId),
    createCalendarEvent: (worldId, data) =>
      ipcRenderer.invoke("db:createCalendarEvent", worldId, data),
    updateCalendarEvent: (eventId, updates) =>
      ipcRenderer.invoke("db:updateCalendarEvent", eventId, updates),
    deleteCalendarEvent: (eventId) =>
      ipcRenderer.invoke("db:deleteCalendarEvent", eventId),
    // Workflows (Automation Builder)
    getWorkflows: (worldId) => ipcRenderer.invoke("db:getWorkflows", worldId),
    saveWorkflow: (worldId, data) =>
      ipcRenderer.invoke("db:saveWorkflow", worldId, data),
    deleteWorkflow: (workflowId) =>
      ipcRenderer.invoke("db:deleteWorkflow", workflowId),
    // Agent relationships
    getAgentRelationships: (worldId) =>
      ipcRenderer.invoke("db:getAgentRelationships", worldId),
    // Minion runs
    getMinionRuns: (worldId, limit) =>
      ipcRenderer.invoke("db:getMinionRuns", worldId, limit),
    // World snapshots (aliases used by archive/airport)
    getWorldSnapshots: (worldId) =>
      ipcRenderer.invoke("db:getSnapshots", worldId),
    restoreWorldSnapshot: (worldId, snapshotId) =>
      ipcRenderer.invoke("db:restoreSnapshot", worldId, snapshotId),
    importWorldSnapshot: (worldId, data) =>
      ipcRenderer.invoke("db:importWorldSnapshot", worldId, data),
    // Prompt Library
    getPrompts: (worldId) => ipcRenderer.invoke("db:getPrompts", worldId),
    createPrompt: (worldId, data) =>
      ipcRenderer.invoke("db:createPrompt", worldId, data),
    updatePrompt: (promptId, updates) =>
      ipcRenderer.invoke("db:updatePrompt", promptId, updates),
    deletePrompt: (promptId) => ipcRenderer.invoke("db:deletePrompt", promptId),
    // Daily Digest
    getDigests: (worldId) => ipcRenderer.invoke("db:getDigests", worldId),
    saveDigest: (worldId, data) =>
      ipcRenderer.invoke("db:saveDigest", worldId, data),
    updateDigest: (digestId, updates) =>
      ipcRenderer.invoke("db:updateDigest", digestId, updates),
    getGoals: (worldId, goalDate) =>
      ipcRenderer.invoke("db:getGoals", worldId, goalDate),
    createGoal: (worldId, data) =>
      ipcRenderer.invoke("db:createGoal", worldId, data),
    updateGoal: (goalId, updates) =>
      ipcRenderer.invoke("db:updateGoal", goalId, updates),
    // MCP Hub
    getMcpServers: (worldId) => ipcRenderer.invoke("db:getMcpServers", worldId),
    createMcpServer: (worldId, data) =>
      ipcRenderer.invoke("db:createMcpServer", worldId, data),
    updateMcpServer: (serverId, updates) =>
      ipcRenderer.invoke("db:updateMcpServer", serverId, updates),
    deleteMcpServer: (serverId) =>
      ipcRenderer.invoke("db:deleteMcpServer", serverId),
    // Settings
    getSettings: (worldId) => ipcRenderer.invoke("db:getSettings", worldId),
    updateSettings: (worldId, key, value) =>
      ipcRenderer.invoke("db:updateSettings", worldId, key, value),
    exportWorld: (worldId) => ipcRenderer.invoke("db:exportWorld", worldId),
    getAppInfo: () => ipcRenderer.invoke("db:getAppInfo"),
    // Analytics
    getAnalytics: (worldId, range) =>
      ipcRenderer.invoke("db:getAnalytics", worldId, range),
    // Timeline
    getTimelineEvents: (worldId, limit) =>
      ipcRenderer.invoke("db:getTimelineEvents", worldId, limit),
    // Achievements
    getAchievements: (worldId) =>
      ipcRenderer.invoke("db:getAchievements", worldId),
    unlockAchievement: (worldId, achievementId) =>
      ipcRenderer.invoke("db:unlockAchievement", worldId, achievementId),
    // Agent Skill Trees
    getAgentSkills: (worldId) =>
      ipcRenderer.invoke("db:getAgentSkills", worldId),
    unlockAgentSkill: (worldId, agentId, skillId) =>
      ipcRenderer.invoke("db:unlockAgentSkill", worldId, agentId, skillId),
    // Global search
    globalSearch: (worldId, query, limit) =>
      ipcRenderer.invoke("db:globalSearch", worldId, query, limit),
    // Council-specific safe query helpers
    executeCouncilQuery: (action, params) =>
      ipcRenderer.invoke("db:executeCouncilQuery", action, params),
    getCouncilData: (action, params) =>
      ipcRenderer.invoke("db:getCouncilData", action, params),
  },

  // ── AI dispatch ────────────────────────────────────────────────────
  ai: {
    dispatch: (task) => ipcRenderer.invoke("ai:dispatch", task),
    listProviders: () => ipcRenderer.invoke("ai:listProviders"),
    ping: (provider) => ipcRenderer.invoke("ai:ping", provider),
  },

  // ── API key management ─────────────────────────────────────────────
  keys: {
    store: (provider, key, displayName) =>
      ipcRenderer.invoke("keys:store", provider, key, displayName),
    list: () => ipcRenderer.invoke("keys:list"), // returns metadata ONLY, never keys
    delete: (provider) => ipcRenderer.invoke("keys:delete", provider),
  },

  // ── World state (push updates from main → renderer) ────────────────
  world: {
    getState: () => ipcRenderer.invoke("world:getState"),
    onStateUpdate: (callback) => {
      const handler = (_event, delta) => callback(delta);
      ipcRenderer.on("world:stateUpdate", handler);
      // Return unsubscribe function for cleanup
      return () => ipcRenderer.removeListener("world:stateUpdate", handler);
    },
  },

  // ── App info ───────────────────────────────────────────────────────
  app: {
    getVersion: () => ipcRenderer.invoke("app:getVersion"),
    getPlatform: () => ipcRenderer.invoke("app:getPlatform"),
  },

  // ── Backup operations ─────────────────────────────────────────────
  backup: {
    list: () => ipcRenderer.invoke("backup:list"),
    create: (trigger) => ipcRenderer.invoke("backup:create", trigger),
    delete: (filename) => ipcRenderer.invoke("backup:delete", filename),
    restore: (backupPath) => ipcRenderer.invoke("backup:restore", backupPath),
    getStorageUsage: () => ipcRenderer.invoke("backup:getStorageUsage"),
    cleanup: () => ipcRenderer.invoke("backup:cleanup"),
    setAutoBackup: (enabled, intervalMinutes) =>
      ipcRenderer.invoke("backup:setAutoBackup", enabled, intervalMinutes),
    export: (filename) => ipcRenderer.invoke("backup:export", filename),
    import: () => ipcRenderer.invoke("backup:import"),
    restartApp: () => ipcRenderer.invoke("backup:restartApp"),
  },
});
