// ================= HALAMAN 5: NUSA SHELF + ISLAND GULP CANVAS GLOW =================
const shelfEl = document.getElementById('shelf');
const shelfCardsEl = document.getElementById('shelf-cards');
const shCv = document.getElementById('shCv');
const sc = shCv.getContext('2d');
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

function renderShelf() {
    shelfEl.classList.toggle('has', shelfItems.length > 0);
    shelfCardsEl.innerHTML = shelfItems.map((item, idx) => `
        <div class="sh-card" data-idx="${idx}" title="${escapeHtml(item.path || item.name)}">
            <span class="sh-thumb">
                <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </span>
            <span class="sh-name">${escapeHtml(item.name)}</span>
            <span class="sh-size">${escapeHtml(item.size)}</span>
        </div>
    `).join('');

    shelfCardsEl.querySelectorAll('.sh-card').forEach(card => {
        card.addEventListener('click', () => {
            const item = shelfItems[parseInt(card.getAttribute('data-idx'), 10)];
            if (item && item.path) shell.openPath(item.path);
        });
    });
}

window.addEventListener('dragover', (e) => {
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
        const kb = Math.max(1, Math.round((f.size || 0) / 1024));
        const sizeStr = kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`;
        shelfItems.push({ name: f.name, path: f.path, size: sizeStr });
    }
    renderShelf();
});

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

const btnToggleChannelEl = document.getElementById('btn-toggle-channel');
const channelNameLabelEl = document.getElementById('channel-name-label');
const btnCheckUpdateEl = document.getElementById('btn-check-update');
const updateLabelEl = document.getElementById('update-label');
let latestUpdateAvailable = false;
let currentChannel = 'public';

function updateChannelUI(info) {
    if (!info) return;
    currentChannel = (info.channel === 'debug') ? 'debug' : 'public';
    const fixCount = info.fixCount || 5;
    if (channelNameLabelEl) {
        channelNameLabelEl.textContent = (currentChannel === 'debug') ? `Debug (Fix #${fixCount})` : 'Publik';
    }
    if (btnToggleChannelEl) {
        if (currentChannel === 'debug') {
            btnToggleChannelEl.style.color = '#f59e0b';
            btnToggleChannelEl.style.borderColor = 'rgba(245,158,11,0.45)';
            btnToggleChannelEl.title = `Versi Debug aktif: menerima update kanal pengembang (Fix #${fixCount}). Klik untuk ganti ke Publik`;
        } else {
            btnToggleChannelEl.style.color = '#38bdf8';
            btnToggleChannelEl.style.borderColor = 'rgba(56,189,248,0.35)';
            btnToggleChannelEl.title = 'Versi Publik aktif: menerima update rilis stabil. Klik untuk ganti ke Debug';
        }
    }
}

if (btnToggleChannelEl) {
    btnToggleChannelEl.addEventListener('click', () => {
        const nextChannel = (currentChannel === 'debug') ? 'public' : 'debug';
        if (channelNameLabelEl) channelNameLabelEl.textContent = '...';
        ipcRenderer.send('island-set-channel', nextChannel);
    });
}

ipcRenderer.on('version-info', (event, info) => {
    updateChannelUI(info);
    if (info && updateLabelEl && !latestUpdateAvailable) {
        const isDebug = info.channel === 'debug';
        const display = info.displayVersion || (isDebug ? `v${info.version}-debug (Fix #${info.fixCount || 5})` : `v${info.version}`);
        updateLabelEl.textContent = `${display} · Cek Update`;
    }
});

ipcRenderer.send('island-get-version');

if (btnCheckUpdateEl) {
    btnCheckUpdateEl.addEventListener('click', () => {
        if (latestUpdateAvailable) {
            ipcRenderer.send('island-open-update');
        } else {
            const isDebug = currentChannel === 'debug';
            if (updateLabelEl) updateLabelEl.textContent = `Mengecek (${isDebug ? 'Debug' : 'Publik'})...`;
            ipcRenderer.send('island-check-update', true);
        }
    });
}

ipcRenderer.on('update-status', (event, status) => {
    if (!status || !updateLabelEl || !btnCheckUpdateEl) return;
    if (status.currentChannel) {
        updateChannelUI({ channel: status.currentChannel, fixCount: status.fixCount });
    }
    if (status.checking) {
        const isDebug = status.currentChannel === 'debug';
        updateLabelEl.textContent = `Mengecek (${isDebug ? `Debug Fix #${status.fixCount || 5}` : 'Publik'})...`;
        return;
    }
    latestUpdateAvailable = Boolean(status.hasUpdate);
    const isDebug = status.currentChannel === 'debug';
    const currentDisplay = status.displayVersion || (isDebug ? `v${status.currentVersion}-debug (Fix #${status.fixCount || 5})` : `v${status.currentVersion}`);

    if (status.hasUpdate) {
        const nextFixText = (isDebug && status.latestFixCount) ? `Fix #${status.latestFixCount}` : `v${status.latestVersion}`;
        updateLabelEl.textContent = `Update ${isDebug ? 'Debug ' + nextFixText : 'Publik v' + status.latestVersion} Ada!`;
        btnCheckUpdateEl.style.color = '#38d36f';
        btnCheckUpdateEl.style.borderColor = 'rgba(56,211,111,0.55)';
        if (typeof triggerPeekPopup === 'function') {
            triggerPeekPopup({
                app: `Ukikura (${isDebug ? 'Debug' : 'Publik'})`,
                sender: `Update ${nextFixText} Tersedia!`,
                message: status.changelog || 'Klik di Pengaturan untuk mengunduh versi terbaru dari GitHub.',
                isWhatsApp: false,
                isPhone: false
            });
        }
    } else {
        updateLabelEl.textContent = `${currentDisplay} · Terbaru`;
        btnCheckUpdateEl.style.color = 'rgba(255,255,255,0.75)';
        btnCheckUpdateEl.style.borderColor = 'rgba(255,255,255,0.14)';
        if (status.manualTrigger && lastSyncTextEl) {
            lastSyncTextEl.textContent = `Ukikura ${currentDisplay} sudah versi terbaru di GitHub`;
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

