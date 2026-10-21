//! Penanganan interaksi klik per halaman (Music, Notif, Todo, Cal, Pomo, Shelf, Config).

use crate::app::App;
use crate::pages::navbar::AppPage;
use crate::pages::notch::NotchShape;

pub fn handle_page_click(app: &mut App, shape: &NotchShape, x: f32, y: f32, s: f32) {
    let cx = shape.center_x;
    let left = shape.center_x - shape.width / 2.0;

    match app.page {
        AppPage::Music => {
            if app.lyrics_mode {
                let back_x = left + 46.0 * s;
                let back_y = 146.0 * s;
                let dist = ((x - back_x).powi(2) + (y - back_y).powi(2)).sqrt();
                if dist <= 18.0 * s {
                    app.set_lyrics_mode(false);
                    return;
                }
            } else {
                let lyr_btn_x = left + 52.0 * s;
                let ctrl_y = 148.0 * s;
                let dist_lyr = ((x - lyr_btn_x).powi(2) + (y - ctrl_y).powi(2)).sqrt();
                if dist_lyr <= 18.0 * s {
                    app.set_lyrics_mode(true);
                    return;
                }

                let dist_play = ((x - cx).powi(2) + (y - ctrl_y).powi(2)).sqrt();
                if dist_play <= 22.0 * s {
                    let _ = app.smtc.toggle_play_pause();
                    app.media_state = app.smtc.poll_state();
                    app.render();
                    return;
                }

                let dist_prev = ((x - (cx - 44.0 * s)).powi(2) + (y - ctrl_y).powi(2)).sqrt();
                if dist_prev <= 18.0 * s {
                    let _ = app.smtc.prev();
                    app.media_state = app.smtc.poll_state();
                    app.render();
                    return;
                }

                let dist_next = ((x - (cx + 44.0 * s)).powi(2) + (y - ctrl_y).powi(2)).sqrt();
                if dist_next <= 18.0 * s {
                    let _ = app.smtc.next();
                    app.media_state = app.smtc.poll_state();
                    app.render();
                    return;
                }

                let bar_x = left + 88.0 * s;
                let bar_w = shape.width - 176.0 * s;
                let bar_y = 118.0 * s;
                if x >= bar_x && x <= bar_x + bar_w && (y - bar_y).abs() <= 12.0 * s {
                    let ratio = ((x - bar_x) / bar_w).clamp(0.0, 1.0) as f64;
                    let target_sec = ratio * app.media_state.duration_sec;
                    let _ = app.smtc.seek(target_sec);
                    app.media_state.position_sec = target_sec;
                    app.render();
                    return;
                }
            }
        }
        AppPage::Notif => {
            // Klik tombol WA
            let col_x = left + 44.0 * s;
            let btn_y = 38.0 * s + 4.0 * (24.0 * s + 4.0 * s) + 7.0 * s;
            if x >= col_x && x <= col_x + 66.0 * s && y >= btn_y && y <= btn_y + 22.0 * s {
                let _ = std::process::Command::new("cmd").args(["/c", "start", "https://web.whatsapp.com"]).spawn();
                return;
            }
        }
        AppPage::Todo => {
            let col1_x = left + 44.0 * s;
            let btn_y = shape.height - 34.0 * s;

            // Courses button
            if x >= col1_x && x <= col1_x + 48.0 * s && y >= btn_y && y <= btn_y + 22.0 * s {
                let _ = std::process::Command::new("cmd").args(["/c", "start", "https://lms.telkomuniversity.ac.id/my/"]).spawn();
                return;
            }
            // Sound bell button
            if x >= col1_x + 52.0 * s && x <= col1_x + 74.0 * s && y >= btn_y && y <= btn_y + 22.0 * s {
                app.active_modal = Some(crate::app::ActiveModal::Sound);
                app.render();
                return;
            }
            // AI button
            if x >= col1_x + 78.0 * s && x <= col1_x + 132.0 * s && y >= btn_y && y <= btn_y + 22.0 * s {
                let _ = std::process::Command::new("cmd").args(["/c", "start", "https://github.com/muhnaufal11/lms-quiz-assistant"]).spawn();
                return;
            }

            // Checkbox tugas di kolom kanan
            let col2_x = left + 184.0 * s;
            let mut item_y = 36.0 * s;
            let card_h = 36.0 * s;
            let tasks = app.vault.get_tasks().tasks;
            for task in tasks.iter().take(3) {
                let chk_x = col2_x + 16.0 * s;
                let chk_y = item_y + card_h / 2.0;
                let dist = ((x - chk_x).powi(2) + (y - chk_y).powi(2)).sqrt();
                if dist <= 16.0 * s {
                    app.vault.toggle_task(&task.id);
                    app.render();
                    return;
                }
                item_y += card_h + 5.0 * s;
            }
        }
        AppPage::Calendar => {
            let right = shape.center_x + shape.width / 2.0;
            let sched_btn_w = 90.0 * s;
            let sched_btn_x = right - 36.0 * s - sched_btn_w;
            let sched_btn_y = 36.0 * s;
            if x >= sched_btn_x && x <= sched_btn_x + sched_btn_w && y >= sched_btn_y && y <= sched_btn_y + 18.0 * s {
                app.active_modal = Some(crate::app::ActiveModal::Schedule);
                app.render();
                return;
            }
        }
        AppPage::Pomodoro => {
            let btn_y = 142.0 * s;
            let dist_play = ((x - cx).powi(2) + (y - btn_y).powi(2)).sqrt();
            if dist_play <= 20.0 * s {
                app.pomodoro.toggle_run();
                app.render();
                return;
            }
            if (x - (cx + 38.0 * s)).abs() <= 25.0 * s && (y - btn_y).abs() <= 15.0 * s {
                app.pomodoro.reset();
                app.render();
                return;
            }
        }
        AppPage::Shelf => {
            let tab_bar_y = 38.0 * s;
            let tab_w = 98.0 * s;
            let t1_x = left + 44.0 * s;
            if y >= tab_bar_y && y <= tab_bar_y + 24.0 * s {
                if x >= t1_x && x <= t1_x + tab_w {
                    app.shelf_tab = crate::pages::shelf::ShelfTab::Files;
                    app.render();
                    return;
                }
                let t2_x = t1_x + tab_w + 6.0 * s;
                if x >= t2_x && x <= t2_x + tab_w {
                    app.shelf_tab = crate::pages::shelf::ShelfTab::Clipboard;
                    app.render();
                    return;
                }
            }
            // Klik copy clipboard
            if app.shelf_tab == crate::pages::shelf::ShelfTab::Clipboard {
                let content_y = tab_bar_y + 24.0 * s + 8.0 * s;
                let mut cy = content_y;
                let c_h = 28.0 * s;
                let history = app.clipboard.get_history();
                for item in history.iter().take(3) {
                    if x >= left + 44.0 * s && x <= shape.center_x + shape.width / 2.0 - 44.0 * s && y >= cy && y <= cy + c_h {
                        crate::services::clipboard::copy_to_clipboard(&item.content);
                        app.show_peek(crate::pages::peek::PeekType::PhoneLink, "Disalin ke Clipboard", &item.preview, 1800);
                        return;
                    }
                    cy += c_h + 4.0 * s;
                }
            }
        }
        AppPage::Config => {
            let cur_y = 38.0 * s + 18.0 * s + 26.0 * s + 8.0 * s + 18.0 * s;
            let pill_h = 22.0 * s;
            let content_x = left + 44.0 * s;
            let mut px = content_x;

            // Pill A: Suara
            let p_sound_w = 64.0 * scale_val(s);
            if y >= cur_y && y <= cur_y + pill_h && x >= px && x <= px + p_sound_w {
                app.active_modal = Some(crate::app::ActiveModal::Sound);
                app.render();
                return;
            }
            px += p_sound_w + 5.0 * s;

            // Pill B: Versi
            let p_ver_w = 56.0 * s;
            px += p_ver_w + 5.0 * s;

            // Pill C: Startup
            let p_auto_w = 82.0 * s;
            if y >= cur_y && y <= cur_y + pill_h && x >= px && x <= px + p_auto_w {
                crate::window::autostart::set_enabled(!crate::window::autostart::is_enabled());
                app.render();
                return;
            }
            px += p_auto_w + 5.0 * s;

            // Pill D: Mode Maskot/Status
            let p_mode_w = 80.0 * s;
            if y >= cur_y && y <= cur_y + pill_h && x >= px && x <= px + p_mode_w {
                app.closed_style_mascot = !app.closed_style_mascot;
                app.render();
                return;
            }
            px += p_mode_w + 5.0 * s;

            // Pill E: Tengahkan
            let p_cnt_w = 64.0 * s;
            if y >= cur_y && y <= cur_y + pill_h && x >= px && x <= px + p_cnt_w {
                app.recenter();
                app.render();
                return;
            }
        }
    }
}

fn scale_val(s: f32) -> f32 {
    s
}
