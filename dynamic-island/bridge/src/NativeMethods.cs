using System;
using System.Text;
using System.Runtime.InteropServices;

namespace Ukikura.Bridge {
    [StructLayout(LayoutKind.Sequential)]
    public struct SYSTEM_POWER_STATUS {
        public byte ACLineStatus;
        public byte BatteryFlag;
        public byte BatteryLifePercent;
        public byte SystemStatusFlag;
        public uint BatteryLifeTime;
        public uint BatteryFullLifeTime;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct DEVPROPKEY {
        public Guid fmtid;
        public uint pid;
    }

    public static class NativeMethods {
        [DllImport("kernel32.dll")]
        public static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS lpSystemPowerStatus);

        [DllImport("CfgMgr32.dll", CharSet = CharSet.Unicode)]
        public static extern int CM_Locate_DevNodeW(out uint pdnDevInst, string pDeviceID, uint ulFlags);

        [DllImport("CfgMgr32.dll", CharSet = CharSet.Unicode)]
        public static extern int CM_Get_DevNode_PropertyW(uint dnDevInst, ref DEVPROPKEY PropertyKey, out uint PropertyType, byte[] PropertyBuffer, ref uint PropertyBufferSize, uint ulFlags);

        [DllImport("CfgMgr32.dll")]
        public static extern int CM_Get_DevNode_Status(out uint pulStatus, out uint pulProblemNumber, uint dnDevInst, uint ulFlags);

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

        [DllImport("psapi.dll")]
        public static extern int EmptyWorkingSet(IntPtr hwProc);

        public static int GetBtBattery(string instanceId) {
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

        public static bool IsBtConnected(string instanceId) {
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

        public static bool IsDevStarted(string instanceId) {
            uint devInst;
            if (CM_Locate_DevNodeW(out devInst, instanceId, 0) != 0) return false;
            uint status, problem;
            if (CM_Get_DevNode_Status(out status, out problem, devInst, 0) == 0) {
                return (status & 0x08) != 0;
            }
            return false;
        }

        public static string GetDevCategory(string instanceId) {
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

        public static void SendMediaKey(byte vk) {
            keybd_event(vk, 0, 0, UIntPtr.Zero);
            keybd_event(vk, 0, 2, UIntPtr.Zero);
        }

        public static bool SendYouTubeShortcut(bool isNext) {
            IntPtr foundHwnd = IntPtr.Zero;
            IntPtr fallbackBrowserHwnd = IntPtr.Zero;
            EnumWindows(delegate(IntPtr hWnd, IntPtr lParam) {
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

    public static class AudioMaster {
        private static IAudioEndpointVolume GetVolumeControl() {
            try {
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
            } catch {
                return null;
            }
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
            NativeMethods.SendMediaKey(0xAD);
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
            if (delta > 0) NativeMethods.SendMediaKey(0xAF);
            else if (delta < 0) NativeMethods.SendMediaKey(0xAE);
            return -1f;
        }
    }
}
