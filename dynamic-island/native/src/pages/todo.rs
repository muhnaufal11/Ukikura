//! Halaman LMS Todolist & Deadline Countdown (Direct2D UI).

use windows::core::Result;
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows::Win32::Graphics::DirectWrite::DWRITE_FONT_WEIGHT;

use crate::pages::notch::NotchShape;
use crate::services::vault::LmsTask;
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

    let white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.95 };
    let sub_color = D2D1_COLOR_F { r: 0.75, g: 0.8, b: 0.9, a: 0.65 };
    let dim_color = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.3 };
    let card_bg = D2D1_COLOR_F { r: 0.08, g: 0.12, b: 0.18, a: 0.7 };
    let card_border = D2D1_COLOR_F { r: 0.2, g: 0.3, b: 0.45, a: 0.35 };
    let green_done = D2D1_COLOR_F { r: 0.2, g: 0.85, b: 0.45, a: 1.0 };

    let mut filtered_tasks: Vec<&LmsTask> = if filter_active_only {
        tasks.iter().filter(|t| !t.is_done).collect()
    } else {
        tasks.iter().collect()
    };

    // Urutkan berdasarkan deadline terdekat
    filtered_tasks.sort_by_key(|t| t.due_timestamp.unwrap_or(i64::MAX));

    let mut item_y = 38.0 * scale;
    let card_w = shape.width - 88.0 * scale;
    let card_x = left + 44.0 * scale;
    let card_h = 36.0 * scale;
    let max_display = 3;

    if filtered_tasks.is_empty() {
        text::draw_text(
            gpu,
            "Semua tugas LMS selesai! Santai sejenak.",
            card_x,
            item_y + 30.0 * scale,
            13.0 * scale,
            DWRITE_FONT_WEIGHT(400),
            sub_color,
            card_w,
            20.0 * scale,
        )?;
        return Ok(());
    }

    for task in filtered_tasks.iter().take(max_display) {
        let card_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: card_x,
                top: item_y,
                right: card_x + card_w,
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
            let chk_x = card_x + 16.0 * scale;
            let chk_y = item_y + card_h / 2.0;
            let chk_ellipse = D2D1_ELLIPSE {
                point: windows_numerics::Vector2 { X: chk_x, Y: chk_y },
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
        let text_x = card_x + 32.0 * scale;
        let title_color = if task.is_done { dim_color } else { white };
        let max_title_w = card_w - 140.0 * scale;

        text::draw_text(
            gpu,
            &task.title,
            text_x,
            item_y + 4.0 * scale,
            12.0 * scale,
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
            9.5 * scale,
            DWRITE_FONT_WEIGHT(400),
            sub_color,
            max_title_w,
            13.0 * scale,
        )?;

        // Badge Deadline
        let (dl_text, dl_color) = format_deadline(task.due_timestamp);
        let dl_w = 90.0 * scale;
        let dl_x = card_x + card_w - dl_w - 8.0 * scale;

        text::draw_text(
            gpu,
            &dl_text,
            dl_x,
            item_y + 10.0 * scale,
            11.0 * scale,
            DWRITE_FONT_WEIGHT(600),
            dl_color,
            dl_w,
            16.0 * scale,
        )?;

        item_y += card_h + 6.0 * scale;
    }

    Ok(())
}
