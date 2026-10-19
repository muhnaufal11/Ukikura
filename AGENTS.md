# MANDATORY WORKSPACE RULES FOR ALL AI AGENTS (`AGENTS.md`)

Seluruh Agen AI yang bekerja di repositori ini **WAJIB** mematuhi arsitektur modular dan pemisahan folder di bawah ini:

1. **Pemisahan Folder Proyek (`dynamic-island/` vs `asisten-lms/`)**:
   - **`dynamic-island/`**: Berisi seluruh kode aplikasi desktop **Nusa Dynamic Island** (`main.js`, `main/*`, `bridge/winrt-bridge.ps1`, `lyrics/*`, `renderer/index.html`, `renderer/styles/*`, `renderer/js/*`).
   - **`asisten-lms/`**: Berisi seluruh kode **Asisten LMS / SEB MITM Proxy** (`server.js`, `lms-sync.js`, `task-store.js`, `config-store.js`, `cert-manager.js`, `payload.js`, `frontend/*`, `certs/*`).
   - **DILARANG** mencampur file kedua proyek atau menaruh logika bisnis di root `D:\projek ssr\`.

2. **Larangan File Monolitik**:
   - Jangan pernah menaruh CSS atau JavaScript inline dalam jumlah besar di `dynamic-island/renderer/index.html`.
   - `dynamic-island/renderer/index.html` wajib tetap bersih (~400 baris) dan hanya memuat stylesheet dari `renderer/styles/*.css` serta script dari `renderer/js/*.js`.
   - Saat menambah fitur baru pada Dynamic Island:
     - Perubahan gaya visual -> edit file yang sesuai di `dynamic-island/renderer/styles/`.
     - Perubahan logika UI -> edit file yang sesuai di `dynamic-island/renderer/js/`.
     - Perubahan lirik / forced alignment -> edit file yang sesuai di `dynamic-island/lyrics/`.
     - Perubahan sistem Electron / IPC -> edit file yang sesuai di `dynamic-island/main/` atau `dynamic-island/main.js`.

3. **Kompatibilitas Shortcut Root**:
   - File `island-main.js`, `lyrics-engine.js`, dan `server.js` di root `D:\projek ssr\` adalah *entry shim* 1 baris yang mengarah ke `./dynamic-island/main.js`, `./dynamic-island/lyrics`, dan `./asisten-lms/server.js`. Biarkan tetap sebagai shim 1 baris.
