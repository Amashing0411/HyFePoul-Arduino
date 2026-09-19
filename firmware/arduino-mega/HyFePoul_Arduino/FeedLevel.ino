/*
  FeedLevel.ino
  Ultrasonic measurement of feed level inside the hopper.
*/

void updateFeedLevel() {
  float distanceCm = readUltrasonicDistanceCm();

  if (distanceCm <= 0.0f) {
    // Sensor failure / timeout.
    return;
  }

  currentHopperLevelPercent = calculateHopperLevelPercent(distanceCm);

  // Low-feed detection with hysteresis.
  if (currentHopperLevelPercent <= LOW_FEED_THRESHOLD_PERCENT) {
    if (!lowFeedAlertSent) {
      lowFeedAlertSent = true;
      queueAlertEvent("LOW_FEED");
      triggerAlarm();
      logEventToSD("LOW_FEED");
    }
  } 
  else if (currentHopperLevelPercent >= LOW_FEED_CLEAR_PERCENT) {
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
