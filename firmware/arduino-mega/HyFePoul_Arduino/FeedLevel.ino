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

// Median of the good pings kept so far (at least one).
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
  return sorted[hopperSampleCount / 2];
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

  currentHopperLevelPercent =
      calculateHopperLevelPercent(medianHopperDistanceCm());

  // Low-feed detection with hysteresis.
  if (currentHopperLevelPercent <= LOW_FEED_THRESHOLD_PERCENT) {
    if (!lowFeedAlertSent) {
      lowFeedAlertSent = true;
      statLowFeed();
      queueAlertEvent("LOW_FEED");
      triggerAlarm();
      logEventToSD("LOW_FEED");
    }
  } 
  else if (currentHopperLevelPercent >= LOW_FEED_CLEAR_PERCENT) {
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

float calculateHopperLevelPercent(float distanceCm) {
  float emptyDistance = HOPPER_EMPTY_DISTANCE_CM;
  float fullDistance = HOPPER_FULL_DISTANCE_CM;

  if (emptyDistance <= fullDistance) {
    return 0.0f;
  }

  float percentage =
      ((emptyDistance - distanceCm) /
       (emptyDistance - fullDistance)) * 100.0f;

  if (percentage < 0.0f) {
    percentage = 0.0f;
  }

  if (percentage > 100.0f) {
    percentage = 100.0f;
  }

  return percentage;
}
