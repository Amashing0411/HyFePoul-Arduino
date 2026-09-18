/*
  Safety.ino

  Emergency stop and alarm handling.

  IMPORTANT:
  The software emergency-stop handling below is NOT a replacement for
  a properly designed physical emergency-stop circuit.

  The final electrical design should allow the emergency stop to remove
  actuator power/control independently where appropriate, while the Mega
  also monitors the switch for status and logging.
*/

void handleSafety() {
  bool newEmergencyState = digitalRead(EMERGENCY_STOP_PIN) == LOW;

  if (newEmergencyState && !emergencyStopActive) {
    emergencyStopActive = true;

    // Immediately command actuators OFF.
    digitalWrite(DISPENSER_RELAY_PIN, LOW);
    digitalWrite(WATER_PUMP_RELAY_PIN, LOW);

    feedingActive = false;
    waterPumpActive = false;

    Serial.println(F("!!! EMERGENCY STOP ACTIVE !!!"));

    logEventToSD("EMERGENCY_STOP");
    queueAlertEvent("EMERGENCY_STOP");
    triggerAlarm();
  }

  if (!newEmergencyState && emergencyStopActive) {
    emergencyStopActive = false;

    Serial.println(F("Emergency stop released."));

    logEventToSD("EMERGENCY_STOP_RELEASED");
    queueAlertEvent("EMERGENCY_STOP_RELEASED");
  }
}

void triggerAlarm() {
  digitalWrite(BUZZER_PIN, HIGH);
  buzzerActive = true;
  buzzerStartMillis = millis();
}

void updateBuzzer() {
  if (!buzzerActive) {
    return;
  }

  if (millis() - buzzerStartMillis >= BUZZER_DURATION_MS) {
    digitalWrite(BUZZER_PIN, LOW);
    buzzerActive = false;
  }
}
