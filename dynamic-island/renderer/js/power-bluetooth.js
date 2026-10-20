// ================= DETEKSI BATERAI LAPTOP, CAS, BATERAI HP & BLUETOOTH =================
let powerState = {
    laptop: { battery: 100, charging: false, initialized: false },
    phone: null,
    audio: null,
    devices: []
};
let seenConnectedDevKeys = new Set();
let initialBtPass = true;
let lastPhoneChargingState = null;

function setPeekMode(modeName, durationMs = 4800) {
    if (mnEl.dataset.s === 'tucked') {
        ipcRenderer.send('island-tuck', false);
    }
    holderEl.classList.remove('passthrough');
    mnEl.dataset.s = modeName;
    ipcRenderer.send('island-peek-active', true);
    if (peekTimer) clearTimeout(peekTimer);
    peekTimer = setTimeout(() => {
        peekTimer = null;
        if (!isExpanded && mnEl.dataset.s === modeName) {
            mnEl.dataset.s = getClosedVisualMode();
            mnEl.classList.remove('has-reply');
            ipcRenderer.send('island-peek-active', false);
        } else if (isExpanded) {
            mnEl.dataset.s = getEffectiveState();
            mnEl.classList.remove('has-reply');
            ipcRenderer.send('island-peek-active', false);
        }
    }, durationMs);
}

function triggerChargePeek(charging, pct, customTitle, customSub) {
    const p = Math.max(0, Math.min(100, Math.round(Number(pct) || 0)));
    const arcOff = (69.1 * (1 - p / 100)).toFixed(1);
    document.getElementById('chg-arc').style.setProperty('--arc-off', arcOff);
    document.getElementById('chg-arc').setAttribute('stroke', charging ? '#33e07a' : (p <= 20 ? '#ff4b55' : '#5ec2ff'));
    document.getElementById('chg-title').textContent = customTitle || (charging ? 'Charging' : (p <= 20 ? 'Low Battery' : 'On Battery'));
    document.getElementById('chg-sub').textContent = customSub || (charging ? 'Charger connected' : 'Using laptop battery');
    document.getElementById('chg-pct').textContent = `${p}%`;

    setPeekMode('charge', 4500);
}

const DEVICE_KIND_META = {
    phone: {
        label: 'HP Bluetooth',
        svg: '<rect x="5" y="2" width="14" height="20" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>'
    },
    audio: {
        label: 'Audio TWS',
        svg: '<path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1zM20 15h-3v5h2a1 1 0 0 0 1-1z"/>'
    },
    mouse: {
        label: 'Mouse BT',
        svg: '<rect x="6" y="3" width="12" height="18" rx="6"/><line x1="12" y1="7" x2="12" y2="11"/>'
    },
    keyboard: {
        label: 'Keyboard BT',
        svg: '<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="6" y1="9" x2="6.01" y2="9"/><line x1="10" y1="9" x2="10.01" y2="9"/><line x1="14" y1="9" x2="14.01" y2="9"/><line x1="18" y1="9" x2="18.01" y2="9"/><line x1="8" y1="15" x2="16" y2="15"/>'
    },
    gamepad: {
        label: 'Controller BT',
        svg: '<rect x="2" y="6" width="20" height="12" rx="4"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/>'
    },
    usb: {
        label: 'Perangkat USB',
        svg: '<path d="M12 2v14m0-14 3 3m-3-3-3 3M7 10v3a5 5 0 0 0 10 0v-3"/><circle cx="12" cy="19" r="2"/>'
    }
};

function triggerBtPeek(dev, isDisconnectEvent = false) {
    if (!dev) return;
    const hasBat = typeof dev.battery === 'number' && dev.battery >= 0 && dev.battery <= 100;
    const p = hasBat ? Math.max(0, Math.min(100, Math.round(dev.battery))) : 100;
    const arcOff = (69.1 * (1 - p / 100)).toFixed(1);
    const btArcEl = document.getElementById('bt-arc');
    btArcEl.style.setProperty('--arc-off', arcOff);

    const isConn = isDisconnectEvent ? false : Boolean(dev.connected);
    btArcEl.setAttribute('stroke', isDisconnectEvent ? '#ff5a6e' : (isConn ? '#33e07a' : '#5ec2ff'));

    document.getElementById('bt-title').textContent = dev.name || 'Perangkat Bluetooth';
    const meta = DEVICE_KIND_META[dev.kind] || DEVICE_KIND_META.audio;
    const chgTxt = dev.charging ? ' · Mengisi Daya ⚡' : '';
    const batTxt = hasBat ? ` · ${p}%` : '';
    const statusTxt = isDisconnectEvent
        ? 'Sambungan Terputus ✕'
        : (isConn ? 'Terhubung ✓' : 'Tersimpan');

    document.getElementById('bt-sub').textContent = `${meta.label} · ${statusTxt}${chgTxt}${batTxt}`;
    document.getElementById('bt-icon-svg').innerHTML = meta.svg;

    setPeekMode('bt', 4500);
}

function renderPowerUI() {
    const lapPct = Math.max(0, Math.min(100, Math.round(Number(powerState.laptop.battery) || 0)));
    const chg = Boolean(powerState.laptop.charging);

    idleRingEl.style.setProperty('--p', `${lapPct}%`);
    hdrRingEl.style.setProperty('--p', `${lapPct}%`);

    const hdrLapPill = document.getElementById('hdr-laptop-bat');
    const hdrBolt = document.getElementById('hdr-chg-bolt');
    document.getElementById('hdr-laptop-pct').textContent = `${lapPct}%`;
    hdrLapPill.classList.toggle('charging', chg);
    hdrBolt.style.display = chg ? 'inline-block' : 'none';

    document.getElementById('bat-laptop-label').textContent = chg ? 'Laptop (Cas)' : 'Baterai Laptop';
    document.getElementById('bat-laptop-val').textContent = `${lapPct}%`;

    const phoneDev = powerState.phone;
    const hdrPhonePill = document.getElementById('hdr-phone-bat');
    const batPhoneValEl = document.getElementById('bat-phone-val');
    if (phoneDev) {
        const pChg = Boolean(phoneDev.charging);
        const hasPhoneBat = typeof phoneDev.battery === 'number' && phoneDev.battery >= 0;
        const pBatStr = hasPhoneBat ? `${phoneDev.battery}%` : (phoneDev.connected ? 'ON' : 'OFF');
        hdrPhonePill.style.display = 'inline-flex';
        hdrPhonePill.classList.toggle('charging', pChg);
        hdrPhonePill.title = `${phoneDev.name}: ${pBatStr}${pChg ? ' (Mengisi Daya)' : ''}`;
        document.getElementById('hdr-phone-pct').textContent = `${pChg ? '⚡ ' : ''}${pBatStr}`;
        document.getElementById('bat-phone-label').textContent = pChg ? `⚡ ${phoneDev.name}` : phoneDev.name;
        batPhoneValEl.textContent = `${pChg ? '⚡ ' : ''}${pBatStr}`;
        batPhoneValEl.style.color = pChg ? '#33e07a' : '#5ec2ff';
    } else {
        hdrPhonePill.style.display = 'none';
        document.getElementById('bat-phone-label').textContent = 'Baterai HP';
        batPhoneValEl.textContent = '--%';
        batPhoneValEl.style.color = '#5ec2ff';
    }

    const audioDev = powerState.audio;
    const batAudioValEl = document.getElementById('bat-audio-val');
    if (audioDev) {
        const hasAudBat = typeof audioDev.battery === 'number' && audioDev.battery >= 0;
        document.getElementById('bat-audio-label').textContent = audioDev.connected ? `● ${audioDev.name}` : audioDev.name;
        batAudioValEl.textContent = hasAudBat ? `${audioDev.battery}%` : (audioDev.connected ? 'ON' : 'OFF');
        batAudioValEl.style.color = audioDev.connected ? '#33e07a' : '#c4b5fd';
    } else {
        document.getElementById('bat-audio-label').textContent = 'TWS / Audio';
        batAudioValEl.textContent = '--%';
        batAudioValEl.style.color = '#c4b5fd';
    }

    const periphDev = powerState.periph;
    const batPeriphLabelEl = document.getElementById('bat-periph-label');
    const batPeriphValEl = document.getElementById('bat-periph-val');
    const batPeriphSvgEl = document.getElementById('bat-periph-svg');
    if (periphDev && batPeriphLabelEl && batPeriphValEl) {
        const meta = DEVICE_KIND_META[periphDev.kind] || DEVICE_KIND_META.mouse;
        if (batPeriphSvgEl) batPeriphSvgEl.innerHTML = meta.svg;
        const hasPBat = typeof periphDev.battery === 'number' && periphDev.battery >= 0;
        batPeriphLabelEl.textContent = periphDev.connected ? `● ${periphDev.name}` : periphDev.name;
        batPeriphValEl.textContent = hasPBat ? `${periphDev.battery}%` : (periphDev.connected ? 'ON' : 'OFF');
        batPeriphValEl.style.color = periphDev.connected ? '#33e07a' : '#38bdf8';
    } else if (batPeriphLabelEl && batPeriphValEl) {
        batPeriphLabelEl.textContent = 'Mouse / Periferal';
        batPeriphValEl.textContent = '--';
        batPeriphValEl.style.color = '#38bdf8';
    }
}

// Klik kartu baterai atau pil header untuk melihat animasi Peek khas Nusa
document.getElementById('hdr-laptop-bat').addEventListener('click', (e) => {
    e.stopPropagation();
    triggerChargePeek(powerState.laptop.charging, powerState.laptop.battery);
});

document.getElementById('hdr-phone-bat').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!powerState.phone) return;
    if (powerState.phone.charging) {
        triggerChargePeek(true, powerState.phone.battery, powerState.phone.name, `HP sedang diisi daya · ${powerState.phone.battery}%`);
    } else {
        triggerBtPeek(powerState.phone);
    }
});

document.getElementById('bat-card-laptop').addEventListener('click', (e) => {
    e.stopPropagation();
    triggerChargePeek(powerState.laptop.charging, powerState.laptop.battery);
});

document.getElementById('bat-card-phone').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!powerState.phone) return;
    if (powerState.phone.charging) {
        triggerChargePeek(true, powerState.phone.battery, powerState.phone.name, `HP sedang diisi daya · ${powerState.phone.battery}%`);
    } else {
        triggerBtPeek(powerState.phone);
    }
});

document.getElementById('bat-card-audio').addEventListener('click', (e) => {
    e.stopPropagation();
    if (powerState.audio) triggerBtPeek(powerState.audio);
});

const batCardPeriphEl = document.getElementById('bat-card-periph');
if (batCardPeriphEl) {
    batCardPeriphEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (powerState.periph) triggerBtPeek(powerState.periph);
    });
}

document.getElementById('l-charge').addEventListener('click', () => {
    if (peekTimer) { clearTimeout(peekTimer); peekTimer = null; }
    isExpanded = true;
    setPage('notif');
    ipcRenderer.send('island-resize', true);
});

document.getElementById('l-bt').addEventListener('click', () => {
    if (peekTimer) { clearTimeout(peekTimer); peekTimer = null; }
    isExpanded = true;
    setPage('notif');
    ipcRenderer.send('island-resize', true);
});

// Deteksi instan via Chromium Navigator Battery API untuk Cas Laptop
if (navigator.getBattery) {
    navigator.getBattery().then(bat => {
        powerState.laptop.battery = Math.round(bat.level * 100);
        powerState.laptop.charging = Boolean(bat.charging);
        powerState.laptop.initialized = true;
        renderPowerUI();

        bat.addEventListener('chargingchange', () => {
            const nowChg = Boolean(bat.charging);
            const nowPct = Math.round(bat.level * 100);
            powerState.laptop.charging = nowChg;
            powerState.laptop.battery = nowPct;
            renderPowerUI();
            triggerChargePeek(nowChg, nowPct);
        });

        bat.addEventListener('levelchange', () => {
            powerState.laptop.battery = Math.round(bat.level * 100);
            renderPowerUI();
        });
    }).catch(() => {});
}

ipcRenderer.on('charger-event', (event, data) => {
    if (!data) return;
    const nowChg = Boolean(data.charging);
    if (powerState.laptop.charging !== nowChg) {
        powerState.laptop.charging = nowChg;
        renderPowerUI();
        triggerChargePeek(nowChg, powerState.laptop.battery);
    }
});

let peekQueueTimeouts = [];
function schedulePeekSequence(actions) {
    if (!Array.isArray(actions) || actions.length === 0) return;
    peekQueueTimeouts.forEach(t => clearTimeout(t));
    peekQueueTimeouts = [];
    actions.forEach((fn, idx) => {
        if (idx === 0) {
            fn();
        } else {
            const t = setTimeout(fn, idx * 4600);
            peekQueueTimeouts.push(t);
        }
    });
}

ipcRenderer.on('power-update', (event, msg) => {
    if (!msg) return;
    if (msg.laptop) {
        const prevChg = powerState.laptop.charging;
        const wasInit = powerState.laptop.initialized;
        powerState.laptop.battery = Number(msg.laptop.battery) || powerState.laptop.battery;
        powerState.laptop.charging = Boolean(msg.laptop.charging);
        powerState.laptop.initialized = true;
        if (wasInit && prevChg !== powerState.laptop.charging) {
            triggerChargePeek(powerState.laptop.charging, powerState.laptop.battery);
        }
    }
    if (Array.isArray(msg.devices)) {
        powerState.devices = msg.devices;
        // 1. Pilih HP
        const phones = msg.devices.filter(d => d.kind === 'phone');
        powerState.phone = phones.find(d => d.connected) || phones[0] || null;

        // 2. Pilih TWS / Headset / Speaker (prioritaskan yang sedang connected, lalu yang punya info baterai)
        const audios = msg.devices.filter(d => d.kind === 'audio');
        powerState.audio = audios.find(d => d.connected) || audios.find(d => d.battery >= 0) || audios[0] || null;

        // 3. Pilih Mouse / Keyboard / Gamepad / USB Periferal
        const periphs = msg.devices.filter(d => d.kind === 'mouse' || d.kind === 'keyboard' || d.kind === 'gamepad' || d.kind === 'usb');
        powerState.periph = periphs.find(d => d.connected) || periphs[0] || null;

        const queuedPeeks = [];

        for (const d of msg.devices) {
            const k = `${d.name}`;
            if (d.connected && !seenConnectedDevKeys.has(k)) {
                seenConnectedDevKeys.add(k);
                if (!initialBtPass || d.kind !== 'phone') {
                    const snap = Object.assign({}, d);
                    queuedPeeks.push(() => triggerBtPeek(snap, false));
                }
            } else if (!d.connected && seenConnectedDevKeys.has(k)) {
                seenConnectedDevKeys.delete(k);
                const snap = Object.assign({}, d, { connected: false });
                queuedPeeks.push(() => triggerBtPeek(snap, true));
            }
        }

        // Deteksi perubahan status Cas HP (saat HP dicolok / dilepas cas)
        if (powerState.phone) {
            const nowPhoneChg = Boolean(powerState.phone.charging);
            if (lastPhoneChargingState === null) {
                lastPhoneChargingState = nowPhoneChg;
                if (nowPhoneChg) {
                    const pSnap = Object.assign({}, powerState.phone);
                    queuedPeeks.push(() => triggerChargePeek(true, pSnap.battery, pSnap.name, `HP sedang diisi daya · ${pSnap.battery}%`));
                }
            } else if (lastPhoneChargingState !== nowPhoneChg) {
                lastPhoneChargingState = nowPhoneChg;
                const pSnap = Object.assign({}, powerState.phone);
                queuedPeeks.push(() => triggerChargePeek(
                    nowPhoneChg,
                    pSnap.battery,
                    pSnap.name,
                    nowPhoneChg ? `HP sedang diisi daya · ${pSnap.battery}%` : `Cas HP dilepas · ${pSnap.battery}%`
                ));
            }
        }

        if (queuedPeeks.length > 0) {
            schedulePeekSequence(queuedPeeks);
        }

        initialBtPass = false;
    }
    renderPowerUI();
});

