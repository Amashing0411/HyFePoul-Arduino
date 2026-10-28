
/*
  Config.ino
  Central configuration and shared variables.

  IMPORTANT:
  Pin assignments below follow the moving-hopper design revision
  (docs/design-revision-moving-hopper.md). Confirm every pin against the
  final wiring before connecting the prototype.
*/

#include <Wire.h>
#include <SPI.h>
#include <SD.h>
#include <RTClib.h>
#include <HX711.h>

// -----------------------------
// Arduino Mega pin assignments
// -----------------------------

// HX711 + load cells: one under each of the 5 trays. Every HX711 has its
// own SCK and DT (DOUT) pins, as wired on the device; no line is shared.
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

// Ultrasonic feed-hopper sensor
const uint8_t ULTRASONIC_TRIG_PIN = 31; // PLACEHOLDER: free pin (32 is now tray 3 DT); confirm wiring
const uint8_t ULTRASONIC_ECHO_PIN = 33;

// Water reservoir float switch (gravity-fed drinker, no pump)
const uint8_t WATER_LOW_PIN = 35; // PLACEHOLDER: free pin (34 is now tray 4 SCK); confirm wiring

// Chain: start side, relays and limit switches.
// The hopper starts at the limit switch on HOPPER_START_SIDE, runs to the
// trays one by one (TRAY_TRAVEL_MS) until the far limit switch stops it,
// then returns to the start switch for the next feeding. Calibrate with
// firmware/arduino-mega/Chain_Calibration (its RESULT prints these lines).
//
// Trays are numbered 1-5 from LEFT to RIGHT (PLACEHOLDER: confirm); each
// keeps its own load cell whichever side the hopper starts from.
const HopperSide HOPPER_START_SIDE = SIDE_LEFT; // PLACEHOLDER: pick on the bench

// The chain motor is reversed by two relays that swap its polarity; each is
// named by the way it moves the hopper. The firmware never turns both on
// together. PLACEHOLDER: confirm the directions with Chain_Calibration JOG.
const uint8_t CHAIN_TO_RIGHT_RELAY_PIN = 10;
const uint8_t CHAIN_TO_LEFT_RELAY_PIN  = 9;
const uint8_t DISPENSER_RELAY_PIN      = 8;

// Limit switches at each end of the chain (PLACEHOLDER: confirm sides).
const uint8_t LEFT_LIMIT_PIN  = 45;
const uint8_t RIGHT_LIMIT_PIN = 46;

// Input/output polarity. PLACEHOLDERS: set from the RESULT lines of
// Inputs_Calibration (switches) and Outputs_Calibration (relays).
const uint8_t RELAY_ON  = HIGH;  // HIGH = active-HIGH relay board, LOW = active-LOW
const uint8_t RELAY_OFF = RELAY_ON == HIGH ? LOW : HIGH;
const uint8_t LIMIT_SWITCH_PRESSED = LOW; // LOW: closes to GND when pressed (NO); HIGH: NC
const uint8_t WATER_LOW_LEVEL      = LOW; // float switch reading when the reservoir is low
const uint8_t ESTOP_PRESSED        = LOW; // LOW: closes to GND (NO); HIGH: NC (fail-safe)

// Derived from the start side; the feed cycle uses these. "Forward" is
// away from the start, toward the far switch; "home" is the start switch.
const bool START_LEFT = HOPPER_START_SIDE == SIDE_LEFT;
const uint8_t HOME_LIMIT_PIN = START_LEFT ? LEFT_LIMIT_PIN : RIGHT_LIMIT_PIN;
const uint8_t END_LIMIT_PIN  = START_LEFT ? RIGHT_LIMIT_PIN : LEFT_LIMIT_PIN;
const uint8_t CHAIN_FORWARD_RELAY_PIN = START_LEFT ? CHAIN_TO_RIGHT_RELAY_PIN : CHAIN_TO_LEFT_RELAY_PIN;
const uint8_t CHAIN_REVERSE_RELAY_PIN = START_LEFT ? CHAIN_TO_LEFT_RELAY_PIN : CHAIN_TO_RIGHT_RELAY_PIN;

// Safety / alarm
const uint8_t EMERGENCY_STOP_PIN = 37; // PLACEHOLDER: free pin (38 is now tray 5 SCK); confirm wiring
const uint8_t BUZZER_PIN         = 39;

// SD card
const uint8_t SD_CS_PIN = 53;

// Serial ports
// Serial1: Mega <-> ESP32
// Serial2: Mega <-> Nextion
#define ESP32_SERIAL Serial1
#define NEXTION_SERIAL Serial2

// -----------------------------
// Sensor / calibration settings
// -----------------------------

// PLACEHOLDER: calibrate each tray's load cell separately.
float LOAD_CELL_CALIBRATION_FACTORS[TRAY_COUNT] = {
  -7050.0f, -7050.0f, -7050.0f, -7050.0f, -7050.0f
};

// PLACEHOLDER: measure actual empty/full hopper distances (Inputs_Calibration
// EMPTY / FULL).
float HOPPER_EMPTY_DISTANCE_CM = 40.0f;
float HOPPER_FULL_DISTANCE_CM  = 5.0f;

// Feed-level alert thresholds with hysteresis.
const float LOW_FEED_THRESHOLD_PERCENT = 20.0f;
const float LOW_FEED_CLEAR_PERCENT     = 25.0f;

// Below this level a feed cycle does not start, and a running cycle stops
// dispensing and returns home (raises LOW_FEED).
const float HOPPER_EMPTY_PERCENT = 5.0f;

// Ultrasonic timeout.
const unsigned long ULTRASONIC_TIMEOUT_US = 30000UL;

// Feeding settings. Targets are grams PER TRAY.
const float DEFAULT_FEED_TARGET_GRAMS = 50.0f;
const float MAX_TRAY_TARGET_GRAMS = 1000.0f;

// PLACEHOLDER (open items O-1, O-4): bench-calibrate all timings below
// with firmware/arduino-mega/Chain_Calibration.
// Run time to each stop, in the order the hopper reaches the trays from the
// start side: entry 1 = start switch to the first tray, entry 2 = first to
// second tray, and so on. Timed travel is used because there is no position
// sensor at each tray.
const unsigned long TRAY_TRAVEL_MS[TRAY_COUNT] = {
  3000UL, 3000UL, 3000UL, 3000UL, 3000UL
};
// Max dispenser run per tray; on expiry the tray is skipped (TRAY_TIMEOUT).
// Outputs_Calibration (FLOW / GRAMS) suggests it from the measured flow.
const unsigned long TRAY_DISPENSE_TIMEOUT_MS = 30000UL;
// Pause after the chain stops before taring, so the tray stops swinging.
const unsigned long TRAY_SETTLE_MS = 500UL;
// Readings averaged for each tray tare, and how long to wait for them.
const uint8_t TRAY_TARE_SAMPLES = 5;
const unsigned long TRAY_TARE_TIMEOUT_MS = 3000UL;
// Max time to reach the end switch after the last tray, and the home switch.
const unsigned long CHAIN_END_TIMEOUT_MS  = 15000UL;
const unsigned long CHAIN_HOME_TIMEOUT_MS = 30000UL;
// Both direction relays stay off this long before the motor reverses.
const unsigned long CHAIN_DEAD_TIME_MS = 300UL;

// The float must read the same for this long before the water state
// changes, so ripples from drinking do not toggle the alert.
const unsigned long WATER_DEBOUNCE_MS = 2000UL;

// ESP32 communication settings.
const unsigned long ESP32_TIMEOUT_MS = 15000UL;
const unsigned long ESP32_TIME_SYNC_INTERVAL_MS = 300000UL;

// Local time offset from UTC (Philippine Standard Time, no DST).
// The RTC, SD log and DATA packets stay in UTC; this offset is applied only
// where the user's wall clock matters (feed schedules, Nextion clock).
const int16_t LOCAL_UTC_OFFSET_MINUTES = 480;

// SD logging interval.
const unsigned long SD_LOG_INTERVAL_MS = 30000UL;

// Main loop delay.
// For a more responsive final system, this can later be replaced
// by non-blocking millis()-based scheduling.
const unsigned long MAIN_LOOP_DELAY_MS = 100UL;

// -----------------------------
// Feeding schedule
// -----------------------------

// targetGrams is per tray: each cycle fills all trays to this amount.
struct FeedSchedule {
  uint8_t hour;
  uint8_t minute;
  float targetGrams;
  bool enabled;
};

const uint8_t FEED_SCHEDULE_COUNT = 3;

FeedSchedule feedSchedules[FEED_SCHEDULE_COUNT] = {
  {7,  0, DEFAULT_FEED_TARGET_GRAMS, true},
  {12, 0, DEFAULT_FEED_TARGET_GRAMS, true},
  {18, 0, DEFAULT_FEED_TARGET_GRAMS, true}
};

// -----------------------------
// Shared hardware objects
// -----------------------------

HX711 trayScales[TRAY_COUNT];
RTC_DS3231 rtc;

// -----------------------------
// Shared runtime variables
// -----------------------------

// Feed
// Tray weights are grams since that tray's last tare, i.e. feed dispensed
// at the last visit (minus anything eaten since). currentFeedWeightGrams
// is their sum.
float trayWeightsGrams[TRAY_COUNT] = {0.0f, 0.0f, 0.0f, 0.0f, 0.0f};
float currentFeedWeightGrams = 0.0f;
float currentHopperLevelPercent = 0.0f;
float activeFeedTargetGrams = 0.0f; // per tray, for the running/last cycle
float manualFeedTargetGrams = DEFAULT_FEED_TARGET_GRAMS; // saved local HMI target, per tray

// Feed cycle (Feeding.ino). feedingActive is true while a cycle runs.
bool feedingActive = false;
CycleStep cycleStep = CYCLE_IDLE;
uint8_t currentTray = 0; // tray number (1-5, left to right) at/heading to, else 0
uint8_t currentStop = 0; // 1-5: how many trays into the run, in travel order; 0 = none
unsigned long cycleStepStartMillis = 0;
const char* cycleFailReason = NULL; // first problem in this cycle, or NULL
bool trayTimeoutAlertSent = false;  // one TRAY_TIMEOUT alert per cycle
int lastExecutedFeedIndex = -1;

// Tray tare in progress (CYCLE_TARING)
long tareSum = 0;
uint8_t tareCount = 0;

// Chain motor (Feeding.ino)
ChainDirection chainDirection = CHAIN_STOPPED;
unsigned long chainStopMillis = 0;
unsigned long chainRunStartMillis = 0;

// Water
bool waterLow = false;

// Safety
// emergencyStopActive is the latched stop state; emergencyButtonPressed is
// the live physical button state.
bool emergencyStopActive = false;
bool emergencyButtonPressed = false;

// ESP32
// esp32Online = the ESP32 reports Wi-Fi + Firebase session (STATUS|ONLINE)
// AND the UART link is alive (a line within ESP32_TIMEOUT_MS). The ESP32
// sends STATUS every 10 s, which doubles as the link heartbeat.
bool esp32Online = false;
bool esp32ReportsOnline = false;
unsigned long lastESP32MessageMillis = 0;
unsigned long lastNetworkTimeMillis = 0;
String activeRemoteCommandId = "";

// Time
enum TimeSource {
  TIME_SOURCE_RTC,
  TIME_SOURCE_NETWORK,
  TIME_SOURCE_INVALID
};

TimeSource currentTimeSource = TIME_SOURCE_RTC;
bool rtcValid = false;
bool networkTimeValid = false;

// SD
bool sdAvailable = false;
unsigned long lastSDLogMillis = 0;

// Alerts
// Small FIFO so alerts raised in the same loop are not overwritten.
// Entries point to string literals, so no copies are kept in RAM.
// Sized for the boot burst: SYSTEM_START, the boot clears and any alert
// raised by the first sensor reads.
const uint8_t ALERT_QUEUE_SIZE = 8;
const char* alertQueue[ALERT_QUEUE_SIZE];
uint8_t alertQueueHead = 0;
uint8_t alertQueueCount = 0;

bool lowFeedAlertSent = false;
bool lowWaterAlertSent = false;

// Buzzer
bool buzzerActive = false;
unsigned long buzzerStartMillis = 0;
const unsigned long BUZZER_DURATION_MS = 500;

// -----------------------------
// System initialization
// -----------------------------

void initializeSystem() {
  Serial.begin(115200);
  ESP32_SERIAL.begin(115200);
  NEXTION_SERIAL.begin(9600); // PLACEHOLDER: confirm with Inputs_Calibration NEXTION.

  checkPinConflicts();

  initializePins();
  initializeLoadCells();
  initializeRTC();
  initializeSD();

  // After SD so the load result is logged.
  initializeSchedules();

  // Panel schedule edits still waiting for the cloud (R-54).
  initializeScheduleSync();
  initializeManualFeedTarget();

  // Today's / yesterday's totals from EEPROM (after the RTC).
  initializeDailyStats();

  // Initial sensor reads.
  updateFeedLevel();
  initializeHydration();

  Serial.println(F("================================"));
  Serial.println(F("HyFePoul Arduino Mega Starting"));
  Serial.println(F("Primary Controller: Arduino Mega 2560"));
  Serial.println(F("ESP32: Wi-Fi/Internet module"));
  Serial.println(F("================================"));

  logEventToSD("SYSTEM_START");

  // Tells the ESP32 to re-send the RTDB schedules after a Mega restart.
  queueAlertEvent("SYSTEM_START");

  queueBootClears();

  // Last, so slow start-up work (SD card, sensors) cannot trigger a reset.
  startWatchdog();
}

// Alerts raised before a restart stay "active" in the app until a clear
// event arrives. After boot, report every condition that is fine now so
// stale alerts get resolved. The ESP32 holds these until it is online and
// only touches alerts that exist and are still active.
void queueBootClears() {
  if (!lowFeedAlertSent && currentHopperLevelPercent >= LOW_FEED_CLEAR_PERCENT) {
    queueAlertEvent("LOW_FEED_CLEARED");
  }

  if (!waterLow) {
    queueAlertEvent("LOW_WATER_CLEARED");
  }

  // A power cycle clears the E-stop latch. If the button is still pressed,
  // the first loop latches it again and EMERGENCY_STOP follows this event.
  queueAlertEvent("EMERGENCY_STOP_RELEASED");
}

// Prints a warning for every pin number used by two functions in the pin
// map above (including the serial ports and the SD card's SPI bus), so a
// pin change on the bench cannot silently break another input or output.
void checkPinConflicts() {
  const uint8_t pins[] = {
    TRAY1_HX711_SCK_PIN, TRAY1_HX711_DT_PIN,
    TRAY2_HX711_SCK_PIN, TRAY2_HX711_DT_PIN,
    TRAY3_HX711_SCK_PIN, TRAY3_HX711_DT_PIN,
    TRAY4_HX711_SCK_PIN, TRAY4_HX711_DT_PIN,
    TRAY5_HX711_SCK_PIN, TRAY5_HX711_DT_PIN,
    ULTRASONIC_TRIG_PIN, ULTRASONIC_ECHO_PIN, WATER_LOW_PIN,
    CHAIN_FORWARD_RELAY_PIN, CHAIN_REVERSE_RELAY_PIN, DISPENSER_RELAY_PIN,
    HOME_LIMIT_PIN, END_LIMIT_PIN, EMERGENCY_STOP_PIN, BUZZER_PIN,
    SD_CS_PIN, 50, 51, 52,  // SD card: CS + SPI MISO/MOSI/SCK
    20, 21,                 // I2C (RTC) SDA/SCL
    18, 19,                 // Serial1 (ESP32) TX/RX
    16, 17                  // Serial2 (Nextion) TX/RX
  };
  const uint8_t count = sizeof(pins) / sizeof(pins[0]);
  bool ok = true;

  for (uint8_t i = 0; i < count; i++) {
    for (uint8_t j = i + 1; j < count; j++) {
      if (pins[i] == pins[j]) {
        Serial.print(F("WARNING: pin "));
        Serial.print(pins[i]);
        Serial.println(F(" is assigned twice in Config.ino; fix the pin map before wiring that part."));
        ok = false;
      }
    }
  }

  if (ok) {
    Serial.println(F("Pin map: no pin used twice."));
  }
}

void initializePins() {
  pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
  pinMode(ULTRASONIC_ECHO_PIN, INPUT);

  pinMode(WATER_LOW_PIN, INPUT_PULLUP);

  pinMode(HOME_LIMIT_PIN, INPUT_PULLUP);
  pinMode(END_LIMIT_PIN, INPUT_PULLUP);

  pinMode(EMERGENCY_STOP_PIN, INPUT_PULLUP);

  // IMPORTANT:
  // Ensure relays remain in their safe state (OFF = LOW)
  // before engaging the output drivers to prevent startup glitches.
  // OFF level written before the pins become outputs, so an active-LOW
  // relay board never pulses on at boot.
  digitalWrite(CHAIN_FORWARD_RELAY_PIN, RELAY_OFF);
  digitalWrite(CHAIN_REVERSE_RELAY_PIN, RELAY_OFF);
  digitalWrite(DISPENSER_RELAY_PIN, RELAY_OFF);
  digitalWrite(BUZZER_PIN, LOW);

  pinMode(CHAIN_FORWARD_RELAY_PIN, OUTPUT);
  pinMode(CHAIN_REVERSE_RELAY_PIN, OUTPUT);
  pinMode(DISPENSER_RELAY_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
}
