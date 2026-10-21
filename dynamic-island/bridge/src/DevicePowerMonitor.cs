using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using Microsoft.Win32;

namespace Ukikura.Bridge {
    public class DeviceInfo {
        public string Name;
        public int Battery;
        public bool Charging;
        public string Kind;
        public bool Connected;
    }

    public class DevicePowerMonitor {
        private int _lastLaptopPct = -1;
        private bool _lastCharging = false;
        private List<DeviceInfo> _lastBtDevices = new List<DeviceInfo>();
        private bool _hasInitialScanned = false;
        private int _tick = 0;

        public void Poll() {
            _tick++;
            int laptopPct = 100;
            bool isCharging = false;

            SYSTEM_POWER_STATUS sps;
            if (NativeMethods.GetSystemPowerStatus(out sps)) {
                if (sps.BatteryLifePercent != 255) {
                    laptopPct = Math.Min(100, (int)sps.BatteryLifePercent);
                }
                isCharging = (sps.ACLineStatus == 1);
            }

            bool powerChanged = (laptopPct != _lastLaptopPct) || (isCharging != _lastCharging);
            bool needDeepScan = !_hasInitialScanned || powerChanged || (_tick % 20 == 0);

            List<DeviceInfo> devices;
            if (needDeepScan) {
                _hasInitialScanned = true;
                _lastLaptopPct = laptopPct;
                _lastCharging = isCharging;
                devices = DeepScanDevices();
                _lastBtDevices = devices;
            } else {
                devices = _lastBtDevices;
            }

            if (powerChanged || (_tick % 8 == 0)) {
                try {
                    var sb = new StringBuilder(512);
                    sb.Append("{\"type\":\"power\",");
                    sb.AppendFormat("\"laptop\":{{\"battery\":{0},\"charging\":{1}}},", laptopPct, isCharging ? "true" : "false");
                    sb.Append("\"devices\":[");
                    for (int i = 0; i < devices.Count; i++) {
                        var d = devices[i];
                        if (i > 0) sb.Append(",");
                        sb.Append("{");
                        sb.AppendFormat("\"name\":\"{0}\",", JsonHelper.Escape(d.Name));
                        sb.AppendFormat("\"battery\":{0},", d.Battery);
                        sb.AppendFormat("\"charging\":{0},", d.Charging ? "true" : "false");
                        sb.AppendFormat("\"kind\":\"{0}\",", JsonHelper.Escape(d.Kind));
                        sb.AppendFormat("\"connected\":{0}", d.Connected ? "true" : "false");
                        sb.Append("}");
                    }
                    sb.Append("]}");
                    Console.WriteLine(sb.ToString());
                } catch {}
            }
        }

        private List<DeviceInfo> DeepScanDevices() {
            var devices = new List<DeviceInfo>();
            var seenNames = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            var btBatByMac = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);

            // 1. Scan HFP keys
            try {
                using (var bthEnum = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Enum\BTHENUM")) {
                    if (bthEnum != null) {
                        foreach (var subName in bthEnum.GetSubKeyNames()) {
                            if (subName.StartsWith("{0000111", StringComparison.OrdinalIgnoreCase)) {
                                using (var k = bthEnum.OpenSubKey(subName)) {
                                    if (k != null) {
                                        foreach (var devInst in k.GetSubKeyNames()) {
                                            string instId = @"BTHENUM\" + subName + @"\" + devInst;
                                            int bat = NativeMethods.GetBtBattery(instId);
                                            if (bat >= 0 && bat <= 100) {
                                                var m = Regex.Match(devInst, @"&([0-9A-Fa-f]{12})_");
                                                if (m.Success) {
                                                    btBatByMac[m.Groups[1].Value.ToUpperInvariant()] = bat;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } catch {}

            // 2. Scan BLE battery keys
            try {
                using (var bleEnum = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Enum\BTHLEDevice")) {
                    if (bleEnum != null) {
                        foreach (var subName in bleEnum.GetSubKeyNames()) {
                            if (subName.StartsWith("{0000180f", StringComparison.OrdinalIgnoreCase)) {
                                var m = Regex.Match(subName, @"_([0-9A-Fa-f]{12})$");
                                if (m.Success) {
                                    string mac = m.Groups[1].Value.ToUpperInvariant();
                                    using (var k = bleEnum.OpenSubKey(subName)) {
                                        if (k != null) {
                                            foreach (var devInst in k.GetSubKeyNames()) {
                                                string instId = @"BTHLEDevice\" + subName + @"\" + devInst;
                                                int bat = NativeMethods.GetBtBattery(instId);
                                                if (bat >= 0 && bat <= 100) {
                                                    btBatByMac[mac] = bat;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } catch {}

            // 3. Scan Bluetooth Classic & LE devices
            string[] roots = new string[] { "BTHENUM", "BTHLE" };
            foreach (var enumRoot in roots) {
                try {
                    using (var rKey = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Enum\" + enumRoot)) {
                        if (rKey == null) continue;
                        foreach (var dk in rKey.GetSubKeyNames()) {
                            if (Regex.IsMatch(dk, @"^Dev_([0-9A-Fa-f]{12})$", RegexOptions.IgnoreCase)) {
                                string mac = dk.Substring(4).ToUpperInvariant();
                                using (var subDevKey = rKey.OpenSubKey(dk)) {
                                    if (subDevKey == null) continue;
                                    foreach (var dsub in subDevKey.GetSubKeyNames()) {
                                        using (var targetKey = subDevKey.OpenSubKey(dsub)) {
                                            if (targetKey == null) continue;
                                            string rawFn = targetKey.GetValue("FriendlyName") as string;
                                            if (string.IsNullOrEmpty(rawFn)) continue;
                                            string cleanName = Regex.Replace(rawFn, @"Hands-Free.*$", "", RegexOptions.IgnoreCase).Trim();
                                            if (string.IsNullOrEmpty(cleanName) || cleanName.StartsWith("DESKTOP-") || cleanName.Length > 38 || Regex.IsMatch(cleanName, @"^[A-Za-z0-9+/=-]{20,}$")) {
                                                continue;
                                            }

                                            string devInstId = enumRoot + @"\" + dk + @"\" + dsub;
                                            bool conn = NativeMethods.IsBtConnected(devInstId);
                                            int bat = btBatByMac.ContainsKey(mac) ? btBatByMac[mac] : NativeMethods.GetBtBattery(devInstId);
                                            string cat = NativeMethods.GetDevCategory(devInstId);

                                            string kind = "audio";
                                            if (cat.Contains("Communication.Phone") || Regex.IsMatch(cleanName, @"Redmi|Xiaomi|Galaxy|iPhone|OPPO|Vivo|Realme|Infinix|POCO|Pixel", RegexOptions.IgnoreCase)) {
                                                kind = "phone";
                                            } else if (cat.Contains("Mouse") || Regex.IsMatch(cleanName, @"Mouse|RX120|Viper|DeathAdder|Orochi|Basilisk|MX Master|MX Anywhere|G Pro|Superlight", RegexOptions.IgnoreCase)) {
                                                kind = "mouse";
                                            } else if (cat.Contains("Keyboard") || Regex.IsMatch(cleanName, @"Keyboard|Keychron|Vortex|Ajazz|Aula|Royal Kludge|RK\d+|Anne Pro", RegexOptions.IgnoreCase)) {
                                                kind = "keyboard";
                                            } else if (cat.Contains("Gaming") || cat.Contains("Gamepad") || Regex.IsMatch(cleanName, @"Controller|Gamepad|Xbox|DualSense|DualShock|8BitDo", RegexOptions.IgnoreCase)) {
                                                kind = "gamepad";
                                            }

                                            if (seenNames.ContainsKey(cleanName)) {
                                                int idx = seenNames[cleanName];
                                                if (conn) devices[idx].Connected = true;
                                                if (bat >= 0) devices[idx].Battery = bat;
                                            } else {
                                                seenNames[cleanName] = devices.Count;
                                                devices.Add(new DeviceInfo {
                                                    Name = cleanName,
                                                    Battery = bat,
                                                    Charging = false,
                                                    Kind = kind,
                                                    Connected = conn
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                } catch {}
            }

            // 4. Scan USB devices
            try {
                using (var usbRoot = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Enum\USB")) {
                    if (usbRoot != null) {
                        foreach (var vidPid in usbRoot.GetSubKeyNames()) {
                            using (var vpKey = usbRoot.OpenSubKey(vidPid)) {
                                if (vpKey == null) continue;
                                foreach (var inst in vpKey.GetSubKeyNames()) {
                                    using (var iKey = vpKey.OpenSubKey(inst)) {
                                        if (iKey == null) continue;
                                        string rawFn = iKey.GetValue("FriendlyName") as string;
                                        if (!string.IsNullOrEmpty(rawFn) && !Regex.IsMatch(rawFn, @"^@|Integrated Camera|MIDI function|Generic|Hub|Composite|Controller", RegexOptions.IgnoreCase)) {
                                            string cleanName = rawFn.Trim();
                                            string usbInstId = @"USB\" + vidPid + @"\" + inst;
                                            bool started = NativeMethods.IsDevStarted(usbInstId);
                                            if (seenNames.ContainsKey(cleanName)) {
                                                int idx = seenNames[cleanName];
                                                if (started) devices[idx].Connected = true;
                                            } else {
                                                seenNames[cleanName] = devices.Count;
                                                devices.Add(new DeviceInfo {
                                                    Name = cleanName,
                                                    Battery = -1,
                                                    Charging = false,
                                                    Kind = "usb",
                                                    Connected = started
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } catch {}

            // 5. Scan Phone Link StartMenuCompanion.json
            int plBat = -1;
            bool plCharging = false;
            bool plOnline = false;
            string plPhoneName = "Redmi Note 13 Pro+ 5G";
            try {
                string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string companionPath = Path.Combine(localApp, @"Packages\Microsoft.YourPhone_8wekyb3d8bbwe\LocalState\StartMenu\StartMenuCompanion.json");
                if (File.Exists(companionPath)) {
                    string rawJson = File.ReadAllText(companionPath, Encoding.UTF8);
                    if (!string.IsNullOrEmpty(rawJson)) {
                        var nameMatch = Regex.Match(rawJson, "\"speak\"\\s*:\\s*\"([^\"]+?)\\s*-\\s*(?:Connected|Disconnected|Terhubung|Terputus)");
                        if (nameMatch.Success) {
                            plPhoneName = nameMatch.Groups[1].Value.Replace("\\u002B", "+").Trim();
                        }
                        var batMatch = Regex.Match(rawJson, @"(?:Battery|currently at|Baterai)\s*(\d{1,3})\s*%", RegexOptions.IgnoreCase);
                        if (batMatch.Success) {
                            int val;
                            if (int.TryParse(batMatch.Groups[1].Value, out val) && val >= 1 && val <= 100) {
                                plBat = val;
                            }
                        }
                        plCharging = Regex.IsMatch(rawJson, @"charging|mengisi daya", RegexOptions.IgnoreCase) && !Regex.IsMatch(rawJson, @"not charging|tidak mengisi", RegexOptions.IgnoreCase);
                        plOnline = Regex.IsMatch(rawJson, @"Connected to your PC|Terhubung ke PC", RegexOptions.IgnoreCase);
                    }
                }
            } catch {}

            if (plBat >= 0) {
                bool foundPhone = false;
                for (int i = 0; i < devices.Count; i++) {
                    if (devices[i].Kind == "phone") {
                        devices[i].Battery = plBat;
                        devices[i].Charging = plCharging;
                        devices[i].Connected = plOnline || devices[i].Connected;
                        foundPhone = true;
                    }
                }
                if (!foundPhone) {
                    devices.Add(new DeviceInfo {
                        Name = plPhoneName,
                        Battery = plBat,
                        Charging = plCharging,
                        Kind = "phone",
                        Connected = plOnline
                    });
                }
            }

            return devices;
        }
    }
}
