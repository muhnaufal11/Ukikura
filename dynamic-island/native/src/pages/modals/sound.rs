//! Modal Pengaturan Suara & Volume Alarm Multi-Kanal (#sound-modal).

use windows::core::Result;
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows::Win32::Graphics::DirectWrite::DWRITE_FONT_WEIGHT;
use windows_numerics::Vector2;

use crate::pages::notch::NotchShape;
use crate::ui::icons;
use crate::ui::renderer::Gpu;
use crate::ui::text;

#[derive(Clone, Debug)]
pub struct SoundChannel {
    pub title: &'static str,
    pub sound_name: &'static str,
    pub volume: u8,
}

#[derive(Clone, Debug)]
pub struct SoundModalState {
    pub class_bell: SoundChannel,
    pub wa_notif: SoundChannel,
    pub lms_deadline: SoundChannel,
}

impl Default for SoundModalState {
    fn default() -> Self {
        Self {
            class_bell: SoundChannel {
                title: "🎓 Bel Alarm Kuliah (iGracias)",
                sound_name: "Akademik Chime",
                volume: 85,
            },
            wa_notif: SoundChannel {
                title: "💬 Notifikasi WhatsApp & HP",
                sound_name: "Bubble Pop (Lembut)",
                volume: 70,
            },
            lms_deadline: SoundChannel {
                title: "⏰ Pengingat Deadline Tugas LMS",
                sound_name: "Pulse Alert (Tegas)",
                volume: 80,
            },
        }
    }
}

pub fn draw_sound_modal(
    gpu: &Gpu,
    shape: &NotchShape,
    state: &SoundModalState,
    scale: f32,
) -> Result<()> {
    let left = shape.center_x - shape.width / 2.0 + 16.0 * scale;
    let right = shape.center_x + shape.width / 2.0 - 16.0 * scale;
    let top = 14.0 * scale;
    let bottom = shape.height - 14.0 * scale;

    let white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    let dim = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.65 };
    let cyan = D2D1_COLOR_F { r: 0.37, g: 0.76, b: 1.0, a: 1.0 };
    let border_color = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.14 };

    // 1. Background Modal Overlay Card
    let modal_rect = D2D1_ROUNDED_RECT {
        rect: D2D_RECT_F {
            left,
            top,
            right,
            bottom,
        },
        radiusX: 18.0 * scale,
        radiusY: 18.0 * scale,
    };

    unsafe {
        let bg_brush = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 0.05, g: 0.08, b: 0.12, a: 0.98 }, None)?;
        let border_brush = gpu.dc.CreateSolidColorBrush(&border_color, None)?;
        gpu.dc.FillRoundedRectangle(&modal_rect, &bg_brush);
        gpu.dc.DrawRoundedRectangle(&modal_rect, &border_brush, 1.2 * scale, None);
    }

    // 2. Header Modal
    let hdr_x = left + 14.0 * scale;
    let hdr_y = top + 10.0 * scale;

    let _ = icons::draw_bell_icon(gpu, hdr_x + 8.0 * scale, hdr_y + 8.0 * scale, 13.0 * scale, cyan);
    text::draw_text(
        gpu,
        "Pengaturan Suara & Volume Alarm",
        hdr_x + 22.0 * scale,
        hdr_y + 1.0 * scale,
        12.5 * scale,
        DWRITE_FONT_WEIGHT(700),
        white,
        240.0 * scale,
        16.0 * scale,
    )?;

    // Tombol Close (✕) di kanan atas
    let close_x = right - 18.0 * scale;
    let close_y = hdr_y + 8.0 * scale;
    unsafe {
        let close_bg = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.12 }, None)?;
        let c = D2D1_ELLIPSE {
            point: Vector2 { X: close_x, Y: close_y },
            radiusX: 9.0 * scale,
            radiusY: 9.0 * scale,
        };
        gpu.dc.FillEllipse(&c, &close_bg);
    }
    text::draw_text(
        gpu,
        "✕",
        close_x - 4.0 * scale,
        close_y - 6.0 * scale,
        10.5 * scale,
        DWRITE_FONT_WEIGHT(700),
        white,
        14.0 * scale,
        14.0 * scale,
    )?;

    // 3. Tiga Kartu Kanal Suara
    let channels = [&state.class_bell, &state.wa_notif, &state.lms_deadline];
    let card_w = right - left - 24.0 * scale;
    let card_h = 34.0 * scale;
    let mut cur_y = hdr_y + 24.0 * scale;

    for ch in channels.iter() {
        let c_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: left + 12.0 * scale,
                top: cur_y,
                right: left + 12.0 * scale + card_w,
                bottom: cur_y + card_h,
            },
            radiusX: 8.0 * scale,
            radiusY: 8.0 * scale,
        };

        unsafe {
            let card_bg = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.06 }, None)?;
            gpu.dc.FillRoundedRectangle(&c_rect, &card_bg);
        }

        // Judul Kanal
        text::draw_text(
            gpu,
            ch.title,
            left + 18.0 * scale,
            cur_y + 4.0 * scale,
            10.5 * scale,
            DWRITE_FONT_WEIGHT(600),
            white,
            160.0 * scale,
            14.0 * scale,
        )?;

        // Nada Terpilih
        text::draw_text(
            gpu,
            ch.sound_name,
            left + 18.0 * scale,
            cur_y + 18.0 * scale,
            9.5 * scale,
            DWRITE_FONT_WEIGHT(400),
            dim,
            120.0 * scale,
            12.0 * scale,
        )?;

        // Volume Slider Track
        let vol_track_x = right - 130.0 * scale;
        let vol_track_w = 60.0 * scale;
        let vol_track_y = cur_y + 16.0 * scale;
        let vol_track_h = 4.0 * scale;

        unsafe {
            let track_bg = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.18 }, None)?;
            let track_fill = gpu.dc.CreateSolidColorBrush(&cyan, None)?;
            let tr_r = D2D1_ROUNDED_RECT {
                rect: D2D_RECT_F {
                    left: vol_track_x,
                    top: vol_track_y - vol_track_h / 2.0,
                    right: vol_track_x + vol_track_w,
                    bottom: vol_track_y + vol_track_h / 2.0,
                },
                radiusX: 2.0 * scale,
                radiusY: 2.0 * scale,
            };
            gpu.dc.FillRoundedRectangle(&tr_r, &track_bg);

            let fill_w = vol_track_w * (ch.volume as f32 / 100.0);
            let fill_r = D2D1_ROUNDED_RECT {
                rect: D2D_RECT_F {
                    left: vol_track_x,
                    top: vol_track_y - vol_track_h / 2.0,
                    right: vol_track_x + fill_w,
                    bottom: vol_track_y + vol_track_h / 2.0,
                },
                radiusX: 2.0 * scale,
                radiusY: 2.0 * scale,
            };
            gpu.dc.FillRoundedRectangle(&fill_r, &track_fill);
        }

        let vol_str = format!("{}%", ch.volume);
        text::draw_text(
            gpu,
            &vol_str,
            vol_track_x - 32.0 * scale,
            cur_y + 11.0 * scale,
            9.5 * scale,
            DWRITE_FONT_WEIGHT(700),
            white,
            28.0 * scale,
            12.0 * scale,
        )?;

        // Tombol Test (▶ Uji)
        let test_x = right - 54.0 * scale;
        let test_w = 42.0 * scale;
        let test_h = 18.0 * scale;
        let test_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: test_x,
                top: cur_y + 8.0 * scale,
                right: test_x + test_w,
                bottom: cur_y + 8.0 * scale + test_h,
            },
            radiusX: 5.0 * scale,
            radiusY: 5.0 * scale,
        };
        unsafe {
            let test_bg = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.12 }, None)?;
            gpu.dc.FillRoundedRectangle(&test_rect, &test_bg);
        }
        text::draw_text(
            gpu,
            "▶ Uji",
            test_x + 8.0 * scale,
            cur_y + 11.0 * scale,
            9.5 * scale,
            DWRITE_FONT_WEIGHT(600),
            white,
            30.0 * scale,
            12.0 * scale,
        )?;

        cur_y += card_h + 5.0 * scale;
    }

    // 4. Footer Modal
    let ftr_y = bottom - 24.0 * scale;
    text::draw_text(
        gpu,
        "💡 Suara & volume tersimpan otomatis dan persisten di Ukikura.",
        left + 14.0 * scale,
        ftr_y + 3.0 * scale,
        9.5 * scale,
        DWRITE_FONT_WEIGHT(400),
        dim,
        card_w - 70.0 * scale,
        14.0 * scale,
    )?;

    // Tombol Selesai
    let done_x = right - 64.0 * scale;
    let done_w = 52.0 * scale;
    let done_h = 20.0 * scale;
    let done_rect = D2D1_ROUNDED_RECT {
        rect: D2D_RECT_F {
            left: done_x,
            top: ftr_y,
            right: done_x + done_w,
            bottom: ftr_y + done_h,
        },
        radiusX: 6.0 * scale,
        radiusY: 6.0 * scale,
    };
    unsafe {
        let done_bg = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 0.15, g: 0.45, b: 0.95, a: 0.95 }, None)?;
        gpu.dc.FillRoundedRectangle(&done_rect, &done_bg);
    }
    text::draw_text(
        gpu,
        "Selesai",
        done_x + 10.0 * scale,
        ftr_y + 4.0 * scale,
        10.5 * scale,
        DWRITE_FONT_WEIGHT(700),
        white,
        40.0 * scale,
        14.0 * scale,
    )?;

    Ok(())
}

pub fn hit_test_close(shape: &NotchShape, x: f32, y: f32, scale: f32) -> bool {
    let right = shape.center_x + shape.width / 2.0 - 16.0 * scale;
    let close_x = right - 18.0 * scale;
    let close_y = 24.0 * scale;
    let dist = ((x - close_x).powi(2) + (y - close_y).powi(2)).sqrt();
    dist <= 16.0 * scale
}

pub fn hit_test_done(shape: &NotchShape, x: f32, y: f32, scale: f32) -> bool {
    let right = shape.center_x + shape.width / 2.0 - 16.0 * scale;
    let bottom = shape.height - 14.0 * scale;
    let ftr_y = bottom - 24.0 * scale;
    let done_x = right - 64.0 * scale;
    let done_w = 52.0 * scale;
    let done_h = 20.0 * scale;
    x >= done_x && x <= done_x + done_w && y >= ftr_y && y <= ftr_y + done_h
}
