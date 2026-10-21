# Ukikura Dynamic Island — Tauri 2.0 & WebView2 Architecture (Solusi Tingkat 2)

Proyek ini adalah blueprint / scaffolding **Solusi Tingkat 2** untuk Ukikura Nusa Dynamic Island, yang memigrasikan backend desktop dari Electron (Chromium) ke **Tauri 2.0 (Rust + Windows WebView2)**.

---

## 🎯 Perbandingan Arsitektur: Solusi Tingkat 1 vs Tingkat 2

| Metrik | Arsitektur Awal (Patch 43) | Solusi Tingkat 1 (Patch 45) | Solusi Tingkat 2 (Tauri 2.0) |
|---|---|---|---|
| **Windows Bridge** | PowerShell script (126 MB RAM, 1-2% CPU) | **`ukikura-bridge.exe` Native C# (< 1 MB RAM, 0.0% CPU)** | Native Rust Windows API (0 MB bridge terpisah) |
| **WhatsApp Companion** | Polling DOM 5 detik (288 MB RAM) | **Smart Hibernation (35s saat hidden, 0ms live notif)** | WebView2 Child Window (~40 MB) |
| **Total Idle RAM** | ~550 MB | **~240 - 280 MB (Hemat > 250 MB)** | **~35 - 50 MB (Hemat > 500 MB)** |
| **Background CPU** | 1.5% - 3.5% | **0.1% - 0.4%** | **0.0% - 0.2%** |
| **Ukuran Installer** | ~85 MB (Chromium embedded) | ~85 MB (Inno Setup) | **~8 - 12 MB (WebView2 bawaan Windows)** |

---

## 🚀 Cara Menjalankan & Membangun Tauri Preview

### Persyaratan:
1. **Rust Toolchain**: `winget install Rustlang.Rustup` lalu jalankan `rustup default stable`.
2. **Microsoft C++ Build Tools** (atau Visual Studio Community dengan C++ workload).
3. **Tauri CLI**: `cargo install tauri-cli --version "^2.0"`.

### Perintah Pembangunan:
```bash
cd tauri-preview/src-tauri
cargo tauri dev      # Menjalankan dalam mode pengembangan
cargo tauri build    # Mengompilasi installer/binary release standalone (~10 MB)
```

Frontend aset langsung mengarah ke `../../dynamic-island/renderer/` tanpa perlu kompilasi bundler tambahan.
