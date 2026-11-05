/*
  Inputs_Calibration.ino

  Stand-alone calibration of the HyFePoul inputs. Upload this instead of the
  full firmware; it only reads inputs and drives NO relay or motor (relay
  pins are held off), so motor power can stay connected or not.

  It finds which limit switch is on which pin, what each switch reads when
  pressed, the hopper's empty and full distances and the Nextion's baud
  rate, and prints the matching lines for HyFePoul_Arduino/Config.ino.

  Pins (same as Config.ino; PLACEHOLDERS where marked there):
    limit switches 53, 51, float 49   (INPUT_PULLUP)
    ultrasonic TRIG 50, ECHO 48;  Nextion on Serial2 (TX2 16, RX2 17)

  Serial Monitor: 115200 baud, line ending "New Line".

    HELP          list the commands
    GUIDE         print the procedure below
    STATUS        every input once, with its meaning
    REST          record the normal state: limit switches NOT pressed,
                  reservoir FULL (float up)
    MAP           press each limit switch when asked; finds the tray 1 side
                  and the tray 5 side
    WATCH         print every switch change as it happens; any line stops it
    DIST          hopper distance now (median of 7 readings)
    EMPTY         record the distance with the hopper EMPTY
    FULL          record the distance with the hopper FULL
    NEXTION       find the display's baud rate
    RESULT        print the map and the Config.ino lines, and what is left

  Procedure:
    1. Put everything in its normal state.        REST
    2. Identify the limit switches.                MAP
    3. Lower the float.                            WATCH, then any line
    4. Hopper empty, then full.                    EMPTY, FULL
    5. Display connected.                          NEXTION
    6. Paste the printed lines into Config.ino.    RESULT
*/

// Sides not assigned yet: find them with MAP, then update Config.ino.
const uint8_t LIMIT_A_PIN = 53;
const uint8_t LIMIT_B_PIN = 51;
const uint8_t WATER_LOW_PIN = 49;
const uint8_t ULTRASONIC_TRIG_PIN = 52;
const uint8_t ULTRASONIC_ECHO_PIN = 50;
const unsigned long ULTRASONIC_TIMEOUT_US = 30000UL;

// Relay pins: never driven here (left as inputs = off for typical boards).
const uint8_t RELAY_PINS[] = {10, 9, 8};

const uint8_t SWITCH_COUNT = 3;
const uint8_t SWITCH_PINS[SWITCH_COUNT] = {LIMIT_A_PIN, LIMIT_B_PIN, WATER_LOW_PIN};
const char* const SWITCH_NAMES[SWITCH_COUNT] = {"Limit switch", "Limit switch", "Float (water)"};
const uint8_t LIMIT_COUNT = 2;                    // the first entries above

int restLevel[SWITCH_COUNT] = {-1, -1, -1};   // -1 = REST not done
int lastLevel[SWITCH_COUNT];
float emptyCm = -1.0f;
float fullCm = -1.0f;
long nextionBaud = 0;

bool watching = false;
int8_t mapStep = -1;                               // -1 = MAP not running
int8_t mapHeld = -1;                               // switch waiting to be released
int8_t mapChoice[LIMIT_COUNT] = {-1, -1};          // tray 1 side, tray 5 side
String inputLine = "";

void setup() {
  // Low-trigger buzzer module on pin 11: hold it HIGH so it stays quiet.
  digitalWrite(11, HIGH);
  pinMode(11, OUTPUT);

  for (uint8_t i = 0; i < sizeof(RELAY_PINS); i++) pinMode(RELAY_PINS[i], INPUT);
  for (uint8_t i = 0; i < SWITCH_COUNT; i++) pinMode(SWITCH_PINS[i], INPUT_PULLUP);
  pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
  pinMode(ULTRASONIC_ECHO_PIN, INPUT);

  Serial.begin(115200);
  Serial.println();
  Serial.println(F("HyFePoul inputs calibration (switches, ultrasonic, Nextion)"));
  Serial.println(F("No relay or motor is driven by this sketch."));
  printStatus();
  printGuide();
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

  if (mapStep >= 0) runMap();

  if (watching) {
    for (uint8_t i = 0; i < SWITCH_COUNT; i++) {
      int level = digitalRead(SWITCH_PINS[i]);
      if (level != lastLevel[i]) {
        lastLevel[i] = level;
        printSwitchName(i);
        Serial.print(F(": "));
        printLevel(i, level);
        Serial.println();
      }
    }
  }
}

void handleCommand(String line) {
  line.trim();
  line.toUpperCase();
  if (line.length() == 0) return;

  if (watching) {
    watching = false;
    Serial.println(F("WATCH stopped. Send RESULT to see what is left."));
    return;
  }

  if (mapStep >= 0) {
    if (line == "STOP") {
      mapStep = -1;
      Serial.println(F("MAP stopped."));
    } else {
      printMapPrompt();
    }
    return;
  }

  if (line == "HELP") {
    printHelp();
  } else if (line == "GUIDE") {
    printGuide();
  } else if (line == "STATUS") {
    printStatus();
  } else if (line == "MAP") {
    startMap();
  } else if (line == "WATCH") {
    for (uint8_t i = 0; i < SWITCH_COUNT; i++) lastLevel[i] = -1;
    watching = true;
    Serial.println(F("Watching; press switches, move the float. Any line stops. Current states:"));
  } else if (line == "REST") {
    for (uint8_t i = 0; i < SWITCH_COUNT; i++) restLevel[i] = digitalRead(SWITCH_PINS[i]);
    Serial.println(F("Normal state recorded:"));
    printStatus();
    Serial.println(F("Next: send MAP to identify the limit switches."));
  } else if (line == "DIST") {
    float cm = readDistanceCm();
    Serial.print(F("Hopper distance: "));
    printCm(cm);
    Serial.println();
    if (cm < 0) Serial.println(F("No echo: check TRIG/ECHO wiring and that nothing blocks the sensor."));
  } else if (line == "EMPTY" || line == "FULL") {
    float cm = readDistanceCm();
    if (cm < 0) {
      Serial.println(F("No echo: check TRIG/ECHO wiring and that nothing blocks the sensor."));
      return;
    }
    if (line == "EMPTY") emptyCm = cm; else fullCm = cm;
    Serial.print(line == "EMPTY" ? F("EMPTY hopper distance: ") : F("FULL hopper distance: "));
    printCm(cm);
    Serial.println();
  } else if (line == "NEXTION") {
    findNextionBaud();
  } else if (line == "RESULT") {
    printResult();
  } else {
    Serial.print(F("Unknown command: "));
    Serial.println(line);
    printHelp();
  }
}

void printHelp() {
  Serial.println(F("Commands: REST | MAP | WATCH | STATUS | DIST | EMPTY | FULL | NEXTION | RESULT | GUIDE | HELP"));
}

void printGuide() {
  Serial.println(F("Procedure:"));
  Serial.println(F("  1. Limit switches not pressed, reservoir full: REST"));
  Serial.println(F("  2. Identify the limit switches: MAP, then press each one when asked"));
  Serial.println(F("  3. Check the float: WATCH, lower the float, any line stops"));
  Serial.println(F("  4. Hopper empty: EMPTY. Hopper full: FULL"));
  Serial.println(F("  5. Display connected: NEXTION"));
  Serial.println(F("  6. RESULT: shows the lines for Config.ino and what is left"));
  printHelp();
}

void printSwitchName(uint8_t i) {
  Serial.print(SWITCH_NAMES[i]);
  Serial.print(F(" (pin "));
  Serial.print(SWITCH_PINS[i]);
  Serial.print(')');
}

// ---------------- limit switch map ----------------

void startMap() {
  if (restLevel[0] < 0) {
    Serial.println(F("Send REST first, with no switch pressed."));
    return;
  }
  for (uint8_t i = 0; i < LIMIT_COUNT; i++) {
    mapChoice[i] = -1;
    if (digitalRead(SWITCH_PINS[i]) != restLevel[i]) {
      printSwitchName(i);
      Serial.println(F(" is not in its normal state. Release it and send MAP again."));
      return;
    }
  }
  mapStep = 0;
  mapHeld = -1;
  Serial.println(F("MAP started. STOP cancels."));
  printMapPrompt();
}

void printMapPrompt() {
  if (mapStep == 0) Serial.println(F("Press and release the limit switch on the TRAY 1 side."));
  else Serial.println(F("Press and release the limit switch on the TRAY 5 side."));
}

void runMap() {
  if (mapHeld >= 0) {
    if (digitalRead(SWITCH_PINS[mapHeld]) == restLevel[mapHeld]) {
      delay(30);
      if (digitalRead(SWITCH_PINS[mapHeld]) == restLevel[mapHeld]) {
        mapHeld = -1;
        if (mapStep >= (int8_t)LIMIT_COUNT) finishMap();
        else printMapPrompt();
      }
    }
    return;
  }

  for (uint8_t i = 0; i < LIMIT_COUNT; i++) {
    if (digitalRead(SWITCH_PINS[i]) == restLevel[i]) continue;
    delay(30);
    if (digitalRead(SWITCH_PINS[i]) == restLevel[i]) continue;
    mapHeld = i;
    printSwitchName(i);
    bool used = false;
    for (int8_t step = 0; step < mapStep; step++) {
      if (mapChoice[step] == (int8_t)i) used = true;
    }
    if (used) {
      Serial.println(F(" was already used. Release it and press a different switch."));
    } else {
      mapChoice[mapStep] = i;
      Serial.println(F(" detected. Release it."));
      mapStep++;
    }
    return;
  }
}

void finishMap() {
  mapStep = -1;
  printMapResult();
  Serial.println(F("Next: send WATCH and lower the float."));
}

void printMapLine(const __FlashStringHelper* label, int8_t choice) {
  Serial.print(F("  "));
  Serial.print(label);
  Serial.print(F(": "));
  if (choice < 0) {
    Serial.println(F("not mapped"));
  } else {
    Serial.print(F("pin "));
    Serial.println(SWITCH_PINS[choice]);
  }
}

void printMapResult() {
  Serial.println(F("Limit switch map:"));
  printMapLine(F("Tray 1 side"), mapChoice[0]);
  printMapLine(F("Tray 5 side"), mapChoice[1]);
}

void printLevel(uint8_t i, int level) {
  Serial.print(level == LOW ? F("LOW") : F("HIGH"));
  if (restLevel[i] >= 0) {
    Serial.print(level == restLevel[i] ? F(" (normal)") : F(" (PRESSED / ACTIVE)"));
  } else {
    Serial.print(F(" (send REST to label this)"));
  }
}

void printCm(float cm) {
  if (cm < 0) {
    Serial.print(F("no echo"));
  } else {
    Serial.print(cm, 1);
    Serial.print(F(" cm"));
  }
}

void printStatus() {
  for (uint8_t i = 0; i < SWITCH_COUNT; i++) {
    printSwitchName(i);
    Serial.print(F(": "));
    printLevel(i, digitalRead(SWITCH_PINS[i]));
    Serial.println();
  }
  Serial.print(F("Hopper distance: "));
  printCm(readDistanceCm());
  Serial.println();
}

// ---------------- ultrasonic ----------------

float readOnceCm() {
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(ULTRASONIC_TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(ULTRASONIC_TRIG_PIN, LOW);
  unsigned long duration = pulseIn(ULTRASONIC_ECHO_PIN, HIGH, ULTRASONIC_TIMEOUT_US);
  if (duration == 0) return -1.0f;
  float cm = duration * 0.0343f / 2.0f;     // same formula as FeedLevel.ino
  if (cm < 2.0f || cm > 500.0f) return -1.0f;
  return cm;
}

// Median of 7 readings, so one stray echo does not count.
float readDistanceCm() {
  float v[7];
  uint8_t n = 0;
  for (uint8_t i = 0; i < 7; i++) {
    float cm = readOnceCm();
    if (cm > 0) v[n++] = cm;
    delay(40);
  }
  if (n == 0) return -1.0f;
  for (uint8_t i = 1; i < n; i++) {         // insertion sort
    float x = v[i];
    int8_t j = i - 1;
    while (j >= 0 && v[j] > x) { v[j + 1] = v[j]; j--; }
    v[j + 1] = x;
  }
  return v[n / 2];
}

// ---------------- Nextion ----------------

// Sends "get dp" (current page) at each common baud rate; a Nextion answers
// with 0x71 + 4 bytes + FF FF FF at the right one.
void findNextionBaud() {
  const long rates[] = {9600, 19200, 38400, 57600, 115200, 4800, 2400};
  Serial.println(F("Looking for the Nextion on Serial2 (TX2 16 -> display RX, RX2 17 <- display TX)..."));
  for (uint8_t i = 0; i < sizeof(rates) / sizeof(rates[0]); i++) {
    Serial2.begin(rates[i]);
    delay(50);
    while (Serial2.available()) Serial2.read();
    Serial2.print(F("get dp"));
    Serial2.write(0xFF); Serial2.write(0xFF); Serial2.write(0xFF);

    unsigned long start = millis();
    bool found = false;
    while (millis() - start < 300) {
      if (Serial2.available() && Serial2.read() == 0x71) { found = true; break; }
    }
    Serial2.end();

    Serial.print(F("  "));
    Serial.print(rates[i]);
    Serial.println(found ? F(" baud: ANSWERED") : F(" baud: no answer"));
    if (found) {
      nextionBaud = rates[i];
      return;
    }
  }
  Serial.println(F("No answer at any rate: check the display's power, and TX/RX (they cross over)."));
}

// ---------------- result ----------------

const __FlashStringHelper* pressedLevelText(uint8_t i) {
  return restLevel[i] == HIGH ? F("LOW") : F("HIGH");
}

void printResult() {
  Serial.println(F("---- Paste into HyFePoul_Arduino/Config.ino ----"));
  if (restLevel[0] < 0) {
    Serial.println(F("(Switches: type REST with everything in its normal state first.)"));
  } else {
    if (restLevel[0] != restLevel[1]) {
      Serial.println(F("WARNING: the two limit switches rest at different levels; wire them the same way."));
    }
    Serial.print(F("const uint8_t LIMIT_SWITCH_PRESSED = "));
    Serial.print(pressedLevelText(0));
    Serial.println(restLevel[0] == HIGH ? F(";   // closes to GND when pressed (NO)") : F(";   // opens when pressed (NC)"));
    Serial.print(F("const uint8_t WATER_LOW_LEVEL      = "));
    Serial.print(pressedLevelText(2));
    Serial.println(F(";   // float reading when the reservoir is low"));
    printMapResult();
    if (mapChoice[0] >= 0 && mapChoice[1] >= 0) {
      Serial.print(F("const uint8_t LEFT_LIMIT_PIN  = "));
      Serial.print(SWITCH_PINS[mapChoice[0]]);
      Serial.println(F(";   // tray 1 side (Config.ino numbers trays from the left)"));
      Serial.print(F("const uint8_t RIGHT_LIMIT_PIN = "));
      Serial.print(SWITCH_PINS[mapChoice[1]]);
      Serial.println(F(";   // tray 5 side"));
    } else {
      Serial.println(F("(Limit switch pins: send MAP.)"));
    }
  }
  if (emptyCm > 0) {
    Serial.print(F("float HOPPER_EMPTY_DISTANCE_CM = "));
    Serial.print(emptyCm, 1);
    Serial.println(F("f;"));
  } else {
    Serial.println(F("(Hopper empty distance: type EMPTY with the hopper empty.)"));
  }
  if (fullCm > 0) {
    Serial.print(F("float HOPPER_FULL_DISTANCE_CM  = "));
    Serial.print(fullCm, 1);
    Serial.println(F("f;"));
  } else {
    Serial.println(F("(Hopper full distance: type FULL with the hopper full.)"));
  }
  if (emptyCm > 0 && fullCm > 0 && emptyCm <= fullCm) {
    Serial.println(F("WARNING: EMPTY must be farther than FULL; measure again."));
  }
  if (nextionBaud > 0) {
    Serial.print(F("NEXTION_SERIAL.begin("));
    Serial.print(nextionBaud);
    Serial.println(F(");   // in initializeSystem()"));
  } else {
    Serial.println(F("(Nextion baud: type NEXTION with the display connected.)"));
  }
  Serial.println(F("------------------------------------------------"));
}
