#![windows_subsystem = "windows"]

use std::env;
use std::io::{BufRead, BufReader, Write};
use std::net::TcpStream;
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::ptr::{null, null_mut};
use std::sync::atomic::{AtomicBool, AtomicI32, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use serde_json::Value;
use webview2::*;
use winapi::shared::minwindef::*;
use winapi::shared::windef::*;
use winapi::um::libloaderapi::GetModuleHandleW;
use winapi::um::shellapi::*;
use winapi::um::winbase::CREATE_NO_WINDOW;
use winapi::um::winnt::*;
use winapi::um::winreg::*;
use winapi::um::winuser::*;

struct SendSync<T>(pub T);
unsafe impl<T> Send for SendSync<T> {}
unsafe impl<T> Sync for SendSync<T> {}

const WM_CUSTOM_EXEC_SCRIPT: UINT = WM_USER + 1;
const WM_TRAY_CALLBACK: UINT = WM_USER + 2;

const TRAY_ID_TOGGLE: usize = 1001;
const TRAY_ID_RECENTER: usize = 1002;
const TRAY_ID_TUCK: usize = 1003;
const TRAY_ID_AUTOSTART: usize = 1004;
const TRAY_ID_PHONELINK: usize = 1005;
const TRAY_ID_QUIT: usize = 1006;

static IS_EXPANDED: AtomicBool = AtomicBool::new(false);
static IS_PINNED: AtomicBool = AtomicBool::new(false);
static IS_TUCKED: AtomicBool = AtomicBool::new(false);
static LAST_IGNORE_STATE: AtomicBool = AtomicBool::new(false);
static CURRENT_HEIGHT: AtomicI32 = AtomicI32::new(240);

// Thread-safe script queue to dispatch JS calls onto the UI STA thread
static SCRIPT_QUEUE: Mutex<Vec<String>> = Mutex::new(Vec::new());
static BRIDGE_STDIN: Mutex<Option<ChildStdin>> = Mutex::new(None);
static GLOBAL_HWND: Mutex<Option<usize>> = Mutex::new(None);
static GLOBAL_CONTROLLER: Mutex<Option<SendSync<Controller>>> = Mutex::new(None);
static GLOBAL_WEBVIEW: Mutex<Option<SendSync<WebView>>> = Mutex::new(None);

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

fn post_js_to_ui(script: String) {
    if let Ok(mut queue) = SCRIPT_QUEUE.lock() {
        queue.push(script);
    }
    if let Ok(guard) = GLOBAL_HWND.lock() {
        if let Some(hwnd_val) = *guard {
            unsafe {
                PostMessageW(hwnd_val as HWND, WM_CUSTOM_EXEC_SCRIPT, 0, 0);
            }
        }
    }
}

fn send_bridge_command(cmd: &str) {
    let clean = cmd.trim();
    if clean.is_empty() {
        return;
    }
    if let Ok(mut guard) = BRIDGE_STDIN.lock() {
        if let Some(ref mut stdin) = *guard {
            let _ = writeln!(stdin, "{}", clean);
            let _ = stdin.flush();
        }
    }
}

fn resolve_file_path(rel_paths: &[&str]) -> Option<PathBuf> {
    let exe_dir = env::current_exe().ok().and_then(|p| p.parent().map(|p| p.to_path_buf())).unwrap_or_default();
    let current_dir = env::current_dir().unwrap_or_default();

    for rel in rel_paths {
        let p1 = exe_dir.join(rel);
        if p1.exists() {
            return Some(p1);
        }
        let p2 = current_dir.join(rel);
        if p2.exists() {
            return Some(p2);
        }
        let p3 = exe_dir.join("..").join("..").join(rel);
        if p3.exists() {
            return Some(p3);
        }
    }
    None
}

fn is_autostart_enabled() -> bool {
    unsafe {
        let mut hkey: HKEY = null_mut();
        let subkey = to_wide("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
        if RegOpenKeyExW(HKEY_CURRENT_USER, subkey.as_ptr(), 0, KEY_READ, &mut hkey) == 0 {
            let value_name = to_wide("Ukikura");
            let mut val_type: DWORD = 0;
            let mut data_len: DWORD = 0;
            let status = RegQueryValueExW(
                hkey,
                value_name.as_ptr(),
                null_mut(),
                &mut val_type,
                null_mut(),
                &mut data_len,
            );
            RegCloseKey(hkey);
            status == 0
        } else {
            false
        }
    }
}

fn set_autostart_enabled(enable: bool) {
    unsafe {
        let mut hkey: HKEY = null_mut();
        let subkey = to_wide("Software\\Microsoft\\Windows\\CurrentVersion\\Run");
        if RegCreateKeyExW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            0,
            null_mut(),
            0,
            KEY_WRITE,
            null_mut(),
            &mut hkey,
            null_mut(),
        ) == 0
        {
            let value_name = to_wide("Ukikura");
            if enable {
                if let Ok(exe_path) = env::current_exe() {
                    let cmd_str = format!("\"{}\"", exe_path.to_string_lossy());
                    let wide_cmd = to_wide(&cmd_str);
                    let byte_len = (wide_cmd.len() * 2) as DWORD;
                    let _ = RegSetValueExW(
                        hkey,
                        value_name.as_ptr(),
                        0,
                        REG_SZ,
                        wide_cmd.as_ptr() as *const u8,
                        byte_len,
                    );
                }
            } else {
                let _ = RegDeleteValueW(hkey, value_name.as_ptr());
            }
            RegCloseKey(hkey);
        }
    }
}

fn spawn_background_server() -> Option<Child> {
    // Check if Kura Vault is already alive on 8089
    if TcpStream::connect("127.0.0.1:8089").is_ok() {
        println!("[Ukikura Rust] Kura Local Vault already active on port 8089.");
        return None;
    }

    let server_script = resolve_file_path(&[
        "dynamic-island/main/kura-server.js",
        "main/kura-server.js",
        "../../dynamic-island/main/kura-server.js",
    ]);

    let node_bin = resolve_file_path(&[
        "runtime/node.exe",
        "node.exe",
    ]).unwrap_or_else(|| PathBuf::from("node"));

    if let Some(script_path) = server_script {
        println!("[Ukikura Rust] Spawning headless Node worker: {:?} using {:?}", script_path, node_bin);
        match Command::new(&node_bin)
            .arg(&script_path)
            .arg("8089")
            .creation_flags(CREATE_NO_WINDOW)
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            Ok(child) => return Some(child),
            Err(e) => eprintln!("[Ukikura Rust] Failed to spawn node worker: {:?}", e),
        }
    } else {
        eprintln!("[Ukikura Rust] Could not find kura-server.js");
    }
    None
}

fn spawn_bridge_process() -> Option<Child> {
    let bridge_exe = resolve_file_path(&[
        "dynamic-island/bridge/ukikura-bridge.exe",
        "bridge/ukikura-bridge.exe",
        "../../dynamic-island/bridge/ukikura-bridge.exe",
        "ukikura-bridge.exe",
    ]);

    let exe_path = match bridge_exe {
        Some(p) => p,
        None => {
            eprintln!("[Ukikura Rust] Could not find ukikura-bridge.exe");
            return None;
        }
    };

    println!("[Ukikura Rust] Launching native hardware bridge: {:?}", exe_path);
    let mut child = match Command::new(&exe_path)
        .creation_flags(CREATE_NO_WINDOW)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[Ukikura Rust] Failed to spawn bridge: {:?}", e);
            return None;
        }
    };

    if let Some(stdin) = child.stdin.take() {
        if let Ok(mut guard) = BRIDGE_STDIN.lock() {
            *guard = Some(stdin);
        }
    }

    if let Some(stdout) = child.stdout.take() {
        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line_res in reader.lines() {
                if let Ok(line) = line_res {
                    let trimmed = line.trim();
                    if !trimmed.starts_with('{') {
                        continue;
                    }
                    if let Ok(val) = serde_json::from_str::<Value>(trimmed) {
                        if let Some(msg_type) = val.get("type").and_then(|t| t.as_str()) {
                            match msg_type {
                                "media" => {
                                    let script = format!(
                                        "window.dispatchEvent(new CustomEvent('ipc-media-update', {{ detail: {} }}));",
                                        trimmed
                                    );
                                    post_js_to_ui(script);
                                }
                                "notifs" => {
                                    let items = val.get("items").unwrap_or(&Value::Null);
                                    let script = format!(
                                        "window.dispatchEvent(new CustomEvent('ipc-notif-update', {{ detail: {} }}));",
                                        items
                                    );
                                    post_js_to_ui(script);
                                }
                                "power" => {
                                    let script = format!(
                                        "window.dispatchEvent(new CustomEvent('ipc-power-update', {{ detail: {} }}));",
                                        trimmed
                                    );
                                    post_js_to_ui(script);
                                }
                                "volume" => {
                                    let script = format!(
                                        "window.dispatchEvent(new CustomEvent('ipc-volume-update', {{ detail: {} }}));",
                                        trimmed
                                    );
                                    post_js_to_ui(script);
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
        });
    }

    Some(child)
}

fn set_island_size(hwnd: HWND, expand: bool) {
    let screen_w = unsafe { GetSystemMetrics(SM_CXSCREEN) };
    let win_w = 580;
    let new_h = if expand { 520 } else { 240 };
    let x = (screen_w - win_w) / 2;

    IS_EXPANDED.store(expand, Ordering::Relaxed);
    CURRENT_HEIGHT.store(new_h, Ordering::Relaxed);

    unsafe {
        SetWindowPos(
            hwnd,
            HWND_TOPMOST,
            x,
            0,
            win_w,
            new_h,
            SWP_NOACTIVATE | SWP_NOMOVE,
        );
    }

    if let Ok(guard) = GLOBAL_CONTROLLER.lock() {
        if let Some(ref controller) = *guard {
            let rect = RECT {
                left: 0,
                top: 0,
                right: win_w,
                bottom: new_h,
            };
            let _ = controller.0.put_bounds(rect);
        }
    }

    let script = format!(
        "window.dispatchEvent(new CustomEvent('ipc-nusa-state', {{ detail: {{ expanded: {} }} }}));",
        expand
    );
    post_js_to_ui(script);
}

fn show_tray_menu(hwnd: HWND) {
    unsafe {
        let hmenu = CreatePopupMenu();
        if hmenu.is_null() {
            return;
        }

        let mut pt: POINT = std::mem::zeroed();
        GetCursorPos(&mut pt);

        let item1 = to_wide("Tampilkan / Sembunyikan Ukikura");
        let item2 = to_wide("Reset Posisi ke Tengah Atas");
        let item3 = to_wide("Lipat / Buka dari Bezel Atas");
        let item4 = to_wide(if is_autostart_enabled() {
            "✓ Jalankan Otomatis Saat Windows Menyala"
        } else {
            "  Jalankan Otomatis Saat Windows Menyala"
        });
        let item5 = to_wide("Buka Phone Link Windows (Notifikasi HP)");
        let item6 = to_wide("Keluar dari Ukikura");

        AppendMenuW(hmenu, MF_STRING, TRAY_ID_TOGGLE, item1.as_ptr());
        AppendMenuW(hmenu, MF_STRING, TRAY_ID_RECENTER, item2.as_ptr());
        AppendMenuW(hmenu, MF_STRING, TRAY_ID_TUCK, item3.as_ptr());
        AppendMenuW(hmenu, MF_SEPARATOR, 0, null());
        AppendMenuW(hmenu, MF_STRING, TRAY_ID_AUTOSTART, item4.as_ptr());
        AppendMenuW(hmenu, MF_STRING, TRAY_ID_PHONELINK, item5.as_ptr());
        AppendMenuW(hmenu, MF_SEPARATOR, 0, null());
        AppendMenuW(hmenu, MF_STRING, TRAY_ID_QUIT, item6.as_ptr());

        SetForegroundWindow(hwnd);
        TrackPopupMenuEx(
            hmenu,
            TPM_RIGHTBUTTON | TPM_BOTTOMALIGN,
            pt.x,
            pt.y,
            hwnd,
            null_mut(),
        );
        DestroyMenu(hmenu);
    }
}

unsafe extern "system" fn window_proc(
    hwnd: HWND,
    msg: UINT,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    match msg {
        WM_CUSTOM_EXEC_SCRIPT => {
            if let Ok(mut queue) = SCRIPT_QUEUE.lock() {
                let scripts: Vec<String> = queue.drain(..).collect();
                if let Ok(guard) = GLOBAL_WEBVIEW.lock() {
                    if let Some(ref webview) = *guard {
                        for s in scripts {
                            let _ = webview.0.execute_script(&s, |_| Ok(()));
                        }
                    }
                }
            }
            0
        }
        WM_TRAY_CALLBACK => {
            let event = lparam as UINT;
            if event == WM_LBUTTONUP {
                let current = IS_EXPANDED.load(Ordering::Relaxed);
                set_island_size(hwnd, !current);
            } else if event == WM_RBUTTONUP {
                show_tray_menu(hwnd);
            }
            0
        }
        WM_COMMAND => {
            let id = LOWORD(wparam as DWORD) as usize;
            match id {
                TRAY_ID_TOGGLE => {
                    let visible = IsWindowVisible(hwnd) != 0;
                    ShowWindow(hwnd, if visible { SW_HIDE } else { SW_SHOW });
                }
                TRAY_ID_RECENTER => {
                    let screen_w = GetSystemMetrics(SM_CXSCREEN);
                    let x = (screen_w - 580) / 2;
                    let h = CURRENT_HEIGHT.load(Ordering::Relaxed);
                    SetWindowPos(hwnd, HWND_TOPMOST, x, 0, 580, h, SWP_NOACTIVATE);
                    ShowWindow(hwnd, SW_SHOW);
                }
                TRAY_ID_TUCK => {
                    let current = IS_TUCKED.load(Ordering::Relaxed);
                    IS_TUCKED.store(!current, Ordering::Relaxed);
                    post_js_to_ui("window.dispatchEvent(new CustomEvent('ipc-toggle-tuck', { detail: {} }));".to_string());
                }
                TRAY_ID_AUTOSTART => {
                    let current = is_autostart_enabled();
                    set_autostart_enabled(!current);
                    let script = format!(
                        "window.dispatchEvent(new CustomEvent('ipc-autostart-state', {{ detail: {} }}));",
                        !current
                    );
                    post_js_to_ui(script);
                }
                TRAY_ID_PHONELINK => {
                    let op = to_wide("open");
                    let uri = to_wide("ms-phone:");
                    ShellExecuteW(null_mut(), op.as_ptr(), uri.as_ptr(), null(), null(), SW_SHOWNORMAL);
                }
                TRAY_ID_QUIT => {
                    PostQuitMessage(0);
                }
                _ => {}
            }
            0
        }
        WM_DESTROY => {
            PostQuitMessage(0);
            0
        }
        _ => DefWindowProcW(hwnd, msg, wparam, lparam),
    }
}

fn main() {
    env::set_var("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "00000000");

    let _node_proc = spawn_background_server();
    let _bridge_proc = spawn_bridge_process();

    unsafe {
        let hinstance = GetModuleHandleW(null());
        let class_name = to_wide("UkikuraRustClass");

        let mut wc: WNDCLASSEXW = std::mem::zeroed();
        wc.cbSize = std::mem::size_of::<WNDCLASSEXW>() as UINT;
        wc.style = CS_HREDRAW | CS_VREDRAW;
        wc.lpfnWndProc = Some(window_proc);
        wc.hInstance = hinstance;
        wc.lpszClassName = class_name.as_ptr();
        wc.hCursor = LoadCursorW(null_mut(), IDC_ARROW);
        RegisterClassExW(&wc);

        let screen_width = GetSystemMetrics(SM_CXSCREEN);
        let win_width = 580;
        let win_height = 240;
        let x = (screen_width - win_width) / 2;
        let y = 0;

        let window_title = to_wide("Ukikura (浮倉) — Nusa Dynamic Island");

        let hwnd = CreateWindowExW(
            WS_EX_TOPMOST | WS_EX_TOOLWINDOW | WS_EX_LAYERED,
            class_name.as_ptr(),
            window_title.as_ptr(),
            WS_POPUP | WS_VISIBLE,
            x,
            y,
            win_width,
            win_height,
            null_mut(),
            null_mut(),
            hinstance,
            null_mut(),
        );

        if hwnd.is_null() {
            eprintln!("[Ukikura Rust] Failed to create window");
            return;
        }

        SetLayeredWindowAttributes(hwnd, 0, 255, LWA_ALPHA);

        if let Ok(mut guard) = GLOBAL_HWND.lock() {
            *guard = Some(hwnd as usize);
        }

        // Setup System Tray Icon
        let mut nid: NOTIFYICONDATAW = std::mem::zeroed();
        nid.cbSize = std::mem::size_of::<NOTIFYICONDATAW>() as DWORD;
        nid.hWnd = hwnd;
        nid.uID = 1;
        nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP;
        nid.uCallbackMessage = WM_TRAY_CALLBACK;
        nid.hIcon = LoadIconW(null_mut(), IDI_APPLICATION);
        let tip = to_wide("Ukikura (浮倉) — Dynamic Island & Gudang Tugas");
        for (i, c) in tip.iter().take(127).enumerate() {
            nid.szTip[i] = *c;
        }
        Shell_NotifyIconW(NIM_ADD, &mut nid);

        let local_app_data = env::var("LOCALAPPDATA").unwrap_or_else(|_| ".".to_string());
        let user_data = PathBuf::from(local_app_data).join("Ukikura").join("WebView2");
        let _ = std::fs::create_dir_all(&user_data);

        let builder = Environment::builder();
        let builder = builder.with_user_data_folder(&user_data);

        let hwnd_usize = hwnd as usize;

        builder
            .build(move |env_res| {
                let env = match env_res {
                    Ok(e) => e,
                    Err(err) => {
                        eprintln!("[Ukikura Rust] Failed to create WebView2 environment: {:?}", err);
                        return Ok(());
                    }
                };

                let hwnd = hwnd_usize as HWND;
                env.create_controller(hwnd, move |controller_res| {
                    let controller = match controller_res {
                        Ok(c) => c,
                        Err(err) => {
                            eprintln!("[Ukikura Rust] Failed to create controller: {:?}", err);
                            return Ok(());
                        }
                    };

                    let rect = RECT {
                        left: 0,
                        top: 0,
                        right: 580,
                        bottom: 240,
                    };
                    let _ = controller.put_bounds(rect);

                    if let Ok(c2) = controller.get_controller2() {
                        let transparent = webview2_sys::Color { a: 0, r: 0, g: 0, b: 0 };
                        let _ = c2.put_default_background_color(transparent);
                    }

                    if let Ok(guard) = GLOBAL_CONTROLLER.lock() {
                        let mut g = guard;
                        *g = Some(SendSync(controller.clone()));
                    }

                    if let Ok(webview) = controller.get_webview() {
                        if let Ok(settings) = webview.get_settings() {
                            let _ = settings.put_is_status_bar_enabled(false);
                            let _ = settings.put_are_default_context_menus_enabled(false);
                            let _ = settings.put_is_zoom_control_enabled(false);
                        }

                        let _ = webview.add_script_to_execute_on_document_created(
                            "window.__UKIKURA_RUST_NATIVE__ = true;",
                            |_| Ok(()),
                        );

                        // Listen to IPC web messages from renderer
                        let hwnd_capture = hwnd as usize;
                        let _ = webview.add_web_message_received(move |_wv, args| {
                            if let Ok(json_str) = args.get_web_message_as_json() {
                                if let Ok(val) = serde_json::from_str::<Value>(&json_str) {
                                    let channel = val.get("channel").and_then(|c| c.as_str()).unwrap_or("");
                                    let args_arr = val.get("args").and_then(|a| a.as_array());

                                    match channel {
                                        "island-resize" => {
                                            let expand = args_arr.and_then(|a| a.get(0)).and_then(|v| v.as_bool()).unwrap_or(false);
                                            set_island_size(hwnd_capture as HWND, expand);
                                        }
                                        "island-pin" => {
                                            let pin = args_arr.and_then(|a| a.get(0)).and_then(|v| v.as_bool()).unwrap_or(false);
                                            IS_PINNED.store(pin, Ordering::Relaxed);
                                        }
                                        "island-tuck" => {
                                            let tuck = args_arr.and_then(|a| a.get(0)).and_then(|v| v.as_bool()).unwrap_or(false);
                                            IS_TUCKED.store(tuck, Ordering::Relaxed);
                                            if tuck {
                                                set_island_size(hwnd_capture as HWND, false);
                                            }
                                        }
                                        "media-control" => {
                                            if let Some(cmd) = args_arr.and_then(|a| a.get(0)).and_then(|v| v.as_str()) {
                                                send_bridge_command(cmd);
                                            }
                                        }
                                        "media-seek" => {
                                            if let Some(sec) = args_arr.and_then(|a| a.get(0)).and_then(|v| v.as_f64()) {
                                                send_bridge_command(&format!("SEEK:{:.2}", sec));
                                            }
                                        }
                                        "volume-set" => {
                                            if let Some(pct) = args_arr.and_then(|a| a.get(0)).and_then(|v| v.as_i64()) {
                                                send_bridge_command(&format!("VOLSET:{}", pct));
                                            }
                                        }
                                        "volume-change" => {
                                            if let Some(delta) = args_arr.and_then(|a| a.get(0)).and_then(|v| v.get("delta")).and_then(|d| d.as_f64()) {
                                                send_bridge_command(&format!("VOL:{:+.3}", delta));
                                            }
                                        }
                                        "volume-mute" => {
                                            send_bridge_command("VOLMUTE");
                                        }
                                        "volume-get" => {
                                            send_bridge_command("VOLGET");
                                        }
                                        "island-open-url" => {
                                            let target_url = val.get("url").and_then(|u| u.as_str())
                                                .or_else(|| args_arr.and_then(|a| a.get(0)).and_then(|u| u.as_str()));
                                            if let Some(u) = target_url {
                                                let op = to_wide("open");
                                                let wide_u = to_wide(u);
                                                ShellExecuteW(null_mut(), op.as_ptr(), wide_u.as_ptr(), null(), null(), SW_SHOWNORMAL);
                                            }
                                        }
                                        "island-open-phonelink" => {
                                            let op = to_wide("open");
                                            let uri = to_wide("ms-phone:");
                                            ShellExecuteW(null_mut(), op.as_ptr(), uri.as_ptr(), null(), null(), SW_SHOWNORMAL);
                                        }
                                        "island-recenter" => {
                                            let screen_w = GetSystemMetrics(SM_CXSCREEN);
                                            let x = (screen_w - 580) / 2;
                                            let h = CURRENT_HEIGHT.load(Ordering::Relaxed);
                                            SetWindowPos(hwnd_capture as HWND, HWND_TOPMOST, x, 0, 580, h, SWP_NOACTIVATE);
                                        }
                                        "island-get-version" => {
                                            let ver_script = "window.dispatchEvent(new CustomEvent('ipc-version-info', { detail: { versionName: '1.0.6', versionCode: 51, name: 'Ukikura (Rust Native)' } }));".to_string();
                                            post_js_to_ui(ver_script);
                                        }
                                        "island-get-autostart" => {
                                            let script = format!(
                                                "window.dispatchEvent(new CustomEvent('ipc-autostart-state', {{ detail: {} }}));",
                                                is_autostart_enabled()
                                            );
                                            post_js_to_ui(script);
                                        }
                                        "island-toggle-autostart" => {
                                            let next = !is_autostart_enabled();
                                            set_autostart_enabled(next);
                                            let script = format!(
                                                "window.dispatchEvent(new CustomEvent('ipc-autostart-state', {{ detail: {} }}));",
                                                next
                                            );
                                            post_js_to_ui(script);
                                        }
                                        "island-quit" => {
                                            PostQuitMessage(0);
                                        }
                                        _ => {}
                                    }
                                }
                            }
                            Ok(())
                        });

                        if let Ok(guard) = GLOBAL_WEBVIEW.lock() {
                            let mut g = guard;
                            *g = Some(SendSync(webview.clone()));
                        }

                        let html_path = resolve_file_path(&[
                            "dynamic-island/renderer/index.html",
                            "renderer/index.html",
                            "../../dynamic-island/renderer/index.html",
                        ]);

                        if let Some(p) = html_path {
                            let uri = format!("file:///{}", p.to_string_lossy().replace('\\', "/"));
                            println!("[Ukikura Rust] Navigating to: {}", uri);
                            let _ = webview.navigate(&uri);
                        } else {
                            eprintln!("[Ukikura Rust] Could not find renderer/index.html");
                        }
                    }

                    Ok(())
                })?;

                Ok(())
            })
            .expect("WebView2 build failed");

        // Hover Loop Thread
        let hwnd_loop = hwnd as usize;
        thread::spawn(move || {
            let hwnd = hwnd_loop as HWND;
            let screen_w = GetSystemMetrics(SM_CXSCREEN);
            let center_x = screen_w / 2;

            let mut last_pt_x = -9999;
            let mut last_pt_y = -9999;
            let mut hover_open_start: Option<Instant> = None;
            let mut leave_close_start: Option<Instant> = None;

            loop {
                thread::sleep(Duration::from_millis(16));
                let mut pt: POINT = std::mem::zeroed();
                if GetCursorPos(&mut pt) != 0 {
                    let tucked = IS_TUCKED.load(Ordering::Relaxed);
                    let expanded = IS_EXPANDED.load(Ordering::Relaxed);
                    let pinned = IS_PINNED.load(Ordering::Relaxed);

                    if tucked {
                        let need_ignore = true;
                        if need_ignore != LAST_IGNORE_STATE.load(Ordering::Relaxed) {
                            LAST_IGNORE_STATE.store(need_ignore, Ordering::Relaxed);
                            let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
                            SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style | (WS_EX_TRANSPARENT as i32));
                        }
                        continue;
                    }

                    if expanded {
                        hover_open_start = None;
                        // Expanded notch active area: 520px wide (half: 270px), up to 500px high
                        let inside_open = pt.x >= (center_x - 270)
                            && pt.x <= (center_x + 270)
                            && pt.y >= 0
                            && pt.y <= 500;

                        if inside_open || pinned {
                            leave_close_start = None;
                            let need_ignore = false;
                            if need_ignore != LAST_IGNORE_STATE.load(Ordering::Relaxed) {
                                LAST_IGNORE_STATE.store(need_ignore, Ordering::Relaxed);
                                let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
                                SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style & !(WS_EX_TRANSPARENT as i32));
                            }
                        } else {
                            // Cursor left expanded area: auto collapse after 250ms
                            let start = leave_close_start.get_or_insert_with(Instant::now);
                            if start.elapsed() >= Duration::from_millis(250) {
                                leave_close_start = None;
                                set_island_size(hwnd, false);
                                LAST_IGNORE_STATE.store(true, Ordering::Relaxed);
                                let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
                                SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style | (WS_EX_TRANSPARENT as i32));
                            }
                        }
                    } else {
                        leave_close_start = None;
                        let half_w = 95;
                        let in_notch_x = pt.x >= (center_x - half_w) && pt.x <= (center_x + half_w);
                        let touching_top = in_notch_x && pt.y >= 0 && pt.y <= 3;
                        let inside_notch = in_notch_x && pt.y >= 0 && pt.y <= 28;

                        if touching_top {
                            let start = hover_open_start.get_or_insert_with(Instant::now);
                            if start.elapsed() >= Duration::from_millis(110) {
                                hover_open_start = None;
                                set_island_size(hwnd, true);
                            }
                        } else {
                            hover_open_start = None;
                        }

                        let need_ignore = !inside_notch && !touching_top;
                        if need_ignore != LAST_IGNORE_STATE.load(Ordering::Relaxed) {
                            LAST_IGNORE_STATE.store(need_ignore, Ordering::Relaxed);
                            let ex_style = GetWindowLongW(hwnd, GWL_EXSTYLE);
                            if need_ignore {
                                SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style | (WS_EX_TRANSPARENT as i32));
                            } else {
                                SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style & !(WS_EX_TRANSPARENT as i32));
                            }
                        }

                        // Mascot eyes tracking cursor
                        if (pt.x - last_pt_x).abs() > 4 || (pt.y - last_pt_y).abs() > 4 {
                            last_pt_x = pt.x;
                            last_pt_y = pt.y;
                            let dx = pt.x - center_x;
                            let dy = pt.y - 15;
                            let script = format!(
                                "window.dispatchEvent(new CustomEvent('ipc-nusa-cursor', {{ detail: {{ dx: {}, dy: {} }} }}));",
                                dx, dy
                            );
                            post_js_to_ui(script);
                        }
                    }
                }
            }
        });

        // Windows Message Loop
        let mut msg: MSG = std::mem::zeroed();
        while GetMessageW(&mut msg, null_mut(), 0, 0) > 0 {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        // Cleanup
        Shell_NotifyIconW(NIM_DELETE, &mut nid);
    }
}
