// ============================================================================
// NexusPlay v4.0 Master Edition - Secure Preload Bridge (preload.js)
// Exposes window.nexusAPI to the Renderer UI
// ============================================================================
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nexusAPI', {
    getSystemTelemetry: () => ipcRenderer.invoke('nexus:telemetry'),
    boostSystem: (payload) => ipcRenderer.send('nexus:boost-system', payload),
    launchGameDirect: (payload) => ipcRenderer.send('nexus:launch-game', payload),
    backupSaves: (payload) => ipcRenderer.send('nexus:backup-saves', payload)
});