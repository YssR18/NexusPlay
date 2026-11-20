// ============================================================================
// NexusPlay v4.0 Master Edition - Electron Desktop Backend (main.js)
// Calibrated for Lenovo ThinkPad L13 Yoga | AMD Ryzen 7 PRO 5875U | 16GB RAM
// ============================================================================
const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const { exec, execFile } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

let mainWindow = null;
let tray = null;
const DEFAULT_BLACKLIST = ["chrome.exe","msedge.exe","OneDrive.exe","Discord.exe","Spotify.exe","CapCut.exe","Teams.exe","SteamWebHelper.exe"];
const DEFAULT_SERVICES = ["SysMain","WSearch","Spooler","DiagTrack","wuauserv"];

// Power plans (built into every Windows install)
const PLAN_HIGH_PERFORMANCE = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c';
const PLAN_BALANCED = '381b4222-f694-41f0-9685-ff5bb260df2e';

// Safety: never touch critical Windows processes / services
const PROTECTED_PROCESSES = new Set(['explorer.exe','csrss.exe','winlogon.exe','svchost.exe','system','lsass.exe','services.exe','dwm.exe','smss.exe','wininit.exe','fontdrvhost.exe','taskmgr.exe','nexusplay.exe','electron.exe']);
const PROTECTED_SERVICES = new Set(['rpcss','dcomlaunch','winmgmt','eventlog','plugplay','lsm','brokerinfrastructure','samss','dhcp','dnscache','nsi','power','profsvc','bfe','mpssvc','windefend','lanmanserver','lanmanworkstation']);

const TRAY_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABFklEQVR4nO3OyS5FURCF4Tuy99ndeWtEEwTRBLlEE0QTpKqiCYJo4p2Widmp8Zrwv8D/jUb//dbbJHqbQm/TaDaDZrNoNodm82i2gGaLqLaEasuotoJqq6i2hmrrqLaBYpsotoWi2yi6g6JjFN1F1j1k3UfWA2Q9RNYjZD2GA+DNs554AN486ekQwJwnPfMAvHnScw/Amye98AC8edJLD8CbJ73yALx5p9dDAHPe6Y0H4M07FQ/Am3eqHoA378Q8AG/eya0H4M2j3HkA3jzK/RDAnEd58AC8eZRHB0CcR3nyALx5lGcPwJtHefEAvHmQ1yGAOQ/y5gF48yDvHoA3D/LhAXjzIJ8egDcP8uUBePMJ+R4C/mw/9mdjRhVg9ooAAAAASUVORK5CYII=';

// ---------- helpers ----------
function run(cmd) {
    return new Promise(resolve => {
        exec(cmd, { windowsHide: true, timeout: 120000 }, (err, stdout, stderr) => resolve({ ok: !err, stdout, stderr }));
    });
}

function cleanExeList(list, fallback) {
    const src = Array.isArray(list) ? list : fallback;
    return src.filter(x => typeof x === 'string' && /^[\w .\-]{1,64}\.exe$/i.test(x) && !PROTECTED_PROCESSES.has(x.toLowerCase()));
}

function cleanServiceList(list, fallback) {
    const src = Array.isArray(list) ? list : fallback;
    return src.filter(x => typeof x === 'string' && /^[\w\-]{1,64}$/.test(x) && !PROTECTED_SERVICES.has(x.toLowerCase()));
}

function expandEnv(p) {
    return String(p || '').replace(/%([^%]+)%/g, (m, k) => process.env[k] || m);
}

async function applyBoost(opts = {}) {
    const apps = cleanExeList(opts.processes, DEFAULT_BLACKLIST);
    const svcs = cleanServiceList(opts.services, DEFAULT_SERVICES);
    await Promise.all(apps.map(exe => run(`taskkill /F /IM "${exe}" /T`)));
    await Promise.all(svcs.map(svc => run(`net stop "${svc}"`)));
    if (opts.amdShaderCache) await run('del /q /f /s "%LocalAppData%\\AMD\\DxCache\\*"');
    if (opts.tempPrefetch) await run('del /q /f /s "%TEMP%\\*"');
    if (opts.ultimatePower !== false) await run(`powercfg /setactive ${PLAN_HIGH_PERFORMANCE}`);
    return { apps, svcs };
}

async function applyRestore(services) {
    const svcs = cleanServiceList(services, DEFAULT_SERVICES);
    await Promise.all(svcs.map(svc => run(`net start "${svc}"`)));
    await run(`powercfg /setactive ${PLAN_BALANCED}`);
}

// ---------- window & tray ----------
function createTray() {
    try {
        tray = new Tray(nativeImage.createFromDataURL(TRAY_ICON));
        tray.setToolTip('NexusPlay v4.0');
        tray.setContextMenu(Menu.buildFromTemplate([
            { label: 'إظهار NexusPlay', click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } } },
            { type: 'separator' },
            { label: 'خروج', click: () => app.quit() }
        ]));
        tray.on('click', () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
    } catch (e) { tray = null; }
}

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
            nodeIntegration: false,
            sandbox: false
        }
    });

    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (e, url) => {
        if (!url.startsWith('file://')) e.preventDefault();
    });
    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

// ---------- 1. Live telemetry (real CPU %, RAM, SSD) ----------
let lastCpu = null;
function sampleCpu() {
    const cpus = os.cpus();
    let idle = 0, total = 0;
    cpus.forEach(c => {
        for (const t in c.times) total += c.times[t];
        idle += c.times.idle;
    });
    const cur = { idle, total };
    let load = 0;
    if (lastCpu && cur.total > lastCpu.total) {
        load = Math.round(100 * (1 - (cur.idle - lastCpu.idle) / (cur.total - lastCpu.total)));
    }
    lastCpu = cur;
    return Math.min(100, Math.max(0, load));
}
sampleCpu();

ipcMain.handle('nexus:telemetry', async () => {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const toGB = v => Number((v / (1024 ** 3)).toFixed(1));
    let ssdFreeGB = null, ssdTotalGB = null;
    try {
        const st = fs.statfsSync('C:\\');
        ssdFreeGB = toGB(st.bavail * st.bsize);
        ssdTotalGB = toGB(st.blocks * st.bsize);
    } catch (e) {}
    return {
        totalMemGB: toGB(totalMem),
        usedMemGB: toGB(totalMem - freeMem),
        freeMemGB: toGB(freeMem),
        cpuLoad: sampleCpu(),
        cpuModel: os.cpus()[0]?.model || 'AMD Ryzen 7 PRO 5875U',
        ssdFreeGB,
        ssdTotalGB
    };
});

// ---------- 2. Booster / restore ----------
ipcMain.handle('nexus:boost-system', async (event, payload) => {
    const r = await applyBoost(payload || {});
    return { ok: true, closed: r.apps.length, stopped: r.svcs.length };
});

ipcMain.handle('nexus:restore-system', async (event, payload) => {
    await applyRestore(payload?.services);
    return { ok: true };
});

// ---------- 3. Direct game launch ----------
const PRIORITY = { Turbo: '/HIGH', Balanced: '/ABOVENORMAL', Light: '/NORMAL' };
const SAFE_FLAGS = /^[\w\s\-:=.,\\\/]*$/;
const stripQuotes = s => String(s || '').replace(/["\r\n]/g, '');

ipcMain.handle('nexus:launch-game', async (event, p = {}) => {
    const exe = stripQuotes(p.exe);
    const target = stripQuotes(p.target);
    const flags = String(p.flags || '').trim();
    if (!exe || !fs.existsSync(exe)) return { ok: false, error: 'EXE_NOT_FOUND', path: exe };
    if (target && !fs.existsSync(target)) return { ok: false, error: 'TARGET_NOT_FOUND', path: target };
    if (!SAFE_FLAGS.test(flags)) return { ok: false, error: 'UNSAFE_FLAGS' };

    const priority = PRIORITY[p.profile] || '/NORMAL';
    const svcs = cleanServiceList(p.services, DEFAULT_SERVICES);

    if (p.boost !== false && p.profile !== 'Light') {
        await applyBoost({
            processes: p.processes,
            services: p.profile === 'Turbo' ? svcs : [],
            amdShaderCache: p.amdShaderCache,
            tempPrefetch: p.tempPrefetch,
            ultimatePower: p.ultimatePower
        });
    }

    const cmd = `start "" /WAIT ${priority} "${exe}"${flags ? ' ' + flags : ''}${target ? ` "${target}"` : ''}`;

    if (p.zeroRamTray && mainWindow) mainWindow.hide();

    exec(cmd, { windowsHide: false }, async () => {
        if (p.autoRestore) await applyRestore(p.profile === 'Turbo' ? svcs : []);
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.send('nexus:game-exited', { id: p.gameId });
        }
    });
    return { ok: true };
});

// ---------- 4. Save-data backup ----------
ipcMain.handle('nexus:backup-saves', async (event, { pcPath, ppssppPath, ps2Path } = {}) => {
    const root = 'C:\\NexusPlay_Backups';
    try { fs.mkdirSync(root, { recursive: true }); } catch (e) { return { ok: false, error: String(e.message) }; }
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
    const jobs = [
        { src: pcPath, name: 'PC', file: `PC_Saves_${stamp}.zip` },
        { src: ppssppPath, name: 'PPSSPP', file: `PPSSPP_Saves_${stamp}.zip` },
        { src: ps2Path, name: 'PS2', file: `PS2_Memcard_${stamp}.zip` }
    ];
    const done = [];
    let totalBytes = 0;
    for (const j of jobs) {
        const src = expandEnv(j.src);
        if (!src || !fs.existsSync(src)) continue;
        const dst = path.join(root, j.file);
        const script = "if (Test-Path -LiteralPath $env:NP_SRC -PathType Container) { Compress-Archive -Path (Join-Path $env:NP_SRC '*') -DestinationPath $env:NP_DST -Force } else { Compress-Archive -LiteralPath $env:NP_SRC -DestinationPath $env:NP_DST -Force }";
        const ok = await new Promise(resolve => {
            execFile('powershell', ['-NoProfile', '-Command', script], { env: { ...process.env, NP_SRC: src, NP_DST: dst }, windowsHide: true }, err => resolve(!err));
        });
        if (ok && fs.existsSync(dst)) {
            done.push(j.name);
            totalBytes += fs.statSync(dst).size;
        }
    }
    return {
        ok: done.length > 0,
        archiveName: `NexusPlay_Saves_${stamp}`,
        platforms: done.join(' + '),
        sizeMB: (totalBytes / (1024 * 1024)).toFixed(1) + ' MB'
    };
});

ipcMain.handle('nexus:open-backups', async () => {
    const root = 'C:\\NexusPlay_Backups';
    try { fs.mkdirSync(root, { recursive: true }); } catch (e) {}
    await shell.openPath(root);
    return { ok: true };
});

// ---------- 5. Real folder scanner ----------
const GAME_EXTS = new Set(['.exe', '.iso', '.cso', '.chd', '.bin']);
const SKIP_EXE = /(unins|uninstall|setup|install|redist|vcredist|dxsetup|crash|reporter|launcher_helper|updater|helper|unitycrash|dotnet|vc_redist|ue4prereq|easyanticheat|battleye)/i;

function walk(dir, depth, out, limit) {
    if (depth < 0 || out.length >= limit) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const ent of entries) {
        if (out.length >= limit) return;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            if (/^(\$recycle\.bin|system volume information|windows|node_modules)$/i.test(ent.name)) continue;
            walk(full, depth - 1, out, limit);
        } else {
            const ext = path.extname(ent.name).toLowerCase();
            if (!GAME_EXTS.has(ext)) continue;
            if (ext === '.exe' && SKIP_EXE.test(ent.name)) continue;
            out.push({ name: ent.name, path: full });
        }
    }
}

ipcMain.handle('nexus:scan-dirs', async (event, dirs) => {
    const list = (Array.isArray(dirs) ? dirs : ['C:\\Games', 'D:\\ROMs']).filter(d => typeof d === 'string').slice(0, 6);
    const out = [];
    list.forEach(d => walk(d, 4, out, 500));
    return out;
});

// ---------- app lifecycle ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
    });
    app.whenReady().then(() => { createWindow(); createTray(); });
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
