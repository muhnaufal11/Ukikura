//! Halaman LMS Todolist & Deadline Countdown (Direct2D UI 2-Kolom Khas Nusa).

use windows::core::Result;
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows::Win32::Graphics::DirectWrite::DWRITE_FONT_WEIGHT;
use windows_numerics::Vector2;

use crate::pages::notch::NotchShape;
use crate::services::vault::LmsTask;
use crate::ui::icons;
use crate::ui::renderer::Gpu;
use crate::ui::text;

fn format_deadline(due_ms: Option<i64>) -> (String, D2D1_COLOR_F) {
    let due = match due_ms {
        Some(t) => t,
        None => return ("Tanpa batas".into(), D2D1_COLOR_F { r: 0.6, g: 0.65, b: 0.75, a: 0.8 }),
    };

    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let diff_ms = due - now_ms;
    if diff_ms < 0 {
        return ("Terlewat".into(), D2D1_COLOR_F { r: 1.0, g: 0.3, b: 0.35, a: 0.95 });
    }

    let diff_hours = diff_ms / (1000 * 3600);
    let diff_days = diff_hours / 24;

    if diff_hours < 5 {
        (format!("{} jam lagi!", diff_hours.max(1)), D2D1_COLOR_F { r: 1.0, g: 0.25, b: 0.3, a: 1.0 })
    } else if diff_hours < 24 {
        (format!("{} jam lagi", diff_hours), D2D1_COLOR_F { r: 1.0, g: 0.55, b: 0.2, a: 1.0 })
    } else if diff_days == 1 {
        ("Besok".into(), D2D1_COLOR_F { r: 1.0, g: 0.75, b: 0.2, a: 1.0 })
    } else {
        (format!("{} hari lagi", diff_days), D2D1_COLOR_F { r: 0.25, g: 0.85, b: 0.5, a: 0.95 })
    }
}

pub fn draw_todo_page(
    gpu: &Gpu,
    shape: &NotchShape,
    tasks: &[LmsTask],
    filter_active_only: bool,
    scale: f32,
) -> Result<()> {
    let left = shape.center_x - shape.width / 2.0;
    let right = shape.center_x + shape.width / 2.0;

    let white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.95 };
    let sub_color = D2D1_COLOR_F { r: 0.75, g: 0.8, b: 0.9, a: 0.65 };
    let dim_color = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.3 };
    let cyan = D2D1_COLOR_F { r: 0.37, g: 0.76, b: 1.0, a: 1.0 };
    let green_done = D2D1_COLOR_F { r: 0.2, g: 0.85, b: 0.45, a: 1.0 };

    let done_count = tasks.iter().filter(|t| t.is_done).count();
    let total_count = tasks.len();

    // ================= 1. KOLOM KIRI (left: 44px, width: 132px) =================
    let col1_x = left + 44.0 * scale;
    let col1_top = 38.0 * scale;

    // Rasio Besar (e.g. "0/0" atau "3/5")
    let ratio_str = format!("{}/{}", done_count, total_count);
    text::draw_text(
        gpu,
        &ratio_str,
        col1_x,
        col1_top,
        28.0 * scale,
        DWRITE_FONT_WEIGHT(800),
        white,
        120.0 * scale,
        32.0 * scale,
    )?;

    // Sub-text "Tugas Selesai"
    text::draw_text(
        gpu,
        "Tugas Selesai",
        col1_x,
        col1_top + 30.0 * scale,
        11.0 * scale,
        DWRITE_FONT_WEIGHT(400),
        sub_color,
        120.0 * scale,
        16.0 * scale,
    )?;

    // 5 Filter Chips: Aktif, Mendesak, Tugas, Kuis, Selesai
    let chips = ["Aktif", "Mendesak", "Tugas", "Kuis", "Selesai"];
    let mut chip_x = col1_x;
    let mut chip_y = col1_top + 48.0 * scale;

    for (i, chip) in chips.iter().enumerate() {
        let is_active = (i == 0 && filter_active_only) || (i == 0 && !filter_active_only);
        let chip_w = if i == 1 { 50.0 * scale } else { 38.0 * scale };
        let chip_h = 16.0 * scale;

        if chip_x + chip_w > col1_x + 132.0 * scale {
            chip_x = col1_x;
            chip_y += chip_h + 3.5 * scale;
        }

        let chip_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: chip_x,
                top: chip_y,
                right: chip_x + chip_w,
                bottom: chip_y + chip_h,
            },
            radiusX: 8.0 * scale,
            radiusY: 8.0 * scale,
        };

        unsafe {
            let bg_col = if is_active && i == 0 {
                D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.95 }
            } else {
                D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.09 }
            };
            let chip_brush = gpu.dc.CreateSolidColorBrush(&bg_col, None)?;
            gpu.dc.FillRoundedRectangle(&chip_rect, &chip_brush);
        }

        let text_col = if is_active && i == 0 {
            D2D1_COLOR_F { r: 0.05, g: 0.05, b: 0.08, a: 1.0 }
        } else {
            sub_color
        };
        text::draw_text(
            gpu,
            chip,
            chip_x + 4.0 * scale,
            chip_y + 2.0 * scale,
            9.0 * scale,
            DWRITE_FONT_WEIGHT(600),
            text_col,
            chip_w - 6.0 * scale,
            12.0 * scale,
        )?;

        chip_x += chip_w + 3.5 * scale;
    }

    // Tombol Aksi Bawah Kolom Kiri: [Courses] [🔔] [AI]
    let btn_y = shape.height - 34.0 * scale;

    // Courses Button
    let btn1_rect = D2D1_ROUNDED_RECT {
        rect: D2D_RECT_F { left: col1_x, top: btn_y, right: col1_x + 48.0 * scale, bottom: btn_y + 22.0 * scale },
        radiusX: 6.0 * scale,
        radiusY: 6.0 * scale,
    };
    unsafe {
        let b1 = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.12 }, None)?;
        gpu.dc.FillRoundedRectangle(&btn1_rect, &b1);
    }
    text::draw_text(gpu, "Courses", col1_x + 6.0 * scale, btn_y + 4.5 * scale, 9.0 * scale, DWRITE_FONT_WEIGHT(600), white, 40.0 * scale, 14.0 * scale)?;

    // Sound Bell Button (Icon Pill 22x22)
    let bell_btn_x = col1_x + 52.0 * scale;
    let btn2_rect = D2D1_ROUNDED_RECT {
        rect: D2D_RECT_F { left: bell_btn_x, top: btn_y, right: bell_btn_x + 22.0 * scale, bottom: btn_y + 22.0 * scale },
        radiusX: 6.0 * scale,
        radiusY: 6.0 * scale,
    };
    unsafe {
        let b2 = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.12 }, None)?;
        gpu.dc.FillRoundedRectangle(&btn2_rect, &b2);
    }
    let _ = icons::draw_bell_icon(gpu, bell_btn_x + 11.0 * scale, btn_y + 11.0 * scale, 10.0 * scale, white);

    // AI Button (Primary Blue)
    let ai_btn_x = col1_x + 78.0 * scale;
    let btn3_rect = D2D1_ROUNDED_RECT {
        rect: D2D_RECT_F { left: ai_btn_x, top: btn_y, right: ai_btn_x + 54.0 * scale, bottom: btn_y + 22.0 * scale },
        radiusX: 6.0 * scale,
        radiusY: 6.0 * scale,
    };
    unsafe {
        let b3 = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 0.15, g: 0.45, b: 0.95, a: 0.95 }, None)?;
        gpu.dc.FillRoundedRectangle(&btn3_rect, &b3);
    }
    text::draw_text(gpu, "✨ AI", ai_btn_x + 12.0 * scale, btn_y + 4.5 * scale, 9.5 * scale, DWRITE_FONT_WEIGHT(700), white, 36.0 * scale, 14.0 * scale)?;

    // ================= 2. KOLOM KANAN: DAFTAR TUGAS (left: 184px, right: 42px) =================
    let col2_x = left + 184.0 * scale;
    let card_w = right - 42.0 * scale - col2_x;
    let card_h = 36.0 * scale;
    let card_bg = D2D1_COLOR_F { r: 0.08, g: 0.12, b: 0.18, a: 0.7 };
    let card_border = D2D1_COLOR_F { r: 0.2, g: 0.3, b: 0.45, a: 0.35 };

    let mut filtered_tasks: Vec<&LmsTask> = if filter_active_only {
        tasks.iter().filter(|t| !t.is_done).collect()
    } else {
        tasks.iter().collect()
    };
    filtered_tasks.sort_by_key(|t| t.due_timestamp.unwrap_or(i64::MAX));

    let mut item_y = 36.0 * scale;
    if filtered_tasks.is_empty() {
        text::draw_text(
            gpu,
            "Semua tugas LMS selesai! Santai sejenak.",
            col2_x,
            item_y + 24.0 * scale,
            12.5 * scale,
            DWRITE_FONT_WEIGHT(400),
            sub_color,
            card_w,
            20.0 * scale,
        )?;
        return Ok(());
    }

    for task in filtered_tasks.iter().take(3) {
        let card_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: col2_x,
                top: item_y,
                right: col2_x + card_w,
                bottom: item_y + card_h,
            },
            radiusX: 8.0 * scale,
            radiusY: 8.0 * scale,
        };

        unsafe {
            let bg_brush = gpu.dc.CreateSolidColorBrush(&card_bg, None)?;
            gpu.dc.FillRoundedRectangle(&card_rect, &bg_brush);
            let bdr_brush = gpu.dc.CreateSolidColorBrush(&card_border, None)?;
            gpu.dc.DrawRoundedRectangle(&card_rect, &bdr_brush, 1.0 * scale, None);

            // Checkbox circle
            let chk_x = col2_x + 16.0 * scale;
            let chk_y = item_y + card_h / 2.0;
            let chk_ellipse = D2D1_ELLIPSE {
                point: Vector2 { X: chk_x, Y: chk_y },
                radiusX: 7.5 * scale,
                radiusY: 7.5 * scale,
            };

            if task.is_done {
                let fill_chk = gpu.dc.CreateSolidColorBrush(&green_done, None)?;
                gpu.dc.FillEllipse(&chk_ellipse, &fill_chk);
            } else {
                let empty_chk = gpu.dc.CreateSolidColorBrush(&dim_color, None)?;
                gpu.dc.DrawEllipse(&chk_ellipse, &empty_chk, 1.4 * scale, None);
            }
        }

        // Teks Judul & Mata Kuliah
        let text_x = col2_x + 32.0 * scale;
        let title_color = if task.is_done { dim_color } else { white };
        let max_title_w = card_w - 110.0 * scale;

        text::draw_text(
            gpu,
            &task.title,
            text_x,
            item_y + 4.0 * scale,
            11.5 * scale,
            DWRITE_FONT_WEIGHT(if task.is_done { 400 } else { 600 }),
            title_color,
            max_title_w,
            16.0 * scale,
        )?;

        text::draw_text(
            gpu,
            &task.course_name,
            text_x,
            item_y + 19.0 * scale,
            9.0 * scale,
            DWRITE_FONT_WEIGHT(400),
            cyan,
            max_title_w,
            13.0 * scale,
        )?;

        // Badge Deadline
        let (dl_text, dl_color) = format_deadline(task.due_timestamp);
        let dl_w = 80.0 * scale;
        let dl_x = col2_x + card_w - dl_w - 6.0 * scale;

        text::draw_text(
            gpu,
            &dl_text,
            dl_x,
            item_y + 10.0 * scale,
            10.5 * scale,
            DWRITE_FONT_WEIGHT(600),
            dl_color,
            dl_w,
            16.0 * scale,
        )?;

        item_y += card_h + 5.0 * scale;
    }

    Ok(())
}
