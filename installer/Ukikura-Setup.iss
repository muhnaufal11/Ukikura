; ==============================================================================
; UKIKURA (浮倉) — INNO SETUP 6 DISTRIBUTION SCRIPT (SOLUSI TINGKAT 2 NATIVE WEBVIEW2)
; Uki (Terapung / Floating Island) + Kura (Gudang Penyimpanan Data & Tugas)
; Versi: 1.0.6 (Kode Versi: 47 - Native WebView2 Execution)
; License: GNU General Public License v3.0 (GPLv3)
; ==============================================================================

#define MyAppName "Ukikura"
#define MyAppFullTitle "Ukikura (浮倉) — Floating Island & Task Vault"
#define MyAppVersion "1.0.6"
#define MyAppVersionCode "47"
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
CloseApplications=no
RestartApplications=no
UninstallDisplayName={#MyAppFullTitle}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "autostart"; Description: "Jalankan Ukikura otomatis saat Windows menyala (Direkomendasikan)"; GroupDescription: "Opsi Startup:"

[Files]
; 1. Native Windows WebView2 Shell & Assemblies (0% Electron, 0 MB download)
Source: "..\webview-shell\Ukikura.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\webview-shell\Microsoft.Web.WebView2.Core.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\webview-shell\Microsoft.Web.WebView2.WinForms.dll"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\webview-shell\WebView2Loader.dll"; DestDir: "{app}"; Flags: ignoreversion

; 2. Modul Utama Ukikura (Dynamic Island, Mesin Lirik, UI Assets)
Source: "..\dynamic-island\*"; DestDir: "{app}\dynamic-island"; Excludes: "data\*,*.md"; Flags: ignoreversion recursesubdirs createallsubdirs
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
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM Ukikura.exe /T"; StatusMsg: "Menutup sesi lama Ukikura..."; Flags: runhidden waituntilterminated
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM ukikura-bridge.exe /T"; StatusMsg: "Menutup sesi lama bridge..."; Flags: runhidden waituntilterminated
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM electron.exe /T"; StatusMsg: "Menutup sesi lama Electron..."; Flags: runhidden waituntilterminated
Filename: "{app}\{#MyAppExeName}"; Description: "Jalankan {#MyAppFullTitle} sekarang"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM Ukikura.exe /T"; Flags: runhidden waituntilterminated; RunOnceId: "StopUkikuraHost"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM ukikura-bridge.exe /T"; Flags: runhidden waituntilterminated; RunOnceId: "StopUkikuraBridge"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM electron.exe /T"; Flags: runhidden waituntilterminated; RunOnceId: "StopOldElectron"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\runtime"
Type: filesandordirs; Name: "{localappdata}\Ukikura\WebView2Data"

[Code]
function InitializeSetup(): Boolean;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM Ukikura.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM ukikura-bridge.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM electron.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(200);
  Result := True;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM Ukikura.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM ukikura-bridge.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM electron.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(200);
  Result := '';
end;
