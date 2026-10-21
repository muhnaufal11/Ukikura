# Native Windows Runtime (WinRT) & CfgMgr32 Bridge for Nusa Dynamic Island
# Reads:
# 1. GlobalSystemMediaTransportControlsSessionManager (Music / Video playing in Spotify, Browser, etc. + Album Art + Controls)
# 2. UserNotificationListener (Phone Link / HP Notifications, WhatsApp, Telegram, Browser Toasts)
# 3. Laptop Battery + Charger Status & Phone / Bluetooth Earbuds Battery (CfgMgr32 DEVPKEY_Bluetooth_Battery)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ErrorActionPreference = 'SilentlyContinue'

$relaunchFlag = Join-Path $PSScriptRoot ".relaunch-once"
if (Test-Path $relaunchFlag) {
    Remove-Item $relaunchFlag -Force -ErrorAction SilentlyContinue
    $vbs = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\NusaDynamicIsland.vbs"
    Start-Process "powershell.exe" -WindowStyle Hidden -ArgumentList "-NoProfile -Command `"Stop-Process -Name electron -Force -ErrorAction SilentlyContinue; Start-Sleep -Milliseconds 900; Start-Process '$vbs'`""
    exit
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime
Add-Type -AssemblyName System.Windows.Forms

$btCode = @"
using System;
using System.Text;
using System.Runtime.InteropServices;

public class BtBatteryReader {
    [StructLayout(LayoutKind.Sequential)]
    public struct DEVPROPKEY {
        public Guid fmtid;
        public uint pid;
    }

    [DllImport("CfgMgr32.dll", CharSet = CharSet.Unicode)]
    public static extern int CM_Locate_DevNodeW(out uint pdnDevInst, string pDeviceID, uint ulFlags);

    [DllImport("CfgMgr32.dll", CharSet = CharSet.Unicode)]
    public static extern int CM_Get_DevNode_PropertyW(uint dnDevInst, ref DEVPROPKEY PropertyKey, out uint PropertyType, byte[] PropertyBuffer, ref uint PropertyBufferSize, uint ulFlags);

    [DllImport("CfgMgr32.dll")]
    public static extern int CM_Get_DevNode_Status(out uint pulStatus, out uint pulProblemNumber, uint dnDevInst, uint ulFlags);

    public static int GetBattery(string instanceId) {
        uint devInst;
        if (CM_Locate_DevNodeW(out devInst, instanceId, 0) != 0) return -1;
        DEVPROPKEY key = new DEVPROPKEY { fmtid = new Guid("104EA319-6EE2-4701-BD47-8DDBF425BBE5"), pid = 2 };
        uint propType;
        byte[] buf = new byte[4];
        uint size = 4;
        if (CM_Get_DevNode_PropertyW(devInst, ref key, out propType, buf, ref size, 0) == 0 && size >= 1) {
            return buf[0];
        }
        return -1;
    }

    public static bool IsConnected(string instanceId) {
        uint devInst;
        if (CM_Locate_DevNodeW(out devInst, instanceId, 0) != 0) return false;
        DEVPROPKEY key = new DEVPROPKEY { fmtid = new Guid("83DA6326-97A6-4088-9453-A1923F573B29"), pid = 15 };
        uint propType;
        byte[] buf = new byte[4];
        uint size = 4;
        if (CM_Get_DevNode_PropertyW(devInst, ref key, out propType, buf, ref size, 0) == 0 && size >= 1) {
            return buf[0] != 0;
        }
        return false;
    }

    public static bool IsStarted(string instanceId) {
        uint devInst;
        if (CM_Locate_DevNodeW(out devInst, instanceId, 0) != 0) return false;
        uint status, problem;
        if (CM_Get_DevNode_Status(out status, out problem, devInst, 0) == 0) {
            return (status & 0x08) != 0;
        }
        return false;
    }

    public static string GetCategory(string instanceId) {
        uint devInst;
        if (CM_Locate_DevNodeW(out devInst, instanceId, 0) != 0) return "";
        DEVPROPKEY key = new DEVPROPKEY { fmtid = new Guid("78C34FC8-104A-4ACA-9EA4-524D52996E57"), pid = 90 };
        uint propType;
        byte[] buf = new byte[512];
        uint size = 512;
        if (CM_Get_DevNode_PropertyW(devInst, ref key, out propType, buf, ref size, 0) == 0 && size > 2) {
            return Encoding.Unicode.GetString(buf, 0, (int)size).TrimEnd((char)0).Replace((char)0, ',');
        }
        return "";
    }

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc enumProc, IntPtr lParam);
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder strText, int maxCount);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    public static void SendMediaKey(byte vk) {
        keybd_event(vk, 0, 0, UIntPtr.Zero);
        keybd_event(vk, 0, 2, UIntPtr.Zero);
    }

    public static bool SendYouTubeShortcut(bool isNext) {
        IntPtr foundHwnd = IntPtr.Zero;
        IntPtr fallbackBrowserHwnd = IntPtr.Zero;
        EnumWindows((hWnd, lParam) => {
            if (!IsWindowVisible(hWnd)) return true;
            StringBuilder sb = new StringBuilder(512);
            if (GetWindowTextW(hWnd, sb, 512) > 0) {
                string title = sb.ToString();
                if (title.IndexOf("YouTube", StringComparison.OrdinalIgnoreCase) >= 0) {
                    foundHwnd = hWnd;
                    return false;
                }
                if (fallbackBrowserHwnd == IntPtr.Zero && (
                    title.IndexOf("Brave", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    title.IndexOf("Chrome", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    title.IndexOf("Edge", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    title.IndexOf("Firefox", StringComparison.OrdinalIgnoreCase) >= 0 ||
                    title.IndexOf("Opera", StringComparison.OrdinalIgnoreCase) >= 0)) {
                    fallbackBrowserHwnd = hWnd;
                }
            }
            return true;
        }, IntPtr.Zero);

        IntPtr target = foundHwnd != IntPtr.Zero ? foundHwnd : fallbackBrowserHwnd;
        if (target != IntPtr.Zero) {
            if (IsIconic(target)) ShowWindow(target, 9);
            SetForegroundWindow(target);
            System.Threading.Thread.Sleep(60);
            byte key = isNext ? (byte)0x4E : (byte)0x50; // 'N' or 'P'
            keybd_event(0x10, 0, 0, UIntPtr.Zero);       // VK_SHIFT down
            keybd_event(key, 0, 0, UIntPtr.Zero);        // key down
            keybd_event(key, 0, 2, UIntPtr.Zero);        // key up
            keybd_event(0x10, 0, 2, UIntPtr.Zero);       // VK_SHIFT up
            return true;
        }
        return false;
    }
}

[ComImport]
[Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
internal class MMDeviceEnumeratorComObject { }

[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDeviceEnumerator {
    int NotImpl1();
    [PreserveSig]
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice ppDevice);
}

[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IMMDevice {
    [PreserveSig]
    int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams, [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
}

[Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
internal interface IAudioEndpointVolume {
    int NotImpl1();
    int NotImpl2();
    int GetChannelCount(out uint pnChannelCount);
    int SetMasterVolumeLevel(float fLevelDB, ref Guid pguidEventContext);
    int SetMasterVolumeLevelScalar(float fLevel, ref Guid pguidEventContext);
    int GetMasterVolumeLevel(out float pfLevelDB);
    [PreserveSig]
    int GetMasterVolumeLevelScalar(out float pfLevel);
    int SetChannelVolumeLevel(uint nChannel, float fLevelDB, ref Guid pguidEventContext);
    int SetChannelVolumeLevelScalar(uint nChannel, float fLevel, ref Guid pguidEventContext);
    int GetChannelVolumeLevel(uint nChannel, out float pfLevelDB);
    int GetChannelVolumeLevelScalar(uint nChannel, out float pfLevel);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool bMute, ref Guid pguidEventContext);
    int GetMute(out bool pbMute);
    int GetVolumeStepInfo(out uint pnStep, out uint pnStepCount);
    int VolumeStepUp(ref Guid pguidEventContext);
    int VolumeStepDown(ref Guid pguidEventContext);
}

public class AudioMaster {
    private static IAudioEndpointVolume GetVolumeControl() {
        var enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
        IMMDevice dev = null;
        int hr = enumerator.GetDefaultAudioEndpoint(0, 0, out dev);
        if (hr != 0 || dev == null) {
            hr = enumerator.GetDefaultAudioEndpoint(0, 1, out dev);
        }
        if (hr != 0 || dev == null) return null;
        Guid iid = typeof(IAudioEndpointVolume).GUID;
        object o;
        hr = dev.Activate(ref iid, 1, IntPtr.Zero, out o);
        if (hr != 0 || o == null) return null;
        return (IAudioEndpointVolume)o;
    }

    public static float GetVolume() {
        try {
            var vol = GetVolumeControl();
            if (vol == null) return -1f;
            float level;
            vol.GetMasterVolumeLevelScalar(out level);
            return level;
        } catch {
            return -1f;
        }
    }

    public static bool GetMute() {
        try {
            var vol = GetVolumeControl();
            if (vol == null) return false;
            bool muted;
            vol.GetMute(out muted);
            return muted;
        } catch {
            return false;
        }
    }

    public static bool ToggleMute() {
        try {
            var vol = GetVolumeControl();
            if (vol != null) {
                bool muted;
                vol.GetMute(out muted);
                Guid ctx = Guid.Empty;
                vol.SetMute(!muted, ref ctx);
                return !muted;
            }
        } catch {}
        BtBatteryReader.SendMediaKey(0xAD);
        return false;
    }

    public static float SetVolume(float level) {
        try {
            var vol = GetVolumeControl();
            if (vol != null) {
                float target = level;
                if (target < 0f) target = 0f;
                if (target > 1f) target = 1f;
                Guid ctx = Guid.Empty;
                vol.SetMute(false, ref ctx);
                vol.SetMasterVolumeLevelScalar(target, ref ctx);
                return target;
            }
        } catch {}
        return -1f;
    }

    public static float ChangeVolume(float delta) {
        try {
            var vol = GetVolumeControl();
            if (vol != null) {
                float level;
                vol.GetMasterVolumeLevelScalar(out level);
                float target = level + delta;
                if (target < 0f) target = 0f;
                if (target > 1f) target = 1f;
                Guid ctx = Guid.Empty;
                vol.SetMute(false, ref ctx);
                vol.SetMasterVolumeLevelScalar(target, ref ctx);
                return target;
            }
        } catch {}
        if (delta > 0) BtBatteryReader.SendMediaKey(0xAF);
        else if (delta < 0) BtBatteryReader.SendMediaKey(0xAE);
        return -1f;
    }
}
"@
Add-Type -TypeDefinition $btCode

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name.StartsWith('IAsyncOperation')
})[0]

$asStreamMethod = ([System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsStreamForRead' -and $_.GetParameters().Count -eq 1
})[0]

function Await($WinRtTask, $ResultType) {
    if (-not $WinRtTask) { return $null }
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    $netTask.Wait(-1) | Out-Null
    return $netTask.Result
}

# Load WinRT Types
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Notifications.Management.UserNotificationListener, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Notifications.Management.UserNotificationListenerAccessStatus, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Notifications.NotificationKinds, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.UI.Notifications.KnownNotificationBindings, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrResult, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.SoftwareBitmap, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

$mediaMgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
$notifListener = [Windows.UI.Notifications.Management.UserNotificationListener]::Current
$notifAccess = Await ($notifListener.RequestAccessAsync()) ([Windows.UI.Notifications.Management.UserNotificationListenerAccessStatus])
$ocrEngine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()

$lastThumbKey = ""
$lastThumbB64 = ""
$seenNotifIds = @{}
$initialNotifPass = $true
$tickCount = 0

$cmdFile = Join-Path $PSScriptRoot ".media-cmd"
$tempCmdFile = Join-Path $env:TEMP "ukikura-media.cmd"
$ytFrameFile = Join-Path $PSScriptRoot ".yt-frame.png"
$lastOcrText = ""
$script:lastReportedVol = -1
$script:lastReportedMute = $false

try {
    $initV = [AudioMaster]::GetVolume()
    $initM = [AudioMaster]::GetMute()
    if ($initV -ge 0) {
        $script:lastReportedVol = [math]::Round($initV * 100)
        $script:lastReportedMute = [bool]$initM
        $volPayload = @{
            type = "volume"
            level = $script:lastReportedVol
            muted = $script:lastReportedMute
        } | ConvertTo-Json -Compress
        [Console]::WriteLine($volPayload)
    }
} catch {}

function Process-MediaCmd {
    try {
        $activeCmdFile = if ([System.IO.File]::Exists($tempCmdFile)) { $tempCmdFile } elseif ([System.IO.File]::Exists($cmdFile)) { $cmdFile } else { $null }
        if ($activeCmdFile) {
            $raw = [System.IO.File]::ReadAllText($activeCmdFile)
            try { [System.IO.File]::Delete($tempCmdFile) } catch {}
            try { [System.IO.File]::Delete($cmdFile) } catch {}
            if (-not $raw) { return }
            $lines = $raw -split "`r?`n"
            foreach ($line in $lines) {
                $cmd = $line.Trim().ToUpperInvariant()
                if (-not $cmd) { continue }
                $handled = $false
                if ($mediaMgr) {
                    $curSess = $mediaMgr.GetCurrentSession()
                    if ($curSess) {
                        $pbInfo = $curSess.GetPlaybackInfo()
                        $ctrls = if ($pbInfo) { $pbInfo.Controls } else { $null }
                        $appId = [string]$curSess.SourceAppUserModelId
                        $isBrowser = $appId -match 'Brave|Chrome|msedge|Firefox|Opera|Vivaldi'

                        if ($cmd -eq 'PLAYPAUSE') {
                            $handled = [bool](Await ($curSess.TryTogglePlayPauseAsync()) ([bool]))
                        } elseif ($cmd -eq 'NEXT') {
                            if (-not $ctrls -or $ctrls.IsNextEnabled) {
                                $handled = [bool](Await ($curSess.TrySkipNextAsync()) ([bool]))
                            }
                            if (-not $handled -and $isBrowser) {
                                $handled = [BtBatteryReader]::SendYouTubeShortcut($true)
                            }
                        } elseif ($cmd -eq 'PREV') {
                            if (-not $ctrls -or $ctrls.IsPreviousEnabled) {
                                $handled = [bool](Await ($curSess.TrySkipPreviousAsync()) ([bool]))
                            }
                            if (-not $handled) {
                                if ($ctrls -and $ctrls.IsPlaybackPositionEnabled) {
                                    $handled = [bool](Await ($curSess.TryChangePlaybackPositionAsync(0)) ([bool]))
                                }
                                if (-not $handled -and $isBrowser) {
                                    $handled = [BtBatteryReader]::SendYouTubeShortcut($false)
                                }
                            }
                        } elseif ($cmd -match '^SEEK:([\d\.]+)') {
                            $targetSec = [double]$Matches[1]
                            $ticks = [long]([math]::Round($targetSec * 10000000))
                            try {
                                $handled = [bool](Await ($curSess.TryChangePlaybackPositionAsync($ticks)) ([bool]))
                            } catch {}
                            if ($handled) {
                                Poll-MediaSession $true
                            }
                        }
                    }
                }
                if ($cmd -match '^VOL:([+-]?[\d\.]+)' -or $cmd -eq 'VOLUP' -or $cmd -eq 'VOLDOWN') {
                    $delta = if ($cmd -eq 'VOLUP') { 0.02 } elseif ($cmd -eq 'VOLDOWN') { -0.02 } else { [double]$Matches[1] }
                    $newVol = [AudioMaster]::ChangeVolume([float]$delta)
                    $curVol = if ($newVol -ge 0) { $newVol } else { [AudioMaster]::GetVolume() }
                    if ($curVol -ge 0) {
                        $lvl = [math]::Round($curVol * 100)
                        $mut = [AudioMaster]::GetMute()
                        $script:lastReportedVol = $lvl
                        $script:lastReportedMute = $mut
                        $volPayload = @{
                            type = "volume"
                            level = $lvl
                            muted = [bool]$mut
                        } | ConvertTo-Json -Compress
                        [Console]::WriteLine($volPayload)
                    }
                    $handled = $true
                } elseif ($cmd -match '^VOLSET:([\d\.]+)') {
                    $target = [float]([double]$Matches[1] / 100.0)
                    $newVol = [AudioMaster]::SetVolume($target)
                    $curVol = if ($newVol -ge 0) { $newVol } else { [AudioMaster]::GetVolume() }
                    if ($curVol -ge 0) {
                        $lvl = [math]::Round($curVol * 100)
                        $mut = [AudioMaster]::GetMute()
                        $script:lastReportedVol = $lvl
                        $script:lastReportedMute = $mut
                        $volPayload = @{
                            type = "volume"
                            level = $lvl
                            muted = [bool]$mut
                        } | ConvertTo-Json -Compress
                        [Console]::WriteLine($volPayload)
                    }
                    $handled = $true
                } elseif ($cmd -eq 'VOLMUTE' -or $cmd -eq 'MUTE') {
                    $isMuted = [AudioMaster]::ToggleMute()
                    $curVol = [AudioMaster]::GetVolume()
                    $lvl = if ($curVol -ge 0) { [math]::Round($curVol * 100) } else { 0 }
                    $script:lastReportedVol = $lvl
                    $script:lastReportedMute = [bool]$isMuted
                    $volPayload = @{
                        type = "volume"
                        level = $lvl
                        muted = [bool]$isMuted
                    } | ConvertTo-Json -Compress
                    [Console]::WriteLine($volPayload)
                    $handled = $true
                } elseif ($cmd -eq 'VOLGET') {
                    $curVol = [AudioMaster]::GetVolume()
                    if ($curVol -ge 0) {
                        $lvl = [math]::Round($curVol * 100)
                        $mut = [AudioMaster]::GetMute()
                        $script:lastReportedVol = $lvl
                        $script:lastReportedMute = $mut
                        $volPayload = @{
                            type = "volume"
                            level = $lvl
                            muted = [bool]$mut
                        } | ConvertTo-Json -Compress
                        [Console]::WriteLine($volPayload)
                    }
                    $handled = $true
                }
                if (-not $handled) {
                    if ($cmd -eq 'PLAYPAUSE') { [BtBatteryReader]::SendMediaKey(0xB3) }
                    elseif ($cmd -eq 'NEXT') { [BtBatteryReader]::SendMediaKey(0xB0) }
                    elseif ($cmd -eq 'PREV') { [BtBatteryReader]::SendMediaKey(0xB1) }
                }
            }
        }
    } catch {}
}

$lastMediaTitle = ""
$lastMediaArtist = ""
$lastMediaDur = 0
$lastThumbIsAppIcon = $false

function Poll-MediaSession([bool]$FastOnly = $false) {
    try {
        if (-not $script:mediaMgr) {
            $script:mediaMgr = Await ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
        }
        if ($script:mediaMgr) {
            $session = $script:mediaMgr.GetCurrentSession()
            if ($session) {
                $pb = $session.GetPlaybackInfo()
                $tl = $session.GetTimelineProperties()
                $status = if ($pb) { $pb.PlaybackStatus.ToString() } else { "Closed" }
                $dur = if ($tl) { [math]::Round($tl.EndTime.TotalSeconds, 3) } else { 0 }
                $appId = if ($session.SourceAppUserModelId) { [string]$session.SourceAppUserModelId } else { "" }

                $info = Await ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
                $newTitle = if ($info -and $info.Title) { [string]$info.Title } else { "" }
                $newArtist = if ($info -and $info.Artist) { [string]$info.Artist } else { "" }
                $trackChanged = ($newTitle -ne $script:lastMediaTitle) -or ($newArtist -ne $script:lastMediaArtist)
                $script:lastMediaTitle = $newTitle
                $script:lastMediaArtist = $newArtist
                $script:lastMediaDur = $dur

                if ($trackChanged) {
                    $script:lastThumbB64 = ""
                    $script:lastThumbIsAppIcon = $false
                    $script:thumbJustLoaded = $true
                }

                $needThumb = $trackChanged -or ((-not $FastOnly) -and (-not $script:lastThumbB64 -or $script:lastThumbIsAppIcon))
                if ($info -and $info.Thumbnail -and $needThumb) {
                        try {
                            $winrtStream = Await ($info.Thumbnail.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
                            if ($winrtStream) {
                                $netStream = $asStreamMethod.Invoke($null, @($winrtStream))
                                if ($netStream) {
                                    $ms = New-Object System.IO.MemoryStream
                                    $netStream.CopyTo($ms)
                                    $arr = $ms.ToArray()
                                    if ($arr.Length -gt 0 -and $arr.Length -lt 600000) {
                                        # 17372 bytes (150x83) adalah ikon aplikasi fallback Brave.exe saat sampul asli belum dimuat
                                        $isAppLogo = ($arr.Length -eq 17372)
                                        if (-not $isAppLogo -or -not $script:lastThumbB64) {
                                            $script:lastThumbB64 = [Convert]::ToBase64String($arr)
                                            $script:lastThumbIsAppIcon = $isAppLogo
                                            $script:thumbJustLoaded = $true
                                        }
                                    }
                                    $ms.Dispose()
                                    $netStream.Dispose()
                                }
                            }
                        } catch {}
                    # Segarkan kembali timeline tepat setelah operasi async selesai agar $pos 0ms akurat
                    $tl = $session.GetTimelineProperties()
                }

                $pos = 0
                $rawBasePos = 0
                $lastUpdatedMs = 0
                if ($tl) {
                    $dur = [math]::Round($tl.EndTime.TotalSeconds, 3)
                    $rawBasePos = [math]::Round($tl.Position.TotalSeconds, 3)
                    $basePos = $tl.Position.TotalSeconds
                    if ($tl.LastUpdatedTime -and $tl.LastUpdatedTime.Year -gt 2000) {
                        $lastUpdatedMs = $tl.LastUpdatedTime.ToUnixTimeMilliseconds()
                        if ($status -eq 'Playing') {
                            $elapsed = ([DateTimeOffset]::UtcNow - $tl.LastUpdatedTime).TotalSeconds
                            if ($elapsed -ge 0 -and $elapsed -lt 36000) {
                                $basePos += $elapsed
                            }
                        }
                    }
                    if ($dur -gt 0 -and $basePos -gt $dur) { $basePos = $dur }
                    $pos = [math]::Round($basePos, 3)
                }

                $volPct = $null
                try {
                    $curVol = [AudioMaster]::GetVolume()
                    if ($curVol -ge 0) { $volPct = [math]::Round($curVol * 100) }
                } catch {}

                # Optimasi Payload: Hanya kirim base64 gambar saat baru dimuat / lagu baru
                # Polling reguler 200ms cukup kirim metadata ringan (180 bytes vs 300KB)
                $thumbToSend = if ($trackChanged -or $script:thumbJustLoaded) {
                    $script:thumbJustLoaded = $false
                    $script:lastThumbB64
                } else {
                    $null
                }

                $mediaPayload = @{
                    type = "media"
                    active = ($script:lastMediaTitle.Length -gt 0)
                    title = $script:lastMediaTitle
                    artist = $script:lastMediaArtist
                    status = $status
                    pos = $pos
                    basePos = $rawBasePos
                    lastUpdatedMs = $lastUpdatedMs
                    dur = $dur
                    volume = $volPct
                    app = $appId
                    thumb = $thumbToSend
                    isAppIcon = [bool]$script:lastThumbIsAppIcon
                } | ConvertTo-Json -Compress
                [Console]::WriteLine($mediaPayload)
            } else {
                $script:lastMediaTitle = ""
                [Console]::WriteLine('{"type":"media","active":false}')
            }
        }
    } catch {}
}

while ($true) {
    # 1. Cek perintah media instan dari Electron (.media-cmd: PLAYPAUSE, NEXT, PREV)
    Process-MediaCmd

    # 2. Baca status musik / media yang sedang diputar di Windows (presisi milidetik)
    Poll-MediaSession $false

    # 3. Baca notifikasi masuk (WhatsApp, Phone Link / Koneksi ke Windows HP, Telegram, dll.)
    try {
        if ($notifAccess -eq 'Allowed') {
            $notifs = Await ($notifListener.GetNotificationsAsync([Windows.UI.Notifications.NotificationKinds]::Toast)) ([System.Collections.Generic.IReadOnlyList[Windows.UI.Notifications.UserNotification]])
            if ($notifs) {
                $newItems = @()
                foreach ($n in $notifs) {
                    $nid = [string]$n.Id
                    if (-not $seenNotifIds.ContainsKey($nid)) {
                        $seenNotifIds[$nid] = $true
                        $appName = ""
                        try { $appName = [string]$n.AppInfo.DisplayInfo.DisplayName } catch {}
                        if ($appName -match 'Antigravity|Snipping Tool|Security|Windows Defender') {
                            continue
                        }
                        $binding = $n.Notification.Visual.GetBinding([Windows.UI.Notifications.KnownNotificationBindings]::ToastGeneric)
                        $texts = @()
                        if ($binding) {
                            foreach ($t in $binding.GetTextElements()) {
                                if ($t.Text) { $texts += [string]$t.Text }
                            }
                        }
                        if ($texts.Count -gt 0) {
                            $sender = $texts[0]
                            if ($sender -match 'Deadline LMS Mendesak') { continue }
                            $msg = if ($texts.Count -gt 1) { ($texts[1..($texts.Count - 1)] -join ' ') } else { "" }
                            $lowApp = $appName.ToLowerInvariant()
                            $lowSender = $sender.ToLowerInvariant()
                            $isWa = ($lowApp -match 'whatsapp|electron') -or ($lowSender -match 'whatsapp') -or ($msg.ToLowerInvariant() -match 'whatsapp')
                            if ($lowApp -eq 'electron') {
                                $appName = "WhatsApp"
                            }
                            $isPhone = ($lowApp -match 'phone|koneksi|link to windows|yourphone|crossdevice')
                            $newItems += @{
                                id = $nid
                                app = if ($isWa) { "WhatsApp" } elseif ($appName) { $appName } else { "Notifikasi" }
                                sender = $sender
                                message = $msg
                                isWhatsApp = [bool]$isWa
                                isPhone = [bool]$isPhone
                                time = $n.CreationTime.ToUnixTimeMilliseconds()
                                isNew = (-not $initialNotifPass)
                            }
                        }
                    }
                }
                $initialNotifPass = $false
                if ($newItems.Count -gt 0) {
                    $notifPayload = @{
                        type = "notifs"
                        items = @($newItems | Select-Object -Last 8)
                    } | ConvertTo-Json -Compress -Depth 4
                    [Console]::WriteLine($notifPayload)
                }
            }
        }
    } catch {}

    # 4. Baca Baterai Laptop, Status Cas, Baterai HP (Redmi Note 13 Pro+ 5G, dll.) & TWS/Headset Bluetooth
    if (($tickCount % 5) -eq 0) {
        try {
            $ps = [System.Windows.Forms.SystemInformation]::PowerStatus
            $laptopPct = [math]::Round($ps.BatteryLifePercent * 100)
            if ($laptopPct -gt 100) { $laptopPct = 100 }
            $isCharging = ($ps.PowerLineStatus -eq [System.Windows.Forms.PowerLineStatus]::Online)

            # 1) Kumpulkan persentase baterai Bluetooth dari HFP (0000111*) dan BLE GATT Battery (0000180f*) berdasarkan MAC
            $btBatByMac = @{}
            $hfpKeys = Get-ChildItem "HKLM:\SYSTEM\CurrentControlSet\Enum\BTHENUM\{0000111*" -ErrorAction SilentlyContinue
            foreach ($k in $hfpKeys) {
                foreach ($sub in (Get-ChildItem $k.PSPath -ErrorAction SilentlyContinue)) {
                    $instId = "BTHENUM\$($k.PSChildName)\$($sub.PSChildName)"
                    $bat = [BtBatteryReader]::GetBattery($instId)
                    if ($bat -ge 0 -and $bat -le 100 -and $sub.PSChildName -match '&([0-9A-Fa-f]{12})_') {
                        $btBatByMac[$Matches[1].ToUpperInvariant()] = $bat
                    }
                }
            }
            $bleBatKeys = Get-ChildItem "HKLM:\SYSTEM\CurrentControlSet\Enum\BTHLEDevice\{0000180f*" -ErrorAction SilentlyContinue
            foreach ($k in $bleBatKeys) {
                if ($k.PSChildName -match '_([0-9A-Fa-f]{12})$') {
                    $mac = $Matches[1].ToUpperInvariant()
                    foreach ($sub in (Get-ChildItem $k.PSPath -ErrorAction SilentlyContinue)) {
                        $instId = "BTHLEDevice\$($k.PSChildName)\$($sub.PSChildName)"
                        $bat = [BtBatteryReader]::GetBattery($instId)
                        if ($bat -ge 0 -and $bat -le 100) {
                            $btBatByMac[$mac] = $bat
                        }
                    }
                }
            }

            # 2) Pindai SEMUA perangkat Bluetooth Classic (BTHENUM\Dev_*) & Bluetooth LE (BTHLE\Dev_*): TWS, Speaker, Mouse, Keyboard, Gamepad, HP
            $devices = @()
            $seenDevNames = @{}
            foreach ($enumRoot in @("BTHENUM", "BTHLE")) {
                $devKeys = Get-ChildItem "HKLM:\SYSTEM\CurrentControlSet\Enum\$enumRoot\Dev_*" -ErrorAction SilentlyContinue
                foreach ($dk in $devKeys) {
                    if ($dk.PSChildName -match '^Dev_([0-9A-Fa-f]{12})$') {
                        $mac = $Matches[1].ToUpperInvariant()
                        foreach ($dsub in (Get-ChildItem $dk.PSPath -ErrorAction SilentlyContinue)) {
                            $devInstId = "$enumRoot\$($dk.PSChildName)\$($dsub.PSChildName)"
                            $rawFn = [string](Get-ItemProperty $dsub.PSPath -Name FriendlyName -ErrorAction SilentlyContinue).FriendlyName
                            $cleanName = ($rawFn -replace 'Hands-Free.*$', '').Trim()
                            if (-not $cleanName -or $cleanName -match '^DESKTOP-' -or $cleanName.Length -gt 38 -or $cleanName -match '^[A-Za-z0-9+/=-]{20,}$') {
                                continue
                            }
                            $conn = [BtBatteryReader]::IsConnected($devInstId)
                            $bat = if ($btBatByMac.ContainsKey($mac)) { [int]$btBatByMac[$mac] } else { [BtBatteryReader]::GetBattery($devInstId) }
                            $cat = [BtBatteryReader]::GetCategory($devInstId)

                            $kind = "audio"
                            if ($cat -match 'Communication\.Phone' -or $cleanName -match 'Redmi|Xiaomi|Galaxy|iPhone|OPPO|Vivo|Realme|Infinix|POCO|Pixel') {
                                $kind = "phone"
                            } elseif ($cat -match 'Mouse' -or $cleanName -match '(?i)Mouse|RX120|Viper|DeathAdder|Orochi|Basilisk|MX Master|MX Anywhere|G Pro|Superlight') {
                                $kind = "mouse"
                            } elseif ($cat -match 'Keyboard' -or $cleanName -match '(?i)Keyboard|Keychron|Vortex|Ajazz|Aula|Royal Kludge|RK\d+|Anne Pro') {
                                $kind = "keyboard"
                            } elseif ($cat -match 'Gaming|Gamepad' -or $cleanName -match '(?i)Controller|Gamepad|Xbox|DualSense|DualShock|8BitDo') {
                                $kind = "gamepad"
                            }

                            if ($seenDevNames.ContainsKey($cleanName)) {
                                $idx = $seenDevNames[$cleanName]
                                if ($conn) { $devices[$idx].connected = $true }
                                if ($bat -ge 0) { $devices[$idx].battery = $bat }
                            } else {
                                $seenDevNames[$cleanName] = $devices.Count
                                $devices += @{
                                    name = $cleanName
                                    battery = $bat
                                    charging = $false
                                    kind = $kind
                                    connected = [bool]$conn
                                }
                            }
                        }
                    }
                }
            }

            # 3) Pindai perangkat eksternal USB bernama (DAC, Microphone, Headset USB, dll.) via .NET Registry cepat (~20ms)
            try {
                $usbRoot = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey("SYSTEM\CurrentControlSet\Enum\USB")
                if ($usbRoot) {
                    foreach ($vidPid in $usbRoot.GetSubKeyNames()) {
                        $vpKey = $usbRoot.OpenSubKey($vidPid)
                        if ($vpKey) {
                            foreach ($inst in $vpKey.GetSubKeyNames()) {
                                $iKey = $vpKey.OpenSubKey($inst)
                                if ($iKey) {
                                    $rawFn = [string]$iKey.GetValue("FriendlyName")
                                    $iKey.Close()
                                    if ($rawFn -and $rawFn -notmatch '^@|Integrated Camera|MIDI function|Generic|Hub|Composite|Controller') {
                                        $cleanName = $rawFn.Trim()
                                        $usbInstId = "USB\$vidPid\$inst"
                                        $started = [BtBatteryReader]::IsStarted($usbInstId)
                                        if ($seenDevNames.ContainsKey($cleanName)) {
                                            $idx = $seenDevNames[$cleanName]
                                            if ($started) { $devices[$idx].connected = $true }
                                        } else {
                                            $seenDevNames[$cleanName] = $devices.Count
                                            $devices += @{
                                                name = $cleanName
                                                battery = -1
                                                charging = $false
                                                kind = "usb"
                                                connected = [bool]$started
                                            }
                                        }
                                    }
                                }
                            }
                            $vpKey.Close()
                        }
                    }
                    $usbRoot.Close()
                }
            } catch {}

            # Baca status baterai & cas HP realtime dari StartMenuCompanion.json milik Phone Link (tetap bekerja walau jendela Phone Link ditutup)
            $plBat = -1
            $plCharging = $false
            $plOnline = $false
            $plPhoneName = "Redmi Note 13 Pro+ 5G"
            try {
                $companionPath = Join-Path $env:LOCALAPPDATA "Packages\Microsoft.YourPhone_8wekyb3d8bbwe\LocalState\StartMenu\StartMenuCompanion.json"
                if ([System.IO.File]::Exists($companionPath)) {
                    $rawJson = [System.IO.File]::ReadAllText($companionPath, [System.Text.Encoding]::UTF8)
                    if ($rawJson) {
                        $nameMatch = [regex]::Match($rawJson, '"speak"\s*:\s*"([^"]+?)\s*-\s*(?:Connected|Disconnected|Terhubung|Terputus)')
                        if ($nameMatch.Success) {
                            $plPhoneName = $nameMatch.Groups[1].Value.Replace('\u002B', '+').Trim()
                        }
                        $batMatch = [regex]::Match($rawJson, '(?:Battery|currently at|Baterai)\s*(\d{1,3})\s*%', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
                        if ($batMatch.Success) {
                            $val = [int]$batMatch.Groups[1].Value
                            if ($val -ge 1 -and $val -le 100) { $plBat = $val }
                        }
                        $plCharging = ($rawJson -match '(?i)charging|mengisi daya') -and ($rawJson -notmatch '(?i)not charging|tidak mengisi')
                        $plOnline = ($rawJson -match '(?i)Connected to your PC|Terhubung ke PC')
                    }
                }
            } catch {}

            if ($plBat -ge 0) {
                $foundPhone = $false
                for ($i = 0; $i -lt $devices.Count; $i++) {
                    if ($devices[$i].kind -eq "phone") {
                        $devices[$i].battery = $plBat
                        $devices[$i].charging = [bool]$plCharging
                        $devices[$i].connected = [bool]$plOnline -or [bool]$devices[$i].connected
                        $foundPhone = $true
                    }
                }
                if (-not $foundPhone) {
                    $devices += @{
                        name = $plPhoneName
                        battery = $plBat
                        charging = [bool]$plCharging
                        kind = "phone"
                        connected = [bool]$plOnline
                    }
                }
            }

            $powerPayload = @{
                type = "power"
                laptop = @{
                    battery = $laptopPct
                    charging = [bool]$isCharging
                }
                devices = $devices
            } | ConvertTo-Json -Compress -Depth 4
            [Console]::WriteLine($powerPayload)
        } catch {}
    }

    $tickCount++
    for ($w = 0; $w -lt 18; $w++) {
        Start-Sleep -Milliseconds 50
        Process-MediaCmd
        if ($w -eq 4 -or $w -eq 8 -or $w -eq 12 -or $w -eq 16) {
            Poll-MediaSession $true
        }
        if ($w -eq 0 -or $w -eq 9) {
            try {
                $curV = [AudioMaster]::GetVolume()
                $curM = [AudioMaster]::GetMute()
                if ($curV -ge 0) {
                    $lvl = [math]::Round($curV * 100)
                    if ($lvl -ne $script:lastReportedVol -or [bool]$curM -ne [bool]$script:lastReportedMute) {
                        $script:lastReportedVol = $lvl
                        $script:lastReportedMute = [bool]$curM
                        $volPayload = @{
                            type = "volume"
                            level = $lvl
                            muted = [bool]$curM
                        } | ConvertTo-Json -Compress
                        [Console]::WriteLine($volPayload)
                    }
                }
            } catch {}
        }
    }
}
