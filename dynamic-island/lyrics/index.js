"use strict";
const { lyricsCache, translateToIndonesian } = require("./http-client");
const { hasJapaneseChars, hasKanji, hasHiraganaOrKatakana, kanaToRomaji, parseTrackMetadata, mergeJapaneseAndRomajiLines, attachTranslationLines } = require("./text-romaji");
const { searchNetEaseLyrics, searchLrclibLyrics, searchKuGouLyrics } = require("./providers");
const { fetchYouTubeCaptionStream } = require("./youtube-captions");
const { forceAlignLyricsToAudioStream } = require("./forced-alignment");

// ==================== PIPELINE UTAMA PENYEDIA LIRIK SINKRON 100% ====================

async function getCompleteSyncedLyrics(rawTitle, rawArtist, mediaDur = 0, onFastResult = null) {
    const cacheKey = `${rawTitle}|${rawArtist}|${Math.round(mediaDur || 0)}`;
    if (lyricsCache.has(cacheKey)) {
        return lyricsCache.get(cacheKey);
    }

    const meta = parseTrackMetadata(rawTitle, rawArtist);
    let bestFastScore = -1;

    const maybeEmitFast = (cand, isFinalDbMerge = false) => {
        if (typeof onFastResult !== 'function') return;
        if (cand && cand.hasSyncedTimestamps && Array.isArray(cand.lines) && cand.lines.length >= 4) {
            // Untuk lagu Jepang, tunggu hasil gabungan Romaji NetEase (isFinalDbMerge) jika kandidat awal belum punya Romaji
            if (!isFinalDbMerge && meta.likelyJapanese && !cand.lines.some(l => l.romaText)) {
                return;
            }
            const candScore = Number(cand.score) || 0;
            if (candScore <= bestFastScore) return;
            bestFastScore = candScore;
            try {
                onFastResult({
                    title: rawTitle,
                    track: [cand.artistName, cand.trackName].filter(Boolean).join(' - ') || rawTitle,
                    source: `${cand.source} Fast LRC`,
                    trackDuration: mediaDur || cand.duration || 0,
                    lines: cand.lines
                });
            } catch (_) {}
        }
    };

    // Jalankan pencarian Multi-Source Database & Ekstraksi Stream Caption YouTube secara paralel!
    const dbPromise = Promise.all([
        searchNetEaseLyrics(meta, mediaDur).then(r => { maybeEmitFast(r, false); return r; }).catch(() => null),
        searchLrclibLyrics(meta, mediaDur).then(r => { maybeEmitFast(r, false); return r; }).catch(() => null),
        searchKuGouLyrics(meta, mediaDur).then(r => { maybeEmitFast(r, false); return r; }).catch(() => null)
    ]).then(([ne, lrc, kg]) => {
        const cands = [ne, lrc, kg].filter(Boolean).sort((a, b) => b.score - a.score);
        const top = cands[0] || null;
        if (top && top.isJapanese && top.source !== 'NetEase' && ne && ne.lines.some(l => l.romaText)) {
            const romaPool = ne.lines
                .filter(l => l.romaText)
                .map(l => ({ time: l.time, text: l.romaText }));
            top.lines = mergeJapaneseAndRomajiLines(
                top.lines.map(l => ({ time: l.time, text: l.rawText || l.text })),
                romaPool
            );
            top.score += 25;
        }
        if (top && top.source !== 'NetEase' && ne && ne.lines.some(l => l.transText)) {
            const isOrigChinese = /[\u4e00-\u9fa5]/.test(`${meta.origTitle} ${meta.origArtist}`);
            const transPool = ne.lines
                .filter(l => l.transText && (!/[\u4e00-\u9fa5]/.test(l.transText) || isOrigChinese))
                .map(l => ({ time: l.time, text: l.transText }));
            if (transPool.length > 0) {
                top.lines = attachTranslationLines(top.lines, transPool);
            }
        }
        if (top) maybeEmitFast(top, true);
        return { neRes: ne, lrcRes: lrc, kgRes: kg, bestDb: top };
    });

    const [dbBundle, ytCaptions] = await Promise.all([
        dbPromise,
        fetchYouTubeCaptionStream(rawTitle, rawArtist, mediaDur, meta).catch(() => null)
    ]);

    let bestDb = dbBundle.bestDb;

    let finalLines = [];
    let syncMethod = '';
    let trackDuration = mediaDur || (bestDb && bestDb.duration) || (ytCaptions && ytCaptions.videoDur) || 0;

    // KASUS 1: Kita punya Lirik Standar Akurat (LRCLIB / NetEase / KuGou) + Stream Vokal/Caption YouTube (.srv3)
    // -> Jalankan Audio-to-Text Forced Alignment agar ejaan 100% akurat & timestamp mengikuti vokal video milidetik demi milidetik!
    if (bestDb && ytCaptions && ytCaptions.tokens.length >= 6) {
        finalLines = forceAlignLyricsToAudioStream(
            bestDb.lines,
            ytCaptions,
            bestDb.hasSyncedTimestamps,
            trackDuration,
            Number(bestDb.duration) || 0
        );
        const anchoredCount = finalLines.filter(l => l.anchored).length;
        syncMethod = anchoredCount >= 3
            ? `${bestDb.source} + YouTube Forced Alignment`
            : `${bestDb.source} Synced`;
    }
    // KASUS 2: Video YouTube punya Subtitle Resmi / Manual CC dari kreator (misal cover utattemita unik)
    else if (ytCaptions && ytCaptions.isManualCC && ytCaptions.lines.length >= 4) {
        finalLines = ytCaptions.lines.map(l => {
            const isPureKana = !hasKanji(l.text) && hasHiraganaOrKatakana(l.text);
            const roma = isPureKana ? kanaToRomaji(l.text) : '';
            return {
                time: l.time,
                text: (roma && roma.toLowerCase() !== l.text.toLowerCase()) ? `${roma} · ${l.text}` : l.text,
                rawText: l.text,
                romaText: roma
            };
        });
        syncMethod = 'YouTube Official CC (.srv3)';
    }
    // KASUS 3: Lirik Tersinkronisasi dari Database Multi-Source (NetEase / LRCLIB / KuGou)
    else if (bestDb && bestDb.lines.length > 0) {
        finalLines = bestDb.lines;
        syncMethod = `${bestDb.source} Synced LRC`;

        // Kompensasi Otomatis Intro Sinematik Official MV:
        // Pada Official Music Video YouTube tanpa CC, umumnya ada intro visual 4-35 detik sebelum vokal/musik dimulai.
        // Jika durasi video YouTube > durasi audio album studio, geser waktu lirik ke depan agar pas dengan vokal video!
        const isOfficialMv = /(?:official\s*(?:music\s*)?video|official\s*mv|\bmv\b|music\s*video)/i.test(rawTitle);
        const dbDur = Number(bestDb.duration) || 0;
        if (isOfficialMv && mediaDur > 45 && dbDur > 45 && (mediaDur - dbDur >= 4) && (mediaDur - dbDur <= 35)) {
            const introShift = Math.max(0, mediaDur - dbDur);
            finalLines = bestDb.lines.map(l => ({
                ...l,
                time: Math.round((l.time + introShift) * 100) / 100
            }));
            syncMethod = `${bestDb.source} Synced (+${introShift}s MV Intro)`;
        }
    }
    // KASUS 4: Fallback ke aliran TimedText YouTube (.srv3) jika lagu cover indie belum terdaftar di database mana pun
    else if (ytCaptions && ytCaptions.lines.length >= 3) {
        finalLines = ytCaptions.lines.map(l => {
            const isPureKana = !hasKanji(l.text) && hasHiraganaOrKatakana(l.text);
            const roma = isPureKana ? kanaToRomaji(l.text) : '';
            return {
                time: l.time,
                text: (roma && roma.toLowerCase() !== l.text.toLowerCase()) ? `${roma} · ${l.text}` : l.text,
                rawText: l.text,
                romaText: roma
            };
        });
        syncMethod = 'YouTube Captions Stream (.srv3)';
    }

    // 1. Lampirkan sub-lirik terjemahan Bahasa Indonesia resmi jika tersedia dari YouTube TimedText!
    if (ytCaptions && Array.isArray(ytCaptions.indonesianLines) && ytCaptions.indonesianLines.length >= 3 && finalLines.length > 0) {
        finalLines = attachTranslationLines(finalLines, ytCaptions.indonesianLines);
    }

    // 2. Terjemahan cerdas ke Bahasa Indonesia jika belum ada sub-lirik Indonesia
    const hasAnyIndoTrans = finalLines.some(l => l.transText && !/[\u4e00-\u9fa5]/.test(l.transText));
    if (!hasAnyIndoTrans && finalLines.length > 0) {
        const isJapanese = Boolean(meta.likelyJapanese || finalLines.some(l => l.romaText || hasJapaneseChars(l.rawText || l.text)));
        const toTranslate = finalLines.slice(0, 40);
        try {
            await Promise.all(toTranslate.map(async (l) => {
                const targetText = l.rawText || l.text;
                if (!targetText || targetText.length < 2) return;
                const translated = await translateToIndonesian(targetText, isJapanese ? 'ja' : 'en');
                if (translated && translated.toLowerCase() !== targetText.toLowerCase()) {
                    l.transText = translated;
                }
            }));
        } catch (_) {}
    }

    const coverUrl = (ytCaptions && ytCaptions.videoId)
        ? `https://i.ytimg.com/vi/${ytCaptions.videoId}/hqdefault.jpg`
        : '';

    const result = {
        title: rawTitle,
        track: bestDb ? [bestDb.artistName, bestDb.trackName].filter(Boolean).join(' - ') : rawTitle,
        source: syncMethod || 'Multi-Source',
        trackDuration,
        coverUrl,
        lines: finalLines
    };

    if (finalLines.length > 0) {
        if (lyricsCache.size > 60) {
            const firstKey = lyricsCache.keys().next().value;
            lyricsCache.delete(firstKey);
        }
        lyricsCache.set(cacheKey, result);
    }

    return result;
}

module.exports = {
    getCompleteSyncedLyrics,
    parseTrackMetadata,
    kanaToRomaji
};

