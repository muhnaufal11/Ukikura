//! Bilah Header, Panah Navigasi & Titik Halaman Khas Nusa 1.0.6 (Direct2D UI).

use windows::core::Result;
use windows::Win32::Foundation::SYSTEMTIME;
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows::Win32::Graphics::DirectWrite::DWRITE_FONT_WEIGHT;
use windows::Win32::System::SystemInformation::GetLocalTime;
use windows_numerics::Vector2;

use crate::pages::notch::NotchShape;
use crate::services::power::PowerStatus;
use crate::ui::icons;
use crate::ui::renderer::Gpu;
use crate::ui::text;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AppPage {
    Music,
    Notif,
    Todo,
    Calendar,
    Pomodoro,
    Shelf,
    Config,
}

pub const ALL_PAGES: [AppPage; 7] = [
    AppPage::Music,
    AppPage::Notif,
    AppPage::Todo,
    AppPage::Calendar,
    AppPage::Pomodoro,
    AppPage::Shelf,
    AppPage::Config,
];

pub fn next_page(current: AppPage) -> AppPage {
    match current {
        AppPage::Music => AppPage::Notif,
        AppPage::Notif => AppPage::Todo,
        AppPage::Todo => AppPage::Calendar,
        AppPage::Calendar => AppPage::Pomodoro,
        AppPage::Pomodoro => AppPage::Shelf,
        AppPage::Shelf => AppPage::Config,
        AppPage::Config => AppPage::Music,
    }
}

pub fn prev_page(current: AppPage) -> AppPage {
    match current {
        AppPage::Music => AppPage::Config,
        AppPage::Notif => AppPage::Music,
        AppPage::Todo => AppPage::Notif,
        AppPage::Calendar => AppPage::Todo,
        AppPage::Pomodoro => AppPage::Calendar,
        AppPage::Shelf => AppPage::Pomodoro,
        AppPage::Config => AppPage::Shelf,
    }
}

pub fn current_date_time_str() -> (String, String) {
    let st: SYSTEMTIME = unsafe { GetLocalTime() };
    let days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let day_name = days.get(st.wDayOfWeek as usize).unwrap_or(&"Mon");
    let month_name = months.get(st.wMonth.saturating_sub(1) as usize).unwrap_or(&"Jan");
    let date_str = format!("{} {} {}", day_name, st.wDay, month_name);
    let time_str = format!("{:02}:{:02}", st.wHour, st.wMinute);
    (date_str, time_str)
}

/// Menggambar Bilah Header Atas (.hdr-bar) Khas Nusa
pub fn draw_header(
    gpu: &Gpu,
    shape: &NotchShape,
    page: AppPage,
    power: &PowerStatus,
    pinned: bool,
    scale: f32,
) -> Result<()> {
    let left = shape.center_x - shape.width / 2.0;
    let right = shape.center_x + shape.width / 2.0;
    let hdr_y = 10.0 * scale;

    let white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    let dim_white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.72 };
    let cyan = D2D1_COLOR_F { r: 0.37, g: 0.76, b: 1.0, a: 1.0 };
    let emerald = D2D1_COLOR_F { r: 0.20, g: 0.88, b: 0.48, a: 1.0 };
    let indigo = D2D1_COLOR_F { r: 0.37, g: 0.53, b: 1.0, a: 1.0 };
    let amber = D2D1_COLOR_F { r: 1.0, g: 0.72, b: 0.30, a: 1.0 };
    let violet = D2D1_COLOR_F { r: 0.70, g: 0.40, b: 1.0, a: 1.0 };

    // 1. Judul Kiri (.hdr-title)
    let (t1, t2, c2) = match page {
        AppPage::Music => ("Now", "Playing", cyan),
        AppPage::Notif => ("Phone", "& WA", emerald),
        AppPage::Todo => ("LMS", "Tasks", emerald),
        AppPage::Calendar => ("Smart", "Calendar", indigo),
        AppPage::Pomodoro => ("Deadline", "Timer", amber),
        AppPage::Shelf => ("File", "Shelf", cyan),
        AppPage::Config => ("LMS", "Sync", violet),
    };

    let title_x = left + 20.0 * scale;
    text::draw_text(
        gpu,
        t1,
        title_x,
        hdr_y + 1.0 * scale,
        13.5 * scale,
        DWRITE_FONT_WEIGHT(700),
        white,
        60.0 * scale,
        18.0 * scale,
    )?;

    // Offset t2 bergantung panjang t1
    let t1_w = if t1.len() <= 3 { 30.0 * scale } else { 62.0 * scale };
    text::draw_text(
        gpu,
        t2,
        title_x + t1_w,
        hdr_y + 1.0 * scale,
        13.5 * scale,
        DWRITE_FONT_WEIGHT(700),
        c2,
        80.0 * scale,
        18.0 * scale,
    )?;

    // 2. Tengah (.hdr-center): Baterai Laptop + Tanggal & Jam
    let (date_str, time_str) = current_date_time_str();
    let cx = shape.center_x;

    // Pil Baterai
    let bat_w = 44.0 * scale;
    let bat_h = 16.0 * scale;
    let bat_x = cx - 74.0 * scale;
    let bat_y = hdr_y + 2.0 * scale;

    let bat_rect = D2D1_ROUNDED_RECT {
        rect: D2D_RECT_F {
            left: bat_x,
            top: bat_y,
            right: bat_x + bat_w,
            bottom: bat_y + bat_h,
        },
        radiusX: 8.0 * scale,
        radiusY: 8.0 * scale,
    };

    unsafe {
        let bat_bg = if power.ac_online {
            gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 0.2, g: 0.88, b: 0.48, a: 0.22 }, None)?
        } else {
            gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.10 }, None)?
        };
        gpu.dc.FillRoundedRectangle(&bat_rect, &bat_bg);
    }

    if power.ac_online {
        let bolt_color = D2D1_COLOR_F { r: 0.37, g: 0.95, b: 0.58, a: 1.0 };
        let _ = icons::draw_bolt(gpu, bat_x + 9.0 * scale, bat_y + 8.0 * scale, 8.0 * scale, bolt_color);
    }

    let bat_pct_str = format!("{}%", power.battery_percent);
    let bat_text_x = if power.ac_online { bat_x + 16.0 * scale } else { bat_x + 6.0 * scale };
    let bat_text_color = if power.ac_online {
        D2D1_COLOR_F { r: 0.37, g: 0.95, b: 0.58, a: 1.0 }
    } else {
        white
    };
    text::draw_text(
        gpu,
        &bat_pct_str,
        bat_text_x,
        bat_y + 1.5 * scale,
        9.5 * scale,
        DWRITE_FONT_WEIGHT(700),
        bat_text_color,
        30.0 * scale,
        14.0 * scale,
    )?;

    // Tanggal
    text::draw_text(
        gpu,
        &date_str,
        cx - 24.0 * scale,
        hdr_y + 2.5 * scale,
        10.5 * scale,
        DWRITE_FONT_WEIGHT(400),
        dim_white,
        74.0 * scale,
        16.0 * scale,
    )?;

    // Jam (Tebal)
    text::draw_text(
        gpu,
        &time_str,
        cx + 52.0 * scale,
        hdr_y + 2.0 * scale,
        11.5 * scale,
        DWRITE_FONT_WEIGHT(700),
        white,
        42.0 * scale,
        16.0 * scale,
    )?;

    // 3. Kanan (.hdr-actions): WA, Sync, Login, Sound, Pin, Tuck (6 Tombol Bulat Khas Nusa)
    let btn_y = hdr_y + 10.0 * scale;
    let btn_r = 9.5 * scale;
    let btn_bg_normal = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.12 };
    let _wa_green = D2D1_COLOR_F { r: 0.15, g: 0.83, b: 0.40, a: 1.0 };

    let tuck_x = right - 20.0 * scale;
    let pin_x = right - 44.0 * scale;
    let sound_x = right - 68.0 * scale;
    let login_x = right - 92.0 * scale;
    let sync_x = right - 116.0 * scale;
    let wa_x = right - 140.0 * scale;

    unsafe {
        let bg_brush = gpu.dc.CreateSolidColorBrush(&btn_bg_normal, None)?;

        // 3a. WhatsApp Quick
        let wa_circle = D2D1_ELLIPSE { point: Vector2 { X: wa_x, Y: btn_y }, radiusX: btn_r, radiusY: btn_r };
        gpu.dc.FillEllipse(&wa_circle, &bg_brush);
        let _ = icons::draw_wa_icon(gpu, wa_x, btn_y, 11.0 * scale, white);

        // 3b. Sync LMS
        let sync_circle = D2D1_ELLIPSE { point: Vector2 { X: sync_x, Y: btn_y }, radiusX: btn_r, radiusY: btn_r };
        gpu.dc.FillEllipse(&sync_circle, &bg_brush);
        let _ = icons::draw_sync_icon(gpu, sync_x, btn_y, 11.0 * scale, white);

        // 3c. Login LMS
        let login_circle = D2D1_ELLIPSE { point: Vector2 { X: login_x, Y: btn_y }, radiusX: btn_r, radiusY: btn_r };
        gpu.dc.FillEllipse(&login_circle, &bg_brush);
        let _ = icons::draw_key_icon(gpu, login_x, btn_y, 11.0 * scale, white);

        // 3d. Sound Modal Bell
        let sound_circle = D2D1_ELLIPSE { point: Vector2 { X: sound_x, Y: btn_y }, radiusX: btn_r, radiusY: btn_r };
        gpu.dc.FillEllipse(&sound_circle, &bg_brush);
        let _ = icons::draw_bell_icon(gpu, sound_x, btn_y, 11.0 * scale, white);

        // 3e. Pin
        let pin_bg_color = if pinned {
            D2D1_COLOR_F { r: 0.18, g: 0.36, b: 1.0, a: 0.95 }
        } else {
            btn_bg_normal
        };
        let pin_brush = gpu.dc.CreateSolidColorBrush(&pin_bg_color, None)?;
        let pin_circle = D2D1_ELLIPSE { point: Vector2 { X: pin_x, Y: btn_y }, radiusX: btn_r, radiusY: btn_r };
        gpu.dc.FillEllipse(&pin_circle, &pin_brush);
        let _ = icons::draw_pin(gpu, pin_x, btn_y, 11.0 * scale, white);

        // 3f. Tuck
        let tuck_circle = D2D1_ELLIPSE { point: Vector2 { X: tuck_x, Y: btn_y }, radiusX: btn_r, radiusY: btn_r };
        gpu.dc.FillEllipse(&tuck_circle, &bg_brush);
        let _ = icons::draw_chevron_up(gpu, tuck_x, btn_y, 11.0 * scale, white);
    }

    Ok(())
}

/// Menggambar Panah Navigasi Kiri & Kanan (.arw) Khas Nusa
pub fn draw_nav_arrows(gpu: &Gpu, shape: &NotchShape, scale: f32) -> Result<()> {
    let left = shape.center_x - shape.width / 2.0;
    let right = shape.center_x + shape.width / 2.0;
    let cy = 98.0 * scale;
    let r = 11.0 * scale;

    let bg_color = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.22 };
    let white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.95 };

    unsafe {
        let bg_brush = gpu.dc.CreateSolidColorBrush(&bg_color, None)?;

        // Left button
        let left_c = D2D1_ELLIPSE {
            point: Vector2 { X: left + 21.0 * scale, Y: cy },
            radiusX: r,
            radiusY: r,
        };
        gpu.dc.FillEllipse(&left_c, &bg_brush);

        // Right button
        let right_c = D2D1_ELLIPSE {
            point: Vector2 { X: right - 21.0 * scale, Y: cy },
            radiusX: r,
            radiusY: r,
        };
        gpu.dc.FillEllipse(&right_c, &bg_brush);
    }

    icons::draw_chevron_left(gpu, left + 21.0 * scale, cy, 9.0 * scale, white)?;
    icons::draw_chevron_right(gpu, right - 21.0 * scale, cy, 9.0 * scale, white)?;

    Ok(())
}

/// Menggambar Titik Halaman Bawah (.dots) Khas Nusa
pub fn draw_pagination_dots(
    gpu: &Gpu,
    shape: &NotchShape,
    active_page: AppPage,
    scale: f32,
) -> Result<()> {
    let cx = shape.center_x;
    let dot_y = shape.height - 12.0 * scale;

    let dot_w_active = 16.0 * scale;
    let dot_w_inactive = 4.0 * scale;
    let dot_h = 4.0 * scale;
    let gap = 5.0 * scale;

    // Hitung total lebar semua dots untuk penengahan sempurna
    let mut total_w = 0.0;
    for page in ALL_PAGES.iter() {
        if *page == active_page {
            total_w += dot_w_active;
        } else {
            total_w += dot_w_inactive;
        }
    }
    total_w += gap * (ALL_PAGES.len() - 1) as f32;

    let mut start_x = cx - total_w / 2.0;

    let white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    let dim = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.42 };

    unsafe {
        let white_brush = gpu.dc.CreateSolidColorBrush(&white, None)?;
        let dim_brush = gpu.dc.CreateSolidColorBrush(&dim, None)?;

        for page in ALL_PAGES.iter() {
            let is_active = *page == active_page;
            let w = if is_active { dot_w_active } else { dot_w_inactive };
            let r = D2D1_ROUNDED_RECT {
                rect: D2D_RECT_F {
                    left: start_x,
                    top: dot_y - dot_h / 2.0,
                    right: start_x + w,
                    bottom: dot_y + dot_h / 2.0,
                },
                radiusX: 2.0 * scale,
                radiusY: 2.0 * scale,
            };

            if is_active {
                gpu.dc.FillRoundedRectangle(&r, &white_brush);
            } else {
                gpu.dc.FillRoundedRectangle(&r, &dim_brush);
            }

            start_x += w + gap;
        }
    }

    Ok(())
}

pub fn hit_test_prev_arrow(shape: &NotchShape, x: f32, y: f32, scale: f32) -> bool {
    let left = shape.center_x - shape.width / 2.0;
    let btn_x = left + 21.0 * scale;
    let btn_y = 98.0 * scale;
    let dist = ((x - btn_x).powi(2) + (y - btn_y).powi(2)).sqrt();
    dist <= 18.0 * scale
}

pub fn hit_test_next_arrow(shape: &NotchShape, x: f32, y: f32, scale: f32) -> bool {
    let right = shape.center_x + shape.width / 2.0;
    let btn_x = right - 21.0 * scale;
    let btn_y = 98.0 * scale;
    let dist = ((x - btn_x).powi(2) + (y - btn_y).powi(2)).sqrt();
    dist <= 18.0 * scale
}

pub fn hit_test_pin(shape: &NotchShape, x: f32, y: f32, scale: f32) -> bool {
    let right = shape.center_x + shape.width / 2.0;
    let btn_x = right - 44.0 * scale;
    let btn_y = 20.0 * scale;
    let dist = ((x - btn_x).powi(2) + (y - btn_y).powi(2)).sqrt();
    dist <= 14.0 * scale
}

pub fn hit_test_tuck(shape: &NotchShape, x: f32, y: f32, scale: f32) -> bool {
    let right = shape.center_x + shape.width / 2.0;
    let btn_x = right - 20.0 * scale;
    let btn_y = 20.0 * scale;
    let dist = ((x - btn_x).powi(2) + (y - btn_y).powi(2)).sqrt();
    dist <= 14.0 * scale
}

pub fn hit_test_sound(shape: &NotchShape, x: f32, y: f32, scale: f32) -> bool {
    let right = shape.center_x + shape.width / 2.0;
    let btn_x = right - 68.0 * scale;
    let btn_y = 20.0 * scale;
    let dist = ((x - btn_x).powi(2) + (y - btn_y).powi(2)).sqrt();
    dist <= 14.0 * scale
}

pub fn hit_test_login(shape: &NotchShape, x: f32, y: f32, scale: f32) -> bool {
    let right = shape.center_x + shape.width / 2.0;
    let btn_x = right - 92.0 * scale;
    let btn_y = 20.0 * scale;
    let dist = ((x - btn_x).powi(2) + (y - btn_y).powi(2)).sqrt();
    dist <= 14.0 * scale
}

pub fn hit_test_sync(shape: &NotchShape, x: f32, y: f32, scale: f32) -> bool {
    let right = shape.center_x + shape.width / 2.0;
    let btn_x = right - 116.0 * scale;
    let btn_y = 20.0 * scale;
    let dist = ((x - btn_x).powi(2) + (y - btn_y).powi(2)).sqrt();
    dist <= 14.0 * scale
}

pub fn hit_test_wa_quick(shape: &NotchShape, x: f32, y: f32, scale: f32) -> bool {
    let right = shape.center_x + shape.width / 2.0;
    let btn_x = right - 140.0 * scale;
    let btn_y = 20.0 * scale;
    let dist = ((x - btn_x).powi(2) + (y - btn_y).powi(2)).sqrt();
    dist <= 14.0 * scale
}

pub fn hit_test_dot(shape: &NotchShape, x: f32, y: f32, active_page: AppPage, scale: f32) -> Option<AppPage> {
    let dot_y = shape.height - 12.0 * scale;
    if (y - dot_y).abs() > 14.0 * scale {
        return None;
    }

    let cx = shape.center_x;
    let dot_w_active = 16.0 * scale;
    let dot_w_inactive = 4.0 * scale;
    let gap = 5.0 * scale;

    let mut total_w = 0.0;
    for page in ALL_PAGES.iter() {
        if *page == active_page {
            total_w += dot_w_active;
        } else {
            total_w += dot_w_inactive;
        }
    }
    total_w += gap * (ALL_PAGES.len() - 1) as f32;

    let mut cur_x = cx - total_w / 2.0;
    for page in ALL_PAGES.iter() {
        let is_active = *page == active_page;
        let w = if is_active { dot_w_active } else { dot_w_inactive };
        if x >= cur_x - 3.0 * scale && x <= cur_x + w + 3.0 * scale {
            return Some(*page);
        }
        cur_x += w + gap;
    }

    None
}
