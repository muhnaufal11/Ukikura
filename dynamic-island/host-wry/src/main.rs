#![windows_subsystem = "windows"]
mod bridge;
mod hover;
mod ipc;
mod paths;
mod tray;

use std::sync::atomic::Ordering;
use std::sync::Arc;
use tao::{
    dpi::{LogicalPosition, LogicalSize},
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoopBuilder, EventLoopProxy},
    window::WindowBuilder,
};
use wry::{
    http::{header::CONTENT_TYPE, Response},
    WebViewBuilder,
};

#[cfg(target_os = "windows")]
use tao::platform::windows::WindowExtWindows;
use windows::Win32::Foundation::HWND;
use windows::Win32::Graphics::Dwm::DwmExtendFrameIntoClientArea;
use windows::Win32::UI::Controls::MARGINS;

use bridge::BridgeManager;
use hover::{start_hover_loop, HoverState};
use paths::resolve_renderer_dir;
use tray::TrayIcon;

const WINDOW_WIDTH: f64 = 580.0;
const WINDOW_HEIGHT: f64 = 240.0;

#[derive(Debug)]
pub enum UserEvent {
    EvalJs(String),
    DispatchBridgeJson(String),
    SetExpanded(bool),
    ToggleTuck,
    Recenter,
    Quit,
}

fn mime_for_path(path: &str) -> &'static str {
    if path.ends_with(".html") || path.ends_with(".htm") {
        "text/html; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".js") || path.ends_with(".mjs") {
        "application/javascript; charset=utf-8"
    } else if path.ends_with(".json") {
        "application/json; charset=utf-8"
    } else if path.ends_with(".svg") {
        "image/svg+xml"
    } else if path.ends_with(".png") {
        "image/png"
    } else if path.ends_with(".jpg") || path.ends_with(".jpeg") {
        "image/jpeg"
    } else if path.ends_with(".webp") {
        "image/webp"
    } else if path.ends_with(".ico") {
        "image/x-icon"
    } else if path.ends_with(".woff2") {
        "font/woff2"
    } else if path.ends_with(".woff") {
        "font/woff"
    } else if path.ends_with(".ttf") {
        "font/ttf"
    } else {
        "application/octet-stream"
    }
}

fn main() -> wry::Result<()> {
    let event_loop = EventLoopBuilder::<UserEvent>::with_user_event().build();
    let proxy: EventLoopProxy<UserEvent> = event_loop.create_proxy();

    // Dapatkan ukuran monitor utama untuk penempatan horizontal tengah (y = 0)
    let primary_monitor = event_loop.primary_monitor();
    let (screen_w, _screen_h) = if let Some(ref m) = primary_monitor {
        let size = m.size().to_logical::<f64>(m.scale_factor());
        (size.width, size.height)
    } else {
        (1920.0, 1080.0)
    };

    let start_x = ((screen_w - WINDOW_WIDTH) / 2.0).round();
    let start_y = 0.0;

    let mut builder = WindowBuilder::new()
        .with_title("Ukikura")
        .with_inner_size(LogicalSize::new(WINDOW_WIDTH, WINDOW_HEIGHT))
        .with_position(LogicalPosition::new(start_x, start_y))
        .with_decorations(false)
        .with_transparent(true)
        .with_always_on_top(true)
        .with_resizable(false);

    #[cfg(target_os = "windows")]
    {
        use tao::platform::windows::WindowBuilderExtWindows;
        builder = builder.with_skip_taskbar(true);
        builder = builder.with_undecorated_shadow(false);
    }

    let window = builder.build(&event_loop).unwrap();

    #[cfg(target_os = "windows")]
    let hwnd_raw = window.hwnd() as isize;

    // Terapkan DWM Blur behind frame agar transparansi bebas dari kotak hitam
    unsafe {
        let margins = MARGINS {
            cxLeftWidth: -1,
            cxRightWidth: -1,
            cyTopHeight: -1,
            cyBottomHeight: -1,
        };
        let _ = DwmExtendFrameIntoClientArea(HWND(hwnd_raw as _), &margins);
    }

    let renderer_dir = resolve_renderer_dir();
    let renderer_dir_clone = renderer_dir.clone();

    let hover_state = Arc::new(HoverState::new());
    let bridge_mgr = BridgeManager::new();

    // Mulai bridge C++ native
    bridge_mgr.start(proxy.clone());

    // Mulai Nusa hover loop (hit-testing & click-through dinamis)
    start_hover_loop(hwnd_raw, start_x, WINDOW_WIDTH, hover_state.clone(), proxy.clone());

    // Inisialisasi System Tray Icon
    let _tray = TrayIcon::new(hwnd_raw);

    // IPC Shim Script yang disuntikkan ke window sebelum skrip renderer dieksekusi
    let init_script = r#"
        (function() {
            window.__UKIKURA_NATIVE_HOST__ = true;
            window.__UKIKURA_VERSION__ = "1.0.6";

            // IPC Adapter untuk menyambungkan frontend yang sebelumnya memakai Electron ipcRenderer
            window.electronCompat = {
                send: function(channel, data) {
                    if (window.ipc && window.ipc.postMessage) {
                        window.ipc.postMessage(JSON.stringify({ channel: channel, payload: data }));
                    }
                },
                on: function(channel, callback) {
                    window.addEventListener('ukikura-event-' + channel, function(e) {
                        callback(null, e.detail);
                    });
                },
                invoke: function(channel, data) {
                    return new Promise(function(resolve) {
                        var reqId = 'req_' + Math.random().toString(36).substring(2, 9);
                        function handler(e) {
                            if (e.detail && e.detail.__reqId === reqId) {
                                window.removeEventListener('ukikura-invoke-response', handler);
                                resolve(e.detail.result);
                            }
                        }
                        window.addEventListener('ukikura-invoke-response', handler);
                        window.electronCompat.send(channel, { __reqId: reqId, data: data });
                    });
                }
            };

            window.ipcRenderer = window.electronCompat;
            console.log('[Ukikura Host] Native tao + wry IPC bridge initialized successfully.');
        })();
    "#;

    let bridge_mgr_clone = bridge_mgr.clone();
    let hover_state_clone = hover_state.clone();

    let webview_builder = WebViewBuilder::new()
        .with_transparent(true)
        .with_background_color((0, 0, 0, 0))
        .with_initialization_script(init_script)
        .with_custom_protocol("ukikura".into(), move |_webview_id, request| {
            let path_str = request.uri().path();
            let rel_path = if path_str == "/" || path_str.is_empty() {
                "index.html"
            } else {
                path_str.trim_start_matches('/')
            };

            let target_file = renderer_dir_clone.join(rel_path);

            if target_file.exists() && target_file.is_file() {
                match std::fs::read(&target_file) {
                    Ok(bytes) => {
                        let mime = mime_for_path(rel_path);
                        Response::builder()
                            .header(CONTENT_TYPE, mime)
                            .header("Access-Control-Allow-Origin", "*")
                            .body(bytes.into())
                            .unwrap_or_else(|_| {
                                Response::builder()
                                    .status(500)
                                    .body("Response build error".as_bytes().to_vec().into())
                                    .unwrap()
                            })
                    }
                    Err(e) => Response::builder()
                        .status(500)
                        .body(format!("Read error: {}", e).as_bytes().to_vec().into())
                        .unwrap(),
                }
            } else {
                Response::builder()
                    .status(404)
                    .body(format!("File not found: {}", rel_path).as_bytes().to_vec().into())
                    .unwrap()
            }
        })
        .with_ipc_handler(move |req| {
            let body = req.body();
            ipc::handle_ipc_message(body, &bridge_mgr_clone, &hover_state_clone);
        })
        .with_url("ukikura://localhost/index.html");

    #[cfg(any(
        target_os = "windows",
        target_os = "macos",
        target_os = "ios",
        target_os = "android"
    ))]
    let webview = webview_builder.build(&window)?;

    println!("[Ukikura Host] Berjalan di atas tao + wry WebView2. HWND: 0x{:X}", hwnd_raw);

    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Wait;

        match event {
            Event::UserEvent(user_event) => match user_event {
                UserEvent::EvalJs(js) => {
                    let _ = webview.evaluate_script(&js);
                }
                UserEvent::DispatchBridgeJson(json_str) => {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&json_str) {
                        if let Some(msg_type) = val.get("type").and_then(|t| t.as_str()) {
                            let (channel, payload_str) = match msg_type {
                                "media" => ("media-update", json_str.clone()),
                                "notifs" => {
                                    let items = val.get("items").map(|i| i.to_string()).unwrap_or_else(|| "[]".into());
                                    ("notif-update", items)
                                }
                                "power" => ("power-update", json_str.clone()),
                                "volume" => ("volume-update", json_str.clone()),
                                "window_state" => ("window-state", json_str.clone()),
                                _ => ("", String::new()),
                            };

                            if !channel.is_empty() {
                                let js = format!(
                                    "window.dispatchEvent(new CustomEvent('ukikura-event-{}', {{ detail: {} }}));",
                                    channel, payload_str
                                );
                                let _ = webview.evaluate_script(&js);
                            }
                        }
                    }
                }
                UserEvent::SetExpanded(expanded) => {
                    hover_state.is_expanded.store(expanded, Ordering::Relaxed);
                    let js = format!("if (window.setIslandExpanded) {{ window.setIslandExpanded({}); }}", expanded);
                    let _ = webview.evaluate_script(&js);
                }
                UserEvent::ToggleTuck => {
                    let cur = hover_state.is_tucked.load(Ordering::Relaxed);
                    hover_state.is_tucked.store(!cur, Ordering::Relaxed);
                    let js = format!("if (window.setIslandTucked) {{ window.setIslandTucked({}); }}", !cur);
                    let _ = webview.evaluate_script(&js);
                }
                UserEvent::Recenter => {
                    window.set_outer_position(LogicalPosition::new(start_x, start_y));
                }
                UserEvent::Quit => {
                    *control_flow = ControlFlow::Exit;
                }
            },
            Event::WindowEvent {
                event: WindowEvent::CloseRequested,
                ..
            } => {
                *control_flow = ControlFlow::Exit;
            }
            _ => {}
        }
    });
}
