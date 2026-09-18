/*
  TimeManager.ino

  Normal operation:
    ESP32 obtains time from Internet/NTP and sends valid time to Mega.

  Fallback:
    Mega continues using its RTC when ESP32/network time is unavailable.

  IMPORTANT:
    The Internet itself is not directly connected to the Mega's clock.
    The ESP32 obtains NTP time, then synchronizes the Mega's RTC.
*/

void initializeRTC() {
  if (!rtc.begin()) {
    rtcValid = false;
    currentTimeSource = TIME_SOURCE_INVALID;
    Serial.println(F("WARNING: RTC not detected."));
    return;
  }

  rtcValid = true;

  if (rtc.lostPower()) {
    // Do NOT silently assume this is the correct deployment time.
    // This is only a temporary fallback so the RTC has a valid DateTime.
    Serial.println(F("WARNING: RTC lost power."));
    Serial.println(F("RTC will require network time or manual setting."));
  } else {
    currentTimeSource = TIME_SOURCE_RTC;
  }
}

void updateTimeManager() {
  // Check whether the ESP32 is still communicating.
  if (millis() - lastESP32MessageMillis > ESP32_TIMEOUT_MS) {
    esp32Online = false;
  }

  // Network time is considered valid only when a valid TIME packet
  // has recently been received.
  if (networkTimeValid &&
      (millis() - lastNetworkTimeMillis <= ESP32_TIME_SYNC_INTERVAL_MS)) {
    currentTimeSource = TIME_SOURCE_NETWORK;
  } else if (rtcValid) {
    currentTimeSource = TIME_SOURCE_RTC;
  } else {
    currentTimeSource = TIME_SOURCE_INVALID;
  }
}

DateTime getCurrentDateTime() {
  // Both sources ultimately use the Mega RTC.
  // ESP32 network time periodically updates the RTC.
  if (rtcValid) {
    return rtc.now();
  }

  // No valid RTC.
  // Return a compile-time fallback rather than inventing a timestamp.
  currentTimeSource = TIME_SOURCE_INVALID;
  return DateTime(F(__DATE__), F(__TIME__));
}

void processNetworkTime(const String& datePart, const String& timePart) {
  int year, month, day;
  int hour, minute, second;

  if (!parseDate(datePart, year, month, day) ||
      !parseTime(timePart, hour, minute, second)) {
    Serial.println(F("Invalid network time packet."));
    return;
  }

  if (year < 2024 || month < 1 || month > 12 ||
      day < 1 || day > 31 ||
      hour < 0 || hour > 23 ||
      minute < 0 || minute > 59 ||
      second < 0 || second > 59) {
    Serial.println(F("Rejected invalid network time."));
    return;
  }

  if (rtcValid) {
    rtc.adjust(DateTime(year, month, day, hour, minute, second));
    networkTimeValid = true;
    lastNetworkTimeMillis = millis();
    currentTimeSource = TIME_SOURCE_NETWORK;

    Serial.println(F("RTC synchronized from ESP32 network time."));
  }
}

bool parseDate(const String& value, int& year, int& month, int& day) {
  if (value.length() != 10) {
    return false;
  }

  if (value.charAt(4) != '-' || value.charAt(7) != '-') {
    return false;
  }

  year = value.substring(0, 4).toInt();
  month = value.substring(5, 7).toInt();
  day = value.substring(8, 10).toInt();

  return true;
}

bool parseTime(const String& value, int& hour, int& minute, int& second) {
  if (value.length() != 8) {
    return false;
  }

  if (value.charAt(2) != ':' || value.charAt(5) != ':') {
    return false;
  }

  hour = value.substring(0, 2).toInt();
  minute = value.substring(3, 5).toInt();
  second = value.substring(6, 8).toInt();

  return true;
}

String getTimeSourceString() {
  switch (currentTimeSource) {
    case TIME_SOURCE_NETWORK:
      return "NETWORK";
    case TIME_SOURCE_RTC:
      return "RTC";
    default:
      return "INVALID";
  }
}
