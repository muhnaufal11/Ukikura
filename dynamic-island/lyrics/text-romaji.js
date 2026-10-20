"use strict";
// ==================== DETEKSI BAHASA & TRANSLITERASI JEPANG (KANA -> ROMAJI) ====================

function hasJapaneseChars(str) {
    return /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uff66-\uff9f]/.test(String(str || ''));
}

function hasKanji(str) {
    return /[\u3400-\u4dbf\u4e00-\u9fff]/.test(String(str || ''));
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

const NOISE_BRACKET_RE = /^(?:official.*|mv|music\s*video|lyric.*|lirik.*|audio.*|video.*|visualizer.*|cover.*|歌ってみた.*|うたってみた.*|utattemita.*|karaoke.*|instrumental.*|off\s*vocal.*|romaji.*|kanji.*|sub\s*indo.*|indo\s*sub.*|terjemahan.*|hd|4k|hq|live.*|pv|オリジナル.*|original.*|full.*|tv\s*size.*|short\s*ver.*|english\s*ver.*|eng\s*ver.*|japanese\s*ver.*|jp\s*ver.*|indonesian\s*ver.*|indo\s*ver.*|koplo.*|remix.*|dj.*|sped\s*up.*|speed\s*up.*|slowed.*|bootleg.*|mashup.*)$/i;

function stripParensNoise(str) {
    return String(str || '')
        .replace(/（[^）]*）/g, ' ')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanArtistName(rawArtist) {
    if (!rawArtist || typeof rawArtist !== 'string') return '';
    return stripParensNoise(rawArtist)
        .replace(/-\s*topic$/i, '')
        .replace(/VEVO$/i, '')
        .replace(/\b(?:official\s*youtube\s*channel|youtube\s*channel|official\s*channel)\b/gi, '')
        .replace(/\b(?:ch\.|channel)\s*(?:hololive(?:[-_ ]?[a-z0-9]+)?|nijisanji|vshojo|774inc|kamitsubaki|production\s*kawaii|idol\s*corp|brave\s*group)?(?:\s*[-–—]\s*[a-z0-9]+)?\b/gi, '')
        .replace(/\b(?:ch\.|channel)\b/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseTrackMetadata(rawTitle, rawArtist) {
    const origTitle = String(rawTitle || '').trim();
    const origArtist = String(rawArtist || '').replace(/-\s*topic$/i, '').replace(/VEVO$/i, '').trim();

    const isEnglishVersion = /\b(english\s*ver(?:sion)?|eng\s*ver(?:sion)?|english\s*cover|eng\s*cover|cover\s*in\s*english|en\s*ver)\b/i.test(`${origTitle} ${origArtist}`) ||
        (/\b(cover|covered|utattemita)\b/i.test(`${origTitle} ${origArtist}`) && /\b(english|eng)\b/i.test(origTitle)) ||
        /\b(amalee|leeandlie|jonathan\s*young|pellek|caleb\s*hyles|natewantstobattle|richaadeb|studio\s*yuraki|sapphire|will\s*stetson|trickle|lizz\s*robinett|rachie|annapantsu)\b/i.test(`${origTitle} ${origArtist}`);

    const isIndonesianVersion = /\b(indonesian\s*ver(?:sion)?|indo\s*ver(?:sion)?|indonesian\s*cover|indo\s*cover|cover\s*bahasa\s*indonesia|bahasa\s*indonesia\s*ver|sub\s*indo\s*cover)\b/i.test(`${origTitle} ${origArtist}`) ||
        (/\b(cover|covered)\b/i.test(`${origTitle} ${origArtist}`) && /\b(indonesia|bahasa\s*indonesia)\b/i.test(origTitle));

    const isJapaneseVersion = /\b(japanese\s*ver(?:sion)?|jp\s*ver(?:sion)?|japanese\s*cover|jp\s*cover|cover\s*in\s*japanese)\b/i.test(`${origTitle} ${origArtist}`) ||
        /歌ってみた|うたってみた|utattemita/i.test(`${origTitle} ${origArtist}`);

    const isKoreanVersion = /\b(korean\s*ver(?:sion)?|kr\s*ver(?:sion)?|korean\s*cover|kr\s*cover|한국어\s*ver)\b/i.test(`${origTitle} ${origArtist}`) ||
        (/\b(cover|covered)\b/i.test(`${origTitle} ${origArtist}`) && /[\uac00-\ud7af]/.test(origTitle));

    const isSpanishVersion = /\b(spanish\s*ver(?:sion)?|espa[nñ]ol\s*ver|cover\s*en\s*espa[nñ]ol)\b/i.test(`${origTitle} ${origArtist}`);

    const isCover = isEnglishVersion || isIndonesianVersion || isJapaneseVersion || isKoreanVersion || isSpanishVersion ||
        /\b(cover|covered|utattemita|self\s*cover|acoustic\s*cover|metal\s*cover|rock\s*cover|lofi\s*cover|jazz\s*cover|piano\s*cover|guitar\s*cover|band\s*cover|remix\s*cover|vtuber\s*cover)\b|歌ってみた|うたってみた|翻唱/i.test(`${origTitle} ${origArtist}`);

    const isLofiOrInst = /\b(lofi|lo-fi|instrumental|karaoke|off\s*vocal|piano\s*ver|8-bit|nightcore)\b/i.test(origTitle);

    // 1. Ekstrak isi kurung Jepang 『...』, 「...」, 【...】 yang sering berisi judul lagu asli atau nama artis!
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

    // Cek apakah di luar kurung siku 【...】 sudah ada teks judul utama
    const textOutsideSquareBrackets = origTitle.replace(/[【\[][^】\]]*[】\]]/g, '').trim();

    // 2. Bersihkan tag noise dari judul tanpa menghapus judul lagu utama
    let cleaned = origTitle
        .replace(/[『「]([^』」]+)[』」]/g, (_, p1) => NOISE_BRACKET_RE.test(p1.trim()) ? ' ' : ` ${p1} `)
        .replace(/[【\[]([^】\]]+)[】\]]/g, (_, p1) => {
            if (NOISE_BRACKET_RE.test(p1.trim())) return ' ';
            // Jika sudah ada judul jelas di luar 【...】 (contoh: 【オリジナル楽曲】Judul / Artis【IOSYS】), buang 【...】 agar kredit tidak merusak query
            return textOutsideSquareBrackets.length >= 3 ? ' ' : ` ${p1} `;
        })
        .replace(/（([^）]+)）/g, ' ')
        .replace(/\(([^)]+)\)/g, (_, p1) => NOISE_BRACKET_RE.test(p1.trim()) ? ' ' : ` ${p1} `)
        .replace(/(?:covered\s+by|cover\s+by|vocal\s*[:：]?|vo\s*[.．:：]|cv\s*[.．:：]|feat\.?|ft\.?)\s+[^-|/•·【「『(\[]+/gi, ' ')
        .replace(/\b(?:official\s+music\s+video|official\s+lyric\s+video|official\s+video|official\s+audio|lyric\s+video|lyrics\s+video|lirik\s+lagu|full\s+lirik|lirik\s+dan\s+terjemahan|romaji\s+lyrics|sub\s+indonesia|sub\s+indo|nyanyi\s+bareng|nyangi\s+bareng|sing\s+along|歌ってみた|うたってみた|cover|covered|koplo|remix|koplo\s*remix|dj\s*remix|sped\s*up|speed\s*up|slowed|nightcore|bootleg|mashup)\s*(?:ver(?:sion)?)?\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // 3. Pisahkan berdasarkan pemisah umum: " - ", " / ", " ／ ", " | ", " • "
    const segments = cleaned
        .split(/\s*(?: - | \/ | ／ | \| | • | · )\s*/)
        .map(s => stripParensNoise(s).replace(/^[-/•|:\s]+|[-/•|:\s]+$/g, '').trim())
        .filter(s => s.length > 0 && !NOISE_BRACKET_RE.test(s));

    // Bersihkan nama channel (buang suffix Ch., Channel, agency VTuber seperti hololive/nijisanji)
    const isLyricChannel = /\b(?:lyrics?|lirik|color\s*coded|terjemahan|indo\s*sub|sub\s*indo)\b/i.test(origArtist);
    const cleanChannel = cleanArtistName(origArtist);

    // Cari kandidat nama artis di dalam kurung siku jika channel kosong/tidak cocok
    let bracketArtist = '';
    for (const b of squareBrackets) {
        if (!NOISE_BRACKET_RE.test(b) && b !== cleaned) {
            const ca = cleanArtistName(b);
            if (ca && ca.length >= 2 && ca.length <= 35) {
                bracketArtist = ca;
                break;
            }
        }
    }

    const primaryArtist = cleanChannel || bracketArtist || '';

    const queries = [];

    // Prioritas 1: Jika ada 『Judul』 atau 「Judul」 khas MV/Cover Jepang
    if (jpQuotes.length > 0) {
        const qTitle = jpQuotes[0];
        if (primaryArtist && !isLyricChannel) {
            queries.push(`${primaryArtist} ${qTitle}`);
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
            queries.push(`${ stripParensNoise(squareBrackets[0]) } ${qTitle}`);
        }
        queries.push(qTitle);
    }

    // Prioritas 2: Kombinasi segmen "Artis - Judul" atau "Judul / Artis"
    if (segments.length >= 2) {
        queries.push(`${segments[0]} ${segments[1]}`);
        queries.push(segments[0]);
        if (primaryArtist && !isLyricChannel) {
            const lastSeg = segments[segments.length - 1];
            if (!lastSeg.toLowerCase().includes(primaryArtist.toLowerCase())) {
                queries.push(`${primaryArtist} ${lastSeg}`);
            }
            if (!segments[0].toLowerCase().includes(primaryArtist.toLowerCase())) {
                queries.push(`${primaryArtist} ${segments[0]}`);
            }
        }
        queries.push(`${segments[1]} ${segments[0]}`);
        queries.push(segments[segments.length - 1]);
    } else if (segments.length === 1) {
        if (primaryArtist && !isLyricChannel && !segments[0].toLowerCase().includes(primaryArtist.toLowerCase())) {
            queries.push(`${primaryArtist} ${segments[0]}`);
            if (segments[0].includes('&')) {
                queries.push(`${primaryArtist} ${segments[0].replace(/&/g, ' ')}`);
            }
            queries.push(`${segments[0]} ${primaryArtist}`);
        }
        queries.push(segments[0]);
        if (segments[0].includes('&')) {
            queries.push(segments[0].replace(/&/g, ' '));
        }
    }

    if (cleaned && !queries.includes(cleaned)) {
        queries.push(cleaned);
        if (cleaned.includes('&')) {
            queries.push(cleaned.replace(/&/g, ' '));
        }
    }

    const uniqueQueries = [...new Set(queries.map(q => q.replace(/\s+/g, ' ').trim()).filter(q => q.length >= 2))].slice(0, 7);

    const isIdBranch = /\b(hololive[\s-]*(?:indonesia|id)|nijisanji[\s-]*id)\b/i.test(`${origTitle} ${origArtist}`);
    const hasJpText = hasJapaneseChars(origTitle) || hasJapaneseChars(origArtist) || jpQuotes.length > 0;

    let likelyJapanese =
        hasJpText ||
        /\b(yoasobi|ado|vaundy|kenshi\s*yonezu|radwimps|lisa|aimer|eve|yorushika|zutomayo|hige\s*dism|official\s*higedandism|mrs\.\s*green\s*apple|fujii\s*kaze|majiko|yuuri|tuyu|mafumafu|kikuo|deco\*27|kanaria|pinocchiop|hoshimachi\s*suisei|shigure\s*ui|hololive|nijisanji|utattemita|kokoronashi|shinunoga|unravel|gurenge|idol|sparkle|zenzenzense|nandemonaiya|suzume|kaijuu|odoriko|lemon|kick\s*back|blinding|specialz|ao\s*no\s*sumika|kaikai\s*kitan)\b/i.test(`${origTitle} ${origArtist}`);

    if (isIdBranch && !hasJpText && !/\b(utattemita|anime|jpop|j-pop|vocaloid)\b/i.test(origTitle)) {
        likelyJapanese = false;
    }

    if (isEnglishVersion || isIndonesianVersion || isKoreanVersion || isSpanishVersion) {
        likelyJapanese = false;
    }

    return {
        origTitle,
        origArtist,
        cleanedTitle: cleaned || origTitle,
        cleanChannel,
        isLyricChannel,
        isCover,
        isEnglishVersion,
        isIndonesianVersion,
        isJapaneseVersion,
        isKoreanVersion,
        isSpanishVersion,
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
            // Jangan tampilkan kanaToRomaji sebagai teks utama jika baris memiliki Kanji (karena Kanji tidak terkonversi dan menyatu tanpa spasi)
            const pureKanaRoma = (!hasKanji(l.text) && hasHiraganaOrKatakana(l.text)) ? kanaToRomaji(l.text) : '';
            return {
                time: l.time,
                text: l.text,
                rawText: l.text,
                romaText: pureKanaRoma
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
            romaText: romaStr
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
    // Proteksi Lintas Bahasa untuk SEMUA lagu cover:
    if (meta) {
        if (meta.isEnglishVersion) {
            // Lagu cover bahasa Inggris tidak boleh tertimpa lirik Jepang, Mandarin, atau Korea
            if (hasJapaneseChars(candidateTitle || '') || hasJapaneseChars(candidateArtist || '') || /[\uac00-\ud7af]/.test(`${candidateTitle} ${candidateArtist}`)) {
                return 0;
            }
        } else if (meta.isIndonesianVersion) {
            // Lagu cover bahasa Indonesia tidak boleh tertimpa lirik Jepang atau Mandarin
            if (hasJapaneseChars(candidateTitle || '') || hasJapaneseChars(candidateArtist || '')) {
                return 0;
            }
        } else if (meta.isJapaneseVersion) {
            // Cover lagu Jepang (utattemita) tidak boleh tertimpa lirik adaptasi bahasa Inggris/Spanyol
            if (/\b(english\s*ver|eng\s*ver|spanish\s*ver)\b/i.test(`${candidateTitle} ${candidateArtist}`)) {
                return 0;
            }
        }
    }

    const candFull = normalizePhoneticLatin(`${candidateArtist || ''} ${candidateTitle || ''}`);
    const candTitleNorm = normalizePhoneticLatin(candidateTitle || '');
    const candArtistNorm = normalizePhoneticLatin(candidateArtist || '');
    let titleScore = 0;
    let artistScore = 0;

    // 1. Cek kecocokan Judul Lagu (WAJIB ADA)
    // Cek terhadap kutipan judul Jepang 『...』 / 「...」
    for (const q of meta.jpQuotes) {
        const qNorm = normalizePhoneticLatin(q);
        if (!qNorm) continue;
        if (candTitleNorm === qNorm || String(candidateTitle || '').trim() === q.trim()) {
            titleScore += 95;
        } else if (candTitleNorm.includes(qNorm)) {
            titleScore += 65;
        }
    }

    // Cek kecocokan terhadap segmen judul
    const chNorm = meta.cleanChannel ? normalizePhoneticLatin(meta.cleanChannel) : '';
    const cleanTitleNorm = normalizePhoneticLatin(meta.cleanedTitle || '');

    for (const seg of meta.segments) {
        const segNorm = normalizePhoneticLatin(seg);
        if (!segNorm || segNorm.length < 2) continue;

        // Jika segmen adalah nama channel/artis (misal "hololive ID", "Ayunda Risu", atau "ReoNa"), jangan hitung sebagai judul!
        const isArtistSeg = (chNorm && (
            segNorm === chNorm ||
            chNorm.includes(segNorm) ||
            segNorm.includes(chNorm) ||
            segNorm.split(/\s+/).some(w => w.length >= 3 && chNorm.includes(w))
        )) || (candArtistNorm && (
            segNorm === candArtistNorm ||
            candArtistNorm.includes(segNorm) ||
            segNorm.includes(candArtistNorm)
        ));
        if (isArtistSeg) {
            if (candArtistNorm === segNorm || candArtistNorm.includes(segNorm) || segNorm.includes(candArtistNorm)) {
                artistScore += 60;
            }
            continue;
        }

        if (candTitleNorm === segNorm || String(candidateTitle || '').trim().toLowerCase() === seg.toLowerCase()) {
            titleScore += 80;
        } else if (candTitleNorm.includes(segNorm) || segNorm.includes(candTitleNorm)) {
            titleScore += 55;
        } else {
            const words = segNorm.split(/\s+/).filter(w => w.length >= 2);
            if (words.length > 0) {
                const hits = words.filter(w => candTitleNorm.includes(w)).length;
                if (hits > 0) {
                    titleScore += Math.round((hits / words.length) * 45);
                }
            }
        }
    }

    if (cleanTitleNorm && cleanTitleNorm !== candTitleNorm) {
        if (candTitleNorm.includes(cleanTitleNorm) || cleanTitleNorm.includes(candTitleNorm)) {
            titleScore = Math.max(titleScore, 65);
        }
    }

    // SYARAT MUTLAK: Judul lagu HARUS cocok!
    // Jika skor judul 0, kandidat adalah lagu berbeda dari artis yang sama (misal memutar "Bebas" tapi database mengembalikan "id:entity voices")
    if (titleScore === 0) {
        return 0;
    }

    // 2. Cek kecocokan Artis / Channel
    if (chNorm && !meta.isLyricChannel) {
        if (candArtistNorm === chNorm || chNorm.includes(candArtistNorm) || candArtistNorm.includes(chNorm)) {
            artistScore += 55;
        } else if (candFull.includes(chNorm)) {
            artistScore += 30;
        }
    }

    let score = titleScore + artistScore;

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

    return Math.max(0, score);
}


function attachTranslationLines(baseLines, transLines) {
    if (!Array.isArray(baseLines)) return [];
    if (!Array.isArray(transLines) || transLines.length === 0) {
        return baseLines.map(l => ({
            ...l,
            transText: l.transText || ''
        }));
    }
    return baseLines.map(bl => {
        let bestTrans = null;
        let minDiff = 999;
        const blNorm = (bl.rawText || bl.text || '').toLowerCase().trim();
        for (const tl of transLines) {
            const tlNorm = (tl.rawText || tl.text || '').toLowerCase().trim();
            // Lewati jika teks terjemahan sama persis dengan teks lirik utama (misal baris lirik asli di dalam track subtitle bilingual)
            if (tlNorm === blNorm) continue;
            if (!tl.text || tl.text.trim().length === 0) continue;

            const diff = Math.abs(tl.time - bl.time);
            if (diff < minDiff) {
                minDiff = diff;
                bestTrans = tl;
            }
        }
        const transStr = (bestTrans && minDiff <= 3.5) ? bestTrans.text.trim() : '';
        return {
            ...bl,
            transText: (transStr && transStr.toLowerCase() !== blNorm) ? transStr : (bl.transText || '')
        };
    });
}

const TAGALOG_MARKERS = /\b(mga|nang|hindi|bakit|'di\s+ba|naman|lahat|humingang|pumikit|namamalikmata|nababahala|binaon|tinakpan|andito|intindihin)\b/i;
const INDONESIAN_DISTINCT_WORDS = new Set([
    'yang', 'dan', 'untuk', 'adalah', 'dengan', 'kamu', 'aku', 'kau', 'dia', 'kita', 'mereka',
    'bisa', 'ada', 'tidak', 'tak', 'bukan', 'saat', 'sudah', 'lagi', 'hati', 'cinta',
    'sebelum', 'kuberikan', 'semua', 'hidup', 'masih', 'mata', 'luka', 'rasa', 'ini', 'itu'
]);

function isIndonesianText(sample) {
    if (!sample || typeof sample !== 'string') return false;
    if (TAGALOG_MARKERS.test(sample)) return false;
    const words = sample.toLowerCase().split(/[^a-zA-Z\u00C0-\u024F]+/);
    const matchedDistinct = new Set();
    for (const w of words) {
        if (INDONESIAN_DISTINCT_WORDS.has(w)) {
            matchedDistinct.add(w);
            if (matchedDistinct.size >= 2) return true;
        }
    }
    return false;
}

module.exports = {
    hasJapaneseChars,
    hasKanji,
    hasHiraganaOrKatakana,
    katakanaToHiragana,
    kanaToRomaji,
    normalizePhoneticLatin,
    cleanArtistName,
    parseTrackMetadata,
    parseLrcText,
    mergeJapaneseAndRomajiLines,
    attachTranslationLines,
    isUnwantedForeignTranslation,
    computeMetadataSimilarity,
    isIndonesianText
};
