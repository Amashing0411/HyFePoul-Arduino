/*
  DailyStats.ino

  Per-day totals for the owner's monthly view in the app (and the SD log).
  Counted on the Mega, which knows what actually happened:
    feed dispensed (grams, from each tray's load cell when that tray stops
    dispensing), feed cycles completed / incomplete, tray timeouts, chain
    faults, low-water and low-feed episodes, E-stops.

  Days follow local time (UTC+8), like the schedules. Today's and
  yesterday's records are kept in EEPROM (from address 64; the schedule
  store uses 0-24), so a reboot does not lose the day. EEPROM.put only
  writes changed bytes, and the counters change a few dozen times a day.

  The Mega sends both records to the ESP32 after every feed cycle, at the
  day change, and every 30 minutes:
    SUMMARY|YYYY-MM-DD|feedG|done|incomplete|trayTimeouts|chainFaults|lowWater|lowFeed|estops
  The ESP32 writes each to dailySummary/{deviceId}/{YYYY-MM-DD} with PUT, so
  repeats are harmless and yesterday's final numbers still arrive if the
  ESP32 was offline at midnight.
*/

#include <EEPROM.h>

// struct DailyStats is declared in HyFePoul.h (functions take it).

// Mirrored in scripts/simulate-mega.js; a layout change needs a version bump.
static_assert(sizeof(DailyStats) == 26, "DailyStats layout changed");

const uint16_t DAILY_STATS_MAGIC = 0x4453; // "DS"
const uint8_t DAILY_STATS_VERSION = 1;
const int DAILY_STATS_ADDRESS = 64;
const unsigned long DAILY_SUMMARY_INTERVAL_MS = 30UL * 60UL * 1000UL;

DailyStats statsToday;
DailyStats statsYesterday;
unsigned long lastSummarySentMillis = 0;

void clearStats(DailyStats& s) {
  memset(&s, 0, sizeof(s));
  s.magic = DAILY_STATS_MAGIC;
  s.version = DAILY_STATS_VERSION;
}

void sealStats(DailyStats& s) {
  s.checksum = scheduleChecksum((const uint8_t*)&s, sizeof(s) - 1);
}

bool statsValid(const DailyStats& s) {
  return s.magic == DAILY_STATS_MAGIC && s.version == DAILY_STATS_VERSION &&
         s.checksum == scheduleChecksum((const uint8_t*)&s, sizeof(s) - 1);
}

void saveDailyStats() {
  sealStats(statsToday);
  sealStats(statsYesterday);
  EEPROM.put(DAILY_STATS_ADDRESS, statsToday);
  EEPROM.put(DAILY_STATS_ADDRESS + sizeof(DailyStats), statsYesterday);
}

void initializeDailyStats() {
  EEPROM.get(DAILY_STATS_ADDRESS, statsToday);
  EEPROM.get(DAILY_STATS_ADDRESS + sizeof(DailyStats), statsYesterday);
  if (!statsValid(statsToday)) clearStats(statsToday);
  if (!statsValid(statsYesterday)) clearStats(statsYesterday);
  updateDailyStatsDate();
}

// Starts a new day record when the local date changes. A record kept while
// the clock was unknown (year 0) is adopted by the first valid date.
void updateDailyStatsDate() {
  if (currentTimeSource == TIME_SOURCE_INVALID) return;
  DateTime local = getLocalDateTime();
  if (local.year() < 2024) return;

  if (statsToday.year == local.year() && statsToday.month == local.month() &&
      statsToday.day == local.day()) {
    return;
  }

  if (statsToday.year == 0) {
    // Counts gathered before the clock was set belong to today.
  } else {
    statsYesterday = statsToday;
    clearStats(statsToday);
  }
  statsToday.year = local.year();
  statsToday.month = local.month();
  statsToday.day = local.day();
  saveDailyStats();
  sendDailySummaries();
}

void handleDailyStats() {
  updateDailyStatsDate();
  if (millis() - lastSummarySentMillis >= DAILY_SUMMARY_INTERVAL_MS) {
    sendDailySummaries();
  }
}

void sendDailySummaryLine(const DailyStats& s) {
  if (s.year == 0) return;
  char date[11];
  snprintf(date, sizeof(date), "%04u-%02u-%02u", s.year, s.month, s.day);
  ESP32_SERIAL.print(F("SUMMARY|"));
  ESP32_SERIAL.print(date);
  ESP32_SERIAL.print('|');
  ESP32_SERIAL.print(s.feedGrams, 0);
  ESP32_SERIAL.print('|');
  ESP32_SERIAL.print(s.cyclesCompleted);
  ESP32_SERIAL.print('|');
  ESP32_SERIAL.print(s.cyclesIncomplete);
  ESP32_SERIAL.print('|');
  ESP32_SERIAL.print(s.trayTimeouts);
  ESP32_SERIAL.print('|');
  ESP32_SERIAL.print(s.chainFaults);
  ESP32_SERIAL.print('|');
  ESP32_SERIAL.print(s.lowWater);
  ESP32_SERIAL.print('|');
  ESP32_SERIAL.print(s.lowFeed);
  ESP32_SERIAL.print('|');
  ESP32_SERIAL.println(s.estops);
}

void sendDailySummaries() {
  lastSummarySentMillis = millis();
  sendDailySummaryLine(statsYesterday);
  sendDailySummaryLine(statsToday);
}

// ---- counters (called where the events happen) ----

void statAddFeed(float grams) {
  if (grams > 0.0f) statsToday.feedGrams += grams;
}

void statCycleEnded(bool completed) {
  if (completed) {
    statsToday.cyclesCompleted++;
  } else {
    statsToday.cyclesIncomplete++;
  }
  saveDailyStats();
  sendDailySummaries();
}

void statCount(uint16_t& counter) {
  counter++;
  saveDailyStats();
}

void statTrayTimeout() { statCount(statsToday.trayTimeouts); }
void statChainFault() { statCount(statsToday.chainFaults); }
void statLowWater() { statCount(statsToday.lowWater); }
void statLowFeed() { statCount(statsToday.lowFeed); }
void statEmergencyStop() { statCount(statsToday.estops); }
