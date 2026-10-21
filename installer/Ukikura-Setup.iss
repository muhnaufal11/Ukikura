; ==============================================================================
; UKIKURA (浮倉) — INNO SETUP 6 DISTRIBUTION SCRIPT (RUST NATIVE STANDALONE RUNTIME)
; Uki (Terapung / Floating Island) + Kura (Gudang Penyimpanan Data & Tugas)
; Versi: 1.0.6 (Kode Versi: 51 - Ultra-Lightweight Rust Native Host & Full Features)
; License: GNU General Public License v3.0 (GPLv3)
; ==============================================================================

#define MyAppName "Ukikura"
#define MyAppFullTitle "Ukikura (浮倉) — Floating Island & Task Vault"
#define MyAppVersion "1.0.6"
#define MyAppVersionCode "51"
#define MyAppPublisher "Nauflix (muhnaufal11)"
#define MyAppURL "https://github.com/muhnaufal11/Ukikura"
#define MyAppExeName "Ukikura.exe"
#define OutputName "Ukikura-Setup-v" + MyAppVersion

[Setup]
AppId={{8F4B9A2E-6D31-4E9C-A7C2-91E40B85D3F1}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppFullTitle} v{#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}/issues
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={localappdata}\Programs\{#MyAppName}
UsePreviousAppDir=yes
UsePreviousGroup=yes
UsePreviousTasks=yes
DisableDirPage=auto
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=..\LICENSE
SetupIconFile=..\assets\ukikura-logo.ico
UninstallDisplayIcon={app}\assets\ukikura-logo.ico
PrivilegesRequired=lowest
OutputDir=.
OutputBaseFilename={#OutputName}
Compression=lzma2/normal
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=no
RestartApplications=no
UninstallDisplayName={#MyAppFullTitle}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "autostart"; Description: "Jalankan Ukikura otomatis saat Windows menyala (Direkomendasikan)"; GroupDescription: "Opsi Startup:"

[Dirs]
Name: "{app}\runtime"

[Files]
; 1. Aplikasi Utama Native Rust & WebView2 Loader (Ultra Ringan ~35 MB RAM, 0% CPU)
Source: "..\Ukikura.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\WebView2Loader.dll"; DestDir: "{app}"; Flags: ignoreversion

; 2. Runtime Headless Node (Khusus Background Kura Local Vault & Sync Lirik)
Source: "..\runtime\node.exe"; DestDir: "{app}\runtime"; Flags: ignoreversion

; 3. Modul Dynamic Island & Assets Lengkap
Source: "..\dynamic-island\*"; DestDir: "{app}\dynamic-island"; Excludes: "data\*,host-rust\target\*,*.md"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\version.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\ukikura-logo.ico"; Comment: "{#MyAppFullTitle}"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\assets\ukikura-logo.ico"; Tasks: desktopicon; Comment: "{#MyAppFullTitle}"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Ukikura"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue; Tasks: autostart
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "NusaDynamicIsland"; Flags: deletevalue

[InstallDelete]
Type: files; Name: "{userappdata}\Microsoft\Windows\Start Menu\Programs\Startup\NusaDynamicIsland.vbs"
Type: files; Name: "{userstartup}\NusaDynamicIsland.vbs"

[Run]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM electron.exe /T"; StatusMsg: "Menutup sesi lama..."; Flags: runhidden waituntilterminated
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM ukikura-bridge.exe /T"; StatusMsg: "Menutup sesi lama bridge..."; Flags: runhidden waituntilterminated
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM Ukikura.exe /T"; Flags: runhidden waituntilterminated
Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Description: "Jalankan {#MyAppFullTitle} sekarang"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM electron.exe /T"; Flags: runhidden waituntilterminated; RunOnceId: "StopUkikuraProcesses"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM ukikura-bridge.exe /T"; Flags: runhidden waituntilterminated; RunOnceId: "StopUkikuraBridge"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM Ukikura.exe /T"; Flags: runhidden waituntilterminated; RunOnceId: "StopUkikuraHost"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\runtime"

[Code]
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM electron.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM ukikura-bridge.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM Ukikura.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(250);
  Result := True;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM electron.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM ukikura-bridge.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM Ukikura.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(250);
  Result := '';
end;
