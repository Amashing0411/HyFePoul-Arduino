#include <WiFi.h>
#include <HTTPClient.h>
#include <NetworkClientSecure.h>
#include <ArduinoJson.h>
#include <time.h>
#include "Config.h"

// At Debug/Verbose core debug levels, HTTPClient logs request URLs, and RTDB
// URLs carry the Firebase ID token (?auth=...). Keep "Core Debug Level: None"
// for anything other than bench debugging.
#if defined(CORE_DEBUG_LEVEL) && CORE_DEBUG_LEVEL >= 4
#warning "Core Debug Level Debug/Verbose logs request URLs containing the Firebase ID token"
#endif

// Firebase session
String idToken = "";
String localId = ""; // deviceAuthUid
unsigned long tokenObtainedMillis = 0;
unsigned long tokenLifetimeMs = 0;   // 0 = no usable token
unsigned long lastAuthAttemptMillis = 0;
bool authAttempted = false;
const unsigned long AUTH_RETRY_MS = 30000;

// Wi-Fi: never block; reconnect in the background.
const unsigned long WIFI_RETRY_MS = 15000;
bool wifiWasConnected = false;
unsigned long lastWiFiAttemptMillis = 0;

// TLS: production requests verify Firebase's certificate against the core's
// built-in CA bundle. (HTTPClient::begin(url) alone falls back to setInsecure.)
NetworkClientSecure secureClient;

// UART to the Mega. Its Serial1 receive buffer is 64 bytes, so every line
// (including '\n') must fit, and lines are spaced so the Mega can drain them.
const size_t MEGA_MAX_LINE_LENGTH = 63;
const unsigned long MEGA_LINE_GAP_MS = 50;
const unsigned long LINK_STATUS_INTERVAL_MS = 10000; // under the Mega's 15 s link timeout
unsigned long lastMegaLineMillis = 0;

String megaReceiveBuffer = "";

// Alert resolution (R-23). The Mega sends a "cleared" event when a
// condition recovers; the matching /alerts record is then marked resolved.
// Requests are kept here until the ESP32 is online (the Mega's boot clears
// usually arrive before Wi-Fi is up) and retried until they succeed.
const char* const RESOLVABLE_ALERTS[] = {
  "LOW_FEED", "LOW_WATER", "EMERGENCY_STOP", "CHAIN_TIMEOUT", "TRAY_TIMEOUT",
  "CONTROLLER_OFFLINE"
};
const uint8_t RESOLVABLE_ALERT_COUNT = 6;
const unsigned long RESOLVE_RETRY_MS = 5000;
uint8_t pendingResolveMask = 0; // bit i = RESOLVABLE_ALERTS[i]
unsigned long lastResolveAttemptMillis = 0;

// Mega link health (R-24). The Mega sends DATA every 10 s, so no line for
// MEGA_LINK_TIMEOUT_MS (three missed DATA) means it has stopped, crashed or
// its UART is disconnected. Reported as devices/{id}/megaLinkOk plus a
// CONTROLLER_OFFLINE alert (resolved when the Mega is heard again). The
// boot time counts as "last heard", so a just-started ESP32 reports a
// problem only if the Mega stays silent for the whole timeout.
const unsigned long MEGA_LINK_TIMEOUT_MS = 30000;
unsigned long lastMegaRxMillis = 0;
bool megaLinkOk = true;
bool megaLinkReportPending = true;

// One parsed DATA line from the Mega (moving-hopper design: 5 trays).
const int TRAY_COUNT = 5;
struct DeviceStateData {
  float trayGrams[TRAY_COUNT];
  float targetPerTray;
  float hopperPercent;
  bool waterLow;
  bool feeding;
  String cycleStep;
  int currentTray;
  bool estop;
  String timeSource; // NETWORK, RTC or INVALID (the Mega's clock source)
};

// Time management
const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = 0;
const int   daylightOffset_sec = 0;

// Command Management. Firebase command IDs (~23 chars) stay on the ESP32;
// the Mega sees a short UART ID (C0..C9) so command lines fit 64 bytes.
String activeCommandId = "";
String activeUartId = "";
String activeCommandName = "";
String activeCommandStatus = "";
unsigned long activeCommandStartMillis = 0;
uint8_t uartIdCounter = 0;
const unsigned long UART_ACK_TIMEOUT = 3000;
// A MANUAL_FEED runs a full 5-tray cycle on the Mega: about a minute
// normally, up to ~4.5 min if every tray and move hits its timeout.
const unsigned long UART_EXEC_TIMEOUT = 300000;

// Schedule restore: re-send /schedules/{deviceId} to the Mega after either
// board restarts, after Wi-Fi comes back, or after a schedule command failed.
// One SCHEDULE_SET per slot, each waiting for its CMD_ACK, using short IDs
// R0..R2. Not written to /commands.
const uint8_t SCHEDULE_SLOT_COUNT = 3;
const unsigned long SCHEDULE_RESTORE_RETRY_MS = 30000;
bool scheduleRestorePending = true; // restore once after ESP32 boot
int scheduleRestoreIndex = -1;      // slot awaiting CMD_ACK, -1 = idle
unsigned long scheduleRestoreSentMillis = 0;
unsigned long nextScheduleRestoreMillis = 0;
String scheduleRestoreLines[SCHEDULE_SLOT_COUNT];

void setup() {
  Serial.begin(115200);
  MEGA_SERIAL.begin(MEGA_BAUD_RATE, SERIAL_8N1, MEGA_RX_PIN, MEGA_TX_PIN);

  Serial.println("HyFePoul ESP32 Bridge Starting...");
  lastMegaRxMillis = millis();

  if (!FIREBASE_USE_EMULATOR) {
    secureClient.useBuiltinCACertBundle();
  }

  // Start Wi-Fi without waiting: the Mega link, status messages and retries
  // keep running while the network is down.
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  lastWiFiAttemptMillis = millis();

  // SNTP keeps retrying in the background until Wi-Fi is up.
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
}

void loop() {
  // 1. Keep Wi-Fi and the Firebase session alive
  maintainWiFi();
  maintainAuth();

  // 2. Read from Arduino Mega
  while (MEGA_SERIAL.available()) {
    char incoming = MEGA_SERIAL.read();
    if (incoming == '\n') {
      processMegaLine(megaReceiveBuffer);
      megaReceiveBuffer = "";
    } else if (incoming != '\r') {
      megaReceiveBuffer += incoming;
      if (megaReceiveBuffer.length() > 512) {
        megaReceiveBuffer = ""; // Prevent overflow
      }
    }
  }

  // 3. Tell the Mega whether the device is online
  sendLinkStatusToMega(false);

  // 4. Periodic heartbeat and network time
  static unsigned long lastHeartbeat = 0;
  if (millis() - lastHeartbeat >= 30000UL) {
    sendHeartbeat();
    megaLinkReportPending = true; // re-assert with every heartbeat
    sendNetworkTimeToMega();
    lastHeartbeat = millis();
  }

  // 5. Poll and manage Remote Commands
  static unsigned long lastCommandPoll = 0;
  if (millis() - lastCommandPoll >= 5000UL) {
    pollCommands();
    lastCommandPoll = millis();
  }

  checkCommandTimeout();

  // 6. Re-send schedules to the Mega when needed
  handleScheduleRestore();

  // 7. Mark recovered alerts resolved
  processPendingResolves();

  // 8. Watch the Mega link and report changes
  checkMegaLink();
  reportMegaLink();
}

// ---------------------------------------------------------
// Wi-Fi and Session
// ---------------------------------------------------------
void maintainWiFi() {
  bool connected = WiFi.status() == WL_CONNECTED;

  if (connected != wifiWasConnected) {
    wifiWasConnected = connected;

    if (connected) {
      Serial.print("WiFi connected, IP ");
      Serial.println(WiFi.localIP());
      // Schedules may have changed (or commands gone stale) while offline.
      requestScheduleRestore();
    } else {
      Serial.println("WiFi lost; reconnecting in the background.");
    }

    sendLinkStatusToMega(true);
  }

  if (!connected && millis() - lastWiFiAttemptMillis >= WIFI_RETRY_MS) {
    lastWiFiAttemptMillis = millis();
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
}

bool hasValidToken() {
  return idToken.length() > 0 && millis() - tokenObtainedMillis < tokenLifetimeMs;
}

// Signs in when there is no usable token, refreshes 5 minutes before expiry
// (rollover-safe), and spaces failed attempts AUTH_RETRY_MS apart.
void maintainAuth() {
  if (WiFi.status() != WL_CONNECTED || hasValidToken()) return;
  if (authAttempted && millis() - lastAuthAttemptMillis < AUTH_RETRY_MS) return;

  authenticateFirebase();
}

// RTDB answers 401 for an expired/revoked token (and for rule denials), so
// schedule a fresh sign-in. The current token stays in use until then.
void noteHttpResult(int code) {
  if (code == 401 && tokenLifetimeMs != 0) {
    Serial.println("Firebase returned 401; refreshing the session.");
    tokenLifetimeMs = 0;
  }
}

// ---------------------------------------------------------
// UART to Mega
// ---------------------------------------------------------
// Sends one line to the Mega. Refuses lines that would overflow the Mega's
// 64-byte receive buffer, and spaces consecutive lines MEGA_LINE_GAP_MS apart.
bool sendToMega(const String& line) {
  if (line.length() > MEGA_MAX_LINE_LENGTH) {
    Serial.print("UART line too long, not sent: ");
    Serial.println(line);
    return false;
  }

  unsigned long sinceLast = millis() - lastMegaLineMillis;
  if (sinceLast < MEGA_LINE_GAP_MS) {
    delay(MEGA_LINE_GAP_MS - sinceLast);
  }

  MEGA_SERIAL.print(line);
  MEGA_SERIAL.print('\n');
  lastMegaLineMillis = millis();
  return true;
}

// STATUS|ONLINE when Wi-Fi is up and a Firebase session is valid, otherwise
// STATUS|OFFLINE. Sent on change and every LINK_STATUS_INTERVAL_MS, which also
// serves as the Mega's link heartbeat.
void sendLinkStatusToMega(bool force) {
  static unsigned long lastSent = 0;

  if (!force && millis() - lastSent < LINK_STATUS_INTERVAL_MS) return;
  lastSent = millis();

  bool online = WiFi.status() == WL_CONNECTED && hasValidToken();
  sendToMega(online ? "STATUS|ONLINE" : "STATUS|OFFLINE");
}

// ---------------------------------------------------------
// Time Helpers
// ---------------------------------------------------------
unsigned long getTimestampMillis() {
  struct timeval tv;
  gettimeofday(&tv, NULL);
  return (tv.tv_sec * 1000ULL) + (tv.tv_usec / 1000ULL);
}

void sendNetworkTimeToMega() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 0)) {
    return;
  }
  char timeStr[50];
  strftime(timeStr, sizeof(timeStr), "TIME|%Y-%m-%d|%H:%M:%S", &timeinfo);
  sendToMega(String(timeStr));
}

// ---------------------------------------------------------
// REST API Helpers
// ---------------------------------------------------------
String getAuthUrl() {
  if (FIREBASE_USE_EMULATOR) {
    return String("http://") + EMULATOR_HOST + ":" + EMULATOR_AUTH_PORT + "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + FIREBASE_API_KEY;
  }
  return String("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=") + FIREBASE_API_KEY;
}

String getDatabaseUrl(const char* path) {
  if (FIREBASE_USE_EMULATOR) {
    return String("http://") + EMULATOR_HOST + ":" + EMULATOR_RTDB_PORT + "/" + path + "?ns=" + FIREBASE_PROJECT_ID + "-default-rtdb&auth=" + idToken;
  }
  return String("https://") + FIREBASE_PROJECT_ID + "-default-rtdb.asia-southeast1.firebasedatabase.app/" + path + "?auth=" + idToken;
}

// Production: certificate-verified TLS. Emulator: plain HTTP on the LAN.
// Requests must not be nested: they share secureClient, so end() one before
// starting the next.
bool beginRequest(HTTPClient& http, const String& url) {
  if (FIREBASE_USE_EMULATOR) {
    return http.begin(url);
  }
  return http.begin(secureClient, url);
}

void authenticateFirebase() {
  authAttempted = true;
  lastAuthAttemptMillis = millis();

  Serial.println("Authenticating with Firebase...");

  HTTPClient http;
  if (!beginRequest(http, getAuthUrl())) {
    Serial.println("Auth: could not start request.");
    return;
  }
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<200> doc;
  doc["email"] = FIREBASE_AUTH_EMAIL;
  doc["password"] = FIREBASE_AUTH_PASSWORD;
  doc["returnSecureToken"] = true;

  String requestBody;
  serializeJson(doc, requestBody);

  int httpCode = http.POST(requestBody);
  String payload = http.getString();
  http.end();

  if (httpCode != 200) {
    // The error body holds only an error code/message, no credentials.
    Serial.print("Auth failed. Code: ");
    Serial.println(httpCode);
    Serial.println(payload);
    return;
  }

  // The response carries a ~1 KB ID token plus a refresh token and other
  // fields; keep only what is needed so the document cannot run out of room.
  StaticJsonDocument<64> filter;
  filter["idToken"] = true;
  filter["localId"] = true;
  filter["expiresIn"] = true;

  DynamicJsonDocument responseDoc(2048);
  DeserializationError error = deserializeJson(responseDoc, payload, DeserializationOption::Filter(filter));
  const char* token = responseDoc["idToken"];

  if (error || token == nullptr || token[0] == '\0') {
    Serial.print("Auth: unreadable response (");
    Serial.print(error.c_str());
    Serial.println(").");
    return;
  }

  idToken = token;
  localId = responseDoc["localId"] | "";

  // expiresIn arrives as a string, e.g. "3600".
  JsonVariant expires = responseDoc["expiresIn"];
  long expiresIn = expires.is<const char*>() ? atol(expires.as<const char*>()) : expires.as<long>();
  if (expiresIn <= 600) expiresIn = 3600;

  // Refresh 5 minutes before expiry.
  tokenObtainedMillis = millis();
  tokenLifetimeMs = (unsigned long)(expiresIn - 300) * 1000UL;

  Serial.println("Auth successful. UID: " + localId);

  sendLinkStatusToMega(true);
  sendHeartbeat();
}

// ---------------------------------------------------------
// Mega Protocol Parser
// ---------------------------------------------------------
void clearActiveCommand() {
  activeCommandId = "";
  activeUartId = "";
  activeCommandName = "";
}

void processMegaLine(String line) {
  line.trim();
  if (line.length() == 0) return;

  lastMegaRxMillis = millis();

  Serial.print("Mega TX: ");
  Serial.println(line);

  // DATA|t1|t2|t3|t4|t5|target|hopper|waterLow|feeding|step|tray|estop|timeSource
  if (line.startsWith("DATA|")) {
    // 14 fields -> 13 separators; fields[i] is the text after separator i.
    const int SEPARATORS = 13;
    int indices[SEPARATORS + 1];
    int count = 0;
    int pos = line.indexOf('|');
    while (pos != -1 && count < SEPARATORS) {
      indices[count++] = pos;
      pos = line.indexOf('|', pos + 1);
    }

    if (count == SEPARATORS && pos == -1) {
      indices[SEPARATORS] = line.length();
      DeviceStateData data;
      for (int i = 0; i < TRAY_COUNT; i++) {
        data.trayGrams[i] = line.substring(indices[i] + 1, indices[i + 1]).toFloat();
      }
      data.targetPerTray = line.substring(indices[5] + 1, indices[6]).toFloat();
      data.hopperPercent = line.substring(indices[6] + 1, indices[7]).toFloat();
      data.waterLow = line.substring(indices[7] + 1, indices[8]).toInt() == 1;
      data.feeding = line.substring(indices[8] + 1, indices[9]).toInt() == 1;
      data.cycleStep = line.substring(indices[9] + 1, indices[10]);
      data.currentTray = line.substring(indices[10] + 1, indices[11]).toInt();
      data.estop = line.substring(indices[11] + 1, indices[12]).toInt() == 1;
      data.timeSource = line.substring(indices[12] + 1, indices[13]);
      data.timeSource.trim();

      sendStateToFirebase(data);
    } else {
      Serial.println("DATA line ignored: wrong field count");
    }
  }
  else if (line.startsWith("EVENT|")) {
    String eventName = line.substring(6);

    if (eventName == "SYSTEM_START") {
      // The Mega restarted: re-send the RTDB schedules (overrides whatever
      // it loaded from EEPROM or defaults) and tell it the link status.
      requestScheduleRestore();
      sendLinkStatusToMega(true);
    }

    noteAlertResolution(eventName);
    sendEventToFirebase(eventName);
  }
  else if (line.startsWith("CMD_ACK|")) {
    // CMD_ACK|ID:<uart id>|STATUS:<status>|REASON:<reason>
    String id = extractValue(line, "ID:");
    String status = extractValue(line, "STATUS:");
    String reason = extractValue(line, "REASON:");

    if (scheduleRestoreIndex >= 0 && id == String("R") + scheduleRestoreIndex) {
      handleScheduleRestoreAck(status, reason);
      return;
    }

    if (activeUartId != "" && id == activeUartId) {
      if (status == "ACCEPTED") {
        activeCommandStatus = "executing";
        updateCommandStatus(activeCommandId, "executing", "");
      } else if (status == "REJECTED") {
        updateCommandStatus(activeCommandId, "failed", reason.length() > 0 ? reason : "REJECTED_BY_MEGA");
        if (activeCommandName == "SCHEDULE_SET") requestScheduleRestore();
        clearActiveCommand();
      }
    }
  }
  else if (line.startsWith("CMD_DONE|")) {
    // CMD_DONE|ID:<uart id>|STATUS:<status>|REASON:<reason>
    String id = extractValue(line, "ID:");
    String status = extractValue(line, "STATUS:");
    String reason = extractValue(line, "REASON:");

    if (activeUartId != "" && id == activeUartId) {
      if (status == "SUCCESS") {
        updateCommandStatus(activeCommandId, "completed", "");
      } else {
        updateCommandStatus(activeCommandId, "failed", reason.length() > 0 ? reason : "FAILED_DURING_EXECUTION");
      }
      clearActiveCommand();
    }
  }
}

String extractValue(String line, String key) {
  int keyIndex = line.indexOf(key);
  if (keyIndex == -1) return "";
  int valStart = keyIndex + key.length();
  int valEnd = line.indexOf('|', valStart);
  if (valEnd == -1) valEnd = line.length();
  return line.substring(valStart, valEnd);
}

// ---------------------------------------------------------
// Realtime Database Writes
// ---------------------------------------------------------
void sendHeartbeat() {
  if (idToken == "" || WiFi.status() != WL_CONNECTED) return;

  unsigned long currentTimestamp = getTimestampMillis();
  if (currentTimestamp < 1000000000000ULL) return; // NTP not synced yet

  HTTPClient http;

  // 1. Update status = 'online'
  if (!beginRequest(http, getDatabaseUrl((String("devices/") + DEVICE_ID + "/status.json").c_str()))) return;
  http.addHeader("Content-Type", "application/json");
  noteHttpResult(http.PUT("\"online\""));
  http.end();

  // 2. Update lastHeartbeat
  if (!beginRequest(http, getDatabaseUrl((String("devices/") + DEVICE_ID + "/lastHeartbeat.json").c_str()))) return;
  http.addHeader("Content-Type", "application/json");
  noteHttpResult(http.PUT(String(currentTimestamp)));
  http.end();
}

void sendStateToFirebase(const DeviceStateData& data) {
  if (idToken == "" || WiFi.status() != WL_CONNECTED) return;

  unsigned long currentTimestamp = getTimestampMillis();
  if (currentTimestamp < 1000000000000ULL) return; // Wait for valid time

  StaticJsonDocument<768> doc;
  float total = 0.0f;
  JsonArray trays = doc.createNestedArray("trayWeightsGrams");
  for (int i = 0; i < TRAY_COUNT; i++) {
    trays.add(data.trayGrams[i]);
    total += data.trayGrams[i];
  }
  doc["feedWeightGrams"] = total; // sum of the 5 trays
  doc["targetFeedGrams"] = data.targetPerTray; // per tray
  doc["hopperLevelPercent"] = data.hopperPercent;
  doc["waterLow"] = data.waterLow;
  doc["feedingActive"] = data.feeding;
  doc["cycleStep"] = data.cycleStep;
  doc["currentTray"] = data.currentTray;
  doc["emergencyStopActive"] = data.estop;
  if (data.timeSource == "NETWORK" || data.timeSource == "RTC" || data.timeSource == "INVALID") {
    doc["timeSource"] = data.timeSource;
  }
  doc["timestamp"] = currentTimestamp;

  String payload;
  serializeJson(doc, payload);

  HTTPClient http;

  // 1. Write current state
  if (!beginRequest(http, getDatabaseUrl((String("devices/") + DEVICE_ID + "/state.json").c_str()))) return;
  http.addHeader("Content-Type", "application/json");
  int code = http.PUT(payload);
  http.end();
  noteHttpResult(code);

  if (code == 200) {
    // 2. Append to history (systemData)
    if (!beginRequest(http, getDatabaseUrl((String("systemData/") + DEVICE_ID + ".json").c_str()))) return;
    http.addHeader("Content-Type", "application/json");
    noteHttpResult(http.POST(payload));
    http.end();
  } else {
    Serial.print("Failed to write state, code: ");
    Serial.println(code);
  }
}

void sendEventToFirebase(String eventName) {
  if (idToken == "" || WiFi.status() != WL_CONNECTED) return;

  // Only actionable events become RTDB alerts. Informational events (like FEEDING_STARTED)
  // are logged locally on the Mega SD card per existing architecture.
  if (eventName != "LOW_FEED" && eventName != "LOW_WATER" &&
      eventName != "CHAIN_TIMEOUT" && eventName != "TRAY_TIMEOUT" &&
      eventName != "EMERGENCY_STOP" && eventName != "DEVICE_ERROR" &&
      eventName != "CONTROLLER_OFFLINE") {
    return;
  }

  unsigned long currentTimestamp = getTimestampMillis();
  if (currentTimestamp < 1000000000000ULL) return;

  StaticJsonDocument<256> doc;
  doc["eventId"] = eventName; // Deterministic event ID ensures idempotency
  doc["name"] = eventName;
  doc["timestamp"] = currentTimestamp;
  doc["resolved"] = false;

  String payload;
  serializeJson(doc, payload);

  HTTPClient http;
  if (!beginRequest(http, getDatabaseUrl((String("alerts/") + DEVICE_ID + "/" + eventName + ".json").c_str()))) return;
  http.addHeader("Content-Type", "application/json");
  noteHttpResult(http.PUT(payload)); // PUT (not POST) for idempotency
  http.end();
}

// ---------------------------------------------------------
// Mega link health
// ---------------------------------------------------------
void checkMegaLink() {
  bool ok = millis() - lastMegaRxMillis < MEGA_LINK_TIMEOUT_MS;
  if (ok == megaLinkOk) return;

  megaLinkOk = ok;
  megaLinkReportPending = true;

  if (ok) {
    Serial.println("Mega link restored.");
    requestResolve("CONTROLLER_OFFLINE");
  } else {
    Serial.println("Mega link lost: no data from the Mega.");
    noteAlertResolution("CONTROLLER_OFFLINE"); // cancels a pending resolve
    sendEventToFirebase("CONTROLLER_OFFLINE");
  }
}

// Written on its own (not in the heartbeat request), so if the deployed
// rules do not know the field yet, only this write fails.
void reportMegaLink() {
  if (!megaLinkReportPending) return;
  if (!hasValidToken() || WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  if (!beginRequest(http, getDatabaseUrl((String("devices/") + DEVICE_ID + "/megaLinkOk.json").c_str()))) return;
  http.addHeader("Content-Type", "application/json");
  int code = http.PUT(megaLinkOk ? "true" : "false");
  http.end();
  noteHttpResult(code);

  if (code == 200) {
    megaLinkReportPending = false;
  }
}

// ---------------------------------------------------------
// Alert resolution
// ---------------------------------------------------------
int resolvableIndex(const String& alertName) {
  for (uint8_t i = 0; i < RESOLVABLE_ALERT_COUNT; i++) {
    if (alertName == RESOLVABLE_ALERTS[i]) return i;
  }
  return -1;
}

void requestResolve(const char* alertName) {
  int i = resolvableIndex(alertName);
  if (i >= 0) pendingResolveMask |= (1 << i);
}

// Maps Mega events to alert resolutions. A new occurrence of an alert
// cancels a pending resolve for it, so the order of events is kept.
void noteAlertResolution(const String& eventName) {
  if (eventName == "LOW_FEED_CLEARED") {
    requestResolve("LOW_FEED");
  } else if (eventName == "LOW_WATER_CLEARED") {
    requestResolve("LOW_WATER");
  } else if (eventName == "EMERGENCY_STOP_RELEASED") {
    requestResolve("EMERGENCY_STOP");
  } else if (eventName == "FEEDING_COMPLETED") {
    // A cycle that filled every tray and returned home clears both.
    requestResolve("CHAIN_TIMEOUT");
    requestResolve("TRAY_TIMEOUT");
  } else {
    int i = resolvableIndex(eventName);
    if (i >= 0) pendingResolveMask &= ~(1 << i);
  }
}

// One pending resolve per call. Only an existing, still-active record is
// patched, so a missing alert is never created as a partial record.
void processPendingResolves() {
  if (pendingResolveMask == 0) return;
  if (!hasValidToken() || WiFi.status() != WL_CONNECTED) return;
  if (millis() - lastResolveAttemptMillis < RESOLVE_RETRY_MS) return;

  unsigned long now = getTimestampMillis();
  if (now < 1000000000000ULL) return;
  lastResolveAttemptMillis = millis();

  uint8_t i = 0;
  while (!(pendingResolveMask & (1 << i))) i++;
  String path = String("alerts/") + DEVICE_ID + "/" + RESOLVABLE_ALERTS[i];

  HTTPClient http;
  if (!beginRequest(http, getDatabaseUrl((path + "/resolved.json").c_str()))) return;
  int code = http.GET();
  String body = code == 200 ? http.getString() : "";
  http.end();
  noteHttpResult(code);
  if (code != 200) return; // retry later

  body.trim();
  if (body != "false") {
    // No such alert ("null") or already resolved: nothing to do.
    pendingResolveMask &= ~(1 << i);
    return;
  }

  StaticJsonDocument<96> doc;
  doc["resolved"] = true;
  doc["resolvedAt"] = now;
  String payload;
  serializeJson(doc, payload);

  if (!beginRequest(http, getDatabaseUrl((path + ".json").c_str()))) return;
  http.addHeader("Content-Type", "application/json");
  code = http.PATCH(payload);
  http.end();
  noteHttpResult(code);

  if (code == 200) {
    pendingResolveMask &= ~(1 << i);
    Serial.print("Alert resolved: ");
    Serial.println(RESOLVABLE_ALERTS[i]);
  }
}

// ---------------------------------------------------------
// Remote Command Processing
// ---------------------------------------------------------
// Builds the UART line for a Firebase command using a short UART ID.
// SCHEDULE_SET values are sent as integers (whole grams), like the restore.
String buildCommandLine(const String& uartId, const String& commandName, JsonObject cmd) {
  String paramsStr = "";

  if (cmd.containsKey("parameters")) {
    JsonObject params = cmd["parameters"].as<JsonObject>();
    if (commandName == "MANUAL_FEED" && params.containsKey("targetGrams")) {
      paramsStr = "|TARGET:" + params["targetGrams"].as<String>();
    } else if (commandName == "SCHEDULE_SET" && params.containsKey("index")) {
      paramsStr = String("|IDX:") + params["index"].as<int>() +
                  "|HR:" + params["hour"].as<int>() +
                  "|MIN:" + params["minute"].as<int>() +
                  "|TGT:" + lround(params["targetGrams"].as<float>()) +
                  "|EN:" + (params["enabled"].as<bool>() ? "1" : "0");
    }
  }

  return "CMD|ID:" + uartId + "|ACTION:" + commandName + paramsStr;
}

void pollCommands() {
  if (idToken == "" || WiFi.status() != WL_CONNECTED) return;

  // We only poll for new commands if we aren't busy (including a schedule
  // restore, so restore and command lines never interleave on the UART).
  if (activeCommandId != "" || scheduleRestoreIndex >= 0) return;

  unsigned long currentTimestamp = getTimestampMillis();
  if (currentTimestamp < 1000000000000ULL) return; // NTP not synced

  // Use the indexOn "status" to fetch only queued commands efficiently
  String url = (FIREBASE_USE_EMULATOR ? (String("http://") + EMULATOR_HOST + ":" + EMULATOR_RTDB_PORT) : (String("https://") + FIREBASE_PROJECT_ID + "-default-rtdb.asia-southeast1.firebasedatabase.app"))
               + "/commands/" + DEVICE_ID + ".json"
               + "?orderBy=\"status\"&equalTo=\"queued\""
               + (FIREBASE_USE_EMULATOR ? (String("&ns=") + FIREBASE_PROJECT_ID + "-default-rtdb") : String(""))
               + "&auth=" + idToken;

  // Finish this request before the status updates below (shared TLS client).
  HTTPClient http;
  if (!beginRequest(http, url)) return;
  int httpCode = http.GET();
  String payload = httpCode == 200 ? http.getString() : "";
  http.end();
  noteHttpResult(httpCode);

  if (httpCode != 200 || payload == "null" || payload.length() <= 2) return;

  DynamicJsonDocument doc(2048);
  if (deserializeJson(doc, payload)) return;

  JsonObject commands = doc.as<JsonObject>();
  for (JsonPair kv : commands) {
    String cmdId = kv.key().c_str();
    JsonObject cmd = kv.value().as<JsonObject>();

    String commandName = cmd["command"].as<String>();
    unsigned long createdAt = cmd["createdAt"].as<unsigned long>();
    String issuedBy = cmd["issuedBy"].as<String>();

    // Validate
    if (cmdId == "" || commandName == "" || createdAt == 0 || issuedBy == "") {
      // Malformed, ignore. We can't safely update if it's completely broken.
      continue;
    }

    if (commandName != "MANUAL_FEED" && commandName != "ESTOP_RELEASE" &&
        commandName != "SYSTEM_RESTART" && commandName != "STATUS_REQ" && commandName != "SCHEDULE_SET") {
      continue; // Not whitelisted
    }

    // Check stale
    if (currentTimestamp > createdAt && (currentTimestamp - createdAt) > 300000UL) {
      updateCommandStatus(cmdId, "failed", "STALE_COMMAND");
      // The schedule change never reached the Mega; repair from RTDB.
      if (commandName == "SCHEDULE_SET") requestScheduleRestore();
      continue;
    }

    // Build the UART line first, so a command that cannot fit the Mega's
    // buffer fails cleanly instead of being delivered cut off.
    String uartId = String("C") + (uartIdCounter % 10);
    String line = buildCommandLine(uartId, commandName, cmd);

    if (line.length() > MEGA_MAX_LINE_LENGTH) {
      updateCommandStatus(cmdId, "failed", "LINE_TOO_LONG");
      if (commandName == "SCHEDULE_SET") requestScheduleRestore();
      break;
    }

    // Accept it
    if (updateCommandStatus(cmdId, "acknowledged", "")) {
      uartIdCounter++;
      activeCommandId = cmdId;
      activeUartId = uartId;
      activeCommandName = commandName;
      activeCommandStatus = "acknowledged";
      activeCommandStartMillis = millis();
      sendToMega(line);
    }
    break; // Process one command at a time
  }
}

bool updateCommandStatus(String cmdId, String newStatus, String errorMsg) {
  if (idToken == "" || WiFi.status() != WL_CONNECTED) return false;

  unsigned long currentTimestamp = getTimestampMillis();
  if (currentTimestamp < 1000000000000ULL) return false;

  StaticJsonDocument<256> doc;
  doc["status"] = newStatus;

  if (newStatus == "acknowledged") {
    doc["acknowledgedAt"] = currentTimestamp;
  } else if (newStatus == "completed") {
    doc["completedAt"] = currentTimestamp;
  } else if (newStatus == "failed") {
    doc["error"] = errorMsg;
  }

  String payload;
  serializeJson(doc, payload);

  HTTPClient http;
  if (!beginRequest(http, getDatabaseUrl((String("commands/") + DEVICE_ID + "/" + cmdId + ".json").c_str()))) return false;
  http.addHeader("Content-Type", "application/json");
  int code = http.PATCH(payload); // Using PATCH to avoid overwriting the whole command
  http.end();
  noteHttpResult(code);

  return (code == 200);
}

void checkCommandTimeout() {
  if (activeCommandId == "") return;

  if (activeCommandStatus == "acknowledged") {
    if (millis() - activeCommandStartMillis > UART_ACK_TIMEOUT) {
      updateCommandStatus(activeCommandId, "failed", "UART_TIMEOUT");
      // A SCHEDULE_SET line lost on the UART lands here.
      if (activeCommandName == "SCHEDULE_SET") requestScheduleRestore();
      clearActiveCommand();
    }
  } else if (activeCommandStatus == "executing") {
    if (millis() - activeCommandStartMillis > UART_EXEC_TIMEOUT) {
      updateCommandStatus(activeCommandId, "failed", "EXECUTION_TIMEOUT");
      clearActiveCommand();
    }
  }
}

// ---------------------------------------------------------
// Schedule Restore (RTDB -> Mega)
// ---------------------------------------------------------
void requestScheduleRestore() {
  scheduleRestorePending = true;
  nextScheduleRestoreMillis = millis();
}

// Builds one SCHEDULE_SET line per slot from /schedules/{deviceId}.
// A slot that is missing or invalid in RTDB is sent as disabled, so the
// Mega never runs a schedule the app does not show. Returns false (and
// leaves the Mega's EEPROM copy in charge) if RTDB could not be read.
bool fetchScheduleRestoreLines() {
  if (idToken == "" || WiFi.status() != WL_CONNECTED) return false;

  HTTPClient http;
  if (!beginRequest(http, getDatabaseUrl((String("schedules/") + DEVICE_ID + ".json").c_str()))) return false;
  int code = http.GET();
  String payload = code == 200 ? http.getString() : "";
  http.end();
  noteHttpResult(code);

  if (code != 200) {
    Serial.print("Schedule restore: read failed, code ");
    Serial.println(code);
    return false;
  }

  DynamicJsonDocument doc(1536);
  if (payload != "null" && deserializeJson(doc, payload)) {
    Serial.println("Schedule restore: unreadable /schedules payload.");
    return false;
  }

  for (uint8_t i = 0; i < SCHEDULE_SLOT_COUNT; i++) {
    JsonVariant slot = doc[String("sched_") + i];
    int hour = slot["hour"] | -1;
    int minute = slot["minute"] | -1;
    float target = slot["targetGrams"] | 0.0f;
    bool valid = slot["enabled"].is<bool>() &&
                 hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 &&
                 target > 0.0f && target <= 2000.0f;

    // Whole grams keep the line within 63 bytes; the app only saves integers.
    long grams = valid ? lround(target) : 250;
    if (grams < 1) grams = 1;
    bool enabled = valid && slot["enabled"].as<bool>();

    scheduleRestoreLines[i] = String("CMD|ID:R") + i +
                              "|ACTION:SCHEDULE_SET|IDX:" + i +
                              "|HR:" + (valid ? hour : 0) +
                              "|MIN:" + (valid ? minute : 0) +
                              "|TGT:" + grams +
                              "|EN:" + (enabled ? "1" : "0");
  }

  return true;
}

void sendScheduleRestoreLine() {
  sendToMega(scheduleRestoreLines[scheduleRestoreIndex]);
  scheduleRestoreSentMillis = millis();
}

void abortScheduleRestore() {
  scheduleRestoreIndex = -1;
  scheduleRestorePending = true;
  nextScheduleRestoreMillis = millis() + SCHEDULE_RESTORE_RETRY_MS;
}

void handleScheduleRestoreAck(const String& status, const String& reason) {
  if (status != "ACCEPTED") {
    Serial.print("Schedule restore: slot rejected by Mega (");
    Serial.print(reason);
    Serial.println("), retrying later.");
    abortScheduleRestore();
    return;
  }

  scheduleRestoreIndex++;

  if (scheduleRestoreIndex >= SCHEDULE_SLOT_COUNT) {
    scheduleRestoreIndex = -1;
    scheduleRestorePending = false;
    Serial.println("Schedule restore complete.");
    return;
  }

  sendScheduleRestoreLine();
}

void handleScheduleRestore() {
  if (scheduleRestoreIndex >= 0) {
    if (millis() - scheduleRestoreSentMillis > UART_ACK_TIMEOUT) {
      Serial.println("Schedule restore: no ACK from Mega, retrying later.");
      abortScheduleRestore();
    }
    return;
  }

  if (!scheduleRestorePending || activeCommandId != "") return;
  if ((long)(millis() - nextScheduleRestoreMillis) < 0) return;

  if (!fetchScheduleRestoreLines()) {
    nextScheduleRestoreMillis = millis() + SCHEDULE_RESTORE_RETRY_MS;
    return;
  }

  scheduleRestoreIndex = 0;
  sendScheduleRestoreLine();
}
