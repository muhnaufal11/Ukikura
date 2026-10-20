// ================= UKIKURA AUDIO & ALERTS SYNTHESIZER =================
// Multi-channel sound alert engine (Class Alarm, WA/Phone Notifications, LMS Deadlines)
// Web Audio API Synthesizer (Zero External Dependencies) + Custom Audio Support

const AUDIO_SETTINGS_KEY = 'ukikura_audio_settings_v1';

const DEFAULT_AUDIO_SETTINGS = {
    classAlarm: {
        preset: 'chime', // 'chime' | 'bell' | 'digital' | 'marimba' | 'custom'
        volume: 85,
        customPath: '',
        customName: ''
    },
    notif: {
        preset: 'pop', // 'pop' | 'ding' | 'chirp' | 'custom' | 'mute'
        volume: 70,
        customPath: '',
        customName: ''
    },
    deadline: {
        preset: 'pulse', // 'pulse' | 'chime' | 'beep' | 'custom' | 'mute'
        volume: 80,
        customPath: '',
        customName: ''
    }
};

function formatAudioUri(filePath) {
    if (!filePath || typeof filePath !== 'string') return '';
    if (/^(https?|file|data):/i.test(filePath)) return filePath;
    const clean = filePath.replace(/\\/g, '/');
    return clean.startsWith('/') ? `file://${clean}` : `file:///${clean}`;
}

let currentAudioSettings = null;
let globalAudioCtx = null;

function getAudioContext() {
    if (!globalAudioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass) {
            globalAudioCtx = new AudioContextClass();
        }
    }
    if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
        globalAudioCtx.resume().catch(() => {});
    }
    return globalAudioCtx;
}

function loadAudioSettings() {
    if (currentAudioSettings) return currentAudioSettings;
    try {
        const saved = localStorage.getItem(AUDIO_SETTINGS_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            currentAudioSettings = {
                classAlarm: Object.assign({}, DEFAULT_AUDIO_SETTINGS.classAlarm, parsed.classAlarm || {}),
                notif: Object.assign({}, DEFAULT_AUDIO_SETTINGS.notif, parsed.notif || {}),
                deadline: Object.assign({}, DEFAULT_AUDIO_SETTINGS.deadline, parsed.deadline || {})
            };
            return currentAudioSettings;
        }
    } catch (_) {}
    currentAudioSettings = JSON.parse(JSON.stringify(DEFAULT_AUDIO_SETTINGS));
    return currentAudioSettings;
}

function saveAudioSettings(newSettings) {
    const current = loadAudioSettings();
    if (newSettings) {
        currentAudioSettings = {
            classAlarm: Object.assign({}, current.classAlarm, newSettings.classAlarm || {}),
            notif: Object.assign({}, current.notif, newSettings.notif || {}),
            deadline: Object.assign({}, current.deadline, newSettings.deadline || {})
        };
    }
    try {
        localStorage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(currentAudioSettings));
    } catch (_) {}
    return currentAudioSettings;
}

// ---------------- SYNTHESIZER PRESETS ----------------

function synthChime(ctx, now, masterGain) {
    // 4 nada harmonik C5 -> E5 -> G5 -> C6 (Akademik & Menenangkan)
    const notes = [
        { f: 523.25, start: 0.00, dur: 0.9 },
        { f: 659.25, start: 0.16, dur: 0.9 },
        { f: 783.99, start: 0.32, dur: 1.1 },
        { f: 1046.50, start: 0.48, dur: 1.4 }
    ];
    for (const n of notes) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(n.f, now + n.start);

        g.gain.setValueAtTime(0.0001, now + n.start);
        g.gain.exponentialRampToValueAtTime(0.75, now + n.start + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);

        osc.connect(g);
        g.connect(masterGain);
        osc.start(now + n.start);
        osc.stop(now + n.start + n.dur + 0.05);
    }
}

function synthTowerBell(ctx, now, masterGain) {
    // Lonceng kampus megah 2 nada (G4 -> C5) dengan overtone resonan
    const bells = [
        { f: 392.00, start: 0.00, dur: 1.5, o: 784.0 },
        { f: 523.25, start: 0.35, dur: 2.0, o: 1046.5 }
    ];
    for (const b of bells) {
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const g = ctx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(b.f, now + b.start);
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(b.o, now + b.start);

        g.gain.setValueAtTime(0.001, now + b.start);
        g.gain.exponentialRampToValueAtTime(0.85, now + b.start + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + b.start + b.dur);

        osc1.connect(g);
        osc2.connect(g);
        g.connect(masterGain);

        osc1.start(now + b.start);
        osc2.start(now + b.start);
        osc1.stop(now + b.start + b.dur);
        osc2.stop(now + b.start + b.dur);
    }
}

function synthDigitalRadar(ctx, now, masterGain) {
    // Nada radar modern futuristik (Sweep ganda)
    [0.0, 0.22].forEach(st => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now + st);
        osc.frequency.exponentialRampToValueAtTime(1760, now + st + 0.14);

        g.gain.setValueAtTime(0.001, now + st);
        g.gain.linearRampToValueAtTime(0.80, now + st + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + st + 0.18);

        osc.connect(g);
        g.connect(masterGain);
        osc.start(now + st);
        osc.stop(now + st + 0.2);
    });
}

function synthMarimba(ctx, now, masterGain) {
    // Kayu marimba ceria (A4 - C#5 - E5 - A5)
    const tones = [440, 554.37, 659.25, 880];
    tones.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const st = idx * 0.12;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + st);

        g.gain.setValueAtTime(0.001, now + st);
        g.gain.linearRampToValueAtTime(0.85, now + st + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, now + st + 0.35);

        osc.connect(g);
        g.connect(masterGain);
        osc.start(now + st);
        osc.stop(now + st + 0.38);
    });
}

function synthPopBubble(ctx, now, masterGain) {
    // Pop gelembung lembut khas notifikasi chat
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.95, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    osc.connect(g);
    g.connect(masterGain);
    osc.start(now);
    osc.stop(now + 0.1);
}

function synthGlassDing(ctx, now, masterGain) {
    // Ding kaca kristal Apple-style
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const g = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1318.5, now);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2637.0, now);

    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.90, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    osc1.connect(g);
    osc2.connect(g);
    g.connect(masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.48);
    osc2.stop(now + 0.48);
}

function synthChirp(ctx, now, masterGain) {
    // Chirp ceria dua ketukan
    [0.0, 0.09].forEach((st, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(i === 0 ? 987 : 1318.5, now + st);
        osc.frequency.exponentialRampToValueAtTime(i === 0 ? 1174 : 1567.9, now + st + 0.06);

        g.gain.setValueAtTime(0.001, now + st);
        g.gain.linearRampToValueAtTime(0.80, now + st + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + st + 0.08);

        osc.connect(g);
        g.connect(masterGain);
        osc.start(now + st);
        osc.stop(now + st + 0.09);
    });
}

function synthPulseAlert(ctx, now, masterGain) {
    // Pulse peringatan deadline dua nada
    const notes = [587.33, 440.00];
    notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const st = i * 0.18;
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + st);

        g.gain.setValueAtTime(0.001, now + st);
        g.gain.linearRampToValueAtTime(0.75, now + st + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + st + 0.28);

        osc.connect(g);
        g.connect(masterGain);
        osc.start(now + st);
        osc.stop(now + st + 0.3);
    });
}

function synthTripleBeep(ctx, now, masterGain) {
    // Tiga bunyi beep pendek pengingat
    [0.0, 0.12, 0.24].forEach(st => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now + st);

        g.gain.setValueAtTime(0.001, now + st);
        g.gain.linearRampToValueAtTime(0.85, now + st + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, now + st + 0.07);

        osc.connect(g);
        g.connect(masterGain);
        osc.start(now + st);
        osc.stop(now + st + 0.08);
    });
}

// ---------------- DISPATCHER SUARA UTAMA ----------------

const lastPlayedChannelTimestamps = {
    classAlarm: 0,
    notif: 0,
    deadline: 0
};

async function playAudioAlert(channel = 'class', forcePreset = null, forceVol = null) {
    const cfg = loadAudioSettings();
    const key = (channel === 'class' || channel === 'classAlarm') ? 'classAlarm' : channel;
    const chanCfg = cfg[key] || cfg.classAlarm;
    const preset = forcePreset !== null ? forcePreset : chanCfg.preset;
    const volPct = forceVol !== null ? forceVol : chanCfg.volume;

    if (preset === 'mute' || volPct <= 0) return;

    // Debounce anti-suara dobel: cegah tumpang tindih oscillator audio jika event tiba serentak < 450ms (kecuali tes manual dari modal)
    if (forcePreset === null) {
        const nowMs = Date.now();
        const minCooldown = (key === 'notif') ? 450 : 1200;
        if (nowMs - (lastPlayedChannelTimestamps[key] || 0) < minCooldown) {
            return;
        }
        lastPlayedChannelTimestamps[key] = nowMs;
    }

    // Jika custom audio file dipilih (berlaku untuk semua kanal)
    if (preset === 'custom' && chanCfg.customPath) {
        try {
            const uri = formatAudioUri(chanCfg.customPath);
            const audio = new Audio(uri);
            audio.volume = Math.max(0.01, Math.min(1, volPct / 100));
            const p = audio.play();
            if (p !== undefined) {
                await p;
            }
            return;
        } catch (err) {
            console.warn('[AudioAlerts] Gagal memutar custom audio, fallback ke synthesizer:', err);
        }
    }

    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
        try {
            await ctx.resume();
        } catch (_) {}
    }

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    const normVol = Math.max(0.01, Math.min(1, volPct / 100));
    masterGain.gain.setValueAtTime(normVol, now);
    masterGain.connect(ctx.destination);

    switch (preset) {
        case 'bell':
            synthTowerBell(ctx, now, masterGain);
            break;
        case 'digital':
            synthDigitalRadar(ctx, now, masterGain);
            break;
        case 'marimba':
            synthMarimba(ctx, now, masterGain);
            break;
        case 'ding':
            synthGlassDing(ctx, now, masterGain);
            break;
        case 'chirp':
            synthChirp(ctx, now, masterGain);
            break;
        case 'pulse':
            synthPulseAlert(ctx, now, masterGain);
            break;
        case 'beep':
            synthTripleBeep(ctx, now, masterGain);
            break;
        case 'pop':
            synthPopBubble(ctx, now, masterGain);
            break;
        case 'chime':
        default:
            synthChime(ctx, now, masterGain);
            break;
    }
}

// Ekspos secara global ke seluruh modul UI
window.loadAudioSettings = loadAudioSettings;
window.saveAudioSettings = saveAudioSettings;
window.playAudioAlert = playAudioAlert;
window.formatAudioUri = formatAudioUri;
