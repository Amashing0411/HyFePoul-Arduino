/*
  Chain_Calibration.ino

  Stand-alone chain timing calibration for HyFePoul. Upload this instead of
  the full firmware. It only drives the two chain relays and reads the two
  limit switches; the dispenser, load cells, ESP32 and Nextion are not touched.

  Standing in front of the device, the trays are, from left to right:
      Tray 4 | Tray 5 | Tray 3 | Tray 2 | Tray 1
  so the hopper meets them in this order:
      starting from the right (tray 1 side): 1, 2, 3, 5, 4
      starting from the left  (tray 4 side): 4, 5, 3, 2, 1

  Feed is spread along each tray: the hopper stops at several spots across
  the tray and drops a share of the feed at each one. This sketch times the
  run from the start switch to the FIRST spot of the first tray, across each
  tray from its FIRST spot to its LAST spot, and from each tray's LAST spot
  to the FIRST spot of the next tray. After the last tray it keeps going until
  the far limit switch stops it. The results are printed as lines to paste
  into HyFePoul_Arduino/Config.ino.

  Pins (same as Config.ino):
    chain relay that moves the hopper to the RIGHT   10
    chain relay that moves the hopper to the LEFT     9
    LEFT limit switch (tray 4 side)                  51
    RIGHT limit switch (tray 1 side)                 53
  Left and right are as seen from the front of the device.
  Use JOG first to check which relay moves which way; SWAP fixes it.

  Serial Monitor: 115200 baud, line ending "New Line".

    HELP                 list the commands
    STATUS               switches, start side, relay mapping, recorded times
    SIDE <L|R>           start side
    SPOTS <1-10>         feed spots per tray (default 5)
    JOG <L|R> <ms>       move toward the left/right 100-5000 ms (stops at
                         that side's limit switch)
    SWAP                 swap which relay is "left" and which is "right"
    HOME                 move to the start side's limit switch (30 s max)
    GO                   from the start switch, start the timing run
    M                    "mark": stop now, the outlet is over the spot asked for
    NEXT                 move on to the next spot asked for (after the last
                         tray: on to the far limit switch, then stop)
    PLAY                 replay the run the way the firmware does it, stopping
                         at every spot (NEXT continues to the next tray)
    SET <tray> <ms>      change the time to reach a tray's first spot
    SPAN <tray> <ms>     change the time from a tray's first to last spot
    RESULT               print the lines for Config.ino
    STOP                 stop the motor at once (any time)

  Timing run:
    HOME, then GO. Type M when the outlet is over the first spot of the first
    tray. Type NEXT, then M over the last spot of that tray. NEXT, then M over
    the first spot of the next tray, and so on. After the last tray, NEXT runs
    to the far limit switch and stops. RESULT prints the times.
    Then HOME and PLAY: short moves do not cover the same distance as one long
    move, so check every stop and adjust with SET and SPAN. Each time is
    measured from when the relay switched on, the same way the firmware times
    its moves. Your reaction time is part of each mark.

  Safety: chain only, dispenser off. Keep a hand on the motor power switch.
  Typing STOP or reaching the limit switch in the direction of travel stops
  the motor. No single move runs longer than 30 s.
*/

const uint8_t TRAY_COUNT = 5;

// Tray numbers from left to right, seen from the front of the device.
const uint8_t TRAY_AT_POSITION[TRAY_COUNT] = {4, 5, 3, 2, 1};

// Pins: keep in step with HyFePoul_Arduino/Config.ino.
uint8_t relayToRightPin = 10;
uint8_t relayToLeftPin  = 9;
const uint8_t LEFT_LIMIT_PIN  = 51;      // tray 4 side
const uint8_t RIGHT_LIMIT_PIN = 53;      // tray 1 side
const uint8_t DISPENSER_RELAY_PIN = 8;   // held off, never switched on here

// Polarity: copy from Config.ino (set there from Inputs_Calibration and
// Outputs_Calibration RESULT).
const uint8_t RELAY_ON = LOW;               // active-LOW relay board (Outputs_Calibration)
const uint8_t LIMIT_SWITCH_PRESSED = LOW;   // HIGH for normally-closed switches

const unsigned long DEAD_TIME_MS = 300;     // both relays off before a move
const unsigned long MAX_MOVE_MS = 30000;    // safety cap for any single move
const unsigned long JOG_MIN_MS = 100;
const unsigned long JOG_MAX_MS = 5000;
const unsigned long PLAY_SPOT_PAUSE_MS = 1500;  // time to look at each spot
const unsigned long MIN_SPOT_STEP_MS = 150;     // shorter moves are unreliable
const uint8_t MAX_SPOTS = 10;

enum Side { SIDE_LEFT, SIDE_RIGHT };
enum Mode { IDLE, JOGGING, HOMING, MARKING, TO_LIMIT, PLAYING, PLAY_PAUSE, PLAY_WAIT };

Side startSide = SIDE_RIGHT;                // PLACEHOLDER: pick with SIDE
Mode mode = IDLE;

bool moving = false;
Side moveSide = SIDE_LEFT;                  // direction of the current move
unsigned long moveStartMillis = 0;          // relay on
unsigned long moveLimitMs = 0;              // JOG / PLAY segment length
unsigned long stopMillis = 0;

uint8_t spotCount = 5;
uint8_t markCount = 0;                      // marks made so far in this GO run
uint8_t stopIndex = 0;                      // trays finished so far in PLAY
uint8_t playSpot = 0;                       // spots reached on this tray in PLAY
unsigned long pauseStartMillis = 0;

// Both are in travel order: index 0 is the first tray reached.
unsigned long trayTimes[TRAY_COUNT] = {0, 0, 0, 0, 0};  // to the first spot
unsigned long spanTimes[TRAY_COUNT] = {0, 0, 0, 0, 0};  // first to last spot
unsigned long endTimeMs = 0;                // last spot -> far limit
String inputLine = "";

void setup() {
  // Low-trigger buzzer module on pin 11: hold it HIGH so it stays quiet.
  digitalWrite(11, HIGH);
  pinMode(11, OUTPUT);

  relayWrite(relayToRightPin, false);
  relayWrite(relayToLeftPin, false);
  relayWrite(DISPENSER_RELAY_PIN, false);
  pinMode(relayToRightPin, OUTPUT);
  pinMode(relayToLeftPin, OUTPUT);
  pinMode(DISPENSER_RELAY_PIN, OUTPUT);

  pinMode(LEFT_LIMIT_PIN, INPUT_PULLUP);
  pinMode(RIGHT_LIMIT_PIN, INPUT_PULLUP);

  Serial.begin(115200);
  Serial.println();
  Serial.println(F("HyFePoul chain timing calibration"));
  Serial.println(F("Chain only: dispenser stays off. Keep a hand on the motor power switch."));
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

  updateMove();
}

// ---------------- trays ----------------

// Tray number at a travel stop (0 = first tray reached from the start side).
uint8_t trayAtStop(uint8_t stop) {
  return startSide == SIDE_LEFT ? TRAY_AT_POSITION[stop]
                                : TRAY_AT_POSITION[TRAY_COUNT - 1 - stop];
}

// Travel stop of a tray number, or -1.
int8_t stopOfTray(int tray) {
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    if (trayAtStop(i) == tray) return i;
  }
  return -1;
}

uint8_t marksPerTray() {
  return spotCount > 1 ? 2 : 1;
}

unsigned long spotStepMs(uint8_t stop) {
  return spotCount > 1 ? spanTimes[stop] / (spotCount - 1) : 0;
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

// Runs every loop: limit switches, timed ends, safety cap, PLAY pauses.
void updateMove() {
  if (mode == PLAY_PAUSE && millis() - pauseStartMillis >= PLAY_SPOT_PAUSE_MS) {
    if (startMove(farSide(), spotStepMs(stopIndex))) {
      mode = PLAYING;
    } else {
      mode = IDLE;
    }
    return;
  }

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
      onPlaySpot();
    }
  }
}

// PLAY reached a spot.
void onPlaySpot() {
  playSpot++;
  Serial.print(F("PLAY: tray "));
  Serial.print(trayAtStop(stopIndex));
  Serial.print(F(", spot "));
  Serial.print(playSpot);
  Serial.print(F(" of "));
  Serial.println(spotCount);

  if (playSpot < spotCount) {
    pauseStartMillis = millis();
    mode = PLAY_PAUSE;
    return;
  }

  Serial.print(F("Tray "));
  Serial.print(trayAtStop(stopIndex));
  Serial.println(F(" done. NEXT to continue (SET / SPAN to adjust)."));
  stopIndex++;
  mode = PLAY_WAIT;
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
    Serial.println(F("WARNING: the far limit came too early. Times so far are kept; HOME and try again."));
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
    markSpot();
  } else if (cmd == "NEXT") {
    nextSpot();
  } else if (moving || mode == PLAY_PAUSE) {
    Serial.println(F("Moving: only STOP or M now."));
  } else if (cmd == "HELP") {
    printHelp();
  } else if (cmd == "STATUS") {
    printStatus();
  } else if (cmd == "SIDE") {
    if (args == "L" || args == "LEFT") startSide = SIDE_LEFT;
    else if (args == "R" || args == "RIGHT") startSide = SIDE_RIGHT;
    else { Serial.println(F("Usage: SIDE <L|R>")); return; }
    // The recorded times belong to the old travel order.
    clearTimes();
    Serial.print(F("Start side: "));
    Serial.print(sideName(startSide));
    Serial.println(F(". Recorded times cleared."));
    printTravelOrder();
  } else if (cmd == "SPOTS") {
    long n = args.toInt();
    if (n < 1 || n > MAX_SPOTS) {
      Serial.println(F("Usage: SPOTS <1-10>"));
      return;
    }
    spotCount = n;
    markCount = 0;
    mode = IDLE;
    Serial.print(F("Feed spots per tray: "));
    Serial.println(spotCount);
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
      markCount = 0;
      endTimeMs = 0;
      mode = MARKING;
      printMarkPrompt();
    }
  } else if (cmd == "PLAY") {
    play();
  } else if (cmd == "SET") {
    setTime(args, trayTimes, F("first spot"));
  } else if (cmd == "SPAN") {
    setTime(args, spanTimes, F("first-to-last spot"));
  } else if (cmd == "RESULT") {
    printResult();
  } else {
    Serial.print(F("Unknown command: "));
    Serial.println(line);
    printHelp();
  }
}

void clearTimes() {
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    trayTimes[i] = 0;
    spanTimes[i] = 0;
  }
  endTimeMs = 0;
  markCount = 0;
  stopIndex = 0;
  mode = IDLE;
}

// Says which spot the current move is heading for.
void printMarkPrompt() {
  uint8_t stop = markCount / marksPerTray();
  bool lastSpot = marksPerTray() == 2 && markCount % 2 == 1;
  Serial.print(F("Moving to tray "));
  Serial.print(trayAtStop(stop));
  Serial.print(lastSpot ? F(", LAST spot") : F(", FIRST spot"));
  Serial.println(F(": type M when the outlet is over it."));
}

void markSpot() {
  if (mode != MARKING || !moving) {
    Serial.println(F("M only works while GO / NEXT is moving toward a spot."));
    return;
  }
  unsigned long t = runTime();
  stopMotor();

  uint8_t stop = markCount / marksPerTray();
  bool lastSpot = marksPerTray() == 2 && markCount % 2 == 1;
  if (lastSpot) spanTimes[stop] = t; else trayTimes[stop] = t;
  markCount++;
  mode = IDLE;

  Serial.print(F("Tray "));
  Serial.print(trayAtStop(stop));
  Serial.print(lastSpot ? F(" LAST spot: ") : F(" FIRST spot: "));
  Serial.print(t);
  Serial.println(F(" ms from the previous stop."));

  if (markCount < TRAY_COUNT * marksPerTray()) {
    Serial.println(F("NEXT moves on."));
  } else {
    Serial.println(F("All trays timed. NEXT runs on to the far limit switch."));
  }
}

void nextSpot() {
  if (moving || mode == PLAY_PAUSE) {
    Serial.println(F("Still moving."));
    return;
  }
  if (mode == PLAY_WAIT) {
    if (stopIndex < TRAY_COUNT) {
      playSpot = 0;
      if (startMove(farSide(), trayTimes[stopIndex])) {
        mode = PLAYING;
      }
    } else if (startMove(farSide(), MAX_MOVE_MS)) {
      mode = TO_LIMIT;
      Serial.println(F("Running on to the far limit switch..."));
    }
    return;
  }
  if (markCount == 0) {
    Serial.println(F("Start with HOME then GO (or PLAY)."));
    return;
  }
  if (markCount < TRAY_COUNT * marksPerTray()) {
    if (startMove(farSide(), MAX_MOVE_MS)) {
      mode = MARKING;
      printMarkPrompt();
    }
  } else if (startMove(farSide(), MAX_MOVE_MS)) {
    mode = TO_LIMIT;
    Serial.println(F("Running on to the far limit switch..."));
  }
}

void play() {
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    if (trayTimes[i] == 0 || (spotCount > 1 && spanTimes[i] == 0)) {
      Serial.println(F("Times missing: do a GO run, or SET and SPAN every tray first."));
      return;
    }
  }
  if (!limitPressed(startSide)) {
    Serial.println(F("Not at the start switch: type HOME first."));
    return;
  }
  stopIndex = 0;
  playSpot = 0;
  markCount = 0;
  if (startMove(farSide(), trayTimes[0])) {
    mode = PLAYING;
    Serial.println(F("PLAY: moving to the first tray..."));
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

// SET and SPAN: <tray number> <ms>.
void setTime(const String& args, unsigned long* times, const __FlashStringHelper* label) {
  int sp = args.indexOf(' ');
  int tray = sp < 0 ? 0 : args.substring(0, sp).toInt();
  long ms = sp < 0 ? 0 : args.substring(sp + 1).toInt();
  int8_t stop = stopOfTray(tray);
  if (stop < 0 || ms < 100 || ms > (long)MAX_MOVE_MS) {
    Serial.println(F("Usage: SET or SPAN <tray 1-5> <100-30000 ms>"));
    return;
  }
  times[stop] = ms;
  Serial.print(F("Tray "));
  Serial.print(tray);
  Serial.print(' ');
  Serial.print(label);
  Serial.print(F(" time set to "));
  Serial.print(ms);
  Serial.println(F(" ms."));
}

// ---------------- output ----------------

void printHelp() {
  Serial.println(F("Commands: STATUS | SIDE <L|R> | SPOTS <1-10> | JOG <L|R> <ms> | SWAP | HOME | GO | M | NEXT |"));
  Serial.println(F("          PLAY | SET <tray> <ms> | SPAN <tray> <ms> | RESULT | STOP | HELP"));
}

void printTravelOrder() {
  Serial.print(F("Travel order (trays):"));
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    Serial.print(' ');
    Serial.print(trayAtStop(i));
  }
  Serial.println();
}

void printStatus() {
  Serial.print(F("Start side: "));
  Serial.print(sideName(startSide));
  Serial.print(F("   far side: "));
  Serial.print(sideName(farSide()));
  Serial.print(F("   spots per tray: "));
  Serial.println(spotCount);
  printTravelOrder();
  Serial.print(F("LEFT switch (pin "));
  Serial.print(LEFT_LIMIT_PIN);
  Serial.print(F(", tray 4 side): "));
  Serial.print(limitPressed(SIDE_LEFT) ? F("PRESSED") : F("open"));
  Serial.print(F("   RIGHT switch (pin "));
  Serial.print(RIGHT_LIMIT_PIN);
  Serial.print(F(", tray 1 side): "));
  Serial.println(limitPressed(SIDE_RIGHT) ? F("PRESSED") : F("open"));
  Serial.print(F("Relay to RIGHT: pin "));
  Serial.print(relayToRightPin);
  Serial.print(F("   relay to LEFT: pin "));
  Serial.println(relayToLeftPin);
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    Serial.print(F("Tray "));
    Serial.print(trayAtStop(i));
    Serial.print(F(": to first spot "));
    Serial.print(trayTimes[i]);
    Serial.print(F(" ms, first to last spot "));
    Serial.print(spanTimes[i]);
    Serial.println(F(" ms"));
  }
  Serial.print(F("Last spot -> far switch: "));
  Serial.print(endTimeMs);
  Serial.println(F(" ms"));
}

// Rounds up to the next whole second.
unsigned long roundUpSecond(unsigned long ms) {
  return ((ms + 999) / 1000) * 1000;
}

void printTimeArray(const __FlashStringHelper* name, const unsigned long* times) {
  Serial.print(name);
  Serial.print(F("[TRAY_COUNT] = {"));
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    Serial.print(' ');
    Serial.print(times[i]);
    Serial.print(F("UL"));
    if (i < TRAY_COUNT - 1) Serial.print(',');
  }
  Serial.println(F(" };"));
}

void printResult() {
  unsigned long total = endTimeMs;
  for (uint8_t i = 0; i < TRAY_COUNT; i++) total += trayTimes[i] + spanTimes[i];

  Serial.println(F("---- Paste into HyFePoul_Arduino/Config.ino ----"));
  Serial.print(F("const HopperSide HOPPER_START_SIDE = "));
  Serial.println(startSide == SIDE_LEFT ? F("SIDE_LEFT;") : F("SIDE_RIGHT;"));
  Serial.print(F("const uint8_t CHAIN_TO_RIGHT_RELAY_PIN = "));
  Serial.print(relayToRightPin);
  Serial.println(';');
  Serial.print(F("const uint8_t CHAIN_TO_LEFT_RELAY_PIN  = "));
  Serial.print(relayToLeftPin);
  Serial.println(';');
  Serial.print(F("const uint8_t TRAY_SPOT_COUNT = "));
  Serial.print(spotCount);
  Serial.println(';');
  Serial.print(F("// Travel order: trays"));
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    Serial.print(' ');
    Serial.print(trayAtStop(i));
  }
  Serial.println();
  printTimeArray(F("const unsigned long TRAY_TRAVEL_MS"), trayTimes);
  printTimeArray(F("const unsigned long TRAY_SPAN_MS"), spanTimes);

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
    Serial.println(F("(Run on to the far switch with NEXT after the last tray to get the timeouts.)"));
  }
  Serial.println(F("------------------------------------------------"));

  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    if (spotCount > 1 && spanTimes[i] > 0 && spotStepMs(i) < MIN_SPOT_STEP_MS) {
      Serial.print(F("WARNING: tray "));
      Serial.print(trayAtStop(i));
      Serial.println(F(": the step between spots is under 150 ms and may be unreliable. Use fewer SPOTS."));
    }
  }
}
