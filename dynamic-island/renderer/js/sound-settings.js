// ================= UKIKURA SOUND SETTINGS CONTROLLER =================
// Multi-channel sound settings modal (accessible from Home Page, Header, Config, & Schedule)

const CHANNEL_CONFIG_MAP = {
    classAlarm: {
        selId: 'sel-sound-class-main',
        rngId: 'range-vol-class-main',
        valId: 'val-vol-class-main',
        testBtnId: 'btn-test-sound-class-main',
        rowId: 'row-custom-class',
        labelId: 'label-custom-class',
        pickBtnId: 'btn-pick-custom-class',
        clearBtnId: 'btn-clear-custom-class',
        defaultPreset: 'chime'
    },
    notif: {
        selId: 'sel-sound-notif-main',
        rngId: 'range-vol-notif-main',
        valId: 'val-vol-notif-main',
        testBtnId: 'btn-test-sound-notif-main',
        rowId: 'row-custom-notif',
        labelId: 'label-custom-notif',
        pickBtnId: 'btn-pick-custom-notif',
        clearBtnId: 'btn-clear-custom-notif',
        defaultPreset: 'pop'
    },
    deadline: {
        selId: 'sel-sound-deadline-main',
        rngId: 'range-vol-deadline-main',
        valId: 'val-vol-deadline-main',
        testBtnId: 'btn-test-sound-deadline-main',
        rowId: 'row-custom-deadline',
        labelId: 'label-custom-deadline',
        pickBtnId: 'btn-pick-custom-deadline',
        clearBtnId: 'btn-clear-custom-deadline',
        defaultPreset: 'pulse'
    }
};

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

function updateCustomRowUI(channelKey, chCfg) {
    const meta = CHANNEL_CONFIG_MAP[channelKey];
    if (!meta) return;
    const row = document.getElementById(meta.rowId);
    const label = document.getElementById(meta.labelId);
    if (!row || !label) return;

    if (chCfg && chCfg.preset === 'custom') {
        row.style.display = 'flex';
        const displayTxt = chCfg.customName || (chCfg.customPath ? chCfg.customPath.split(/[\\/]/).pop() : '');
        label.textContent = displayTxt ? `🎵 ${displayTxt}` : 'Belum memilih file audio';
        label.title = chCfg.customPath || '';
    } else {
        row.style.display = 'none';
    }
}

function syncSoundModalUI() {
    if (typeof window.loadAudioSettings !== 'function') return;
    const cfg = window.loadAudioSettings();

    for (const [chKey, meta] of Object.entries(CHANNEL_CONFIG_MAP)) {
        const chData = cfg[chKey] || {};
        const sel = document.getElementById(meta.selId);
        const rng = document.getElementById(meta.rngId);
        const val = document.getElementById(meta.valId);

        if (sel) sel.value = chData.preset || meta.defaultPreset;
        if (rng) rng.value = chData.volume !== undefined ? chData.volume : 80;
        if (val && rng) val.textContent = `${rng.value}%`;

        updateCustomRowUI(chKey, chData);
    }
}

async function pickCustomSoundFile(channelKey) {
    if (typeof ipcRenderer === 'undefined') return;
    try {
        const filePath = await ipcRenderer.invoke('island-pick-audio-file');
        if (!filePath) return;

        const fileName = filePath.split(/[\\/]/).pop() || 'Audio Custom';
        const cfg = window.loadAudioSettings ? window.loadAudioSettings() : {};
        const chCfg = cfg[channelKey] || {};
        const volume = chCfg.volume !== undefined ? chCfg.volume : 80;

        const updatePayload = {};
        updatePayload[channelKey] = {
            preset: 'custom',
            customPath: filePath,
            customName: fileName,
            volume: volume
        };
        window.saveAudioSettings(updatePayload);

        const meta = CHANNEL_CONFIG_MAP[channelKey];
        const sel = document.getElementById(meta.selId);
        if (sel) sel.value = 'custom';
        updateCustomRowUI(channelKey, updatePayload[channelKey]);

        if (typeof window.playAudioAlert === 'function') {
            window.playAudioAlert(channelKey, 'custom', volume);
        }
    } catch (err) {
        console.error('[SoundSettings] Gagal memilih audio custom:', err);
    }
}

function clearCustomSound(channelKey) {
    const meta = CHANNEL_CONFIG_MAP[channelKey];
    if (!meta) return;
    const defaultPreset = meta.defaultPreset;
    const cfg = window.loadAudioSettings ? window.loadAudioSettings() : {};
    const chCfg = cfg[channelKey] || {};
    const volume = chCfg.volume !== undefined ? chCfg.volume : 80;

    const updatePayload = {};
    updatePayload[channelKey] = {
        preset: defaultPreset,
        customPath: '',
        customName: '',
        volume: volume
    };
    window.saveAudioSettings(updatePayload);

    const sel = document.getElementById(meta.selId);
    if (sel) sel.value = defaultPreset;
    updateCustomRowUI(channelKey, updatePayload[channelKey]);

    if (typeof window.playAudioAlert === 'function') {
        window.playAudioAlert(channelKey, defaultPreset, volume);
    }
}

function setupSoundSettingsUI() {
    // Tombol close modal
    const closeBtn = document.getElementById('btn-close-sound-modal');
    const saveCloseBtn = document.getElementById('btn-save-close-sound');
    if (closeBtn) closeBtn.addEventListener('click', closeSoundModal);
    if (saveCloseBtn) saveCloseBtn.addEventListener('click', closeSoundModal);

    // Tombol pembuka modal dari berbagai lokasi
    const hdrBtn = document.getElementById('btn-open-sound-hdr');
    if (hdrBtn) hdrBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSoundModal();
    });

    const todoBtn = document.getElementById('btn-open-sound-todo');
    if (todoBtn) todoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSoundModal();
    });

    const cfgBtn = document.getElementById('btn-open-sound-config');
    if (cfgBtn) cfgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSoundModal();
    });

    const schedSoundBtn = document.getElementById('btn-toggle-sound-settings');
    if (schedSoundBtn) schedSoundBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSoundModal();
    });

    // Binding kontrol tiap kanal
    for (const [chKey, meta] of Object.entries(CHANNEL_CONFIG_MAP)) {
        const sel = document.getElementById(meta.selId);
        const rng = document.getElementById(meta.rngId);
        const val = document.getElementById(meta.valId);
        const testBtn = document.getElementById(meta.testBtnId);
        const pickBtn = document.getElementById(meta.pickBtnId);
        const clearBtn = document.getElementById(meta.clearBtnId);

        function applyUpdate(triggerTest = false) {
            if (typeof window.saveAudioSettings !== 'function') return;
            const preset = sel ? sel.value : meta.defaultPreset;
            const volume = rng ? parseInt(rng.value, 10) : 80;
            if (val) val.textContent = `${volume}%`;

            const updatePayload = {};
            updatePayload[chKey] = { preset, volume };
            const updated = window.saveAudioSettings(updatePayload);
            updateCustomRowUI(chKey, updated[chKey]);

            if (triggerTest && typeof window.playAudioAlert === 'function') {
                window.playAudioAlert(chKey, preset, volume);
            }
        }

        if (sel) {
            sel.addEventListener('change', () => {
                const cfg = window.loadAudioSettings ? window.loadAudioSettings() : {};
                const chData = cfg[chKey] || {};
                if (sel.value === 'custom') {
                    if (chData.customPath) {
                        applyUpdate(true);
                    } else {
                        // Belum ada file yang dipilih -> langsung buka picker
                        pickCustomSoundFile(chKey);
                    }
                } else {
                    applyUpdate(true);
                }
            });
        }

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
                    window.playAudioAlert(chKey, preset, volume);
                }
            });
        }

        if (pickBtn) {
            pickBtn.addEventListener('click', () => pickCustomSoundFile(chKey));
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => clearCustomSound(chKey));
        }
    }
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
window.pickCustomSoundFile = pickCustomSoundFile;
window.clearCustomSound = clearCustomSound;
