#ifndef HYFEPOUL_H
#define HYFEPOUL_H

#include <Arduino.h>
#include <RTClib.h>
#include <avr/wdt.h>

// Ensure constants defined in Config.ino are visible to HyFePoul_Arduino.ino
extern const unsigned long MAIN_LOOP_DELAY_MS;

// Feed cycle steps (Feeding.ino). Declared here, before the builder's
// generated prototypes, because functions take these types.
enum CycleStep {
  CYCLE_IDLE,
  CYCLE_HOMING,      // reversing to the home switch before tray 1
  CYCLE_TO_TRAY,     // timed forward run to currentTray
  CYCLE_TARING,      // settling, then taring currentTray's load cell
  CYCLE_DISPENSING,  // dispenser on until currentTray reaches the target
  CYCLE_TO_END,      // forward to the end switch after the last tray
  CYCLE_RETURNING    // reversing to the home switch
};

enum ChainDirection {
  CHAIN_STOPPED,
  CHAIN_FORWARD,
  CHAIN_REVERSE
};

// One day of totals (DailyStats.ino).
struct DailyStats {
  uint16_t magic;
  uint8_t version;
  uint16_t year;  // 0 = date not known yet (clock not set)
  uint8_t month;
  uint8_t day;
  float feedGrams;
  uint16_t cyclesCompleted;
  uint16_t cyclesIncomplete;
  uint16_t trayTimeouts;
  uint16_t chainFaults;
  uint16_t lowWater;
  uint16_t lowFeed;
  uint16_t estops;
  uint8_t checksum;
};

// Watchdog.ino: runs in .init3, before main(), to read the reset cause and
// switch off a watchdog left running by a watchdog reset. naked: no
// prologue/epilogue, as required for the .initN sections.
void captureResetFlags(void) __attribute__((naked, used, section(".init3")));

void enterCycleStep(CycleStep step);
bool setChainDirection(ChainDirection direction);
const char* getCycleStepName(CycleStep step);

// Forward declarations for functions using DateTime to prevent
// Arduino builder parsing errors.
String formatTimestamp(const DateTime& dateTime);
DateTime getCurrentDateTime();
DateTime getLocalDateTime();

#endif
