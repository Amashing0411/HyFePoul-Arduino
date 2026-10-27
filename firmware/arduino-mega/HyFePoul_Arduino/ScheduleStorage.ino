/*
  ScheduleStorage.ino

  Keeps the feeding schedules in EEPROM so they survive a reset or power
  loss without needing the network.

  Record at EEPROM address 0 (25 bytes):
    magic (2) | version (1) | 3 x { hour, minute, targetGrams (float), enabled } (21) | checksum (1)

  On boot the record is used only if magic, version, checksum and value
  ranges are all valid; otherwise the defaults in Config.ino stay in place.
  When online, the ESP32 later re-sends the RTDB schedules (source of
  truth), which overwrite these slots through SCHEDULE_SET.
*/

#include <EEPROM.h>

const uint16_t SCHEDULE_STORE_MAGIC = 0x4846; // "HF"
// Version 2: targetGrams is per tray (moving-hopper design). Version 1
// records held a total per feed and are ignored, so the defaults apply.
const uint8_t SCHEDULE_STORE_VERSION = 2;
const int SCHEDULE_STORE_ADDRESS = 0;

struct ScheduleStore {
  uint16_t magic;
  uint8_t version;
  FeedSchedule slots[FEED_SCHEDULE_COUNT];
  uint8_t checksum;
};

// The layout is mirrored in scripts/simulate-mega.js; changing it requires a
// SCHEDULE_STORE_VERSION bump.
static_assert(sizeof(ScheduleStore) == 25, "ScheduleStore layout changed");

// Rotate-and-XOR over the record bytes before the checksum field.
uint8_t scheduleChecksum(const uint8_t* data, size_t length) {
  uint8_t sum = 0;

  for (size_t i = 0; i < length; i++) {
    sum = (uint8_t)((sum << 1) | (sum >> 7)) ^ data[i];
  }

  return sum;
}

bool isValidScheduleSlot(uint8_t hour, uint8_t minute, float targetGrams) {
  return hour <= 23 &&
         minute <= 59 &&
         !isnan(targetGrams) &&
         targetGrams > 0.0f &&
         targetGrams <= MAX_TRAY_TARGET_GRAMS;
}

// Returns true when a valid record was found and copied into feedSchedules.
bool loadSchedulesFromEEPROM() {
  ScheduleStore store;
  EEPROM.get(SCHEDULE_STORE_ADDRESS, store);

  if (store.magic != SCHEDULE_STORE_MAGIC ||
      store.version != SCHEDULE_STORE_VERSION) {
    return false;
  }

  uint8_t expected = scheduleChecksum(
      (const uint8_t*)&store, offsetof(ScheduleStore, checksum));

  if (expected != store.checksum) {
    return false;
  }

  for (uint8_t i = 0; i < FEED_SCHEDULE_COUNT; i++) {
    if (!isValidScheduleSlot(store.slots[i].hour,
                             store.slots[i].minute,
                             store.slots[i].targetGrams)) {
      return false;
    }
  }

  for (uint8_t i = 0; i < FEED_SCHEDULE_COUNT; i++) {
    feedSchedules[i] = store.slots[i];
  }

  return true;
}

void saveSchedulesToEEPROM() {
  ScheduleStore store;
  store.magic = SCHEDULE_STORE_MAGIC;
  store.version = SCHEDULE_STORE_VERSION;

  for (uint8_t i = 0; i < FEED_SCHEDULE_COUNT; i++) {
    store.slots[i] = feedSchedules[i];
  }

  store.checksum = scheduleChecksum(
      (const uint8_t*)&store, offsetof(ScheduleStore, checksum));

  // put() uses EEPROM.update(), so unchanged bytes are not rewritten.
  EEPROM.put(SCHEDULE_STORE_ADDRESS, store);
}

void initializeSchedules() {
  if (loadSchedulesFromEEPROM()) {
    Serial.println(F("Schedules loaded from EEPROM."));
    logEventToSD("SCHEDULES_LOADED");
  } else {
    Serial.println(F("No valid schedules in EEPROM; using defaults."));
    logEventToSD("SCHEDULES_DEFAULTS");
  }
}

// Local manual-feed target lives in a separate EEPROM record so adding this
// HMI setting does not invalidate the existing schedule record/version.
const int MANUAL_TARGET_STORE_ADDRESS = 32;
const uint16_t MANUAL_TARGET_STORE_MAGIC = 0x4D46; // "MF"
const uint8_t MANUAL_TARGET_STORE_VERSION = 1;

struct ManualTargetStore {
  uint16_t magic;
  uint8_t version;
  float targetGrams;
  uint8_t checksum;
};

static_assert(sizeof(ManualTargetStore) == 8, "ManualTargetStore layout changed");

void initializeManualFeedTarget() {
  ManualTargetStore store;
  EEPROM.get(MANUAL_TARGET_STORE_ADDRESS, store);

  uint8_t expected = scheduleChecksum(
      (const uint8_t*)&store, offsetof(ManualTargetStore, checksum));

  if (store.magic == MANUAL_TARGET_STORE_MAGIC &&
      store.version == MANUAL_TARGET_STORE_VERSION &&
      store.checksum == expected &&
      !isnan(store.targetGrams) &&
      store.targetGrams >= 1.0f &&
      store.targetGrams <= MAX_TRAY_TARGET_GRAMS) {
    manualFeedTargetGrams = store.targetGrams;
    Serial.print(F("Manual feed target loaded: "));
    Serial.print(manualFeedTargetGrams, 0);
    Serial.println(F(" g per tray."));
    return;
  }

  manualFeedTargetGrams = DEFAULT_FEED_TARGET_GRAMS;
  Serial.println(F("Manual feed target: default 50 g per tray."));
}

bool saveManualFeedTarget(float targetGrams) {
  if (isnan(targetGrams) || targetGrams < 1.0f ||
      targetGrams > MAX_TRAY_TARGET_GRAMS) {
    return false;
  }

  ManualTargetStore store;
  store.magic = MANUAL_TARGET_STORE_MAGIC;
  store.version = MANUAL_TARGET_STORE_VERSION;
  store.targetGrams = targetGrams;
  store.checksum = scheduleChecksum(
      (const uint8_t*)&store, offsetof(ManualTargetStore, checksum));

  EEPROM.put(MANUAL_TARGET_STORE_ADDRESS, store);
  manualFeedTargetGrams = targetGrams;
  return true;
}
