"use strict";

/**
 * Ukikura (浮き蔵) — GitHub Version & Channel Update Detector
 * Mendukung 2 Kode Versi & Kanal Rilis:
 * 1. KANAL PUBLIK (vX.X.X-public): Rilis stabil resmi untuk penggunaan harian.
 * 2. KANAL DEBUG (vX.X.X-debug): Rilis pengembang untuk pelacakan log & pengujian fitur cepat.
 *
 * Penentuan update didasarkan pada KODE VERSI / KANAL yang sedang aktif:
 * - Versi Publik HANYA menerima update stabil (bukan pre-release/debug).
 * - Versi Debug mencari pre-release, rilis bertag -debug, serta commit pengembang terbaru.
 */

const fs = require('fs');
const path = require('path');
const { shell, app } = require('electron');

const ROOT_DIR = path.resolve(__dirname, '../..');
const VERSION_FILE = path.join(ROOT_DIR, 'version.json');
const PKG_FILE = path.join(ROOT_DIR, 'package.json');

let getMainWindow = () => null;
let lastUpdateInfo = null;

function getChannelFilePath() {
    try {
        const userData = app ? app.getPath('userData') : path.join(ROOT_DIR, 'data');
        return path.join(userData, 'user-channel.json');
    } catch (_) {
        return path.join(ROOT_DIR, 'user-channel.json');
    }
}

function initAutoUpdater(mainWinGetter) {
    getMainWindow = mainWinGetter;
}

function getLocalVersionInfo() {
    let info = {
        name: 'Ukikura',
        version: '1.0.0',
        versionCode: '1.0.0-public',
        channel: 'public',
        channelName: 'Publik (Rilis Stabil)',
        githubRepo: 'muhnaufal11/Ukikura',
        fallbackRepos: ['muhnaufal11/Ukikura', 'Nauflix/Ukikura'],
        branch: 'main',
        debugBranch: 'debug'
    };

    // 1. Baca metadata dasar dari version.json / package.json
    try {
        if (fs.existsSync(VERSION_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
            info = Object.assign(info, parsed);
        } else if (fs.existsSync(PKG_FILE)) {
            const pkg = JSON.parse(fs.readFileSync(PKG_FILE, 'utf8'));
            if (pkg.version) info.version = pkg.version;
        }
    } catch (_) {}

    // 2. Baca preferensi kanal pengguna jika pernah diubah melalui UI atau installer
    try {
        const chanFile = getChannelFilePath();
        if (fs.existsSync(chanFile)) {
            const saved = JSON.parse(fs.readFileSync(chanFile, 'utf8'));
            if (saved.channel === 'debug' || saved.channel === 'public') {
                info.channel = saved.channel;
            }
        }
    } catch (_) {}

    // 3. Normalisasi kode versi dan nama kanal
    const isDebug = (info.channel === 'debug');
    info.channel = isDebug ? 'debug' : 'public';
    info.channelName = isDebug ? 'Debug (Kanal Pengembang)' : 'Publik (Rilis Stabil)';
    info.versionCode = `${info.version}-${info.channel}`;

    return info;
}

function setUpdateChannel(targetChannel) {
    const validChannel = (targetChannel === 'debug') ? 'debug' : 'public';
    try {
        const chanFile = getChannelFilePath();
        const dir = path.dirname(chanFile);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(chanFile, JSON.stringify({
            channel: validChannel,
            updatedAt: Date.now()
        }, null, 2), 'utf8');
    } catch (_) {}
    return getLocalVersionInfo();
}

function normalizeSemver(verStr) {
    const clean = String(verStr || '').trim().replace(/^[vV]/, '').split('-')[0];
    const parts = clean.split('.').map(n => parseInt(n, 10) || 0);
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0];
}

function isNewerVersion(remoteVer, localVer) {
    const r = normalizeSemver(remoteVer);
    const l = normalizeSemver(localVer);
    for (let i = 0; i < 3; i++) {
        if (r[i] > l[i]) return true;
        if (r[i] < l[i]) return false;
    }
    return false;
}

async function fetchJsonWithTimeout(url, timeoutMs = 6000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            signal: ctrl.signal,
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'Ukikura-Desktop-Updater/1.0'
            },
            cache: 'no-store'
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (_) {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

async function checkGitHubForUpdates(manualTrigger = false) {
    const local = getLocalVersionInfo();
    const mainWindow = getMainWindow();
    const isDebugChannel = (local.channel === 'debug');

    if (manualTrigger && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', {
            checking: true,
            currentVersion: local.version,
            currentVersionCode: local.versionCode,
            currentChannel: local.channel,
            repo: local.githubRepo
        });
    }

    const reposToCheck = Array.from(new Set([
        local.githubRepo,
        ...(Array.isArray(local.fallbackRepos) ? local.fallbackRepos : [])
    ])).filter(Boolean);

    let remoteData = null;
    let matchedRepo = local.githubRepo;

    for (const repo of reposToCheck) {
        // 1. Cek GitHub Releases API sesuai kode versi & kanal
        const releases = await fetchJsonWithTimeout(`https://api.github.com/repos/${repo}/releases?per_page=10`, 5500);
        if (Array.isArray(releases) && releases.length > 0) {
            let candidate = null;
            if (isDebugChannel) {
                // Kanal Debug: Cari pre-release atau rilis dengan tag berlabel '-debug' / '-dev'
                candidate = releases.find(r => r && (r.prerelease || /debug|dev|beta/i.test(r.tag_name || '')));
                if (!candidate) candidate = releases[0];
            } else {
                // Kanal Publik: HANYA terima rilis stabil (bukan pre-release dan bukan tag debug)
                candidate = releases.find(r => r && !r.prerelease && !/debug|dev|beta|alpha/i.test(r.tag_name || ''));
            }

            if (candidate && candidate.tag_name) {
                const exeAsset = Array.isArray(candidate.assets)
                    ? candidate.assets.find(a => a && /\.exe$|\.msi$|\.zip$/i.test(a.name || ''))
                    : null;
                const cleanVer = String(candidate.tag_name).replace(/^[vV]/, '').split('-')[0];
                remoteData = {
                    version: cleanVer,
                    versionCode: `${cleanVer}-${local.channel}`,
                    releaseUrl: (exeAsset && exeAsset.browser_download_url) || candidate.html_url || `https://github.com/${repo}/releases`,
                    changelog: candidate.body || candidate.name || `Pembaruan kanal ${local.channel} tersedia di GitHub.`
                };
                matchedRepo = repo;
                break;
            }
        }

        // 2. Cek file version.json langsung di direktori GitHub sesuai branch kanal
        const targetBranches = isDebugChannel
            ? [local.debugBranch || 'debug', local.branch || 'main', 'master']
            : [local.branch || 'main', 'master'];

        for (const branch of targetBranches) {
            const verFileUrl = isDebugChannel
                ? `https://raw.githubusercontent.com/${repo}/${branch}/version-debug.json?t=${Date.now()}`
                : `https://raw.githubusercontent.com/${repo}/${branch}/version-public.json?t=${Date.now()}`;

            let rawVer = await fetchJsonWithTimeout(verFileUrl, 4500);
            if (!rawVer || !rawVer.version) {
                rawVer = await fetchJsonWithTimeout(`https://raw.githubusercontent.com/${repo}/${branch}/version.json?t=${Date.now()}`, 4500);
            }

            if (rawVer && rawVer.version) {
                const cleanVer = String(rawVer.version).replace(/^[vV]/, '').split('-')[0];
                remoteData = {
                    version: cleanVer,
                    versionCode: `${cleanVer}-${local.channel}`,
                    releaseUrl: rawVer.releaseUrl || rawVer.downloadUrl || `https://github.com/${repo}`,
                    changelog: rawVer.changelog || `Versi ${cleanVer}-${local.channel} terdeteksi di branch ${branch}.`
                };
                matchedRepo = repo;
                break;
            }
        }
        if (remoteData) break;
    }

    const hasUpdate = Boolean(remoteData && isNewerVersion(remoteData.version, local.version));
    const statusPayload = {
        checking: false,
        manualTrigger,
        hasUpdate,
        currentVersion: local.version,
        currentVersionCode: local.versionCode,
        currentChannel: local.channel,
        channelName: local.channel === 'debug' ? 'Debug' : 'Publik',
        latestVersion: remoteData ? remoteData.version : local.version,
        latestVersionCode: remoteData ? remoteData.versionCode : local.versionCode,
        repo: matchedRepo,
        downloadUrl: remoteData ? remoteData.releaseUrl : `https://github.com/${local.githubRepo}`,
        changelog: remoteData ? remoteData.changelog : `Ukikura (${local.channel === 'debug' ? 'Kanal Debug' : 'Kanal Publik'}) sudah berada di versi terbaru.`,
        checkedAt: Date.now()
    };

    lastUpdateInfo = statusPayload;

    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
        win.webContents.send('update-status', statusPayload);
    }

    return statusPayload;
}

function getLastUpdateStatus() {
    const local = getLocalVersionInfo();
    return lastUpdateInfo || {
        checking: false,
        hasUpdate: false,
        currentVersion: local.version,
        currentVersionCode: local.versionCode,
        currentChannel: local.channel,
        channelName: local.channel === 'debug' ? 'Debug' : 'Publik',
        latestVersion: local.version,
        latestVersionCode: local.versionCode,
        repo: local.githubRepo,
        downloadUrl: `https://github.com/${local.githubRepo}`
    };
}

function openUpdateDownloadPage() {
    const info = getLastUpdateStatus();
    const target = info.downloadUrl || `https://github.com/${getLocalVersionInfo().githubRepo}`;
    shell.openExternal(target);
}

module.exports = {
    initAutoUpdater,
    getLocalVersionInfo,
    setUpdateChannel,
    checkGitHubForUpdates,
    getLastUpdateStatus,
    openUpdateDownloadPage
};
