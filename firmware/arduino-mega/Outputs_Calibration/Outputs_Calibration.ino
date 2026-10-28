/*
  Outputs_Calibration.ino

  Stand-alone calibration of the HyFePoul outputs. Upload this instead of
  the full firmware.

  It finds:
    - relay polarity: whether the relay board switches ON with HIGH or LOW
    - the dispenser's flow rate (grams per second), and from it the
      per-tray dispense timeout
    - whether the buzzer is active (sounds on a steady HIGH) or passive
  and prints the matching lines for HyFePoul_Arduino/Config.ino.

  Pins (same as Config.ino): chain relay to RIGHT 10, chain relay to LEFT 9,
  dispenser relay 8, buzzer 39, E-stop 37 (INPUT_PULLUP, closes to GND;
  pressing it switches every output off).

  Serial Monitor: 115200 baud, line ending "New Line".

    HELP               list the commands
    LEVEL <HIGH|LOW>   which level switches a relay ON; all relays are then
                       driven OFF at that setting
    PULSE <R|L|D> <ms> switch one relay on for 100-3000 ms
                       (R = chain to right, L = chain to left, D = dispenser)
    FLOW <ms>          run the dispenser 500-20000 ms into a container
    GRAMS <g>          enter what the last FLOW dispensed (kitchen scale)
    TARGET <g>         largest grams per tray you will schedule (default 50)
    BUZZ               steady HIGH on the buzzer for 0.5 s
    TONE               2 kHz tone for 0.5 s (for a passive buzzer)
    OFF                every output off at once
    RESULT             print the Config.ino lines

  Order:
    1. MOTOR POWER OFF (relay board powered, motors not). The relay pins
       start undriven. Type LEVEL HIGH. If any relay clicks on or its LED
       lights now, type LEVEL LOW instead: that board is active LOW.
    2. PULSE R 500, PULSE L 500, PULSE D 500: each should click once and
       its LED light for half a second.
    3. Motor power on for the dispenser only, a container under the outlet:
       FLOW 5000, weigh what came out, GRAMS <weight>. Repeat 2-3 times.
    4. BUZZ (and TONE if BUZZ was silent). RESULT.
  The two chain relays are never on together.
*/

const uint8_t RELAY_TO_RIGHT_PIN = 10;
const uint8_t RELAY_TO_LEFT_PIN  = 9;
const uint8_t DISPENSER_RELAY_PIN = 8;
const uint8_t BUZZER_PIN = 39;
const uint8_t EMERGENCY_STOP_PIN = 37;

int relayOnLevel = -1;            // -1 = not chosen yet (relay pins undriven)
unsigned long pulseEndMillis = 0;
uint8_t pulsePin = 0;             // relay currently pulsed, 0 = none
bool flowRunning = false;
unsigned long flowMs = 0;
unsigned long lastFlowMs = 0;

float flowSumGrams = 0.0f;        // over all FLOW + GRAMS pairs
unsigned long flowSumMs = 0;
uint8_t flowRuns = 0;
float targetGrams = 50.0f;
int buzzerType = 0;               // 0 = not tested, 1 = active, 2 = passive
String inputLine = "";

void setup() {
  // Relay pins stay inputs (undriven) until LEVEL is chosen.
  pinMode(RELAY_TO_RIGHT_PIN, INPUT);
  pinMode(RELAY_TO_LEFT_PIN, INPUT);
  pinMode(DISPENSER_RELAY_PIN, INPUT);
  digitalWrite(BUZZER_PIN, LOW);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(EMERGENCY_STOP_PIN, INPUT_PULLUP);

  Serial.begin(115200);
  Serial.println();
  Serial.println(F("HyFePoul outputs calibration (relays, dispenser flow, buzzer)"));
  Serial.println(F("Relay pins are NOT driven yet. Motor power off, then: LEVEL HIGH"));
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

  if (digitalRead(EMERGENCY_STOP_PIN) == LOW && (pulsePin != 0 || flowRunning)) {
    allOff();
    Serial.println(F("!!! E-STOP: everything off."));
  }

  if (pulsePin != 0 && (long)(millis() - pulseEndMillis) >= 0) {
    uint8_t pin = pulsePin;
    relayOff(pin);
    pulsePin = 0;
    if (flowRunning && pin == DISPENSER_RELAY_PIN) {
      flowRunning = false;
      lastFlowMs = flowMs;
      Serial.print(F("FLOW done: dispenser ran "));
      Serial.print(flowMs);
      Serial.println(F(" ms. Weigh it, then GRAMS <weight>."));
    } else {
      Serial.println(F("PULSE done."));
    }
  }
}

// ---------------- outputs ----------------

void relayOn(uint8_t pin) {
  digitalWrite(pin, relayOnLevel);
}

void relayOff(uint8_t pin) {
  if (relayOnLevel < 0) return;
  digitalWrite(pin, relayOnLevel == HIGH ? LOW : HIGH);
}

void allOff() {
  relayOff(RELAY_TO_RIGHT_PIN);
  relayOff(RELAY_TO_LEFT_PIN);
  relayOff(DISPENSER_RELAY_PIN);
  noTone(BUZZER_PIN);
  digitalWrite(BUZZER_PIN, LOW);
  pulsePin = 0;
  flowRunning = false;
}

bool readyToDrive() {
  if (relayOnLevel < 0) {
    Serial.println(F("Choose LEVEL HIGH or LEVEL LOW first."));
    return false;
  }
  if (pulsePin != 0) {
    Serial.println(F("Busy: wait for it to finish, or OFF."));
    return false;
  }
  if (digitalRead(EMERGENCY_STOP_PIN) == LOW) {
    Serial.println(F("Refused: E-stop pressed."));
    return false;
  }
  return true;
}

void startPulse(uint8_t pin, unsigned long ms) {
  // Chain interlock: the other chain relay is always off first.
  if (pin == RELAY_TO_RIGHT_PIN) relayOff(RELAY_TO_LEFT_PIN);
  if (pin == RELAY_TO_LEFT_PIN) relayOff(RELAY_TO_RIGHT_PIN);
  relayOn(pin);
  pulsePin = pin;
  pulseEndMillis = millis() + ms;
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

  if (cmd == "OFF") {
    allOff();
    Serial.println(F("All outputs off."));
  } else if (cmd == "HELP") {
    printHelp();
  } else if (cmd == "LEVEL") {
    if (args != "HIGH" && args != "LOW") {
      Serial.println(F("Usage: LEVEL <HIGH|LOW>"));
      return;
    }
    relayOnLevel = args == "HIGH" ? HIGH : LOW;
    // Write the OFF level before switching to output, so nothing pulses on.
    int offLevel = relayOnLevel == HIGH ? LOW : HIGH;
    digitalWrite(RELAY_TO_RIGHT_PIN, offLevel);
    digitalWrite(RELAY_TO_LEFT_PIN, offLevel);
    digitalWrite(DISPENSER_RELAY_PIN, offLevel);
    pinMode(RELAY_TO_RIGHT_PIN, OUTPUT);
    pinMode(RELAY_TO_LEFT_PIN, OUTPUT);
    pinMode(DISPENSER_RELAY_PIN, OUTPUT);
    Serial.print(F("Relays ON = "));
    Serial.print(args);
    Serial.println(F(". All three relays are now driven OFF."));
    Serial.println(F("Any relay LED lit or clicked on? Then type the other LEVEL."));
  } else if (cmd == "PULSE") {
    int sp2 = args.indexOf(' ');
    String which = sp2 < 0 ? args : args.substring(0, sp2);
    long ms = sp2 < 0 ? 0 : args.substring(sp2 + 1).toInt();
    uint8_t pin = which == "R" ? RELAY_TO_RIGHT_PIN : which == "L" ? RELAY_TO_LEFT_PIN : which == "D" ? DISPENSER_RELAY_PIN : 0;
    if (pin == 0 || ms < 100 || ms > 3000) {
      Serial.println(F("Usage: PULSE <R|L|D> <100-3000 ms>"));
      return;
    }
    if (!readyToDrive()) return;
    startPulse(pin, ms);
    Serial.print(F("Relay on pin "));
    Serial.print(pin);
    Serial.println(F(" ON..."));
  } else if (cmd == "FLOW") {
    long ms = args.toInt();
    if (ms < 500 || ms > 20000) {
      Serial.println(F("Usage: FLOW <500-20000 ms>"));
      return;
    }
    if (!readyToDrive()) return;
    flowMs = ms;
    flowRunning = true;
    startPulse(DISPENSER_RELAY_PIN, ms);
    Serial.println(F("Dispenser ON..."));
  } else if (cmd == "GRAMS") {
    float g = args.toFloat();
    if (lastFlowMs == 0 || g <= 0) {
      Serial.println(F("Usage: GRAMS <weight>, after a FLOW run."));
      return;
    }
    flowSumGrams += g;
    flowSumMs += lastFlowMs;
    flowRuns++;
    Serial.print(F("This run: "));
    Serial.print(g * 1000.0f / lastFlowMs, 2);
    Serial.print(F(" g/s.  Average of "));
    Serial.print(flowRuns);
    Serial.print(F(" runs: "));
    Serial.print(flowGramsPerSecond(), 2);
    Serial.println(F(" g/s."));
    lastFlowMs = 0;
  } else if (cmd == "TARGET") {
    float g = args.toFloat();
    if (g <= 0 || g > 1000) {
      Serial.println(F("Usage: TARGET <1-1000 grams per tray>"));
      return;
    }
    targetGrams = g;
    Serial.print(F("Largest target per tray: "));
    Serial.print(g, 0);
    Serial.println(F(" g"));
  } else if (cmd == "BUZZ") {
    digitalWrite(BUZZER_PIN, HIGH);
    delay(500);
    digitalWrite(BUZZER_PIN, LOW);
    Serial.println(F("Did it beep? Yes = active buzzer (type BUZZ OK). Silent = try TONE."));
    if (args == "OK") buzzerType = 1;
  } else if (cmd == "TONE") {
    tone(BUZZER_PIN, 2000, 500);
    delay(550);
    Serial.println(F("Beeped only with TONE? Then it is a passive buzzer (type TONE OK)."));
    if (args == "OK") buzzerType = 2;
  } else if (cmd == "RESULT") {
    printResult();
  } else {
    Serial.print(F("Unknown command: "));
    Serial.println(line);
    printHelp();
  }
}

float flowGramsPerSecond() {
  return flowSumMs == 0 ? 0.0f : flowSumGrams * 1000.0f / flowSumMs;
}

void printHelp() {
  Serial.println(F("Commands: LEVEL <HIGH|LOW> | PULSE <R|L|D> <ms> | FLOW <ms> | GRAMS <g> | TARGET <g> |"));
  Serial.println(F("          BUZZ [OK] | TONE [OK] | OFF | RESULT | HELP"));
}

void printResult() {
  Serial.println(F("---- Paste into HyFePoul_Arduino/Config.ino ----"));
  if (relayOnLevel < 0) {
    Serial.println(F("(Relays: choose LEVEL HIGH or LOW first.)"));
  } else {
    Serial.print(F("const uint8_t RELAY_ON = "));
    Serial.print(relayOnLevel == HIGH ? F("HIGH") : F("LOW"));
    Serial.println(relayOnLevel == HIGH ? F(";   // active-HIGH relay board") : F(";   // active-LOW relay board"));
  }

  float gps = flowGramsPerSecond();
  if (gps > 0) {
    // Time for the largest target, plus 50 % margin, whole seconds, 10 s min.
    float needS = targetGrams / gps;
    unsigned long timeout = (unsigned long)(needS * 1.5f * 1000.0f);
    timeout = ((timeout + 999) / 1000) * 1000;
    if (timeout < 10000UL) timeout = 10000UL;
    Serial.print(F("const unsigned long TRAY_DISPENSE_TIMEOUT_MS = "));
    Serial.print(timeout);
    Serial.print(F("UL;   // "));
    Serial.print(gps, 2);
    Serial.print(F(" g/s; "));
    Serial.print(targetGrams, 0);
    Serial.print(F(" g takes about "));
    Serial.print(needS, 1);
    Serial.println(F(" s"));
    if (needS * 5 > 240) {
      Serial.println(F("NOTE: 5 trays at this target take over 4 minutes; tell the developer"));
      Serial.println(F("      (the app's manual-feed wait and the ESP32 command timeout are 5 min)."));
    }
  } else {
    Serial.println(F("(Dispenser: FLOW then GRAMS at least once.)"));
  }

  if (buzzerType == 1) {
    Serial.println(F("// Buzzer: active (the firmware's digitalWrite works as is)"));
  } else if (buzzerType == 2) {
    Serial.println(F("// Buzzer: PASSIVE - the firmware needs tone(); tell the developer"));
  } else {
    Serial.println(F("(Buzzer: BUZZ OK or TONE OK after testing.)"));
  }
  Serial.println(F("------------------------------------------------"));
}
