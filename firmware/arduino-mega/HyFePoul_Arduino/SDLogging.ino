/*
  SDLogging.ino

  Logs system information in CSV format.

  Excel compatibility:
    Arduino writes CSV rather than native .xlsx.
    Microsoft Excel can open the CSV directly.

  One file per local month: HFyyyymm.CSV (for example HF202610.CSV for
  October 2026), each with its own header. About 0.3 MB per day at one row
  every 30 s plus events, so roughly 9 MB and 90,000 rows per month, which
  Excel opens easily. When a new month starts, files from 24 or more months
  ago are deleted; if a write still fails (card full), the oldest month is
  deleted and the write retried once. Only files matching HFyyyymm.CSV are
  ever deleted. Rows written while the clock is not set go to HFNOTIME.CSV.
  Use an 8-32 GB microSD card formatted FAT32 (the SD library cannot read
  exFAT, which larger cards use).

  Log columns:
    Timestamp (local time, UTC+8),
    FeedTotal_g,
    Tray1_g .. Tray5_g,
    HopperLevel_Percent,
    WaterLow,
    FeedingStatus,
    CycleStep,
    CurrentTray,
    TargetPerTray_g,
    EmergencyStop,
    DeviceStatus,
    ESP32Status,
    TimeSource,
    AlertEvent
*/

const uint8_t LOG_KEEP_MONTHS = 24;
char currentLogName[13] = "";  // "HFyyyymm.CSV"

void initializeSD() {
  if (!SD.begin(SD_CS_PIN)) {
    sdAvailable = false;
    Serial.println(F("WARNING: SD card initialization failed."));
    return;
  }

  sdAvailable = true;
  Serial.println(F("SD card ready."));
}

// Month index (year * 12 + month - 1) of an "HFyyyymm.CSV" name, or -1.
long logMonthIndex(const char* name) {
  if (strlen(name) != 12 || strncmp(name, "HF", 2) != 0 || strcmp(name + 8, ".CSV") != 0) {
    return -1;
  }
  for (uint8_t i = 2; i < 8; i++) {
    if (name[i] < '0' || name[i] > '9') return -1;
  }
  long year = (name[2] - '0') * 1000L + (name[3] - '0') * 100 + (name[4] - '0') * 10 + (name[5] - '0');
  long month = (name[6] - '0') * 10 + (name[7] - '0');
  if (month < 1 || month > 12) return -1;
  return year * 12 + month - 1;
}

// Picks this month's file name (local time) and opens a new month's file
// with its header. Called before every write.
void selectLogFile() {
  char name[13];
  if (currentTimeSource == TIME_SOURCE_INVALID) {
    strcpy(name, "HFNOTIME.CSV");
  } else {
    DateTime local = getLocalDateTime();
    snprintf(name, sizeof(name), "HF%04d%02d.CSV", local.year(), local.month());
  }

  if (strcmp(name, currentLogName) == 0) {
    return;
  }
  strcpy(currentLogName, name);

  if (!SD.exists(currentLogName)) {
    // A new month: drop files that are now too old, then start the file.
    pruneOldLogs(logMonthIndex(currentLogName), false);
    File file = SD.open(currentLogName, FILE_WRITE);
    if (file) {
      file.println(
        F("Timestamp_Local,FeedTotal_g,Tray1_g,Tray2_g,Tray3_g,Tray4_g,Tray5_g,"
          "HopperLevel_Percent,WaterLow,FeedingStatus,CycleStep,"
          "CurrentTray,TargetPerTray_g,EmergencyStop,DeviceStatus,"
          "ESP32Status,TimeSource,AlertEvent")
      );
      file.close();
    }
  }
}

// Deletes monthly log files older than LOG_KEEP_MONTHS before currentIndex.
// With oldestOnly, deletes just the single oldest monthly file other than the
// current one (the card-full fallback). Returns true if a file was deleted.
bool pruneOldLogs(long currentIndex, bool oldestOnly) {
  if (currentIndex < 0 && !oldestOnly) return false;

  File root = SD.open("/");
  if (!root) return false;

  char oldest[13] = "";
  long oldestIndex = 0x7FFFFFFFL;
  bool deleted = false;

  while (true) {
    feedWatchdog(); // a card full of files can take a while to list
    File entry = root.openNextFile();
    if (!entry) break;
    char name[13];
    strncpy(name, entry.name(), sizeof(name) - 1);
    name[sizeof(name) - 1] = '\0';
    bool isDir = entry.isDirectory();
    entry.close();
    if (isDir) continue;

    long idx = logMonthIndex(name);
    if (idx < 0 || strcmp(name, currentLogName) == 0) continue;

    if (oldestOnly) {
      if (idx < oldestIndex) {
        oldestIndex = idx;
        strcpy(oldest, name);
      }
    } else if (idx <= currentIndex - LOG_KEEP_MONTHS) {
      deleted |= SD.remove(name);
      Serial.print(F("SD: removed old log "));
      Serial.println(name);
    }
  }
  root.close();

  if (oldestOnly && oldest[0] != '\0') {
    deleted = SD.remove(oldest);
    Serial.print(F("SD full? removed oldest log "));
    Serial.println(oldest);
  }
  return deleted;
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

  selectLogFile();
  File file = SD.open(currentLogName, FILE_WRITE);

  if (!file) {
    // Card full or a write error: free the oldest month and retry once.
    if (pruneOldLogs(-1, true)) {
      file = SD.open(currentLogName, FILE_WRITE);
    }
    if (!file) {
      Serial.println(F("WARNING: Could not open SD log file."));
      return;
    }
  }

  DateTime now = getLocalDateTime();

  file.print(formatTimestamp(now));
  file.print(',');
  file.print(currentFeedWeightGrams, 1);
  file.print(',');
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    file.print(trayWeightsGrams[i], 1);
    file.print(',');
  }
  file.print(currentHopperLevelPercent, 1);
  file.print(',');
  file.print(waterLow ? 1 : 0);
  file.print(',');
  file.print(feedingActive ? 1 : 0);
  file.print(',');
  file.print(getCycleStepName(cycleStep));
  file.print(',');
  file.print(currentTray);
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
