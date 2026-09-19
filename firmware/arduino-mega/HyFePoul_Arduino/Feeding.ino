/*
  Feeding.ino
  Automated feed dispensing.

  The load cell is assumed to measure the feed being dispensed.
  Confirm the physical load-cell arrangement before final testing.
*/

void handleFeeding() {
  if (emergencyStopActive) {
    if (feedingActive) {
      stopFeeding("EMERGENCY_STOP");
    }
    return;
  }

  checkScheduledFeeding();

  if (feedingActive) {
    runActiveFeeding();
  }
}

void checkScheduledFeeding() {
  DateTime now = getCurrentDateTime();

  for (uint8_t i = 0; i < FEED_SCHEDULE_COUNT; i++) {
    if (!feedSchedules[i].enabled) {
      continue;
    }

    if (now.hour() == feedSchedules[i].hour &&
        now.minute() == feedSchedules[i].minute) {

      // Prevent duplicate execution during the same minute.
      if (lastExecutedFeedIndex != i) {
        startFeeding(i);
      }
    }
  }

  // Reset the schedule index after the minute has passed.
  if (now.minute() != 0 &&
      now.minute() != 59) {
    // Do not reset here because multiple schedules can occur.
    // The daily/date-aware reset is handled below.
  }

  static int lastDay = -1;
  if (lastDay != now.day()) {
    lastExecutedFeedIndex = -1;
    lastDay = now.day();
  }
}

void startFeeding(uint8_t scheduleIndex) {
  if (scheduleIndex >= FEED_SCHEDULE_COUNT) {
    return;
  }

  if (emergencyStopActive) {
    return;
  }

  activeFeedTargetGrams = feedSchedules[scheduleIndex].targetGrams;
  feedingActive = true;
  feedingCompleted = false;
  feedingStartMillis = millis();
  lastExecutedFeedIndex = scheduleIndex;

  // Reset/prepare the scale.
  if (scale.is_ready()) {
    scale.tare();
    currentFeedWeightGrams = 0.0f;
  }

  digitalWrite(DISPENSER_RELAY_PIN, HIGH); // PLACEHOLDER: confirm relay logic.

  Serial.print(F("FEED START | Target: "));
  Serial.print(activeFeedTargetGrams);
  Serial.println(F(" g"));

  logEventToSD("FEEDING_STARTED");
  queueAlertEvent("FEEDING_STARTED");
}

void runActiveFeeding() {
  if (emergencyStopActive) {
    stopFeeding("EMERGENCY_STOP");
    return;
  }

  if (scale.is_ready()) {
    currentFeedWeightGrams = scale.get_units(3);

    // Avoid small negative values from calibration/noise.
    if (currentFeedWeightGrams < 0.0f) {
      currentFeedWeightGrams = 0.0f;
    }
  }

  // Stop once target is reached.
  if (currentFeedWeightGrams >= activeFeedTargetGrams) {
    stopFeeding("TARGET_REACHED");
    feedingCompleted = true;
    queueAlertEvent("FEEDING_COMPLETED");
    return;
  }

  // Failsafe if motor runs too long.
  if (millis() - feedingStartMillis >= FEEDING_TIMEOUT_MS) {
    stopFeeding("FEEDING_TIMEOUT");
    queueAlertEvent("FEEDING_TIMEOUT");
    triggerAlarm();
    return;
  }
}

void stopFeeding(const char* reason) {
  digitalWrite(DISPENSER_RELAY_PIN, LOW);
  feedingActive = false;

  Serial.print(F("FEED STOP | Reason: "));
  Serial.println(reason);

  logEventToSD(reason);
}

void initializeLoadCell() {
  scale.begin(HX711_DOUT_PIN, HX711_SCK_PIN);

  if (scale.is_ready()) {
    scale.set_scale(LOAD_CELL_CALIBRATION_FACTOR);
    scale.tare();
    Serial.println(F("HX711 ready."));
  } else {
    Serial.println(F("WARNING: HX711 not detected."));
  }
}
