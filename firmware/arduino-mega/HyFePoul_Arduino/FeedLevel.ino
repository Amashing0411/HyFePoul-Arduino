/*
  FeedLevel.ino
  Ultrasonic measurement of feed level inside the hopper.

  One ping every HOPPER_PING_INTERVAL_MS, never more, because the main loop
  also times chain moves. The level uses the median of the last few good
  pings, so one stray echo does not change it. If no echo comes back for
  HOPPER_FAULT_PINGS pings in a row, the level is stale: hopperSensorFault is
  set and no new feed cycle starts until the sensor answers again.
*/

float hopperSamples[HOPPER_SAMPLE_COUNT];
uint8_t hopperSampleCount = 0;
uint8_t hopperSampleNext = 0;
uint8_t hopperFailedPings = 0;
unsigned long lastHopperPingMillis = 0;

// Fills the sample buffer at boot, so the first level is already a median.
void initializeFeedLevel() {
  for (uint8_t i = 0; i < HOPPER_SAMPLE_COUNT; i++) {
    pingHopper();
    delay(40);
  }
  lastHopperPingMillis = millis();
}

void updateFeedLevel() {
  if (millis() - lastHopperPingMillis < HOPPER_PING_INTERVAL_MS) {
    return;
  }
  lastHopperPingMillis = millis();
  pingHopper();
}

// Distance used for the level: of the good pings kept so far (at least
// one), the one a quarter of the way up from the nearest. The feed surface
// is the nearest thing under the sensor; longer echoes come from gaps
// between pellets, the pit over the auger and the walls. Measured
// 2026-11-07: ruler 12.1-12.6 cm, single pings 13.1-13.8 cm, median of 15
// 14.5-15.3 cm. The quarter point still drops a rare too-short echo.
float medianHopperDistanceCm() {
  float sorted[HOPPER_SAMPLE_COUNT];
  for (uint8_t i = 0; i < hopperSampleCount; i++) {
    float x = hopperSamples[i];
    int8_t j = i - 1;
    while (j >= 0 && sorted[j] > x) {
      sorted[j + 1] = sorted[j];
      j--;
    }
    sorted[j + 1] = x;
  }
  return sorted[hopperSampleCount / 4];
}

void pingHopper() {
  float distanceCm = readUltrasonicDistanceCm();

  if (distanceCm <= 0.0f) {
    if (hopperFailedPings < HOPPER_FAULT_PINGS) {
      hopperFailedPings++;
    }
    if (hopperFailedPings >= HOPPER_FAULT_PINGS && !hopperSensorFault) {
      hopperSensorFault = true;
      Serial.println(F("WARNING: hopper sensor not answering; feed cycles will not start."));
      logEventToSD("HOPPER_SENSOR_FAULT");
      queueAlertEvent("HOPPER_SENSOR_FAULT");
      triggerAlarm();
    }
    return;
  }

  hopperFailedPings = 0;
  if (hopperSensorFault) {
    hopperSensorFault = false;
    Serial.println(F("Hopper sensor answering again."));
    logEventToSD("HOPPER_SENSOR_OK");
    queueAlertEvent("HOPPER_SENSOR_OK");
  }

  hopperSamples[hopperSampleNext] = distanceCm;
  hopperSampleNext = (hopperSampleNext + 1) % HOPPER_SAMPLE_COUNT;
  if (hopperSampleCount < HOPPER_SAMPLE_COUNT) {
    hopperSampleCount++;
  }

  liveHopperLevelPercent =
      calculateHopperLevelPercent(medianHopperDistanceCm());

  // The sensor sits over the auger: while feeding, the auger digs a pit
  // under it and the chain shakes the feed, so the reading swings (92% ->
  // 5% -> 50% seen in one cycle). The shown level and the low-feed alerts
  // hold the last idle value until the feed has settled after a cycle.
  // The cycle's own no-flow check uses the live value (Feeding.ino).
  static bool wasFeeding = false;
  static unsigned long feedEndedMillis = 0;
  if (feedingActive) {
    wasFeeding = true;
    return;
  }
  if (wasFeeding) {
    wasFeeding = false;
    feedEndedMillis = millis();
    hopperSampleCount = 0; // drop samples taken during the cycle
    hopperSampleNext = 0;
    return;
  }
  if (feedEndedMillis != 0 && millis() - feedEndedMillis < HOPPER_SETTLE_AFTER_FEED_MS) {
    return;
  }

  // The median already drops stray echoes; ease the shown level toward it
  // and only move it by HOPPER_DISPLAY_STEP_PERCENT or more, so the app and
  // the Nextion do not flicker between nearby values (64 <-> 68%).
  static bool smoothedSet = false;
  static float smoothedPercent = 0.0f;
  if (!smoothedSet) {
    smoothedPercent = liveHopperLevelPercent;
    smoothedSet = true;
    currentHopperLevelPercent = smoothedPercent;
  } else {
    smoothedPercent += HOPPER_SMOOTHING * (liveHopperLevelPercent - smoothedPercent);
    if (fabs(smoothedPercent - currentHopperLevelPercent) >= HOPPER_DISPLAY_STEP_PERCENT ||
        smoothedPercent <= HOPPER_EMPTY_PERCENT || smoothedPercent >= 99.5f) {
      currentHopperLevelPercent = smoothedPercent;
    }
  }

  // Low-feed detection by distance (the LOW calibration point), with
  // hysteresis.
  if (hopperAtLowPoint()) {
    if (!lowFeedAlertSent) {
      lowFeedAlertSent = true;
      statLowFeed();
      queueAlertEvent("LOW_FEED");
      triggerAlarm();
      logEventToSD("LOW_FEED");
    }
  } 
  else if (hopperAboveLowClear()) {
    if (lowFeedAlertSent) {
      // Hopper refilled: lets the app mark the LOW_FEED alert resolved.
      queueAlertEvent("LOW_FEED_CLEARED");
      logEventToSD("LOW_FEED_CLEARED");
    }
    lowFeedAlertSent = false;
  }
}

float readUltrasonicDistanceCm() {
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
  delayMicroseconds(2);

  digitalWrite(ULTRASONIC_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);

  unsigned long duration =
      pulseIn(ULTRASONIC_ECHO_PIN, HIGH, ULTRASONIC_TIMEOUT_US);

  if (duration == 0) {
    return -1.0f;
  }

  float distanceCm = duration * 0.0343f / 2.0f;

  // Basic sanity check.
  if (distanceCm < 2.0f || distanceCm > 500.0f) {
    return -1.0f;
  }

  return distanceCm;
}

// The feed has come down to the LOW calibration point.
bool hopperAtLowPoint() {
  return hopperSampleCount > 0 &&
         medianHopperDistanceCm() >= HOPPER_LOW_DISTANCE_CM;
}

// Clearly above LOW again (refilled).
bool hopperAboveLowClear() {
  return hopperSampleCount > 0 &&
         medianHopperDistanceCm() <= HOPPER_LOW_DISTANCE_CM - HOPPER_LOW_CLEAR_MARGIN_CM;
}

// Straight line through FULL (100 %) and LOW (HOPPER_LOW_PERCENT).
float calculateHopperLevelPercent(float distanceCm) {
  float lowDistance = HOPPER_LOW_DISTANCE_CM;
  float fullDistance = HOPPER_FULL_DISTANCE_CM;

  if (lowDistance <= fullDistance) {
    return 0.0f;
  }

  float percentage = HOPPER_LOW_PERCENT +
      (lowDistance - distanceCm) / (lowDistance - fullDistance) *
      (100.0f - HOPPER_LOW_PERCENT);

  if (percentage < 0.0f) {
    percentage = 0.0f;
  }

  if (percentage > 100.0f) {
    percentage = 100.0f;
  }

  return percentage;
}
