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
    document.getElementById('music-title-1').title = title;
    document.getElementById('music-artist-1').textContent = artist;
    document.getElementById('music-artist-1').title = artist;
    document.getElementById('music-title-2').textContent = title;
    document.getElementById('music-title-2').title = title;
    document.getElementById('music-artist-2').textContent = artist;
    document.getElementById('music-artist-2').title = artist;

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

    // Ekstrak palet warna dari sampul video/lagu untuk ambient canvas
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
        lbl.style.color = 'rgba(94,194,255,.9)';
        lbl.style.borderColor = 'rgba(94,194,255,.28)';
        lbl.style.background = 'rgba(94,194,255,.12)';
    } else {
        const sign = lyricTimeOffset > 0 ? '+' : '';
        lbl.textContent = `${sign}${lyricTimeOffset.toFixed(1)}s`;
        lbl.style.color = '#38d36f';
        lbl.style.borderColor = 'rgba(56,211,111,.35)';
        lbl.style.background = 'rgba(56,211,111,.15)';
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
    let mainText = '';
    let romaText = '';
    let transText = (l && l.transText) || '';

    if (l && l.rawText && l.romaText) {
        mainText = l.rawText;
        romaText = l.romaText;
    } else if (l && l.roma && l.jp) {
        mainText = l.jp;
        romaText = l.roma;
    } else if (l && typeof l.text === 'string' && l.text.includes(' · ')) {
        const parts = l.text.split(' · ');
        romaText = parts[0];
        mainText = parts.slice(1).join(' · ');
    } else {
        mainText = (l && l.text) || '';
        romaText = (l && l.romaText) || '';
    }

    if (romaText && romaText.trim().toLowerCase() === mainText.trim().toLowerCase()) {
        romaText = '';
    }
    if (transText && transText.trim().toLowerCase() === mainText.trim().toLowerCase()) {
        transText = '';
    }

    // Sembunyikan terjemahan Mandarin (tlyric NetEase) jika lagu aslinya bukan lagu berbahasa Mandarin
    if (transText && /[\u4e00-\u9fa5]/.test(transText)) {
        const titleArtist = typeof mediaState !== 'undefined' ? `${mediaState.title || ''} ${mediaState.artist || ''}` : '';
        if (!/[\u4e00-\u9fa5]/.test(titleArtist)) {
            transText = '';
        }
    }

    let html = `<li data-lidx="${i}" style="cursor:pointer">`;
    html += `<div class="lyr-main">${escapeHtml(mainText)}</div>`;
    if (romaText) {
        html += `<div class="lyr-sub">${escapeHtml(romaText)}</div>`;
    }
    if (transText) {
        html += `<div class="lyr-trans">${escapeHtml(transText)}</div>`;
    }
    html += `</li>`;
    return html;
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
    if (!items.length) {
        if (typeof updateKaraokeOverlay === 'function') updateKaraokeOverlay();
        return;
    }
    const targetIdx = Math.max(0, Math.min(items.length - 1, activeLyricIndex >= 0 ? activeLyricIndex : 0));
    items.forEach((li, i) => li.classList.toggle('on', i === targetIdx));
    const activeLi = items[targetIdx];
    if (activeLi) {
        const offset = 62 - activeLi.offsetTop - activeLi.offsetHeight / 2;
        lyrListEl.style.transform = `translateY(${offset}px)`;
    }
    if (typeof updateKaraokeOverlay === 'function') updateKaraokeOverlay();
}

// Interaksi badge SYNC: Klik untuk reset 0s, scroll wheel untuk atur offset secara presisi
const lyrOffsetBadgeEl = document.getElementById('lyr-offset-label');
if (lyrOffsetBadgeEl) {
    lyrOffsetBadgeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        lyricTimeOffset = 0;
        updateLyricOffsetLabel();
        updateMediaProgressUI();
    });
    lyrOffsetBadgeEl.addEventListener('wheel', (e) => {
        if (!syncedLyrics.length) return;
        e.preventDefault();
        e.stopPropagation();
        lyricTimeOffset += (e.deltaY > 0 ? 0.15 : -0.15);
        updateLyricOffsetLabel();
        updateMediaProgressUI();
    }, { passive: false });
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

// ==================== DUAL-SUB & KARAOKE OVERLAY INTERACTION ====================
let subDisplayEnabled = true;
const btnSubToggleEl = document.getElementById('btn-sub-toggle');
const lyrBoxEl = document.getElementById('lyr-box');

if (btnSubToggleEl) {
    btnSubToggleEl.addEventListener('click', (e) => {
        e.stopPropagation();
        subDisplayEnabled = !subDisplayEnabled;
        btnSubToggleEl.textContent = subDisplayEnabled ? 'SUB: ON' : 'SUB: OFF';
        btnSubToggleEl.classList.toggle('off', !subDisplayEnabled);
        if (lyrBoxEl) lyrBoxEl.classList.toggle('hide-subs', !subDisplayEnabled);
    });
}

let karaokeSubMode = localStorage.getItem('ukikura_karaoke_sub_mode') !== 'false';

function updateKaraokeOverlay() {
    const kLine1 = document.getElementById('karaoke-line-1');
    const kLine2 = document.getElementById('karaoke-line-2');
    if (!kLine1 || !kLine2) return;

    if (!syncedLyrics || !syncedLyrics.length) {
        kLine1.textContent = mediaState.title || 'Ukikura Karaoke';
        kLine2.textContent = mediaState.artist || 'Memuat lirik karaoke...';
        return;
    }

    const idx = Math.max(0, Math.min(syncedLyrics.length - 1, activeLyricIndex >= 0 ? activeLyricIndex : 0));
    const curLine = syncedLyrics[idx];
    const nextLine = syncedLyrics[idx + 1];

    let curMain = '';
    let curSub = '';
    if (curLine) {
        if (curLine.rawText && curLine.romaText) {
            curMain = curLine.rawText;
            const r = curLine.romaText;
            const t = curLine.transText;
            curSub = (r && t) ? `${r} · ${t}` : (r || t || '');
        } else if (curLine.text && curLine.text.includes(' · ')) {
            const parts = curLine.text.split(' · ');
            curMain = parts.slice(1).join(' · ');
            const r = parts[0];
            const t = curLine.transText;
            curSub = (r && t) ? `${r} · ${t}` : (r || t || '');
        } else {
            curMain = curLine.text || '';
            const r = curLine.romaText;
            const t = curLine.transText;
            curSub = (r && t) ? `${r} · ${t}` : (t || r || '');
        }

        if (curSub && /[\u4e00-\u9fa5]/.test(curSub)) {
            const titleArtist = typeof mediaState !== 'undefined' ? `${mediaState.title || ''} ${mediaState.artist || ''}` : '';
            if (!/[\u4e00-\u9fa5]/.test(titleArtist)) {
                curSub = curLine.romaText || '';
            }
        }
    }

    if (karaokeSubMode && curSub) {
        kLine1.textContent = curMain || '...';
        kLine2.textContent = curSub;
    } else {
        kLine1.textContent = curMain || '...';
        if (nextLine) {
            let nextText = nextLine.rawText || nextLine.text || '';
            if (nextText.includes(' · ')) nextText = nextText.split(' · ').slice(1).join(' · ');
            kLine2.textContent = nextText;
        } else {
            kLine2.textContent = '...';
        }
    }

    const kArt = document.getElementById('karaoke-art');
    if (kArt) {
        const coverSrc = lyricCoverUrl || (mediaState && mediaState.thumb ? `data:image/jpeg;base64,${mediaState.thumb}` : '');
        if (coverSrc) {
            kArt.style.backgroundImage = `url("${coverSrc.replace(/"/g, '\\"')}")`;
        }
    }

    const kIcon = document.getElementById('play-icon-k');
    if (kIcon) {
        kIcon.innerHTML = (mediaState.status === 'Playing') ? PAUSE_SVG_PATH : PLAY_SVG_PATH;
    }
}

const btnOpenKaraoke = document.getElementById('btn-open-karaoke');
if (btnOpenKaraoke) {
    btnOpenKaraoke.addEventListener('click', (e) => {
        e.stopPropagation();
        setPage('karaoke');
    });
}

const btnKaraokeExpand = document.getElementById('btn-karaoke-expand');
if (btnKaraokeExpand) {
    btnKaraokeExpand.addEventListener('click', (e) => {
        e.stopPropagation();
        lyricsMode = true;
        setPage('music');
        mnEl.dataset.s = 'lyrics';
    });
}

const btnKaraokeClose = document.getElementById('btn-karaoke-close');
if (btnKaraokeClose) {
    btnKaraokeClose.addEventListener('click', (e) => {
        e.stopPropagation();
        isPinned = false;
        if (btnPinEl) btnPinEl.classList.remove('active');
        ipcRenderer.send('island-pin', false);
        lyricsMode = false;
        currentPage = 'music';
        isExpanded = false;
        mnEl.dataset.s = getClosedVisualMode();
    });
}

const btnKaraokeSub = document.getElementById('btn-karaoke-sub');
if (btnKaraokeSub) {
    btnKaraokeSub.classList.toggle('active', karaokeSubMode);
    btnKaraokeSub.addEventListener('click', (e) => {
        e.stopPropagation();
        karaokeSubMode = !karaokeSubMode;
        try { localStorage.setItem('ukikura_karaoke_sub_mode', String(karaokeSubMode)); } catch (_) {}
        btnKaraokeSub.classList.toggle('active', karaokeSubMode);
        updateKaraokeOverlay();
    });
}

const lKaraokeEl = document.getElementById('l-karaoke');
if (lKaraokeEl) {
    lKaraokeEl.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        lyricsMode = true;
        setPage('music');
        mnEl.dataset.s = 'lyrics';
    });
}

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
        const initArtist = mediaState.artist || (mediaState.app ? `Aplikasi: ${cleanAppName(mediaState.app)}` : 'Memuat lirik...');
        lyrListEl.innerHTML = `
            <li class="on">
                <div class="lyr-main" style="max-height:46px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escapeHtml(mediaState.title)}</div>
                <div class="lyr-sub" style="margin-top:3px">${escapeHtml(initArtist)}</div>
            </li>
            <li style="font-size:11px;opacity:0.45;margin-top:6px">🎵 Memuat lirik &amp; sinkronisasi...</li>
        `;
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
        const noLyrArtist = mediaState.artist || (mediaState.app ? `Aplikasi: ${cleanAppName(mediaState.app)}` : 'Live Audio Stream');
        lyrListEl.innerHTML = `
            <li class="on">
                <div class="lyr-main" style="max-height:46px;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical">${escapeHtml(mediaState.title || 'Musik Sedang Diputar')}</div>
                <div class="lyr-sub" style="margin-top:3px">${escapeHtml(noLyrArtist)}</div>
            </li>
            <li style="font-size:11px;opacity:0.45;margin-top:6px">🎵 Audio Live Aktif</li>
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

let ambientPalette = {
    primary: '94, 194, 255',
    secondary: '45, 91, 255',
    accent: '51, 224, 122'
};
let ambientPhase = 0;
let lastSampledBg = '';
let smoothWavePoints = [0, 0, 0, 0, 0, 0, 0, 0];

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
            canvas.width = 24;
            canvas.height = 24;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, 24, 24);
            const p = ctx.getImageData(0, 0, 24, 24).data;
            
            // Kumpulkan warna-warna berkarakter (saturasi & kecerahan hidup)
            let colors = [];
            for (let i = 0; i < p.length; i += 4) {
                const pr = p[i], pg = p[i + 1], pb = p[i + 2];
                const max = Math.max(pr, pg, pb);
                const min = Math.min(pr, pg, pb);
                if (max > 40 && (max - min) > 16) {
                    colors.push({ r: pr, g: pg, b: pb, sat: max - min });
                }
            }

            if (colors.length >= 3) {
                colors.sort((a, b) => b.sat - a.sat);
                const c1 = colors[0];
                const c2 = colors[Math.min(colors.length - 1, Math.floor(colors.length * 0.40))];
                const c3 = colors[Math.min(colors.length - 1, Math.floor(colors.length * 0.80))];

                ambientPalette.primary = `${c1.r}, ${c1.g}, ${c1.b}`;
                ambientPalette.secondary = `${c2.r}, ${c2.g}, ${c2.b}`;
                ambientPalette.accent = `${c3.r}, ${c3.g}, ${c3.b}`;
            } else {
                ambientPalette.primary = '94, 194, 255';
                ambientPalette.secondary = '45, 91, 255';
                ambientPalette.accent = '51, 224, 122';
            }
            applyAmbientToDOM(smoothBass, smoothMid, smoothTreb, smoothWavePoints);
        } catch (_) {
            ambientPalette.primary = '94, 194, 255';
            ambientPalette.secondary = '45, 91, 255';
            ambientPalette.accent = '51, 224, 122';
        }
    };
    img.src = src;
}

function renderFluidAmbientCanvas(canvasId, bass, mid, treb, wavePoints) {
    const cvs = document.getElementById(canvasId);
    if (!cvs) return;
    const ctx = cvs.getContext('2d');
    const w = cvs.width;
    const h = cvs.height;

    // Latar belakang gelap berkarakter
    ctx.fillStyle = '#080c14';
    ctx.fillRect(0, 0, w, h);

    // 1. Fluid Orb Bass (Kiri Bawah - membesar & bergelombang mengikuti dentuman bass)
    const x1 = w * 0.28 + Math.sin(ambientPhase * 0.75) * 32;
    const y1 = h * 0.68 + Math.cos(ambientPhase * 0.55) * 18;
    const r1 = 52 + bass * 50;
    const g1 = ctx.createRadialGradient(x1, y1, 4, x1, y1, r1);
    g1.addColorStop(0, `rgba(${ambientPalette.primary}, ${0.85 + bass * 0.15})`);
    g1.addColorStop(0.55, `rgba(${ambientPalette.primary}, 0.45)`);
    g1.addColorStop(1, `rgba(${ambientPalette.primary}, 0)`);
    ctx.fillStyle = g1;
    ctx.beginPath();
    ctx.arc(x1, y1, r1, 0, Math.PI * 2);
    ctx.fill();

    // 2. Fluid Orb Vokal & Melodi (Kanan Tengah - mengalir & berirama sesuai vokal lagu)
    const x2 = w * 0.72 + Math.cos(ambientPhase * 0.85) * 30;
    const y2 = h * 0.50 + Math.sin(ambientPhase * 0.65) * 20;
    const r2 = 46 + mid * 44;
    const g2 = ctx.createRadialGradient(x2, y2, 4, x2, y2, r2);
    g2.addColorStop(0, `rgba(${ambientPalette.secondary}, ${0.75 + mid * 0.22})`);
    g2.addColorStop(0.6, `rgba(${ambientPalette.secondary}, 0.35)`);
    g2.addColorStop(1, `rgba(${ambientPalette.secondary}, 0)`);
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(x2, y2, r2, 0, Math.PI * 2);
    ctx.fill();

    // 3. Fluid Orb Treble (Atas Tengah - kemilau nada tinggi)
    const x3 = w * 0.50 + Math.sin(ambientPhase * 1.15) * 44;
    const y3 = h * 0.32 + Math.cos(ambientPhase * 0.95) * 14;
    const r3 = 36 + treb * 34;
    const g3 = ctx.createRadialGradient(x3, y3, 3, x3, y3, r3);
    g3.addColorStop(0, `rgba(${ambientPalette.accent}, ${0.65 + treb * 0.32})`);
    g3.addColorStop(0.65, `rgba(${ambientPalette.accent}, 0.22)`);
    g3.addColorStop(1, `rgba(${ambientPalette.accent}, 0)`);
    ctx.fillStyle = g3;
    ctx.beginPath();
    ctx.arc(x3, y3, r3, 0, Math.PI * 2);
    ctx.fill();

    // 4. Gelombang Fluida Audio (Liquid Wave Ribbon yang bergelombang naik-turun sesuai spektrum nada lagu)
    if (wavePoints && wavePoints.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(0, h);
        const step = w / (wavePoints.length - 1);
        for (let i = 0; i < wavePoints.length; i++) {
            const px = i * step;
            const py = h - 12 - (wavePoints[i] * 36);
            if (i === 0) {
                ctx.lineTo(px, py);
            } else {
                const prevX = (i - 1) * step;
                const prevY = h - 12 - (wavePoints[i - 1] * 36);
                const midX = (prevX + px) / 2;
                ctx.quadraticCurveTo(prevX, prevY, midX, (prevY + py) / 2);
            }
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        const waveGrad = ctx.createLinearGradient(0, h - 50, 0, h);
        waveGrad.addColorStop(0, `rgba(${ambientPalette.secondary}, ${0.48 + bass * 0.38})`);
        waveGrad.addColorStop(1, `rgba(${ambientPalette.primary}, 0.12)`);
        ctx.fillStyle = waveGrad;
        ctx.fill();
    }
}

function applyAmbientToDOM(bass, mid, treb, wavePoints) {
    ambientPhase += 0.018 + bass * 0.038;
    renderFluidAmbientCanvas('ambient-canvas-1', bass, mid, treb, wavePoints);
    renderFluidAmbientCanvas('ambient-canvas-2', bass, mid, treb, wavePoints);

    // Pendaran dinamis halus pada sampul album mengikuti warna video/lagu
    const art1 = document.getElementById('music-art-1');
    const art2 = document.getElementById('music-art-2');
    const artGlowSpread = Math.round(14 + bass * 26);
    const artGlowAlpha = (0.32 + bass * 0.48).toFixed(2);
    const glowColor = ambientPalette.primary || '94, 194, 255';
    const glowStyle = (bass > 0.02)
        ? `0 6px ${artGlowSpread}px rgba(${glowColor}, ${artGlowAlpha})`
        : '';
    if (art1) art1.style.boxShadow = glowStyle;
    if (art2) art2.style.boxShadow = glowStyle;
}

function updateAmbientVisualizer() {
    const isPlaying = mediaState.active && mediaState.status === 'Playing';
    const isMusicOrLyrics = (typeof currentPage !== 'undefined') && (currentPage === 'music' || currentPage === 'lyrics');

    if (!isPlaying || !isMusicOrLyrics) {
        // Peluruhan halus saat musik dijeda atau keluar halaman
        smoothBass *= 0.82;
        smoothMid *= 0.82;
        smoothTreb *= 0.82;
        for (let i = 0; i < 8; i++) smoothWavePoints[i] *= 0.82;

        applyAmbientToDOM(smoothBass, smoothMid, smoothTreb, smoothWavePoints);

        if (smoothBass < 0.005 && smoothMid < 0.005 && smoothTreb < 0.005) {
            smoothBass = 0;
            smoothMid = 0;
            smoothTreb = 0;
            for (let i = 0; i < 8; i++) smoothWavePoints[i] = 0;
            applyAmbientToDOM(0, 0, 0, smoothWavePoints);
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

        // Ekstrak 8 titik gelombang spektrum frekuensi untuk liquid wave ribbon
        for (let i = 0; i < 8; i++) {
            const binIdx = Math.min(audioVisualizerData.length - 1, 1 + i * 2);
            const targetVal = (audioVisualizerData[binIdx] || 0) / 255;
            smoothWavePoints[i] += (targetVal - smoothWavePoints[i]) * 0.32;
        }

        // Exponential smoothing: responsif saat beat menghentak, halus saat melemah
        smoothBass += (targetBass - smoothBass) * (targetBass > smoothBass ? 0.36 : 0.12);
        smoothMid += (targetMid - smoothMid) * (targetMid > smoothMid ? 0.30 : 0.10);
        smoothTreb += (targetTreb - smoothTreb) * (targetTreb > smoothTreb ? 0.28 : 0.10);
    } else {
        smoothBass *= 0.88;
        smoothMid *= 0.88;
        smoothTreb *= 0.88;
        for (let i = 0; i < 8; i++) smoothWavePoints[i] *= 0.85;
    }

    applyAmbientToDOM(smoothBass, smoothMid, smoothTreb, smoothWavePoints);
    visualizerAnimId = requestAnimationFrame(updateAmbientVisualizer);
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

// Render frame awal canvas ambient saat pertama kali dimuat
setTimeout(() => {
    applyAmbientToDOM(0, 0, 0, smoothWavePoints);
}, 200);

