const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // ── Database operations ────────────────────────────────────────────
  db: {
    getWorld: (id) => ipcRenderer.invoke('db:getWorld', id),
    createWorld: (name, template) => ipcRenderer.invoke('db:createWorld', name, template),
    getZones: (worldId) => ipcRenderer.invoke('db:getZones', worldId),
    getAgents: (worldId) => ipcRenderer.invoke('db:getAgents', worldId),
    getQuests: (worldId) => ipcRenderer.invoke('db:getQuests', worldId),
    addXP: (worldId, amount) => ipcRenderer.invoke('db:addXP', worldId, amount),
    updateAgentState: (id, state, tileX, tileY) =>
      ipcRenderer.invoke('db:updateAgentState', id, state, tileX, tileY),
    getRecentTasks: (worldId, limit) =>
      ipcRenderer.invoke('db:getRecentTasks', worldId, limit),
    searchTasks: (worldId, query) =>
      ipcRenderer.invoke('db:searchTasks', worldId, query),
    getTaskStats: (worldId) => ipcRenderer.invoke('db:getTaskStats', worldId),
    completeQuest: (questId) => ipcRenderer.invoke('db:completeQuest', questId),
    updateZoneProgress: (worldId, zoneType, progress) =>
      ipcRenderer.invoke('db:updateZoneProgress', worldId, zoneType, progress),
    getZoneProgress: (worldId) => ipcRenderer.invoke('db:getZoneProgress', worldId),
    unlockZone: (worldId, zoneType) => ipcRenderer.invoke('db:unlockZone', worldId, zoneType),
    // Chat
    getProjects: (worldId) => ipcRenderer.invoke('db:getProjects', worldId),
    createProject: (worldId, name, icon) => ipcRenderer.invoke('db:createProject', worldId, name, icon),
    getMessages: (projectId, limit) => ipcRenderer.invoke('db:getMessages', projectId, limit),
    saveMessage: (projectId, worldId, role, content, meta) => ipcRenderer.invoke('db:saveMessage', projectId, worldId, role, content, meta),
    // Incidents
    getIncidents: (worldId, limit) => ipcRenderer.invoke('db:getIncidents', worldId, limit),
    createIncident: (worldId, data) => ipcRenderer.invoke('db:createIncident', worldId, data),
    updateIncident: (incidentId, status) => ipcRenderer.invoke('db:updateIncident', incidentId, status),
    // Minions
    getMinions: (worldId) => ipcRenderer.invoke('db:getMinions', worldId),
    createMinion: (worldId, config) => ipcRenderer.invoke('db:createMinion', worldId, config),
    updateMinion: (minionId, updates) => ipcRenderer.invoke('db:updateMinion', minionId, updates),
    recordMinionRun: (minionId, worldId, runData) => ipcRenderer.invoke('db:recordMinionRun', minionId, worldId, runData),
    // Identity & Reputation
    getIdentity: (worldId) => ipcRenderer.invoke('db:getIdentity', worldId),
    updateIdentity: (worldId, updates) => ipcRenderer.invoke('db:updateIdentity', worldId, updates),
    awardReputation: (worldId, eventType, points, description) => ipcRenderer.invoke('db:awardReputation', worldId, eventType, points, description),
    getReputationHistory: (worldId, limit) => ipcRenderer.invoke('db:getReputationHistory', worldId, limit),
    // Legal Tower
    getLegalDocs: (worldId, limit) => ipcRenderer.invoke('db:getLegalDocs', worldId, limit),
    createLegalDoc: (worldId, data) => ipcRenderer.invoke('db:createLegalDoc', worldId, data),
    updateLegalDoc: (docId, updates) => ipcRenderer.invoke('db:updateLegalDoc', docId, updates),
    // Council
    getCouncilSessions: (worldId, limit) => ipcRenderer.invoke('db:getCouncilSessions', worldId, limit),
    createCouncilSession: (worldId, prompt, models) => ipcRenderer.invoke('db:createCouncilSession', worldId, prompt, models),
    saveCouncilResponse: (sessionId, data) => ipcRenderer.invoke('db:saveCouncilResponse', sessionId, data),
    getCouncilResponses: (sessionId) => ipcRenderer.invoke('db:getCouncilResponses', sessionId),
    // Archive & Snapshots
    getSnapshots: (worldId, limit) => ipcRenderer.invoke('db:getSnapshots', worldId, limit),
    saveWorldSnapshot: (worldId, label) => ipcRenderer.invoke('db:saveWorldSnapshot', worldId, label),
    // R&D Lab
    getExperiments: (worldId, limit) => ipcRenderer.invoke('db:getExperiments', worldId, limit),
    createExperiment: (worldId, data) => ipcRenderer.invoke('db:createExperiment', worldId, data),
    updateExperiment: (experimentId, updates) => ipcRenderer.invoke('db:updateExperiment', experimentId, updates),
  },

  // ── AI dispatch ────────────────────────────────────────────────────
  ai: {
    dispatch: (task) => ipcRenderer.invoke('ai:dispatch', task),
    listProviders: () => ipcRenderer.invoke('ai:listProviders'),
    ping: (provider) => ipcRenderer.invoke('ai:ping', provider),
  },

  // ── API key management ─────────────────────────────────────────────
  keys: {
    store: (provider, key, displayName) =>
      ipcRenderer.invoke('keys:store', provider, key, displayName),
    list: () => ipcRenderer.invoke('keys:list'), // returns metadata ONLY, never keys
    delete: (provider) => ipcRenderer.invoke('keys:delete', provider),
  },

  // ── World state (push updates from main → renderer) ────────────────
  world: {
    getState: () => ipcRenderer.invoke('world:getState'),
    onStateUpdate: (callback) => {
      const handler = (_event, delta) => callback(delta);
      ipcRenderer.on('world:stateUpdate', handler);
      // Return unsubscribe function for cleanup
      return () => ipcRenderer.removeListener('world:stateUpdate', handler);
    },
  },

  // ── App info ───────────────────────────────────────────────────────
  app: {
    getVersion: () => ipcRenderer.invoke('app:getVersion'),
    getPlatform: () => ipcRenderer.invoke('app:getPlatform'),
  },
});
