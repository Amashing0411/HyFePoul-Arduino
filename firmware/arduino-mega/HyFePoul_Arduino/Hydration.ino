/*
  Hydration.ino
  Water reservoir monitoring (no pump).

  The drinker is gravity-fed: a reservoir on top drains through a valve to
  the drinking line. One float switch in the reservoir reports when it runs
  low; the Mega then raises LOW_WATER (refill the reservoir) and beeps once
  per low episode. Nothing is switched on or off for water.

  Current assumption:
    Float switch closed (pin LOW) = reservoir is low.
  Because float-switch mounting and electrical logic vary, confirm the
  actual ON/OFF state before deployment.
*/

bool waterLowCandidate = false;
unsigned long waterCandidateSinceMillis = 0;

void initializeHydration() {
  waterLow = isWaterLow();
  waterLowCandidate = waterLow;
  waterCandidateSinceMillis = millis();
  checkLowWaterAlert();
}

void updateHydration() {
  bool reading = isWaterLow();

  // Debounce: accept a new state only after it has held for
  // WATER_DEBOUNCE_MS.
  if (reading != waterLowCandidate) {
    waterLowCandidate = reading;
    waterCandidateSinceMillis = millis();
  } else if (reading != waterLow &&
             millis() - waterCandidateSinceMillis >= WATER_DEBOUNCE_MS) {
    waterLow = reading;
    logEventToSD(waterLow ? "WATER_RESERVOIR_LOW" : "WATER_RESERVOIR_OK");
  }

  checkLowWaterAlert();
}

// One alert + beep per low episode; re-armed once the float rises.
void checkLowWaterAlert() {
  if (waterLow) {
    if (!lowWaterAlertSent) {
      lowWaterAlertSent = true;
      Serial.println(F("LOW WATER: refill the reservoir."));
      queueAlertEvent("LOW_WATER");
      triggerAlarm();
      logEventToSD("LOW_WATER");
    }
  } else {
    lowWaterAlertSent = false;
  }
}

bool isWaterLow() {
  // INPUT_PULLUP means the switch is assumed active LOW.
  // PLACEHOLDER: invert if actual switch wiring is different.
  return digitalRead(WATER_LOW_PIN) == LOW;
}
