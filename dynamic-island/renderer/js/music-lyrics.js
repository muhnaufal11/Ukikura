// ================= DETEKSI MUSIK LIVE & LIRIK =================
function formatMediaTime(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function cleanAppName(rawApp) {
    const a = String(rawApp || '').toLowerCase();
    if (a.includes('spotify')) return 'Spotify';
    if (a.includes('brave')) return 'Brave Audio';
    if (a.includes('chrome')) return 'Chrome Audio';
    if (a.includes('msedge') || a.includes('edge')) return 'Edge Audio';
    if (a.includes('applemusic') || a.includes('itunes')) return 'Apple Music';
    if (a.includes('vlc')) return 'VLC Media';
    return rawApp ? rawApp.replace(/\.exe$/i, '') : 'Windows Media';
}

function renderMediaUI() {
    const isPlaying = mediaState.active && mediaState.status === 'Playing';
    mnEl.classList.toggle('playing', isPlaying);

    const title = mediaState.title || 'Putar Musik di PC / Browser';
    const artist = mediaState.artist || 'Spotify, YouTube, Brave, Chrome, Apple Music';
    const appLabel = cleanAppName(mediaState.app);

    document.getElementById('music-app-1').textContent = appLabel;
    document.getElementById('music-title-1').textContent = title;
    document.getElementById('music-artist-1').textContent = artist;
    document.getElementById('music-title-2').textContent = title;
    document.getElementById('music-artist-2').textContent = artist;

    document.getElementById('play-icon-1').innerHTML = isPlaying ? PAUSE_SVG_PATH : PLAY_SVG_PATH;
    document.getElementById('play-icon-2').innerHTML = isPlaying ? PAUSE_SVG_PATH : PLAY_SVG_PATH;

    const art1 = document.getElementById('music-art-1');
    const art2 = document.getElementById('music-art-2');
    const hasRealSmtcThumb = mediaState.thumb && !mediaState.isAppIcon;
    let bg = '';
    if (hasRealSmtcThumb) {
        bg = `url("data:image/jpeg;base64,${mediaState.thumb}")`;
        art1.style.backgroundImage = bg;
        art2.style.backgroundImage = bg;
        idleArtEl.style.backgroundImage = bg;
        idleArtEl.classList.add('has-art');
    } else if (lyricCoverUrl) {
        bg = `url("${lyricCoverUrl}")`;
        art1.style.backgroundImage = bg;
        art2.style.backgroundImage = bg;
        idleArtEl.style.backgroundImage = bg;
        idleArtEl.classList.add('has-art');
    } else if (mediaState.thumb) {
        bg = `url("data:image/jpeg;base64,${mediaState.thumb}")`;
        art1.style.backgroundImage = bg;
        art2.style.backgroundImage = bg;
        idleArtEl.style.backgroundImage = bg;
        idleArtEl.classList.add('has-art');
    } else {
        art1.style.backgroundImage = '';
        art2.style.backgroundImage = '';
        idleArtEl.style.backgroundImage = '';
        idleArtEl.classList.remove('has-art');
    }

    // Set background ambient aura mengikuti sampul video/lagu
    const ambientEls = document.querySelectorAll('.l-music .ambient, .l-lyrics .ambient');
    ambientEls.forEach(el => {
        if (bg) {
            el.style.backgroundImage = bg;
        } else {
            el.style.backgroundImage = '';
        }
    });
    if (bg) {
        updateCoverDominantColor(bg);
    }

    updateMediaProgressUI();
}

let lyricTrackDuration = 0;
let lyricTimeOffset = 0;
let lyricCoverUrl = '';

function updateLyricOffsetLabel() {
    const lbl = document.getElementById('lyr-offset-label');
    if (!lbl) return;
    if (Math.abs(lyricTimeOffset) < 0.05) {
        lbl.textContent = 'SYNC';
        lbl.style.color = 'rgba(94,194,255,.85)';
    } else {
        const sign = lyricTimeOffset > 0 ? '+' : '';
        lbl.textContent = `${sign}${lyricTimeOffset.toFixed(1)}s`;
        lbl.style.color = '#38d36f';
    }
}

function getBaseLyricLoopPeriod() {
    const isExplicitLoop = /\b(1\s*hour|loop|extended)\b/i.test(String(mediaState.title || ''));
    if (!isExplicitLoop) return 0;
    const lastLyricTime = syncedLyrics.length > 0 ? (syncedLyrics[syncedLyrics.length - 1].time || 0) : 0;
    if (lyricTrackDuration > 30) return lyricTrackDuration;
    if (lastLyricTime > 30) return lastLyricTime + 6;
    return 0;
}

function getInterpolatedMediaPos() {
    const dur = mediaState.dur || 0;
    let pos = mediaState.pos || 0;
    if (mediaState.active && mediaState.status === 'Playing') {
        if (mediaState.lastUpdatedMs > 0 && typeof mediaState.basePos === 'number') {
            const elapsed = (Date.now() - mediaState.lastUpdatedMs) / 1000;
            if (elapsed >= 0 && elapsed < 36000) {
                pos = mediaState.basePos + elapsed;
            }
        } else if (mediaState.updatedAt) {
            pos += (Date.now() - mediaState.updatedAt) / 1000;
        }
    }
    if (dur > 0 && pos > dur) pos = dur;
    return pos;
}

function renderLyricItemHtml(l, i) {
    if (l && l.roma && l.jp) {
        return `<li data-lidx="${i}" style="cursor:pointer"><div>${escapeHtml(l.roma)}</div><div style="font-size:10.2px;font-weight:500;opacity:0.72;margin-top:1px">${escapeHtml(l.jp)}</div></li>`;
    }
    const txt = String((l && l.text) || '');
    if (txt.includes(' · ')) {
        const parts = txt.split(' · ');
        return `<li data-lidx="${i}" style="cursor:pointer"><div>${escapeHtml(parts[0])}</div><div style="font-size:10.2px;font-weight:500;opacity:0.72;margin-top:1px">${escapeHtml(parts.slice(1).join(' · '))}</div></li>`;
    }
    return `<li data-lidx="${i}" style="cursor:pointer">${escapeHtml(txt)}</li>`;
}

let isSeekingGlobal = false;

function updateMediaProgressUI() {
    if (isSeekingGlobal) return;
    const pos = getInterpolatedMediaPos();
    const dur = mediaState.dur || 0;

    const pct = dur > 0 ? Math.min(100, Math.max(0, (pos / dur) * 100)) : (mediaState.status === 'Playing' ? 68 : 0);
    const rem = dur > 0 ? Math.max(0, dur - pos) : 0;

    document.getElementById('music-pos-1').textContent = formatMediaTime(pos);
    document.getElementById('music-rem-1').textContent = `-${formatMediaTime(rem)}`;
    document.getElementById('music-prog-1').style.width = `${pct.toFixed(1)}%`;

    document.getElementById('music-pos-2').textContent = formatMediaTime(pos);
    document.getElementById('music-rem-2').textContent = `-${formatMediaTime(rem)}`;
    document.getElementById('music-prog-2').style.width = `${pct.toFixed(1)}%`;

    if (syncedLyrics.length > 0) {
        const basePeriod = getBaseLyricLoopPeriod();
        let rawLoopPos = pos;
        if (basePeriod > 30 && pos >= basePeriod) {
            rawLoopPos = pos % basePeriod;
        }
        let effectivePos = rawLoopPos + lyricTimeOffset + 0.18;
        if (basePeriod > 30 && pos >= basePeriod) {
            effectivePos = ((effectivePos % basePeriod) + basePeriod) % basePeriod;
        }
        let idx = 0;
        for (let i = 0; i < syncedLyrics.length; i++) {
            if (effectivePos >= syncedLyrics[i].time) idx = i;
            else break;
        }
        if (idx !== activeLyricIndex) {
            activeLyricIndex = idx;
            scrollLyricsToActive();
        }
    }
}

function scrollLyricsToActive() {
    const items = lyrListEl.querySelectorAll('li');
    if (!items.length) return;
    const targetIdx = Math.max(0, Math.min(items.length - 1, activeLyricIndex >= 0 ? activeLyricIndex : 0));
    items.forEach((li, i) => li.classList.toggle('on', i === targetIdx));
    const activeLi = items[targetIdx];
    if (activeLi) {
        const offset = 52 - activeLi.offsetTop - activeLi.offsetHeight / 2;
        lyrListEl.style.transform = `translateY(${offset}px)`;
    }
}

// Klik pada baris lirik mana saja untuk langsung menyinkronkan waktu ke baris tersebut (klik ganda untuk reset ke 0s)
lyrListEl.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-lidx]');
    if (!li || !syncedLyrics.length) return;
    e.stopPropagation();
    const idx = parseInt(li.getAttribute('data-lidx'), 10);
    if (isNaN(idx) || !syncedLyrics[idx]) return;
    const pos = getInterpolatedMediaPos();
    const basePeriod = getBaseLyricLoopPeriod();
    const rawLoopPos = (basePeriod > 30 && pos >= basePeriod) ? (pos % basePeriod) : pos;
    lyricTimeOffset = syncedLyrics[idx].time - rawLoopPos - 0.18;
    activeLyricIndex = idx;
    scrollLyricsToActive();
    updateLyricOffsetLabel();
});

lyrListEl.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    lyricTimeOffset = 0;
    updateLyricOffsetLabel();
    updateMediaProgressUI();
});

lyrListEl.addEventListener('wheel', (e) => {
    if (!syncedLyrics.length) return;
    e.preventDefault();
    e.stopPropagation();
    lyricTimeOffset += (e.deltaY > 0 ? 0.15 : -0.15);
    updateLyricOffsetLabel();
    updateMediaProgressUI();
}, { passive: false });

setInterval(() => {
    if (mediaState.active && mediaState.status === 'Playing') {
        updateMediaProgressUI();
    }
}, 50);

ipcRenderer.on('media-update', (event, msg) => {
    if (!msg) return;
    const wasPlaying = mediaState.status === 'Playing';
    const isNowPlaying = msg.active && msg.status === 'Playing';
    const trackChanged = msg.title !== mediaState.title;

    mediaState = {
        active: Boolean(msg.active),
        status: msg.status || 'Closed',
        title: msg.title || '',
        artist: msg.artist || '',
        app: msg.app || '',
        pos: Number(msg.pos) || 0,
        basePos: typeof msg.basePos === 'number' ? msg.basePos : (Number(msg.pos) || 0),
        lastUpdatedMs: Number(msg.lastUpdatedMs) || 0,
        dur: Number(msg.dur) || 0,
        volume: typeof msg.volume === 'number' ? msg.volume : null,
        thumb: msg.thumb || (trackChanged ? '' : mediaState.thumb),
        isAppIcon: Boolean(msg.isAppIcon),
        updatedAt: Date.now()
    };

    if (typeof msg.volume === 'number' && msg.volume >= 0) {
        currentVolume = msg.volume;
    }

    if (trackChanged && mediaState.title) {
        syncedLyrics = [];
        lyricTrackDuration = 0;
        lyricTimeOffset = 0;
        lyricCoverUrl = '';
        activeLyricIndex = 0;
        lyrListEl.innerHTML = `<li class="on">${escapeHtml(mediaState.title)}</li><li>${escapeHtml(mediaState.artist || 'Memuat lirik & forced alignment...')}</li>`;
        lyrListEl.style.transform = 'translateY(0px)';
        ipcRenderer.send('island-request-lyrics', { title: mediaState.title, artist: mediaState.artist, dur: mediaState.dur });
    }

    // Jika musik baru mulai berputar, otomatis tampilkan halaman musik / status bar musik
    if (!wasPlaying && isNowPlaying) {
        currentPage = 'music';
        if (!isExpanded && mnEl.dataset.s !== 'tucked' && !peekTimer) {
            mnEl.dataset.s = 'idle';
        } else if (isExpanded) {
            setPage('music');
        }
    } else if (wasPlaying && !isNowPlaying && !isExpanded && mnEl.dataset.s === 'idle' && closedStyle === 'pet') {
        mnEl.dataset.s = 'pet';
    }

    renderMediaUI();
    updateLiveMetrics();
    startAmbientVisualizerIfNeeded();
});

ipcRenderer.on('lyrics-update', (event, payload) => {
    if (!payload || payload.title !== mediaState.title) return;
    if (payload.coverUrl) {
        lyricCoverUrl = payload.coverUrl;
        renderMediaUI();
    }
    if (Array.isArray(payload.lines) && payload.lines.length > 0) {
        syncedLyrics = payload.lines;
        lyricTrackDuration = Number(payload.trackDuration) || 0;
        lyrListEl.innerHTML = syncedLyrics.map((l, i) => renderLyricItemHtml(l, i)).join('');
        if (typeof payload.matchedIndex === 'number' && syncedLyrics[payload.matchedIndex]) {
            const pos = getInterpolatedMediaPos();
            const basePeriod = getBaseLyricLoopPeriod();
            const rawLoopPos = (basePeriod > 30 && pos >= basePeriod) ? (pos % basePeriod) : pos;
            lyricTimeOffset = syncedLyrics[payload.matchedIndex].time - rawLoopPos;
            activeLyricIndex = payload.matchedIndex;
            scrollLyricsToActive();
        } else {
            activeLyricIndex = -1;
            updateMediaProgressUI();
        }
    } else {
        syncedLyrics = [];
        lyricTrackDuration = 0;
        lyrListEl.innerHTML = `
            <li class="on">${escapeHtml(mediaState.title)}</li>
            <li>${escapeHtml(mediaState.artist)}</li>
            <li>Audio Live Aktif</li>
        `;
    }
});

// ================= INTERACTIVE SEEK BAR & VOLUME WHEEL =================
function initInteractiveProgressBar(fillId, posId, remId) {
    const fillEl = document.getElementById(fillId);
    if (!fillEl) return;
    const containerEl = fillEl.parentElement;
    if (!containerEl) return;
    const posEl = document.getElementById(posId);
    const remEl = document.getElementById(remId);

    const tooltip = document.createElement('div');
    tooltip.className = 'seek-tooltip';
    containerEl.appendChild(tooltip);

    function calcRatio(e) {
        const rect = containerEl.getBoundingClientRect();
        if (rect.width <= 0) return 0;
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        return x / rect.width;
    }

    function updatePreview(ratio) {
        const totalDur = (mediaState.dur > 0) ? mediaState.dur : (lyricTrackDuration > 0 ? lyricTrackDuration : 0);
        const previewSec = ratio * totalDur;
        fillEl.style.width = `${(ratio * 100).toFixed(1)}%`;
        if (posEl) posEl.textContent = formatMediaTime(previewSec);
        if (remEl) remEl.textContent = `-${formatMediaTime(Math.max(0, totalDur - previewSec))}`;

        const rect = containerEl.getBoundingClientRect();
        const x = Math.max(0, Math.min(rect.width, ratio * rect.width));
        tooltip.style.left = `${x}px`;
        tooltip.textContent = formatMediaTime(previewSec);
        tooltip.classList.add('active');
    }

    containerEl.addEventListener('mouseenter', () => {
        const totalDur = (mediaState.dur > 0) ? mediaState.dur : (lyricTrackDuration > 0 ? lyricTrackDuration : 0);
        if (totalDur > 0) tooltip.classList.add('active');
    });

    containerEl.addEventListener('mouseleave', () => {
        if (!isSeekingGlobal) tooltip.classList.remove('active');
    });

    containerEl.addEventListener('mousemove', (e) => {
        const totalDur = (mediaState.dur > 0) ? mediaState.dur : (lyricTrackDuration > 0 ? lyricTrackDuration : 0);
        if (totalDur > 0 && !isSeekingGlobal) {
            const ratio = calcRatio(e);
            const previewSec = ratio * totalDur;
            const rect = containerEl.getBoundingClientRect();
            const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            tooltip.style.left = `${x}px`;
            tooltip.textContent = formatMediaTime(previewSec);
        }
    });

    containerEl.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    containerEl.addEventListener('mousedown', (e) => {
        const totalDur = (mediaState.dur > 0) ? mediaState.dur : (lyricTrackDuration > 0 ? lyricTrackDuration : 0);
        if (!totalDur || totalDur <= 0) return;
        e.preventDefault();
        e.stopPropagation();
        isSeekingGlobal = true;
        containerEl.classList.add('seeking');
        const ratio = calcRatio(e);
        updatePreview(ratio);

        function onMouseMove(ev) {
            if (!isSeekingGlobal) return;
            ev.preventDefault();
            const r = calcRatio(ev);
            updatePreview(r);
        }

        function onMouseUp(ev) {
            if (!isSeekingGlobal) return;
            isSeekingGlobal = false;
            containerEl.classList.remove('seeking');
            tooltip.classList.remove('active');
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            const totalDur = (mediaState.dur > 0) ? mediaState.dur : (lyricTrackDuration > 0 ? lyricTrackDuration : 0);
            const finalRatio = calcRatio(ev);
            const targetSec = Math.max(0, Math.min(totalDur, finalRatio * totalDur));

            mediaState.pos = targetSec;
            mediaState.basePos = targetSec;
            mediaState.lastUpdatedMs = Date.now();
            mediaState.updatedAt = Date.now();
            updateMediaProgressUI();

            ipcRenderer.send('media-seek', targetSec);

            if (syncedLyrics.length > 0) {
                let idx = 0;
                for (let i = 0; i < syncedLyrics.length; i++) {
                    if (targetSec >= syncedLyrics[i].time) idx = i;
                    else break;
                }
                activeLyricIndex = idx;
                scrollLyricsToActive();
            }
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });
}

let currentVolume = 50;
let isMuted = false;
let volHudTimer = null;

function getVolumeIconSvg(vol, muted) {
    if (muted || vol === 0) {
        return '<path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15" stroke="currentColor" stroke-width="2"/><line x1="17" y1="9" x2="23" y2="15" stroke="currentColor" stroke-width="2"/>';
    }
    if (vol < 35) {
        return '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
    }
    if (vol < 70) {
        return '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>';
    }
    return '<path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
}

function ensureVolumeHud(artEl) {
    if (!artEl) return null;
    let hud = artEl.querySelector('.art-vol-hud');
    if (!hud) {
        hud = document.createElement('div');
        hud.className = 'art-vol-hud';
        hud.innerHTML = `
            <svg viewBox="0 0 24 24"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>
            <span class="art-vol-text">50%</span>
            <div class="art-vol-bar"><div class="art-vol-fill" style="width:50%"></div></div>
        `;
        artEl.appendChild(hud);
    }
    return hud;
}

function applyVolumeUI(vol, muted = false, showHUD = false) {
    const safeVol = Math.max(0, Math.min(100, Math.round(vol)));
    const iconSvg = getVolumeIconSvg(safeVol, muted);

    ['vol-fill-1', 'vol-fill-2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.width = muted ? '0%' : `${safeVol}%`;
    });

    ['vol-svg-1', 'vol-svg-2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = iconSvg;
    });

    ['vol-group-1', 'vol-group-2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.toggle('muted', Boolean(muted));
            el.title = `Volume: ${safeVol}% ${muted ? '(Muted)' : ''} - Klik untuk mute, drag/scroll untuk ubah`;
        }
    });

    ['btn-vol-1', 'btn-vol-2'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('muted', Boolean(muted));
    });

    if (showHUD) {
        showVolumeHUD(safeVol, muted, true);
    }
}

function showVolumeHUD(vol, muted = false, resetTimer = true) {
    const artIds = ['music-art-1', 'music-art-2'];
    const safeVol = Math.max(0, Math.min(100, Math.round(vol)));
    const iconSvg = getVolumeIconSvg(safeVol, muted);

    artIds.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        const hud = ensureVolumeHud(el);
        if (!hud) return;
        const svg = hud.querySelector('svg');
        if (svg) svg.innerHTML = iconSvg;
        const txt = hud.querySelector('.art-vol-text');
        if (txt) txt.textContent = muted ? 'MUTE' : `${safeVol}%`;
        const fill = hud.querySelector('.art-vol-fill');
        if (fill) fill.style.width = muted ? '0%' : `${safeVol}%`;
        hud.classList.add('active');
    });

    if (resetTimer) {
        if (volHudTimer) clearTimeout(volHudTimer);
        volHudTimer = setTimeout(() => {
            document.querySelectorAll('.art-vol-hud').forEach(h => h.classList.remove('active'));
            volHudTimer = null;
        }, 1100);
    }
}

function initVolumeSlider(trackId, fillId) {
    const trackEl = document.getElementById(trackId);
    if (!trackEl) return;

    function calcRatio(e) {
        const rect = trackEl.getBoundingClientRect();
        if (rect.width <= 0) return 0;
        const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
        return Math.max(0, Math.min(1, x / rect.width));
    }

    function setFromRatio(ratio) {
        const pct = Math.round(ratio * 100);
        currentVolume = pct;
        isMuted = false;
        applyVolumeUI(currentVolume, isMuted, true);
        ipcRenderer.send('volume-set', pct);
    }

    trackEl.addEventListener('click', (e) => {
        e.stopPropagation();
        setFromRatio(calcRatio(e));
    });

    trackEl.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const step = e.shiftKey ? 1 : 3;
        const delta = e.deltaY < 0 ? step : -step;
        currentVolume = Math.max(0, Math.min(100, currentVolume + delta));
        isMuted = false;
        applyVolumeUI(currentVolume, isMuted, true);
        ipcRenderer.send('volume-set', currentVolume);
    }, { passive: false });

    trackEl.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        trackEl.classList.add('seeking');
        setFromRatio(calcRatio(e));

        function onMouseMove(ev) {
            ev.preventDefault();
            setFromRatio(calcRatio(ev));
        }

        function onMouseUp(ev) {
            trackEl.classList.remove('seeking');
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        }

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });
}

function setupVolumeButton(btnId) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        isMuted = !isMuted;
        applyVolumeUI(currentVolume, isMuted, true);
        ipcRenderer.send('volume-mute');
    });
}

function setupAreaVolumeWheel(targetEl, ignoreSelector = null) {
    if (!targetEl) return;
    targetEl.addEventListener('wheel', (e) => {
        if (ignoreSelector && e.target.closest(ignoreSelector)) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        const step = e.shiftKey ? 0.01 : 0.03;
        const delta = e.deltaY < 0 ? step : -step;
        currentVolume = Math.max(0, Math.min(100, Math.round(currentVolume + (delta * 100))));
        isMuted = false;
        applyVolumeUI(currentVolume, isMuted, true);
        ipcRenderer.send('volume-change', { delta });
    }, { passive: false });
}

ipcRenderer.on('volume-update', (event, data) => {
    if (data && typeof data.level === 'number') {
        currentVolume = data.level;
        if (typeof data.muted === 'boolean') {
            isMuted = data.muted;
        }
        applyVolumeUI(currentVolume, isMuted, Boolean(volHudTimer));
    }
});

// Inisialisasi Seek Bar & Volume Controls
initInteractiveProgressBar('music-prog-1', 'music-pos-1', 'music-rem-1');
initInteractiveProgressBar('music-prog-2', 'music-pos-2', 'music-rem-2');

initVolumeSlider('vol-track-1', 'vol-fill-1');
initVolumeSlider('vol-track-2', 'vol-fill-2');
setupVolumeButton('btn-vol-1');
setupVolumeButton('btn-vol-2');

setupAreaVolumeWheel(document.querySelector('.l-music'));
setupAreaVolumeWheel(document.querySelector('.l-lyrics'), '#lyr-list, .lyr');
setupAreaVolumeWheel(document.getElementById('music-art-1'));
setupAreaVolumeWheel(document.getElementById('music-art-2'));

// Minta volume awal Windows
ipcRenderer.send('volume-get');

// ==================== VISUALIZER AURA AMBIENT REAL-TIME (WASAPI LOOPBACK) ====================
let audioVisualizerCtx = null;
let audioVisualizerStream = null;
let audioVisualizerAnalyser = null;
let audioVisualizerData = null;
let visualizerAnimId = null;
let visualizerInitializing = false;
let smoothBass = 0;
let smoothMid = 0;
let smoothTreb = 0;

async function initDesktopAudioVisualizer() {
    if (audioVisualizerStream && audioVisualizerAnalyser) return true;
    if (visualizerInitializing) return false;
    visualizerInitializing = true;
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            audio: true,
            video: true
        });

        stream.getVideoTracks().forEach(t => t.stop());
        audioVisualizerStream = stream;

        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioVisualizerCtx = new AudioContextClass();
        if (audioVisualizerCtx.state === 'suspended') {
            await audioVisualizerCtx.resume();
        }
        const srcNode = audioVisualizerCtx.createMediaStreamSource(stream);
        audioVisualizerAnalyser = audioVisualizerCtx.createAnalyser();
        audioVisualizerAnalyser.fftSize = 64; // 32 frequency bins
        audioVisualizerAnalyser.smoothingTimeConstant = 0.6;
        srcNode.connect(audioVisualizerAnalyser); // Jangan connect ke destination agar tidak echo

        audioVisualizerData = new Uint8Array(audioVisualizerAnalyser.frequencyBinCount);
        visualizerInitializing = false;
        return true;
    } catch (_) {
        visualizerInitializing = false;
        return false;
    }
}

function updateAmbientVisualizer() {
    const isPlaying = mediaState.active && mediaState.status === 'Playing';
    const isMusicOrLyrics = (typeof currentPage !== 'undefined') && (currentPage === 'music' || currentPage === 'lyrics');

    if (!isPlaying || !isMusicOrLyrics) {
        // Peluruhan halus saat musik dijeda atau keluar halaman
        smoothBass *= 0.82;
        smoothMid *= 0.82;
        smoothTreb *= 0.82;
        applyAmbientToDOM(smoothBass, smoothMid, smoothTreb);

        if (smoothBass < 0.005 && smoothMid < 0.005 && smoothTreb < 0.005) {
            smoothBass = 0;
            smoothMid = 0;
            smoothTreb = 0;
            applyAmbientToDOM(0, 0, 0);
            visualizerAnimId = null;
            return;
        }
        visualizerAnimId = requestAnimationFrame(updateAmbientVisualizer);
        return;
    }

    if (audioVisualizerAnalyser && audioVisualizerData) {
        audioVisualizerAnalyser.getByteFrequencyData(audioVisualizerData);

        // Ekstrak 3 pita energi utama dari spektrum audio Windows:
        // 1. Bass / Kick Drum (Bins 1 - 3: ~30Hz - 200Hz)
        let bassSum = 0;
        for (let i = 1; i <= 3; i++) bassSum += audioVisualizerData[i] || 0;
        const targetBass = Math.min(1, (bassSum / (3 * 255)) * 1.4);

        // 2. Vokal & Melodi (Bins 4 - 10: ~250Hz - 1500Hz)
        let midSum = 0;
        for (let i = 4; i <= 10; i++) midSum += audioVisualizerData[i] || 0;
        const targetMid = Math.min(1, (midSum / (7 * 255)) * 1.25);

        // 3. Treble / Kemilau Simbal (Bins 11 - 22: ~1600Hz - 8000Hz)
        let trebSum = 0;
        for (let i = 11; i <= 22; i++) trebSum += audioVisualizerData[i] || 0;
        const targetTreb = Math.min(1, (trebSum / (12 * 255)) * 1.2);

        // Exponential smoothing: responsif saat beat menghentak, halus saat melemah
        smoothBass += (targetBass - smoothBass) * (targetBass > smoothBass ? 0.36 : 0.12);
        smoothMid += (targetMid - smoothMid) * (targetMid > smoothMid ? 0.30 : 0.10);
        smoothTreb += (targetTreb - smoothTreb) * (targetTreb > smoothTreb ? 0.28 : 0.10);
    } else {
        smoothBass *= 0.88;
        smoothMid *= 0.88;
        smoothTreb *= 0.88;
    }

    applyAmbientToDOM(smoothBass, smoothMid, smoothTreb);
    visualizerAnimId = requestAnimationFrame(updateAmbientVisualizer);
}

let currentAmbientColor = '94, 194, 255';
let lastSampledBg = '';

function updateCoverDominantColor(bgStr) {
    if (!bgStr || bgStr === lastSampledBg) return;
    lastSampledBg = bgStr;
    const match = bgStr.match(/^url\(["']?(.*?)["']?\)$/);
    const src = match ? match[1] : bgStr;
    if (!src) return;

    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = 16;
            canvas.height = 16;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 16, 16);
            const p = ctx.getImageData(0, 0, 16, 16).data;
            let r = 0, g = 0, b = 0, count = 0;
            for (let i = 0; i < p.length; i += 4) {
                const pr = p[i], pg = p[i + 1], pb = p[i + 2];
                const max = Math.max(pr, pg, pb);
                const min = Math.min(pr, pg, pb);
                if (max > 45 && (max - min) > 16) {
                    r += pr; g += pg; b += pb;
                    count++;
                }
            }
            if (count > 0) {
                currentAmbientColor = `${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)}`;
            } else {
                currentAmbientColor = '94, 194, 255';
            }
        } catch (_) {
            currentAmbientColor = '94, 194, 255';
        }
    };
    img.src = src;
}

function applyAmbientToDOM(bass, mid, treb) {
    const ambientEls = document.querySelectorAll('.l-music .ambient, .l-lyrics .ambient');
    if (!ambientEls.length) return;

    // Skala denyut & intensitas pendaran mengikuti energi frekuensi bass + vokal
    const scale = (1.04 + (bass * 0.12)).toFixed(3);
    const opacity = (0.75 + (mid * 0.20) + (bass * 0.15)).toFixed(2);
    const blur = Math.round(38 + bass * 14);
    const saturate = (2.2 + mid * 0.8).toFixed(2);
    const brightness = (0.68 + bass * 0.36).toFixed(2);

    ambientEls.forEach(el => {
        el.style.transform = `scale(${scale})`;
        el.style.opacity = opacity;
        el.style.filter = `blur(${blur}px) saturate(${saturate}) brightness(${brightness})`;
    });

    // Pendaran dinamis halus pada sampul album mengikuti warna video/lagu
    const art1 = document.getElementById('music-art-1');
    const art2 = document.getElementById('music-art-2');
    const artGlowSpread = Math.round(14 + bass * 26);
    const artGlowAlpha = (0.32 + bass * 0.48).toFixed(2);
    const glowColor = currentAmbientColor || '94, 194, 255';
    const glowStyle = (bass > 0.02)
        ? `0 6px ${artGlowSpread}px rgba(${glowColor}, ${artGlowAlpha})`
        : '';
    if (art1) art1.style.boxShadow = glowStyle;
    if (art2) art2.style.boxShadow = glowStyle;
}

function startAmbientVisualizerIfNeeded() {
    const isPlaying = mediaState.active && mediaState.status === 'Playing';
    const isMusicOrLyrics = (typeof currentPage !== 'undefined') && (currentPage === 'music' || currentPage === 'lyrics');
    if (isPlaying && isMusicOrLyrics) {
        if (!audioVisualizerAnalyser && !visualizerInitializing) {
            initDesktopAudioVisualizer().then(ok => {
                if (ok && !visualizerAnimId) {
                    visualizerAnimId = requestAnimationFrame(updateAmbientVisualizer);
                }
            });
        }
        if (!visualizerAnimId) {
            visualizerAnimId = requestAnimationFrame(updateAmbientVisualizer);
        }
    }
}

