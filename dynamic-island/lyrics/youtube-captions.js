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
            const last = lines[lines.length - 1];
            if (last && last.text.toLowerCase() === cleanText.toLowerCase() && (tSec - last.time) < 8.0) {
                last.endTime = Math.max(last.endTime, Math.round((tSec + dSec) * 1000) / 1000);
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
    const searchQuery = [rawTitle, rawArtist].filter(Boolean).join(' ').trim();
    if (!searchQuery) return null;

    const searchBody = JSON.stringify({
        context: {
            client: {
                clientName: WEB_CLIENT.clientName,
                clientVersion: WEB_CLIENT.clientVersion,
                hl: 'en',
                gl: 'ID'
            }
        },
        query: searchQuery
    });

    const searchRes = await httpRequestRaw('https://www.youtube.com/youtubei/v1/search?prettyPrint=false', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: searchBody,
        timeout: 6500
    });

    if (!searchRes.body) return null;

    // Ekstrak kandidat videoId beserta durasi dari hasil pencarian YouTube
    const videoIds = [];
    const rendererBlocks = searchRes.body.split('"videoRenderer":').slice(1, 7);
    for (let idx = 0; idx < rendererBlocks.length; idx++) {
        const blk = rendererBlocks[idx].slice(0, 4500);
        const vidMatch = blk.match(/^\{?"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (!vidMatch) continue;
        const vid = vidMatch[1];
        const lenMatch = blk.match(/"lengthText":\{[\s\S]{1,350}?"simpleText":"([\d:]+)"/);
        const vDur = lenMatch ? parseDurationTextToSec(lenMatch[1]) : 0;

        let score = 60 - idx * 8;
        if (mediaDur > 20 && vDur > 20) {
            const diff = Math.abs(vDur - mediaDur);
            if (diff <= 3) score += 65;
            else if (diff <= 8) score += 35;
            else if (diff > 45) score -= 50;
        }
        if (!videoIds.some(v => v.id === vid)) {
            videoIds.push({ id: vid, dur: vDur, score });
        }
    }

    if (videoIds.length === 0) {
        const fallbackMatch = searchRes.body.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
        if (fallbackMatch) videoIds.push({ id: fallbackMatch[1], dur: 0, score: 40 });
    }

    videoIds.sort((a, b) => b.score - a.score);
    const chosenVideo = videoIds[0];
    if (!chosenVideo) return null;

    // Panggil InnerTube Player dengan ANDROID / IOS client untuk mendapatkan captionTracks bebas blokir exp=xpe
    let captionTracks = [];
    let usedClient = ANDROID_CLIENT;

    for (const client of [ANDROID_CLIENT, IOS_CLIENT]) {
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
            videoId: chosenVideo.id
        });
        const pJson = await httpRequestJson('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
            method: 'POST',
            ua: client.ua,
            headers: { 'Content-Type': 'application/json' },
            body: pBody,
            timeout: 6500
        });
        const tracks = pJson &&
            pJson.captions &&
            pJson.captions.playerCaptionsTracklistRenderer &&
            Array.isArray(pJson.captions.playerCaptionsTracklistRenderer.captionTracks)
            ? pJson.captions.playerCaptionsTracklistRenderer.captionTracks
            : [];
        if (tracks.length > 0) {
            captionTracks = tracks;
            usedClient = client;
            break;
        }
    }

    if (captionTracks.length === 0) return null;

    // Pisahkan kandidat ASR (memiliki <s t="..."> timestamp vokal per kata langsung dari gelombang audio)
    // dan kandidat Manual CC (subtitle dari kreator)
    const isJpSong = Boolean(meta && meta.likelyJapanese);
    const scoreLang = (t) => {
        const lang = String(t.languageCode || '').toLowerCase();
        let s = 0;
        if (isJpSong) {
            // Untuk lagu Jepang, jalur CC bahasa Jepang adalah vokal/lirik asli yang dinyanyikan!
            if (lang.startsWith('ja')) s += 100;
            else if (lang.startsWith('en')) s += 45;
            else if (lang.startsWith('id')) s += 30;
        } else {
            // Untuk lagu non-Jepang (lagu Indonesia/Global), prioritaskan lirik Indonesia jika ada
            if (lang.startsWith('id')) s += 100;
            else if (lang.startsWith('en')) s += 60;
            else if (lang.startsWith('ja')) s += 30;
        }
        return { track: t, lang, langScore: s };
    };

    const asrCandidates = captionTracks
        .filter(t => t && t.kind === 'asr' && t.baseUrl)
        .map(scoreLang)
        .sort((a, b) => b.langScore - a.langScore);

    const manualCandidates = captionTracks
        .filter(t => t && t.kind !== 'asr' && t.baseUrl)
        .map(scoreLang)
        .sort((a, b) => b.langScore - a.langScore);

    const bestAsr = asrCandidates[0] || null;
    const bestManual = manualCandidates[0] || null;

    const idTrack = captionTracks.find(t => t && t.baseUrl && String(t.languageCode || '').toLowerCase().startsWith('id'));

    const [asrXmlRes, manualXmlRes, idXmlRes] = await Promise.all([
        bestAsr ? httpRequestRaw(`${bestAsr.track.baseUrl}&fmt=srv3`, { ua: usedClient.ua, timeout: 6500 }) : Promise.resolve({ body: '' }),
        bestManual ? httpRequestRaw(`${bestManual.track.baseUrl}&fmt=srv3`, { ua: usedClient.ua, timeout: 6500 }) : Promise.resolve({ body: '' }),
        idTrack ? httpRequestRaw(`${idTrack.baseUrl}&fmt=srv3`, { ua: usedClient.ua, timeout: 6500 }).catch(() => ({ body: '' })) : Promise.resolve({ body: '' })
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

    // Untuk Forced Alignment:
    // - Jika ada Manual CC pada bahasa lagu yang sama (langScore >= 45), gunakan Manual CC karena bebas jeda decoding ASR!
    // - Jika menggunakan Auto-ASR (kind === 'asr'), tandai isAsrTokens = true untuk kompensasi jeda vokal ASR (-1.05s)
    const manualHasSameLang = bestManual && bestManual.langScore >= 45 && parsedManual.tokens.length >= 10;
    const useAsrPrimary = !manualHasSameLang && parsedAsr.tokens.length >= 6;
    const primaryTokens = useAsrPrimary ? parsedAsr.tokens : (parsedManual.tokens.length >= 6 ? parsedManual.tokens : parsedAsr.tokens);
    const primaryLines = parsedManual.lines.length >= 4 ? parsedManual.lines : parsedAsr.lines;
    const isManualCC = parsedManual.lines.length >= 4;
    const languageCode = (bestManual && bestManual.lang) || (bestAsr && bestAsr.lang) || '';

    if (primaryTokens.length === 0 && primaryLines.length === 0) return null;

    return {
        videoId: chosenVideo.id,
        videoDur: chosenVideo.dur,
        isManualCC,
        isAsrTokens: useAsrPrimary,
        languageCode,
        tokens: primaryTokens,
        lines: primaryLines,
        indonesianLines: parsedId.lines
    };
}


module.exports = { decodeXmlEntities, parseSrv3Stream, parseDurationTextToSec, fetchYouTubeCaptionStream };
