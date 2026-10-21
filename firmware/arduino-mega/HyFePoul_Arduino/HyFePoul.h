#ifndef HYFEPOUL_H
#define HYFEPOUL_H

#include <Arduino.h>
#include <RTClib.h>

// Ensure constants defined in Config.ino are visible to HyFePoul_Arduino.ino
extern const unsigned long MAIN_LOOP_DELAY_MS;

// Forward declarations for functions using DateTime to prevent
// Arduino builder parsing errors.
String formatTimestamp(const DateTime& dateTime);
DateTime getCurrentDateTime();
DateTime getLocalDateTime();

#endif
