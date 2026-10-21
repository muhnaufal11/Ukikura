using System;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Threading;

namespace Ukikura.Bridge {
    class Program {
        private static MediaController _media;
        private static NotificationMonitor _notif;
        private static DevicePowerMonitor _power;
        private static int _lastReportedVol = -1;
        private static bool _lastReportedMute = false;
        private static string _cmdFile;
        private static string _tempCmdFile;

        static void Main(string[] args) {
            Console.OutputEncoding = Encoding.UTF8;
            _media = new MediaController();
            _notif = new NotificationMonitor();
            _power = new DevicePowerMonitor();

            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            _cmdFile = Path.Combine(appDir, ".media-cmd");
            _tempCmdFile = Path.Combine(Path.GetTempPath(), "ukikura-media.cmd");

            _notif.Init();

            // Report initial volume
            try {
                float initV = AudioMaster.GetVolume();
                bool initM = AudioMaster.GetMute();
                if (initV >= 0) {
                    _lastReportedVol = (int)Math.Round(initV * 100);
                    _lastReportedMute = initM;
                    ReportVolume(_lastReportedVol, _lastReportedMute);
                }
            } catch {}

            // Background Stdin Listener Thread
            var stdinThread = new Thread(ReadStdinLoop);
            stdinThread.IsBackground = true;
            stdinThread.Start();

            // Immediate initial working set trim
            try {
                NativeMethods.EmptyWorkingSet(Process.GetCurrentProcess().Handle);
            } catch {}

            int tickCount = 0;
            while (true) {
                try {
                    ProcessFileCommands();

                    // 1. Poll Media
                    _media.Poll(false);

                    // 2. Poll Notifications every 3 ticks (~2-3 sec)
                    if (tickCount % 3 == 0) {
                        _notif.Poll();
                    }

                    // 3. Poll Power / Devices
                    _power.Poll();

                    // 4. Check Volume changes every 6 ticks
                    if (tickCount % 6 == 0) {
                        try {
                            float curV = AudioMaster.GetVolume();
                            bool curM = AudioMaster.GetMute();
                            if (curV >= 0) {
                                int lvl = (int)Math.Round(curV * 100);
                                if (lvl != _lastReportedVol || curM != _lastReportedMute) {
                                    _lastReportedVol = lvl;
                                    _lastReportedMute = curM;
                                    ReportVolume(_lastReportedVol, _lastReportedMute);
                                }
                            }
                        } catch {}
                    }

                    tickCount++;

                    // 5. Periodic Memory Trim every ~10 ticks to keep RAM consistently < 8 MB
                    if (tickCount % 10 == 0 || tickCount == 1) {
                        try {
                            NativeMethods.EmptyWorkingSet(Process.GetCurrentProcess().Handle);
                        } catch {}
                    }

                    bool isPlaying = (_media.PlaybackStatus == "Playing");
                    int sleepMs = isPlaying ? 650 : 1200;
                    Thread.Sleep(sleepMs);

                    ProcessFileCommands();
                } catch {}
            }
        }

        private static void ReadStdinLoop() {
            try {
                string line;
                while ((line = Console.ReadLine()) != null) {
                    ExecuteCommand(line);
                }
            } catch {}
        }

        private static void ProcessFileCommands() {
            try {
                string activeFile = null;
                if (File.Exists(_tempCmdFile)) activeFile = _tempCmdFile;
                else if (File.Exists(_cmdFile)) activeFile = _cmdFile;

                if (activeFile != null) {
                    string content = File.ReadAllText(activeFile);
                    try { File.Delete(_tempCmdFile); } catch {}
                    try { File.Delete(_cmdFile); } catch {}

                    if (!string.IsNullOrEmpty(content)) {
                        var lines = content.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
                        foreach (var line in lines) {
                            ExecuteCommand(line);
                        }
                    }
                }
            } catch {}
        }

        private static void ExecuteCommand(string rawCmd) {
            if (string.IsNullOrEmpty(rawCmd)) return;
            string cmd = rawCmd.Trim().ToUpperInvariant();
            if (string.IsNullOrEmpty(cmd)) return;

            bool handled = false;

            if (cmd.StartsWith("VOL:") || cmd == "VOLUP" || cmd == "VOLDOWN") {
                float delta = 0.02f;
                if (cmd == "VOLDOWN") delta = -0.02f;
                else if (cmd.StartsWith("VOL:")) {
                    float.TryParse(cmd.Substring(4), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out delta);
                }
                float newVol = AudioMaster.ChangeVolume(delta);
                float curVol = newVol >= 0 ? newVol : AudioMaster.GetVolume();
                if (curVol >= 0) {
                    _lastReportedVol = (int)Math.Round(curVol * 100);
                    _lastReportedMute = AudioMaster.GetMute();
                    ReportVolume(_lastReportedVol, _lastReportedMute);
                }
                handled = true;
            } else if (cmd.StartsWith("VOLSET:")) {
                float target;
                if (float.TryParse(cmd.Substring(7), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out target)) {
                    target = target / 100f;
                    float newVol = AudioMaster.SetVolume(target);
                    float curVol = newVol >= 0 ? newVol : AudioMaster.GetVolume();
                    if (curVol >= 0) {
                        _lastReportedVol = (int)Math.Round(curVol * 100);
                        _lastReportedMute = AudioMaster.GetMute();
                        ReportVolume(_lastReportedVol, _lastReportedMute);
                    }
                }
                handled = true;
            } else if (cmd == "VOLMUTE" || cmd == "MUTE") {
                bool isMuted = AudioMaster.ToggleMute();
                float curVol = AudioMaster.GetVolume();
                _lastReportedVol = curVol >= 0 ? (int)Math.Round(curVol * 100) : 0;
                _lastReportedMute = isMuted;
                ReportVolume(_lastReportedVol, _lastReportedMute);
                handled = true;
            } else if (cmd == "VOLGET") {
                float curVol = AudioMaster.GetVolume();
                if (curVol >= 0) {
                    _lastReportedVol = (int)Math.Round(curVol * 100);
                    _lastReportedMute = AudioMaster.GetMute();
                    ReportVolume(_lastReportedVol, _lastReportedMute);
                }
                handled = true;
            }

            if (!handled) {
                _media.HandleCommand(cmd);
            }
        }

        private static void ReportVolume(int level, bool muted) {
            Console.WriteLine(string.Format("{{\"type\":\"volume\",\"level\":{0},\"muted\":{1}}}", level, muted ? "true" : "false"));
        }
    }
}
