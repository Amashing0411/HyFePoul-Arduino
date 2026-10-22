#ifndef HYFEPOUL_H
#define HYFEPOUL_H

#include <Arduino.h>
#include <RTClib.h>

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

void enterCycleStep(CycleStep step);
bool setChainDirection(ChainDirection direction);
const char* getCycleStepName(CycleStep step);

// Forward declarations for functions using DateTime to prevent
// Arduino builder parsing errors.
String formatTimestamp(const DateTime& dateTime);
DateTime getCurrentDateTime();
DateTime getLocalDateTime();

#endif
