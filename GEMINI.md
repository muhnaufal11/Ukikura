# ATURAN WAJIB ARSITEKTUR & PEMISAHAN FOLDER (UNTUK SEMUA AGEN AI)

Dokumen ini adalah **aturan tertinggi (Mandatory Workspace Rule)** yang **WAJIB ditaati oleh seluruh Agen AI** (Antigravity, Gemini, Claude, Cursor, Copilot, Cline, Windsurf, dll.) saat membaca, memodifikasi, atau mengembangkan proyek di `D:\projek ssr`.

---

## 1. Pemisahan Mutlak Dua Proyek (`dynamic-island/` vs `asisten-lms/`)

Workspace ini terdiri dari **2 subsistem yang terpisah foldernya**. **DILARANG KERAS** mencampur kode Dynamic Island ke dalam folder Asisten LMS atau sebaliknya, dan **DILARANG** membuat file monolitik baru di root `D:\projek ssr`.

### A. Folder `D:\projek ssr\dynamic-island\` — Aplikasi Desktop Nusa Dynamic Island
Seluruh pengembangan UI kapsul Dynamic Island, lirik musik, notifikasi WA/HP, baterai Bluetooth/Phone Link, kalender, maskot, dan jembatan WinRT **WAJIB** berada di dalam `dynamic-island/` dengan struktur modular berikut:

- **`dynamic-island/main.js`** — Entry point utama proses Electron (Window, Hover Loop, Tray, IPC Routing).
- **`dynamic-island/main/`** — Modul-modul proses utama (Main Process):
  - `winrt-client.js` — Spawner `winrt-bridge.ps1`, parser event JSON, & pengirim perintah media.
  - `whatsapp-companion.js` — Jendela pendamping WhatsApp Web & detektor chat/stiker realtime.
  - `lms-crawler.js` — Jendela Login SSO LMS & background Moodle scraper.
  - `autostart.js` — Pengelola Windows Startup (`NusaDynamicIsland.vbs` & Registry).
- **`dynamic-island/bridge/`** — Skrip native OS:
  - `winrt-bridge.ps1` — Jembatan PowerShell WinRT (SMTC Media, Toast/Phone Link Notifications, Bluetooth/USB Battery).
- **`dynamic-island/lyrics/`** — Mesin Lirik Multi-Sumber & Forced Alignment:
  - `index.js` — Pipeline utama `getCompleteSyncedLyrics`.
  - `http-client.js` — HTTP/InnerTube client berbasis native `fetch()`.
  - `text-romaji.js` — Transliterasi Kana/Kanji ke Romaji (`kanaToRomaji`), parser LRC, normalisasi teks.
  - `providers.js` — Konektor database lirik (NetEase Cloud Music, LRCLIB, KuGou Music).
  - `youtube-captions.js` — Ekstraktor subtitle asli YouTube (`.srv3` TimedText Manual CC & Auto-ASR).
  - `forced-alignment.js` — Mesin Audio-to-Text Forced Alignment & RANSAC Global Offset.
- **`dynamic-island/renderer/`** — Antarmuka Pengguna (UI Renderer) yang sudah dipecah:
  - `index.html` — **HANYA** kerangka markup HTML (~400 baris). **DILARANG** menaruh ribuan baris CSS atau JS inline di dalam `index.html`!
  - `styles/core-notch.css` — Variabel CSS, kapsul Dynamic Island, animasi mata maskot, & Peek Popup.
  - `styles/pages-media-notif.css` — CSS Halaman Musik, Lirik, Notifikasi WA/HP, & Baterai.
  - `styles/pages-lms-tools.css` — CSS Halaman LMS Todolist, Pomodoro Focus, File Shelf, & Pengaturan.
  - `styles/calendar-modals.css` — CSS Halaman Kalender Pintar & Modal.
  - `js/core-state.js` — State global UI, navigasi halaman (`setPage`), dan interaksi dasar kapsul.
  - `js/music-lyrics.js` — Logika UI pemutar musik, sampul album, interpolasi waktu SMTC, & lirik tersinkronisasi.
  - `js/power-bluetooth.js` — Logika UI baterai laptop, status cas, baterai HP, & perangkat Bluetooth/USB.
  - `js/notifications-wa.js` — Logika UI daftar notifikasi WhatsApp/HP & Peek Popup.
  - `js/lms-pomodoro.js` — Logika UI LMS Todolist, hitung mundur deadline, & Pomodoro Timer.
  - `js/shelf-actions.js` — Logika UI File Shelf (Island Gulp Canvas) & tombol aksi global + SSE stream.
  - `js/smart-calendar.js` — Logika UI Kalender Pintar, jadwal deadline LMS, & agenda pribadi.
  - `js/mascot-engine.js` — Fisika mata maskot Nusa (11 emosi, pelacakan kursor, floating emote).

### B. Folder `D:\projek ssr\asisten-lms\` — Asisten Kuis LMS & MITM Proxy (SEB Edition)
Seluruh pengembangan proxy lokal MITM, injeksi skrip kuis SEB, manajemen sertifikat CA, dan sinkronisasi API LMS **WAJIB** berada di dalam `asisten-lms/`:

- `asisten-lms/server.js` — Server proxy HTTP/HTTPS & endpoint `/__qbot__/*`.
- `asisten-lms/lms-sync.js` — Sinkronisasi jadwal/tugas LMS via iCal & Moodle Cookie.
- `asisten-lms/task-store.js` & `asisten-lms/tasks.json` — Penyimpanan data tugas LMS.
- `asisten-lms/config-store.js` & `asisten-lms/config.json` — Penyimpanan konfigurasi API & sesi.
- `asisten-lms/cert-manager.js`, `asisten-lms/generate-ca.js`, & `asisten-lms/certs/` — Sertifikat SSL/CA lokal.
- `asisten-lms/payload.js`, `asisten-lms/lms-assistant.user.js`, & `asisten-lms/frontend/` — Payload UI asisten kuis LMS.

---

## 2. Aturan Anti-Monolitik (Batas Ukuran File)
1. **DILARANG KERAS** menggabungkan kembali CSS/JS ke dalam satu file HTML raksasa.
2. Setiap file modul baru atau hasil edit **maksimal ~500–600 baris**. Jika sebuah modul tumbuh melebihi batas tersebut, pecah menjadi sub-modul sesuai tanggung jawabnya (*Single Responsibility Principle*).
3. File `island-main.js`, `lyrics-engine.js`, dan `server.js` di root `D:\projek ssr\` hanyalah **shim delegasi 1 baris** untuk menjaga kompatibilitas mundur (*backward compatibility*) dengan shortcut Windows Startup. Jangan menulis logika di file shim tersebut.
