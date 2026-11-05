/*
  Safety.ino

  Limit-switch enforcement, the USB console and the alarm buzzer.

  IMPORTANT:
  The machine has no emergency stop of any kind: no physical button and no
  stop on the Nextion or the app. Cutting the motor power is the only way to
  stop a running feed cycle by hand, so keep that switch within reach.
*/

void handleSafety() {
  // Limit switches stop the chain whatever the feed cycle is doing.
  enforceChainLimits();
}

// Every line typed on the USB serial monitor goes to the bench console
// (SerialConsole.ino; type HELP).
void handleLocalConsole() {
  static String consoleBuffer = "";

  while (Serial.available()) {
    char incoming = Serial.read();

    if (incoming == '\n') {
      consoleBuffer.trim();
      handleBenchCommand(consoleBuffer);
      consoleBuffer = "";
    } else if (incoming != '\r' && consoleBuffer.length() < 32) {
      consoleBuffer += incoming;
    }
  }
}

void triggerAlarm() {
  digitalWrite(BUZZER_PIN, BUZZER_ON);
  buzzerActive = true;
  buzzerStartMillis = millis();
}

void updateBuzzer() {
  if (!buzzerActive) {
    return;
  }

  if (millis() - buzzerStartMillis >= BUZZER_DURATION_MS) {
    digitalWrite(BUZZER_PIN, BUZZER_OFF);
    buzzerActive = false;
  }
}
