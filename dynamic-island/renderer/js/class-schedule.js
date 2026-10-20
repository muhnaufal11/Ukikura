// ================= JADWAL KULIAH MINGGUAN (IGRACIAS) & ALARM AKADEMIK =================
// Ukikura Academic Assistant · Telkom University Schedule & Smart Alarms

const SCHEDULE_STORAGE_KEY = 'ukikura_class_schedule_v1';

// Format jadwal perkuliahan mingguan (default kosong untuk instalasi publik)
const DEFAULT_CLASS_SCHEDULE = [];

const DAY_NAMES_MAP = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

let classScheduleList = [];
let classAlarmAudioCtx = null;
let triggeredAlarmsToday = new Set();
let alarmSnoozeUntil = {}; // { classId: timestamp }
let activeDayFilter = 'all';

// Inisialisasi data jadwal
function loadClassSchedules() {
    try {
        const saved = localStorage.getItem(SCHEDULE_STORAGE_KEY);
        if (saved !== null) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
                classScheduleList = parsed;
                return;
            }
        }
    } catch (_) {}
    classScheduleList = [];
    saveClassSchedules();
}

function saveClassSchedules() {
    try {
        localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify(classScheduleList));
    } catch (_) {}
}

// ================= SUARA ALARM SYNTHESIZER =================
function playClassAlarmChime(isTest = false) {
    if (typeof window.playAudioAlert === 'function') {
        window.playAudioAlert('class');
        return;
    }
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        if (!classAlarmAudioCtx) classAlarmAudioCtx = new AudioContext();
        if (classAlarmAudioCtx.state === 'suspended') classAlarmAudioCtx.resume();
        const now = classAlarmAudioCtx.currentTime;
        [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
            const osc = classAlarmAudioCtx.createOscillator();
            const gain = classAlarmAudioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + i * 0.16);
            gain.gain.setValueAtTime(0.001, now + i * 0.16);
            gain.gain.exponentialRampToValueAtTime(0.24, now + i * 0.16 + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.16 + 0.35);
            osc.connect(gain);
            gain.connect(classAlarmAudioCtx.destination);
            osc.start(now + i * 0.16);
            osc.stop(now + i * 0.16 + 0.4);
        });
    } catch (_) {}
}

function setClassSchedules(newList) {
    classScheduleList = Array.isArray(newList) ? newList : [];
    saveClassSchedules();
    renderScheduleList();
    if (typeof renderCalendar === 'function') renderCalendar();
}

function appendClassSchedules(items) {
    if (Array.isArray(items) && items.length > 0) {
        classScheduleList.push(...items);
        saveClassSchedules();
        renderScheduleList();
        if (typeof renderCalendar === 'function') renderCalendar();
    }
}

// ================= INTEGRASI DENGAN SMART CALENDAR =================
function getClassScheduleForDateKey(dateKey) {
    if (!dateKey) return [];
    const [y, m, d] = String(dateKey).split('-').map(Number);
    const dateObj = new Date(y, (m || 1) - 1, d || 1);
    const dayIdx = dateObj.getDay();

    const matches = classScheduleList.filter(item => item.dayIdx === dayIdx);
    matches.sort((a, b) => a.timeStart.localeCompare(b.timeStart));

    return matches.map(c => ({
        id: c.id,
        type: 'class',
        title: c.name,
        course: `${c.room} · ${c.group}`,
        timeStr: `${c.timeStart} - ${c.timeEnd}`,
        code: c.code,
        room: c.room,
        group: c.group,
        sks: c.sks || 3,
        color: c.color || '#38bdf8',
        completed: false,
        urgent: false,
        dateKey
    }));
}

function getUpcomingClassEvents() {
    const list = [];
    const now = new Date();
    const todayIdx = now.getDay();
    const nowMins = now.getHours() * 60 + now.getMinutes();

    // Periksa jadwal 7 hari ke depan
    for (let offset = 0; offset < 7; offset++) {
        const targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
        const dayIdx = targetDate.getDay();
        const y = targetDate.getFullYear();
        const m = String(targetDate.getMonth() + 1).padStart(2, '0');
        const d = String(targetDate.getDate()).padStart(2, '0');
        const dKey = `${y}-${m}-${d}`;

        const dayClasses = classScheduleList.filter(item => item.dayIdx === dayIdx);
        for (const c of dayClasses) {
            const [ch, cm] = c.timeStart.split(':').map(Number);
            const classMins = (ch || 0) * 60 + (cm || 0);

            // Jika hari ini, abaikan jika kelas sudah selesai hari ini
            if (offset === 0 && nowMins > classMins + 120) continue;

            const sortTs = new Date(y, targetDate.getMonth(), targetDate.getDate(), ch || 0, cm || 0).getTime();
            const dateShort = `${targetDate.getDate()} ${['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][targetDate.getMonth()]}`;

            list.push({
                id: c.id,
                type: 'class',
                title: c.name,
                course: `${c.room} · ${c.group}`,
                timeStr: `${dateShort} · ${c.timeStart} - ${c.timeEnd}`,
                code: c.code,
                room: c.room,
                group: c.group,
                sks: c.sks || 3,
                color: c.color || '#38bdf8',
                completed: false,
                urgent: false,
                dateKey: dKey,
                sortTs
            });
        }
    }

    list.sort((a, b) => a.sortTs - b.sortTs);
    return list;
}

// ================= LOOP PENGECEKAN ALARM KULIAH (BERTAHAP H-30 s.d H-0) =================
function checkClassAlarms() {
    const now = new Date();
    const todayIdx = now.getDay();
    const nowH = now.getHours();
    const nowM = now.getMinutes();
    const currentMins = nowH * 60 + nowM;
    const dateStr = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;

    const todayClasses = classScheduleList.filter(item => item.dayIdx === todayIdx);
    if (todayClasses.length === 0) return;

    for (const c of todayClasses) {
        const [ch, cm] = c.timeStart.split(':').map(Number);
        const classStartMins = (ch || 0) * 60 + (cm || 0);
        const diffMins = classStartMins - currentMins;

        // Cek status snooze
        if (alarmSnoozeUntil[c.id] && Date.now() < alarmSnoozeUntil[c.id]) {
            continue;
        }

        let stage = null;
        let stageLabel = '';

        if (diffMins === 30) {
            stage = 'h30';
            stageLabel = '⏳ 30 Menit Lagi Kuliah Dimulai';
        } else if (diffMins === 15) {
            stage = 'h15';
            stageLabel = '⏳ 15 Menit Lagi Kuliah Dimulai';
        } else if (diffMins === 10) {
            stage = 'h10';
            stageLabel = '⏳ 10 Menit Lagi Kuliah Dimulai';
        } else if (diffMins === 5) {
            stage = 'h5';
            stageLabel = '🚨 5 Menit Lagi Kuliah Dimulai!';
        } else if (diffMins === 0) {
            stage = 'start';
            stageLabel = '🔔 KULIAH SEDANG DIMULAI SEKARANG!';
        }

        if (!stage) continue;

        const triggerKey = `${c.id}_${dateStr}_${stage}`;
        if (triggeredAlarmsToday.has(triggerKey)) continue;

        // Tandai sudah dipicu agar tidak berulang di menit yang sama
        triggeredAlarmsToday.add(triggerKey);

        // Bunyikan Alarm Audio
        playClassAlarmChime();

        // Tampilkan Notifikasi Peek Popup di Kapsul
        if (typeof triggerPeekPopup === 'function') {
            triggerPeekPopup({
                app: 'iGracias Kuliah',
                title: `${c.name} (${c.timeStart})`,
                message: `${stageLabel} · Ruang ${c.room} (${c.group})`,
                isClassAlarm: true
            });
        }

        // Reaksi Maskot
        if (typeof setMascotMood === 'function') {
            setMascotMood('reading');
        }
    }
}

// Jalankan pengecekan alarm setiap 30 detik
setInterval(checkClassAlarms, 30000);

// ================= MODAL JADWAL KULIAH MINGGUAN =================
function openScheduleModal() {
    const modal = document.getElementById('sched-modal');
    if (!modal) return;

    // Pastikan kapsul dalam mode terbuka (expanded)
    if (typeof window.expandIsland === 'function') {
        window.expandIsland('todo');
    }

    // Pin kapsul agar tidak tertutup otomatis saat melihat/mengedit jadwal
    const pinBtn = document.getElementById('btn-pin');
    if (pinBtn) pinBtn.classList.add('active');
    if (typeof isPinned !== 'undefined') isPinned = true;
    if (typeof ipcRenderer !== 'undefined') ipcRenderer.send('island-pin', true);

    modal.classList.add('open');
    renderScheduleList();
}

function closeScheduleModal() {
    const modal = document.getElementById('sched-modal');
    if (!modal) return;
    modal.classList.remove('open');
}

function snoozeClassAlarm(classId, minutes = 5) {
    alarmSnoozeUntil[classId] = Date.now() + minutes * 60 * 1000;
}

function renderScheduleList() {
    const listEl = document.getElementById('sched-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    let items = classScheduleList;
    if (activeDayFilter !== 'all') {
        const targetDayIdx = DAY_NAMES_MAP.findIndex(d => d.toLowerCase() === activeDayFilter.toLowerCase());
        items = items.filter(i => i.dayIdx === targetDayIdx);
    }

    // Urutkan berdasarkan hari (Senin=1..Minggu=0/7) lalu jam mulai
    items.sort((a, b) => {
        const da = a.dayIdx === 0 ? 7 : a.dayIdx;
        const db = b.dayIdx === 0 ? 7 : b.dayIdx;
        if (da !== db) return da - db;
        return a.timeStart.localeCompare(b.timeStart);
    });

    if (items.length === 0) {
        listEl.innerHTML = `
            <div class="sched-empty">
                <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>Belum ada jadwal kuliah.<br>Klik tombol <b>+ Tambah</b> di atas untuk menambahkan matkul mingguan.</span>
            </div>
        `;
        return;
    }

    items.forEach(c => {
        const card = document.createElement('div');
        card.className = 'sched-card';
        card.style.borderLeftColor = c.color || '#38bdf8';
        card.innerHTML = `
            <div class="sched-card-main">
                <div class="sched-card-top">
                    <span class="sched-day-badge" style="background:${c.color ? c.color + '26' : 'rgba(56,189,248,.18)'};color:${c.color || '#38bdf8'}">
                        ${c.day.toUpperCase()} · ${c.timeStart} - ${c.timeEnd}
                    </span>
                    <span class="sched-sks-badge">${c.sks || 3} SKS</span>
                </div>
                <div class="sched-card-title">${c.name}</div>
                <div class="sched-card-meta">
                    <span>Ruang: <b>${c.room}</b></span>
                    <span>·</span>
                    <span>Kode: <b>${c.code}</b></span>
                    <span>·</span>
                    <span>Kelas: <b>${c.group}</b></span>
                </div>
            </div>
            <div class="sched-card-actions">
                <button type="button" class="sched-btn-del" title="Hapus jadwal matkul ini">×</button>
            </div>
        `;

        card.querySelector('.sched-btn-del').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Hapus jadwal matkul "${c.name}"?`)) {
                classScheduleList = classScheduleList.filter(i => i.id !== c.id);
                saveClassSchedules();
                renderScheduleList();
                if (typeof renderCalendar === 'function') renderCalendar();
            }
        });

        listEl.appendChild(card);
    });
}

function setupScheduleUI() {
    loadClassSchedules();

    // Setup tombol filter hari
    document.querySelectorAll('.sched-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.sched-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeDayFilter = btn.dataset.day || 'all';
            renderScheduleList();
        });
    });

    // Tombol close modal
    const closeBtn = document.getElementById('btn-close-sched-modal');
    if (closeBtn) closeBtn.addEventListener('click', closeScheduleModal);

    // Tombol Uji Alarm Bunyi
    const testAlarmBtn = document.getElementById('btn-test-class-alarm');
    if (testAlarmBtn) {
        testAlarmBtn.addEventListener('click', () => {
            playClassAlarmChime(true);
            if (typeof triggerPeekPopup === 'function') {
                triggerPeekPopup({
                    app: 'iGracias Kuliah',
                    title: 'Uji Coba Alarm Kuliah',
                    message: '🔔 Suara chime bel akademik berhasil diuji coba!',
                    isClassAlarm: true
                });
            }
        });
    }

    // Tombol Kosongkan Semua Jadwal
    const resetBtn = document.getElementById('btn-reset-sched-default');
    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm('Kosongkan semua daftar jadwal kuliah?')) {
                classScheduleList = [];
                saveClassSchedules();
                renderScheduleList();
                if (typeof renderCalendar === 'function') renderCalendar();
            }
        });
    }

    // Tombol Buka iGracias Web
    const igraciasBtn = document.getElementById('btn-open-igracias');
    if (igraciasBtn) {
        igraciasBtn.addEventListener('click', () => {
            ipcRenderer.send('island-open-url', 'https://igracias.telkomuniversity.ac.id/');
        });
    }

    // Tombol Buka LMS Courses
    const lmsCoursesBtn = document.getElementById('btn-open-lms-courses-modal');
    if (lmsCoursesBtn) {
        lmsCoursesBtn.addEventListener('click', () => {
            ipcRenderer.send('island-open-url', 'https://lms.telkomuniversity.ac.id/my/courses.php');
        });
    }

    // Tombol Tambah Matkul Baru
    const addFormToggleBtn = document.getElementById('btn-toggle-add-sched');
    const addFormEl = document.getElementById('sched-add-form');
    if (addFormToggleBtn && addFormEl) {
        addFormToggleBtn.addEventListener('click', () => {
            const ksmDrawer = document.getElementById('sched-ksm-drawer');
            const soundDrawer = document.getElementById('sched-sound-drawer');
            if (ksmDrawer) ksmDrawer.classList.remove('open');
            if (soundDrawer) soundDrawer.classList.remove('open');
            addFormEl.classList.toggle('open');
            if (addFormEl.classList.contains('open')) {
                document.getElementById('sched-input-name').focus();
            }
        });
    }

    // ================= DRAWER PENGATURAN SUARA & VOLUME =================
    const soundDrawer = document.getElementById('sched-sound-drawer');
    const toggleSoundBtn = document.getElementById('btn-toggle-sound-settings');
    const closeSoundBtn = document.getElementById('btn-sound-close');

    function syncSoundSettingsUI() {
        if (typeof window.loadAudioSettings !== 'function') return;
        const cfg = window.loadAudioSettings();

        const selClass = document.getElementById('sel-sound-class');
        const rngClass = document.getElementById('range-vol-class');
        const valClass = document.getElementById('val-vol-class');
        if (selClass && cfg.classAlarm) selClass.value = cfg.classAlarm.preset || 'chime';
        if (rngClass && cfg.classAlarm) rngClass.value = cfg.classAlarm.volume !== undefined ? cfg.classAlarm.volume : 85;
        if (valClass && cfg.classAlarm) valClass.textContent = `${rngClass ? rngClass.value : 85}%`;

        const selNotif = document.getElementById('sel-sound-notif');
        const rngNotif = document.getElementById('range-vol-notif');
        const valNotif = document.getElementById('val-vol-notif');
        if (selNotif && cfg.notif) selNotif.value = cfg.notif.preset || 'pop';
        if (rngNotif && cfg.notif) rngNotif.value = cfg.notif.volume !== undefined ? cfg.notif.volume : 70;
        if (valNotif && cfg.notif) valNotif.textContent = `${rngNotif ? rngNotif.value : 70}%`;

        const selDead = document.getElementById('sel-sound-deadline');
        const rngDead = document.getElementById('range-vol-deadline');
        const valDead = document.getElementById('val-vol-deadline');
        if (selDead && cfg.deadline) selDead.value = cfg.deadline.preset || 'pulse';
        if (rngDead && cfg.deadline) rngDead.value = cfg.deadline.volume !== undefined ? cfg.deadline.volume : 80;
        if (valDead && cfg.deadline) valDead.textContent = `${rngDead ? rngDead.value : 80}%`;
    }

    if (toggleSoundBtn && soundDrawer) {
        toggleSoundBtn.addEventListener('click', () => {
            if (ksmDrawer) ksmDrawer.classList.remove('open');
            if (addFormEl) addFormEl.classList.remove('open');
            soundDrawer.classList.toggle('open');
            if (soundDrawer.classList.contains('open')) {
                syncSoundSettingsUI();
            }
        });
    }

    if (closeSoundBtn && soundDrawer) {
        closeSoundBtn.addEventListener('click', () => {
            soundDrawer.classList.remove('open');
        });
    }

    function bindSoundControl(channel, selId, rngId, valId, testBtnId) {
        const sel = document.getElementById(selId);
        const rng = document.getElementById(rngId);
        const val = document.getElementById(valId);
        const testBtn = document.getElementById(testBtnId);

        function updateSettings(triggerTest = false) {
            if (typeof window.saveAudioSettings !== 'function') return;
            const preset = sel ? sel.value : 'chime';
            const volume = rng ? parseInt(rng.value, 10) : 80;
            if (val) val.textContent = `${volume}%`;
            const updateObj = {};
            updateObj[channel] = { preset, volume };
            window.saveAudioSettings(updateObj);
            if (triggerTest && typeof window.playAudioAlert === 'function') {
                window.playAudioAlert(channel, preset, volume);
            }
        }

        if (sel) sel.addEventListener('change', () => updateSettings(true));
        if (rng) {
            rng.addEventListener('input', () => updateSettings(false));
            rng.addEventListener('change', () => updateSettings(true));
        }
        if (testBtn) {
            testBtn.addEventListener('click', () => {
                const preset = sel ? sel.value : null;
                const volume = rng ? parseInt(rng.value, 10) : null;
                if (typeof window.playAudioAlert === 'function') {
                    window.playAudioAlert(channel, preset, volume);
                }
            });
        }
    }

    bindSoundControl('classAlarm', 'sel-sound-class', 'range-vol-class', 'val-vol-class', 'btn-test-sound-class');
    bindSoundControl('notif', 'sel-sound-notif', 'range-vol-notif', 'val-vol-notif', 'btn-test-sound-notif');
    bindSoundControl('deadline', 'sel-sound-deadline', 'range-vol-deadline', 'val-vol-deadline', 'btn-test-sound-deadline');

    // Form Submit Tambah Matkul
    const submitAddBtn = document.getElementById('btn-submit-add-sched');
    if (submitAddBtn) {
        submitAddBtn.addEventListener('click', () => {
            const daySel = document.getElementById('sched-select-day');
            const nameInp = document.getElementById('sched-input-name');
            const startInp = document.getElementById('sched-input-start');
            const endInp = document.getElementById('sched-input-end');
            const roomInp = document.getElementById('sched-input-room');
            const codeInp = document.getElementById('sched-input-code');
            const groupInp = document.getElementById('sched-input-group');

            const name = nameInp.value.trim();
            const timeStart = startInp.value.trim() || '08:30';
            const timeEnd = endInp.value.trim() || '10:30';
            const room = roomInp.value.trim() || 'Ruang Kelas';
            const code = codeInp.value.trim() || '-';
            const group = groupInp.value.trim() || 'REG-01';
            const dayIdx = parseInt(daySel.value, 10);
            const day = DAY_NAMES_MAP[dayIdx] || 'Senin';

            if (!name) {
                alert('Silakan masukkan nama mata kuliah!');
                return;
            }

            const colors = ['#38bdf8', '#a78bfa', '#f59e0b', '#ec4899', '#10b981', '#06b6d4', '#8b5cf6'];
            const randomColor = colors[Math.floor(Math.random() * colors.length)];

            classScheduleList.push({
                id: 'cs-custom-' + Date.now(),
                day,
                dayIdx,
                timeStart,
                timeEnd,
                name,
                code,
                sks: 3,
                room,
                group,
                color: randomColor
            });

            saveClassSchedules();
            renderScheduleList();
            if (typeof renderCalendar === 'function') renderCalendar();

            nameInp.value = '';
            roomInp.value = '';
            codeInp.value = '';
            if (addFormEl) addFormEl.classList.remove('open');
        });
    }
}

// Ekspos ke global window untuk kemudahan pemanggilan antar modul
window.openScheduleModal = openScheduleModal;
window.closeScheduleModal = closeScheduleModal;
window.playClassAlarmChime = playClassAlarmChime;
window.getClassScheduleForDateKey = getClassScheduleForDateKey;
window.getUpcomingClassEvents = getUpcomingClassEvents;
window.setClassSchedules = setClassSchedules;
window.appendClassSchedules = appendClassSchedules;

// Inisialisasi saat script dimuat
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupScheduleUI);
} else {
    setupScheduleUI();
}
