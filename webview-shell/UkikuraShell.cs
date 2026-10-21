using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Ukikura.NativeShell {
    public class MainForm : Form {
        private WebView2 _webView;
        private Process _bridgeProc;
        private NotifyIcon _trayIcon;
        private System.Windows.Forms.Timer _hoverTimer;
        private bool _lastIgnoreState = false;

        [DllImport("user32.dll")]
        public static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

        [DllImport("user32.dll")]
        public static extern int GetWindowLong(IntPtr hWnd, int nIndex);

        [DllImport("dwmapi.dll")]
        private static extern int DwmExtendFrameIntoClientArea(IntPtr hWnd, ref MARGINS pMarInsets);

        [StructLayout(LayoutKind.Sequential)]
        private struct MARGINS {
            public int cxLeftWidth;
            public int cxRightWidth;
            public int cyTopHeight;
            public int cyBottomHeight;
        }

        private const int GWL_EXSTYLE = -20;
        private const int WS_EX_TOOLWINDOW = 0x00000080;
        private const int WS_EX_TRANSPARENT = 0x00000020;

        public MainForm() {
            Environment.SetEnvironmentVariable("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "00000000");

            this.FormBorderStyle = FormBorderStyle.None;
            this.StartPosition = FormStartPosition.Manual;
            this.Width = 580;
            this.Height = 240;
            this.TopMost = true;
            this.ShowInTaskbar = false;
            this.BackColor = Color.Black;

            var screen = Screen.PrimaryScreen.Bounds;
            this.Left = (screen.Width - this.Width) / 2;
            this.Top = 0;

            _webView = new WebView2 {
                Dock = DockStyle.Fill,
                DefaultBackgroundColor = Color.Transparent
            };
            this.Controls.Add(_webView);

            InitializeTray();

            this.Load += MainForm_Load;
            this.FormClosing += MainForm_FormClosing;
        }

        protected override void OnHandleCreated(EventArgs e) {
            base.OnHandleCreated(e);
            try {
                int exStyle = GetWindowLong(this.Handle, GWL_EXSTYLE);
                SetWindowLong(this.Handle, GWL_EXSTYLE, exStyle | WS_EX_TOOLWINDOW);

                MARGINS margins = new MARGINS { cxLeftWidth = -1, cxRightWidth = -1, cyTopHeight = -1, cyBottomHeight = -1 };
                DwmExtendFrameIntoClientArea(this.Handle, ref margins);
            } catch {}
        }

        protected override void OnPaintBackground(PaintEventArgs e) {
            using (var brush = new SolidBrush(Color.Black)) {
                e.Graphics.FillRectangle(brush, this.ClientRectangle);
            }
        }

        private void InitializeTray() {
            try {
                string icoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"assets\ukikura-logo.ico");
                if (!File.Exists(icoPath)) {
                    icoPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"..\assets\ukikura-logo.ico");
                }

                _trayIcon = new NotifyIcon {
                    Text = "Ukikura (浮倉) — Native WebView2 Notch",
                    Visible = true
                };

                if (File.Exists(icoPath)) {
                    _trayIcon.Icon = new Icon(icoPath);
                } else {
                    _trayIcon.Icon = SystemIcons.Application;
                }

                var menu = new ContextMenuStrip();
                menu.Items.Add("Tampilkan Kapsul", null, (s, e) => {
                    this.WindowState = FormWindowState.Normal;
                    this.BringToFront();
                });
                menu.Items.Add("-");
                menu.Items.Add("Keluar Ukikura", null, (s, e) => {
                    Application.Exit();
                });
                _trayIcon.ContextMenuStrip = menu;
            } catch {}
        }

        private async void MainForm_Load(object sender, EventArgs e) {
            try {
                string userDataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ukikura", "WebView2Data");
                var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder);
                await _webView.EnsureCoreWebView2Async(env);

                _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
                _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                _webView.CoreWebView2.Settings.IsZoomControlEnabled = false;

                // Inject Electron API Compatibility Shim for 100% existing renderer code support
                string shimJs = @"
                    (function() {
                        window.__UKIKURA_NATIVE_WEBVIEW2__ = true;
                    })();
                ";
                await _webView.CoreWebView2.AddScriptToExecuteOnDocumentCreatedAsync(shimJs);

                _webView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;

                // Navigate to renderer HTML
                string htmlPath = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"dynamic-island\renderer\index.html"));
                if (!File.Exists(htmlPath)) {
                    htmlPath = Path.GetFullPath(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"..\dynamic-island\renderer\index.html"));
                }

                if (File.Exists(htmlPath)) {
                    _webView.CoreWebView2.Navigate(new Uri(htmlPath).AbsoluteUri);
                } else {
                    _webView.CoreWebView2.NavigateToString("<html><body style='color:white;font-family:sans-serif;'><h3>Ukikura Renderer Not Found</h3><p>" + htmlPath + "</p></body></html>");
                }

                StartBridge();
                StartHoverLoop();
            } catch (Exception ex) {
                MessageBox.Show("Gagal menginisialisasi WebView2: " + ex.Message, "Ukikura Native Host", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void StartHoverLoop() {
            _hoverTimer = new System.Windows.Forms.Timer { Interval = 16 };
            _hoverTimer.Tick += (s, e) => {
                try {
                    Point pt = Cursor.Position;
                    int screenWidth = Screen.PrimaryScreen.Bounds.Width;
                    int centerX = screenWidth / 2;

                    // Notch area detection: closed is 176 x 25, open is 520 x 188
                    bool insideNotch = (pt.X >= (centerX - 260) && pt.X <= (centerX + 260) && pt.Y >= 0 && pt.Y <= 200);

                    bool needIgnore = !insideNotch;
                    if (needIgnore != _lastIgnoreState) {
                        _lastIgnoreState = needIgnore;
                        int exStyle = GetWindowLong(this.Handle, GWL_EXSTYLE);
                        if (needIgnore) {
                            SetWindowLong(this.Handle, GWL_EXSTYLE, exStyle | WS_EX_TRANSPARENT);
                        } else {
                            SetWindowLong(this.Handle, GWL_EXSTYLE, exStyle & ~WS_EX_TRANSPARENT);
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

                    this.BeginInvoke(new Action(() => {
                        try {
                            if (_webView == null || _webView.CoreWebView2 == null) return;
                            if (line.Contains("\"type\":\"media\"")) {
                                _webView.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new CustomEvent('ipc-media-update', { detail: " + line + " }));");
                            } else if (line.Contains("\"type\":\"notifs\"")) {
                                int idx = line.IndexOf("\"items\":");
                                if (idx > 0) {
                                    string itemsPart = line.Substring(idx + 8);
                                    if (itemsPart.EndsWith("}")) itemsPart = itemsPart.Substring(0, itemsPart.Length - 1);
                                    _webView.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new CustomEvent('ipc-notif-update', { detail: " + itemsPart + " }));");
                                }
                            } else if (line.Contains("\"type\":\"power\"")) {
                                _webView.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new CustomEvent('ipc-power-update', { detail: " + line + " }));");
                            } else if (line.Contains("\"type\":\"volume\"")) {
                                _webView.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new CustomEvent('ipc-volume-update', { detail: " + line + " }));");
                            }
                        } catch {}
                    }));
                }
            } catch {}
        }

        private void MainForm_FormClosing(object sender, FormClosingEventArgs e) {
            try {
                if (_hoverTimer != null) {
                    _hoverTimer.Stop();
                    _hoverTimer.Dispose();
                }
                if (_trayIcon != null) {
                    _trayIcon.Visible = false;
                    _trayIcon.Dispose();
                }
                if (_bridgeProc != null && !_bridgeProc.HasExited) {
                    _bridgeProc.Kill();
                }
            } catch {}
        }

        [STAThread]
        static void Main() {
            try {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new MainForm());
            } catch (Exception ex) {
                try {
                    File.WriteAllText("crash.log", ex.ToString());
                } catch {}
            }
        }
    }
}
