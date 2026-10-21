; ==============================================================================
; UKIKURA (浮倉) — INNO SETUP 6 DISTRIBUTION SCRIPT (CLOUD LIGHTWEIGHT INSTALLER)
; Uki (Terapung / Floating Island) + Kura (Gudang Penyimpanan Data & Tugas)
; Versi: 1.0.6 (Kode Versi: 57 - Zero-Latency Play/Pause, Precision Sync Lead & 100% 3-Tier Multilingual Display)
; License: GNU General Public License v3.0 (GPLv3)
; ==============================================================================

#define MyAppName "Ukikura"
#define MyAppFullTitle "Ukikura (浮倉) — Floating Island & Task Vault"
#define MyAppVersion "1.0.6"
#define MyAppVersionCode "60"
#define MyAppPublisher "Nauflix (muhnaufal11)"
#define MyAppURL "https://github.com/muhnaufal11/Ukikura"
#define MyAppExeName "Ukikura.exe"
#define MyAppEntryArgs "dynamic-island\main.js"
#define ElectronZipUrl "https://github.com/electron/electron/releases/download/v33.2.0/electron-v33.2.0-win32-x64.zip"
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
; Modul Utama Ukikura (Dynamic Island, Mesin Lirik, UI Assets, Native C++ Bridge ukikura-bridge.exe)
Source: "..\dynamic-island\*"; DestDir: "{app}\dynamic-island"; Excludes: "data\*,host-rust\*,src\*,*.md"; Flags: ignoreversion recursesubdirs createallsubdirs
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
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM Ukikura.exe /T"; StatusMsg: "Menutup sesi lama Ukikura..."; Flags: runhidden waituntilterminated
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM electron.exe /T"; Flags: runhidden waituntilterminated
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM ukikura-bridge.exe /T"; Flags: runhidden waituntilterminated
Filename: "{sys}\tar.exe"; Parameters: "-xf ""{tmp}\electron-runtime.zip"" -C ""{app}\runtime"""; StatusMsg: "Mengekstrak runtime Ukikura..."; Check: FileExists(ExpandConstant('{tmp}\electron-runtime.zip')); Flags: runhidden waituntilterminated
Filename: "{sys}\cmd.exe"; Parameters: "/c if exist ""{app}\runtime\electron.exe"" move /y ""{app}\runtime\electron.exe"" ""{app}\runtime\Ukikura.exe"""; StatusMsg: "Menyiapkan biner Ukikura..."; Flags: runhidden waituntilterminated
Filename: "{app}\dynamic-island\bridge\ukikura-bridge.exe"; Parameters: """--patch-target"" ""{app}\runtime\Ukikura.exe"" ""{app}\assets\ukikura-logo.ico"""; StatusMsg: "Menerapkan ikon dan identitas Ukikura..."; Flags: runhidden waituntilterminated
Filename: "{app}\runtime\{#MyAppExeName}"; Parameters: """{app}\{#MyAppEntryArgs}"""; WorkingDir: "{app}"; Description: "Jalankan {#MyAppFullTitle} sekarang"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM Ukikura.exe /T"; Flags: runhidden waituntilterminated; RunOnceId: "StopUkikuraProcesses"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM electron.exe /T"; Flags: runhidden waituntilterminated; RunOnceId: "StopElectronProcesses"
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM ukikura-bridge.exe /T"; Flags: runhidden waituntilterminated; RunOnceId: "StopUkikuraBridge"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\runtime"

[Code]
var
  DownloadPage: TDownloadWizardPage;

function OnDownloadProgress(const Url, FileName: String; const Progress, ProgressMax: Int64): Boolean;
begin
  if Progress = ProgressMax then
    Log(Format('Successfully downloaded file to {tmp}: %s', [FileName]));
  Result := True;
end;

procedure TerminateUkikuraProcesses();
var
  ResultCode: Integer;
begin
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM Ukikura.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM electron.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM ukikura-bridge.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(400);
end;

function InitializeSetup(): Boolean;
begin
  TerminateUkikuraProcesses();
  Result := True;
end;

procedure InitializeWizard;
begin
  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing), SetupMessage(msgPreparingDesc), @OnDownloadProgress);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  TerminateUkikuraProcesses();
  Result := '';
end;

function IsRuntimeComplete(): Boolean;
begin
  Result := (FileExists(ExpandConstant('{app}\runtime\Ukikura.exe')) or FileExists(ExpandConstant('{app}\runtime\electron.exe'))) and FileExists(ExpandConstant('{app}\runtime\icudtl.dat'));
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  if CurPageID = wpReady then begin
    DownloadPage.Clear;
    if not IsRuntimeComplete() then begin
      DownloadPage.Add('{#ElectronZipUrl}', 'electron-runtime.zip', '');
      DownloadPage.Show;
      try
        try
          DownloadPage.Download;
          Result := True;
        except
          if DownloadPage.AbortedByUser then
            Log('Download aborted by user.')
          else
            SuppressibleMsgBox(AddPeriod(GetExceptionMessage), mbCriticalError, MB_OK, IDOK);
          Result := False;
        end;
      finally
        DownloadPage.Hide;
      end;
    end else
      Result := True;
  end else
    Result := True;
end;
