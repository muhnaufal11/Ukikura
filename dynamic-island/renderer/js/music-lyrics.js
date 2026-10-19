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
    if (hasRealSmtcThumb) {
        const bg = `url("data:image/jpeg;base64,${mediaState.thumb}")`;
        art1.style.backgroundImage = bg;
        art2.style.backgroundImage = bg;
        idleArtEl.style.backgroundImage = bg;
        idleArtEl.classList.add('has-art');
    } else if (lyricCoverUrl) {
        const bg = `url("${lyricCoverUrl}")`;
        art1.style.backgroundImage = bg;
        art2.style.backgroundImage = bg;
        idleArtEl.style.backgroundImage = bg;
        idleArtEl.classList.add('has-art');
    } else if (mediaState.thumb) {
        const bg = `url("data:image/jpeg;base64,${mediaState.thumb}")`;
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

function updateMediaProgressUI() {
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
});

lyrListEl.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    lyricTimeOffset = 0;
    updateMediaProgressUI();
});

lyrListEl.addEventListener('wheel', (e) => {
    if (!syncedLyrics.length) return;
    e.preventDefault();
    e.stopPropagation();
    lyricTimeOffset += (e.deltaY > 0 ? 0.15 : -0.15);
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
        thumb: msg.thumb || (trackChanged ? '' : mediaState.thumb),
        isAppIcon: Boolean(msg.isAppIcon),
        updatedAt: Date.now()
    };

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

