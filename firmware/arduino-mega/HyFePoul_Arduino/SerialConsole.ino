/*
  SerialConsole.ino

  Commissioning commands on the USB serial monitor (115200 baud, newline).
  For the bench only: calibrating the tray load cells (R-11) and timing the
  chain travel to each tray (R-46) without the app.

    HELP                 list the commands
    STATUS               switches, float, hopper, chain, cycle, tray weights
    WEIGH                read all 5 trays (grams and raw counts)
    TARE <1-5|ALL>       zero a tray (empty tray on the load cell)
    CAL <1-5> <grams>    after TARE, put a known weight on the tray: sets
                         that tray's calibration factor (RAM only)
    FACTORS              print the factors as a Config.ino line to paste
    JOG <F|R> <ms>       run the chain 100-5000 ms; reports how long it ran
    HOME                 reverse to the home switch (30 s timeout)
    DISP <ms>            run the dispenser 100-5000 ms
    FEED <grams>         start a full 5-tray cycle at <grams> per tray
    STOP                 stop a bench move at once
    RESET                clear a latched E-stop (Safety.ino)

  Safety: motor commands are refused while the E-stop is latched, a feed
  cycle runs, or another bench move is active. Moves are non-blocking (the
  loop, the E-stop and the ESP32 link keep running) and go through the
  normal chain driver, so the relay interlock, dead time and limit switches
  still apply. A feed cycle cannot start during a bench move.
  WEIGH, TARE and CAL block for about a second while they average readings.
*/

enum BenchMove { BENCH_IDLE, BENCH_JOG, BENCH_HOME, BENCH_DISPENSE };

BenchMove benchMove = BENCH_IDLE;
ChainDirection benchJogDirection = CHAIN_STOPPED;
unsigned long benchDurationMs = 0;
unsigned long benchStartMillis = 0;
bool benchChainStarted = false;

const unsigned long BENCH_MIN_MS = 100;
const unsigned long BENCH_MAX_MS = 5000;

bool benchMoveActive() {
  return benchMove != BENCH_IDLE;
}

// Called from handleLocalConsole() for every line except RESET.
void handleBenchCommand(String line) {
  line.trim();
  line.toUpperCase();
  if (line.length() == 0) {
    return;
  }

  int sp = line.indexOf(' ');
  String cmd = sp < 0 ? line : line.substring(0, sp);
  String args = sp < 0 ? String("") : line.substring(sp + 1);
  args.trim();

  if (cmd == "HELP") {
    benchHelp();
  } else if (cmd == "STATUS") {
    benchStatus();
  } else if (cmd == "WEIGH") {
    benchWeigh();
  } else if (cmd == "TARE") {
    benchTare(args);
  } else if (cmd == "CAL") {
    benchCalibrate(args);
  } else if (cmd == "FACTORS") {
    benchPrintFactors();
  } else if (cmd == "JOG") {
    benchStartJog(args);
  } else if (cmd == "HOME") {
    benchStartHome();
  } else if (cmd == "DISP") {
    benchStartDispense(args);
  } else if (cmd == "FEED") {
    benchStartFeed(args);
  } else if (cmd == "STOP") {
    benchStop("stopped by STOP");
  } else {
    Serial.print(F("Unknown command: "));
    Serial.println(line);
    Serial.println(F("Type HELP for the list."));
  }
}

void benchHelp() {
  Serial.println(F("Bench commands: STATUS, WEIGH, TARE <1-5|ALL>, CAL <1-5> <grams>,"));
  Serial.println(F("FACTORS, JOG <F|R> <ms>, HOME, DISP <ms>, FEED <grams>, STOP, RESET"));
}

// Returns NULL when a motor command may run, otherwise why not.
const char* benchMotorBlocked() {
  if (emergencyStopActive) return "E-stop latched (release it and type RESET)";
  if (feedingActive) return "a feed cycle is running";
  if (benchMoveActive()) return "another bench move is running (STOP first)";
  return NULL;
}

bool benchCheckMotor() {
  const char* why = benchMotorBlocked();
  if (why != NULL) {
    Serial.print(F("Refused: "));
    Serial.println(why);
    return false;
  }
  return true;
}

// Parses a duration within the bench limits; prints an error and returns 0.
unsigned long benchParseMs(const String& s) {
  long ms = s.toInt();
  if (ms < (long)BENCH_MIN_MS || ms > (long)BENCH_MAX_MS) {
    Serial.print(F("Duration must be "));
    Serial.print(BENCH_MIN_MS);
    Serial.print(F("-"));
    Serial.print(BENCH_MAX_MS);
    Serial.println(F(" ms."));
    return 0;
  }
  return (unsigned long)ms;
}

// Tray number 1..5 -> index 0..4, or -1.
int benchParseTray(const String& s) {
  long n = s.toInt();
  if (n < 1 || n > TRAY_COUNT) {
    Serial.println(F("Tray must be 1-5."));
    return -1;
  }
  return (int)n - 1;
}

void benchStatus() {
  Serial.println(F("--- STATUS ---"));
  Serial.print(F("E-stop button: "));
  Serial.print(digitalRead(EMERGENCY_STOP_PIN) == LOW ? F("PRESSED") : F("released"));
  Serial.print(F("  latch: "));
  Serial.println(emergencyStopActive ? F("LATCHED") : F("clear"));
  Serial.print(F("Home switch: "));
  Serial.print(isHomeSwitchPressed() ? F("PRESSED") : F("open"));
  Serial.print(F("  End switch: "));
  Serial.println(isEndSwitchPressed() ? F("PRESSED") : F("open"));
  Serial.print(F("Reservoir float: "));
  Serial.println(isWaterLow() ? F("LOW") : F("ok"));
  float cm = readUltrasonicDistanceCm();
  Serial.print(F("Hopper: "));
  if (cm < 0) {
    Serial.print(F("no echo"));
  } else {
    Serial.print(cm, 1);
    Serial.print(F(" cm"));
  }
  Serial.print(F(" -> "));
  Serial.print(currentHopperLevelPercent, 0);
  Serial.println(F(" %"));
  Serial.print(F("Chain: "));
  Serial.print(chainDirection == CHAIN_FORWARD ? F("FORWARD") : chainDirection == CHAIN_REVERSE ? F("REVERSE") : F("stopped"));
  Serial.print(F("  Dispenser: "));
  Serial.println(digitalRead(DISPENSER_RELAY_PIN) == HIGH ? F("ON") : F("off"));
  Serial.print(F("Cycle: "));
  Serial.print(getCycleStepName(cycleStep));
  Serial.print(F("  tray "));
  Serial.print(currentTray);
  Serial.print(F("  ESP32: "));
  Serial.println(esp32Online ? F("online") : F("offline"));
  Serial.print(F("Trays (g):"));
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    Serial.print(' ');
    Serial.print(trayWeightsGrams[i], 1);
  }
  Serial.println();
}

void benchWeigh() {
  Serial.println(F("--- WEIGH (5 samples per tray) ---"));
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    Serial.print(F("Tray "));
    Serial.print(i + 1);
    Serial.print(F(": "));
    if (!trayScales[i].wait_ready_timeout(500)) {
      Serial.println(F("NOT READY (check wiring)"));
      continue;
    }
    long raw = trayScales[i].read_average(5);
    float grams = (raw - trayScales[i].get_offset()) / trayScales[i].get_scale();
    Serial.print(grams, 1);
    Serial.print(F(" g   raw "));
    Serial.print(raw);
    Serial.print(F("   factor "));
    Serial.println(trayScales[i].get_scale(), 1);
  }
}

void benchTare(const String& args) {
  if (feedingActive) {
    Serial.println(F("Refused: a feed cycle is running."));
    return;
  }
  uint8_t first = 0, last = TRAY_COUNT - 1;
  if (args != "ALL") {
    int t = benchParseTray(args);
    if (t < 0) return;
    first = last = t;
  }
  for (uint8_t i = first; i <= last; i++) {
    Serial.print(F("Tare tray "));
    Serial.print(i + 1);
    if (trayScales[i].wait_ready_timeout(500)) {
      trayScales[i].tare(10);
      trayWeightsGrams[i] = 0.0f;
      Serial.println(F(": done"));
    } else {
      Serial.println(F(": NOT READY"));
    }
  }
}

void benchCalibrate(const String& args) {
  if (feedingActive) {
    Serial.println(F("Refused: a feed cycle is running."));
    return;
  }
  int sp = args.indexOf(' ');
  if (sp < 0) {
    Serial.println(F("Usage: CAL <1-5> <grams>  (TARE the empty tray first)"));
    return;
  }
  int t = benchParseTray(args.substring(0, sp));
  if (t < 0) return;
  float grams = args.substring(sp + 1).toFloat();
  if (grams <= 0.0f) {
    Serial.println(F("Known weight must be more than 0 g."));
    return;
  }
  if (!trayScales[t].wait_ready_timeout(500)) {
    Serial.println(F("Tray load cell NOT READY."));
    return;
  }
  // get_value() = average raw minus the tare offset.
  float value = trayScales[t].get_value(10);
  if (fabs(value) < 1.0f) {
    Serial.println(F("No change from the tare reading: is the weight on the tray?"));
    return;
  }
  float factor = value / grams;
  trayScales[t].set_scale(factor);
  LOAD_CELL_CALIBRATION_FACTORS[t] = factor;
  Serial.print(F("Tray "));
  Serial.print(t + 1);
  Serial.print(F(" factor = "));
  Serial.println(factor, 2);
  Serial.println(F("Applied until reboot. Type FACTORS for the Config.ino line."));
}

void benchPrintFactors() {
  Serial.println(F("Paste into Config.ino:"));
  Serial.print(F("float LOAD_CELL_CALIBRATION_FACTORS[TRAY_COUNT] = {"));
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    Serial.print(' ');
    Serial.print(LOAD_CELL_CALIBRATION_FACTORS[i], 2);
    Serial.print(F("f"));
    if (i < TRAY_COUNT - 1) Serial.print(',');
  }
  Serial.println(F(" };"));
}

void benchStartJog(const String& args) {
  if (!benchCheckMotor()) return;
  int sp = args.indexOf(' ');
  String dir = sp < 0 ? args : args.substring(0, sp);
  if (sp < 0 || (dir != "F" && dir != "R")) {
    Serial.println(F("Usage: JOG <F|R> <ms>"));
    return;
  }
  unsigned long ms = benchParseMs(args.substring(sp + 1));
  if (ms == 0) return;
  benchJogDirection = dir == "F" ? CHAIN_FORWARD : CHAIN_REVERSE;
  benchDurationMs = ms;
  benchChainStarted = false;
  benchStartMillis = millis();
  benchMove = BENCH_JOG;
  Serial.print(F("JOG "));
  Serial.print(dir);
  Serial.print(F(" "));
  Serial.print(ms);
  Serial.println(F(" ms..."));
}

void benchStartHome() {
  if (!benchCheckMotor()) return;
  if (isHomeSwitchPressed()) {
    Serial.println(F("Already at home."));
    return;
  }
  benchJogDirection = CHAIN_REVERSE;
  benchChainStarted = false;
  benchStartMillis = millis();
  benchMove = BENCH_HOME;
  Serial.println(F("HOME..."));
}

void benchStartDispense(const String& args) {
  if (!benchCheckMotor()) return;
  unsigned long ms = benchParseMs(args);
  if (ms == 0) return;
  benchDurationMs = ms;
  benchStartMillis = millis();
  benchMove = BENCH_DISPENSE;
  digitalWrite(DISPENSER_RELAY_PIN, HIGH); // PLACEHOLDER: relay logic.
  Serial.print(F("DISP "));
  Serial.print(ms);
  Serial.println(F(" ms..."));
}

void benchStartFeed(const String& args) {
  if (benchMoveActive()) {
    Serial.println(F("Refused: another bench move is running (STOP first)."));
    return;
  }
  float grams = args.toFloat();
  if (grams <= 0.0f || grams > MAX_TRAY_TARGET_GRAMS) {
    Serial.println(F("Usage: FEED <grams per tray, 1-1000>"));
    return;
  }
  const char* reason = startFeedCycle(grams);
  if (reason != NULL) {
    Serial.print(F("Refused: "));
    Serial.println(reason);
  } else {
    logEventToSD("BENCH_FEED_STARTED");
  }
}

void benchStop(const char* why) {
  if (benchMove == BENCH_DISPENSE) {
    digitalWrite(DISPENSER_RELAY_PIN, LOW);
  } else if (benchMove != BENCH_IDLE) {
    stopChain();
  }
  if (benchMove != BENCH_IDLE) {
    Serial.print(F("Bench move ended: "));
    Serial.println(why);
  }
  benchMove = BENCH_IDLE;
}

// Advances a bench move; called every loop.
void updateBench() {
  if (benchMove == BENCH_IDLE) return;

  if (emergencyStopActive) {
    benchStop("E-stop");
    return;
  }

  if (benchMove == BENCH_DISPENSE) {
    if (millis() - benchStartMillis >= benchDurationMs) {
      benchStop("time up");
    }
    return;
  }

  // JOG and HOME drive the chain through the interlocked driver.
  if (!benchChainStarted) {
    if (setChainDirection(benchJogDirection)) {
      benchChainStarted = true;
    } else if (millis() - benchStartMillis > 2000) {
      // The driver refused (for example forward at the end switch).
      benchStop("could not start (limit switch pressed?)");
    }
    return;
  }

  unsigned long ran = millis() - chainRunStartMillis;

  // Checked before the generic limit-stop below: the home switch is the
  // goal of HOME (enforceChainLimits() may already have stopped the chain).
  if (benchMove == BENCH_HOME) {
    if (isHomeSwitchPressed()) {
      stopChain();
      Serial.print(F("Home reached after "));
      Serial.print(ran);
      Serial.println(F(" ms."));
      benchMove = BENCH_IDLE;
    } else if (chainDirection == CHAIN_STOPPED) {
      Serial.println(F("HOME: chain stopped before the home switch."));
      benchMove = BENCH_IDLE;
    } else if (ran >= CHAIN_HOME_TIMEOUT_MS) {
      benchStop("HOME timed out (check the home switch)");
    }
    return;
  }

  if (chainDirection == CHAIN_STOPPED) {
    // enforceChainLimits() stopped it at a switch.
    Serial.print(F("Limit switch reached after "));
    Serial.print(ran);
    Serial.println(F(" ms."));
    benchMove = BENCH_IDLE;
    return;
  }

  if (ran >= benchDurationMs) {
    stopChain();
    Serial.print(F("JOG done: ran "));
    Serial.print(ran);
    Serial.println(F(" ms."));
    benchMove = BENCH_IDLE;
  }
}
