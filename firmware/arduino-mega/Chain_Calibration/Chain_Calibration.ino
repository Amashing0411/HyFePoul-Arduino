/*
  Chain_Calibration.ino

  Stand-alone chain timing calibration for HyFePoul. Upload this instead of
  the full firmware. It only drives the two chain relays and reads the two
  limit switches and the E-stop; the dispenser, load cells, ESP32, SD and
  Nextion are not touched.

  The hopper starts at the limit switch on the START side (left or right).
  You time the run to tray 1, then from tray 1 to tray 2, and so on to
  tray 5; after tray 5 it keeps going until the far limit switch stops it.
  The results are printed as lines to paste into HyFePoul_Arduino/Config.ino.

  Pins (same as Config.ino; PLACEHOLDERS where marked there):
    chain relay that moves the hopper to the RIGHT   10
    chain relay that moves the hopper to the LEFT     9
    LEFT limit switch                                45
    RIGHT limit switch                               46
    E-stop button                                    37
  Run Inputs_Calibration and Outputs_Calibration first, and copy their
  polarity results (RELAY_ON, LIMIT_SWITCH_PRESSED, ESTOP_PRESSED) below.
  Use JOG first to check which relay moves which way; SWAP fixes it.

  Serial Monitor: 115200 baud, line ending "New Line".

    HELP                 list the commands
    STATUS               switches, start side, relay mapping, recorded times
    SIDE <L|R>           start side (where tray 1 is nearest)
    JOG <L|R> <ms>       move toward the left/right 100-5000 ms (stops at
                         that side's limit switch)
    SWAP                 swap which relay is "left" and which is "right"
    HOME                 move to the start side's limit switch (30 s max)
    GO                   from the start switch, start moving toward tray 1
    M                    "mark": stop now, the outlet is over this tray
    NEXT                 move on to the next tray (after tray 5: on to the
                         far limit switch, then stop)
    PLAY                 replay the recorded times from the start switch,
                         stopping at each tray (NEXT continues)
    SET <1-5> <ms>       change one recorded time by hand
    RESULT               print the lines for Config.ino
    STOP                 stop the motor at once (any time)

  Timing run:
    HOME, then GO. When the outlet is over tray 1 type M. Check it; type
    NEXT, then M over tray 2, ... After M at tray 5, NEXT runs to the far
    limit switch and stops. RESULT prints the times. PLAY repeats the run
    from the recorded times so you can check every stop; adjust with SET.
    Each time is measured from when the relay switched on, the same way the
    firmware times its moves. Your reaction time is part of each mark, so
    check with PLAY and fine-tune with SET.

  Safety: chain only, dispenser off. Keep a hand on the E-stop. Pressing the
  E-stop, typing STOP, or reaching the limit switch in the direction of
  travel stops the motor. No single move runs longer than 30 s.
*/

const uint8_t TRAY_COUNT = 5;

// Pins: keep in step with HyFePoul_Arduino/Config.ino.
uint8_t relayToRightPin = 10;
uint8_t relayToLeftPin  = 9;
const uint8_t LEFT_LIMIT_PIN  = 45;
const uint8_t RIGHT_LIMIT_PIN = 46;
const uint8_t EMERGENCY_STOP_PIN = 37;
const uint8_t DISPENSER_RELAY_PIN = 8;   // held off, never switched on here

// Polarity: copy from Config.ino (set there from Inputs_Calibration and
// Outputs_Calibration RESULT). PLACEHOLDERS until those are run.
const uint8_t RELAY_ON = HIGH;              // LOW for an active-LOW relay board
const uint8_t LIMIT_SWITCH_PRESSED = LOW;   // HIGH for normally-closed switches
const uint8_t ESTOP_PRESSED = LOW;          // HIGH for a normally-closed E-stop

const unsigned long DEAD_TIME_MS = 300;     // both relays off before a move
const unsigned long MAX_MOVE_MS = 30000;    // safety cap for any single move
const unsigned long JOG_MIN_MS = 100;
const unsigned long JOG_MAX_MS = 5000;

enum Side { SIDE_LEFT, SIDE_RIGHT };
enum Mode { IDLE, JOGGING, HOMING, MARKING, TO_LIMIT, PLAYING, PLAY_WAIT };

Side startSide = SIDE_LEFT;                 // PLACEHOLDER: pick with SIDE
Mode mode = IDLE;

bool moving = false;
Side moveSide = SIDE_LEFT;                  // direction of the current move
unsigned long moveStartMillis = 0;          // relay on
unsigned long moveLimitMs = 0;              // JOG / PLAY segment length
unsigned long stopMillis = 0;

uint8_t stopIndex = 0;                      // trays reached so far in GO / PLAY
unsigned long trayTimes[TRAY_COUNT] = {0, 0, 0, 0, 0};
unsigned long endTimeMs = 0;                // tray 5 -> far limit
bool estopLatched = false;
String inputLine = "";

void setup() {
  relayWrite(relayToRightPin, false);
  relayWrite(relayToLeftPin, false);
  relayWrite(DISPENSER_RELAY_PIN, false);
  pinMode(relayToRightPin, OUTPUT);
  pinMode(relayToLeftPin, OUTPUT);
  pinMode(DISPENSER_RELAY_PIN, OUTPUT);

  pinMode(LEFT_LIMIT_PIN, INPUT_PULLUP);
  pinMode(RIGHT_LIMIT_PIN, INPUT_PULLUP);
  pinMode(EMERGENCY_STOP_PIN, INPUT_PULLUP);

  Serial.begin(115200);
  Serial.println();
  Serial.println(F("HyFePoul chain timing calibration"));
  Serial.println(F("Chain only: dispenser stays off. Keep a hand on the E-stop."));
  printStatus();
  printHelp();
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n') {
      handleCommand(inputLine);
      inputLine = "";
    } else if (c != '\r' && inputLine.length() < 40) {
      inputLine += c;
    }
  }

  checkEstop();
  updateMove();
}

// ---------------- motor ----------------

void relayWrite(uint8_t pin, bool on) {
  digitalWrite(pin, on ? RELAY_ON : (RELAY_ON == HIGH ? LOW : HIGH));
}

Side otherSide(Side s) { return s == SIDE_LEFT ? SIDE_RIGHT : SIDE_LEFT; }
Side farSide() { return otherSide(startSide); }

const __FlashStringHelper* sideName(Side s) {
  return s == SIDE_LEFT ? F("LEFT") : F("RIGHT");
}

bool limitPressed(Side s) {
  return digitalRead(s == SIDE_LEFT ? LEFT_LIMIT_PIN : RIGHT_LIMIT_PIN) == LIMIT_SWITCH_PRESSED;
}

void stopMotor() {
  relayWrite(relayToRightPin, false);
  relayWrite(relayToLeftPin, false);
  if (moving) {
    moving = false;
    stopMillis = millis();
  }
}

// Starts a move toward side s. Returns false (and says why) if it cannot.
bool startMove(Side s, unsigned long limitMs) {
  if (estopLatched) {
    Serial.println(F("Refused: E-stop. Release it and type STATUS."));
    return false;
  }
  if (limitPressed(s)) {
    Serial.print(F("Refused: already at the "));
    Serial.print(sideName(s));
    Serial.println(F(" limit switch."));
    return false;
  }

  stopMotor();
  unsigned long sinceStop = millis() - stopMillis;
  if (sinceStop < DEAD_TIME_MS) {
    delay(DEAD_TIME_MS - sinceStop);       // both relays off before reversing
  }

  uint8_t onPin = (s == SIDE_RIGHT) ? relayToRightPin : relayToLeftPin;
  uint8_t offPin = (s == SIDE_RIGHT) ? relayToLeftPin : relayToRightPin;
  relayWrite(offPin, false);
  relayWrite(onPin, true);

  moving = true;
  moveSide = s;
  moveLimitMs = limitMs;
  moveStartMillis = millis();
  return true;
}

unsigned long runTime() {
  return millis() - moveStartMillis;
}

void checkEstop() {
  bool pressed = digitalRead(EMERGENCY_STOP_PIN) == ESTOP_PRESSED;
  if (pressed && !estopLatched) {
    estopLatched = true;
    stopMotor();
    mode = IDLE;
    Serial.println(F("!!! E-STOP: motor stopped. Release it, then type STATUS."));
  }
}

// Runs every loop: limit switches, timed ends, safety cap.
void updateMove() {
  if (!moving) return;

  if (limitPressed(moveSide)) {
    unsigned long t = runTime();
    stopMotor();
    onLimit(t);
    return;
  }

  if (runTime() >= MAX_MOVE_MS) {
    stopMotor();
    Serial.println(F("Stopped: 30 s without reaching a switch. Check the chain and switch."));
    mode = IDLE;
    return;
  }

  if ((mode == JOGGING || mode == PLAYING) && runTime() >= moveLimitMs) {
    unsigned long t = runTime();
    stopMotor();
    if (mode == JOGGING) {
      Serial.print(F("JOG done: ran "));
      Serial.print(t);
      Serial.println(F(" ms."));
      mode = IDLE;
    } else {
      stopIndex++;
      Serial.print(F("PLAY: stopped at tray "));
      Serial.print(stopIndex);
      Serial.println(F(". Check the outlet is over it; NEXT to continue (SET to adjust)."));
      mode = PLAY_WAIT;
    }
  }
}

// The limit switch in the direction of travel was reached.
void onLimit(unsigned long t) {
  Serial.print(sideName(moveSide));
  Serial.print(F(" limit switch reached after "));
  Serial.print(t);
  Serial.println(F(" ms. Stopped."));

  if (mode == HOMING) {
    Serial.println(F("At the start switch. Type GO to time the run (or PLAY)."));
  } else if (mode == TO_LIMIT) {
    endTimeMs = t;
    Serial.println(F("Run complete."));
    printResult();
  } else if (mode == MARKING || mode == PLAYING) {
    Serial.print(F("WARNING: the far limit came before tray "));
    Serial.print(stopIndex + 1);
    Serial.println(F(". Times so far are kept; HOME and try again."));
  }
  mode = IDLE;
}

// ---------------- commands ----------------

void handleCommand(String line) {
  line.trim();
  line.toUpperCase();
  if (line.length() == 0) return;

  int sp = line.indexOf(' ');
  String cmd = sp < 0 ? line : line.substring(0, sp);
  String args = sp < 0 ? String("") : line.substring(sp + 1);
  args.trim();

  if (cmd == "STOP") {
    stopMotor();
    mode = IDLE;
    Serial.println(F("Stopped."));
  } else if (cmd == "M") {
    markTray();
  } else if (cmd == "NEXT") {
    nextTray();
  } else if (moving) {
    Serial.println(F("Moving: only STOP, M or the E-stop now."));
  } else if (cmd == "HELP") {
    printHelp();
  } else if (cmd == "STATUS") {
    if (estopLatched && digitalRead(EMERGENCY_STOP_PIN) != ESTOP_PRESSED) {
      estopLatched = false;
      Serial.println(F("E-stop released."));
    }
    printStatus();
  } else if (cmd == "SIDE") {
    if (args == "L" || args == "LEFT") startSide = SIDE_LEFT;
    else if (args == "R" || args == "RIGHT") startSide = SIDE_RIGHT;
    else { Serial.println(F("Usage: SIDE <L|R>")); return; }
    stopIndex = 0;
    Serial.print(F("Start side: "));
    Serial.println(sideName(startSide));
  } else if (cmd == "JOG") {
    jog(args);
  } else if (cmd == "SWAP") {
    uint8_t p = relayToRightPin;
    relayToRightPin = relayToLeftPin;
    relayToLeftPin = p;
    Serial.print(F("Swapped: RIGHT relay pin "));
    Serial.print(relayToRightPin);
    Serial.print(F(", LEFT relay pin "));
    Serial.println(relayToLeftPin);
  } else if (cmd == "HOME") {
    if (limitPressed(startSide)) {
      Serial.println(F("Already at the start switch."));
    } else if (startMove(startSide, MAX_MOVE_MS)) {
      mode = HOMING;
      Serial.print(F("Homing to the "));
      Serial.print(sideName(startSide));
      Serial.println(F(" switch..."));
    }
  } else if (cmd == "GO") {
    if (!limitPressed(startSide)) {
      Serial.println(F("Not at the start switch: type HOME first."));
    } else if (startMove(farSide(), MAX_MOVE_MS)) {
      stopIndex = 0;
      endTimeMs = 0;
      mode = MARKING;
      Serial.println(F("Moving to tray 1: type M when the outlet is over it."));
    }
  } else if (cmd == "PLAY") {
    play();
  } else if (cmd == "SET") {
    setTime(args);
  } else if (cmd == "RESULT") {
    printResult();
  } else {
    Serial.print(F("Unknown command: "));
    Serial.println(line);
    printHelp();
  }
}

void markTray() {
  if (mode != MARKING || !moving) {
    Serial.println(F("M only works while GO / NEXT is moving toward a tray."));
    return;
  }
  unsigned long t = runTime();
  stopMotor();
  trayTimes[stopIndex] = t;
  stopIndex++;
  mode = IDLE;

  Serial.print(F("Tray "));
  Serial.print(stopIndex);
  Serial.print(F(": "));
  Serial.print(t);
  Serial.println(F(" ms from the previous stop."));
  if (stopIndex < TRAY_COUNT) {
    Serial.print(F("NEXT moves on to tray "));
    Serial.print(stopIndex + 1);
    Serial.println(F("."));
  } else {
    Serial.println(F("All 5 trays timed. NEXT runs on to the far limit switch."));
  }
}

void nextTray() {
  if (moving) {
    Serial.println(F("Still moving."));
    return;
  }
  if (mode == PLAY_WAIT) {
    if (stopIndex < TRAY_COUNT) {
      if (startMove(farSide(), trayTimes[stopIndex])) mode = PLAYING;
    } else if (startMove(farSide(), MAX_MOVE_MS)) {
      mode = TO_LIMIT;
      Serial.println(F("Running on to the far limit switch..."));
    }
    return;
  }
  if (stopIndex == 0) {
    Serial.println(F("Start with HOME then GO (or PLAY)."));
    return;
  }
  if (stopIndex < TRAY_COUNT) {
    if (startMove(farSide(), MAX_MOVE_MS)) {
      mode = MARKING;
      Serial.print(F("Moving to tray "));
      Serial.print(stopIndex + 1);
      Serial.println(F(": type M when the outlet is over it."));
    }
  } else if (startMove(farSide(), MAX_MOVE_MS)) {
    mode = TO_LIMIT;
    Serial.println(F("Running on to the far limit switch..."));
  }
}

void play() {
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    if (trayTimes[i] == 0) {
      Serial.println(F("Times missing: do a GO run or SET all 5 first."));
      return;
    }
  }
  if (!limitPressed(startSide)) {
    Serial.println(F("Not at the start switch: type HOME first."));
    return;
  }
  stopIndex = 0;
  if (startMove(farSide(), trayTimes[0])) {
    mode = PLAYING;
    Serial.println(F("PLAY: moving to tray 1..."));
  }
}

void jog(const String& args) {
  int sp = args.indexOf(' ');
  String dir = sp < 0 ? args : args.substring(0, sp);
  long ms = sp < 0 ? 0 : args.substring(sp + 1).toInt();
  if ((dir != "L" && dir != "R") || ms < (long)JOG_MIN_MS || ms > (long)JOG_MAX_MS) {
    Serial.println(F("Usage: JOG <L|R> <100-5000 ms>"));
    return;
  }
  Side s = dir == "L" ? SIDE_LEFT : SIDE_RIGHT;
  if (startMove(s, ms)) {
    mode = JOGGING;
    Serial.print(F("JOG toward the "));
    Serial.print(sideName(s));
    Serial.println(F(": did the hopper move that way? If not, SWAP."));
  }
}

void setTime(const String& args) {
  int sp = args.indexOf(' ');
  int t = sp < 0 ? 0 : args.substring(0, sp).toInt();
  long ms = sp < 0 ? 0 : args.substring(sp + 1).toInt();
  if (t < 1 || t > TRAY_COUNT || ms < 100 || ms > (long)MAX_MOVE_MS) {
    Serial.println(F("Usage: SET <1-5> <100-30000 ms>"));
    return;
  }
  trayTimes[t - 1] = ms;
  Serial.print(F("Tray "));
  Serial.print(t);
  Serial.print(F(" time set to "));
  Serial.print(ms);
  Serial.println(F(" ms."));
}

// ---------------- output ----------------

void printHelp() {
  Serial.println(F("Commands: STATUS | SIDE <L|R> | JOG <L|R> <ms> | SWAP | HOME | GO | M | NEXT |"));
  Serial.println(F("          PLAY | SET <1-5> <ms> | RESULT | STOP | HELP"));
}

void printStatus() {
  Serial.print(F("Start side: "));
  Serial.print(sideName(startSide));
  Serial.print(F("   far side: "));
  Serial.println(sideName(farSide()));
  Serial.print(F("LEFT switch (pin "));
  Serial.print(LEFT_LIMIT_PIN);
  Serial.print(F("): "));
  Serial.print(limitPressed(SIDE_LEFT) ? F("PRESSED") : F("open"));
  Serial.print(F("   RIGHT switch (pin "));
  Serial.print(RIGHT_LIMIT_PIN);
  Serial.print(F("): "));
  Serial.println(limitPressed(SIDE_RIGHT) ? F("PRESSED") : F("open"));
  Serial.print(F("E-stop (pin "));
  Serial.print(EMERGENCY_STOP_PIN);
  Serial.print(F("): "));
  Serial.println(digitalRead(EMERGENCY_STOP_PIN) == ESTOP_PRESSED ? F("PRESSED") : F("released"));
  Serial.print(F("Relay to RIGHT: pin "));
  Serial.print(relayToRightPin);
  Serial.print(F("   relay to LEFT: pin "));
  Serial.println(relayToLeftPin);
  Serial.print(F("Recorded tray times (ms):"));
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    Serial.print(' ');
    Serial.print(trayTimes[i]);
  }
  Serial.print(F("   tray 5 -> far switch: "));
  Serial.println(endTimeMs);
}

// Rounds up to the next whole second.
unsigned long roundUpSecond(unsigned long ms) {
  return ((ms + 999) / 1000) * 1000;
}

void printResult() {
  unsigned long total = 0;
  for (uint8_t i = 0; i < TRAY_COUNT; i++) total += trayTimes[i];
  total += endTimeMs;

  Serial.println(F("---- Paste into HyFePoul_Arduino/Config.ino ----"));
  Serial.print(F("const HopperSide HOPPER_START_SIDE = "));
  Serial.println(startSide == SIDE_LEFT ? F("SIDE_LEFT;") : F("SIDE_RIGHT;"));
  Serial.print(F("const uint8_t CHAIN_TO_RIGHT_RELAY_PIN = "));
  Serial.print(relayToRightPin);
  Serial.println(';');
  Serial.print(F("const uint8_t CHAIN_TO_LEFT_RELAY_PIN  = "));
  Serial.print(relayToLeftPin);
  Serial.println(';');
  Serial.print(F("const unsigned long TRAY_TRAVEL_MS[TRAY_COUNT] = {"));
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    Serial.print(' ');
    Serial.print(trayTimes[i]);
    Serial.print(F("UL"));
    if (i < TRAY_COUNT - 1) Serial.print(',');
  }
  Serial.println(F(" };"));

  if (endTimeMs > 0) {
    // Timeouts: twice the measured time, at least 5 s, whole seconds.
    unsigned long endTimeout = roundUpSecond(max(endTimeMs * 2, 5000UL));
    unsigned long homeTimeout = roundUpSecond(max(total * 3 / 2, 5000UL));
    Serial.print(F("const unsigned long CHAIN_END_TIMEOUT_MS  = "));
    Serial.print(endTimeout);
    Serial.print(F("UL;   // measured "));
    Serial.print(endTimeMs);
    Serial.println(F(" ms"));
    Serial.print(F("const unsigned long CHAIN_HOME_TIMEOUT_MS = "));
    Serial.print(homeTimeout);
    Serial.print(F("UL;   // full run "));
    Serial.print(total);
    Serial.println(F(" ms"));
  } else {
    Serial.println(F("(Run on to the far switch with NEXT after tray 5 to get the timeouts.)"));
  }
  Serial.println(F("------------------------------------------------"));
}
