//! Tipografi & Perender Teks DirectWrite (Segoe UI Variable + CJK Font Fallback).

use windows::core::{w, Result};
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows::Win32::Graphics::DirectWrite::*;
use windows_numerics::Vector2;

use crate::paths;
use crate::ui::renderer::Gpu;

pub fn create_text_format(
    dwrite: &IDWriteFactory,
    size: f32,
    weight: DWRITE_FONT_WEIGHT,
) -> Result<IDWriteTextFormat> {
    unsafe {
        dwrite.CreateTextFormat(
            w!("Segoe UI Variable Text"),
            None,
            weight,
            DWRITE_FONT_STYLE_NORMAL,
            DWRITE_FONT_STRETCH_NORMAL,
            size,
            w!("id-ID"),
        )
    }
}

pub fn draw_text(
    gpu: &Gpu,
    text: &str,
    x: f32,
    y: f32,
    size: f32,
    weight: DWRITE_FONT_WEIGHT,
    color: D2D1_COLOR_F,
    max_w: f32,
    max_h: f32,
) -> Result<()> {
    if text.is_empty() {
        return Ok(());
    }
    unsafe {
        let fmt = create_text_format(&gpu.dwrite, size, weight)?;
        let utf16 = paths::to_wide(text);
        // exclude trailing null for layout
        let text_slice = if utf16.ends_with(&[0]) {
            &utf16[..utf16.len() - 1]
        } else {
            &utf16
        };
        let layout = gpu.dwrite.CreateTextLayout(text_slice, &fmt, max_w, max_h)?;
        let brush = gpu.dc.CreateSolidColorBrush(&color, None)?;
        gpu.dc.DrawTextLayout(
            Vector2 { X: x, Y: y },
            &layout,
            &brush,
            D2D1_DRAW_TEXT_OPTIONS_NONE,
        );
    }
    Ok(())
}
