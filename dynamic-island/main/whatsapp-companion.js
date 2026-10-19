"use strict";
const { app, BrowserWindow } = require("electron");
let waWindow = null;
let getMainWindow = () => null;
function initWhatsAppCompanion(mainWinGetter) { getMainWindow = mainWinGetter; }
function resetWaState() { seenWaSignatures.clear(); initialWaPass = true; }


// Companion WhatsApp Background agar chat WA dari HP selalu terdeteksi realtime
let seenWaSignatures = new Set();
let initialWaPass = true;
let waClickAttempts = new Map();

function ensureWhatsAppWindow(showWindow = false) {
    if (waWindow && !waWindow.isDestroyed()) {
        if (showWindow) {
            waWindow.show();
            waWindow.focus();
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
                    const sig = `wa_live_${data.sender}_${data.message}_${data.sticker ? 'stk' : 'txt'}`;
                    seenWaSignatures.add(`wa_${data.sender}_${data.message}_txt`);
                    const mainWindow = getMainWindow(); if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('notif-update', [{
                            id: sig,
                            app: 'WhatsApp',
                            sender: data.sender,
                            message: data.message || 'Pesan baru masuk',
                            sticker: data.sticker || '',
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
                            console.log('__NUSA_WA_LIVE__:' + JSON.stringify({
                                sender: String(title || 'WhatsApp').trim(),
                                message: String(opts.body || 'Pesan baru masuk').trim(),
                                tag: String(opts.tag || '')
                            }));
                        } catch (_) {}
                        return new OrigNotif(title, opts);
                    };
                    WrappedNotif.prototype = OrigNotif.prototype;
                    try {
                        Object.defineProperty(WrappedNotif, 'permission', {
                            get: () => OrigNotif.permission
                        });
                    } catch (_) {}
                    WrappedNotif.requestPermission = OrigNotif.requestPermission
                        ? OrigNotif.requestPermission.bind(OrigNotif)
                        : () => Promise.resolve('granted');
                    window.Notification = WrappedNotif;
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

                const extractStickerFromChatModel = async (chat) => {
                    try {
                        if (!chat || !chat.msgs) return '';
                        const msgs = typeof chat.msgs.getModelsArray === 'function'
                            ? chat.msgs.getModelsArray()
                            : (Array.isArray(chat.msgs._models) ? chat.msgs._models : []);
                        for (let i = msgs.length - 1; i >= Math.max(0, msgs.length - 10); i--) {
                            const m = msgs[i];
                            if (!m) continue;
                            const mType = m.type || (m._data && m._data.type) || '';
                            if (mType === 'sticker' || mType === 'image') {
                                if (m.mediaData && !m.mediaData.mediaBlob && typeof m.downloadMedia === 'function') {
                                    try {
                                        await m.downloadMedia({ downloadEvenIfExpensive: true, rmrReason: 1 });
                                    } catch (_) {
                                        try { await m.downloadMedia(true, 1); } catch (_) {}
                                    }
                                }
                                if (m.mediaData && m.mediaData.mediaBlob instanceof Blob) {
                                    const dUrl = await blobToDataUrl(m.mediaData.mediaBlob);
                                    if (dUrl) return dUrl;
                                }
                                if (m.mediaData && m.mediaData.preview) {
                                    if (m.mediaData.preview instanceof Blob) {
                                        const dUrl = await blobToDataUrl(m.mediaData.preview);
                                        if (dUrl) return dUrl;
                                    }
                                    if (typeof m.mediaData.preview._b64 === 'string' && m.mediaData.preview._b64.length > 20) {
                                        return 'data:image/webp;base64,' + m.mediaData.preview._b64;
                                    }
                                }
                                const rawBody = (typeof m.body === 'string' && m.body.length > 30)
                                    ? m.body
                                    : ((m._data && typeof m._data.body === 'string' && m._data.body.length > 30) ? m._data.body : '');
                                if (rawBody) {
                                    if (rawBody.startsWith('data:image/')) return rawBody;
                                    if (/^(?:\\/9j\\/|iVBOR|UklGR)/.test(rawBody)) {
                                        const mime = mType === 'sticker' ? 'image/webp' : 'image/jpeg';
                                        return 'data:' + mime + ';base64,' + rawBody;
                                    }
                                }
                                break;
                            }
                        }
                    } catch (_) {}
                    return '';
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
                            const rect = img.getBoundingClientRect();
                            const w = img.naturalWidth || rect.width || img.width || 0;
                            const h = img.naturalHeight || rect.height || img.height || 0;
                            if (w > 0 && w <= 44 && h > 0 && h <= 44) return false;
                            return img.src.startsWith('blob:') || img.src.startsWith('data:image/');
                        });
                        for (let i = allImgs.length - 1; i >= Math.max(0, allImgs.length - 4); i--) {
                            const img = allImgs[i];
                            const dUrl = await imgElementToDataUrl(img);
                            if (dUrl && dUrl.length > 120) {
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

                const rows = Array.from(document.querySelectorAll('[role="listitem"], [data-testid="cell-frame-container"]'));
                let index = 0;
                for (const row of rows) {
                    const rowIdx = index;
                    const unreadBadge = row.querySelector('span[aria-label*="unread" i], span[aria-label*="belum dibaca" i], [data-testid="icon-unread-count"]');
                    let isUnread = Boolean(unreadBadge);

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
                    const isStickerMsg = /(?:stiker|sticker|foto|photo)/i.test(cleanMsg);
                    let stickerData = '';
                    let stickerId = '';
                    let clickCoords = null;
                    const cacheKey = sender + '|' + cleanMsg;

                    if (isStickerMsg) {
                        if (chatModel) {
                            stickerData = await extractStickerFromChatModel(chatModel);
                            if (stickerData) stickerId = stickerData.slice(-14).replace(/[^a-zA-Z0-9]/g, '');
                        }

                        const isMainOpenForThisSender = Boolean(
                            openHeaderName &&
                            normName(openHeaderName) &&
                            normName(sender) &&
                            (normName(openHeaderName) === normName(sender) ||
                             normName(openHeaderName).includes(normName(sender)) ||
                             normName(sender).includes(normName(openHeaderName)))
                        );

                        if (!stickerData && isMainOpenForThisSender) {
                            const domStk = await extractStickerFromOpenMainDom();
                            if (domStk.dataUrl) {
                                stickerData = domStk.dataUrl;
                                stickerId = domStk.id;
                            }
                        }

                        if (stickerData) {
                            window.__nusaStickerCache[cacheKey] = { dataUrl: stickerData, id: stickerId || 'stk' };
                        } else if (window.__nusaStickerCache[cacheKey] && isMainOpenForThisSender) {
                            stickerData = window.__nusaStickerCache[cacheKey].dataUrl;
                            stickerId = window.__nusaStickerCache[cacheKey].id;
                        }

                        // Jika stiker belum terambil pada chat teratas/unread, buka otomatis baris tersebut di #main
                        if (!stickerData && (rowIdx <= 1 || isUnread)) {
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
                        stickerId: stickerId || (stickerData ? 'stk' : 'txt'),
                        clickCoords: clickCoords
                    });
                }
                return results;
            })();
        `);

        if (Array.isArray(chatItems) && chatItems.length > 0) {
            const newNotifs = [];
            for (const c of chatItems) {
                // Jika chat stiker belum terbuka di #main, klik barisnya secara native di waWindow agar #main merender stiker WebP
                if (!c.sticker && c.clickCoords && waWindow && !waWindow.isDestroyed()) {
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

                const sig = `wa_${c.sender}_${c.message}_${c.stickerId || (c.sticker ? 'stk' : 'txt')}`;
                if (!seenWaSignatures.has(sig)) {
                    seenWaSignatures.add(sig);
                    newNotifs.push({
                        id: sig,
                        app: 'WhatsApp',
                        sender: c.sender,
                        message: c.message || 'Pesan baru masuk',
                        sticker: c.sticker || '',
                        isWhatsApp: true,
                        isPhone: true,
                        time: Date.now(),
                        isNew: (!initialWaPass && (Boolean(c.isUnread) || c.rowIdx <= 1)) || (c.rowIdx === 0 && Boolean(c.sticker))
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

module.exports = { initWhatsAppCompanion, ensureWhatsAppWindow, pollWhatsAppUnread, resetWaState };
