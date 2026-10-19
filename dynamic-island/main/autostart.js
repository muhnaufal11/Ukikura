"use strict";
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const ROOT_DIR = path.resolve(__dirname, "../..");
let getMainWindow = () => null;
let onRefreshTray = () => {};
function initAutoStart(mainWinGetter, refreshTrayCb) { getMainWindow = mainWinGetter; onRefreshTray = refreshTrayCb || (() => {}); }

function getStartupVbsPath() {
    const appData = process.env.APPDATA || path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming');
    return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'NusaDynamicIsland.vbs');
}

function isWindowsAutoStartEnabled() {
    try {
        return fs.existsSync(getStartupVbsPath());
    } catch (_) {
        return false;
    }
}

function setWindowsAutoStart(enable) {
    const vbsPath = getStartupVbsPath();
    try {
        if (enable) {
            const electronExe = path.join(ROOT_DIR, 'node_modules', 'electron', 'dist', 'electron.exe');
            const mainScript = path.join(ROOT_DIR, 'island-main.js');
            const vbsContent = [
                'Set WshShell = CreateObject("WScript.Shell")',
                `WshShell.CurrentDirectory = "${ROOT_DIR}"`,
                'Set WshEnv = WshShell.Environment("PROCESS")',
                'WshEnv("ELECTRON_RUN_AS_NODE") = ""',
                `WshShell.Run """${electronExe}"" ""${mainScript}""", 0, False`,
                ''
            ].join('\r\n');
            fs.writeFileSync(vbsPath, vbsContent, 'utf8');
            execFile('reg.exe', [
                'add',
                'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
                '/v', 'NusaDynamicIsland',
                '/t', 'REG_SZ',
                '/d', `wscript.exe "${vbsPath}"`,
                '/f'
            ], { windowsHide: true }, () => {});
        } else {
            if (fs.existsSync(vbsPath)) {
                fs.unlinkSync(vbsPath);
            }
            execFile('reg.exe', [
                'delete',
                'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
                '/v', 'NusaDynamicIsland',
                '/f'
            ], { windowsHide: true }, () => {});
        }
    } catch (_) {}
    const mainWindow = getMainWindow(); if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('autostart-state', isWindowsAutoStartEnabled());
    }
    onRefreshTray();
}

module.exports = { initAutoStart, getStartupVbsPath, isWindowsAutoStartEnabled, setWindowsAutoStart };
