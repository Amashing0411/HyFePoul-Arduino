/*
  TrayZero.ino
  Keeps each tray's empty-tray zero (HX711 offset) in EEPROM.

  The zero is set with the serial command TARE <1-5|ALL> while the trays are
  EMPTY, and is reused after every reset or upload. Nothing tares on its own
  any more: a tray reads the feed actually in it, so a feed cycle dispenses
  only what each tray is missing (Feeding.ino, runTaring).

  Load cells drift slowly with temperature. Small drift near zero is
  re-zeroed automatically (TrayWeights.ino); after a large change, empty the
  trays and run TARE ALL again.

  Record at EEPROM address 128 (22 bytes); the schedule store uses 0-24, the
  manual target 32-39 and the day totals 64-115.
*/

#include <EEPROM.h>

const int TRAY_ZERO_STORE_ADDRESS = 128;
const uint8_t TRAY_ZERO_STORE_VERSION = 2; // 2: trays 4 and 5 renumbered

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
  if (store.checksum != expected || (store.version != TRAY_ZERO_STORE_VERSION && store.version != 1)) {
    return false;
  }
  if (store.version == 1) {
    // Saved before trays 4 and 5 were renumbered: each zero belongs to its board.
    long t = store.offsets[3]; store.offsets[3] = store.offsets[4]; store.offsets[4] = t;
    for (uint8_t i = 0; i < TRAY_COUNT; i++) trayScales[i].set_offset(store.offsets[i]);
    saveTrayZeros();
    Serial.println(F("Tray zeros moved to the new tray 4 / 5 numbering."));
    return true;
  }

  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    trayScales[i].set_offset(store.offsets[i]);
  }
  return true;
}

// Drift is now handled by trackTrayZero() in TrayWeights.ino.

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
