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
