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

// HX711 + load cells: one under each of the 5 trays.
// All five HX711 boards share one SCK line; each has its own DOUT.
// Reading one board also clocks the others, which only discards their
// pending conversion (all run at the same gain), so they are read one at
// a time and only when ready.
const uint8_t TRAY_COUNT = 5;
const uint8_t HX711_DOUT_PINS[TRAY_COUNT] = {30, 40, 41, 42, 43};
const uint8_t HX711_SCK_PIN = 31;

// Ultrasonic feed-hopper sensor
const uint8_t ULTRASONIC_TRIG_PIN = 32;
const uint8_t ULTRASONIC_ECHO_PIN = 33;

// Water reservoir float switch (gravity-fed drinker, no pump)
const uint8_t WATER_LOW_PIN = 34;

// Actuators
// The chain motor is reversed by two relays that swap its polarity:
// forward relay ON = forward, reverse relay ON = reverse. The firmware
// never turns both on together.
const uint8_t CHAIN_FORWARD_RELAY_PIN = 36;
const uint8_t CHAIN_REVERSE_RELAY_PIN = 44;
const uint8_t DISPENSER_RELAY_PIN     = 37;

// Chain limit switches (hopper position)
const uint8_t HOME_LIMIT_PIN = 45; // start position
const uint8_t END_LIMIT_PIN  = 46; // far end, past tray 5

// Safety / alarm
const uint8_t EMERGENCY_STOP_PIN = 38;
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

// PLACEHOLDER: measure actual empty/full hopper distances.
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

// PLACEHOLDER (open items O-1, O-4): bench-calibrate all timings below.
// Forward run time to reach each tray, measured from the previous stop
// (home for tray 1, the previous tray for the others). Timed travel is
// used because there is no position sensor at each tray.
const unsigned long TRAY_TRAVEL_MS[TRAY_COUNT] = {
  3000UL, 3000UL, 3000UL, 3000UL, 3000UL
};
// Max dispenser run per tray; on expiry the tray is skipped (TRAY_TIMEOUT).
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

// Feed cycle (Feeding.ino). feedingActive is true while a cycle runs.
bool feedingActive = false;
CycleStep cycleStep = CYCLE_IDLE;
uint8_t currentTray = 0; // 1..TRAY_COUNT while at/heading to a tray, else 0
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
const uint8_t ALERT_QUEUE_SIZE = 4;
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
  NEXTION_SERIAL.begin(9600); // PLACEHOLDER: confirm Nextion baud rate.

  initializePins();
  initializeLoadCells();
  initializeRTC();
  initializeSD();

  // After SD so the load result is logged.
  initializeSchedules();

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
  digitalWrite(CHAIN_FORWARD_RELAY_PIN, LOW);
  digitalWrite(CHAIN_REVERSE_RELAY_PIN, LOW);
  digitalWrite(DISPENSER_RELAY_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  pinMode(CHAIN_FORWARD_RELAY_PIN, OUTPUT);
  pinMode(CHAIN_REVERSE_RELAY_PIN, OUTPUT);
  pinMode(DISPENSER_RELAY_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
}
