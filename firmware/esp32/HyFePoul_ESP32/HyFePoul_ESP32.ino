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
const unsigned long UART_EXEC_TIMEOUT = 120000;

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

  Serial.print("Mega TX: ");
  Serial.println(line);

  // DATA|feedWeight|targetFeed|hopperLevel|waterLow|waterHigh|pump|feeding|emergencyStop|timeSource
  if (line.startsWith("DATA|")) {
    int indices[10];
    int count = 0;
    int pos = line.indexOf('|');
    while (pos != -1 && count < 10) {
      indices[count++] = pos;
      pos = line.indexOf('|', pos + 1);
    }

    if (count >= 9) { // We need at least 9 separators for 9 data fields
      float feedWeight = line.substring(indices[0] + 1, indices[1]).toFloat();
      float targetFeedGrams = line.substring(indices[1] + 1, indices[2]).toFloat();
      float hopperLevel = line.substring(indices[2] + 1, indices[3]).toFloat();
      bool waterLow = line.substring(indices[3] + 1, indices[4]).toInt() == 1;
      bool waterHigh = line.substring(indices[4] + 1, indices[5]).toInt() == 1;
      bool pumpActive = line.substring(indices[5] + 1, indices[6]).toInt() == 1;
      bool feedingActive = line.substring(indices[6] + 1, indices[7]).toInt() == 1;
      bool estop = line.substring(indices[7] + 1, indices[8]).toInt() == 1;

      sendStateToFirebase(feedWeight, targetFeedGrams, hopperLevel, waterLow, waterHigh, pumpActive, feedingActive, estop);
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

void sendStateToFirebase(float feedWt, float targetFeed, float hopper, bool wLow, bool wHigh, bool pump, bool feeding, bool estop) {
  if (idToken == "" || WiFi.status() != WL_CONNECTED) return;

  unsigned long currentTimestamp = getTimestampMillis();
  if (currentTimestamp < 1000000000000ULL) return; // Wait for valid time

  StaticJsonDocument<512> doc;
  doc["feedWeightGrams"] = feedWt;
  doc["targetFeedGrams"] = targetFeed;
  doc["hopperLevelPercent"] = hopper;
  doc["waterLow"] = wLow;
  doc["waterHigh"] = wHigh;
  doc["pumpActive"] = pump;
  doc["feedingActive"] = feeding;
  doc["emergencyStopActive"] = estop;
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
      eventName != "WATER_PUMP_TIMEOUT" && eventName != "EMERGENCY_STOP" &&
      eventName != "DEVICE_ERROR") {
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
