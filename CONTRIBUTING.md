# Panduan Kontribusi (Contributing to Ukikura)

Terima kasih atas minat Anda untuk berkontribusi pada pengembangan **Ukikura (浮倉)** — aplikasi *Floating Desktop Notch & Academic Storage Hub* untuk Windows 10/11 di bawah lisensi **GNU GPLv3**.

Dokumen ini menjelaskan standar arsitektur kode, alur kerja pengembangan lokal, dan prosedur pengiriman *Pull Request*.

---

## 1. Standar Arsitektur Modular (Wajib Dipatuhi)

Demi menjaga keterbacaan dan kemudahan pemeliharaan kode, seluruh kontributor **wajib** mematuhi aturan modularitas berikut:

1. **Larangan File Monolitik**:
   - Jangan menggabungkan ribuan baris CSS atau JavaScript ke dalam `dynamic-island/renderer/index.html`.
   - `dynamic-island/renderer/index.html` hanya berfungsi sebagai kerangka markup DOM (~420 baris).
   - Setiap modul baru atau hasil modifikasi wajib dijaga agar tetap ringkas (**maksimal ~500–600 baris per file**).
2. **Penempatan Modul Sesuai Tanggung Jawab (*Single Responsibility*)**:
   - **Proses Utama Electron (`dynamic-island/main/`)**:
     - `main.js` — Siklus hidup jendela, *hover loop*, *system tray*, dan perutean IPC.
     - `main/kura-server.js` — Server penyimpanan tugas lokal (`127.0.0.1:8089`) dan sinkronisasi iCal.
     - `main/winrt-client.js` — Komunikasi dengan jembatan PowerShell WinRT.
     - `main/whatsapp-companion.js` — Pendamping WhatsApp Web dan ekstraksi notifikasi/stiker.
     - `main/lms-crawler.js` — Klien SSO LMS dan pemindai tugas latar belakang.
     - `main/updater.js` — Pemeriksa versi baru otomatis dari GitHub Releases / `version.json`.
     - `main/autostart.js` — Pengelola pendaftaran Windows Startup.
   - **Mesin Lirik & Forced Alignment (`dynamic-island/lyrics/`)**:
     - `lyrics/index.js` — Orkestrasi utama pencarian dan penyelarasan lirik.
     - `lyrics/youtube-captions.js` — Ekstraktor subtitle asli YouTube (`.srv3` TimedText).
     - `lyrics/forced-alignment.js` — Algoritma *Audio-to-Text Forced Alignment* & *RANSAC Offset*.
     - `lyrics/providers.js` — Konektor database LRCLIB, NetEase Cloud Music, dan KuGou.
     - `lyrics/text-romaji.js` — Parser LRC dan transliterasi Kanji/Kana ke Romaji.
   - **Antarmuka Pengguna (`dynamic-island/renderer/`)**:
     - Perubahan gaya visual -> edit berkas terkait di `renderer/styles/*.css`.
     - Perubahan logika komponen -> edit berkas terkait di `renderer/js/*.js`.

---

## 2. Persiapan Lingkungan Pengembangan Lokal

### Prasyarat
- **OS**: Windows 10 atau Windows 11 (64-bit)
- **Node.js**: Versi 18.0.0 atau lebih baru
- **PowerShell**: Windows PowerShell 5.1+ (bawaan Windows untuk jembatan WinRT)
- **Inno Setup 6** *(Opsional)*: Diperlukan hanya jika Anda ingin mengompilasi ulang berkas `installer/Ukikura-Setup-vX.Y.Z.exe`.

### Langkah Menjalankan Proyek
```powershell
# 1. Clone repositori hasil fork Anda
git clone https://github.com/<username-anda>/Ukikura.git
cd Ukikura

# 2. Pasang dependensi Electron
npm install

# 3. Jalankan Ukikura dalam mode pengembangan
npm start
```

---

## 3. Alur Kerja Pull Request (PR Workflow)

1. **Fork & Buat Cabang Baru (*Branch*)**:
   - Gunakan penamaan cabang yang deskriptif:
     - Fitur baru: `feat/nama-fitur` (contoh: `feat/spotify-canvas-cover`)
     - Perbaikan bug: `fix/nama-bug` (contoh: `fix/smtc-timeline-drift`)
     - Dokumentasi: `docs/nama-perubahan`
2. **Keamanan Data Pribadi**:
   - Pastikan Anda **tidak pernah** melakukan *commit* terhadap berkas `dynamic-island/data/config.json`, `dynamic-island/data/tasks.json`, cookie sesi, atau kunci API pribadi.
3. **Uji Coba Lokal**:
   - Pastikan aplikasi berjalan mulus tanpa galat di konsol Electron (`npm start`) dan animasi transisi kapsul tetap berjalan pada 60 FPS.
4. **Kirim Pull Request**:
   - Jelaskan perubahan yang Anda buat, alasan teknisnya, serta tangkapan layar (*screenshot*) bila menyangkut perubahan antarmuka visual.

---

## 4. Lisensi Kontribusi

Dengan mengirimkan *Pull Request* ke repositori ini, Anda menyetujui bahwa kontribusi Anda dilisensikan di bawah **GNU General Public License v3.0 (GPLv3)** sesuai dengan berkas [LICENSE](./LICENSE).
