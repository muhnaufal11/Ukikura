# To-Do List Pengembangan Fitur Baru Ukikura (20 Ide Lengkap & Roadmap)

Daftar rencana pengembangan fitur baru untuk memperkuat **Ukikura** (*Uki* = Floating Island + *Kura* = Local Vault), dikelompokkan berdasarkan modul arsitekturnya.

---

## 1. Modul Musik, Audio, & Lirik (`music-lyrics.js` & `lyrics/`)

- [x] **1. Interactive Seek Bar & Volume Wheel**
  - Klik atau geser (*drag*) langsung pada garis durasi lagu (`#music-prog-1` / `#music-prog-2`) untuk melompat ke menit tertentu via perintah WinRT `TryChangePlaybackPositionAsync`.
  - *Scroll* roda mouse di atas sampul album untuk mengatur volume aplikasi pemutar musik secara langsung.

- [x] **2. Real-Time Audio Ambient Visualizer (WASAPI Loopback)**
  - Latar belakang aura (`.ambient`) dan pendaran sampul album di halaman musik & lirik berdenyut (*pulse & breathe*) mengikuti **frekuensi bass dan vokal asli** dari output audio Windows secara *real-time* via Web Audio API loopback stream (5 bar kapsul dipertahankan orisinal sesuai preferensi).

- [x] **3. Hierarki Lirik Multibahasa 3 Tingkat & Universal Cover Forced Alignment**
  - Teks utama (Kanji/Original) di atas, baris Romaji di bawahnya, dan baris terjemahan Bahasa Indonesia di bawah Romaji (dari `tlyric` NetEase / CC YouTube). Dilengkapi tombol toggle `[SUB: ON]` / `[SUB: OFF]` di samping badge `[SYNC]`.
  - Audio-to-Text Forced Alignment untuk lagu Cover, Remix, & Koplo dengan pengambilan lirik kanonikal bersih dari database (NetEase, LRCLIB, KuGou) tanpa penalti kemiripan.

- [x] **4. Mini Floating Karaoke Overlay (Mode Pin Transparan)**
  - Mode khusus kapsul ramping melayang (`480px x 54px`, radius `22px`) semi-transparan dengan blur latar belakang (`backdrop-filter: blur(28px)`) yang menampilkan 2 baris lirik (baris aktif + berikutnya / terjemahan), mini sampul lagu, tombol play/pause mini, tombol toggle sub `[≡]`, tombol perluas lirik `[⤢]`, dan tombol close `[✕]`. Klik tembus pandang otomatis saat kursor berada di luar kapsul.

---

## 2. Modul Kura Vault, File Shelf, & Akademik (`shelf-actions.js`, `lms-pomodoro.js`, & `smart-calendar.js`)

- [x] **5. Clipboard History & Snippet Vault di Halaman Shelf**
  - Menyimpan riwayat 15 teks, kode, tautan, atau gambar (*screenshot*) terakhir yang di-*copy* (`Ctrl+C`) secara otomatis ke dalam tab di halaman **File Shelf**, lengkap dengan filter kategori (`Semua`, `Kode`, `Link`, `Teks`, `Gambar`), badge warna tipe, tombol *Clear*, dan 1-klik salin ulang dengan feedback visual `✓ Tersalin!`.

- [x] **6. Drag-Out dari File Shelf ke Browser / WhatsApp**
  - Menarik (*drag*) file dari dalam rak File Shelf langsung keluar ke kolom *upload* tugas LMS di browser, chat WhatsApp, atau File Explorer menggunakan Electron native OS drag API (`event.sender.startDrag`). Dilengkapi indikator badge "Tarik keluar" dan petunjuk interaktif.

- [x] **7. Notifikasi Suara & Popup Peringatan Bertahap Deadline LMS**
  - Peringatan khusus tugas & kuis mendesak sisa $\le$ 5 jam (`check5HourQuizAlerts`) dengan *Peek Popup* otomatis di notch, pendaran merah darurat (`.urgent`), *Desktop Notification Toast*, serta chime audio Web Audio API (`window.playAudioAlert('urgent-quiz')`).

- [x] **8. Jadwal Matkul Mingguan & Bunyi Alarm Kuliah (iGracias Telkom University)**
  - Input & simpan jadwal perkuliahan mingguan (Hari, Jam Mulai/Selesai, Nama Mata Kuliah, Ruangan/Lab, dan Kelas):
    1. **Senin `13:30 - 16:30`**: `KOMPUTASI AWAN` (`BDK3CAB3`) · `CYCLO LAB.` · `SSISI-07-REG-01`
    2. **Selasa `10:30 - 12:30`**: `PROYEK PERANGKAT LUNAK` (`BDK3DAD3`) · `KTT2.03` · `SSISI-07-REG-04`
    3. **Selasa `13:30 - 16:30`**: `TATA KELOLA DAN MANAJEMEN TI` (`BDK3DA3`) · `B-CLG-105` · `SSISI-07-REG-01`
    4. **Rabu `10:30 - 12:30`**: `MANAJEMEN DATA ENTERPRISE` (`BDK3DAD3`) · `KTT2.17` · `SSISI-07-REG-01`
    5. **Rabu `13:30 - 16:30`**: `ARSITEKTUR ENTERPRISE` (`BDK3AAD3`) · `SE LAB.` · `SSISI-07-REG-02`
    6. **Kamis `07:30 - 10:30`**: `SISTEM INFORMASI AKUNTANSI` (`BAK2FAB3`) · `KTT2.04` · `SSISI-07-REG-01`
    7. **Kamis `10:30 - 13:30`**: `DATA WAREHOUSE & BUSINESS INTELLIGENCE` (`BAK3BA3`) · `KTT2.27` · `SSISI-07-REG-01`
    8. **Jumat `07:30 - 09:30`**: `BAHASA INGGRIS` (`UCK1ADA2`) · `KTT2.15` · `SSISI-07-REG-01`
  - Pengingat otomatis bertingkat (`H-30m`, `H-15m`, `H-10m`, `H-5m`, dan `Saat Kelas Mulai`) lengkap dengan **bunyi alarm chime Web Audio API**, *Peek Popup* otomatis di notch, serta opsi Matikan Alarm / Snooze 5 Menit.
  - Terintegrasi penuh dengan tombol **`Courses`** di Halaman Todo serta tampil berulang otomatis di **Smart Calendar** (`smart-calendar.js`).
  - Dilengkapi antarmuka modal interaktif: Tambah, Edit, Hapus matkul, Test Alarm, serta Reset ke Jadwal Default iGracias.

---

## 3. Modul Komunikasi & Notifikasi (`notifications-wa.js` & `whatsapp-companion.js`)

- [x] **9. Inline Quick Reply WhatsApp dari Peek Popup & Kartu Notifikasi**
  - Saat muncul *Peek Popup* pesan WhatsApp masuk di atas layar, tersedia kolom ketik singkat (`Balas cepat...` + tekan `Enter`) yang langsung mengirim balasan melalui jendela pendamping `whatsapp-companion.js` tanpa perlu membuka jendela WhatsApp.
  - Dilengkapi kolom balas cepat langsung dari tiap kartu notifikasi di Halaman Notifikasi tanpa membuka jendela WhatsApp.

- [x] **10. Pratinjau Gambar, Stiker, & Voice Note WhatsApp**
  - Menampilkan *thumbnail* foto yang dikirim teman (selain stiker yang sudah didukung) langsung di dalam daftar notifikasi kapsul dan Peek Popup.
  - Mendeteksi pesan Voice Note (PTT) lengkap dengan durasi (`0:15`) dan animasi gelombang audio hidup (*live audio waveform*).

---

## 4. Modul Sistem, Baterai, & Perangkat Keras (`power-bluetooth.js` & `winrt-bridge.ps1`)

- [ ] **11. Auto-Fullscreen Game & Video Detector (Smart Tuck)**
  - Mendeteksi secara otomatis ketika sedang menonton video YouTube *fullscreen* atau bermain game *fullscreen*, lalu otomatis melipat kapsul ke mode tipis **`tucked` (`6px`)** agar tidak menghalangi HUD game/video, dan kembali normal saat keluar dari *fullscreen*.

- [ ] **12. Live Network Speed, CPU/RAM, & Mic/Cam Privacy Indicator**
  - Menampilkan titik indikator privasi (hijau saat kamera aktif, oranye saat mikrofon aktif seperti di iOS/macOS) di sudut kapsul tertutup, serta info kecepatan unduh internet (`MB/s`) dan penggunaan RAM di halaman utilitas.

- [ ] **13. Peringatan Baterai Kritis Lintas Perangkat**
  - *Peek Popup* otomatis ketika baterai HP (via Phone Link) atau TWS Bluetooth turun di bawah **20%**, atau ketika baterai laptop mencapai **100%** (pengingat cabut cas).

- [x] **18. Native Compiled C# WinRT Companion Bridge (`ukikura-bridge.exe`)**
  - Menggantikan `powershell.exe` (`winrt-bridge.ps1`) dengan binary native mandiri hasil kompilasi C# (`dynamic-island/bridge/ukikura-bridge.exe`) yang memangkas konsumsi RAM bridge sebesar **99.7%** dari **126 MB $\rightarrow$ < 1 MB (344 KB)** dan CPU ke **0.00%**, dengan 100% kompatibilitas payload JSON media SMTC, UserNotificationListener, baterai laptop/HP, perangkat Bluetooth CfgMgr32, dan kontrol volume audio endpoint.

- [x] **19. Smart WhatsApp Web Hibernation (Ghost Tab)**
  - Mengoptimalkan Chromium renderer WhatsApp Web saat jendela diminimalkan/ditutup ke background dengan interval polling yang rileks (35 detik), background throttling, dan audio muting, menghemat konsumsi memori background tanpa memutus deteksi pesan baru maupun stiker beresolusi penuh realtime (0ms) via sadapan `window.Notification`.

---

## 5. Interaksi Kapsul, Maskot, & Kustomisasi (`core-state.js` & `mascot-engine.js`)

- [x] **Pengaturan FPS Maskot & Zero-Repaint Settled Idle**
  - Pilihan frame rate animasi mata maskot (`Eco`, `60 FPS`, `30 FPS`, `15 FPS`) di Halaman Pengaturan dengan deteksi status diam (*settled state*) yang menghentikan mutasi CSS DOM sehingga konsumsi CPU berada di **0% saat idle**.

- [ ] **14. Global Keyboard Hotkeys**
  - Pintasan keyboard dari aplikasi mana saja:
    - `Alt + Space`: Buka / tutup kapsul Ukikura.
    - `Alt + L`: Buka langsung halaman **Synced Lyrics (`520px`)**.
    - `Alt + S`: Buka langsung halaman **File Shelf & Clipboard**.
    - `Alt + M`: *Play / Pause* musik instan.

- [x] **15. Dynamic Album Art Ambient Theme**
  - Menyesuaikan warna pendaran (*ambient glow*) dan aksen tombol di halaman Musik/Lirik mengikuti warna dominan sampul lagu yang sedang diputar.

- [x] **16. Reaksi Maskot terhadap Beat Musik & Siklus Emosi**
  - Mata maskot di mode `pet` ikut memantul ritmis mengikuti ketukan musik saat lagu diputar (`eyeBeatBob`), dan menampilkan animasi mengantuk otomatis (`mood-sleepy`) pada siklus emosinya.

- [ ] **17. Integrasi Lockscreen & Animasi Penyambutan Saat Unlock (`Welcome Back Peek`)**
  - Mendeteksi otomatis saat layar Windows dikunci (*Lockscreen*) dan saat baru dibuka kembali (`powerMonitor` `lock-screen` / `unlock-screen` & event WinRT `SessionSwitch`).
  - Menampilkan animasi sambutan hangat dari maskot (`mood-happy` / `mood-love`) beserta *Peek Popup* ringkasan cepat saat layar baru dibuka (sapaan sesuai waktu Pagi/Siang/Malam, jumlah notifikasi WhatsApp yang masuk selama laptop terkunci, dan jadwal kuliah/deadline terdekat hari itu).

- [x] **20. Arsitektur Masa Depan: Scaffolding & Blueprint Tauri 2.0 (Rust + WebView2)**
  - Blueprint dan struktur proyek Tauri 2.0 telah dibuat di `tauri-preview/` dengan runtime Microsoft Edge WebView2 bawaan Windows 11 untuk menghasilkan ukuran installer $\le$ 10 MB dan penggunaan RAM $\le$ 40 MB, dengan mempertahankan 100% markup HTML, styling CSS, dan JavaScript UI yang sudah ada di `dynamic-island/renderer/`.
