// ================= HALAMAN 5: NUSA SHELF & CLIPBOARD HISTORY =================
const shelfEl = document.getElementById('shelf');
const shelfCardsEl = document.getElementById('shelf-cards');
const shCv = document.getElementById('shCv');
const sc = shCv.getContext('2d');
const btnTabShelfFiles = document.getElementById('btn-tab-shelf-files');
const btnTabShelfClip = document.getElementById('btn-tab-shelf-clip');
const shelfFilesCountEl = document.getElementById('shelf-files-count');
const shelfClipCountEl = document.getElementById('shelf-clip-count');
const shelfDragHintEl = document.getElementById('shelf-drag-hint');
const clipFilterBarEl = document.getElementById('clip-filter-bar');
const btnClearClipEl = document.getElementById('btn-clear-clip');
const viewShelfFilesEl = document.getElementById('view-shelf-files');
const viewShelfClipEl = document.getElementById('view-shelf-clip');
const clipListEl = document.getElementById('clip-list');

let shelfActiveTab = 'files'; // 'files' | 'clip'
let clipHistoryList = [];
let clipFilter = 'all';
let isDraggingOut = false;
const PAL = [[40, 170, 240], [52, 104, 236], [104, 78, 222]];
const SH_SPEED = 0.7;
let shHov = 0, shHv = 0, shDropT = -1, shDx = 240, shCx = 240, shG = 0, shGv = 0, shHot = false, shLast = 0, shRaf = 0;
const shCl = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const shSm = x => { x = shCl(x); return x * x * (3 - 2 * x); };
function shMix(u) {
    u = shCl(u);
    const [a, b, k] = u < 0.5 ? [PAL[0], PAL[1], u * 2] : [PAL[1], PAL[2], (u - 0.5) * 2];
    return a.map((v, i) => Math.round(v + (b[i] - v) * k));
}
const shRgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function shDraw() {
    const W = 480, H = 186, c = sc;
    c.setTransform(2, 0, 0, 2, 0, 0);
    c.clearRect(0, 0, W, H);
    const d = shDropT, rise = d >= 0 && d < 1.1 ? Math.sin(shSm(d / 1.1) * Math.PI) : 0;
    const fade = d >= 0 ? (d < 0.9 ? 1 : 1 - shSm((d - 0.9) / 1.1)) : 1;
    const base = (0.26 * shHov + 0.34 * rise) * fade;
    const pool = (0.42 * shHov + 0.28 * rise) * fade;
    if (base > 0.004) {
        const g = c.createLinearGradient(0, 0, W, 0);
        g.addColorStop(0, shRgba(PAL[0], base));
        g.addColorStop(0.5, shRgba(PAL[1], base));
        g.addColorStop(1, shRgba(PAL[2], base));
        c.fillStyle = g;
        c.fillRect(0, 0, W, H);
    }
    const px = d >= 0 ? shDx : shCx;
    if (pool > 0.004) {
        const col = shMix(px / W), R = 180 + 60 * rise;
        const g = c.createRadialGradient(px, H + 18, 0, px, H + 18, R);
        g.addColorStop(0, shRgba(col.map(v => Math.min(255, v + 51)), pool));
        g.addColorStop(0.55, shRgba(col, pool * 0.45));
        g.addColorStop(1, shRgba(col, 0));
        c.fillStyle = g;
        c.fillRect(0, 0, W, H);
    }
    c.globalCompositeOperation = 'destination-in';
    const m = c.createLinearGradient(0, H, 0, 0);
    m.addColorStop(0, '#000');
    m.addColorStop(0.42, 'rgba(0,0,0,.55)');
    m.addColorStop(0.78, 'rgba(0,0,0,.08)');
    m.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = m;
    c.fillRect(0, 0, W, H);
    c.globalCompositeOperation = 'source-over';
}

function shFrame(now) {
    const dt = Math.min(0.05, (now - shLast) / 1000);
    shLast = now;
    shHv += (50 * ((shHot ? 1 : 0) - shHov) - 14 * shHv) * dt;
    shHov = shCl(shHov + shHv * dt, 0, 1.04);
    shGv += (-60 * shG - 6 * shGv) * dt;
    shG += shGv * dt;
    if (shDropT >= 0) {
        shDropT += dt * SH_SPEED;
        if (shDropT >= 2) shDropT = -1;
    }
    shDraw();
    mnEl.style.transform = `scale(${1 + 0.018 * shHov + 0.035 * shG}, ${1 + 0.035 * shHov - 0.06 * shG})`;
    const busy = shHot || shHov > 0.002 || shDropT >= 0 || Math.abs(shG) > 0.001 || Math.abs(shGv) > 0.01;
    if (busy) shRaf = requestAnimationFrame(shFrame);
    else {
        shRaf = 0;
        mnEl.style.transform = '';
    }
}

function shRun() {
    if (!shRaf) {
        shLast = performance.now();
        shRaf = requestAnimationFrame(shFrame);
    }
}

function switchShelfTab(tab) {
    shelfActiveTab = tab;
    const isFiles = tab === 'files';
    if (btnTabShelfFiles) btnTabShelfFiles.classList.toggle('active', isFiles);
    if (btnTabShelfClip) btnTabShelfClip.classList.toggle('active', !isFiles);
    if (viewShelfFilesEl) viewShelfFilesEl.style.display = isFiles ? '' : 'none';
    if (viewShelfClipEl) viewShelfClipEl.style.display = isFiles ? 'none' : '';
    if (shelfDragHintEl) shelfDragHintEl.style.display = isFiles ? '' : 'none';
    if (clipFilterBarEl) clipFilterBarEl.style.display = isFiles ? 'none' : 'flex';
    if (!isFiles) {
        renderClipboardHistory();
    }
}

if (btnTabShelfFiles) btnTabShelfFiles.addEventListener('click', () => switchShelfTab('files'));
if (btnTabShelfClip) btnTabShelfClip.addEventListener('click', () => switchShelfTab('clip'));

function renderShelf() {
    shelfEl.classList.toggle('has', shelfItems.length > 0);
    if (shelfFilesCountEl) shelfFilesCountEl.textContent = String(shelfItems.length);

    shelfCardsEl.innerHTML = shelfItems.map((item, idx) => `
        <div class="sh-card" draggable="true" data-idx="${idx}" title="${escapeHtml(item.path || item.name)} · Tahan dan tarik ke luar untuk kirim">
            <span class="sh-thumb">
                <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 1-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </span>
            <span class="sh-name">${escapeHtml(item.name)}</span>
            <span class="sh-size">${escapeHtml(item.size)}</span>
            <span class="sh-drag-badge">Tarik keluar</span>
        </div>
    `).join('');

    shelfCardsEl.querySelectorAll('.sh-card').forEach(card => {
        card.addEventListener('click', () => {
            const item = shelfItems[parseInt(card.getAttribute('data-idx'), 10)];
            if (item && item.path) shell.openPath(item.path);
        });

        // Native Drag-Out ke Browser / WhatsApp / File Explorer (Todo 6)
        card.addEventListener('dragstart', (e) => {
            const item = shelfItems[parseInt(card.getAttribute('data-idx'), 10)];
            if (!item || !item.path) {
                console.warn('[Ukikura] Path file tidak ditemukan untuk di-drag:', item);
                return;
            }
            e.preventDefault();
            isDraggingOut = true;
            card.style.opacity = '0.45';
            ipcRenderer.send('island-start-drag', item.path);
            setTimeout(() => {
                isDraggingOut = false;
                card.style.opacity = '';
            }, 1200);
        });
        card.addEventListener('dragend', () => {
            isDraggingOut = false;
            card.style.opacity = '';
        });
    });
}

function renderClipboardHistory() {
    if (!clipListEl) return;
    if (shelfClipCountEl) shelfClipCountEl.textContent = String(clipHistoryList.length);

    let filtered = clipHistoryList;
    if (clipFilter !== 'all') {
        filtered = clipHistoryList.filter(item => item.type === clipFilter);
    }

    if (filtered.length === 0) {
        clipListEl.innerHTML = `
            <div class="clip-empty-msg">
                <svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
                <span>${clipHistoryList.length === 0 
                    ? 'Belum ada riwayat clipboard tersimpan. Salin teks, link, kode, atau screenshot untuk memulai.' 
                    : 'Tidak ada item yang cocok dengan filter ini.'}</span>
            </div>
        `;
        return;
    }

    clipListEl.innerHTML = filtered.map((item) => {
        const typeBadge = `<span class="clip-badge ${item.type}">${item.type}</span>`;
        let bodyHtml = '';
        if (item.type === 'image') {
            bodyHtml = `<img class="clip-thumb-img" src="${item.content}" alt="Screenshot" />`;
        } else if (item.type === 'code') {
            bodyHtml = `<div class="clip-body code-font">${escapeHtml(item.preview)}</div>`;
        } else {
            bodyHtml = `<div class="clip-body">${escapeHtml(item.preview)}</div>`;
        }

        const metaStr = item.type === 'image' ? 'Gambar' : `${item.charCount} chr`;

        return `
            <div class="clip-card" data-clip-id="${item.id}" title="Klik 1-kali untuk menyalin kembali ke clipboard">
                <div class="clip-card-header">
                    ${typeBadge}
                    <span class="clip-time">${item.timeStr || ''}</span>
                </div>
                ${bodyHtml}
                <div class="clip-footer">
                    <span>${metaStr}</span>
                    <span class="clip-footer-action">Salin</span>
                </div>
            </div>
        `;
    }).join('');

    clipListEl.querySelectorAll('.clip-card').forEach(card => {
        card.addEventListener('click', () => {
            const clipId = card.getAttribute('data-clip-id');
            const item = clipHistoryList.find(c => c.id === clipId);
            if (!item) return;

            if (item.type === 'image') {
                ipcRenderer.send('clipboard-copy-image', item.content);
            } else {
                ipcRenderer.send('clipboard-copy-text', item.content);
            }

            card.classList.add('copied');
            const actEl = card.querySelector('.clip-footer-action');
            if (actEl) actEl.textContent = '✓ Tersalin!';
            setTimeout(() => {
                card.classList.remove('copied');
                if (actEl) actEl.textContent = 'Salin';
            }, 1200);
        });
    });
}

if (clipFilterBarEl) {
    clipFilterBarEl.querySelectorAll('.clip-flt-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            clipFilterBarEl.querySelectorAll('.clip-flt-chip').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            clipFilter = btn.getAttribute('data-clip-filter') || 'all';
            renderClipboardHistory();
        });
    });
}

if (btnClearClipEl) {
    btnClearClipEl.addEventListener('click', () => {
        ipcRenderer.send('clipboard-clear');
    });
}

ipcRenderer.on('clipboard-history-update', (event, history) => {
    clipHistoryList = Array.isArray(history) ? history : [];
    if (shelfClipCountEl) shelfClipCountEl.textContent = String(clipHistoryList.length);
    if (shelfActiveTab === 'clip') {
        renderClipboardHistory();
    }
});

ipcRenderer.send('clipboard-get-history');

const enableHScroll = (el) => {
    if (!el) return;
    el.addEventListener('wheel', (e) => {
        if (e.deltaY !== 0) {
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        }
    }, { passive: false });
};
enableHScroll(clipListEl);
enableHScroll(shelfCardsEl);

window.addEventListener('dragover', (e) => {
    if (isDraggingOut) return;
    e.preventDefault();
    if (currentPage !== 'shelf') setPage('shelf');
    const r = mnEl.getBoundingClientRect();
    shCx = shCl(e.clientX - r.left, 0, 480);
    shelfEl.classList.add('hover');
    shHot = true;
    shRun();
});

window.addEventListener('dragleave', (e) => {
    if (e.relatedTarget === null) {
        shelfEl.classList.remove('hover');
        shHot = false;
        shRun();
    }
});

window.addEventListener('drop', (e) => {
    e.preventDefault();
    shelfEl.classList.remove('hover');
    shHot = false;
    shDx = shCx;
    shDropT = 0;
    shGv = 7.7;
    shRun();

    const files = Array.from(e.dataTransfer.files || []);
    for (const f of files) {
        let fPath = f.path;
        if (!fPath) {
            try {
                if (typeof webUtils !== 'undefined' && webUtils && typeof webUtils.getPathForFile === 'function') {
                    fPath = webUtils.getPathForFile(f);
                } else {
                    const { webUtils: wu } = require('electron');
                    if (wu && typeof wu.getPathForFile === 'function') fPath = wu.getPathForFile(f);
                }
            } catch (_) {}
        }
        const kb = Math.max(1, Math.round((f.size || 0) / 1024));
        const sizeStr = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
        shelfItems.push({ name: f.name, path: fPath, size: sizeStr });
    }
    renderShelf();
});

const shZoneEl = document.getElementById('sh-zone');
const shFileInputEl = document.getElementById('sh-file-input');
if (shZoneEl && shFileInputEl) {
    shZoneEl.addEventListener('click', (e) => {
        e.stopPropagation();
        shFileInputEl.click();
    });
    shFileInputEl.addEventListener('change', () => {
        const files = Array.from(shFileInputEl.files || []);
        for (const f of files) {
            let fPath = f.path;
            try {
                if (typeof webUtils !== 'undefined' && webUtils && typeof webUtils.getPathForFile === 'function') {
                    fPath = webUtils.getPathForFile(f);
                } else {
                    const { webUtils: wu } = require('electron');
                    if (wu && typeof wu.getPathForFile === 'function') fPath = wu.getPathForFile(f);
                }
            } catch (_) {}
            const kb = Math.max(1, Math.round((f.size || 0) / 1024));
            const sizeStr = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
            shelfItems.push({ name: f.name, path: fPath, size: sizeStr });
        }
        shFileInputEl.value = '';
        renderShelf();
    });
}

// ================= TOMBOL AKSI GLOBAL =================
btnSyncEl.addEventListener('click', (e) => {
    e.stopPropagation();
    btnSyncEl.classList.add('spinning');
    lastSyncTextEl.textContent = 'Memindai LMS di background...';
    ipcRenderer.send('island-sync-now');
    fetch(`${SERVER_URL}/__qbot__/tasks/sync`, { method: 'POST' })
        .then(r => r.json())
        .then(() => setTimeout(() => btnSyncEl.classList.remove('spinning'), 1200))
        .catch(() => btnSyncEl.classList.remove('spinning'));
});

document.getElementById('btn-login').addEventListener('click', (e) => {
    e.stopPropagation();
    ipcRenderer.send('island-login-lms');
});

document.getElementById('btn-open-courses').addEventListener('click', () => {
    ipcRenderer.send('island-open-url', 'https://lms.telkomuniversity.ac.id/my/courses.php');
});

const LMS_AI_REPO_URL = 'https://github.com/muhnaufal11/lms-quiz-assistant';

document.getElementById('btn-open-ai-1').addEventListener('click', () => {
    fetch('http://127.0.0.1:8080/__qbot__/config', { method: 'GET' })
        .then(r => {
            if (r.ok) {
                ipcRenderer.send('island-open-url', 'http://127.0.0.1:8080/');
            } else {
                ipcRenderer.send('island-open-url', LMS_AI_REPO_URL);
            }
        })
        .catch(() => {
            ipcRenderer.send('island-open-url', LMS_AI_REPO_URL);
        });
});

document.getElementById('btn-save-ics').addEventListener('click', () => {
    const url = icsInputEl.value.trim();
    fetch(`${SERVER_URL}/__qbot__/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lmsCalendarIcsUrl: url })
    }).then(() => {
        btnSyncEl.click();
    }).catch(() => {});
});

document.getElementById('btn-recenter').addEventListener('click', () => {
    ipcRenderer.send('island-recenter');
});

const btnToggleAutoStartEl = document.getElementById('btn-toggle-autostart');
const autoStartLabelEl = document.getElementById('autostart-label');

function updateAutoStartButton(enabled) {
    if (!autoStartLabelEl || !btnToggleAutoStartEl) return;
    autoStartLabelEl.textContent = enabled ? 'ON' : 'OFF';
    btnToggleAutoStartEl.style.color = enabled ? '#38d36f' : 'rgba(255,255,255,0.65)';
    btnToggleAutoStartEl.style.borderColor = enabled ? 'rgba(56,211,111,0.45)' : 'rgba(255,255,255,0.12)';
}

if (btnToggleAutoStartEl) {
    btnToggleAutoStartEl.addEventListener('click', () => {
        ipcRenderer.send('island-toggle-autostart');
    });
}

ipcRenderer.on('autostart-state', (event, enabled) => {
    updateAutoStartButton(Boolean(enabled));
});

ipcRenderer.send('island-get-autostart');

const versionNameLabelEl = document.getElementById('version-name-label');
const versionCodeLabelEl = document.getElementById('version-code-label');
const btnCheckUpdateEl = document.getElementById('btn-check-update');
const updateLabelEl = document.getElementById('update-label');
let latestUpdateAvailable = false;

function updateVersionUI(info) {
    if (!info) return;
    const vCode = info.versionCode || 11;
    const vName = info.versionName || info.version || '1.0.1';
    if (versionNameLabelEl) versionNameLabelEl.textContent = vName;
    if (versionCodeLabelEl) versionCodeLabelEl.textContent = vCode;
}

ipcRenderer.on('version-info', (event, info) => {
    updateVersionUI(info);
});

ipcRenderer.send('island-get-version');

if (btnCheckUpdateEl) {
    btnCheckUpdateEl.addEventListener('click', () => {
        if (latestUpdateAvailable) {
            ipcRenderer.send('island-open-update');
        } else {
            if (updateLabelEl) updateLabelEl.textContent = 'Mengecek...';
            ipcRenderer.send('island-check-update', true);
        }
    });
}

ipcRenderer.on('update-status', (event, status) => {
    if (!status || !updateLabelEl || !btnCheckUpdateEl) return;
    if (status.currentVersionName || status.currentVersionCode) {
        updateVersionUI({
            versionName: status.currentVersionName,
            versionCode: status.currentVersionCode
        });
    }
    if (status.checking) {
        updateLabelEl.textContent = 'Mengecek update...';
        return;
    }
    latestUpdateAvailable = Boolean(status.hasUpdate);
    const vName = status.currentVersionName || status.currentVersion || '1.0.1';
    const vCode = status.currentVersionCode || 11;

    if (status.hasUpdate) {
        const latestVName = status.latestVersionName || status.latestVersion || '1.0.1';
        const latestVCode = status.latestVersionCode || (vCode + 1);
        updateLabelEl.textContent = `Update ${latestVName} (Kode: ${latestVCode}) Ada!`;
        btnCheckUpdateEl.style.color = '#38d36f';
        btnCheckUpdateEl.style.borderColor = 'rgba(56,211,111,0.55)';
        if (typeof triggerPeekPopup === 'function') {
            triggerPeekPopup({
                app: 'Ukikura Update',
                sender: `Update ${latestVName} (Kode: ${latestVCode}) Tersedia!`,
                message: status.changelog || 'Klik di Pengaturan untuk mengunduh versi terbaru dari GitHub.',
                isWhatsApp: false,
                isPhone: false
            });
        }
    } else {
        updateLabelEl.textContent = 'Versi Terbaru';
        btnCheckUpdateEl.style.color = 'rgba(255,255,255,0.75)';
        btnCheckUpdateEl.style.borderColor = 'rgba(255,255,255,0.14)';
        if (status.manualTrigger && lastSyncTextEl) {
            lastSyncTextEl.textContent = `Ukikura v${vName} (Kode: ${vCode}) sudah versi terbaru di GitHub`;
        }
    }
});

mnEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    ipcRenderer.send('island-context-menu');
});

// Loop Detak Jantung 1 Detik
setInterval(() => {
    if (focusModeActive && focusRemainingSec > 0) {
        focusRemainingSec--;
    }
    updateLiveMetrics();
}, 1000);

function applyServerData(data) {
    if (!data) return;
    allTasks = Array.isArray(data.tasks) ? data.tasks : [];
    lastUpdated = data.lastUpdated;
    if (lastUpdated) {
        const d = new Date(lastUpdated);
        lastSyncTextEl.textContent = `Sinkron: ${d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    } else {
        lastSyncTextEl.textContent = 'Terhubung ke server lokal';
    }
    updateLiveMetrics();
    renderTodoList();
    renderCalendar();
}

function fetchTasks() {
    fetch(`${SERVER_URL}/__qbot__/tasks`)
        .then(r => r.json())
        .then(applyServerData)
        .catch(() => {});
}

function loadConfig() {
    fetch(`${SERVER_URL}/__qbot__/config`)
        .then(r => r.json())
        .then(cfg => {
            if (cfg) {
                urgentThresholdHours = typeof cfg.urgentThresholdHours === 'number' ? cfg.urgentThresholdHours : 24;
                if (cfg.lmsCalendarIcsUrl) icsInputEl.value = cfg.lmsCalendarIcsUrl;
            }
        })
        .catch(() => {});
}

function connectStream() {
    const es = new EventSource(`${SERVER_URL}/__qbot__/tasks/stream`);
    es.onmessage = (ev) => {
        try {
            applyServerData(JSON.parse(ev.data));
        } catch (_) {}
    };
    es.onerror = () => {
        es.close();
        setTimeout(connectStream, 3000);
    };
}

