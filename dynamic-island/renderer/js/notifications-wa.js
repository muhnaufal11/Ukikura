// ================= DETEKSI NOTIFIKASI WHATSAPP & HP =================
let lastAlertedNotifKey = '';
let lastAlertedNotifTime = 0;

function triggerPeekPopup(item) {
    window.lastPeekItem = item;
    const appStr = String(item.app || '');
    const isWa = Boolean(item.isWhatsApp) || appStr.toLowerCase().includes('whatsapp');
    const pkAppEl = document.getElementById('pk-app');
    const pkTitleEl = document.getElementById('pk-title');
    const pkSubEl = document.getElementById('pk-sub');
    const pkArcEl = document.getElementById('pk-arc');
    const pkStickerEl = document.getElementById('pk-sticker');

    pkAppEl.textContent = isWa ? 'WhatsApp' : (appStr || 'Notifikasi HP');
    pkAppEl.classList.toggle('phone', !isWa && !item.isQuizAlarm && !item.isClassAlarm);
    pkAppEl.classList.toggle('quiz', Boolean(item.isQuizAlarm));
    pkAppEl.classList.toggle('class-bell', Boolean(item.isClassAlarm));
    pkTitleEl.textContent = item.sender || item.title || 'Pesan Baru';
    pkSubEl.textContent = item.message || item.text || 'Ketuk untuk membuka';

    if (item.isQuizAlarm) {
        pkArcEl.setAttribute('stroke', '#ff4757');
    } else if (item.isClassAlarm) {
        pkArcEl.setAttribute('stroke', '#ffd32a');
    } else {
        pkArcEl.setAttribute('stroke', isWa ? '#25d366' : '#19b8ff');
    }
    pkArcEl.style.setProperty('--arc-off', '16');

    if (pkStickerEl) {
        if (item.sticker) {
            pkStickerEl.src = item.sticker;
            pkStickerEl.style.display = 'block';
        } else {
            pkStickerEl.removeAttribute('src');
            pkStickerEl.style.display = 'none';
        }
    }

    if (!isExpanded) {
        if (mnEl.dataset.s === 'tucked') {
            ipcRenderer.send('island-tuck', false);
        }
        setPeekMode('peek', 6000);
    }

    const notifKey = `${item.sender || ''}_${item.message || ''}_${item.sticker ? 'stk' : 'txt'}`;
    const now = Date.now();
    const isDuplicateAlert = (notifKey === lastAlertedNotifKey && (now - lastAlertedNotifTime) < 3500);
    lastAlertedNotifKey = notifKey;
    lastAlertedNotifTime = now;

    // Bunyikan nada alert notifikasi WA/HP (hanya jika bukan duplikat, bukan alarm kuliah, dan bukan kuis yang punya nada sendiri)
    if (!item.isClassAlarm && !item.isQuizAlarm && !item.isSilent && !isDuplicateAlert && typeof window.playAudioAlert === 'function') {
        window.playAudioAlert('notif');
    }
}

function renderNotifications() {
    const hasWa = notificationsList.some(n => Boolean(n.isWhatsApp) || String(n.app || '').toLowerCase().includes('whatsapp'));
    mnEl.classList.toggle('has-wa', hasWa || notificationsList.length > 0);

    if (notificationsList.length === 0) {
        notifListEl.innerHTML = `
            <div class="nrow" style="justify-content:center;height:100%;color:rgba(255,255,255,.5);font-size:10.5px;text-align:center">
                Belum ada pesan WA / notifikasi HP baru. Klik kartu baterai di kiri untuk pratinjau animasi Peek, atau klik tombol "WA" untuk menautkan WhatsApp.
            </div>
        `;
        return;
    }

    notifListEl.innerHTML = notificationsList.map(n => {
        const isWa = Boolean(n.isWhatsApp) || String(n.app || '').toLowerCase().includes('whatsapp');
        const title = n.sender || n.title || 'Notifikasi';
        const body = n.message || n.text || '';
        const tStr = typeof n.time === 'number'
            ? new Date(n.time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            : (n.time || '');
        const stickerHtml = n.sticker
            ? `<img class="nrow-sticker" src="${escapeHtml(n.sticker)}" alt="Stiker" />`
            : '';
        return `
            <div class="nrow ${isWa ? 'wa' : 'phone'}" data-napp="${escapeHtml(n.app || '')}">
                <div style="min-width:0;flex:1">
                    <div style="display:flex;align-items:center;gap:5px">
                        <span class="trow-badge" style="background:${isWa ? 'rgba(37,211,102,.22)' : 'rgba(25,184,255,.22)'};color:${isWa ? '#5ef296' : '#8ce0ff'}">${escapeHtml(isWa ? 'WhatsApp' : (n.app || 'HP'))}</span>
                        <span class="trow-title">${escapeHtml(title)}</span>
                    </div>
                    <div class="trow-sub" style="margin-top:2px">${escapeHtml(body)}</div>
                </div>
                ${stickerHtml}
                <span class="trow-timer" style="font-size:9px;color:rgba(255,255,255,.5)">${escapeHtml(tStr)}</span>
            </div>
        `;
    }).join('');

    notifListEl.querySelectorAll('.nrow').forEach(row => {
        row.addEventListener('click', () => {
            const app = String(row.getAttribute('data-napp') || '').toLowerCase();
            if (app.includes('whatsapp') || app.includes('electron')) {
                ipcRenderer.send('island-open-wa');
            } else {
                shell.openExternal('ms-phone:');
            }
        });
    });
}

ipcRenderer.on('notif-update', (event, payload) => {
    if (!payload) return;
    const incoming = Array.isArray(payload) ? payload : (Array.isArray(payload.items) ? payload.items : []);
    if (incoming.length > 0) {
        let newestNew = null;
        for (const rawItem of incoming) {
            const senderStr = String(rawItem.sender || rawItem.title || '').trim();
            const msgStr = String(rawItem.message || rawItem.text || '').trim();
            if (/pesan (yang )?belum dibaca|unread message|Deadline LMS Mendesak/i.test(senderStr)) continue;

            const lowApp = String(rawItem.app || '').toLowerCase();
            const isWa = Boolean(rawItem.isWhatsApp) || lowApp.includes('whatsapp') || lowApp === 'electron';
            const item = Object.assign({}, rawItem, {
                app: isWa ? 'WhatsApp' : (rawItem.app || 'HP'),
                isWhatsApp: isWa,
                sender: senderStr || 'WhatsApp',
                message: msgStr,
                sticker: rawItem.sticker || ''
            });

            // Deduplikasi hanya berdasarkan nama pengirim/grup yang sama agar chat dari grup yang sudah ada tetap memicu Peek baru
            const normSender = item.sender.replace(/[^\w\s]/g, '').trim().toLowerCase();
            const dupIdx = notificationsList.findIndex(existing => {
                const exSender = String(existing.sender || '').replace(/[^\w\s]/g, '').trim().toLowerCase();
                return Boolean(exSender && normSender && exSender === normSender);
            });

            if (dupIdx !== -1) {
                const prev = notificationsList[dupIdx];
                const isGenericNew = !item.message || item.message === 'Pesan WhatsApp' || item.message === 'Pesan baru masuk';
                const nextMessage = (!isGenericNew || !prev.message) ? item.message : prev.message;
                const sameMsg = String(prev.message || '').trim() === String(nextMessage || '').trim();
                const mergedSticker = item.sticker || (sameMsg ? (prev.sticker || '') : '');
                const updatedItem = Object.assign({}, prev, item, {
                    message: nextMessage,
                    sticker: mergedSticker,
                    time: item.time || Date.now()
                });
                notificationsList.splice(dupIdx, 1);
                notificationsList.unshift(updatedItem);

                // Anti-dobel: Hanya picu nada/peek baru jika ada pesan teks BARU yang berbeda dari sebelumnya
                const isActuallyNewMessage = !sameMsg && !isGenericNew;
                if (isActuallyNewMessage && item.isNew) {
                    newestNew = updatedItem;
                } else if (item.sticker && !prev.sticker) {
                    // Update visual stiker susulan tanpa memicu ulang suara notifikasi
                    updatedItem.isSilent = true;
                    newestNew = updatedItem;
                }
            } else {
                notificationsList.unshift(item);
                if (item.isNew) newestNew = item;
            }
        }
        if (notificationsList.length > 20) notificationsList = notificationsList.slice(0, 20);
        renderNotifications();
        if (newestNew) {
            triggerPeekPopup(newestNew);
        }
    } else if (payload.isNew && payload.item) {
        triggerPeekPopup(payload.item);
    }
});

