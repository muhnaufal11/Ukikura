//! Penyedia Lirik (LRCLIB & NetEase) dengan dukungan multi-tier (Romaji, Aksara Asli, Terjemahan).

use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;

use crate::lyrics::http::http_get;
use crate::lyrics::lrc::{parse_lrc, LyricLine, SyncedLyrics};
use crate::lyrics::romaji::{clean_title_noise, is_japanese, kana_to_romaji};

#[derive(Clone, Debug)]
pub struct SongQuery {
    pub title: String,
    pub artist: String,
    pub duration_sec: f64,
}

pub struct LyricsManager {
    current_key: Arc<Mutex<String>>,
    active_lyrics: Arc<Mutex<Option<SyncedLyrics>>>,
    tx: Sender<(String, Option<SyncedLyrics>)>,
    rx: Receiver<(String, Option<SyncedLyrics>)>,
}

impl LyricsManager {
    pub fn new() -> Self {
        let (tx, rx) = channel();
        Self {
            current_key: Arc::new(Mutex::new(String::new())),
            active_lyrics: Arc::new(Mutex::new(None)),
            tx,
            rx,
        }
    }

    /// Cek apakah ada lirik baru yang selesai diunduh dari background thread
    pub fn poll(&mut self) -> Option<SyncedLyrics> {
        while let Ok((key, lyrics)) = self.rx.try_recv() {
            let cur = self.current_key.lock().unwrap();
            if *cur == key {
                let mut active = self.active_lyrics.lock().unwrap();
                *active = lyrics.clone();
                return lyrics;
            }
        }
        None
    }

    pub fn get_active(&self) -> Option<SyncedLyrics> {
        self.active_lyrics.lock().unwrap().clone()
    }

    /// Request pencarian lirik di background thread jika lagu berganti
    pub fn request_lyrics(&mut self, title: &str, artist: &str, duration_sec: f64) {
        if title.is_empty() {
            let mut cur = self.current_key.lock().unwrap();
            cur.clear();
            *self.active_lyrics.lock().unwrap() = None;
            return;
        }

        let key = format!("{}::{}", title, artist);
        {
            let mut cur = self.current_key.lock().unwrap();
            if *cur == key {
                return; // Lagu sama, tidak perlu query ulang
            }
            *cur = key.clone();
            *self.active_lyrics.lock().unwrap() = None; // Reset lirik lagu lama
        }

        let q = SongQuery {
            title: title.to_string(),
            artist: artist.to_string(),
            duration_sec,
        };

        let tx = self.tx.clone();
        let current_key_ref = self.current_key.clone();

        thread::spawn(move || {
            let result = fetch_lyrics_pipeline(&q);
            // Hanya kirim jika lagu masih aktif
            let cur = current_key_ref.lock().unwrap();
            if *cur == key {
                let _ = tx.send((key, result));
            }
        });
    }
}

fn fetch_lyrics_pipeline(q: &SongQuery) -> Option<SyncedLyrics> {
    let clean_title = clean_title_noise(&q.title);
    let clean_artist = clean_title_noise(&q.artist);

    // 1. Coba LRCLIB terlebih dahulu (sangat cepat & API publik standar)
    if let Some(lrc) = fetch_lrclib(&clean_title, &clean_artist, q.duration_sec) {
        return Some(lrc);
    }

    // 2. Coba NetEase Cloud Music (database raksasa untuk lagu Jepang + Romalrc + Terjemahan)
    if let Some(lrc) = fetch_netease(&clean_title, &clean_artist, q.duration_sec) {
        return Some(lrc);
    }

    // 3. Fallback: coba query dengan judul asli tanpa dibersihkan
    if clean_title != q.title {
        if let Some(lrc) = fetch_lrclib(&q.title, &q.artist, q.duration_sec) {
            return Some(lrc);
        }
    }

    None
}

fn fetch_lrclib(title: &str, artist: &str, duration: f64) -> Option<SyncedLyrics> {
    let query = if artist.is_empty() {
        urlencoding(title)
    } else {
        urlencoding(&format!("{} {}", title, artist))
    };

    let url = format!("https://lrclib.net/api/search?q={}", query);
    let body = http_get(&url).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&body).ok()?;
    let arr = parsed.as_array()?;

    for item in arr {
        let synced = item.get("syncedLyrics").and_then(|v| v.as_str()).unwrap_or("");
        if !synced.is_empty() {
            let raw_lines = parse_lrc(synced);
            if raw_lines.len() >= 3 {
                let mut processed_lines = Vec::new();
                for l in raw_lines {
                    let has_jp = is_japanese(&l.main);
                    let (main, sub) = if has_jp {
                        let roma = kana_to_romaji(&l.main);
                        (roma, l.main.clone())
                    } else {
                        (l.main.clone(), String::new())
                    };

                    processed_lines.push(LyricLine {
                        time: l.time,
                        main,
                        sub,
                        trans: String::new(),
                    });
                }

                return Some(SyncedLyrics {
                    title: title.to_string(),
                    artist: artist.to_string(),
                    lines: processed_lines,
                    track_duration: duration,
                    cover_url: String::new(),
                });
            }
        }
    }

    None
}

fn fetch_netease(title: &str, artist: &str, duration: f64) -> Option<SyncedLyrics> {
    let query = if artist.is_empty() {
        urlencoding(title)
    } else {
        urlencoding(&format!("{} {}", title, artist))
    };

    let search_url = format!("https://music.163.com/api/search/get?s={}&type=1&limit=5", query);
    let body = http_get(&search_url).ok()?;
    let parsed: serde_json::Value = serde_json::from_str(&body).ok()?;
    let songs = parsed.get("result")?.get("songs")?.as_array()?;

    if songs.is_empty() {
        return None;
    }

    let song_id = songs[0].get("id")?.as_i64()?;
    let lyr_url = format!(
        "https://music.163.com/api/song/lyric?id={}&lv=1&kv=1&tv=-1&rv=-1",
        song_id
    );
    let lyr_body = http_get(&lyr_url).ok()?;
    let lyr_parsed: serde_json::Value = serde_json::from_str(&lyr_body).ok()?;

    let raw_lrc = lyr_parsed.get("lrc").and_then(|v| v.get("lyric")).and_then(|v| v.as_str()).unwrap_or("");
    let raw_roma = lyr_parsed.get("romalrc").and_then(|v| v.get("lyric")).and_then(|v| v.as_str()).unwrap_or("");
    let raw_trans = lyr_parsed.get("tlyric").and_then(|v| v.get("lyric")).and_then(|v| v.as_str()).unwrap_or("");

    if raw_lrc.is_empty() && raw_roma.is_empty() {
        return None;
    }

    let lrc_lines = parse_lrc(raw_lrc);
    let roma_lines = parse_lrc(raw_roma);
    let trans_lines = parse_lrc(raw_trans);

    let mut final_lines = Vec::new();
    let has_official_roma = roma_lines.len() >= 3;

    for lrc_item in &lrc_lines {
        let has_jp = is_japanese(&lrc_item.main);

        // Cari romaji yang cocok waktunya (toleransi 0.5 detik)
        let matched_roma = if has_official_roma {
            roma_lines.iter().find(|r| (r.time - lrc_item.time).abs() < 0.5).map(|r| r.main.clone())
        } else {
            None
        };

        // Cari terjemahan yang cocok waktunya
        let matched_trans = trans_lines.iter().find(|t| (t.time - lrc_item.time).abs() < 0.5).map(|t| t.main.clone()).unwrap_or_default();

        let (main, sub) = if has_jp {
            let roma = matched_roma.unwrap_or_else(|| kana_to_romaji(&lrc_item.main));
            (roma, lrc_item.main.clone())
        } else {
            (lrc_item.main.clone(), String::new())
        };

        final_lines.push(LyricLine {
            time: lrc_item.time,
            main,
            sub,
            trans: matched_trans,
        });
    }

    if final_lines.len() >= 3 {
        Some(SyncedLyrics {
            title: title.to_string(),
            artist: artist.to_string(),
            lines: final_lines,
            track_duration: duration,
            cover_url: String::new(),
        })
    } else {
        None
    }
}

fn urlencoding(input: &str) -> String {
    let mut result = String::new();
    for b in input.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(b as char);
            }
            b' ' => result.push('+'),
            _ => {
                result.push_str(&format!("%{:02X}", b));
            }
        }
    }
    result
}
