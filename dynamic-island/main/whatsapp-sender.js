"use strict";

/**
 * Nusa WhatsApp Sender - Pengirim Balasan Cepat (Quick Reply) ke WhatsApp Web
 * Menavigasi chat, memfokuskan composer, menyisipkan teks, dan mengirim pesan.
 */

async function sendWhatsAppReply(waWindow, sender, text) {
    if (!waWindow || waWindow.isDestroyed()) {
        return { success: false, reason: "WhatsApp Companion belum aktif." };
    }
    const cleanText = String(text || "").trim();
    if (!cleanText) {
        return { success: false, reason: "Pesan balasan tidak boleh kosong." };
    }

    try {
        const result = await waWindow.webContents.executeJavaScript(`
            (async function(targetSender, textToSend) {
                const norm = s => String(s || '').replace(/[^\\w\\s]/g, '').trim().toLowerCase();
                const targetNorm = norm(targetSender);

                // 1. Cek apakah WhatsApp Web sudah login
                const isQrScreen = Boolean(document.querySelector('canvas[aria-label*="QR" i], [data-ref]'));
                const hasAppLoaded = Boolean(document.querySelector('#pane-side') || document.querySelector('#main'));
                if (isQrScreen || !hasAppLoaded) {
                    return { success: false, reason: "WhatsApp Web belum login. Silakan klik tombol WA di Nusa Island untuk scan QR." };
                }

                // 2. Cek apakah chat target sudah terbuka di #main
                const getOpenHeaderName = () => {
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

                const currentHeader = norm(getOpenHeaderName());
                let isOpen = Boolean(currentHeader && targetNorm && (currentHeader === targetNorm || currentHeader.includes(targetNorm) || targetNorm.includes(currentHeader)));

                // 3. Jika belum terbuka, cari dan klik baris chat di daftar #pane-side
                if (!isOpen) {
                    const rows = Array.from(document.querySelectorAll('[role="listitem"], [data-testid="cell-frame-container"]'));
                    let matchedRow = null;
                    for (const r of rows) {
                        const rowText = norm(r.innerText || '');
                        if (targetNorm && rowText.includes(targetNorm)) {
                            matchedRow = r;
                            break;
                        }
                    }

                    if (matchedRow) {
                        const clickTarget = matchedRow.querySelector('[role="gridcell"]') || matchedRow.querySelector('div[tabindex="-1"]') || matchedRow.firstElementChild || matchedRow;
                        const rect = clickTarget.getBoundingClientRect();
                        const cx = Math.round(rect.left + rect.width / 2);
                        const cy = Math.round(rect.top + rect.height / 2);
                        const evOpts = { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 };
                        clickTarget.dispatchEvent(new PointerEvent('pointerdown', evOpts));
                        clickTarget.dispatchEvent(new MouseEvent('mousedown', evOpts));
                        clickTarget.dispatchEvent(new PointerEvent('pointerup', evOpts));
                        clickTarget.dispatchEvent(new MouseEvent('mouseup', evOpts));
                        clickTarget.dispatchEvent(new MouseEvent('click', evOpts));

                        // Tunggu hingga #main footer composer muncul
                        for (let i = 0; i < 20; i++) {
                            await new Promise(r => setTimeout(r, 100));
                            if (document.querySelector('#main footer div[contenteditable="true"]')) break;
                        }
                    } else {
                        // Coba lewat search box WhatsApp
                        const searchBox = document.querySelector('#side div[contenteditable="true"][role="textbox"]') || document.querySelector('#side div[data-tab="3"]');
                        if (searchBox && targetSender) {
                            searchBox.focus();
                            document.execCommand('selectAll', false, null);
                            document.execCommand('insertText', false, targetSender);
                            await new Promise(r => setTimeout(r, 650));
                            const firstRes = document.querySelector('#pane-side [role="listitem"]');
                            if (firstRes) {
                                const clickTarget = firstRes.querySelector('[role="gridcell"]') || firstRes;
                                clickTarget.click();
                                await new Promise(r => setTimeout(r, 450));
                            }
                        }
                    }
                }

                // 4. Cari composer input di footer #main
                const composer = document.querySelector('#main footer div[contenteditable="true"][role="textbox"]') ||
                                 document.querySelector('#main footer div[contenteditable="true"]') ||
                                 document.querySelector('footer div[contenteditable="true"]');

                if (!composer) {
                    return { success: false, reason: "Kolom ketik pesan WhatsApp tidak ditemukan di layar." };
                }

                // 5. Masukkan teks menggunakan execCommand
                composer.focus();
                document.execCommand('selectAll', false, null);
                const inserted = document.execCommand('insertText', false, textToSend);
                if (!inserted) {
                    composer.innerText = textToSend;
                    composer.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: textToSend }));
                }

                // Beri jeda 150ms agar state draft WhatsApp memperbarui tombol send
                await new Promise(r => setTimeout(r, 150));

                // 6. Klik tombol kirim atau dispatch Enter
                const sendBtn = document.querySelector('footer button span[data-icon="send"]') ||
                                document.querySelector('footer span[data-icon="send"]') ||
                                document.querySelector('footer button[aria-label*="Send" i]') ||
                                document.querySelector('footer button[aria-label*="Kirim" i]');

                if (sendBtn) {
                    const btn = sendBtn.closest('button') || sendBtn;
                    btn.click();
                    return { success: true };
                }

                // Fallback Enter
                const enterEv = new KeyboardEvent('keydown', {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true
                });
                composer.dispatchEvent(enterEv);
                return { success: true };
            })(${JSON.stringify(sender)}, ${JSON.stringify(cleanText)});
        `);
        return result || { success: false, reason: "Gagal mengeksekusi pengiriman di WhatsApp." };
    } catch (err) {
        return { success: false, reason: err.message || "Error saat mengirim balasan." };
    }
}

module.exports = { sendWhatsAppReply };
