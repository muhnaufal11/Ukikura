//! Minimal native Windows HTTP client via WinHttp (no extra dependencies, uses system TLS).

use std::ffi::c_void;
use windows::core::{HSTRING, PCWSTR};
use windows::Win32::Networking::WinHttp::*;

pub fn http_get(url: &str) -> Result<String, String> {
    unsafe {
        let wide_url: Vec<u16> = url.encode_utf16().chain(std::iter::once(0)).collect();
        let mut comp = URL_COMPONENTS::default();
        comp.dwStructSize = std::mem::size_of::<URL_COMPONENTS>() as u32;
        comp.dwSchemeLength = u32::MAX;
        comp.dwHostNameLength = u32::MAX;
        comp.dwUrlPathLength = u32::MAX;
        comp.dwExtraInfoLength = u32::MAX;

        WinHttpCrackUrl(&wide_url, 0, &mut comp).map_err(|e| format!("CrackUrl: {}", e))?;

        let host = std::slice::from_raw_parts(comp.lpszHostName.0, comp.dwHostNameLength as usize);
        let host_hstring = HSTRING::from_wide(host);

        let path = std::slice::from_raw_parts(comp.lpszUrlPath.0, (comp.dwUrlPathLength + comp.dwExtraInfoLength) as usize);
        let path_hstring = HSTRING::from_wide(path);

        let is_https = url.starts_with("https://");
        let port = if comp.nPort > 0 { comp.nPort } else if is_https { 443 } else { 80 };

        let user_agent = HSTRING::from("Ukikura/2.0 (Windows Native)");
        let h_session = WinHttpOpen(
            PCWSTR(user_agent.as_ptr()),
            WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
            PCWSTR::null(),
            PCWSTR::null(),
            0,
        );
        if h_session.is_null() {
            return Err("WinHttpOpen failed".into());
        }

        let h_connect = WinHttpConnect(
            h_session,
            PCWSTR(host_hstring.as_ptr()),
            port,
            0,
        );
        if h_connect.is_null() {
            let _ = WinHttpCloseHandle(h_session);
            return Err("WinHttpConnect failed".into());
        }

        let flags = if is_https {
            WINHTTP_FLAG_SECURE
        } else {
            WINHTTP_OPEN_REQUEST_FLAGS(0)
        };

        let method = HSTRING::from("GET");
        let h_request = WinHttpOpenRequest(
            h_connect,
            PCWSTR(method.as_ptr()),
            PCWSTR(path_hstring.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            std::ptr::null(),
            flags,
        );
        if h_request.is_null() {
            let _ = WinHttpCloseHandle(h_connect);
            let _ = WinHttpCloseHandle(h_session);
            return Err("WinHttpOpenRequest failed".into());
        }

        let _ = WinHttpSetTimeouts(h_request, 4000, 4000, 4000, 4000);

        WinHttpSendRequest(
            h_request,
            None,
            None,
            0,
            0,
            0,
        ).map_err(|e| {
            let _ = WinHttpCloseHandle(h_request);
            let _ = WinHttpCloseHandle(h_connect);
            let _ = WinHttpCloseHandle(h_session);
            format!("SendRequest: {}", e)
        })?;

        WinHttpReceiveResponse(h_request, std::ptr::null_mut()).map_err(|e| {
            let _ = WinHttpCloseHandle(h_request);
            let _ = WinHttpCloseHandle(h_connect);
            let _ = WinHttpCloseHandle(h_session);
            format!("ReceiveResponse: {}", e)
        })?;

        let mut body = Vec::new();
        loop {
            let mut available = 0u32;
            if WinHttpQueryDataAvailable(h_request, &mut available).is_err() || available == 0 {
                break;
            }

            let mut buf = vec![0u8; available as usize];
            let mut read = 0u32;
            if WinHttpReadData(
                h_request,
                buf.as_mut_ptr() as *mut c_void,
                available,
                &mut read,
            ).is_err() || read == 0 {
                break;
            }
            body.extend_from_slice(&buf[..read as usize]);
        }

        let _ = WinHttpCloseHandle(h_request);
        let _ = WinHttpCloseHandle(h_connect);
        let _ = WinHttpCloseHandle(h_session);

        String::from_utf8(body).map_err(|e| format!("UTF-8 decode error: {}", e))
    }
}
