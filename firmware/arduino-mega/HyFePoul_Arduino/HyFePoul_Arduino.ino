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

void setup() {
  initializeSystem();
}

void loop() {
  // Safety is checked first so an emergency stop can take priority.
  handleSafety();

  // Keep time updated from ESP32 network time when available.
  // RTC is used as the fallback source.
  updateTimeManager();

  // Read local sensors.
  updateFeedLevel();
  updateHydration();

  // Run local automation.
  handleFeeding();

  // Communicate with ESP32.
  handleESP32Communication();

  // Update local HMI.
  updateNextion();

  // Save periodic system data/events.
  handleSDLogging();

  // Non-blocking alarm handling.
  updateBuzzer();

  // Small loop interval. Replace with millis()-based scheduling later
  // if tighter response time is required.
  delay(MAIN_LOOP_DELAY_MS);
}
