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

  if (millis() - lastNextionUpdate < 500UL) {
    return;
  }

  lastNextionUpdate = millis();

  setNextionText("tFeed", String(currentFeedWeightGrams, 1) + " g");
  setNextionText("tHopper", String(currentHopperLevelPercent, 0) + "%");
  setNextionText("tWater", getWaterStatusText());
  setNextionText("tStatus", getSystemStatusText());
  setNextionText("tTime", getCurrentTimeText());
  setNextionText("tNetwork", esp32Online ? "ONLINE" : "OFFLINE");

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
  DateTime now = getCurrentDateTime();

  char buffer[9];
  snprintf(buffer, sizeof(buffer), "%02d:%02d:%02d",
           now.hour(), now.minute(), now.second());

  return String(buffer);
}
