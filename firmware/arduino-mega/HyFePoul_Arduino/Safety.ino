/*
  Safety.ino

  Emergency stop and alarm handling.

  IMPORTANT:
  The software emergency-stop handling below is NOT a replacement for
  a properly designed physical emergency-stop circuit.

  The final electrical design should allow the emergency stop to remove
  actuator power/control independently where appropriate, while the Mega
  also monitors the switch for status and logging.

  Latching behavior:
  Pressing the E-stop latches emergencyStopActive. Releasing the button
  does NOT resume automation. The latch is cleared only by an explicit
  reset while the button is released:
    - remote ESTOP_RELEASE command (ESP32Communication.ino)
    - "RESET" typed on the USB serial monitor (bench testing)
    - Nextion reset button (planned with the Nextion integration)
  A power cycle also starts with the latch cleared; if the button is still
  pressed at boot, the first loop latches it again.
*/

void handleSafety() {
  bool pressed = digitalRead(EMERGENCY_STOP_PIN) == LOW;

  if (pressed && !emergencyButtonPressed) {
    emergencyButtonPressed = true;

    if (!emergencyStopActive) {
      tripEmergencyStop();
    }
  }

  if (!pressed && emergencyButtonPressed) {
    emergencyButtonPressed = false;

    Serial.println(F("E-stop button released. System stays stopped until reset."));
    logEventToSD("EMERGENCY_STOP_BUTTON_RELEASED");
  }

  // While latched, keep every actuator commanded OFF every loop.
  if (emergencyStopActive) {
    digitalWrite(DISPENSER_RELAY_PIN, LOW);
    stopChain();
  }

  // Limit switches stop the chain whatever the feed cycle is doing.
  enforceChainLimits();
}

void tripEmergencyStop() {
  emergencyStopActive = true;

  // Immediately command actuators OFF and abandon any feed cycle. The
  // hopper stays where it is; the next cycle homes first.
  stopFeedCycle("FEEDING_STOPPED_ESTOP");

  // A remote feed interrupted here would otherwise never report back.
  finishRemoteCommand("FAILED", "ESTOP_ACTIVE");

  Serial.println(F("!!! EMERGENCY STOP ACTIVE !!!"));

  logEventToSD("EMERGENCY_STOP");
  queueAlertEvent("EMERGENCY_STOP");
  triggerAlarm();
}

// Clears the E-stop latch. Returns NULL on success, otherwise the
// rejection reason (used directly as the CMD_ACK reason).
const char* resetEmergencyStop(const char* logEvent) {
  if (digitalRead(EMERGENCY_STOP_PIN) == LOW) {
    return "PHYSICAL_ESTOP_ENGAGED";
  }

  if (!emergencyStopActive) {
    return "ESTOP_NOT_ACTIVE";
  }

  emergencyStopActive = false;

  Serial.println(F("Emergency stop reset."));
  logEventToSD(logEvent);
  queueAlertEvent("EMERGENCY_STOP_RELEASED");

  return NULL;
}

// Bench-testing path: type RESET in the USB serial monitor to clear a
// latched E-stop when no ESP32 or Nextion reset is available.
void handleLocalConsole() {
  static String consoleBuffer = "";

  while (Serial.available()) {
    char incoming = Serial.read();

    if (incoming == '\n') {
      consoleBuffer.trim();

      if (consoleBuffer == "RESET") {
        const char* rejectReason =
            resetEmergencyStop("EMERGENCY_STOP_RESET_LOCAL");

        if (rejectReason != NULL) {
          Serial.print(F("RESET rejected: "));
          Serial.println(rejectReason);
        }
      }

      consoleBuffer = "";
    } else if (incoming != '\r' && consoleBuffer.length() < 32) {
      consoleBuffer += incoming;
    }
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
