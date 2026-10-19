"use strict";

/**
 * Ukikura (浮き蔵) — GitHub Version & Directory Update Detector
 * Mengecek versi terbaru secara otomatis dari:
 * 1. Direktori GitHub Raw (`version.json` & `package.json` di branch `main` / `master`)
 * 2. GitHub Releases API (`/repos/<owner>/<repo>/releases/latest`)
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
        version: '1.0.0',
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
            if (pkg.version) info.version = pkg.version;
        }
    } catch (_) {}
    return info;
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

    if (manualTrigger && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-status', {
            checking: true,
            currentVersion: local.version,
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
        // 1. Cek GitHub Releases API terlebih dahulu (jika rilis installer .exe tersedia)
        const rel = await fetchJsonWithTimeout(`https://api.github.com/repos/${repo}/releases/latest`, 5500);
        if (rel && rel.tag_name) {
            const exeAsset = Array.isArray(rel.assets)
                ? rel.assets.find(a => a && /\.exe$|\.msi$|\.zip$/i.test(a.name || ''))
                : null;
            remoteData = {
                version: String(rel.tag_name).replace(/^[vV]/, ''),
                releaseUrl: (exeAsset && exeAsset.browser_download_url) || rel.html_url || `https://github.com/${repo}/releases/latest`,
                changelog: rel.body || rel.name || 'Pembaruan rilis baru tersedia di GitHub.'
            };
            matchedRepo = repo;
            break;
        }

        // 2. Cek file version.json langsung di direktori GitHub (branch main & master)
        for (const branch of [local.branch || 'main', 'master']) {
            const rawVer = await fetchJsonWithTimeout(`https://raw.githubusercontent.com/${repo}/${branch}/version.json?t=${Date.now()}`, 5000);
            if (rawVer && rawVer.version) {
                remoteData = {
                    version: String(rawVer.version).replace(/^[vV]/, ''),
                    releaseUrl: rawVer.releaseUrl || rawVer.downloadUrl || `https://github.com/${repo}`,
                    changelog: rawVer.changelog || `Versi baru v${rawVer.version} terdeteksi di direktori GitHub.`
                };
                matchedRepo = repo;
                break;
            }

            const rawPkg = await fetchJsonWithTimeout(`https://raw.githubusercontent.com/${repo}/${branch}/package.json?t=${Date.now()}`, 5000);
            if (rawPkg && rawPkg.version) {
                remoteData = {
                    version: String(rawPkg.version).replace(/^[vV]/, ''),
                    releaseUrl: `https://github.com/${repo}`,
                    changelog: rawPkg.description || `Versi baru v${rawPkg.version} terdeteksi di direktori GitHub.`
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
        latestVersion: remoteData ? remoteData.version : local.version,
        repo: matchedRepo,
        downloadUrl: remoteData ? remoteData.releaseUrl : `https://github.com/${local.githubRepo}`,
        changelog: remoteData ? remoteData.changelog : 'Ukikura sudah berada di versi terbaru.',
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
    return lastUpdateInfo || {
        checking: false,
        hasUpdate: false,
        currentVersion: getLocalVersionInfo().version,
        latestVersion: getLocalVersionInfo().version,
        repo: getLocalVersionInfo().githubRepo,
        downloadUrl: `https://github.com/${getLocalVersionInfo().githubRepo}`
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
    checkGitHubForUpdates,
    getLastUpdateStatus,
    openUpdateDownloadPage
};
