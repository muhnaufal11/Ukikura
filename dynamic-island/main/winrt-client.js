"use strict";
const { app } = require("electron");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { getCompleteSyncedLyrics } = require("../lyrics");

let winrtProc = null;
let lastLyricsTrackKey = "";
let getMainWindow = () => null;
const BRIDGE_DIR = path.join(__dirname, "../bridge");

function initWinRtClient(mainWinGetter) { getMainWindow = mainWinGetter; }
function getWinRtProc() { return winrtProc; }
function resetLyricsTrackKey() { lastLyricsTrackKey = ""; }
function getLastLyricsPayload() { return lastLyricsPayload; }

function startWinRtBridge() {
    if (winrtProc) return;
    const scriptPath = path.join(BRIDGE_DIR, 'winrt-bridge.ps1');
    try {
        winrtProc = spawn('powershell.exe', [
            '-NoProfile',
            '-ExecutionPolicy', 'Bypass',
            '-WindowStyle', 'Hidden',
            '-File', scriptPath
        ], {
            cwd: BRIDGE_DIR,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore']
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
                        lastMediaPayload = msg;
                        const mainWindow = getMainWindow(); if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('media-update', msg);
                        }
                        if (msg.active && msg.title) {
                            const trackKey = `${msg.title}|${msg.artist || ''}`;
                            if (trackKey !== lastLyricsTrackKey) {
                                lastLyricsTrackKey = trackKey;
                                fetchSyncedLyrics(msg.title, msg.artist || '', Number(msg.dur) || 0);
                            }
                        }
                    } else if (msg.type === 'notifs' && Array.isArray(msg.items)) {
                        const mainWindow = getMainWindow(); if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('notif-update', msg.items);
                        }
                    } else if (msg.type === 'power') {
                        const mainWindow = getMainWindow(); if (mainWindow && !mainWindow.isDestroyed()) {
                            mainWindow.webContents.send('power-update', msg);
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
    try {
        const fs = require('fs');
        fs.writeFileSync(path.join(BRIDGE_DIR, '.media-cmd'), String(cmd || '').trim(), 'utf8');
    } catch (_) {}
}

let lastMediaPayload = null;
let lastLyricsPayload = null;
let currentLyricsReqId = 0;

// Ambil lirik tersinkronisasi 100% menggunakan Multi-Source Database (NetEase JP/Romaji/ID + LRCLIB + KuGou)
// + YouTube Captions Stream (.srv3 TimedText) + Audio-to-Text Forced Alignment
async function fetchSyncedLyrics(rawTitle, rawArtist, explicitDur = 0) {
    const reqId = ++currentLyricsReqId;
    try {
        const mediaDur = explicitDur > 0
            ? explicitDur
            : (lastMediaPayload && lastMediaPayload.dur ? Number(lastMediaPayload.dur) : 0);

        const result = await getCompleteSyncedLyrics(rawTitle, rawArtist, mediaDur, (fastRes) => {
            if (reqId !== currentLyricsReqId) return;
            if (fastRes && Array.isArray(fastRes.lines) && fastRes.lines.length > 0) {
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

        const mainWindow = getMainWindow(); if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('lyrics-update', { title: rawTitle, track: rawTitle, lines: [] });
        }
    } catch (err) {
        console.warn('[Dynamic Island] Lyrics engine error:', err && err.message ? err.message : err);
        const mainWindow = getMainWindow(); if (reqId === currentLyricsReqId && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('lyrics-update', { title: rawTitle, track: rawTitle, lines: [] });
        }
    }
}

module.exports = { initWinRtClient, startWinRtBridge, sendMediaCommand, fetchSyncedLyrics, getWinRtProc, resetLyricsTrackKey, getLastLyricsPayload };
