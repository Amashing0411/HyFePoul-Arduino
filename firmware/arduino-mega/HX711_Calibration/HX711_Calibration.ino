/*
  HX711_Calibration.ino

  Stand-alone load-cell calibration for the 5 HyFePoul trays. Upload this
  instead of the full firmware; it only talks to the five HX711 boards and
  the USB serial monitor. Nothing else (relays, motors, ESP32, SD, Nextion)
  is touched, so keep the chain and dispenser motor power disconnected and
  you can calibrate safely.

  Pins: same as Config.ino in HyFePoul_Arduino (one SCK/DT pair per tray).
  Library: "HX711 Arduino Library" (bogde), same as the main firmware.

  Serial Monitor: 115200 baud, line ending "Newline".

    HELP               list the commands
    READ               one reading of every tray (grams and raw counts)
    WATCH <1-5>        stream one tray every 0.5 s; send any line to stop
    TARE <1-5|ALL>     zero a tray (empty tray on its load cell)
    CAL <1-5> <grams>  after TARE, put a known weight on the tray: computes
                       and applies that tray's calibration factor
    SET <1-5> <factor> type in a factor you already know
    CHAN <1-5> <A|B>   read the HX711's channel A (default, gain 128) or
                       channel B (gain 32): for a load cell wired to B+/B-
    FACTORS            print the factors as the Config.ino line to paste

  Procedure for each tray:
    1. Empty the tray.            TARE 1
    2. Put a known weight on it.  CAL 1 500      (500 g example)
    3. Check it.                  READ  (or WATCH 1), try other weights
    4. Repeat for trays 2-5, then FACTORS and paste the printed line over
       LOAD_CELL_CALIBRATION_FACTORS in HyFePoul_Arduino/Config.ino.

  Factors are kept in RAM only; they are lost when the Mega restarts.
*/

#include <HX711.h>

const uint8_t TRAY_COUNT = 5;

// Tray 1 HX711
const uint8_t TRAY1_HX711_SCK_PIN = 22;
const uint8_t TRAY1_HX711_DT_PIN  = 24;

// Tray 2 HX711
const uint8_t TRAY2_HX711_SCK_PIN = 26;
const uint8_t TRAY2_HX711_DT_PIN  = 28;

// Tray 3 HX711
const uint8_t TRAY3_HX711_SCK_PIN = 30;
const uint8_t TRAY3_HX711_DT_PIN  = 32;

// Tray 4 HX711
const uint8_t TRAY4_HX711_SCK_PIN = 34;
const uint8_t TRAY4_HX711_DT_PIN  = 36;

// Tray 5 HX711
const uint8_t TRAY5_HX711_SCK_PIN = 38;
const uint8_t TRAY5_HX711_DT_PIN  = 40;

// Starting factors: the current values in Config.ino (placeholders).
float factors[TRAY_COUNT] = { -7050.0f, -7050.0f, -7050.0f, -7050.0f, -7050.0f };

const uint8_t SAMPLES = 10;            // readings averaged for TARE / CAL / READ
const unsigned long READY_TIMEOUT_MS = 1000;

HX711 trayScales[TRAY_COUNT];

int watchTray = 0;                     // 1-5 while WATCH runs, 0 = off
unsigned long lastWatchMillis = 0;
String inputLine = "";

void setup() {
  Serial.begin(115200);
  Serial.println();
  Serial.println(F("HyFePoul HX711 calibration (5 trays)"));

  startTray(1, TRAY1_HX711_DT_PIN, TRAY1_HX711_SCK_PIN);
  startTray(2, TRAY2_HX711_DT_PIN, TRAY2_HX711_SCK_PIN);
  startTray(3, TRAY3_HX711_DT_PIN, TRAY3_HX711_SCK_PIN);
  startTray(4, TRAY4_HX711_DT_PIN, TRAY4_HX711_SCK_PIN);
  startTray(5, TRAY5_HX711_DT_PIN, TRAY5_HX711_SCK_PIN);

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

  if (watchTray > 0 && millis() - lastWatchMillis >= 500) {
    lastWatchMillis = millis();
    printTray(watchTray, 3);
  }
}

// Starts one tray's HX711 on its own pins and tares it if it responds.
void startTray(uint8_t tray, uint8_t dtPin, uint8_t sckPin) {
  HX711& scale = trayScales[tray - 1];
  scale.begin(dtPin, sckPin);
  scale.set_scale(factors[tray - 1]);

  Serial.print(F("Tray "));
  Serial.print(tray);
  Serial.print(F(" (SCK "));
  Serial.print(sckPin);
  Serial.print(F(", DT "));
  Serial.print(dtPin);
  Serial.print(F("): "));

  if (scale.wait_ready_timeout(READY_TIMEOUT_MS)) {
    scale.tare(SAMPLES);
    Serial.println(F("ready, tared"));
  } else {
    Serial.println(F("NOT DETECTED - check power, SCK and DT wiring"));
  }
}

void handleCommand(String line) {
  line.trim();
  line.toUpperCase();
  if (line.length() == 0) return;

  if (watchTray > 0) {               // any line stops WATCH
    watchTray = 0;
    Serial.println(F("WATCH stopped."));
    if (line == "STOP") return;
  }

  int sp = line.indexOf(' ');
  String cmd = sp < 0 ? line : line.substring(0, sp);
  String args = sp < 0 ? String("") : line.substring(sp + 1);
  args.trim();

  if (cmd == "HELP") {
    printHelp();
  } else if (cmd == "READ") {
    for (uint8_t t = 1; t <= TRAY_COUNT; t++) printTray(t, SAMPLES);
  } else if (cmd == "WATCH") {
    int t = parseTray(args);
    if (t > 0) {
      watchTray = t;
      Serial.println(F("Watching; send any line to stop."));
    }
  } else if (cmd == "TARE") {
    if (args == "ALL") {
      for (uint8_t t = 1; t <= TRAY_COUNT; t++) tareTray(t);
    } else {
      int t = parseTray(args);
      if (t > 0) tareTray(t);
    }
  } else if (cmd == "CAL") {
    calibrateTray(args);
  } else if (cmd == "SET") {
    setFactor(args);
  } else if (cmd == "CHAN") {
    setChannel(args);
  } else if (cmd == "FACTORS") {
    printFactors();
  } else {
    Serial.print(F("Unknown command: "));
    Serial.println(line);
    printHelp();
  }
}

void printHelp() {
  Serial.println(F("Commands: READ | WATCH <1-5> | TARE <1-5|ALL> | CAL <1-5> <grams> |"));
  Serial.println(F("          SET <1-5> <factor> | CHAN <1-5> <A|B> | FACTORS | HELP"));
}

// Parses "1".."5"; prints an error and returns 0 otherwise.
int parseTray(const String& s) {
  int t = s.toInt();
  if (t < 1 || t > TRAY_COUNT) {
    Serial.println(F("Tray must be 1-5."));
    return 0;
  }
  return t;
}

bool trayReady(uint8_t tray) {
  if (trayScales[tray - 1].wait_ready_timeout(READY_TIMEOUT_MS)) return true;
  Serial.print(F("Tray "));
  Serial.print(tray);
  Serial.println(F(": not responding (check wiring)."));
  return false;
}

void printTray(uint8_t tray, uint8_t samples) {
  if (!trayReady(tray)) return;
  HX711& scale = trayScales[tray - 1];
  long raw = scale.read_average(samples);
  float grams = (raw - scale.get_offset()) / scale.get_scale();

  Serial.print(F("Tray "));
  Serial.print(tray);
  Serial.print(F(": "));
  Serial.print(grams, 1);
  Serial.print(F(" g   raw "));
  Serial.print(raw);
  Serial.print(F("   factor "));
  Serial.println(scale.get_scale(), 2);
}

void tareTray(uint8_t tray) {
  if (!trayReady(tray)) return;
  trayScales[tray - 1].tare(SAMPLES);
  Serial.print(F("Tray "));
  Serial.print(tray);
  Serial.println(F(" tared (zero set)."));
}

// CAL <tray> <grams>: factor = (reading - zero) / known grams.
void calibrateTray(const String& args) {
  int sp = args.indexOf(' ');
  if (sp < 0) {
    Serial.println(F("Usage: CAL <1-5> <grams>   (TARE that tray first)"));
    return;
  }
  int t = parseTray(args.substring(0, sp));
  float grams = args.substring(sp + 1).toFloat();
  if (t == 0) return;
  if (grams <= 0.0f) {
    Serial.println(F("Known weight must be more than 0 g."));
    return;
  }
  if (!trayReady(t)) return;

  HX711& scale = trayScales[t - 1];
  float value = scale.get_value(SAMPLES);   // counts above the tared zero
  if (value == 0.0f) {
    Serial.println(F("No change from zero: is the weight on the tray? Did you TARE first?"));
    return;
  }

  float factor = value / grams;
  factors[t - 1] = factor;
  scale.set_scale(factor);

  Serial.print(F("Tray "));
  Serial.print(t);
  Serial.print(F(" factor = "));
  Serial.println(factor, 2);
  printTray(t, SAMPLES);
}

void setFactor(const String& args) {
  int sp = args.indexOf(' ');
  if (sp < 0) {
    Serial.println(F("Usage: SET <1-5> <factor>"));
    return;
  }
  int t = parseTray(args.substring(0, sp));
  float factor = args.substring(sp + 1).toFloat();
  if (t == 0) return;
  if (factor == 0.0f) {
    Serial.println(F("Factor cannot be 0."));
    return;
  }
  factors[t - 1] = factor;
  trayScales[t - 1].set_scale(factor);
  Serial.print(F("Tray "));
  Serial.print(t);
  Serial.print(F(" factor set to "));
  Serial.println(factor, 2);
}

// CHAN <tray> <A|B>: switches the input the HX711 reads. Channel B has a
// fixed gain of 32 (a quarter of A's), so its factors are smaller.
void setChannel(const String& args) {
  int sp = args.indexOf(' ');
  String ch = sp < 0 ? String("") : args.substring(sp + 1);
  ch.trim();
  if (sp < 0 || (ch != "A" && ch != "B")) {
    Serial.println(F("Usage: CHAN <1-5> <A|B>"));
    return;
  }
  int t = parseTray(args.substring(0, sp));
  if (t == 0) return;
  HX711& scale = trayScales[t - 1];
  scale.set_gain(ch == "A" ? 128 : 32);
  scale.read();                       // the new channel applies from the next reading
  if (trayReady(t)) scale.tare(SAMPLES);
  Serial.print(F("Tray "));
  Serial.print(t);
  Serial.print(F(" now reads channel "));
  Serial.print(ch);
  Serial.println(F(" (tared). Try WATCH and press on the tray."));
}

void printFactors() {
  Serial.println(F("Paste into HyFePoul_Arduino/Config.ino:"));
  Serial.print(F("float LOAD_CELL_CALIBRATION_FACTORS[TRAY_COUNT] = {"));
  for (uint8_t i = 0; i < TRAY_COUNT; i++) {
    Serial.print(' ');
    Serial.print(factors[i], 2);
    Serial.print('f');
    if (i < TRAY_COUNT - 1) Serial.print(',');
  }
  Serial.println(F(" };"));
}
