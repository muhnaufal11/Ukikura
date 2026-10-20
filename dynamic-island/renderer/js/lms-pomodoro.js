// Format Countdown
function formatRealtimeCountdown(ms) {
    if (ms === null || ms === undefined) return 'Aktif';
    if (ms < 0) return 'Lewat';

    const totalSec = Math.floor(ms / 1000);
    const days = Math.floor(totalSec / 86400);
    const hours = Math.floor((totalSec % 86400) / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    const pad = (n) => String(n).padStart(2, '0');

    if (days > 0) return `${days}h ${pad(hours)}:${pad(mins)}:${pad(secs)}`;
    return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
}

function getTaskState(t, now) {
    if (t.isDone) return 'done';
    if (t.dueTimestamp !== null) {
        const diff = t.dueTimestamp - now;
        if (diff < 0) return 'overdue';
        if (diff <= urgentThresholdHours * 3600 * 1000) return 'urgent';
    }
    return 'active';
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function getNearestPendingTask(now) {
    const pending = allTasks.filter(t => !t.isDone && (t.dueTimestamp === null || t.dueTimestamp >= now));
    pending.sort((a, b) => {
        if (a.dueTimestamp !== null && b.dueTimestamp !== null) return a.dueTimestamp - b.dueTimestamp;
        if (a.dueTimestamp !== null) return -1;
        if (b.dueTimestamp !== null) return 1;
        return 0;
    });
    return { pending, nearest: pending[0] || null };
}

function updateLiveMetrics() {
    const now = Date.now();
    const d = new Date(now);
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    document.getElementById('js-time').textContent = timeStr;
    document.getElementById('js-date').textContent = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;

    const { pending, nearest } = getNearestPendingTask(now);
    const urgentList = pending.filter(t => t.dueTimestamp !== null && (t.dueTimestamp - now) <= urgentThresholdHours * 3600 * 1000);
    const lapPct = Math.max(0, Math.min(100, Math.round(Number(powerState.laptop.battery) || 100)));

    idleRingEl.style.setProperty('--p', `${lapPct}%`);
    hdrRingEl.style.setProperty('--p', `${lapPct}%`);
    petCountEl.textContent = String(pending.length);

    if (urgentList.length > 0) {
        mnEl.classList.add('urgent');
        if (nearest && !notifiedUrgentIds.has(nearest.id)) {
            notifiedUrgentIds.add(nearest.id);
            try {
                new Notification('Deadline LMS Mendesak', {
                    body: `${nearest.title} (${nearest.courseName}) — ${formatRealtimeCountdown(nearest.dueTimestamp - now)}`
                });
            } catch (_) {}
            if (typeof window.playAudioAlert === 'function') {
                window.playAudioAlert('deadline');
            }
        }
    } else {
        mnEl.classList.remove('urgent');
    }

    // Update Closed Bar Text: Prioritaskan Judul Musik bila sedang diputar
    if (mediaState.active && mediaState.status === 'Playing' && mediaState.title) {
        idleCenterEl.textContent = mediaState.artist
            ? `${mediaState.title} · ${mediaState.artist}`
            : mediaState.title;
    } else if (nearest && nearest.dueTimestamp !== null) {
        idleCenterEl.textContent = formatRealtimeCountdown(nearest.dueTimestamp - now);
    } else {
        idleCenterEl.textContent = pending.length > 0 ? `${pending.length} Tugas` : timeStr;
    }

    // Update progress musik & lirik secara halus
    if (mediaState.active) {
        updateMediaProgressUI();
    }

    // Update Halaman Deadline / Focus Timer
    if (focusModeActive) {
        const fm = Math.floor(focusRemainingSec / 60);
        const fs = focusRemainingSec % 60;
        pomoMainTimerEl.textContent = `${String(fm).padStart(2, '0')}:${String(fs).padStart(2, '0')}`;
        pomoTitleEl.textContent = nearest ? `Fokus: ${nearest.title}` : 'Sesi Fokus Pomodoro';
        pomoCourseEl.textContent = nearest ? nearest.courseName : '25 menit konsentrasi penuh';
    } else if (nearest) {
        pomoMainTimerEl.textContent = nearest.dueTimestamp !== null
            ? formatRealtimeCountdown(nearest.dueTimestamp - now)
            : `${pending.length} Aktif`;
        pomoTitleEl.textContent = nearest.title;
        pomoCourseEl.textContent = nearest.courseName;
    } else {
        pomoMainTimerEl.textContent = timeStr;
        pomoTitleEl.textContent = allTasks.length > 0 ? 'Semua Tugas Selesai' : 'Belum Ada Data Tugas';
        pomoCourseEl.textContent = 'Klik tombol Login LMS di kanan atas untuk sinkronisasi otomatis';
    }

    // Update countdown di tiap baris tugas
    document.querySelectorAll('.trow-timer[data-ts]').forEach(el => {
        const raw = el.getAttribute('data-ts');
        if (!raw) return;
        const ts = parseInt(raw, 10);
        if (!isNaN(ts)) el.textContent = formatRealtimeCountdown(ts - now);
    });
}

function renderTodoList() {
    const now = Date.now();
    const activeTasks = allTasks.filter(t => !t.isDone && (t.dueTimestamp === null || t.dueTimestamp >= now));
    const urgentTasks = activeTasks.filter(t => t.dueTimestamp !== null && (t.dueTimestamp - now) <= urgentThresholdHours * 3600 * 1000);
    const assignTasks = allTasks.filter(t => !t.isDone && t.type === 'assign');
    const quizTasks = allTasks.filter(t => !t.isDone && t.type !== 'assign');
    const doneTasks = allTasks.filter(t => t.isDone);

    todoRatioEl.textContent = `${doneTasks.length}/${allTasks.length}`;
    todoSubTextEl.textContent = `${activeTasks.length} Aktif · ${urgentTasks.length} Mendesak`;

    let filtered = activeTasks;
    if (currentFilter === 'urgent') filtered = urgentTasks;
    else if (currentFilter === 'assign') filtered = assignTasks;
    else if (currentFilter === 'quiz') filtered = quizTasks;
    else if (currentFilter === 'done') filtered = doneTasks;

    filtered.sort((a, b) => {
        if (a.dueTimestamp !== null && b.dueTimestamp !== null) return a.dueTimestamp - b.dueTimestamp;
        if (a.dueTimestamp !== null) return -1;
        if (b.dueTimestamp !== null) return 1;
        return 0;
    });

    if (filtered.length === 0) {
        todoListEl.innerHTML = `
            <div class="trow" style="justify-content:center;height:100%;color:rgba(255,255,255,.5);font-size:11px;text-align:center">
                ${allTasks.length === 0
                    ? 'Belum ada tugas. Klik ikon kunci (Login LMS) di kanan atas.'
                    : 'Tidak ada item pada kategori ini.'}
            </div>
        `;
        return;
    }

    todoListEl.innerHTML = filtered.map(t => {
        const state = getTaskState(t, now);
        const isAssign = t.type === 'assign';
        const timerStr = t.dueTimestamp !== null ? formatRealtimeCountdown(t.dueTimestamp - now) : 'Aktif';

        return `
            <div class="trow ${state === 'urgent' ? 'urgent' : ''} ${t.isDone ? 'done' : ''}">
                <button class="chk" data-check="${encodeURIComponent(t.id)}" title="Tandai Selesai / Belum">
                    <svg viewBox="0 0 10 10"><path d="m2 5.2 2 2 4-4.4"/></svg>
                </button>
                <div class="trow-main" data-url="${encodeURIComponent(t.href)}" title="${escapeHtml(t.title)} — ${escapeHtml(t.courseName)}">
                    <div class="trow-title-line">
                        <span class="trow-badge ${isAssign ? 'assign' : 'quiz'}">${isAssign ? 'Tugas' : 'Kuis'}</span>
                        <span class="trow-title">${escapeHtml(t.title)}</span>
                    </div>
                    <div class="trow-sub">${escapeHtml(t.courseName)}</div>
                </div>
                <div class="trow-right">
                    <span class="trow-timer" data-ts="${t.dueTimestamp || ''}">${timerStr}</span>
                    <button class="trow-open" data-url="${encodeURIComponent(t.href)}" title="Buka Tugas & AI">
                        <svg viewBox="0 0 24 24"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    todoListEl.querySelectorAll('[data-check]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = decodeURIComponent(btn.getAttribute('data-check'));
            fetch(`${SERVER_URL}/__qbot__/tasks/toggle`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id })
            }).catch(() => {});
        });
    });

    todoListEl.querySelectorAll('[data-url]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const url = decodeURIComponent(el.getAttribute('data-url'));
            if (url) ipcRenderer.send('island-open-url', url);
        });
    });
}

// Filter Chips
document.querySelectorAll('.flt-chip').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.flt-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.getAttribute('data-filter');
        renderTodoList();
    });
});

// Tombol Halaman Deadline / Pomodoro
document.getElementById('btn-pomo-open').addEventListener('click', () => {
    const { nearest } = getNearestPendingTask(Date.now());
    if (nearest && nearest.href) {
        ipcRenderer.send('island-open-url', nearest.href);
    } else {
        ipcRenderer.send('island-open-url', 'https://lms.telkomuniversity.ac.id/my/courses.php');
    }
});

document.getElementById('btn-pomo-mode').addEventListener('click', () => {
    focusModeActive = !focusModeActive;
    if (focusModeActive && focusRemainingSec <= 0) focusRemainingSec = 25 * 60;
    document.getElementById('pomo-focus-label').textContent = focusModeActive ? 'Mode Deadline' : 'Fokus 25m';
    updateLiveMetrics();
});

document.getElementById('btn-pomo-toggle-focus').addEventListener('click', () => {
    focusModeActive = !focusModeActive;
    if (focusModeActive) focusRemainingSec = 25 * 60;
    document.getElementById('pomo-focus-label').textContent = focusModeActive ? 'Reset 25m' : 'Fokus 25m';
    updateLiveMetrics();
});

document.getElementById('btn-pomo-done').addEventListener('click', () => {
    const { nearest } = getNearestPendingTask(Date.now());
    if (nearest) {
        fetch(`${SERVER_URL}/__qbot__/tasks/toggle`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: nearest.id })
        }).catch(() => {});
    }
});

