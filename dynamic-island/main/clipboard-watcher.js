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
                const dataUrl = img.toDataURL();
                const hash = `${size.width}x${size.height}_${dataUrl.slice(-40)}`;
                if (hash !== lastClipImageHash) {
                    lastClipImageHash = hash;
                    clipboardHistory = clipboardHistory.filter(item => item.hash !== hash);
                    clipboardHistory.unshift({
                        id: "clip_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
                        type: "image",
                        content: dataUrl,
                        hash,
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
        }
    } catch (_) {}
}

function broadcastUpdate() {
    if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send("clipboard-history-update", clipboardHistory);
    }
}

function initClipboardWatcher(win) {
    targetWindow = win;
    if (watcherTimer) clearInterval(watcherTimer);
    watcherTimer = setInterval(pollClipboard, 800);

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
    ipcMain.on("island-start-drag", (event, filePath) => {
        if (!filePath || !fs.existsSync(filePath)) return;
        const iconPath = path.join(__dirname, "../renderer/icon.ico");
        try {
            event.sender.startDrag({
                file: filePath,
                icon: iconPath
            });
        } catch (_) {}
    });
}

function getClipboardHistory() {
    return clipboardHistory;
}

module.exports = {
    initClipboardWatcher,
    getClipboardHistory
};
