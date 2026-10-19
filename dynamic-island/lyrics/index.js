"use strict";
const { lyricsCache } = require("./http-client");
const { hasHiraganaOrKatakana, kanaToRomaji, parseTrackMetadata, mergeJapaneseAndRomajiLines } = require("./text-romaji");
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
    let fastSent = false;

    const maybeEmitFast = (cand) => {
        if (fastSent || typeof onFastResult !== 'function') return;
        if (cand && cand.hasSyncedTimestamps && Array.isArray(cand.lines) && cand.lines.length >= 4) {
            fastSent = true;
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
    const [neRes, lrcRes, kgRes, ytCaptions] = await Promise.all([
        searchNetEaseLyrics(meta, mediaDur).then(r => { maybeEmitFast(r); return r; }).catch(() => null),
        searchLrclibLyrics(meta, mediaDur).then(r => { maybeEmitFast(r); return r; }).catch(() => null),
        searchKuGouLyrics(meta, mediaDur).then(r => { maybeEmitFast(r); return r; }).catch(() => null),
        fetchYouTubeCaptionStream(rawTitle, rawArtist, mediaDur, meta).catch(() => null)
    ]);

    const dbCandidates = [neRes, lrcRes, kgRes].filter(Boolean);
    dbCandidates.sort((a, b) => b.score - a.score);

    let bestDb = dbCandidates[0] || null;

    // Jika pemenang utama dari LRCLIB/KuGou adalah lagu Jepang tanpa Romaji, dan NetEase punya Romaji untuk lagu yang sama, gabungkan Romaji-nya!
    if (bestDb && bestDb.isJapanese && bestDb.source !== 'NetEase' && neRes && neRes.lines.some(l => l.romaText)) {
        const romaPool = neRes.lines
            .filter(l => l.romaText)
            .map(l => ({ time: l.time, text: l.romaText }));
        bestDb.lines = mergeJapaneseAndRomajiLines(
            bestDb.lines.map(l => ({ time: l.time, text: l.rawText || l.text })),
            romaPool
        );
    }

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
            const isJp = hasHiraganaOrKatakana(l.text);
            const roma = isJp ? kanaToRomaji(l.text) : '';
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
    }
    // KASUS 4: Fallback ke aliran TimedText YouTube (.srv3) jika lagu cover indie belum terdaftar di database mana pun
    else if (ytCaptions && ytCaptions.lines.length >= 3) {
        finalLines = ytCaptions.lines.map(l => {
            const isJp = hasHiraganaOrKatakana(l.text);
            const roma = isJp ? kanaToRomaji(l.text) : '';
            return {
                time: l.time,
                text: (roma && roma.toLowerCase() !== l.text.toLowerCase()) ? `${roma} · ${l.text}` : l.text,
                rawText: l.text,
                romaText: roma
            };
        });
        syncMethod = 'YouTube Captions Stream (.srv3)';
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

