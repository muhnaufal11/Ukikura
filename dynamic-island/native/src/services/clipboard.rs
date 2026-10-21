//! Pemantau Clipboard Berbasis Event Windows (WM_CLIPBOARDUPDATE, 0% CPU Polling).

use std::time::{SystemTime, UNIX_EPOCH};
use windows::Win32::Foundation::*;
use windows::Win32::System::DataExchange::*;
use windows::Win32::System::Memory::*;

#[derive(Clone, Debug, PartialEq)]
pub enum ContentType {
    Text,
    Url,
    Code,
    Image,
}

#[derive(Clone, Debug)]
pub struct ClipboardItem {
    pub id: String,
    pub content_type: ContentType,
    pub content: String,
    pub preview: String,
    pub char_count: usize,
    pub timestamp: u64,
}

fn detect_type(text: &str) -> ContentType {
    let t = text.trim();
    if t.starts_with("http://") || t.starts_with("https://") {
        return ContentType::Url;
    }
    let code_keywords = [
        "function", "const", "let", "var", "class", "import", "export", "return", "if", "else",
        "for", "while", "pub fn", "impl", "struct", "async", "await", "SELECT ", "UPDATE ",
    ];
    let code_symbols = ["=>", "===", "!==", "::", "()", "{}", "];"];
    if code_keywords.iter().any(|k| t.contains(k)) || code_symbols.iter().any(|s| t.contains(s)) {
        return ContentType::Code;
    }
    ContentType::Text
}

pub struct ClipboardService {
    pub history: Vec<ClipboardItem>,
    last_text: String,
}

impl ClipboardService {
    pub fn new() -> Self {
        Self {
            history: Vec::with_capacity(16),
            last_text: String::new(),
        }
    }

    pub fn listen(&self, hwnd: HWND) {
        unsafe {
            let _ = AddClipboardFormatListener(hwnd);
        }
    }

    pub fn unlisten(&self, hwnd: HWND) {
        unsafe {
            let _ = RemoveClipboardFormatListener(hwnd);
        }
    }

    /// Dipanggil langsung saat pesan OS `WM_CLIPBOARDUPDATE` tiba.
    pub fn on_update(&mut self) -> Option<ClipboardItem> {
        unsafe {
            if OpenClipboard(None).is_err() {
                return None;
            }
            let h_data = GetClipboardData(13); // CF_UNICODETEXT = 13
            let result = if let Ok(handle) = h_data {
                if !handle.0.is_null() {
                    let ptr = GlobalLock(HGLOBAL(handle.0)) as *const u16;
                    if !ptr.is_null() {
                        let mut len = 0;
                        while *ptr.add(len) != 0 {
                            len += 1;
                        }
                        let slice = std::slice::from_raw_parts(ptr, len);
                        let text = String::from_utf16_lossy(slice);
                        let _ = GlobalUnlock(HGLOBAL(handle.0));
                        Some(text)
                    } else {
                        None
                    }
                } else {
                    None
                }
            } else {
                None
            };
            let _ = CloseClipboard();

            if let Some(text) = result {
                let trimmed = text.trim();
                if !trimmed.is_empty() && trimmed != self.last_text {
                    self.last_text = trimmed.to_string();
                    let content_type = detect_type(trimmed);
                    let preview = if trimmed.len() > 140 {
                        format!("{}...", &trimmed[..140])
                    } else {
                        trimmed.to_string()
                    };
                    let now = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs();

                    let item = ClipboardItem {
                        id: format!("clip_{now}"),
                        content_type,
                        content: trimmed.to_string(),
                        preview,
                        char_count: trimmed.len(),
                        timestamp: now,
                    };

                    self.history.retain(|x| x.content != item.content);
                    self.history.insert(0, item.clone());
                    if self.history.len() > 15 {
                        self.history.truncate(15);
                    }
                    return Some(item);
                }
            }
        }
        None
    }

    pub fn get_history(&self) -> Vec<ClipboardItem> {
        self.history.clone()
    }

    pub fn clear(&mut self) {
        self.history.clear();
        self.last_text.clear();
    }
}

pub fn copy_to_clipboard(text: &str) {
    unsafe {
        if OpenClipboard(None).is_err() {
            return;
        }
        let _ = EmptyClipboard();
        let wide: Vec<u16> = text.encode_utf16().chain(std::iter::once(0)).collect();
        let bytes_len = wide.len() * 2;
        if let Ok(handle) = GlobalAlloc(GMEM_MOVEABLE, bytes_len) {
            let ptr = GlobalLock(handle) as *mut u16;
            if !ptr.is_null() {
                std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr, wide.len());
                let _ = GlobalUnlock(handle);
                let _ = SetClipboardData(13, Some(HANDLE(handle.0)));
            }
        }
        let _ = CloseClipboard();
    }
}
