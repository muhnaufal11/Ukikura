"use strict";

/**
 * Ukikura (浮き蔵) — GitHub Version & Update Detector
 * Menggunakan model Android/Google Play:
 * - Nama Versi (versionName, string): e.g. "1.0.0"
 * - Kode Versi (versionCode, integer): e.g. 7 (menandakan iterasi fix)
 *
 * Penentuan update: remote.versionCode > local.versionCode
 */

const fs = require('fs');
const path = require('path');
const { shell } = require('electron');

const ROOT_DIR = path.resolve(__dirname, '../..');
const VERSION_FILE = path.join(ROOT_DIR, 'version.json');
const PKG_FILE = path.join(ROOT_DIR, 'package.json');

let getMainWindow = () => null;
let lastUpdateInfo = null;

function initAutoUpdater(mainWinGetter) {
    getMainWindow = mainWinGetter;
}

function getLocalVersionInfo() {
    let info = {
        name: 'Ukikura',
        versionName: '1.0.1',
        versionCode: 11,
        version: '1.0.1',
        fixCount: 11,
        githubRepo: 'muhnaufal11/Ukikura',
        fallbackRepos: ['muhnaufal11/Ukikura', 'Nauflix/Ukikura'],
        branch: 'main'
    };

    try {
        if (fs.existsSync(VERSION_FILE)) {
            const parsed = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
            info = Object.assign(info, parsed);
        } else if (fs.existsSync(PKG_FILE)) {
            const pkg = JSON.parse(fs.readFileSync(PKG_FILE, 'utf8'));
            if (pkg.version) info.versionName = pkg.version;
        }
    } catch (_) {}

    const vCode = Number(info.versionCode) || Number(info.fixCount) || 11;
    const vName = String(info.versionName || info.version || '1.0.1').trim().replace(/^[vV]/, '');

    info.versionCode = vCode;
    info.versionName = vName;
    info.version = vName;
    info.fixCount = vCode;
    info.displayVersion = `${vName} (Kode: ${vCode})`;

    return info;
}

function setUpdateChannel() {
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

function isNewer(remoteVerCode, remoteVerName, localVerCode, localVerName) {
    // 1. Prioritaskan Kode Versi (integer murni ala Google Play)
    if (typeof remoteVerCode === 'number' && typeof localVerCode === 'number' && !isNaN(remoteVerCode) && !isNaN(localVerCode) && remoteVerCode > 0 && localVerCode > 0) {
        return remoteVerCode > localVerCode;
    }
    // 2. Fallback ke semver Nama Versi jika kode versi tidak tersedia
    return isNewerVersion(remoteVerName, localVerName);
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

    if (manualTrigger && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', {
            checking: true,
            currentVersion: local.versionName,
            currentVersionName: local.versionName,
            currentVersionCode: local.versionCode,
            displayVersion: local.displayVersion,
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
        // 1. Cek GitHub Releases API
        const releases = await fetchJsonWithTimeout(`https://api.github.com/repos/${repo}/releases?per_page=5`, 5500);
        if (Array.isArray(releases) && releases.length > 0) {
            const candidate = releases[0];
            if (candidate && candidate.tag_name) {
                const exeAsset = Array.isArray(candidate.assets)
                    ? candidate.assets.find(a => a && /\.exe$|\.msi$|\.zip$/i.test(a.name || ''))
                    : null;
                const cleanVer = String(candidate.tag_name).replace(/^[vV]/, '');
                const codeMatch = String(candidate.tag_name).match(/[\+\-\.](\d+)$/) || String(candidate.tag_name).match(/code[-_]?(\d+)/i);
                const candVCode = codeMatch ? parseInt(codeMatch[1], 10) : 0;
                remoteData = {
                    version: cleanVer,
                    versionName: cleanVer,
                    versionCode: candVCode,
                    releaseUrl: (exeAsset && exeAsset.browser_download_url) || candidate.html_url || `https://github.com/${repo}/releases`,
                    changelog: candidate.body || candidate.name || 'Pembaruan versi Ukikura tersedia di GitHub.'
                };
                matchedRepo = repo;
                break;
            }
        }

        // 2. Cek file version.json langsung di direktori GitHub branch utama
        const targetBranches = [local.branch || 'main', 'master'];
        for (const branch of targetBranches) {
            const verFileUrl = `https://raw.githubusercontent.com/${repo}/${branch}/version.json?t=${Date.now()}`;
            const rawVer = await fetchJsonWithTimeout(verFileUrl, 4500);
            if (rawVer) {
                const rawVCode = Number(rawVer.versionCode) || Number(rawVer.fixCount) || 0;
                const rawVName = String(rawVer.versionName || rawVer.version || '').replace(/^[vV]/, '');
                if (rawVName || rawVCode > 0) {
                    remoteData = {
                        version: rawVName,
                        versionName: rawVName,
                        versionCode: rawVCode,
                        releaseUrl: rawVer.releaseUrl || rawVer.downloadUrl || `https://github.com/${repo}`,
                        changelog: rawVer.changelog || `Ukikura ${rawVName} (Kode: ${rawVCode}) tersedia di GitHub.`
                    };
                    matchedRepo = repo;
                    break;
                }
            }
        }
        if (remoteData) break;
    }

    const hasUpdate = Boolean(remoteData && isNewer(remoteData.versionCode, remoteData.versionName, local.versionCode, local.versionName));
    const statusPayload = {
        checking: false,
        manualTrigger,
        hasUpdate,
        currentVersion: local.versionName,
        currentVersionName: local.versionName,
        currentVersionCode: local.versionCode,
        displayVersion: local.displayVersion,
        latestVersion: remoteData ? remoteData.versionName : local.versionName,
        latestVersionName: remoteData ? remoteData.versionName : local.versionName,
        latestVersionCode: remoteData ? remoteData.versionCode : local.versionCode,
        repo: matchedRepo,
        downloadUrl: remoteData ? remoteData.releaseUrl : `https://github.com/${local.githubRepo}`,
        changelog: remoteData ? remoteData.changelog : `Ukikura v${local.versionName} (Kode: ${local.versionCode}) sudah versi terbaru.`,
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
        displayVersion: local.displayVersion,
        fixCount: local.fixCount,
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
