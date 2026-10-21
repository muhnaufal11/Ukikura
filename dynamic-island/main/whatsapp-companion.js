"use strict";
const { app, BrowserWindow } = require("electron");
const { sendWhatsAppReply } = require("./whatsapp-sender");
let waWindow = null;
let getMainWindow = () => null;
function initWhatsAppCompanion(mainWinGetter) { getMainWindow = mainWinGetter; }
function resetWaState() { seenWaSignatures.clear(); initialWaPass = true; }
function replyWhatsApp(sender, text) { return sendWhatsAppReply(waWindow, sender, text); }


// Companion WhatsApp Background agar chat WA dari HP selalu terdeteksi realtime
let seenWaSignatures = new Set();
let initialWaPass = true;
let waClickAttempts = new Map();

function ensureWhatsAppWindow(showWindow = false) {
    if (waWindow && !waWindow.isDestroyed()) {
        if (showWindow) {
            waWindow.show();
            waWindow.focus();
            try { waWindow.webContents.setAudioMuted(false); } catch (_) {}
        }
        return;
    }

    waWindow = new BrowserWindow({
        width: 1000,
        height: 720,
        show: Boolean(showWindow),
        title: 'WhatsApp Companion — Nusa Dynamic Island (Tetap berjalan di background saat ditutup)',
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            backgroundThrottling: false
        }
    });

    try {
        waWindow.webContents.setBackgroundThrottling(false);
        waWindow.webContents.setAudioMuted(!showWindow);
    } catch (_) {}

    const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    waWindow.webContents.setUserAgent(chromeUA);
    waWindow.loadURL('https://web.whatsapp.com/');

    // Tangkap event notifikasi instan langsung saat WhatsApp Web memanggil new window.Notification()
    waWindow.webContents.on('console-message', (event, level, message) => {
        if (typeof message === 'string' && message.startsWith('__NUSA_WA_LIVE__:')) {
            try {
                const data = JSON.parse(message.slice('__NUSA_WA_LIVE__:'.length));
                if (data && data.sender) {
                    const sig = `wa_live_${data.sender}_${data.message}_${data.sticker ? 'stk' : (data.image ? 'img' : 'txt')}`;
                    const baseSig = `wa_${data.sender}_${data.message}`;
                    seenWaSignatures.add(baseSig);
                    seenWaSignatures.add(`${baseSig}_txt`);
                    seenWaSignatures.add(`${baseSig}_stk`);
                    seenWaSignatures.add(`${baseSig}_img`);
                    const mainWindow = getMainWindow(); if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('notif-update', [{
                            id: sig,
                            app: 'WhatsApp',
                            sender: data.sender,
                            message: data.message || 'Pesan baru masuk',
                            sticker: data.sticker || '',
                            image: data.image || '',
                            isVoiceNote: Boolean(data.isVoiceNote),
                            vnDuration: data.vnDuration || '',
                            isWhatsApp: true,
                            isPhone: true,
                            time: Date.now(),
                            isNew: true
                        }]);
                    }
                    // Segera pindai ulang 350ms, 950ms & 1800ms kemudian untuk menyusul gambar stiker beresolusi penuh
                    setTimeout(() => pollWhatsAppUnread(), 350);
                    setTimeout(() => pollWhatsAppUnread(), 950);
                    setTimeout(() => pollWhatsAppUnread(), 1800);
                }
            } catch (_) {}
        }
    });

    waWindow.on('close', (e) => {
        if (!app.isQuitting) {
            e.preventDefault();
            waWindow.hide();
            try { waWindow.webContents.setAudioMuted(true); } catch (_) {}
        }
    });
}

async function pollWhatsAppUnread() {
    if (!waWindow || waWindow.isDestroyed()) return;
    try {
        const chatItems = await waWindow.webContents.executeJavaScript(`
            (async function() {
                window.__nusaStickerCache = window.__nusaStickerCache || {};
                window.__nusaBlobMap = window.__nusaBlobMap || {};

                // 1. Sadap URL.createObjectURL agar blob stiker WebP tertangkap sebelum di-revoke oleh WhatsApp Web
                if (!window.__nusaBlobHooked && window.URL && typeof window.URL.createObjectURL === 'function') {
                    window.__nusaBlobHooked = true;
                    const origCreate = window.URL.createObjectURL.bind(window.URL);
                    window.URL.createObjectURL = function(obj) {
                        const url = origCreate(obj);
                        try {
                            if (obj instanceof Blob && /^image\\/(webp|jpeg|png)/i.test(obj.type || '') && obj.size > 600) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                    if (typeof reader.result === 'string' && reader.result.startsWith('data:image/')) {
                                        window.__nusaBlobMap[url] = reader.result;
                                    }
                                };
                                reader.readAsDataURL(obj);
                            }
                        } catch (_) {}
                        return url;
                    };
                }

                // 2. Sadap window.Notification milik WhatsApp Web agar setiap notif masuk 100% tertangkap realtime (0ms)
                if (!window.__nusaNotifHooked && typeof window.Notification === 'function') {
                    window.__nusaNotifHooked = true;
                    const OrigNotif = window.Notification;
                    const WrappedNotif = function(title, options) {
                        const opts = options || {};
                        try {
                            const bodyStr = String(opts.body || 'Pesan baru masuk').trim();
                            const isVn = /(?:pesan suara|voice message|\b\d{1,2}:\d{2}\b)/i.test(bodyStr);
                            const isPhoto = /(?:foto|photo|gambar|image)/i.test(bodyStr);
                            let vnDur = '';
                            const durMatch = bodyStr.match(/\b(\d{1,2}:\d{2})\b/);
                            if (durMatch) vnDur = durMatch[1];
                            console.log('__NUSA_WA_LIVE__:' + JSON.stringify({
                                sender: String(title || 'WhatsApp').trim(),
                                message: bodyStr,
                                isVoiceNote: isVn,
                                vnDuration: vnDur,
                                isPhoto: isPhoto,
                                tag: String(opts.tag || '')
                            }));
                        } catch (_) {}
                        // Jangan buat Windows Toast native dari jendela background agar tidak memicu suara Windows
                        // dan tidak tertangkap kembali oleh WinRT listener (mencegah loop feedback notif dobel).
                        const dummy = (typeof EventTarget === 'function') ? new EventTarget() : {};
                        dummy.title = title;
                        dummy.close = () => {};
                        return dummy;
                    };
                    WrappedNotif.prototype = OrigNotif.prototype;
                    try {
                        Object.defineProperty(WrappedNotif, 'permission', {
                            get: () => 'granted'
                        });
                    } catch (_) {}
                    WrappedNotif.requestPermission = () => Promise.resolve('granted');
                    window.Notification = WrappedNotif;
                }

                // Fast-Path Penghemat CPU: Jika belum login atau tidak ada pesan belum dibaca, langsung keluar (0ms, 0% CPU)!
                const pane = document.querySelector('#pane-side, [data-testid="chat-list"]');
                if (!pane) return [];
                const unreadBadges = pane.querySelectorAll('span[aria-label*="unread" i], span[aria-label*="belum dibaca" i], [data-testid="icon-unread-count"]');
                if (!unreadBadges || unreadBadges.length === 0) {
                    return [];
                }

                const blobToDataUrl = (blob) => new Promise((resolve) => {
                    try {
                        const reader = new FileReader();
                        reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
                        reader.onerror = () => resolve('');
                        reader.readAsDataURL(blob);
                    } catch (_) {
                        resolve('');
                    }
                });

                const imgElementToDataUrl = async (img) => {
                    if (!img || !img.src) return '';
                    if (img.src.startsWith('data:image/') && !img.src.startsWith('data:image/gif')) {
                        return img.src;
                    }
                    if (window.__nusaBlobMap && window.__nusaBlobMap[img.src]) {
                        return window.__nusaBlobMap[img.src];
                    }
                    try {
                        const resp = await fetch(img.src);
                        if (resp.ok) {
                            const blob = await resp.blob();
                            const dUrl = await blobToDataUrl(blob);
                            if (dUrl && dUrl.startsWith('data:image/')) {
                                window.__nusaBlobMap[img.src] = dUrl;
                                return dUrl;
                            }
                        }
                    } catch (_) {}
                    // Fallback Canvas: membaca piksel langsung dari elemen <img> meskipun blob URL sudah di-revoke oleh WA Web!
                    try {
                        const w = img.naturalWidth || img.width || 128;
                        const h = img.naturalHeight || img.height || 128;
                        if (w > 16 && h > 16) {
                            const canvas = document.createElement('canvas');
                            const maxDim = 160;
                            const scale = Math.min(1, maxDim / Math.max(w, h));
                            canvas.width = Math.max(1, Math.round(w * scale));
                            canvas.height = Math.max(1, Math.round(h * scale));
                            const ctx = canvas.getContext('2d');
                            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                            const cUrl = canvas.toDataURL('image/webp', 0.92);
                            if (cUrl && cUrl.length > 120) {
                                window.__nusaBlobMap[img.src] = cUrl;
                                return cUrl;
                            }
                        }
                    } catch (_) {}
                    return '';
                };

                const extractMediaFromChatModel = async (chat) => {
                    try {
                        if (!chat) return null;
                        const candidates = [];
                        if (chat.previewMessage) candidates.push(chat.previewMessage);
                        if (chat.lastReceivedKey && typeof chat.lastReceivedKey === 'object') candidates.push(chat.lastReceivedKey);
                        if (chat.msgs) {
                            const ms = typeof chat.msgs.getModelsArray === 'function'
                                ? chat.msgs.getModelsArray()
                                : (Array.isArray(chat.msgs._models) ? chat.msgs._models : []);
                            candidates.push(...ms);
                        }
                        for (let i = candidates.length - 1; i >= Math.max(0, candidates.length - 12); i--) {
                            const m = candidates[i];
                            if (!m) continue;
                            const mType = m.type || m.__x_type || (m._data && m._data.type) || '';

                            if (mType === 'ptt' || mType === 'audio') {
                                let durSec = m.duration || (m._data && m._data.duration) || (m.mediaData && m.mediaData.duration) || 0;
                                if (typeof durSec === 'string') durSec = parseFloat(durSec) || 0;
                                const min = Math.floor(durSec / 60);
                                const sec = Math.floor(durSec % 60);
                                const durStr = min + ':' + (sec < 10 ? '0' : '') + sec;
                                return { type: 'voice', isVoiceNote: true, duration: durStr !== '0:00' ? durStr : '0:15', dataUrl: '' };
                            }

                            if (mType === 'sticker' || mType === 'image') {
                                const isStk = mType === 'sticker';
                                if (m.mediaData && !m.mediaData.mediaBlob && typeof m.downloadMedia === 'function') {
                                    try {
                                        await m.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1 });
                                    } catch (_) {
                                        try { await m.downloadMedia(true, 1); } catch (_) {}
                                    }
                                }
                                if (m.mediaData && m.mediaData.mediaBlob instanceof Blob) {
                                    const dUrl = await blobToDataUrl(m.mediaData.mediaBlob);
                                    if (dUrl) return { type: isStk ? 'sticker' : 'image', dataUrl: dUrl };
                                }
                                if (m.mediaData && m.mediaData.preview) {
                                    if (m.mediaData.preview instanceof Blob) {
                                        const dUrl = await blobToDataUrl(m.mediaData.preview);
                                        if (dUrl) return { type: isStk ? 'sticker' : 'image', dataUrl: dUrl };
                                    }
                                    if (typeof m.mediaData.preview === 'string' && m.mediaData.preview.length > 20) {
                                        const p = m.mediaData.preview;
                                        return { type: isStk ? 'sticker' : 'image', dataUrl: p.startsWith('data:') ? p : 'data:image/webp;base64,' + p };
                                    }
                                    if (typeof m.mediaData.preview._b64 === 'string' && m.mediaData.preview._b64.length > 20) {
                                        return { type: isStk ? 'sticker' : 'image', dataUrl: 'data:image/webp;base64,' + m.mediaData.preview._b64 };
                                    }
                                }
                                if (m.mediaData && typeof m.mediaData._preview === 'string' && m.mediaData._preview.length > 20) {
                                    return { type: isStk ? 'sticker' : 'image', dataUrl: 'data:image/webp;base64,' + m.mediaData._preview };
                                }
                                if (m.mediaData && typeof m.mediaData.renderableUrl === 'string' && m.mediaData.renderableUrl.startsWith('blob:')) {
                                    const dUrl = window.__nusaBlobMap && window.__nusaBlobMap[m.mediaData.renderableUrl];
                                    if (dUrl) return { type: isStk ? 'sticker' : 'image', dataUrl: dUrl };
                                }
                                const rawBody = (typeof m.body === 'string' && m.body.length > 30)
                                    ? m.body
                                    : ((m._data && typeof m._data.body === 'string' && m._data.body.length > 30) ? m._data.body : '');
                                if (rawBody) {
                                    if (rawBody.startsWith('data:image/')) return { type: isStk ? 'sticker' : 'image', dataUrl: rawBody };
                                    if (/^(?:\\/9j\\/|iVBOR|UklGR)/.test(rawBody)) {
                                        const mime = isStk ? 'image/webp' : 'image/jpeg';
                                        return { type: isStk ? 'sticker' : 'image', dataUrl: 'data:' + mime + ';base64,' + rawBody };
                                    }
                                }
                                break;
                            }
                        }
                    } catch (_) {}
                    return null;
                };

                const getOpenChatHeaderName = () => {
                    const h = document.querySelector('#main header');
                    if (!h) return '';
                    const spans = Array.from(h.querySelectorAll('span[dir="auto"], span[title]'));
                    for (const s of spans) {
                        const t = (s.getAttribute('title') || s.innerText || '').trim();
                        if (t && !/^(online|mengetik|typing|klik di sini|click here|terakhir dilihat|last seen|ketuk di sini|tap here)/i.test(t)) {
                            return t;
                        }
                    }
                    return '';
                };

                const extractStickerFromOpenMainDom = async () => {
                    try {
                        const mainEl = document.querySelector('#main');
                        if (!mainEl) return { dataUrl: '', id: '' };
                        const allImgs = Array.from(mainEl.querySelectorAll('img')).filter(img => {
                            if (!img || !img.src) return false;
                            if (img.closest('header') || img.closest('footer')) return false;
                            if (img.classList.contains('emoji')) return false;
                            if (img.src.startsWith('data:image/gif')) return false;
                            if (/pps\\.whatsapp\\.net/i.test(img.src)) return false;
                            return img.src.startsWith('blob:') || img.src.startsWith('data:image/');
                        });
                        for (let i = allImgs.length - 1; i >= Math.max(0, allImgs.length - 6); i--) {
                            const img = allImgs[i];
                            const dUrl = await imgElementToDataUrl(img);
                            if (dUrl && dUrl.length > 80) {
                                const shortId = String(img.src || dUrl).slice(-14).replace(/[^a-zA-Z0-9]/g, '');
                                return { dataUrl: dUrl, id: shortId || 'stk' };
                            }
                        }
                    } catch (_) {}
                    return { dataUrl: '', id: '' };
                };

                const findChatModelFromRow = (rowEl, senderName) => {
                    try {
                        const els = [rowEl, ...Array.from(rowEl.querySelectorAll('*')).slice(0, 20)];
                        for (const el of els) {
                            if (!el) continue;
                            const fk = Object.keys(el).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'));
                            if (!fk) continue;
                            let fib = el[fk];
                            for (let depth = 0; fib && depth < 16; depth++, fib = fib.return) {
                                const p = fib.memoizedProps || fib.pendingProps;
                                if (!p || typeof p !== 'object') continue;
                                for (const val of Object.values(p)) {
                                    if (val && typeof val === 'object') {
                                        if (val.msgs && (val.id || val.unreadCount !== undefined)) return val;
                                        if (val.chat && val.chat.msgs) return val.chat;
                                        if (val.data && val.data.chat && val.data.chat.msgs) return val.data.chat;
                                    }
                                }
                            }
                        }
                    } catch (_) {}
                    return null;
                };

                const normName = (s) => String(s || '').replace(/[^\\w\\s]/g, '').trim().toLowerCase();
                const openHeaderName = getOpenChatHeaderName();
                const results = [];
                const isNoiseText = (txt) => {
                    const s = String(txt || '').trim();
                    if (!s) return true;
                    if (/pesan (yang )?belum dibaca|unread message|^\\d+$/i.test(s)) return true;
                    if (/^\\d{1,2}[:.]\\d{2}(\\s*[ap]m)?$/i.test(s)) return true;
                    if (/^(kemarin|yesterday|hari ini|today)$/i.test(s)) return true;
                    return false;
                };

                const rows = Array.from(unreadBadges).map(b => b.closest('[role="listitem"], [data-testid="cell-frame-container"]')).filter(Boolean);
                if (rows.length === 0) return [];
                let index = 0;
                for (const row of rows) {
                    const rowIdx = index;
                    const unreadBadge = row.querySelector('span[aria-label*="unread" i], span[aria-label*="belum dibaca" i], [data-testid="icon-unread-count"]');
                    let isUnread = true;

                    const spans = Array.from(row.querySelectorAll('span[dir="auto"], span[dir="ltr"], span[title]'));
                    const cleanTexts = [];
                    for (const sp of spans) {
                        if (unreadBadge && (sp === unreadBadge || unreadBadge.contains(sp))) continue;
                        if (sp.querySelector('span[dir="auto"], span[dir="ltr"]')) continue;
                        const raw = (sp.getAttribute('title') || sp.innerText || '').replace(/\\s+/g, ' ').trim();
                        if (isNoiseText(raw)) continue;
                        if (!cleanTexts.includes(raw)) {
                            cleanTexts.push(raw);
                        }
                    }

                    let sender = cleanTexts[0] || '';
                    let cleanMsg = cleanTexts.length > 1 ? cleanTexts.slice(1).join(' ') : (cleanTexts[0] || '');

                    const chatModel = findChatModelFromRow(row, sender);
                    if (chatModel) {
                        if (Number(chatModel.unreadCount) > 0) isUnread = true;
                        const modelName = String(chatModel.name || chatModel.formattedTitle || (chatModel.contact && (chatModel.contact.name || chatModel.contact.pushname)) || '').trim();
                        if (modelName && !isNoiseText(modelName)) {
                            if (!sender || sender === cleanMsg) {
                                sender = modelName;
                            }
                        }
                    }

                    if (!isUnread && rowIdx >= 5) {
                        index++;
                        continue;
                    }
                    index++;

                    if (!sender) continue;
                    if (!cleanMsg || cleanMsg === sender) {
                        cleanMsg = 'Pesan WhatsApp';
                    }

                    const countText = unreadBadge ? (unreadBadge.innerText || unreadBadge.getAttribute('aria-label') || '1').trim() : '0';
                    const hasAudioIcon = Boolean(row.querySelector('[data-icon*="audio" i], [data-icon*="ptt" i], [data-testid*="audio" i]'));
                    let isVnMsg = hasAudioIcon || /(?:pesan suara|voice message|audio|\b\d{1,2}:\d{2}\b)/i.test(cleanMsg);
                    const isPhotoMsg = Boolean(row.querySelector('[data-icon*="image" i], [data-icon*="camera" i]')) || /(?:foto|photo|gambar|image)/i.test(cleanMsg);
                    const isStickerMsg = /(?:stiker|sticker)/i.test(cleanMsg);

                    let stickerData = '';
                    let imageData = '';
                    let isVoiceNote = isVnMsg;
                    let vnDuration = '';
                    const durMatch = cleanMsg.match(/\b(\d{1,2}:\d{2})\b/);
                    if (durMatch) vnDuration = durMatch[1];

                    let stickerId = '';
                    let clickCoords = null;
                    const cacheKey = sender + '|' + cleanMsg;

                    // Cek apakah row memiliki elemen <img> langsung (thumbnail stiker/foto yang sudah dirender di panel samping)
                    const rowImgs = Array.from(row.querySelectorAll('img')).filter(img => {
                        if (!img || !img.src) return false;
                        if (img.classList.contains('emoji')) return false;
                        if (/pps\\.whatsapp\\.net/i.test(img.src)) return false;
                        return true;
                    });
                    for (const rImg of rowImgs) {
                        const dUrl = await imgElementToDataUrl(rImg);
                        if (dUrl && dUrl.length > 50) {
                            if (isPhotoMsg) imageData = dUrl;
                            else stickerData = dUrl;
                            stickerId = String(rImg.src || dUrl).slice(-14).replace(/[^a-zA-Z0-9]/g, '');
                            break;
                        }
                    }

                    if (chatModel) {
                        const mData = await extractMediaFromChatModel(chatModel);
                        if (mData) {
                            if (mData.type === 'voice') {
                                isVoiceNote = true;
                                if (mData.duration) vnDuration = mData.duration;
                            } else if (mData.type === 'image' && !imageData) {
                                imageData = mData.dataUrl;
                            } else if (mData.type === 'sticker' && !stickerData) {
                                stickerData = mData.dataUrl;
                            }
                        }
                    }

                    if (isPhotoMsg || isStickerMsg || isVnMsg) {
                        const isMainOpenForThisSender = Boolean(
                            openHeaderName &&
                            normName(openHeaderName) &&
                            normName(sender) &&
                            (normName(openHeaderName) === normName(sender) ||
                             normName(openHeaderName).includes(normName(sender)) ||
                             normName(sender).includes(normName(openHeaderName)))
                        );

                        if (!stickerData && !imageData && isMainOpenForThisSender) {
                            const domStk = await extractStickerFromOpenMainDom();
                            if (domStk.dataUrl) {
                                if (isPhotoMsg) {
                                    imageData = domStk.dataUrl;
                                    stickerId = domStk.id || 'img';
                                } else {
                                    stickerData = domStk.dataUrl;
                                    stickerId = domStk.id || 'stk';
                                }
                            }
                        }

                        if (stickerData) {
                            window.__nusaStickerCache[cacheKey] = { dataUrl: stickerData, id: stickerId || 'stk', type: 'sticker' };
                        } else if (imageData) {
                            window.__nusaStickerCache[cacheKey] = { dataUrl: imageData, id: stickerId || 'img', type: 'image' };
                        } else if (window.__nusaStickerCache[cacheKey] && isMainOpenForThisSender) {
                            const cached = window.__nusaStickerCache[cacheKey];
                            if (cached.type === 'image') imageData = cached.dataUrl;
                            else stickerData = cached.dataUrl;
                            stickerId = cached.id;
                        }

                        // Jika media belum terambil pada 6 chat teratas, buka otomatis baris tersebut di #main
                        if (!stickerData && !imageData && (isStickerMsg || isPhotoMsg) && rowIdx <= 5) {
                            const targetEl = row.querySelector('[role="gridcell"]') || row.querySelector('div[tabindex="-1"]') || row.firstElementChild || row;
                            const rect = targetEl.getBoundingClientRect();
                            if (rect && rect.width > 20 && rect.height > 20) {
                                const cx = Math.round(rect.left + rect.width * 0.45);
                                const cy = Math.round(rect.top + rect.height * 0.5);
                                clickCoords = { x: cx, y: cy };
                                try {
                                    const evOpts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };
                                    targetEl.dispatchEvent(new PointerEvent('pointerdown', evOpts));
                                    targetEl.dispatchEvent(new MouseEvent('mousedown', evOpts));
                                    targetEl.dispatchEvent(new PointerEvent('pointerup', evOpts));
                                    targetEl.dispatchEvent(new MouseEvent('mouseup', evOpts));
                                    targetEl.dispatchEvent(new MouseEvent('click', evOpts));
                                } catch (_) {}
                            }
                        }
                    }

                    results.push({
                        sender: sender,
                        message: cleanMsg,
                        badge: countText,
                        isUnread: isUnread,
                        rowIdx: rowIdx,
                        sticker: stickerData || '',
                        image: imageData || '',
                        isVoiceNote: isVoiceNote,
                        vnDuration: vnDuration || '0:15',
                        stickerId: stickerId || (stickerData ? 'stk' : (imageData ? 'img' : 'txt')),
                        clickCoords: clickCoords
                    });
                }
                return results;
            })();
        `);

        if (Array.isArray(chatItems) && chatItems.length > 0) {
            const newNotifs = [];
            for (const c of chatItems) {
                // Jika media belum terbuka di #main, klik barisnya secara native di waWindow agar #main merender preview
                if (!c.sticker && !c.image && c.clickCoords && waWindow && !waWindow.isDestroyed()) {
                    const attemptKey = `${c.sender}|${c.message}`;
                    const prevAttempts = waClickAttempts.get(attemptKey) || 0;
                    if (prevAttempts < 4) {
                        waClickAttempts.set(attemptKey, prevAttempts + 1);
                        try {
                            const cx = Math.round(c.clickCoords.x);
                            const cy = Math.round(c.clickCoords.y);
                            waWindow.webContents.sendInputEvent({ type: 'mouseMove', x: cx, y: cy });
                            waWindow.webContents.sendInputEvent({ type: 'mouseDown', x: cx, y: cy, button: 'left', clickCount: 1 });
                            waWindow.webContents.sendInputEvent({ type: 'mouseUp', x: cx, y: cy, button: 'left', clickCount: 1 });
                            setTimeout(() => pollWhatsAppUnread(), 650);
                        } catch (_) {}
                    }
                }

                const mediaSig = c.sticker ? `stk_${c.stickerId || 's'}` : (c.image ? `img_${c.stickerId || 'i'}` : 'none');
                const sig = `wa_${c.sender}_${c.message}_${mediaSig}`;
                const textOnlySig = `wa_${c.sender}_${c.message}_none`;
                const hasMedia = Boolean(c.sticker || c.image);

                const alreadySentWithThisMedia = seenWaSignatures.has(sig);
                const alreadySentTextOnly = seenWaSignatures.has(textOnlySig);

                // Kirim jika belum pernah dikirim dengan media ini, DAN (belum pernah dikirim sama sekali ATAU sekarang medianya berhasil didapat susulan)
                if (!alreadySentWithThisMedia && (!alreadySentTextOnly || hasMedia)) {
                    seenWaSignatures.add(sig);
                    seenWaSignatures.add(textOnlySig);
                    newNotifs.push({
                        id: sig,
                        app: 'WhatsApp',
                        sender: c.sender,
                        message: c.message || 'Pesan baru masuk',
                        sticker: c.sticker || '',
                        image: c.image || '',
                        isVoiceNote: Boolean(c.isVoiceNote),
                        vnDuration: c.vnDuration || '',
                        isWhatsApp: true,
                        isPhone: true,
                        time: Date.now(),
                        isNew: (!initialWaPass && (Boolean(c.isUnread) || c.rowIdx <= 1)) || (c.rowIdx === 0 && Boolean(c.sticker || c.image))
                    });
                }
            }
            initialWaPass = false;
            const mainWindow = getMainWindow(); if (newNotifs.length > 0 && mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('notif-update', newNotifs);
            }
        } else {
            initialWaPass = false;
        }
    } catch (_) {}
}

module.exports = { initWhatsAppCompanion, ensureWhatsAppWindow, pollWhatsAppUnread, resetWaState, replyWhatsApp };
