# Aturan Folder `dynamic-island/`

Folder ini khusus untuk aplikasi desktop **Nusa Dynamic Island**.
- **DILARANG** menaruh kode proxy SEB / injeksi kuis LMS di folder ini (tempatkan di `../asisten-lms/`).
- **DILARANG** menulis CSS atau JS inline panjang di `renderer/index.html`.
- Gunakan modul yang sesuai:
  - `main.js` & `main/*.js` untuk proses utama Electron.
  - `bridge/winrt-bridge.ps1` untuk pembacaan native Windows SMTC, Notifikasi, dan Baterai Bluetooth/USB.
  - `lyrics/*.js` untuk pengambilan lirik multi-sumber & *Audio-to-Text Forced Alignment*.
  - `renderer/styles/*.css` untuk styling UI.
  - `renderer/js/*.js` untuk logika komponen UI per halaman.
