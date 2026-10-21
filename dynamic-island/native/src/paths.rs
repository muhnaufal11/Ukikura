//! Utilitas path & string lebar (UTF-16) untuk API Win32.

use std::path::PathBuf;

pub fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Mencari aset relatif terhadap folder exe, lalu naik beberapa level
/// (mendukung layout dev `native/target/release` maupun layout terinstal).
pub fn resolve(rel_paths: &[&str]) -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let mut dir = exe.parent()?.to_path_buf();
    for _ in 0..5 {
        for rel in rel_paths {
            for prefix in ["", "dynamic-island/"] {
                let candidate = dir.join(format!("{prefix}{rel}"));
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

/// Folder data pengguna (kompatibel dengan versi Electron: %APPDATA%\ukikura).
pub fn user_data_dir() -> PathBuf {
    let base = std::env::var_os("APPDATA").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
    base.join("ukikura")
}
