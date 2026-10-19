const { ipcRenderer, shell } = require('electron');

const SERVER_URL = 'http://127.0.0.1:8089';
const PAGES = ['music', 'notif', 'todo', 'cal', 'pomo', 'shelf', 'config'];
const PAGE_TITLES = {
    music: '<span>Now</span><span style="color:#5ec2ff">Playing</span>',
    lyrics: '<span>Synced</span><span style="color:#5ec2ff">Lyrics</span>',
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
let currentFilter = 'active';
let currentPage = 'todo';
let lyricsMode = false;
let closedStyle = 'pet'; // 'pet' | 'idle'
let isExpanded = false;
let isPinned = false;
let peekTimer = null;
let notifiedUrgentIds = new Set();

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

const holderEl = document.getElementById('mnHolder');
const mnEl = document.getElementById('mn');
const hdrTitleEl = document.getElementById('hdr-title');
const petCountEl = document.getElementById('pet-count');
const idleArtEl = document.getElementById('idle-art');
const idleRingEl = document.getElementById('idle-ring');
const hdrRingEl = document.getElementById('hdr-ring');
const idleCenterEl = document.getElementById('idle-center');
const todoRatioEl = document.getElementById('todo-ratio');
const todoSubTextEl = document.getElementById('todo-sub-text');
const todoListEl = document.getElementById('todo-list');
const notifListEl = document.getElementById('notif-list');
const notifCountNumEl = document.getElementById('notif-count-num');
const pomoMainTimerEl = document.getElementById('pomo-main-timer');
const pomoTitleEl = document.getElementById('pomo-title');
const pomoCourseEl = document.getElementById('pomo-course');
const icsInputEl = document.getElementById('ics-input');
const lastSyncTextEl = document.getElementById('last-sync-text');
const btnSyncEl = document.getElementById('btn-sync');
const btnPinEl = document.getElementById('btn-pin');
const lyrListEl = document.getElementById('lyr-list');

const PLAY_SVG_PATH = '<path d="M8 5v14l11-7z"/>';
const PAUSE_SVG_PATH = '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>';

function getEffectiveState() {
    if (currentPage === 'music' && lyricsMode) return 'lyrics';
    return currentPage;
}

function setPage(page) {
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
    }
    scrollLyricsToActive();
});

document.getElementById('btn-close-lyrics').addEventListener('click', (e) => {
    e.stopPropagation();
    lyricsMode = false;
    setPage('music');
});

// Kontrol Musik (Play/Pause/Prev/Next)
document.querySelectorAll('[data-mcmd]').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const cmd = btn.getAttribute('data-mcmd');
        ipcRenderer.send('media-control', cmd);
    });
});

// Klik pada mode tertutup langsung membuka Dynamic Island
document.getElementById('l-pet').addEventListener('click', () => {
    isExpanded = true;
    if (mediaState.status === 'Playing' && currentPage === 'todo') {
        currentPage = 'music';
    }
    mnEl.dataset.s = getEffectiveState();
    hdrTitleEl.innerHTML = PAGE_TITLES[getEffectiveState()];
    ipcRenderer.send('island-resize', true);
});

document.getElementById('l-idle').addEventListener('click', () => {
    isExpanded = true;
    mnEl.dataset.s = getEffectiveState();
    hdrTitleEl.innerHTML = PAGE_TITLES[getEffectiveState()];
    ipcRenderer.send('island-resize', true);
});

document.getElementById('l-peek').addEventListener('click', () => {
    if (peekTimer) {
        clearTimeout(peekTimer);
        peekTimer = null;
    }
    isExpanded = true;
    setPage('notif');
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
    if (state.mode === 'passthrough' && !peekTimer) {
        holderEl.classList.add('passthrough');
    } else {
        holderEl.classList.remove('passthrough');
    }

    if (state.expanded) {
        if (peekTimer) {
            clearTimeout(peekTimer);
            peekTimer = null;
        }
        isExpanded = true;
        const eff = getEffectiveState();
        hdrTitleEl.innerHTML = PAGE_TITLES[eff] || PAGE_TITLES.todo;
        mnEl.dataset.s = eff;
    } else {
        isExpanded = false;
        isPinned = false;
        btnPinEl.classList.remove('active');
        if (mnEl.dataset.s !== 'tucked') {
            mnEl.dataset.s = getClosedVisualMode();
        }
    }
});

ipcRenderer.on('toggle-tuck', () => {
    if (mnEl.dataset.s === 'tucked') {
        ipcRenderer.send('island-tuck', false);
        mnEl.dataset.s = getClosedVisualMode();
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

