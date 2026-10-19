; ==============================================================================
; UKIKURA (浮倉) — INNO SETUP 6 DISTRIBUTION SCRIPT
; Uki (Terapung / Floating Island) + Kura (Gudang Penyimpanan Data & Tugas)
; Mendukung 2 Edisi / Kode Versi:
; - Versi Publik (1.0.0-public): Rilis stabil untuk penggunaan sehari-hari
; - Versi Debug  (1.0.0-debug):  Rilis pengembang untuk pelacakan log & debug
; License: GNU General Public License v3.0 (GPLv3)
; ==============================================================================

#define MyAppName "Ukikura"
#define MyAppFullTitle "Ukikura (浮倉) — Floating Island & Task Vault"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Nauflix (muhnaufal11)"
#define MyAppURL "https://github.com/muhnaufal11/Ukikura"
#define MyAppExeName "electron.exe"
#define MyAppEntryArgs "dynamic-island\main.js"
#define ElectronZipUrl "https://github.com/electron/electron/releases/download/v33.2.0/electron-v33.2.0-win32-x64.zip"

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
OutputBaseFilename=Ukikura-Setup-v{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=force
RestartApplications=no
UninstallDisplayName={#MyAppFullTitle}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "channel_public"; Description: "Versi Publik (Rilis Stabil — Penggunaan Sehari-hari)"; GroupDescription: "Pilih Edisi / Kode Versi Ukikura:"; Flags: exclusive
Name: "channel_debug"; Description: "Versi Debug (Rilis Pengembang — Fitur Baru & Pelacakan Log)"; GroupDescription: "Pilih Edisi / Kode Versi Ukikura:"; Flags: exclusive unchecked
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "autostart"; Description: "Jalankan Ukikura otomatis saat Windows menyala (Direkomendasikan)"; GroupDescription: "Opsi Startup:"

[Dirs]
Name: "{app}\runtime"

[Files]
; Modul Utama Ukikura (100% terpisah dari Asisten LMS & tanpa data pribadi pengguna)
Source: "..\dynamic-island\*"; DestDir: "{app}\dynamic-island"; Excludes: "data\*,*.md"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "..\Ukikura-Debug.bat"; DestDir: "{app}"; Flags: ignoreversion
; Salin metadata versi sesuai kode versi / kanal yang dipilih pengguna
Source: "..\version-public.json"; DestDir: "{app}"; DestName: "version.json"; Check: not IsDebugTaskSelected; Flags: ignoreversion
Source: "..\version-debug.json"; DestDir: "{app}"; DestName: "version.json"; Check: IsDebugTaskSelected; Flags: ignoreversion
Source: "..\version-public.json"; DestDir: "{app}"; Flags: ignoreversion
Source: "..\version-debug.json"; DestDir: "{app}"; Flags: ignoreversion
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

[Run]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM electron.exe /T"; StatusMsg: "Menutup sesi lama Ukikura..."; Flags: runhidden waituntilterminated
Filename: "{sys}\tar.exe"; Parameters: "-xf ""{tmp}\electron-runtime.zip"" -C ""{app}\runtime"""; StatusMsg: "Mengekstrak runtime Ukikura..."; Check: FileExists(ExpandConstant('{tmp}\electron-runtime.zip')); Flags: runhidden waituntilterminated
Filename: "{app}\runtime\{#MyAppExeName}"; Parameters: """{app}\{#MyAppEntryArgs}"""; WorkingDir: "{app}"; Description: "Jalankan {#MyAppFullTitle} sekarang"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\taskkill.exe"; Parameters: "/F /IM electron.exe /T"; Flags: runhidden waituntilterminated; RunOnceId: "StopUkikuraProcesses"

[UninstallDelete]
Type: filesandordirs; Name: "{app}\runtime"

[Code]
var
  DownloadPage: TDownloadWizardPage;

function IsDebugTaskSelected: Boolean;
begin
  Result := WizardIsTaskSelected('channel_debug');
end;

function OnDownloadProgress(const Url, FileName: String; const Progress, ProgressMax: Int64): Boolean;
begin
  if Progress = ProgressMax then
    Log(Format('Successfully downloaded file to {tmp}: %s', [FileName]));
  Result := True;
end;

procedure InitializeWizard;
var
  ExistingVerFile: String;
  VerContent: AnsiString;
begin
  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing), SetupMessage(msgPreparingDesc), @OnDownloadProgress);

  // Jika melakukan in-place update, periksa apakah pengguna sebelumnya memasang Versi Debug atau Versi Publik
  ExistingVerFile := ExpandConstant('{app}\version.json');
  if FileExists(ExistingVerFile) then begin
    if LoadStringFromFile(ExistingVerFile, VerContent) then begin
      if Pos('"channel": "debug"', VerContent) > 0 then begin
        WizardSelectTasks('!channel_public,channel_debug');
      end else if Pos('"channel": "public"', VerContent) > 0 then begin
        WizardSelectTasks('channel_public,!channel_debug');
      end;
    end;
  end;
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
begin
  // Tutup instans Ukikura lama dan PowerShell bridge agar proses update mulus tanpa file terkunci
  Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM electron.exe /T', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec(ExpandConstant('{sys}\powershell.exe'), '-NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match ''winrt-bridge'' } | Stop-Process -Force"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Sleep(400);
  Result := '';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  if CurPageID = wpReady then begin
    DownloadPage.Clear;
    if (not FileExists(ExpandConstant('{app}\runtime\electron.exe'))) or (not FileExists(ExpandConstant('{app}\runtime\icudtl.dat'))) then begin
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
