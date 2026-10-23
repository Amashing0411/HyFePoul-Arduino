/*
  Watchdog.ino

  Hardware watchdog for the Mega. If the program stops (a hang in a library,
  a stuck I2C bus, a fault), the AVR watchdog resets the board within
  WATCHDOG_TIMEOUT. Every relay starts OFF at boot (initializePins), so a
  hang cannot leave the chain or the dispenser running. The feed cycle is
  not resumed; the next one homes first, like after a power cut.

  loop() resets the timer once per pass (about every 100 ms). Setup runs
  with the watchdog off, so a slow SD card at boot cannot cause a reset loop.

  After a watchdog reset the AVR keeps the watchdog running at its shortest
  timeout, so it is switched off in .init3, before setup() and before any
  long start-up work. The reset cause is kept from there and logged as
  WATCHDOG_RESET on the SD card.

  Bench check (R-02): with nothing moving, type WDTEST on the serial monitor.
  The Mega must restart within about 2 s and print "Restarted by the
  watchdog". If it keeps restarting or hangs instead, the board has an old
  bootloader that mishandles the watchdog: burn the current Arduino Mega
  bootloader (Arduino IDE: Tools > Burn Bootloader) before relying on it.
*/

const uint8_t WATCHDOG_TIMEOUT = WDTO_2S;

// Reset cause (MCUSR), kept across the C runtime start-up.
uint8_t resetFlags __attribute__((section(".noinit")));

// Runs before main(): see the declaration in HyFePoul.h.
void captureResetFlags() {
  resetFlags = MCUSR;
  MCUSR = 0;
  wdt_disable();
}

// Called at the end of setup().
void startWatchdog() {
  if (resetFlags & _BV(WDRF)) {
    Serial.println(F("Restarted by the watchdog (the program had stopped)."));
    logEventToSD("WATCHDOG_RESET");
  }
  wdt_enable(WATCHDOG_TIMEOUT);
}

// Called every loop() pass, and inside long loops (SD directory scans).
void feedWatchdog() {
  wdt_reset();
}

// WDTEST bench command: stop the program on purpose to prove the reset.
void benchWatchdogTest() {
  const char* why = benchMotorBlocked();
  if (why != NULL) {
    Serial.print(F("Refused: "));
    Serial.println(why);
    return;
  }
  Serial.println(F("WDTEST: stopping the program; the Mega should restart in about 2 s."));
  Serial.flush();
  while (true) {
  }
}
