// ================= UKIKURA SOUND SETTINGS CONTROLLER =================
// Multi-channel sound settings modal (accessible from Home Page, Header, Config, & Schedule)

function openSoundModal() {
    const modal = document.getElementById('sound-modal');
    if (!modal) return;

    // Pastikan kapsul dalam mode terbuka (expanded)
    if (typeof window.expandIsland === 'function') {
        window.expandIsland(window.currentPage || 'todo');
    }

    // Pin kapsul agar tidak tertutup otomatis saat menyetel suara
    const pinBtn = document.getElementById('btn-pin');
    if (pinBtn) pinBtn.classList.add('active');
    if (typeof isPinned !== 'undefined') isPinned = true;
    if (typeof ipcRenderer !== 'undefined') ipcRenderer.send('island-pin', true);

    modal.classList.add('open');
    syncSoundModalUI();
}

function closeSoundModal() {
    const modal = document.getElementById('sound-modal');
    if (!modal) return;
    modal.classList.remove('open');
}

function syncSoundModalUI() {
    if (typeof window.loadAudioSettings !== 'function') return;
    const cfg = window.loadAudioSettings();

    // 1. Kanal Bel Kuliah
    const selClass = document.getElementById('sel-sound-class-main');
    const rngClass = document.getElementById('range-vol-class-main');
    const valClass = document.getElementById('val-vol-class-main');
    if (selClass && cfg.classAlarm) selClass.value = cfg.classAlarm.preset || 'chime';
    if (rngClass && cfg.classAlarm) rngClass.value = cfg.classAlarm.volume !== undefined ? cfg.classAlarm.volume : 85;
    if (valClass && rngClass) valClass.textContent = `${rngClass.value}%`;

    // 2. Kanal Notifikasi WA / HP
    const selNotif = document.getElementById('sel-sound-notif-main');
    const rngNotif = document.getElementById('range-vol-notif-main');
    const valNotif = document.getElementById('val-vol-notif-main');
    if (selNotif && cfg.notif) selNotif.value = cfg.notif.preset || 'pop';
    if (rngNotif && cfg.notif) rngNotif.value = cfg.notif.volume !== undefined ? cfg.notif.volume : 70;
    if (valNotif && rngNotif) valNotif.textContent = `${rngNotif.value}%`;

    // 3. Kanal Deadline LMS
    const selDead = document.getElementById('sel-sound-deadline-main');
    const rngDead = document.getElementById('range-vol-deadline-main');
    const valDead = document.getElementById('val-vol-deadline-main');
    if (selDead && cfg.deadline) selDead.value = cfg.deadline.preset || 'pulse';
    if (rngDead && cfg.deadline) rngDead.value = cfg.deadline.volume !== undefined ? cfg.deadline.volume : 80;
    if (valDead && rngDead) valDead.textContent = `${rngDead.value}%`;
}

function setupSoundSettingsUI() {
    // Tombol close modal
    const closeBtn = document.getElementById('btn-close-sound-modal');
    const saveCloseBtn = document.getElementById('btn-save-close-sound');
    if (closeBtn) closeBtn.addEventListener('click', closeSoundModal);
    if (saveCloseBtn) saveCloseBtn.addEventListener('click', closeSoundModal);

    // Tombol pembuka modal dari berbagai lokasi
    // 1. Header Bar Kapsul
    const hdrBtn = document.getElementById('btn-open-sound-hdr');
    if (hdrBtn) hdrBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSoundModal();
    });

    // 2. Halaman Utama Todolist
    const todoBtn = document.getElementById('btn-open-sound-todo');
    if (todoBtn) todoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSoundModal();
    });

    // 3. Halaman Pengaturan (Config)
    const cfgBtn = document.getElementById('btn-open-sound-config');
    if (cfgBtn) cfgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSoundModal();
    });

    // 4. Modal Jadwal Kuliah
    const schedSoundBtn = document.getElementById('btn-toggle-sound-settings');
    if (schedSoundBtn) schedSoundBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSoundModal();
    });

    // Helper untuk binding kontrol kanal
    function bindChannel(channelKey, selId, rngId, valId, testBtnId) {
        const sel = document.getElementById(selId);
        const rng = document.getElementById(rngId);
        const val = document.getElementById(valId);
        const testBtn = document.getElementById(testBtnId);

        function applyUpdate(triggerTest = false) {
            if (typeof window.saveAudioSettings !== 'function') return;
            const preset = sel ? sel.value : 'chime';
            const volume = rng ? parseInt(rng.value, 10) : 80;
            if (val) val.textContent = `${volume}%`;

            const updatePayload = {};
            updatePayload[channelKey] = { preset, volume };
            window.saveAudioSettings(updatePayload);

            if (triggerTest && typeof window.playAudioAlert === 'function') {
                window.playAudioAlert(channelKey, preset, volume);
            }
        }

        if (sel) sel.addEventListener('change', () => applyUpdate(true));
        if (rng) {
            rng.addEventListener('input', () => {
                if (val) val.textContent = `${rng.value}%`;
            });
            rng.addEventListener('change', () => applyUpdate(true));
        }
        if (testBtn) {
            testBtn.addEventListener('click', () => {
                const preset = sel ? sel.value : null;
                const volume = rng ? parseInt(rng.value, 10) : null;
                if (typeof window.playAudioAlert === 'function') {
                    window.playAudioAlert(channelKey, preset, volume);
                }
            });
        }
    }

    bindChannel('classAlarm', 'sel-sound-class-main', 'range-vol-class-main', 'val-vol-class-main', 'btn-test-sound-class-main');
    bindChannel('notif', 'sel-sound-notif-main', 'range-vol-notif-main', 'val-vol-notif-main', 'btn-test-sound-notif-main');
    bindChannel('deadline', 'sel-sound-deadline-main', 'range-vol-deadline-main', 'val-vol-deadline-main', 'btn-test-sound-deadline-main');
}

// Inisialisasi saat DOM siap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupSoundSettingsUI);
} else {
    setupSoundSettingsUI();
}

window.openSoundModal = openSoundModal;
window.closeSoundModal = closeSoundModal;
window.syncSoundModalUI = syncSoundModalUI;
