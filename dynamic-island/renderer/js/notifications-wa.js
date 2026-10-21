// ================= DETEKSI NOTIFIKASI WHATSAPP & HP =================
let lastAlertedNotifKey = '';
let lastAlertedNotifTime = 0;

function cleanText(s) {
    return String(s || '')
        .replace(/^[\s*"'~_`]+|[\s*"'~_`]+$/g, '')
        .replace(/\*+/g, '')
        .trim();
}

function triggerPeekPopup(item) {
    window.lastPeekItem = item;
    const appStr = String(item.app || '');
    const isWa = Boolean(item.isWhatsApp) || appStr.toLowerCase().includes('whatsapp');
    const pkAppEl = document.getElementById('pk-app');
    const pkTitleEl = document.getElementById('pk-title');
    const pkSubEl = document.getElementById('pk-sub');
    const pkIconBadge = document.getElementById('pk-icon-badge');
    const pkIconSvg = document.getElementById('pk-icon-svg');
    const pkOpenBtn = document.getElementById('pk-open-btn');
    const pkStickerEl = document.getElementById('pk-sticker');
    const pkReplyBar = document.getElementById('pk-reply-bar');
    const pkReplyInput = document.getElementById('pk-reply-input');
    const pkReplySend = document.getElementById('pk-reply-send');

    const cleanTitle = cleanText(item.sender || item.title || 'Pesan Baru');
    const cleanMsg = cleanText(item.message || item.text || 'Ketuk untuk melihat detail');

    pkAppEl.textContent = isWa ? 'WhatsApp' : (appStr || 'Notifikasi HP');
    pkAppEl.classList.toggle('phone', !isWa && !item.isQuizAlarm && !item.isClassAlarm);
    pkAppEl.classList.toggle('quiz', Boolean(item.isQuizAlarm));
    pkAppEl.classList.toggle('class-bell', Boolean(item.isClassAlarm));
    pkTitleEl.textContent = cleanTitle;

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
        pkSubEl.textContent = cleanMsg;
    }

    // Ikon Notifikasi Bersih (Tanpa Cincin Meteran Tebal)
    if (pkIconBadge) {
        if (item.isQuizAlarm) {
            pkIconBadge.style.background = '#ff4757';
            pkIconBadge.style.boxShadow = '0 2px 10px rgba(255, 71, 87, 0.35)';
            if (pkIconSvg) {
                pkIconSvg.setAttribute('viewBox', '0 0 24 24');
                pkIconSvg.innerHTML = `<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="16" x2="12.01" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
            }
        } else if (item.isClassAlarm) {
            pkIconBadge.style.background = '#fed330';
            pkIconBadge.style.boxShadow = '0 2px 10px rgba(254, 211, 48, 0.35)';
            if (pkIconSvg) {
                pkIconSvg.setAttribute('viewBox', '0 0 24 24');
                pkIconSvg.innerHTML = `<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
            }
        } else if (isWa) {
            pkIconBadge.style.background = '#25d366';
            pkIconBadge.style.boxShadow = '0 2px 10px rgba(37, 211, 102, 0.35)';
            if (pkIconSvg) {
                pkIconSvg.setAttribute('viewBox', '0 0 24 24');
                pkIconSvg.innerHTML = `<path fill="#fff" d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm.01 1.67c4.54 0 8.24 3.7 8.24 8.24 0 2.2-.86 4.27-2.42 5.82a8.17 8.17 0 0 1-5.82 2.42c-1.47 0-2.91-.4-4.16-1.15l-.3-.18-3.1.81.83-3.02-.19-.31a8.21 8.21 0 0 1-1.26-4.39c0-4.54 3.7-8.24 8.24-8.24zm4.52 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.24-.75-.67-1.25-1.49-1.4-1.74-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.32-.02-.45-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.78 2.71 4.3 3.8 2.53 1.09 2.53.73 2.98.69.46-.04 1.47-.6 1.68-1.18.21-.58.21-1.07.15-1.18-.06-.11-.23-.17-.48-.3z"/>`;
            }
        } else {
            pkIconBadge.style.background = '#19b8ff';
            pkIconBadge.style.boxShadow = '0 2px 10px rgba(25, 184, 255, 0.35)';
            if (pkIconSvg) {
                pkIconSvg.setAttribute('viewBox', '0 0 24 24');
                pkIconSvg.innerHTML = `<rect x="5" y="2" width="14" height="20" rx="2" ry="2" stroke="currentColor" stroke-width="2" fill="none"/><line x1="12" y1="18" x2="12.01" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
            }
        }
    }

    // Tampilkan Media: Foto atau Stiker (sembunyikan tombol panah agar tidak tabrakan)
    if (pkStickerEl) {
        if (item.image) {
            pkStickerEl.src = item.image;
            pkStickerEl.className = 'a pk-sticker pk-photo';
            pkStickerEl.style.display = 'block';
            if (pkOpenBtn) pkOpenBtn.style.display = 'none';
        } else if (item.sticker) {
            pkStickerEl.src = item.sticker;
            pkStickerEl.className = 'a pk-sticker';
            pkStickerEl.style.display = 'block';
            if (pkOpenBtn) pkOpenBtn.style.display = 'none';
        } else {
            pkStickerEl.removeAttribute('src');
            pkStickerEl.className = 'a pk-sticker';
            pkStickerEl.style.display = 'none';
            if (pkOpenBtn) pkOpenBtn.style.display = 'grid';
        }
    }

    // Quick Reply Bar di Peek Popup (Hanya saat pesan WhatsApp)
    if (isWa && pkReplyBar && pkReplyInput && pkReplySend) {
        mnEl.classList.add('has-reply');
        pkReplyBar.style.display = 'flex';
        pkReplyInput.value = '';
        pkReplyInput.disabled = false;
        pkReplyInput.placeholder = `Balas ke ${cleanTitle}... (Enter)`;
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

    const notifKey = `${cleanTitle}::${cleanMsg}`.toLowerCase();
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
        const rawTitle = n.sender || n.title || 'Notifikasi';
        const cleanTitle = cleanText(rawTitle);
        const rawBody = n.message || n.text || '';
        const cleanBody = cleanText(rawBody);
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
                    <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                    <span>Pesan Suara (${escapeHtml(n.vnDuration || '0:15')})</span>
                    <span class="vn-live-bars"><b></b><b></b><b></b><b></b></span>
                </div>
            `;
        }

        // Formulir Balas Cepat (Kolapsibel / Tersembunyi rapi secara default)
        const replyFormHtml = isWa ? `
            <div class="nrow-reply-row" style="display:none" data-sender="${escapeHtml(cleanTitle)}">
                <input type="text" class="nrow-reply-input" placeholder="Balas ke ${escapeHtml(cleanTitle)}... (tekan Enter)" />
                <button type="button" class="nrow-reply-send" title="Kirim Balasan Cepat">
                    <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
                </button>
            </div>
        ` : '';

        return `
            <div class="nrow ${isWa ? 'wa' : 'phone'}" data-napp="${escapeHtml(n.app || '')}">
                <div class="nrow-header">
                    <div class="nrow-title-row">
                        <span class="trow-badge" style="background:${isWa ? 'rgba(37,211,102,.22)' : 'rgba(25,184,255,.22)'};color:${isWa ? '#5ef296' : '#8ce0ff'}">${escapeHtml(isWa ? 'WhatsApp' : (n.app || 'HP'))}</span>
                        <span class="trow-title" title="${escapeHtml(cleanTitle)}">${escapeHtml(cleanTitle)}</span>
                    </div>
                    <div class="nrow-header-actions">
                        <span class="trow-timer">${escapeHtml(tStr)}</span>
                        ${isWa ? `<button type="button" class="nrow-reply-toggle" title="Balas Cepat"><svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v2.5"/></svg><span>Balas</span></button>` : ''}
                    </div>
                </div>
                <div class="nrow-content">
                    <div class="nrow-text-wrap">
                        ${vnHtml}
                        <div class="trow-sub">${escapeHtml(cleanBody)}</div>
                    </div>
                    ${mediaHtml}
                </div>
                ${replyFormHtml}
            </div>
        `;
    }).join('');

    // Listener klik pada kartu untuk membuka WhatsApp Companion / HP
    notifListEl.querySelectorAll('.nrow').forEach(row => {
        row.addEventListener('click', (e) => {
            if (e.target.closest('.nrow-reply-row') || e.target.closest('.nrow-reply-toggle')) return;
            const app = String(row.getAttribute('data-napp') || '').toLowerCase();
            if (app.includes('whatsapp') || app.includes('electron')) {
                ipcRenderer.send('island-open-wa');
            } else {
                shell.openExternal('ms-phone:');
            }
        });
    });

    // Listener toggle tombol "Balas" pada kartu notifikasi
    notifListEl.querySelectorAll('.nrow').forEach(card => {
        const toggleBtn = card.querySelector('.nrow-reply-toggle');
        const replyRow = card.querySelector('.nrow-reply-row');
        const inputEl = card.querySelector('.nrow-reply-input');
        const sendBtn = card.querySelector('.nrow-reply-send');
        const sender = replyRow ? (replyRow.getAttribute('data-sender') || '') : '';

        if (toggleBtn && replyRow && inputEl) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = replyRow.style.display === 'flex';
                // Tutup form reply lain agar tampilan tetap rapi & bersih
                notifListEl.querySelectorAll('.nrow-reply-row').forEach(r => r.style.display = 'none');
                notifListEl.querySelectorAll('.nrow').forEach(c => c.classList.remove('replying'));

                if (!isOpen) {
                    replyRow.style.display = 'flex';
                    card.classList.add('replying');
                    inputEl.focus();
                }
            });
        }

        if (inputEl && sendBtn && sender) {
            const submitRowReply = async () => {
                const text = inputEl.value.trim();
                if (!text) return;
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
                            replyRow.style.display = 'none';
                            card.classList.remove('replying');
                            inputEl.disabled = false;
                            sendBtn.disabled = false;
                            inputEl.placeholder = `Balas ke ${sender}... (tekan Enter)`;
                            sendBtn.innerHTML = `<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`;
                        }, 1200);
                    } else {
                        inputEl.placeholder = res && res.reason ? res.reason : 'Gagal mengirim.';
                        setTimeout(() => {
                            inputEl.disabled = false;
                            sendBtn.disabled = false;
                            inputEl.placeholder = `Balas ke ${sender}... (tekan Enter)`;
                        }, 2000);
                    }
                } catch (err) {
                    inputEl.placeholder = 'Error: ' + err.message;
                    inputEl.disabled = false;
                    sendBtn.disabled = false;
                }
            };

            inputEl.addEventListener('click', (e) => e.stopPropagation());
            inputEl.addEventListener('keydown', (e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                    e.preventDefault();
                    submitRowReply();
                } else if (e.key === 'Escape') {
                    replyRow.style.display = 'none';
                    card.classList.remove('replying');
                }
            });
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
            const isWa = Boolean(rawItem.isWhatsApp) || lowApp.includes('whatsapp') || lowApp === 'electron' || senderStr.toLowerCase().includes('whatsapp');
            let parsedSender = senderStr || (isWa ? 'WhatsApp' : 'HP');
            let parsedMsg = msgStr;
            if (isWa && parsedMsg) {
                const waMatch = parsedMsg.match(/^([^:\n]{1,40})[:\n]\s*([\s\S]+)$/);
                if (waMatch && (parsedSender.toLowerCase() === 'whatsapp' || !parsedSender)) {
                    parsedSender = waMatch[1].trim();
                    parsedMsg = waMatch[2].trim();
                }
            }

            const item = Object.assign({}, rawItem, {
                app: isWa ? 'WhatsApp' : (rawItem.app || 'HP'),
                isWhatsApp: isWa,
                sender: parsedSender,
                message: parsedMsg,
                sticker: rawItem.sticker || '',
                image: rawItem.image || '',
                isVoiceNote: Boolean(rawItem.isVoiceNote),
                vnDuration: rawItem.vnDuration || ''
            });

            // Deduplikasi hanya berdasarkan nama pengirim/grup yang sama agar chat dari grup yang sudah ada tetap memicu Peek baru
            const normSender = cleanText(item.sender).replace(/[^\w\s]/g, '').trim().toLowerCase();
            const dupIdx = notificationsList.findIndex(existing => {
                const exSender = cleanText(existing.sender || '').replace(/[^\w\s]/g, '').trim().toLowerCase();
                return Boolean(exSender && normSender && exSender === normSender);
            });

            if (dupIdx !== -1) {
                const prev = notificationsList[dupIdx];
                const isGenericNew = !item.message || item.message === 'Pesan WhatsApp' || item.message === 'Pesan baru masuk';
                const nextMessage = (!isGenericNew || !prev.message) ? item.message : prev.message;
                const sameMsg = String(prev.message || '').trim() === String(nextMessage || '').trim();
                const mergedSticker = item.sticker || prev.sticker || '';
                const mergedImage = item.image || prev.image || '';
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
