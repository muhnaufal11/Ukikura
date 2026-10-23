"use strict";
const { lyricsCache, httpRequestJson, translateToIndonesian, translateBatchToIndonesian, fetchJapaneseRomajiAndIndonesian, fetchBatchJapaneseRomajiAndIndonesian } = require("./http-client");
const {
    hasJapaneseChars,
    hasKanji,
    hasHiraganaOrKatakana,
    kanaToRomaji,
    parseTrackMetadata,
    parseLrcText,
    mergeJapaneseAndRomajiLines,
    attachTranslationLines,
    isIndonesianText,
    computeMetadataSimilarity,
    isMoraSpacedRomaji,
    collapseMoraSpacedRomaji
} = require("./text-romaji");
const { searchNetEaseLyrics, searchLrclibLyrics, searchKuGouLyrics } = require("./providers");
const { fetchYouTubeCaptionStream } = require("./youtube-captions");
const { forceAlignLyricsToAudioStream } = require("./forced-alignment");

async function enrichWithRomaji(lines, meta, bestDb, isManualCC = false, mediaDur = 0) {
    if (!Array.isArray(lines) || lines.length === 0) return lines;

    const hasJp = lines.some(l => hasJapaneseChars(l.rawText) || hasJapaneseChars(l.text) || hasJapaneseChars(l.jpText));
    if (!hasJp && !meta.likelyJapanese && !meta.isJapaneseVersion) return lines;

    // Bersihkan spasi morfem berlebih pada lirik latin (seperti "mo shi mo shi")
    lines.forEach(l => {
        if (l.rawText && isMoraSpacedRomaji(l.rawText)) {
            l.rawText = collapseMoraSpacedRomaji(l.rawText);
        }
        if (l.text && isMoraSpacedRomaji(l.text)) {
            l.text = collapseMoraSpacedRomaji(l.text);
        }
        if (l.romaText && isMoraSpacedRomaji(l.romaText)) {
            l.romaText = collapseMoraSpacedRomaji(l.romaText);
        }
    });

    // Cari romalrc resmi ke NetEase HANYA jika bukan dari official CC YouTube dan masih ada baris tanpa Romaji
    const missingRomaCount = lines.filter(l => !l.romaText && (hasJapaneseChars(l.rawText) || hasJapaneseChars(l.text) || hasJapaneseChars(l.jpText))).length;
    if (!isManualCC && missingRomaCount >= 2) {
        const searchQueries = [
            bestDb ? `${bestDb.artistName} ${bestDb.trackName}` : '',
            meta.jpQuotes && meta.jpQuotes[0] ? `${meta.cleanChannel || ''} ${meta.jpQuotes[0]}` : '',
            ...(meta.queries || []),
            meta.cleanedTitle,
            meta.origTitle
        ]
            .map(q => String(q || '').replace(/[|•·／/]/g, ' ').replace(/\b(?:cover|covered|utattemita|歌ってみた)\b/gi, '').replace(/\s+/g, ' ').trim())
            .filter(q => q && q.length >= 2);

        const uniqueQueries = [...new Set(searchQueries)].slice(0, 3);
        for (const q of uniqueQueries) {
            try {
                const data = await httpRequestJson(
                    `https://music.163.com/api/search/get?s=${encodeURIComponent(q)}&type=1&limit=4`,
                    { method: 'POST', headers: { Referer: 'https://music.163.com' }, timeout: 3500 }
                );
                const songs = data?.result?.songs || [];
                for (const s of songs) {
                    if (!s || !s.id) continue;
                    const sDur = s.duration ? Math.round(Number(s.duration) / 1000) : 0;
                    if (mediaDur > 25 && sDur > 25 && Math.abs(sDur - mediaDur) > 15) {
                        continue;
                    }
                    const sim = computeMetadataSimilarity(s.name, s.artists?.[0]?.name, meta);
                    if (sim < 22) continue;

                    const lyrData = await httpRequestJson(
                        `https://music.163.com/api/song/lyric?id=${s.id}&lv=1&kv=1&tv=-1&rv=-1`,
                        { headers: { Referer: 'https://music.163.com' }, timeout: 3500 }
                    );
                    if (lyrData?.romalrc?.lyric && lyrData.romalrc.lyric.length > 50) {
                        const romaLines = parseLrcText(lyrData.romalrc.lyric);
                        if (romaLines.length >= 4) {
                            lines = mergeJapaneseAndRomajiLines(
                                lines.map(l => ({ time: l.time, text: l.rawText || l.text, transText: l.transText, jpText: l.jpText })),
                                romaLines
                            );
                            break;
                        }
                    }
                }
            } catch (_) {}
            if (lines.some(l => l.romaText)) break;
        }
    }

    // Jika rawText / text sudah berupa Romaji alfabet Latin murni dan jpText memuat aksara Jepang, jadikan romaText
    lines.forEach(l => {
        if (!l.romaText && l.jpText && /^[a-zA-Z0-9\s,.'!?~—–-]+$/.test(l.rawText || l.text)) {
            l.romaText = (l.rawText || l.text).trim();
        }
    });

    // Untuk baris yang hanya berupa Kana murni, gunakan kanaToRomaji instan
    lines.forEach(l => {
        const targetKana = (l.jpText && hasJapaneseChars(l.jpText)) ? l.jpText : (l.rawText || l.text || '');
        if ((!l.romaText || isMoraSpacedRomaji(l.romaText)) && !hasKanji(targetKana) && hasHiraganaOrKatakana(targetKana)) {
            l.romaText = kanaToRomaji(targetKana);
        }
    });

    // Untuk baris yang masih kekurangan Romaji (misal bait kanji pada ALiCE&u jpText), minta terjemahan batch cepat
    const remainingMissing = lines.filter(l => {
        const targetJp = (l.jpText && hasJapaneseChars(l.jpText)) ? l.jpText : ((hasJapaneseChars(l.rawText) || hasJapaneseChars(l.text)) ? (l.rawText || l.text) : '');
        return targetJp && (!l.romaText || isMoraSpacedRomaji(l.romaText));
    });

    if (remainingMissing.length > 0) {
        const texts = remainingMissing.map(l => (l.jpText && hasJapaneseChars(l.jpText)) ? l.jpText : (l.rawText || l.text));
        try {
            const batchRes = await fetchBatchJapaneseRomajiAndIndonesian(texts);
            batchRes.forEach((res, idx) => {
                const item = remainingMissing[idx];
                if (!item) return;
                if (res && res.romaji && (!item.romaText || isMoraSpacedRomaji(item.romaText))) {
                    item.romaText = res.romaji;
                }
                if (res && res.indo && (!item.transText || hasJapaneseChars(item.transText))) {
                    item.transText = res.indo;
                }
            });
        } catch (_) {}
    }

    // Pastikan string display memuat Romaji jika ada
    lines.forEach(l => {
        if (l.romaText && isMoraSpacedRomaji(l.romaText)) {
            l.romaText = collapseMoraSpacedRomaji(l.romaText);
        }
        if (l.romaText && hasJapaneseChars(l.rawText || l.text)) {
            l.text = `${l.romaText} · ${l.rawText || l.text}`;
        }
    });

    return lines;
}

function extractNgrams(text) {
    const clean = String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    const ngrams = new Set();
    for (let i = 0; i < clean.length - 1; i++) {
        ngrams.add(clean.slice(i, i + 2));
    }
    return ngrams;
}

function isBogusOrCommentaryCaptions(yt, bestDb, meta) {
    if (!yt || !Array.isArray(yt.lines) || yt.lines.length === 0) return false;

    // 1. Deteksi kata kunci khas vlog / obrolan / behind-the-scenes / diary komentar kreator
    const vlogPattern = /(?:撮影|オフショット|地元|横須賀|うみかぜ公園|スケボー|古着屋|思い出スポット|気づいた|ワッペン|スカート|カワイイネェ|だよーん|お待たせしました|楽しみね|だけど[‼️!]{2,}|不思議な感覚|おっと！！|担当しますよ|そうそう！！！|写ってるんだけど|あるの[‼️!]{2,}|チャンネル登録|概要欄|vlog|behind the scenes|bts|director's cut)/i;
    const vlogHits = yt.lines.filter(l => vlogPattern.test(l.rawText || l.text || '')).length;
    const vlogRatio = vlogHits / yt.lines.length;
    if (vlogHits >= 3 || vlogRatio >= 0.12) {
        return true;
    }

    // 2. Jika bestDb kanonikal tersedia dan memiliki baris lirik:
    if (bestDb && Array.isArray(bestDb.lines) && bestDb.lines.length >= 4) {
        const dbCombined = bestDb.lines.map(l => l.rawText || l.text || '').join(' ');
        const ytCombined = yt.lines.map(l => l.rawText || l.text || '').join(' ');
        const dbNgrams = extractNgrams(dbCombined);
        const ytNgrams = extractNgrams(ytCombined);

        if (dbNgrams.size >= 12 && ytNgrams.size >= 12) {
            let hits = 0;
            ytNgrams.forEach(g => { if (dbNgrams.has(g)) hits++; });
            const similarity = hits / ytNgrams.size;

            if (similarity < 0.12) {
                return true;
            }
            // Khusus lagu cover / remix / koplo (Rule 3):
            // Jika kesamaan teks lirik antara subtitle YouTube dan database kanonikal < 28%,
            // tolak subtitle YouTube agar menggunakan lirik kanonikal bersih dari database!
            if (meta && meta.isCover && similarity < 0.28) {
                return true;
            }
        }
    }

    return false;
}

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
            // Untuk lagu cover / remix / sped-up / slowed, JANGAN pernah kirim fast LRC studio yang belum diselaraskan!
            // Karena vokal cover memiliki tempo, intro, dan struktur ketukan yang berbeda dari album studio asli.
            if (meta.isCover || meta.isSpedUp || meta.isSlowed) {
                return;
            }

            // Untuk lagu Jepang / Asing / Multilingual, JANGAN pernah kirim fast LRC yang hanya 1 bahasa (misal bahasa Inggris tanpa Romaji/Kanji)
            // jika lagu aslinya memiliki subtitle Romaji/Kanji/Sub Indo yang sedang diekstraksi dari YouTube CC!
            if (meta.likelyJapanese || meta.isJapaneseVersion || /[\u3040-\u30ff\u4e00-\u9fff]/.test(rawTitle) || /\b(?:hololive|nijisanji|vshojo|vtuber|anime|alice&u)\b/i.test(`${rawTitle} ${rawArtist}`)) {
                const totalLines = cand.lines.length;
                const withTrans = cand.lines.filter(l => l.transText && l.transText.trim()).length;
                const withRomaOrJp = cand.lines.filter(l => l.romaText || l.jpText || hasJapaneseChars(l.rawText || l.text)).length;
                // Jika lagu multilingual/asing ini belum memiliki terjemahan memadai (<40%) atau Romaji/Kanji (<30%), tahan jangan di-emit fast
                if (withTrans < totalLines * 0.4 || withRomaOrJp < totalLines * 0.3) {
                    return;
                }
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
    ]).then(async ([ne, lrc, kg]) => {
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
        } else if (top && top.isJapanese && top.source !== 'NetEase' && (!ne || !ne.lines.some(l => l.romaText))) {
            // Jika kandidat teratas adalah lagu Jepang (misal dari LRCLIB) tanpa Romaji, cari Romaji langsung ke NetEase dengan artis & judul kanonikal
            try {
                const targetQ = `${top.artistName} ${top.trackName}`.trim();
                const targeted = await httpRequestJson(
                    `https://music.163.com/api/search/get?s=${encodeURIComponent(targetQ)}&type=1&limit=3`,
                    { method: 'POST', headers: { Referer: 'https://music.163.com' }, timeout: 3500 }
                );
                const firstSong = targeted?.result?.songs?.[0];
                if (firstSong && firstSong.id) {
                    const sim = computeMetadataSimilarity(firstSong.name, firstSong.artists?.[0]?.name, meta);
                    if (sim >= 22) {
                        const lyrData = await httpRequestJson(
                            `https://music.163.com/api/song/lyric?id=${firstSong.id}&lv=1&kv=1&tv=-1&rv=-1`,
                            { headers: { Referer: 'https://music.163.com' }, timeout: 3500 }
                        );
                        if (lyrData && lyrData.romalrc && lyrData.romalrc.lyric) {
                            const targetedRomaLines = parseLrcText(lyrData.romalrc.lyric);
                            if (targetedRomaLines.length >= 4) {
                                top.lines = mergeJapaneseAndRomajiLines(
                                    top.lines.map(l => ({ time: l.time, text: l.rawText || l.text })),
                                    targetedRomaLines
                                );
                                top.score += 30;
                            }
                        }
                    }
                }
            } catch (_) {}
        }
        if (top && top.source !== 'NetEase' && ne && ne.lines.some(l => l.transText)) {
            const transPool = ne.lines
                .filter(l => l.transText && !/[\u4e00-\u9fa5]/.test(l.transText))
                .map(l => ({ time: l.time, text: l.transText }));
            if (transPool.length > 0) {
                top.lines = attachTranslationLines(top.lines, transPool);
            }
        }
        if (top) maybeEmitFast(top, true);
        return { neRes: ne, lrcRes: lrc, kgRes: kg, bestDb: top };
    });

    const [dbBundle, ytCaptionsRaw] = await Promise.all([
        dbPromise,
        fetchYouTubeCaptionStream(rawTitle, rawArtist, mediaDur, meta).catch(() => null)
    ]);

    let bestDb = dbBundle.bestDb;
    let ytCaptions = ytCaptionsRaw;

    // Deteksi Subtitle Palsu / Non-Lirik (Vlog, Diary, Komentar Sutradara, Credits) dari YouTube CC
    const isBogusCC = Boolean(ytCaptions && isBogusOrCommentaryCaptions(ytCaptions, bestDb, meta));
    if (isBogusCC) {
        ytCaptions = null;
    }

    let finalLines = [];
    let syncMethod = '';
    let trackDuration = mediaDur || (bestDb && bestDb.duration) || (ytCaptions && ytCaptions.videoDur) || 0;

    // KASUS 1: Video YouTube memiliki Subtitle Resmi / Manual CC dari kreator video itu sendiri!
    const isForeignOriginal = Boolean(
        (meta && (meta.likelyJapanese || meta.isJapaneseVersion)) ||
        hasJapaneseChars(rawTitle) ||
        /[\u0400-\u04ff]/.test(rawTitle) ||
        /[\uac00-\ud7af]/.test(rawTitle) ||
        (bestDb && (bestDb.isJapanese || /[\u0400-\u04ff]/.test(bestDb.trackName || '') || (bestDb.lines && bestDb.lines.some(l => /[\u0400-\u04ff]/.test(l.rawText || l.text || '')))))
    );
    const ytHasNativeLines = ytCaptions && ytCaptions.lines && ytCaptions.lines.some(l => hasJapaneseChars(l.rawText || l.text) || /[\u0400-\u04ff]/.test(l.rawText || l.text) || /[\uac00-\ud7af]/.test(l.rawText || l.text));
    const ytHasEnOnly = ytCaptions && ytCaptions.lines && !ytHasNativeLines && ytCaptions.lines.some(l => /[a-zA-Z]{3,}/.test(l.rawText || l.text));
    const ytHasJaOrIdCC = Boolean(ytCaptions && ((Array.isArray(ytCaptions.japaneseLines) && ytCaptions.japaneseLines.length >= 4) || (Array.isArray(ytCaptions.indonesianLines) && ytCaptions.indonesianLines.length >= 4)));
    const isDbIndonesian = Boolean(bestDb && Array.isArray(bestDb.lines) && bestDb.lines.length >= 4 && isIndonesianText(bestDb.lines.slice(0, 15).map(l => l.rawText || l.text).join(' ')));
    const isIdOriginal = Boolean(!isForeignOriginal && ((meta && (meta.isIndonesian || meta.isIndonesianVersion)) || isDbIndonesian || isIndonesianText(rawTitle)));
    const rejectEnglishManualForForeignSong = Boolean(isForeignOriginal && ytHasEnOnly && bestDb && !ytHasJaOrIdCC);
    const rejectForeignManualForIndonesianSong = Boolean(isIdOriginal && ytCaptions && ytCaptions.lines && ytCaptions.lines.some(l => hasJapaneseChars(l.rawText || l.text)));

    if (isIdOriginal && ytCaptions && Array.isArray(ytCaptions.indonesianLines) && ytCaptions.indonesianLines.length >= 4) {
        const idLinesSample = ytCaptions.indonesianLines.slice(0, 10).map(l => l.text || l.rawText).join(' ');
        const mainLinesSample = (ytCaptions.lines || []).slice(0, 10).map(l => l.text || l.rawText).join(' ');
        if (isIndonesianText(idLinesSample) && !isIndonesianText(mainLinesSample)) {
            const foreignLines = ytCaptions.lines;
            ytCaptions.lines = ytCaptions.indonesianLines;
            ytCaptions.indonesianLines = foreignLines;
        }
    }

    const hasManualCC = Boolean(ytCaptions && ytCaptions.isManualCC && ytCaptions.lines.length >= 4 && !rejectEnglishManualForForeignSong && !rejectForeignManualForIndonesianSong);
    if (hasManualCC) {
        // Cek apakah ada Japanese Lines dari manual CC (seperti ALiCE&u yang memiliki track JA terpisah):
        if (!isIdOriginal && Array.isArray(ytCaptions.japaneseLines) && ytCaptions.japaneseLines.length >= 4) {
            ytCaptions.lines.forEach(l => {
                if (!l.jpText && !hasJapaneseChars(l.rawText || l.text)) {
                    if (l.transText && hasJapaneseChars(l.transText)) {
                        l.jpText = l.transText;
                    } else {
                        let bestJp = null;
                        let minDiff = 999;
                        for (const jl of ytCaptions.japaneseLines) {
                            const diff = Math.abs(jl.time - l.time);
                            if (diff < minDiff) {
                                minDiff = diff;
                                bestJp = jl;
                            }
                        }
                        if (bestJp && minDiff <= 2.2) {
                            const candJp = bestJp.transText || bestJp.rawText || bestJp.text || '';
                            if (hasJapaneseChars(candJp)) {
                                l.jpText = candJp;
                            }
                        }
                    }
                }
            });
        }

        function cleanJpChars(str) {
            return String(str || '').replace(/[\s\u3000、。！？!?・~〜「」『』()（）\-—–.,]/g, '').toLowerCase();
        }

        const allDbLines = [
            ...(bestDb?.lines || []),
            ...(dbBundle?.lrcRes?.lines || []),
            ...(dbBundle?.neRes?.lines || []),
            ...(dbBundle?.kgRes?.lines || [])
        ];

        if (ytHasNativeLines) {
            // YouTube CC sudah memuat karakter kanji/kana asli (seperti Kohana Lam atau Creepy Nuts).
            // DILARANG MENIMPA jpText DENGAN SELISIH WAKTU 14 DETIK!
            // Cukup pasangkan Romaji (dbl.romaText) dari database resmi jika teks kanji/kana-nya cocok:
            const romaDbLines = allDbLines.filter(dbl => dbl.romaText && hasJapaneseChars(dbl.rawText || dbl.text || ''));
            if (romaDbLines.length > 0) {
                for (const ytl of ytCaptions.lines) {
                    if (ytl.romaText && !isMoraSpacedRomaji(ytl.romaText)) continue;
                    const yClean = cleanJpChars(ytl.rawText || ytl.text);
                    if (!yClean || yClean.length < 2) continue;

                    let bestRoma = null;
                    for (const dbl of romaDbLines) {
                        const dbClean = cleanJpChars(dbl.rawText || dbl.text);
                        if (!dbClean) continue;
                        if (yClean === dbClean || yClean.includes(dbClean) || dbClean.includes(yClean)) {
                            bestRoma = dbl.romaText;
                            break;
                        }
                    }
                    if (bestRoma) {
                        ytl.romaText = bestRoma;
                    }
                }
            }
        } else {
            // Subtitle YouTube HANYA memuat Romaji (seperti ReoNa Amore).
            // Pasangkan karakter kanji dari database resmi:
            const jpDbLines = allDbLines.filter(dbl => hasJapaneseChars(dbl.rawText || dbl.text || ''));
            if (jpDbLines.length > 0) {
                for (const dbl of jpDbLines) {
                    const dbTxt = dbl.rawText || dbl.text || '';
                    let bestYt = null;
                    let minCost = 999;
                    for (const ytl of ytCaptions.lines) {
                        const timeDiff = Math.abs(dbl.time - ytl.time);
                        if (timeDiff > 14) continue;

                        const yText = String(ytl.rawText || ytl.text || '').trim();
                        if (/^(?:Terima kasih|Apakah|Nah,|Irama|Senandung|Untukku|Maka|Ada perjalanan|Yakni|Ungkapkan|Dan percayalah|Every day|Thank you|A complete|Legacy,|I believe|Let the wind|Has been sung|Sung with)/i.test(yText)) {
                            continue;
                        }

                        let affinityBonus = 0;
                        const yNorm = yText.toLowerCase();
                        if (dbTxt.includes('星屑') && yNorm.includes('hoshikuzu')) affinityBonus = 12;
                        if (dbTxt.includes('喜び') && yNorm.includes('yorokobi')) affinityBonus = 12;
                        if (dbTxt.includes('記憶') && yNorm.includes('kioku')) affinityBonus = 12;
                        if (dbTxt.includes('燃える') && yNorm.includes('moeru')) affinityBonus = 12;
                        if (dbTxt.includes('呼んで') && yNorm.includes('yonde')) affinityBonus = 12;
                        if (dbTxt.includes('聴いて') && yNorm.includes('kiite')) affinityBonus = 12;
                        if (dbTxt.includes('声') && yNorm.includes('koe')) affinityBonus = 12;

                        const cost = timeDiff - affinityBonus;
                        if (cost < minCost) {
                            minCost = cost;
                            bestYt = ytl;
                        }
                    }
                    if (bestYt && (!bestYt.jpText || !hasJapaneseChars(bestYt.jpText))) {
                        bestYt.jpText = dbTxt;
                    }
                }
            }
        }

        // Pasangkan Indonesian Lines dari manual CC (selalu prioritaskan terjemahan resmi ID di atas subtitle lain!)
        if (Array.isArray(ytCaptions.indonesianLines) && ytCaptions.indonesianLines.length >= 4) {
            ytCaptions.lines.forEach(l => {
                let bestId = null;
                let minDiff = 999;
                for (const idl of ytCaptions.indonesianLines) {
                    const diff = Math.abs(idl.time - l.time);
                    if (diff < minDiff) {
                        minDiff = diff;
                        bestId = idl;
                    }
                }
                if (bestId && minDiff <= 2.2) {
                    const candId = bestId.transText || bestId.rawText || bestId.text || '';
                    if (candId && candId.toLowerCase() !== (l.rawText || l.text).toLowerCase()) {
                        l.transText = candId;
                    }
                }
            });
        }

        // Wariskan jpText dan transText untuk bait berulang (sustain/chorus)
        for (let i = 1; i < ytCaptions.lines.length; i++) {
            const cur = ytCaptions.lines[i];
            const prev = ytCaptions.lines[i - 1];
            if (cur && prev) {
                const curNorm = String(cur.rawText || cur.text || '').trim().toLowerCase();
                const prevNorm = String(prev.rawText || prev.text || '').trim().toLowerCase();
                if (curNorm === prevNorm) {
                    if (prev.jpText && !cur.jpText) cur.jpText = prev.jpText;
                    if (prev.romaText && !cur.romaText) cur.romaText = prev.romaText;
                    if (prev.transText && !cur.transText) cur.transText = prev.transText;
                }
            }
        }

        finalLines = ytCaptions.lines.map(l => {
            const rawNormalized = String(l.rawText || l.text || '').normalize('NFKD').trim();
            // Cek apakah baris memuat kombinasi Romaji + Karakter Jepang (seperti gaya subtitle resmi YOASOBI/Ayase)
            const mixedMatch = rawNormalized.match(/^([a-zA-Z0-9\s,.'\"!?~—–-]+?)\s+([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\u3000-\u303f「『].*)$/) ||
                               rawNormalized.match(/^([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\u3000-\u303f「『].+?)\s+([a-zA-Z0-9\s,.'\"!?~—–-]{3,})$/);

            let roma = l.romaText || '';
            let mainDisplay = rawNormalized;
            let rawClean = rawNormalized;

            if (mixedMatch && /[\u3040-\u30ff\u4e00-\u9fff]/.test(mixedMatch[2])) {
                roma = mixedMatch[1].trim();
                mainDisplay = mixedMatch[2].trim();
                rawClean = mixedMatch[2].trim();
            } else if (mixedMatch && /[\u3040-\u30ff\u4e00-\u9fff]/.test(mixedMatch[1])) {
                roma = mixedMatch[2].trim();
                mainDisplay = mixedMatch[1].trim();
                rawClean = mixedMatch[1].trim();
            } else if (!roma && !isIdOriginal) {
                const targetKana = l.jpText || rawNormalized;
                const isPureKana = !hasKanji(targetKana) && hasHiraganaOrKatakana(targetKana);
                roma = isPureKana ? kanaToRomaji(targetKana) : '';
            }

            return {
                time: l.time,
                text: mainDisplay,
                rawText: rawClean,
                jpText: l.jpText || '',
                romaText: roma,
                transText: l.transText || ''
            };
        });

        syncMethod = 'YouTube Official CC (.srv3)';
    }
    // KASUS 2: Kita punya Lirik Standar Akurat dari Database + Gelombang Vokal Auto-ASR YouTube
    // -> Jalankan Audio-to-Text Forced Alignment agar ejaan 100% akurat & timestamp mengikuti vokal video!
    else if (bestDb && ytCaptions && ytCaptions.tokens.length >= 6) {
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
    // KASUS 4: Fallback ke aliran Auto-ASR YouTube (.srv3) jika lagu belum terdaftar di database mana pun
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

    // Kompensasi Otomatis Tempo Lagu Sped-Up / Slowed / Nightcore:
    const isSpedOrSlowed = Boolean(meta && (meta.isSpedUp || meta.isSlowed)) ||
        /\b(sped\s*up|speed\s*up|spedup|night\s*core|fast\s*ver|slowed|slow\s*ver|daycore)\b/i.test(rawTitle);
    const canonDur = (ytCaptions && ytCaptions.videoDur) || (bestDb && Number(bestDb.duration)) || (finalLines.length > 0 ? (finalLines[finalLines.length - 1].endTime || (finalLines[finalLines.length - 1].time + 5)) : 0);

    if (isSpedOrSlowed && canonDur > 30 && mediaDur > 30 && finalLines.length > 0) {
        const speedRatio = mediaDur / canonDur;
        if (speedRatio >= 0.50 && speedRatio <= 1.80 && Math.abs(speedRatio - 1.0) >= 0.02) {
            const timeScale = speedRatio;
            finalLines = finalLines.map(l => ({
                ...l,
                time: Math.round(l.time * timeScale * 100) / 100,
                endTime: l.endTime ? Math.round(l.endTime * timeScale * 100) / 100 : undefined
            }));
            if (Array.isArray(ytCaptions?.indonesianLines)) {
                ytCaptions.indonesianLines = ytCaptions.indonesianLines.map(l => ({
                    ...l,
                    time: Math.round(l.time * timeScale * 100) / 100,
                    endTime: l.endTime ? Math.round(l.endTime * timeScale * 100) / 100 : undefined
                }));
            }
            trackDuration = mediaDur;
            const multiplier = canonDur / mediaDur;
            const label = multiplier > 1.0 ? `Sped-Up ${multiplier.toFixed(2)}x` : `Slowed ${multiplier.toFixed(2)}x`;
            syncMethod = syncMethod ? `${syncMethod} (${label})` : label;
        }
    }

    // 1. Lengkapi Romaji untuk SEMUA lagu Jepang atau bersihkan morfem renggang
    const hasJpCharsInLines = finalLines.some(l => hasJapaneseChars(l.rawText) || hasJapaneseChars(l.text) || hasJapaneseChars(l.jpText));
    const hasMoraSpacedInLines = finalLines.some(l => isMoraSpacedRomaji(l.romaText || l.rawText || l.text));
    if (finalLines.length > 0 && !isIdOriginal && (hasJpCharsInLines || hasMoraSpacedInLines || meta.likelyJapanese || isForeignOriginal)) {
        finalLines = await enrichWithRomaji(finalLines, meta, bestDb, hasManualCC, trackDuration);
    }

    // 2. Lampirkan sub-lirik terjemahan Bahasa Indonesia resmi jika tersedia dari YouTube TimedText!
    const combinedSample = finalLines.slice(0, 20).map(l => l.rawText || l.text || '').join(' ');
    const hasForeignChars = hasJapaneseChars(combinedSample) || /[\u0400-\u04ff]/.test(combinedSample) || /[\uac00-\ud7af]/.test(combinedSample);
    const isNaturallyIndonesian = !hasForeignChars && isIndonesianText(combinedSample);
    const isAlreadyIndonesian = Boolean((meta && meta.isIndonesian) || meta.isIndonesianVersion || isNaturallyIndonesian || isIdOriginal);

    if (!isAlreadyIndonesian && ytCaptions && Array.isArray(ytCaptions.indonesianLines) && ytCaptions.indonesianLines.length >= 3 && finalLines.length > 0) {
        finalLines = attachTranslationLines(finalLines, ytCaptions.indonesianLines);
    }

    // 3. Terjemahkan SEMUA baris lagu asing ke Bahasa Indonesia secara batch cepat jika belum ada terjemahan
    const VOCALISE_REGEX = /^(?:rurira\s*rarira|shalala\s*shalila|lalala|la\s*la|nanana|na\s*na|ooh+|aah+|woah+|yeah+|du\s*du|da\s*da|du\s*ru)\b/i;
    if (!isAlreadyIndonesian && finalLines.length > 0) {
        const missingLines = finalLines.filter(l =>
            (!l.transText ||
            l.transText.trim().toLowerCase() === (l.rawText || l.text || '').trim().toLowerCase() ||
            hasJapaneseChars(l.transText) ||
            /[\u0400-\u04ff]/.test(l.transText) ||
            (!/[\u4e00-\u9fa5]/.test(meta.origTitle) && /[\u4e00-\u9fa5]/.test(l.transText))) &&
            !VOCALISE_REGEX.test(l.rawText || l.text || '')
        );
        if (missingLines.length > 0) {
            const toProcess = missingLines.slice(0, 95);
            const rawTexts = toProcess.map(l => (l.jpText && hasJapaneseChars(l.jpText)) ? l.jpText : (l.rawText || l.text || ''));
            const isJp = rawTexts.some(t => hasJapaneseChars(t));
            const isKr = rawTexts.some(t => /[\uac00-\ud7af]/.test(t));
            const isRu = rawTexts.some(t => /[\u0400-\u04ff]/.test(t));
            const srcLang = isJp ? 'ja' : (isKr ? 'ko' : (isRu ? 'ru' : 'auto'));
            try {
                const transResults = await translateBatchToIndonesian(rawTexts, srcLang);
                transResults.forEach((tr, idx) => {
                    if (tr && toProcess[idx] && tr.toLowerCase() !== rawTexts[idx].toLowerCase()) {
                        toProcess[idx].transText = tr;
                    }
                });
            } catch (_) {}
        }
    }

    // Bersihkan terjemahan aneh pada kata-kata scat / vocable vokal murni
    finalLines.forEach(l => {
        if (VOCALISE_REGEX.test(l.rawText || l.text || '')) {
            if (/jarang|rarely/i.test(l.transText || '') || !l.transText) {
                l.transText = 'Irama nada';
            }
        }
        if (!l.transText || l.transText === 'undefined') l.transText = '';
    });

    const coverUrl = (ytCaptions && ytCaptions.videoId)
        ? `https://i.ytimg.com/vi/${ytCaptions.videoId}/hqdefault.jpg`
        : '';

    let displayTrack = rawTitle;
    if (syncMethod.startsWith('YouTube') || (meta && meta.isCover)) {
        displayTrack = rawTitle;
    } else if (bestDb) {
        displayTrack = [bestDb.artistName, bestDb.trackName].filter(Boolean).join(' - ') || rawTitle;
    }

    const result = {
        title: rawTitle,
        track: displayTrack,
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

