/*
  ESP32Communication.ino

  PLACEHOLDER / INTERFACE FILE.

  All actual Wi-Fi, Internet, backend, authentication and notification
  implementation belongs to the ESP32/backend side.

  Mega responsibilities:
    - Send local sensor/system data.
    - Send events/alerts.
    - Receive validated network time from ESP32.
    - Optionally receive future configuration commands.

  Proposed architecture:
    Mega -> ESP32 -> Wi-Fi -> Internet -> Backend -> Application

  Proposed packet examples:
    TIME|2026-09-18|19:30:00
    STATUS|ONLINE
    STATUS|OFFLINE
    DATA|feedWeight|hopperLevel|waterLow|waterHigh|pump|feeding
    EVENT|LOW_FEED
*/

String esp32ReceiveBuffer = "";

void handleESP32Communication() {
  receiveESP32Messages();

  // Send periodic sensor/status data.
  static unsigned long lastDataSendMillis = 0;

  if (millis() - lastDataSendMillis >= 10000UL) {
    sendCurrentDataToESP32();
    lastDataSendMillis = millis();
  }

  // If an alert was queued, send it once.
  if (pendingAlertEvent.length() > 0) {
    sendEventToESP32(pendingAlertEvent);
    pendingAlertEvent = "";
  }
}

void receiveESP32Messages() {
  while (ESP32_SERIAL.available()) {
    char incoming = ESP32_SERIAL.read();

    if (incoming == '\n') {
      processESP32Line(esp32ReceiveBuffer);
      esp32ReceiveBuffer = "";
    } else if (incoming != '\r') {
      esp32ReceiveBuffer += incoming;

      // Prevent runaway buffer growth.
      if (esp32ReceiveBuffer.length() > 200) {
        esp32ReceiveBuffer = "";
      }
    }
  }
}

void processESP32Line(String line) {
  line.trim();

  if (line.length() == 0) {
    return;
  }

  lastESP32MessageMillis = millis();
  esp32Online = true;

  Serial.print(F("ESP32 RX: "));
  Serial.println(line);

  if (line.startsWith("TIME|")) {
    int firstSeparator = line.indexOf('|');
    int secondSeparator = line.indexOf('|', firstSeparator + 1);

    if (firstSeparator > 0 && secondSeparator > firstSeparator) {
      String datePart =
          line.substring(firstSeparator + 1, secondSeparator);
      String timePart =
          line.substring(secondSeparator + 1);

      processNetworkTime(datePart, timePart);
    }

    return;
  }

  if (line.startsWith("CMD|")) {
    processRemoteCommand(line);
    return;
  }

  if (line == "STATUS|ONLINE") {
    esp32Online = true;
    return;
  }

  if (line == "STATUS|OFFLINE") {
    esp32Online = false;
    return;
  }

  // PLACEHOLDER:
  // Future remote configuration commands can be handled here.
  // Example:
  // SET_FEED|1|07:30|500
  // ENABLE_FEED|1
  // DISABLE_FEED|1
}

void sendCurrentDataToESP32() {
  ESP32_SERIAL.print(F("DATA|"));
  ESP32_SERIAL.print(currentFeedWeightGrams, 1);
  ESP32_SERIAL.print('|');
  ESP32_SERIAL.print(activeFeedTargetGrams, 1);
  ESP32_SERIAL.print('|');
  ESP32_SERIAL.print(currentHopperLevelPercent, 1);
  ESP32_SERIAL.print('|');
  ESP32_SERIAL.print(waterLow ? 1 : 0);
  ESP32_SERIAL.print('|');
  ESP32_SERIAL.print(waterHigh ? 1 : 0);
  ESP32_SERIAL.print('|');
  ESP32_SERIAL.print(waterPumpActive ? 1 : 0);
  ESP32_SERIAL.print('|');
  ESP32_SERIAL.print(feedingActive ? 1 : 0);
  ESP32_SERIAL.print('|');
  ESP32_SERIAL.print(emergencyStopActive ? 1 : 0);
  ESP32_SERIAL.print('|');
  ESP32_SERIAL.print(getTimeSourceString());
  ESP32_SERIAL.println();
}

void sendEventToESP32(const String& eventName) {
  ESP32_SERIAL.print(F("EVENT|"));
  ESP32_SERIAL.println(eventName);

  Serial.print(F("ESP32 EVENT TX: "));
  Serial.println(eventName);
}

void queueAlertEvent(const String& eventName) {
  pendingAlertEvent = eventName;
}

String extractMegaValue(String line, String key) {
  int keyIndex = line.indexOf(key);
  if (keyIndex == -1) return "";
  int valStart = keyIndex + key.length();
  int valEnd = line.indexOf('|', valStart);
  if (valEnd == -1) valEnd = line.length();
  return line.substring(valStart, valEnd);
}

void processRemoteCommand(String line) {
  // CMD|ID:<id>|ACTION:<command>|TARGET:<grams>
  String cmdId = extractMegaValue(line, "ID:");
  String action = extractMegaValue(line, "ACTION:");
  
  if (cmdId == "" || action == "") {
    if (cmdId != "") {
      sendCmdAck(cmdId, "REJECTED", "MALFORMED");
    }
    return;
  }

  // Duplicate check
  if (activeRemoteCommandId != "" && activeRemoteCommandId == cmdId) {
    sendCmdAck(cmdId, "REJECTED", "DUPLICATE_ID");
    return;
  }
  
  // Busy check
  if (activeRemoteCommandId != "") {
    sendCmdAck(cmdId, "REJECTED", "SYSTEM_BUSY");
    return;
  }
  
  if (action == "MANUAL_FEED") {
    String targetStr = extractMegaValue(line, "TARGET:");
    if (targetStr == "") {
      sendCmdAck(cmdId, "REJECTED", "MISSING_TARGET");
      return;
    }
    float targetGrams = targetStr.toFloat();
    if (targetGrams <= 0 || targetGrams > 5000.0) { 
      sendCmdAck(cmdId, "REJECTED", "INVALID_TARGET");
      return;
    }
    
    if (emergencyStopActive) {
      sendCmdAck(cmdId, "REJECTED", "ESTOP_ACTIVE");
      return;
    }
    
    if (feedingActive) {
      sendCmdAck(cmdId, "REJECTED", "FEEDING_ACTIVE");
      return;
    }
    
    activeRemoteCommandId = cmdId;
    sendCmdAck(cmdId, "ACCEPTED", "");
    
    startRemoteFeeding(targetGrams);
  }
  else if (action == "ESTOP_RELEASE") {
    if (digitalRead(EMERGENCY_STOP_PIN) == LOW) {
      sendCmdAck(cmdId, "REJECTED", "PHYSICAL_ESTOP_ENGAGED");
      return;
    }
    
    if (!emergencyStopActive) {
      sendCmdAck(cmdId, "REJECTED", "ESTOP_NOT_ACTIVE");
      return;
    }
    
    activeRemoteCommandId = cmdId;
    sendCmdAck(cmdId, "ACCEPTED", "");
    
    emergencyStopActive = false;
    Serial.println(F("Emergency stop released by remote."));
    logEventToSD("EMERGENCY_STOP_RELEASED_REMOTE");
    
    sendCmdDone(cmdId, "SUCCESS", "");
    activeRemoteCommandId = "";
  }
  else if (action == "SYSTEM_RESTART") {
    sendCmdAck(cmdId, "REJECTED", "NOT_IMPLEMENTED_SAFELY");
  }
  else if (action == "STATUS_REQ") {
    activeRemoteCommandId = cmdId;
    sendCmdAck(cmdId, "ACCEPTED", "");
    
    sendCurrentDataToESP32();
    
    sendCmdDone(cmdId, "SUCCESS", "");
    activeRemoteCommandId = "";
  }
  else if (action == "SCHEDULE_SET") {
    String idxStr = extractMegaValue(line, "IDX:");
    String hrStr = extractMegaValue(line, "HR:");
    String minStr = extractMegaValue(line, "MIN:");
    String tgtStr = extractMegaValue(line, "TGT:");
    String enStr = extractMegaValue(line, "EN:");
    
    if (idxStr == "" || hrStr == "" || minStr == "" || tgtStr == "" || enStr == "") {
      sendCmdAck(cmdId, "REJECTED", "MALFORMED_SCHEDULE");
      return;
    }
    
    int idx = idxStr.toInt();
    int hr = hrStr.toInt();
    int mn = minStr.toInt();
    float tgt = tgtStr.toFloat();
    bool en = (enStr == "1" || enStr == "true");
    
    if (idx < 0 || idx >= FEED_SCHEDULE_COUNT) {
      sendCmdAck(cmdId, "REJECTED", "INVALID_INDEX");
      return;
    }
    if (hr < 0 || hr > 23 || mn < 0 || mn > 59) {
      sendCmdAck(cmdId, "REJECTED", "INVALID_TIME");
      return;
    }
    if (tgt <= 0 || tgt > 5000.0) {
      sendCmdAck(cmdId, "REJECTED", "INVALID_TARGET");
      return;
    }
    
    feedSchedules[idx].hour = hr;
    feedSchedules[idx].minute = mn;
    feedSchedules[idx].targetGrams = tgt;
    feedSchedules[idx].enabled = en;
    
    activeRemoteCommandId = cmdId;
    sendCmdAck(cmdId, "ACCEPTED", "");
    
    Serial.print(F("Remote schedule set: ["));
    Serial.print(idx);
    Serial.print(F("] "));
    Serial.print(hr);
    Serial.print(F(":"));
    Serial.print(mn);
    Serial.print(F(" Target: "));
    Serial.print(tgt);
    Serial.print(F(" Enabled: "));
    Serial.println(en);
    
    sendCmdDone(cmdId, "SUCCESS", "");
    activeRemoteCommandId = "";
  }
  else {
    sendCmdAck(cmdId, "REJECTED", "UNKNOWN_COMMAND");
  }
}

void sendCmdAck(String id, String status, String reason) {
  ESP32_SERIAL.print(F("CMD_ACK|ID:"));
  ESP32_SERIAL.print(id);
  ESP32_SERIAL.print(F("|STATUS:"));
  ESP32_SERIAL.print(status);
  if (reason.length() > 0) {
    ESP32_SERIAL.print(F("|REASON:"));
    ESP32_SERIAL.print(reason);
  }
  ESP32_SERIAL.println();
}

void sendCmdDone(String id, String status, String reason) {
  ESP32_SERIAL.print(F("CMD_DONE|ID:"));
  ESP32_SERIAL.print(id);
  ESP32_SERIAL.print(F("|STATUS:"));
  ESP32_SERIAL.print(status);
  if (reason.length() > 0) {
    ESP32_SERIAL.print(F("|REASON:"));
    ESP32_SERIAL.print(reason);
  }
  ESP32_SERIAL.println();
}
