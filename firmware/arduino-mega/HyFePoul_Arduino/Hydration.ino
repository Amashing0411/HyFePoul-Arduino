/*
  Hydration.ino
  Water-level monitoring and one-pump automatic hydration control.

  Current assumption:
    LOW switch  = water is below desired level.
    HIGH switch = water has reached the desired/high level.

  Because float-switch mounting and electrical logic vary, confirm the
  actual ON/OFF state before deployment.
*/

void updateHydration() {
  waterLow = isWaterLow();
  waterHigh = isWaterHigh();

  if (emergencyStopActive) {
    stopWaterPump("EMERGENCY_STOP");
    return;
  }

  controlWaterPump();
}

bool isWaterLow() {
  // INPUT_PULLUP means the switch is assumed active LOW.
  // PLACEHOLDER: invert if actual switch wiring is different.
  return digitalRead(WATER_LOW_PIN) == LOW;
}

bool isWaterHigh() {
  // INPUT_PULLUP means the switch is assumed active LOW.
  // PLACEHOLDER: invert if actual switch wiring is different.
  return digitalRead(WATER_HIGH_PIN) == LOW;
}

void controlWaterPump() {
  // If the high-level switch is active, stop pumping.
  if (waterHigh) {
    stopWaterPump("HIGH_LEVEL_REACHED");
    waterPumpTimeoutAlertSent = false;
    return;
  }

  // If low level is detected and high level is not active, pump.
  if (waterLow && !waterHigh) {
    startWaterPump();
  }

  // If neither switch is active, retain current state.
  // This avoids unnecessary pump cycling.
  checkWaterPumpTimeout();
}

void startWaterPump() {
  if (waterPumpActive || emergencyStopActive) {
    return;
  }

  waterPumpActive = true;
  waterPumpStartMillis = millis();

  digitalWrite(WATER_PUMP_RELAY_PIN, HIGH); // PLACEHOLDER: confirm relay logic.

  Serial.println(F("WATER PUMP START"));
  logEventToSD("WATER_PUMP_STARTED");
}

void stopWaterPump(const char* reason) {
  digitalWrite(WATER_PUMP_RELAY_PIN, LOW);

  if (waterPumpActive) {
    Serial.print(F("WATER PUMP STOP | Reason: "));
    Serial.println(reason);
    logEventToSD(reason);
  }

  waterPumpActive = false;
}

void checkWaterPumpTimeout() {
  if (!waterPumpActive) {
    return;
  }

  if (millis() - waterPumpStartMillis >= WATER_PUMP_MAX_RUNTIME_MS) {
    stopWaterPump("WATER_PUMP_TIMEOUT");

    if (!waterPumpTimeoutAlertSent) {
      waterPumpTimeoutAlertSent = true;
      queueAlertEvent("WATER_PUMP_TIMEOUT");
      triggerAlarm();
    }
  }
}
