//! Ikon Vektor Native Direct2D (Play, Pause, Next, Prev, Battery, Charging, Volume).

use windows::core::Result;
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows_numerics::Vector2;

use crate::ui::renderer::Gpu;

pub fn draw_play(gpu: &Gpu, x: f32, y: f32, size: f32, color: D2D1_COLOR_F) -> Result<()> {
    unsafe {
        let geo = gpu.d2d_factory.CreatePathGeometry()?;
        let sink = geo.Open()?;
        sink.BeginFigure(
            Vector2 { X: x - size * 0.4, Y: y - size * 0.5 },
            D2D1_FIGURE_BEGIN_FILLED,
        );
        sink.AddLine(Vector2 { X: x + size * 0.5, Y: y });
        sink.AddLine(Vector2 { X: x - size * 0.4, Y: y + size * 0.5 });
        sink.EndFigure(D2D1_FIGURE_END_CLOSED);
        sink.Close()?;

        let brush = gpu.dc.CreateSolidColorBrush(&color, None)?;
        gpu.dc.FillGeometry(&geo, &brush, None);
    }
    Ok(())
}

pub fn draw_pause(gpu: &Gpu, x: f32, y: f32, size: f32, color: D2D1_COLOR_F) -> Result<()> {
    unsafe {
        let brush = gpu.dc.CreateSolidColorBrush(&color, None)?;
        let bar_w = size * 0.28;
        let bar_h = size * 0.9;
        let gap = size * 0.24;

        let left_r = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: x - gap - bar_w,
                top: y - bar_h / 2.0,
                right: x - gap,
                bottom: y + bar_h / 2.0,
            },
            radiusX: bar_w * 0.35,
            radiusY: bar_w * 0.35,
        };
        let right_r = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: x + gap,
                top: y - bar_h / 2.0,
                right: x + gap + bar_w,
                bottom: y + bar_h / 2.0,
            },
            radiusX: bar_w * 0.35,
            radiusY: bar_w * 0.35,
        };

        gpu.dc.FillRoundedRectangle(&left_r, &brush);
        gpu.dc.FillRoundedRectangle(&right_r, &brush);
    }
    Ok(())
}

pub fn draw_next(gpu: &Gpu, x: f32, y: f32, size: f32, color: D2D1_COLOR_F) -> Result<()> {
    draw_play(gpu, x - size * 0.15, y, size * 0.8, color)?;
    unsafe {
        let brush = gpu.dc.CreateSolidColorBrush(&color, None)?;
        let bar = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: x + size * 0.35,
                top: y - size * 0.4,
                right: x + size * 0.5,
                bottom: y + size * 0.4,
            },
            radiusX: 1.0,
            radiusY: 1.0,
        };
        gpu.dc.FillRoundedRectangle(&bar, &brush);
    }
    Ok(())
}

pub fn draw_prev(gpu: &Gpu, x: f32, y: f32, size: f32, color: D2D1_COLOR_F) -> Result<()> {
    unsafe {
        let geo = gpu.d2d_factory.CreatePathGeometry()?;
        let sink = geo.Open()?;
        sink.BeginFigure(
            Vector2 { X: x + size * 0.25, Y: y - size * 0.4 },
            D2D1_FIGURE_BEGIN_FILLED,
        );
        sink.AddLine(Vector2 { X: x - size * 0.35, Y: y });
        sink.AddLine(Vector2 { X: x + size * 0.25, Y: y + size * 0.4 });
        sink.EndFigure(D2D1_FIGURE_END_CLOSED);
        sink.Close()?;

        let brush = gpu.dc.CreateSolidColorBrush(&color, None)?;
        gpu.dc.FillGeometry(&geo, &brush, None);

        let bar = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: x - size * 0.5,
                top: y - size * 0.4,
                right: x - size * 0.35,
                bottom: y + size * 0.4,
            },
            radiusX: 1.0,
            radiusY: 1.0,
        };
        gpu.dc.FillRoundedRectangle(&bar, &brush);
    }
    Ok(())
}

pub fn draw_battery(
    gpu: &Gpu,
    x: f32,
    y: f32,
    percent: u8,
    charging: bool,
    scale: f32,
) -> Result<()> {
    let w = 22.0 * scale;
    let h = 11.0 * scale;
    let border_color = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.85 };
    let fill_color = if percent < 20 {
        D2D1_COLOR_F { r: 1.0, g: 0.28, b: 0.32, a: 0.95 }
    } else if charging {
        D2D1_COLOR_F { r: 0.2, g: 0.85, b: 0.42, a: 0.95 }
    } else {
        D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.9 }
    };

    unsafe {
        let border_brush = gpu.dc.CreateSolidColorBrush(&border_color, None)?;
        let fill_brush = gpu.dc.CreateSolidColorBrush(&fill_color, None)?;

        // Body pil baterai
        let outer = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: x,
                top: y,
                right: x + w,
                bottom: y + h,
            },
            radiusX: 3.0 * scale,
            radiusY: 3.0 * scale,
        };
        gpu.dc.DrawRoundedRectangle(&outer, &border_brush, 1.2 * scale, None);

        // Nipple / kutub positif baterai
        let nipple = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: x + w + 1.0 * scale,
                top: y + h * 0.28,
                right: x + w + 2.5 * scale,
                bottom: y + h * 0.72,
            },
            radiusX: 1.0 * scale,
            radiusY: 1.0 * scale,
        };
        gpu.dc.FillRoundedRectangle(&nipple, &border_brush);

        // Isi level baterai
        let max_inner_w = (w - 4.0 * scale).max(0.0);
        let inner_w = max_inner_w * (percent.min(100) as f32 / 100.0);
        if inner_w > 1.0 {
            let inner = D2D1_ROUNDED_RECT {
                rect: D2D_RECT_F {
                    left: x + 2.0 * scale,
                    top: y + 2.0 * scale,
                    right: x + 2.0 * scale + inner_w,
                    bottom: y + h - 2.0 * scale,
                },
                radiusX: 1.5 * scale,
                radiusY: 1.5 * scale,
            };
            gpu.dc.FillRoundedRectangle(&inner, &fill_brush);
        }
    }
    Ok(())
}

pub fn draw_chevron_left(gpu: &Gpu, x: f32, y: f32, size: f32, color: D2D1_COLOR_F) -> Result<()> {
    unsafe {
        let geo = gpu.d2d_factory.CreatePathGeometry()?;
        let sink = geo.Open()?;
        sink.BeginFigure(
            Vector2 { X: x + size * 0.25, Y: y - size * 0.45 },
            D2D1_FIGURE_BEGIN_HOLLOW,
        );
        sink.AddLine(Vector2 { X: x - size * 0.35, Y: y });
        sink.AddLine(Vector2 { X: x + size * 0.25, Y: y + size * 0.45 });
        sink.EndFigure(D2D1_FIGURE_END_OPEN);
        sink.Close()?;

        let brush = gpu.dc.CreateSolidColorBrush(&color, None)?;
        gpu.dc.DrawGeometry(&geo, &brush, 2.2, None);
    }
    Ok(())
}

pub fn draw_chevron_right(gpu: &Gpu, x: f32, y: f32, size: f32, color: D2D1_COLOR_F) -> Result<()> {
    unsafe {
        let geo = gpu.d2d_factory.CreatePathGeometry()?;
        let sink = geo.Open()?;
        sink.BeginFigure(
            Vector2 { X: x - size * 0.25, Y: y - size * 0.45 },
            D2D1_FIGURE_BEGIN_HOLLOW,
        );
        sink.AddLine(Vector2 { X: x + size * 0.35, Y: y });
        sink.AddLine(Vector2 { X: x - size * 0.25, Y: y + size * 0.45 });
        sink.EndFigure(D2D1_FIGURE_END_OPEN);
        sink.Close()?;

        let brush = gpu.dc.CreateSolidColorBrush(&color, None)?;
        gpu.dc.DrawGeometry(&geo, &brush, 2.2, None);
    }
    Ok(())
}

pub fn draw_chevron_up(gpu: &Gpu, x: f32, y: f32, size: f32, color: D2D1_COLOR_F) -> Result<()> {
    unsafe {
        let geo = gpu.d2d_factory.CreatePathGeometry()?;
        let sink = geo.Open()?;
        sink.BeginFigure(
            Vector2 { X: x - size * 0.45, Y: y + size * 0.25 },
            D2D1_FIGURE_BEGIN_HOLLOW,
        );
        sink.AddLine(Vector2 { X: x, Y: y - size * 0.35 });
        sink.AddLine(Vector2 { X: x + size * 0.45, Y: y + size * 0.25 });
        sink.EndFigure(D2D1_FIGURE_END_OPEN);
        sink.Close()?;

        let brush = gpu.dc.CreateSolidColorBrush(&color, None)?;
        gpu.dc.DrawGeometry(&geo, &brush, 2.0, None);
    }
    Ok(())
}

pub fn draw_pin(gpu: &Gpu, x: f32, y: f32, size: f32, color: D2D1_COLOR_F) -> Result<()> {
    unsafe {
        let brush = gpu.dc.CreateSolidColorBrush(&color, None)?;
        // Pin head
        let head = D2D1_ELLIPSE {
            point: Vector2 { X: x, Y: y - size * 0.2 },
            radiusX: size * 0.35,
            radiusY: size * 0.35,
        };
        gpu.dc.FillEllipse(&head, &brush);
        // Pin needle
        gpu.dc.DrawLine(
            Vector2 { X: x, Y: y },
            Vector2 { X: x, Y: y + size * 0.45 },
            &brush,
            1.8,
            None,
        );
    }
    Ok(())
}

pub fn draw_bolt(gpu: &Gpu, x: f32, y: f32, size: f32, color: D2D1_COLOR_F) -> Result<()> {
    unsafe {
        let geo = gpu.d2d_factory.CreatePathGeometry()?;
        let sink = geo.Open()?;
        sink.BeginFigure(
            Vector2 { X: x + size * 0.15, Y: y - size * 0.5 },
            D2D1_FIGURE_BEGIN_FILLED,
        );
        sink.AddLine(Vector2 { X: x - size * 0.45, Y: y + size * 0.05 });
        sink.AddLine(Vector2 { X: x - size * 0.05, Y: y + size * 0.05 });
        sink.AddLine(Vector2 { X: x - size * 0.2, Y: y + size * 0.5 });
        sink.AddLine(Vector2 { X: x + size * 0.45, Y: y - size * 0.05 });
        sink.AddLine(Vector2 { X: x + size * 0.05, Y: y - size * 0.05 });
        sink.EndFigure(D2D1_FIGURE_END_CLOSED);
        sink.Close()?;

        let brush = gpu.dc.CreateSolidColorBrush(&color, None)?;
        gpu.dc.FillGeometry(&geo, &brush, None);
    }
    Ok(())
}

pub fn draw_lyrics_bubble(gpu: &Gpu, x: f32, y: f32, size: f32, color: D2D1_COLOR_F) -> Result<()> {
    unsafe {
        let brush = gpu.dc.CreateSolidColorBrush(&color, None)?;
        // Bubble rounded body
        let bubble = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: x - size * 0.5,
                top: y - size * 0.4,
                right: x + size * 0.5,
                bottom: y + size * 0.3,
            },
            radiusX: size * 0.25,
            radiusY: size * 0.25,
        };
        gpu.dc.DrawRoundedRectangle(&bubble, &brush, 1.4, None);

        // Dua titik lirik di dalam bubble
        let d1 = D2D1_ELLIPSE {
            point: Vector2 { X: x - size * 0.2, Y: y - size * 0.05 },
            radiusX: size * 0.09,
            radiusY: size * 0.09,
        };
        let d2 = D2D1_ELLIPSE {
            point: Vector2 { X: x + size * 0.2, Y: y - size * 0.05 },
            radiusX: size * 0.09,
            radiusY: size * 0.09,
        };
        gpu.dc.FillEllipse(&d1, &brush);
        gpu.dc.FillEllipse(&d2, &brush);
    }
    Ok(())
}
