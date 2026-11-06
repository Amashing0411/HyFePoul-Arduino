
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

// Tray numbers are the trays' own labels, not their positions (see
// TRAY_AT_POSITION). Each HX711 uses two analog pins as plain digital pins.

// Tray 1 HX711
const uint8_t TRAY1_HX711_SCK_PIN = A1;
const uint8_t TRAY1_HX711_DT_PIN  = A0;

// Tray 2 HX711
const uint8_t TRAY2_HX711_SCK_PIN = A3;
const uint8_t TRAY2_HX711_DT_PIN  = A2;

// Tray 3 HX711
const uint8_t TRAY3_HX711_SCK_PIN = A5;
const uint8_t TRAY3_HX711_DT_PIN  = A4;

// Tray 4 HX711
const uint8_t TRAY4_HX711_SCK_PIN = A7;
const uint8_t TRAY4_HX711_DT_PIN  = A6;

// Tray 5 HX711
const uint8_t TRAY5_HX711_SCK_PIN = A9;
const uint8_t TRAY5_HX711_DT_PIN  = A8;

// Ultrasonic feed-hopper sensor
const uint8_t ULTRASONIC_TRIG_PIN = 52;
const uint8_t ULTRASONIC_ECHO_PIN = 50;

// Water reservoir float switch (gravity-fed drinker, no pump)
const uint8_t WATER_LOW_PIN = 49;

// Chain: start side, relays and limit switches.
// The hopper starts at the limit switch on HOPPER_START_SIDE, runs to the
// trays one by one (TRAY_TRAVEL_MS) until the far limit switch stops it,
// then returns to the start switch for the next feeding. Calibrate with
// firmware/arduino-mega/Chain_Calibration (its RESULT prints these lines).
//
// Standing in front of the device, the trays from left to right are 4, 5, 3,
// 2, 1. Each keeps its own load cell whichever side the hopper starts from.
const uint8_t TRAY_AT_POSITION[TRAY_COUNT] = {4, 5, 3, 2, 1};
// From the right (tray 1 side) the hopper visits trays 1, 2, 3, 5, 4.
const HopperSide HOPPER_START_SIDE = SIDE_RIGHT; // parks at the tray 1 end (Chain_Calibration, 2026-11-06)

// The chain motor is reversed by two relays that swap its polarity; each is
// named by the way it moves the hopper. The firmware never turns both on
// together. Directions confirmed with Chain_Calibration JOG (no SWAP needed).
const uint8_t CHAIN_TO_RIGHT_RELAY_PIN = 10;
const uint8_t CHAIN_TO_LEFT_RELAY_PIN  = 9;
const uint8_t DISPENSER_RELAY_PIN      = 8;

// Limit switches at each end of the chain, mapped with Inputs_Calibration.
// Left and right are as seen from the front of the device.
const uint8_t LEFT_LIMIT_PIN  = 51; // tray 4 side
const uint8_t RIGHT_LIMIT_PIN = 53; // tray 1 side

// Input/output polarity, confirmed by Inputs_Calibration and
// Outputs_Calibration (2026-11-06).
const uint8_t RELAY_ON  = LOW;   // active-LOW relay board (Outputs_Calibration)
const uint8_t RELAY_OFF = RELAY_ON == HIGH ? LOW : HIGH;
const uint8_t LIMIT_SWITCH_PRESSED = LOW; // LOW: closes to GND when pressed (NO); HIGH: NC
const uint8_t WATER_LOW_LEVEL      = HIGH; // float reads HIGH when the reservoir is low (WATCH, 2026-11-06)

// Derived from the start side; the feed cycle uses these. "Forward" is
// away from the start, toward the far switch; "home" is the start switch.
const bool START_LEFT = HOPPER_START_SIDE == SIDE_LEFT;
const uint8_t HOME_LIMIT_PIN = START_LEFT ? LEFT_LIMIT_PIN : RIGHT_LIMIT_PIN;
const uint8_t END_LIMIT_PIN  = START_LEFT ? RIGHT_LIMIT_PIN : LEFT_LIMIT_PIN;
const uint8_t CHAIN_FORWARD_RELAY_PIN = START_LEFT ? CHAIN_TO_RIGHT_RELAY_PIN : CHAIN_TO_LEFT_RELAY_PIN;
const uint8_t CHAIN_REVERSE_RELAY_PIN = START_LEFT ? CHAIN_TO_LEFT_RELAY_PIN : CHAIN_TO_RIGHT_RELAY_PIN;

// Safety / alarm
const uint8_t BUZZER_PIN         = 11;
// Active, low-trigger buzzer module (tested with Outputs_Calibration): LOW sounds it.
const uint8_t BUZZER_ON  = LOW;
const uint8_t BUZZER_OFF = HIGH;

// SD card: no module is fitted, and pins 50, 51, 52 and 53 are used by other
// inputs and outputs. Starting the SD library would drive those pins, so keep
// this false unless they are moved and a module is added.
const bool SD_LOGGING_ENABLED = false;
const uint8_t SD_CS_PIN = 53;

// Serial ports
// Serial3: Mega <-> ESP32
// Serial2: Mega <-> Nextion
#define ESP32_SERIAL Serial3
#define NEXTION_SERIAL Serial2

// -----------------------------
// Sensor / calibration settings
// -----------------------------

// From HX711_Calibration. Tray 3's factor is well below the others (about
// 1,800 to 2,000 counts/g), so check its cell and wiring if its readings drift.
float LOAD_CELL_CALIBRATION_FACTORS[TRAY_COUNT] = {
  1787.856f, 1960.0f, 384.628f, 1959.096f, 1866.02f
};

// Ultrasonic pings: one per interval, levels use the median of the last few.
const unsigned long HOPPER_PING_INTERVAL_MS = 500UL;
// 15 pings = the median of the last 7.5 s: single jumps (stray echoes, the
// uneven feed surface) never move it.
const uint8_t HOPPER_SAMPLE_COUNT = 15;
// Shown level eases toward the median (fraction per ping) and changes only
// in steps of at least this many percent.
const float HOPPER_SMOOTHING = 0.2f;
const float HOPPER_DISPLAY_STEP_PERCENT = 3.0f;
// This many failed pings in a row (about 5 s) count as a sensor fault.
const uint8_t HOPPER_FAULT_PINGS = 10;

// Two-point calibration with the main firmware's filtered distance (STATUS
// "filtered", 2026-11-07), surface smoothed flat each time:
//   FULL: hopper filled to the fill line, 7.5 cm  -> 100 %
//   LOW:  about 30 % feed left, 15.3 cm (ruler 12.6 cm) -> HOPPER_LOW_PERCENT
// The percentage follows the straight line through both points (0 % at
// about 18.6 cm). The filtered distance reads deeper than a ruler, so
// always recalibrate with the filtered value, never a ruler or single ping.
float HOPPER_FULL_DISTANCE_CM = 7.5f;
float HOPPER_LOW_DISTANCE_CM  = 15.3f;
const float HOPPER_LOW_PERCENT = 30.0f;

// LOW_FEED alert: raised when the filtered distance reaches the LOW point
// (by distance, not by percentage), cleared once the feed is this much
// above it again.
const float HOPPER_LOW_CLEAR_MARGIN_CM = 1.0f;

// Below this level a feed cycle does not start, and a running cycle stops
// dispensing and returns home (raises LOW_FEED).
const float HOPPER_EMPTY_PERCENT = 5.0f;
// Mid-cycle "out of feed" also needs the tray to gain less than this much
// in this long of pouring (feed normally lands within about 1 s).
const unsigned long HOPPER_NO_FLOW_MS = 3000UL;
// After a feed cycle the shown hopper level waits this long for the feed
// to settle before it follows the sensor again (FeedLevel.ino).
const unsigned long HOPPER_SETTLE_AFTER_FEED_MS = 10000UL;
const float HOPPER_NO_FLOW_GRAMS = 3.0f;

// Ultrasonic timeout.
const unsigned long ULTRASONIC_TIMEOUT_US = 30000UL;

// Feeding settings. Targets are grams PER TRAY.
const float DEFAULT_FEED_TARGET_GRAMS = 50.0f;
const float MAX_TRAY_TARGET_GRAMS = 1000.0f;

// Chain timings below are from firmware/arduino-mega/Chain_Calibration on the
// machine (2026-11-06), checked with PLAY. Trays 1 and 4 sit at the ends of
// the track, so the hopper can only reach part of them and their spans are
// shorter. Tray 1's first spot was set by hand to start at the parked position.
// Run time to each tray's near edge, in the order the hopper reaches the
// trays from the start side: entry 1 = start switch to the first tray,
// entry 2 = far edge of the first tray to near edge of the second, and so
// on. The feed cycle adds the edge gaps (see TRAY_SPOT_COUNT). Timed travel is used because there is no position sensor at each tray.
// Travel order: trays 1 2 3 5 4
// Trimmed with FEED 1 dry runs (2026-11-06): with 3 drops per tray the
// hopper reached tray 3's middle instead of its first quarter (entry cut
// 1489 -> 770 -> 670 ms), then tray 5's middle (entry cut 1241 -> 652 ms),
// and tray 4 ran into the end switch. Tray 4 then sat slightly early, on its
// near rim (entry 1365 -> 1515 ms). The end switch is over tray 4's middle and
// home is over tray 1's middle, so only half of trays 1 and 4 is reachable.
// FEED 60 check: tray 2 almost at its middle (1583 -> 933, tray 3 kept by
// 670 -> 1320) and tray 5 early (652 -> 902, tray 4 kept by 1515 -> 1265).
// Next run tray 2 was early: halfway back (933 -> 1233, tray 3 kept by
// 1320 -> 1020).
const unsigned long TRAY_TRAVEL_MS[TRAY_COUNT] = {
  100UL, 1233UL, 1020UL, 902UL, 1265UL
};
// Feed is spread along each tray: the hopper stops at this many spots and
// drops an equal share of the target at each one. The spots sit inside the
// tray, never on its edges: the span is cut into TRAY_SPOT_COUNT + 1 equal
// gaps and the hopper drops at the inner points (edge 1 2 3 edge). Dropping
// on an edge spilled feed over the rim, which the scale did not see.
const uint8_t TRAY_SPOT_COUNT = 3;
// Run time across each tray (edge to edge as measured), in the same travel
// order. Fewer stops also means less travel lost to starting and stopping.
const unsigned long TRAY_SPAN_MS[TRAY_COUNT] = {
  978UL, 3083UL, 2889UL, 2756UL, 1368UL
};
// Pause after each step, so feed still falling is on the scale before the
// next share is judged.
const unsigned long TRAY_SPOT_SETTLE_MS = 300UL;
// Feed that still lands after the dispenser stops (pellets in the auger and
// in the air). Each spot stops this much below its running target. Measured
// 2026-11-06: a 2 s run read 48.5 g at stop and settled at 59 g; FEED 60
// gave about 72 g per tray with no allowance and 62-75 g (mean 68) with 10 g.
const float DISPENSE_IN_FLIGHT_GRAMS = 17.0f;
// Last-spot top-up: after the main pour, wait for the feed to land, weigh,
// and add short pulses until the tray is within FEED_TOLERANCE_GRAMS of the
// target (so 58-60 g counts as 60 g). Feed falls from the auger mouth
// unevenly, so a tighter tolerance only adds pulses and overshoot.
// 1 g: with 50 g, 49-51 g counts as 50 g (falling feed makes the rest noise).
const float FEED_TOLERANCE_GRAMS = 1.0f;
// Last spot's main pour stops this far below the target: the in-flight feed
// (DISPENSE_IN_FLIGHT_GRAMS) plus its spread, so it lands short and the
// pulses finish from below. FEED 50 with 17 g reached 50-57 g.
const float LAST_SPOT_HOLDBACK_GRAMS = 25.0f;
// Top-up pulses aim for this fraction of the shortfall at the learned rate.
const float TOPUP_PULSE_FRACTION = 0.6f;
// Feed even the shortest pulse drops: pellets fall from the auger mouth in
// clumps. Measured 2026-11-07 over tray 1: 150 ms 7.6 g, 300 ms 4.6 g,
// 500 ms 21.5 g. A tray short by less than half of this is left as it is,
// because one more pulse would end at least as far past the target.
const float TOPUP_MIN_PULSE_GRAMS = 8.0f;
// Tray readings below this show as 0 g (empty-tray noise is about +/-1 g).
const float TRAY_ZERO_DEADBAND_GRAMS = 1.5f;
const unsigned long TOPUP_SETTLE_MS = 1500UL;
const unsigned long TOPUP_MIN_PULSE_MS = 150UL;
const unsigned long TOPUP_MAX_PULSE_MS = 1500UL;
// Max total dispenser run per tray; on expiry the rest is skipped (TRAY_TIMEOUT).
// Outputs_Calibration (FLOW / GRAMS) suggests it from the measured flow.
// This is the minimum; larger targets get twice their expected pour time
// (target / DISPENSER_FLOW_GRAMS_PER_S), so 1000 g is not cut off at 250 g.
const unsigned long TRAY_DISPENSE_TIMEOUT_MS = 10000UL; // 25.30 g/s measured; 50 g takes about 2 s
const float DISPENSER_FLOW_GRAMS_PER_S = 25.3f;
// Pause after the chain stops before taring, so the tray stops swinging.
const unsigned long TRAY_SETTLE_MS = 500UL;
// Readings averaged for each tray tare, and how long to wait for them.
const uint8_t TRAY_TARE_SAMPLES = 5;
const unsigned long TRAY_TARE_TIMEOUT_MS = 3000UL;
// Max time to reach the end switch after the last tray, and the home switch.
// Measured: last spot to the far switch 631 ms; the whole run 17483 ms. The
// return was slower than the run out (17592 ms from tray 4's last spot), so
// the home limit keeps the 30 s the sketch also uses, not its suggested 27 s.
const unsigned long CHAIN_END_TIMEOUT_MS  = 5000UL;
const unsigned long CHAIN_HOME_TIMEOUT_MS = 30000UL;
// Both direction relays stay off this long before the motor reverses.
const unsigned long CHAIN_DEAD_TIME_MS = 300UL;

// The float must read the same for this long before the water state
// changes, so ripples from drinking do not toggle the alert.
const unsigned long WATER_DEBOUNCE_MS = 2000UL;

// ESP32 communication settings.
const unsigned long ESP32_TIMEOUT_MS = 15000UL;
// DATA line to the ESP32 (written to devices/{id}/state for the app).
const unsigned long DATA_INTERVAL_FEEDING_MS = 3000UL;
const unsigned long DATA_INTERVAL_IDLE_MS = 10000UL;
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
// Loop delay while a motor runs, so timed moves and weight stops stay accurate.
const unsigned long MOTOR_LOOP_DELAY_MS = 2UL;

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
float currentHopperLevelPercent = 0.0f;   // shown/alerted; held during a feed
float liveHopperLevelPercent = 0.0f;      // every ping, also during a feed
bool hopperSensorFault = false; // no usable echo; the level above is stale
float activeFeedTargetGrams = 0.0f; // per tray, for the running/last cycle
float manualFeedTargetGrams = DEFAULT_FEED_TARGET_GRAMS; // saved local HMI target, per tray

// Feed cycle (Feeding.ino). feedingActive is true while a cycle runs.
bool feedingActive = false;
CycleStep cycleStep = CYCLE_IDLE;
uint8_t currentTray = 0; // tray number (its label, 1-5) at/heading to, else 0
uint8_t currentStop = 0; // 1-5: how many trays into the run, in travel order; 0 = none
unsigned long cycleStepStartMillis = 0;
const char* cycleFailReason = NULL; // first problem in this cycle, or NULL
bool trayTimeoutAlertSent = false;  // one TRAY_TIMEOUT alert per cycle
int lastExecutedFeedIndex = -1;

// Feed spots on the current tray (CYCLE_DISPENSING, CYCLE_TO_SPOT)
uint8_t currentSpot = 0;              // 0 = first spot
bool spotMoveDone = false;            // chain has stopped at the next spot
unsigned long spotArrivedMillis = 0;
unsigned long dispenseStartMillis = 0;
float spotStartGrams = 0.0f;           // tray reading when this pour began
float trayStartGrams = 0.0f;           // feed already in the tray on arrival
bool trayZerosLoaded = false;          // saved empty-tray zeros in use (TrayZero.ino)
bool topUpActive = false;              // last spot: settling or pulsing
bool topUpPulsing = false;             // dispenser on for a top-up pulse
unsigned long topUpSettleStartMillis = 0;
unsigned long topUpPulseMs = 0;
float topUpGramsPerMs = 0.0253f;       // learned per tray from its pulses
float topUpBeforeGrams = -1.0f;        // reading before the last pulse
unsigned long trayDispenseUsedMs = 0; // dispenser run so far on this tray
bool trayAborted = false;             // tray failed: pass the spots without feed
bool trayFeedCounted = false;         // this tray's grams are in the day totals

// Tray tare in progress (CYCLE_TARING)
long tareSum = 0;
uint8_t tareCount = 0;

// Chain motor (Feeding.ino)
ChainDirection chainDirection = CHAIN_STOPPED;
unsigned long chainStopMillis = 0;
unsigned long chainRunStartMillis = 0;

// Water
bool waterLow = false;

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
  NEXTION_SERIAL.begin(9600); // confirmed by Inputs_Calibration NEXTION (2026-11-06)

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
  initializeFeedLevel();
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
  if (!lowFeedAlertSent && hopperAboveLowClear()) {
    queueAlertEvent("LOW_FEED_CLEARED");
  }

  if (!waterLow) {
    queueAlertEvent("LOW_WATER_CLEARED");
  }

  if (!hopperSensorFault) {
    queueAlertEvent("HOPPER_SENSOR_OK");
  }
}

// Prints a warning for every pin number used by two functions in the pin
// map above (including the serial ports and the SD card's SPI bus), so a
// pin change on the bench cannot silently break another input or output.
void checkPinConflicts() {
  const uint8_t PIN_NOT_USED = 255;
  const uint8_t pins[] = {
    TRAY1_HX711_SCK_PIN, TRAY1_HX711_DT_PIN,
    TRAY2_HX711_SCK_PIN, TRAY2_HX711_DT_PIN,
    TRAY3_HX711_SCK_PIN, TRAY3_HX711_DT_PIN,
    TRAY4_HX711_SCK_PIN, TRAY4_HX711_DT_PIN,
    TRAY5_HX711_SCK_PIN, TRAY5_HX711_DT_PIN,
    ULTRASONIC_TRIG_PIN, ULTRASONIC_ECHO_PIN, WATER_LOW_PIN,
    CHAIN_FORWARD_RELAY_PIN, CHAIN_REVERSE_RELAY_PIN, DISPENSER_RELAY_PIN,
    HOME_LIMIT_PIN, END_LIMIT_PIN, BUZZER_PIN,
    SD_LOGGING_ENABLED ? SD_CS_PIN : PIN_NOT_USED,   // SD card: CS
    SD_LOGGING_ENABLED ? 50 : PIN_NOT_USED,          // SPI MISO
    SD_LOGGING_ENABLED ? 51 : PIN_NOT_USED,          // SPI MOSI
    SD_LOGGING_ENABLED ? 52 : PIN_NOT_USED,          // SPI SCK
    20, 21,                 // I2C (RTC) SDA/SCL
    14, 15,                 // Serial3 (ESP32) TX/RX
    16, 17                  // Serial2 (Nextion) TX/RX
  };
  const uint8_t count = sizeof(pins) / sizeof(pins[0]);
  bool ok = true;

  for (uint8_t i = 0; i < count; i++) {
    for (uint8_t j = i + 1; j < count; j++) {
      if (pins[i] != PIN_NOT_USED && pins[i] == pins[j]) {
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

  // IMPORTANT:
  // Ensure relays remain in their safe state (OFF = LOW)
  // before engaging the output drivers to prevent startup glitches.
  // OFF level written before the pins become outputs, so an active-LOW
  // relay board never pulses on at boot.
  digitalWrite(CHAIN_FORWARD_RELAY_PIN, RELAY_OFF);
  digitalWrite(CHAIN_REVERSE_RELAY_PIN, RELAY_OFF);
  digitalWrite(DISPENSER_RELAY_PIN, RELAY_OFF);
  digitalWrite(BUZZER_PIN, BUZZER_OFF);

  pinMode(CHAIN_FORWARD_RELAY_PIN, OUTPUT);
  pinMode(CHAIN_REVERSE_RELAY_PIN, OUTPUT);
  pinMode(DISPENSER_RELAY_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
}
