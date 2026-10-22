use std::sync::atomic::Ordering;
use std::sync::Arc;
use serde_json::Value;

use crate::bridge::BridgeManager;
use crate::hover::HoverState;

pub fn handle_ipc_message(
    body: &str,
    bridge: &BridgeManager,
    hover_state: &Arc<HoverState>,
) -> Option<String> {
    let parsed: Value = match serde_json::from_str(body) {
        Ok(v) => v,
        Err(_) => return None,
    };

    let channel = parsed.get("channel")?.as_str()?;
    let payload = parsed.get("payload");

    match channel {
        // Kontrol Ukuran & Tampilan Kapsul
        "island-resize" => {
            let expanded = payload.and_then(|p| p.as_bool()).unwrap_or(false);
            hover_state.is_expanded.store(expanded, Ordering::Relaxed);
        }
        "island-pin" => {
            let pinned = payload.and_then(|p| p.as_bool()).unwrap_or(false);
            hover_state.is_pinned.store(pinned, Ordering::Relaxed);
        }
        "island-tuck" => {
            let tucked = payload.and_then(|p| p.as_bool()).unwrap_or(false);
            hover_state.is_tucked.store(tucked, Ordering::Relaxed);
        }
        "island-peek-active" => {
            let peek = payload.and_then(|p| p.as_bool()).unwrap_or(false);
            hover_state.is_peek_active.store(peek, Ordering::Relaxed);
        }

        // Kontrol Media & Volume ke C++ Bridge
        "media-control" => {
            if let Some(cmd) = payload.and_then(|p| p.as_str()) {
                bridge.send_command(cmd);
            }
        }
        "media-seek" => {
            if let Some(sec) = payload.and_then(|p| p.as_f64()) {
                bridge.send_command(&format!("seek {}", sec));
            }
        }
        "volume-set" => {
            if let Some(pct) = payload.and_then(|p| p.as_f64()) {
                bridge.send_command(&format!("volume {}", pct));
            }
        }
        "volume-mute" => {
            bridge.send_command("mute");
        }
        "volume-change" => {
            if let Some(delta) = payload.and_then(|p| p.get("delta")).and_then(|d| d.as_f64()) {
                bridge.send_command(&format!("volume_delta {}", delta));
            }
        }

        // Buka URL di Browser Standar
        "island-open-url" => {
            if let Some(url_str) = payload.and_then(|p| p.as_str()) {
                open_url(url_str);
            }
        }

        // Salin Teks ke Clipboard
        "clipboard-copy-text" => {
            if let Some(text) = payload.and_then(|p| p.as_str()) {
                copy_to_clipboard(text);
            }
        }

        _ => {}
    }

    None
}

fn open_url(url_str: &str) {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let wide: Vec<u16> = OsStr::new(url_str).encode_wide().chain(Some(0)).collect();
    let op: Vec<u16> = OsStr::new("open").encode_wide().chain(Some(0)).collect();

    unsafe {
        let _ = ShellExecuteW(
            None,
            PCWSTR(op.as_ptr()),
            PCWSTR(wide.as_ptr()),
            None,
            None,
            SW_SHOWNORMAL,
        );
    }
}

fn copy_to_clipboard(text: &str) {
    use windows::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData};
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GHND};

    let wide: Vec<u16> = text.encode_utf16().chain(Some(0)).collect();
    let bytes_len = wide.len() * std::mem::size_of::<u16>();

    unsafe {
        if OpenClipboard(None).is_ok() {
            let _ = EmptyClipboard();
            if let Ok(h_mem) = GlobalAlloc(GHND, bytes_len) {
                let ptr = GlobalLock(h_mem);
                if !ptr.is_null() {
                    std::ptr::copy_nonoverlapping(wide.as_ptr() as *const u8, ptr as *mut u8, bytes_len);
                    let _ = GlobalUnlock(h_mem);
                    let _ = SetClipboardData(13, Some(windows::Win32::Foundation::HANDLE(h_mem.0))); // 13 = CF_UNICODETEXT
                }
            }
            let _ = CloseClipboard();
        }
    }
}
