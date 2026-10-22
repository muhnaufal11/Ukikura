use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::Duration;
use tao::event_loop::EventLoopProxy;
use windows::Win32::Foundation::{HWND, POINT};
use windows::Win32::UI::WindowsAndMessaging::{
    GetCursorPos, GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_TRANSPARENT,
};

use crate::UserEvent;

pub struct HoverState {
    pub is_expanded: AtomicBool,
    pub is_pinned: AtomicBool,
    pub is_tucked: AtomicBool,
    pub is_peek_active: AtomicBool,
}

impl HoverState {
    pub fn new() -> Self {
        Self {
            is_expanded: AtomicBool::new(false),
            is_pinned: AtomicBool::new(false),
            is_tucked: AtomicBool::new(false),
            is_peek_active: AtomicBool::new(false),
        }
    }
}

pub fn start_hover_loop(
    hwnd_val: isize,
    window_x: f64,
    window_w: f64,
    state: Arc<HoverState>,
    proxy: EventLoopProxy<UserEvent>,
) {
    thread::spawn(move || {
        let hwnd = HWND(hwnd_val as *mut std::ffi::c_void);
        let center_x = window_x + (window_w / 2.0);
        let mut last_ignore = false;
        let mut last_pt_x = -9999;
        let mut last_pt_y = -9999;
        let mut loop_count: u64 = 0;

        loop {
            thread::sleep(Duration::from_millis(25));
            loop_count += 1;

            let mut pt = POINT::default();
            unsafe {
                if !GetCursorPos(&mut pt).is_ok() {
                    continue;
                }
            }

            let expanded = state.is_expanded.load(Ordering::Relaxed);
            let pinned = state.is_pinned.load(Ordering::Relaxed);
            let tucked = state.is_tucked.load(Ordering::Relaxed);
            let peek = state.is_peek_active.load(Ordering::Relaxed);

            let pt_x = pt.x as f64;
            let pt_y = pt.y as f64;
            let rel_dist_x = (pt_x - center_x).abs();
            let rel_y = pt_y; // window_y is 0

            let should_ignore = if expanded {
                // Dimensi panel terbuka: 520 x 188 (+ margin toleransi)
                let half_w = (520.0 / 2.0) + 20.0;
                let inside_open = rel_dist_x <= half_w && rel_y >= 0.0 && rel_y <= (188.0 + 16.0);

                if inside_open || pinned {
                    pinned && !inside_open
                } else {
                    true
                }
            } else if tucked {
                // Dimensi garis tucked tipis: y <= 6px, |x - center| <= 70px
                let on_tuck_bar = rel_dist_x <= 70.0 && rel_y >= 0.0 && rel_y <= 6.0;
                !on_tuck_bar
            } else if peek {
                // Notifikasi Peek aktif
                let in_tab_bar_zone = rel_dist_x <= 125.0 && rel_y >= 0.0 && rel_y <= 40.0;
                if in_tab_bar_zone {
                    true
                } else {
                    let inside_peek = rel_dist_x <= 205.0 && rel_y > 40.0 && rel_y <= 96.0;
                    !inside_peek
                }
            } else {
                // Mode Tertutup Normal (176 x 25)
                // Cek Zona Tab Bar (y: 0..40px, |x - center| <= 125px)
                let in_tab_bar_zone = rel_dist_x <= 125.0 && rel_y >= 0.0 && rel_y <= 40.0;
                let inside_notch = rel_dist_x <= (176.0 / 2.0 + 14.0) && rel_y >= 0.0 && rel_y <= 38.0;

                // Kirim koordinat kursor ke mata maskot Nusa jika bergerak > 3px
                if (pt.x - last_pt_x).abs() > 3 || (pt.y - last_pt_y).abs() > 3 {
                    last_pt_x = pt.x;
                    last_pt_y = pt.y;
                    let js = format!(
                        "if (window.__updateMascotEyeCoords) {{ window.__updateMascotEyeCoords({}, {}); }}",
                        rel_dist_x, rel_y
                    );
                    let _ = proxy.send_event(UserEvent::EvalJs(js));
                }

                in_tab_bar_zone || !inside_notch
            };

            // Terapkan perubahan status klik-tembus
            if should_ignore != last_ignore || (loop_count % 30 == 0) {
                last_ignore = should_ignore;
                unsafe {
                    let current_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                    let new_style = if should_ignore {
                        current_style | (WS_EX_TRANSPARENT.0 as isize)
                    } else {
                        current_style & !(WS_EX_TRANSPARENT.0 as isize)
                    };
                    if new_style != current_style {
                        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, new_style);
                    }
                }
            }
        }
    });
}
