use std::path::PathBuf;

pub fn get_exe_dir() -> PathBuf {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn resolve_renderer_dir() -> PathBuf {
    let exe_dir = get_exe_dir();

    for ancestor in exe_dir.ancestors().take(5) {
        let p1 = ancestor.join("dynamic-island").join("renderer");
        if p1.join("index.html").exists() {
            return p1;
        }
        let p2 = ancestor.join("renderer");
        if p2.join("index.html").exists() {
            return p2;
        }
    }

    // Fallback relatif ke current working directory
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    for ancestor in cwd.ancestors().take(3) {
        let p1 = ancestor.join("dynamic-island").join("renderer");
        if p1.join("index.html").exists() {
            return p1;
        }
        let p2 = ancestor.join("renderer");
        if p2.join("index.html").exists() {
            return p2;
        }
    }

    PathBuf::from("dynamic-island").join("renderer")
}

pub fn resolve_bridge_exe() -> Option<PathBuf> {
    let exe_dir = get_exe_dir();

    for ancestor in exe_dir.ancestors().take(5) {
        let p1 = ancestor.join("dynamic-island").join("bridge").join("ukikura-bridge.exe");
        if p1.exists() {
            return Some(p1);
        }
        let p2 = ancestor.join("bridge").join("ukikura-bridge.exe");
        if p2.exists() {
            return Some(p2);
        }
    }

    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    for ancestor in cwd.ancestors().take(3) {
        let p1 = ancestor.join("dynamic-island").join("bridge").join("ukikura-bridge.exe");
        if p1.exists() {
            return Some(p1);
        }
        let p2 = ancestor.join("bridge").join("ukikura-bridge.exe");
        if p2.exists() {
            return Some(p2);
        }
    }

    None
}

pub fn resolve_icon_path() -> Option<PathBuf> {
    let exe_dir = get_exe_dir();

    for ancestor in exe_dir.ancestors().take(5) {
        let p1 = ancestor.join("assets").join("ukikura-logo.ico");
        if p1.exists() {
            return Some(p1);
        }
        let p2 = ancestor.join("dynamic-island").join("renderer").join("icon.ico");
        if p2.exists() {
            return Some(p2);
        }
    }

    None
}

pub fn resolve_kura_server_js() -> Option<PathBuf> {
    let exe_dir = get_exe_dir();

    for ancestor in exe_dir.ancestors().take(5) {
        let p1 = ancestor.join("dynamic-island").join("main").join("kura-server.js");
        if p1.exists() {
            return Some(p1);
        }
        let p2 = ancestor.join("main").join("kura-server.js");
        if p2.exists() {
            return Some(p2);
        }
    }

    None
}
