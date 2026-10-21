let ipcRenderer, shell, webUtils;
if (typeof require !== 'undefined') {
    try {
        const electron = require('electron');
        ipcRenderer = electron.ipcRenderer;
        shell = electron.shell;
        webUtils = electron.webUtils;
    } catch (_) {}
}
if (!ipcRenderer) {
    ipcRenderer = {
        send: function(channel, ...args) {
            if (window.chrome && window.chrome.webview) {
                window.chrome.webview.postMessage({ channel: channel, args: args });
            }
        },
        invoke: async function(channel, ...args) {
            if (window.chrome && window.chrome.webview) {
                window.chrome.webview.postMessage({ channel: channel, args: args });
            }
            return null;
        },
        on: function(channel, listener) {
            window.addEventListener('ipc-' + channel, (e) => listener(e, e.detail));
        }
    };
    shell = {
        openExternal: function(url) {
            if (window.chrome && window.chrome.webview) {
                window.chrome.webview.postMessage({ channel: 'island-open-url', url: url });
            } else {
                window.open(url, '_blank');
            }
        }
    };
}

const SERVER_URL = 'http://127.0.0.1:8089';
const PAGES = ['music', 'notif', 'todo', 'cal', 'pomo', 'shelf', 'config'];
const PAGE_TITLES = {
    music: '<span>Now</span><span style="color:#5ec2ff">Playing</span>',
    lyrics: '<span>Synced</span><span style="color:#5ec2ff">Lyrics</span>',
    karaoke: '<span>Mini</span><span style="color:#5ec2ff">Karaoke</span>',
    notif: '<span>Phone</span><span style="color:#25d366">&amp; WA</span>',
    todo: '<span>LMS</span><span style="color:#38d36f">Tasks</span>',
    cal: '<span>Smart</span><span style="color:#38bdf8">Calendar</span>',
    pomo: '<span>Deadline</span><span style="color:#ff5a6e">Timer</span>',
    shelf: '<span>File</span><span style="color:#56c8ff">Shelf</span>',
    config: '<span>LMS</span><span style="color:#a78bfa">Sync</span>'
};

let allTasks = [];
let lastUpdated = null;
let urgentThresholdHours = 24;
var currentFilter = 'active';
var currentPage = 'todo';
var lyricsMode = false;
var closedStyle = 'pet'; // 'pet' | 'idle'
var isExpanded = false;
var isPinned = false;
var peekTimer = null;
var notifiedUrgentIds = new Set();
var notified5HourQuizIds = new Set();
try {
    const saved5h = JSON.parse(localStorage.getItem('ukikura_notified_5h_quizzes') || '[]');
    if (Array.isArray(saved5h)) {
        saved5h.forEach(id => notified5HourQuizIds.add(id));
    }
} catch (_) {}

// Live Media & Lyrics state
let mediaState = {
    active: false,
    status: 'Closed',
    title: '',
    artist: '',
    app: '',
    pos: 0,
    dur: 0,
    thumb: '',
    updatedAt: 0
};
let syncedLyrics = [];
let activeLyricIndex = -1;

// Live Notifications (WhatsApp + Phone Link)
let notificationsList = [];

// Pomodoro state opsional
let focusModeActive = false;
let focusRemainingSec = 25 * 60;

// Shelf files
let shelfItems = [];

var holderEl = document.getElementById('mnHolder');
var mnEl = document.getElementById('mn');
var hdrTitleEl = document.getElementById('hdr-title');
var petCountEl = document.getElementById('pet-count');
var idleArtEl = document.getElementById('idle-art');
var idleRingEl = document.getElementById('idle-ring');
var hdrRingEl = document.getElementById('hdr-ring');
var idleCenterEl = document.getElementById('idle-center');
var todoRatioEl = document.getElementById('todo-ratio');
var todoSubTextEl = document.getElementById('todo-sub-text');
var todoListEl = document.getElementById('todo-list');
var notifListEl = document.getElementById('notif-list');
var notifCountNumEl = document.getElementById('notif-count-num');
var pomoMainTimerEl = document.getElementById('pomo-main-timer');
var pomoTitleEl = document.getElementById('pomo-title');
var pomoCourseEl = document.getElementById('pomo-course');
var icsInputEl = document.getElementById('ics-input');
var lastSyncTextEl = document.getElementById('last-sync-text');
var btnSyncEl = document.getElementById('btn-sync');
var btnPinEl = document.getElementById('btn-pin');
var lyrListEl = document.getElementById('lyr-list');

const PLAY_SVG_PATH = '<path d="M8 5v14l11-7z"/>';
const PAUSE_SVG_PATH = '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>';

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getEffectiveState() {
    if (currentPage === 'karaoke') return 'karaoke';
    if (currentPage === 'music' && lyricsMode) return 'lyrics';
    return currentPage;
}

function setPage(page) {
    if (page === 'karaoke') {
        currentPage = 'karaoke';
        mnEl.dataset.s = 'karaoke';
        isExpanded = true;
        isPinned = true;
        if (btnPinEl) btnPinEl.classList.add('active');
        ipcRenderer.send('island-pin', true);
        if (typeof updateKaraokeOverlay === 'function') {
            updateKaraokeOverlay();
        }
        return;
    }
    if (!PAGES.includes(page)) return;
    currentPage = page;
    const eff = getEffectiveState();
    hdrTitleEl.innerHTML = PAGE_TITLES[eff] || PAGE_TITLES.todo;
    if (isExpanded) {
        mnEl.dataset.s = eff;
    }
    if (typeof startAmbientVisualizerIfNeeded === 'function') {
        startAmbientVisualizerIfNeeded();
    }
}

// Navigasi Panah & Dots khas Nusa
document.getElementById('btn-prev').addEventListener('click', (e) => {
    e.stopPropagation();
    const idx = (PAGES.indexOf(currentPage) - 1 + PAGES.length) % PAGES.length;
    setPage(PAGES[idx]);
});

document.getElementById('btn-next').addEventListener('click', (e) => {
    e.stopPropagation();
    const idx = (PAGES.indexOf(currentPage) + 1) % PAGES.length;
    setPage(PAGES[idx]);
});

document.querySelectorAll('.dots button').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setPage(btn.getAttribute('data-page'));
    });
});

// Toggle Lirik Melebar (520px)
document.getElementById('btn-open-lyrics').addEventListener('click', (e) => {
    e.stopPropagation();
    lyricsMode = true;
    setPage('music');
    if (syncedLyrics.length === 0 && mediaState.title) {
        ipcRenderer.send('island-request-lyrics', { title: mediaState.title, artist: mediaState.artist, dur: mediaState.dur });
        try {
            const reqTitle = mediaState.title;
            const fetchUrl = `${SERVER_URL}/__qbot__/lyrics?title=${encodeURIComponent(reqTitle)}&artist=${encodeURIComponent(mediaState.artist || '')}&dur=${encodeURIComponent(mediaState.dur || 0)}`;
            fetch(fetchUrl)
                .then(r => r.json())
                .then(payload => {
                    if (payload && payload.title === mediaState.title && Array.isArray(payload.lines) && payload.lines.length > 0) {
                        window.dispatchEvent(new CustomEvent('ipc-lyrics-update', { detail: payload }));
                    }
                })
                .catch(() => {});
        } catch (_) {}
    }
    scrollLyricsToActive();
});

document.getElementById('btn-close-lyrics').addEventListener('click', (e) => {
    e.stopPropagation();
    lyricsMode = false;
    setPage('music');
});

// Kontrol Musik (Play/Pause/Prev/Next)
let lastMediaCmdTime = 0;
document.querySelectorAll('[data-mcmd]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cmd = btn.getAttribute('data-mcmd');
        const now = Date.now();
        if ((cmd === 'PLAYPAUSE' || cmd === 'PLAY' || cmd === 'PAUSE') && (now - lastMediaCmdTime < 280)) {
            return;
        }
        lastMediaCmdTime = now;
        if (cmd === 'PLAYPAUSE' || cmd === 'PLAY' || cmd === 'PAUSE') {
            if (typeof mediaState !== 'undefined' && mediaState.active) {
                if (cmd === 'PLAYPAUSE') {
                    mediaState.status = (mediaState.status === 'Playing') ? 'Paused' : 'Playing';
                } else if (cmd === 'PAUSE') {
                    mediaState.status = 'Paused';
                } else if (cmd === 'PLAY') {
                    mediaState.status = 'Playing';
                }
                if (typeof renderMediaUI === 'function') renderMediaUI();
            }
        }
        ipcRenderer.send('media-control', cmd);
    });
});

// Fungsi pembuka & penutup kapsul yang dapat dipanggil lintas modul
function expandIsland(targetPage) {
    isExpanded = true;
    window.isExpanded = true;
    if (holderEl) holderEl.classList.add('is-expanded');
    if (targetPage && PAGES.includes(targetPage)) {
        currentPage = targetPage;
        window.currentPage = targetPage;
    }
    const eff = getEffectiveState();
    mnEl.dataset.s = eff;
    if (hdrTitleEl) hdrTitleEl.innerHTML = PAGE_TITLES[eff] || PAGE_TITLES.todo;
    ipcRenderer.send('island-resize', true);
}

function collapseIsland() {
    isExpanded = false;
    window.isExpanded = false;
    if (holderEl) holderEl.classList.remove('is-expanded');
    if (peekTimer) {
        clearTimeout(peekTimer);
        peekTimer = null;
    }
    mnEl.dataset.s = getClosedVisualMode();
    if (typeof window.ensureLivingEyesLoop === 'function') {
        window.ensureLivingEyesLoop();
    }
    ipcRenderer.send('island-resize', false);
}

window.expandIsland = expandIsland;
window.collapseIsland = collapseIsland;
window.setPage = setPage;

// Klik pada mode tertutup langsung membuka Dynamic Island
document.getElementById('l-pet').addEventListener('click', () => {
    if (mediaState.status === 'Playing' && currentPage === 'todo') {
        expandIsland('music');
    } else {
        expandIsland();
    }
});

document.getElementById('l-idle').addEventListener('click', () => {
    expandIsland();
});

document.getElementById('l-peek').addEventListener('click', (e) => {
    if (e && e.target && e.target.closest('#pk-reply-bar')) return;
    if (peekTimer) {
        clearTimeout(peekTimer);
        peekTimer = null;
    }
    mnEl.classList.remove('has-reply');
    isExpanded = true;
    if (window.lastPeekItem && window.lastPeekItem.isQuizAlarm) {
        setPage('todo');
    } else if (window.lastPeekItem && window.lastPeekItem.isClassAlarm) {
        setPage('calendar');
    } else {
        setPage('notif');
    }
    ipcRenderer.send('island-resize', true);
});

document.getElementById('btn-wa-quick').addEventListener('click', (e) => {
    e.stopPropagation();
    setPage('notif');
});

document.getElementById('btn-link-wa').addEventListener('click', (e) => {
    e.stopPropagation();
    ipcRenderer.send('island-open-wa');
});

document.getElementById('btn-link-phone').addEventListener('click', (e) => {
    e.stopPropagation();
    shell.openExternal('ms-phone:');
});

document.getElementById('btn-toggle-closed-style').addEventListener('click', () => {
    closedStyle = closedStyle === 'pet' ? 'idle' : 'pet';
    document.getElementById('closed-style-label').textContent = closedStyle === 'pet' ? 'Maskot' : 'Status Bar';
});

const btnMascotFpsEl = document.getElementById('btn-toggle-mascot-fps');
if (btnMascotFpsEl) {
    btnMascotFpsEl.addEventListener('click', () => {
        if (typeof cycleMascotFps === 'function') {
            cycleMascotFps();
        }
    });
}

// Pin / Sematkan tetap terbuka
btnPinEl.addEventListener('click', (e) => {
    e.stopPropagation();
    isPinned = !isPinned;
    btnPinEl.classList.toggle('active', isPinned);
    ipcRenderer.send('island-pin', isPinned);
});

icsInputEl.addEventListener('focus', () => {
    isPinned = true;
    btnPinEl.classList.add('active');
    ipcRenderer.send('island-pin', true);
});

document.getElementById('btn-tuck').addEventListener('click', (e) => {
    e.stopPropagation();
    isExpanded = false;
    isPinned = false;
    btnPinEl.classList.remove('active');
    mnEl.dataset.s = 'tucked';
    ipcRenderer.send('island-tuck', true);
});

mnEl.addEventListener('click', () => {
    if (mnEl.dataset.s === 'tucked') {
        ipcRenderer.send('island-tuck', false);
        mnEl.dataset.s = getClosedVisualMode();
    if (typeof window.ensureLivingEyesLoop === 'function') {
        window.ensureLivingEyesLoop();
    }
    }
});

function getClosedVisualMode() {
    if (peekTimer) return 'peek';
    if (mediaState.status === 'Playing') return 'idle';
    return closedStyle;
}

// Terima status hover/open otomatis dari proses utama Electron
ipcRenderer.on('nusa-state', (event, state) => {
    if (!state) return;
    if ((state.mode === 'passthrough' || state.mode === 'ghost') && !peekTimer) {
        holderEl.classList.add('ghost-passthrough');
    } else {
        holderEl.classList.remove('ghost-passthrough');
    }

    if (state.expanded) {
        if (peekTimer) {
            clearTimeout(peekTimer);
            peekTimer = null;
        }
        isExpanded = true;
        if (holderEl) holderEl.classList.add('is-expanded');
        const eff = getEffectiveState();
        hdrTitleEl.innerHTML = PAGE_TITLES[eff] || PAGE_TITLES.todo;
        mnEl.dataset.s = eff;
        if (typeof startAmbientVisualizerIfNeeded === 'function') {
            startAmbientVisualizerIfNeeded();
        }
    } else {
        isExpanded = false;
        isPinned = false;
        if (holderEl) holderEl.classList.remove('is-expanded');
        btnPinEl.classList.remove('active');
        if (mnEl.dataset.s !== 'tucked') {
            mnEl.dataset.s = getClosedVisualMode();
    if (typeof window.ensureLivingEyesLoop === 'function') {
        window.ensureLivingEyesLoop();
    }
        }
    }
});

// Deteksi otomatis saat browser (Brave, Chrome, Edge) dalam mode fullscreen / maximized
ipcRenderer.on('window-state', (event, state) => {
    if (!state || !holderEl) return;
    if (state.browserMaximized) {
        holderEl.classList.add('browser-maximized');
    } else {
        holderEl.classList.remove('browser-maximized');
    }
});

ipcRenderer.on('toggle-tuck', () => {
    if (mnEl.dataset.s === 'tucked') {
        ipcRenderer.send('island-tuck', false);
        mnEl.dataset.s = getClosedVisualMode();
    if (typeof window.ensureLivingEyesLoop === 'function') {
        window.ensureLivingEyesLoop();
    }
    } else {
        isExpanded = false;
        mnEl.dataset.s = 'tucked';
        ipcRenderer.send('island-tuck', true);
    }
});

ipcRenderer.on('sync-status', () => {
    btnSyncEl.classList.remove('spinning');
    fetchTasks();
});

