//! Halaman Riwayat Papan Klip / Clipboard History (Direct2D UI).

use windows::core::Result;
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows::Win32::Graphics::DirectWrite::DWRITE_FONT_WEIGHT;

use crate::pages::notch::NotchShape;
use crate::services::clipboard::{ClipboardItem, ContentType};
use crate::ui::renderer::Gpu;
use crate::ui::text;

pub fn draw_clipboard_page(
    gpu: &Gpu,
    shape: &NotchShape,
    items: &[ClipboardItem],
    scale: f32,
) -> Result<()> {
    let left = shape.center_x - shape.width / 2.0;

    let white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    let sub_color = D2D1_COLOR_F { r: 0.8, g: 0.85, b: 0.95, a: 0.65 };
    let card_bg = D2D1_COLOR_F { r: 0.08, g: 0.12, b: 0.18, a: 0.7 };
    let card_border = D2D1_COLOR_F { r: 0.2, g: 0.3, b: 0.45, a: 0.35 };

    let type_text_color = D2D1_COLOR_F { r: 0.2, g: 0.7, b: 1.0, a: 1.0 };
    let type_code_color = D2D1_COLOR_F { r: 0.75, g: 0.45, b: 1.0, a: 1.0 };
    let type_url_color = D2D1_COLOR_F { r: 0.2, g: 0.85, b: 0.6, a: 1.0 };

    let mut item_y = 38.0 * scale;
    let card_w = shape.width - 88.0 * scale;
    let card_x = left + 44.0 * scale;
    let card_h = 36.0 * scale;

    if items.is_empty() {
        text::draw_text(
            gpu,
            "Papan klip masih kosong. Salin teks untuk melihat riwayat.",
            card_x,
            item_y + 30.0 * scale,
            12.5 * scale,
            DWRITE_FONT_WEIGHT(400),
            sub_color,
            card_w,
            20.0 * scale,
        )?;
        return Ok(());
    }

    for item in items.iter().take(3) {
        let card_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: card_x,
                top: item_y,
                right: card_x + card_w,
                bottom: item_y + card_h,
            },
            radiusX: 7.0 * scale,
            radiusY: 7.0 * scale,
        };

        unsafe {
            let bg_brush = gpu.dc.CreateSolidColorBrush(&card_bg, None)?;
            gpu.dc.FillRoundedRectangle(&card_rect, &bg_brush);
            let bdr_brush = gpu.dc.CreateSolidColorBrush(&card_border, None)?;
            gpu.dc.DrawRoundedRectangle(&card_rect, &bdr_brush, 1.0 * scale, None);
        }

        let (tag_str, tag_color) = match item.content_type {
            ContentType::Text => ("TEKS", type_text_color),
            ContentType::Code => ("KODE", type_code_color),
            ContentType::Url => ("LINK", type_url_color),
            _ => ("ITEM", type_text_color),
        };

        // Badge tipe
        text::draw_text(
            gpu,
            tag_str,
            card_x + 12.0 * scale,
            item_y + 10.0 * scale,
            9.5 * scale,
            DWRITE_FONT_WEIGHT(700),
            tag_color,
            38.0 * scale,
            14.0 * scale,
        )?;

        // Preview Teks
        let preview = item.preview.replace('\n', " ").replace('\r', "");
        text::draw_text(
            gpu,
            &preview,
            card_x + 54.0 * scale,
            item_y + 10.0 * scale,
            11.5 * scale,
            DWRITE_FONT_WEIGHT(400),
            white,
            card_w - 68.0 * scale,
            16.0 * scale,
        )?;

        item_y += card_h + 6.0 * scale;
    }

    Ok(())
}
