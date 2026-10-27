/*
  Nextion.ino

  7-inch Nextion HMI (project: Nextion/ChickenFeederV1 (1).hmi, IDs in
  Nextion/Nextion_IDs.txt). The HMI's Program.s sets baud=9600 and starts
  on page 0 (Logo).

  Home page fields written by the Mega:
    t2  Feed Amount (number; t7 shows the "g" unit)
    t3  Water Level Status
    t4  Status (the HMI's initial text is "Status: IDLE")
    t5  Time (local, HH:MM:SS)
  t0 "Feed in Trays:", t1 "Water Level:", t6 "Current Time" and t7 "g" are
  static captions set in the HMI and are not written. The Home page has no
  field for hopper level % or network status.

  NOTE: t2 shows the total grams in the 5 trays (the tray load cells weigh
  dispensed feed); the t0 caption was updated to "Feed in Trays:" in the HMI
  project to match that measurement.
  t4 shows the feed cycle step, e.g. "Status: FEEDING TRAY 3/5".

  Home page buttons handled by the Mega (touch events, see below):
    b3  Stop   -> latches the stop (same as pressing the E-stop button)
    b4  Start  -> resets the stop latch, only while the physical E-stop is
                  released (decision D1)
  b0 Set Feed Schedule, b1 Log Book and b2 Set Feed Weight open HMI pages
  and are not handled here yet.

  Writes to t2..t5 while another page is shown make the Nextion return an
  "invalid variable" error frame; the input parser ignores those.
*/

// Touch events: 0x65 <page id> <component id> <0x01 press | 0x00 release>
// FF FF FF, sent only for components with "Send Component ID" ticked.
//
// PLACEHOLDER IDs: numeric page/component "id" attributes from the Nextion
// Editor. They are disabled (255) until confirmed on the bench, because a
// wrong ID could let another button clear the stop latch. Every touch event
// is printed to the USB serial monitor as "Nextion touch: page P id C", so
// pressing b3 and b4 once shows their real IDs.
const uint8_t NEXTION_ID_UNSET = 255;
const uint8_t NEXTION_HOME_PAGE_ID = NEXTION_ID_UNSET;
const uint8_t NEXTION_STOP_BUTTON_ID = NEXTION_ID_UNSET;  // b3
const uint8_t NEXTION_START_BUTTON_ID = NEXTION_ID_UNSET; // b4

// Ignore repeated events for the same button within this window, so a
// press + release pair (or a bouncing touch) acts once.
const unsigned long NEXTION_BUTTON_DEBOUNCE_MS = 500UL;

const uint8_t NEXTION_FRAME_MAX = 32;
uint8_t nextionFrame[NEXTION_FRAME_MAX];
uint8_t nextionFrameLength = 0;
uint8_t nextionTerminatorCount = 0;

void updateNextion() {
  static unsigned long lastNextionUpdate = 0;
  static uint8_t nextField = 0;

  // One field per update: a single field fits in Serial2's 64-byte transmit
  // buffer, so the write does not block the loop (and the ESP32 UART).
  // Each field refreshes about every 400 ms.
  if (millis() - lastNextionUpdate < 100UL) {
    return;
  }

  lastNextionUpdate = millis();

  switch (nextField) {
    case 0: setNextionText("t2", String(currentFeedWeightGrams, 0)); break;
    case 1: setNextionText("t3", getWaterStatusText()); break;
    case 2: setNextionText("t4", String("Status: ") + getNextionStatusText()); break;
    default: setNextionText("t5", getCurrentTimeText()); break;
  }

  nextField = (nextField + 1) % 4;
}

void setNextionText(const String& component, const String& value) {
  NEXTION_SERIAL.print(component);
  NEXTION_SERIAL.print(F(".txt=\""));
  NEXTION_SERIAL.print(value);
  NEXTION_SERIAL.print(F("\""));

  sendNextionCommandTerminator();
}

void sendNextionCommandTerminator() {
  NEXTION_SERIAL.write(0xFF);
  NEXTION_SERIAL.write(0xFF);
  NEXTION_SERIAL.write(0xFF);
}

// Collects Nextion return frames (terminated by FF FF FF) and acts on
// Home-page touch events. Other frames (errors, startup, text the HMI
// prints from its own pages) are ignored.
void handleNextionInput() {
  while (NEXTION_SERIAL.available()) {
    uint8_t incoming = NEXTION_SERIAL.read();

    if (incoming == 0xFF) {
      nextionTerminatorCount++;

      if (nextionTerminatorCount == 3) {
        processNextionFrame(nextionFrame, nextionFrameLength);
        nextionFrameLength = 0;
        nextionTerminatorCount = 0;
      }
      continue;
    }

    // 0xFF bytes that were not a full terminator belong to the frame.
    while (nextionTerminatorCount > 0 && nextionFrameLength < NEXTION_FRAME_MAX) {
      nextionFrame[nextionFrameLength++] = 0xFF;
      nextionTerminatorCount--;
    }
    nextionTerminatorCount = 0;

    if (nextionFrameLength < NEXTION_FRAME_MAX) {
      nextionFrame[nextionFrameLength++] = incoming;
    } else {
      // Oversized frame (e.g. long text from an HMI page): drop it.
      nextionFrameLength = 0;
    }
  }
}

void processNextionFrame(const uint8_t* frame, uint8_t length) {
  if (length != 4 || frame[0] != 0x65) {
    return;
  }

  uint8_t pageId = frame[1];
  uint8_t componentId = frame[2];

  Serial.print(F("Nextion touch: page "));
  Serial.print(pageId);
  Serial.print(F(" id "));
  Serial.print(componentId);
  Serial.print(frame[3] == 0x01 ? F(" press") : F(" release"));
  Serial.println();

  if (NEXTION_HOME_PAGE_ID == NEXTION_ID_UNSET || pageId != NEXTION_HOME_PAGE_ID) {
    return;
  }

  static uint8_t lastButtonId = NEXTION_ID_UNSET;
  static unsigned long lastButtonMillis = 0;

  if (componentId == lastButtonId &&
      millis() - lastButtonMillis < NEXTION_BUTTON_DEBOUNCE_MS) {
    return;
  }

  if (componentId == NEXTION_STOP_BUTTON_ID) {
    lastButtonId = componentId;
    lastButtonMillis = millis();
    handleNextionStop();
  } else if (componentId == NEXTION_START_BUTTON_ID) {
    lastButtonId = componentId;
    lastButtonMillis = millis();
    handleNextionStart();
  }
}

void handleNextionStop() {
  if (emergencyStopActive) {
    return;
  }

  Serial.println(F("Stop pressed on Nextion."));
  logEventToSD("NEXTION_STOP_PRESSED");
  tripEmergencyStop();
}

void handleNextionStart() {
  const char* rejectReason = resetEmergencyStop("EMERGENCY_STOP_RESET_NEXTION");

  if (rejectReason != NULL) {
    Serial.print(F("Start on Nextion rejected: "));
    Serial.println(rejectReason);

    // Brief feedback; the regular refresh overwrites it shortly after.
    if (strcmp(rejectReason, "PHYSICAL_ESTOP_ENGAGED") == 0) {
      setNextionText("t4", "Status: RELEASE E-STOP");
    }
  }
}

String getWaterStatusText() {
  return waterLow ? "LOW - REFILL" : "OK";
}

String getSystemStatusText() {
  if (emergencyStopActive) {
    return "STOPPED";
  }

  if (!feedingActive) {
    return "NORMAL";
  }

  switch (cycleStep) {
    case CYCLE_HOMING:
      return "HOMING";
    case CYCLE_TO_END:
    case CYCLE_RETURNING:
      return "RETURNING";
    default:
      return String("FEEDING TRAY ") + currentTray + "/" + TRAY_COUNT;
  }
}

// Same states as getSystemStatusText(), worded like the HMI ("IDLE").
// getSystemStatusText() keeps "NORMAL" for the SD log.
String getNextionStatusText() {
  String status = getSystemStatusText();
  return status == "NORMAL" ? String("IDLE") : status;
}

String getCurrentTimeText() {
  DateTime now = getLocalDateTime();

  char buffer[9];
  snprintf(buffer, sizeof(buffer), "%02d:%02d:%02d",
           now.hour(), now.minute(), now.second());

  return String(buffer);
}
