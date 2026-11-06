/*
  TrayZero.ino
  Keeps each tray's empty-tray zero (HX711 offset) in EEPROM.

  The zero is set with the serial command TARE <1-5|ALL> while the trays are
  EMPTY, and is reused after every reset or upload. Nothing tares on its own
  any more: a tray reads the feed actually in it, so a feed cycle dispenses
  only what each tray is missing (Feeding.ino, runTaring).

  Load cells drift slowly with temperature. If an empty tray reads more than
  a few grams, empty the trays and run TARE ALL again.

  Record at EEPROM address 128 (22 bytes); the schedule store uses 0-24, the
  manual target 32-39 and the day totals 64-115.
*/

#include <EEPROM.h>

const int TRAY_ZERO_STORE_ADDRESS = 128;
const uint8_t TRAY_ZERO_STORE_VERSION = 1;

struct TrayZeroStore {
  uint8_t version;
  long offsets[TRAY_COUNT];
  uint8_t checksum;
};

static_assert(sizeof(TrayZeroStore) == 22, "TrayZeroStore layout changed");

// Applies the saved zeros. Returns false if none are saved yet.
bool loadTrayZeros() {
  TrayZeroStore store;
  EEPROM.get(TRAY_ZERO_STORE_ADDRESS, store);

  uint8_t expected = scheduleChecksum((const uint8_t*)&store, sizeof(store) - 1);
  if (store.version != TRAY_ZERO_STORE_VERSION || store.checksum != expected) {
    return false;
  }

  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    trayScales[i].set_offset(store.offsets[i]);
  }
  return true;
}

// Below-zero drift fix (idle trays only). A tray cannot hold less than no
// feed, so a steady reading between TRAY_DRIFT_MIN_GRAMS and
// -TRAY_ZERO_DEADBAND_GRAMS is the zero drifting, never leftovers: after
// TRAY_DRIFT_STEADY_MS it is quietly re-zeroed and saved. Readings above
// zero are never touched, because a few grams there may be pellets a
// chicken left. Far below zero (tray lifted off, wiring) is left alone too.
void fixBelowZeroDrift(uint8_t trayIndex) {
  static unsigned long steadySinceMillis[TRAY_COUNT] = {0, 0, 0, 0, 0};
  static float steadyGrams[TRAY_COUNT] = {0, 0, 0, 0, 0};

  float grams = traySignedGrams[trayIndex];
  bool drifted = !feedingActive && trayZerosLoaded &&
                 grams < -TRAY_ZERO_DEADBAND_GRAMS && grams > TRAY_DRIFT_MIN_GRAMS;

  if (!drifted) {
    steadySinceMillis[trayIndex] = 0;
    return;
  }

  if (steadySinceMillis[trayIndex] == 0 ||
      fabs(grams - steadyGrams[trayIndex]) > TRAY_DRIFT_STEADY_BAND_GRAMS) {
    steadySinceMillis[trayIndex] = millis();
    steadyGrams[trayIndex] = grams;
    return;
  }

  if (millis() - steadySinceMillis[trayIndex] < TRAY_DRIFT_STEADY_MS) {
    return;
  }

  // Move the zero so this reading becomes 0 g: units = (raw - offset) / scale.
  HX711& scale = trayScales[trayIndex];
  scale.set_offset(scale.get_offset() + (long)(grams * scale.get_scale()));
  saveTrayZeros();
  steadySinceMillis[trayIndex] = 0;

  Serial.print(F("Tray "));
  Serial.print(trayIndex + 1);
  Serial.print(F(" zero drifted to "));
  Serial.print(grams, 1);
  Serial.println(F(" g; re-zeroed."));
  logEventToSD("TRAY_ZERO_DRIFT_FIXED");
}

// Saves the current offsets of all five scales.
void saveTrayZeros() {
  TrayZeroStore store;
  store.version = TRAY_ZERO_STORE_VERSION;
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    store.offsets[i] = trayScales[i].get_offset();
  }
  store.checksum = scheduleChecksum((const uint8_t*)&store, sizeof(store) - 1);
  EEPROM.put(TRAY_ZERO_STORE_ADDRESS, store);
  trayZerosLoaded = true;
}
