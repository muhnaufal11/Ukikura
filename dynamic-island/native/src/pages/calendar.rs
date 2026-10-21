//! Halaman Smart Calendar & Agenda Deadline (Direct2D UI).

use windows::core::Result;
use windows::Win32::Foundation::SYSTEMTIME;
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows::Win32::Graphics::DirectWrite::DWRITE_FONT_WEIGHT;
use windows::Win32::System::SystemInformation::GetLocalTime;

use crate::pages::notch::NotchShape;
use crate::services::vault::LmsTask;
use crate::ui::renderer::Gpu;
use crate::ui::text;

pub fn draw_calendar_page(
    gpu: &Gpu,
    shape: &NotchShape,
    tasks: &[LmsTask],
    scale: f32,
) -> Result<()> {
    let left = shape.center_x - shape.width / 2.0;
    let right = shape.center_x + shape.width / 2.0;

    let white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    let sub_color = D2D1_COLOR_F { r: 0.8, g: 0.85, b: 0.95, a: 0.65 };
    let accent_cyan = D2D1_COLOR_F { r: 0.2, g: 0.75, b: 1.0, a: 1.0 };

    let st: SYSTEMTIME = unsafe { GetLocalTime() };
    let today_day = st.wDay as usize;

    let grid_x = left + 46.0 * scale;
    let grid_y = 38.0 * scale;
    let cell_w = 23.0 * scale;

    // Hari dalam seminggu header
    let days_hdr = ["M", "S", "S", "R", "K", "J", "S"];
    for (i, d) in days_hdr.iter().enumerate() {
        text::draw_text(
            gpu,
            d,
            grid_x + (i as f32 * cell_w),
            grid_y,
            10.5 * scale,
            DWRITE_FONT_WEIGHT(700),
            sub_color,
            cell_w,
            14.0 * scale,
        )?;
    }

    // Grid tanggal sederhana
    let mut row_y = grid_y + 16.0 * scale;
    let start_col = (st.wDayOfWeek as usize + 35 - today_day % 7) % 7;

    for d in 1..=31 {
        let col = (start_col + d - 1) % 7;
        let cell_x = grid_x + (col as f32 * cell_w);

        let is_today = d == today_day;

        if is_today {
            let circle = D2D1_ELLIPSE {
                point: windows_numerics::Vector2 { X: cell_x + 7.0 * scale, Y: row_y + 6.0 * scale },
                radiusX: 8.0 * scale,
                radiusY: 8.0 * scale,
            };
            unsafe {
                let fill = gpu.dc.CreateSolidColorBrush(&accent_cyan, None)?;
                gpu.dc.FillEllipse(&circle, &fill);
            }
        }

        let d_str = format!("{}", d);
        let color = if is_today {
            D2D1_COLOR_F { r: 0.05, g: 0.05, b: 0.05, a: 1.0 }
        } else {
            white
        };

        text::draw_text(
            gpu,
            &d_str,
            cell_x + (if d < 10 { 3.5 } else { 1.0 }) * scale,
            row_y,
            10.0 * scale,
            DWRITE_FONT_WEIGHT(if is_today { 700 } else { 400 }),
            color,
            cell_w,
            13.0 * scale,
        )?;

        if col == 6 {
            row_y += 16.0 * scale;
            if row_y > 150.0 * scale {
                break;
            }
        }
    }

    // Panel sebelah kanan: Agenda Deadline Terdekat
    let agenda_x = left + 225.0 * scale;
    let agenda_w = right - agenda_x - 36.0 * scale;

    text::draw_text(
        gpu,
        "Agenda Kuliah & Tugas",
        agenda_x,
        38.0 * scale,
        12.0 * scale,
        DWRITE_FONT_WEIGHT(700),
        accent_cyan,
        agenda_w,
        16.0 * scale,
    )?;

    let mut ag_y = 58.0 * scale;
    let active_tasks: Vec<&LmsTask> = tasks.iter().filter(|t| !t.is_done).take(3).collect();

    if active_tasks.is_empty() {
        text::draw_text(
            gpu,
            "Tidak ada deadline dalam waktu dekat.",
            agenda_x,
            ag_y + 10.0 * scale,
            11.0 * scale,
            DWRITE_FONT_WEIGHT(400),
            sub_color,
            agenda_w,
            15.0 * scale,
        )?;
    } else {
        for t in active_tasks {
            text::draw_text(
                gpu,
                &t.title,
                agenda_x,
                ag_y,
                11.0 * scale,
                DWRITE_FONT_WEIGHT(600),
                white,
                agenda_w,
                15.0 * scale,
            )?;
            text::draw_text(
                gpu,
                &t.course_name,
                agenda_x,
                ag_y + 14.0 * scale,
                9.5 * scale,
                DWRITE_FONT_WEIGHT(400),
                sub_color,
                agenda_w,
                13.0 * scale,
            )?;
            ag_y += 32.0 * scale;
        }
    }

    Ok(())
}
