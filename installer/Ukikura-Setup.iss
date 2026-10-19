; ==============================================================================
; UKIKURA (浮き蔵) — INNO SETUP 6 DISTRIBUTION SCRIPT
; Uki (Terapung / Floating Island) + Kura (Gudang Penyimpanan Data & Tugas)
; License: GNU General Public License v3.0 (GPLv3)
; ==============================================================================

#define MyAppName "Ukikura"
#define MyAppFullTitle "Ukikura (浮き蔵) — Floating Island & Task Vault"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Nauflix (muhnaufal11)"
#define MyAppURL "https://github.com/muhnaufal11/Ukikura"
#define MyAppExeName "electron.exe"
#define MyAppEntryArgs "dynamic-island\main.js"

[Setup]
AppId={{8F4B9A2E-6D31-4E9C-A7C2-91E40B85D3F1}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppFullTitle} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=..\LICENSE
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=.
OutputBaseFilename=Ukikura-Setup-v{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes
LZMANumBlockThreads=6
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=force
UninstallDisplayName={#MyAppFullTitle}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "autostart"; Description: "Jalankan Ukikura otomatis saat Windows menyala (Direkomendasikan)"; GroupDescription: "Opsi Startup:"

[Files]
; 1. Modul Utama Ukikura (100% terpisah dari Asisten LMS & tanpa data pribadi pengguna)
Source: "..\dynamic-island\*"; DestDir: "{app}\dynamic-island"; Excludes: "data\*"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\version.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs

; 2. Runtime Electron & Dependensi (dikompresi di bawah 100 MB agar muat di GitHub repo)
Source: "..\node_modules\electron\dist\*"; DestDir: "{app}\runtime"; Excludes: "LICENSES.chromium.html,locales\*,vk_swiftshader.dll,dxcompiler.dll,dxil.dll"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\node_modules\electron\dist\locales\en-US.pak"; DestDir: "{app}\runtime\locales"; Flags: ignoreversion
Source: "..\node_modules\electron\dist\locales\id.pak"; DestDir: "{app}\runtime\locales"; Flags: ignoreversion
Source: "..\node_modules\electron\dist\locales\ja.pak"; DestDir: "{app}\runtime\locales"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\runtime\{#MyAppExeName}"; Parameters: """{app}\{#MyAppEntryArgs}"""; WorkingDir: "{app}"; Comment: "{#MyAppFullTitle}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\runtime\{#MyAppExeName}"; Parameters: """{app}\{#MyAppEntryArgs}"""; WorkingDir: "{app}"; Tasks: desktopicon; Comment: "{#MyAppFullTitle}"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Ukikura"; ValueData: """{app}\runtime\{#MyAppExeName}"" ""{app}\{#MyAppEntryArgs}"""; Flags: uninsdeletevalue; Tasks: autostart

[Run]
Filename: "{app}\runtime\{#MyAppExeName}"; Parameters: """{app}\{#MyAppEntryArgs}"""; WorkingDir: "{app}"; Description: "Jalankan {#MyAppFullTitle} sekarang"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -WindowStyle Hidden -Command ""Get-CimInstance Win32_Process | Where-Object {{ $_.CommandLine -match 'dynamic-island' }} | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }}"""; Flags: runhidden; RunOnceId: "StopUkikuraProcesses"
