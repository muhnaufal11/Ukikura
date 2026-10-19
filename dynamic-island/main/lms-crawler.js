"use strict";
const { BrowserWindow } = require("electron");
const http = require("http");
const path = require("path");
const PROXY_PORT = 8089;
let loginWindow = null;
let getMainWindow = () => null;
function initLmsCrawler(mainWinGetter) { getMainWindow = mainWinGetter; }

// Jendela khusus untuk Login LMS langsung dari Dynamic Island agar otomatis menangkap sesi MoodleSession
// dan melakukan background crawl semua mata kuliah & tugas secara berkala tanpa perlu buka browser utama!
const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
let backgroundScraperWin = null;

async function openLmsLoginWindow() {
    if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.focus();
        return;
    }

    const fs = require('fs');
    const iconCandidate = path.join(__dirname, '..', '..', 'assets', 'ukikura-logo.ico');
    loginWindow = new BrowserWindow({
        width: 1020,
        height: 720,
        icon: fs.existsSync(iconCandidate) ? iconCandidate : undefined,
        title: 'Memuat LMS Telkom University...',
        backgroundColor: '#0f172a',
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    loginWindow.webContents.setUserAgent(CHROME_UA);

    // Bypass error sertifikat jika ada proxy lokal atau chain warning
    loginWindow.webContents.on('certificate-error', (event, url, error, cert, callback) => {
        event.preventDefault();
        callback(true);
    });

    // Pintasan keyboard: F5 / Ctrl+R untuk refresh, F12 untuk devtools jika dibutuhkan
    loginWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        if (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r')) {
            loginWindow.reload();
            event.preventDefault();
        } else if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
            loginWindow.webContents.toggleDevTools();
            event.preventDefault();
        }
    });

    let redirectRetried = false;

    // Tangani ERR_TOO_MANY_REDIRECTS (-310) dengan membersihkan cookie Moodle yang kedaluwarsa secara otomatis
    loginWindow.webContents.on('did-fail-load', async (event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (errorCode === -3 || isMainFrame === false) return;
        if (!loginWindow || loginWindow.isDestroyed()) return;

        if (errorCode === -310 && !redirectRetried) {
            redirectRetried = true;
            try {
                await loginWindow.webContents.session.clearStorageData({
                    origin: 'https://lms.telkomuniversity.ac.id',
                    storages: ['cookies', 'cachestorage', 'serviceworkers']
                });
                await loginWindow.webContents.session.clearCache();
                if (loginWindow && !loginWindow.isDestroyed()) {
                    loginWindow.loadURL('https://lms.telkomuniversity.ac.id/?redirect=0');
                }
                return;
            } catch (_) {}
        }

        loginWindow.setTitle('Gagal Memuat LMS Telkom University');
        const failHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Koneksi Terputus</title>
    <style>
        body {
            margin: 0; background: #0f172a; color: #f8fafc;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex; align-items: center; justify-content: center; height: 100vh;
        }
        .box {
            background: #1e293b; padding: 36px; border-radius: 16px;
            border: 1px solid #334155; text-align: center; max-width: 440px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.4);
        }
        h2 { margin: 0 0 10px; font-size: 20px; font-weight: 600; color: #f87171; }
        p { margin: 0 0 20px; color: #94a3b8; font-size: 14px; line-height: 1.5; }
        .code { font-family: monospace; font-size: 12px; color: #64748b; margin-bottom: 24px; }
        button {
            background: #3b82f6; color: #ffffff; border: none; padding: 10px 24px;
            border-radius: 8px; font-weight: 600; font-size: 14px; cursor: pointer;
            box-shadow: 0 4px 6px -1px rgba(59, 130, 246, 0.3);
            transition: all 0.2s;
        }
        button:hover { background: #2563eb; transform: translateY(-1px); }
    </style>
</head>
<body>
    <div class="box">
        <h2>Gagal Terhubung ke LMS</h2>
        <p>Halaman LMS Telkom University gagal dimuat. Periksa sambungan internet Anda atau klik tombol di bawah untuk mereset sesi login.</p>
        <div class="code">${errorDescription} (${errorCode})</div>
        <button onclick="window.location.href='https://lms.telkomuniversity.ac.id/?redirect=0'">Coba Muat Ulang</button>
    </div>
</body>
</html>`;
        loginWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(failHtml)}`);
    });

    // Pulihkan cookie MoodleSession yang tersimpan (JANGAN dihapus saat membuka jendela!)
    await ensurePersistentLmsCookie(loginWindow.webContents.session);

    let autoSsoAttempted = false;

    if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.loadURL('https://lms.telkomuniversity.ac.id/my/courses.php');
    }

    // Pantau setiap navigasi selesai untuk mengecek apakah user sudah berhasil login
    loginWindow.webContents.on('did-finish-load', async () => {
        if (!loginWindow || loginWindow.isDestroyed()) return;
        const currentUrl = loginWindow.webContents.getURL();
        if (currentUrl.startsWith('data:')) return;

        loginWindow.setTitle('Login LMS Telkom University — Sinkronisasi Dynamic Island');

        // Jika terlempar ke halaman login LMS, otomatis klik "Connect with Office365" sekali agar SSO Microsoft menyambung ulang otomatis
        if (currentUrl.includes('lms.telkomuniversity.ac.id/login/') && !autoSsoAttempted) {
            autoSsoAttempted = true;
            try {
                const clicked = await loginWindow.webContents.executeJavaScript(`
                    (function() {
                        const ssoBtn = document.querySelector('a[href*="auth/oidc"], a[href*="oauth2"], .login-identityprovider-btn, a.btn-block');
                        if (ssoBtn && /office|365|microsoft|sso|oidc/i.test((ssoBtn.innerText || '') + ' ' + (ssoBtn.href || ''))) {
                            ssoBtn.click();
                            return true;
                        }
                        return false;
                    })();
                `);
                if (clicked) {
                    loginWindow.setTitle('Menyambungkan ulang sesi Office365 SSO...');
                    return;
                }
            } catch (_) {}
        }

        if (currentUrl.includes('lms.telkomuniversity.ac.id') && !currentUrl.includes('/login/') && !currentUrl.includes('/auth/oidc')) {
            loginWindow.setTitle('Login Berhasil — Sesi telah tersinkronisasi');
            await captureCookiesAndScrape(loginWindow);
            setTimeout(() => {
                if (loginWindow && !loginWindow.isDestroyed()) {
                    loginWindow.close();
                }
            }, 1500);
        }
    });

    loginWindow.on('closed', () => {
        loginWindow = null;
    });
}

async function ensurePersistentLmsCookie(sess) {
    try {
        const existingCookies = await sess.cookies.get({ url: 'https://lms.telkomuniversity.ac.id', name: 'MoodleSession' });
        if (existingCookies && existingCookies.length > 1) {
            for (const c of existingCookies) {
                await sess.cookies.remove('https://lms.telkomuniversity.ac.id', c.name);
            }
        }
        const { loadKuraConfig } = require('./kura-server');
        const savedCfg = loadKuraConfig();
        if (savedCfg && savedCfg.lmsCookie) {
            const m = savedCfg.lmsCookie.match(/MoodleSession=([^;\s]+)/);
            if (m && m[1]) {
                const currentVal = (existingCookies && existingCookies.length === 1) ? existingCookies[0].value : m[1];
                await sess.cookies.set({
                    url: 'https://lms.telkomuniversity.ac.id',
                    name: 'MoodleSession',
                    value: currentVal,
                    path: '/',
                    secure: true,
                    httpOnly: true,
                    expirationDate: Math.floor(Date.now() / 1000) + (14 * 86400)
                });
            }
        }
        if (sess.cookies.flushStore) {
            await sess.cookies.flushStore();
        }
    } catch (_) {}
}

async function persistCurrentLmsCookies(sess) {
    try {
        const cookies = await sess.cookies.get({ domain: 'lms.telkomuniversity.ac.id' });
        if (cookies && cookies.length > 0) {
            const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            if (cookieStr.includes('MoodleSession')) {
                postJsonToServer('/__qbot__/config', { lmsCookie: cookieStr });
                const moodleCookie = cookies.find(c => c.name === 'MoodleSession');
                if (moodleCookie && moodleCookie.value) {
                    await sess.cookies.set({
                        url: 'https://lms.telkomuniversity.ac.id',
                        name: 'MoodleSession',
                        value: moodleCookie.value,
                        path: '/',
                        secure: true,
                        httpOnly: true,
                        expirationDate: Math.floor(Date.now() / 1000) + (14 * 86400)
                    });
                }
            }
        }
        if (sess.cookies.flushStore) {
            await sess.cookies.flushStore();
        }
    } catch (_) {}
}

async function captureCookiesAndScrape(win) {
    try {
        await persistCurrentLmsCookies(win.webContents.session);

        // Jalankan injeksi pemindai tugas/kuis di background tanpa menahan penutupan jendela login
        runHiddenLmsCrawler().catch(() => {});
    } catch (e) {
        console.error('[Dynamic Island] Gagal menangkap sesi LMS:', e.message);
    }
}

async function runHiddenLmsCrawler() {
    if (backgroundScraperWin && !backgroundScraperWin.isDestroyed()) {
        return;
    }

    backgroundScraperWin = new BrowserWindow({
        width: 800,
        height: 600,
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });
    backgroundScraperWin.webContents.setUserAgent(CHROME_UA);

    try {
        await ensurePersistentLmsCookie(backgroundScraperWin.webContents.session);

        try {
            await backgroundScraperWin.loadURL('https://lms.telkomuniversity.ac.id/my/courses.php');
        } catch (loadErr) {
            if (String(loadErr.message || '').includes('-310')) {
                await backgroundScraperWin.webContents.session.clearStorageData({
                    origin: 'https://lms.telkomuniversity.ac.id',
                    storages: ['cookies']
                });
            }
            throw loadErr;
        }

        let currentUrl = backgroundScraperWin.webContents.getURL();
        // Jika sesi Moodle habis di server, coba silent auto-login via tombol Office365 SSO di background
        if (currentUrl.includes('/login/')) {
            try {
                const ssoHref = await backgroundScraperWin.webContents.executeJavaScript(`
                    (function() {
                        const ssoBtn = document.querySelector('a[href*="auth/oidc"], a[href*="oauth2"], .login-identityprovider-btn');
                        return ssoBtn ? ssoBtn.href : '';
                    })();
                `);
                if (ssoHref) {
                    await backgroundScraperWin.loadURL(ssoHref);
                    await new Promise(r => setTimeout(r, 3500));
                    currentUrl = backgroundScraperWin.webContents.getURL();
                }
            } catch (_) {}
        }

        if (!currentUrl.includes('lms.telkomuniversity.ac.id') || currentUrl.includes('/login/')) {
            // Belum login di session Electron, biarkan server sync via iCal/Proxy Cookie
            backgroundScraperWin.destroy();
            backgroundScraperWin = null;
            return { ok: false, reason: 'not-logged-in' };
        }

        // Tangkap & kunci cookie terbaru secara persisten
        await persistCurrentLmsCookies(backgroundScraperWin.webContents.session);

        // Eksekusi script crawler di halaman /my/courses.php (memanfaatkan Moodle AJAX API core_course_get_enrolled_courses_by_timeline_classification & core_calendar_get_action_events_by_timesort + fallback DOM)
        const scrapedData = await backgroundScraperWin.webContents.executeJavaScript(`
            (async function() {
                const months = {
                    'januari': 0, 'jan': 0, 'january': 0,
                    'februari': 1, 'feb': 1, 'february': 1,
                    'maret': 2, 'mar': 2, 'march': 2,
                    'april': 3, 'apr': 3,
                    'mei': 4, 'may': 4,
                    'juni': 5, 'jun': 5, 'june': 5,
                    'juli': 6, 'jul': 6, 'july': 6,
                    'agustus': 7, 'ags': 7, 'aug': 7, 'august': 7,
                    'september': 8, 'sep': 8,
                    'oktober': 9, 'okt': 9, 'oct': 9, 'october': 9,
                    'november': 10, 'nov': 10,
                    'desember': 11, 'des': 11, 'dec': 11, 'december': 11
                };
                function parseDateStr(text) {
                    if (!text) return null;
                    const m = text.match(/(\\d{1,2})\\s+([a-zA-Z]+)(?:\\s+(\\d{4}))?[,\\s]+(?:pukul\\s+|at\\s+)?(\\d{1,2})[:.](\\d{2})(?:\\s*([ap]\\.?m\\.?))?/i);
                    if (m) {
                        const day = parseInt(m[1], 10);
                        const mName = m[2].toLowerCase();
                        const year = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
                        let hour = parseInt(m[4], 10);
                        const min = parseInt(m[5], 10);
                        const ampm = m[6] ? m[6].toLowerCase().replace(/\\./g, '') : null;
                        if (months[mName] !== undefined) {
                            if (ampm === 'pm' && hour < 12) hour += 12;
                            if (ampm === 'am' && hour === 12) hour = 0;
                            return new Date(year, months[mName], day, hour, min, 0).getTime();
                        }
                    }
                    const p = Date.parse(text);
                    return isNaN(p) ? null : p;
                }

                // Tunggu sebentar bila kartu mata kuliah sedang dimuat via AJAX oleh Moodle
                await new Promise(r => setTimeout(r, 2500));

                const tasks = [];
                const sesskey = (window.M && window.M.cfg && window.M.cfg.sesskey) ? window.M.cfg.sesskey : null;

                // 1. Gunakan Moodle Internal AJAX Service untuk mengambil Timeline Action Events (paling akurat & lengkap dengan timestamp deadline!)
                if (sesskey) {
                    try {
                        const nowSec = Math.floor(Date.now() / 1000) - (7 * 86400); // Mulai dari 7 hari lalu hingga masa depan
                        const ajaxRes = await fetch('/lib/ajax/service.php?sesskey=' + sesskey + '&info=core_calendar_get_action_events_by_timesort', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify([{
                                index: 0,
                                methodname: 'core_calendar_get_action_events_by_timesort',
                                args: {
                                    limitnum: 50,
                                    timesortfrom: nowSec,
                                    limittononsuspendedevents: true
                                }
                            }])
                        });
                        const ajaxJson = await ajaxRes.json();
                        if (ajaxJson && ajaxJson[0] && !ajaxJson[0].error && ajaxJson[0].data && Array.isArray(ajaxJson[0].data.events)) {
                            for (const ev of ajaxJson[0].data.events) {
                                const modName = (ev.modulename || '').toLowerCase();
                                if (modName !== 'quiz' && modName !== 'assign') continue;
                                const viewUrl = (ev.url || (ev.action && ev.action.url) || '').replace(/&amp;/g, '&');
                                tasks.push({
                                    id: viewUrl || ('ev_' + ev.id),
                                    title: (ev.activityname || ev.name || 'Tugas LMS').replace(/\\s+is due$/i, '').replace(/\\s+closes$/i, '').trim(),
                                    courseId: ev.course ? String(ev.course.id) : '',
                                    courseName: ev.course ? (ev.course.fullname || ev.course.shortname || 'Mata Kuliah') : 'Mata Kuliah',
                                    type: modName === 'assign' ? 'assign' : 'quiz',
                                    href: viewUrl,
                                    dueTimestamp: ev.timesort ? (ev.timesort * 1000) : null,
                                    isDone: false
                                });
                            }
                        }
                    } catch (e) {}
                }

                // 2. Ambil daftar semua mata kuliah aktif via AJAX atau DOM lalu pindai aktivitasnya
                let courses = [];
                if (sesskey) {
                    try {
                        const cRes = await fetch('/lib/ajax/service.php?sesskey=' + sesskey + '&info=core_course_get_enrolled_courses_by_timeline_classification', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify([{
                                index: 0,
                                methodname: 'core_course_get_enrolled_courses_by_timeline_classification',
                                args: {
                                    offset: 0,
                                    limit: 24,
                                    classification: 'inprogress',
                                    sort: 'fullname'
                                }
                            }])
                        });
                        const cJson = await cRes.json();
                        if (cJson && cJson[0] && !cJson[0].error && cJson[0].data && Array.isArray(cJson[0].data.courses)) {
                            courses = cJson[0].data.courses.map(c => ({
                                id: String(c.id),
                                name: c.fullname || c.shortname || ('Mata Kuliah #' + c.id),
                                url: c.viewurl || ('https://lms.telkomuniversity.ac.id/course/view.php?id=' + c.id)
                            }));
                        }
                    } catch (e) {}
                }

                if (courses.length === 0) {
                    const links = Array.from(document.querySelectorAll('a[href*="/course/view.php?id="]'));
                    const seenC = new Set();
                    for (const a of links) {
                        const m = a.href.match(/id=(\\d+)/);
                        if (!m || m[1] === '1' || seenC.has(m[1])) continue;
                        const name = (a.innerText || '').replace(/\\s+/g, ' ').trim();
                        if (name.length > 2) {
                            seenC.add(m[1]);
                            courses.push({ id: m[1], name, url: a.href });
                        }
                    }
                }

                function inspectActivityHtml(actHtml) {
                    const low = actHtml.toLowerCase();
                    const isDone =
                        low.includes('terkirim dan siap dinilai') ||
                        low.includes('submitted for grading') ||
                        low.includes('dikumpulkan untuk dinilai') ||
                        low.includes('sudah dikumpulkan') ||
                        low.includes('telah dikirim') ||
                        low.includes('penugasan diajukan') ||
                        low.includes('assignment was submitted') ||
                        low.includes('submissionstatussubmitted') ||
                        low.includes('earlysubmission') ||
                        low.includes('edit pengajuan') ||
                        low.includes('hapus pengajuan') ||
                        low.includes('edit submission') ||
                        low.includes('remove submission') ||
                        low.includes('nilai akhir anda untuk kuis ini') ||
                        low.includes('your final grade for this quiz') ||
                        low.includes('tidak ada lagi kesempatan') ||
                        low.includes('no more attempts are allowed') ||
                        (low.includes('quizattemptsummary') && (
                            low.includes('>selesai<') ||
                            low.includes('>finished<') ||
                            low.includes('dikirimkan') ||
                            low.includes('submitted')
                        )) ||
                        (low.includes('badge-success') && (low.includes('done') || low.includes('selesai')));

                    let dueTs = null;
                    const textLines = actHtml
                        .replace(/<\\/(tr|p|div|li|h\\d|td|th)>/gi, '\\n')
                        .replace(/<[^>]+>/g, ' ')
                        .split('\\n');
                    for (let i = 0; i < textLines.length; i++) {
                        const ln = textLines[i].replace(/&nbsp;/gi, ' ').replace(/\\s+/g, ' ').trim();
                        const l = ln.toLowerCase();
                        if (l.includes('jatuh tempo') || l.includes('due:') || l.includes('due date') || l.includes('batas waktu') || l.includes('ditutup') || l.includes('closes:') || l.includes('closed:')) {
                            dueTs = parseDateStr(ln) || (textLines[i + 1] ? parseDateStr(textLines[i + 1]) : null);
                            if (dueTs) break;
                        }
                    }
                    if (!dueTs) {
                        const dtMatch = actHtml.match(/datetime=["']([^"']+)["']/i);
                        if (dtMatch && dtMatch[1]) {
                            const p = Date.parse(dtMatch[1]);
                            if (!isNaN(p)) dueTs = p;
                        }
                    }
                    return { isDone, dueTs };
                }

                for (const c of courses.slice(0, 15)) {
                    try {
                        const html = await fetch(c.url, { credentials: 'same-origin' }).then(r => r.text());
                        const doc = new DOMParser().parseFromString(html, 'text/html');
                        const items = Array.from(doc.querySelectorAll('li.activity.quiz, li.activity.assign, div.activity-item[data-activityname], a[href*="/mod/quiz/view.php"], a[href*="/mod/assign/view.php"]'));
                        const seenHref = new Set();
                        for (const el of items) {
                            const link = el.tagName === 'A' ? el : el.querySelector('a[href*="/mod/quiz/view.php"], a[href*="/mod/assign/view.php"]');
                            if (!link || !link.href) continue;
                            const cleanHref = link.href.split('&')[0];
                            if (seenHref.has(cleanHref)) continue;
                            seenHref.add(cleanHref);

                            const isAssign = cleanHref.includes('/mod/assign/');
                            const title = ((link.querySelector('.instancename') || link).textContent || '').replace(/\\s+(Quiz|Kuis|Assignment|Tugas|Forum)$/i, '').replace(/\\s+/g, ' ').trim();
                            const parent = link.closest('.activity, .activity-item, li') || el;
                            const parentText = (parent ? parent.innerText : '').toLowerCase();
                            const hasDoneIcon = Boolean(parent && parent.querySelector(
                                '.badge-success, ' +
                                '[data-action="toggle-manual-completion"][data-value="1"], ' +
                                'img[src*="completion-auto-y"], img[src*="completion-manual-y"], img[src*="completion-y"], ' +
                                'img[alt*="Selesai"], img[alt*="Completed"], img[title*="Selesai"], img[title*="Completed"], ' +
                                'input[type="checkbox"][checked]'
                            ));
                            const isDone = hasDoneIcon ||
                                parentText.includes('done:') ||
                                parentText.includes('selesai:') ||
                                parentText.includes('submitted for grading') ||
                                parentText.includes('terkirim dan siap dinilai') ||
                                parentText.includes('dikumpulkan');

                            let dueTs = null;
                            const timeEl = parent ? parent.querySelector('time[datetime], [datetime]') : null;
                            if (timeEl) {
                                const p = Date.parse(timeEl.getAttribute('datetime'));
                                if (!isNaN(p)) dueTs = p;
                            }
                            if (!dueTs && parent) {
                                const lines = (parent.innerText || '').split('\\n');
                                for (const ln of lines) {
                                    const l = ln.toLowerCase();
                                    if (l.includes('due') || l.includes('close') || l.includes('batas') || l.includes('ditutup') || l.includes('jatuh tempo')) {
                                        dueTs = parseDateStr(ln);
                                        if (dueTs) break;
                                    }
                                }
                            }

                            tasks.push({
                                id: cleanHref,
                                title: title || (isAssign ? 'Tugas Kuliah' : 'Kuis Kuliah'),
                                courseId: c.id,
                                courseName: c.name,
                                type: isAssign ? 'assign' : 'quiz',
                                href: cleanHref,
                                dueTimestamp: dueTs,
                                isDone: isDone
                            });
                        }
                    } catch (e) {}
                }

                // Deduplikasi tasks berdasarkan href sebelum mengecek detail halaman aktivitas
                const taskMap = new Map();
                for (const t of tasks) {
                    const existing = taskMap.get(t.id);
                    if (!existing) {
                        taskMap.set(t.id, t);
                    } else {
                        if (t.isDone) existing.isDone = true;
                        if (t.dueTimestamp && !existing.dueTimestamp) existing.dueTimestamp = t.dueTimestamp;
                        if (t.courseId && !existing.courseId) existing.courseId = t.courseId;
                    }
                }
                const uniqueTasks = Array.from(taskMap.values());

                // Periksa halaman dalam (/mod/assign/view.php atau /mod/quiz/view.php) secara paralel (batch 8)
                // untuk membaca "Terkirim dan siap dinilai" / "Selesai" serta "Jatuh tempo"
                const needDetail = uniqueTasks.filter(t => (!t.isDone || !t.dueTimestamp) && t.href && t.href.includes('/view.php'));
                const batchSize = 8;
                for (let i = 0; i < needDetail.length; i += batchSize) {
                    const batch = needDetail.slice(i, i + batchSize);
                    await Promise.all(batch.map(async (t) => {
                        try {
                            const actHtml = await fetch(t.href, { credentials: 'same-origin' }).then(r => r.text());
                            const info = inspectActivityHtml(actHtml);
                            if (info.isDone) t.isDone = true;
                            if (info.dueTs && !t.dueTimestamp) t.dueTimestamp = info.dueTs;
                        } catch (e) {}
                    }));
                }

                return { totalCourses: courses.length, tasks: uniqueTasks };
            })();
        `);

        if (scrapedData && Array.isArray(scrapedData.tasks) && scrapedData.tasks.length > 0) {
            postJsonToServer('/__qbot__/tasks', {
                source: 'electron-background-session',
                totalCourses: scrapedData.totalCourses || 1,
                replaceAll: false,
                tasks: scrapedData.tasks
            });
            const mainWindow = getMainWindow(); if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('sync-status', { ok: true, count: scrapedData.tasks.length });
            }
        }
    } catch (err) {
        console.warn('[Dynamic Island] Background crawler error:', err.message);
    } finally {
        if (backgroundScraperWin && !backgroundScraperWin.isDestroyed()) {
            backgroundScraperWin.destroy();
        }
        backgroundScraperWin = null;
    }
}

function postJsonToServer(urlPath, obj) {
    const data = JSON.stringify(obj);
    const req = http.request({
        hostname: '127.0.0.1',
        port: PROXY_PORT,
        path: urlPath,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    }, (res) => { res.resume(); });
    req.on('error', () => {});
    req.write(data);
    req.end();
}


module.exports = { initLmsCrawler, openLmsLoginWindow, runHiddenLmsCrawler, postJsonToServer };
