// ==============================================================================
// Ukikura Native C++ Hardware Bridge (ukikura-bridge.exe)
// Replaces winrt-bridge.ps1 with ultra-fast, zero-overhead native Windows C++
// Handles:
// 1. WASAPI Master Volume Control (EndpointVolume)
// 2. WinRT SMTC Media Session (Title, Artist, Position, Duration, Thumbnails, Controls)
// 3. System Power & Laptop Battery (GetSystemPowerStatus) + Bluetooth Devices (CfgMgr32/Registry)
// 4. Windows Toast Notifications (UserNotificationListener)
// ==============================================================================

#define WIN32_LEAN_AND_MEAN
#define UNICODE
#define _UNICODE

#include <windows.h>
#include <mmdeviceapi.h>
#include <endpointvolume.h>
#include <cfgmgr32.h>
#include <roapi.h>
#include <winstring.h>
#include <shcore.h>
#include <psapi.h>

#include <iostream>
#include <string>
#include <vector>
#include <unordered_set>
#include <mutex>
#include <thread>
#include <chrono>
#include <sstream>
#include <iomanip>
#include <atomic>
#include <cmath>
#include <algorithm>

// ------------------------------------------------------------------------------
// WinRT Interface Definitions (COM ABI)
// ------------------------------------------------------------------------------

typedef HRESULT (WINAPI *pfnCreateStreamOverRandomAccessStream)(IUnknown *randomAccessStream, REFIID riid, void **ppv);

struct IAsyncInfo : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_Id(unsigned int *id) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Status(int *status) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_ErrorCode(HRESULT *errorCode) = 0;
    virtual HRESULT STDMETHODCALLTYPE Cancel() = 0;
    virtual HRESULT STDMETHODCALLTYPE Close() = 0;
};
const IID IID_IAsyncInfo = { 0x00000036, 0x0000, 0x0000, { 0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46 } };

struct IRandomAccessStreamReference : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE OpenReadAsync(void **operation) = 0;
};

struct IAsyncOperation_Stream : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE put_Completed(void *handler) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Completed(void **handler) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetResults(IUnknown **results) = 0;
};

struct IGlobalSystemMediaTransportControlsSessionMediaProperties : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_Title(HSTRING *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Subtitle(HSTRING *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_AlbumArtist(HSTRING *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Artist(HSTRING *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_AlbumTitle(HSTRING *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_TrackNumber(int *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Genres(void **value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_AlbumTrackCount(int *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_PlaybackType(void *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Thumbnail(IRandomAccessStreamReference **value) = 0;
};

struct IAsyncOperation_MediaProperties : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE put_Completed(void *handler) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Completed(void **handler) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetResults(IGlobalSystemMediaTransportControlsSessionMediaProperties **results) = 0;
};

struct IGlobalSystemMediaTransportControlsSessionPlaybackInfo : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_Controls(void **value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_PlaybackStatus(int *value) = 0;
};

struct IGlobalSystemMediaTransportControlsSessionTimelineProperties : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_StartTime(long long *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_EndTime(long long *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_MinSeekTime(long long *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_MaxSeekTime(long long *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Position(long long *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_LastUpdatedTime(long long *value) = 0;
};

struct IAsyncOperation_Bool : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE put_Completed(void *handler) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Completed(void **handler) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetResults(bool *results) = 0;
};

struct IGlobalSystemMediaTransportControlsSession : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_SourceAppUserModelId(HSTRING *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE TryGetMediaPropertiesAsync(void **operation) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetTimelineProperties(IGlobalSystemMediaTransportControlsSessionTimelineProperties **timelineProperties) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetPlaybackInfo(IGlobalSystemMediaTransportControlsSessionPlaybackInfo **playbackInfo) = 0;
    virtual HRESULT STDMETHODCALLTYPE TryPlayAsync(void **operation) = 0;
    virtual HRESULT STDMETHODCALLTYPE TryPauseAsync(void **operation) = 0;
    virtual HRESULT STDMETHODCALLTYPE TryStopAsync(void **operation) = 0;
    virtual HRESULT STDMETHODCALLTYPE TryRecordAsync(void **operation) = 0;
    virtual HRESULT STDMETHODCALLTYPE TryFastForwardAsync(void **operation) = 0;
    virtual HRESULT STDMETHODCALLTYPE TryRewindAsync(void **operation) = 0;
    virtual HRESULT STDMETHODCALLTYPE TrySkipNextAsync(void **operation) = 0;
    virtual HRESULT STDMETHODCALLTYPE TrySkipPreviousAsync(void **operation) = 0;
    virtual HRESULT STDMETHODCALLTYPE TryChangeChannelUpAsync(void **operation) = 0;
    virtual HRESULT STDMETHODCALLTYPE TryChangeChannelDownAsync(void **operation) = 0;
    virtual HRESULT STDMETHODCALLTYPE TryTogglePlayPauseAsync(void **operation) = 0;
    virtual HRESULT STDMETHODCALLTYPE TryChangeAutoRepeatModeAsync(int mode, void **operation) = 0;
    virtual HRESULT STDMETHODCALLTYPE TryChangePlaybackRateAsync(double rate, void **operation) = 0;
    virtual HRESULT STDMETHODCALLTYPE TryChangeShuffleActiveAsync(bool active, void **operation) = 0;
    virtual HRESULT STDMETHODCALLTYPE TryChangePlaybackPositionAsync(long long position, void **operation) = 0;
};

struct IGlobalSystemMediaTransportControlsSessionManager : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE GetCurrentSession(IGlobalSystemMediaTransportControlsSession **session) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetSessions(void **sessions) = 0;
};

struct IAsyncOperation_SessionManager : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE put_Completed(void *handler) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Completed(void **handler) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetResults(IGlobalSystemMediaTransportControlsSessionManager **results) = 0;
};

const IID IID_IGlobalSystemMediaTransportControlsSessionManagerStatics = { 0x2050c4ee, 0x11a0, 0x57de, { 0xae, 0xd7, 0xc9, 0x7c, 0x70, 0x33, 0x82, 0x45 } };

struct IGlobalSystemMediaTransportControlsSessionManagerStatics : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE RequestAsync(void **operation) = 0;
};

// --- UserNotificationListener Interfaces ---
const IID IID_IUserNotificationListenerStatics = { 0xff6123cf, 0x4386, 0x4aa3, { 0xb7, 0x3d, 0xb8, 0x04, 0xe5, 0xb6, 0x3b, 0x23 } };

struct IAppDisplayInfo : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_DisplayName(HSTRING *value) = 0;
};

struct IAppInfo : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_Id(HSTRING *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_AppUserModelId(HSTRING *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_DisplayInfo(IAppDisplayInfo **value) = 0;
};

struct IAdaptiveNotificationText : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_Text(HSTRING *value) = 0;
};

struct IReadOnlyList_AdaptiveNotificationText : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE GetAt(unsigned int index, IAdaptiveNotificationText **item) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Size(unsigned int *size) = 0;
};

struct INotificationBinding : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_Template(HSTRING *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE put_Template(HSTRING value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Language(HSTRING *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE put_Language(HSTRING value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Hints(void **value) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetTextElements(IReadOnlyList_AdaptiveNotificationText **value) = 0;
};

struct INotificationVisual : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_Language(HSTRING *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE put_Language(HSTRING value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Bindings(void **value) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetBinding(HSTRING templateName, INotificationBinding **value) = 0;
};

struct IToastNotification : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_Content(void **value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Visual(INotificationVisual **value) = 0;
};

struct IUserNotification : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_Notification(IToastNotification **value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_AppInfo(IAppInfo **value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Id(unsigned int *value) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_CreationTime(long long *value) = 0;
};

struct IReadOnlyList_UserNotification : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE GetAt(unsigned int index, IUserNotification **item) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Size(unsigned int *size) = 0;
};

struct IAsyncOperation_NotifList : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE put_Completed(void *handler) = 0;
    virtual HRESULT STDMETHODCALLTYPE get_Completed(void **handler) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetResults(IReadOnlyList_UserNotification **results) = 0;
};

struct IUserNotificationListener : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE RequestAccessAsync(void **operation) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetAccessStatus(int *accessStatus) = 0;
    virtual HRESULT STDMETHODCALLTYPE add_NotificationChanged(void *handler, long long *token) = 0;
    virtual HRESULT STDMETHODCALLTYPE remove_NotificationChanged(long long token) = 0;
    virtual HRESULT STDMETHODCALLTYPE GetNotificationsAsync(int kinds, void **operation) = 0;
};

struct IUserNotificationListenerStatics : public IInspectable {
    virtual HRESULT STDMETHODCALLTYPE get_Current(IUserNotificationListener **value) = 0;
};

// ------------------------------------------------------------------------------
// Helpers: UTF-8 / JSON / Base64 / Async
// ------------------------------------------------------------------------------

std::mutex g_coutMutex;

void PrintJson(const std::string &json) {
    std::lock_guard<std::mutex> lock(g_coutMutex);
    std::cout << json << "\n";
    std::cout.flush();
}

std::string EscapeJsonString(const std::string &input) {
    std::string out;
    out.reserve(input.size() + 16);
    for (char c : input) {
        switch (c) {
            case '"': out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\b': out += "\\b"; break;
            case '\f': out += "\\f"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default:
                if ((unsigned char)c < 0x20) {
                    char hexBuf[8];
                    snprintf(hexBuf, sizeof(hexBuf), "\\u%04x", (unsigned char)c);
                    out += hexBuf;
                } else {
                    out += c;
                }
                break;
        }
    }
    return out;
}

std::string WideToUtf8(const std::wstring &wstr) {
    if (wstr.empty()) return "";
    int len = WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int)wstr.size(), NULL, 0, NULL, NULL);
    if (len <= 0) return "";
    std::string str(len, '\0');
    WideCharToMultiByte(CP_UTF8, 0, wstr.c_str(), (int)wstr.size(), &str[0], len, NULL, NULL);
    return str;
}

std::string HStringToUtf8(HSTRING hs) {
    if (!hs) return "";
    unsigned int len = 0;
    const wchar_t *buf = WindowsGetStringRawBuffer(hs, &len);
    if (!buf || len == 0) return "";
    return WideToUtf8(std::wstring(buf, len));
}

bool AwaitAsync(void *asyncOp, int maxWaitMs = 1200) {
    if (!asyncOp) return false;
    IAsyncInfo *asyncInfo = nullptr;
    if (FAILED(((IUnknown*)asyncOp)->QueryInterface(IID_IAsyncInfo, (void**)&asyncInfo)) || !asyncInfo) {
        return false;
    }
    int status = 0;
    int waited = 0;
    while (waited < maxWaitMs) {
        if (FAILED(asyncInfo->get_Status(&status))) break;
        if (status != 0) break; // 0 = Started
        Sleep(5);
        waited += 5;
    }
    asyncInfo->Release();
    return (status == 1); // 1 = Completed
}

static const char kBase64Chars[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

std::string Base64Encode(const unsigned char *data, size_t len) {
    std::string out;
    out.reserve(((len + 2) / 3) * 4);
    for (size_t i = 0; i < len; i += 3) {
        unsigned int val = (data[i] << 16) | (((i + 1 < len) ? data[i + 1] : 0) << 8) | ((i + 2 < len) ? data[i + 2] : 0);
        out.push_back(kBase64Chars[(val >> 18) & 0x3F]);
        out.push_back(kBase64Chars[(val >> 12) & 0x3F]);
        out.push_back((i + 1 < len) ? kBase64Chars[(val >> 6) & 0x3F] : '=');
        out.push_back((i + 2 < len) ? kBase64Chars[val & 0x3F] : '=');
    }
    return out;
}

// ------------------------------------------------------------------------------
// WASAPI Volume Controller
// ------------------------------------------------------------------------------

class AudioMaster {
private:
    static IAudioEndpointVolume* GetEndpointVolume() {
        IMMDeviceEnumerator *enumerator = nullptr;
        HRESULT hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), NULL, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), (void**)&enumerator);
        if (FAILED(hr) || !enumerator) return nullptr;

        IMMDevice *dev = nullptr;
        hr = enumerator->GetDefaultAudioEndpoint(eRender, eMultimedia, &dev);
        if (FAILED(hr) || !dev) {
            hr = enumerator->GetDefaultAudioEndpoint(eRender, eConsole, &dev);
        }
        enumerator->Release();
        if (FAILED(hr) || !dev) return nullptr;

        IAudioEndpointVolume *vol = nullptr;
        hr = dev->Activate(__uuidof(IAudioEndpointVolume), CLSCTX_ALL, NULL, (void**)&vol);
        dev->Release();
        return vol;
    }

public:
    static float GetVolume() {
        IAudioEndpointVolume *vol = GetEndpointVolume();
        if (!vol) return -1.0f;
        float level = -1.0f;
        vol->GetMasterVolumeLevelScalar(&level);
        vol->Release();
        return level;
    }

    static bool GetMute() {
        IAudioEndpointVolume *vol = GetEndpointVolume();
        if (!vol) return false;
        BOOL muted = FALSE;
        vol->GetMute(&muted);
        vol->Release();
        return muted != FALSE;
    }

    static float SetVolume(float level) {
        if (level < 0.0f) level = 0.0f;
        if (level > 1.0f) level = 1.0f;
        IAudioEndpointVolume *vol = GetEndpointVolume();
        if (!vol) return -1.0f;
        vol->SetMute(FALSE, NULL);
        vol->SetMasterVolumeLevelScalar(level, NULL);
        vol->Release();
        return level;
    }

    static float ChangeVolume(float delta) {
        IAudioEndpointVolume *vol = GetEndpointVolume();
        if (!vol) {
            if (delta > 0) {
                keybd_event(VK_VOLUME_UP, 0, 0, 0);
                keybd_event(VK_VOLUME_UP, 0, KEYEVENTF_KEYUP, 0);
            } else if (delta < 0) {
                keybd_event(VK_VOLUME_DOWN, 0, 0, 0);
                keybd_event(VK_VOLUME_DOWN, 0, KEYEVENTF_KEYUP, 0);
            }
            return -1.0f;
        }
        float cur = 0.0f;
        vol->GetMasterVolumeLevelScalar(&cur);
        float target = cur + delta;
        if (target < 0.0f) target = 0.0f;
        if (target > 1.0f) target = 1.0f;
        vol->SetMute(FALSE, NULL);
        vol->SetMasterVolumeLevelScalar(target, NULL);
        vol->Release();
        return target;
    }

    static bool ToggleMute() {
        IAudioEndpointVolume *vol = GetEndpointVolume();
        if (!vol) {
            keybd_event(VK_VOLUME_MUTE, 0, 0, 0);
            keybd_event(VK_VOLUME_MUTE, 0, KEYEVENTF_KEYUP, 0);
            return false;
        }
        BOOL muted = FALSE;
        vol->GetMute(&muted);
        BOOL nextMuted = !muted;
        vol->SetMute(nextMuted, NULL);
        vol->Release();
        return nextMuted != FALSE;
    }
};

void ReportVolume(int level, bool muted) {
    std::string json = "{\"type\":\"volume\",\"level\":" + std::to_string(level) + ",\"muted\":" + (muted ? "true" : "false") + "}";
    PrintJson(json);
}

// ------------------------------------------------------------------------------
// Bluetooth & Power Monitor
// ------------------------------------------------------------------------------

struct BtDeviceItem {
    std::string name;
    int battery;
    bool connected;
    std::string kind;
};

class DevicePowerMonitor {
private:
    int m_lastLaptopPct = -1;
    bool m_lastCharging = false;
    bool m_hasInitialScan = false;
    int m_tick = 0;

    int GetBtBattery(const std::wstring &instId) {
        DEVINST devInst;
        if (CM_Locate_DevNodeW(&devInst, (DEVINSTID_W)instId.c_str(), 0) != CR_SUCCESS) return -1;
        DEVPROPKEY key;
        key.fmtid = { 0x104EA319, 0x6EE2, 0x4701, { 0xBD, 0x47, 0x8D, 0xDB, 0xF4, 0x25, 0xBB, 0xE5 } };
        key.pid = 2; // DEVPKEY_Bluetooth_Battery
        DEVPROPTYPE propType;
        BYTE buf[16] = {0};
        ULONG size = sizeof(buf);
        if (CM_Get_DevNode_PropertyW(devInst, &key, &propType, buf, &size, 0) == CR_SUCCESS && size >= 1) {
            return (int)buf[0];
        }
        return -1;
    }

    bool IsBtConnected(const std::wstring &instId) {
        DEVINST devInst;
        if (CM_Locate_DevNodeW(&devInst, (DEVINSTID_W)instId.c_str(), 0) != CR_SUCCESS) return false;
        DEVPROPKEY key;
        key.fmtid = { 0x83DA6326, 0x97A6, 0x4088, { 0x94, 0x53, 0xA1, 0x92, 0x3F, 0x57, 0x3B, 0x29 } };
        key.pid = 15; // DEVPKEY_Device_IsConnected
        DEVPROPTYPE propType;
        BYTE buf[8] = {0};
        ULONG size = sizeof(buf);
        if (CM_Get_DevNode_PropertyW(devInst, &key, &propType, buf, &size, 0) == CR_SUCCESS && size >= 1) {
            return buf[0] != 0;
        }
        return false;
    }

    std::string GetDevCategory(const std::wstring &instId) {
        DEVINST devInst;
        if (CM_Locate_DevNodeW(&devInst, (DEVINSTID_W)instId.c_str(), 0) != CR_SUCCESS) return "";
        DEVPROPKEY key;
        key.fmtid = { 0x78C34FC8, 0x104A, 0x4ACA, { 0x9E, 0xA4, 0x52, 0x4D, 0x52, 0x99, 0x6E, 0x57 } };
        key.pid = 90;
        DEVPROPTYPE propType;
        BYTE buf[512] = {0};
        ULONG size = sizeof(buf);
        if (CM_Get_DevNode_PropertyW(devInst, &key, &propType, buf, &size, 0) == CR_SUCCESS && size > 2) {
            wchar_t *wstr = (wchar_t*)buf;
            return WideToUtf8(wstr);
        }
        return "";
    }

public:
    void Poll() {
        m_tick++;
        SYSTEM_POWER_STATUS sps;
        if (!GetSystemPowerStatus(&sps)) return;

        int laptopPct = (int)sps.BatteryLifePercent;
        if (laptopPct > 100) laptopPct = 100;
        bool isCharging = (sps.ACLineStatus == 1);

        bool powerChanged = (laptopPct != m_lastLaptopPct) || (isCharging != m_lastCharging);
        bool needDeepScan = (!m_hasInitialScan) || powerChanged || (m_tick % 20 == 0);

        if (needDeepScan) {
            m_hasInitialScan = true;
            m_lastLaptopPct = laptopPct;
            m_lastCharging = isCharging;

            std::vector<BtDeviceItem> devices;

            // Pindai Registry BTHENUM & BTHLE untuk menemukan perangkat terdaftar
            const wchar_t* enumRoots[] = { L"SYSTEM\\CurrentControlSet\\Enum\\BTHENUM", L"SYSTEM\\CurrentControlSet\\Enum\\BTHLE" };
            for (const wchar_t* rootPath : enumRoots) {
                HKEY hRoot;
                if (RegOpenKeyExW(HKEY_LOCAL_MACHINE, rootPath, 0, KEY_READ, &hRoot) == ERROR_SUCCESS) {
                    wchar_t subKeyName[256];
                    DWORD idx = 0;
                    DWORD nameLen = sizeof(subKeyName) / sizeof(wchar_t);
                    while (RegEnumKeyExW(hRoot, idx++, subKeyName, &nameLen, NULL, NULL, NULL, NULL) == ERROR_SUCCESS) {
                        nameLen = sizeof(subKeyName) / sizeof(wchar_t);
                        std::wstring subKeyStr(subKeyName);
                        if (subKeyStr.rfind(L"Dev_", 0) == 0) {
                            HKEY hDev;
                            if (RegOpenKeyExW(hRoot, subKeyName, 0, KEY_READ, &hDev) == ERROR_SUCCESS) {
                                wchar_t instName[256];
                                DWORD instIdx = 0;
                                DWORD instLen = sizeof(instName) / sizeof(wchar_t);
                                while (RegEnumKeyExW(hDev, instIdx++, instName, &instLen, NULL, NULL, NULL, NULL) == ERROR_SUCCESS) {
                                    instLen = sizeof(instName) / sizeof(wchar_t);
                                    HKEY hInst;
                                    if (RegOpenKeyExW(hDev, instName, 0, KEY_READ, &hInst) == ERROR_SUCCESS) {
                                        wchar_t friendlyName[256] = {0};
                                        DWORD fnSize = sizeof(friendlyName);
                                        if (RegQueryValueExW(hInst, L"FriendlyName", NULL, NULL, (LPBYTE)friendlyName, &fnSize) == ERROR_SUCCESS) {
                                            std::wstring wFn(friendlyName);
                                            size_t hfPos = wFn.find(L"Hands-Free");
                                            if (hfPos != std::wstring::npos) wFn = wFn.substr(0, hfPos);
                                            while (!wFn.empty() && (wFn.back() == L' ' || wFn.back() == L'-')) wFn.pop_back();

                                            std::string cleanName = WideToUtf8(wFn);
                                            if (!cleanName.empty() && cleanName.rfind("DESKTOP-", 0) != 0 && cleanName.size() <= 38) {
                                                std::wstring instId = (std::wstring(rootPath).find(L"BTHLE") != std::wstring::npos ? L"BTHLE\\" : L"BTHENUM\\") + subKeyStr + L"\\" + instName;
                                                bool conn = IsBtConnected(instId);
                                                int bat = GetBtBattery(instId);
                                                std::string cat = GetDevCategory(instId);

                                                std::string kind = "audio";
                                                std::string lowerName = cleanName;
                                                std::transform(lowerName.begin(), lowerName.end(), lowerName.begin(), ::tolower);
                                                if (cat.find("Phone") != std::string::npos || lowerName.find("redmi") != std::string::npos || lowerName.find("galaxy") != std::string::npos || lowerName.find("iphone") != std::string::npos || lowerName.find("xiaomi") != std::string::npos || lowerName.find("oppo") != std::string::npos || lowerName.find("vivo") != std::string::npos || lowerName.find("pixel") != std::string::npos) {
                                                    kind = "phone";
                                                } else if (lowerName.find("mouse") != std::string::npos || lowerName.find("viper") != std::string::npos || lowerName.find("deathadder") != std::string::npos || lowerName.find("mx master") != std::string::npos || lowerName.find("superlight") != std::string::npos) {
                                                    kind = "mouse";
                                                } else if (lowerName.find("keyboard") != std::string::npos || lowerName.find("keychron") != std::string::npos || lowerName.find("ajazz") != std::string::npos || lowerName.find("royal kludge") != std::string::npos) {
                                                    kind = "keyboard";
                                                } else if (lowerName.find("gamepad") != std::string::npos || lowerName.find("controller") != std::string::npos || lowerName.find("xbox") != std::string::npos || lowerName.find("dualsense") != std::string::npos) {
                                                    kind = "gamepad";
                                                }

                                                bool exists = false;
                                                for (auto &d : devices) {
                                                    if (d.name == cleanName) {
                                                        if (conn) d.connected = true;
                                                        if (bat >= 0) d.battery = bat;
                                                        exists = true;
                                                        break;
                                                    }
                                                }
                                                if (!exists) {
                                                    devices.push_back({ cleanName, bat, conn, kind });
                                                }
                                            }
                                        }
                                        RegCloseKey(hInst);
                                    }
                                }
                                RegCloseKey(hDev);
                            }
                        }
                    }
                    RegCloseKey(hRoot);
                }
            }

            // Bangun JSON payload
            std::ostringstream ss;
            ss << "{\"type\":\"power\",\"laptop\":{\"percent\":" << laptopPct
               << ",\"charging\":" << (isCharging ? "true" : "false") << "},\"devices\":[";
            for (size_t i = 0; i < devices.size(); ++i) {
                if (i > 0) ss << ",";
                ss << "{\"name\":\"" << EscapeJsonString(devices[i].name)
                   << "\",\"battery\":" << devices[i].battery
                   << ",\"connected\":" << (devices[i].connected ? "true" : "false")
                   << ",\"charging\":false"
                   << ",\"kind\":\"" << devices[i].kind << "\"}";
            }
            ss << "]}";
            PrintJson(ss.str());
        }
    }
};

// ------------------------------------------------------------------------------
// Media Session Controller (WinRT SMTC)
// ------------------------------------------------------------------------------

class MediaController {
private:
    IGlobalSystemMediaTransportControlsSessionManager *m_manager = nullptr;
    pfnCreateStreamOverRandomAccessStream m_pfnCreateStream = nullptr;
    std::string m_lastTitle = "";
    std::string m_lastArtist = "";
    double m_lastDur = 0;
    bool m_lastMediaActive = false;
    std::string m_lastPlaybackStatus = "Closed";
    std::string m_lastAppId = "";
    std::string m_lastThumbB64 = "";
    bool m_thumbJustLoaded = false;
    bool m_lastThumbIsAppIcon = false;
    int m_tick = 0;

    void EnsureManager() {
        if (m_manager) return;
        HSTRING hsClassName;
        const wchar_t className[] = L"Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager";
        WindowsCreateString(className, wcslen(className), &hsClassName);

        IGlobalSystemMediaTransportControlsSessionManagerStatics *statics = nullptr;
        HRESULT hr = RoGetActivationFactory(hsClassName, IID_IGlobalSystemMediaTransportControlsSessionManagerStatics, (void**)&statics);
        WindowsDeleteString(hsClassName);

        if (SUCCEEDED(hr) && statics) {
            void *asyncOp = nullptr;
            hr = statics->RequestAsync(&asyncOp);
            if (SUCCEEDED(hr) && asyncOp) {
                if (AwaitAsync(asyncOp, 1500)) {
                    ((IAsyncOperation_SessionManager*)asyncOp)->GetResults(&m_manager);
                }
                ((IUnknown*)asyncOp)->Release();
            }
            statics->Release();
        }
    }

    std::string ReadThumbnail(IRandomAccessStreamReference *streamRef, bool &isAppIcon) {
        isAppIcon = false;
        if (!streamRef || !m_pfnCreateStream) return "";
        void *openOp = nullptr;
        if (FAILED(streamRef->OpenReadAsync(&openOp)) || !openOp) return "";
        if (!AwaitAsync(openOp, 1200)) {
            ((IUnknown*)openOp)->Release();
            return "";
        }
        IUnknown *winrtStream = nullptr;
        ((IAsyncOperation_Stream*)openOp)->GetResults(&winrtStream);
        ((IUnknown*)openOp)->Release();
        if (!winrtStream) return "";

        IStream *comStream = nullptr;
        HRESULT hr = m_pfnCreateStream(winrtStream, __uuidof(IStream), (void**)&comStream);
        winrtStream->Release();
        if (FAILED(hr) || !comStream) return "";

        STATSTG stat;
        if (FAILED(comStream->Stat(&stat, STATFLAG_NONAME)) || stat.cbSize.QuadPart == 0 || stat.cbSize.QuadPart > 600000) {
            comStream->Release();
            return "";
        }

        ULONG size = (ULONG)stat.cbSize.QuadPart;
        std::vector<unsigned char> buf(size);
        ULONG bytesRead = 0;
        hr = comStream->Read(buf.data(), size, &bytesRead);
        comStream->Release();
        if (FAILED(hr) || bytesRead == 0) return "";

        if (bytesRead == 17372) isAppIcon = true;

        return Base64Encode(buf.data(), bytesRead);
    }

public:
    MediaController() {
        HMODULE hShcore = GetModuleHandleW(L"shcore.dll");
        if (!hShcore) hShcore = LoadLibraryW(L"shcore.dll");
        if (hShcore) {
            m_pfnCreateStream = (pfnCreateStreamOverRandomAccessStream)GetProcAddress(hShcore, "CreateStreamOverRandomAccessStream");
        }
    }

    ~MediaController() {
        if (m_manager) {
            m_manager->Release();
            m_manager = nullptr;
        }
    }

    std::string GetPlaybackStatus() const { return m_lastPlaybackStatus; }

    void Poll(bool fastOnly = false) {
        m_tick++;
        EnsureManager();
        if (!m_manager) return;

        IGlobalSystemMediaTransportControlsSession *session = nullptr;
        HRESULT hr = m_manager->GetCurrentSession(&session);
        if (SUCCEEDED(hr) && session) {
            IGlobalSystemMediaTransportControlsSessionPlaybackInfo *pbInfo = nullptr;
            std::string status = "Closed";
            if (SUCCEEDED(session->GetPlaybackInfo(&pbInfo)) && pbInfo) {
                int pbStatus = 0;
                pbInfo->get_PlaybackStatus(&pbStatus);
                switch (pbStatus) {
                    case 0: status = "Closed"; break;
                    case 1: status = "Opened"; break;
                    case 2: status = "Changing"; break;
                    case 3: status = "Stopped"; break;
                    case 4: status = "Playing"; break;
                    case 5: status = "Paused"; break;
                    default: status = "Closed"; break;
                }
                pbInfo->Release();
            }

            HSTRING hsAppId = nullptr;
            session->get_SourceAppUserModelId(&hsAppId);
            std::string appId = HStringToUtf8(hsAppId);
            if (hsAppId) WindowsDeleteString(hsAppId);

            bool appChanged = (appId != m_lastAppId);
            bool isPausedOrClosed = (status != "Playing");
            if (isPausedOrClosed && (status == m_lastPlaybackStatus) && !appChanged && (m_tick % 10 != 0)) {
                session->Release();
                return;
            }
            m_lastAppId = appId;

            IGlobalSystemMediaTransportControlsSessionTimelineProperties *tl = nullptr;
            double dur = 0.0;
            double rawBasePos = 0.0;
            double pos = 0.0;
            long long lastUpdatedMs = 0;

            if (SUCCEEDED(session->GetTimelineProperties(&tl)) && tl) {
                long long endTicks = 0, posTicks = 0, lastUpdatedTicks = 0;
                tl->get_EndTime(&endTicks);
                tl->get_Position(&posTicks);
                tl->get_LastUpdatedTime(&lastUpdatedTicks);

                dur = (double)endTicks / 10000000.0;
                rawBasePos = (double)posTicks / 10000000.0;
                double basePos = rawBasePos;

                if (lastUpdatedTicks > 0) {
                    lastUpdatedMs = (lastUpdatedTicks - 116444736000000000LL) / 10000LL;
                    if (status == "Playing") {
                        auto nowEpoch = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
                        double elapsed = (double)(nowEpoch - lastUpdatedMs) / 1000.0;
                        if (elapsed >= 0.0 && elapsed < 36000.0) {
                            basePos += elapsed;
                        }
                    }
                }
                if (dur > 0.0 && basePos > dur) basePos = dur;
                pos = std::round(basePos * 1000.0) / 1000.0;
                tl->Release();
            }

            bool needProperties = m_lastTitle.empty() || (std::abs(dur - m_lastDur) > 0.001) || appChanged || (m_tick % 12 == 0);
            IGlobalSystemMediaTransportControlsSessionMediaProperties *info = nullptr;
            bool trackChanged = false;

            if (needProperties) {
                void *propOp = nullptr;
                if (SUCCEEDED(session->TryGetMediaPropertiesAsync(&propOp)) && propOp) {
                    if (AwaitAsync(propOp, 800)) {
                        ((IAsyncOperation_MediaProperties*)propOp)->GetResults(&info);
                    }
                    ((IUnknown*)propOp)->Release();
                }

                std::string newTitle = "";
                std::string newArtist = "";
                if (info) {
                    HSTRING hTitle = nullptr, hArtist = nullptr;
                    info->get_Title(&hTitle);
                    info->get_Artist(&hArtist);
                    newTitle = HStringToUtf8(hTitle);
                    newArtist = HStringToUtf8(hArtist);
                    if (hTitle) WindowsDeleteString(hTitle);
                    if (hArtist) WindowsDeleteString(hArtist);
                }

                trackChanged = (newTitle != m_lastTitle) || (newArtist != m_lastArtist);
                m_lastTitle = newTitle;
                m_lastArtist = newArtist;
                m_lastDur = dur;

                if (trackChanged) {
                    m_lastThumbB64 = "";
                    m_lastThumbIsAppIcon = false;
                    m_thumbJustLoaded = true;
                }
            }

            bool needThumb = trackChanged || (!fastOnly && (m_lastThumbB64.empty() || m_lastThumbIsAppIcon));
            if (needThumb) {
                if (!info) {
                    void *propOp = nullptr;
                    if (SUCCEEDED(session->TryGetMediaPropertiesAsync(&propOp)) && propOp) {
                        if (AwaitAsync(propOp, 800)) {
                            ((IAsyncOperation_MediaProperties*)propOp)->GetResults(&info);
                        }
                        ((IUnknown*)propOp)->Release();
                    }
                }
                if (info) {
                    IRandomAccessStreamReference *thumbRef = nullptr;
                    if (SUCCEEDED(info->get_Thumbnail(&thumbRef)) && thumbRef) {
                        bool isAppLogo = false;
                        std::string b64 = ReadThumbnail(thumbRef, isAppLogo);
                        thumbRef->Release();
                        if (!b64.empty()) {
                            if (!isAppLogo || m_lastThumbB64.empty()) {
                                m_lastThumbB64 = b64;
                                m_lastThumbIsAppIcon = isAppLogo;
                                m_thumbJustLoaded = true;
                            }
                        }
                    }
                }
            }

            if (info) info->Release();

            float curVol = AudioMaster::GetVolume();
            int volPct = (curVol >= 0.0f) ? (int)std::round(curVol * 100.0f) : -1;

            std::string thumbToSend = (trackChanged || m_thumbJustLoaded) ? m_lastThumbB64 : "";
            m_thumbJustLoaded = false;

            m_lastMediaActive = !m_lastTitle.empty();
            m_lastPlaybackStatus = status;

            std::ostringstream ss;
            ss << std::fixed << std::setprecision(3);
            ss << "{\"type\":\"media\",\"active\":" << (m_lastMediaActive ? "true" : "false")
               << ",\"title\":\"" << EscapeJsonString(m_lastTitle) << "\""
               << ",\"artist\":\"" << EscapeJsonString(m_lastArtist) << "\""
               << ",\"status\":\"" << status << "\""
               << ",\"pos\":" << pos
               << ",\"basePos\":" << rawBasePos
               << ",\"lastUpdatedMs\":" << lastUpdatedMs
               << ",\"dur\":" << dur;
            if (volPct >= 0) ss << ",\"volume\":" << volPct;
            else ss << ",\"volume\":null";
            ss << ",\"app\":\"" << EscapeJsonString(appId) << "\"";
            if (!thumbToSend.empty()) {
                ss << ",\"thumb\":\"" << thumbToSend << "\"";
            } else {
                ss << ",\"thumb\":null";
            }
            ss << ",\"isAppIcon\":" << (m_lastThumbIsAppIcon ? "true" : "false") << "}";

            PrintJson(ss.str());
            session->Release();
        } else {
            if (m_lastMediaActive) {
                m_lastMediaActive = false;
                m_lastTitle = "";
                m_lastArtist = "";
                m_lastPlaybackStatus = "Closed";
                m_lastAppId = "";
                PrintJson("{\"type\":\"media\",\"active\":false}");
            }
        }
    }

    bool SendYouTubeShortcut(bool isNext) {
        HWND foundHwnd = NULL;
        HWND fallbackHwnd = NULL;
        EnumWindows([](HWND hWnd, LPARAM lParam) -> BOOL {
            if (!IsWindowVisible(hWnd)) return TRUE;
            wchar_t title[512] = {0};
            if (GetWindowTextW(hWnd, title, 512) > 0) {
                std::wstring wTitle(title);
                if (wTitle.find(L"YouTube") != std::wstring::npos) {
                    *(HWND*)lParam = hWnd;
                    return FALSE;
                }
                HWND *fallback = (HWND*)lParam + 1;
                if (*fallback == NULL && (
                    wTitle.find(L"Brave") != std::wstring::npos ||
                    wTitle.find(L"Chrome") != std::wstring::npos ||
                    wTitle.find(L"Edge") != std::wstring::npos ||
                    wTitle.find(L"Firefox") != std::wstring::npos ||
                    wTitle.find(L"Opera") != std::wstring::npos)) {
                    *fallback = hWnd;
                }
            }
            return TRUE;
        }, (LPARAM)&foundHwnd);

        HWND target = foundHwnd ? foundHwnd : fallbackHwnd;
        if (target) {
            if (IsIconic(target)) ShowWindow(target, SW_RESTORE);
            SetForegroundWindow(target);
            Sleep(50);
            BYTE key = isNext ? 0x4E : 0x50; // 'N' or 'P'
            keybd_event(VK_SHIFT, 0, 0, 0);
            keybd_event(key, 0, 0, 0);
            keybd_event(key, 0, KEYEVENTF_KEYUP, 0);
            keybd_event(VK_SHIFT, 0, KEYEVENTF_KEYUP, 0);
            return true;
        }
        return false;
    }

    void ExecuteCommand(const std::string &rawCmd) {
        std::string cmd = rawCmd;
        while (!cmd.empty() && (cmd.back() == '\r' || cmd.back() == '\n' || cmd.back() == ' ')) cmd.pop_back();
        while (!cmd.empty() && (cmd.front() == ' ' || cmd.front() == '\t')) cmd.erase(cmd.begin());
        if (cmd.empty()) return;

        std::string upperCmd = cmd;
        std::transform(upperCmd.begin(), upperCmd.end(), upperCmd.begin(), ::toupper);

        bool handled = false;
        EnsureManager();
        if (m_manager) {
            IGlobalSystemMediaTransportControlsSession *session = nullptr;
            if (SUCCEEDED(m_manager->GetCurrentSession(&session)) && session) {
                if (upperCmd == "PLAYPAUSE") {
                    IGlobalSystemMediaTransportControlsSessionPlaybackInfo *pbInfo = nullptr;
                    int pbStatus = 0;
                    if (SUCCEEDED(session->GetPlaybackInfo(&pbInfo)) && pbInfo) {
                        pbInfo->get_PlaybackStatus(&pbStatus);
                        pbInfo->Release();
                    }
                    bool isPlaying = (pbStatus == 4) || (pbStatus == 0 && m_lastPlaybackStatus == "Playing");

                    void *op = nullptr;
                    if (isPlaying) {
                        if (SUCCEEDED(session->TryPauseAsync(&op)) && op) {
                            bool res = false;
                            if (AwaitAsync(op, 800)) {
                                ((IAsyncOperation_Bool*)op)->GetResults(&res);
                            }
                            ((IUnknown*)op)->Release();
                            handled = res;
                        }
                    } else {
                        if (SUCCEEDED(session->TryPlayAsync(&op)) && op) {
                            bool res = false;
                            if (AwaitAsync(op, 800)) {
                                ((IAsyncOperation_Bool*)op)->GetResults(&res);
                            }
                            ((IUnknown*)op)->Release();
                            handled = res;
                        }
                    }

                    if (!handled) {
                        void *toggleOp = nullptr;
                        if (SUCCEEDED(session->TryTogglePlayPauseAsync(&toggleOp)) && toggleOp) {
                            bool res = false;
                            if (AwaitAsync(toggleOp, 800)) {
                                ((IAsyncOperation_Bool*)toggleOp)->GetResults(&res);
                            }
                            ((IUnknown*)toggleOp)->Release();
                            handled = res;
                        }
                    }

                    if (!handled) {
                        keybd_event(VK_MEDIA_PLAY_PAUSE, 0, 0, 0);
                        keybd_event(VK_MEDIA_PLAY_PAUSE, 0, KEYEVENTF_KEYUP, 0);
                        handled = true;
                    }
                    Sleep(50);
                    Poll(true);
                } else if (upperCmd == "PLAY") {
                    void *op = nullptr;
                    if (SUCCEEDED(session->TryPlayAsync(&op)) && op) {
                        bool res = false;
                        if (AwaitAsync(op, 800)) {
                            ((IAsyncOperation_Bool*)op)->GetResults(&res);
                        }
                        ((IUnknown*)op)->Release();
                        handled = res;
                    }
                    if (!handled) {
                        keybd_event(VK_MEDIA_PLAY_PAUSE, 0, 0, 0);
                        keybd_event(VK_MEDIA_PLAY_PAUSE, 0, KEYEVENTF_KEYUP, 0);
                        handled = true;
                    }
                    Sleep(50);
                    Poll(true);
                } else if (upperCmd == "PAUSE") {
                    void *op = nullptr;
                    if (SUCCEEDED(session->TryPauseAsync(&op)) && op) {
                        bool res = false;
                        if (AwaitAsync(op, 800)) {
                            ((IAsyncOperation_Bool*)op)->GetResults(&res);
                        }
                        ((IUnknown*)op)->Release();
                        handled = res;
                    }
                    if (!handled) {
                        keybd_event(VK_MEDIA_PLAY_PAUSE, 0, 0, 0);
                        keybd_event(VK_MEDIA_PLAY_PAUSE, 0, KEYEVENTF_KEYUP, 0);
                        handled = true;
                    }
                    Sleep(50);
                    Poll(true);
                } else if (upperCmd == "NEXT") {
                    void *op = nullptr;
                    if (SUCCEEDED(session->TrySkipNextAsync(&op)) && op) {
                        bool res = false;
                        if (AwaitAsync(op, 500)) {
                            ((IAsyncOperation_Bool*)op)->GetResults(&res);
                        }
                        ((IUnknown*)op)->Release();
                        handled = res;
                    }
                    if (!handled) {
                        handled = SendYouTubeShortcut(true);
                    }
                } else if (upperCmd == "PREV") {
                    void *op = nullptr;
                    if (SUCCEEDED(session->TrySkipPreviousAsync(&op)) && op) {
                        bool res = false;
                        if (AwaitAsync(op, 500)) {
                            ((IAsyncOperation_Bool*)op)->GetResults(&res);
                        }
                        ((IUnknown*)op)->Release();
                        handled = res;
                    }
                    if (!handled) {
                        void *seekOp = nullptr;
                        if (SUCCEEDED(session->TryChangePlaybackPositionAsync(0, &seekOp)) && seekOp) {
                            AwaitAsync(seekOp, 500);
                            ((IUnknown*)seekOp)->Release();
                            handled = true;
                        }
                    }
                    if (!handled) {
                        handled = SendYouTubeShortcut(false);
                    }
                } else if (upperCmd == "STOP") {
                    void *op = nullptr;
                    if (SUCCEEDED(session->TryStopAsync(&op)) && op) {
                        AwaitAsync(op, 500);
                        ((IUnknown*)op)->Release();
                        handled = true;
                    }
                } else if (upperCmd.rfind("SEEK:", 0) == 0) {
                    double sec = std::atof(upperCmd.substr(5).c_str());
                    long long ticks = (long long)std::round(sec * 10000000.0);
                    void *op = nullptr;
                    if (SUCCEEDED(session->TryChangePlaybackPositionAsync(ticks, &op)) && op) {
                        AwaitAsync(op, 500);
                        ((IUnknown*)op)->Release();
                        handled = true;
                    }
                    if (handled) {
                        Poll(true);
                    }
                }
                session->Release();
            }
        }

        // Volume Commands
        if (upperCmd.rfind("VOL:", 0) == 0 || upperCmd == "VOLUP" || upperCmd == "VOLDOWN") {
            float delta = 0.0f;
            if (upperCmd == "VOLUP") delta = 0.02f;
            else if (upperCmd == "VOLDOWN") delta = -0.02f;
            else delta = (float)std::atof(upperCmd.substr(4).c_str());

            float newVol = AudioMaster::ChangeVolume(delta);
            float curVol = (newVol >= 0.0f) ? newVol : AudioMaster::GetVolume();
            if (curVol >= 0.0f) {
                int lvl = (int)std::round(curVol * 100.0f);
                bool mut = AudioMaster::GetMute();
                ReportVolume(lvl, mut);
            }
            handled = true;
        } else if (upperCmd.rfind("VOLSET:", 0) == 0) {
            float target = (float)(std::atof(upperCmd.substr(7).c_str()) / 100.0);
            float newVol = AudioMaster::SetVolume(target);
            float curVol = (newVol >= 0.0f) ? newVol : AudioMaster::GetVolume();
            if (curVol >= 0.0f) {
                int lvl = (int)std::round(curVol * 100.0f);
                bool mut = AudioMaster::GetMute();
                ReportVolume(lvl, mut);
            }
            handled = true;
        } else if (upperCmd == "VOLMUTE" || upperCmd == "MUTE") {
            bool isMuted = AudioMaster::ToggleMute();
            float curVol = AudioMaster::GetVolume();
            int lvl = (curVol >= 0.0f) ? (int)std::round(curVol * 100.0f) : 0;
            ReportVolume(lvl, isMuted);
            handled = true;
        } else if (upperCmd == "VOLGET") {
            float curVol = AudioMaster::GetVolume();
            if (curVol >= 0.0f) {
                int lvl = (int)std::round(curVol * 100.0f);
                bool mut = AudioMaster::GetMute();
                ReportVolume(lvl, mut);
            }
            handled = true;
        }

        // Fallback virtual media keys
        if (!handled) {
            if (upperCmd == "PLAYPAUSE" || upperCmd == "PLAY" || upperCmd == "PAUSE") {
                keybd_event(VK_MEDIA_PLAY_PAUSE, 0, 0, 0);
                keybd_event(VK_MEDIA_PLAY_PAUSE, 0, KEYEVENTF_KEYUP, 0);
            } else if (upperCmd == "NEXT") {
                keybd_event(VK_MEDIA_NEXT_TRACK, 0, 0, 0);
                keybd_event(VK_MEDIA_NEXT_TRACK, 0, KEYEVENTF_KEYUP, 0);
            } else if (upperCmd == "PREV") {
                keybd_event(VK_MEDIA_PREV_TRACK, 0, 0, 0);
                keybd_event(VK_MEDIA_PREV_TRACK, 0, KEYEVENTF_KEYUP, 0);
            } else if (upperCmd == "STOP") {
                keybd_event(VK_MEDIA_STOP, 0, 0, 0);
                keybd_event(VK_MEDIA_STOP, 0, KEYEVENTF_KEYUP, 0);
            }
        }
    }
};

// ------------------------------------------------------------------------------
// Toast Notification Monitor (UserNotificationListener)
// ------------------------------------------------------------------------------

struct NotifItem {
    unsigned int id;
    std::string app;
    std::string sender;
    std::string message;
    bool isWhatsApp;
    bool isPhone;
    long long time;
};

class NotificationMonitor {
private:
    IUserNotificationListener *m_listener = nullptr;
    std::unordered_set<unsigned int> m_seenIds;
    bool m_initialPass = true;
    bool m_accessAllowed = false;

    void EnsureListener() {
        if (m_listener) return;
        HSTRING hsClassName;
        const wchar_t className[] = L"Windows.UI.Notifications.Management.UserNotificationListener";
        WindowsCreateString(className, wcslen(className), &hsClassName);

        IUserNotificationListenerStatics *statics = nullptr;
        HRESULT hr = RoGetActivationFactory(hsClassName, IID_IUserNotificationListenerStatics, (void**)&statics);
        WindowsDeleteString(hsClassName);

        if (SUCCEEDED(hr) && statics) {
            hr = statics->get_Current(&m_listener);
            if (SUCCEEDED(hr) && m_listener) {
                void *accessOp = nullptr;
                if (SUCCEEDED(m_listener->RequestAccessAsync(&accessOp)) && accessOp) {
                    AwaitAsync(accessOp, 800);
                    ((IUnknown*)accessOp)->Release();
                }
                int status = 0;
                m_listener->GetAccessStatus(&status);
                m_accessAllowed = (status == 1); // 1 = Allowed
            }
            statics->Release();
        }
    }

public:
    NotificationMonitor() {}
    ~NotificationMonitor() {
        if (m_listener) {
            m_listener->Release();
            m_listener = nullptr;
        }
    }

    void Poll() {
        EnsureListener();
        if (!m_listener || !m_accessAllowed) return;

        void *op = nullptr;
        HRESULT hr = m_listener->GetNotificationsAsync(1 /* Toast */, &op);
        if (FAILED(hr) || !op) return;

        if (!AwaitAsync(op, 800)) {
            ((IUnknown*)op)->Release();
            return;
        }

        IReadOnlyList_UserNotification *list = nullptr;
        ((IAsyncOperation_NotifList*)op)->GetResults(&list);
        ((IUnknown*)op)->Release();
        if (!list) return;

        unsigned int count = 0;
        list->get_Size(&count);

        std::vector<NotifItem> newItems;
        for (unsigned int i = 0; i < count; ++i) {
            IUserNotification *un = nullptr;
            if (SUCCEEDED(list->GetAt(i, &un)) && un) {
                unsigned int nid = 0;
                un->get_Id(&nid);

                if (m_seenIds.find(nid) == m_seenIds.end()) {
                    m_seenIds.insert(nid);

                    if (!m_initialPass) {
                        std::string appName = "";
                        IAppInfo *appInfo = nullptr;
                        if (SUCCEEDED(un->get_AppInfo(&appInfo)) && appInfo) {
                            IAppDisplayInfo *dispInfo = nullptr;
                            if (SUCCEEDED(appInfo->get_DisplayInfo(&dispInfo)) && dispInfo) {
                                HSTRING hDispName = nullptr;
                                dispInfo->get_DisplayName(&hDispName);
                                appName = HStringToUtf8(hDispName);
                                if (hDispName) WindowsDeleteString(hDispName);
                                dispInfo->Release();
                            }
                            appInfo->Release();
                        }

                        // Filter internal apps / Defender
                        std::string lowApp = appName;
                        std::transform(lowApp.begin(), lowApp.end(), lowApp.begin(), ::tolower);
                        if (lowApp.find("antigravity") == std::string::npos &&
                            lowApp.find("snipping tool") == std::string::npos &&
                            lowApp.find("windows defender") == std::string::npos) {

                            IToastNotification *toast = nullptr;
                            if (SUCCEEDED(un->get_Notification(&toast)) && toast) {
                                INotificationVisual *visual = nullptr;
                                if (SUCCEEDED(toast->get_Visual(&visual)) && visual) {
                                    HSTRING hToastGen = nullptr;
                                    WindowsCreateString(L"ToastGeneric", 12, &hToastGen);
                                    INotificationBinding *binding = nullptr;
                                    visual->GetBinding(hToastGen, &binding);
                                    WindowsDeleteString(hToastGen);

                                    if (binding) {
                                        IReadOnlyList_AdaptiveNotificationText *texts = nullptr;
                                        if (SUCCEEDED(binding->GetTextElements(&texts)) && texts) {
                                            unsigned int tCount = 0;
                                            texts->get_Size(&tCount);
                                            std::string sender = "";
                                            std::string msg = "";

                                            for (unsigned int tIdx = 0; tIdx < tCount; ++tIdx) {
                                                IAdaptiveNotificationText *ant = nullptr;
                                                if (SUCCEEDED(texts->GetAt(tIdx, &ant)) && ant) {
                                                    HSTRING hT = nullptr;
                                                    ant->get_Text(&hT);
                                                    std::string piece = HStringToUtf8(hT);
                                                    if (hT) WindowsDeleteString(hT);
                                                    if (!piece.empty()) {
                                                        if (sender.empty()) sender = piece;
                                                        else {
                                                            if (!msg.empty()) msg += " ";
                                                            msg += piece;
                                                        }
                                                    }
                                                    ant->Release();
                                                }
                                            }

                                            if (!sender.empty() && sender.find("Deadline LMS Mendesak") == std::string::npos) {
                                                std::string lowSender = sender;
                                                std::transform(lowSender.begin(), lowSender.end(), lowSender.begin(), ::tolower);
                                                std::string lowMsg = msg;
                                                std::transform(lowMsg.begin(), lowMsg.end(), lowMsg.begin(), ::tolower);

                                                bool isWa = (lowApp.find("whatsapp") != std::string::npos || lowApp.find("electron") != std::string::npos || lowSender.find("whatsapp") != std::string::npos || lowMsg.find("whatsapp") != std::string::npos);
                                                if (lowApp == "electron") appName = "WhatsApp";
                                                bool isPhone = (lowApp.find("phone") != std::string::npos || lowApp.find("koneksi") != std::string::npos || lowApp.find("link to windows") != std::string::npos || lowApp.find("yourphone") != std::string::npos);

                                                long long createTicks = 0;
                                                un->get_CreationTime(&createTicks);
                                                long long createMs = (createTicks > 0) ? (createTicks - 116444736000000000LL) / 10000LL : 0;

                                                newItems.push_back({
                                                    nid,
                                                    isWa ? "WhatsApp" : (!appName.empty() ? appName : "Notifikasi"),
                                                    sender,
                                                    msg,
                                                    isWa,
                                                    isPhone,
                                                    createMs
                                                });
                                            }
                                            texts->Release();
                                        }
                                        binding->Release();
                                    }
                                    visual->Release();
                                }
                                toast->Release();
                            }
                        }
                    }
                }
                un->Release();
            }
        }
        list->Release();

        m_initialPass = false;

        if (!newItems.empty()) {
            std::ostringstream ss;
            ss << "{\"type\":\"notifs\",\"items\":[";
            for (size_t i = 0; i < newItems.size(); ++i) {
                if (i > 0) ss << ",";
                ss << "{\"id\":\"" << newItems[i].id << "\""
                   << ",\"app\":\"" << EscapeJsonString(newItems[i].app) << "\""
                   << ",\"sender\":\"" << EscapeJsonString(newItems[i].sender) << "\""
                   << ",\"message\":\"" << EscapeJsonString(newItems[i].message) << "\""
                   << ",\"isWhatsApp\":" << (newItems[i].isWhatsApp ? "true" : "false")
                   << ",\"isPhone\":" << (newItems[i].isPhone ? "true" : "false")
                   << ",\"time\":" << newItems[i].time
                   << ",\"isNew\":true}";
            }
            ss << "]}";
            PrintJson(ss.str());
        }
    }
};

// ------------------------------------------------------------------------------
// Foreground Window & Fullscreen Browser Monitor
// ------------------------------------------------------------------------------
class ForegroundWindowMonitor {
private:
    bool m_lastBrowserMaximized = false;
    bool m_lastMaximized = false;
    std::string m_lastApp = "";
    int m_tick = 0;
    bool m_hasInitialScan = false;

public:
    void Poll() {
        m_tick++;
        HWND fg = GetForegroundWindow();
        if (!fg) return;

        bool isMaximized = false;
        RECT rc;
        if (GetWindowRect(fg, &rc)) {
            int screenW = GetSystemMetrics(SM_CXSCREEN);
            // Jika jendela menutupi area paling atas layar
            if (rc.top <= 2 && (rc.right - rc.left) >= (screenW - 40)) {
                isMaximized = true;
            }
        }
        if (!isMaximized) {
            DWORD dwStyle = (DWORD)GetWindowLongW(fg, GWL_STYLE);
            if (dwStyle & WS_MAXIMIZE) isMaximized = true;
        }

        bool isBrowser = false;
        std::string appName = "";
        DWORD pid = 0;
        GetWindowThreadProcessId(fg, &pid);
        if (pid != 0) {
            HANDLE hProc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
            if (hProc) {
                wchar_t procPath[MAX_PATH] = {0};
                DWORD sz = MAX_PATH;
                if (QueryFullProcessImageNameW(hProc, 0, procPath, &sz)) {
                    wchar_t *pSlash = wcsrchr(procPath, L'\\');
                    std::wstring baseName = pSlash ? (pSlash + 1) : procPath;
                    for (auto &c : baseName) c = towlower(c);
                    appName = WideToUtf8(baseName);
                    // Jangan timpa status jendela jika jendela latar depan aktif adalah Ukikura / Electron itu sendiri
                    if (baseName.find(L"ukikura") != std::wstring::npos ||
                        baseName.find(L"electron") != std::wstring::npos) {
                        CloseHandle(hProc);
                        return;
                    }
                    if (baseName.find(L"brave") != std::wstring::npos ||
                        baseName.find(L"chrome") != std::wstring::npos || 
                        baseName.find(L"edge") != std::wstring::npos || 
                        baseName.find(L"firefox") != std::wstring::npos || 
                        baseName.find(L"opera") != std::wstring::npos || 
                        baseName.find(L"vivaldi") != std::wstring::npos || 
                        baseName.find(L"zen") != std::wstring::npos || 
                        baseName.find(L"waterfox") != std::wstring::npos ||
                        baseName.find(L"arc") != std::wstring::npos) {
                        isBrowser = true;
                    }
                }
                CloseHandle(hProc);
            }
        }

        // Cek juga judul jendela (Window Title) jika process name browser disamarkan/terproteksi
        if (!isBrowser) {
            wchar_t wTitle[256] = {0};
            if (GetWindowTextW(fg, wTitle, 256) > 0) {
                std::wstring titleStr = wTitle;
                for (auto &c : titleStr) c = towlower(c);
                if (titleStr.find(L"brave") != std::wstring::npos ||
                    titleStr.find(L"chrome") != std::wstring::npos ||
                    titleStr.find(L"edge") != std::wstring::npos ||
                    titleStr.find(L"firefox") != std::wstring::npos ||
                    titleStr.find(L"youtube") != std::wstring::npos) {
                    isBrowser = true;
                }
            }
        }

        bool browserMaximized = (isBrowser && isMaximized);
        bool changed = (!m_hasInitialScan) || (browserMaximized != m_lastBrowserMaximized) || (isMaximized != m_lastMaximized);
        if (changed || (m_tick % 10 == 0)) {
            m_hasInitialScan = true;
            m_lastBrowserMaximized = browserMaximized;
            m_lastMaximized = isMaximized;
            m_lastApp = appName;

            std::ostringstream ss;
            ss << "{\"type\":\"window_state\",\"browserMaximized\":" 
               << (browserMaximized ? "true" : "false") 
               << ",\"isMaximized\":" << (isMaximized ? "true" : "false")
               << ",\"app\":\"" << appName << "\"}";
            PrintJson(ss.str());
        }
    }
};

// ------------------------------------------------------------------------------
// Background Stdin & File Command Reader
// ------------------------------------------------------------------------------

std::atomic<bool> g_running(true);
std::vector<std::string> g_queuedCommands;
std::mutex g_cmdMutex;
HANDLE g_hWakeEvent = NULL;

void StdinReaderThread() {
    HANDLE hStdIn = GetStdHandle(STD_INPUT_HANDLE);
    if (hStdIn == INVALID_HANDLE_VALUE || hStdIn == NULL) return;

    std::string lineBuf;
    char buffer[256];
    DWORD bytesRead = 0;

    while (g_running) {
        if (ReadFile(hStdIn, buffer, sizeof(buffer), &bytesRead, NULL) && bytesRead > 0) {
            for (DWORD i = 0; i < bytesRead; ++i) {
                char ch = buffer[i];
                if (ch == '\n' || ch == '\r') {
                    if (!lineBuf.empty()) {
                        {
                            std::lock_guard<std::mutex> lock(g_cmdMutex);
                            g_queuedCommands.push_back(lineBuf);
                        }
                        lineBuf.clear();
                        if (g_hWakeEvent) SetEvent(g_hWakeEvent);
                    }
                } else {
                    lineBuf.push_back(ch);
                }
            }
        } else {
            Sleep(40);
        }
    }
}

void ProcessFileCommands(MediaController &media, const std::wstring &cmdFile, const std::wstring &tempCmdFile) {
    const std::wstring* files[2] = { &tempCmdFile, &cmdFile };
    for (int i = 0; i < 2; ++i) {
        DWORD attrs = GetFileAttributesW(files[i]->c_str());
        if (attrs != INVALID_FILE_ATTRIBUTES && !(attrs & FILE_ATTRIBUTE_DIRECTORY)) {
            HANDLE hFile = CreateFileW(files[i]->c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
            if (hFile != INVALID_HANDLE_VALUE) {
                DWORD size = GetFileSize(hFile, NULL);
                if (size > 0 && size < 65536) {
                    std::vector<char> buf(size + 1, 0);
                    DWORD bytesRead = 0;
                    if (ReadFile(hFile, buf.data(), size, &bytesRead, NULL)) {
                        CloseHandle(hFile);
                        DeleteFileW(files[i]->c_str());
                        std::istringstream stream(buf.data());
                        std::string line;
                        while (std::getline(stream, line)) {
                            media.ExecuteCommand(line);
                        }
                        if (g_hWakeEvent) SetEvent(g_hWakeEvent);
                        continue;
                    }
                }
                CloseHandle(hFile);
                DeleteFileW(files[i]->c_str());
            }
        }
    }
}

// ------------------------------------------------------------------------------
// Main Entry Point & PE Resource Patcher
// ------------------------------------------------------------------------------

#pragma pack(push, 2)
struct ICONDIRENTRY {
    BYTE bWidth;
    BYTE bHeight;
    BYTE bColorCount;
    BYTE bReserved;
    WORD wPlanes;
    WORD wBitCount;
    DWORD dwBytesInRes;
    DWORD dwImageOffset;
};

struct ICONDIR {
    WORD idReserved;
    WORD idType;
    WORD idCount;
};

struct GRPICONDIRENTRY {
    BYTE bWidth;
    BYTE bHeight;
    BYTE bColorCount;
    BYTE bReserved;
    WORD wPlanes;
    WORD wBitCount;
    DWORD dwBytesInRes;
    WORD nID;
};

struct GRPICONDIR {
    WORD idReserved;
    WORD idType;
    WORD idCount;
};
#pragma pack(pop)

bool PatchUkikuraExe(const std::wstring &exePath, const std::wstring &icoPath) {
    // 1. Ganti string Description & ProductName di binary dari Electron ke Ukikura
    {
        HANDLE hFile = CreateFileW(exePath.c_str(), GENERIC_READ | GENERIC_WRITE, 0, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
        if (hFile != INVALID_HANDLE_VALUE) {
            DWORD fileSize = GetFileSize(hFile, NULL);
            if (fileSize > 0) {
                HANDLE hMap = CreateFileMappingW(hFile, NULL, PAGE_READWRITE, 0, 0, NULL);
                if (hMap) {
                    char *pData = (char*)MapViewOfFile(hMap, FILE_MAP_ALL_ACCESS, 0, 0, 0);
                    if (pData) {
                        const wchar_t oldStr[] = L"Electron\0";
                        const wchar_t newStr[] = L"Ukikura\0\0";
                        size_t matchLen = sizeof(oldStr);
                        for (size_t i = 0; i + matchLen <= fileSize; ++i) {
                            if (memcmp(pData + i, oldStr, matchLen) == 0) {
                                memcpy(pData + i, newStr, matchLen);
                            }
                        }
                        UnmapViewOfFile(pData);
                    }
                    CloseHandle(hMap);
                }
            }
            CloseHandle(hFile);
        }
    }

    // 2. Ganti RT_GROUP_ICON dan RT_ICON di file EXE
    {
        HANDLE hIco = CreateFileW(icoPath.c_str(), GENERIC_READ, FILE_SHARE_READ, NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);
        if (hIco == INVALID_HANDLE_VALUE) return false;
        DWORD icoSize = GetFileSize(hIco, NULL);
        if (icoSize < sizeof(ICONDIR)) { CloseHandle(hIco); return false; }

        std::vector<char> icoData(icoSize);
        DWORD bytesRead = 0;
        ReadFile(hIco, icoData.data(), icoSize, &bytesRead, NULL);
        CloseHandle(hIco);

        ICONDIR *pIconDir = (ICONDIR*)icoData.data();
        if (pIconDir->idType != 1 || pIconDir->idCount == 0) return false;

        HANDLE hUpdate = BeginUpdateResourceW(exePath.c_str(), FALSE);
        if (!hUpdate) return false;

        size_t grpSize = sizeof(GRPICONDIR) + pIconDir->idCount * sizeof(GRPICONDIRENTRY);
        std::vector<char> grpData(grpSize);
        GRPICONDIR *pGrpDir = (GRPICONDIR*)grpData.data();
        pGrpDir->idReserved = 0;
        pGrpDir->idType = 1;
        pGrpDir->idCount = pIconDir->idCount;

        GRPICONDIRENTRY *pGrpEntries = (GRPICONDIRENTRY*)(grpData.data() + sizeof(GRPICONDIR));
        ICONDIRENTRY *pIcoEntries = (ICONDIRENTRY*)(icoData.data() + sizeof(ICONDIR));

        for (WORD i = 0; i < pIconDir->idCount; ++i) {
            pGrpEntries[i].bWidth = pIcoEntries[i].bWidth;
            pGrpEntries[i].bHeight = pIcoEntries[i].bHeight;
            pGrpEntries[i].bColorCount = pIcoEntries[i].bColorCount;
            pGrpEntries[i].bReserved = pIcoEntries[i].bReserved;
            pGrpEntries[i].wPlanes = pIcoEntries[i].wPlanes;
            pGrpEntries[i].wBitCount = pIcoEntries[i].wBitCount;
            pGrpEntries[i].dwBytesInRes = pIcoEntries[i].dwBytesInRes;
            pGrpEntries[i].nID = i + 1;

            if (pIcoEntries[i].dwImageOffset + pIcoEntries[i].dwBytesInRes <= icoData.size()) {
                void *imgData = icoData.data() + pIcoEntries[i].dwImageOffset;
                UpdateResourceW(hUpdate, RT_ICON, MAKEINTRESOURCEW(i + 1), MAKELANGID(LANG_NEUTRAL, SUBLANG_NEUTRAL), imgData, pIcoEntries[i].dwBytesInRes);
            }
        }

        UpdateResourceW(hUpdate, RT_GROUP_ICON, MAKEINTRESOURCEW(1), MAKELANGID(LANG_NEUTRAL, SUBLANG_NEUTRAL), grpData.data(), (DWORD)grpData.size());
        EndUpdateResourceW(hUpdate, FALSE);
    }
    return true;
}

int wmain(int argc, wchar_t *argv[]) {
    if (argc >= 4 && (wcscmp(argv[1], L"--patch-target") == 0 || wcscmp(argv[1], L"--patch-icon") == 0)) {
        bool ok = PatchUkikuraExe(argv[2], argv[3]);
        return ok ? 0 : 1;
    }

    SetConsoleOutputCP(CP_UTF8);
    RoInitialize(RO_INIT_MULTITHREADED);

    MediaController media;
    DevicePowerMonitor power;
    NotificationMonitor notifs;
    ForegroundWindowMonitor fgWin;

    // Baca path temporary command files
    wchar_t tempPath[MAX_PATH] = {0};
    GetTempPathW(MAX_PATH, tempPath);
    std::wstring tempCmdFile = std::wstring(tempPath) + L"ukikura-media.cmd";

    wchar_t exePath[MAX_PATH] = {0};
    GetModuleFileNameW(NULL, exePath, MAX_PATH);
    wchar_t *lastSlash = wcsrchr(exePath, L'\\');
    std::wstring appDir = lastSlash ? std::wstring(exePath, lastSlash) : L".";
    std::wstring cmdFile = appDir + L"\\.media-cmd";

    // Laporkan volume awal ke Dynamic Island
    float initV = AudioMaster::GetVolume();
    bool initM = AudioMaster::GetMute();
    if (initV >= 0.0f) {
        ReportVolume((int)std::round(initV * 100.0f), initM);
    }

    // Buat event untuk respon instan (0 ms latency) saat menerima perintah media
    g_hWakeEvent = CreateEventW(NULL, FALSE, FALSE, NULL);

    // Jalankan listener thread pembaca stdin
    std::thread stdinThread(StdinReaderThread);
    stdinThread.detach();

    // Segera pangkas working set agar footprint memori < 3 MB
    EmptyWorkingSet(GetCurrentProcess());

    int tickCount = 0;
    int lastReportedVol = (initV >= 0.0f) ? (int)std::round(initV * 100.0f) : -1;
    bool lastReportedMute = initM;

    while (g_running) {
        // 1. Eksekusi perintah yang masuk dari stdin
        {
            std::vector<std::string> cmds;
            {
                std::lock_guard<std::mutex> lock(g_cmdMutex);
                cmds.swap(g_queuedCommands);
            }
            for (const auto &c : cmds) {
                media.ExecuteCommand(c);
            }
        }

        // 2. Eksekusi perintah dari file fallback
        ProcessFileCommands(media, cmdFile, tempCmdFile);

        // 3. Polling Media SMTC (Title, Artist, Timeline, Thumbnail)
        media.Poll(false);

        // 4. Polling Notifikasi Masuk setiap ~2-3 detik (tickCount % 3 == 0)
        if (tickCount % 3 == 0) {
            notifs.Poll();
        }

        // 5. Polling Baterai Laptop & Perangkat Bluetooth
        power.Poll();

        // 6. Polling Jendela Aktif (Browser Fullscreen / Maximized Detection)
        fgWin.Poll();

        // 6. Cek perubahan volume sistem secara berkala
        if (tickCount % 4 == 0) {
            float curV = AudioMaster::GetVolume();
            bool curM = AudioMaster::GetMute();
            if (curV >= 0.0f) {
                int lvl = (int)std::round(curV * 100.0f);
                if (lvl != lastReportedVol || curM != lastReportedMute) {
                    lastReportedVol = lvl;
                    lastReportedMute = curM;
                    ReportVolume(lastReportedVol, lastReportedMute);
                }
            }
        }

        tickCount++;

        // 7. Pemangkasan RAM berkala agar tetap ~2 MB
        if (tickCount % 12 == 0) {
            EmptyWorkingSet(GetCurrentProcess());
        }

        bool isPlaying = (media.GetPlaybackStatus() == "Playing");
        DWORD sleepMs = isPlaying ? 220 : 250;
        WaitForSingleObject(g_hWakeEvent, sleepMs);
    }

    RoUninitialize();
    return 0;
}
