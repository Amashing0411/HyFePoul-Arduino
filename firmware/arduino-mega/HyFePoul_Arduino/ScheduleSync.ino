/*
  ScheduleSync.ino

  R-54: a schedule time saved on the Nextion reaches the app. The cloud copy
  (Firebase /schedules) and the Mega's schedules must not silently diverge or
  overwrite each other. The rule is: the latest change to reach the Mega wins,
  and the cloud is brought in line with it.

  - Panel save: the slot is marked pending (kept in EEPROM, so a restart does
    not lose it) and sent to the ESP32 as
        SCHED_LOCAL|IDX:<0-2>|HR:<h>|MIN:<m>|TGT:<grams>|EN:<0|1>
    The ESP32 writes it to /schedules/{deviceId}/sched_N and answers
        SCHED_SYNCED|IDX:<n>
    which clears the pending mark. Until then it is resent every 30 s.
  - While a slot is pending, a schedule restore from the cloud (command IDs
    R0-R2: an older cloud copy) is refused with LOCAL_EDIT_PENDING, so it
    cannot undo the panel edit. The restore goes on with the other slots.
  - A SCHEDULE_SET command from the app that arrives after the panel save is
    the newer change: it is applied and clears the pending mark.

  EEPROM: address 120 holds a marker byte, 121 the pending mask (bit per slot).
  The schedule store uses 0-24 and the daily totals 64-115.
*/

const int SCHEDULE_SYNC_ADDRESS = 120;
const uint8_t SCHEDULE_SYNC_MAGIC = 0x5B;
const unsigned long SCHEDULE_SYNC_RESEND_MS = 30000UL;

uint8_t scheduleWritebackMask = 0;  // bit i = slot i edited on the panel, not yet in the cloud
unsigned long lastScheduleWritebackMillis = 0;

void initializeScheduleSync() {
  if (EEPROM.read(SCHEDULE_SYNC_ADDRESS) == SCHEDULE_SYNC_MAGIC) {
    scheduleWritebackMask = EEPROM.read(SCHEDULE_SYNC_ADDRESS + 1) & 0x07;
  } else {
    scheduleWritebackMask = 0;
  }

  if (scheduleWritebackMask != 0) {
    Serial.print(F("Panel schedule edits waiting for the cloud: mask "));
    Serial.println(scheduleWritebackMask);
  }

  // First resend about 5 s after boot, once the ESP32 link is up.
  lastScheduleWritebackMillis = millis() - SCHEDULE_SYNC_RESEND_MS + 5000UL;
}

void saveScheduleSyncMask() {
  EEPROM.update(SCHEDULE_SYNC_ADDRESS, SCHEDULE_SYNC_MAGIC);
  EEPROM.update(SCHEDULE_SYNC_ADDRESS + 1, scheduleWritebackMask);
}

bool scheduleEditPending(uint8_t index) {
  return index < FEED_SCHEDULE_COUNT && (scheduleWritebackMask & (1 << index));
}

// Called by the Nextion schedule editor after it saved the slot to EEPROM.
void markScheduleEditedLocally(uint8_t index) {
  if (index >= FEED_SCHEDULE_COUNT) return;
  scheduleWritebackMask |= (1 << index);
  saveScheduleSyncMask();
  sendScheduleWriteback(index);
}

// A newer app edit replaced the slot, or the cloud confirmed the panel edit.
void clearScheduleEdit(uint8_t index) {
  if (!scheduleEditPending(index)) return;
  scheduleWritebackMask &= ~(1 << index);
  saveScheduleSyncMask();
}

void sendScheduleWriteback(uint8_t index) {
  const FeedSchedule& s = feedSchedules[index];
  ESP32_SERIAL.print(F("SCHED_LOCAL|IDX:"));
  ESP32_SERIAL.print(index);
  ESP32_SERIAL.print(F("|HR:"));
  ESP32_SERIAL.print(s.hour);
  ESP32_SERIAL.print(F("|MIN:"));
  ESP32_SERIAL.print(s.minute);
  ESP32_SERIAL.print(F("|TGT:"));
  ESP32_SERIAL.print(lround(s.targetGrams));
  ESP32_SERIAL.print(F("|EN:"));
  ESP32_SERIAL.println(s.enabled ? 1 : 0);
}

// Resends every pending slot every SCHEDULE_SYNC_RESEND_MS (also covers an
// ESP32 restart or a confirmation lost on the UART).
void handleScheduleSync() {
  if (scheduleWritebackMask == 0) return;
  if (millis() - lastScheduleWritebackMillis < SCHEDULE_SYNC_RESEND_MS) return;
  lastScheduleWritebackMillis = millis();

  for (uint8_t i = 0; i < FEED_SCHEDULE_COUNT; i++) {
    if (scheduleEditPending(i)) sendScheduleWriteback(i);
  }
}

// SCHED_SYNCED|IDX:<n> from the ESP32: the cloud now holds the panel edit.
void handleScheduleSynced(const String& line) {
  String idx = extractMegaValue(line, "IDX:");
  if (idx.length() == 0) return;
  int index = idx.toInt();
  if (index < 0 || index >= FEED_SCHEDULE_COUNT) return;
  clearScheduleEdit(index);
  Serial.print(F("Panel schedule edit saved to the cloud: slot "));
  Serial.println(index + 1);
}
