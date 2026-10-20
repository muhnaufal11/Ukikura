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
    const pkReplyBar = document.getElementById('pk-reply-bar');
    const pkReplyInput = document.getElementById('pk-reply-input');
    const pkReplySend = document.getElementById('pk-reply-send');

    pkAppEl.textContent = isWa ? 'WhatsApp' : (appStr || 'Notifikasi HP');
    pkAppEl.classList.toggle('phone', !isWa && !item.isQuizAlarm && !item.isClassAlarm);
    pkAppEl.classList.toggle('quiz', Boolean(item.isQuizAlarm));
    pkAppEl.classList.toggle('class-bell', Boolean(item.isClassAlarm));
    pkTitleEl.textContent = item.sender || item.title || 'Pesan Baru';

    // Voice Note vs Teks Biasa
    if (item.isVoiceNote) {
        pkSubEl.innerHTML = `
            <span class="pk-vn-badge">
                <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                <span>Pesan Suara (${escapeHtml(item.vnDuration || '0:15')})</span>
                <span class="pk-vn-waves"><span></span><span></span><span></span><span></span></span>
            </span>
        `;
    } else {
        pkSubEl.textContent = item.message || item.text || 'Ketuk untuk melihat detail';
    }

    if (item.isQuizAlarm) {
        pkArcEl.setAttribute('stroke', '#ff4757');
    } else if (item.isClassAlarm) {
        pkArcEl.setAttribute('stroke', '#ffd32a');
    } else {
        pkArcEl.setAttribute('stroke', isWa ? '#25d366' : '#19b8ff');
    }
    pkArcEl.style.setProperty('--arc-off', '16');

    // Tampilkan Media: Foto atau Stiker
    if (pkStickerEl) {
        if (item.image) {
            pkStickerEl.src = item.image;
            pkStickerEl.className = 'a c pk-sticker pk-photo';
            pkStickerEl.style.display = 'block';
        } else if (item.sticker) {
            pkStickerEl.src = item.sticker;
            pkStickerEl.className = 'a c pk-sticker';
            pkStickerEl.style.display = 'block';
        } else {
            pkStickerEl.removeAttribute('src');
            pkStickerEl.className = 'a c pk-sticker';
            pkStickerEl.style.display = 'none';
        }
    }

    // Quick Reply Bar di Peek Popup (Hanya saat pesan WhatsApp)
    if (isWa && pkReplyBar && pkReplyInput && pkReplySend) {
        mnEl.classList.add('has-reply');
        pkReplyBar.style.display = 'flex';
        pkReplyInput.value = '';
        pkReplyInput.disabled = false;
        pkReplyInput.placeholder = `Balas cepat ke ${item.sender || 'WhatsApp'}... (tekan Enter)`;
        pkReplySend.disabled = false;
        pkReplySend.style.background = '#25d366';
        pkReplySend.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`;
    } else {
        mnEl.classList.remove('has-reply');
        if (pkReplyBar) pkReplyBar.style.display = 'none';
    }

    if (!isExpanded) {
        if (mnEl.dataset.s === 'tucked') {
            ipcRenderer.send('island-tuck', false);
        }
        setPeekMode('peek', isWa ? 8500 : 6000);
    }

    const notifKey = `${String(item.sender || '').trim()}::${String(item.message || '').trim()}`.toLowerCase();
    const now = Date.now();
    const isDuplicateAlert = Boolean(notifKey && notifKey === lastAlertedNotifKey && (now - lastAlertedNotifTime) < 4000);
    if (!isDuplicateAlert) {
        lastAlertedNotifKey = notifKey;
        lastAlertedNotifTime = now;
    }

    // Bunyikan nada alert notifikasi WA/HP (hanya jika bukan duplikat, bukan alarm kuliah, dan bukan kuis yang punya nada sendiri)
    if (!item.isClassAlarm && !item.isQuizAlarm && !item.isSilent && !isDuplicateAlert && typeof window.playAudioAlert === 'function') {
        window.playAudioAlert('notif');
    }
}

// Handler pengiriman Quick Reply dari Peek Popup
async function executePeekReply() {
    const pkReplyInput = document.getElementById('pk-reply-input');
    const pkReplySend = document.getElementById('pk-reply-send');
    const pkReplyBar = document.getElementById('pk-reply-bar');
    if (!pkReplyInput || !pkReplySend) return;

    const text = pkReplyInput.value.trim();
    if (!text) return;

    const sender = window.lastPeekItem ? (window.lastPeekItem.sender || '') : '';
    pkReplyInput.disabled = true;
    pkReplySend.disabled = true;
    pkReplySend.innerHTML = `...`;

    try {
        const res = await ipcRenderer.invoke('send-wa-reply', { sender, text });
        if (res && res.success) {
            pkReplyInput.value = '';
            pkReplyInput.placeholder = '✓ Pesan berhasil terkirim!';
            pkReplySend.innerHTML = `✓`;
            pkReplySend.style.background = '#2ed573';
            setTimeout(() => {
                collapseIsland();
                mnEl.classList.remove('has-reply');
                if (pkReplyBar) pkReplyBar.style.display = 'none';
            }, 1000);
        } else {
            pkReplyInput.placeholder = res && res.reason ? res.reason : 'Gagal mengirim balasan.';
            pkReplySend.innerHTML = `✕`;
            setTimeout(() => {
                pkReplyInput.disabled = false;
                pkReplySend.disabled = false;
                pkReplySend.innerHTML = `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`;
            }, 2200);
        }
    } catch (err) {
        pkReplyInput.placeholder = 'Error: ' + err.message;
        pkReplyInput.disabled = false;
        pkReplySend.disabled = false;
    }
}

const pkReplyInputEl = document.getElementById('pk-reply-input');
const pkReplySendEl = document.getElementById('pk-reply-send');
const pkReplyBarEl = document.getElementById('pk-reply-bar');

if (pkReplyBarEl) {
    pkReplyBarEl.addEventListener('click', (e) => e.stopPropagation());
}
if (pkReplyInputEl) {
    pkReplyInputEl.addEventListener('click', (e) => e.stopPropagation());
    pkReplyInputEl.addEventListener('focus', () => {
        // Hentikan auto-close peek timer saat pengguna sedang mengetik
        if (peekTimer) {
            clearTimeout(peekTimer);
            peekTimer = null;
        }
    });
    pkReplyInputEl.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            e.preventDefault();
            executePeekReply();
        } else if (e.key === 'Escape') {
            collapseIsland();
            mnEl.classList.remove('has-reply');
            if (pkReplyBarEl) pkReplyBarEl.style.display = 'none';
        }
    });
}
if (pkReplySendEl) {
    pkReplySendEl.addEventListener('click', (e) => {
        e.stopPropagation();
        executePeekReply();
    });
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

    notifListEl.innerHTML = notificationsList.map((n, idx) => {
        const isWa = Boolean(n.isWhatsApp) || String(n.app || '').toLowerCase().includes('whatsapp');
        const title = n.sender || n.title || 'Notifikasi';
        const body = n.message || n.text || '';
        const tStr = typeof n.time === 'number'
            ? new Date(n.time).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
            : (n.time || '');

        // Pratinjau Foto atau Stiker
        let mediaHtml = '';
        if (n.image) {
            mediaHtml = `
                <div class="nrow-photo-wrap" title="Pratinjau Foto WhatsApp">
                    <img class="nrow-photo" src="${escapeHtml(n.image)}" alt="Foto" />
                    <span class="nrow-photo-tag">📷 Foto</span>
                </div>
            `;
        } else if (n.sticker) {
            mediaHtml = `<img class="nrow-sticker" src="${escapeHtml(n.sticker)}" alt="Stiker" />`;
        }

        // Indikator Voice Note WhatsApp
        let vnHtml = '';
        if (n.isVoiceNote) {
            vnHtml = `
                <div class="nrow-vn-pill">
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                    <span>Pesan Suara (${escapeHtml(n.vnDuration || '0:15')})</span>
                    <span class="vn-live-bars"><b></b><b></b><b></b><b></b></span>
                </div>
            `;
        }

        // Baris Quick Reply WhatsApp di dalam kartu notifikasi
        let replyHtml = '';
        if (isWa) {
            replyHtml = `
                <div class="nrow-reply-row" data-sender="${escapeHtml(title)}">
                    <input type="text" class="nrow-reply-input" placeholder="Balas ke ${escapeHtml(title)}..." />
                    <button type="button" class="nrow-reply-send" title="Kirim Balasan Cepat">
                        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                    </button>
                </div>
            `;
        }

        return `
            <div class="nrow ${isWa ? 'wa' : 'phone'}" data-napp="${escapeHtml(n.app || '')}">
                <div style="min-width:0;flex:1">
                    <div style="display:flex;align-items:center;gap:5px">
                        <span class="trow-badge" style="background:${isWa ? 'rgba(37,211,102,.22)' : 'rgba(25,184,255,.22)'};color:${isWa ? '#5ef296' : '#8ce0ff'}">${escapeHtml(isWa ? 'WhatsApp' : (n.app || 'HP'))}</span>
                        <span class="trow-title">${escapeHtml(title)}</span>
                    </div>
                    ${vnHtml}
                    <div class="trow-sub" style="margin-top:2px">${escapeHtml(body)}</div>
                    ${replyHtml}
                </div>
                ${mediaHtml}
                <span class="trow-timer" style="font-size:9px;color:rgba(255,255,255,.5)">${escapeHtml(tStr)}</span>
            </div>
        `;
    }).join('');

    // Listener klik untuk membuka WhatsApp Companion / HP
    notifListEl.querySelectorAll('.nrow').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('.nrow-reply-row')) return;
            const app = String(row.getAttribute('data-napp') || '').toLowerCase();
            if (app.includes('whatsapp') || app.includes('electron')) {
                ipcRenderer.send('island-open-wa');
            } else {
                shell.openExternal('ms-phone:');
            }
        });
    });

    // Listener pengiriman Quick Reply langsung dari kartu notifikasi
    notifListEl.querySelectorAll('.nrow-reply-row').forEach(rowEl => {
        const inputEl = rowEl.querySelector('.nrow-reply-input');
        const sendBtn = rowEl.querySelector('.nrow-reply-send');
        const sender = rowEl.getAttribute('data-sender') || '';

        const submitRowReply = async () => {
            const text = inputEl.value.trim();
            if (!text || !sender) return;
            inputEl.disabled = true;
            sendBtn.disabled = true;
            sendBtn.innerHTML = `...`;
            try {
                const res = await ipcRenderer.invoke('send-wa-reply', { sender, text });
                if (res && res.success) {
                    inputEl.value = '';
                    inputEl.placeholder = '✓ Terkirim!';
                    sendBtn.innerHTML = `✓`;
                    setTimeout(() => {
                        inputEl.disabled = false;
                        sendBtn.disabled = false;
                        inputEl.placeholder = `Balas ke ${sender}...`;
                        sendBtn.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`;
                    }, 2000);
                } else {
                    inputEl.placeholder = res && res.reason ? res.reason : 'Gagal mengirim.';
                    setTimeout(() => {
                        inputEl.disabled = false;
                        sendBtn.disabled = false;
                        inputEl.placeholder = `Balas ke ${sender}...`;
                    }, 2000);
                }
            } catch (err) {
                inputEl.placeholder = 'Error: ' + err.message;
                inputEl.disabled = false;
                sendBtn.disabled = false;
            }
        };

        if (inputEl) {
            inputEl.addEventListener('click', (e) => e.stopPropagation());
            inputEl.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submitRowReply();
                }
            });
        }
        if (sendBtn) {
            sendBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                submitRowReply();
            });
        }
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
                sticker: rawItem.sticker || '',
                image: rawItem.image || '',
                isVoiceNote: Boolean(rawItem.isVoiceNote),
                vnDuration: rawItem.vnDuration || ''
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
                const mergedImage = item.image || (sameMsg ? (prev.image || '') : '');
                const updatedItem = Object.assign({}, prev, item, {
                    message: nextMessage,
                    sticker: mergedSticker,
                    image: mergedImage,
                    isVoiceNote: Boolean(item.isVoiceNote || prev.isVoiceNote),
                    vnDuration: item.vnDuration || prev.vnDuration || '',
                    time: item.time || Date.now()
                });
                notificationsList.splice(dupIdx, 1);
                notificationsList.unshift(updatedItem);

                // Anti-dobel: Hanya picu nada/peek baru jika ada pesan teks BARU yang berbeda dari sebelumnya
                const isActuallyNewMessage = !sameMsg && !isGenericNew;
                if (isActuallyNewMessage && item.isNew) {
                    newestNew = updatedItem;
                } else if ((item.sticker && !prev.sticker) || (item.image && !prev.image)) {
                    // Update visual media susulan tanpa memicu ulang suara notifikasi
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
