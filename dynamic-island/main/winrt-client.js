"use strict";
const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { getCompleteSyncedLyrics } = require("../lyrics");

let winrtProc = null;
let lastLyricsTrackKey = "";
let lastMediaThumb = "";
let thumbDeliveredToRenderer = false;
let lastWindowState = null;
let lastPowerPayload = null;
let getMainWindow = () => null;
const BRIDGE_DIR = path.join(__dirname, "../bridge");

function getPhoneLinkStatus() {
    try {
        const localAppData = process.env.LOCALAPPDATA;
        if (!localAppData) return null;
        const p = path.join(localAppData, 'Packages', 'Microsoft.YourPhone_8wekyb3d8bbwe', 'LocalState', 'StartMenu', 'StartMenuCompanion.json');
        if (!fs.existsSync(p)) return null;
        const rawJson = fs.readFileSync(p, 'utf8');
        if (!rawJson) return null;

        let phoneName = 'HP Android';
        let battery = -1;
        let connected = false;
        let charging = false;

        const speakMatch = rawJson.match(/"speak"\s*:\s*"([^"]+?)\s*-\s*(?:Connected|Disconnected|Terhubung|Terputus)/i);
        if (speakMatch && speakMatch[1]) {
            phoneName = speakMatch[1].replace(/\\u002B/gi, '+').trim();
        } else {
            const textMatch = rawJson.match(/"text"\s*:\s*"([^"]+?)"/);
            if (textMatch && textMatch[1] && !textMatch[1].includes('ago')) {
                phoneName = textMatch[1].replace(/\\u002B/gi, '+').trim();
            }
        }

        if (/Connected to your PC|Terhubung ke PC|Terhubung/i.test(rawJson) && !/Disconnected|Terputus/i.test(rawJson)) {
            connected = true;
        }

        const batMatch = rawJson.match(/(?:Battery|currently at|Baterai|daya|level)\s*(\d{1,3})\s*%/i) ||
                         rawJson.match(/(\d{1,3})\s*%\s*(?:remaining|tersisa|charging|mengisi)/i) ||
                         rawJson.match(/(\d{1,3})\s*%/);
        if (batMatch && batMatch[1]) {
            const val = parseInt(batMatch[1], 10);
            if (val >= 0 && val <= 100) {
                battery = val;
            }
        }

        if (/charging|mengisi daya|pengisian daya/i.test(rawJson) && !/not charging|tidak mengisi/i.test(rawJson)) {
            const chgNearBat = /(?:Battery|altText|tooltip)[^"]*?(?:charging|mengisi daya)/i.test(rawJson);
            if (chgNearBat) {
                charging = true;
            }
        }

        return { name: phoneName, battery, connected, charging, kind: 'phone' };
    } catch (_) {
        return null;
    }
}

let phoneLinkWatcherInited = false;
function initPhoneLinkWatcher() {
    if (phoneLinkWatcherInited) return;
    phoneLinkWatcherInited = true;
    try {
        const localAppData = process.env.LOCALAPPDATA;
        if (!localAppData) return;
        const dir = path.join(localAppData, 'Packages', 'Microsoft.YourPhone_8wekyb3d8bbwe', 'LocalState', 'StartMenu');
        if (!fs.existsSync(dir)) return;

        let debounceTimer = null;
        fs.watch(dir, (event, filename) => {
            if (!filename || filename.toLowerCase().includes('companion')) {
                if (debounceTimer) clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    const pl = getPhoneLinkStatus();
                    if (!pl) return;
                    const basePower = lastPowerPayload || {
                        type: 'power',
                        laptop: { percent: 100, charging: false },
                        devices: []
                    };
                    const devs = Array.isArray(basePower.devices) ? [...basePower.devices] : [];
                    const idx = devs.findIndex(d => d.kind === 'phone' || d.name === pl.name);
                    if (idx >= 0) {
                        devs[idx] = Object.assign({}, devs[idx], pl);
                    } else {
                        devs.push(pl);
                    }
                    basePower.devices = devs;
                    lastPowerPayload = basePower;
                    const mainWindow = getMainWindow();
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('power-update', basePower);
                    }
                }, 300);
            }
        });
    } catch (_) {}
}

function initWinRtClient(mainWinGetter) {
    getMainWindow = mainWinGetter;
    initPhoneLinkWatcher();
}
function getWinRtProc() { return winrtProc; }
function resetLyricsTrackKey() { lastLyricsTrackKey = ""; }
// Dipanggil saat renderer dimuat ulang agar thumbnail terakhir dikirim ulang satu kali
function resetMediaThumbDelivery() { thumbDeliveredToRenderer = false; }
function getLastLyricsPayload() { return lastLyricsPayload; }

function startWinRtBridge() {
    if (winrtProc) return;
    const exePath = path.join(BRIDGE_DIR, 'ukikura-bridge.exe');
    const scriptPath = path.join(BRIDGE_DIR, 'winrt-bridge.ps1');
    const useExe = fs.existsSync(exePath);
    try {
        if (useExe) {
            winrtProc = spawn(exePath, [], {
                cwd: BRIDGE_DIR,
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe']
            });
        } else {
            winrtProc = spawn('powershell.exe', [
                '-NoProfile',
                '-ExecutionPolicy', 'Bypass',
                '-WindowStyle', 'Hidden',
                '-File', scriptPath
            ], {
                cwd: BRIDGE_DIR,
                windowsHide: true,
                stdio: ['pipe', 'pipe', 'pipe']
            });
        }

        winrtProc.stderr.on('data', (errChunk) => {
            const errStr = errChunk.toString('utf8').trim();
            if (errStr) console.warn('[WinRT Bridge Warning/Error]', errStr);
        });

        let buffer = '';
        winrtProc.stdout.on('data', (chunk) => {
            buffer += chunk.toString('utf8');
            let lines = buffer.split(/\r?\n/);
            buffer = lines.pop() || '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed.startsWith('{')) continue;
                try {
                    const msg = JSON.parse(trimmed);
                    if (msg.type === 'media') {
                        if (!msg.active && lastMediaPayload && !lastMediaPayload.active) {
                            return;
                        }
                        if (!msg.active || (lastMediaPayload && lastMediaPayload.title !== msg.title)) {
                            // Lagu berganti / sesi berhenti: renderer membuang thumb lama, izinkan kirim ulang
                            thumbDeliveredToRenderer = false;
                        }
                        if (msg.thumb) {
                            lastMediaThumb = msg.thumb;
                            thumbDeliveredToRenderer = true;
                        } else if (lastMediaThumb && msg.active && !thumbDeliveredToRenderer) {
                            // Hemat CPU: thumbnail base64 (puluhan-ratusan KB) cukup dikirim SEKALI per lagu,
                            // bukan di setiap tick SMTC (~5x/detik). Renderer menyimpan thumb terakhir sendiri.
                            msg.thumb = lastMediaThumb;
                            thumbDeliveredToRenderer = true;
                        }
                        lastMediaPayload = msg;
                        const mainWindow = getMainWindow(); if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('media-update', msg);
                        }
                        if (msg.active && msg.title) {
                            const trackKey = `${msg.title}|${msg.artist || ''}`;
                            if (trackKey !== lastLyricsTrackKey) {
                                lastLyricsTrackKey = trackKey;
                                emptyRetryCount = 0;
                                fetchSyncedLyrics(msg.title, msg.artist || '', Number(msg.dur) || 0, true);
                            } else if (
                                !inFlightTitle &&
                                (!lastLyricsPayload || lastLyricsPayload.title !== msg.title || !Array.isArray(lastLyricsPayload.lines) || lastLyricsPayload.lines.length === 0) &&
                                emptyRetryCount < 3 &&
                                (Date.now() - lastFetchEndedAt) > 3200
                            ) {
                                emptyRetryCount++;
                                fetchSyncedLyrics(msg.title, msg.artist || '', Number(msg.dur) || 0, true);
                            }
                        }
                    } else if (msg.type === 'notifs' && Array.isArray(msg.items)) {
                        const mainWindow = getMainWindow(); if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('notif-update', msg.items);
                        }
                    } else if (msg.type === 'power') {
                        const pl = getPhoneLinkStatus();
                        if (pl && Array.isArray(msg.devices)) {
                            const idx = msg.devices.findIndex(d => d.kind === 'phone' || d.name === pl.name);
                            if (idx >= 0) {
                                msg.devices[idx] = Object.assign({}, msg.devices[idx], pl);
                            } else {
                                msg.devices.push(pl);
                            }
                        }
                        lastPowerPayload = msg;
                        const mainWindow = getMainWindow(); if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('power-update', msg);
                        }
                    } else if (msg.type === 'volume') {
                        const mainWindow = getMainWindow(); if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('volume-update', msg);
                        }
                    } else if (msg.type === 'window_state') {
                        lastWindowState = msg;
                        const mainWindow = getMainWindow(); if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('window-state', msg);
                        }
                    }
                } catch (_) {}
            }
        });

        winrtProc.on('exit', () => {
            winrtProc = null;
            if (!app.isQuitting) {
                setTimeout(startWinRtBridge, 3000);
            }
        });
    } catch (e) {
        console.warn('[Dynamic Island] Gagal menjalankan winrt-bridge:', e.message);
    }
}

function sendMediaCommand(cmd) {
    const val = String(cmd || '').trim();
    if (!val) return;
    let written = false;
    if (winrtProc && winrtProc.stdin && !winrtProc.stdin.destroyed) {
        try {
            written = winrtProc.stdin.write(val + '\n');
        } catch (_) {}
    }
    // HANYA gunakan file fallback jika stdin tidak tersedia / gagal
    if (!written) {
        const os = require('os');
        const tmpFile = path.join(os.tmpdir(), 'ukikura-media.cmd');
        const localFile = path.join(BRIDGE_DIR, '.media-cmd');
        try {
            fs.appendFileSync(tmpFile, val + '\n', 'utf8');
        } catch (_) {
            try { fs.writeFileSync(tmpFile, val + '\n', 'utf8'); } catch (_) {}
        }
        try {
            fs.appendFileSync(localFile, val + '\n', 'utf8');
        } catch (_) {
            try { fs.writeFileSync(localFile, val + '\n', 'utf8'); } catch (_) {}
        }
    }
}

app.on('before-quit', () => {
    if (winrtProc) {
        try { winrtProc.kill(); } catch (_) {}
        winrtProc = null;
    }
});

let lastMediaPayload = null;
let lastLyricsPayload = null;
let currentLyricsReqId = 0;
let inFlightTitle = '';
let inFlightStartedAt = 0;
let lastFetchEndedAt = 0;
let emptyRetryCount = 0;

// Ambil lirik tersinkronisasi 100% menggunakan Multi-Source Database (NetEase JP/Romaji/ID + LRCLIB + KuGou)
// + YouTube Captions Stream (.srv3 TimedText) + Audio-to-Text Forced Alignment
async function fetchSyncedLyrics(rawTitle, rawArtist, explicitDur = 0, forceNew = false) {
    if (!rawTitle) return;
    // Cegah double-request dari renderer membatalkan pencarian yang sedang berjalan untuk judul lagu yang sama
    if (!forceNew && inFlightTitle === rawTitle && (Date.now() - inFlightStartedAt) < 18000) {
        return;
    }

    const reqId = ++currentLyricsReqId;
    inFlightTitle = rawTitle;
    inFlightStartedAt = Date.now();
    let deliveredFast = false;

    try {
        const mediaDur = explicitDur > 0
            ? explicitDur
            : (lastMediaPayload && lastMediaPayload.dur ? Number(lastMediaPayload.dur) : 0);

        const result = await getCompleteSyncedLyrics(rawTitle, rawArtist, mediaDur, (fastRes) => {
            if (reqId !== currentLyricsReqId) return;
            if (fastRes && Array.isArray(fastRes.lines) && fastRes.lines.length > 0) {
                deliveredFast = true;
                lastLyricsPayload = {
                    title: rawTitle,
                    track: fastRes.track || rawTitle,
                    source: fastRes.source || 'Fast Synced LRC',
                    trackDuration: Number(fastRes.trackDuration) || mediaDur || 0,
                    lines: fastRes.lines
                };
                const mainWindow = getMainWindow(); if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('lyrics-update', lastLyricsPayload);
                }
            }
        });
        if (reqId !== currentLyricsReqId) return;

        inFlightTitle = '';
        lastFetchEndedAt = Date.now();

        if (result && Array.isArray(result.lines) && result.lines.length > 0) {
            lastLyricsPayload = {
                title: rawTitle,
                track: result.track || rawTitle,
                source: result.source || 'Synced Lyrics',
                trackDuration: Number(result.trackDuration) || mediaDur || 0,
                coverUrl: result.coverUrl || '',
                lines: result.lines
            };
            const mainWindow = getMainWindow(); if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lyrics-update', lastLyricsPayload);
            }
            return;
        }

        if (!deliveredFast) {
            const mainWindow = getMainWindow(); if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('lyrics-update', { title: rawTitle, track: rawTitle, lines: [] });
            }
        }
    } catch (err) {
        console.warn('[Dynamic Island] Lyrics engine error:', err && err.message ? err.message : err);
        if (reqId === currentLyricsReqId) {
            inFlightTitle = '';
            lastFetchEndedAt = Date.now();
            if (!deliveredFast) {
                const mainWindow = getMainWindow(); if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('lyrics-update', { title: rawTitle, track: rawTitle, lines: [] });
                }
            }
        }
    }
}

function getLastWindowState() { return lastWindowState; }

module.exports = { initWinRtClient, startWinRtBridge, sendMediaCommand, fetchSyncedLyrics, getWinRtProc, resetLyricsTrackKey, resetMediaThumbDelivery, getLastLyricsPayload, getLastWindowState };
