"use strict";
const { app, BrowserWindow, ipcMain, screen, shell, Tray, Menu, nativeImage, powerMonitor, desktopCapturer, session, dialog } = require("electron");
app.name = 'Ukikura';
try { app.setName('Ukikura'); } catch (_) {}
const fs = require("fs");
const path = require("path");
const http = require("http");
const { initLmsCrawler, openLmsLoginWindow, runHiddenLmsCrawler, postJsonToServer } = require("./main/lms-crawler");
const { initWinRtClient, startWinRtBridge, sendMediaCommand, fetchSyncedLyrics, getWinRtProc, resetLyricsTrackKey, getLastLyricsPayload } = require("./main/winrt-client");
const { initWhatsAppCompanion, ensureWhatsAppWindow, pollWhatsAppUnread, resetWaState, replyWhatsApp } = require("./main/whatsapp-companion");
const { initAutoStart, isWindowsAutoStartEnabled, setWindowsAutoStart } = require("./main/autostart");
const { startKuraServer } = require("./main/kura-server");
const { initAutoUpdater, checkGitHubForUpdates, getLastUpdateStatus, openUpdateDownloadPage, getLocalVersionInfo, setUpdateChannel } = require("./main/updater");
const { initClipboardWatcher, getIsDraggingFile } = require("./main/clipboard-watcher");

let mainWindow = null;
let loginWindow = null;
let tray = null;
let serverProcess = null;
let isExpanded = false;
let isPeekActive = false;

const PROXY_PORT = 8089;
const SERVER_BASE = `http://127.0.0.1:${PROXY_PORT}`;

// Ukuran kanvas transparan tetap agar animasi pegas CSS (--spring) Nusa berjalan 60fps tanpa terpotong
const WINDOW_WIDTH = 580;
const WINDOW_HEIGHT = 240;

// Dimensi visual kapsul Nusa di dalam kanvas
const CLOSED_NOTCH_W = 176;
const CLOSED_NOTCH_H = 25;
const OPEN_NOTCH_W = 520;
const OPEN_NOTCH_H = 188;

let isTucked = false;
let isPinnedOpen = false;
let leaveCloseTimer = null;
let winrtProc = null;
let lastLyricsTrackKey = '';

const IS_DEBUG = process.argv.includes('--ukikura-debug') || process.argv.includes('--dev') || process.env.UKIKURA_DEBUG === '1';
const LOG_DIR = path.join(app.getPath('userData'), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'ukikura-debug.log');

function logDebug(...args) {
    const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const line = `[${ts}] ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')}`;
    if (IS_DEBUG) {
        console.log(line);
    }
    try {
        if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
        fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
    } catch (_) {}
}

process.on('uncaughtException', (err) => {
    logDebug('UNCAUGHT EXCEPTION:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
    logDebug('UNHANDLED REJECTION:', reason && reason.stack ? reason.stack : reason);
});

function checkServerAlive() {
    return new Promise((resolve) => {
        const req = http.get(`${SERVER_BASE}/__qbot__/config`, { timeout: 1200 }, (res) => {
            res.resume();
            resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
    });
}

async function ensureBackendServer() {
    const alive = await checkServerAlive();
    if (alive) {
        console.log('[Ukikura] Kura Local Vault sudah berjalan di port 8089.');
        return;
    }
    await startKuraServer(PROXY_PORT);
}

function getCenteredX(width) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth } = primaryDisplay.workAreaSize;
    return Math.round((screenWidth - width) / 2);
}

function getAppIconPath() {
    const candidates = [
        path.join(__dirname, '..', 'assets', 'ukikura-logo.ico'),
        path.join(__dirname, '..', 'assets', 'ukikura-logo.png'),
        path.join(__dirname, 'renderer', 'icon.ico'),
        path.join(__dirname, 'renderer', 'icon.png')
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return undefined;
}

function createIslandWindow() {
    mainWindow = new BrowserWindow({
        width: WINDOW_WIDTH,
        height: WINDOW_HEIGHT,
        x: getCenteredX(WINDOW_WIDTH),
        y: 0,
        icon: getAppIconPath(),
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        resizable: false,
        movable: true,
        skipTaskbar: true,
        hasShadow: false,
        focusable: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            backgroundThrottling: false
        }
    });

    mainWindow.setAlwaysOnTop(true, 'screen-saver');
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.setIgnoreMouseEvents(true, { forward: true });

    // Request handler untuk loopback audio desktop real-time (WASAPI Loopback)
    try {
        session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
            desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
                if (sources && sources.length > 0) {
                    callback({ video: sources[0], audio: 'loopback' });
                } else {
                    callback({});
                }
            }).catch(() => {
                callback({});
            });
        });
    } catch (_) {}

    // Kunci posisi vertikal agar selalu menyatu dengan frame atas (y = 0)
    mainWindow.on('moved', () => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const b = mainWindow.getBounds();
        if (b.y !== 0) {
            mainWindow.setBounds({ x: b.x, y: 0, width: WINDOW_WIDTH, height: WINDOW_HEIGHT }, false);
        }
    });

    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown') {
            if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
                event.preventDefault();
                mainWindow.webContents.toggleDevTools({ mode: 'detach' });
            } else if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
                event.preventDefault();
                mainWindow.webContents.reloadIgnoringCache();
            }
        }
    });

    if (IS_DEBUG) {
        logDebug('Ukikura running in DEBUG mode (IS_DEBUG=true)');
        mainWindow.webContents.on('did-finish-load', () => {
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        });
    }

    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        logDebug(`[Renderer] [${level}] ${message} (${sourceId}:${line})`);
    });
    mainWindow.webContents.on('did-finish-load', () => {
        logDebug('createIslandWindow: did-finish-load event fired');
    });
    mainWindow.webContents.on('did-fail-load', (e, errorCode, errorDescription) => {
        logDebug('mainWindow did-fail-load:', errorCode, errorDescription);
    });
    mainWindow.webContents.on('render-process-gone', (e, details) => {
        logDebug('mainWindow render-process-gone:', details);
    });
    mainWindow.on('close', (e) => {
        logDebug('mainWindow close event, isQuitting:', app.isQuitting);
    });
    mainWindow.on('closed', () => {
        logDebug('mainWindow closed event');
        mainWindow = null;
    });

    logDebug('createIslandWindow: loading file index.html');
    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    startNusaHoverLoop();
    initClipboardWatcher(mainWindow);
}

let lastIgnoreState = null;
let lastPassthroughState = false;
let hoverOpenTimer = null;
let lastPtX = -9999;
let lastPtY = -9999;

function startNusaHoverLoop() {
    setInterval(() => {
        if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return;

        const pt = screen.getCursorScreenPoint();
        const b = mainWindow.getBounds();
        const centerX = b.x + Math.round(b.width / 2);

        if (isExpanded) {
            if (hoverOpenTimer) {
                clearTimeout(hoverOpenTimer);
                hoverOpenTimer = null;
            }
            if (lastPassthroughState) {
                lastPassthroughState = false;
                mainWindow.webContents.send('nusa-state', { expanded: true, mode: 'normal' });
            }
            // Area aktif saat notch sedang terbuka (480 x 188 + margin toleransi)
            const halfW = Math.round(OPEN_NOTCH_W / 2) + 20;
            const insideOpen =
                pt.x >= (centerX - halfW) &&
                pt.x <= (centerX + halfW) &&
                pt.y >= 0 &&
                pt.y <= (OPEN_NOTCH_H + 16);

            const isDragging = typeof getIsDraggingFile === 'function' && getIsDraggingFile();
            if (insideOpen || isPinnedOpen || isDragging) {
                if (leaveCloseTimer) {
                    clearTimeout(leaveCloseTimer);
                    leaveCloseTimer = null;
                }
                const needIgnore = isPinnedOpen && !insideOpen;
                if (lastIgnoreState !== needIgnore) {
                    lastIgnoreState = needIgnore;
                    mainWindow.setIgnoreMouseEvents(needIgnore, { forward: true });
                }
            } else {
                // Kursor keluar dari area notch terbuka: tutup otomatis setelah jeda singkat
                if (!leaveCloseTimer) {
                    leaveCloseTimer = setTimeout(() => {
                        leaveCloseTimer = null;
                        isExpanded = false;
                        lastIgnoreState = true;
                        lastPassthroughState = false;
                        if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.setIgnoreMouseEvents(true, { forward: true });
                            mainWindow.webContents.send('nusa-state', { expanded: false, mode: 'normal' });
                        }
                    }, 220);
                }
            }
            return;
        }

        // Kirim posisi relatif kursor untuk animasi lirikan mata maskot (hanya saat mode tertutup & bergerak > 4px)
        if (!isTucked && !isExpanded && (Math.abs(pt.x - lastPtX) > 4 || Math.abs(pt.y - lastPtY) > 4)) {
            lastPtX = pt.x;
            lastPtY = pt.y;
            mainWindow.webContents.send('nusa-cursor', {
                dx: pt.x - centerX,
                dy: pt.y - 15
            });
        }

        if (!isExpanded && isPeekActive) {
            const halfPeekW = 205;
            const insidePeek = pt.x >= (centerX - halfPeekW) && pt.x <= (centerX + halfPeekW) && pt.y >= 0 && pt.y <= 96;
            if (insidePeek) {
                if (lastIgnoreState !== false) {
                    lastIgnoreState = false;
                    mainWindow.setIgnoreMouseEvents(false);
                }
                return;
            }
        }

        const halfClosedW = Math.round(CLOSED_NOTCH_W / 2) + 12;
        const inHorizontalSpan = pt.x >= (centerX - halfClosedW) && pt.x <= (centerX + halfClosedW);
        const inTabBarSpan = pt.x >= (centerX - halfClosedW - 48) && pt.x <= (centerX + halfClosedW + 48);

        // Kursor berada di barisan Tab Browser (y = 0..44px):
        // Seluruh barisan tab bebas diklik 100% tanpa halangan!
        const hoveringBrowserTabs = inTabBarSpan && pt.y >= 0 && pt.y <= 44;

        if (hoveringBrowserTabs) {
            // Segera aktifkan mode tembus pandang & tembus klik (passthrough)
            if (!lastPassthroughState) {
                lastPassthroughState = true;
                mainWindow.webContents.send('nusa-state', { expanded: false, mode: 'passthrough' });
            }
            if (lastIgnoreState !== true) {
                lastIgnoreState = true;
                mainWindow.setIgnoreMouseEvents(true, { forward: true });
            }

            // Buka Dynamic Island hanya jika pengguna sengaja menahan kursor (dwell) di area notch selama >= 320ms
            if (inHorizontalSpan && !isTucked) {
                if (!hoverOpenTimer) {
                    hoverOpenTimer = setTimeout(() => {
                        hoverOpenTimer = null;
                        if (!isExpanded && !isTucked && mainWindow && !mainWindow.isDestroyed()) {
                            isExpanded = true;
                            lastIgnoreState = false;
                            lastPassthroughState = false;
                            mainWindow.setIgnoreMouseEvents(false);
                            mainWindow.webContents.send('nusa-state', { expanded: true, mode: 'normal' });
                        }
                    }, 320);
                }
            } else if (hoverOpenTimer) {
                clearTimeout(hoverOpenTimer);
                hoverOpenTimer = null;
            }
        } else {
            if (hoverOpenTimer) {
                clearTimeout(hoverOpenTimer);
                hoverOpenTimer = null;
            }
            if (lastPassthroughState) {
                lastPassthroughState = false;
                mainWindow.webContents.send('nusa-state', { expanded: false, mode: 'normal' });
            }
            // Selalu tembuskan semua klik ke aplikasi di bawahnya saat di luar notch
            if (lastIgnoreState !== true) {
                lastIgnoreState = true;
                mainWindow.setIgnoreMouseEvents(true, { forward: true });
            }
        }
    }, 60);
}

function setIslandExpanded(expand) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    isExpanded = Boolean(expand);
    if (isExpanded) {
        isTucked = false;
        lastIgnoreState = false;
        mainWindow.setIgnoreMouseEvents(false);
    } else {
        isPinnedOpen = false;
    }
    mainWindow.webContents.send('nusa-state', { expanded: isExpanded });
}

function setIslandTucked(tuck) {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    isTucked = Boolean(tuck);
    if (isTucked) {
        isExpanded = false;
        isPinnedOpen = false;
    }
}


initLmsCrawler(() => mainWindow);
initWinRtClient(() => mainWindow);
initWhatsAppCompanion(() => mainWindow);
initAutoStart(() => mainWindow, () => refreshTrayMenu());
initAutoUpdater(() => mainWindow);

function buildIslandMenu() {
    return Menu.buildFromTemplate([
        {
            label: 'Tampilkan / Sembunyikan Ukikura Dynamic Island',
            click: () => {
                if (!mainWindow) return;
                if (mainWindow.isVisible()) mainWindow.hide();
                else mainWindow.show();
            }
        },
        {
            label: 'Reset Posisi ke Tengah Frame Atas',
            click: () => {
                if (!mainWindow) return;
                mainWindow.setBounds({ x: getCenteredX(WINDOW_WIDTH), y: 0, width: WINDOW_WIDTH, height: WINDOW_HEIGHT }, true);
                mainWindow.show();
            }
        },
        {
            label: 'Lipat / Buka dari Bezel Atas (Tidak Ganggu Tab)',
            click: () => {
                if (!mainWindow) return;
                if (!mainWindow.isVisible()) mainWindow.show();
                mainWindow.webContents.send('toggle-tuck');
            }
        },
        { type: 'separator' },
        {
            label: 'Jalankan Otomatis Saat Windows Menyala (Auto Start)',
            type: 'checkbox',
            checked: isWindowsAutoStartEnabled(),
            click: (menuItem) => {
                setWindowsAutoStart(menuItem.checked);
            }
        },
        {
            label: `Ukikura v${getLocalVersionInfo().versionName || '1.0.0'} (Kode: ${getLocalVersionInfo().versionCode || 7})`,
            enabled: false
        },
        {
            label: 'Cek Pembaruan di GitHub...',
            click: async () => {
                const res = await checkGitHubForUpdates(true);
                if (res && res.hasUpdate) {
                    openUpdateDownloadPage();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Tautkan / Buka WhatsApp Companion (Deteksi WA Realtime)...',
            click: () => ensureWhatsAppWindow(true)
        },
        {
            label: 'Buka Pengaturan Phone Link Windows (Notifikasi HP)...',
            click: () => shell.openExternal('ms-phone:')
        },
        { type: 'separator' },
        {
            label: 'Sinkronisasi Tugas LMS Sekarang',
            click: () => {
                runHiddenLmsCrawler();
                postJsonToServer('/__qbot__/tasks/sync', {});
            }
        },
        {
            label: 'Login / Tautkan Sesi LMS...',
            click: () => openLmsLoginWindow()
        },
        { type: 'separator' },
        {
            label: 'Mode Pengembang & Debug',
            submenu: [
                {
                    label: 'Buka / Tutup Developer Tools (F12)',
                    click: () => {
                        if (!mainWindow || mainWindow.isDestroyed()) return;
                        mainWindow.webContents.toggleDevTools({ mode: 'detach' });
                    }
                },
                {
                    label: 'Muat Ulang UI (F5 / Reload)',
                    click: () => {
                        if (!mainWindow || mainWindow.isDestroyed()) return;
                        mainWindow.webContents.reloadIgnoringCache();
                    }
                },
                {
                    label: 'Buka Folder File Log Debug (%LOCALAPPDATA%\\Ukikura\\logs)',
                    click: () => {
                        fs.mkdirSync(LOG_DIR, { recursive: true });
                        shell.openPath(LOG_DIR);
                    }
                }
            ]
        },
        { type: 'separator' },
        {
            label: 'Keluar dari Ukikura',
            click: () => {
                app.isQuitting = true;
                const wp = getWinRtProc(); if (wp) { try { wp.kill(); } catch (_) {} }
                app.quit();
            }
        }
    ]);
}

function refreshTrayMenu() {
    if (!tray) return;
    tray.setContextMenu(buildIslandMenu());
}

function createTray() {
    const iconPath = getAppIconPath();
    let image = iconPath ? nativeImage.createFromPath(iconPath) : null;
    if (!image || image.isEmpty()) {
        const iconDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAABMSURBVDhPY2RgYPgPxFQBjAwMDP8pZRpGgxrAwMDAgM0wXBqwaRgNawBDAwMDNgaG/6SG0bAGMDQ0NGBjYPxPahgNGwYGBgYGAA46E8X6+X5hAAAAAElFTkSuQmCC';
        image = nativeImage.createFromDataURL(iconDataUrl);
    } else {
        image = image.resize({ width: 16, height: 16 });
    }
    tray = new Tray(image);
    tray.setToolTip('Ukikura (浮倉) — Dynamic Island, Lirik, WA/HP & Gudang Tugas');

    refreshTrayMenu();
    tray.on('click', () => {
        if (!mainWindow) return;
        if (!mainWindow.isVisible()) mainWindow.show();
        setIslandExpanded(!isExpanded);
    });
}

// IPC Events dari UI Dynamic Island
ipcMain.on('island-get-autostart', (event) => {
    event.reply('autostart-state', isWindowsAutoStartEnabled());
});

ipcMain.on('island-toggle-autostart', (event) => {
    const nextState = !isWindowsAutoStartEnabled();
    setWindowsAutoStart(nextState);
    event.reply('autostart-state', isWindowsAutoStartEnabled());
});

ipcMain.on('island-check-update', async (event, manual = true) => {
    const status = await checkGitHubForUpdates(Boolean(manual));
    event.reply('update-status', status);
});

ipcMain.on('island-get-version', (event) => {
    event.reply('version-info', getLocalVersionInfo());
});

ipcMain.on('island-set-channel', async (event, targetChannel) => {
    const updatedInfo = setUpdateChannel(targetChannel);
    event.reply('version-info', updatedInfo);
    const status = await checkGitHubForUpdates(true);
    event.reply('update-status', status);
});

ipcMain.on('island-open-update', () => {
    openUpdateDownloadPage();
});

ipcMain.handle('get-desktop-audio-source', async () => {
    try {
        const sources = await desktopCapturer.getSources({ types: ['screen'] });
        return sources[0]?.id || null;
    } catch (_) {
        return null;
    }
});

ipcMain.on('island-context-menu', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const menu = buildIslandMenu();
    menu.popup({ window: mainWindow });
});

ipcMain.on('island-resize', (event, expand) => setIslandExpanded(expand));
ipcMain.on('island-pin', (event, pin) => { isPinnedOpen = Boolean(pin); });
ipcMain.on('island-tuck', (event, tuck) => setIslandTucked(tuck));
ipcMain.on('island-ignore-mouse', (event, ignore) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: Boolean(ignore) });
});
ipcMain.on('media-control', (event, action) => sendMediaCommand(action));
ipcMain.on('media-seek', (event, targetSec) => sendMediaCommand(`SEEK:${Math.max(0, Number(targetSec) || 0).toFixed(2)}`));
ipcMain.on('volume-change', (event, data) => {
    const num = Number(typeof data === 'object' && data !== null ? data.delta : data) || 0;
    sendMediaCommand(`VOL:${num >= 0 ? '+' : ''}${num.toFixed(3)}`);
});
ipcMain.on('volume-set', (event, pct) => sendMediaCommand(`VOLSET:${Math.max(0, Math.min(100, Number(pct) || 0)).toFixed(0)}`));
ipcMain.on('volume-mute', () => sendMediaCommand('VOLMUTE'));
ipcMain.on('volume-get', () => sendMediaCommand('VOLGET'));

ipcMain.on('island-request-lyrics', (event, data) => {
    if (!data || !data.title) return;
    if (getLastLyricsPayload() && (getLastLyricsPayload() && getLastLyricsPayload().title) === data.title && Array.isArray(getLastLyricsPayload().lines) && getLastLyricsPayload().lines.length > 0) {
        event.reply('lyrics-update', getLastLyricsPayload());
    } else {
        fetchSyncedLyrics(data.title, data.artist || '', Number(data.dur) || 0);
    }
});

ipcMain.on('island-open-wa', () => ensureWhatsAppWindow(true));
ipcMain.handle('send-wa-reply', async (event, payload) => {
    const { sender, text } = payload || {};
    return await replyWhatsApp(sender, text);
});
ipcMain.on('island-peek-active', (event, active) => {
    isPeekActive = Boolean(active);
    if (isPeekActive && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setIgnoreMouseEvents(false);
    }
});
ipcMain.on('island-open-phonelink', () => shell.openExternal('ms-phone:'));
ipcMain.on('island-open-url', (event, targetUrl) => { if (targetUrl && typeof targetUrl === 'string') shell.openExternal(targetUrl); });
ipcMain.on('island-login-lms', () => openLmsLoginWindow());
ipcMain.on('island-sync-now', async () => {
    postJsonToServer('/__qbot__/tasks/sync', {});
    await runHiddenLmsCrawler();
});
ipcMain.on('island-recenter', () => {
    if (mainWindow) mainWindow.setBounds({ x: getCenteredX(WINDOW_WIDTH), y: 0, width: WINDOW_WIDTH, height: WINDOW_HEIGHT }, true);
});
ipcMain.on('island-hide', () => { if (mainWindow) mainWindow.hide(); });
ipcMain.handle('island-pick-audio-file', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
        title: 'Pilih File Audio Custom (Alarm / Notifikasi)',
        properties: ['openFile'],
        filters: [
            { name: 'Berkas Audio (*.mp3, *.wav, *.ogg, *.m4a, *.aac, *.flac)', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'] },
            { name: 'Semua Berkas (*.*)', extensions: ['*'] }
        ]
    });
    if (!res.canceled && res.filePaths && res.filePaths.length > 0) {
        return res.filePaths[0];
    }
    return null;
});

ipcMain.on('island-quit', () => {
    app.isQuitting = true;
    const wp = getWinRtProc(); if (wp) { try { wp.kill(); } catch (_) {} }
    app.quit();
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (!mainWindow.isVisible()) mainWindow.show();
            setIslandExpanded(true);
            mainWindow.focus();
        }
    });

    app.on('before-quit', (e) => logDebug('app before-quit called'));
    app.on('will-quit', (e) => logDebug('app will-quit called'));
    app.on('quit', (e, code) => logDebug('app quit called with code', code));

    app.whenReady().then(async () => {
        try { app.setAppUserModelId('Ukikura Dynamic Island'); } catch (_) {}
        logDebug('whenReady: calling ensureBackendServer');
        await ensureBackendServer();
        logDebug('whenReady: calling createIslandWindow');
        createIslandWindow();
        logDebug('whenReady: calling createTray');
        createTray();
        logDebug('whenReady: calling startWinRtBridge');
        startWinRtBridge();

        // Buka kapsul Dynamic Island sesaat saat pertama kali dijalankan agar pengguna tahu aplikasi sudah aktif
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                setIslandExpanded(true);
                setTimeout(() => {
                    if (!isPinnedOpen) setIslandExpanded(false);
                }, 3200);
            }
        }, 700);

        // Hot-reload hanya aktif saat mode development aktif
        if (process.env.NODE_ENV === 'development') {
            try {
                const uiHtmlPath = path.join(__dirname, 'renderer', 'index.html');
                fs.watchFile(uiHtmlPath, { interval: 2000 }, (curr, prev) => {
                    if (curr.mtimeMs <= prev.mtimeMs) return;
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        resetWaState(); resetLyricsTrackKey();
                        mainWindow.webContents.reloadIgnoringCache();
                    }
                });
                const bridgePsPath = path.join(__dirname, 'bridge', 'winrt-bridge.ps1');
                fs.watchFile(bridgePsPath, { interval: 2000 }, (curr, prev) => {
                    if (curr.mtimeMs <= prev.mtimeMs) return;
                    const wp = getWinRtProc(); if (wp) { try { wp.kill(); } catch (_) {} }
                });
            } catch (_) {}
        }

        powerMonitor.on('on-ac', () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('charger-event', { charging: true });
            }
        });
        powerMonitor.on('on-battery', () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('charger-event', { charging: false });
            }
        });

        // Cek pembaruan versi Ukikura di direktori GitHub saat start & setiap 2 jam
        setTimeout(() => checkGitHubForUpdates(false), 6000);
        setInterval(() => checkGitHubForUpdates(false), 2 * 60 * 60 * 1000);

        // Pemantau WhatsApp Web dimuat secara on-demand saat pengguna mengklik chat/notifikasi untuk menghemat ~160 MB RAM
        // Notifikasi sistem tetap tertangkap 100% instan (0ms) via biner C++ ukikura-bridge.exe (UserNotificationListener)
        // setTimeout(() => ensureWhatsAppWindow(false), 3000);
        // setInterval(() => pollWhatsAppUnread(), 5000);

        // Jalankan background crawler LMS otomatis saat start & setiap 5 menit
        setTimeout(() => runHiddenLmsCrawler(), 4000);
        setInterval(() => runHiddenLmsCrawler(), 5 * 60 * 1000);

        // Pembersihan sampah memori V8 Main Process berkala (3 menit)
        setInterval(() => {
            if (typeof global.gc === 'function') {
                try { global.gc(); } catch (_) {}
            }
        }, 3 * 60 * 1000);
    });
}

app.on('window-all-closed', (e) => {
    if (!app.isQuitting) {
        e.preventDefault();
    }
});

