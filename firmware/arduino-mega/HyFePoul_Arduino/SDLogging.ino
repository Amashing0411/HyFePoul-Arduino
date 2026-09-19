/*
  SDLogging.ino

  Logs system information in CSV format.

  Excel compatibility:
    Arduino writes CSV rather than native .xlsx.
    Microsoft Excel can open the CSV directly.

  Log columns:
    Timestamp,
    FeedWeight_g,
    HopperLevel_Percent,
    WaterLow,
    WaterHigh,
    PumpStatus,
    FeedingStatus,
    TargetFeed_g,
    EmergencyStop,
    DeviceStatus,
    ESP32Status,
    TimeSource,
    AlertEvent
*/

const char* LOG_FILE_NAME = "HYFEPOUL.CSV";

void initializeSD() {
  if (!SD.begin(SD_CS_PIN)) {
    sdAvailable = false;
    Serial.println(F("WARNING: SD card initialization failed."));
    return;
  }

  sdAvailable = true;
  Serial.println(F("SD card ready."));

  createCSVHeader();
}

void createCSVHeader() {
  if (!sdAvailable) {
    return;
  }

  if (!SD.exists(LOG_FILE_NAME)) {
    File file = SD.open(LOG_FILE_NAME, FILE_WRITE);

    if (file) {
      file.println(
        F("Timestamp,FeedWeight_g,HopperLevel_Percent,WaterLow,"
          "WaterHigh,PumpStatus,FeedingStatus,TargetFeed_g,"
          "EmergencyStop,DeviceStatus,ESP32Status,TimeSource,AlertEvent")
      );
      file.close();
    }
  }
}

void handleSDLogging() {
  if (!sdAvailable) {
    return;
  }

  if (millis() - lastSDLogMillis >= SD_LOG_INTERVAL_MS) {
    logCurrentSystemData("");
    lastSDLogMillis = millis();
  }
}

void logCurrentSystemData(const String& alertEvent) {
  if (!sdAvailable) {
    return;
  }

  File file = SD.open(LOG_FILE_NAME, FILE_WRITE);

  if (!file) {
    Serial.println(F("WARNING: Could not open SD log file."));
    return;
  }

  DateTime now = getCurrentDateTime();

  file.print(formatTimestamp(now));
  file.print(',');
  file.print(currentFeedWeightGrams, 1);
  file.print(',');
  file.print(currentHopperLevelPercent, 1);
  file.print(',');
  file.print(waterLow ? 1 : 0);
  file.print(',');
  file.print(waterHigh ? 1 : 0);
  file.print(',');
  file.print(waterPumpActive ? 1 : 0);
  file.print(',');
  file.print(feedingActive ? 1 : 0);
  file.print(',');
  file.print(activeFeedTargetGrams, 1);
  file.print(',');
  file.print(emergencyStopActive ? 1 : 0);
  file.print(',');
  file.print(getSystemStatusText());
  file.print(',');
  file.print(esp32Online ? 1 : 0);
  file.print(',');
  file.print(getTimeSourceString());
  file.print(',');

  // Current events should not contain commas.
  file.println(alertEvent);

  file.close();
}

void logEventToSD(const String& eventName) {
  logCurrentSystemData(eventName);
}

String formatTimestamp(const DateTime& dateTime) {
  char buffer[20];

  snprintf(buffer, sizeof(buffer),
           "%04d-%02d-%02d %02d:%02d:%02d",
           dateTime.year(),
           dateTime.month(),
           dateTime.day(),
           dateTime.hour(),
           dateTime.minute(),
           dateTime.second());

  return String(buffer);
}
