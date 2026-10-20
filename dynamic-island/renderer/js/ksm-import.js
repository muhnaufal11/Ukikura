// ================= UKIKURA KSM IMPORTER & PARSER =================
// Parser Kartu Studi Mahasiswa (KSM) iGracias Telkom University (PDF & Tabel Web)

function parseKsmContent(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];
    const results = [];
    const dayMap = {
        'SENIN': 1, 'SELASA': 2, 'RABU': 3, 'KAMIS': 4, 'JUMAT': 5, "JUM'AT": 5, 'SABTU': 6, 'MINGGU': 0
    };
    const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const colors = ['#38bdf8', '#a78bfa', '#f59e0b', '#ec4899', '#10b981', '#06b6d4', '#8b5cf6'];

    // Bersihkan tag HTML tabel jika di-paste langsung dari browser
    const cleanText = rawText
        .replace(/<tr[^>]*>/gi, '\n')
        .replace(/<\/td>\s*<td[^>]*>/gi, '\t')
        .replace(/<[^>]+>/g, ' ');

    const lines = cleanText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 5);
    const dayRegex = /\b(SENIN|SELASA|RABU|KAMIS|JUMAT|JUM'AT|SABTU|MINGGU)\b/i;
    const timeRegex = /(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?)\s*[-–—]\s*(\d{1,2}[:.]\d{2}(?:[:.]\d{2})?)/;

    for (const line of lines) {
        const dMatch = line.match(dayRegex);
        const tMatch = line.match(timeRegex);
        if (!dMatch || !tMatch) continue;

        const rawDay = dMatch[1].toUpperCase().replace("'", "");
        const dayIdx = dayMap[rawDay] !== undefined ? dayMap[rawDay] : 1;
        const dayName = dayNames[dayIdx];

        const formatT = (t) => t.substring(0, 5).replace('.', ':');
        const timeStart = formatT(tMatch[1]);
        const timeEnd = formatT(tMatch[2]);

        const tabs = line.split(/\t+/).map(s => s.trim()).filter(Boolean);
        let name = '';
        let code = '-';
        let room = 'Ruang Kuliah';
        let group = 'REG-01';
        let sks = 3;

        if (tabs.length >= 4) {
            room = tabs[2] || room;
            code = tabs[3] || code;
            name = tabs[4] || tabs[3];
            group = tabs[5] || group;
        } else {
            const roomMatch = line.match(/\/\s*([A-Za-z0-9_.\-\s]+?)(?:$|\s+(?:TETAP|DARURAT))/i) || line.match(/\/\s*([^\n\r]+)/);
            if (roomMatch) room = roomMatch[1].trim();

            const codeNameMatch = line.match(/([A-Z0-9]{5,10})\s*[-–]\s*([A-Za-z0-9\s&,/]+?)(?=\s+\d+\s+[A-Z0-9\-]+|\s+(?:SENIN|SELASA|RABU|KAMIS|JUMAT|SABTU|MINGGU)|$)/i);
            if (codeNameMatch) {
                code = codeNameMatch[1].trim();
                name = codeNameMatch[2].trim();
            }

            const classMatch = line.match(/\b([A-Z0-9]{2,8}-[0-9]{2}-[A-Z0-9]{1,4})\b/i);
            if (classMatch) group = classMatch[1];

            const sksMatch = line.match(/\b([1-6])\s+(?:SE|DSI|IF|TT|TE|TI|TK|MB|AK|IK|DKV|DI|DP)/i) || line.match(/\s+([1-6])\s+SKS/i);
            if (sksMatch) sks = parseInt(sksMatch[1], 10);

            if (!name) {
                const beforeDay = line.substring(0, dMatch.index).trim();
                name = beforeDay.replace(/^[0-9.]+\s*/, '').replace(/^[A-Z0-9]{5,10}\s*[-–]\s*/, '').trim() || 'Mata Kuliah';
            }
        }

        results.push({
            id: 'cs-ksm-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            day: dayName,
            dayIdx,
            timeStart,
            timeEnd,
            name: name.replace(/\s+/g, ' ').trim(),
            code: code.trim(),
            room: room.replace(/\s+/g, ' ').trim(),
            group: group.trim(),
            sks: sks || 3,
            color: colors[results.length % colors.length]
        });
    }
    return results;
}

function setupKsmImportUI() {
    const ksmDrawer = document.getElementById('sched-ksm-drawer');
    const toggleKsmBtn = document.getElementById('btn-toggle-ksm-import');
    const ksmInput = document.getElementById('sched-ksm-input');
    const ksmParseBtn = document.getElementById('btn-ksm-parse');
    const ksmCountEl = document.getElementById('sched-ksm-count');
    const ksmReplaceBtn = document.getElementById('btn-ksm-apply-replace');
    const ksmAppendBtn = document.getElementById('btn-ksm-apply-append');
    const ksmCancelBtn = document.getElementById('btn-ksm-cancel');
    let parsedKsmPending = [];

    if (toggleKsmBtn && ksmDrawer) {
        toggleKsmBtn.addEventListener('click', () => {
            const soundDrawer = document.getElementById('sched-sound-drawer');
            const addFormEl = document.getElementById('sched-add-form');
            if (soundDrawer) soundDrawer.classList.remove('open');
            if (addFormEl) addFormEl.classList.remove('open');
            ksmDrawer.classList.toggle('open');
            if (ksmDrawer.classList.contains('open') && ksmInput) ksmInput.focus();
        });
    }

    if (ksmCancelBtn && ksmDrawer) {
        ksmCancelBtn.addEventListener('click', () => {
            ksmDrawer.classList.remove('open');
        });
    }

    if (ksmParseBtn && ksmInput) {
        ksmParseBtn.addEventListener('click', () => {
            parsedKsmPending = parseKsmContent(ksmInput.value);
            if (ksmCountEl) {
                ksmCountEl.textContent = `${parsedKsmPending.length} matkul terdeteksi`;
            }
            const hasData = parsedKsmPending.length > 0;
            if (ksmReplaceBtn) ksmReplaceBtn.disabled = !hasData;
            if (ksmAppendBtn) ksmAppendBtn.disabled = !hasData;
            if (!hasData) {
                alert('Tidak ditemukan jadwal yang sesuai. Pastikan menyalin teks KSM yang memuat Hari dan Jam kuliah.');
            }
        });
    }

    if (ksmReplaceBtn) {
        ksmReplaceBtn.addEventListener('click', () => {
            if (parsedKsmPending.length === 0) return;
            if (confirm(`Gantikan semua jadwal dengan ${parsedKsmPending.length} mata kuliah dari KSM?`)) {
                if (typeof window.setClassSchedules === 'function') {
                    window.setClassSchedules(parsedKsmPending.slice());
                }
                if (ksmDrawer) ksmDrawer.classList.remove('open');
                if (ksmInput) ksmInput.value = '';
                parsedKsmPending = [];
            }
        });
    }

    if (ksmAppendBtn) {
        ksmAppendBtn.addEventListener('click', () => {
            if (parsedKsmPending.length === 0) return;
            if (typeof window.appendClassSchedules === 'function') {
                window.appendClassSchedules(parsedKsmPending);
            }
            if (ksmDrawer) ksmDrawer.classList.remove('open');
            if (ksmInput) ksmInput.value = '';
            parsedKsmPending = [];
        });
    }
}

// Inisialisasi KSM UI
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupKsmImportUI);
} else {
    setupKsmImportUI();
}

window.parseKsmContent = parseKsmContent;
