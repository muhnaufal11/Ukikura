//! Halaman 6: Nusa File Shelf (Island Gulp Canvas) & Clipboard History Vault.
//! Desain 100% identik dengan .l-shelf, .shelf-tabs-bar, .shelf-cards, dan .clip-list.

use windows::core::Result;
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows::Win32::Graphics::DirectWrite::DWRITE_FONT_WEIGHT;

use crate::pages::notch::NotchShape;
use crate::services::clipboard::ClipboardItem;
use crate::ui::renderer::Gpu;
use crate::ui::text;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ShelfTab {
    Files,
    Clipboard,
}

#[derive(Clone, Debug)]
pub struct ShelfFile {
    pub name: String,
    pub size_str: String,
    pub path: String,
}

pub fn draw_shelf_page(
    gpu: &Gpu,
    shape: &NotchShape,
    active_tab: ShelfTab,
    files: &[ShelfFile],
    clipboard: &[ClipboardItem],
    scale: f32,
) -> Result<()> {
    let left = shape.center_x - shape.width / 2.0;
    let right = shape.center_x + shape.width / 2.0;
    let cx = shape.center_x;

    let white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    let dim_white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.65 };
    let cyan = D2D1_COLOR_F { r: 0.37, g: 0.76, b: 1.0, a: 1.0 };
    let card_bg = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.07 };
    let border_color = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.12 };

    unsafe {
        let card_brush = gpu.dc.CreateSolidColorBrush(&card_bg, None)?;
        let border_brush = gpu.dc.CreateSolidColorBrush(&border_color, None)?;

        // ================= 1. TAB BAR ATAS =================
        let tab_bar_y = 38.0 * scale;
        let tab_w = 98.0 * scale;
        let tab_h = 24.0 * scale;

        // Tab File Shelf
        let t1_x = left + 44.0 * scale;
        let t1_active = active_tab == ShelfTab::Files;
        let t1_bg = if t1_active {
            D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.22 }
        } else {
            D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.06 }
        };
        let t1_brush = gpu.dc.CreateSolidColorBrush(&t1_bg, None)?;
        let t1_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: t1_x,
                top: tab_bar_y,
                right: t1_x + tab_w,
                bottom: tab_bar_y + tab_h,
            },
            radiusX: 12.0 * scale,
            radiusY: 12.0 * scale,
        };
        gpu.dc.FillRoundedRectangle(&t1_rect, &t1_brush);
        let t1_text = format!("📁 File ({})", files.len());
        text::draw_text(gpu, &t1_text, t1_x + 10.0 * scale, tab_bar_y + 4.0 * scale, 10.5 * scale, DWRITE_FONT_WEIGHT(600), white, tab_w - 20.0 * scale, 15.0 * scale)?;

        // Tab Clipboard
        let t2_x = t1_x + tab_w + 6.0 * scale;
        let t2_active = active_tab == ShelfTab::Clipboard;
        let t2_bg = if t2_active {
            D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.22 }
        } else {
            D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.06 }
        };
        let t2_brush = gpu.dc.CreateSolidColorBrush(&t2_bg, None)?;
        let t2_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: t2_x,
                top: tab_bar_y,
                right: t2_x + tab_w,
                bottom: tab_bar_y + tab_h,
            },
            radiusX: 12.0 * scale,
            radiusY: 12.0 * scale,
        };
        gpu.dc.FillRoundedRectangle(&t2_rect, &t2_brush);
        let t2_text = format!("📋 Klip ({})", clipboard.len());
        text::draw_text(gpu, &t2_text, t2_x + 10.0 * scale, tab_bar_y + 4.0 * scale, 10.5 * scale, DWRITE_FONT_WEIGHT(600), white, tab_w - 20.0 * scale, 15.0 * scale)?;

        // Hint aksi di kanan
        let hint_text = if active_tab == ShelfTab::Files { "💡 Drag keluar" } else { "💡 Klik untuk salin" };
        text::draw_text(gpu, hint_text, right - 130.0 * scale, tab_bar_y + 4.0 * scale, 10.0 * scale, DWRITE_FONT_WEIGHT(400), dim_white, 86.0 * scale, 15.0 * scale)?;

        // ================= 2. KONTEN SUB-VIEW =================
        let content_y = tab_bar_y + tab_h + 8.0 * scale;
        let content_w = shape.width - 88.0 * scale;

        match active_tab {
            ShelfTab::Files => {
                // Drop zone area
                let zone_rect = D2D1_ROUNDED_RECT {
                    rect: D2D_RECT_F {
                        left: left + 44.0 * scale,
                        top: content_y,
                        right: right - 44.0 * scale,
                        bottom: content_y + 92.0 * scale,
                    },
                    radiusX: 12.0 * scale,
                    radiusY: 12.0 * scale,
                };
                gpu.dc.FillRoundedRectangle(&zone_rect, &card_brush);
                gpu.dc.DrawRoundedRectangle(&zone_rect, &border_brush, 1.0, None);

                if files.is_empty() {
                    text::draw_text(gpu, "📥 Drop files here", cx - 60.0 * scale, content_y + 28.0 * scale, 13.0 * scale, DWRITE_FONT_WEIGHT(700), white, 120.0 * scale, 18.0 * scale)?;
                    text::draw_text(gpu, "Simpan file sementara · Tarik (drag) keluar ke WA/Browser", cx - 130.0 * scale, content_y + 48.0 * scale, 10.0 * scale, DWRITE_FONT_WEIGHT(400), dim_white, 260.0 * scale, 15.0 * scale)?;
                } else {
                    let mut fx = left + 52.0 * scale;
                    for f in files.iter().take(3) {
                        let f_rect = D2D1_ROUNDED_RECT {
                            rect: D2D_RECT_F {
                                left: fx,
                                top: content_y + 8.0 * scale,
                                right: fx + 118.0 * scale,
                                bottom: content_y + 84.0 * scale,
                            },
                            radiusX: 8.0 * scale,
                            radiusY: 8.0 * scale,
                        };
                        let f_brush = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.12 }, None)?;
                        gpu.dc.FillRoundedRectangle(&f_rect, &f_brush);
                        text::draw_text(gpu, "📄", fx + 46.0 * scale, content_y + 16.0 * scale, 18.0 * scale, DWRITE_FONT_WEIGHT(400), white, 30.0 * scale, 24.0 * scale)?;
                        text::draw_text(gpu, &f.name, fx + 8.0 * scale, content_y + 44.0 * scale, 10.5 * scale, DWRITE_FONT_WEIGHT(600), white, 102.0 * scale, 14.0 * scale)?;
                        text::draw_text(gpu, &f.size_str, fx + 8.0 * scale, content_y + 60.0 * scale, 9.5 * scale, DWRITE_FONT_WEIGHT(400), dim_white, 102.0 * scale, 14.0 * scale)?;
                        fx += 124.0 * scale;
                    }
                }
            }
            ShelfTab::Clipboard => {
                let mut cy = content_y;
                let c_h = 28.0 * scale;

                if clipboard.is_empty() {
                    let empty_rect = D2D1_ROUNDED_RECT {
                        rect: D2D_RECT_F {
                            left: left + 44.0 * scale,
                            top: cy,
                            right: right - 44.0 * scale,
                            bottom: cy + 92.0 * scale,
                        },
                        radiusX: 12.0 * scale,
                        radiusY: 12.0 * scale,
                    };
                    gpu.dc.FillRoundedRectangle(&empty_rect, &card_brush);
                    gpu.dc.DrawRoundedRectangle(&empty_rect, &border_brush, 1.0, None);
                    text::draw_text(gpu, "Belum ada riwayat clipboard tersimpan", cx - 110.0 * scale, cy + 34.0 * scale, 12.0 * scale, DWRITE_FONT_WEIGHT(600), white, 220.0 * scale, 18.0 * scale)?;
                    text::draw_text(gpu, "Salin teks atau link (Ctrl+C) untuk memulai riwayat", cx - 120.0 * scale, cy + 54.0 * scale, 10.0 * scale, DWRITE_FONT_WEIGHT(400), dim_white, 240.0 * scale, 15.0 * scale)?;
                } else {
                    for item in clipboard.iter().take(3) {
                        let c_rect = D2D1_ROUNDED_RECT {
                            rect: D2D_RECT_F {
                                left: left + 44.0 * scale,
                                top: cy,
                                right: right - 44.0 * scale,
                                bottom: cy + c_h,
                            },
                            radiusX: 6.0 * scale,
                            radiusY: 6.0 * scale,
                        };
                        gpu.dc.FillRoundedRectangle(&c_rect, &card_brush);
                        gpu.dc.DrawRoundedRectangle(&c_rect, &border_brush, 1.0, None);

                        text::draw_text(gpu, "📋", left + 52.0 * scale, cy + 6.0 * scale, 11.0 * scale, DWRITE_FONT_WEIGHT(400), cyan, 20.0 * scale, 15.0 * scale)?;
                        text::draw_text(gpu, &item.preview, left + 74.0 * scale, cy + 6.0 * scale, 11.0 * scale, DWRITE_FONT_WEIGHT(500), white, content_w - 60.0 * scale, 16.0 * scale)?;
                        cy += c_h + 4.0 * scale;
                    }
                }
            }
        }
    }

    Ok(())
}
