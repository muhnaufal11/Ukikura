#![windows_subsystem = "windows"]
//! Ukikura Dynamic Island — versi full native (Rust + Direct2D + DirectComposition).

mod app;
mod lyrics;
mod pages;
mod paths;
mod services;
mod ui;
mod window;

use std::cell::RefCell;

use windows::core::{w, Result};
use windows::Win32::Foundation::*;
use windows::Win32::System::Com::{CoInitializeEx, COINIT_APARTMENTTHREADED};
use windows::Win32::System::Threading::CreateMutexW;
use windows::Win32::UI::HiDpi::{SetProcessDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2};
use windows::Win32::UI::WindowsAndMessaging::*;

use app::{App, Mode, TIMER_HOVER, WM_APP_FRAME};
use window::{autostart, layered_window as lw, tray};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");

thread_local! {
    static APP: RefCell<Option<App>> = const { RefCell::new(None) };
}

fn with_app<R>(f: impl FnOnce(&mut App) -> R) -> Option<R> {
    APP.with(|cell| cell.try_borrow_mut().ok().and_then(|mut a| a.as_mut().map(f)))
}

fn handle_command(hwnd: HWND, cmd: u32) {
    match cmd {
        tray::CMD_EXPAND => {
            with_app(|a| {
                if !a.visible {
                    a.set_visible(true);
                }
                a.set_mode(Mode::Expanded);
            });
        }
        tray::CMD_TOGGLE_VISIBLE => {
            with_app(|a| a.set_visible(!a.visible));
        }
        tray::CMD_RECENTER => {
            with_app(|a| {
                a.set_visible(true);
                a.recenter();
            });
        }
        tray::CMD_TUCK => {
            with_app(|a| {
                let next = if a.mode == Mode::Tucked { Mode::Closed } else { Mode::Tucked };
                a.set_mode(next);
            });
        }
        tray::CMD_AUTOSTART => autostart::set_enabled(!autostart::is_enabled()),
        tray::CMD_QUIT => unsafe {
            let _ = DestroyWindow(hwnd);
        },
        _ => {}
    }
}

fn open_menu(hwnd: HWND) {
    let visible = with_app(|a| a.visible).unwrap_or(true);
    let cmd = tray::show_menu(hwnd, visible, autostart::is_enabled(), VERSION);
    if cmd != 0 {
        handle_command(hwnd, cmd);
    }
}

extern "system" fn wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match msg {
        WM_APP_FRAME => {
            with_app(|a| a.on_frame());
            LRESULT(0)
        }
        WM_TIMER if wparam.0 == TIMER_HOVER => {
            with_app(|a| a.on_hover_tick());
            LRESULT(0)
        }
        WM_LBUTTONUP => {
            with_app(|a| a.on_click());
            LRESULT(0)
        }
        WM_RBUTTONUP => {
            open_menu(hwnd);
            LRESULT(0)
        }
        WM_MOUSEACTIVATE => LRESULT(MA_NOACTIVATE as isize),
        tray::WM_TRAY => {
            let event = (lparam.0 & 0xFFFF) as u32;
            if event == WM_RBUTTONUP || event == WM_CONTEXTMENU {
                open_menu(hwnd);
            } else if event == WM_LBUTTONUP {
                handle_command(hwnd, tray::CMD_EXPAND);
            }
            LRESULT(0)
        }
        WM_DPICHANGED | WM_DISPLAYCHANGE => {
            with_app(|a| a.on_dpi_or_display_changed());
            LRESULT(0)
        }
        WM_MOUSEWHEEL => {
            let delta = ((wparam.0 >> 16) as i16) as f32 / 120.0;
            with_app(|a| a.on_wheel(delta));
            LRESULT(0)
        }
        WM_CLIPBOARDUPDATE => {
            with_app(|a| a.on_clipboard_update());
            LRESULT(0)
        }
        WM_DESTROY => {
            tray::remove(hwnd);
            with_app(|a| a.shutdown());
            unsafe { PostQuitMessage(0) };
            LRESULT(0)
        }
        _ => unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
    }
}

pub fn log_append(s: &str) {
    use std::io::Write;
    let log_path = paths::user_data_dir().join("boot.log");
    if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = writeln!(f, "{}", s);
    }
}

fn main() -> Result<()> {
    std::panic::set_hook(Box::new(|info| {
        log_append(&format!("PANIC: {:?}", info));
    }));
    log_append("--- 1. Starting main ---");
    unsafe {
        // Satu instance saja
        let _mutex = CreateMutexW(None, true, w!("Local\\UkikuraNativeSingleton"))?;
        log_append(&format!("2. Mutex created, err={:?}", GetLastError()));
        if GetLastError() == ERROR_ALREADY_EXISTS {
            if let Ok(existing) = FindWindowW(lw::CLASS_NAME, None) {
                if !existing.is_invalid() && existing.0 != 0 as _ {
                    log_append("2b. Existing window found, bringing to front & exiting");
                    let _ = ShowWindow(existing, SW_SHOW);
                    let _ = SetForegroundWindow(existing);
                    return Ok(());
                }
            }
        }
        let _ = SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

        log_append("3. Registering class");
        if let Err(e) = lw::register_class(Some(wndproc)) {
            log_append(&format!("3-err. register_class: {:?}", e));
            return Err(e);
        }
        log_append("4. Creating window");
        let hwnd = match lw::create_window() {
            Ok(h) => h,
            Err(e) => {
                log_append(&format!("4-err. create_window: {:?}", e));
                return Err(e);
            }
        };
        log_append("5. Creating App");
        let app = match App::new(hwnd) {
            Ok(a) => a,
            Err(e) => {
                log_append(&format!("5-err. App::new: {:?}", e));
                return Err(e);
            }
        };
        log_append("5b. App created successfully!");
        APP.with(|cell| *cell.borrow_mut() = Some(app));
        log_append("6. Adding tray");
        tray::add(hwnd);

        log_append("7. Entering message loop");
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).into() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
        log_append(&format!("8. Exited message loop: msg={}", msg.message));
        APP.with(|cell| *cell.borrow_mut() = None);
        Ok(())
    }
}
