# To-Do List Pengembangan Fitur Baru Ukikura (18 Ide Lengkap)

Daftar rencana pengembangan fitur baru untuk memperkuat **Ukikura** (*Uki* = Floating Island + *Kura* = Local Vault), dikelompokkan berdasarkan modulnya.

---

## 1. Modul Musik, Audio, & Lirik (`music-lyrics.js` & `lyrics/`)

- [x] **1. Interactive Seek Bar & Volume Wheel**
  - Klik atau geser (*drag*) langsung pada garis durasi lagu (`#music-prog-1` / `#music-prog-2`) untuk melompat ke menit tertentu via perintah WinRT `TryChangePlaybackPositionAsync`.
  - *Scroll* roda mouse di atas sampul album untuk mengatur volume aplikasi pemutar musik secara langsung.

- [x] **2. Real-Time Audio Ambient Visualizer (WASAPI Loopback)**
  - Latar belakang aura (`.ambient`) dan pendaran sampul album di halaman musik & lirik berdenyut (*pulse & breathe*) mengikuti **frekuensi bass dan vokal asli** dari output audio Windows secara *real-time* via Web Audio API loopback stream (5 bar kapsul dipertahankan orisinal sesuai preferensi).

- [x] **3. Dual-Sub Lirik (Romaji + Kanji + Terjemahan Indonesia)**
  - Teks utama (Kanji/Original) di atas, baris Romaji di bawahnya, dan baris terjemahan Bahasa Indonesia di bawah Romaji (dari `tlyric` NetEase / CC YouTube). Dilengkapi tombol toggle `[SUB: ON]` / `[SUB: OFF]` di samping badge `[SYNC]`.

- [x] **4. Mini Floating Karaoke Overlay (Mode Pin Transparan)**
  - Mode khusus kapsul ramping melayang (`480px x 54px`, radius `22px`) semi-transparan dengan blur latar belakang (`backdrop-filter`) yang menampilkan 2 baris lirik (baris aktif + berikutnya / terjemahan), mini sampul lagu, tombol play/pause mini, tombol toggle sub `[≡]`, tombol perluas lirik `[⤢]`, dan tombol close `[✕]`. Klik tembus pandang otomatis saat kursor berada di luar kapsul.

---

## 2. Modul Kura Vault, File Shelf, & Akademik (`shelf-actions.js`, `lms-pomodoro.js`, & `smart-calendar.js`)

- [x] **5. Clipboard History & Snippet Vault di Halaman Shelf**
  - Menyimpan riwayat 15 teks, kode, tautan, atau gambar (*screenshot*) terakhir yang di-*copy* (`Ctrl+C`) secara otomatis ke dalam tab di halaman **File Shelf**, lengkap dengan filter kategori (`Semua`, `Kode`, `Link`, `Teks`, `Gambar`), badge warna tipe, tombol *Clear*, dan 1-klik salin ulang dengan feedback visual `✓ Tersalin!`.

- [x] **6. Drag-Out dari File Shelf ke Browser / WhatsApp**
  - Menarik (*drag*) file dari dalam rak File Shelf langsung keluar ke kolom *upload* tugas LMS di browser, chat WhatsApp, atau File Explorer menggunakan Electron native OS drag API (`event.sender.startDrag`). Dilengkapi indikator badge "Tarik keluar" dan petunjuk interaktif.

- [ ] **7. Notifikasi Suara & Popup Peringatan Bertahap Deadline LMS**
  - Ekspansi *Peek Popup* otomatis saat tugas LMS tersisa **H-24 jam**, **H-6 jam**, dan **H-1 jam**, lengkap dengan tombol 1-klik untuk langsung membuka halaman pengumpulan tugas tersebut.

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

- [x] **9. Inline Quick Reply WhatsApp dari Peek Popup**
  - Saat muncul *Peek Popup* pesan WhatsApp masuk di atas layar, tersedia kolom ketik singkat (`Balas cepat...` + tekan `Enter`) yang langsung mengirim balasan melalui jendela pendamping `whatsapp-companion.js` tanpa perlu membuka jendela WhatsApp.
  - Dilengkapi kolom balas cepat langsung dari tiap kartu notifikasi di Halaman Notifikasi tanpa membuka jendela WhatsApp.

- [x] **10. Pratinjau Gambar & Voice Note WhatsApp**
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

---

## 5. Interaksi Kapsul, Maskot, & Kustomisasi (`core-state.js` & `mascot-engine.js`)

- [ ] **14. Global Keyboard Hotkeys**
  - Pintasan keyboard dari aplikasi mana saja:
    - `Alt + Space`: Buka / tutup kapsul Ukikura.
    - `Alt + L`: Buka langsung halaman **Synced Lyrics (`520px`)**.
    - `Alt + S`: Buka langsung halaman **File Shelf & Clipboard**.
    - `Alt + M`: *Play / Pause* musik instan.

- [ ] **15. Dynamic Album Art Ambient Theme**
  - Menyesuaikan warna pendaran (*ambient glow*) dan aksen tombol di halaman Musik/Lirik mengikuti warna dominan sampul lagu yang sedang diputar.

- [ ] **16. Reaksi Maskot terhadap Beat Musik & Cuaca/Waktu**
  - Mata maskot di mode `pet` ikut mengangguk mengikuti ketukan musik saat lagu diputar, atau menampilkan animasi mengantuk otomatis saat lewat pukul 00:00 malam.

- [ ] **17. Integrasi Lockscreen & Animasi Penyambutan Saat Unlock (`Welcome Back Peek`)**
  - Mendeteksi otomatis saat layar Windows dikunci (*Lockscreen*) dan saat baru dibuka kembali (`powerMonitor` `lock-screen` / `unlock-screen` & event WinRT `SessionSwitch`).
  - Menampilkan animasi sambutan hangat dari maskot (`mood-happy` / `mood-love`) beserta *Peek Popup* ringkasan cepat saat layar baru dibuka (sapaan sesuai waktu Pagi/Siang/Malam, jumlah notifikasi WhatsApp yang masuk selama laptop terkunci, dan jadwal kuliah/deadline terdekat hari itu).
