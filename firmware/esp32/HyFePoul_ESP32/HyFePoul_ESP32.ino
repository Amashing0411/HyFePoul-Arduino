#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include "Config.h"

String idToken = "";
String localId = ""; // deviceAuthUid
unsigned long tokenExpirationMillis = 0;

String megaReceiveBuffer = "";

// Time management
const char* ntpServer = "pool.ntp.org";
const long  gmtOffset_sec = 0;
const int   daylightOffset_sec = 0;

// Command Management
String activeCommandId = "";
String activeCommandStatus = "";
unsigned long activeCommandStartMillis = 0;
const unsigned long UART_ACK_TIMEOUT = 3000;
const unsigned long UART_EXEC_TIMEOUT = 120000;

void setup() {
  Serial.begin(115200);
  MEGA_SERIAL.begin(MEGA_BAUD_RATE, SERIAL_8N1, MEGA_RX_PIN, MEGA_TX_PIN);

  Serial.println("HyFePoul ESP32 Bridge Starting...");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected.");

  // Init NTP
  configTime(gmtOffset_sec, daylightOffset_sec, ntpServer);
  
  // Initial Auth
  authenticateFirebase();
}

void loop() {
  // 1. Maintain Firebase Auth Token
  if (millis() > tokenExpirationMillis && tokenExpirationMillis != 0) {
    authenticateFirebase();
  }

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

  // 3. Optional: Periodic Heartbeat independent of Mega (if needed)
  static unsigned long lastHeartbeat = 0;
  if (millis() - lastHeartbeat >= 30000UL) {
    sendHeartbeat();
    sendNetworkTimeToMega();
    lastHeartbeat = millis();
  }

  // 4. Poll and manage Remote Commands
  static unsigned long lastCommandPoll = 0;
  if (millis() - lastCommandPoll >= 5000UL) {
    pollCommands();
    lastCommandPoll = millis();
  }
  
  checkCommandTimeout();
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
  if(!getLocalTime(&timeinfo)){
    return;
  }
  char timeStr[50];
  strftime(timeStr, sizeof(timeStr), "TIME|%Y-%m-%d|%H:%M:%S", &timeinfo);
  MEGA_SERIAL.println(timeStr);
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
  return String("https://") + FIREBASE_PROJECT_ID + "-default-rtdb.firebaseio.com/" + path + "?auth=" + idToken;
}

void authenticateFirebase() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  Serial.println("Authenticating with Firebase...");
  
  HTTPClient http;
  http.begin(getAuthUrl());
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<200> doc;
  doc["email"] = FIREBASE_AUTH_EMAIL;
  doc["password"] = FIREBASE_AUTH_PASSWORD;
  doc["returnSecureToken"] = true;

  String requestBody;
  serializeJson(doc, requestBody);

  int httpCode = http.POST(requestBody);
  if (httpCode == 200) {
    String payload = http.getString();
    StaticJsonDocument<512> responseDoc;
    deserializeJson(responseDoc, payload);
    
    idToken = responseDoc["idToken"].as<String>();
    localId = responseDoc["localId"].as<String>(); // deviceAuthUid
    long expiresIn = responseDoc["expiresIn"].as<long>();
    
    // Refresh 5 minutes before expiry
    tokenExpirationMillis = millis() + (expiresIn - 300) * 1000UL;
    
    Serial.println("Auth successful. UID: " + localId);
    
    // Send status to RTDB
    sendHeartbeat();
  } else {
    Serial.print("Auth failed. Code: ");
    Serial.println(httpCode);
    Serial.println(http.getString());
    tokenExpirationMillis = millis() + 30000; // Retry in 30s
  }
  http.end();
}

// ---------------------------------------------------------
// Mega Protocol Parser
// ---------------------------------------------------------
void processMegaLine(String line) {
  line.trim();
  if (line.length() == 0) return;

  Serial.print("Mega TX: ");
  Serial.println(line);

  // DATA|feedWeight|hopperLevel|waterLow|waterHigh|pump|feeding|emergencyStop|timeSourceString
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
    sendEventToFirebase(eventName);
  }
  else if (line.startsWith("CMD_ACK|")) {
    // CMD_ACK|ID:<id>|STATUS:<status>|REASON:<reason>
    String id = extractValue(line, "ID:");
    String status = extractValue(line, "STATUS:");
    String reason = extractValue(line, "REASON:");
    
    if (id == activeCommandId) {
      if (status == "ACCEPTED") {
        activeCommandStatus = "executing";
        updateCommandStatus(id, "executing", "");
      } else if (status == "REJECTED") {
        updateCommandStatus(id, "failed", reason.length() > 0 ? reason : "REJECTED_BY_MEGA");
        activeCommandId = "";
      }
    }
  }
  else if (line.startsWith("CMD_DONE|")) {
    // CMD_DONE|ID:<id>|STATUS:<status>|REASON:<reason>
    String id = extractValue(line, "ID:");
    String status = extractValue(line, "STATUS:");
    String reason = extractValue(line, "REASON:");
    
    if (id == activeCommandId) {
      if (status == "SUCCESS") {
        updateCommandStatus(id, "completed", "");
      } else {
        updateCommandStatus(id, "failed", reason.length() > 0 ? reason : "FAILED_DURING_EXECUTION");
      }
      activeCommandId = "";
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
  http.begin(getDatabaseUrl((String("devices/") + DEVICE_ID + "/status.json").c_str()));
  http.addHeader("Content-Type", "application/json");
  http.PUT("\"online\"");
  http.end();

  // 2. Update lastHeartbeat
  http.begin(getDatabaseUrl((String("devices/") + DEVICE_ID + "/lastHeartbeat.json").c_str()));
  http.addHeader("Content-Type", "application/json");
  http.PUT(String(currentTimestamp));
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
  http.begin(getDatabaseUrl((String("devices/") + DEVICE_ID + "/state.json").c_str()));
  http.addHeader("Content-Type", "application/json");
  int code = http.PUT(payload);
  http.end();

  if (code == 200) {
    // 2. Append to history (systemData)
    http.begin(getDatabaseUrl((String("systemData/") + DEVICE_ID + ".json").c_str()));
    http.addHeader("Content-Type", "application/json");
    http.POST(payload);
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
  http.begin(getDatabaseUrl((String("alerts/") + DEVICE_ID + "/" + eventName + ".json").c_str()));
  http.addHeader("Content-Type", "application/json");
  http.PUT(payload); // Changed from POST to PUT for idempotency
  http.end();
}

// ---------------------------------------------------------
// Remote Command Processing
// ---------------------------------------------------------
void pollCommands() {
  if (idToken == "" || WiFi.status() != WL_CONNECTED) return;
  
  // We only poll for new commands if we aren't busy.
  if (activeCommandId != "") return;

  unsigned long currentTimestamp = getTimestampMillis();
  if (currentTimestamp < 1000000000000ULL) return; // NTP not synced

  HTTPClient http;
  // Use the indexOn "status" to fetch only queued commands efficiently
  String url = String(FIREBASE_USE_EMULATOR ? "http://" + EMULATOR_HOST + ":" + EMULATOR_RTDB_PORT : "https://" + FIREBASE_PROJECT_ID + "-default-rtdb.firebaseio.com") 
               + "/commands/" + DEVICE_ID + ".json"
               + "?orderBy=\"status\"&equalTo=\"queued\""
               + (FIREBASE_USE_EMULATOR ? "&ns=" + FIREBASE_PROJECT_ID + "-default-rtdb" : "")
               + "&auth=" + idToken;
               
  http.begin(url);
  int httpCode = http.GET();
  
  if (httpCode == 200) {
    String payload = http.getString();
    if (payload != "null" && payload.length() > 2) {
      DynamicJsonDocument doc(2048);
      DeserializationError error = deserializeJson(doc, payload);
      
      if (!error) {
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
              commandName != "SYSTEM_RESTART" && commandName != "STATUS_REQ") {
            continue; // Not whitelisted
          }

          // Check stale
          if (currentTimestamp > createdAt && (currentTimestamp - createdAt) > 300000UL) {
            updateCommandStatus(cmdId, "failed", "STALE_COMMAND");
            continue;
          }

          // Accept it
          if (updateCommandStatus(cmdId, "acknowledged", "")) {
            activeCommandId = cmdId;
            activeCommandStatus = "acknowledged";
            activeCommandStartMillis = millis();
            
            // Transport to UART
            String paramsStr = "";
            if (cmd.containsKey("parameters")) {
               JsonObject params = cmd["parameters"].as<JsonObject>();
               if (commandName == "MANUAL_FEED" && params.containsKey("targetGrams")) {
                 paramsStr = "|TARGET:" + params["targetGrams"].as<String>();
               }
            }
            MEGA_SERIAL.print("CMD|ID:" + cmdId + "|ACTION:" + commandName + paramsStr + "\n");
          }
          break; // Process one command at a time
        }
      }
    }
  }
  http.end();
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
  http.begin(getDatabaseUrl((String("commands/") + DEVICE_ID + "/" + cmdId + ".json").c_str()));
  http.addHeader("Content-Type", "application/json");
  int code = http.PATCH(payload); // Using PATCH to avoid overwriting the whole command
  http.end();
  
  return (code == 200);
}

void checkCommandTimeout() {
  if (activeCommandId == "") return;

  if (activeCommandStatus == "acknowledged") {
    if (millis() - activeCommandStartMillis > UART_ACK_TIMEOUT) {
      updateCommandStatus(activeCommandId, "failed", "UART_TIMEOUT");
      activeCommandId = "";
    }
  } else if (activeCommandStatus == "executing") {
    if (millis() - activeCommandStartMillis > UART_EXEC_TIMEOUT) {
      updateCommandStatus(activeCommandId, "failed", "EXECUTION_TIMEOUT");
      activeCommandId = "";
    }
  }
}
