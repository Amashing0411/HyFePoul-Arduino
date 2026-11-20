/*
  TrayWeights.ino
  Turns raw HX711 samples into tray weights that ignore noise.

  Each sample goes through three steps:
    1. Spike guard: a sample that jumps more than TRAY_SPIKE_GRAMS from the
       last one is only accepted if the next sample agrees (a knock or a bad
       read is dropped; real feed arriving is confirmed by the next sample).
    2. Median of the last TRAY_FILTER_SAMPLES samples (single odd readings
       never move it).
    3. Hold: a new median must stay within TRAY_HOLD_BAND_GRAMS for
       TRAY_SHOW_HOLD_MS before it counts (knocks and wind last a second or
       two and are never shown).
    4. Whole grams with a little hysteresis, and a zero band
       (TRAY_ZERO_DEADBAND_GRAMS): the shown value only changes when the
       held value moves at least TRAY_SHOW_STEP_GRAMS away from it.

  While the hopper is pouring into a tray, that tray uses the latest sample
  (after the spike guard) instead, so the stop decision is as fast as before.

  Zero tracking (idle only): the lowest reading a tray keeps returning to
  over TRAY_ZERO_TRACK_MS, if it is within TRAY_ZERO_TRACK_BAND_GRAMS of zero,
  becomes the new zero and is saved (TrayZero.ino). Short upward bumps
  (drips, wind, a bird) are ignored. Load cells drift slowly with
  temperature; feed arrives in steps, so it is never mistaken for drift. A
  few grams of leftovers sitting perfectly still for that long are treated
  as zero too: below this band the machine counts the tray as empty.

  Scale faults: no new sample for TRAY_STALE_MS, a reading outside
  TRAY_MIN_PLAUSIBLE_GRAMS..TRAY_MAX_PLAUSIBLE_GRAMS, or the exact same raw
  count TRAY_FROZEN_SAMPLES times in a row (a stuck board). A faulty tray is
  skipped by the feed cycle and shows 0.
*/

// Filter state (trayHistory, trayMedianGrams, trayScaleFault ...) is declared in Config.ino.

// True while the feed cycle is pouring into, or deciding about, this tray.
bool trayIsBeingFed(uint8_t trayIndex) {
  return feedingActive && currentTray == trayIndex + 1 &&
         (cycleStep == CYCLE_TARING || cycleStep == CYCLE_DISPENSING || cycleStep == CYCLE_TO_SPOT);
}

float medianOf(const float* values, uint8_t count) {
  float sorted[TRAY_FILTER_SAMPLES];
  for (uint8_t i = 0; i < count; i++) sorted[i] = values[i];
  for (uint8_t i = 1; i < count; i++) {
    float v = sorted[i];
    int8_t j = i - 1;
    while (j >= 0 && sorted[j] > v) { sorted[j + 1] = sorted[j]; j--; }
    sorted[j + 1] = v;
  }
  return count == 0 ? 0.0f : sorted[count / 2];
}

void pushTraySample(uint8_t t, float grams) {
  trayHistory[t][trayHistoryNext[t]] = grams;
  trayHistoryNext[t] = (trayHistoryNext[t] + 1) % TRAY_FILTER_SAMPLES;
  if (trayHistoryCount[t] < TRAY_FILTER_SAMPLES) trayHistoryCount[t]++;
  trayMedianGrams[t] = medianOf(trayHistory[t], trayHistoryCount[t]);
}

// Forget the history (after a re-zero or a fresh weigh) and start from one value.
void resetTrayFilter(uint8_t t, float grams) {
  trayHeldGrams[t] = grams;
  trayHoldCandidate[t] = grams;
  trayHoldSince[t] = 0;
  trayHistoryCount[t] = 0;
  trayHistoryNext[t] = 0;
  trayHasPendingSpike[t] = false;
  trayLastSample[t] = grams;
  trayHasSample[t] = true;
  pushTraySample(t, grams);
}

// Whole grams for display, data and day totals.
float wholeGrams(float grams) {
  if (grams < TRAY_ZERO_DEADBAND_GRAMS) return 0.0f;
  return (float)lround(grams);
}

void updateFeedTotal() {
  float total = 0.0f;
  for (uint8_t i = 0; i < TRAY_COUNT; i++) total += wholeGrams(trayWeightsGrams[i]);
  currentFeedWeightGrams = total;
}

// Reads one tray if its HX711 has a conversion ready (non-blocking).
void readTrayWeight(uint8_t t) {
  HX711& scale = trayScales[t];

  // "No new readings" only counts while this tray is actually being read:
  // the feed cycle reads one tray at a time and TARE/WEIGH pause the loop,
  // so a gap between calls is not a silent board.
  static unsigned long lastCall[TRAY_COUNT] = {0, 0, 0, 0, 0};
  static unsigned long notReadySince[TRAY_COUNT] = {0, 0, 0, 0, 0};
  unsigned long now = millis();
  bool gap = now - lastCall[t] > 400UL;
  lastCall[t] = now;

  if (!scale.is_ready()) {
    if (notReadySince[t] == 0 || gap) notReadySince[t] = now;
    if (now - notReadySince[t] > TRAY_STALE_MS && !trayScaleFault[t]) {
      trayScaleFault[t] = true;
      Serial.print(F("SCALE FAULT tray ")); Serial.print(t + 1); Serial.println(F(": no new readings"));
      logEventToSD("SCALE_FAULT");
    }
    return;
  }
  notReadySince[t] = 0;

  long raw = scale.read();
  trayLastSampleMillis[t] = now;
  float grams = ((float)raw - (float)scale.get_offset()) / scale.get_scale();

  // A board that returns the exact same count again and again has stopped converting.
  trayFrozenCount[t] = (trayHasSample[t] && raw == trayLastRaw[t]) ? trayFrozenCount[t] + 1 : 0;
  trayLastRaw[t] = raw;
  bool implausible = grams > TRAY_MAX_PLAUSIBLE_GRAMS || grams < TRAY_MIN_PLAUSIBLE_GRAMS;
  bool fault = implausible || trayFrozenCount[t] >= TRAY_FROZEN_SAMPLES;
  if (fault != trayScaleFault[t]) {
    trayScaleFault[t] = fault;
    Serial.print(F("SCALE ")); Serial.print(fault ? F("FAULT") : F("OK")); Serial.print(F(" tray ")); Serial.print(t + 1);
    if (fault) { Serial.print(F(": ")); Serial.print(implausible ? F("reading out of range ") : F("stuck at the same value ")); Serial.print(grams, 1); Serial.print(F(" g")); }
    Serial.println();
    if (fault) logEventToSD("SCALE_FAULT");
  }

  // Spike guard: a big jump counts only if the next sample confirms it.
  if (trayHasSample[t] && fabs(grams - trayLastSample[t]) > TRAY_SPIKE_GRAMS) {
    if (!trayHasPendingSpike[t] || fabs(grams - trayPendingSpike[t]) > TRAY_SPIKE_GRAMS) {
      trayPendingSpike[t] = grams;
      trayHasPendingSpike[t] = true;
      return;
    }
  }
  trayHasPendingSpike[t] = false;
  trayLastSample[t] = grams;
  trayHasSample[t] = true;
  traySignedGrams[t] = grams;
  pushTraySample(t, grams);

  if (trayScaleFault[t]) {
    trayWeightsGrams[t] = 0.0f;
  } else if (trayIsBeingFed(t)) {
    // Pouring: the newest sample, so the auger stops on time.
    trayWeightsGrams[t] = grams < TRAY_ZERO_DEADBAND_GRAMS ? 0.0f : grams;
  } else {
    // Idle: the median must hold before it counts, then whole grams that
    // only move by a full step.
    float med = trayMedianGrams[t];
    if (fabs(med - trayHoldCandidate[t]) > TRAY_HOLD_BAND_GRAMS) {
      trayHoldCandidate[t] = med;
      trayHoldSince[t] = millis();
    } else if (millis() - trayHoldSince[t] >= TRAY_SHOW_HOLD_MS) {
      trayHeldGrams[t] = med;
    }
    float m = trayHeldGrams[t];
    float shown = trayWeightsGrams[t];
    if (m < TRAY_ZERO_DEADBAND_GRAMS) shown = 0.0f;
    else if (fabs(m - shown) >= TRAY_SHOW_STEP_GRAMS || shown == 0.0f) shown = (float)lround(m);
    trayWeightsGrams[t] = shown;
  }
  updateFeedTotal();
}

// Idle zero tracking: slow drift near zero is removed, in either direction.
// It follows the LOWEST reading over the window: drips, wind and birds only
// ever add weight for a few seconds, so upward bumps are ignored, and the
// zero moves to the floor the tray keeps coming back to. A floor that keeps
// falling (still settling) restarts the window.
void trackTrayZero(uint8_t t) {
  static unsigned long windowStart[TRAY_COUNT] = {0, 0, 0, 0, 0};
  static float floorGrams[TRAY_COUNT];

  float m = trayMedianGrams[t];
  bool allowed = !feedingActive && !benchMoveActive() && trayZerosLoaded && !trayScaleFault[t] &&
                 trayHistoryCount[t] >= TRAY_FILTER_SAMPLES;
  if (!allowed) { windowStart[t] = 0; return; }

  if (windowStart[t] == 0) { windowStart[t] = millis(); floorGrams[t] = m; return; }
  if (m < floorGrams[t] - TRAY_ZERO_TRACK_STEADY_GRAMS) {
    // Still settling downward: start again from the new floor.
    windowStart[t] = millis(); floorGrams[t] = m; return;
  }
  if (m < floorGrams[t]) floorGrams[t] = m;
  if (millis() - windowStart[t] < TRAY_ZERO_TRACK_MS) return;

  float f = floorGrams[t];
  windowStart[t] = 0;
  // Only small offsets near zero are drift; a floor above the band is feed.
  if (f <= TRAY_DRIFT_MIN_GRAMS || f >= TRAY_ZERO_TRACK_BAND_GRAMS || fabs(f) < TRAY_ZERO_TRACK_MIN_GRAMS) return;

  // Move the zero so the floor becomes 0 g: units = (raw - offset) / scale.
  HX711& scale = trayScales[t];
  scale.set_offset(scale.get_offset() + (long)(f * scale.get_scale()));
  saveTrayZeros();
  resetTrayFilter(t, wholeGrams(m - f));
  trayWeightsGrams[t] = wholeGrams(m - f);
  updateFeedTotal();

  Serial.print(F("Tray ")); Serial.print(t + 1);
  Serial.print(F(" zero drifted to ")); Serial.print(f, 1); Serial.println(F(" g; re-zeroed."));
  logEventToSD("TRAY_ZERO_TRACKED");
}
