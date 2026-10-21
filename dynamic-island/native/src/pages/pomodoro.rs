//! Halaman Pomodoro / Focus Mode Timer (Direct2D UI).

use windows::core::Result;
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;
use windows::Win32::Graphics::DirectWrite::DWRITE_FONT_WEIGHT;

use crate::pages::notch::NotchShape;
use crate::ui::icons;
use crate::ui::renderer::Gpu;
use crate::ui::text;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PomoMode {
    Focus,
    Break,
}

#[derive(Clone, Debug)]
pub struct PomodoroState {
    pub mode: PomoMode,
    pub running: bool,
    pub remaining_sec: u32,
    pub total_sec: u32,
}

impl PomodoroState {
    pub fn new() -> Self {
        Self {
            mode: PomoMode::Focus,
            running: false,
            remaining_sec: 25 * 60,
            total_sec: 25 * 60,
        }
    }

    pub fn tick(&mut self) -> bool {
        if self.running && self.remaining_sec > 0 {
            self.remaining_sec -= 1;
            if self.remaining_sec == 0 {
                self.running = false;
                match self.mode {
                    PomoMode::Focus => {
                        self.mode = PomoMode::Break;
                        self.remaining_sec = 5 * 60;
                        self.total_sec = 5 * 60;
                    }
                    PomoMode::Break => {
                        self.mode = PomoMode::Focus;
                        self.remaining_sec = 25 * 60;
                        self.total_sec = 25 * 60;
                    }
                }
                return true;
            }
        }
        false
    }

    pub fn toggle_run(&mut self) {
        self.running = !self.running;
    }

    pub fn reset(&mut self) {
        self.running = false;
        match self.mode {
            PomoMode::Focus => {
                self.remaining_sec = 25 * 60;
                self.total_sec = 25 * 60;
            }
            PomoMode::Break => {
                self.remaining_sec = 5 * 60;
                self.total_sec = 5 * 60;
            }
        }
    }
}

pub fn draw_pomodoro_page(
    gpu: &Gpu,
    shape: &NotchShape,
    state: &PomodoroState,
    scale: f32,
) -> Result<()> {
    let left = shape.center_x - shape.width / 2.0;
    let cx = shape.center_x;

    let white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 1.0 };
    let sub_color = D2D1_COLOR_F { r: 0.8, g: 0.85, b: 0.95, a: 0.65 };
    let accent_amber = D2D1_COLOR_F { r: 1.0, g: 0.72, b: 0.30, a: 1.0 };
    let accent_green = D2D1_COLOR_F { r: 0.2, g: 0.85, b: 0.5, a: 1.0 };
    let bar_bg = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.15 };

    let mode_color = match state.mode {
        PomoMode::Focus => accent_amber,
        PomoMode::Break => accent_green,
    };

    let mode_title = match state.mode {
        PomoMode::Focus => "Sesi Fokus Belajar",
        PomoMode::Break => "Waktu Istirahat Santai",
    };

    // Header mode
    text::draw_text(
        gpu,
        mode_title,
        cx - 100.0 * scale,
        38.0 * scale,
        12.0 * scale,
        DWRITE_FONT_WEIGHT(600),
        mode_color,
        200.0 * scale,
        16.0 * scale,
    )?;

    // Big digital timer display (e.g. 25:00)
    let m = state.remaining_sec / 60;
    let s = state.remaining_sec % 60;
    let clock_str = format!("{:02}:{:02}", m, s);

    text::draw_text(
        gpu,
        &clock_str,
        cx - 80.0 * scale,
        56.0 * scale,
        36.0 * scale,
        DWRITE_FONT_WEIGHT(700),
        white,
        160.0 * scale,
        44.0 * scale,
    )?;

    // Progress bar
    let bar_w = shape.width - 120.0 * scale;
    let bar_h = 4.5 * scale;
    let bar_x = left + 60.0 * scale;
    let bar_y = 108.0 * scale;
    let ratio = if state.total_sec > 0 {
        1.0 - (state.remaining_sec as f32 / state.total_sec as f32)
    } else {
        0.0
    };

    unsafe {
        let bg_brush = gpu.dc.CreateSolidColorBrush(&bar_bg, None)?;
        let fill_brush = gpu.dc.CreateSolidColorBrush(&mode_color, None)?;

        let track_r = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: bar_x,
                top: bar_y,
                right: bar_x + bar_w,
                bottom: bar_y + bar_h,
            },
            radiusX: bar_h / 2.0,
            radiusY: bar_h / 2.0,
        };
        gpu.dc.FillRoundedRectangle(&track_r, &bg_brush);

        let fill_w = bar_w * ratio;
        if fill_w > 1.0 {
            let filled_r = D2D1_ROUNDED_RECT {
                rect: D2D_RECT_F {
                    left: bar_x,
                    top: bar_y,
                    right: bar_x + fill_w,
                    bottom: bar_y + bar_h,
                },
                radiusX: bar_h / 2.0,
                radiusY: bar_h / 2.0,
            };
            gpu.dc.FillRoundedRectangle(&filled_r, &fill_brush);
        }
    }

    // Tombol Kontrol (Play/Pause, Reset)
    let btn_y = 142.0 * scale;

    // Play/Pause button
    let play_btn_rect = D2D1_ELLIPSE {
        point: windows_numerics::Vector2 { X: cx, Y: btn_y },
        radiusX: 16.0 * scale,
        radiusY: 16.0 * scale,
    };
    unsafe {
        let btn_bg = gpu.dc.CreateSolidColorBrush(&white, None)?;
        gpu.dc.FillEllipse(&play_btn_rect, &btn_bg);
    }
    let black = D2D1_COLOR_F { r: 0.05, g: 0.05, b: 0.05, a: 1.0 };
    if state.running {
        icons::draw_pause(gpu, cx, btn_y, 13.0 * scale, black)?;
    } else {
        icons::draw_play(gpu, cx + 1.2 * scale, btn_y, 13.0 * scale, black)?;
    }

    // Reset button
    text::draw_text(
        gpu,
        "Reset",
        cx + 38.0 * scale,
        btn_y - 7.0 * scale,
        11.5 * scale,
        DWRITE_FONT_WEIGHT(500),
        sub_color,
        50.0 * scale,
        16.0 * scale,
    )?;

    Ok(())
}
