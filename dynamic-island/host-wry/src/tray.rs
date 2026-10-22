#![allow(dead_code)]
use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use windows::core::PCWSTR;
use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Shell::{
    Shell_NotifyIconW, NIF_ICON, NIF_MESSAGE, NIF_TIP, NIM_ADD, NIM_DELETE, NOTIFYICONDATAW,
};
use windows::Win32::UI::WindowsAndMessaging::{
    CreatePopupMenu, DestroyMenu, GetCursorPos, InsertMenuW, LoadImageW, SetForegroundWindow,
    TrackPopupMenu, IMAGE_ICON, LR_DEFAULTSIZE, LR_LOADFROMFILE, MF_BYPOSITION, MF_SEPARATOR,
    MF_STRING, TPM_BOTTOMALIGN, TPM_LEFTALIGN, TPM_RETURNCMD,
};

use crate::paths::resolve_icon_path;

pub const WM_TRAY_CALLBACK: u32 = windows::Win32::UI::WindowsAndMessaging::WM_USER + 101;

pub const TRAY_CMD_TOGGLE: u32 = 2001;
pub const TRAY_CMD_RECENTER: u32 = 2002;
pub const TRAY_CMD_TUCK: u32 = 2003;
pub const TRAY_CMD_QUIT: u32 = 2004;

pub struct TrayIcon {
    hwnd: HWND,
    nid: NOTIFYICONDATAW,
}

impl TrayIcon {
    pub fn new(hwnd_val: isize) -> Option<Self> {
        let hwnd = HWND(hwnd_val as _);
        let icon_path = resolve_icon_path()?;
        let icon_wide: Vec<u16> = OsStr::new(icon_path.as_os_str())
            .encode_wide()
            .chain(Some(0))
            .collect();

        unsafe {
            let h_icon = LoadImageW(
                None,
                PCWSTR(icon_wide.as_ptr()),
                IMAGE_ICON,
                0,
                0,
                LR_LOADFROMFILE | LR_DEFAULTSIZE,
            );

            let h_icon = match h_icon {
                Ok(h) => windows::Win32::UI::WindowsAndMessaging::HICON(h.0),
                Err(_) => return None,
            };

            let mut nid = NOTIFYICONDATAW::default();
            nid.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as u32;
            nid.hWnd = hwnd;
            nid.uID = 1;
            nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
            nid.uCallbackMessage = WM_TRAY_CALLBACK;
            nid.hIcon = h_icon;

            let tip = "Ukikura (浮倉) — Dynamic Island\0".encode_utf16().collect::<Vec<u16>>();
            let copy_len = tip.len().min(nid.szTip.len());
            nid.szTip[..copy_len].copy_from_slice(&tip[..copy_len]);

            if Shell_NotifyIconW(NIM_ADD, &nid).as_bool() {
                Some(Self { hwnd, nid })
            } else {
                None
            }
        }
    }

    pub fn show_context_menu(&self) -> u32 {
        unsafe {
            let menu = match CreatePopupMenu() {
                Ok(m) => m,
                Err(_) => return 0,
            };

            let str_expand: Vec<u16> = "Buka / Tutup Kapsul\0".encode_utf16().collect();
            let str_recenter: Vec<u16> = "Tengahkan Pulau (Recenter)\0".encode_utf16().collect();
            let str_tuck: Vec<u16> = "Mode Lipat (Tuck)\0".encode_utf16().collect();
            let str_quit: Vec<u16> = "Keluar Ukikura\0".encode_utf16().collect();

            let _ = InsertMenuW(menu, 0, MF_BYPOSITION | MF_STRING, TRAY_CMD_TOGGLE as usize, PCWSTR(str_expand.as_ptr()));
            let _ = InsertMenuW(menu, 1, MF_BYPOSITION | MF_STRING, TRAY_CMD_RECENTER as usize, PCWSTR(str_recenter.as_ptr()));
            let _ = InsertMenuW(menu, 2, MF_BYPOSITION | MF_STRING, TRAY_CMD_TUCK as usize, PCWSTR(str_tuck.as_ptr()));
            let _ = InsertMenuW(menu, 3, MF_BYPOSITION | MF_SEPARATOR, 0, PCWSTR::null());
            let _ = InsertMenuW(menu, 4, MF_BYPOSITION | MF_STRING, TRAY_CMD_QUIT as usize, PCWSTR(str_quit.as_ptr()));

            let mut pt = windows::Win32::Foundation::POINT::default();
            let _ = GetCursorPos(&mut pt);
            let _ = SetForegroundWindow(self.hwnd);

            let cmd = TrackPopupMenu(
                menu,
                TPM_RETURNCMD | TPM_LEFTALIGN | TPM_BOTTOMALIGN,
                pt.x,
                pt.y,
                Some(0),
                self.hwnd,
                None,
            );

            let _ = DestroyMenu(menu);
            cmd.0 as u32
        }
    }
}

impl Drop for TrayIcon {
    fn drop(&mut self) {
        unsafe {
            let _ = Shell_NotifyIconW(NIM_DELETE, &self.nid);
        }
    }
}
