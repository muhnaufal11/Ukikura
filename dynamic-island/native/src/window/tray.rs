//! Ikon tray + menu konteks (pengganti Tray/Menu Electron).

use windows::core::{w, PCWSTR};
use windows::Win32::Foundation::*;
use windows::Win32::UI::Shell::*;
use windows::Win32::UI::WindowsAndMessaging::*;

use crate::paths;

pub const WM_TRAY: u32 = WM_APP + 1;
const TRAY_UID: u32 = 1;

pub const CMD_EXPAND: u32 = 1001;
pub const CMD_TOGGLE_VISIBLE: u32 = 1002;
pub const CMD_RECENTER: u32 = 1003;
pub const CMD_TUCK: u32 = 1004;
pub const CMD_AUTOSTART: u32 = 1005;
pub const CMD_QUIT: u32 = 1099;

fn load_icon() -> HICON {
    unsafe {
        if let Some(p) = paths::resolve(&["renderer/icon.ico", "assets/icon.ico"]) {
            let wide = paths::to_wide(&p.to_string_lossy());
            if let Ok(h) = LoadImageW(None, PCWSTR(wide.as_ptr()), IMAGE_ICON, 0, 0, LR_LOADFROMFILE | LR_DEFAULTSIZE) {
                return HICON(h.0);
            }
        }
        LoadIconW(None, IDI_APPLICATION).unwrap_or_default()
    }
}

fn fill_tip(dst: &mut [u16; 128], text: &str) {
    for (i, c) in text.encode_utf16().take(127).enumerate() {
        dst[i] = c;
    }
}

pub fn add(hwnd: HWND) {
    unsafe {
        let mut nid = NOTIFYICONDATAW {
            cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
            hWnd: hwnd,
            uID: TRAY_UID,
            uFlags: NIF_ICON | NIF_MESSAGE | NIF_TIP,
            uCallbackMessage: WM_TRAY,
            hIcon: load_icon(),
            ..Default::default()
        };
        fill_tip(&mut nid.szTip, "Ukikura Dynamic Island");
        let _ = Shell_NotifyIconW(NIM_ADD, &nid);
    }
}

pub fn remove(hwnd: HWND) {
    unsafe {
        let nid = NOTIFYICONDATAW {
            cbSize: std::mem::size_of::<NOTIFYICONDATAW>() as u32,
            hWnd: hwnd,
            uID: TRAY_UID,
            ..Default::default()
        };
        let _ = Shell_NotifyIconW(NIM_DELETE, &nid);
    }
}

fn append(menu: HMENU, id: u32, text: &str, checked: bool) {
    let wide = paths::to_wide(text);
    let mut flags = MF_STRING;
    if checked {
        flags |= MF_CHECKED;
    }
    unsafe {
        let _ = AppendMenuW(menu, flags, id as usize, PCWSTR(wide.as_ptr()));
    }
}

/// Menampilkan menu tray/konteks di posisi kursor; mengembalikan ID perintah yang dipilih (0 = batal).
pub fn show_menu(hwnd: HWND, visible: bool, autostart: bool, version: &str) -> u32 {
    unsafe {
        let Ok(menu) = CreatePopupMenu() else { return 0 };
        append(menu, CMD_EXPAND, "Buka / Kembangkan Dynamic Island", false);
        append(menu, CMD_TOGGLE_VISIBLE, if visible { "Sembunyikan Ukikura" } else { "Tampilkan Ukikura" }, false);
        append(menu, CMD_RECENTER, "Reset Posisi ke Tengah Frame Atas", false);
        append(menu, CMD_TUCK, "Lipat / Buka dari Bezel Atas", false);
        let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
        append(menu, CMD_AUTOSTART, "Jalankan Otomatis Saat Windows Menyala", autostart);
        let ver = paths::to_wide(&format!("Ukikura v{version} (Native)"));
        let _ = AppendMenuW(menu, MF_STRING | MF_GRAYED, 0, PCWSTR(ver.as_ptr()));
        let _ = AppendMenuW(menu, MF_SEPARATOR, 0, PCWSTR::null());
        append(menu, CMD_QUIT, "Keluar dari Ukikura", false);

        let mut pt = POINT::default();
        let _ = windows::Win32::UI::WindowsAndMessaging::GetCursorPos(&mut pt);
        // Wajib agar menu tertutup saat klik di luar (dokumentasi TrackPopupMenu)
        let _ = SetForegroundWindow(hwnd);
        let cmd = TrackPopupMenu(
            menu,
            TPM_RETURNCMD | TPM_NONOTIFY | TPM_RIGHTBUTTON,
            pt.x,
            pt.y,
            None,
            hwnd,
            None,
        );
        let _ = DestroyMenu(menu);
        let _ = w!("");
        cmd.0 as u32
    }
}
