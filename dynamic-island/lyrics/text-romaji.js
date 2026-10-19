"use strict";
// ==================== DETEKSI BAHASA & TRANSLITERASI JEPANG (KANA -> ROMAJI) ====================

function hasJapaneseChars(str) {
    return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9f]/.test(String(str || ''));
}

function hasHiraganaOrKatakana(str) {
    return /[\u3040-\u30ff\uff66-\uff9f]/.test(String(str || ''));
}

function katakanaToHiragana(str) {
    return String(str || '').replace(/[\u30a1-\u30f6]/g, (ch) =>
        String.fromCharCode(ch.charCodeAt(0) - 0x60)
    );
}

const KANA_ROMAJI_DIGRAPHS = {
    'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
    'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
    'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
    'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
    'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
    'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
    'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
    'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
    'じゃ': 'ja',  'じゅ': 'ju',  'じょ': 'jo',
    'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
    'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
    'ふぁ': 'fa',  'ふぃ': 'fi',  'ふぇ': 'fe', 'ふぉ': 'fo',
    'てぃ': 'ti',  'でぃ': 'di',  'しぇ': 'she', 'ちぇ': 'che', 'じぇ': 'je',
    'うぃ': 'wi',  'うぇ': 'we',  'うぉ': 'wo', 'ゔぁ': 'va', 'ゔぃ': 'vi', 'ゔぇ': 've', 'ゔぉ': 'vo'
};

const KANA_ROMAJI_MONO = {
    'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
    'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
    'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
    'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
    'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
    'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
    'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
    'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
    'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
    'わ': 'wa', 'ゐ': 'i', 'ゑ': 'e', 'を': 'o', 'ん': 'n',
    'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
    'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
    'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
    'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
    'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
    'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o',
    'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo', 'ゎ': 'wa', 'ゔ': 'vu',
    'ー': ''
};

function kanaToRomaji(input) {
    const hira = katakanaToHiragana(input);
    let out = '';
    let i = 0;
    while (i < hira.length) {
        if (hira[i] === 'っ') {
            const next2 = hira.slice(i + 1, i + 3);
            const next1 = hira[i + 1] || '';
            const r = KANA_ROMAJI_DIGRAPHS[next2] || KANA_ROMAJI_MONO[next1] || '';
            if (r && /^[a-z]/.test(r)) {
                out += r[0];
            }
            i++;
            continue;
        }
        const two = hira.slice(i, i + 2);
        if (KANA_ROMAJI_DIGRAPHS[two] !== undefined) {
            out += KANA_ROMAJI_DIGRAPHS[two];
            i += 2;
            continue;
        }
        const one = hira[i];
        if (KANA_ROMAJI_MONO[one] !== undefined) {
            out += KANA_ROMAJI_MONO[one];
            i++;
            continue;
        }
        out += one;
        i++;
    }
    return out;
}

// Normalisasi fonetik untuk pencocokan kata lintas ejaan (Romaji / Indonesia / Inggris)
function normalizePhoneticLatin(str) {
    return kanaToRomaji(String(str || ''))
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/shi/g, 'si')
        .replace(/chi/g, 'ti')
        .replace(/tsu/g, 'tu')
        .replace(/fu/g, 'hu')
        .replace(/sy/g, 's')
        .replace(/kh/g, 'k')
        .replace(/dj/g, 'j')
        .replace(/tj/g, 'c')
        .replace(/oe/g, 'u')
        .replace(/ou/g, 'o')
        .replace(/uu/g, 'u')
        .replace(/aa/g, 'a')
        .replace(/ii/g, 'i')
        .replace(/ee/g, 'e')
        .replace(/oo/g, 'o')
        .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ==================== PARSER METADATA LAGU & COVER YOUTUBE ====================

const NOISE_BRACKET_RE = /^(?:official.*|mv|music\s*video|lyric.*|lirik.*|audio.*|video.*|visualizer.*|cover.*|歌ってみた.*|うたってみた.*|utattemita.*|karaoke.*|instrumental.*|off\s*vocal.*|romaji.*|kanji.*|sub\s*indo.*|indo\s*sub.*|terjemahan.*|hd|4k|hq|live.*|pv|オリジナル.*|original.*|full.*|tv\s*size.*|short\s*ver.*)$/i;

function parseTrackMetadata(rawTitle, rawArtist) {
    const origTitle = String(rawTitle || '').trim();
    const origArtist = String(rawArtist || '').replace(/-\s*topic$/i, '').replace(/VEVO$/i, '').trim();

    const isCover = /\b(cover|covered|utattemita)\b|歌ってみた|うたってみた/i.test(`${origTitle} ${origArtist}`);
    const isLofiOrInst = /\b(lofi|lo-fi|instrumental|karaoke|off\s*vocal|piano\s*ver|8-bit|nightcore)\b/i.test(origTitle);

    // 1. Ekstrak isi kurung Jepang 『...』, 「...」, 【...】 yang sering berisi judul lagu asli!
    const jpQuotes = [];
    for (const m of origTitle.matchAll(/[『「]([^』」]+)[』」]/g)) {
        const inner = m[1].trim();
        if (inner && !NOISE_BRACKET_RE.test(inner)) {
            jpQuotes.push(inner);
        }
    }

    const squareBrackets = [];
    for (const m of origTitle.matchAll(/[【\[]([^】\]]+)[】\]]/g)) {
        const inner = m[1].trim();
        if (inner && !NOISE_BRACKET_RE.test(inner)) {
            squareBrackets.push(inner);
        }
    }

    // 2. Bersihkan tag noise dari judul tanpa menghapus judul lagu utama
    let cleaned = origTitle
        .replace(/[『「]([^』」]+)[』」]/g, (_, p1) => NOISE_BRACKET_RE.test(p1.trim()) ? ' ' : ` ${p1} `)
        .replace(/[【\[]([^】\]]+)[】\]]/g, (_, p1) => NOISE_BRACKET_RE.test(p1.trim()) ? ' ' : ` ${p1} `)
        .replace(/\(([^)]+)\)/g, (_, p1) => NOISE_BRACKET_RE.test(p1.trim()) ? ' ' : ` ${p1} `)
        .replace(/(?:covered\s+by|cover\s+by|vocal\s*[:：]?|vo\s*[.．:：]|cv\s*[.．:：]|feat\.?|ft\.?)\s+[^-|/•·【「『(\[]+/gi, ' ')
        .replace(/\b(?:official\s+music\s+video|official\s+lyric\s+video|official\s+video|official\s+audio|lyric\s+video|lyrics\s+video|lirik\s+lagu|full\s+lirik|lirik\s+dan\s+terjemahan|romaji\s+lyrics|sub\s+indonesia|sub\s+indo|nyanyi\s+bareng|nyangi\s+bareng|sing\s+along|歌ってみた|うたってみた)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // 3. Pisahkan berdasarkan pemisah umum: " - ", " / ", " ／ ", " | ", " • "
    const segments = cleaned
        .split(/\s*(?: - | \/ | ／ | \| | • | · )\s*/)
        .map(s => s.replace(/^[-/•|:\s]+|[-/•|:\s]+$/g, '').trim())
        .filter(s => s.length > 0 && !NOISE_BRACKET_RE.test(s));

    // Bersihkan nama channel jika nama channel adalah channel lirik (misal "FARFAD LYRICS", "Lirik Musik", dll.)
    const isLyricChannel = /\b(lyrics?|lirik|musik|music|ch\.|channel|official|ost|anime|vibes|records|entertainment)\b/i.test(origArtist);
    const cleanChannel = origArtist
        .replace(/\b(official\s*channel|official|youtube\s*channel|ch\.|channel|lyrics?|lirik)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();

    const queries = [];

    // Prioritas 1: Jika ada 『Judul』 atau 「Judul」 khas MV/Cover Jepang
    if (jpQuotes.length > 0) {
        const qTitle = jpQuotes[0];
        if (cleanChannel && !isLyricChannel) {
            queries.push(`${cleanChannel} ${qTitle}`);
        }
        for (const seg of segments) {
            const segWithoutQuote = seg.replace(qTitle, '').replace(/\s+/g, ' ').trim();
            if (segWithoutQuote && segWithoutQuote.length >= 2 && segWithoutQuote.length <= 40) {
                queries.push(`${segWithoutQuote} ${qTitle}`);
            } else if (seg !== qTitle && seg.length >= 2 && seg.length <= 40) {
                queries.push(seg);
            }
        }
        if (squareBrackets.length > 0 && squareBrackets[0] !== qTitle) {
            queries.push(`${squareBrackets[0]} ${qTitle}`);
        }
        queries.push(qTitle);
    }

    // Prioritas 2: Kombinasi segmen "Artis - Judul" atau "Judul / Artis"
    if (segments.length >= 2) {
        queries.push(`${segments[0]} ${segments[1]}`);
        if (cleanChannel && !isLyricChannel) {
            const lastSeg = segments[segments.length - 1];
            if (!lastSeg.toLowerCase().includes(cleanChannel.toLowerCase())) {
                queries.push(`${cleanChannel} ${lastSeg}`);
            }
        }
        queries.push(`${segments[1]} ${segments[0]}`);
        queries.push(segments[segments.length - 1]);
        queries.push(segments[0]);
    } else if (segments.length === 1) {
        if (cleanChannel && !isLyricChannel && !segments[0].toLowerCase().includes(cleanChannel.toLowerCase())) {
            queries.push(`${cleanChannel} ${segments[0]}`);
            queries.push(`${segments[0]} ${cleanChannel}`);
        }
        queries.push(segments[0]);
    }

    if (cleaned && !queries.includes(cleaned)) {
        queries.push(cleaned);
    }

    const uniqueQueries = [...new Set(queries.map(q => q.replace(/\s+/g, ' ').trim()).filter(q => q.length >= 2))].slice(0, 7);

    const likelyJapanese =
        hasJapaneseChars(origTitle) ||
        hasJapaneseChars(origArtist) ||
        /\b(yoasobi|ado|vaundy|kenshi\s*yonezu|radwimps|lisa|aimer|eve|yorushika|zutomayo|hige\s*dism|official\s*higedandism|mrs\.\s*green\s*apple|fujii\s*kaze|majiko|yuuri|tuyu|mafumafu|kikuo|deco\*27|kanaria|pinocchiop|hoshimachi\s*suisei|hololive|nijisanji|utattemita|kokoronashi|shinunoga|unravel|gurenge|idol|sparkle|zenzenzense|nandemonaiya|suzume|kaijuu|odoriko|lemon|kick\s*back|blinding|specialz|ao\s*no\s*sumika|kaikai\s*kitan)\b/i.test(`${origTitle} ${origArtist}`);

    return {
        origTitle,
        origArtist,
        cleanedTitle: cleaned || origTitle,
        cleanChannel,
        isLyricChannel,
        isCover,
        isLofiOrInst,
        likelyJapanese,
        jpQuotes,
        segments,
        queries: uniqueQueries
    };
}

// ==================== PARSER LRC & PENGGABUNG ROMAJI + KANJI ====================

function parseLrcText(rawLrc) {
    const lines = [];
    if (!rawLrc || typeof rawLrc !== 'string') return lines;

    for (const rawLine of rawLrc.split(/\r?\n/)) {
        const timeTags = [...rawLine.matchAll(/\[(\d{1,3}):(\d{1,2}(?:\.\d{1,3})?)\]/g)];
        if (timeTags.length === 0) continue;
        const text = rawLine.replace(/\[\d{1,3}:\d{1,2}(?:\.\d{1,3})?\]/g, '').trim();
        if (!text) continue;
        // Abaikan baris kredit komposer/penulis lirik di awal lagu
        if (/^(?:作词|作詞|作曲|编曲|編曲|制作人|プロデューサー|歌|呗|lyricist|composer|arranger|producer|by|offset)\s*[:：]/i.test(text)) {
            continue;
        }
        for (const m of timeTags) {
            const sec = parseInt(m[1], 10) * 60 + parseFloat(m[2]);
            if (!isNaN(sec) && sec >= 0) {
                lines.push({ time: Math.round(sec * 1000) / 1000, text });
            }
        }
    }
    lines.sort((a, b) => a.time - b.time);
    return lines;
}

function mergeJapaneseAndRomajiLines(jpLines, romaLines) {
    if (!Array.isArray(jpLines) || jpLines.length === 0) return romaLines || [];
    if (!Array.isArray(romaLines) || romaLines.length === 0) {
        return jpLines.map(l => {
            const autoRoma = hasHiraganaOrKatakana(l.text) ? kanaToRomaji(l.text) : '';
            return {
                time: l.time,
                text: l.text,
                rawText: l.text,
                romaText: autoRoma
            };
        });
    }

    // Pasangkan baris Romaji dan Kanji/Kana berdasarkan timestamp terdekat
    return jpLines.map(jl => {
        let bestRoma = null;
        let minDiff = 999;
        for (const rl of romaLines) {
            const diff = Math.abs(rl.time - jl.time);
            if (diff < minDiff) {
                minDiff = diff;
                bestRoma = rl;
            }
        }
        const romaStr = (bestRoma && minDiff <= 2.2) ? bestRoma.text.trim() : '';
        const display = (romaStr && romaStr.toLowerCase() !== jl.text.toLowerCase())
            ? `${romaStr} · ${jl.text}`
            : jl.text;
        return {
            time: jl.time,
            text: display,
            rawText: jl.text,
            romaText: romaStr || kanaToRomaji(jl.text)
        };
    });
}

// ==================== FILTER ANTI-BAHASA ASING SALAH (PORTUGIS/SPANYOL/RUSIA) ====================

const FOREIGN_DUB_META_RE = /\b(miura\s*jam|portugu[eê]s|vers[aã]o|tradu[cç][aã]o|espa[nñ]ol|castellano|cover\s*en\s*espa[nñ]ol|russian\s*cover|на\s*русском|tagalog|thai\s*ver|vietnamese)\b/i;
const FOREIGN_DUB_LYRIC_RE = /\b(voc[eê]|cora[cç][aã]o|n[aã]o|ent[aã]o|mesmo|dif[ií]ceis|ningu[eé]m|tamb[eé]m|canción|corazón|siempre|nunca|porque|estoy|puedo|quiero)\b/i;
const CYRILLIC_RE = /[\u0400-\u04FF]{3,}/;

function isUnwantedForeignTranslation(metaStr, lyrSample, origTitle) {
    if (FOREIGN_DUB_META_RE.test( origTitle)) return false;
    if (FOREIGN_DUB_META_RE.test(metaStr)) return true;
    if (FOREIGN_DUB_LYRIC_RE.test(lyrSample)) return true;
    if (CYRILLIC_RE.test(lyrSample) && !CYRILLIC_RE.test(origTitle)) return true;
    return false;
}

function computeMetadataSimilarity(candidateTitle, candidateArtist, meta) {
    const candFull = normalizePhoneticLatin(`${candidateArtist || ''} ${candidateTitle || ''}`);
    const candTitleNorm = normalizePhoneticLatin(candidateTitle || '');
    const candArtistNorm = normalizePhoneticLatin(candidateArtist || '');
    let score = 0;

    // Penalti untuk versi remix / DJ / 合唱 (chorus) / live / tv size kecuali diminta di judul asli
    const candMetaRaw = `${candidateTitle || ''} ${candidateArtist || ''}`;
    if (!/\b(remix|dj|live|tv\s*size|short\s*ver|acoustic|合唱)\b/i.test(meta.origTitle)) {
        if (/\b(remix|dj|bootleg|sped\s*up|slowed|nightcore|tv\s*size|short\s*ver)\b|合唱|翻唱|伴奏/i.test(candMetaRaw)) {
            score -= 65;
        }
        if (/\blive\b/i.test(candMetaRaw)) {
            score -= 25;
        }
    }

    // Cek kecocokan terhadap kutipan judul Jepang 『...』 / 「...」
    for (const q of meta.jpQuotes) {
        const qNorm = normalizePhoneticLatin(q);
        if (!qNorm) continue;
        if (candTitleNorm === qNorm || String(candidateTitle || '').trim() === q.trim()) {
            score += 95;
        } else if (candTitleNorm.includes(qNorm) || candFull.includes(qNorm)) {
            score += 65;
        }
    }

    // Cek kecocokan segmen judul/artis
    for (const seg of meta.segments) {
        const segNorm = normalizePhoneticLatin(seg);
        if (!segNorm || segNorm.length < 2) continue;
        if (candTitleNorm === segNorm || String(candidateTitle || '').trim().toLowerCase() === seg.toLowerCase()) {
            score += 75;
        } else if (candArtistNorm === segNorm || String(candidateArtist || '').trim().toLowerCase() === seg.toLowerCase()) {
            score += 65;
        } else if (candFull.includes(segNorm)) {
            score += 35;
        } else {
            const words = segNorm.split(/\s+/).filter(w => w.length >= 2);
            if (words.length > 0) {
                const hits = words.filter(w => candFull.includes(w)).length;
                score += Math.round((hits / words.length) * 30);
            }
        }
    }

    if (meta.cleanChannel && !meta.isLyricChannel) {
        const chNorm = normalizePhoneticLatin(meta.cleanChannel);
        if (chNorm && (candArtistNorm.includes(chNorm) || candFull.includes(chNorm))) {
            score += 40;
        }
    }

    return score;
}


module.exports = {
    hasJapaneseChars,
    hasHiraganaOrKatakana,
    katakanaToHiragana,
    kanaToRomaji,
    normalizePhoneticLatin,
    parseTrackMetadata,
    parseLrcText,
    mergeJapaneseAndRomajiLines,
    isUnwantedForeignTranslation,
    computeMetadataSimilarity
};
