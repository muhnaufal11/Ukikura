"use strict";
const fs = require("fs");
const path = require("path");
const { execFile, execSync } = require("child_process");
const ROOT_DIR = path.resolve(__dirname, "../..");
let getMainWindow = () => null;
let onRefreshTray = () => {};

function initAutoStart(mainWinGetter, refreshTrayCb) {
    getMainWindow = mainWinGetter;
    onRefreshTray = refreshTrayCb || (() => {});

    // Bersihkan file VBS lawas dan key registry lama saat startup
    try {
        const vbsPath = getStartupVbsPath();
        if (fs.existsSync(vbsPath)) {
            fs.unlinkSync(vbsPath);
        }
        execFile('reg.exe', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'NusaDynamicIsland', '/f'], { windowsHide: true }, () => {});
    } catch (_) {}
}

function getStartupVbsPath() {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
    return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'NusaDynamicIsland.vbs');
}

function getLaunchCommand() {
    let exePath = process.execPath;
    let scriptPath = '';

    if (fs.existsSync(path.join(ROOT_DIR, 'runtime', 'electron.exe'))) {
        exePath = path.join(ROOT_DIR, 'runtime', 'electron.exe');
        scriptPath = path.join(ROOT_DIR, 'dynamic-island', 'main.js');
    } else if (fs.existsSync(path.join(ROOT_DIR, 'node_modules', 'electron', 'dist', 'electron.exe'))) {
        exePath = path.join(ROOT_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');
        scriptPath = fs.existsSync(path.join(ROOT_DIR, 'island-main.js'))
            ? path.join(ROOT_DIR, 'island-main.js')
            : path.join(ROOT_DIR, 'dynamic-island', 'main.js');
    } else {
        exePath = process.execPath;
        scriptPath = path.join(ROOT_DIR, 'dynamic-island', 'main.js');
    }
    return { exePath, scriptPath };
}

function isWindowsAutoStartEnabled() {
    try {
        const out = execSync('reg.exe query HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v Ukikura', { windowsHide: true }).toString();
        return out.includes('Ukikura');
    } catch (_) {
        return false;
    }
}

function setWindowsAutoStart(enable) {
    const vbsPath = getStartupVbsPath();
    try {
        // Hapus selalu VBS lawas yang memicu error Windows Script Host
        if (fs.existsSync(vbsPath)) {
            fs.unlinkSync(vbsPath);
        }
        execFile('reg.exe', ['delete', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', 'NusaDynamicIsland', '/f'], { windowsHide: true }, () => {});

        if (enable) {
            const { exePath, scriptPath } = getLaunchCommand();
            const cmd = scriptPath ? `"${exePath}" "${scriptPath}"` : `"${exePath}"`;
            execFile('reg.exe', [
                'add',
                'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
                '/v', 'Ukikura',
                '/t', 'REG_SZ',
                '/d', cmd,
                '/f'
            ], { windowsHide: true }, () => {});
        } else {
            execFile('reg.exe', [
                'delete',
                'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
                '/v', 'Ukikura',
                '/f'
            ], { windowsHide: true }, () => {});
        }
    } catch (_) {}

    const mainWindow = getMainWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('autostart-state', isWindowsAutoStartEnabled());
    }
    onRefreshTray();
}

module.exports = { initAutoStart, getStartupVbsPath, isWindowsAutoStartEnabled, setWindowsAutoStart };
