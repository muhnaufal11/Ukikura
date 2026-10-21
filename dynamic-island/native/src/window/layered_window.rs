//! Pembuatan jendela overlay: tanpa bingkai, selalu di atas (band paling atas),
//! tidak muncul di taskbar, tidak merebut fokus, dan dikomposisikan via DirectComposition.

use windows::core::{w, Result, PCWSTR};
use windows::Win32::Foundation::*;
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::HiDpi::GetDpiForWindow;
use windows::Win32::UI::WindowsAndMessaging::*;

pub const CLASS_NAME: PCWSTR = w!("UkikuraNativeIsland");

/// Ukuran kanvas logis (sama seperti versi Electron) agar animasi pegas tidak terpotong.
pub const CANVAS_W: f32 = 580.0;
pub const CANVAS_H: f32 = 240.0;

pub fn register_class(wndproc: WNDPROC) -> Result<()> {
    unsafe {
        let hinstance = GetModuleHandleW(None)?;
        let wc = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            style: CS_HREDRAW | CS_VREDRAW,
            lpfnWndProc: wndproc,
            hInstance: hinstance.into(),
            hCursor: LoadCursorW(None, IDC_ARROW)?,
            lpszClassName: CLASS_NAME,
            ..Default::default()
        };
        if RegisterClassExW(&wc) == 0 {
            GetLastError().ok()?;
        }
        Ok(())
    }
}

pub fn create_window() -> Result<HWND> {
    unsafe {
        let hinstance = GetModuleHandleW(None)?;
        let ex = WS_EX_NOREDIRECTIONBITMAP
            | WS_EX_TOPMOST
            | WS_EX_TOOLWINDOW
            | WS_EX_NOACTIVATE
            | WS_EX_LAYERED
            | WS_EX_TRANSPARENT;
        let hwnd = CreateWindowExW(
            ex,
            CLASS_NAME,
            w!("Ukikura Dynamic Island"),
            WS_POPUP,
            0,
            0,
            CANVAS_W as i32,
            CANVAS_H as i32,
            None,
            None,
            Some(hinstance.into()),
            None,
        )?;
        // Jendela layered wajib diberi atribut sebelum tampil; alpha penuh, piksel diatur DComp.
        SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_ALPHA)?;
        Ok(hwnd)
    }
}

pub fn dpi_scale(hwnd: HWND) -> f32 {
    let dpi = unsafe { GetDpiForWindow(hwnd) };
    if dpi == 0 { 1.0 } else { dpi as f32 / 96.0 }
}

/// Monitor tempat jendela berada (rect fisik penuh, bukan work area: island menempel ke bezel atas).
pub fn monitor_rect(hwnd: HWND) -> RECT {
    unsafe {
        let mon = MonitorFromWindow(hwnd, MONITOR_DEFAULTTOPRIMARY);
        let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
        let _ = GetMonitorInfoW(mon, &mut mi);
        mi.rcMonitor
    }
}

/// Menempatkan kanvas di tengah atas monitor (y = 0) dengan ukuran sesuai DPI.
pub fn place_top_center(hwnd: HWND, scale: f32) -> (i32, i32, u32, u32) {
    let mr = monitor_rect(hwnd);
    let w = (CANVAS_W * scale).round() as i32;
    let h = (CANVAS_H * scale).round() as i32;
    let x = mr.left + ((mr.right - mr.left) - w) / 2;
    let y = mr.top;
    unsafe {
        let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), x, y, w, h, SWP_NOACTIVATE | SWP_SHOWWINDOW);
    }
    (x, y, w as u32, h as u32)
}

/// Klik-tembus: saat aktif, semua input mouse diteruskan ke jendela di bawahnya.
pub fn set_click_through(hwnd: HWND, enabled: bool) {
    unsafe {
        let ex = GetWindowLongPtrW(hwnd, GWL_EXSTYLE) as u32;
        let flag = WS_EX_TRANSPARENT.0;
        let next = if enabled { ex | flag } else { ex & !flag };
        if next != ex {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, next as isize);
        }
    }
}

/// Re-assert band topmost (beberapa aplikasi fullscreen bisa menurunkan z-order).
pub fn reassert_topmost(hwnd: HWND) {
    unsafe {
        let _ = SetWindowPos(hwnd, Some(HWND_TOPMOST), 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    }
}

pub fn _invalidate(hwnd: HWND) {
    unsafe {
        let _ = InvalidateRect(Some(hwnd), None, false);
    }
}
