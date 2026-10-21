//! Autostart Windows via HKCU\Software\Microsoft\Windows\CurrentVersion\Run.

use windows::core::{w, PCWSTR};
use windows::Win32::System::Registry::*;

use crate::paths;

const RUN_KEY: PCWSTR = w!("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
const VALUE_NAME: PCWSTR = w!("Ukikura");

fn open_run_key(access: REG_SAM_FLAGS) -> Option<HKEY> {
    let mut key = HKEY::default();
    let rc = unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, RUN_KEY, None, access, &mut key) };
    if rc.is_ok() { Some(key) } else { None }
}

fn expected_command() -> String {
    let exe = std::env::current_exe().unwrap_or_default();
    format!("\"{}\"", exe.to_string_lossy())
}

pub fn is_enabled() -> bool {
    let Some(key) = open_run_key(KEY_READ) else { return false };
    let mut buf = [0u16; 1024];
    let mut size = (buf.len() * 2) as u32;
    let rc = unsafe {
        RegQueryValueExW(key, VALUE_NAME, None, None, Some(buf.as_mut_ptr() as *mut u8), Some(&mut size))
    };
    unsafe {
        let _ = RegCloseKey(key);
    }
    if rc.is_err() {
        return false;
    }
    let len = (size as usize / 2).saturating_sub(1);
    let value = String::from_utf16_lossy(&buf[..len.min(buf.len())]);
    value.eq_ignore_ascii_case(&expected_command())
}

pub fn set_enabled(enable: bool) {
    let Some(key) = open_run_key(KEY_SET_VALUE) else { return };
    unsafe {
        if enable {
            let cmd = paths::to_wide(&expected_command());
            let bytes = std::slice::from_raw_parts(cmd.as_ptr() as *const u8, cmd.len() * 2);
            let _ = RegSetValueExW(key, VALUE_NAME, None, REG_SZ, Some(bytes));
        } else {
            let _ = RegDeleteValueW(key, VALUE_NAME);
        }
        let _ = RegCloseKey(key);
    }
}
