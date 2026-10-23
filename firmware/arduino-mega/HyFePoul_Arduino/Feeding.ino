/*
  Feeding.ino
  Moving-hopper feed cycle over 5 trays (docs/design-revision-moving-hopper.md).

  The hopper rides a chain driven by the chain motor. One cycle:
    1. HOMING      reverse to the home switch (skipped if already there)
    2. per tray 1..5:
       TO_TRAY     timed forward run (TRAY_TRAVEL_MS) to the tray
       TARING      settle, then tare that tray's load cell
       DISPENSING  dispenser on until the tray reads the per-tray target,
                   or TRAY_DISPENSE_TIMEOUT_MS (tray skipped, TRAY_TIMEOUT)
    3. TO_END      forward to the end switch
    4. RETURNING   reverse to the home switch; cycle done

  Faults:
    - A chain move that does not reach its switch in time stops everything
      (CHAIN_TIMEOUT + buzzer). The next cycle starts by homing again.
    - Hopper below HOPPER_EMPTY_PERCENT mid-cycle: stop dispensing, return
      home, raise LOW_FEED (open item O-3).
    - End switch reached before the last tray: tray timings are off; skip
      the remaining trays and return home.
    - E-stop: Safety.ino stops the cycle and all motors immediately.

  The tray load cells weigh the feed dispensed into each tray.
*/

// -----------------------------
// Load cells
// -----------------------------

void initializeLoadCells() {
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    trayScales[i].begin(HX711_DOUT_PINS[i], HX711_SCK_PIN);
  }

  // Tare all trays once at boot (blocking is acceptable here).
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    trayScales[i].set_scale(LOAD_CELL_CALIBRATION_FACTORS[i]);

    Serial.print(F("HX711 tray "));
    Serial.print(i + 1);

    if (trayScales[i].wait_ready_timeout(1000)) {
      trayScales[i].tare(TRAY_TARE_SAMPLES);
      Serial.println(F(" ready."));
    } else {
      Serial.println(F(": WARNING not detected."));
    }
  }
}

// Reads one tray if its HX711 has a conversion ready (non-blocking).
void readTrayWeight(uint8_t trayIndex) {
  if (!trayScales[trayIndex].is_ready()) {
    return;
  }

  float grams = trayScales[trayIndex].get_units(1);

  // Avoid small negative values from calibration/noise.
  if (grams < 0.0f) {
    grams = 0.0f;
  }

  trayWeightsGrams[trayIndex] = grams;

  float total = 0.0f;
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    total += trayWeightsGrams[i];
  }
  currentFeedWeightGrams = total;
}

// Between cycles, refresh one tray per loop so the display and DATA show
// how much feed is left in each tray.
void refreshIdleTrayWeights() {
  static uint8_t nextTray = 0;

  readTrayWeight(nextTray);
  nextTray = (nextTray + 1) % TRAY_COUNT;
}

// -----------------------------
// Chain motor and limit switches
// -----------------------------

bool isHomeSwitchPressed() {
  // INPUT_PULLUP, switch assumed to close to GND (active LOW).
  // PLACEHOLDER: normally-closed switches are safer (a broken wire then
  // reads as "pressed"); invert here if NC switches are used.
  return digitalRead(HOME_LIMIT_PIN) == LOW;
}

bool isEndSwitchPressed() {
  return digitalRead(END_LIMIT_PIN) == LOW;
}

// Requests a chain direction. Returns true once the motor is running in
// that direction (or stopped, for CHAIN_STOPPED). Call it every loop while
// a move is wanted:
//   - both relays are never on together (the other one is always written
//     LOW first);
//   - a direction change first stops the motor and waits
//     CHAIN_DEAD_TIME_MS with both relays off;
//   - forward is refused while the end switch is pressed, reverse while
//     the home switch is pressed.
bool setChainDirection(ChainDirection direction) {
  if (direction == CHAIN_STOPPED || emergencyStopActive) {
    stopChain();
    return direction == CHAIN_STOPPED;
  }

  if (direction == chainDirection) {
    return true;
  }

  if (chainDirection != CHAIN_STOPPED) {
    stopChain();
    return false;
  }

  if (millis() - chainStopMillis < CHAIN_DEAD_TIME_MS) {
    return false;
  }

  if (direction == CHAIN_FORWARD) {
    if (isEndSwitchPressed()) {
      return false;
    }
    digitalWrite(CHAIN_REVERSE_RELAY_PIN, LOW);
    digitalWrite(CHAIN_FORWARD_RELAY_PIN, HIGH); // PLACEHOLDER: relay logic.
  } else {
    if (isHomeSwitchPressed()) {
      return false;
    }
    digitalWrite(CHAIN_FORWARD_RELAY_PIN, LOW);
    digitalWrite(CHAIN_REVERSE_RELAY_PIN, HIGH); // PLACEHOLDER: relay logic.
  }

  chainDirection = direction;
  chainRunStartMillis = millis();
  return true;
}

void stopChain() {
  digitalWrite(CHAIN_FORWARD_RELAY_PIN, LOW);
  digitalWrite(CHAIN_REVERSE_RELAY_PIN, LOW);

  if (chainDirection != CHAIN_STOPPED) {
    chainDirection = CHAIN_STOPPED;
    chainStopMillis = millis();
  }
}

// Runs every loop (from handleSafety), whatever the cycle state: the end
// switch stops forward motion and the home switch stops reverse motion.
void enforceChainLimits() {
  if (chainDirection == CHAIN_FORWARD && isEndSwitchPressed()) {
    stopChain();
  } else if (chainDirection == CHAIN_REVERSE && isHomeSwitchPressed()) {
    stopChain();
  }
}

// -----------------------------
// Scheduling and start
// -----------------------------

void handleFeeding() {
  if (emergencyStopActive) {
    if (feedingActive) {
      stopFeedCycle("FEEDING_STOPPED_ESTOP");
    }
    return;
  }

  checkScheduledFeeding();

  if (feedingActive) {
    runFeedCycle();
  } else {
    refreshIdleTrayWeights();
  }
}

void checkScheduledFeeding() {
  // Schedules (and the daily reset below) follow the local wall clock.
  DateTime now = getLocalDateTime();

  static int lastDay = -1;
  if (lastDay != now.day()) {
    lastExecutedFeedIndex = -1;
    lastDay = now.day();
  }

  for (uint8_t i = 0; i < FEED_SCHEDULE_COUNT; i++) {
    if (!feedSchedules[i].enabled) {
      continue;
    }

    // lastExecutedFeedIndex prevents a second run within the same minute.
    if (now.hour() == feedSchedules[i].hour &&
        now.minute() == feedSchedules[i].minute &&
        lastExecutedFeedIndex != i) {
      startFeeding(i);
    }
  }
}

void startFeeding(uint8_t scheduleIndex) {
  if (scheduleIndex >= FEED_SCHEDULE_COUNT) {
    return;
  }

  // Each schedule slot is attempted once per day; a skipped run is logged
  // rather than retried every loop for the rest of the minute.
  lastExecutedFeedIndex = scheduleIndex;

  const char* rejectReason =
      startFeedCycle(feedSchedules[scheduleIndex].targetGrams);

  if (rejectReason != NULL) {
    Serial.print(F("Scheduled feed skipped: "));
    Serial.println(rejectReason);
    logEventToSD(String("FEED_SKIPPED_") + rejectReason);
    return;
  }

  logEventToSD("FEEDING_STARTED");
  queueAlertEvent("FEEDING_STARTED");
}

// Starts a full cycle with targetGrams per tray. Returns NULL on success,
// otherwise the reason (used directly as the CMD_ACK reason).
const char* startFeedCycle(float targetGrams) {
  if (emergencyStopActive) {
    return "ESTOP_ACTIVE";
  }

  if (feedingActive) {
    return "FEEDING_ACTIVE";
  }

  // A commissioning move from the serial console owns the motors.
  if (benchMoveActive()) {
    return "BENCH_ACTIVE";
  }

  if (currentHopperLevelPercent <= HOPPER_EMPTY_PERCENT) {
    return "HOPPER_LOW";
  }

  activeFeedTargetGrams = targetGrams;
  feedingActive = true;
  cycleFailReason = NULL;
  trayTimeoutAlertSent = false;
  currentTray = 0;

  Serial.print(F("FEED CYCLE START | Target per tray: "));
  Serial.print(activeFeedTargetGrams);
  Serial.println(F(" g"));

  if (isHomeSwitchPressed()) {
    currentTray = 1;
    enterCycleStep(CYCLE_TO_TRAY);
  } else {
    enterCycleStep(CYCLE_HOMING);
  }

  return NULL;
}

// -----------------------------
// Cycle state machine
// -----------------------------

void enterCycleStep(CycleStep step) {
  cycleStep = step;
  cycleStepStartMillis = millis();

  if (step == CYCLE_TARING) {
    tareSum = 0;
    tareCount = 0;
  }

  Serial.print(F("FEED STEP: "));
  Serial.print(getCycleStepName(step));
  if (currentTray > 0 && step != CYCLE_TO_END && step != CYCLE_RETURNING) {
    Serial.print(F(" tray "));
    Serial.print(currentTray);
  }
  Serial.println();
}

void runFeedCycle() {
  unsigned long elapsed = millis() - cycleStepStartMillis;

  // O-3: hopper ran empty while trays are still being filled.
  if ((cycleStep == CYCLE_TO_TRAY || cycleStep == CYCLE_TARING ||
       cycleStep == CYCLE_DISPENSING) &&
      currentHopperLevelPercent <= HOPPER_EMPTY_PERCENT) {
    digitalWrite(DISPENSER_RELAY_PIN, LOW);
    queueAlertEvent("LOW_FEED");
    triggerAlarm();
    returnHome("HOPPER_EMPTY");
    return;
  }

  switch (cycleStep) {
    case CYCLE_HOMING:
      if (isHomeSwitchPressed()) {
        stopChain();
        currentTray = 1;
        enterCycleStep(CYCLE_TO_TRAY);
      } else if (elapsed >= CHAIN_HOME_TIMEOUT_MS) {
        chainFault();
      } else {
        setChainDirection(CHAIN_REVERSE);
      }
      break;

    case CYCLE_TO_TRAY:
      runToTray();
      break;

    case CYCLE_TARING:
      runTaring(elapsed);
      break;

    case CYCLE_DISPENSING:
      runDispensing(elapsed);
      break;

    case CYCLE_TO_END:
      if (isEndSwitchPressed()) {
        stopChain();
        currentTray = 0;
        enterCycleStep(CYCLE_RETURNING);
      } else if (elapsed >= CHAIN_END_TIMEOUT_MS) {
        chainFault();
      } else {
        setChainDirection(CHAIN_FORWARD);
      }
      break;

    case CYCLE_RETURNING:
      if (isHomeSwitchPressed()) {
        stopChain();
        finishFeedCycle();
      } else if (elapsed >= CHAIN_HOME_TIMEOUT_MS) {
        chainFault();
      } else {
        setChainDirection(CHAIN_REVERSE);
      }
      break;

    default:
      break;
  }
}

// Timed forward run. The travel time counts from when the relay actually
// switched on, so the dead time is not part of it.
void runToTray() {
  if (isEndSwitchPressed()) {
    // Reached the far end before the last tray: tray timings are too long.
    stopChain();
    logEventToSD("END_LIMIT_EARLY");
    returnHome("END_LIMIT_EARLY");
    return;
  }

  if (!setChainDirection(CHAIN_FORWARD)) {
    return;
  }

  if (millis() - chainRunStartMillis >= TRAY_TRAVEL_MS[currentTray - 1]) {
    stopChain();
    enterCycleStep(CYCLE_TARING);
  }
}

void runTaring(unsigned long elapsed) {
  uint8_t trayIndex = currentTray - 1;

  if (elapsed < TRAY_SETTLE_MS) {
    return;
  }

  if (elapsed >= TRAY_SETTLE_MS + TRAY_TARE_TIMEOUT_MS) {
    // No readings: dispensing without a weight would overfill the tray.
    Serial.print(F("Tray "));
    Serial.print(currentTray);
    Serial.println(F(" load cell not ready; tray skipped."));
    logEventToSD("LOAD_CELL_NOT_READY");
    trayFailed();
    return;
  }

  if (!trayScales[trayIndex].is_ready()) {
    return;
  }

  tareSum += trayScales[trayIndex].read();
  tareCount++;

  if (tareCount >= TRAY_TARE_SAMPLES) {
    trayScales[trayIndex].set_offset(tareSum / tareCount);
    trayWeightsGrams[trayIndex] = 0.0f;
    readTrayWeight(trayIndex); // refresh the total with this tray at 0

    digitalWrite(DISPENSER_RELAY_PIN, HIGH); // PLACEHOLDER: relay logic.
    enterCycleStep(CYCLE_DISPENSING);
  }
}

void runDispensing(unsigned long elapsed) {
  uint8_t trayIndex = currentTray - 1;

  readTrayWeight(trayIndex);

  if (trayWeightsGrams[trayIndex] >= activeFeedTargetGrams) {
    digitalWrite(DISPENSER_RELAY_PIN, LOW);
    nextTray();
    return;
  }

  if (elapsed >= TRAY_DISPENSE_TIMEOUT_MS) {
    digitalWrite(DISPENSER_RELAY_PIN, LOW);
    Serial.print(F("Tray "));
    Serial.print(currentTray);
    Serial.println(F(" dispense timeout; tray skipped."));
    trayFailed();
  }
}

// The current tray was not filled (dispense timeout or no load cell).
void trayFailed() {
  logEventToSD("TRAY_TIMEOUT");

  if (cycleFailReason == NULL) {
    cycleFailReason = "TRAY_TIMEOUT";
  }

  // One alert per cycle so a jammed dispenser cannot flood the queue.
  if (!trayTimeoutAlertSent) {
    trayTimeoutAlertSent = true;
    queueAlertEvent("TRAY_TIMEOUT");
    triggerAlarm();
  }

  nextTray();
}

void nextTray() {
  if (currentTray < TRAY_COUNT) {
    currentTray++;
    enterCycleStep(CYCLE_TO_TRAY);
  } else {
    currentTray = 0;
    enterCycleStep(CYCLE_TO_END);
  }
}

// Skips the remaining trays and goes straight back to the home switch.
void returnHome(const char* reason) {
  digitalWrite(DISPENSER_RELAY_PIN, LOW);

  if (cycleFailReason == NULL) {
    cycleFailReason = reason;
  }

  Serial.print(F("FEED CYCLE: returning home, "));
  Serial.println(reason);

  currentTray = 0;
  enterCycleStep(CYCLE_RETURNING);
}

void finishFeedCycle() {
  digitalWrite(DISPENSER_RELAY_PIN, LOW);
  stopChain();
  feedingActive = false;
  currentTray = 0;
  enterCycleStep(CYCLE_IDLE);

  if (cycleFailReason == NULL) {
    Serial.println(F("FEED CYCLE COMPLETE"));
    logEventToSD("FEEDING_COMPLETED");
    queueAlertEvent("FEEDING_COMPLETED");
    finishRemoteCommand("SUCCESS", "");
  } else {
    Serial.print(F("FEED CYCLE ENDED WITH PROBLEM: "));
    Serial.println(cycleFailReason);
    logEventToSD("FEEDING_INCOMPLETE");
    finishRemoteCommand("FAILED", cycleFailReason);
  }
}

// A chain move did not reach its limit switch in time (jam, motor or
// switch fault). Stop in place; the next cycle homes first.
void chainFault() {
  Serial.print(F("CHAIN TIMEOUT during "));
  Serial.println(getCycleStepName(cycleStep));

  stopFeedCycle("CHAIN_TIMEOUT");
  queueAlertEvent("CHAIN_TIMEOUT");
  triggerAlarm();
  finishRemoteCommand("FAILED", "CHAIN_TIMEOUT");
}

// Immediate stop of the dispenser and chain (E-stop, chain fault).
void stopFeedCycle(const char* reason) {
  digitalWrite(DISPENSER_RELAY_PIN, LOW);
  stopChain();

  bool wasActive = feedingActive;
  feedingActive = false;
  currentTray = 0;
  cycleStep = CYCLE_IDLE;

  if (wasActive) {
    Serial.print(F("FEED CYCLE STOP | Reason: "));
    Serial.println(reason);
    logEventToSD(reason);
  }
}

const char* getCycleStepName(CycleStep step) {
  switch (step) {
    case CYCLE_HOMING:     return "HOMING";
    case CYCLE_TO_TRAY:    return "TO_TRAY";
    case CYCLE_TARING:     return "TARING";
    case CYCLE_DISPENSING: return "DISPENSING";
    case CYCLE_TO_END:     return "TO_END";
    case CYCLE_RETURNING:  return "RETURNING";
    default:               return "IDLE";
  }
}
