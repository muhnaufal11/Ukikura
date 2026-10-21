"use strict";

const { clipboard, nativeImage, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");

const MAX_CLIP_ITEMS = 15;
let clipboardHistory = [];
let lastClipText = "";
let lastClipImageHash = "";
let watcherTimer = null;
let targetWindow = null;

function detectContentType(text) {
    const trimmed = text.trim();
    if (/^https?:\/\/[^\s]+$/i.test(trimmed)) {
        return "url";
    }
    // Cek indikator kode pemrograman (keyword, tag HTML, kurung kurawal, atau indentasi)
    const codeKeywords = /\b(function|const|let|var|class|import|export|from|def|return|if|else|for|while|try|catch|public|private|interface|async|await)\b/;
    const codeSymbols = /[{}<>;=]{2,}|=>|===|!==|::|\(\)/;
    if (codeKeywords.test(trimmed) || codeSymbols.test(trimmed) || (trimmed.includes("\n") && /^\s{2,}/m.test(trimmed))) {
        return "code";
    }
    return "text";
}

function pollClipboard() {
    try {
        // 1. Periksa Teks Baru
        const text = clipboard.readText().trim();
        if (text && text !== lastClipText) {
            lastClipText = text;
            const type = detectContentType(text);
            
            // Hapus duplikat teks yang sama sebelumnya
            clipboardHistory = clipboardHistory.filter(item => item.content !== text);
            clipboardHistory.unshift({
                id: "clip_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
                type,
                content: text,
                preview: text.slice(0, 160),
                charCount: text.length,
                timeStr: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
                timestamp: Date.now()
            });

            if (clipboardHistory.length > MAX_CLIP_ITEMS) {
                clipboardHistory = clipboardHistory.slice(0, MAX_CLIP_ITEMS);
            }

            broadcastUpdate();
            return;
        }

        // 2. Periksa Gambar / Screenshot Baru dari Clipboard
        const img = clipboard.readImage();
        if (!img.isEmpty()) {
            const size = img.getSize();
            if (size.width > 0 && size.height > 0) {
                // Optimasi CPU: Bangun fingerprint ringan dari dimensi & sample buffer raw bitmap
                // JANGAN panggil img.toDataURL() sebelum tahu gambar ini benar-benar baru!
                let sampleHash = "";
                try {
                    const bmp = (typeof img.getBitmap === "function") ? img.getBitmap() : ((typeof img.toBitmap === "function") ? img.toBitmap() : null);
                    if (bmp && bmp.length > 0) {
                        const len = bmp.length;
                        const p1 = bmp.readUInt32LE(0);
                        const p2 = bmp.readUInt32LE(Math.min(len - 4, Math.floor(len / 4)));
                        const p3 = bmp.readUInt32LE(Math.min(len - 4, Math.floor(len / 2)));
                        const p4 = bmp.readUInt32LE(Math.max(0, len - 4));
                        sampleHash = `${size.width}x${size.height}_${len}_${p1}_${p2}_${p3}_${p4}`;
                    }
                } catch (_) {}

                if (!sampleHash) {
                    sampleHash = `${size.width}x${size.height}`;
                }

                // Jika fingerprint sama persis, lewati kompresi PNG (0% CPU footprint)
                if (sampleHash === lastClipImageHash) {
                    return;
                }
                lastClipImageHash = sampleHash;

                // Hanya encode ke PNG dataURL saat gambar baru pertama kali disalin!
                const dataUrl = img.toDataURL();
                clipboardHistory = clipboardHistory.filter(item => item.hash !== sampleHash);
                clipboardHistory.unshift({
                    id: "clip_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
                    type: "image",
                    content: dataUrl,
                    hash: sampleHash,
                    preview: `Screenshot (${size.width} × ${size.height} px)`,
                    charCount: 0,
                    timeStr: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
                    timestamp: Date.now()
                });

                if (clipboardHistory.length > MAX_CLIP_ITEMS) {
                    clipboardHistory = clipboardHistory.slice(0, MAX_CLIP_ITEMS);
                }

                broadcastUpdate();
            }
        }
    } catch (_) {}
}

function broadcastUpdate() {
    if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send("clipboard-history-update", clipboardHistory);
    }
}

let isDraggingFile = false;

function getIsDraggingFile() {
    return isDraggingFile;
}

function initClipboardWatcher(win) {
    targetWindow = win;
    if (watcherTimer) clearInterval(watcherTimer);
    watcherTimer = setInterval(pollClipboard, 1100);

    // Kirim state saat ini jika renderer meminta
    ipcMain.on("clipboard-get-history", (event) => {
        event.reply("clipboard-history-update", clipboardHistory);
    });

    // Salin ulang teks ke clipboard
    ipcMain.on("clipboard-copy-text", (event, text) => {
        if (!text) return;
        lastClipText = text.trim();
        clipboard.writeText(text);
    });

    // Salin ulang gambar ke clipboard
    ipcMain.on("clipboard-copy-image", (event, dataUrl) => {
        if (!dataUrl) return;
        try {
            const img = nativeImage.createFromDataURL(dataUrl);
            lastClipImageHash = "";
            clipboard.writeImage(img);
        } catch (_) {}
    });

    // Bersihkan riwayat
    ipcMain.on("clipboard-clear", () => {
        clipboardHistory = [];
        broadcastUpdate();
    });

    // Drag-out file native OS (Todo 6)
    ipcMain.on("island-start-drag", (event, data) => {
        const filePath = typeof data === "object" && data !== null ? data.path : data;
        const fileIdx = typeof data === "object" && data !== null ? data.idx : null;
        if (!filePath) return;
        const absPath = path.resolve(filePath);
        if (!fs.existsSync(absPath)) {
            console.warn("[Ukikura] File tidak ditemukan di path:", absPath);
            return;
        }

        let dragIcon;
        const iconPng = path.join(__dirname, "../renderer/icon.png");
        try {
            if (fs.existsSync(iconPng)) {
                dragIcon = nativeImage.createFromPath(iconPng).resize({ width: 32, height: 32 });
            } else {
                dragIcon = nativeImage.createEmpty();
            }
        } catch (_) {
            dragIcon = nativeImage.createEmpty();
        }

        try {
            isDraggingFile = true;
            event.sender.startDrag({
                file: absPath,
                files: [absPath],
                icon: dragIcon
            });
            isDraggingFile = false;
            event.sender.send("island-drag-completed", { path: absPath, idx: fileIdx });
        } catch (err) {
            isDraggingFile = false;
            console.error("[Ukikura] Error saat startDrag:", err);
        }
    });
}

function getClipboardHistory() {
    return clipboardHistory;
}

module.exports = {
    initClipboardWatcher,
    getClipboardHistory,
    getIsDraggingFile
};
