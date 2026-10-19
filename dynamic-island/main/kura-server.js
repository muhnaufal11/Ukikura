"use strict";

/**
 * Ukikura (浮き蔵) — Kura Local Vault & iCal Sync Server
 * Menyediakan penyimpanan lokal mandiri untuk Todolist LMS, Kalender Pintar, & iCal Sync
 * tanpa ketergantungan pada folder asisten-lms.
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveWritableDataDir() {
    const localDir = path.resolve(__dirname, '../data');
    if (!/program files/i.test(localDir)) {
        try {
            if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
            const testFile = path.join(localDir, '.write-test');
            fs.writeFileSync(testFile, 'ok');
            fs.unlinkSync(testFile);
            return localDir;
        } catch (_) {}
    }
    const appDataDir = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'Ukikura', 'data');
    try {
        if (!fs.existsSync(appDataDir)) fs.mkdirSync(appDataDir, { recursive: true });
    } catch (_) {}
    return appDataDir;
}

const DATA_DIR = resolveWritableDataDir();
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

let sseClients = new Set();

function ensureDataDir() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    } catch (_) {}
}

function loadKuraConfig() {
    ensureDataDir();
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch (_) {}
    return {
        lmsCalendarIcsUrl: '',
        lmsCookie: '',
        urgentThresholdHours: 24
    };
}

function saveKuraConfig(partial) {
    ensureDataDir();
    const cur = loadKuraConfig();
    const next = Object.assign({}, cur, partial || {});
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(next, null, 2), 'utf8');
    } catch (_) {}
    return next;
}

function loadKuraTasks() {
    ensureDataDir();
    try {
        if (fs.existsSync(TASKS_FILE)) {
            const data = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
            if (data && Array.isArray(data.tasks)) return data;
        }
    } catch (_) {}
    return { lastUpdated: null, totalCourses: 0, tasks: [] };
}

function saveKuraTasks(payload) {
    ensureDataDir();
    try {
        fs.writeFileSync(TASKS_FILE, JSON.stringify(payload, null, 2), 'utf8');
    } catch (_) {}
    broadcastTasks(payload);
    return payload;
}

function broadcastTasks(data) {
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of sseClients) {
        try {
            res.write(msg);
        } catch (_) {
            sseClients.delete(res);
        }
    }
}

function upsertTasks(incomingTasks, totalCourses = 0) {
    const store = loadKuraTasks();
    const map = new Map();
    for (const t of store.tasks) {
        if (t && t.id) map.set(t.id, t);
    }
    for (const raw of (incomingTasks || [])) {
        if (!raw || !raw.id) continue;
        const prev = map.get(raw.id);
        map.set(raw.id, {
            id: raw.id,
            title: raw.title || (prev && prev.title) || 'Tugas LMS',
            courseId: raw.courseId || (prev && prev.courseId) || '',
            courseName: raw.courseName || (prev && prev.courseName) || 'Mata Kuliah',
            type: raw.type || (prev && prev.type) || 'assign',
            href: raw.href || (prev && prev.href) || '',
            dueTimestamp: raw.dueTimestamp !== undefined ? raw.dueTimestamp : (prev ? prev.dueTimestamp : null),
            isDone: Boolean(raw.isDone || (prev && prev.isDone))
        });
    }
    const merged = Array.from(map.values());
    return saveKuraTasks({
        lastUpdated: new Date().toISOString(),
        totalCourses: totalCourses || store.totalCourses || 0,
        tasks: merged
    });
}

function parseIcsDateToMs(icsVal) {
    if (!icsVal) return null;
    const m = String(icsVal).trim().match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
    if (!m) return null;
    if (m[7] === 'Z') {
        return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    }
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}

async function syncFromIcsUrl() {
    const cfg = loadKuraConfig();
    if (!cfg.lmsCalendarIcsUrl || !cfg.lmsCalendarIcsUrl.startsWith('http')) {
        return loadKuraTasks();
    }
    try {
        const res = await fetch(cfg.lmsCalendarIcsUrl, { timeout: 10000 });
        if (!res.ok) return loadKuraTasks();
        const text = await res.text();
        const blocks = text.split('BEGIN:VEVENT').slice(1);
        const parsedTasks = [];
        for (const blk of blocks) {
            const uid = (blk.match(/UID:([^\r\n]+)/) || [])[1] || '';
            const summary = ((blk.match(/SUMMARY:([^\r\n]+)/) || [])[1] || '')
                .replace(/\\,/g, ',')
                .replace(/\s+is due$/i, '')
                .trim();
            const cats = ((blk.match(/CATEGORIES:([^\r\n]+)/) || [])[1] || '').replace(/\\,/g, ',').trim();
            const dtEnd = (blk.match(/DTEND(?:;[^:]*)?:([^\r\n]+)/) || [])[1] ||
                          (blk.match(/DTSTART(?:;[^:]*)?:([^\r\n]+)/) || [])[1] || '';
            const dueTs = parseIcsDateToMs(dtEnd);
            if (!summary) continue;
            parsedTasks.push({
                id: uid.trim() || `ics_${summary}_${dueTs || 0}`,
                title: summary,
                courseName: cats || 'Kalender LMS',
                type: /quiz|kuis/i.test(summary) ? 'quiz' : 'assign',
                dueTimestamp: dueTs,
                isDone: false
            });
        }
        if (parsedTasks.length > 0) {
            return upsertTasks(parsedTasks);
        }
    } catch (_) {}
    return loadKuraTasks();
}

function startKuraServer(port = 8089) {
    return new Promise((resolve) => {
        const srv = http.createServer((req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            const urlPath = (req.url || '').split('?')[0];

            if (req.method === 'GET' && urlPath === '/__qbot__/config') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(loadKuraConfig()));
                return;
            }

            if (req.method === 'GET' && urlPath === '/__qbot__/tasks') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(loadKuraTasks()));
                return;
            }

            if (req.method === 'GET' && urlPath === '/__qbot__/tasks/stream') {
                res.writeHead(200, {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Connection': 'keep-alive'
                });
                res.write(`data: ${JSON.stringify(loadKuraTasks())}\n\n`);
                sseClients.add(res);
                req.on('close', () => sseClients.delete(res));
                return;
            }

            if (req.method === 'POST') {
                let body = '';
                req.on('data', chunk => { body += chunk; });
                req.on('end', async () => {
                    let parsed = {};
                    try { parsed = JSON.parse(body || '{}'); } catch (_) {}

                    if (urlPath === '/__qbot__/config') {
                        const saved = saveKuraConfig(parsed);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(saved));
                        return;
                    }

                    if (urlPath === '/__qbot__/tasks') {
                        const updated = upsertTasks(parsed.tasks || [], parsed.totalCourses || 0);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(updated));
                        return;
                    }

                    if (urlPath === '/__qbot__/tasks/toggle') {
                        const store = loadKuraTasks();
                        for (const t of store.tasks) {
                            if (t.id === parsed.id) {
                                t.isDone = !t.isDone;
                            }
                        }
                        const saved = saveKuraTasks(store);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(saved));
                        return;
                    }

                    if (urlPath === '/__qbot__/tasks/sync') {
                        const synced = await syncFromIcsUrl();
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify(synced));
                        return;
                    }

                    res.writeHead(404);
                    res.end('{}');
                });
                return;
            }

            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Ukikura (浮き蔵) Local Kura Vault Active');
        });

        srv.on('error', () => resolve(false));
        srv.listen(port, '127.0.0.1', () => {
            console.log(`[Ukikura] Kura Local Vault berjalan mandiri di 127.0.0.1:${port}`);
            resolve(true);
        });
    });
}

module.exports = {
    loadKuraConfig,
    saveKuraConfig,
    loadKuraTasks,
    saveKuraTasks,
    startKuraServer
};
