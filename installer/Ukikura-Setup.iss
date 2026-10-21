; ==============================================================================
; UKIKURA (浮倉) — INNO SETUP 6 DISTRIBUTION SCRIPT (OFFLINE STANDALONE RUNTIME)
; Uki (Terapung / Floating Island) + Kura (Gudang Penyimpanan Data & Tugas)
; Versi: 1.0.6 (Kode Versi: 48 - Ultra-Low Resource Native Offline Runtime)
; License: GNU General Public License v3.0 (GPLv3)
; ==============================================================================

#define MyAppName "Ukikura"
#define MyAppFullTitle "Ukikura (浮倉) — Floating Island & Task Vault"
#define MyAppVersion "1.0.6"
#define MyAppVersionCode "48"
#define MyAppPublisher "Nauflix (muhnaufal11)"
#define MyAppURL "https://github.com/muhnaufal11/Ukikura"
#define MyAppExeName "electron.exe"
#define MyAppEntryArgs "dynamic-island\main.js"
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
; 1. Runtime Mandiri Standalone (100% Offline, Tanpa Perlu Unduh Internet saat Instalasi)
; Mengoptimalkan paket dengan menyertakan en-US.pak dan mengecualikan file html lisensi 20 MB agar installer < 90 MB (bebas batas GitHub 100 MB)
Source: "..\node_modules\electron\dist\*"; DestDir: "{app}\runtime"; Excludes: "LICENSES.chromium.html,locales\*"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\node_modules\electron\dist\locales\en-US.pak"; DestDir: "{app}\runtime\locales"; Flags: ignoreversion

; 2. Modul Utama Ukikura (Dynamic Island, Mesin Lirik, UI Assets, Native C# Bridge)
Source: "..\dynamic-island\*"; DestDir: "{app}\dynamic-island"; Excludes: "data\*,*.md"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\Ukikura-Debug.bat"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\version.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\package.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\LICENSE"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\assets\*"; DestDir: "{app}\assets"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\runtime\{#MyAppExeName}"; Parameters: """{app}\{#MyAppEntryArgs}"""; WorkingDir: "{app}"; IconFilename: "{app}\assets\ukikura-logo.ico"; Comment: "{#MyAppFullTitle}"
Name: "{group}\Ukikura (Mode Debug)"; Filename: "{app}\Ukikura-Debug.bat"; WorkingDir: "{app}"; IconFilename: "{app}\assets\ukikura-logo.ico"; Comment: "Jalankan Ukikura dengan Developer Tools & Console Log"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\runtime\{#MyAppExeName}"; Parameters: """{app}\{#MyAppEntryArgs}"""; WorkingDir: "{app}"; IconFilename: "{app}\assets\ukikura-logo.ico"; Tasks: desktopicon; Comment: "{#MyAppFullTitle}"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "Ukikura"; ValueData: """{app}\runtime\{#MyAppExeName}"" ""{app}\{#MyAppEntryArgs}"""; Flags: uninsdeletevalue; Tasks: autostart
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "NusaDynamicIsland"; Flags: deletevalue

[InstallDelete]
Type: files; Name: "{userappdata}\Microsoft\Windows\Start Menu\Programs\Startup\NusaDynamicIsland.vbs"
Type: files; Name: "{userstartup}\NusaDynamicIsland.vbs"

[Run]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM electron.exe /T"; StatusMsg: "Menutup sesi lama Ukikura..."; Flags: runhidden waituntilterminated
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM ukikura-bridge.exe /T"; StatusMsg: "Menutup sesi lama bridge..."; Flags: runhidden waituntilterminated
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM Ukikura.exe /T"; Flags: runhidden waituntilterminated
Filename: "{app}\runtime\{#MyAppExeName}"; Parameters: """{app}\{#MyAppEntryArgs}"""; WorkingDir: "{app}"; Description: "Jalankan {#MyAppFullTitle} sekarang"; Flags: nowait postinstall skipifsilent

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
