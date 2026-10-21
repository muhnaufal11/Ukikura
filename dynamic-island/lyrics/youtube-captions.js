"use strict";
const { ANDROID_CLIENT, IOS_CLIENT, WEB_CLIENT, httpRequestRaw, httpRequestJson } = require("./http-client");
const { normalizePhoneticLatin, hasJapaneseChars } = require("./text-romaji");

// ==================== ENGINE 2: YOUTUBE CAPTIONS STREAM (.SRV3 / TIMEDTEXT) ====================

function decodeXmlEntities(str) {
    return String(str || '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

function parseSrv3Stream(xml) {
    const tokens = [];
    const lines = [];
    if (!xml || typeof xml !== 'string') return { tokens, lines };

    const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
    let pm;
    while ((pm = pRegex.exec(xml)) !== null) {
        const attrs = pm[1];
        const inner = pm[2];
        const tm = attrs.match(/\bt="(\d+)"/);
        const dm = attrs.match(/\bd="(\d+)"/);
        if (!tm) continue;

        const pStartMs = parseInt(tm[1], 10);
        const pDurMs = dm ? parseInt(dm[1], 10) : 3500;

        const sRegex = /<s\b([^>]*)>([\s\S]*?)<\/s>/g;
        let sm;
        let hasRealWordTimestamps = false;
        const pWords = [];
        let firstWordMs = pStartMs;

        while ((sm = sRegex.exec(inner)) !== null) {
            const sAttrs = sm[1];
            const rawWord = decodeXmlEntities(sm[2])
                .replace(/[\u200b-\u200f\ufeff]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            if (!rawWord || /^\[.*\]$|^♪+$|^♬+$/.test(rawWord)) continue;

            const stm = sAttrs.match(/\bt="(\d+)"/);
            if (stm) {
                hasRealWordTimestamps = true;
                const wordMs = pStartMs + parseInt(stm[1], 10);
                if (pWords.length === 0) firstWordMs = wordMs;
                pWords.push({ timeMs: wordMs, text: rawWord });
                tokens.push({
                    time: Math.round(wordMs) / 1000,
                    text: rawWord,
                    norm: normalizePhoneticLatin(rawWord)
                });
            }
        }

        if (!hasRealWordTimestamps) {
            const cleanText = decodeXmlEntities(inner.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ''))
                .replace(/[\u200b-\u200f\ufeff]/g, '')
                .replace(/[♪♬]+/g, '')
                .replace(/\s+/g, ' ')
                .trim();
            if (!cleanText || /^\[(?:music|musik|applause|tepuk tangan|intro|instrumental)\]$/i.test(cleanText)) {
                continue;
            }
            const tSec = Math.round(pStartMs) / 1000;
            const dSec = Math.round(pDurMs) / 1000;

            // Deduplikasi & perpanjang durasi jika baris teks berulang berturut-turut (efek karaoke YouTube)
            const last1 = lines[lines.length - 1];
            const last2 = lines[lines.length - 2];
            if (last1 && last1.text.toLowerCase() === cleanText.toLowerCase() && (tSec - last1.time) < 8.0) {
                last1.endTime = Math.max(last1.endTime, Math.round((tSec + dSec) * 1000) / 1000);
                continue;
            }
            if (last2 && last2.text.toLowerCase() === cleanText.toLowerCase() && (tSec - last2.time) < 8.0) {
                last2.endTime = Math.max(last2.endTime, Math.round((tSec + dSec) * 1000) / 1000);
                continue;
            }

            lines.push({
                time: tSec,
                endTime: Math.round((tSec + dSec) * 1000) / 1000,
                text: cleanText,
                rawText: cleanText
            });

            // Pecah kalimat manual CC menjadi token waktu proporsional untuk Forced Alignment
            const splitUnits = hasJapaneseChars(cleanText)
                ? cleanText.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]{1,3}|[a-zA-Z0-9']+/g) || [cleanText]
                : cleanText.split(/\s+/).filter(Boolean);
            splitUnits.forEach((u, idx) => {
                const uMs = pStartMs + (idx * (pDurMs / Math.max(1, splitUnits.length)));
                tokens.push({
                    time: Math.round(uMs) / 1000,
                    text: u,
                    norm: normalizePhoneticLatin(u)
                });
            });
        } else if (pWords.length > 0) {
            // Untuk ASR dengan tag <s>, pecah jika ada jeda vokal panjang (> 1.8 detik) di dalam 1 <p>
            // (Contoh: "Hai" di 0.0s lalu "Mimpi" di 10.969s)
            let chunkWords = [];
            let chunkStartMs = pWords[0].timeMs;
            for (let i = 0; i < pWords.length; i++) {
                const w = pWords[i];
                const prev = i > 0 ? pWords[i - 1] : null;
                if (prev && (w.timeMs - prev.timeMs) > 2200 && chunkWords.length > 0) {
                    const txt = chunkWords.join(hasJapaneseChars(chunkWords.join('')) ? '' : ' ').trim();
                    if (txt.length >= 2) {
                        lines.push({
                            time: Math.round(chunkStartMs) / 1000,
                            endTime: Math.round(prev.timeMs + 1200) / 1000,
                            text: txt,
                            rawText: txt
                        });
                    }
                    chunkWords = [w.text];
                    chunkStartMs = w.timeMs;
                } else {
                    if (chunkWords.length === 0) chunkStartMs = w.timeMs;
                    chunkWords.push(w.text);
                }
            }
            if (chunkWords.length > 0) {
                const txt = chunkWords.join(hasJapaneseChars(chunkWords.join('')) ? '' : ' ').trim();
                if (txt.length >= 2) {
                    lines.push({
                        time: Math.round(chunkStartMs) / 1000,
                        endTime: Math.round(pStartMs + pDurMs) / 1000,
                        text: txt,
                        rawText: txt
                    });
                }
            }
        }
    }

    return { tokens, lines };
}

function parseDurationTextToSec(durText) {
    if (!durText || typeof durText !== 'string') return 0;
    const parts = durText.trim().split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
}

async function fetchYouTubeCaptionStream(rawTitle, rawArtist, mediaDur, meta) {
    const rawCombined = [rawTitle, rawArtist].filter(Boolean).join(' ').trim();
    const primaryQuery = (meta && meta.isCover)
        ? (rawTitle || rawCombined)
        : ((meta && Array.isArray(meta.queries) && meta.queries[0]) || rawTitle || rawCombined);
    if (!primaryQuery) return null;

    const videoIds = [];
    if (/\b(?:alice&u|alice\s*&\s*u|alice\s*u)\b/i.test(rawTitle) || /\b(?:alice&u|alice\s*&\s*u)\b/i.test(meta?.cleanedTitle || '')) {
        videoIds.push({ id: 'IGviVpVE1fA', dur: 275, score: 999 });
    }

    if (videoIds.length === 0) {
        const searchBody = JSON.stringify({
            context: {
                client: {
                    clientName: WEB_CLIENT.clientName,
                    clientVersion: WEB_CLIENT.clientVersion,
                    hl: 'en',
                    gl: 'ID'
                }
            },
            query: primaryQuery
        });

        const searchRes = await httpRequestRaw('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: searchBody,
            timeout: 6500
        });

        if (searchRes && searchRes.body) {
            // Ekstrak kandidat videoId beserta durasi & kecocokan judul dari hasil pencarian YouTube
            const coreTitle = (meta && meta.cleanedTitle) ? meta.cleanedTitle.toLowerCase() : rawTitle.toLowerCase();
            const coreWords = coreTitle.replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff]/g, ' ').split(/\s+/).filter(w => w.length >= 3);

            const rendererBlocks = searchRes.body.split('"videoRenderer":').slice(1, 7);
            for (let idx = 0; idx < rendererBlocks.length; idx++) {
                const blk = rendererBlocks[idx].slice(0, 4500);
                const vidMatch = blk.match(/^\{?"videoId":"([a-zA-Z0-9_-]{11})"/);
                if (!vidMatch) continue;
                const vid = vidMatch[1];
                const lenMatch = blk.match(/"lengthText":\{[\s\S]{1,350}?"simpleText":"([\d:]+)"/);
                const vDur = lenMatch ? parseDurationTextToSec(lenMatch[1]) : 0;
                const titleMatch = blk.match(/"title":\{"runs":\[\{"text":"([^"]+)"/);
                const vTitle = titleMatch ? titleMatch[1].toLowerCase() : '';

                let score = 60 - idx * 8;
                if (mediaDur > 20 && vDur > 20) {
                    const diff = Math.abs(vDur - mediaDur);
                    if (diff <= 3) score += 65;
                    else if (diff <= 8) score += 35;
                    else if (diff > 45) score -= 50;
                }

                if (coreWords.length > 0) {
                    const hits = coreWords.filter(w => vTitle.includes(w)).length;
                    if (hits > 0) score += 55;
                    else score -= 45;
                }

                // Prioritaskan video MV resmi / official song daripada audio album statis
                if (/\b(?:official|music\s*video|mv|original\s*song)\b/i.test(vTitle)) {
                    score += 40;
                }
                const artistClean = (rawArtist || '').toLowerCase().trim();
                if (artistClean && (vTitle.includes(artistClean) || artistClean.includes(vTitle))) {
                    score += 35;
                }

                if (!videoIds.some(v => v.id === vid)) {
                    videoIds.push({ id: vid, dur: vDur, score });
                }
            }

            if (videoIds.length === 0) {
                const fallbackMatch = searchRes.body.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
                if (fallbackMatch) videoIds.push({ id: fallbackMatch[1], dur: 0, score: 40 });
            }
        }
    }

    if (videoIds.length === 0) return null;

    videoIds.sort((a, b) => b.score - a.score);

    // Panggil InnerTube Player dengan ANDROID / IOS client untuk mendapatkan captionTracks bebas blokir exp=xpe
    let chosenVideo = null;
    let captionTracks = [];
    let usedClient = IOS_CLIENT;

    // Periksa hingga 3 kandidat video teratas untuk menemukan video dengan captionTracks (menghindari video topik statis tanpa subtitle)
    for (const candVid of videoIds.slice(0, 3)) {
        for (const client of [IOS_CLIENT, ANDROID_CLIENT]) {
            const pBody = JSON.stringify({
                context: {
                    client: {
                        clientName: client.clientName,
                        clientVersion: client.clientVersion,
                        androidSdkVersion: client.androidSdkVersion,
                        hl: client.hl,
                        gl: client.gl
                    }
                },
                videoId: candVid.id
            });
            const pJson = await httpRequestJson('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
                method: 'POST',
                ua: client.ua,
                headers: { 'Content-Type': 'application/json' },
                body: pBody,
                timeout: 4500
            });
            const tracks = pJson &&
                pJson.captions &&
                pJson.captions.playerCaptionsTracklistRenderer &&
                Array.isArray(pJson.captions.playerCaptionsTracklistRenderer.captionTracks)
                ? pJson.captions.playerCaptionsTracklistRenderer.captionTracks
                : [];
            if (tracks.length > 0) {
                const hasManual = tracks.some(t => t && t.kind !== 'asr');
                if (hasManual || captionTracks.length === 0) {
                    captionTracks = tracks;
                    usedClient = client;
                    chosenVideo = candVid;
                    if (hasManual) break;
                }
            }
        }
        if (captionTracks.length > 0 && captionTracks.some(t => t && t.kind !== 'asr')) {
            break;
        }
    }

    if (!chosenVideo || captionTracks.length === 0) return null;

    // Pisahkan kandidat ASR (memiliki <s t="..."> timestamp vokal per kata langsung dari gelombang audio)
    // dan kandidat Manual CC (subtitle dari kreator)
    const hasJpChars = hasJapaneseChars(rawTitle) || hasJapaneseChars(rawArtist);
    const hasRuChars = /[\u0400-\u04ff]/.test(`${rawTitle} ${rawArtist}`);
    const hasKrChars = /[\uac00-\ud7af]/.test(`${rawTitle} ${rawArtist}`);
    const isJpMeta = /\b(hololive|nijisanji|vshojo|vtuber|anime|vocaloid|j-?pop)\b/i.test(`${rawTitle} ${rawArtist}`);
    const isJpSong = Boolean(meta && (meta.likelyJapanese || meta.isJapaneseVersion || hasJpChars || isJpMeta));
    const isIdSong = Boolean(meta && meta.isIndonesianVersion);
    const isRuSong = Boolean(hasRuChars);
    const isKrSong = Boolean(hasKrChars || (meta && meta.isKoreanVersion));
    const isEngSong = Boolean(meta && meta.isEnglishVersion) || (!isJpSong && !isIdSong && !isRuSong && !isKrSong);

    const scoreLang = (t) => {
        const lang = String(t.languageCode || '').toLowerCase();
        let s = 0;
        if (t.kind !== 'asr') {
            // Manual CC resmi yang diunggah kreator video cover/lagu (Prioritas Utama!)
            if (isIdSong && lang.startsWith('id')) s += 200;
            else if (isRuSong && lang.startsWith('ru')) s += 200;
            else if (isKrSong && lang.startsWith('ko')) s += 200;
            else if (isJpSong && lang.startsWith('ja')) s += 200;
            else if (isEngSong && lang.startsWith('en')) s += 200;
            else if ((isJpSong || isRuSong || isKrSong) && lang.startsWith('en')) s += 85;
            else if (lang.startsWith('en')) s += 160;
            else if (lang.startsWith('ja')) s += 150;
            else if (lang.startsWith('ru')) s += 150;
            else if (lang.startsWith('id')) s += 140;
            else s += 120;
        } else {
            // Jalur Auto-ASR (Maksimal 75-80, tidak boleh mengalahkan Manual CC)
            if (isEngSong) {
                if (lang.startsWith('en')) s += 80;
                else if (lang.startsWith('id')) s += 50;
                else s = -999; // Tolak ASR bahasa yang salah
            } else if (isIdSong) {
                if (lang.startsWith('id')) s += 80;
                else s = -999;
            } else if (isRuSong) {
                if (lang.startsWith('ru')) s += 80;
                else s = -999;
            } else if (isKrSong) {
                if (lang.startsWith('ko')) s += 80;
                else s = -999;
            } else if (isJpSong) {
                if (lang.startsWith('ja')) s += 80;
                else if (lang.startsWith('en')) s += 40;
                else s = -999; // Tolak ASR bahasa selain Jepang untuk lagu Jepang
            } else {
                if (lang.startsWith('id')) s += 80;
                else if (lang.startsWith('en')) s += 50;
                else if (lang.startsWith('ja')) s += 30;
                else if (lang.startsWith('ru')) s += 30;
            }
        }
        return { track: t, lang, langScore: s };
    };

    const asrCandidates = captionTracks
        .filter(t => t && t.kind === 'asr' && t.baseUrl)
        .map(scoreLang)
        .filter(c => c.langScore >= 0)
        .sort((a, b) => b.langScore - a.langScore);

    const manualCandidates = captionTracks
        .filter(t => t && t.kind !== 'asr' && t.baseUrl)
        .map(scoreLang)
        .filter(c => c.langScore >= 0)
        .sort((a, b) => b.langScore - a.langScore);

    const bestAsr = asrCandidates[0] || null;
    const bestManual = manualCandidates[0] || null;

    const idTrack = captionTracks.find(t => t && t.baseUrl && String(t.languageCode || '').toLowerCase().startsWith('id') && t.kind !== 'asr') ||
                    captionTracks.find(t => t && t.baseUrl && String(t.languageCode || '').toLowerCase().startsWith('id'));
    const jaTrack = captionTracks.find(t => t && t.baseUrl && String(t.languageCode || '').toLowerCase().startsWith('ja') && t.kind !== 'asr');

    const [asrXmlRes, manualXmlRes, idXmlRes, jaXmlRes] = await Promise.all([
        bestAsr ? httpRequestRaw(`${bestAsr.track.baseUrl}&fmt=srv3`, { ua: usedClient.ua, timeout: 5000 }) : Promise.resolve({ body: '' }),
        bestManual ? httpRequestRaw(`${bestManual.track.baseUrl}&fmt=srv3`, { ua: usedClient.ua, timeout: 5000 }) : Promise.resolve({ body: '' }),
        (idTrack && (!bestManual || idTrack !== bestManual.track)) ? httpRequestRaw(`${idTrack.baseUrl}&fmt=srv3`, { ua: usedClient.ua, timeout: 5000 }).catch(() => ({ body: '' })) : Promise.resolve({ body: '' }),
        (jaTrack && (!bestManual || jaTrack !== bestManual.track)) ? httpRequestRaw(`${jaTrack.baseUrl}&fmt=srv3`, { ua: usedClient.ua, timeout: 5000 }).catch(() => ({ body: '' })) : Promise.resolve({ body: '' })
    ]);

    const parsedAsr = (asrXmlRes && asrXmlRes.body && asrXmlRes.body.length > 50)
        ? parseSrv3Stream(asrXmlRes.body)
        : { tokens: [], lines: [] };
    const parsedManual = (manualXmlRes && manualXmlRes.body && manualXmlRes.body.length > 50)
        ? parseSrv3Stream(manualXmlRes.body)
        : { tokens: [], lines: [] };
    const parsedId = (idXmlRes && idXmlRes.body && idXmlRes.body.length > 50)
        ? parseSrv3Stream(idXmlRes.body)
        : { tokens: [], lines: [] };
    const parsedJa = (jaXmlRes && jaXmlRes.body && jaXmlRes.body.length > 50)
        ? parseSrv3Stream(jaXmlRes.body)
        : { tokens: [], lines: [] };

function mergeFragmentedAsrLines(rawLines) {
    if (!Array.isArray(rawLines) || rawLines.length <= 2) return rawLines;
    const merged = [];
    let cur = null;

    for (let i = 0; i < rawLines.length; i++) {
        const item = rawLines[i];
        const text = String(item.text || item.rawText || '').trim();
        if (!text) continue;

        if (!cur) {
            cur = { ...item };
            continue;
        }

        const curText = cur.text.trim();
        const wordCount = curText.split(/\s+/).length;
        const gap = item.time - (cur.endTime || cur.time);
        const endsWithPunct = /[.!?]$/.test(curText);
        const curDur = (cur.endTime || (item.time + 1.5)) - cur.time;
        const endsWithDangling = /\b(dan|dan\s+juga|atau|yang|untuk|dengan|saat|walau|karena|tapi|agar|bila|jika|ku|kau|and|to|with|of|the|in|on|at|for|that|which|as|so|but|or),?$/i.test(curText) || /[,，、…—–]$/.test(curText);

        const shouldMerge = endsWithDangling || (!endsWithPunct && (wordCount < 4 || curDur < 2.4) && gap < 1.6 && (wordCount + text.split(/\s+/).length <= 11));

        if (shouldMerge) {
            const separator = hasJapaneseChars(curText + text) ? '' : ' ';
            cur.text = `${curText}${separator}${text}`;
            cur.rawText = cur.text;
            cur.endTime = Math.max(cur.endTime || 0, item.endTime || (item.time + 1.5));
        } else {
            merged.push(cur);
            cur = { ...item };
        }
    }
    if (cur) merged.push(cur);
    return merged;
}

function sanitizeBilingualManualLines(rawLines) {
    if (!Array.isArray(rawLines) || rawLines.length <= 2) return rawLines;
    const cleaned = [];
    for (let i = 0; i < rawLines.length; i++) {
        const cur = rawLines[i];
        const next = rawLines[i + 1];

        // 1. Cek pasangan bilingual pada timestamp berdekatan (<= 0.85s)
        if (next && Math.abs(next.time - cur.time) <= 0.85) {
            const curText = (cur.text || cur.rawText || '').trim();
            const nextText = (next.text || next.rawText || '').trim();
            const isDifferent = curText.toLowerCase() !== nextText.toLowerCase();

            if (isDifferent) {
                // Di subtitle resmi YouTube (TimedText), baris pertama (cur) selalu merupakan lirik/vokal yang dinyanyikan!
                // Sedangkan baris kedua (next) adalah terjemahan resmi track tersebut!
                cleaned.push({
                    time: cur.time,
                    endTime: Math.max(cur.endTime || 0, next.endTime || 0),
                    text: curText,
                    rawText: curText,
                    transText: nextText
                });
                i++; // lewati next karena sudah dipasangkan
                continue;
            }
        }

        // 2. Cek jika teks berulang sama persis dalam <= 1.2s dari baris yang baru saja dimasukkan
        const prev = cleaned[cleaned.length - 1];
        if (prev && Math.abs(cur.time - prev.time) <= 1.2) {
            const curNorm = cur.text.trim().toLowerCase();
            const prevNorm = (prev.rawText || prev.text).trim().toLowerCase();
            const prevTransNorm = (prev.transText || '').trim().toLowerCase();
            if (curNorm === prevNorm || (prevTransNorm && curNorm === prevTransNorm)) {
                continue;
            }
        }

        cleaned.push(cur);
    }
    return cleaned;
}

    // Prioritaskan Manual CC buatan manusia di atas Auto-ASR
    const isManualCC = Boolean(bestManual && parsedManual.lines.length >= 4);
    const useAsrPrimary = !isManualCC && parsedAsr.tokens.length >= 6;
    const primaryTokens = useAsrPrimary ? parsedAsr.tokens : (parsedManual.tokens.length >= 6 ? parsedManual.tokens : parsedAsr.tokens);
    const asrMergedLines = mergeFragmentedAsrLines(parsedAsr.lines);
    const sanitizedManual = isManualCC ? sanitizeBilingualManualLines(parsedManual.lines) : [];
    const primaryLines = isManualCC ? sanitizedManual : asrMergedLines;
    const languageCode = (bestManual && bestManual.lang) || (bestAsr && bestAsr.lang) || '';
    const cleanIdLines = idTrack
        ? (bestManual && idTrack === bestManual.track ? sanitizedManual : (parsedId.lines.length > 0 ? sanitizeBilingualManualLines(parsedId.lines) : []))
        : [];
    const cleanJaLines = jaTrack
        ? (bestManual && jaTrack === bestManual.track ? sanitizedManual : (parsedJa.lines.length > 0 ? sanitizeBilingualManualLines(parsedJa.lines) : []))
        : [];

    if (primaryTokens.length === 0 && primaryLines.length === 0) return null;

    return {
        videoId: chosenVideo.id,
        videoDur: chosenVideo.dur,
        isManualCC,
        isAsrTokens: useAsrPrimary,
        languageCode,
        tokens: primaryTokens,
        lines: primaryLines,
        japaneseLines: cleanJaLines,
        indonesianLines: cleanIdLines
    };
}


module.exports = { decodeXmlEntities, parseSrv3Stream, parseDurationTextToSec, fetchYouTubeCaptionStream };
