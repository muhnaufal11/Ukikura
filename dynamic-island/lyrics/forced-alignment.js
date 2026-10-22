"use strict";
const { katakanaToHiragana, normalizePhoneticLatin } = require("./text-romaji");

// ==================== ENGINE 1: AUDIO-TO-TEXT FORCED ALIGNMENT (CTC / PHONETIC DP) ====================

function extractMatchFeatures(textStr) {
    const raw = String(textStr || '').trim();
    const isAdLib = /^\(.*\)$/.test(raw) || /^\[.*\]$/.test(raw);
    const cleanText = raw.replace(/[()[\]]/g, '');
    const normLatin = normalizePhoneticLatin(cleanText);
    const words = normLatin.split(/\s+/).filter(w => w.length >= 2);
    const hira = katakanaToHiragana(raw).replace(/[^\u3040-\u309f\u3400-\u4dbf\u4e00-\u9fff]/g, '');
    const cjkChars = [...hira];
    const cjkBigrams = [];
    for (let i = 0; i < cjkChars.length - 1; i++) {
        cjkBigrams.push(cjkChars[i] + cjkChars[i + 1]);
    }
    return {
        raw,
        isAdLib,
        normLatin,
        words,
        cjkChars,
        cjkBigrams
    };
}

function tokenSimilarity(wordA, wordB) {
    if (!wordA || !wordB) return 0;
    if (wordA === wordB) return 1.0;
    if (wordA.length >= 4 && wordB.length >= 4) {
        if (wordA.startsWith(wordB) || wordB.startsWith(wordA)) return 0.85;
        if (wordA.endsWith(wordB) || wordB.endsWith(wordA)) return 0.85;
        if (wordA.includes(wordB) || wordB.includes(wordA)) return 0.72;
    }
    // Levenshtein DP untuk akurasi kata yang tergabung / salah eja tipis di ASR (misal "kucoba" vs "kuoba")
    const m = wordA.length;
    const n = wordB.length;
    if (Math.abs(m - n) > 3) return 0;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = wordA[i - 1] === wordB[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }
    const dist = dp[m][n];
    const maxLen = Math.max(m, n);
    const sim = 1 - (dist / maxLen);
    return sim >= 0.64 ? sim : 0;
}

/**
 * Mencocokkan baris-baris lirik standar (dari LRCLIB / NetEase / KuGou)
 * dengan token waktu vokal per kata/silabel dari aliran audio/timedtext YouTube (.srv3).
 * Ejaan lirik 100% sesuai database resmi, sedangkan timestamp mengikuti vokal video secara presisi!
 */
function forceAlignLyricsToAudioStream(canonicalLines, ytCaptionData, hasStudioLrc, mediaDur, dbDur = 0) {
    if (!Array.isArray(canonicalLines) || canonicalLines.length === 0) return [];
    if (!ytCaptionData || !Array.isArray(ytCaptionData.tokens) || ytCaptionData.tokens.length < 5) {
        return canonicalLines;
    }

    // Kompensasi ringan jeda decoding vokal ASR YouTube (~0.40s)
    const asrVocalLeadSec = ytCaptionData.isAsrTokens ? 0.40 : 0;
    const tokens = ytCaptionData.tokens.map(t => ({
        time: Math.max(0, Math.round((t.time - asrVocalLeadSec) * 1000) / 1000),
        text: t.text,
        norm: t.norm
    }));
    const N = canonicalLines.length;
    const M = tokens.length;

    // Ekstrak fitur fonetik & karakter untuk setiap baris lirik standar
    const lineFeatures = canonicalLines.map(l => {
        const primaryRaw = l.rawText || l.text || '';
        const romaRaw = l.romaText || '';
        const f1 = extractMatchFeatures(primaryRaw);
        const f2 = romaRaw ? extractMatchFeatures(romaRaw) : null;
        const words = f2 && f2.words.length > f1.words.length ? [...new Set([...f1.words, ...f2.words])] : f1.words;
        const firstWord = f1.words[0] || (f2 && f2.words[0]) || '';
        const joinedFirstTwo = words.length >= 2 ? `${words[0]}${words[1]}` : '';
        const isAdLib = Boolean(f1.isAdLib || /^\(.*\)$/.test(primaryRaw.trim()) || /^\[.*\]$/.test(primaryRaw.trim()));
        return {
            words,
            firstWord,
            joinedFirstTwo,
            isAdLib,
            cjkChars: f1.cjkChars,
            cjkBigrams: f1.cjkBigrams,
            firstCjk: f1.cjkChars.slice(0, 2).join('')
        };
    });

    // Temukan kandidat anchor akustik untuk setiap baris lirik i pada indeks token k
    const anchors = new Array(N).fill(null);

    // PASS 1: Anchor baris vokal utama (lead vocals) terlebih dahulu dengan dynamic running drift
    let minTokenSearchIdx = 0;
    let runningDrift = 0;
    let lastAnchorIdx = -1;

    for (let i = 0; i < N; i++) {
        const lf = lineFeatures[i];
        if (lf.isAdLib) continue; // Tunda ad-libs / backing vocal di Pass 1 agar tidak membajak vokal utama
        const isCjkLine = lf.cjkChars.length >= 2;
        if (!isCjkLine && lf.words.length === 0) continue;

        const winSize = isCjkLine
            ? Math.max(3, Math.min(14, lf.cjkChars.length))
            : Math.max(2, Math.min(10, lf.words.length + 2));

        let bestK = -1;
        let bestScore = 0;

        const expectedTime = hasStudioLrc ? (canonicalLines[i].time + runningDrift) : ((i / Math.max(1, N)) * (mediaDur || 200));
        const prevAnchorTime = lastAnchorIdx >= 0 ? anchors[lastAnchorIdx].time : -1;
        const minGap = Math.max(1.0, Math.min(3.5, (lf.words.length || 3) * 0.35));

        for (let k = minTokenSearchIdx; k < M; k++) {
            const tokTime = tokens[k].time;
            if (prevAnchorTime >= 0 && tokTime < prevAnchorTime + minGap) continue;
            // Toleransi drift dinamis hingga 35s agar cover/remix dengan tempo berbeda tetap terlacak sempurna
            if (hasStudioLrc && Math.abs(tokTime - expectedTime) > 35) continue;

            let matchScore = 0;

            if (isCjkLine) {
                // Pencocokan karakter & bigram Kanji/Kana/Romaji untuk lagu Jepang
                let windowStr = '';
                let windowRoma = '';
                for (let w = k; w < Math.min(M, k + winSize); w++) {
                    windowStr += katakanaToHiragana(tokens[w].text);
                    windowRoma += ' ' + tokens[w].norm;
                }
                let charHits = 0;
                for (const ch of lf.cjkChars) {
                    if (windowStr.includes(ch)) charHits++;
                }
                const charRatio = charHits / lf.cjkChars.length;

                // Cek apakah token pertama di k cocok dengan awal baris Jepang
                const firstTokHira = katakanaToHiragana(tokens[k].text);
                const startsRight = (lf.firstCjk && firstTokHira.startsWith(lf.firstCjk[0])) ||
                    (lf.firstWord && tokenSimilarity(lf.firstWord, tokens[k].norm) >= 0.72);

                matchScore = charRatio * 0.75 + (startsRight ? 0.32 : 0);
            } else {
                // Pencocokan kata & fonetik untuk lagu Indonesia / Inggris / Romaji
                const directFirstSim = tokenSimilarity(lf.firstWord, tokens[k].norm);
                const mergedFirstSim = lf.joinedFirstTwo ? tokenSimilarity(lf.joinedFirstTwo, tokens[k].norm) : 0;
                let leadSim = Math.max(directFirstSim, mergedFirstSim);

                if (leadSim < 0.6 && lf.words.length >= 2) {
                    // Izinkan kata ke-2 jika kata ke-1 (misal awalan "ku-", "ter-", "di-") dilewati penyanyi
                    const secondSim = tokenSimilarity(lf.words[1], tokens[k].norm);
                    if (secondSim < 0.72) continue;
                    leadSim = secondSim * 0.88;
                }

                let wordHits = 0;
                const checkLen = Math.min(M, k + winSize);
                for (let wi = 0; wi < lf.words.length; wi++) {
                    const lw = lf.words[wi];
                    let bestW = 0;
                    if (wi <= 1 && mergedFirstSim >= 0.72) {
                        bestW = mergedFirstSim;
                    }
                    for (let w = k; w < checkLen; w++) {
                        const s = tokenSimilarity(lw, tokens[w].norm);
                        if (s > bestW) bestW = s;
                    }
                    wordHits += bestW;
                }
                const wordRatio = wordHits / lf.words.length;
                matchScore = wordRatio * 0.72 + (leadSim * 0.35);
            }

            // Kedekatan waktu relatif terhadap expectedTime yang sudah terkompensasi runningDrift
            if (hasStudioLrc) {
                const timeDiff = Math.abs(tokTime - expectedTime);
                const proximityBonus = Math.max(0, 0.20 - (timeDiff / 80));
                matchScore += proximityBonus;
            }

            if (matchScore > bestScore) {
                bestScore = matchScore;
                bestK = k;
            }
        }

        const threshold = isCjkLine ? 0.58 : 0.62;
        if (bestK >= 0 && bestScore >= threshold) {
            anchors[i] = {
                tokenIdx: bestK,
                time: tokens[bestK].time,
                score: bestScore
            };
            lastAnchorIdx = i;
            if (hasStudioLrc) {
                runningDrift = tokens[bestK].time - canonicalLines[i].time;
            }
            minTokenSearchIdx = bestK + 1;
        }
    }

    // PASS 2: Anchor baris ad-lib / backing vocal strictly di antara anchor lead tetangganya
    for (let i = 0; i < N; i++) {
        const lf = lineFeatures[i];
        if (!lf.isAdLib || anchors[i]) continue;
        const isCjkLine = lf.cjkChars.length >= 2;
        if (!isCjkLine && lf.words.length === 0) continue;

        const pIdx = findPrevAnchorIdx(anchors, i - 1);
        const nIdx = findNextAnchorIdx(anchors, i + 1);
        const pTime = pIdx >= 0 ? anchors[pIdx].time + 1.0 : 0;
        const nTime = nIdx >= 0 ? anchors[nIdx].time - 1.0 : (mediaDur || 9999);
        if (nTime <= pTime) continue;

        const startK = pIdx >= 0 ? anchors[pIdx].tokenIdx + 1 : 0;
        const endK = nIdx >= 0 ? anchors[nIdx].tokenIdx : M;

        let bestK = -1;
        let bestScore = 0;
        const winSize = Math.max(2, Math.min(8, lf.words.length + 1));

        for (let k = startK; k < endK; k++) {
            const tokTime = tokens[k].time;
            if (tokTime < pTime || tokTime > nTime) continue;

            let wordHits = 0;
            const checkLen = Math.min(endK, k + winSize);
            const firstSim = tokenSimilarity(lf.words[0], tokens[k].norm);
            let leadSim = firstSim;
            if (firstSim < 0.6 && lf.words.length >= 2) {
                const secondSim = tokenSimilarity(lf.words[1], tokens[k].norm);
                if (secondSim >= 0.72) leadSim = secondSim * 0.88;
            }

            for (let wi = 0; wi < lf.words.length; wi++) {
                const lw = lf.words[wi];
                let bestW = 0;
                for (let w = k; w < checkLen; w++) {
                    const s = tokenSimilarity(lw, tokens[w].norm);
                    if (s > bestW) bestW = s;
                }
                wordHits += bestW;
            }
            const wordRatio = wordHits / lf.words.length;
            const matchScore = wordRatio * 0.72 + (leadSim * 0.35);

            if (matchScore > bestScore) {
                bestScore = matchScore;
                bestK = k;
            }
        }

        if (bestK >= 0 && bestScore >= 0.72) {
            anchors[i] = {
                tokenIdx: bestK,
                time: tokens[bestK].time,
                score: bestScore
            };
        }
    }

    const validAnchors = anchors
        .map((a, idx) => (a ? { lineIdx: idx, time: a.time, score: a.score } : null))
        .filter(Boolean);

    if (validAnchors.length === 0) {
        return canonicalLines;
    }

    // Jika LRC database sudah memiliki timestamp studio yang presisi (hasStudioLrc):
    // Gunakan RANSAC Global Offset agar ritme/interval antar-baris dari detik 0:00 sampai akhir lagu 100% bebas drift!
    if (hasStudioLrc) {
        const diffs = validAnchors
            .map(a => a.time - canonicalLines[a.lineIdx].time)
            .sort((a, b) => a - b);
        const medianOffset = diffs[Math.floor(diffs.length / 2)] || 0;
        const driftRange = diffs.length >= 2 ? (diffs[diffs.length - 1] - diffs[0]) : 0;

        // Jika terdapat variasi tempo antar anchor (driftRange >= 2.0s dan validAnchors >= 3),
        // ini adalah aransemen cover/remix dengan tempo vokal berbeda -> gunakan interpolasi piecewise antar anchor
        if (driftRange >= 2.0 && validAnchors.length >= 3) {
            return canonicalLines.map((l, i) => {
                if (anchors[i]) {
                    return Object.assign({}, l, {
                        time: Math.round(anchors[i].time * 100) / 100,
                        anchored: true
                    });
                }
                const pIdx = findPrevAnchorIdx(anchors, i - 1);
                const nIdx = findNextAnchorIdx(anchors, i + 1);
                if (pIdx >= 0 && nIdx >= 0) {
                    const pTime = anchors[pIdx].time;
                    const nTime = anchors[nIdx].time;
                    const pStudio = canonicalLines[pIdx].time;
                    const nStudio = canonicalLines[nIdx].time;
                    const ratio = (nStudio > pStudio) ? (canonicalLines[i].time - pStudio) / (nStudio - pStudio) : 0.5;
                    const interpTime = pTime + ratio * (nTime - pTime);
                    return Object.assign({}, l, {
                        time: Math.round(interpTime * 100) / 100,
                        anchored: false
                    });
                } else if (pIdx >= 0) {
                    const shift = anchors[pIdx].time - canonicalLines[pIdx].time;
                    return Object.assign({}, l, {
                        time: Math.round((canonicalLines[i].time + shift) * 100) / 100,
                        anchored: false
                    });
                } else if (nIdx >= 0) {
                    const shift = anchors[nIdx].time - canonicalLines[nIdx].time;
                    return Object.assign({}, l, {
                        time: Math.max(0, Math.round((canonicalLines[i].time + shift) * 100) / 100),
                        anchored: false
                    });
                }
                return Object.assign({}, l, { anchored: false });
            });
        }

        // Jika durasi video sama dengan durasi studio (selisih <= 3.5s),
        // berarti ini aransemen/audio studio yang sama persis -> pertahankan 100% waktu LRC studio asli tanpa distorsi ASR!
        const isSameStudioArrangement = (mediaDur > 30 && dbDur > 30 && Math.abs(dbDur - mediaDur) <= 3.5);
        const globalOffset = (isSameStudioArrangement || Math.abs(medianOffset) < 0.85) ? 0 : medianOffset;

        return canonicalLines.map((l, i) => Object.assign({}, l, {
            time: Math.max(0, Math.round((l.time + globalOffset) * 1000) / 1000),
            anchored: Boolean(anchors[i])
        }));
    }

    // Jika lirik dari database belum memiliki timestamp (plainLyrics), gunakan anchor langsung + interpolasi linier
    const aligned = canonicalLines.map(l => Object.assign({}, l));

    for (let i = 0; i < N; i++) {
        if (anchors[i]) {
            aligned[i].time = Math.round(anchors[i].time * 1000) / 1000;
            aligned[i].anchored = true;
            continue;
        }

        const prevIdx = findPrevAnchorIdx(anchors, i - 1);
        const nextIdx = findNextAnchorIdx(anchors, i + 1);

        if (prevIdx !== -1 && nextIdx !== -1) {
            const tA = anchors[prevIdx].time;
            const tB = anchors[nextIdx].time;
            const frac = (i - prevIdx) / (nextIdx - prevIdx);
            aligned[i].time = Math.round((tA + frac * (tB - tA)) * 1000) / 1000;
        }
    }

    // Pastikan urutan waktu 100% naik secara monotonik
    for (let i = 1; i < aligned.length; i++) {
        if (aligned[i].time <= aligned[i - 1].time) {
            aligned[i].time = Math.round((aligned[i - 1].time + 0.35) * 1000) / 1000;
        }
    }

    return aligned;
}

function findLastAnchorTime(anchors, fromIdx) {
    for (let i = fromIdx; i >= 0; i--) {
        if (anchors[i]) return anchors[i].time;
    }
    return -1;
}

function findPrevAnchorIdx(anchors, fromIdx) {
    for (let i = fromIdx; i >= 0; i--) {
        if (anchors[i]) return i;
    }
    return -1;
}

function findNextAnchorIdx(anchors, fromIdx) {
    for (let i = fromIdx; i < anchors.length; i++) {
        if (anchors[i]) return i;
    }
    return -1;
}


module.exports = { extractMatchFeatures, tokenSimilarity, forceAlignLyricsToAudioStream };
