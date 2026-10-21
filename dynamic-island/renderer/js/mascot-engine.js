// ================= ANIMASI HIDUP MASKOT NUSA (11 EMOSI + CURSOR TRACKING + FLOATING EMOTE) =================
const lPetEl = document.getElementById('l-pet');
const eyesContainerEl = document.querySelector('#l-pet .eyes');
const petEmoteEl = document.getElementById('pet-emote');

const ALL_MOODS = [
    'mood-happy',
    'mood-love',
    'mood-wink',
    'mood-curious',
    'mood-surprised',
    'mood-angry',
    'mood-sad',
    'mood-sleepy',
    'mood-suspicious',
    'mood-starry',
    'mood-dizzy'
];

let currentMood = '';
let eyeTargetX = 0;
let eyeTargetY = 0;
let eyeCurX = 0;
let eyeCurY = 0;
let eyeVelX = 0;
let eyeVelY = 0;
let lastCursorMoveAt = 0;
let lastCursorDx = 0;
let cursorShakeScore = 0;
let idleGazeX = 0;
let idleGazeY = 0;
let blinkFactor = 1;
let leftEyeScaleY = 1;
let rightEyeScaleY = 1;
let leftEyeScaleX = 1;
let rightEyeScaleX = 1;
let emoteHideTimer = null;
let moodCycleIdx = 0;

function showPetEmote() {
    if (petEmoteEl) petEmoteEl.classList.remove('show');
}

let moodResetTimer = null;
function setMascotEmotion(moodName, durationMs = 1800) {
    if (!eyesContainerEl || !lPetEl) return;
    if (moodResetTimer) {
        clearTimeout(moodResetTimer);
        moodResetTimer = null;
    }
    eyesContainerEl.classList.remove(...ALL_MOODS);
    lPetEl.classList.remove(...ALL_MOODS);
    currentMood = moodName || '';
    leftEyeScaleX = 1;
    rightEyeScaleX = 1;
    leftEyeScaleY = 1;
    rightEyeScaleY = 1;

    if (currentMood) {
        eyesContainerEl.classList.add(currentMood);
        lPetEl.classList.add(currentMood);
        ensureLivingEyesLoop();
        // Setelah menampilkan 1 emosi, otomatis kembali ke mata normal yang tenang agar tidak menumpuk sekaligus
        moodResetTimer = setTimeout(() => {
            if (!eyesContainerEl || !lPetEl) return;
            eyesContainerEl.classList.remove(...ALL_MOODS);
            lPetEl.classList.remove(...ALL_MOODS);
            currentMood = '';
            idleGazeX = 0;
            idleGazeY = 0;
            ensureLivingEyesLoop();
        }, durationMs);
    }
}

ipcRenderer.on('nusa-cursor', (event, pt) => {
    if (!pt) return;
    ensureLivingEyesLoop();
    const now = performance.now();
    const deltaDx = pt.dx - lastCursorDx;
    if (Math.abs(deltaDx) > 38 && Math.sign(deltaDx) !== Math.sign(lastCursorDx)) {
        cursorShakeScore = Math.min(10, cursorShakeScore + 2.5);
    } else {
        cursorShakeScore = Math.max(0, cursorShakeScore - 0.35);
    }
    lastCursorDx = pt.dx;
    lastCursorMoveAt = now;

    // Normalisasi jarak kursor dari tengah notch menjadi lirikan mata (-9px s/d +9px horizontal, -2.8px s/d +3px vertikal)
    const maxDx = 520;
    const maxDy = 420;
    const nx = Math.max(-1, Math.min(1, pt.dx / maxDx));
    const ny = Math.max(-1, Math.min(1, pt.dy / maxDy));
    eyeTargetX = nx * 8.8;
    eyeTargetY = ny * 2.8;

    const dist = Math.hypot(pt.dx, pt.dy);
    // Hanya jika user menggoyangkan kursor cepat di dekat maskot -> ekspresi Pusing
    if (cursorShakeScore >= 6.5 && dist < 300 && !currentMood) {
        cursorShakeScore = 0;
        setMascotEmotion('mood-dizzy', 1800);
    }
});

// ================= PENGATURAN FPS MASKOT (HEMAT DAYA & ULTRA RINGAN) =================
let mascotFpsSetting = localStorage.getItem('ukikura_mascot_fps') || 'eco';

function getMascotFpsInterval() {
    if (mascotFpsSetting === '15') return 66.6;
    if (mascotFpsSetting === '30') return 33.3;
    if (mascotFpsSetting === '60') return 16.6;
    return 33.3; // 'eco' default 30 FPS saat kursor bergerak
}

function applyMascotFpsClass() {
    if (mnEl) {
        mnEl.classList.toggle('fps-eco', mascotFpsSetting === 'eco');
        mnEl.classList.toggle('fps-15', mascotFpsSetting === '15');
        mnEl.classList.toggle('fps-30', mascotFpsSetting === '30');
        mnEl.classList.toggle('fps-60', mascotFpsSetting === '60');
    }
}

function updateMascotFpsLabel() {
    applyMascotFpsClass();
    const lbl = document.getElementById('mascot-fps-label');
    if (!lbl) return;
    if (mascotFpsSetting === 'eco') lbl.textContent = 'Eco';
    else if (mascotFpsSetting === '15') lbl.textContent = '15 FPS';
    else if (mascotFpsSetting === '30') lbl.textContent = '30 FPS';
    else lbl.textContent = '60 FPS';
}

function cycleMascotFps() {
    const sequence = ['eco', '60', '30', '15'];
    const curIdx = sequence.indexOf(mascotFpsSetting);
    mascotFpsSetting = sequence[(curIdx + 1) % sequence.length];
    localStorage.setItem('ukikura_mascot_fps', mascotFpsSetting);
    updateMascotFpsLabel();
    ensureLivingEyesLoop();
}

// Kedip natural & kedip ganda (Double Blink) berkala (hanya saat mata normal / tidak sedang ekspresi khusus)
function scheduleNextBlink() {
    const delay = 2200 + Math.random() * 3400;
    setTimeout(() => {
        if (currentMood) {
            scheduleNextBlink();
            return;
        }
        const isDouble = Math.random() < 0.35;
        blinkFactor = 0.14;
        ensureLivingEyesLoop();
        setTimeout(() => {
            blinkFactor = 1;
            ensureLivingEyesLoop();
            if (isDouble) {
                setTimeout(() => {
                    blinkFactor = 0.14;
                    ensureLivingEyesLoop();
                    setTimeout(() => {
                        blinkFactor = 1;
                        ensureLivingEyesLoop();
                        scheduleNextBlink();
                    }, 85);
                }, 110);
            } else {
                scheduleNextBlink();
            }
        }, 90);
    }, delay);
}
scheduleNextBlink();

// Daftar ekspresi yang muncul satu per satu secara bergantian (dengan jeda mata normal di antaranya)
const EMOTION_SCENES = [
    { mood: 'mood-happy', duration: 1900, setup: () => { idleGazeX = 0; idleGazeY = -1; } },
    { mood: 'mood-curious', duration: 2000, setup: () => { idleGazeX = (Math.random() < 0.5 ? -1 : 1) * 6; idleGazeY = -0.6; } },
    { mood: 'mood-wink', duration: 1500, setup: () => { idleGazeX = 2; idleGazeY = -0.5; } },
    { mood: 'mood-love', duration: 2000, setup: () => { idleGazeX = 0; idleGazeY = -0.8; } },
    {
        mood: 'mood-suspicious',
        duration: 2200,
        setup: () => {
            idleGazeX = -7.5;
            idleGazeY = 0.4;
            setTimeout(() => { if (currentMood === 'mood-suspicious') idleGazeX = 7.5; }, 950);
        }
    },
    { mood: 'mood-surprised', duration: 1600, setup: () => { idleGazeX = 0; idleGazeY = -1; } },
    { mood: 'mood-starry', duration: 1900, setup: () => { idleGazeX = (Math.random() - 0.5) * 4; idleGazeY = -0.8; } },
    { mood: 'mood-angry', duration: 1800, setup: () => { idleGazeX = 0; idleGazeY = 0.6; } },
    { mood: 'mood-sad', duration: 2000, setup: () => { idleGazeX = (Math.random() - 0.5) * 3; idleGazeY = 1.8; } },
    { mood: 'mood-sleepy', duration: 2400, setup: () => { idleGazeX = 0; idleGazeY = 1.2; } }
];

// Jadwalkan 1 emosi setiap 5.5 - 8.5 detik saat kursor diam, lalu kembali ke mata normal (tidak pernah muncul sekaligus)
function scheduleNextEmotionScene() {
    const waitMs = 5500 + Math.random() * 3000;
    setTimeout(() => {
        if (!eyesContainerEl) {
            scheduleNextEmotionScene();
            return;
        }
        const now = performance.now();
        const cursorIdle = (now - lastCursorMoveAt) > 2000;

        // Hanya tampilkan emosi mandiri saat kursor sedang tidak digerakkan dan sedang dalam mata normal
        if (cursorIdle && !currentMood && !isExpanded && mnEl.dataset.s === 'pet') {
            const scene = EMOTION_SCENES[moodCycleIdx % EMOTION_SCENES.length];
            moodCycleIdx++;
            scene.setup();
            setMascotEmotion(scene.mood, scene.duration);
        }
        scheduleNextEmotionScene();
    }, waitMs);
}
scheduleNextEmotionScene();

// Loop fisika pegas adaptif untuk pergerakan mata maskot (Settled Zero-Repaint)
let lastEyeTick = performance.now();
let lastMascotRenderTime = 0;
let lastRenderedStateKey = '';
let isLivingEyesRunning = false;

function ensureLivingEyesLoop() {
    if (isLivingEyesRunning) return;
    isLivingEyesRunning = true;
    lastEyeTick = performance.now();
    requestAnimationFrame(stepLivingEyes);
}

function stepLivingEyes(now) {
    if (isExpanded || mnEl.dataset.s !== 'pet' || !eyesContainerEl) {
        isLivingEyesRunning = false;
        return;
    }

    const interval = getMascotFpsInterval();
    if ((now - lastMascotRenderTime) < (interval - 1.5)) {
        if (isLivingEyesRunning) requestAnimationFrame(stepLivingEyes);
        return;
    }

    const dt = Math.min(0.05, (now - lastEyeTick) / 1000);
    lastEyeTick = now;

    const cursorActive = (now - lastCursorMoveAt) <= 1600;
    const tx = cursorActive ? eyeTargetX : idleGazeX;
    const ty = cursorActive ? eyeTargetY : idleGazeY;

    // Spring damper
    const stiffness = 145;
    const damping = 16;
    eyeVelX += (stiffness * (tx - eyeCurX) - damping * eyeVelX) * dt;
    eyeVelY += (stiffness * (ty - eyeCurY) - damping * eyeVelY) * dt;
    eyeCurX += eyeVelX * dt;
    eyeCurY += eyeVelY * dt;

    if (Math.abs(tx - eyeCurX) < 0.12 && Math.abs(eyeVelX) < 0.25) {
        eyeCurX = tx;
        eyeVelX = 0;
    }
    if (Math.abs(ty - eyeCurY) < 0.12 && Math.abs(eyeVelY) < 0.25) {
        eyeCurY = ty;
        eyeVelY = 0;
    }

    // Deteksi apakah mata sudah sampai di tujuan dan diam (settled)
    const isMoving = Math.abs(tx - eyeCurX) > 0.08 || Math.abs(ty - eyeCurY) > 0.08 || Math.abs(eyeVelX) > 0.08 || Math.abs(eyeVelY) > 0.08;
    const isSpecialMood = (currentMood === 'mood-dizzy' || currentMood === 'mood-angry');
    const isBlinking = (blinkFactor < 0.98);

    // KUNCI PENGHEMAT CPU (0% IDLE):
    // Jika mata sudah diam dan tidak berkedip, hentikan loop rAF sepenuhnya!
    if (!isMoving && !isSpecialMood && !isBlinking && lastRenderedStateKey === 'settled') {
        isLivingEyesRunning = false;
        return;
    }

    lastMascotRenderTime = now;

    // Batasi kemiringan agar mata tidak pernah terdistorsi miring berlebihan
    const rawTilt = eyeCurX * 0.45 + (currentMood === 'mood-curious' ? -6 : (currentMood === 'mood-wink' ? 5 : 0));
    const clampedTilt = Math.max(-8, Math.min(8, rawTilt));
    const lx = (eyeCurX * 0.22).toFixed(2);
    const rx = (eyeCurX * 0.28).toFixed(2);

    // Gerakan orbit berlawanan khusus saat ekspresi Pusing (mood-dizzy)
    let ly = 0;
    let ry = 0;
    if (currentMood === 'mood-dizzy') {
        ly = Math.sin(now / 110) * 2.4;
        ry = -Math.sin(now / 110) * 2.4;
    } else if (currentMood === 'mood-angry') {
        ly = 0.5;
        ry = 0.5;
    }

    const effectiveBlink = ['mood-happy', 'mood-sleepy', 'mood-wink'].includes(currentMood) ? 1 : blinkFactor;
    const lsy = (leftEyeScaleY * effectiveBlink).toFixed(3);
    const rsy = (rightEyeScaleY * effectiveBlink).toFixed(3);

    const stateKey = (!isMoving && !isSpecialMood && !isBlinking)
        ? 'settled'
        : `${eyeCurX.toFixed(1)}_${eyeCurY.toFixed(1)}_${clampedTilt.toFixed(1)}_${lsy}_${rsy}_${currentMood}`;

    if (stateKey === lastRenderedStateKey && stateKey !== 'settled') {
        if (isLivingEyesRunning) requestAnimationFrame(stepLivingEyes);
        return;
    }
    lastRenderedStateKey = stateKey;

    eyesContainerEl.style.setProperty('--ex', `${eyeCurX.toFixed(2)}px`);
    eyesContainerEl.style.setProperty('--ey', `${eyeCurY.toFixed(2)}px`);
    eyesContainerEl.style.setProperty('--etilt', `${clampedTilt.toFixed(2)}deg`);
    eyesContainerEl.style.setProperty('--lx', `${lx}px`);
    eyesContainerEl.style.setProperty('--rx', `${rx}px`);
    eyesContainerEl.style.setProperty('--ly', `${ly.toFixed(2)}px`);
    eyesContainerEl.style.setProperty('--ry', `${ry.toFixed(2)}px`);
    eyesContainerEl.style.setProperty('--lsx', String(leftEyeScaleX));
    eyesContainerEl.style.setProperty('--rsx', String(rightEyeScaleX));
    eyesContainerEl.style.setProperty('--lsy', lsy);
    eyesContainerEl.style.setProperty('--rsy', rsy);

    if (isMoving || isSpecialMood || isBlinking || stateKey !== 'settled') {
        requestAnimationFrame(stepLivingEyes);
    } else {
        isLivingEyesRunning = false;
    }
}
ensureLivingEyesLoop();
window.ensureLivingEyesLoop = ensureLivingEyesLoop;

updateMascotFpsLabel();

loadConfig();
fetchTasks();
connectStream();
renderNotifications();
renderCalendar();
updateLiveMetrics();
