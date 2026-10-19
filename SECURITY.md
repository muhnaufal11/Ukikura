# Security Policy

## Supported Versions

Berikut adalah daftar versi **Ukikura** yang saat ini menerima pembaruan keamanan (*security patches*):

| Versi | Status Dukungan |
| :--- | :--- |
| **1.0.x** | Didukung Penuh (Aktif) |
| **< 1.0.0** | Tidak Didukung |

---

## Arsitektur Keamanan & Privasi Data Lokal

**Ukikura** dirancang dengan prinsip *Local-First Privacy*:

1. **Penyimpanan Data 100% Lokal (`127.0.0.1`)**:
   - Seluruh data tugas LMS (`tasks.json`), tautan kalender iCal (`config.json`), catatan kalender pribadi (`localStorage`), dan sesi login Moodle/WhatsApp disimpan secara eksklusif di perangkat lokal pengguna.
   - Server internal `kura-server.js` hanya mengikat (*bind*) ke antarmuka *loopback* lokal `127.0.0.1:8089` dan tidak dapat diakses dari jaringan luar (LAN/WAN).
2. **Isolasi Kredensial & `.gitignore`**:
   - File konfigurasi yang berpotensi memuat token sesi, URL iCal pribadi, atau kunci API (`dynamic-island/data/config.json` dan `dynamic-island/data/tasks.json`) dikecualikan secara permanen dari Git dan dari bundel installer `Ukikura-Setup.iss`.
3. **Jembatan Native WinRT Tanpa Hak Administrator**:
   - Skrip jembatan `dynamic-island/bridge/winrt-bridge.ps1` berjalan dengan hak akses pengguna standar (`PrivilegesRequired=lowest`) hanya untuk membaca status media SMTC, notifikasi Toast Windows, dan persentase baterai Bluetooth/USB.
4. **Tanpa Telemetri**:
   - Ukikura tidak mengirimkan telemetri, analitik penggunaan, atau riwayat pemutaran lagu ke server pihak ketiga mana pun. Koneksi jaringan keluar hanya dilakukan ke penyedia lirik publik (LRCLIB, NetEase, KuGou, YouTube TimedText), GitHub API (untuk pengecekan versi baru), serta domain LMS/WhatsApp yang dibuka langsung oleh pengguna.

---

## Melaporkan Celah Keamanan (Reporting a Vulnerability)

Jika Anda menemukan celah keamanan pada kode sumber **Ukikura**, mohon untuk **tidak mempublikasikan eksploitasi tersebut secara terbuka di Issue publik** sebelum perbaikan dirilis.

Silakan laporkan melalui salah satu jalur berikut:

1. **GitHub Private Vulnerability Reporting**:
   - Buka tab **[Security Advisories](https://github.com/muhnaufal11/Ukikura/security/advisories/new)** pada repositori ini dan kirimkan laporan privat.
2. **Kontak Maintainer**:
   - Hubungi pengelola repositori melalui profil GitHub **[@muhnaufal11](https://github.com/muhnaufal11)** dengan menyertakan:
     - Deskripsi teknis celah keamanan dan berkas/modul terkait.
     - Langkah-langkah reproduksi (*Proof of Concept*).
     - Dampak potensial terhadap pengguna.

### Waktu Respons
- **Konfirmasi Awal**: Maksimal **48 jam** setelah laporan diterima.
- **Rilis Perbaikan (Patch)**: Maksimal **7 hari kerja** melalui rilis versi baru di GitHub Releases dan pembaruan manifes `version.json`.
