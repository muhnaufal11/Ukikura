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

pub fn draw_wa_icon(gpu: &Gpu, x: f32, y: f32, size: f32, color: D2D1_COLOR_F) -> Result<()> {
    unsafe {
        let brush = gpu.dc.CreateSolidColorBrush(&color, None)?;
        let bubble = D2D1_ELLIPSE {
            point: Vector2 { X: x, Y: y - size * 0.05 },
            radiusX: size * 0.45,
            radiusY: size * 0.45,
        };
        gpu.dc.DrawEllipse(&bubble, &brush, 1.4, None);

        let geo = gpu.d2d_factory.CreatePathGeometry()?;
        let sink = geo.Open()?;
        sink.BeginFigure(Vector2 { X: x - size * 0.28, Y: y + size * 0.25 }, D2D1_FIGURE_BEGIN_FILLED);
        sink.AddLine(Vector2 { X: x - size * 0.46, Y: y + size * 0.46 });
        sink.AddLine(Vector2 { X: x - size * 0.15, Y: y + size * 0.38 });
        sink.EndFigure(D2D1_FIGURE_END_CLOSED);
        sink.Close()?;
        gpu.dc.FillGeometry(&geo, &brush, None);
    }
    Ok(())
}

pub fn draw_sync_icon(gpu: &Gpu, x: f32, y: f32, size: f32, color: D2D1_COLOR_F) -> Result<()> {
    unsafe {
        let brush = gpu.dc.CreateSolidColorBrush(&color, None)?;
        let r = size * 0.36;
        let arc1 = D2D1_ELLIPSE {
            point: Vector2 { X: x, Y: y },
            radiusX: r,
            radiusY: r,
        };
        gpu.dc.DrawEllipse(&arc1, &brush, 1.4, None);

        // Arrow head top right
        let geo = gpu.d2d_factory.CreatePathGeometry()?;
        let sink = geo.Open()?;
        sink.BeginFigure(Vector2 { X: x + r - size * 0.12, Y: y - size * 0.18 }, D2D1_FIGURE_BEGIN_FILLED);
        sink.AddLine(Vector2 { X: x + r + size * 0.12, Y: y - size * 0.18 });
        sink.AddLine(Vector2 { X: x + r, Y: y - size * 0.02 });
        sink.EndFigure(D2D1_FIGURE_END_CLOSED);
        sink.Close()?;
        gpu.dc.FillGeometry(&geo, &brush, None);
    }
    Ok(())
}

pub fn draw_key_icon(gpu: &Gpu, x: f32, y: f32, size: f32, color: D2D1_COLOR_F) -> Result<()> {
    unsafe {
        let brush = gpu.dc.CreateSolidColorBrush(&color, None)?;
        let ring = D2D1_ELLIPSE {
            point: Vector2 { X: x - size * 0.18, Y: y + size * 0.12 },
            radiusX: size * 0.22,
            radiusY: size * 0.22,
        };
        gpu.dc.DrawEllipse(&ring, &brush, 1.4, None);
        gpu.dc.DrawLine(
            Vector2 { X: x - size * 0.02, Y: y - size * 0.02 },
            Vector2 { X: x + size * 0.42, Y: y - size * 0.42 },
            &brush,
            1.5,
            None,
        );
        gpu.dc.DrawLine(
            Vector2 { X: x + size * 0.25, Y: y - size * 0.25 },
            Vector2 { X: x + size * 0.35, Y: y - size * 0.15 },
            &brush,
            1.5,
            None,
        );
    }
    Ok(())
}

pub fn draw_bell_icon(gpu: &Gpu, x: f32, y: f32, size: f32, color: D2D1_COLOR_F) -> Result<()> {
    unsafe {
        let brush = gpu.dc.CreateSolidColorBrush(&color, None)?;
        let geo = gpu.d2d_factory.CreatePathGeometry()?;
        let sink = geo.Open()?;
        sink.BeginFigure(Vector2 { X: x, Y: y - size * 0.45 }, D2D1_FIGURE_BEGIN_HOLLOW);
        sink.AddArc(&D2D1_ARC_SEGMENT {
            point: Vector2 { X: x + size * 0.36, Y: y + size * 0.2 },
            size: D2D_SIZE_F { width: size * 0.38, height: size * 0.42 },
            rotationAngle: 0.0,
            sweepDirection: D2D1_SWEEP_DIRECTION_CLOCKWISE,
            arcSize: D2D1_ARC_SIZE_SMALL,
        });
        sink.AddLine(Vector2 { X: x - size * 0.36, Y: y + size * 0.2 });
        sink.AddArc(&D2D1_ARC_SEGMENT {
            point: Vector2 { X: x, Y: y - size * 0.45 },
            size: D2D_SIZE_F { width: size * 0.38, height: size * 0.42 },
            rotationAngle: 0.0,
            sweepDirection: D2D1_SWEEP_DIRECTION_CLOCKWISE,
            arcSize: D2D1_ARC_SIZE_SMALL,
        });
        sink.EndFigure(D2D1_FIGURE_END_CLOSED);
        sink.Close()?;
        gpu.dc.DrawGeometry(&geo, &brush, 1.3, None);

        // Clapper bottom dot
        let clapper = D2D1_ELLIPSE {
            point: Vector2 { X: x, Y: y + size * 0.35 },
            radiusX: size * 0.1,
            radiusY: size * 0.1,
        };
        gpu.dc.FillEllipse(&clapper, &brush);
    }
    Ok(())
}

pub fn draw_volume_icon(gpu: &Gpu, x: f32, y: f32, size: f32, color: D2D1_COLOR_F) -> Result<()> {
    unsafe {
        let brush = gpu.dc.CreateSolidColorBrush(&color, None)?;
        let geo = gpu.d2d_factory.CreatePathGeometry()?;
        let sink = geo.Open()?;
        sink.BeginFigure(Vector2 { X: x - size * 0.35, Y: y - size * 0.18 }, D2D1_FIGURE_BEGIN_FILLED);
        sink.AddLine(Vector2 { X: x - size * 0.15, Y: y - size * 0.18 });
        sink.AddLine(Vector2 { X: x + size * 0.12, Y: y - size * 0.4 });
        sink.AddLine(Vector2 { X: x + size * 0.12, Y: y + size * 0.4 });
        sink.AddLine(Vector2 { X: x - size * 0.15, Y: y + size * 0.18 });
        sink.AddLine(Vector2 { X: x - size * 0.35, Y: y + size * 0.18 });
        sink.EndFigure(D2D1_FIGURE_END_CLOSED);
        sink.Close()?;
        gpu.dc.FillGeometry(&geo, &brush, None);

        // Wave arc
        let geo_w = gpu.d2d_factory.CreatePathGeometry()?;
        let sink_w = geo_w.Open()?;
        sink_w.BeginFigure(Vector2 { X: x + size * 0.25, Y: y - size * 0.25 }, D2D1_FIGURE_BEGIN_HOLLOW);
        sink_w.AddArc(&D2D1_ARC_SEGMENT {
            point: Vector2 { X: x + size * 0.25, Y: y + size * 0.25 },
            size: D2D_SIZE_F { width: size * 0.3, height: size * 0.3 },
            rotationAngle: 0.0,
            sweepDirection: D2D1_SWEEP_DIRECTION_CLOCKWISE,
            arcSize: D2D1_ARC_SIZE_SMALL,
        });
        sink_w.EndFigure(D2D1_FIGURE_END_OPEN);
        sink_w.Close()?;
        gpu.dc.DrawGeometry(&geo_w, &brush, 1.4, None);
    }
    Ok(())
}

pub fn draw_mic_icon(gpu: &Gpu, x: f32, y: f32, size: f32, color: D2D1_COLOR_F) -> Result<()> {
    unsafe {
        let brush = gpu.dc.CreateSolidColorBrush(&color, None)?;
        // Pill mic capsule
        let capsule = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: x - size * 0.18,
                top: y - size * 0.45,
                right: x + size * 0.18,
                bottom: y + size * 0.15,
            },
            radiusX: size * 0.18,
            radiusY: size * 0.18,
        };
        gpu.dc.FillRoundedRectangle(&capsule, &brush);

        // Arc holder
        let geo = gpu.d2d_factory.CreatePathGeometry()?;
        let sink = geo.Open()?;
        sink.BeginFigure(Vector2 { X: x - size * 0.32, Y: y - size * 0.05 }, D2D1_FIGURE_BEGIN_HOLLOW);
        sink.AddArc(&D2D1_ARC_SEGMENT {
            point: Vector2 { X: x + size * 0.32, Y: y - size * 0.05 },
            size: D2D_SIZE_F { width: size * 0.32, height: size * 0.32 },
            rotationAngle: 0.0,
            sweepDirection: D2D1_SWEEP_DIRECTION_COUNTER_CLOCKWISE,
            arcSize: D2D1_ARC_SIZE_SMALL,
        });
        sink.EndFigure(D2D1_FIGURE_END_OPEN);
        sink.Close()?;
        gpu.dc.DrawGeometry(&geo, &brush, 1.4, None);

        // Stand stem & base
        gpu.dc.DrawLine(Vector2 { X: x, Y: y + size * 0.28 }, Vector2 { X: x, Y: y + size * 0.45 }, &brush, 1.5, None);
        gpu.dc.DrawLine(Vector2 { X: x - size * 0.22, Y: y + size * 0.45 }, Vector2 { X: x + size * 0.22, Y: y + size * 0.45 }, &brush, 1.5, None);
    }
    Ok(())
}

pub fn draw_eq_bars(
    gpu: &Gpu,
    x: f32,
    y: f32,
    count: usize,
    anim_time: f32,
    is_playing: bool,
    color: D2D1_COLOR_F,
    scale: f32,
) -> Result<()> {
    unsafe {
        let brush = gpu.dc.CreateSolidColorBrush(&color, None)?;
        let bar_w = 2.0 * scale;
        let gap = 2.0 * scale;
        let max_h = 12.0 * scale;
        let min_h = 3.0 * scale;

        let total_w = (count as f32) * bar_w + ((count - 1) as f32) * gap;
        let mut start_x = x - total_w / 2.0;

        for i in 0..count {
            let h = if is_playing {
                let phase = anim_time * 6.0 + (i as f32) * 1.35;
                let sin_v = (phase.sin() * 0.5 + 0.5).clamp(0.0, 1.0);
                min_h + (max_h - min_h) * sin_v
            } else {
                min_h + (i as f32 % 2.0) * 1.5 * scale
            };

            let rect = D2D1_ROUNDED_RECT {
                rect: D2D_RECT_F {
                    left: start_x,
                    top: y - h / 2.0,
                    right: start_x + bar_w,
                    bottom: y + h / 2.0,
                },
                radiusX: 1.0 * scale,
                radiusY: 1.0 * scale,
            };
            gpu.dc.FillRoundedRectangle(&rect, &brush);
            start_x += bar_w + gap;
        }
    }
    Ok(())
}
