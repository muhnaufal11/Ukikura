//! Halaman 2: Baterai Multi-Perangkat (Laptop, HP, Audio TWS, Mouse) & Daftar Notifikasi WA.
//! Desain 100% identik dengan .l-notif, .bat-card, dan .notif-card di pages-media-notif.css.

use windows::core::Result;
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows::Win32::Graphics::DirectWrite::DWRITE_FONT_WEIGHT;

use crate::pages::notch::NotchShape;
use crate::services::power::PowerStatus;
use crate::ui::renderer::Gpu;
use crate::ui::text;

#[derive(Clone, Debug)]
pub struct NotifItem {
    pub id: String,
    pub app: String,
    pub sender: String,
    pub message: String,
    pub time_str: String,
    pub is_wa: bool,
}

pub fn draw_notif_page(
    gpu: &Gpu,
    shape: &NotchShape,
    power: &PowerStatus,
    notifs: &[NotifItem],
    scale: f32,
) -> Result<()> {
    let left = shape.center_x - shape.width / 2.0;
    let right = shape.center_x + shape.width / 2.0;

    let white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    let dim_white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.65 };
    let green = D2D1_COLOR_F { r: 0.20, g: 0.88, b: 0.48, a: 1.0 };
    let blue = D2D1_COLOR_F { r: 0.37, g: 0.76, b: 1.0, a: 1.0 };
    let purple = D2D1_COLOR_F { r: 0.77, g: 0.71, b: 0.99, a: 1.0 };
    let skyblue = D2D1_COLOR_F { r: 0.22, g: 0.74, b: 0.97, a: 1.0 };

    let card_bg = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.07 };
    let border_color = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.10 };

    unsafe {
        let card_brush = gpu.dc.CreateSolidColorBrush(&card_bg, None)?;
        let border_brush = gpu.dc.CreateSolidColorBrush(&border_color, None)?;

        // ================= 1. PANEL KIRI: 4 KARTU BATERAI =================
        let col_x = left + 44.0 * scale;
        let col_w = 136.0 * scale;
        let mut cur_y = 38.0 * scale;
        let card_h = 24.0 * scale;

        // A. Kartu Laptop
        let lap_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: col_x,
                top: cur_y,
                right: col_x + col_w,
                bottom: cur_y + card_h,
            },
            radiusX: 6.0 * scale,
            radiusY: 6.0 * scale,
        };
        gpu.dc.FillRoundedRectangle(&lap_rect, &card_brush);
        gpu.dc.DrawRoundedRectangle(&lap_rect, &border_brush, 1.0, None);

        // Ikon Laptop & Label
        text::draw_text(gpu, "💻 Laptop", col_x + 8.0 * scale, cur_y + 4.0 * scale, 10.5 * scale, DWRITE_FONT_WEIGHT(600), white, 75.0 * scale, 15.0 * scale)?;
        let lap_pct_str = format!("{}%", power.battery_percent);
        text::draw_text(gpu, &lap_pct_str, col_x + 88.0 * scale, cur_y + 4.0 * scale, 11.0 * scale, DWRITE_FONT_WEIGHT(700), green, 40.0 * scale, 15.0 * scale)?;
        cur_y += card_h + 4.0 * scale;

        // B. Kartu Baterai HP
        let phone_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: col_x,
                top: cur_y,
                right: col_x + col_w,
                bottom: cur_y + card_h,
            },
            radiusX: 6.0 * scale,
            radiusY: 6.0 * scale,
        };
        gpu.dc.FillRoundedRectangle(&phone_rect, &card_brush);
        gpu.dc.DrawRoundedRectangle(&phone_rect, &border_brush, 1.0, None);
        text::draw_text(gpu, "📱 Baterai HP", col_x + 8.0 * scale, cur_y + 4.0 * scale, 10.5 * scale, DWRITE_FONT_WEIGHT(600), white, 75.0 * scale, 15.0 * scale)?;
        text::draw_text(gpu, "Link", col_x + 92.0 * scale, cur_y + 4.0 * scale, 11.0 * scale, DWRITE_FONT_WEIGHT(700), blue, 36.0 * scale, 15.0 * scale)?;
        cur_y += card_h + 4.0 * scale;

        // C. Kartu TWS / Audio
        let audio_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: col_x,
                top: cur_y,
                right: col_x + col_w,
                bottom: cur_y + card_h,
            },
            radiusX: 6.0 * scale,
            radiusY: 6.0 * scale,
        };
        gpu.dc.FillRoundedRectangle(&audio_rect, &card_brush);
        gpu.dc.DrawRoundedRectangle(&audio_rect, &border_brush, 1.0, None);
        text::draw_text(gpu, "🎧 TWS Audio", col_x + 8.0 * scale, cur_y + 4.0 * scale, 10.5 * scale, DWRITE_FONT_WEIGHT(600), white, 75.0 * scale, 15.0 * scale)?;
        text::draw_text(gpu, "BT", col_x + 98.0 * scale, cur_y + 4.0 * scale, 11.0 * scale, DWRITE_FONT_WEIGHT(700), purple, 30.0 * scale, 15.0 * scale)?;
        cur_y += card_h + 4.0 * scale;

        // D. Kartu Mouse / Periferal
        let periph_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: col_x,
                top: cur_y,
                right: col_x + col_w,
                bottom: cur_y + card_h,
            },
            radiusX: 6.0 * scale,
            radiusY: 6.0 * scale,
        };
        gpu.dc.FillRoundedRectangle(&periph_rect, &card_brush);
        gpu.dc.DrawRoundedRectangle(&periph_rect, &border_brush, 1.0, None);
        text::draw_text(gpu, "🖱️ Periferal", col_x + 8.0 * scale, cur_y + 4.0 * scale, 10.5 * scale, DWRITE_FONT_WEIGHT(600), white, 75.0 * scale, 15.0 * scale)?;
        text::draw_text(gpu, "ON", col_x + 98.0 * scale, cur_y + 4.0 * scale, 11.0 * scale, DWRITE_FONT_WEIGHT(700), skyblue, 30.0 * scale, 15.0 * scale)?;
        cur_y += card_h + 7.0 * scale;

        // Tombol WA & HP Link di Bawah Kolom Kiri
        let btn_w = 66.0 * scale;
        let btn_h = 22.0 * scale;
        let btn_wa_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: col_x,
                top: cur_y,
                right: col_x + btn_w,
                bottom: cur_y + btn_h,
            },
            radiusX: 11.0 * scale,
            radiusY: 11.0 * scale,
        };
        let wa_brush = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 0.15, g: 0.83, b: 0.40, a: 0.22 }, None)?;
        gpu.dc.FillRoundedRectangle(&btn_wa_rect, &wa_brush);
        text::draw_text(gpu, "💬 WA", col_x + 12.0 * scale, cur_y + 3.0 * scale, 10.0 * scale, DWRITE_FONT_WEIGHT(700), D2D1_COLOR_F { r: 0.20, g: 0.88, b: 0.48, a: 1.0 }, 44.0 * scale, 15.0 * scale)?;

        let btn_hp_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: col_x + btn_w + 4.0 * scale,
                top: cur_y,
                right: col_x + col_w,
                bottom: cur_y + btn_h,
            },
            radiusX: 11.0 * scale,
            radiusY: 11.0 * scale,
        };
        let hp_brush = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 0.22, g: 0.74, b: 0.97, a: 0.18 }, None)?;
        gpu.dc.FillRoundedRectangle(&btn_hp_rect, &hp_brush);
        text::draw_text(gpu, "🔗 HP", col_x + btn_w + 14.0 * scale, cur_y + 3.0 * scale, 10.0 * scale, DWRITE_FONT_WEIGHT(700), skyblue, 44.0 * scale, 15.0 * scale)?;

        // ================= 2. PANEL KANAN: DAFTAR NOTIFIKASI =================
        let list_x = col_x + col_w + 12.0 * scale;
        let list_w = right - 44.0 * scale - list_x;
        let mut notif_y = 38.0 * scale;
        let notif_h = 36.0 * scale;

        if notifs.is_empty() {
            let empty_rect = D2D1_ROUNDED_RECT {
                rect: D2D_RECT_F {
                    left: list_x,
                    top: notif_y,
                    right: list_x + list_w,
                    bottom: notif_y + 118.0 * scale,
                },
                radiusX: 10.0 * scale,
                radiusY: 10.0 * scale,
            };
            gpu.dc.FillRoundedRectangle(&empty_rect, &card_brush);
            gpu.dc.DrawRoundedRectangle(&empty_rect, &border_brush, 1.0, None);
            text::draw_text(gpu, "Belum ada notifikasi baru", list_x + 16.0 * scale, notif_y + 44.0 * scale, 12.5 * scale, DWRITE_FONT_WEIGHT(600), white, list_w - 32.0 * scale, 20.0 * scale)?;
            text::draw_text(gpu, "Pesan WhatsApp & notifikasi HP akan muncul di sini", list_x + 16.0 * scale, notif_y + 66.0 * scale, 10.5 * scale, DWRITE_FONT_WEIGHT(400), dim_white, list_w - 32.0 * scale, 20.0 * scale)?;
        } else {
            for item in notifs.iter().take(3) {
                let item_rect = D2D1_ROUNDED_RECT {
                    rect: D2D_RECT_F {
                        left: list_x,
                        top: notif_y,
                        right: list_x + list_w,
                        bottom: notif_y + notif_h,
                    },
                    radiusX: 8.0 * scale,
                    radiusY: 8.0 * scale,
                };
                gpu.dc.FillRoundedRectangle(&item_rect, &card_brush);
                gpu.dc.DrawRoundedRectangle(&item_rect, &border_brush, 1.0, None);

                let dot_color = if item.is_wa { green } else { blue };
                let dot_brush = gpu.dc.CreateSolidColorBrush(&dot_color, None)?;
                let dot_rect = D2D1_ROUNDED_RECT {
                    rect: D2D_RECT_F {
                        left: list_x + 10.0 * scale,
                        top: notif_y + 12.0 * scale,
                        right: list_x + 18.0 * scale,
                        bottom: notif_y + 20.0 * scale,
                    },
                    radiusX: 4.0 * scale,
                    radiusY: 4.0 * scale,
                };
                gpu.dc.FillRoundedRectangle(&dot_rect, &dot_brush);

                text::draw_text(gpu, &item.sender, list_x + 24.0 * scale, notif_y + 4.0 * scale, 11.5 * scale, DWRITE_FONT_WEIGHT(600), white, list_w - 70.0 * scale, 14.0 * scale)?;
                text::draw_text(gpu, &item.time_str, list_x + list_w - 44.0 * scale, notif_y + 4.0 * scale, 9.5 * scale, DWRITE_FONT_WEIGHT(400), dim_white, 40.0 * scale, 14.0 * scale)?;
                text::draw_text(gpu, &item.message, list_x + 24.0 * scale, notif_y + 19.0 * scale, 10.0 * scale, DWRITE_FONT_WEIGHT(400), dim_white, list_w - 32.0 * scale, 14.0 * scale)?;

                notif_y += notif_h + 5.0 * scale;
            }
        }
    }

    Ok(())
}
