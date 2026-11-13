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

// Faults give one short beep (triggerAlarm). Low feed and low water keep
// reminding while they last: ALERT_BURST_MS of beep-beep-beep, then
// ALERT_QUIET_MS of silence, repeated. The first burst starts right away.
void updateBuzzer() {
  static bool reminderWasOn = false;
  static unsigned long reminderStartMillis = 0;
  unsigned long now = millis();

  bool reminder = lowFeedAlertSent || lowWaterAlertSent;
  if (reminder && !reminderWasOn) {
    reminderStartMillis = now;
  }
  reminderWasOn = reminder;

  bool sound = false;
  if (reminder) {
    unsigned long t = (now - reminderStartMillis) % (ALERT_BURST_MS + ALERT_QUIET_MS);
    if (t < ALERT_BURST_MS) {
      sound = (t % (ALERT_BEEP_ON_MS + ALERT_BEEP_OFF_MS)) < ALERT_BEEP_ON_MS;
    }
  }

  if (buzzerActive) {
    if (now - buzzerStartMillis >= BUZZER_DURATION_MS) {
      buzzerActive = false;
    } else {
      sound = true;
    }
  }

  digitalWrite(BUZZER_PIN, sound ? BUZZER_ON : BUZZER_OFF);
}
