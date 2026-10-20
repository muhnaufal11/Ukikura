"use strict";
const { httpRequestJson } = require("./http-client");
const {
    hasJapaneseChars,
    hasKanji,
    hasHiraganaOrKatakana,
    kanaToRomaji,
    parseLrcText,
    mergeJapaneseAndRomajiLines,
    attachTranslationLines,
    isUnwantedForeignTranslation,
    computeMetadataSimilarity,
    isIndonesianText
} = require("./text-romaji");

// ==================== DATABASE 1: NETEASE CLOUD MUSIC (JEPANG KANJI+ROMAJI, INDONESIA, GLOBAL) ====================

async function searchNetEaseLyrics(meta, mediaDur) {
    const candidates = [];
    const primaryQueries = meta.queries.slice(0, 3);
    const searchResults = await Promise.all(
        primaryQueries.map(qStr =>
            httpRequestJson(`https://music.163.com/api/search/get?s=${encodeURIComponent(qStr)}&type=1&limit=8`, {
                method: 'POST',
                headers: { 'Referer': 'https://music.163.com' },
                timeout: 4200
            })
        )
    );

    for (const data of searchResults) {
        const songs = data && data.result && Array.isArray(data.result.songs) ? data.result.songs : [];
        for (const s of songs) {
            if (!s || !s.id) continue;
            const artistStr = Array.isArray(s.artists) ? s.artists.map(a => a.name).join(' ') : '';
            const metaStr = `${artistStr} ${s.name || ''} ${s.album ? s.album.name : ''}`;
            if (!meta.isLofiOrInst && /\b(lofi|lo-fi|instrumental|karaoke|off\s*vocal|8-bit|nightcore)\b|伴奏/i.test(metaStr)) {
                continue;
            }
            const sim = computeMetadataSimilarity(s.name, artistStr, meta);
            if (sim < 20) continue;

            const durSec = s.duration ? Math.round(Number(s.duration) / 1000) : 0;
            let durScore = 0;
            if (mediaDur > 30 && durSec > 30) {
                const diff = Math.abs(durSec - mediaDur);
                if (diff <= 4) durScore = 45;
                else if (diff <= 12) durScore = 25;
                else if (diff <= 25) durScore = 10;
            }

            candidates.push({
                id: s.id,
                name: s.name || '',
                artist: artistStr,
                durSec,
                score: sim + durScore
            });
        }
    }

    candidates.sort((a, b) => b.score - a.score);
    const seenIds = new Set();
    const topSongs = [];
    for (const c of candidates) {
        if (seenIds.has(c.id)) continue;
        seenIds.add(c.id);
        topSongs.push(c);
        if (topSongs.length >= 4) break;
    }

    if (topSongs.length === 0) return null;

    const lyrPayloads = [];
    for (const song of topSongs) {
        try {
            const lyrData = await httpRequestJson(
                `https://music.163.com/api/song/lyric?id=${song.id}&lv=1&kv=1&tv=-1&rv=-1`,
                { headers: { 'Referer': 'https://music.163.com' }, timeout: 3800 }
            );
            if (lyrData) {
                lyrPayloads.push({ song, lyrData });
                // Jika lagu Jepang dan sudah menemukan romalrc lengkap, cukup dan langsung gunakan
                if (meta.likelyJapanese && lyrData.romalrc && lyrData.romalrc.lyric && lyrData.romalrc.lyric.length > 50) {
                    break;
                }
            }
        } catch (_) {}
    }

    let bestResult = null;

    for (const { song, lyrData } of lyrPayloads) {
        if (!lyrData) continue;

        const rawLrc = lyrData.lrc && lyrData.lrc.lyric ? lyrData.lrc.lyric : '';
        const rawRoma = lyrData.romalrc && lyrData.romalrc.lyric ? lyrData.romalrc.lyric : '';
        const rawTrans = lyrData.tlyric && lyrData.tlyric.lyric ? lyrData.tlyric.lyric : '';
        if (!rawLrc && !rawRoma) continue;

        const sample = (rawLrc || rawRoma).slice(0, 600);
        if (isUnwantedForeignTranslation(`${song.artist} ${song.name}`, sample, meta.origTitle)) {
            continue;
        }

        const isJpLrc = hasJapaneseChars(sample);
        if (meta && ((meta.isEnglishVersion || meta.isIndonesianVersion) && isJpLrc)) {
            continue;
        }
        if (meta && meta.isIndonesianVersion && !isIndonesianText(sample)) {
            continue;
        }

        const lrcLines = parseLrcText(rawLrc);
        const romaLines = parseLrcText(rawRoma);
        const transLines = rawTrans ? parseLrcText(rawTrans) : [];

        let finalLines = [];
        if (isJpLrc && lrcLines.length >= 4) {
            finalLines = mergeJapaneseAndRomajiLines(lrcLines, romaLines);
        } else if (lrcLines.length >= 4) {
            finalLines = lrcLines.map(l => ({
                time: l.time,
                text: l.text,
                rawText: l.text,
                romaText: '',
                transText: ''
            }));
        } else if (romaLines.length >= 4) {
            finalLines = romaLines.map(l => ({
                time: l.time,
                text: l.text,
                rawText: l.text,
                romaText: l.text,
                transText: ''
            }));
        }

        const isTransChinese = transLines.some(l => /[\u4e00-\u9fa5]/.test(l.text));
        if (transLines.length > 0 && finalLines.length > 0 && !isTransChinese) {
            finalLines = attachTranslationLines(finalLines, transLines);
        }

        if (finalLines.length >= 4) {
            let bonus = 40;
            if (meta.likelyJapanese && isJpLrc) bonus += 25;
            if (romaLines.length >= 4) bonus += 20;

            const candidateRes = {
                source: 'NetEase',
                trackName: song.name,
                artistName: song.artist,
                duration: song.durSec,
                hasSyncedTimestamps: true,
                isJapanese: isJpLrc || romaLines.length >= 4,
                score: song.score + bonus,
                lines: finalLines
            };
            if (!bestResult || candidateRes.score > bestResult.score) {
                bestResult = candidateRes;
            }
        }
    }
    return bestResult;
}

// ==================== DATABASE 2: LRCLIB (INDONESIA, JEPANG, BARAT, GLOBAL) ====================

async function searchLrclibLyrics(meta, mediaDur) {
    let bestCandidate = null;
    const primaryQueries = meta.queries.slice(0, 3);
    const searchLists = await Promise.all(
        primaryQueries.map(qStr =>
            httpRequestJson(`https://lrclib.net/api/search?q=${encodeURIComponent(qStr)}`, { timeout: 4200 })
        )
    );

    const evaluateList = (list) => {
        if (!Array.isArray(list) || list.length === 0) return;
        for (const item of list) {
            if (!item || (!item.syncedLyrics && !item.plainLyrics)) continue;
            const metaStr = `${item.artistName || ''} ${item.trackName || ''} ${item.albumName || ''}`;
            const lyrSample = String(item.syncedLyrics || item.plainLyrics || '').slice(0, 1500);

            if (!meta.isLofiOrInst && /\b(lofi|lo-fi|instrumental|karaoke|8-bit|nightcore)\b/i.test(metaStr)) {
                continue;
            }
            if (isUnwantedForeignTranslation(metaStr, lyrSample, meta.origTitle)) {
                continue;
            }

            const sim = computeMetadataSimilarity(item.trackName, item.artistName, meta);
            if (sim < 22) continue;

            let score = sim + (item.syncedLyrics ? 55 : 15);
            const isJpText = hasJapaneseChars(lyrSample);

            if (meta && meta.isEnglishVersion) {
                // TOLAK lirik Jepang/Korea jika lagu adalah versi/cover Bahasa Inggris!
                if (isJpText || hasJapaneseChars(item.trackName || '') || hasJapaneseChars(item.artistName || '') || /[\uac00-\ud7af]/.test(lyrSample)) {
                    continue;
                }
                score += 30; // Bonus kecocokan bahasa Inggris
            } else if (meta && meta.isIndonesianVersion) {
                // TOLAK lirik non-Indonesia jika lagu adalah versi/cover Bahasa Indonesia!
                if (isJpText || hasJapaneseChars(item.trackName || '') || hasJapaneseChars(item.artistName || '') || !isIndonesianText(lyrSample)) {
                    continue;
                }
                score += 30;
            } else if (meta && meta.isJapaneseVersion) {
                // Jangan terima terjemahan bahasa Inggris studio jika sedang memutar versi cover Jepang (Utattemita)
                if (!isJpText && /\b(the|and|you|i|my|to|in)\b/i.test(lyrSample)) {
                    continue;
                }
                score += 35;
            } else if (meta && meta.likelyJapanese) {
                if (isJpText) {
                    score += 35;
                } else if (/\b(kimi|boku|watashi|kokoro|yume|namida|kotoba|sekai|hikari|ashita|yoru|kaze|sora|uta|ai)\b/i.test(lyrSample)) {
                    score += 20;
                }
            }

            const d = Number(item.duration) || 0;
            if (mediaDur > 30 && d > 30) {
                const diff = Math.abs(d - mediaDur);
                if (diff <= 4) score += 45;
                else if (diff <= 12) score += 25;
                else if (diff <= 25) score += 10;
            }

            if (!bestCandidate || score > bestCandidate.score) {
                bestCandidate = { item, score, isJpText };
            }
        }
    };

    for (const list of searchLists) {
        evaluateList(list);
    }

    if ((!bestCandidate || bestCandidate.score < 120) && meta.queries.length > 3) {
        const extraList = await httpRequestJson(`https://lrclib.net/api/search?q=${encodeURIComponent(meta.queries[3])}`, { timeout: 3500 });
        evaluateList(extraList);
    }

    if (!bestCandidate || bestCandidate.score < 50) return null;

    const chosen = bestCandidate.item;
    let lines = [];
    let hasSyncedTimestamps = false;

    if (chosen.syncedLyrics) {
        const parsed = parseLrcText(chosen.syncedLyrics);
        if (parsed.length >= 4) {
            hasSyncedTimestamps = true;
            lines = parsed.map(l => ({
                time: l.time,
                text: l.text,
                rawText: l.text,
                romaText: (!hasKanji(l.text) && hasHiraganaOrKatakana(l.text)) ? kanaToRomaji(l.text) : ''
            }));
        }
    }

    if (lines.length === 0 && chosen.plainLyrics) {
        const rawLines = chosen.plainLyrics
            .split(/\r?\n/)
            .map(s => s.trim())
            .filter(s => s && !/^\[.*\]$/.test(s));
        const totalDur = Number(chosen.duration) || mediaDur || 210;
        const step = Math.max(2.5, (totalDur - 12) / Math.max(1, rawLines.length));
        lines = rawLines.map((text, idx) => ({
            time: Math.round((6 + idx * step) * 100) / 100,
            text,
            rawText: text,
            romaText: (!hasKanji(text) && hasHiraganaOrKatakana(text)) ? kanaToRomaji(text) : ''
        }));
    }

    if (lines.length < 3) return null;

    return {
        source: 'LRCLIB',
        trackName: chosen.trackName || '',
        artistName: chosen.artistName || '',
        duration: Number(chosen.duration) || 0,
        hasSyncedTimestamps,
        isJapanese: bestCandidate.isJpText,
        score: bestCandidate.score,
        lines
    };
}

// ==================== DATABASE 3: KUGOU MUSIC LRC ====================

async function searchKuGouLyrics(meta, mediaDur) {
    const primaryQueries = meta.queries.slice(0, 2);
    if (primaryQueries.length === 0) return null;
    const durMs = mediaDur > 30 ? Math.round(mediaDur * 1000) : 210000;
    const searchLists = await Promise.all(
        primaryQueries.map(qStr =>
            httpRequestJson(`http://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(qStr)}&duration=${durMs}&hash=`, { timeout: 4200 })
        )
    );
    const cands = [];
    for (const sJson of searchLists) {
        if (sJson && Array.isArray(sJson.candidates)) {
            cands.push(...sJson.candidates);
        }
    }
    if (cands.length === 0) return null;

    for (const c of cands.slice(0, 3)) {
        if (!c || !c.id || !c.accesskey) continue;
        const sim = computeMetadataSimilarity(c.song || '', c.singer || '', meta);
        if (sim < 22) continue;

        const dlUrl = `http://lyrics.kugou.com/download?ver=1&client=pc&id=${c.id}&accesskey=${c.accesskey}&fmt=lrc&charset=utf8`;
        const dlJson = await httpRequestJson(dlUrl, { timeout: 4200 });
        if (!dlJson || !dlJson.content) continue;

        let rawLrc = '';
        try {
            rawLrc = Buffer.from(dlJson.content, 'base64').toString('utf8');
        } catch (_) {
            continue;
        }
        if (isUnwantedForeignTranslation(`${c.singer} ${c.song}`, rawLrc.slice(0, 600), meta.origTitle)) {
            continue;
        }

        const parsed = parseLrcText(rawLrc);
        if (parsed.length >= 5) {
            const isJp = hasJapaneseChars(rawLrc.slice(0, 500));
            if (meta && ((meta.isEnglishVersion || meta.isIndonesianVersion) && isJp)) {
                continue;
            }
            if (meta && meta.isIndonesianVersion && !isIndonesianText(rawLrc.slice(0, 800))) {
                continue;
            }
            return {
                source: 'KuGou',
                trackName: c.song || '',
                artistName: c.singer || '',
                duration: c.duration ? Math.round(Number(c.duration) / 1000) : 0,
                hasSyncedTimestamps: true,
                isJapanese: isJp,
                score: sim + 50 + (meta.likelyJapanese && isJp ? 60 : 0),
                lines: parsed.map(l => ({
                    time: l.time,
                    text: l.text,
                    rawText: l.text,
                    romaText: (!hasKanji(l.text) && hasHiraganaOrKatakana(l.text)) ? kanaToRomaji(l.text) : ''
                }))
            };
        }
    }
    return null;
}


module.exports = { searchNetEaseLyrics, searchLrclibLyrics, searchKuGouLyrics };
