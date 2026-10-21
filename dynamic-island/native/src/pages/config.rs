//! Halaman 7: Pengaturan Sinkronisasi LMS & Preferensi Sistem.
//! Desain 100% identik dengan .l-config, .cfg-body, .cfg-input-row, dan baris pill tombol.

use windows::core::Result;
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows::Win32::Graphics::DirectWrite::DWRITE_FONT_WEIGHT;

use crate::pages::notch::NotchShape;
use crate::ui::renderer::Gpu;
use crate::ui::text;

pub struct ConfigState {
    pub ical_url: String,
    pub last_sync_text: String,
    pub autostart: bool,
    pub closed_style_mascot: bool,
    pub mascot_fps_label: String,
}

pub fn draw_config_page(
    gpu: &Gpu,
    shape: &NotchShape,
    config: &ConfigState,
    scale: f32,
) -> Result<()> {
    let left = shape.center_x - shape.width / 2.0;
    let _right = shape.center_x + shape.width / 2.0;

    let white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    let dim_white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.65 };
    let cyan = D2D1_COLOR_F { r: 0.37, g: 0.76, b: 1.0, a: 1.0 };
    let purple = D2D1_COLOR_F { r: 0.77, g: 0.71, b: 0.99, a: 1.0 };
    let emerald = D2D1_COLOR_F { r: 0.20, g: 0.88, b: 0.48, a: 1.0 };

    let card_bg = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.08 };
    let border_color = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.12 };

    unsafe {
        let card_brush = gpu.dc.CreateSolidColorBrush(&card_bg, None)?;
        let border_brush = gpu.dc.CreateSolidColorBrush(&border_color, None)?;

        let content_x = left + 44.0 * scale;
        let content_w = shape.width - 88.0 * scale;
        let mut cur_y = 38.0 * scale;

        // 1. Label Kalender iCal
        text::draw_text(
            gpu,
            "URL Kalender iCal LMS (Sync Otomatis 24/7):",
            content_x,
            cur_y,
            11.0 * scale,
            DWRITE_FONT_WEIGHT(600),
            white,
            content_w,
            16.0 * scale,
        )?;
        cur_y += 18.0 * scale;

        // 2. Baris Input URL + Tombol Simpan
        let inp_h = 26.0 * scale;
        let btn_w = 60.0 * scale;
        let inp_w = content_w - btn_w - 6.0 * scale;

        let inp_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: content_x,
                top: cur_y,
                right: content_x + inp_w,
                bottom: cur_y + inp_h,
            },
            radiusX: 6.0 * scale,
            radiusY: 6.0 * scale,
        };
        gpu.dc.FillRoundedRectangle(&inp_rect, &card_brush);
        gpu.dc.DrawRoundedRectangle(&inp_rect, &border_brush, 1.0, None);

        let url_display = if config.ical_url.is_empty() {
            "https://lms.telkomuniversity.ac.id/calendar/export_execute.php?..."
        } else {
            &config.ical_url
        };
        let text_color = if config.ical_url.is_empty() { dim_white } else { white };
        text::draw_text(
            gpu,
            url_display,
            content_x + 8.0 * scale,
            cur_y + 5.0 * scale,
            10.5 * scale,
            DWRITE_FONT_WEIGHT(400),
            text_color,
            inp_w - 16.0 * scale,
            16.0 * scale,
        )?;

        // Tombol Simpan
        let btn_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: content_x + inp_w + 6.0 * scale,
                top: cur_y,
                right: content_x + content_w,
                bottom: cur_y + inp_h,
            },
            radiusX: 6.0 * scale,
            radiusY: 6.0 * scale,
        };
        let save_brush = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 0.15, g: 0.53, b: 0.98, a: 1.0 }, None)?;
        gpu.dc.FillRoundedRectangle(&btn_rect, &save_brush);
        text::draw_text(
            gpu,
            "Simpan",
            content_x + inp_w + 16.0 * scale,
            cur_y + 5.0 * scale,
            10.5 * scale,
            DWRITE_FONT_WEIGHT(700),
            white,
            40.0 * scale,
            16.0 * scale,
        )?;
        cur_y += inp_h + 8.0 * scale;

        // 3. Status Terakhir
        text::draw_text(
            gpu,
            &config.last_sync_text,
            content_x,
            cur_y,
            10.0 * scale,
            DWRITE_FONT_WEIGHT(400),
            dim_white,
            content_w,
            15.0 * scale,
        )?;
        cur_y += 18.0 * scale;

        // 4. Baris Tombol Preferensi (Pills)
        let pill_h = 22.0 * scale;
        let mut px = content_x;

        // Pill A: 🔔 Suara
        let p_sound_w = 64.0 * scale;
        let p_sound_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F { left: px, top: cur_y, right: px + p_sound_w, bottom: cur_y + pill_h },
            radiusX: 11.0 * scale,
            radiusY: 11.0 * scale,
        };
        gpu.dc.FillRoundedRectangle(&p_sound_rect, &card_brush);
        text::draw_text(gpu, "🔔 Suara", px + 8.0 * scale, cur_y + 4.0 * scale, 10.0 * scale, DWRITE_FONT_WEIGHT(600), purple, 48.0 * scale, 14.0 * scale)?;
        px += p_sound_w + 5.0 * scale;

        // Pill B: Versi v1.1.0
        let p_ver_w = 56.0 * scale;
        let p_ver_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F { left: px, top: cur_y, right: px + p_ver_w, bottom: cur_y + pill_h },
            radiusX: 11.0 * scale,
            radiusY: 11.0 * scale,
        };
        gpu.dc.FillRoundedRectangle(&p_ver_rect, &card_brush);
        text::draw_text(gpu, "v1.1.0", px + 12.0 * scale, cur_y + 4.0 * scale, 10.0 * scale, DWRITE_FONT_WEIGHT(600), emerald, 40.0 * scale, 14.0 * scale)?;
        px += p_ver_w + 5.0 * scale;

        // Pill C: Auto Start
        let p_auto_w = 82.0 * scale;
        let p_auto_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F { left: px, top: cur_y, right: px + p_auto_w, bottom: cur_y + pill_h },
            radiusX: 11.0 * scale,
            radiusY: 11.0 * scale,
        };
        gpu.dc.FillRoundedRectangle(&p_auto_rect, &card_brush);
        let auto_label = if config.autostart { "Startup: ON" } else { "Startup: OFF" };
        text::draw_text(gpu, auto_label, px + 8.0 * scale, cur_y + 4.0 * scale, 9.5 * scale, DWRITE_FONT_WEIGHT(600), white, 68.0 * scale, 14.0 * scale)?;
        px += p_auto_w + 5.0 * scale;

        // Pill D: Mode Maskot / Status
        let p_mode_w = 80.0 * scale;
        let p_mode_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F { left: px, top: cur_y, right: px + p_mode_w, bottom: cur_y + pill_h },
            radiusX: 11.0 * scale,
            radiusY: 11.0 * scale,
        };
        gpu.dc.FillRoundedRectangle(&p_mode_rect, &card_brush);
        let mode_label = if config.closed_style_mascot { "Mode: Maskot" } else { "Mode: Status" };
        text::draw_text(gpu, mode_label, px + 6.0 * scale, cur_y + 4.0 * scale, 9.5 * scale, DWRITE_FONT_WEIGHT(600), cyan, 68.0 * scale, 14.0 * scale)?;
        px += p_mode_w + 5.0 * scale;

        // Pill E: Tengahkan
        let p_cnt_w = 64.0 * scale;
        let p_cnt_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F { left: px, top: cur_y, right: px + p_cnt_w, bottom: cur_y + pill_h },
            radiusX: 11.0 * scale,
            radiusY: 11.0 * scale,
        };
        gpu.dc.FillRoundedRectangle(&p_cnt_rect, &card_brush);
        text::draw_text(gpu, "Tengahkan", px + 8.0 * scale, cur_y + 4.0 * scale, 9.5 * scale, DWRITE_FONT_WEIGHT(600), white, 52.0 * scale, 14.0 * scale)?;
    }

    Ok(())
}
