use std::io::{BufRead, BufReader, Write};
use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::{ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tao::event_loop::EventLoopProxy;

use crate::paths::{resolve_bridge_exe, resolve_kura_server_js};
use crate::UserEvent;

const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Clone)]
pub struct BridgeManager {
    stdin: Arc<Mutex<Option<ChildStdin>>>,
}

impl BridgeManager {
    pub fn new() -> Self {
        Self {
            stdin: Arc::new(Mutex::new(None)),
        }
    }

    pub fn send_command(&self, cmd: &str) {
        let clean = cmd.trim();
        if clean.is_empty() {
            return;
        }
        if let Ok(mut lock) = self.stdin.lock() {
            if let Some(ref mut stdin) = *lock {
                let _ = writeln!(stdin, "{}", clean);
                let _ = stdin.flush();
            }
        }
    }

    pub fn start(&self, proxy: EventLoopProxy<UserEvent>) {
        setup_job_object();

        // 1. Jalankan kura-server.js jika node tersedia di sistem
        start_kura_server();

        // 2. Jalankan ukikura-bridge.exe (C++ Native Bridge)
        let bridge_path = match resolve_bridge_exe() {
            Some(p) => p,
            None => {
                eprintln!("[BridgeManager] ukikura-bridge.exe tidak ditemukan di lokasi standar.");
                return;
            }
        };

        println!("[BridgeManager] Menjalankan bridge: {:?}", bridge_path);

        let mut child = match Command::new(&bridge_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
        {
            Ok(c) => c,
            Err(e) => {
                eprintln!("[BridgeManager] Gagal memulai ukikura-bridge.exe: {}", e);
                return;
            }
        };

        if let Some(stdin) = child.stdin.take() {
            if let Ok(mut lock) = self.stdin.lock() {
                *lock = Some(stdin);
            }
        }

        let stdout = match child.stdout.take() {
            Some(s) => s,
            None => return,
        };

        thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line_res in reader.lines() {
                if let Ok(line) = line_res {
                    let trimmed = line.trim();
                    if trimmed.starts_with('{') {
                        let _ = proxy.send_event(UserEvent::DispatchBridgeJson(trimmed.to_string()));
                    }
                }
            }
        });
    }
}

fn setup_job_object() {
    use windows::Win32::System::JobObjects::*;
    use windows::Win32::System::Threading::GetCurrentProcess;

    unsafe {
        let job = match CreateJobObjectW(None, None) {
            Ok(j) => j,
            Err(_) => return,
        };

        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

        let _ = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const std::ffi::c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );

        let _ = AssignProcessToJobObject(job, GetCurrentProcess());
    }
}

fn start_kura_server() {
    let kura_js = match resolve_kura_server_js() {
        Some(p) => p,
        None => return,
    };

    // Cari node.exe
    let node_candidates = [
        crate::paths::get_exe_dir().join("runtime").join("node.exe"),
        crate::paths::get_exe_dir().join("node.exe"),
        PathBuf::from("node.exe"),
    ];

    let node_exe = node_candidates
        .iter()
        .find(|p| p.exists())
        .cloned()
        .unwrap_or_else(|| PathBuf::from("node"));

    let _ = Command::new(&node_exe)
        .arg(&kura_js)
        .arg("8089")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}
