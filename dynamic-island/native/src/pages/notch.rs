//! Bentuk kapsul Dynamic Island: kotak hitam menyatu dengan bezel atas,
//! sudut bawah membulat, plus "telinga" konkaf kiri-kanan (mirip `.mn::before/::after`).

use windows::core::Result;
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows_numerics::Vector2;

use crate::ui::renderer::Gpu;

/// Geometri kapsul dalam piksel fisik.
#[derive(Clone, Copy, Debug)]
pub struct NotchShape {
    pub center_x: f32,
    pub width: f32,
    pub height: f32,
    pub radius: f32,
    pub ear: f32,
}

fn pt(x: f32, y: f32) -> Vector2 {
    Vector2 { X: x, Y: y }
}

fn arc(sink: &ID2D1GeometrySink, to: Vector2, r: f32, dir: D2D1_SWEEP_DIRECTION) {
    unsafe {
        sink.AddArc(&D2D1_ARC_SEGMENT {
            point: to,
            size: D2D_SIZE_F { width: r, height: r },
            rotationAngle: 0.0,
            sweepDirection: dir,
            arcSize: D2D1_ARC_SIZE_SMALL,
        });
    }
}

pub fn build_geometry(gpu: &Gpu, s: &NotchShape) -> Result<ID2D1PathGeometry> {
    let left = s.center_x - s.width / 2.0;
    let right = s.center_x + s.width / 2.0;
    let r = s.radius.min(s.height / 2.0).min(s.width / 2.0).max(0.0);
    let e = s.ear.min(s.height).max(0.0);
    unsafe {
        let geo = gpu.d2d_factory.CreatePathGeometry()?;
        let sink = geo.Open()?;
        sink.BeginFigure(pt(left - e, 0.0), D2D1_FIGURE_BEGIN_FILLED);
        if e > 0.0 {
            // Telinga konkaf kiri: dari bezel menyapu masuk ke sisi kiri kapsul
            arc(&sink, pt(left, e), e, D2D1_SWEEP_DIRECTION_CLOCKWISE);
        }
        sink.AddLine(pt(left, s.height - r));
        arc(&sink, pt(left + r, s.height), r, D2D1_SWEEP_DIRECTION_COUNTER_CLOCKWISE);
        sink.AddLine(pt(right - r, s.height));
        arc(&sink, pt(right, s.height - r), r, D2D1_SWEEP_DIRECTION_COUNTER_CLOCKWISE);
        sink.AddLine(pt(right, e));
        if e > 0.0 {
            arc(&sink, pt(right + e, 0.0), e, D2D1_SWEEP_DIRECTION_CLOCKWISE);
        }
        sink.EndFigure(D2D1_FIGURE_END_CLOSED);
        sink.Close()?;
        Ok(geo.into())
    }
}

pub fn draw(gpu: &Gpu, s: &NotchShape) -> Result<()> {
    let geo = build_geometry(gpu, s)?;
    let black = gpu.brush(0.0, 0.0, 0.0, 1.0)?;
    unsafe {
        gpu.dc.FillGeometry(&geo, &black, None);
    }
    Ok(())
}

/// Titik uji apakah (x, y) berada di dalam kotak kapsul (tanpa telinga).
pub fn contains(s: &NotchShape, x: f32, y: f32, margin: f32) -> bool {
    x >= s.center_x - s.width / 2.0 - margin
        && x <= s.center_x + s.width / 2.0 + margin
        && y >= -margin
        && y <= s.height + margin
}
