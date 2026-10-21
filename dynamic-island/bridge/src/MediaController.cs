using System;
using System.IO;
using System.Text;
using System.Threading;
using Windows.Foundation;
using Windows.Media.Control;
using Windows.Storage.Streams;

namespace Ukikura.Bridge {
    public class MediaController {
        private GlobalSystemMediaTransportControlsSessionManager _manager;
        private string _lastTitle = "";
        private string _lastArtist = "";
        private double _lastDur = 0;
        private bool _lastThumbIsAppIcon = false;
        private bool _lastActive = false;
        private string _lastPlaybackStatus = "Closed";
        private string _lastAppId = "";
        private string _lastThumbB64 = "";
        private bool _thumbJustLoaded = false;
        private int _tick = 0;

        public static T Await<T>(IAsyncOperation<T> op) {
            if (op == null) return default(T);
            while (op.Status == AsyncStatus.Started) Thread.Sleep(10);
            if (op.Status == AsyncStatus.Completed) return op.GetResults();
            return default(T);
        }

        public static void Await(IAsyncAction op) {
            if (op == null) return;
            while (op.Status == AsyncStatus.Started) Thread.Sleep(10);
        }

        private byte[] ReadStream(IRandomAccessStreamWithContentType stream) {
            if (stream == null || stream.Size == 0 || stream.Size > 600000) return null;
            try {
                using (var reader = new DataReader(stream.GetInputStreamAt(0))) {
                    var loadOp = reader.LoadAsync((uint)stream.Size);
                    while (loadOp.Status == AsyncStatus.Started) Thread.Sleep(5);
                    if (loadOp.Status != AsyncStatus.Completed) return null;
                    byte[] bytes = new byte[reader.UnconsumedBufferLength];
                    reader.ReadBytes(bytes);
                    return bytes;
                }
            } catch {
                return null;
            }
        }

        public void Poll(bool fastOnly = false) {
            _tick++;
            try {
                if (_manager == null) {
                    _manager = Await(GlobalSystemMediaTransportControlsSessionManager.RequestAsync());
                }
                if (_manager == null) return;

                var session = _manager.GetCurrentSession();
                if (session != null) {
                    var pb = session.GetPlaybackInfo();
                    string status = pb != null ? pb.PlaybackStatus.ToString() : "Closed";
                    string appId = !string.IsNullOrEmpty(session.SourceAppUserModelId) ? session.SourceAppUserModelId : "";
                    bool appChanged = (appId != _lastAppId);

                    bool isPausedOrClosed = (status != "Playing");
                    if (isPausedOrClosed && (status == _lastPlaybackStatus) && !appChanged && (_tick % 10 != 0)) {
                        return;
                    }
                    _lastAppId = appId;

                    var tl = session.GetTimelineProperties();
                    double dur = tl != null ? Math.Round(tl.EndTime.TotalSeconds, 3) : 0;

                    bool needProperties = string.IsNullOrEmpty(_lastTitle) || (Math.Abs(dur - _lastDur) > 0.001) || appChanged || (_tick % 12 == 0);
                    GlobalSystemMediaTransportControlsSessionMediaProperties info = null;
                    bool trackChanged = false;

                    if (needProperties) {
                        info = Await(session.TryGetMediaPropertiesAsync());
                        string newTitle = info != null && !string.IsNullOrEmpty(info.Title) ? info.Title : "";
                        string newArtist = info != null && !string.IsNullOrEmpty(info.Artist) ? info.Artist : "";
                        trackChanged = (newTitle != _lastTitle) || (newArtist != _lastArtist);
                        _lastTitle = newTitle;
                        _lastArtist = newArtist;
                        _lastDur = dur;

                        if (trackChanged) {
                            _lastThumbB64 = "";
                            _lastThumbIsAppIcon = false;
                            _thumbJustLoaded = true;
                        }
                    }

                    bool needThumb = trackChanged || (!fastOnly && (string.IsNullOrEmpty(_lastThumbB64) || _lastThumbIsAppIcon));
                    if (needThumb) {
                        if (info == null) {
                            info = Await(session.TryGetMediaPropertiesAsync());
                        }
                        if (info != null && info.Thumbnail != null) {
                            try {
                                var stream = Await(info.Thumbnail.OpenReadAsync());
                                if (stream != null) {
                                    byte[] arr = ReadStream(stream);
                                    if (arr != null && arr.Length > 0 && arr.Length < 600000) {
                                        bool isAppLogo = (arr.Length == 17372);
                                        if (!isAppLogo || string.IsNullOrEmpty(_lastThumbB64)) {
                                            _lastThumbB64 = Convert.ToBase64String(arr);
                                            _lastThumbIsAppIcon = isAppLogo;
                                            _thumbJustLoaded = true;
                                        }
                                    }
                                }
                            } catch {}
                        }
                        tl = session.GetTimelineProperties();
                    }

                    double pos = 0;
                    double rawBasePos = 0;
                    long lastUpdatedMs = 0;
                    if (tl != null) {
                        dur = Math.Round(tl.EndTime.TotalSeconds, 3);
                        rawBasePos = Math.Round(tl.Position.TotalSeconds, 3);
                        double basePos = tl.Position.TotalSeconds;
                        if (tl.LastUpdatedTime.Year > 2000) {
                            lastUpdatedMs = tl.LastUpdatedTime.ToUnixTimeMilliseconds();
                            if (status == "Playing") {
                                double elapsed = (DateTimeOffset.UtcNow - tl.LastUpdatedTime).TotalSeconds;
                                if (elapsed >= 0 && elapsed < 36000) {
                                    basePos += elapsed;
                                }
                            }
                        }
                        if (dur > 0 && basePos > dur) basePos = dur;
                        pos = Math.Round(basePos, 3);
                    }

                    int? volPct = null;
                    float curVol = AudioMaster.GetVolume();
                    if (curVol >= 0) volPct = (int)Math.Round(curVol * 100);

                    string thumbToSend = (trackChanged || _thumbJustLoaded) ? _lastThumbB64 : null;
                    if (_thumbJustLoaded) _thumbJustLoaded = false;

                    _lastActive = !string.IsNullOrEmpty(_lastTitle);
                    _lastPlaybackStatus = status;

                    var sb = new StringBuilder(512);
                    sb.Append("{\"type\":\"media\",");
                    sb.AppendFormat("\"active\":{0},", _lastActive ? "true" : "false");
                    sb.AppendFormat("\"title\":\"{0}\",", JsonHelper.Escape(_lastTitle));
                    sb.AppendFormat("\"artist\":\"{0}\",", JsonHelper.Escape(_lastArtist));
                    sb.AppendFormat("\"status\":\"{0}\",", JsonHelper.Escape(status));
                    sb.AppendFormat(System.Globalization.CultureInfo.InvariantCulture, "\"pos\":{0},", pos);
                    sb.AppendFormat(System.Globalization.CultureInfo.InvariantCulture, "\"basePos\":{0},", rawBasePos);
                    sb.AppendFormat("\"lastUpdatedMs\":{0},", lastUpdatedMs);
                    sb.AppendFormat(System.Globalization.CultureInfo.InvariantCulture, "\"dur\":{0},", dur);
                    if (volPct.HasValue) sb.AppendFormat("\"volume\":{0},", volPct.Value);
                    else sb.Append("\"volume\":null,");
                    sb.AppendFormat("\"app\":\"{0}\",", JsonHelper.Escape(appId));
                    if (thumbToSend != null) sb.AppendFormat("\"thumb\":\"{0}\",", thumbToSend);
                    else sb.Append("\"thumb\":null,");
                    sb.AppendFormat("\"isAppIcon\":{0}}}", _lastThumbIsAppIcon ? "true" : "false");

                    Console.WriteLine(sb.ToString());
                } else {
                    if (_lastActive) {
                        _lastActive = false;
                        _lastTitle = "";
                        _lastArtist = "";
                        _lastPlaybackStatus = "Closed";
                        _lastAppId = "";
                        Console.WriteLine("{\"type\":\"media\",\"active\":false}");
                    }
                }
            } catch {}
        }

        public bool HandleCommand(string cmd) {
            if (string.IsNullOrEmpty(cmd)) return false;
            cmd = cmd.Trim().ToUpperInvariant();
            bool handled = false;

            if (_manager != null) {
                var curSess = _manager.GetCurrentSession();
                if (curSess != null) {
                    var pbInfo = curSess.GetPlaybackInfo();
                    var ctrls = pbInfo != null ? pbInfo.Controls : null;
                    string appId = !string.IsNullOrEmpty(curSess.SourceAppUserModelId) ? curSess.SourceAppUserModelId.ToLowerInvariant() : "";
                    bool isBrowser = appId.Contains("brave") || appId.Contains("chrome") || appId.Contains("msedge") || appId.Contains("firefox") || appId.Contains("opera") || appId.Contains("vivaldi");

                    if (cmd == "PLAYPAUSE") {
                        handled = Await(curSess.TryTogglePlayPauseAsync());
                    } else if (cmd == "NEXT") {
                        if (ctrls == null || ctrls.IsNextEnabled) {
                            handled = Await(curSess.TrySkipNextAsync());
                        }
                        if (!handled && isBrowser) {
                            handled = NativeMethods.SendYouTubeShortcut(true);
                        }
                    } else if (cmd == "PREV") {
                        if (ctrls == null || ctrls.IsPreviousEnabled) {
                            handled = Await(curSess.TrySkipPreviousAsync());
                        }
                        if (!handled) {
                            if (ctrls != null && ctrls.IsPlaybackPositionEnabled) {
                                handled = Await(curSess.TryChangePlaybackPositionAsync(0));
                            }
                            if (!handled && isBrowser) {
                                handled = NativeMethods.SendYouTubeShortcut(false);
                            }
                        }
                    } else if (cmd.StartsWith("SEEK:")) {
                        double sec;
                        if (double.TryParse(cmd.Substring(5), System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out sec)) {
                            long ticks = (long)Math.Round(sec * 10000000.0);
                            handled = Await(curSess.TryChangePlaybackPositionAsync(ticks));
                            if (handled) Poll(true);
                        }
                    }
                }
            }

            if (!handled) {
                if (cmd == "PLAYPAUSE") NativeMethods.SendMediaKey(0xB3);
                else if (cmd == "NEXT") NativeMethods.SendMediaKey(0xB0);
                else if (cmd == "PREV") NativeMethods.SendMediaKey(0xB1);
            }

            return handled;
        }

        public string PlaybackStatus {
            get { return _lastPlaybackStatus; }
        }
    }
}
