; ==============================================================================
; UKIKURA (浮倉) — INNO SETUP 6 DISTRIBUTION SCRIPT (FULL NATIVE EDITION)
; Uki (Terapung / Floating Island) + Kura (Gudang Penyimpanan Data & Tugas)
; Versi: 1.1.0 (Kode Versi: 68 - Full Native Rust Direct2D + DirectComposition)
; License: GNU General Public License v3.0 (GPLv3)
; ==============================================================================

#define MyAppName "Ukikura"
#define MyAppFullTitle "Ukikura (浮倉) — Floating Island Native & Task Vault"
#define MyAppVersion "1.1.0"
#define MyAppVersionCode "68"
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
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes
CloseApplicationsFilter=*.exe
RestartApplications=no
UninstallDisplayName={#MyAppFullTitle}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "autostart"; Description: "Jalankan Ukikura otomatis saat Windows menyala (Direkomendasikan)"; GroupDescription: "Opsi Startup:"

[Files]
; Biner Utama Ukikura Native Rust (Direct2D + DirectComposition + Task Vault)
Source: "..\dynamic-island\native\target\release\Ukikura.exe"; DestDir: "{app}"; Flags: ignoreversion
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
Type: filesandordirs; Name: "{app}\runtime"

[Run]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM Ukikura.exe /T"; StatusMsg: "Menutup sesi lama Ukikura..."; Flags: runhidden waituntilterminated
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM electron.exe /T"; Flags: runhidden waituntilterminated
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM ukikura-bridge.exe /T"; Flags: runhidden waituntilterminated
Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Description: "Jalankan {#MyAppFullTitle} sekarang"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM Ukikura.exe /T"; Flags: runhidden waituntilterminated; RunOnceId: "StopUkikuraProcesses"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM electron.exe /T"; Flags: runhidden waituntilterminated; RunOnceId: "StopElectronProcesses"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM ukikura-bridge.exe /T"; Flags: runhidden waituntilterminated; RunOnceId: "StopUkikuraBridge"

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/F /IM Ukikura.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/F /IM electron.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/F /IM ukikura-bridge.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(400);
  Result := '';
end;
