/*
  HyFePoul - Arduino Mega 2560
  Main controller

  Architecture:
    Arduino Mega 2560 -> ESP32 -> Wi-Fi/Internet -> Backend -> Mobile/Web App

  The Mega remains the primary controller.
  ESP32 is only the Wi-Fi/Internet communication module.

  This project is intentionally split into multiple .ino files.
  Arduino IDE compiles all .ino files in this folder as one sketch.
*/

#include "HyFePoul.h"

void setup() {
  initializeSystem();
}

void loop() {
  // Safety is checked first so an emergency stop can take priority.
  handleSafety();
  handleLocalConsole();
  handleNextionInput();

  // Keep time updated from ESP32 network time when available.
  // RTC is used as the fallback source.
  updateTimeManager();

  // Read local sensors.
  updateFeedLevel();
  updateHydration();

  // Run local automation.
  handleFeeding();

  // Commissioning moves started from the USB serial monitor.
  updateBench();

  // Communicate with ESP32.
  handleESP32Communication();

  // Update local HMI.
  updateNextion();

  // Save periodic system data/events.
  handleSDLogging();

  // Non-blocking alarm handling.
  updateBuzzer();

  // Small loop interval. The wait keeps reading the ESP32 UART so command
  // lines longer than the 64-byte receive buffer are not cut off.
  waitServicingESP32(MAIN_LOOP_DELAY_MS);
}
