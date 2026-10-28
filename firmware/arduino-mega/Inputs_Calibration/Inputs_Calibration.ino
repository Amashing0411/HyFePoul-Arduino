/*
  Inputs_Calibration.ino

  Stand-alone calibration of the HyFePoul inputs. Upload this instead of the
  full firmware; it drives NO relay or motor (relay pins are held off), so
  motor power can stay connected or not.

  It finds:
    - switch polarity: what each switch reads when pressed / active
        LEFT and RIGHT chain limit switches, reservoir float switch, E-stop
    - ultrasonic hopper distances: hopper EMPTY and hopper FULL
    - the Nextion display's baud rate
  and prints the matching lines for HyFePoul_Arduino/Config.ino.

  Pins (same as Config.ino; PLACEHOLDERS where marked there):
    LEFT limit 45, RIGHT limit 46, float 35, E-stop 37   (INPUT_PULLUP)
    ultrasonic TRIG 31, ECHO 33;  Nextion on Serial2 (TX2 16, RX2 17)

  Serial Monitor: 115200 baud, line ending "New Line".

    HELP          list the commands
    STATUS        every input once (levels and distance)
    WATCH         print each switch change as it happens, plus the distance
                  every 2 s; any line stops it
    REST          record the "normal" state: limit switches NOT pressed,
                  E-stop released, reservoir FULL (float up)
    DIST          hopper distance now (median of 7 readings)
    EMPTY         record the distance with the hopper EMPTY
    FULL          record the distance with the hopper FULL
    NEXTION       find the display's baud rate
    RESULT        print the Config.ino lines

  Switches: put everything in its normal state, type REST, then use WATCH
  and press each switch (and lower the float) to see it change. The pressed
  level is the opposite of the REST level.
*/

const uint8_t LEFT_LIMIT_PIN  = 45;
const uint8_t RIGHT_LIMIT_PIN = 46;
const uint8_t WATER_LOW_PIN   = 35;
const uint8_t EMERGENCY_STOP_PIN = 37;
const uint8_t ULTRASONIC_TRIG_PIN = 31;
const uint8_t ULTRASONIC_ECHO_PIN = 33;
const unsigned long ULTRASONIC_TIMEOUT_US = 30000UL;

// Relay pins: never driven here (left as inputs = off for typical boards).
const uint8_t RELAY_PINS[] = {10, 9, 8};

const uint8_t SWITCH_COUNT = 4;
const uint8_t SWITCH_PINS[SWITCH_COUNT] = {LEFT_LIMIT_PIN, RIGHT_LIMIT_PIN, WATER_LOW_PIN, EMERGENCY_STOP_PIN};
const char* const SWITCH_NAMES[SWITCH_COUNT] = {"LEFT limit", "RIGHT limit", "Float (water)", "E-stop"};

int restLevel[SWITCH_COUNT] = {-1, -1, -1, -1};   // -1 = REST not done
int lastLevel[SWITCH_COUNT];
float emptyCm = -1.0f;
float fullCm = -1.0f;
long nextionBaud = 0;

bool watching = false;
unsigned long lastDistMillis = 0;
String inputLine = "";

void setup() {
  for (uint8_t i = 0; i < sizeof(RELAY_PINS); i++) pinMode(RELAY_PINS[i], INPUT);
  for (uint8_t i = 0; i < SWITCH_COUNT; i++) pinMode(SWITCH_PINS[i], INPUT_PULLUP);
  pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
  pinMode(ULTRASONIC_ECHO_PIN, INPUT);

  Serial.begin(115200);
  Serial.println();
  Serial.println(F("HyFePoul inputs calibration (switches, ultrasonic, Nextion)"));
  Serial.println(F("No relay or motor is driven by this sketch."));
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

  if (watching) {
    for (uint8_t i = 0; i < SWITCH_COUNT; i++) {
      int level = digitalRead(SWITCH_PINS[i]);
      if (level != lastLevel[i]) {
        lastLevel[i] = level;
        Serial.print(SWITCH_NAMES[i]);
        Serial.print(F(" -> "));
        printLevel(i, level);
        Serial.println();
      }
    }
    if (millis() - lastDistMillis >= 2000) {
      lastDistMillis = millis();
      Serial.print(F("Hopper distance: "));
      printCm(readDistanceCm());
      Serial.println();
    }
  }
}

void handleCommand(String line) {
  line.trim();
  line.toUpperCase();
  if (line.length() == 0) return;

  if (watching) {
    watching = false;
    Serial.println(F("WATCH stopped."));
    return;
  }

  if (line == "HELP") {
    printHelp();
  } else if (line == "STATUS") {
    printStatus();
  } else if (line == "WATCH") {
    for (uint8_t i = 0; i < SWITCH_COUNT; i++) lastLevel[i] = -1;
    watching = true;
    lastDistMillis = 0;
    Serial.println(F("Watching; press switches, move the float. Any line stops."));
  } else if (line == "REST") {
    for (uint8_t i = 0; i < SWITCH_COUNT; i++) restLevel[i] = digitalRead(SWITCH_PINS[i]);
    Serial.println(F("Normal state recorded:"));
    printStatus();
  } else if (line == "DIST") {
    Serial.print(F("Hopper distance: "));
    printCm(readDistanceCm());
    Serial.println();
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
  Serial.println(F("Commands: STATUS | WATCH | REST | DIST | EMPTY | FULL | NEXTION | RESULT | HELP"));
}

void printLevel(uint8_t i, int level) {
  Serial.print(level == LOW ? F("LOW") : F("HIGH"));
  if (restLevel[i] >= 0) {
    Serial.print(level == restLevel[i] ? F(" (normal)") : F(" (PRESSED / ACTIVE)"));
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
    Serial.print(SWITCH_NAMES[i]);
    Serial.print(F(" (pin "));
    Serial.print(SWITCH_PINS[i]);
    Serial.print(F("): "));
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
    Serial.print(F("const uint8_t ESTOP_PRESSED        = "));
    Serial.print(pressedLevelText(3));
    Serial.println(restLevel[3] == HIGH ? F(";   // closes to GND when pressed (NO)") : F(";   // opens when pressed (NC, fail-safe)"));
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
