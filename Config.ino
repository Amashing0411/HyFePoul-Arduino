/*
  Config.ino
  Central configuration and shared variables.

  IMPORTANT:
  Pin assignments below are based on the previous HyFePoul configuration
  and the current block diagram. Confirm every pin against the final wiring
  before connecting the prototype.
*/

#include <Wire.h>
#include <SPI.h>
#include <SD.h>
#include <RTClib.h>
#include <HX711.h>

// -----------------------------
// Arduino Mega pin assignments
// -----------------------------

// HX711 + load cell
const uint8_t HX711_DOUT_PIN = 30;
const uint8_t HX711_SCK_PIN  = 31;

// Ultrasonic feed-hopper sensor
const uint8_t ULTRASONIC_TRIG_PIN = 32;
const uint8_t ULTRASONIC_ECHO_PIN = 33;

// Water float switches
const uint8_t WATER_LOW_PIN  = 34;
const uint8_t WATER_HIGH_PIN = 35;

// Actuators
const uint8_t WATER_PUMP_RELAY_PIN = 36;
const uint8_t DISPENSER_RELAY_PIN  = 37;

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

// PLACEHOLDER: must be calibrated using the actual load cell.
float LOAD_CELL_CALIBRATION_FACTOR = -7050.0f;

// PLACEHOLDER: measure actual empty/full hopper distances.
float HOPPER_EMPTY_DISTANCE_CM = 40.0f;
float HOPPER_FULL_DISTANCE_CM  = 5.0f;

// Feed-level alert thresholds with hysteresis.
const float LOW_FEED_THRESHOLD_PERCENT = 20.0f;
const float LOW_FEED_CLEAR_PERCENT     = 25.0f;

// Ultrasonic timeout.
const unsigned long ULTRASONIC_TIMEOUT_US = 30000UL;

// Feeding settings.
const unsigned long FEEDING_TIMEOUT_MS = 30000UL;
const float DEFAULT_FEED_TARGET_GRAMS = 500.0f;

// Water pump safety timeout.
const unsigned long WATER_PUMP_MAX_RUNTIME_MS = 120000UL;

// ESP32 communication settings.
const unsigned long ESP32_TIMEOUT_MS = 15000UL;
const unsigned long ESP32_TIME_SYNC_INTERVAL_MS = 300000UL;

// SD logging interval.
const unsigned long SD_LOG_INTERVAL_MS = 30000UL;

// Main loop delay.
// For a more responsive final system, this can later be replaced
// by non-blocking millis()-based scheduling.
const unsigned long MAIN_LOOP_DELAY_MS = 100UL;

// -----------------------------
// Feeding schedule
// -----------------------------

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

HX711 scale;
RTC_DS3231 rtc;

// -----------------------------
// Shared runtime variables
// -----------------------------

// Feed
float currentFeedWeightGrams = 0.0f;
float currentHopperLevelPercent = 0.0f;
float activeFeedTargetGrams = 0.0f;

bool feedingActive = false;
bool feedingCompleted = false;
unsigned long feedingStartMillis = 0;
int lastExecutedFeedIndex = -1;

// Water
bool waterLow = false;
bool waterHigh = false;
bool waterPumpActive = false;
unsigned long waterPumpStartMillis = 0;

// Safety
bool emergencyStopActive = false;

// ESP32
bool esp32Online = false;
unsigned long lastESP32MessageMillis = 0;
unsigned long lastNetworkTimeMillis = 0;

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
String pendingAlertEvent = "";
bool lowFeedAlertSent = false;
bool waterPumpTimeoutAlertSent = false;

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
  initializeLoadCell();
  initializeRTC();
  initializeSD();

  // Initial sensor reads.
  updateFeedLevel();
  updateHydration();

  Serial.println(F("================================"));
  Serial.println(F("HyFePoul Arduino Mega Starting"));
  Serial.println(F("Primary Controller: Arduino Mega 2560"));
  Serial.println(F("ESP32: Wi-Fi/Internet module"));
  Serial.println(F("================================"));

  logEventToSD("SYSTEM_START");
}

void initializePins() {
  pinMode(ULTRASONIC_TRIG_PIN, OUTPUT);
  pinMode(ULTRASONIC_ECHO_PIN, INPUT);

  pinMode(WATER_LOW_PIN, INPUT_PULLUP);
  pinMode(WATER_HIGH_PIN, INPUT_PULLUP);

  pinMode(WATER_PUMP_RELAY_PIN, OUTPUT);
  pinMode(DISPENSER_RELAY_PIN, OUTPUT);

  pinMode(EMERGENCY_STOP_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);

  // IMPORTANT:
  // Assumes relay OFF = LOW.
  // Confirm whether the physical relay module is active LOW or active HIGH.
  digitalWrite(WATER_PUMP_RELAY_PIN, LOW);
  digitalWrite(DISPENSER_RELAY_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);
}
