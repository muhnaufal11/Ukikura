// ================= KALENDER PINTAR (SMART CALENDAR + LMS DEADLINES + AGENDA PRIBADI) =================
const calGridEl = document.getElementById('cal-grid');
const calMonthLabelEl = document.getElementById('cal-month-label');
const calSelTitleEl = document.getElementById('cal-sel-title');
const calSelBadgeEl = document.getElementById('cal-sel-badge');
const calEventsListEl = document.getElementById('cal-events-list');
const calAddInputEl = document.getElementById('cal-add-input');
const calAddBtnEl = document.getElementById('cal-add-btn');
const jsDateEl = document.getElementById('js-date');

const CAL_MONTHS_ID = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];
const CAL_DAYS_FULL_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

var calViewYear = new Date().getFullYear();
var calViewMonth = new Date().getMonth();
var calSelectedDateKey = toDateKey(new Date());
var customCalNotes = {};

try {
    const savedNotes = localStorage.getItem('nusa_cal_notes_v1');
    if (savedNotes) customCalNotes = JSON.parse(savedNotes) || {};
} catch (_) {
    customCalNotes = {};
}

function saveCustomCalNotes() {
    try {
        localStorage.setItem('nusa_cal_notes_v1', JSON.stringify(customCalNotes));
    } catch (_) {}
}

function toDateKey(d) {
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
}

function parseDateKey(key) {
    const [y, m, d] = String(key).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
}

function getTaskTimestamp(t) {
    if (!t) return null;
    if (typeof t.dueTimestamp === 'number' && !isNaN(t.dueTimestamp)) return t.dueTimestamp;
    if (t.dueAt) {
        const parsed = new Date(t.dueAt).getTime();
        if (!isNaN(parsed)) return parsed;
    }
    return null;
}

function getEventsForDateKey(dateKey) {
    const list = [];
    const now = Date.now();
    // 1. Tugas LMS yang jatuh tempo pada tanggal ini (mendukung dueTimestamp & dueAt)
    for (const t of allTasks) {
        const ts = getTaskTimestamp(t);
        if (ts === null) continue;
        const d = new Date(ts);
        if (isNaN(d.getTime())) continue;
        if (toDateKey(d) === dateKey) {
            const done = Boolean(t.isDone || t.completed);
            const diffHours = (ts - now) / 3600000;
            const isUrgent = !done && diffHours <= urgentThresholdHours;
            list.push({
                id: t.id,
                type: 'lms',
                title: t.title || 'Tugas LMS',
                course: t.courseName || 'LMS Telkom University',
                timeStr: d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
                completed: done,
                urgent: isUrgent,
                url: t.href || t.url || '',
                dateKey
            });
        }
    }
    // 2. Catatan Agenda Pribadi dari localStorage
    const notes = Array.isArray(customCalNotes[dateKey]) ? customCalNotes[dateKey] : [];
    for (const n of notes) {
        list.push({
            id: n.id,
            type: 'note',
            title: n.text,
            course: 'Agenda Pribadi',
            timeStr: n.timeStr || 'Sepanjang Hari',
            completed: false,
            urgent: false,
            dateKey
        });
    }

    // 3. Jadwal Kuliah Mingguan (iGracias Telkom University)
    if (typeof getClassScheduleForDateKey === 'function') {
        const classes = getClassScheduleForDateKey(dateKey);
        for (const c of classes) {
            list.push(c);
        }
    }
    return list;
}

function getUpcomingAllEvents() {
    const now = Date.now();
    const upcoming = [];

    // Ambil jadwal perkuliahan hari ini & mendatang
    if (typeof getUpcomingClassEvents === 'function') {
        const classEvents = getUpcomingClassEvents();
        upcoming.push(...classEvents);
    }

    // Ambil semua tugas LMS aktif (belum selesai)
    for (const t of allTasks) {
        const done = Boolean(t.isDone || t.completed);
        if (done) continue;
        const ts = getTaskTimestamp(t);
        if (ts === null) continue;
        const d = new Date(ts);
        if (isNaN(d.getTime())) continue;
        const dKey = toDateKey(d);
        const diffHours = (ts - now) / 3600000;
        const dateShort = `${d.getDate()} ${CAL_MONTHS_ID[d.getMonth()].slice(0, 3)}`;
        const timeShort = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        upcoming.push({
            id: t.id,
            type: 'lms',
            title: t.title || 'Tugas LMS',
            course: t.courseName || 'LMS Telkom University',
            timeStr: `${dateShort}, ${timeShort}`,
            completed: false,
            urgent: diffHours <= urgentThresholdHours,
            url: t.href || t.url || '',
            dateKey: dKey,
            sortTs: ts
        });
    }

    // Ambil juga catatan pribadi di tanggal-tanggal mendatang
    for (const [dKey, notes] of Object.entries(customCalNotes)) {
        if (!Array.isArray(notes)) continue;
        const d = parseDateKey(dKey);
        const dateShort = `${d.getDate()} ${CAL_MONTHS_ID[d.getMonth()].slice(0, 3)}`;
        for (const n of notes) {
            upcoming.push({
                id: n.id,
                type: 'note',
                title: n.text,
                course: 'Agenda Pribadi',
                timeStr: `${dateShort} • ${n.timeStr || 'Catatan'}`,
                completed: false,
                urgent: false,
                url: '',
                dateKey: dKey,
                sortTs: d.getTime()
            });
        }
    }

    upcoming.sort((a, b) => a.sortTs - b.sortTs);
    return upcoming;
}

function createCalendarEventRow(ev, isUpcomingPreview = false) {
    const row = document.createElement('div');
    const statusCls = ev.type === 'class' ? 'class-ev' : (ev.type === 'note' ? 'custom' : (ev.completed ? 'done' : (ev.urgent ? 'urgent' : '')));
    row.className = `cal-ev-row ${statusCls}`;
    row.innerHTML = `
        <div class="cal-ev-info">
            <div class="cal-ev-name" style="${ev.completed ? 'text-decoration:line-through;opacity:.6' : ''}"></div>
            <div class="cal-ev-meta"></div>
        </div>
    `;
    row.querySelector('.cal-ev-name').textContent = ev.type === 'class' ? `[KULIAH] ${ev.title}` : ev.title;
    row.querySelector('.cal-ev-meta').textContent = `${ev.timeStr} • ${ev.course}`;

    if (ev.type === 'class') {
        row.title = 'Klik untuk membuka Jadwal Kuliah Mingguan (iGracias)';
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof openScheduleModal === 'function') openScheduleModal();
        });
    } else if (ev.type === 'note' && !isUpcomingPreview) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'cal-ev-del';
        delBtn.title = 'Hapus catatan';
        delBtn.textContent = '×';
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const targetKey = ev.dateKey || calSelectedDateKey;
            const arr = Array.isArray(customCalNotes[targetKey]) ? customCalNotes[targetKey] : [];
            customCalNotes[targetKey] = arr.filter(item => item.id !== ev.id);
            if (customCalNotes[targetKey].length === 0) {
                delete customCalNotes[targetKey];
            }
            saveCustomCalNotes();
            renderCalendar();
        });
        row.appendChild(delBtn);
    } else if (isUpcomingPreview && ev.dateKey) {
        row.title = 'Klik untuk lompat ke tanggal ini di kalender (klik 2x untuk buka tugas LMS)';
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            const d = parseDateKey(ev.dateKey);
            calViewYear = d.getFullYear();
            calViewMonth = d.getMonth();
            calSelectedDateKey = ev.dateKey;
            renderCalendar();
        });
    } else if (ev.url) {
        row.title = 'Klik untuk membuka tugas LMS';
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            ipcRenderer.send('island-open-url', ev.url);
        });
    }

    return row;
}

function renderCalendarEventsPanel() {
    if (!calEventsListEl || !calSelTitleEl || !calSelBadgeEl) return;
    const selDate = parseDateKey(calSelectedDateKey);
    const todayKey = toDateKey(new Date());
    const dayName = CAL_DAYS_FULL_ID[selDate.getDay()];
    const dateLabel = `${dayName}, ${selDate.getDate()} ${CAL_MONTHS_ID[selDate.getMonth()].slice(0, 3)}`;
    calSelTitleEl.textContent = calSelectedDateKey === todayKey ? `Hari Ini • ${dateLabel}` : dateLabel;

    const events = getEventsForDateKey(calSelectedDateKey);
    calSelBadgeEl.textContent = `${events.length} Agenda`;
    calEventsListEl.innerHTML = '';

    if (events.length === 0) {
        const upcoming = getUpcomingAllEvents();
        if (upcoming.length > 0) {
            const subLbl = document.createElement('div');
            subLbl.className = 'cal-sub-label';
            subLbl.textContent = `Kosong di ${selDate.getDate()} ${CAL_MONTHS_ID[selDate.getMonth()].slice(0, 3)} • Agenda & Deadline Terdekat:`;
            calEventsListEl.appendChild(subLbl);

            for (const ev of upcoming.slice(0, 6)) {
                calEventsListEl.appendChild(createCalendarEventRow(ev, true));
            }
            return;
        }

        const emptyEl = document.createElement('div');
        emptyEl.className = 'cal-empty';
        emptyEl.innerHTML = `
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            <span>Belum ada deadline di tanggal ini.<br>Ketik catatan di bawah lalu klik <b>Tambah</b>!</span>
        `;
        calEventsListEl.appendChild(emptyEl);
        return;
    }

    for (const ev of events) {
        calEventsListEl.appendChild(createCalendarEventRow(ev, false));
    }
}

function renderCalendar() {
    if (!calGridEl || !calMonthLabelEl) return;
    calMonthLabelEl.textContent = `${CAL_MONTHS_ID[calViewMonth]} ${calViewYear}`;
    calGridEl.innerHTML = '';

    const firstDay = new Date(calViewYear, calViewMonth, 1);
    // Konversi hari Minggu(0)..Sabtu(6) ke Senin(0)..Minggu(6)
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(calViewYear, calViewMonth, 0).getDate();
    const todayKey = toDateKey(new Date());

    // Total 42 sel (6 baris x 7 kolom) agar tinggi grid selalu konsisten
    for (let i = 0; i < 42; i++) {
        let cellYear = calViewYear;
        let cellMonth = calViewMonth;
        let dayNum = 1;
        let isOtherMonth = false;

        if (i < startOffset) {
            isOtherMonth = true;
            dayNum = daysInPrevMonth - startOffset + 1 + i;
            const prevD = new Date(calViewYear, calViewMonth - 1, dayNum);
            cellYear = prevD.getFullYear();
            cellMonth = prevD.getMonth();
        } else if (i >= startOffset + daysInMonth) {
            isOtherMonth = true;
            dayNum = i - (startOffset + daysInMonth) + 1;
            const nextD = new Date(calViewYear, calViewMonth + 1, dayNum);
            cellYear = nextD.getFullYear();
            cellMonth = nextD.getMonth();
        } else {
            dayNum = i - startOffset + 1;
        }

        const cellDate = new Date(cellYear, cellMonth, dayNum);
        const key = toDateKey(cellDate);
        const events = getEventsForDateKey(key);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cal-day';
        if (isOtherMonth) btn.classList.add('other-month');
        if (key === todayKey) btn.classList.add('today');
        if (key === calSelectedDateKey) btn.classList.add('selected');

        if (events.length > 0) {
            const hasUrgent = events.some(e => e.urgent && !e.completed);
            const hasNoteOnly = events.every(e => e.type === 'note');
            const hasClass = events.some(e => e.type === 'class');
            if (hasUrgent) {
                btn.classList.add('has-urgent');
            } else if (hasClass) {
                btn.classList.add('has-class');
            } else if (hasNoteOnly) {
                btn.classList.add('has-note');
            } else {
                btn.classList.add('has-event');
            }
        }

        btn.textContent = String(dayNum);
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            calSelectedDateKey = key;
            if (isOtherMonth) {
                calViewYear = cellYear;
                calViewMonth = cellMonth;
            }
            renderCalendar();
        });

        calGridEl.appendChild(btn);
    }

    renderCalendarEventsPanel();
}

function addCustomCalendarNote() {
    if (!calAddInputEl) return;
    const text = calAddInputEl.value.trim();
    if (!text) return;
    if (!Array.isArray(customCalNotes[calSelectedDateKey])) {
        customCalNotes[calSelectedDateKey] = [];
    }
    const now = new Date();
    customCalNotes[calSelectedDateKey].push({
        id: 'note-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        text,
        timeStr: now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    });
    calAddInputEl.value = '';
    saveCustomCalNotes();
    renderCalendar();
}

document.getElementById('cal-prev-month').addEventListener('click', (e) => {
    e.stopPropagation();
    const d = new Date(calViewYear, calViewMonth - 1, 1);
    calViewYear = d.getFullYear();
    calViewMonth = d.getMonth();
    renderCalendar();
});

document.getElementById('cal-next-month').addEventListener('click', (e) => {
    e.stopPropagation();
    const d = new Date(calViewYear, calViewMonth + 1, 1);
    calViewYear = d.getFullYear();
    calViewMonth = d.getMonth();
    renderCalendar();
});

calMonthLabelEl.addEventListener('click', (e) => {
    e.stopPropagation();
    const now = new Date();
    calViewYear = now.getFullYear();
    calViewMonth = now.getMonth();
    calSelectedDateKey = toDateKey(now);
    renderCalendar();
});

if (calAddBtnEl) {
    calAddBtnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        addCustomCalendarNote();
    });
}

if (calAddInputEl) {
    calAddInputEl.addEventListener('focus', () => {
        isPinned = true;
        btnPinEl.classList.add('active');
        ipcRenderer.send('island-pin', true);
    });
    calAddInputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            addCustomCalendarNote();
        }
    });
}

// Klik tanggal di pojok kiri atas header untuk langsung lompat ke halaman Kalender
if (jsDateEl) {
    jsDateEl.title = 'Klik untuk membuka Smart Calendar';
    jsDateEl.addEventListener('click', (e) => {
        e.stopPropagation();
        setPage('cal');
    });
}

// Ekspos renderCalendar ke global window
window.renderCalendar = renderCalendar;

