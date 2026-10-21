/*
  Nextion.ino

  PLACEHOLDER interface for the 7-inch Nextion display.

  Component names below are examples only.
  Confirm the actual Nextion component/page names and IDs.

  Example components:
    tFeed
    tHopper
    tWater
    tStatus
    tTime
    tNetwork
*/

void updateNextion() {
  static unsigned long lastNextionUpdate = 0;
  static uint8_t nextField = 0;

  // One field per update: a single field fits in Serial2's 64-byte transmit
  // buffer, so the write does not block. Writing all six at once (~130 bytes
  // at 9600 baud) blocked for ~70 ms, during which the ESP32 UART was not
  // read. Each field still refreshes about every 600 ms.
  if (millis() - lastNextionUpdate < 100UL) {
    return;
  }

  lastNextionUpdate = millis();

  switch (nextField) {
    case 0: setNextionText("tFeed", String(currentFeedWeightGrams, 1) + " g"); break;
    case 1: setNextionText("tHopper", String(currentHopperLevelPercent, 0) + "%"); break;
    case 2: setNextionText("tWater", getWaterStatusText()); break;
    case 3: setNextionText("tStatus", getSystemStatusText()); break;
    case 4: setNextionText("tTime", getCurrentTimeText()); break;
    default: setNextionText("tNetwork", esp32Online ? "ONLINE" : "OFFLINE"); break;
  }

  nextField = (nextField + 1) % 6;

  // PLACEHOLDER:
  // Add actual page/button event handling once the final Nextion HMI
  // design and component IDs are available.
}

void setNextionText(const String& component, const String& value) {
  NEXTION_SERIAL.print(component);
  NEXTION_SERIAL.print(F(".txt=\""));
  NEXTION_SERIAL.print(value);
  NEXTION_SERIAL.print(F("\""));

  sendNextionCommandTerminator();
}

void sendNextionCommandTerminator() {
  NEXTION_SERIAL.write(0xFF);
  NEXTION_SERIAL.write(0xFF);
  NEXTION_SERIAL.write(0xFF);
}

String getWaterStatusText() {
  if (emergencyStopActive) {
    return "EMERGENCY STOP";
  }

  if (waterHigh) {
    return "FULL";
  }

  if (waterLow) {
    return "LOW";
  }

  return "NORMAL";
}

String getSystemStatusText() {
  if (emergencyStopActive) {
    return "STOPPED";
  }

  if (feedingActive) {
    return "FEEDING";
  }

  if (waterPumpActive) {
    return "WATER PUMP";
  }

  return "NORMAL";
}

String getCurrentTimeText() {
  DateTime now = getLocalDateTime();

  char buffer[9];
  snprintf(buffer, sizeof(buffer), "%02d:%02d:%02d",
           now.hour(), now.minute(), now.second());

  return String(buffer);
}
