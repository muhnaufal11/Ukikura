using System;
using System.Collections.Generic;
using System.Text;
using Windows.Foundation;
using Windows.UI.Notifications;
using Windows.UI.Notifications.Management;

namespace Ukikura.Bridge {
    public class NotificationMonitor {
        private UserNotificationListener _listener;
        private UserNotificationListenerAccessStatus _access = UserNotificationListenerAccessStatus.Unspecified;
        private HashSet<string> _seenIds = new HashSet<string>();
        private bool _initialPass = true;

        public void Init() {
            try {
                _listener = UserNotificationListener.Current;
                if (_listener != null) {
                    var op = _listener.RequestAccessAsync();
                    while (op.Status == AsyncStatus.Started) System.Threading.Thread.Sleep(10);
                    if (op.Status == AsyncStatus.Completed) _access = op.GetResults();
                }
            } catch {}
        }

        public void Poll() {
            if (_listener == null || _access != UserNotificationListenerAccessStatus.Allowed) return;
            try {
                var op = _listener.GetNotificationsAsync(NotificationKinds.Toast);
                while (op.Status == AsyncStatus.Started) System.Threading.Thread.Sleep(10);
                if (op.Status != AsyncStatus.Completed) return;
                var notifs = op.GetResults();
                if (notifs == null || notifs.Count == 0) return;

                bool hasNew = false;
                for (int i = notifs.Count - 1; i >= 0; i--) {
                    if (!_seenIds.Contains(notifs[i].Id.ToString())) {
                        hasNew = true;
                        break;
                    }
                }

                if (hasNew || _initialPass) {
                    var newItems = new List<string>();
                    for (int i = 0; i < notifs.Count; i++) {
                        var n = notifs[i];
                        string nid = n.Id.ToString();
                        if (_seenIds.Contains(nid)) continue;
                        _seenIds.Add(nid);

                        string appName = "";
                        try {
                            if (n.AppInfo != null && n.AppInfo.DisplayInfo != null) {
                                appName = n.AppInfo.DisplayInfo.DisplayName ?? "";
                            }
                        } catch {}

                        string lowApp = appName.ToLowerInvariant();
                        if (lowApp.Contains("antigravity") || lowApp.Contains("snipping tool") || lowApp.Contains("security") || lowApp.Contains("windows defender")) {
                            continue;
                        }

                        var binding = n.Notification.Visual.GetBinding(KnownNotificationBindings.ToastGeneric);
                        var texts = new List<string>();
                        if (binding != null) {
                            foreach (var t in binding.GetTextElements()) {
                                if (!string.IsNullOrEmpty(t.Text)) texts.Add(t.Text);
                            }
                        }

                        if (texts.Count > 0) {
                            string sender = texts[0];
                            if (sender.Contains("Deadline LMS Mendesak")) continue;
                            string msg = texts.Count > 1 ? string.Join(" ", texts.GetRange(1, texts.Count - 1).ToArray()) : "";

                            string lowSender = sender.ToLowerInvariant();
                            string lowMsg = msg.ToLowerInvariant();
                            bool isWa = lowApp.Contains("whatsapp") || lowApp.Contains("electron") || lowSender.Contains("whatsapp") || lowMsg.Contains("whatsapp");
                            if (lowApp == "electron") appName = "WhatsApp";

                            bool isPhone = lowApp.Contains("phone") || lowApp.Contains("koneksi") || lowApp.Contains("link to windows") || lowApp.Contains("yourphone") || lowApp.Contains("crossdevice");

                            var itemSb = new StringBuilder();
                            itemSb.Append("{");
                            itemSb.AppendFormat("\"id\":\"{0}\",", JsonHelper.Escape(nid));
                            itemSb.AppendFormat("\"app\":\"{0}\",", JsonHelper.Escape(isWa ? "WhatsApp" : (!string.IsNullOrEmpty(appName) ? appName : "Notifikasi")));
                            itemSb.AppendFormat("\"sender\":\"{0}\",", JsonHelper.Escape(sender));
                            itemSb.AppendFormat("\"message\":\"{0}\",", JsonHelper.Escape(msg));
                            itemSb.AppendFormat("\"isWhatsApp\":{0},", isWa ? "true" : "false");
                            itemSb.AppendFormat("\"isPhone\":{0},", isPhone ? "true" : "false");
                            itemSb.AppendFormat("\"time\":{0},", n.CreationTime.ToUnixTimeMilliseconds());
                            itemSb.AppendFormat("\"isNew\":{0}", _initialPass ? "false" : "true");
                            itemSb.Append("}");

                            newItems.Add(itemSb.ToString());
                        }
                    }

                    _initialPass = false;
                    if (newItems.Count > 0) {
                        int takeCount = Math.Min(8, newItems.Count);
                        int startIdx = newItems.Count - takeCount;
                        var sb = new StringBuilder(512);
                        sb.Append("{\"type\":\"notifs\",\"items\":[");
                        for (int k = startIdx; k < newItems.Count; k++) {
                            if (k > startIdx) sb.Append(",");
                            sb.Append(newItems[k]);
                        }
                        sb.Append("]}");
                        Console.WriteLine(sb.ToString());
                    }
                }
            } catch {}
        }
    }
}
