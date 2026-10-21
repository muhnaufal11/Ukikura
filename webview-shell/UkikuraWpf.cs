using System;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows;
using System.Windows.Forms; // For NotifyIcon and Screen
using System.Windows.Interop;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.Wpf;

namespace Ukikura.NativeWpf {
    public class UkikuraWindow : Window {
        private WebView2 _webView;
        private Process _bridgeProc;
        private NotifyIcon _trayIcon;
        private DispatcherTimer _hoverTimer;
        private bool _lastIgnoreState = false;

        [DllImport("user32.dll")]
        public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

        [DllImport("user32.dll")]
        public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll")]
        [return: MarshalAs(UnmanagedType.Bool)]
        public static extern bool GetCursorPos(out POINT lpPoint);

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT {
            public int X;
            public int Y;
        }

        private const int GWL_EXSTYLE = -20;
        private const int WS_EX_TOOLWINDOW = 0x00000080;
        private const int WS_EX_TRANSPARENT = 0x00000020;

        public UkikuraWindow() {
            Environment.SetEnvironmentVariable("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "00000000");

            this.Title = "Ukikura (浮倉)";
            this.WindowStyle = WindowStyle.None;
            this.AllowsTransparency = true;
            this.Background = System.Windows.Media.Brushes.Transparent;
            this.Topmost = true;
            this.ShowInTaskbar = false;
            this.Width = 580;
            this.Height = 240;

            var screen = Screen.PrimaryScreen.Bounds;
            this.Left = (screen.Width - this.Width) / 2.0;
            this.Top = 0;

            var grid = new System.Windows.Controls.Grid {
                Background = System.Windows.Media.Brushes.Transparent
            };
            this.Content = grid;

            _webView = new WebView2 {
                DefaultBackgroundColor = System.Drawing.Color.Transparent
            };
            grid.Children.Add(_webView);

            InitializeTray();

            this.Loaded += UkikuraWindow_Loaded;
            this.Closing += UkikuraWindow_Closing;
        }

        protected override void OnSourceInitialized(EventArgs e) {
            base.OnSourceInitialized(e);
            try {
                var hwnd = new WindowInteropHelper(this).Handle;
                int exStyle = GetWindowLong(hwnd, GWL_EXSTYLE);
                SetWindowLong(hwnd, GWL_EXSTYLE, exStyle | WS_EX_TOOLWINDOW);
            } catch {}
        }

        private void InitializeTray() {
            try {
                string icoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"assets\ukikura-logo.ico");
                if (!File.Exists(icoPath)) {
                    icoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"..\assets\ukikura-logo.ico");
                }

                _trayIcon = new NotifyIcon {
                    Text = "Ukikura (浮倉) — Native Non-Electron Dynamic Island",
                    Visible = true
                };

                if (File.Exists(icoPath)) {
                    _trayIcon.Icon = new System.Drawing.Icon(icoPath);
                } else {
                    _trayIcon.Icon = System.Drawing.SystemIcons.Application;
                }

                var menu = new ContextMenuStrip();
                menu.Items.Add("Tampilkan Kapsul", null, (s, e) => {
                    this.WindowState = WindowState.Normal;
                    this.Activate();
                });
                menu.Items.Add("-");
                menu.Items.Add("Keluar Ukikura", null, (s, e) => {
                    System.Windows.Application.Current.Shutdown();
                });
                _trayIcon.ContextMenuStrip = menu;
            } catch {}
        }

        private async void UkikuraWindow_Loaded(object sender, RoutedEventArgs e) {
            try {
                string userDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ukikura", "WebView2Data");
                var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
                await _webView.EnsureCoreWebView2Async(env);

                _webView.DefaultBackgroundColor = System.Drawing.Color.Transparent;
                _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                _webView.CoreWebView2.Settings.IsZoomControlEnabled = false;

                // Inject shim JS
                string shimJs = @"
                    (function() {
                        window.__UKIKURA_NATIVE_NON_ELECTRON__ = true;
                    })();
                ";
                await _webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(shimJs);
                _webView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;

                // Load renderer HTML
                string htmlPath = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"dynamic-island\renderer\index.html"));
                if (!File.Exists(htmlPath)) {
                    htmlPath = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"..\dynamic-island\renderer\index.html"));
                }

                if (File.Exists(htmlPath)) {
                    _webView.CoreWebView2.Navigate(new Uri(htmlPath).AbsoluteUri);
                }

                StartBridge();
                StartHoverLoop();
            } catch (Exception ex) {
                System.Windows.MessageBox.Show("Gagal inisialisasi WebView2: " + ex.Message, "Ukikura Native Host", MessageBoxButton.OK, MessageBoxImage.Error);
            }
        }

        private void StartHoverLoop() {
            _hoverTimer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(16) };
            _hoverTimer.Tick += (s, e) => {
                try {
                    POINT pt;
                    GetCursorPos(out pt);
                    int screenWidth = Screen.PrimaryScreen.Bounds.Width;
                    int centerX = screenWidth / 2;

                    // Notch area: 520 x 200
                    bool insideNotch = (pt.X >= (centerX - 260) && pt.X <= (centerX + 260) && pt.Y >= 0 && pt.Y <= 200);

                    bool needIgnore = !insideNotch;
                    if (needIgnore != _lastIgnoreState) {
                        _lastIgnoreState = needIgnore;
                        var hwnd = new WindowInteropHelper(this).Handle;
                        int exStyle = GetWindowLong(hwnd, GWL_EXSTYLE);
                        if (needIgnore) {
                            SetWindowLong(hwnd, GWL_EXSTYLE, exStyle | WS_EX_TRANSPARENT);
                        } else {
                            SetWindowLong(hwnd, GWL_EXSTYLE, exStyle & ~WS_EX_TRANSPARENT);
                        }
                    }

                    if (insideNotch && _webView != null && _webView.CoreWebView2 != null) {
                        int dx = pt.X - centerX;
                        int dy = pt.Y - 15;
                        _webView.CoreWebView2.ExecuteScriptAsync(string.Format("window.dispatchEvent(new CustomEvent('ipc-nusa-cursor', {{ detail: {{ dx: {0}, dy: {1} }} }}));", dx, dy));
                    }
                } catch {}
            };
            _hoverTimer.Start();
        }

        private void CoreWebView2_WebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e) {
            try {
                string json = e.WebMessageAsJson;
                if (!string.IsNullOrEmpty(json)) {
                    if (json.Contains("\"media-control\"") || json.Contains("\"media-cmd\"")) {
                        var m = System.Text.RegularExpressions.Regex.Match(json, "\"args\"\\s*:\\s*\\[\\s*\"([^\"]+)\"");
                        if (!m.Success) m = System.Text.RegularExpressions.Regex.Match(json, "\"cmd\"\\s*:\\s*\"([^\"]+)\"");
                        if (m.Success && _bridgeProc != null && !_bridgeProc.HasExited) {
                            _bridgeProc.StandardInput.WriteLine(m.Groups[1].Value);
                        }
                    } else if (json.Contains("\"island-open-url\"")) {
                        var m = System.Text.RegularExpressions.Regex.Match(json, "\"url\"\\s*:\\s*\"([^\"]+)\"");
                        if (m.Success) {
                            Process.Start(new ProcessStartInfo(m.Groups[1].Value) { UseShellExecute = true });
                        }
                    }
                }
            } catch {}
        }

        private void StartBridge() {
            try {
                string bridgeExe = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"dynamic-island\bridge\ukikura-bridge.exe"));
                if (!File.Exists(bridgeExe)) {
                    bridgeExe = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"..\dynamic-island\bridge\ukikura-bridge.exe"));
                }
                if (!File.Exists(bridgeExe)) return;

                var psi = new ProcessStartInfo {
                    FileName = bridgeExe,
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardInput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                    StandardOutputEncoding = Encoding.UTF8
                };

                _bridgeProc = Process.Start(psi);
                if (_bridgeProc != null) {
                    var thread = new Thread(ReadBridgeLoop) { IsBackground = true };
                    thread.Start();
                }
            } catch {}
        }

        private void ReadBridgeLoop() {
            try {
                while (_bridgeProc != null && !_bridgeProc.HasExited) {
                    string line = _bridgeProc.StandardOutput.ReadLine();
                    if (string.IsNullOrEmpty(line)) continue;
                    line = line.Trim();
                    if (!line.StartsWith("{")) continue;

                    this.Dispatcher.BeginInvoke(new Action(() => {
                        try {
                            if (_webView != null && _webView.CoreWebView2 != null) {
                                if (line.Contains("\"type\":\"media\"")) {
                                    _webView.CoreWebView2.ExecuteScriptAsync(string.Format("window.dispatchEvent(new CustomEvent('ipc-media-update', {{ detail: {0} }}));", line));
                                } else if (line.Contains("\"type\":\"notifs\"")) {
                                    var m = System.Text.RegularExpressions.Regex.Match(line, "\"items\":(\\[.*\\])");
                                    string itemsJson = m.Success ? m.Groups[1].Value : "[]";
                                    _webView.CoreWebView2.ExecuteScriptAsync(string.Format("window.dispatchEvent(new CustomEvent('ipc-notif-update', {{ detail: {0} }}));", itemsJson));
                                } else if (line.Contains("\"type\":\"power\"")) {
                                    _webView.CoreWebView2.ExecuteScriptAsync(string.Format("window.dispatchEvent(new CustomEvent('ipc-power-update', {{ detail: {0} }}));", line));
                                } else if (line.Contains("\"type\":\"volume\"")) {
                                    _webView.CoreWebView2.ExecuteScriptAsync(string.Format("window.dispatchEvent(new CustomEvent('ipc-volume-update', {{ detail: {0} }}));", line));
                                }
                            }
                        } catch {}
                    }));
                }
            } catch {}
        }

        private void UkikuraWindow_Closing(object sender, System.ComponentModel.CancelEventArgs e) {
            try {
                if (_hoverTimer != null) _hoverTimer.Stop();
                if (_bridgeProc != null && !_bridgeProc.HasExited) _bridgeProc.Kill();
                if (_trayIcon != null) {
                    _trayIcon.Visible = false;
                    _trayIcon.Dispose();
                }
            } catch {}
        }

        [STAThread]
        public static void Main() {
            var app = new System.Windows.Application();
            app.Run(new UkikuraWindow());
        }
    }
}
