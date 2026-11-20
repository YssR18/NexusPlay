// ============================================================================
// NexusPlay v4.0 Master Edition - Secure Preload Bridge (preload.js)
// Exposes window.nexusAPI to the Renderer UI
// ============================================================================
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('nexusAPI', {
    getSystemTelemetry: () => ipcRenderer.invoke('nexus:telemetry'),
    boostSystem: (payload) => ipcRenderer.invoke('nexus:boost-system', payload),
    restoreSystem: (payload) => ipcRenderer.invoke('nexus:restore-system', payload),
    launchGameDirect: (payload) => ipcRenderer.invoke('nexus:launch-game', payload),
    backupSaves: (payload) => ipcRenderer.invoke('nexus:backup-saves', payload),
    openBackups: () => ipcRenderer.invoke('nexus:open-backups'),
    scanDefaultDirectories: (dirs) => ipcRenderer.invoke('nexus:scan-dirs', dirs),
    getPathForFile: (file) => {
        try { return webUtils && webUtils.getPathForFile ? webUtils.getPathForFile(file) : (file.path || ''); }
        catch (e) { return file.path || ''; }
    },
    onGameExited: (cb) => ipcRenderer.on('nexus:game-exited', (_e, data) => cb(data))
});
