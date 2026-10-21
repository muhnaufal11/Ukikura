//! Halaman Pemutar Musik Native Khas Nusa 1.0.6 (Direct2D UI + SMTC + Synced Lyrics).

use windows::core::Result;
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows::Win32::Graphics::DirectWrite::DWRITE_FONT_WEIGHT;
use windows_numerics::Vector2;

use crate::lyrics::lrc::{find_active_index, SyncedLyrics};
use crate::pages::notch::NotchShape;
use crate::services::smtc::MediaState;
use crate::ui::icons;
use crate::ui::renderer::Gpu;
use crate::ui::text;

fn format_time(sec: f64) -> String {
    let s = (sec.max(0.0) as u64).min(359_999);
    let m = s / 60;
    let rem_s = s % 60;
    format!("{:02}:{:02}", m, rem_s)
}

fn format_time_rem(sec: f64, dur: f64) -> String {
    let rem = (dur - sec).max(0.0);
    format!("-{}", format_time(rem))
}

/// Tampilan Pemutar Musik Standar Khas Nusa (.l-music: 480px x 186px)
pub fn draw_expanded_music(
    gpu: &Gpu,
    shape: &NotchShape,
    media: &MediaState,
    scale: f32,
) -> Result<()> {
    let left = shape.center_x - shape.width / 2.0;
    let right = shape.center_x + shape.width / 2.0;
    let cx = shape.center_x;

    let white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    let sub_color = D2D1_COLOR_F { r: 0.8, g: 0.85, b: 0.95, a: 0.65 };
    let dim_time = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.72 };
    let bar_bg = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.22 };
    let accent_cyan = D2D1_COLOR_F { r: 0.37, g: 0.76, b: 1.0, a: 1.0 };

    // 1. Album Art Thumbnail Khas Nusa (left: 46px, top: 40px, width: 68px, height: 68px)
    let art_size = 68.0 * scale;
    let art_x = left + 46.0 * scale;
    let art_y = 40.0 * scale;
    let art_rect = D2D1_ROUNDED_RECT {
        rect: D2D_RECT_F {
            left: art_x,
            top: art_y,
            right: art_x + art_size,
            bottom: art_y + art_size,
        },
        radiusX: 12.0 * scale,
        radiusY: 12.0 * scale,
    };
    unsafe {
        let art_bg = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 0.09, g: 0.14, b: 0.22, a: 1.0 }, None)?;
        gpu.dc.FillRoundedRectangle(&art_rect, &art_bg);
        let art_border = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 0.25, g: 0.45, b: 0.7, a: 0.45 }, None)?;
        gpu.dc.DrawRoundedRectangle(&art_rect, &art_border, 1.2 * scale, None);
    }
    // Ikon piringan hitam / vinyl di tengah art
    icons::draw_play(gpu, art_x + art_size / 2.0, art_y + art_size / 2.0, 18.0 * scale, accent_cyan)?;

    // 2. Info Trek Khas Nusa (left: 128px, top: 42px)
    let text_x = left + 128.0 * scale;
    let max_text_w = right - 46.0 * scale - text_x;

    let app_badge = if media.app_id.is_empty() { "Windows Media" } else { &media.app_id };
    text::draw_text(
        gpu,
        app_badge,
        text_x,
        41.0 * scale,
        9.0 * scale,
        DWRITE_FONT_WEIGHT(700),
        accent_cyan,
        max_text_w,
        14.0 * scale,
    )?;

    let title = if media.title.is_empty() { "Putar Musik di PC / Browser" } else { &media.title };
    text::draw_text(
        gpu,
        title,
        text_x,
        56.0 * scale,
        15.5 * scale,
        DWRITE_FONT_WEIGHT(600),
        white,
        max_text_w,
        20.0 * scale,
    )?;

    let artist = if media.artist.is_empty() { "Spotify, YouTube, Brave, Chrome, Apple Music" } else { &media.artist };
    text::draw_text(
        gpu,
        artist,
        text_x,
        78.0 * scale,
        11.5 * scale,
        DWRITE_FONT_WEIGHT(400),
        sub_color,
        max_text_w,
        16.0 * scale,
    )?;

    // 3. Timeline Scrubber Khas Nusa (pos: 46px, bar: 88px, rem: right - 86px, top: 118px)
    let time_y = 114.0 * scale;
    let bar_y = 118.0 * scale;
    let bar_x = left + 88.0 * scale;
    let bar_w = shape.width - 176.0 * scale;
    let bar_h = 4.5 * scale;

    let pos_str = format_time(media.position_sec);
    text::draw_text(
        gpu,
        &pos_str,
        left + 46.0 * scale,
        time_y,
        10.5 * scale,
        DWRITE_FONT_WEIGHT(400),
        dim_time,
        38.0 * scale,
        14.0 * scale,
    )?;

    let progress = if media.duration_sec > 0.0 {
        (media.position_sec / media.duration_sec).clamp(0.0, 1.0) as f32
    } else {
        0.0
    };

    unsafe {
        let bg_brush = gpu.dc.CreateSolidColorBrush(&bar_bg, None)?;
        let fill_brush = gpu.dc.CreateSolidColorBrush(&white, None)?;

        let track_r = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: bar_x,
                top: bar_y,
                right: bar_x + bar_w,
                bottom: bar_y + bar_h,
            },
            radiusX: bar_h / 2.0,
            radiusY: bar_h / 2.0,
        };
        gpu.dc.FillRoundedRectangle(&track_r, &bg_brush);

        let fill_w = bar_w * progress;
        if fill_w > 1.0 {
            let filled_r = D2D1_ROUNDED_RECT {
                rect: D2D_RECT_F {
                    left: bar_x,
                    top: bar_y,
                    right: bar_x + fill_w,
                    bottom: bar_y + bar_h,
                },
                radiusX: bar_h / 2.0,
                radiusY: bar_h / 2.0,
            };
            gpu.dc.FillRoundedRectangle(&filled_r, &fill_brush);

            let knob = D2D1_ELLIPSE {
                point: Vector2 { X: bar_x + fill_w, Y: bar_y + bar_h / 2.0 },
                radiusX: 4.5 * scale,
                radiusY: 4.5 * scale,
            };
            gpu.dc.FillEllipse(&knob, &fill_brush);
        }
    }

    let rem_str = format_time_rem(media.position_sec, media.duration_sec);
    text::draw_text(
        gpu,
        &rem_str,
        right - 84.0 * scale,
        time_y,
        10.5 * scale,
        DWRITE_FONT_WEIGHT(400),
        dim_time,
        42.0 * scale,
        14.0 * scale,
    )?;

    // 4. Baris Tombol Kontrol Media (top: 148px)
    let ctrl_y = 148.0 * scale;

    // Tombol Lirik (left: 52px)
    let lyrics_btn_x = left + 52.0 * scale;
    unsafe {
        let bub_bg = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.12 }, None)?;
        let bub_circle = D2D1_ELLIPSE {
            point: Vector2 { X: lyrics_btn_x, Y: ctrl_y },
            radiusX: 13.0 * scale,
            radiusY: 13.0 * scale,
        };
        gpu.dc.FillEllipse(&bub_circle, &bub_bg);
    }
    icons::draw_lyrics_bubble(gpu, lyrics_btn_x, ctrl_y, 14.0 * scale, white)?;

    // Prev (left: 196px atau cx - 44px)
    let prev_x = cx - 44.0 * scale;
    icons::draw_prev(gpu, prev_x, ctrl_y, 16.0 * scale, white)?;

    // Play/Pause Main Circle (cx: 240px)
    let is_playing = media.status == "Playing";
    let play_bg_rect = D2D1_ELLIPSE {
        point: Vector2 { X: cx, Y: ctrl_y },
        radiusX: 17.0 * scale,
        radiusY: 17.0 * scale,
    };
    unsafe {
        let play_bg = gpu.dc.CreateSolidColorBrush(&white, None)?;
        gpu.dc.FillEllipse(&play_bg_rect, &play_bg);
    }
    let black = D2D1_COLOR_F { r: 0.05, g: 0.05, b: 0.05, a: 1.0 };
    if is_playing {
        icons::draw_pause(gpu, cx, ctrl_y, 13.0 * scale, black)?;
    } else {
        icons::draw_play(gpu, cx + 1.2 * scale, ctrl_y, 14.0 * scale, black)?;
    }

    // Next (left: 284px atau cx + 44px)
    let next_x = cx + 44.0 * scale;
    icons::draw_next(gpu, next_x, ctrl_y, 16.0 * scale, white)?;

    // Volume Mini Indicator (right: 50px)
    let vol_x = right - 50.0 * scale;
    unsafe {
        let vol_bg = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.12 }, None)?;
        let vol_circle = D2D1_ELLIPSE {
            point: Vector2 { X: vol_x, Y: ctrl_y },
            radiusX: 13.0 * scale,
            radiusY: 13.0 * scale,
        };
        gpu.dc.FillEllipse(&vol_circle, &vol_bg);
    }
    let _ = icons::draw_play(gpu, vol_x, ctrl_y, 8.0 * scale, accent_cyan);

    Ok(())
}

/// Mode Lirik Melebar Khas Nusa (.l-lyrics: 520px x 186px)
pub fn draw_expanded_lyrics(
    gpu: &Gpu,
    shape: &NotchShape,
    media: &MediaState,
    lyrics: Option<&SyncedLyrics>,
    scale: f32,
) -> Result<()> {
    let left = shape.center_x - shape.width / 2.0;
    let right = shape.center_x + shape.width / 2.0;

    let white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    let sub_color = D2D1_COLOR_F { r: 0.8, g: 0.85, b: 0.95, a: 0.65 };
    let amber_gold = D2D1_COLOR_F { r: 1.0, g: 0.82, b: 0.40, a: 0.95 };
    let accent_cyan = D2D1_COLOR_F { r: 0.37, g: 0.76, b: 1.0, a: 1.0 };

    // Sisi Kiri: Mini Art (56x56) & Mini Info
    let art_x = left + 34.0 * scale;
    let art_y = 38.0 * scale;
    let art_size = 56.0 * scale;
    let art_rect = D2D1_ROUNDED_RECT {
        rect: D2D_RECT_F {
            left: art_x,
            top: art_y,
            right: art_x + art_size,
            bottom: art_y + art_size,
        },
        radiusX: 12.0 * scale,
        radiusY: 12.0 * scale,
    };
    unsafe {
        let art_bg = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 0.09, g: 0.14, b: 0.22, a: 1.0 }, None)?;
        gpu.dc.FillRoundedRectangle(&art_rect, &art_bg);
    }
    icons::draw_play(gpu, art_x + art_size / 2.0, art_y + art_size / 2.0, 14.0 * scale, accent_cyan)?;

    let text_x = left + 98.0 * scale;
    let text_w = 110.0 * scale;
    let title = if media.title.is_empty() { "Putar Musik" } else { &media.title };
    text::draw_text(
        gpu,
        title,
        text_x,
        40.0 * scale,
        13.0 * scale,
        DWRITE_FONT_WEIGHT(600),
        white,
        text_w,
        18.0 * scale,
    )?;

    let artist = if media.artist.is_empty() { "Artis" } else { &media.artist };
    text::draw_text(
        gpu,
        artist,
        text_x,
        60.0 * scale,
        10.5 * scale,
        DWRITE_FONT_WEIGHT(400),
        sub_color,
        text_w,
        14.0 * scale,
    )?;

    // Tombol Kembali ke Pemutar Standar (left: 46px, top: 146px)
    let back_x = left + 46.0 * scale;
    let back_y = 146.0 * scale;
    unsafe {
        let back_bg = gpu.dc.CreateSolidColorBrush(&white, None)?;
        let back_c = D2D1_ELLIPSE {
            point: Vector2 { X: back_x, Y: back_y },
            radiusX: 13.0 * scale,
            radiusY: 13.0 * scale,
        };
        gpu.dc.FillEllipse(&back_c, &back_bg);
    }
    let black = D2D1_COLOR_F { r: 0.05, g: 0.05, b: 0.05, a: 1.0 };
    icons::draw_lyrics_bubble(gpu, back_x, back_y, 13.0 * scale, black)?;

    // Sisi Kanan: Area Lirik Multi-Tier Tersinkronisasi (left: 220px..right - 26px)
    let lyr_x = left + 220.0 * scale;
    let lyr_w = right - 26.0 * scale - lyr_x;
    let lyr_y = 42.0 * scale;

    if let Some(lyr) = lyrics {
        if !lyr.lines.is_empty() {
            let active_idx = find_active_index(&lyr.lines, media.position_sec);
            let active_line = &lyr.lines[active_idx];

            // 1. Teks Utama (Romaji / Vokal Asli)
            text::draw_text(
                gpu,
                &active_line.main,
                lyr_x,
                lyr_y,
                14.5 * scale,
                DWRITE_FONT_WEIGHT(700),
                white,
                lyr_w,
                22.0 * scale,
            )?;

            let mut cur_y = lyr_y + 24.0 * scale;

            // 2. Aksara Asli Jepang (Kanji / Kana jika ada)
            if !active_line.sub.is_empty() {
                text::draw_text(
                    gpu,
                    &active_line.sub,
                    lyr_x,
                    cur_y,
                    12.0 * scale,
                    DWRITE_FONT_WEIGHT(400),
                    sub_color,
                    lyr_w,
                    18.0 * scale,
                )?;
                cur_y += 20.0 * scale;
            }

            // 3. Terjemahan Bahasa Indonesia (jika ada)
            if !active_line.trans.is_empty() {
                text::draw_text(
                    gpu,
                    &active_line.trans,
                    lyr_x,
                    cur_y,
                    11.5 * scale,
                    DWRITE_FONT_WEIGHT(400),
                    amber_gold,
                    lyr_w,
                    16.0 * scale,
                )?;
            }
        }
    } else {
        text::draw_text(
            gpu,
            "Mencari lirik tersinkronisasi...",
            lyr_x,
            lyr_y + 10.0 * scale,
            12.5 * scale,
            DWRITE_FONT_WEIGHT(400),
            sub_color,
            lyr_w,
            18.0 * scale,
        )?;
    }

    Ok(())
}

/// Mini Karaoke Overlay pada kapsul notch tertutup saat memutar musik
pub fn draw_closed_karaoke(
    gpu: &Gpu,
    shape: &NotchShape,
    lyrics: &SyncedLyrics,
    pos_sec: f64,
    scale: f32,
) -> Result<()> {
    if lyrics.lines.is_empty() {
        return Ok(());
    }

    let active_idx = find_active_index(&lyrics.lines, pos_sec);
    let line = &lyrics.lines[active_idx];

    let cx = shape.center_x;
    let w = shape.width - 24.0 * scale;
    let x = cx - w / 2.0;

    let white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.95 };
    let sub = D2D1_COLOR_F { r: 0.8, g: 0.88, b: 1.0, a: 0.65 };

    if !line.sub.is_empty() {
        text::draw_text(
            gpu,
            &line.main,
            x,
            3.0 * scale,
            10.5 * scale,
            DWRITE_FONT_WEIGHT(600),
            white,
            w,
            13.0 * scale,
        )?;
        text::draw_text(
            gpu,
            &line.sub,
            x,
            15.0 * scale,
            8.5 * scale,
            DWRITE_FONT_WEIGHT(400),
            sub,
            w,
            11.0 * scale,
        )?;
    } else {
        text::draw_text(
            gpu,
            &line.main,
            x,
            7.0 * scale,
            11.5 * scale,
            DWRITE_FONT_WEIGHT(600),
            white,
            w,
            15.0 * scale,
        )?;
    }

    Ok(())
}
