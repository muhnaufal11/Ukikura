//! Pengurai Berkas Lirik Tersinkronisasi (.LRC) & Parser Baris Lirik Multilingual.

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct LyricLine {
    pub time: f64,
    pub main: String,
    pub sub: String,
    pub trans: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, Default)]
pub struct SyncedLyrics {
    pub title: String,
    pub artist: String,
    pub lines: Vec<LyricLine>,
    pub track_duration: f64,
    pub cover_url: String,
}

pub fn parse_lrc(raw_lrc: &str) -> Vec<LyricLine> {
    let mut lines = Vec::new();
    if raw_lrc.is_empty() {
        return lines;
    }

    for raw_line in raw_lrc.lines() {
        let trimmed = raw_line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Cari semua tag waktu [mm:ss.xx]
        let mut time_tags = Vec::new();
        let mut text_start = 0;
        let bytes = trimmed.as_bytes();

        let mut i = 0;
        while i < bytes.len() {
            if bytes[i] == b'[' {
                let start = i + 1;
                if let Some(end) = bytes[start..].iter().position(|&b| b == b']') {
                    let tag = &trimmed[start..start + end];
                    if let Some(colon) = tag.find(':') {
                        let m_str = &tag[..colon];
                        let s_str = &tag[colon + 1..];
                        if let (Ok(m), Ok(s)) = (m_str.parse::<f64>(), s_str.parse::<f64>()) {
                            time_tags.push(m * 60.0 + s);
                            text_start = start + end + 1;
                        }
                    }
                    i = start + end + 1;
                    continue;
                }
            }
            i += 1;
        }

        if time_tags.is_empty() {
            continue;
        }

        let text = trimmed[text_start..].trim();
        if text.is_empty() {
            continue;
        }

        // Abaikan tag metadata kredit di awal lirik
        let lower = text.to_lowercase();
        if lower.starts_with("作词:")
            || lower.starts_with("作詞:")
            || lower.starts_with("作曲:")
            || lower.starts_with("编曲:")
            || lower.starts_with("lyricist:")
            || lower.starts_with("composer:")
            || lower.starts_with("producer:")
            || lower.starts_with("offset:")
        {
            continue;
        }

        for time in time_tags {
            lines.push(LyricLine {
                time,
                main: text.to_string(),
                sub: String::new(),
                trans: String::new(),
            });
        }
    }

    lines.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap_or(std::cmp::Ordering::Equal));
    lines
}

/// Menemukan indeks lirik aktif saat ini berdasarkan posisi lagu saat ini (detik).
pub fn find_active_index(lines: &[LyricLine], current_pos_sec: f64) -> usize {
    if lines.is_empty() {
        return 0;
    }
    let mut active = 0;
    for (i, line) in lines.iter().enumerate() {
        if line.time <= current_pos_sec + 0.15 {
            active = i;
        } else {
            break;
        }
    }
    active
}
