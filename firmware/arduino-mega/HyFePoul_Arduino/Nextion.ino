/*
  Nextion.ino

  7-inch Nextion HMI (project: Nextion/HyFePoul.hmi, IDs in
  Nextion/Nextion_IDs.txt). The HMI's Program.s sets baud=9600 and starts
  on page 0 (Logo).

  Home page fields written by the Mega:
    t2  Feed Amount (number; t7 shows the "g" unit)
    t3  Water Level Status
    t4  Status (the HMI's initial text is "Status: WAITING")
    t5  Local time value (HH:MM:SS)
    t6  Static local-time caption
  Log page t1..t4 show the newest cloud system-data snapshots also listed by
  the app's History screen. System Check page t1..t4 show separate hopper,
  water, ESP32-link and manual-target readouts. Each page sends one component
  per update.
  t0 "Feed in Trays:", t1 "Water Level:", t6 "LOCAL TIME:", and t7 "g"
  are static captions set in the HMI and are not written. The Home page has no
  field for hopper level % or network status.

  NOTE: t2 shows the total grams in the 5 trays (the tray load cells weigh
  dispensed feed); the t0 caption was updated to "Feed in Trays:" in the HMI
  project to match that measurement.
  t4 shows the feed cycle step, e.g. "Status: FEEDING TRAY 3/5".

  The Nextion is the onsite operator surface. The Mega remains the authority:
  it validates local feed and schedule requests, controls actuators, and saves
  schedule/manual-target values. The mobile app remains the away-from-device
  interface through Firebase; it does not communicate with the Mega directly.
*/

// Touch events: 0x65 <page id> <component id> <0x01 press | 0x00 release>
// FF FF FF, sent only for components with "Send Component ID" ticked.
//
// Page/component IDs are read from the checked-in 800x480 HMI project. Physical
// UART confirmation is still required before the commissioning log can call
// touch behavior verified on hardware.
const uint8_t NEXTION_ID_UNSET = 255;
const uint8_t NEXTION_HOME_PAGE_ID = 1;
const uint8_t NEXTION_SCHEDULE_PAGE_ID = 2;
const uint8_t NEXTION_LOG_PAGE_ID = 3;
const uint8_t NEXTION_TARGET_PAGE_ID = 4;
const uint8_t NEXTION_SYSTEM_PAGE_ID = 9;
const uint8_t NEXTION_LOG_REFRESH_BUTTON_ID = 4; // Log b1
const uint8_t NEXTION_SYSTEM_REFRESH_BUTTON_ID = 4; // SystemCheck b1
const uint8_t NEXTION_SCHEDULE_EDITOR_FIRST_PAGE_ID = 5;
const uint8_t NEXTION_SCHEDULE_EDITOR_LAST_PAGE_ID = 7;
const uint8_t NEXTION_STOP_BUTTON_ID = 8;       // Home b3
const uint8_t NEXTION_FEED_RESET_BUTTON_ID = 9; // Home b4
const uint8_t NEXTION_TARGET_PLUS_BUTTON_ID = 5; // Grams b1
const uint8_t NEXTION_TARGET_MINUS_BUTTON_ID = 6; // Grams b2
const uint8_t NEXTION_TARGET_SAVE_BUTTON_ID = 4; // Grams b3
const uint8_t NEXTION_SCHEDULE_PLUS_HOUR_ID = 7; // editor b1
const uint8_t NEXTION_SCHEDULE_MINUS_HOUR_ID = 8; // editor b2
const uint8_t NEXTION_SCHEDULE_PLUS_MINUTE_ID = 9; // editor b3
const uint8_t NEXTION_SCHEDULE_MINUS_MINUTE_ID = 10; // editor b4
const uint8_t NEXTION_SCHEDULE_SAVE_BUTTON_ID = 11; // editor b5
const uint8_t NEXTION_LOG_EVENT_COUNT = 4;

const unsigned long NEXTION_BUTTON_DEBOUNCE_MS = 35UL;
const uint8_t NEXTION_FRAME_MAX = 32;
uint8_t nextionFrame[NEXTION_FRAME_MAX];
uint8_t nextionFrameLength = 0;
uint8_t nextionTerminatorCount = 0;

// Each HMI page sends `sendme` during Postinitialize; the Nextion returns
// 0x66 + page ID. Writes are scoped to the visible page.
uint8_t nextionCurrentPageId = NEXTION_ID_UNSET;
uint8_t nextionDraftScheduleIndex = NEXTION_ID_UNSET;
uint8_t nextionScheduleField = 0;
uint8_t nextionSystemField = 0;
uint8_t nextionLogField = 0;
// Filled by the ESP32 from the same /systemData records as app History.
char nextionHistoryRows[NEXTION_LOG_EVENT_COUNT][64] = {
  "NO HISTORY YET", "", "", ""
};
uint8_t nextionHistoryRowsReceived = 0;
FeedSchedule nextionScheduleDraft;
float nextionManualTargetDraft = DEFAULT_FEED_TARGET_GRAMS;
unsigned long nextionLastTouchMillis = 0;
bool nextionHasLastTouch = false;

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

  if (nextionCurrentPageId == NEXTION_HOME_PAGE_ID) {
    switch (nextField) {
      case 0: setNextionText("t2", String(currentFeedWeightGrams, 0)); break;
      case 1: setNextionText("t3", getWaterStatusText()); break;
      case 2: setNextionText("t4", String("Status: ") + getNextionStatusText()); break;
      case 3: setNextionText("t5", getCurrentTimeText()); break;
      default:
        setNextionText("b4", getHomeActionLabel());
        break;
    }
    nextField = (nextField + 1) % 5;
  } else if (nextionCurrentPageId == NEXTION_SYSTEM_PAGE_ID) {
    refreshNextionSystemReadings();
  } else if (nextionCurrentPageId == NEXTION_LOG_PAGE_ID) {
    refreshNextionLogEntries();
  } else if (nextionCurrentPageId == NEXTION_SCHEDULE_PAGE_ID) {
    static const char* timeComponents[] = {"t4", "t7", "t5", "t6", "t8", "t9"};
    static const char* summaryComponents[] = {"t1", "t2", "t3"};
    if (nextionScheduleField < 6) {
      uint8_t slot = nextionScheduleField / 2;
      bool isHour = (nextionScheduleField % 2) == 0;
      const FeedSchedule& schedule = feedSchedules[slot];
      String value;

      if (!schedule.enabled) {
        value = isHour ? "OFF" : "";
      } else if (isHour) {
        char hourText[4];
        snprintf(hourText, sizeof(hourText), "%02u:", schedule.hour);
        value = hourText;
      } else {
        char minuteText[3];
        snprintf(minuteText, sizeof(minuteText), "%02u", schedule.minute);
        value = minuteText;
      }
      setNextionText(timeComponents[nextionScheduleField], value);
    } else {
      uint8_t slot = nextionScheduleField - 6;
      const FeedSchedule& schedule = feedSchedules[slot];
      String value = String("S") + (slot + 1) + " " +
                     String(schedule.targetGrams, 0) + "g " +
                     (schedule.enabled ? "ON" : "OFF");
      setNextionText(summaryComponents[slot], value);
    }
    // Show the app's time, target amount and enabled state without sending a
    // long multi-field burst to the Nextion's 64-byte UART buffer.
    nextionScheduleField = (nextionScheduleField + 1) % 9;
  }
}

void setNextionText(const String& component, const String& value) {
  NEXTION_SERIAL.print(component);
  NEXTION_SERIAL.print(F(".txt=\""));
  NEXTION_SERIAL.print(value);
  NEXTION_SERIAL.print(F("\""));

  sendNextionCommandTerminator();
}

void setNextionValue(const String& component, long value) {
  NEXTION_SERIAL.print(component);
  NEXTION_SERIAL.print(F(".val="));
  NEXTION_SERIAL.print(value);
  sendNextionCommandTerminator();
}

void sendNextionCommandTerminator() {
  NEXTION_SERIAL.write(0xFF);
  NEXTION_SERIAL.write(0xFF);
  NEXTION_SERIAL.write(0xFF);
}

// Collect Nextion frames (terminated by FF FF FF). Touch actions are handled
// only on the press edge; release frames are ignored so a tap is one action.
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
  // `sendme` response: current page ID.
  if (length == 2 && frame[0] == 0x66) {
    nextionCurrentPageId = frame[1];
    Serial.print(F("Nextion page: "));
    Serial.println(nextionCurrentPageId);
    handleNextionPageChange(nextionCurrentPageId);
    return;
  }

  if (length != 4 || frame[0] != 0x65) {
    return;
  }

  uint8_t pageId = frame[1];
  uint8_t componentId = frame[2];
  nextionCurrentPageId = pageId;

  Serial.print(F("Nextion touch: page "));
  Serial.print(pageId);
  Serial.print(F(" id "));
  Serial.print(componentId);
  Serial.print(frame[3] == 0x01 ? F(" press") : F(" release"));
  Serial.println();

  // The Nextion sends both press and release. Act once on press, with a short
  // bounce guard that still allows rapid repeated adjustments.
  if (frame[3] != 0x01) {
    return;
  }

  if (nextionHasLastTouch &&
      millis() - nextionLastTouchMillis < NEXTION_BUTTON_DEBOUNCE_MS) {
    return;
  }
  nextionHasLastTouch = true;
  nextionLastTouchMillis = millis();

  handleNextionTouch(pageId, componentId);
}

void handleNextionPageChange(uint8_t pageId) {
  nextionDraftScheduleIndex = NEXTION_ID_UNSET;

  if (pageId == NEXTION_SCHEDULE_PAGE_ID) {
    refreshScheduleOverview();
  } else if (pageId == NEXTION_TARGET_PAGE_ID) {
    nextionManualTargetDraft = manualFeedTargetGrams;
    setNextionValue("n0", lround(nextionManualTargetDraft));
  } else if (pageId >= NEXTION_SCHEDULE_EDITOR_FIRST_PAGE_ID &&
             pageId <= NEXTION_SCHEDULE_EDITOR_LAST_PAGE_ID) {
    uint8_t index = pageId - NEXTION_SCHEDULE_EDITOR_FIRST_PAGE_ID;
    nextionDraftScheduleIndex = index;
    nextionScheduleDraft = feedSchedules[index];
    setNextionValue("n0", nextionScheduleDraft.hour);
    setNextionValue("n1", nextionScheduleDraft.minute);
  } else if (pageId == NEXTION_LOG_PAGE_ID) {
    requestNextionHistory();
  } else if (pageId == NEXTION_SYSTEM_PAGE_ID) {
    nextionSystemField = 0;
  } else if (pageId == NEXTION_HOME_PAGE_ID) {
    setNextionText("b4", getHomeActionLabel());
  }
}

void refreshScheduleOverview() {
  // updateNextion() writes one visible field per 100 ms tick. Keep each write
  // small enough for Serial2's 64-byte TX buffer.
  nextionScheduleField = 0;
}

void refreshNextionSystemReadings() {
  // The System Check page has four separate value cards. Send one per
  // 100 ms update so each command fits Serial2's transmit buffer.
  static const char* components[] = {"t1", "t2", "t3", "t4"};
  String value;

  switch (nextionSystemField) {
    case 0:
      value = String("HOPPER ") + String(currentHopperLevelPercent, 0) + "%";
      break;
    case 1:
      value = waterLow ? "WATER LOW - REFILL" : "WATER OK";
      break;
    case 2:
      value = esp32Online ? "ESP32 LINK OK" : "ESP32 LINK OFF";
      break;
    default:
      value = String("TARGET ") + String(manualFeedTargetGrams, 0) + " g";
      break;
  }

  setNextionText(components[nextionSystemField], value);
  nextionSystemField = (nextionSystemField + 1) % 4;
}

void refreshNextionLogEntries() {
  static const char* components[] = {"t1", "t2", "t3", "t4"};
  setNextionText(components[nextionLogField], nextionHistoryRows[nextionLogField]);
  nextionLogField = (nextionLogField + 1) % NEXTION_LOG_EVENT_COUNT;
}

void requestNextionHistory() {
  nextionHistoryRowsReceived = 0;
  for (uint8_t i = 0; i < NEXTION_LOG_EVENT_COUNT; i++) {
    nextionHistoryRows[i][0] = '\0';
  }
  strncpy(nextionHistoryRows[0], "LOADING HISTORY",
          sizeof(nextionHistoryRows[0]) - 1);
  nextionLogField = 0;

  if (!esp32Online) {
    strncpy(nextionHistoryRows[0], "HISTORY UNAVAILABLE",
            sizeof(nextionHistoryRows[0]) - 1);
    return;
  }

  ESP32_SERIAL.println(F("HISTORY_REQ"));
}

void processNextionHistoryLine(const String& line) {
  if (line == "HIST|BEGIN") {
    for (uint8_t i = 0; i < NEXTION_LOG_EVENT_COUNT; i++) {
      nextionHistoryRows[i][0] = '\0';
    }
    nextionHistoryRowsReceived = 0;
    strncpy(nextionHistoryRows[0], "LOADING HISTORY",
            sizeof(nextionHistoryRows[0]) - 1);
    nextionLogField = 0;
    return;
  }

  if (line == "HIST|EMPTY") {
    for (uint8_t i = 0; i < NEXTION_LOG_EVENT_COUNT; i++) {
      nextionHistoryRows[i][0] = '\0';
    }
    strncpy(nextionHistoryRows[0], "NO HISTORY YET",
            sizeof(nextionHistoryRows[0]) - 1);
    nextionHistoryRowsReceived = 0;
    nextionLogField = 0;
    return;
  }

  if (line.startsWith("HIST|ERROR|")) {
    for (uint8_t i = 0; i < NEXTION_LOG_EVENT_COUNT; i++) {
      nextionHistoryRows[i][0] = '\0';
    }
    strncpy(nextionHistoryRows[0], "HISTORY UNAVAILABLE",
            sizeof(nextionHistoryRows[0]) - 1);
    nextionHistoryRowsReceived = 0;
    nextionLogField = 0;
    return;
  }

  if (!line.startsWith("HIST|ROW|")) return;
  int index = extractMegaValue(line, "IDX:").toInt();
  long timestampSeconds = extractMegaValue(line, "TS:").toInt();
  long feedGrams = extractMegaValue(line, "FEED:").toInt();
  long hopperPercent = extractMegaValue(line, "HOP:").toInt();
  int waterLowValue = extractMegaValue(line, "W:").toInt();
  int feedingValue = extractMegaValue(line, "DISP:").toInt();
  if (index < 0 || index >= NEXTION_LOG_EVENT_COUNT ||
      timestampSeconds <= 0 || feedGrams < 0 || hopperPercent < 0 ||
      hopperPercent > 100 || (waterLowValue != 0 && waterLowValue != 1) ||
      (feedingValue != 0 && feedingValue != 1)) return;

  uint32_t localSeconds = (uint32_t)timestampSeconds +
      (uint32_t)LOCAL_UTC_OFFSET_MINUTES * 60UL;
  DateTime stamp(localSeconds);
  snprintf(nextionHistoryRows[index], sizeof(nextionHistoryRows[index]),
           "%02u-%02u %02u:%02u  %ldg  %ld%%  W:%s D:%s",
           stamp.month(), stamp.day(), stamp.hour(), stamp.minute(),
           feedGrams, hopperPercent, waterLowValue ? "LOW" : "OK",
           feedingValue ? "ON" : "OFF");
  if ((uint8_t)(index + 1) > nextionHistoryRowsReceived) {
    nextionHistoryRowsReceived = index + 1;
  }
  nextionLogField = 0;
}

void finishNextionHistory() {
  if (nextionHistoryRowsReceived == 0) {
    strncpy(nextionHistoryRows[0], "NO HISTORY YET",
            sizeof(nextionHistoryRows[0]) - 1);
  }
  nextionLogField = 0;
}

void handleNextionTouch(uint8_t pageId, uint8_t componentId) {
  if (pageId == NEXTION_HOME_PAGE_ID) {
    if (componentId == NEXTION_STOP_BUTTON_ID) {
      handleNextionStop();
    } else if (componentId == NEXTION_FEED_RESET_BUTTON_ID) {
      if (emergencyStopActive) {
        handleNextionStart();
      } else {
        handleNextionFeedNow();
      }
    }
    return;
  }

  if (pageId == NEXTION_TARGET_PAGE_ID) {
    if (componentId == NEXTION_TARGET_PLUS_BUTTON_ID) {
      if (nextionManualTargetDraft <= MAX_TRAY_TARGET_GRAMS - 10.0f) {
        nextionManualTargetDraft += 10.0f;
      }
      setNextionValue("n0", lround(nextionManualTargetDraft));
    } else if (componentId == NEXTION_TARGET_MINUS_BUTTON_ID) {
      nextionManualTargetDraft = max(1.0f, nextionManualTargetDraft - 10.0f);
      setNextionValue("n0", lround(nextionManualTargetDraft));
    } else if (componentId == NEXTION_TARGET_SAVE_BUTTON_ID) {
      if (!saveManualFeedTarget(nextionManualTargetDraft)) {
        setNextionText("t4", "Status: INVALID TARGET");
      } else {
        Serial.print(F("Nextion manual target saved: "));
        Serial.print(manualFeedTargetGrams, 0);
        Serial.println(F(" g per tray."));
        logEventToSD("NEXTION_TARGET_SAVED");
      }
    }
    return;
  }

  if (pageId >= NEXTION_SCHEDULE_EDITOR_FIRST_PAGE_ID &&
      pageId <= NEXTION_SCHEDULE_EDITOR_LAST_PAGE_ID &&
      nextionDraftScheduleIndex < FEED_SCHEDULE_COUNT) {
    if (componentId == NEXTION_SCHEDULE_PLUS_HOUR_ID) {
      nextionScheduleDraft.hour = (nextionScheduleDraft.hour + 1) % 24;
      setNextionValue("n0", nextionScheduleDraft.hour);
    } else if (componentId == NEXTION_SCHEDULE_MINUS_HOUR_ID) {
      nextionScheduleDraft.hour = (nextionScheduleDraft.hour + 23) % 24;
      setNextionValue("n0", nextionScheduleDraft.hour);
    } else if (componentId == NEXTION_SCHEDULE_PLUS_MINUTE_ID) {
      nextionScheduleDraft.minute = (nextionScheduleDraft.minute + 1) % 60;
      setNextionValue("n1", nextionScheduleDraft.minute);
    } else if (componentId == NEXTION_SCHEDULE_MINUS_MINUTE_ID) {
      nextionScheduleDraft.minute = (nextionScheduleDraft.minute + 59) % 60;
      setNextionValue("n1", nextionScheduleDraft.minute);
    } else if (componentId == NEXTION_SCHEDULE_SAVE_BUTTON_ID) {
      FeedSchedule& saved = feedSchedules[nextionDraftScheduleIndex];
      saved.hour = nextionScheduleDraft.hour;
      saved.minute = nextionScheduleDraft.minute;
      saveSchedulesToEEPROM();
      refreshScheduleOverview();
      logEventToSD("NEXTION_SCHEDULE_SAVED");
      Serial.print(F("Nextion schedule saved: slot "));
      Serial.print(nextionDraftScheduleIndex + 1);
      Serial.print(F(" at "));
      Serial.print(saved.hour);
      Serial.print(F(":"));
      Serial.println(saved.minute);
      nextionDraftScheduleIndex = NEXTION_ID_UNSET;
    }
  }

  // Log refresh reloads the newest saved SD events. System Check refresh starts
  // a paced update of all four live readings.
  if (pageId == NEXTION_LOG_PAGE_ID &&
      componentId == NEXTION_LOG_REFRESH_BUTTON_ID) {
    requestNextionHistory();
  }

  if (pageId == NEXTION_SYSTEM_PAGE_ID &&
      componentId == NEXTION_SYSTEM_REFRESH_BUTTON_ID) {
    nextionSystemField = 0;
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

    if (strcmp(rejectReason, "PHYSICAL_ESTOP_ENGAGED") == 0) {
      setNextionText("t4", "Status: RELEASE E-STOP");
    }
  } else {
    setNextionText("t4", "Status: STOP RESET");
  }
}

void handleNextionFeedNow() {
  const char* rejectReason = startFeedCycle(manualFeedTargetGrams);
  if (rejectReason != NULL) {
    Serial.print(F("Nextion Feed Now rejected: "));
    Serial.println(rejectReason);
    setNextionText("t4", String("Status: ") + rejectReason);
    return;
  }

  Serial.print(F("Nextion Feed Now accepted at "));
  Serial.print(manualFeedTargetGrams, 0);
  Serial.println(F(" g per tray."));
  logEventToSD("NEXTION_MANUAL_FEED_STARTED");
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

String getHomeActionLabel() {
  if (emergencyStopActive) return "RESET STOP";
  if (feedingActive) return "FEEDING";
  return "FEED NOW";
}
