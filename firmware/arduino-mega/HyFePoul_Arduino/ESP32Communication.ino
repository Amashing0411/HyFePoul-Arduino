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
