//! State inti aplikasi + logika interaksi kapsul (pengganti hover loop main.js Electron).
//! Berjalan sepenuhnya di thread UI; diakses dari wndproc lewat thread_local.

use std::time::Instant;

use windows::Win32::Foundation::{HWND, POINT, RECT};
use windows::Win32::Graphics::Dwm::DwmFlush;
use windows::Win32::UI::WindowsAndMessaging::{GetCursorPos, GetWindowRect, KillTimer, PostMessageW, SetTimer, ShowWindow, SW_HIDE, SW_SHOWNOACTIVATE};

use crate::lyrics::providers::LyricsManager;
use crate::pages::mascot::Mascot;
use crate::pages::navbar::{self, AppPage};
use crate::pages::notch::{self, NotchShape};
use crate::pages::peek::{draw_peek, PeekNotification, PeekType};
use crate::pages::pomodoro::PomodoroState;
use crate::services::clipboard::ClipboardService;
use crate::services::power::{self, PowerStatus};
use crate::services::smtc::{MediaState, SmtcService};
use crate::services::vault::VaultService;
use crate::ui::anim_spring::Spring;
use crate::ui::renderer::Gpu;
use crate::window::layered_window as lw;

pub const TIMER_HOVER: usize = 1;
pub const WM_APP_FRAME: u32 = windows::Win32::UI::WindowsAndMessaging::WM_APP + 2;

const HOVER_NEAR_MS: u32 = 30;
const HOVER_FAR_MS: u32 = 140;
const LEAVE_CLOSE_MS: u128 = 220;
const TOPMOST_REASSERT_MS: u128 = 1500;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    Closed,
    Expanded,
    Tucked,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ActiveModal {
    Sound,
    Schedule,
}

struct Dim {
    w: f32,
    h: f32,
    r: f32,
}

fn dims(mode: Mode, is_lyrics: bool) -> Dim {
    match mode {
        Mode::Closed => Dim { w: 176.0, h: 25.0, r: 13.0 },
        Mode::Expanded => {
            if is_lyrics {
                Dim { w: 520.0, h: 186.0, r: 32.0 }
            } else {
                Dim { w: 480.0, h: 186.0, r: 32.0 }
            }
        }
        Mode::Tucked => Dim { w: 140.0, h: 6.0, r: 6.0 },
    }
}

pub struct App {
    pub hwnd: HWND,
    gpu: Gpu,
    scale: f32,
    pub mode: Mode,
    pub page: AppPage,
    pub lyrics_mode: bool,
    pub pinned: bool,
    pub visible: bool,
    pub mascot: Mascot,
    pub smtc: SmtcService,
    pub lyrics: LyricsManager,
    pub clipboard: ClipboardService,
    pub vault: VaultService,
    pub pomodoro: PomodoroState,
    pub active_peek: Option<PeekNotification>,
    pub power: PowerStatus,
    pub last_power_check: Instant,
    pub media_state: MediaState,
    pub shelf_tab: crate::pages::shelf::ShelfTab,
    pub closed_style_mascot: bool,
    pub notifs: Vec<crate::pages::battery_notif::NotifItem>,
    pub shelf_files: Vec<crate::pages::shelf::ShelfFile>,
    pub active_modal: Option<ActiveModal>,
    pub sound_modal_state: crate::pages::modals::sound::SoundModalState,
    pub class_schedule: Vec<crate::pages::modals::schedule::ClassScheduleItem>,
    w: Spring,
    h: Spring,
    r: Spring,
    click_through: bool,
    hover_interval: u32,
    leave_since: Option<Instant>,
    last_topmost: Instant,
    last_frame: Instant,
    frame_pending: bool,
}

impl App {
    pub fn new(hwnd: HWND) -> windows::core::Result<Self> {
        crate::log_append("App::new 1: dpi_scale");
        let scale = lw::dpi_scale(hwnd);
        crate::log_append("App::new 2: place_top_center");
        let (_, _, pw, ph) = lw::place_top_center(hwnd, scale);
        crate::log_append(&format!("App::new 3: Gpu::new(pw={}, ph={})", pw, ph));
        let gpu = Gpu::new(hwnd, pw, ph)?;
        crate::log_append("App::new 4: dims");
        let d = dims(Mode::Closed, false);
        crate::log_append("App::new 5: smtc");
        let mut smtc = SmtcService::new();
        crate::log_append("App::new 6: smtc.poll_state");
        let media_state = smtc.poll_state();
        crate::log_append("App::new 7: power");
        let power = power::get_power_status();
        crate::log_append("App::new 8: lyrics");
        let lyrics = LyricsManager::new();
        crate::log_append("App::new 9: clipboard");
        let clipboard = ClipboardService::new();
        crate::log_append("App::new 10: clipboard.listen");
        clipboard.listen(hwnd);
        crate::log_append("App::new 11: vault");
        let vault = VaultService::new();
        crate::log_append("App::new 12: pomodoro");
        let pomodoro = PomodoroState::new();

        let mut app = Self {
            hwnd,
            gpu,
            scale,
            mode: Mode::Closed,
            page: AppPage::Music,
            lyrics_mode: false,
            pinned: false,
            visible: true,
            mascot: Mascot::new(),
            smtc,
            lyrics,
            clipboard,
            vault,
            pomodoro,
            active_peek: None,
            power,
            last_power_check: Instant::now(),
            media_state,
            shelf_tab: crate::pages::shelf::ShelfTab::Files,
            closed_style_mascot: true,
            notifs: Vec::new(),
            shelf_files: Vec::new(),
            active_modal: None,
            sound_modal_state: crate::pages::modals::sound::SoundModalState::default(),
            class_schedule: crate::pages::modals::schedule::default_classes(),
            w: Spring::new(d.w, 300.0, 30.0),
            h: Spring::new(d.h, 300.0, 30.0),
            r: Spring::new(d.r, 300.0, 30.0),
            click_through: true,
            hover_interval: 0,
            leave_since: None,
            last_topmost: Instant::now(),
            last_frame: Instant::now(),
            frame_pending: false,
        };
        crate::log_append("App::new 13: set_hover_interval");
        app.set_hover_interval(HOVER_FAR_MS);
        crate::log_append("App::new 14: render");
        app.render();
        unsafe {
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
        }
        crate::log_append("App::new 15: Done!");
        Ok(app)
    }

    fn set_hover_interval(&mut self, ms: u32) {
        if self.hover_interval != ms {
            self.hover_interval = ms;
            unsafe {
                SetTimer(Some(self.hwnd), TIMER_HOVER, ms, None);
            }
        }
    }

    fn shape(&self) -> NotchShape {
        let s = self.scale;
        NotchShape {
            center_x: self.gpu.width as f32 / 2.0,
            width: self.w.value * s,
            height: self.h.value * s,
            radius: self.r.value * s,
            ear: 10.0 * s,
        }
    }

    pub fn set_lyrics_mode(&mut self, on: bool) {
        if self.lyrics_mode != on {
            self.lyrics_mode = on;
            let target_w = if on { 520.0 } else { 480.0 };
            self.w.set_target(target_w);
            self.request_frame();
        }
    }

    pub fn set_mode(&mut self, mode: Mode) {
        if self.mode == mode {
            return;
        }
        self.mode = mode;
        if mode != Mode::Expanded {
            self.pinned = false;
            self.lyrics_mode = false;
        }
        let d = dims(mode, self.lyrics_mode);
        // Membuka: pegas sedikit memantul (--spring); menutup: halus tanpa overshoot
        let (k, c) = if mode == Mode::Expanded { (340.0, 24.0) } else { (300.0, 36.0) };
        for (sp, v) in [(&mut self.w, d.w), (&mut self.h, d.h), (&mut self.r, d.r)] {
            sp.tune(k, c);
            sp.set_target(v);
        }
        self.leave_since = None;
        self.request_frame();
    }

    pub fn request_frame(&mut self) {
        if !self.frame_pending {
            self.frame_pending = true;
            self.last_frame = Instant::now();
            unsafe {
                let _ = PostMessageW(Some(self.hwnd), WM_APP_FRAME, Default::default(), Default::default());
            }
        }
    }

    /// Satu langkah animasi. Loop berhenti sendiri saat semua pegas diam (0 frame saat idle).
    pub fn on_frame(&mut self) {
        self.frame_pending = false;
        let now = Instant::now();
        let dt = (now - self.last_frame).as_secs_f32().clamp(1.0 / 240.0, 1.0 / 20.0);
        self.last_frame = now;
        let mascot_active = if self.mode == Mode::Closed {
            self.mascot.step(now)
        } else {
            false
        };
        let moving = [self.w.step(dt), self.h.step(dt), self.r.step(dt)].iter().any(|m| *m);
        self.render();
        if moving || mascot_active {
            unsafe {
                // Sinkron dengan clock komposisi DWM agar animasi mulus tanpa timer busy-loop
                let _ = DwmFlush();
            }
            self.request_frame();
        }
    }

    pub fn render(&mut self) {
        let shape = self.shape();
        self.gpu.begin();
        let _ = notch::draw(&self.gpu, &shape);
        match self.mode {
            Mode::Closed => {
                if let Some(peek) = &self.active_peek {
                    if !peek.is_expired() {
                        let _ = draw_peek(&self.gpu, &shape, peek, self.scale);
                        let _ = self.gpu.end();
                        return;
                    }
                }
                let is_playing = self.media_state.status == "Playing";
                let anim_time = self.last_frame.elapsed().as_secs_f32();
                if self.closed_style_mascot {
                    let _ = self.mascot.draw(
                        &self.gpu,
                        &shape,
                        is_playing,
                        self.notifs.len(),
                        anim_time,
                        self.scale,
                    );
                } else {
                    let _ = crate::pages::mascot::draw_idle_bar(
                        &self.gpu,
                        &shape,
                        &self.media_state.title,
                        is_playing,
                        anim_time,
                        self.power.battery_percent,
                        self.scale,
                    );
                }
            }
            Mode::Expanded => {
                if self.page == AppPage::Music && self.lyrics_mode {
                    let _ = crate::pages::music::draw_expanded_lyrics(
                        &self.gpu,
                        &shape,
                        &self.media_state,
                        self.lyrics.get_active().as_ref(),
                        self.scale,
                    );
                } else {
                    match self.page {
                        AppPage::Music => {
                            let _ = crate::pages::music::draw_expanded_music(
                                &self.gpu,
                                &shape,
                                &self.media_state,
                                self.scale,
                            );
                        }
                        AppPage::Notif => {
                            let _ = crate::pages::battery_notif::draw_notif_page(
                                &self.gpu,
                                &shape,
                                &self.power,
                                &self.notifs,
                                self.scale,
                            );
                        }
                        AppPage::Todo => {
                            let _ = crate::pages::todo::draw_todo_page(
                                &self.gpu,
                                &shape,
                                &self.vault.get_tasks().tasks,
                                false,
                                self.scale,
                            );
                        }
                        AppPage::Calendar => {
                            let _ = crate::pages::calendar::draw_calendar_page(
                                &self.gpu,
                                &shape,
                                &self.vault.get_tasks().tasks,
                                self.scale,
                            );
                        }
                        AppPage::Pomodoro => {
                            let _ = crate::pages::pomodoro::draw_pomodoro_page(
                                &self.gpu,
                                &shape,
                                &self.pomodoro,
                                self.scale,
                            );
                        }
                        AppPage::Shelf => {
                            let _ = crate::pages::shelf::draw_shelf_page(
                                &self.gpu,
                                &shape,
                                self.shelf_tab,
                                &self.shelf_files,
                                &self.clipboard.get_history(),
                                self.scale,
                            );
                        }
                        AppPage::Config => {
                            let cfg = crate::pages::config::ConfigState {
                                ical_url: String::new(),
                                last_sync_text: "Sinkronisasi otomatis aktif".to_string(),
                                autostart: crate::window::autostart::is_enabled(),
                                closed_style_mascot: self.closed_style_mascot,
                                mascot_fps_label: "Eco".to_string(),
                            };
                            let _ = crate::pages::config::draw_config_page(
                                &self.gpu,
                                &shape,
                                &cfg,
                                self.scale,
                            );
                        }
                    }
                    let _ = navbar::draw_nav_arrows(&self.gpu, &shape, self.scale);
                    let _ = navbar::draw_pagination_dots(&self.gpu, &shape, self.page, self.scale);
                }
                let _ = navbar::draw_header(&self.gpu, &shape, self.page, &self.power, self.pinned, self.scale);
                if let Some(modal) = self.active_modal {
                    match modal {
                        ActiveModal::Sound => {
                            let _ = crate::pages::modals::sound::draw_sound_modal(
                                &self.gpu,
                                &shape,
                                &self.sound_modal_state,
                                self.scale,
                            );
                        }
                        ActiveModal::Schedule => {
                            let _ = crate::pages::modals::schedule::draw_schedule_modal(
                                &self.gpu,
                                &shape,
                                &self.class_schedule,
                                "Semua",
                                self.scale,
                            );
                        }
                    }
                }
            }
            Mode::Tucked => {}
        }
        let _ = self.gpu.end();
    }

    pub fn on_dpi_or_display_changed(&mut self) {
        self.scale = lw::dpi_scale(self.hwnd);
        let (_, _, pw, ph) = lw::place_top_center(self.hwnd, self.scale);
        let _ = self.gpu.resize(pw, ph);
        self.render();
    }

    fn cursor_local(&self) -> (f32, f32, bool) {
        let mut pt = POINT::default();
        let mut rc = RECT::default();
        unsafe {
            let _ = GetCursorPos(&mut pt);
            let _ = GetWindowRect(self.hwnd, &mut rc);
        }
        let x = (pt.x - rc.left) as f32;
        let y = (pt.y - rc.top) as f32;
        let near = pt.x >= rc.left - 160 && pt.x <= rc.right + 160 && pt.y <= rc.bottom + 120;
        (x, y, near)
    }

    fn apply_click_through(&mut self, ct: bool) {
        if self.click_through != ct {
            self.click_through = ct;
            lw::set_click_through(self.hwnd, ct);
        }
    }

    /// Dipanggil oleh timer hover (adaptif: 30 ms dekat island, 140 ms saat kursor jauh).
    pub fn on_hover_tick(&mut self) {
        if !self.visible {
            return;
        }
        if self.last_topmost.elapsed().as_millis() > TOPMOST_REASSERT_MS {
            self.last_topmost = Instant::now();
            lw::reassert_topmost(self.hwnd);
        }
        // Cek kedaluwarsa Peek popup
        if let Some(peek) = &self.active_peek {
            if peek.is_expired() {
                self.active_peek = None;
                if self.mode == Mode::Closed {
                    let d = dims(Mode::Closed, false);
                    self.w.set_target(d.w);
                    self.h.set_target(d.h);
                    self.r.set_target(d.r);
                }
                self.request_frame();
            }
        }

        // Cek status charger / baterai setiap 2.5 detik
        if self.last_power_check.elapsed().as_millis() > 2500 {
            self.last_power_check = Instant::now();
            let new_power = power::get_power_status();
            if new_power.ac_online && !self.power.ac_online {
                self.show_peek(PeekType::Battery, "Charger Terhubung", &format!("Baterai {}% - Mengisi daya", new_power.battery_percent), 3500);
            } else if !new_power.ac_online && self.power.ac_online {
                self.show_peek(PeekType::Battery, "Charger Dilepas", &format!("Sisa daya {}%", new_power.battery_percent), 3000);
            } else if !new_power.ac_online && new_power.battery_percent <= 20 && self.power.battery_percent > 20 {
                self.show_peek(PeekType::Battery, "Baterai Lemah", &format!("Sisa {}% - Hubungkan charger", new_power.battery_percent), 4500);
            }
            self.power = new_power;
        }

        let (x, y, near) = self.cursor_local();
        self.set_hover_interval(if near || self.mode == Mode::Expanded { HOVER_NEAR_MS } else { HOVER_FAR_MS });

        let s = self.scale;
        let cx = self.gpu.width as f32 / 2.0;
        match self.mode {
            Mode::Expanded => {
                if self.page == AppPage::Music {
                    self.media_state = self.smtc.poll_state();
                    self.lyrics.poll();
                    self.lyrics.request_lyrics(&self.media_state.title, &self.media_state.artist, self.media_state.duration_sec);
                } else if self.page == AppPage::Pomodoro && self.pomodoro.running {
                    self.pomodoro.tick();
                }
                self.request_frame();

                let target = dims(Mode::Expanded, self.lyrics_mode);
                let inside = (x - cx).abs() <= (target.w / 2.0 + 20.0) * s && y >= 0.0 && y <= (target.h + 16.0) * s;
                if inside || self.pinned {
                    self.leave_since = None;
                    self.apply_click_through(!inside);
                } else {
                    self.apply_click_through(true);
                    let since = *self.leave_since.get_or_insert_with(Instant::now);
                    if since.elapsed().as_millis() >= LEAVE_CLOSE_MS {
                        self.set_mode(Mode::Closed);
                    }
                }
            }
            Mode::Tucked => {
                let on_bar = (x - cx).abs() <= 70.0 * s && y >= 0.0 && y <= 6.0 * s;
                self.apply_click_through(!on_bar);
            }
            Mode::Closed => {
                let new_media = self.smtc.poll_state();
                if new_media.title != self.media_state.title || new_media.status != self.media_state.status {
                    self.media_state = new_media;
                    self.lyrics.request_lyrics(&self.media_state.title, &self.media_state.artist, self.media_state.duration_sec);
                } else if self.media_state.status == "Playing" {
                    self.media_state.position_sec = new_media.position_sec;
                }
                self.lyrics.poll();

                let dx = x - cx;
                let dy = y - 12.5 * s;
                self.mascot.on_cursor_move(dx, dy);
                self.request_frame();

                let on_notch = notch::contains(&self.shape(), x, y, 0.0) && y <= 25.0 * s;
                self.apply_click_through(!on_notch);
            }
        }
    }

    pub fn on_click(&mut self) {
        let (x, y, _) = self.cursor_local();
        let s = self.scale;
        let shape = self.shape();
        match self.mode {
            Mode::Tucked | Mode::Closed => {
                self.media_state = self.smtc.poll_state();
                self.set_mode(Mode::Expanded);
            }
            Mode::Expanded => {
                // 0. Jika ada modal aktif, tangani klik modal terlebih dahulu
                if let Some(modal) = self.active_modal {
                    let closed = match modal {
                        ActiveModal::Sound => {
                            crate::pages::modals::sound::hit_test_close(&shape, x, y, s)
                                || crate::pages::modals::sound::hit_test_done(&shape, x, y, s)
                        }
                        ActiveModal::Schedule => {
                            crate::pages::modals::schedule::hit_test_close(&shape, x, y, s)
                        }
                    };
                    if closed {
                        self.active_modal = None;
                        self.render();
                    }
                    return;
                }

                // 1. Tombol Pin di Header Kanan
                if navbar::hit_test_pin(&shape, x, y, s) {
                    self.pinned = !self.pinned;
                    self.render();
                    return;
                }

                // 2. Tombol Tuck di Header Kanan
                if navbar::hit_test_tuck(&shape, x, y, s) {
                    self.set_mode(Mode::Tucked);
                    return;
                }

                // 3. Tombol Sound di Header Kanan
                if navbar::hit_test_sound(&shape, x, y, s) {
                    self.active_modal = Some(ActiveModal::Sound);
                    self.render();
                    return;
                }

                // 4. Tombol Login LMS
                if navbar::hit_test_login(&shape, x, y, s) {
                    let _ = std::process::Command::new("cmd").args(["/c", "start", "https://lms.telkomuniversity.ac.id/login/index.php"]).spawn();
                    return;
                }

                // 5. Tombol Sync LMS
                if navbar::hit_test_sync(&shape, x, y, s) {
                    self.show_peek(PeekType::Battery, "Sinkronisasi LMS", "Memperbarui jadwal & tugas...", 2500);
                    return;
                }

                // 6. Tombol WA Quick
                if navbar::hit_test_wa_quick(&shape, x, y, s) {
                    self.page = AppPage::Notif;
                    self.render();
                    return;
                }

                // 3. Panah Navigasi Kiri & Kanan (Hanya aktif di luar mode lirik)
                if !self.lyrics_mode {
                    if navbar::hit_test_prev_arrow(&shape, x, y, s) {
                        self.page = navbar::prev_page(self.page);
                        self.render();
                        return;
                    }
                    if navbar::hit_test_next_arrow(&shape, x, y, s) {
                        self.page = navbar::next_page(self.page);
                        self.render();
                        return;
                    }

                    // 4. Titik Halaman Bawah (.dots)
                    if let Some(target) = navbar::hit_test_dot(&shape, x, y, self.page, s) {
                        self.page = target;
                        self.render();
                        return;
                    }
                }

                // 5. Interaksi per halaman
                crate::pages::interactions::handle_page_click(self, &shape, x, y, s);
            }
        }
    }

    pub fn set_visible(&mut self, visible: bool) {
        self.visible = visible;
        unsafe {
            let _ = ShowWindow(self.hwnd, if visible { SW_SHOWNOACTIVATE } else { SW_HIDE });
        }
        if visible {
            self.render();
        }
    }

    pub fn recenter(&mut self) {
        self.on_dpi_or_display_changed();
    }

    pub fn show_peek(&mut self, peek_type: PeekType, title: &str, message: &str, duration_ms: u64) {
        self.active_peek = Some(PeekNotification::new(peek_type, title, message, duration_ms));
        if self.mode == Mode::Closed {
            self.w.set_target(320.0);
            self.h.set_target(32.0);
            self.r.set_target(16.0);
        }
        self.request_frame();
    }

    pub fn on_wheel(&mut self, delta: f32) {
        let new_vol = crate::services::volume::change_volume(delta * 0.02);
        self.show_peek(PeekType::Volume, "Volume", &format!("{:.0}%", new_vol * 100.0), 1600);
    }

    pub fn on_clipboard_update(&mut self) {
        if let Some(item) = self.clipboard.on_update() {
            let preview = if item.preview.len() > 30 {
                format!("{}...", &item.preview[..28])
            } else {
                item.preview.clone()
            };
            self.show_peek(PeekType::PhoneLink, "Papan Klip", &preview, 2200);
        }
    }

    pub fn shutdown(&mut self) {
        self.clipboard.unlisten(self.hwnd);
        unsafe {
            let _ = KillTimer(Some(self.hwnd), TIMER_HOVER);
        }
    }
}
