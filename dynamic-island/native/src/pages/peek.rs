//! Peek Popup Notifikasi & HUD (WhatsApp, Phone Link, Charger/Baterai, Volume).

use std::time::Instant;
use windows::core::Result;
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::DirectWrite::DWRITE_FONT_WEIGHT;

use crate::pages::notch::NotchShape;
use crate::ui::renderer::Gpu;
use crate::ui::text;

#[allow(dead_code)]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PeekType {
    WhatsApp,
    PhoneLink,
    Battery,
    Volume,
    LmsAlert,
}

#[derive(Clone, Debug)]
pub struct PeekNotification {
    pub peek_type: PeekType,
    pub title: String,
    pub message: String,
    pub show_until: Instant,
}

impl PeekNotification {
    pub fn new(peek_type: PeekType, title: &str, message: &str, duration_ms: u64) -> Self {
        Self {
            peek_type,
            title: title.to_string(),
            message: message.to_string(),
            show_until: Instant::now() + std::time::Duration::from_millis(duration_ms),
        }
    }

    pub fn is_expired(&self) -> bool {
        Instant::now() >= self.show_until
    }
}

pub fn draw_peek(
    gpu: &Gpu,
    shape: &NotchShape,
    peek: &PeekNotification,
    scale: f32,
) -> Result<()> {
    let cx = shape.center_x;
    let card_w = (shape.width - 24.0 * scale).min(320.0 * scale);
    let card_x = cx - card_w / 2.0;

    let (icon_color, tag_str) = match peek.peek_type {
        PeekType::WhatsApp => (D2D1_COLOR_F { r: 0.15, g: 0.85, b: 0.45, a: 1.0 }, "WhatsApp"),
        PeekType::PhoneLink => (D2D1_COLOR_F { r: 0.2, g: 0.65, b: 1.0, a: 1.0 }, "Ponsel"),
        PeekType::Battery => (D2D1_COLOR_F { r: 0.3, g: 0.85, b: 0.4, a: 1.0 }, "Daya"),
        PeekType::Volume => (D2D1_COLOR_F { r: 0.2, g: 0.75, b: 1.0, a: 1.0 }, "Volume"),
        PeekType::LmsAlert => (D2D1_COLOR_F { r: 1.0, g: 0.45, b: 0.2, a: 1.0 }, "LMS Deadline"),
    };

    let white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.95 };
    let sub = D2D1_COLOR_F { r: 0.85, g: 0.9, b: 1.0, a: 0.7 };

    // Tag aplikasi di baris atas
    text::draw_text(
        gpu,
        tag_str,
        card_x + 8.0 * scale,
        3.0 * scale,
        9.5 * scale,
        DWRITE_FONT_WEIGHT(700),
        icon_color,
        60.0 * scale,
        12.0 * scale,
    )?;

    // Judul / Pengirim
    text::draw_text(
        gpu,
        &peek.title,
        card_x + 68.0 * scale,
        2.0 * scale,
        11.0 * scale,
        DWRITE_FONT_WEIGHT(600),
        white,
        card_w - 74.0 * scale,
        14.0 * scale,
    )?;

    // Isi pesan / keterangan
    text::draw_text(
        gpu,
        &peek.message,
        card_x + 8.0 * scale,
        14.0 * scale,
        10.0 * scale,
        DWRITE_FONT_WEIGHT(400),
        sub,
        card_w - 16.0 * scale,
        13.0 * scale,
    )?;

    Ok(())
}
