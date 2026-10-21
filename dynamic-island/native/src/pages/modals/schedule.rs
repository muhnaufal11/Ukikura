//! Modal Jadwal Kuliah Mingguan & KSM (#sched-modal).

use windows::core::Result;
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows::Win32::Graphics::DirectWrite::DWRITE_FONT_WEIGHT;
use windows_numerics::Vector2;

use crate::pages::notch::NotchShape;
use crate::ui::renderer::Gpu;
use crate::ui::text;

#[derive(Clone, Debug)]
pub struct ClassScheduleItem {
    pub day: &'static str,
    pub name: &'static str,
    pub time: &'static str,
    pub room: &'static str,
    pub code: &'static str,
    pub group: &'static str,
}

pub fn default_classes() -> Vec<ClassScheduleItem> {
    vec![
        ClassScheduleItem {
            day: "Senin",
            name: "Algoritma & Pemrograman",
            time: "08:30 - 10:30",
            room: "KU1.01.01",
            code: "CCH1A4",
            group: "SE-48-01",
        },
        ClassScheduleItem {
            day: "Senin",
            name: "Basis Data Lanjut",
            time: "13:30 - 16:30",
            room: "CYCLO LAB",
            code: "BDK3CAB3",
            group: "SE-48-01",
        },
        ClassScheduleItem {
            day: "Rabu",
            name: "Pengembangan Perangkat Lunak",
            time: "09:30 - 12:30",
            room: "KU2.02.04",
            code: "SEH2B3",
            group: "SE-48-01",
        },
    ]
}

pub fn draw_schedule_modal(
    gpu: &Gpu,
    shape: &NotchShape,
    classes: &[ClassScheduleItem],
    selected_day: &str,
    scale: f32,
) -> Result<()> {
    let left = shape.center_x - shape.width / 2.0 + 16.0 * scale;
    let right = shape.center_x + shape.width / 2.0 - 16.0 * scale;
    let top = 14.0 * scale;
    let bottom = shape.height - 14.0 * scale;

    let white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    let dim = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.65 };
    let emerald = D2D1_COLOR_F { r: 0.20, g: 0.88, b: 0.48, a: 1.0 };
    let cyan = D2D1_COLOR_F { r: 0.37, g: 0.76, b: 1.0, a: 1.0 };
    let border_color = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.14 };

    // 1. Background Modal
    let modal_rect = D2D1_ROUNDED_RECT {
        rect: D2D_RECT_F { left, top, right, bottom },
        radiusX: 18.0 * scale,
        radiusY: 18.0 * scale,
    };
    unsafe {
        let bg_brush = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 0.05, g: 0.08, b: 0.12, a: 0.98 }, None)?;
        let border_brush = gpu.dc.CreateSolidColorBrush(&border_color, None)?;
        gpu.dc.FillRoundedRectangle(&modal_rect, &bg_brush);
        gpu.dc.DrawRoundedRectangle(&modal_rect, &border_brush, 1.2 * scale, None);
    }

    // 2. Header
    let hdr_x = left + 14.0 * scale;
    let hdr_y = top + 10.0 * scale;
    text::draw_text(
        gpu,
        "Jadwal Kuliah Mingguan",
        hdr_x,
        hdr_y,
        12.5 * scale,
        DWRITE_FONT_WEIGHT(700),
        white,
        160.0 * scale,
        16.0 * scale,
    )?;

    // Tombol Import KSM & Tombol Close
    let ksm_x = right - 110.0 * scale;
    let ksm_w = 72.0 * scale;
    let ksm_rect = D2D1_ROUNDED_RECT {
        rect: D2D_RECT_F { left: ksm_x, top: hdr_y - 1.0 * scale, right: ksm_x + ksm_w, bottom: hdr_y + 17.0 * scale },
        radiusX: 5.0 * scale,
        radiusY: 5.0 * scale,
    };
    unsafe {
        let ksm_bg = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 0.15, g: 0.45, b: 0.95, a: 0.95 }, None)?;
        gpu.dc.FillRoundedRectangle(&ksm_rect, &ksm_bg);
    }
    text::draw_text(
        gpu,
        "📥 Import KSM",
        ksm_x + 6.0 * scale,
        hdr_y + 2.0 * scale,
        9.0 * scale,
        DWRITE_FONT_WEIGHT(600),
        white,
        60.0 * scale,
        14.0 * scale,
    )?;

    let close_x = right - 18.0 * scale;
    let close_y = hdr_y + 8.0 * scale;
    unsafe {
        let close_bg = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.12 }, None)?;
        let c = D2D1_ELLIPSE { point: Vector2 { X: close_x, Y: close_y }, radiusX: 9.0 * scale, radiusY: 9.0 * scale };
        gpu.dc.FillEllipse(&c, &close_bg);
    }
    text::draw_text(gpu, "✕", close_x - 4.0 * scale, close_y - 6.0 * scale, 10.5 * scale, DWRITE_FONT_WEIGHT(700), white, 14.0 * scale, 14.0 * scale)?;

    // 3. Filter Bar Hari (Semua, Senin, Selasa, Rabu, Kamis, Jumat, Sabtu)
    let days = ["Semua", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
    let filter_y = hdr_y + 22.0 * scale;
    let mut fx = left + 14.0 * scale;

    for d in days.iter() {
        let is_sel = *d == selected_day;
        let fw = 42.0 * scale;
        let fh = 18.0 * scale;
        let f_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F { left: fx, top: filter_y, right: fx + fw, bottom: filter_y + fh },
            radiusX: 5.0 * scale,
            radiusY: 5.0 * scale,
        };
        unsafe {
            let bg_col = if is_sel {
                D2D1_COLOR_F { r: 0.18, g: 0.36, b: 1.0, a: 0.95 }
            } else {
                D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.08 }
            };
            let f_bg = gpu.dc.CreateSolidColorBrush(&bg_col, None)?;
            gpu.dc.FillRoundedRectangle(&f_rect, &f_bg);
        }
        text::draw_text(gpu, d, fx + 4.0 * scale, filter_y + 3.0 * scale, 9.0 * scale, DWRITE_FONT_WEIGHT(600), white, fw - 8.0 * scale, 12.0 * scale)?;
        fx += fw + 4.0 * scale;
    }

    // 4. Daftar Kartu Jadwal
    let mut cy = filter_y + 24.0 * scale;
    let card_w = right - left - 28.0 * scale;
    let card_h = 32.0 * scale;

    let filtered: Vec<&ClassScheduleItem> = classes.iter().filter(|c| selected_day == "Semua" || c.day == selected_day).take(2).collect();

    if filtered.is_empty() {
        text::draw_text(
            gpu,
            "Tidak ada jadwal kuliah pada hari ini.",
            left + 14.0 * scale,
            cy + 8.0 * scale,
            10.5 * scale,
            DWRITE_FONT_WEIGHT(400),
            dim,
            card_w,
            14.0 * scale,
        )?;
    } else {
        for c in filtered.iter() {
            let c_rect = D2D1_ROUNDED_RECT {
                rect: D2D_RECT_F { left: left + 14.0 * scale, top: cy, right: left + 14.0 * scale + card_w, bottom: cy + card_h },
                radiusX: 7.0 * scale,
                radiusY: 7.0 * scale,
            };
            unsafe {
                let card_bg = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.07 }, None)?;
                gpu.dc.FillRoundedRectangle(&c_rect, &card_bg);
            }

            text::draw_text(gpu, c.name, left + 22.0 * scale, cy + 3.0 * scale, 10.5 * scale, DWRITE_FONT_WEIGHT(600), white, card_w - 90.0 * scale, 14.0 * scale)?;
            let meta = format!("{} · {} · {} ({})", c.time, c.room, c.code, c.group);
            text::draw_text(gpu, &meta, left + 22.0 * scale, cy + 17.0 * scale, 9.0 * scale, DWRITE_FONT_WEIGHT(400), cyan, card_w - 90.0 * scale, 12.0 * scale)?;

            // Badge Bell Aktif
            text::draw_text(gpu, "🔔 Aktif", right - 64.0 * scale, cy + 10.0 * scale, 9.0 * scale, DWRITE_FONT_WEIGHT(700), emerald, 48.0 * scale, 12.0 * scale)?;

            cy += card_h + 4.0 * scale;
        }
    }

    // 5. Footer Modal
    let ftr_y = bottom - 22.0 * scale;
    text::draw_text(
        gpu,
        "Alarm Aktif (Chime H-30m, H-15m, H-10m, H-5m, & Saat Mulai)",
        left + 14.0 * scale,
        ftr_y + 2.0 * scale,
        9.0 * scale,
        DWRITE_FONT_WEIGHT(400),
        dim,
        card_w - 90.0 * scale,
        14.0 * scale,
    )?;

    // Tombol Test Bel
    let test_x = right - 76.0 * scale;
    let test_w = 62.0 * scale;
    let test_h = 18.0 * scale;
    let test_rect = D2D1_ROUNDED_RECT {
        rect: D2D_RECT_F { left: test_x, top: ftr_y, right: test_x + test_w, bottom: ftr_y + test_h },
        radiusX: 5.0 * scale,
        radiusY: 5.0 * scale,
    };
    unsafe {
        let test_bg = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.12 }, None)?;
        gpu.dc.FillRoundedRectangle(&test_rect, &test_bg);
    }
    text::draw_text(gpu, "🔔 Test Bel", test_x + 6.0 * scale, ftr_y + 3.0 * scale, 9.0 * scale, DWRITE_FONT_WEIGHT(600), white, 50.0 * scale, 12.0 * scale)?;

    Ok(())
}

pub fn hit_test_close(shape: &NotchShape, x: f32, y: f32, scale: f32) -> bool {
    let right = shape.center_x + shape.width / 2.0 - 16.0 * scale;
    let close_x = right - 18.0 * scale;
    let close_y = 24.0 * scale;
    let dist = ((x - close_x).powi(2) + (y - close_y).powi(2)).sqrt();
    dist <= 16.0 * scale
}
