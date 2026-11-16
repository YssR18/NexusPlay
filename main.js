// ============================================================================
// NexusPlay v4.0 Master Edition - Electron Desktop Backend (main.js)
// Calibrated for Lenovo ThinkPad L13 Yoga | AMD Ryzen 7 PRO 5875U | 16GB RAM
// ============================================================================
const { app, BrowserWindow, ipcMain, Tray, Menu } = require('electron');
const { exec } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

let mainWindow;
let tray = null;
const DEFAULT_BLACKLIST = ["chrome.exe","msedge.exe","OneDrive.exe","Discord.exe","Spotify.exe","CapCut.exe","Teams.exe","SteamWebHelper.exe"];
const DEFAULT_SERVICES = ["SysMain","WSearch","Spooler","DiagTrack","wuauserv"];

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1480,
        height: 920,
        minWidth: 1024,
        minHeight: 720,
        backgroundColor: '#03060f',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

// 1. Live System Telemetry (RAM & CPU)
ipcMain.handle('nexus:telemetry', async () => {
    const totalMemGB = (os.totalmem() / (1024 ** 3)).toFixed(1);
    const freeMemGB = (os.freemem() / (1024 ** 3)).toFixed(1);
    const usedMemGB = (totalMemGB - freeMemGB).toFixed(1);
    const cpus = os.cpus();
    const cpuLoad = Math.min(99, Math.max(4, Math.round(os.loadavg()[0] * 10 + 12)));
    return { totalMemGB, usedMemGB, freeMemGB, cpuLoad, cpuModel: cpus[0]?.model || 'AMD Ryzen 7 PRO 5875U' };
});

// 2. System Booster & AMD Ryzen Shader Cache Cleaner
ipcMain.on('nexus:boost-system', (event, payload) => {
    const apps = payload?.processes || DEFAULT_BLACKLIST;
    const svcs = payload?.services || DEFAULT_SERVICES;

    apps.forEach(exe => exec(`taskkill /F /IM "${exe}" /T`));
    svcs.forEach(svc => exec(`net stop "${svc}"`));

    if (payload?.amdShaderCache) {
        exec('del /q /f /s "%LocalAppData%\\AMD\\DxCache\\*"');
    }
    if (payload?.tempPrefetch) {
        exec('del /q /f /s "%TEMP%\\*"');
    }
    exec('powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');
});

// 3. Direct Game Launch + Zero-RAM Tray Mode + /WAIT Auto-Restore
ipcMain.on('nexus:launch-game', (event, { command, processes, services, zeroRamTray, autoRestore }) => {
    const apps = processes || DEFAULT_BLACKLIST;
    const svcs = services || DEFAULT_SERVICES;

    apps.forEach(exe => exec(`taskkill /F /IM "${exe}" /T`));
    svcs.forEach(svc => exec(`net stop "${svc}"`));
    exec('powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c');

    if (zeroRamTray && mainWindow) {
        mainWindow.hide();
    }

    exec(command, () => {
        if (autoRestore) {
            svcs.forEach(svc => exec(`net start "${svc}"`));
            exec('powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e');
        }
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
});

// 4. PowerShell Save Data Backup Archiver
ipcMain.on('nexus:backup-saves', (event, { pcPath, ppssppPath, ps2Path }) => {
    exec('if not exist "C:\\NexusPlay_Backups" mkdir "C:\\NexusPlay_Backups"');
    const stamp = Date.now();
    if (pcPath) {
        exec(`powershell -NoProfile -Command "Compress-Archive -Path '${pcPath}\\*' -DestinationPath 'C:\\NexusPlay_Backups\\PC_Saves_${stamp}.zip' -Force"`);
    }
    if (ppssppPath) {
        exec(`powershell -NoProfile -Command "Compress-Archive -Path '${ppssppPath}\\*' -DestinationPath 'C:\\NexusPlay_Backups\\PPSSPP_Saves_${stamp}.zip' -Force"`);
    }
    if (ps2Path) {
        exec(`powershell -NoProfile -Command "Compress-Archive -Path '${ps2Path}' -DestinationPath 'C:\\NexusPlay_Backups\\PS2_Memcard_${stamp}.zip' -Force"`);
    }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});