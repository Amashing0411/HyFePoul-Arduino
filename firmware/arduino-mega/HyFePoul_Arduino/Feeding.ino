/*
  Feeding.ino
  Moving-hopper feed cycle over 5 trays (docs/design-revision-moving-hopper.md).

  The hopper rides a chain driven by the chain motor. One cycle:
    1. HOMING      reverse to the start-side switch (skipped if already there)
    2. per tray, in the order reached from the start side
     (HOPPER_START_SIDE in Config.ino; TRAY_AT_POSITION gives the order):
       TO_TRAY     timed forward run (TRAY_TRAVEL_MS plus edge gaps) to the
                   tray's first spot, which sits one gap in from the edge
       TARING      settle, then tare that tray's load cell
       DISPENSING  dispenser on until the tray reads this spot's running
                   target: with 3 spots and 60 g, 20, 40, then 60 g. Each
                   pour stops early for the feed still falling. At the last
                   spot the tray is weighed once the feed has settled and
                   topped up with short pulses until it is within
                   FEED_TOLERANCE_GRAMS of the target.
                   An overshoot is taken off the next spot's share.
       TO_SPOT     short timed move to the next spot, then a short settle;
                   a spot already at its running target gets no feed
       The last spot dispenses until the full target. TRAY_DISPENSE_TIMEOUT_MS
       limits the total dispenser run per tray (rest of tray skipped,
       TRAY_TIMEOUT). A failed tray still passes its spots without feed, so
       the hopper is where the next tray's timing expects it.
    3. TO_END      forward to the far-side limit switch
    4. RETURNING   reverse to the home switch; cycle done

  Faults:
    - A chain move that does not reach its switch in time stops everything
      (CHAIN_TIMEOUT + buzzer). The next cycle starts by homing again.
    - Hopper empty mid-cycle (O-3): the hopper reads at or below
      HOPPER_EMPTY_PERCENT AND the tray gains under HOPPER_NO_FLOW_GRAMS in
      HOPPER_NO_FLOW_MS of pouring: stop dispensing, return home, LOW_FEED.
      The level alone is not trusted mid-cycle (the auger digs a pit under
      the sensor). The start of a cycle still checks the level.
    - End switch reached before the last tray: tray timings are off; skip
      the remaining trays and return home.

  The tray load cells weigh the feed dispensed into each tray.
*/

// -----------------------------
// Load cells
// -----------------------------

// Each tray's HX711 is started on its own SCK and DT pins (Config.ino), so
// a missing or miswired board only affects its own tray.
void initializeLoadCells() {
  initializeTrayScale(1, TRAY1_HX711_DT_PIN, TRAY1_HX711_SCK_PIN);
  initializeTrayScale(2, TRAY2_HX711_DT_PIN, TRAY2_HX711_SCK_PIN);
  initializeTrayScale(3, TRAY3_HX711_DT_PIN, TRAY3_HX711_SCK_PIN);
  initializeTrayScale(4, TRAY4_HX711_DT_PIN, TRAY4_HX711_SCK_PIN);
  initializeTrayScale(5, TRAY5_HX711_DT_PIN, TRAY5_HX711_SCK_PIN);

  // Saved empty-tray zeros replace the boot tare, so feed already in a tray
  // is still counted after a reset.
  trayZerosLoaded = loadTrayZeros();
  if (trayZerosLoaded) {
    Serial.println(F("Tray zeros loaded from EEPROM."));
  } else {
    Serial.println(F("WARNING: no saved tray zeros. Empty all trays, then type TARE ALL."));
  }
}

// Starts one tray's HX711 and tares it (blocking is acceptable at boot).
// The tare only stands in until saved zeros are loaded (TrayZero.ino).
// tray is 1-5; the serial monitor shows which pins it uses.
void initializeTrayScale(uint8_t tray, uint8_t dtPin, uint8_t sckPin) {
  HX711& scale = trayScales[tray - 1];
  scale.begin(dtPin, sckPin);
  scale.set_scale(LOAD_CELL_CALIBRATION_FACTORS[tray - 1]);

  Serial.print(F("HX711 tray "));
  Serial.print(tray);
  Serial.print(F(" (SCK "));
  Serial.print(sckPin);
  Serial.print(F(", DT "));
  Serial.print(dtPin);
  Serial.print(F(")"));

  if (scale.wait_ready_timeout(1000)) {
    scale.tare(TRAY_TARE_SAMPLES);
    Serial.println(F(" ready."));
  } else {
    Serial.println(F(": WARNING not detected."));
  }
}

// Reads one tray if its HX711 has a conversion ready (non-blocking).
void readTrayWeight(uint8_t trayIndex) {
  if (!trayScales[trayIndex].is_ready()) {
    return;
  }

  float grams = trayScales[trayIndex].get_units(1);

  // Empty-tray noise is about +/-1 g; show it as 0 instead of flickering
  // between 0 and 1 g (well inside FEED_TOLERANCE_GRAMS, so feeding is not
  // affected). Also avoids small negative values.
  if (grams < TRAY_ZERO_DEADBAND_GRAMS) {
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
  // INPUT_PULLUP; LIMIT_SWITCH_PRESSED (Config.ino) is LOW for switches that
  // close to GND, HIGH for normally-closed ones (safer: a broken wire then
  // reads as "pressed").
  return digitalRead(HOME_LIMIT_PIN) == LIMIT_SWITCH_PRESSED;
}

bool isEndSwitchPressed() {
  return digitalRead(END_LIMIT_PIN) == LIMIT_SWITCH_PRESSED;
}

// Requests a chain direction. Returns true once the motor is running in
// that direction (or stopped, for CHAIN_STOPPED). Call it every loop while
// a move is wanted:
//   - both relays are never on together (the other one is always switched
//     off first);
//   - a direction change first stops the motor and waits
//     CHAIN_DEAD_TIME_MS with both relays off;
//   - forward is refused while the end switch is pressed, reverse while
//     the home switch is pressed.
bool setChainDirection(ChainDirection direction) {
  if (direction == CHAIN_STOPPED) {
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
    digitalWrite(CHAIN_REVERSE_RELAY_PIN, RELAY_OFF);
    digitalWrite(CHAIN_FORWARD_RELAY_PIN, RELAY_ON);
  } else {
    if (isHomeSwitchPressed()) {
      return false;
    }
    digitalWrite(CHAIN_FORWARD_RELAY_PIN, RELAY_OFF);
    digitalWrite(CHAIN_REVERSE_RELAY_PIN, RELAY_ON);
  }

  chainDirection = direction;
  chainRunStartMillis = millis();
  return true;
}

void stopChain() {
  digitalWrite(CHAIN_FORWARD_RELAY_PIN, RELAY_OFF);
  digitalWrite(CHAIN_REVERSE_RELAY_PIN, RELAY_OFF);

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
  if (feedingActive) {
    return "FEEDING_ACTIVE";
  }

  // A commissioning move from the serial console owns the motors.
  if (benchMoveActive()) {
    return "BENCH_ACTIVE";
  }

  if (hopperSensorFault) {
    return "HOPPER_SENSOR_FAULT";
  }

  if (currentHopperLevelPercent <= HOPPER_EMPTY_PERCENT) {
    return "HOPPER_LOW";
  }

  activeFeedTargetGrams = targetGrams;
  feedingActive = true;
  cycleFailReason = NULL;
  trayTimeoutAlertSent = false;
  setStop(0);

  Serial.print(F("FEED CYCLE START | Target per tray: "));
  Serial.print(activeFeedTargetGrams);
  Serial.println(F(" g"));

  if (isHomeSwitchPressed()) {
    setStop(1);
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

  if (step != CYCLE_DISPENSING) {
    topUpActive = false;
    topUpPulsing = false;
  }

  if (step == CYCLE_TARING) {
    tareSum = 0;
    tareCount = 0;
    currentSpot = 0;
    trayDispenseUsedMs = 0;
    trayAborted = false;
    trayFeedCounted = false;
  }

  if (step == CYCLE_TO_SPOT) {
    spotMoveDone = false;
  }

  Serial.print(F("FEED STEP: "));
  Serial.print(getCycleStepName(step));
  if (currentTray > 0 && step != CYCLE_TO_END && step != CYCLE_RETURNING) {
    Serial.print(F(" tray "));
    Serial.print(currentTray);
    if (step == CYCLE_DISPENSING || step == CYCLE_TO_SPOT) {
      Serial.print(F(" spot "));
      Serial.print(currentSpot + 1);
    }
  }
  Serial.println();
}

void runFeedCycle() {
  unsigned long elapsed = millis() - cycleStepStartMillis;

  // O-3 (hopper empty mid-cycle) is judged in runDispensing(): the sensor
  // sits over the auger, so pouring opens a pit under it and the level reads
  // empty while the hopper still holds feed. Only "reads empty AND the tray
  // gains nothing while pouring" stops the cycle.

  switch (cycleStep) {
    case CYCLE_HOMING:
      if (isHomeSwitchPressed()) {
        stopChain();
        setStop(1);
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
      runDispensing();
      break;

    case CYCLE_TO_SPOT:
      runToSpot();
      break;

    case CYCLE_TO_END:
      if (isEndSwitchPressed()) {
        stopChain();
        setStop(0);
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

  // Rest of the previous tray past its last spot, the travel between trays,
  // then the gap in to this tray's first spot, as one continuous run.
  unsigned long travelMs = TRAY_TRAVEL_MS[currentStop - 1] + spotGapMs(currentStop);
  if (currentStop > 1) {
    travelMs += spotGapMs(currentStop - 1);
  }

  if (millis() - chainRunStartMillis >= travelMs) {
    stopChain();
    enterCycleStep(CYCLE_TARING);
  }
}

void runTaring(unsigned long elapsed) {
  uint8_t trayIndex = currentTray - 1;

  // A factor of about 1 means this tray was never calibrated, so its readings
  // are raw counts and it would stop dispensing almost at once.
  if (fabs(LOAD_CELL_CALIBRATION_FACTORS[trayIndex]) <= 1.0f) {
    Serial.print(F("Tray "));
    Serial.print(currentTray);
    Serial.println(F(" load cell not calibrated; tray skipped."));
    logEventToSD("LOAD_CELL_NOT_CALIBRATED");
    trayFailed();
    return;
  }

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

  // Weigh what is already in the tray (no tare: the empty-tray zero is the
  // one saved with TARE, see TrayZero.ino). Only the difference to the
  // target is dispensed.
  tareSum += trayScales[trayIndex].read();
  tareCount++;

  if (tareCount >= TRAY_TARE_SAMPLES) {
    HX711& scale = trayScales[trayIndex];
    float grams = ((float)(tareSum / tareCount) - (float)scale.get_offset()) / scale.get_scale();
    if (grams < 0.0f) {
      grams = 0.0f;
    }
    trayStartGrams = grams;
    trayWeightsGrams[trayIndex] = grams;
    readTrayWeight(trayIndex); // refresh the total

    Serial.print(F("Tray "));
    Serial.print(currentTray);
    Serial.print(F(" holds "));
    Serial.print(grams, 1);
    Serial.print(F(" g; needs "));
    Serial.print(trayNeedGrams(), 1);
    Serial.println(F(" g"));

    decideAtSpot(grams);
  }
}

// Feed this tray still needs to reach the target, from what it held when the
// hopper arrived.
float trayNeedGrams() {
  float need = activeFeedTargetGrams - trayStartGrams;
  return need > 0.0f ? need : 0.0f;
}

// Run time between neighbouring spots of the tray at a stop, and from each
// edge to the nearest spot: the span cut into TRAY_SPOT_COUNT + 1 gaps.
unsigned long spotGapMs(uint8_t stop) {
  return TRAY_SPAN_MS[stop - 1] / (TRAY_SPOT_COUNT + 1);
}

// Most dispenser run a tray may use before it is skipped (TRAY_TIMEOUT):
// twice the time the target should take at the measured flow, and never
// less than TRAY_DISPENSE_TIMEOUT_MS.
unsigned long trayDispenseLimitMs() {
  unsigned long expectedMs =
      (unsigned long)(activeFeedTargetGrams / DISPENSER_FLOW_GRAMS_PER_S * 1000.0f);
  unsigned long limitMs = expectedMs * 2UL;
  return limitMs > TRAY_DISPENSE_TIMEOUT_MS ? limitMs : TRAY_DISPENSE_TIMEOUT_MS;
}

// Grams this tray should read when the current spot is finished: what it
// held on arrival plus an equal share of what it needs per spot.
float spotRunningTarget() {
  if (currentSpot + 1 >= TRAY_SPOT_COUNT) {
    return activeFeedTargetGrams;
  }
  return trayStartGrams + trayNeedGrams() * (currentSpot + 1) / TRAY_SPOT_COUNT;
}

float halfSpotShare() {
  return trayNeedGrams() / TRAY_SPOT_COUNT / 2.0f;
}

// What to do at a spot, from the settled reading: pour, top up, or move on.
void decideAtSpot(float weight) {
  if (isLastSpot()) {
    // Last spot: a big shortfall gets a normal pour, a small one goes
    // straight to the pulsed top-up, and a tray already within tolerance is
    // done.
    if (weight >= activeFeedTargetGrams - FEED_TOLERANCE_GRAMS) {
      leaveSpot();
    } else if (weight >= spotStopGrams()) {
      startTopUp();
    } else {
      startSpotDispense();
    }
    return;
  }

  // Earlier spots only spread the feed. Any weighed pour drops at least
  // about DISPENSE_IN_FLIGHT_GRAMS (the scale only sees feed ~0.7 s after
  // the auger starts), so a spot that is short by less than that is skipped
  // and the last spot's timed top-up handles small amounts (a tray needing
  // 1.4 g got 19 g from an early-spot pour).
  if (weight >= spotRunningTarget() - halfSpotShare() ||
      spotRunningTarget() - weight < DISPENSE_IN_FLIGHT_GRAMS) {
    leaveSpot();
  } else {
    startSpotDispense();
  }
}

bool isLastSpot() {
  return currentSpot + 1 >= TRAY_SPOT_COUNT;
}

// Reading at which the main pour of this spot stops. Feed in the auger and
// in the air still lands afterwards, so the pour stops early. Earlier spots
// only spread the feed, so they never hold back more than half their share;
// the last spot holds back the in-flight feed plus its spread
// (LAST_SPOT_HOLDBACK_GRAMS), so the main pour lands below the target and
// the top-up closes the gap from below.
float spotStopGrams() {
  if (isLastSpot()) {
    return activeFeedTargetGrams - LAST_SPOT_HOLDBACK_GRAMS;
  }
  float halfShare = halfSpotShare();
  float holdBack = DISPENSE_IN_FLIGHT_GRAMS < halfShare ? DISPENSE_IN_FLIGHT_GRAMS : halfShare;
  return spotRunningTarget() - holdBack;
}

void startSpotDispense() {
  dispenseStartMillis = millis();
  spotStartGrams = trayWeightsGrams[currentTray - 1];
  digitalWrite(DISPENSER_RELAY_PIN, RELAY_ON);
  enterCycleStep(CYCLE_DISPENSING);
  topUpActive = false;
}

// Last spot only: weigh after the feed has settled and add short pulses
// until the tray is within FEED_TOLERANCE_GRAMS of the target. Stops when
// the tray's dispense time limit is used up (TRAY_TIMEOUT).
void startTopUp() {
  if (cycleStep != CYCLE_DISPENSING) {
    enterCycleStep(CYCLE_DISPENSING);
  }
  topUpActive = true;
  topUpPulsing = false;
  topUpSettleStartMillis = millis();
  topUpGramsPerMs = DISPENSER_FLOW_GRAMS_PER_S / 1000.0f;
  topUpBeforeGrams = -1.0f;
}

void runTopUp() {
  uint8_t trayIndex = currentTray - 1;

  if (topUpPulsing) {
    if (millis() - dispenseStartMillis >= topUpPulseMs) {
      digitalWrite(DISPENSER_RELAY_PIN, RELAY_OFF);
      trayDispenseUsedMs += topUpPulseMs;
      topUpPulsing = false;
      topUpSettleStartMillis = millis();
    }
    return;
  }

  if (millis() - topUpSettleStartMillis < TOPUP_SETTLE_MS) {
    return;
  }

  // A steadier reading than one sample: the decision is made to about 1 g.
  // (Blocks about 0.3 s with the motors stopped.)
  float weight = trayScales[trayIndex].get_units(3);
  if (weight < TRAY_ZERO_DEADBAND_GRAMS) weight = 0.0f;
  trayWeightsGrams[trayIndex] = weight;

  // Learn what this tray's pulses really drop (the auger starts and stops
  // slowly, so short pulses give less than the full-flow rate).
  if (topUpBeforeGrams >= 0.0f && topUpPulseMs > 0) {
    float dropped = weight - topUpBeforeGrams;
    if (dropped > 0.5f) {
      topUpGramsPerMs = dropped / (float)topUpPulseMs;
    }
  }

  float shortGrams = activeFeedTargetGrams - weight;
  // Done within FEED_TOLERANCE_GRAMS, or when even the shortest pulse would
  // more likely land further past the target than the tray is short now.
  float minPulseGrams = topUpGramsPerMs * TOPUP_MIN_PULSE_MS;
  if (minPulseGrams < TOPUP_MIN_PULSE_GRAMS) {
    minPulseGrams = TOPUP_MIN_PULSE_GRAMS;
  }
  if (shortGrams <= FEED_TOLERANCE_GRAMS || shortGrams < minPulseGrams / 2.0f) {
    topUpActive = false;
    leaveSpot();
    return;
  }

  if (trayDispenseUsedMs >= trayDispenseLimitMs()) {
    topUpActive = false;
    countTrayFeed();
    Serial.print(F("Tray "));
    Serial.print(currentTray);
    Serial.println(F(" short after top-up time limit; tray skipped."));
    trayFailed();
    return;
  }

  // Pulse for less than the shortfall needs at the learned rate, so it
  // creeps up on the target instead of jumping past it.
  unsigned long pulseMs = (unsigned long)(shortGrams / topUpGramsPerMs * TOPUP_PULSE_FRACTION);
  topUpBeforeGrams = weight;
  if (pulseMs < TOPUP_MIN_PULSE_MS) pulseMs = TOPUP_MIN_PULSE_MS;
  if (pulseMs > TOPUP_MAX_PULSE_MS) pulseMs = TOPUP_MAX_PULSE_MS;

  Serial.print(F("Tray "));
  Serial.print(currentTray);
  Serial.print(F(" top-up: "));
  Serial.print(trayWeightsGrams[trayIndex], 1);
  Serial.print(F(" g, pulse "));
  Serial.print(pulseMs);
  Serial.println(F(" ms"));

  topUpPulseMs = pulseMs;
  dispenseStartMillis = millis();
  digitalWrite(DISPENSER_RELAY_PIN, RELAY_ON);
  topUpPulsing = true;
}

void runDispensing() {
  uint8_t trayIndex = currentTray - 1;

  readTrayWeight(trayIndex);

  if (topUpActive) {
    runTopUp();
    return;
  }

  unsigned long ranMs = millis() - dispenseStartMillis;

  // O-3: no feed reaching the tray and the hopper reads empty: out of feed.
  // (No gain with feed in the hopper is left to the dispense timeout: a jam
  // or a motor fault, TRAY_TIMEOUT.)
  if (ranMs >= HOPPER_NO_FLOW_MS &&
      trayWeightsGrams[trayIndex] - spotStartGrams < HOPPER_NO_FLOW_GRAMS &&
      liveHopperLevelPercent <= HOPPER_EMPTY_PERCENT) {
    digitalWrite(DISPENSER_RELAY_PIN, RELAY_OFF);
    countTrayFeed();
    queueAlertEvent("LOW_FEED");
    triggerAlarm();
    returnHome("HOPPER_EMPTY");
    return;
  }

  // Stop early: pellets already in the auger and in the air still land
  // after the motor stops (spotStopGrams). The last spot then tops up.
  if (trayWeightsGrams[trayIndex] >= spotStopGrams()) {
    digitalWrite(DISPENSER_RELAY_PIN, RELAY_OFF);
    trayDispenseUsedMs += ranMs;
    if (isLastSpot()) {
      startTopUp();
    } else {
      leaveSpot();
    }
    return;
  }

  if (trayDispenseUsedMs + ranMs >= trayDispenseLimitMs()) {
    digitalWrite(DISPENSER_RELAY_PIN, RELAY_OFF);
    countTrayFeed(); // what did reach the tray
    Serial.print(F("Tray "));
    Serial.print(currentTray);
    Serial.println(F(" dispense timeout; tray skipped."));
    trayFailed();
  }
}

// Goes on to the next spot, or the next tray after the last spot.
void leaveSpot() {
  if (currentSpot + 1 >= TRAY_SPOT_COUNT) {
    if (!trayAborted) {
      // Feed still falling is not on the scale yet; the day total only needs
      // this reading, the tray itself has already reached its target.
      countTrayFeed();
    }
    nextTray();
    return;
  }

  currentSpot++;
  enterCycleStep(CYCLE_TO_SPOT);
}

// Timed move to the next spot, a short settle, then dispense unless the tray
// is already at this spot's running target.
void runToSpot() {
  uint8_t trayIndex = currentTray - 1;

  if (isEndSwitchPressed() && !spotMoveDone && currentStop == TRAY_COUNT) {
    // The last tray sits under the far-end switch, so reaching it here still
    // means "over this tray": feed this spot where the hopper stopped.
    stopChain();
    spotMoveDone = true;
    spotArrivedMillis = millis();
    return;
  }

  if (isEndSwitchPressed() && !spotMoveDone) {
    // Reached the far end inside a tray: spot timings are too long.
    stopChain();
    if (!trayAborted) {
      countTrayFeed();
    }
    logEventToSD("END_LIMIT_EARLY");
    returnHome("END_LIMIT_EARLY");
    return;
  }

  if (!spotMoveDone) {
    if (!setChainDirection(CHAIN_FORWARD)) {
      return;
    }
    if (millis() - chainRunStartMillis >= spotGapMs(currentStop)) {
      stopChain();
      spotMoveDone = true;
      spotArrivedMillis = millis();
    }
    return;
  }

  // A failed tray only passes through.
  if (trayAborted) {
    leaveSpot();
    return;
  }

  readTrayWeight(trayIndex);

  if (millis() - spotArrivedMillis < TRAY_SPOT_SETTLE_MS) {
    return;
  }

  // The reading here already includes everything that fell.
  decideAtSpot(trayWeightsGrams[trayIndex]);
}

// Adds this tray's reading to the day total, once per tray.
void countTrayFeed() {
  if (trayFeedCounted || currentTray == 0) {
    return;
  }
  trayFeedCounted = true;
  // Only what this cycle added; the tray may already have held feed.
  float added = trayWeightsGrams[currentTray - 1] - trayStartGrams;
  if (added > 0.0f) {
    statAddFeed(added);
  }
}

// The current tray was not filled (dispense timeout or no load cell). The
// hopper still passes the remaining spots, because the next tray's travel time
// is measured from this tray's last spot.
void trayFailed() {
  trayAborted = true;
  trayFeedCounted = true;

  logEventToSD("TRAY_TIMEOUT");
  statTrayTimeout();

  if (cycleFailReason == NULL) {
    cycleFailReason = "TRAY_TIMEOUT";
  }

  // One alert per cycle so a jammed dispenser cannot flood the queue.
  if (!trayTimeoutAlertSent) {
    trayTimeoutAlertSent = true;
    queueAlertEvent("TRAY_TIMEOUT");
    triggerAlarm();
  }

  leaveSpot();
}

void nextTray() {
  if (currentStop < TRAY_COUNT) {
    setStop(currentStop + 1);
    enterCycleStep(CYCLE_TO_TRAY);
  } else {
    setStop(0);
    enterCycleStep(CYCLE_TO_END);
  }
}

// Tray number at a stop (1-5, in travel order).
uint8_t trayAtStop(uint8_t stop) {
  return START_LEFT ? TRAY_AT_POSITION[stop - 1]
                    : TRAY_AT_POSITION[TRAY_COUNT - stop];
}

// True while the chain or the dispenser is running.
bool motorRunning() {
  return chainDirection != CHAIN_STOPPED ||
         digitalRead(DISPENSER_RELAY_PIN) == RELAY_ON;
}

// Moves the cycle to a stop (0 = not at a tray).
void setStop(uint8_t stop) {
  currentStop = stop;
  currentTray = stop == 0 ? 0 : trayAtStop(stop);
}

// Skips the remaining trays and goes straight back to the home switch.
void returnHome(const char* reason) {
  digitalWrite(DISPENSER_RELAY_PIN, RELAY_OFF);

  if (cycleFailReason == NULL) {
    cycleFailReason = reason;
  }

  Serial.print(F("FEED CYCLE: returning home, "));
  Serial.println(reason);

  setStop(0);
  enterCycleStep(CYCLE_RETURNING);
}

void finishFeedCycle() {
  digitalWrite(DISPENSER_RELAY_PIN, RELAY_OFF);
  stopChain();
  feedingActive = false;
  setStop(0);
  enterCycleStep(CYCLE_IDLE);

  if (cycleFailReason == NULL) {
    Serial.println(F("FEED CYCLE COMPLETE"));
    logEventToSD("FEEDING_COMPLETED");
    queueAlertEvent("FEEDING_COMPLETED");
    finishRemoteCommand("SUCCESS", "");
    statCycleEnded(true);
  } else {
    Serial.print(F("FEED CYCLE ENDED WITH PROBLEM: "));
    Serial.println(cycleFailReason);
    logEventToSD("FEEDING_INCOMPLETE");
    finishRemoteCommand("FAILED", cycleFailReason);
    statCycleEnded(false);
  }
}

// A chain move did not reach its limit switch in time (jam, motor or
// switch fault). Stop in place; the next cycle homes first.
void chainFault() {
  Serial.print(F("CHAIN TIMEOUT during "));
  Serial.println(getCycleStepName(cycleStep));

  statChainFault();
  stopFeedCycle("CHAIN_TIMEOUT");
  queueAlertEvent("CHAIN_TIMEOUT");
  triggerAlarm();
  finishRemoteCommand("FAILED", "CHAIN_TIMEOUT");
}

// Immediate stop of the dispenser and chain (chain fault).
void stopFeedCycle(const char* reason) {
  digitalWrite(DISPENSER_RELAY_PIN, RELAY_OFF);
  stopChain();

  if (feedingActive &&
      (cycleStep == CYCLE_DISPENSING || cycleStep == CYCLE_TO_SPOT)) {
    countTrayFeed();
  }

  bool wasActive = feedingActive;
  feedingActive = false;
  setStop(0);
  cycleStep = CYCLE_IDLE;

  if (wasActive) {
    Serial.print(F("FEED CYCLE STOP | Reason: "));
    Serial.println(reason);
    logEventToSD(reason);
    statCycleEnded(false);
  }
}

const char* getCycleStepName(CycleStep step) {
  switch (step) {
    case CYCLE_HOMING:     return "HOMING";
    case CYCLE_TO_TRAY:    return "TO_TRAY";
    case CYCLE_TARING:     return "TARING";
    // Reported as DISPENSING: the database rules and the app know these names,
    // and moving between spots is part of dispensing a tray.
    case CYCLE_DISPENSING: return "DISPENSING";
    case CYCLE_TO_SPOT:    return "DISPENSING";
    case CYCLE_TO_END:     return "TO_END";
    case CYCLE_RETURNING:  return "RETURNING";
    default:               return "IDLE";
  }
}
