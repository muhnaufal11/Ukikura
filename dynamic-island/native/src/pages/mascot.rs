//! Maskot Nusa: Living Eyes (11 Emosi, Fisika Lirikan Kursor, Kedip Alami & Zero-CPU Settled).

use std::time::{Duration, Instant};
use windows::core::Result;
use windows::Win32::Graphics::Direct2D::Common::*;
use windows::Win32::Graphics::Direct2D::*;

use crate::pages::notch::NotchShape;
use crate::ui::renderer::Gpu;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mood {
    Normal,
    Happy,
    Love,
    Wink,
    Curious,
    Surprised,
    Angry,
    Sad,
    Sleepy,
    Suspicious,
    Starry,
    Dizzy,
}

pub struct Mascot {
    pub mood: Mood,
    pub mood_until: Option<Instant>,
    pub cur_x: f32,
    pub cur_y: f32,
    pub vel_x: f32,
    pub vel_y: f32,
    pub target_x: f32,
    pub target_y: f32,
    pub blink: f32,
    pub blink_closing: bool,
    pub next_blink: Instant,
    pub next_scene: Instant,
    pub last_cursor_dx: f32,
    pub cursor_shake: f32,
    pub last_tick: Instant,
}

impl Mascot {
    pub fn new() -> Self {
        let now = Instant::now();
        Self {
            mood: Mood::Normal,
            mood_until: None,
            cur_x: 0.0,
            cur_y: 0.0,
            vel_x: 0.0,
            vel_y: 0.0,
            target_x: 0.0,
            target_y: 0.0,
            blink: 1.0,
            blink_closing: false,
            next_blink: now + Duration::from_millis(2500),
            next_scene: now + Duration::from_secs(12),
            last_cursor_dx: 0.0,
            cursor_shake: 0.0,
            last_tick: now,
        }
    }

    pub fn set_mood(&mut self, mood: Mood, duration: Duration) {
        self.mood = mood;
        self.mood_until = Some(Instant::now() + duration);
    }

    pub fn on_cursor_move(&mut self, dx: f32, dy: f32) {
        let delta_dx = dx - self.last_cursor_dx;
        if delta_dx.abs() > 38.0 && (delta_dx.is_sign_positive() != self.last_cursor_dx.is_sign_positive()) {
            self.cursor_shake = (self.cursor_shake + 2.5).min(10.0);
        } else {
            self.cursor_shake = (self.cursor_shake - 0.35).max(0.0);
        }
        self.last_cursor_dx = dx;

        let nx = (dx / 520.0).clamp(-1.0, 1.0);
        let ny = (dy / 420.0).clamp(-1.0, 1.0);
        self.target_x = nx * 8.8;
        self.target_y = ny * 2.8;

        let dist = (dx * dx + dy * dy).sqrt();
        if self.cursor_shake >= 6.5 && dist < 300.0 && self.mood == Mood::Normal {
            self.cursor_shake = 0.0;
            self.set_mood(Mood::Dizzy, Duration::from_millis(1800));
        }
    }

    /// Melangkah fisika pegas lirikan & kedip. Mengembalikan `true` jika mata sedang bergerak (butuh frame berikutnya).
    pub fn step(&mut self, now: Instant) -> bool {
        let dt = (now - self.last_tick).as_secs_f32().clamp(0.001, 0.05);
        self.last_tick = now;

        // Reset mood otomatis setelah durasi habis
        if let Some(until) = self.mood_until {
            if now >= until {
                self.mood = Mood::Normal;
                self.mood_until = None;
            }
        }

        // Kedip otomatis saat mood normal
        let mut is_blinking = false;
        if self.mood == Mood::Normal {
            if now >= self.next_blink {
                if !self.blink_closing && self.blink >= 0.99 {
                    self.blink_closing = true;
                }
            }
            if self.blink_closing {
                self.blink = (self.blink - dt * 14.0).max(0.12);
                if self.blink <= 0.13 {
                    self.blink_closing = false;
                }
                is_blinking = true;
            } else if self.blink < 1.0 {
                self.blink = (self.blink + dt * 12.0).min(1.0);
                if self.blink >= 1.0 {
                    let rand_ms = 2200 + ((now.elapsed().as_nanos() % 3200) as u64);
                    self.next_blink = now + Duration::from_millis(rand_ms);
                }
                is_blinking = true;
            }
        } else {
            self.blink = 1.0;
            self.blink_closing = false;
        }

        // Spring damper untuk posisi bola mata
        let stiffness = 145.0;
        let damping = 16.0;
        let force_x = stiffness * (self.target_x - self.cur_x) - damping * self.vel_x;
        let force_y = stiffness * (self.target_y - self.cur_y) - damping * self.vel_y;
        self.vel_x += force_x * dt;
        self.vel_y += force_y * dt;
        self.cur_x += self.vel_x * dt;
        self.cur_y += self.vel_y * dt;

        let moving = (self.target_x - self.cur_x).abs() > 0.08
            || (self.target_y - self.cur_y).abs() > 0.08
            || self.vel_x.abs() > 0.08
            || self.vel_y.abs() > 0.08;

        let active_mood = self.mood != Mood::Normal;
        moving || is_blinking || active_mood
    }

    pub fn draw(
        &self,
        gpu: &Gpu,
        shape: &NotchShape,
        is_playing: bool,
        unread_count: usize,
        anim_time: f32,
        scale: f32,
    ) -> Result<()> {
        let left = shape.center_x - shape.width / 2.0;
        let right = shape.center_x + shape.width / 2.0;
        let cy_center = 12.5 * scale;
        let base_w = 9.0 * scale;
        let base_h = 12.8 * scale;
        let eye_offset_x = 11.5 * scale;

        // 1. Equalizer Kiri 4-Bar (.pet-left-eq) Khas Nusa
        let eq_color = if is_playing {
            D2D1_COLOR_F { r: 0.20, g: 0.88, b: 0.48, a: 1.0 }
        } else {
            D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.25 }
        };
        let _ = crate::ui::icons::draw_eq_bars(
            gpu,
            left + 22.0 * scale,
            cy_center,
            4,
            anim_time,
            is_playing,
            eq_color,
            scale,
        );

        // 2. Lencana Notifikasi Kanan (.pet-badge) Khas Nusa
        let badge_x = right - 24.0 * scale;
        let badge_w = 28.0 * scale;
        let badge_h = 15.0 * scale;
        let badge_rect = D2D1_ROUNDED_RECT {
            rect: D2D_RECT_F {
                left: badge_x - badge_w / 2.0,
                top: cy_center - badge_h / 2.0,
                right: badge_x + badge_w / 2.0,
                bottom: cy_center + badge_h / 2.0,
            },
            radiusX: 7.5 * scale,
            radiusY: 7.5 * scale,
        };
        unsafe {
            let badge_bg = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.12 }, None)?;
            gpu.dc.FillRoundedRectangle(&badge_rect, &badge_bg);

            // Titik hijau WhatsApp / Notif
            let dot_color = if unread_count > 0 {
                D2D1_COLOR_F { r: 0.15, g: 0.83, b: 0.40, a: 1.0 }
            } else {
                D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.25 }
            };
            let dot_brush = gpu.dc.CreateSolidColorBrush(&dot_color, None)?;
            let dot = D2D1_ELLIPSE {
                point: windows_numerics::Vector2 {
                    X: badge_x - 6.0 * scale,
                    Y: cy_center,
                },
                radiusX: 2.2 * scale,
                radiusY: 2.2 * scale,
            };
            gpu.dc.FillEllipse(&dot, &dot_brush);
        }

        let count_str = format!("{}", unread_count);
        let count_color = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.88 };
        let _ = crate::ui::text::draw_text(
            gpu,
            &count_str,
            badge_x - 1.0 * scale,
            cy_center - 6.0 * scale,
            9.5 * scale,
            windows::Win32::Graphics::DirectWrite::DWRITE_FONT_WEIGHT(700),
            count_color,
            18.0 * scale,
            12.0 * scale,
        );

        let white = gpu.brush(1.0, 1.0, 1.0, 1.0)?;
        let glow_cyan = gpu.brush(0.47, 0.82, 1.0, 0.55)?;
        let glow_emerald = gpu.brush(0.20, 0.88, 0.48, 0.25)?;
        let pink = gpu.brush(1.0, 0.42, 0.62, 1.0)?;
        let blue = gpu.brush(0.45, 0.82, 1.0, 1.0)?;
        let gold = gpu.brush(1.0, 0.85, 0.35, 1.0)?;
        let red = gpu.brush(1.0, 0.28, 0.35, 1.0)?;

        // Gambar kedua mata dengan orientasi & emosi yang sesuai
        for (i, dir) in [-1.0f32, 1.0].iter().enumerate() {
            let is_left = i == 0;
            let cx = shape.center_x + dir * eye_offset_x + self.cur_x * scale * 0.45;
            let cy = cy_center + self.cur_y * scale * 0.35;

            match self.mood {
                Mood::Happy => {
                    let r = D2D1_ROUNDED_RECT {
                        rect: D2D_RECT_F {
                            left: cx - 5.5 * scale,
                            top: cy - 2.5 * scale,
                            right: cx + 5.5 * scale,
                            bottom: cy + 3.0 * scale,
                        },
                        radiusX: 4.0 * scale,
                        radiusY: 4.0 * scale,
                    };
                    unsafe { gpu.dc.DrawRoundedRectangle(&r, &white, 2.8 * scale, None); }
                }
                Mood::Love => {
                    let r = D2D1_ROUNDED_RECT {
                        rect: D2D_RECT_F {
                            left: cx - 5.2 * scale,
                            top: cy - 5.5 * scale,
                            right: cx + 5.2 * scale,
                            bottom: cy + 5.5 * scale,
                        },
                        radiusX: 5.0 * scale,
                        radiusY: 5.0 * scale,
                    };
                    unsafe { gpu.dc.FillRoundedRectangle(&r, &pink); }
                }
                Mood::Wink if is_left => {
                    let r = D2D1_ROUNDED_RECT {
                        rect: D2D_RECT_F {
                            left: cx - 5.5 * scale,
                            top: cy - 2.5 * scale,
                            right: cx + 5.5 * scale,
                            bottom: cy + 3.0 * scale,
                        },
                        radiusX: 4.0 * scale,
                        radiusY: 4.0 * scale,
                    };
                    unsafe { gpu.dc.DrawRoundedRectangle(&r, &white, 2.8 * scale, None); }
                }
                Mood::Sleepy => {
                    let r = D2D1_ROUNDED_RECT {
                        rect: D2D_RECT_F {
                            left: cx - 5.0 * scale,
                            top: cy - 1.0 * scale,
                            right: cx + 5.0 * scale,
                            bottom: cy + 3.5 * scale,
                        },
                        radiusX: 3.5 * scale,
                        radiusY: 3.5 * scale,
                    };
                    unsafe { gpu.dc.DrawRoundedRectangle(&r, &white, 2.5 * scale, None); }
                }
                Mood::Angry => {
                    let r = D2D1_ROUNDED_RECT {
                        rect: D2D_RECT_F {
                            left: cx - 4.5 * scale,
                            top: cy - 5.0 * scale,
                            right: cx + 4.5 * scale,
                            bottom: cy + 5.0 * scale,
                        },
                        radiusX: 2.0 * scale,
                        radiusY: 2.0 * scale,
                    };
                    unsafe { gpu.dc.FillRoundedRectangle(&r, &red); }
                }
                Mood::Curious => {
                    let w = if is_left { 4.0 * scale } else { 5.6 * scale };
                    let h = if is_left { 4.0 * scale } else { 7.0 * scale };
                    let r = D2D1_ROUNDED_RECT {
                        rect: D2D_RECT_F {
                            left: cx - w,
                            top: cy - h,
                            right: cx + w,
                            bottom: cy + h,
                        },
                        radiusX: w,
                        radiusY: h,
                    };
                    unsafe { gpu.dc.FillRoundedRectangle(&r, &blue); }
                }
                Mood::Starry => {
                    let r = D2D1_ROUNDED_RECT {
                        rect: D2D_RECT_F {
                            left: cx - 5.0 * scale,
                            top: cy - 6.5 * scale,
                            right: cx + 5.0 * scale,
                            bottom: cy + 6.5 * scale,
                        },
                        radiusX: 5.0 * scale,
                        radiusY: 5.0 * scale,
                    };
                    unsafe { gpu.dc.FillRoundedRectangle(&r, &gold); }
                }
                _ => {
                    let eff_h = base_h * self.blink;

                    // 1. Lapisan Aura Glow Khas Nusa (Cyan + Emerald)
                    if self.blink > 0.4 {
                        let glow_rect2 = D2D1_ROUNDED_RECT {
                            rect: D2D_RECT_F {
                                left: cx - (base_w / 2.0 + 3.0 * scale),
                                top: cy - (eff_h / 2.0 + 3.0 * scale),
                                right: cx + (base_w / 2.0 + 3.0 * scale),
                                bottom: cy + (eff_h / 2.0 + 3.0 * scale),
                            },
                            radiusX: base_w / 2.0 + 3.0 * scale,
                            radiusY: base_w / 2.0 + 3.0 * scale,
                        };
                        unsafe {
                            gpu.dc.FillRoundedRectangle(&glow_rect2, &glow_emerald);
                        }

                        let glow_rect = D2D1_ROUNDED_RECT {
                            rect: D2D_RECT_F {
                                left: cx - (base_w / 2.0 + 1.5 * scale),
                                top: cy - (eff_h / 2.0 + 1.5 * scale),
                                right: cx + (base_w / 2.0 + 1.5 * scale),
                                bottom: cy + (eff_h / 2.0 + 1.5 * scale),
                            },
                            radiusX: base_w / 2.0 + 1.5 * scale,
                            radiusY: base_w / 2.0 + 1.5 * scale,
                        };
                        unsafe {
                            gpu.dc.FillRoundedRectangle(&glow_rect, &glow_cyan);
                        }
                    }

                    // 2. Pil Mata Putih Murni Bersih
                    let r = D2D1_ROUNDED_RECT {
                        rect: D2D_RECT_F {
                            left: cx - base_w / 2.0,
                            top: cy - eff_h / 2.0,
                            right: cx + base_w / 2.0,
                            bottom: cy + eff_h / 2.0,
                        },
                        radiusX: base_w / 2.0,
                        radiusY: base_w / 2.0,
                    };
                    unsafe {
                        gpu.dc.FillRoundedRectangle(&r, &white);
                    }

                    // 3. Kilau Spekular Halus di Kanan Atas Mata
                    if self.blink > 0.6 {
                        let specular = D2D1_ELLIPSE {
                            point: windows_numerics::Vector2 {
                                X: cx + 1.8 * scale,
                                Y: cy - eff_h * 0.28,
                            },
                            radiusX: 1.3 * scale,
                            radiusY: 1.3 * scale,
                        };
                        unsafe {
                            gpu.dc.FillEllipse(&specular, &white);
                        }
                    }
                }
            }
        }

        Ok(())
    }
}

pub fn draw_idle_bar(
    gpu: &Gpu,
    shape: &NotchShape,
    title: &str,
    is_playing: bool,
    anim_time: f32,
    _battery_pct: u8,
    scale: f32,
) -> Result<()> {
    let left = shape.center_x - shape.width / 2.0;
    let right = shape.center_x + shape.width / 2.0;
    let cy = 12.5 * scale;

    // 1. Ring baterai di kiri (.ring)
    let ring_x = left + 18.0 * scale;
    let ring_r = 7.0 * scale;
    unsafe {
        let ring_bg = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 0.20, g: 0.88, b: 0.48, a: 0.25 }, None)?;
        let ring_fill = gpu.dc.CreateSolidColorBrush(&D2D1_COLOR_F { r: 0.20, g: 0.88, b: 0.48, a: 1.0 }, None)?;
        let ellipse = D2D1_ELLIPSE {
            point: windows_numerics::Vector2 { X: ring_x, Y: cy },
            radiusX: ring_r,
            radiusY: ring_r,
        };
        gpu.dc.DrawEllipse(&ellipse, &ring_bg, 2.5 * scale, None);
        let dot = D2D1_ELLIPSE {
            point: windows_numerics::Vector2 { X: ring_x, Y: cy },
            radiusX: 2.5 * scale,
            radiusY: 2.5 * scale,
        };
        gpu.dc.FillEllipse(&dot, &ring_fill);
    }

    // 2. Judul di tengah (.idle-center)
    let display_title = if title.is_empty() { "Ukikura Living Notch" } else { title };
    let text_x = left + 34.0 * scale;
    let text_w = shape.width - 68.0 * scale;
    let white = D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 0.95 };
    let _ = crate::ui::text::draw_text(
        gpu,
        display_title,
        text_x,
        cy - 6.5 * scale,
        11.2 * scale,
        windows::Win32::Graphics::DirectWrite::DWRITE_FONT_WEIGHT(600),
        white,
        text_w,
        14.0 * scale,
    );

    // 3. 5-bar equalizer di kanan (.bars)
    let eq_color = D2D1_COLOR_F { r: 0.37, g: 0.76, b: 1.0, a: 1.0 };
    let _ = crate::ui::icons::draw_eq_bars(
        gpu,
        right - 20.0 * scale,
        cy,
        5,
        anim_time,
        is_playing,
        eq_color,
        scale,
    );

    Ok(())
}
