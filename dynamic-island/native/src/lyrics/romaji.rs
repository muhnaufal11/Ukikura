//! Transliterasi Aksara Jepang (Kana/Kanji -> Romaji) & Normalisasi Judul Lagu.

pub fn katakana_to_hiragana(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for c in input.chars() {
        let code = c as u32;
        // Katakana 0x30A1 - 0x30F6 dipetakan ke Hiragana 0x3041 - 0x3096 (- 0x60)
        if (0x30A1..=0x30F6).contains(&code) {
            if let Some(h) = char::from_u32(code - 0x60) {
                out.push(h);
                continue;
            }
        }
        out.push(c);
    }
    out
}

pub fn is_japanese(text: &str) -> bool {
    text.chars().any(|c| {
        let code = c as u32;
        (0x3040..=0x309F).contains(&code)   // Hiragana
            || (0x30A0..=0x30FF).contains(&code) // Katakana
            || (0x4E00..=0x9FAF).contains(&code) // CJK Kanji
    })
}

pub fn kana_to_romaji(input: &str) -> String {
    let hira = katakana_to_hiragana(input);
    let chars: Vec<char> = hira.chars().collect();
    let mut out = String::with_capacity(chars.len() * 2);
    let mut i = 0;

    while i < chars.len() {
        // Sokuon (っ) -> dobelkan konsonan berikutnya
        if chars[i] == 'っ' {
            if i + 1 < chars.len() {
                let next_char = chars[i + 1];
                let next_str: String = chars[i + 1..].iter().take(2).collect();
                let romaji = match_kana_digraph(&next_str).or_else(|| match_kana_mono(next_char));
                if let Some(r) = romaji {
                    if let Some(first_letter) = r.chars().next() {
                        if first_letter.is_ascii_alphabetic() {
                            out.push(first_letter);
                        }
                    }
                }
            }
            i += 1;
            continue;
        }

        // Cek digraf 2 karakter (mis. きゃ -> kya, しょ -> sho)
        if i + 1 < chars.len() {
            let two: String = chars[i..=i + 1].iter().collect();
            if let Some(r) = match_kana_digraph(&two) {
                out.push_str(r);
                i += 2;
                continue;
            }
        }

        // Cek monokana 1 karakter
        if let Some(r) = match_kana_mono(chars[i]) {
            out.push_str(r);
        } else {
            out.push(chars[i]);
        }
        i += 1;
    }

    out
}

fn match_kana_digraph(two: &str) -> Option<&'static str> {
    match two {
        "きゃ" => Some("kya"), "きゅ" => Some("kyu"), "きょ" => Some("kyo"),
        "しゃ" => Some("sha"), "しゅ" => Some("shu"), "しょ" => Some("sho"),
        "ちゃ" => Some("cha"), "ちゅ" => Some("chu"), "ちょ" => Some("cho"),
        "にゃ" => Some("nya"), "にゅ" => Some("nyu"), "にょ" => Some("nyo"),
        "ひゃ" => Some("hya"), "ひゅ" => Some("hyu"), "ひょ" => Some("hyo"),
        "みゃ" => Some("mya"), "みゅ" => Some("myu"), "みょ" => Some("myo"),
        "りゃ" => Some("rya"), "りゅ" => Some("ryu"), "りょ" => Some("ryo"),
        "ぎゃ" => Some("gya"), "ぎゅ" => Some("gyu"), "ぎょ" => Some("gyo"),
        "じゃ" => Some("ja"),  "じゅ" => Some("ju"),  "じょ" => Some("jo"),
        "びゃ" => Some("bya"), "びゅ" => Some("byu"), "びょ" => Some("byo"),
        "ぴゃ" => Some("pya"), "ぴゅ" => Some("pyu"), "ぴょ" => Some("pyo"),
        "ふぁ" => Some("fa"),  "ふぃ" => Some("fi"),  "ふぇ" => Some("fe"), "ふぉ" => Some("fo"),
        "てぃ" => Some("ti"),  "でぃ" => Some("di"),
        _ => None,
    }
}

fn match_kana_mono(c: char) -> Option<&'static str> {
    match c {
        'あ' => Some("a"), 'い' => Some("i"), 'う' => Some("u"), 'え' => Some("e"), 'お' => Some("o"),
        'か' => Some("ka"), 'き' => Some("ki"), 'く' => Some("ku"), 'け' => Some("ke"), 'こ' => Some("ko"),
        'さ' => Some("sa"), 'し' => Some("shi"), 'す' => Some("su"), 'せ' => Some("se"), 'そ' => Some("so"),
        'た' => Some("ta"), 'ち' => Some("chi"), 'つ' => Some("tsu"), 'て' => Some("te"), 'と' => Some("to"),
        'な' => Some("na"), 'に' => Some("ni"), 'ぬ' => Some("nu"), 'ね' => Some("ne"), 'の' => Some("no"),
        'は' => Some("ha"), 'ひ' => Some("hi"), 'ふ' => Some("fu"), 'へ' => Some("he"), 'ほ' => Some("ho"),
        'ま' => Some("ma"), 'み' => Some("mi"), 'む' => Some("mu"), 'め' => Some("me"), 'も' => Some("mo"),
        'や' => Some("ya"), 'ゆ' => Some("yu"), 'よ' => Some("yo"),
        'ら' => Some("ra"), 'り' => Some("ri"), 'る' => Some("ru"), 'れ' => Some("re"), 'ろ' => Some("ro"),
        'わ' => Some("wa"), 'を' => Some("wo"), 'ん' => Some("n"),
        'が' => Some("ga"), 'ぎ' => Some("gi"), 'ぐ' => Some("gu"), 'げ' => Some("ge"), 'ご' => Some("go"),
        'ざ' => Some("za"), 'じ' => Some("ji"), 'ず' => Some("zu"), 'ぜ' => Some("ze"), 'ぞ' => Some("zo"),
        'だ' => Some("da"), 'ぢ' => Some("ji"), 'づ' => Some("zu"), 'で' => Some("de"), 'ど' => Some("do"),
        'ば' => Some("ba"), 'び' => Some("bi"), 'ぶ' => Some("bu"), 'べ' => Some("be"), 'ぼ' => Some("bo"),
        'ぱ' => Some("pa"), 'ぴ' => Some("pi"), 'ぷ' => Some("pu"), 'ぺ' => Some("pe"), 'ぽ' => Some("po"),
        'ー' => Some("-"),
        _ => None,
    }
}

/// Pembersih noise judul lagu untuk pencarian kanonikal ke database lirik (Aturan #3 & #5).
pub fn clean_title_noise(raw_title: &str) -> String {
    let mut title = raw_title.to_string();
    let noise_words = [
        "official music video", "official video", "music video", "official audio", "lyric video",
        "lyrics video", "lirik lagu", "full lirik", "sub indo", "sub indonesia", "romaji lyrics",
        "cover", "covered", "koplo", "remix", "koplo remix", "dj remix", "sped up", "speed up",
        "slowed", "nightcore", "bootleg", "mashup", "歌ってみた", "MV", "mv",
    ];

    for noise in noise_words {
        let lower = title.to_lowercase();
        if let Some(idx) = lower.find(&noise.to_lowercase()) {
            title.replace_range(idx..idx + noise.len(), " ");
        }
    }

    // Bersihkan spasi ganda
    let parts: Vec<&str> = title.split_whitespace().collect();
    parts.join(" ")
}
