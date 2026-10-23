/**
 * simulate-mega.js
 *
 * Simulates the parsing and state-machine logic implemented in the Arduino
 * Mega firmware (ESP32Communication.ino, Feeding.ino, Hydration.ino,
 * Safety.ino, ScheduleStorage.ino, Nextion.ino) against a simple model of
 * the moving-hopper hardware: a chain position with home/end limit
 * switches, five tray load cells, the dispenser, the hopper level and the
 * reservoir float switch.
 *
 * It verifies the command validation, the 5-tray feed cycle, its safety
 * rules (relay interlock, dead time, limit switches, timeouts, E-stop) and
 * the water alert. It is a logic check only: it does not replace the
 * hardware integration tests (docs/hardware-integration-test-plan.md).
 *
 * Run: node scripts/simulate-mega.js
 */

// --- Config.ino constants ---
const TRAY_COUNT = 5;
const DEFAULT_FEED_TARGET_GRAMS = 50;
const MAX_TRAY_TARGET_GRAMS = 1000;
const TRAY_TRAVEL_MS = [3000, 3000, 3000, 3000, 3000];
const TRAY_DISPENSE_TIMEOUT_MS = 30000;
const TRAY_SETTLE_MS = 500;
const TRAY_TARE_SAMPLES = 5;
const TRAY_TARE_TIMEOUT_MS = 3000;
const CHAIN_END_TIMEOUT_MS = 15000;
const CHAIN_HOME_TIMEOUT_MS = 30000;
const CHAIN_DEAD_TIME_MS = 300;
const HOPPER_EMPTY_PERCENT = 5;
const LOW_FEED_THRESHOLD_PERCENT = 20;
const LOW_FEED_CLEAR_PERCENT = 25;
const WATER_DEBOUNCE_MS = 2000;
const LOOP_MS = 100;

// --- Mega state ---
let simMillis = 0;
let emergencyStopActive = false;
let emergencyButtonPressed = false;
let activeRemoteCommandId = "";
let outputLog = [];

let feedingActive = false;
let cycleStep = "IDLE";
let currentTray = 0;
let cycleStepStartMillis = 0;
let cycleFailReason = null;
let trayTimeoutAlertSent = false;
let activeFeedTargetGrams = 0;
let lastExecutedFeedIndex = -1;
let trayWeightsGrams = [0, 0, 0, 0, 0];
let tareSum = 0;
let tareCount = 0;

let chainDirection = "STOPPED";
let chainStopMillis = -Infinity;
let chainRunStartMillis = 0;

let currentHopperLevelPercent = 80;
let lowFeedAlertSent = false;

let waterLow = false;
let waterLowCandidate = false;
let waterCandidateSinceMillis = 0;
let lowWaterAlertSent = false;

let buzzerCount = 0;

let feedSchedules = [
  { hour: 7, minute: 0, targetGrams: 50, enabled: true },
  { hour: 12, minute: 0, targetGrams: 50, enabled: true },
  { hour: 17, minute: 0, targetGrams: 50, enabled: true }
];

const pins = {
  EMERGENCY_STOP: 1, // HIGH = released, LOW = pressed
  DISPENSER_RELAY: 0,
  CHAIN_FORWARD_RELAY: 0,
  CHAIN_REVERSE_RELAY: 0
};

// --- Hardware model ---
// Chain position in "ms of forward travel" from home. The home switch is
// pressed at <= 0, the end switch at >= END_POSITION.
const trayPosition = (tray) => TRAY_TRAVEL_MS.slice(0, tray).reduce((a, b) => a + b, 0);
const END_POSITION = trayPosition(TRAY_COUNT) + 4000;
const hw = {
  chainPos: 0,
  trayGrams: [0, 0, 0, 0, 0],   // physical feed in each tray
  scaleRaw: [0, 0, 0, 0, 0],    // HX711 raw = physical grams (factor 1)
  scaleOffset: [0, 0, 0, 0, 0], // set by tare
  scaleDead: [false, false, false, false, false],
  dispenserJammed: false,
  gramsPerTick: 5,
  hopperPercentPerGram: 0.02,
  endSwitchBroken: false,
  homeSwitchBroken: false,
  spilledGrams: 0
};
let interlockViolations = 0;
let deadTimeViolations = 0;
let lastRelayOffMillis = -Infinity;
let lastActiveRelay = null;

const resetHardware = () => {
  hw.chainPos = 0;
  hw.trayGrams = [0, 0, 0, 0, 0];
  hw.scaleOffset = [0, 0, 0, 0, 0];
  hw.scaleDead = [false, false, false, false, false];
  hw.dispenserJammed = false;
  hw.endSwitchBroken = false;
  hw.homeSwitchBroken = false;
  hw.spilledGrams = 0;
  interlockViolations = 0;
  deadTimeViolations = 0;
  lastActiveRelay = null;
  lastRelayOffMillis = -Infinity;
};

const isHomeSwitchPressed = () => !hw.homeSwitchBroken && hw.chainPos <= 0;
const isEndSwitchPressed = () => !hw.endSwitchBroken && hw.chainPos >= END_POSITION;
const scaleIsReady = (i) => !hw.scaleDead[i];
const scaleRead = (i) => hw.trayGrams[i];
const scaleGetUnits = (i) => hw.trayGrams[i] - hw.scaleOffset[i];

// Physics for one loop period, applied after the firmware ran.
const stepHardware = () => {
  const fwd = pins.CHAIN_FORWARD_RELAY === 1;
  const rev = pins.CHAIN_REVERSE_RELAY === 1;
  if (fwd && rev) interlockViolations++;

  const active = fwd ? "F" : rev ? "R" : null;
  if (active && lastActiveRelay && active !== lastActiveRelay &&
      simMillis - lastRelayOffMillis < CHAIN_DEAD_TIME_MS) {
    deadTimeViolations++;
  }
  if (active) lastActiveRelay = active;

  if (fwd && !rev) hw.chainPos = Math.min(hw.chainPos + LOOP_MS, END_POSITION + 500);
  if (rev && !fwd) hw.chainPos = Math.max(hw.chainPos - LOOP_MS, -500);

  if (pins.DISPENSER_RELAY === 1 && !hw.dispenserJammed && currentHopperLevelPercent > 0) {
    const g = hw.gramsPerTick;
    currentHopperLevelPercent = Math.max(0, currentHopperLevelPercent - g * hw.hopperPercentPerGram);
    const tray = [1, 2, 3, 4, 5].find(t => Math.abs(hw.chainPos - trayPosition(t)) < 500);
    if (tray) hw.trayGrams[tray - 1] += g; else hw.spilledGrams += g;
  }
};

// --- Messages ---
const sendCmdAck = (id, status, reason = "") => {
  let msg = `CMD_ACK|ID:${id}|STATUS:${status}`;
  if (reason) msg += `|REASON:${reason}`;
  outputLog.push(msg);
};

const sendCmdDone = (id, status, reason = "") => {
  let msg = `CMD_DONE|ID:${id}|STATUS:${status}`;
  if (reason) msg += `|REASON:${reason}`;
  outputLog.push(msg);
};

const logEventToSD = (name) => outputLog.push(`SD:${name}`);
const triggerAlarm = () => { buzzerCount++; outputLog.push("BUZZER"); };

// --- Alert queue (Config.ino / ESP32Communication.ino) ---
const ALERT_QUEUE_SIZE = 8;
let alertQueue = [];

const queueAlertEvent = (eventName) => {
  outputLog.push(`QUEUED:${eventName}`);
  if (alertQueue.length === ALERT_QUEUE_SIZE) {
    outputLog.push(`DROPPED:${alertQueue.shift()}`);
  }
  alertQueue.push(eventName);
};

// One alert per loop, as in handleESP32Communication().
const sendNextAlert = () => {
  if (alertQueue.length > 0) outputLog.push(`EVENT|${alertQueue.shift()}`);
};

// Mirrors finishRemoteCommand() in ESP32Communication.ino.
const finishRemoteCommand = (status, reason = "") => {
  if (activeRemoteCommandId === "") return;
  sendCmdDone(activeRemoteCommandId, status, reason);
  activeRemoteCommandId = "";
};

// --- FeedLevel.ino (low-feed alert only; the level comes from the model) ---
const updateFeedLevel = () => {
  if (currentHopperLevelPercent <= LOW_FEED_THRESHOLD_PERCENT) {
    if (!lowFeedAlertSent) {
      lowFeedAlertSent = true;
      queueAlertEvent("LOW_FEED");
      triggerAlarm();
    }
  } else if (currentHopperLevelPercent >= LOW_FEED_CLEAR_PERCENT) {
    if (lowFeedAlertSent) queueAlertEvent("LOW_FEED_CLEARED");
    lowFeedAlertSent = false;
  }
};

// --- Hydration.ino ---
let floatSwitchLow = false; // physical float reading
const checkLowWaterAlert = () => {
  if (waterLow) {
    if (!lowWaterAlertSent) {
      lowWaterAlertSent = true;
      queueAlertEvent("LOW_WATER");
      triggerAlarm();
    }
  } else {
    if (lowWaterAlertSent) queueAlertEvent("LOW_WATER_CLEARED");
    lowWaterAlertSent = false;
  }
};

// Mirrors queueBootClears() in Config.ino.
const queueBootClears = () => {
  if (!lowFeedAlertSent && currentHopperLevelPercent >= LOW_FEED_CLEAR_PERCENT) queueAlertEvent("LOW_FEED_CLEARED");
  if (!waterLow) queueAlertEvent("LOW_WATER_CLEARED");
  queueAlertEvent("EMERGENCY_STOP_RELEASED");
};

const updateHydration = () => {
  const reading = floatSwitchLow;
  if (reading !== waterLowCandidate) {
    waterLowCandidate = reading;
    waterCandidateSinceMillis = simMillis;
  } else if (reading !== waterLow && simMillis - waterCandidateSinceMillis >= WATER_DEBOUNCE_MS) {
    waterLow = reading;
  }
  checkLowWaterAlert();
};

// --- Feeding.ino: chain motor ---
const stopChain = () => {
  if (pins.CHAIN_FORWARD_RELAY || pins.CHAIN_REVERSE_RELAY) lastRelayOffMillis = simMillis;
  pins.CHAIN_FORWARD_RELAY = 0;
  pins.CHAIN_REVERSE_RELAY = 0;
  if (chainDirection !== "STOPPED") {
    chainDirection = "STOPPED";
    chainStopMillis = simMillis;
  }
};

const setChainDirection = (direction) => {
  if (direction === "STOPPED" || emergencyStopActive) {
    stopChain();
    return direction === "STOPPED";
  }
  if (direction === chainDirection) return true;
  if (chainDirection !== "STOPPED") {
    stopChain();
    return false;
  }
  if (simMillis - chainStopMillis < CHAIN_DEAD_TIME_MS) return false;

  if (direction === "FORWARD") {
    if (isEndSwitchPressed()) return false;
    pins.CHAIN_REVERSE_RELAY = 0;
    pins.CHAIN_FORWARD_RELAY = 1;
  } else {
    if (isHomeSwitchPressed()) return false;
    pins.CHAIN_FORWARD_RELAY = 0;
    pins.CHAIN_REVERSE_RELAY = 1;
  }
  chainDirection = direction;
  chainRunStartMillis = simMillis;
  return true;
};

const enforceChainLimits = () => {
  if (chainDirection === "FORWARD" && isEndSwitchPressed()) stopChain();
  else if (chainDirection === "REVERSE" && isHomeSwitchPressed()) stopChain();
};

// --- Feeding.ino: load cells ---
const readTrayWeight = (i) => {
  if (!scaleIsReady(i)) return;
  trayWeightsGrams[i] = Math.max(0, scaleGetUnits(i));
};

let idleNextTray = 0;
const refreshIdleTrayWeights = () => {
  readTrayWeight(idleNextTray);
  idleNextTray = (idleNextTray + 1) % TRAY_COUNT;
};

// --- Feeding.ino: cycle ---
const enterCycleStep = (step) => {
  cycleStep = step;
  cycleStepStartMillis = simMillis;
  if (step === "TARING") { tareSum = 0; tareCount = 0; }
  outputLog.push(`STEP:${step}${currentTray ? ":" + currentTray : ""}`);
};

const startFeedCycle = (targetGrams) => {
  if (emergencyStopActive) return "ESTOP_ACTIVE";
  if (feedingActive) return "FEEDING_ACTIVE";
  if (currentHopperLevelPercent <= HOPPER_EMPTY_PERCENT) return "HOPPER_LOW";

  activeFeedTargetGrams = targetGrams;
  feedingActive = true;
  cycleFailReason = null;
  trayTimeoutAlertSent = false;
  currentTray = 0;

  if (isHomeSwitchPressed()) {
    currentTray = 1;
    enterCycleStep("TO_TRAY");
  } else {
    enterCycleStep("HOMING");
  }
  return null;
};

const stopFeedCycle = (reason) => {
  pins.DISPENSER_RELAY = 0;
  stopChain();
  const wasActive = feedingActive;
  feedingActive = false;
  currentTray = 0;
  cycleStep = "IDLE";
  if (wasActive) logEventToSD(reason);
};

const finishFeedCycle = () => {
  pins.DISPENSER_RELAY = 0;
  stopChain();
  feedingActive = false;
  currentTray = 0;
  enterCycleStep("IDLE");
  if (cycleFailReason === null) {
    logEventToSD("FEEDING_COMPLETED");
    queueAlertEvent("FEEDING_COMPLETED");
    finishRemoteCommand("SUCCESS");
  } else {
    logEventToSD("FEEDING_INCOMPLETE");
    finishRemoteCommand("FAILED", cycleFailReason);
  }
};

const chainFault = () => {
  stopFeedCycle("CHAIN_TIMEOUT");
  queueAlertEvent("CHAIN_TIMEOUT");
  triggerAlarm();
  finishRemoteCommand("FAILED", "CHAIN_TIMEOUT");
};

const returnHome = (reason) => {
  pins.DISPENSER_RELAY = 0;
  if (cycleFailReason === null) cycleFailReason = reason;
  currentTray = 0;
  enterCycleStep("RETURNING");
};

const nextTray = () => {
  if (currentTray < TRAY_COUNT) {
    currentTray++;
    enterCycleStep("TO_TRAY");
  } else {
    currentTray = 0;
    enterCycleStep("TO_END");
  }
};

const trayFailed = () => {
  logEventToSD("TRAY_TIMEOUT");
  if (cycleFailReason === null) cycleFailReason = "TRAY_TIMEOUT";
  if (!trayTimeoutAlertSent) {
    trayTimeoutAlertSent = true;
    queueAlertEvent("TRAY_TIMEOUT");
    triggerAlarm();
  }
  nextTray();
};

const runToTray = () => {
  if (isEndSwitchPressed()) {
    stopChain();
    logEventToSD("END_LIMIT_EARLY");
    returnHome("END_LIMIT_EARLY");
    return;
  }
  if (!setChainDirection("FORWARD")) return;
  if (simMillis - chainRunStartMillis >= TRAY_TRAVEL_MS[currentTray - 1]) {
    stopChain();
    enterCycleStep("TARING");
  }
};

const runTaring = (elapsed) => {
  const i = currentTray - 1;
  if (elapsed < TRAY_SETTLE_MS) return;
  if (elapsed >= TRAY_SETTLE_MS + TRAY_TARE_TIMEOUT_MS) {
    logEventToSD("LOAD_CELL_NOT_READY");
    trayFailed();
    return;
  }
  if (!scaleIsReady(i)) return;
  tareSum += scaleRead(i);
  tareCount++;
  if (tareCount >= TRAY_TARE_SAMPLES) {
    hw.scaleOffset[i] = tareSum / tareCount;
    trayWeightsGrams[i] = 0;
    readTrayWeight(i);
    pins.DISPENSER_RELAY = 1;
    enterCycleStep("DISPENSING");
  }
};

const runDispensing = (elapsed) => {
  const i = currentTray - 1;
  readTrayWeight(i);
  if (trayWeightsGrams[i] >= activeFeedTargetGrams) {
    pins.DISPENSER_RELAY = 0;
    nextTray();
    return;
  }
  if (elapsed >= TRAY_DISPENSE_TIMEOUT_MS) {
    pins.DISPENSER_RELAY = 0;
    trayFailed();
  }
};

const runFeedCycle = () => {
  const elapsed = simMillis - cycleStepStartMillis;

  if ((cycleStep === "TO_TRAY" || cycleStep === "TARING" || cycleStep === "DISPENSING") &&
      currentHopperLevelPercent <= HOPPER_EMPTY_PERCENT) {
    pins.DISPENSER_RELAY = 0;
    queueAlertEvent("LOW_FEED");
    triggerAlarm();
    returnHome("HOPPER_EMPTY");
    return;
  }

  switch (cycleStep) {
    case "HOMING":
      if (isHomeSwitchPressed()) { stopChain(); currentTray = 1; enterCycleStep("TO_TRAY"); }
      else if (elapsed >= CHAIN_HOME_TIMEOUT_MS) chainFault();
      else setChainDirection("REVERSE");
      break;
    case "TO_TRAY": runToTray(); break;
    case "TARING": runTaring(elapsed); break;
    case "DISPENSING": runDispensing(elapsed); break;
    case "TO_END":
      if (isEndSwitchPressed()) { stopChain(); currentTray = 0; enterCycleStep("RETURNING"); }
      else if (elapsed >= CHAIN_END_TIMEOUT_MS) chainFault();
      else setChainDirection("FORWARD");
      break;
    case "RETURNING":
      if (isHomeSwitchPressed()) { stopChain(); finishFeedCycle(); }
      else if (elapsed >= CHAIN_HOME_TIMEOUT_MS) chainFault();
      else setChainDirection("REVERSE");
      break;
  }
};

// Schedules: the sim passes the local wall-clock hour/minute directly.
let simLocalTime = null;
const checkScheduledFeeding = (simHour, simMinute) => {
  for (let i = 0; i < 3; i++) {
    if (!feedSchedules[i].enabled) continue;
    if (simHour === feedSchedules[i].hour && simMinute === feedSchedules[i].minute &&
        lastExecutedFeedIndex !== i) {
      startFeeding(i);
    }
  }
};

const startFeeding = (index) => {
  if (index >= 3) return;
  lastExecutedFeedIndex = index;
  const reason = startFeedCycle(feedSchedules[index].targetGrams);
  if (reason !== null) {
    logEventToSD(`FEED_SKIPPED_${reason}`);
    return;
  }
  queueAlertEvent("FEEDING_STARTED");
};

const handleFeeding = () => {
  if (emergencyStopActive) {
    if (feedingActive) stopFeedCycle("FEEDING_STOPPED_ESTOP");
    return;
  }
  if (simLocalTime) checkScheduledFeeding(simLocalTime.hour, simLocalTime.minute);
  if (feedingActive) runFeedCycle(); else refreshIdleTrayWeights();
};

// --- Safety.ino ---
const tripEmergencyStop = () => {
  emergencyStopActive = true;
  stopFeedCycle("FEEDING_STOPPED_ESTOP");
  finishRemoteCommand("FAILED", "ESTOP_ACTIVE");
  queueAlertEvent("EMERGENCY_STOP");
  triggerAlarm();
};

const handleSafety = () => {
  const pressed = pins.EMERGENCY_STOP === 0;
  if (pressed && !emergencyButtonPressed) {
    emergencyButtonPressed = true;
    if (!emergencyStopActive) tripEmergencyStop();
  }
  if (!pressed && emergencyButtonPressed) emergencyButtonPressed = false;
  if (emergencyStopActive) {
    pins.DISPENSER_RELAY = 0;
    stopChain();
  }
  enforceChainLimits();
};

// Returns null on success, otherwise the rejection reason.
const resetEmergencyStop = () => {
  if (pins.EMERGENCY_STOP === 0) return "PHYSICAL_ESTOP_ENGAGED";
  if (!emergencyStopActive) return "ESTOP_NOT_ACTIVE";
  emergencyStopActive = false;
  queueAlertEvent("EMERGENCY_STOP_RELEASED");
  return null;
};

// One main loop: same order as loop() in HyFePoul_Arduino.ino.
const tick = () => {
  handleSafety();
  updateFeedLevel();
  updateHydration();
  handleFeeding();
  stepHardware();
  simMillis += LOOP_MS;
};

const runFor = (ms) => { for (let t = 0; t < ms; t += LOOP_MS) tick(); };
const runUntil = (cond, maxMs = 300000) => {
  for (let t = 0; t < maxMs; t += LOOP_MS) { if (cond()) return; tick(); }
  throw new Error(`Condition not reached within ${maxMs} ms (step ${cycleStep}, tray ${currentTray})`);
};

// Back to an idle, homed, healthy machine between cycle tests.
const resetMachine = () => {
  stopFeedCycle("TEST_RESET");
  resetHardware();
  emergencyStopActive = false;
  emergencyButtonPressed = false;
  pins.EMERGENCY_STOP = 1;
  activeRemoteCommandId = "";
  alertQueue = [];
  currentHopperLevelPercent = 80;
  lowFeedAlertSent = false;
  trayWeightsGrams = [0, 0, 0, 0, 0];
  simLocalTime = null;
  buzzerCount = 0;
  simMillis += 1000;
};

// --- DATA line (sendCurrentDataToESP32) ---
const buildDataLine = () =>
  "DATA|" + trayWeightsGrams.map(g => g.toFixed(1)).join("|") +
  `|${activeFeedTargetGrams.toFixed(1)}|${currentHopperLevelPercent.toFixed(1)}` +
  `|${waterLow ? 1 : 0}|${feedingActive ? 1 : 0}|${cycleStep}|${currentTray}` +
  `|${emergencyStopActive ? 1 : 0}|NETWORK`;

// --- ESP32 link status (ESP32Communication.ino / TimeManager.ino) ---
const ESP32_TIMEOUT_MS = 15000;
let esp32ReportsOnline = false;
let lastESP32MessageMillis = 0;
let esp32Online = false;

const receiveESP32Line = (line) => {
  lastESP32MessageMillis = simMillis;
  if (line === "STATUS|ONLINE") esp32ReportsOnline = true;
  else if (line === "STATUS|OFFLINE") esp32ReportsOnline = false;
};

const updateLinkStatus = () => {
  const linkAlive = lastESP32MessageMillis !== 0 && simMillis - lastESP32MessageMillis <= ESP32_TIMEOUT_MS;
  esp32Online = esp32ReportsOnline && linkAlive;
};

// --- Nextion touch input (Nextion.ino) ---
const NEXTION_ID_UNSET = 255;
let nextionIds = { page: NEXTION_ID_UNSET, stop: NEXTION_ID_UNSET, start: NEXTION_ID_UNSET };
let nextionFrame = [];
let nextionFfCount = 0;
let nextionLastButton = NEXTION_ID_UNSET;
let nextionLastButtonMs = -Infinity;
const NEXTION_BUTTON_DEBOUNCE_MS = 500;

const processNextionFrame = (frame) => {
  if (frame.length !== 4 || frame[0] !== 0x65) return;
  const [, page, id] = frame;
  outputLog.push(`NEXTION_TOUCH:${page}:${id}`);
  if (nextionIds.page === NEXTION_ID_UNSET || page !== nextionIds.page) return;
  if (id === nextionLastButton && simMillis - nextionLastButtonMs < NEXTION_BUTTON_DEBOUNCE_MS) return;
  if (id === nextionIds.stop) {
    nextionLastButton = id; nextionLastButtonMs = simMillis;
    if (!emergencyStopActive) tripEmergencyStop();
  } else if (id === nextionIds.start) {
    nextionLastButton = id; nextionLastButtonMs = simMillis;
    const reason = resetEmergencyStop();
    if (reason) outputLog.push(`NEXTION_START_REJECTED:${reason}`);
  }
};

// Mirrors handleNextionInput(): frames end with FF FF FF.
const feedNextionBytes = (bytes) => {
  for (const b of bytes) {
    if (b === 0xFF) {
      nextionFfCount++;
      if (nextionFfCount === 3) { processNextionFrame(nextionFrame); nextionFrame = []; nextionFfCount = 0; }
      continue;
    }
    while (nextionFfCount > 0 && nextionFrame.length < 32) { nextionFrame.push(0xFF); nextionFfCount--; }
    nextionFfCount = 0;
    if (nextionFrame.length < 32) nextionFrame.push(b); else nextionFrame = [];
  }
};
const touch = (page, id, event = 0x00) => [0x65, page, id, event, 0xFF, 0xFF, 0xFF];

// --- EEPROM schedule store (ScheduleStorage.ino), byte-for-byte ---
// 25 bytes: magic u16 LE | version u8 | 3 x {hour u8, minute u8, float32 LE, enabled u8} | checksum u8
const SCHEDULE_STORE_VERSION = 2;
const FIRMWARE_DEFAULT_SCHEDULES = () => [
  { hour: 7, minute: 0, targetGrams: DEFAULT_FEED_TARGET_GRAMS, enabled: true },
  { hour: 12, minute: 0, targetGrams: DEFAULT_FEED_TARGET_GRAMS, enabled: true },
  { hour: 18, minute: 0, targetGrams: DEFAULT_FEED_TARGET_GRAMS, enabled: true }
];
let eeprom = new Uint8Array(4096).fill(0xFF); // blank AVR EEPROM
let eepromByteWrites = 0;

const scheduleChecksum = (bytes) => {
  let sum = 0;
  for (const b of bytes) sum = ((((sum << 1) | (sum >> 7)) & 0xFF) ^ b) & 0xFF;
  return sum;
};

const serializeScheduleStore = (schedules, version = SCHEDULE_STORE_VERSION) => {
  const bytes = new Uint8Array(25);
  const dv = new DataView(bytes.buffer);
  dv.setUint16(0, 0x4846, true);
  dv.setUint8(2, version);
  schedules.forEach((s, i) => {
    const o = 3 + i * 7;
    dv.setUint8(o, s.hour);
    dv.setUint8(o + 1, s.minute);
    dv.setFloat32(o + 2, s.targetGrams, true);
    dv.setUint8(o + 6, s.enabled ? 1 : 0);
  });
  bytes[24] = scheduleChecksum(bytes.subarray(0, 24));
  return bytes;
};

// EEPROM.put() -> update(): only changed bytes are written.
const saveSchedulesToEEPROM = () => {
  serializeScheduleStore(feedSchedules).forEach((v, i) => {
    if (eeprom[i] !== v) { eeprom[i] = v; eepromByteWrites++; }
  });
};

const loadSchedulesFromEEPROM = () => {
  const bytes = eeprom.slice(0, 25);
  const dv = new DataView(bytes.buffer);
  if (dv.getUint16(0, true) !== 0x4846 || dv.getUint8(2) !== SCHEDULE_STORE_VERSION) return false;
  if (scheduleChecksum(bytes.subarray(0, 24)) !== bytes[24]) return false;
  const slots = [];
  for (let i = 0; i < 3; i++) {
    const o = 3 + i * 7;
    const slot = {
      hour: dv.getUint8(o), minute: dv.getUint8(o + 1),
      targetGrams: dv.getFloat32(o + 2, true), enabled: dv.getUint8(o + 6) !== 0
    };
    if (slot.hour > 23 || slot.minute > 59 ||
        !(slot.targetGrams > 0 && slot.targetGrams <= MAX_TRAY_TARGET_GRAMS)) return false;
    slots.push(slot);
  }
  feedSchedules = slots;
  return true;
};

// Mega power cycle: RAM back to firmware defaults, then initializeSchedules().
const rebootMega = () => {
  feedSchedules = FIRMWARE_DEFAULT_SCHEDULES();
  stopFeedCycle("REBOOT");
  activeRemoteCommandId = "";
  return loadSchedulesFromEEPROM();
};

// Mirrors getLocalDateTime(): the RTC holds UTC, schedules are local time.
const LOCAL_UTC_OFFSET_MINUTES = 480;
const checkScheduledFeedingAtUtc = (utcHour, utcMinute) => {
  const localTotal = (utcHour * 60 + utcMinute + LOCAL_UTC_OFFSET_MINUTES) % (24 * 60);
  checkScheduledFeeding(Math.floor(localTotal / 60), localTotal % 60);
};

// --- ESP32Communication.ino command parsing ---
const extractMegaValue = (line, key) => {
  const keyIndex = line.indexOf(key);
  if (keyIndex === -1) return "";
  const valStart = keyIndex + key.length;
  let valEnd = line.indexOf('|', valStart);
  if (valEnd === -1) valEnd = line.length;
  return line.substring(valStart, valEnd);
};

const processRemoteCommand = (line) => {
  const cmdId = extractMegaValue(line, "ID:");
  const action = extractMegaValue(line, "ACTION:");

  if (cmdId === "" || action === "") {
    if (cmdId !== "") sendCmdAck(cmdId, "REJECTED", "MALFORMED");
    return;
  }
  if (activeRemoteCommandId !== "" && activeRemoteCommandId === cmdId) {
    sendCmdAck(cmdId, "REJECTED", "DUPLICATE_ID");
    return;
  }
  if (activeRemoteCommandId !== "") {
    sendCmdAck(cmdId, "REJECTED", "SYSTEM_BUSY");
    return;
  }

  if (action === "MANUAL_FEED") {
    const targetStr = extractMegaValue(line, "TARGET:");
    if (targetStr === "") {
      sendCmdAck(cmdId, "REJECTED", "MISSING_TARGET");
      return;
    }
    const targetGrams = parseFloat(targetStr);
    if (isNaN(targetGrams) || targetGrams <= 0 || targetGrams > MAX_TRAY_TARGET_GRAMS) {
      sendCmdAck(cmdId, "REJECTED", "INVALID_TARGET");
      return;
    }
    const rejectReason = startFeedCycle(targetGrams);
    if (rejectReason !== null) {
      sendCmdAck(cmdId, "REJECTED", rejectReason);
      return;
    }
    activeRemoteCommandId = cmdId;
    sendCmdAck(cmdId, "ACCEPTED");
  }
  else if (action === "ESTOP_RELEASE") {
    const rejectReason = resetEmergencyStop();
    if (rejectReason !== null) {
      sendCmdAck(cmdId, "REJECTED", rejectReason);
      return;
    }
    sendCmdAck(cmdId, "ACCEPTED");
    sendCmdDone(cmdId, "SUCCESS");
  }
  else if (action === "SYSTEM_RESTART") {
    sendCmdAck(cmdId, "REJECTED", "NOT_IMPLEMENTED_SAFELY");
  }
  else if (action === "STATUS_REQ") {
    activeRemoteCommandId = cmdId;
    sendCmdAck(cmdId, "ACCEPTED");
    outputLog.push(buildDataLine());
    sendCmdDone(cmdId, "SUCCESS");
    activeRemoteCommandId = "";
  }
  else if (action === "SCHEDULE_SET") {
    const idxStr = extractMegaValue(line, "IDX:");
    const hrStr = extractMegaValue(line, "HR:");
    const minStr = extractMegaValue(line, "MIN:");
    const tgtStr = extractMegaValue(line, "TGT:");
    const enStr = extractMegaValue(line, "EN:");

    if (idxStr === "" || hrStr === "" || minStr === "" || tgtStr === "" || enStr === "") {
      sendCmdAck(cmdId, "REJECTED", "MALFORMED_SCHEDULE");
      return;
    }
    const idx = parseInt(idxStr, 10);
    const hr = parseInt(hrStr, 10);
    const mn = parseInt(minStr, 10);
    const tgt = parseFloat(tgtStr);
    const en = (enStr === "1" || enStr === "true");

    if (isNaN(idx) || idx < 0 || idx >= 3) {
      sendCmdAck(cmdId, "REJECTED", "INVALID_INDEX");
      return;
    }
    if (isNaN(hr) || hr < 0 || hr > 23 || isNaN(mn) || mn < 0 || mn > 59) {
      sendCmdAck(cmdId, "REJECTED", "INVALID_TIME");
      return;
    }
    if (isNaN(tgt) || tgt <= 0 || tgt > MAX_TRAY_TARGET_GRAMS) {
      sendCmdAck(cmdId, "REJECTED", "INVALID_TARGET");
      return;
    }
    feedSchedules[idx] = { hour: hr, minute: mn, targetGrams: tgt, enabled: en };
    saveSchedulesToEEPROM();

    activeRemoteCommandId = cmdId;
    sendCmdAck(cmdId, "ACCEPTED");
    sendCmdDone(cmdId, "SUCCESS");
    activeRemoteCommandId = "";
  }
  else {
    sendCmdAck(cmdId, "REJECTED", "UNKNOWN_COMMAND");
  }
};

// --- Test harness ---
let passed = 0;
const runTest = (name, fn) => {
  outputLog = [];
  try {
    fn();
    passed++;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}\n       ${err.message}`);
    process.exit(1);
  }
};

const assertLogContains = (str) => {
  if (!outputLog.some(l => l.includes(str))) {
    throw new Error(`Expected log to contain "${str}". Log was: \n` + outputLog.join('\n'));
  }
};

const assertLogNotContains = (str) => {
  if (outputLog.some(l => l.includes(str))) {
    throw new Error(`Expected log NOT to contain "${str}". Log was: \n` + outputLog.join('\n'));
  }
};

const assertActive = (val) => {
  if (feedingActive !== val) throw new Error(`Expected feedingActive to be ${val}`);
};

const assertMotorsOff = () => {
  if (pins.CHAIN_FORWARD_RELAY || pins.CHAIN_REVERSE_RELAY || pins.DISPENSER_RELAY) {
    throw new Error(`Motors not off: ${JSON.stringify(pins)}`);
  }
};

const assertSafeRelays = () => {
  if (interlockViolations) throw new Error(`Both chain relays were on together (${interlockViolations} loops)`);
  if (deadTimeViolations) throw new Error(`Direction changed without dead time (${deadTimeViolations})`);
};

console.log("======================================");
console.log("RUNNING MEGA FIRMWARE LOGIC SIMULATION");
console.log("======================================");

// ---------- Command validation ----------

runTest("1. valid MANUAL_FEED starts a cycle", () => {
  resetMachine();
  processRemoteCommand("CMD|ID:cmd1|ACTION:MANUAL_FEED|TARGET:50");
  assertLogContains("CMD_ACK|ID:cmd1|STATUS:ACCEPTED");
  assertActive(true);
});

runTest("2. duplicate command ID", () => {
  processRemoteCommand("CMD|ID:cmd1|ACTION:MANUAL_FEED|TARGET:50");
  assertLogContains("CMD_ACK|ID:cmd1|STATUS:REJECTED|REASON:DUPLICATE_ID");
});

runTest("3. another command while a feed runs is rejected as busy", () => {
  processRemoteCommand("CMD|ID:cmd2|ACTION:MANUAL_FEED|TARGET:50");
  assertLogContains("CMD_ACK|ID:cmd2|STATUS:REJECTED|REASON:SYSTEM_BUSY");
});

runTest("4. invalid targets: NaN, zero/negative, above 1000 g per tray, missing", () => {
  resetMachine();
  processRemoteCommand("CMD|ID:cmd3|ACTION:MANUAL_FEED|TARGET:abc");
  assertLogContains("CMD_ACK|ID:cmd3|STATUS:REJECTED|REASON:INVALID_TARGET");
  processRemoteCommand("CMD|ID:cmd4|ACTION:MANUAL_FEED|TARGET:-10");
  assertLogContains("CMD_ACK|ID:cmd4|STATUS:REJECTED|REASON:INVALID_TARGET");
  processRemoteCommand("CMD|ID:cmd5|ACTION:MANUAL_FEED|TARGET:1001");
  assertLogContains("CMD_ACK|ID:cmd5|STATUS:REJECTED|REASON:INVALID_TARGET");
  processRemoteCommand("CMD|ID:cmd6|ACTION:MANUAL_FEED");
  assertLogContains("CMD_ACK|ID:cmd6|STATUS:REJECTED|REASON:MISSING_TARGET");
  assertActive(false);
});

runTest("5. E-stop latched: MANUAL_FEED rejected; ESTOP_RELEASE refused while pressed", () => {
  resetMachine();
  pins.EMERGENCY_STOP = 0;
  tick();
  processRemoteCommand("CMD|ID:es1|ACTION:MANUAL_FEED|TARGET:50");
  assertLogContains("CMD_ACK|ID:es1|STATUS:REJECTED|REASON:ESTOP_ACTIVE");
  processRemoteCommand("CMD|ID:es2|ACTION:ESTOP_RELEASE");
  assertLogContains("CMD_ACK|ID:es2|STATUS:REJECTED|REASON:PHYSICAL_ESTOP_ENGAGED");
});

runTest("6. button released but latch still set: feed rejected until ESTOP_RELEASE", () => {
  pins.EMERGENCY_STOP = 1;
  tick();
  processRemoteCommand("CMD|ID:es3|ACTION:MANUAL_FEED|TARGET:50");
  assertLogContains("CMD_ACK|ID:es3|STATUS:REJECTED|REASON:ESTOP_ACTIVE");
  processRemoteCommand("CMD|ID:es4|ACTION:ESTOP_RELEASE");
  assertLogContains("CMD_ACK|ID:es4|STATUS:ACCEPTED");
  assertLogContains("CMD_DONE|ID:es4|STATUS:SUCCESS");
  if (emergencyStopActive) throw new Error("E-stop should be cleared");
});

runTest("7. unknown, malformed, SYSTEM_RESTART", () => {
  processRemoteCommand("CMD|ID:cmd9|ACTION:HACK_FEED");
  assertLogContains("CMD_ACK|ID:cmd9|STATUS:REJECTED|REASON:UNKNOWN_COMMAND");
  processRemoteCommand("CMD|ID:cmd12|ACTION:SYSTEM_RESTART");
  assertLogContains("CMD_ACK|ID:cmd12|STATUS:REJECTED|REASON:NOT_IMPLEMENTED_SAFELY");
  outputLog = [];
  processRemoteCommand("CMD|ACTION:MANUAL_FEED|TARGET:50");
  if (outputLog.length > 0) throw new Error("Command without ID should be silently ignored");
});

runTest("8. STATUS_REQ returns a 14-field DATA line", () => {
  resetMachine();
  processRemoteCommand("CMD|ID:cmd11|ACTION:STATUS_REQ");
  assertLogContains("CMD_ACK|ID:cmd11|STATUS:ACCEPTED");
  assertLogContains("CMD_DONE|ID:cmd11|STATUS:SUCCESS");
  const data = outputLog.find(l => l.startsWith("DATA|"));
  if (!data || data.split("|").length !== 14) throw new Error(`Bad DATA line: ${data}`);
});

runTest("9. SCHEDULE_SET valid / missing params / bad index / target above 1000 g", () => {
  processRemoteCommand("CMD|ID:s1|ACTION:SCHEDULE_SET|IDX:0|HR:7|MIN:30|TGT:60|EN:1");
  assertLogContains("CMD_DONE|ID:s1|STATUS:SUCCESS");
  processRemoteCommand("CMD|ID:s2|ACTION:SCHEDULE_SET|IDX:0|HR:7");
  assertLogContains("CMD_ACK|ID:s2|STATUS:REJECTED|REASON:MALFORMED_SCHEDULE");
  processRemoteCommand("CMD|ID:s3|ACTION:SCHEDULE_SET|IDX:4|HR:7|MIN:30|TGT:60|EN:1");
  assertLogContains("CMD_ACK|ID:s3|STATUS:REJECTED|REASON:INVALID_INDEX");
  processRemoteCommand("CMD|ID:s4|ACTION:SCHEDULE_SET|IDX:0|HR:7|MIN:30|TGT:5000|EN:1");
  assertLogContains("CMD_ACK|ID:s4|STATUS:REJECTED|REASON:INVALID_TARGET");
});

// ---------- Feed cycle ----------

runTest("10. full cycle: trays 1-5 in order to 50 g each, end switch, home; CMD_DONE SUCCESS", () => {
  resetMachine();
  processRemoteCommand("CMD|ID:fc1|ACTION:MANUAL_FEED|TARGET:50");
  runUntil(() => !feedingActive);

  const trayOrder = outputLog.filter(l => l.startsWith("STEP:DISPENSING")).map(l => l.split(":")[2]);
  if (trayOrder.join(",") !== "1,2,3,4,5") throw new Error(`Tray order: ${trayOrder}`);
  hw.trayGrams.forEach((g, i) => {
    if (g < 50 || g > 50 + hw.gramsPerTick) throw new Error(`Tray ${i + 1} has ${g} g`);
  });
  if (hw.spilledGrams !== 0) throw new Error(`Spilled ${hw.spilledGrams} g between trays`);
  assertLogContains("STEP:TO_END");
  assertLogContains("STEP:RETURNING");
  assertLogContains("CMD_DONE|ID:fc1|STATUS:SUCCESS");
  assertLogContains("QUEUED:FEEDING_COMPLETED");
  if (!isHomeSwitchPressed()) throw new Error("Hopper did not return home");
  assertMotorsOff();
  assertSafeRelays();
  if (activeRemoteCommandId !== "") throw new Error("Command slot not freed");
});

runTest("11. tray weights are reported in DATA (and total in the dashboard sum)", () => {
  const fields = buildDataLine().split("|");
  const trays = fields.slice(1, 6).map(Number);
  if (trays.some(g => g < 50)) throw new Error(`DATA tray weights: ${trays}`);
  if (fields[10] !== "IDLE" || fields[11] !== "0") throw new Error(`Step/tray: ${fields[10]}/${fields[11]}`);
});

runTest("12. cycle away from home homes first (reverse to the home switch)", () => {
  resetMachine();
  hw.chainPos = 7000;
  processRemoteCommand("CMD|ID:fc2|ACTION:MANUAL_FEED|TARGET:20");
  assertLogContains("STEP:HOMING");
  runUntil(() => cycleStep === "TO_TRAY");
  if (!isHomeSwitchPressed()) throw new Error("TO_TRAY started away from home");
  runUntil(() => !feedingActive);
  assertLogContains("CMD_DONE|ID:fc2|STATUS:SUCCESS");
  assertSafeRelays();
});

runTest("13. dispenser jam at tray 3: TRAY_TIMEOUT once, cycle continues, CMD_DONE FAILED", () => {
  resetMachine();
  processRemoteCommand("CMD|ID:fc3|ACTION:MANUAL_FEED|TARGET:50");
  runUntil(() => cycleStep === "DISPENSING" && currentTray === 3);
  hw.dispenserJammed = true;
  runUntil(() => currentTray === 4);
  hw.dispenserJammed = false;
  runUntil(() => !feedingActive);
  const alerts = outputLog.filter(l => l === "QUEUED:TRAY_TIMEOUT").length;
  if (alerts !== 1) throw new Error(`Expected 1 TRAY_TIMEOUT alert, got ${alerts}`);
  if (hw.trayGrams[3] < 50 || hw.trayGrams[4] < 50) throw new Error("Trays 4-5 not filled after the timeout");
  assertLogContains("CMD_DONE|ID:fc3|STATUS:FAILED|REASON:TRAY_TIMEOUT");
  assertLogNotContains("QUEUED:FEEDING_COMPLETED");
  if (!isHomeSwitchPressed()) throw new Error("Did not return home");
  assertMotorsOff();
});

runTest("14. dead load cell: tray skipped without dispensing blind", () => {
  resetMachine();
  hw.scaleDead[1] = true;
  processRemoteCommand("CMD|ID:fc4|ACTION:MANUAL_FEED|TARGET:50");
  runUntil(() => !feedingActive);
  if (hw.trayGrams[1] !== 0) throw new Error("Dispensed into a tray with no load cell");
  assertLogContains("SD:LOAD_CELL_NOT_READY");
  assertLogContains("CMD_DONE|ID:fc4|STATUS:FAILED|REASON:TRAY_TIMEOUT");
});

runTest("15. end switch never reached: CHAIN_TIMEOUT, motors off, CMD_DONE FAILED", () => {
  resetMachine();
  hw.endSwitchBroken = true;
  processRemoteCommand("CMD|ID:fc5|ACTION:MANUAL_FEED|TARGET:10");
  runUntil(() => !feedingActive);
  assertLogContains("QUEUED:CHAIN_TIMEOUT");
  assertLogContains("BUZZER");
  assertLogContains("CMD_DONE|ID:fc5|STATUS:FAILED|REASON:CHAIN_TIMEOUT");
  assertMotorsOff();
});

runTest("16. home switch never reached while homing: CHAIN_TIMEOUT", () => {
  resetMachine();
  hw.chainPos = 5000;
  hw.homeSwitchBroken = true;
  processRemoteCommand("CMD|ID:fc6|ACTION:MANUAL_FEED|TARGET:10");
  runFor(CHAIN_HOME_TIMEOUT_MS + 1000);
  assertLogContains("CMD_DONE|ID:fc6|STATUS:FAILED|REASON:CHAIN_TIMEOUT");
  assertMotorsOff();
  if (hw.chainPos > -500 && pins.CHAIN_REVERSE_RELAY) throw new Error("Still reversing");
});

runTest("17. hopper runs empty mid-cycle (O-3): stop dispensing, go home, LOW_FEED", () => {
  resetMachine();
  currentHopperLevelPercent = 9; // ~200 g left at 0.02 %/g
  processRemoteCommand("CMD|ID:fc7|ACTION:MANUAL_FEED|TARGET:100");
  runUntil(() => !feedingActive);
  assertLogContains("QUEUED:LOW_FEED");
  assertLogContains("CMD_DONE|ID:fc7|STATUS:FAILED|REASON:HOPPER_EMPTY");
  if (!isHomeSwitchPressed()) throw new Error("Did not return home");
  if (outputLog.some(l => l === "STEP:TO_END")) throw new Error("Should go straight home, not to the end switch");
  assertMotorsOff();
  assertSafeRelays();
});

runTest("18. hopper already low: cycle does not start (HOPPER_LOW)", () => {
  resetMachine();
  currentHopperLevelPercent = 4;
  processRemoteCommand("CMD|ID:fc8|ACTION:MANUAL_FEED|TARGET:50");
  assertLogContains("CMD_ACK|ID:fc8|STATUS:REJECTED|REASON:HOPPER_LOW");
  assertActive(false);
});

runTest("19. E-stop mid-cycle: everything off at once, CMD_DONE FAILED; next cycle homes", () => {
  resetMachine();
  processRemoteCommand("CMD|ID:fc9|ACTION:MANUAL_FEED|TARGET:50");
  runUntil(() => cycleStep === "TO_TRAY" && currentTray === 2 && pins.CHAIN_FORWARD_RELAY === 1);
  pins.EMERGENCY_STOP = 0;
  tick();
  assertMotorsOff();
  assertActive(false);
  assertLogContains("CMD_DONE|ID:fc9|STATUS:FAILED|REASON:ESTOP_ACTIVE");
  assertLogContains("QUEUED:EMERGENCY_STOP");

  // Released and reset: the hopper is mid-track, so the next cycle homes.
  pins.EMERGENCY_STOP = 1;
  runFor(500);
  if (resetEmergencyStop() !== null) throw new Error("Reset refused");
  outputLog = [];
  processRemoteCommand("CMD|ID:fc10|ACTION:MANUAL_FEED|TARGET:20");
  assertLogContains("STEP:HOMING");
  runUntil(() => !feedingActive);
  assertLogContains("CMD_DONE|ID:fc10|STATUS:SUCCESS");
  assertSafeRelays();
});

runTest("20. tray timings too long: end switch before tray 5 returns home (END_LIMIT_EARLY)", () => {
  resetMachine();
  const saved = TRAY_TRAVEL_MS[4];
  TRAY_TRAVEL_MS[4] = 9000; // tray 5 timing runs past the end switch
  try {
    processRemoteCommand("CMD|ID:fc11|ACTION:MANUAL_FEED|TARGET:10");
    runUntil(() => !feedingActive);
  } finally {
    TRAY_TRAVEL_MS[4] = saved;
  }
  assertLogContains("SD:END_LIMIT_EARLY");
  assertLogContains("CMD_DONE|ID:fc11|STATUS:FAILED|REASON:END_LIMIT_EARLY");
  if (!isHomeSwitchPressed()) throw new Error("Did not return home");
});

runTest("21. limit switches stop the chain whatever the state; interlock refuses direction into a switch", () => {
  resetMachine();
  // Forced forward run outside a cycle: stopped when the end switch closes.
  hw.chainPos = END_POSITION - 300;
  if (!setChainDirection("FORWARD")) throw new Error("Forward should start");
  runFor(1000);
  if (pins.CHAIN_FORWARD_RELAY) throw new Error("End switch did not stop forward motion");
  if (setChainDirection("FORWARD")) throw new Error("Forward must be refused at the end switch");

  // Reversing a running motor: stop first, dead time, never both relays on.
  hw.chainPos = 5000;
  runFor(CHAIN_DEAD_TIME_MS);
  if (!setChainDirection("FORWARD")) throw new Error("Forward should start");
  if (setChainDirection("REVERSE") || pins.CHAIN_FORWARD_RELAY || pins.CHAIN_REVERSE_RELAY) {
    throw new Error("Reverse must first stop the motor");
  }
  if (setChainDirection("REVERSE") || pins.CHAIN_REVERSE_RELAY) throw new Error("Reverse started without dead time");
  runFor(CHAIN_DEAD_TIME_MS);
  if (!setChainDirection("REVERSE") || !pins.CHAIN_REVERSE_RELAY) throw new Error("Reverse did not start after dead time");
  setChainDirection("FORWARD");
  if (pins.CHAIN_FORWARD_RELAY || pins.CHAIN_REVERSE_RELAY) throw new Error("Direction change must stop first");

  hw.chainPos = 0;
  if (setChainDirection("REVERSE")) throw new Error("Reverse must be refused at the home switch");
  stopChain();
  assertSafeRelays();
});

// ---------- Schedules ----------

runTest("22. scheduled feed runs a full cycle with the schedule's per-tray target", () => {
  resetMachine();
  lastExecutedFeedIndex = -1;
  processRemoteCommand("CMD|ID:sc1|ACTION:SCHEDULE_SET|IDX:0|HR:9|MIN:30|TGT:30|EN:1");
  simLocalTime = { hour: 9, minute: 30 };
  tick();
  assertActive(true);
  assertLogContains("QUEUED:FEEDING_STARTED");
  if (activeFeedTargetGrams !== 30) throw new Error("Wrong per-tray target");
  simLocalTime = { hour: 9, minute: 31 };
  runUntil(() => !feedingActive);
  if (hw.trayGrams.some(g => g < 30)) throw new Error(`Trays: ${hw.trayGrams}`);
});

runTest("23. schedule during a running cycle is skipped and logged, not run twice", () => {
  resetMachine();
  lastExecutedFeedIndex = -1;
  processRemoteCommand("CMD|ID:sc2|ACTION:SCHEDULE_SET|IDX:1|HR:14|MIN:0|TGT:30|EN:1");
  processRemoteCommand("CMD|ID:m1|ACTION:MANUAL_FEED|TARGET:20");
  simLocalTime = { hour: 14, minute: 0 };
  tick();
  assertLogContains("SD:FEED_SKIPPED_FEEDING_ACTIVE");
  const startedBefore = outputLog.filter(l => l === "QUEUED:FEEDING_STARTED").length;
  runUntil(() => !feedingActive);
  // Same minute, cycle finished: the slot must not start again.
  tick();
  assertActive(false);
  if (outputLog.filter(l => l === "QUEUED:FEEDING_STARTED").length !== startedBefore) throw new Error("Schedule ran twice");
});

runTest("24. local 07:00 schedule fires at 23:00 UTC, not 07:00 UTC", () => {
  resetMachine();
  lastExecutedFeedIndex = -1;
  processRemoteCommand("CMD|ID:fw4|ACTION:SCHEDULE_SET|IDX:0|HR:7|MIN:0|TGT:50|EN:1");
  checkScheduledFeedingAtUtc(7, 0);
  if (feedingActive) throw new Error("Fed at 07:00 UTC (15:00 local)");
  checkScheduledFeedingAtUtc(23, 0);
  if (!feedingActive) throw new Error("Did not feed at 07:00 local");
  stopFeedCycle("TEST");
});

// ---------- Water ----------

runTest("25. reservoir low: LOW_WATER + buzzer once per episode after debounce", () => {
  resetMachine();
  waterLow = false; waterLowCandidate = false; lowWaterAlertSent = false;
  floatSwitchLow = true;
  runFor(WATER_DEBOUNCE_MS - 200);
  assertLogNotContains("QUEUED:LOW_WATER");
  runFor(400);
  assertLogContains("QUEUED:LOW_WATER");
  runFor(10000);
  if (outputLog.filter(l => l === "QUEUED:LOW_WATER").length !== 1) throw new Error("LOW_WATER repeated");
  if (buzzerCount !== 1) throw new Error(`Expected one beep, got ${buzzerCount}`);

  // Ripples shorter than the debounce do not clear or re-raise it.
  floatSwitchLow = false; runFor(500); floatSwitchLow = true; runFor(3000);
  if (outputLog.filter(l => l === "QUEUED:LOW_WATER").length !== 1) throw new Error("Ripple re-raised LOW_WATER");

  // Refilled, then low again: a new episode alerts again.
  floatSwitchLow = false; runFor(3000);
  if (waterLow) throw new Error("Refill not detected");
  floatSwitchLow = true; runFor(3000);
  if (outputLog.filter(l => l === "QUEUED:LOW_WATER").length !== 2) throw new Error("New episode did not alert");
  floatSwitchLow = false; runFor(3000);
});

runTest("26. water state never switches any actuator", () => {
  resetMachine();
  floatSwitchLow = true; runFor(5000);
  assertMotorsOff();
  floatSwitchLow = false; runFor(3000);
});

// ---------- Alert queue ----------

runTest("27. alerts raised in the same loop are delivered in order", () => {
  alertQueue = [];
  queueAlertEvent("FEEDING_COMPLETED");
  queueAlertEvent("LOW_FEED");
  sendNextAlert();
  sendNextAlert();
  const events = outputLog.filter(l => l.startsWith("EVENT|"));
  if (events.join(",") !== "EVENT|FEEDING_COMPLETED,EVENT|LOW_FEED") {
    throw new Error("Unexpected event order: " + events.join(","));
  }
});

runTest("28. full alert queue drops the oldest entry", () => {
  alertQueue = [];
  ["A", "B", "C", "D", "E", "F", "G", "H", "I"].forEach(queueAlertEvent);
  assertLogContains("DROPPED:A");
  if (alertQueue.join(",") !== "B,C,D,E,F,G,H,I") throw new Error("Queue contents: " + alertQueue.join(","));
  alertQueue = [];
});

// ---------- EEPROM schedules ----------

runTest("29. blank EEPROM falls back to firmware defaults (50 g per tray)", () => {
  eeprom = new Uint8Array(4096).fill(0xFF);
  if (rebootMega() !== false) throw new Error("Blank EEPROM should not load");
  if (feedSchedules[0].targetGrams !== 50 || !feedSchedules[2].enabled) throw new Error("Defaults not in place");
});

runTest("30. version-1 record (total grams per feed) is ignored after the upgrade", () => {
  serializeScheduleStore([
    { hour: 6, minute: 0, targetGrams: 500, enabled: true },
    { hour: 0, minute: 0, targetGrams: 250, enabled: false },
    { hour: 0, minute: 0, targetGrams: 250, enabled: false }
  ], 1).forEach((v, i) => { eeprom[i] = v; });
  if (rebootMega() !== false) throw new Error("v1 record was accepted");
  if (feedSchedules[0].hour !== 7 || feedSchedules[0].targetGrams !== 50) throw new Error("Defaults not used");
});

runTest("31. schedule changes survive a Mega power cycle", () => {
  resetMachine();
  processRemoteCommand("CMD|ID:p3a|ACTION:SCHEDULE_SET|IDX:0|HR:6|MIN:45|TGT:60|EN:1");
  processRemoteCommand("CMD|ID:p3b|ACTION:SCHEDULE_SET|IDX:1|HR:0|MIN:0|TGT:50|EN:0");
  processRemoteCommand("CMD|ID:p3c|ACTION:SCHEDULE_SET|IDX:2|HR:0|MIN:0|TGT:50|EN:0");
  assertLogContains("CMD_DONE|ID:p3c|STATUS:SUCCESS");

  if (rebootMega() !== true) throw new Error("Saved schedules did not load");
  const s = feedSchedules;
  if (s[0].hour !== 6 || s[0].minute !== 45 || s[0].targetGrams !== 60 || !s[0].enabled) throw new Error("Slot 0 not restored");
  if (s[1].enabled || s[2].enabled) throw new Error("Deleted slots came back enabled after reboot");

  lastExecutedFeedIndex = -1;
  checkScheduledFeeding(12, 0);
  if (feedingActive) throw new Error("Fed from a deleted default schedule after reboot");
});

runTest("32. corrupted EEPROM record is rejected (defaults used)", () => {
  eeprom[5] ^= 0x01;
  if (rebootMega() !== false) throw new Error("Corrupted record was accepted");
  if (feedSchedules[0].hour !== 7) throw new Error("Defaults not restored after corruption");
});

runTest("33. ACK-paced RTDB restore (R0..R2) applies slots; repeating it writes nothing", () => {
  eeprom = new Uint8Array(4096).fill(0xFF);
  rebootMega();
  const restoreLines = [
    "CMD|ID:R0|ACTION:SCHEDULE_SET|IDX:0|HR:12|MIN:30|TGT:1000|EN:1",
    "CMD|ID:R1|ACTION:SCHEDULE_SET|IDX:1|HR:0|MIN:0|TGT:50|EN:0",
    "CMD|ID:R2|ACTION:SCHEDULE_SET|IDX:2|HR:0|MIN:0|TGT:50|EN:0"
  ];
  for (const line of restoreLines) {
    if (line.length + 1 > 64) throw new Error(`Restore line too long (${line.length + 1} bytes): ${line}`);
    outputLog = [];
    processRemoteCommand(line);
    const id = line.match(/ID:(R\d)/)[1];
    assertLogContains(`CMD_ACK|ID:${id}|STATUS:ACCEPTED`);
  }
  if (feedSchedules[0].hour !== 12 || feedSchedules[1].enabled || feedSchedules[2].enabled) throw new Error("Restore not applied");

  const writesBefore = eepromByteWrites;
  restoreLines.forEach(line => processRemoteCommand(line));
  if (eepromByteWrites !== writesBefore) throw new Error("Identical restore rewrote EEPROM bytes");

  if (rebootMega() !== true || feedSchedules[0].targetGrams !== 1000) throw new Error("Restored schedule not persisted");
});

runTest("34. restore is rejected while a remote feed is running (ESP32 retries later)", () => {
  resetMachine();
  processRemoteCommand("CMD|ID:busyfeed|ACTION:MANUAL_FEED|TARGET:50");
  outputLog = [];
  processRemoteCommand("CMD|ID:R0|ACTION:SCHEDULE_SET|IDX:0|HR:8|MIN:0|TGT:50|EN:1");
  assertLogContains("CMD_ACK|ID:R0|STATUS:REJECTED|REASON:SYSTEM_BUSY");
  if (feedSchedules[0].hour === 8) throw new Error("Busy restore should not change the slot");
  resetMachine();
});

// ---------- ESP32 link and Nextion ----------

runTest("35. online status follows ESP32 STATUS reports plus a 15 s link timeout", () => {
  simMillis += 1000;
  esp32ReportsOnline = false;
  lastESP32MessageMillis = 0;

  receiveESP32Line("TIME|2026-10-21|06:00:00");
  updateLinkStatus();
  if (esp32Online) throw new Error("TIME alone must not mark the device online");

  receiveESP32Line("STATUS|ONLINE");
  updateLinkStatus();
  if (!esp32Online) throw new Error("STATUS|ONLINE should mark online");

  for (let i = 0; i < 3; i++) {
    simMillis += 10000;
    receiveESP32Line("STATUS|ONLINE");
    updateLinkStatus();
    if (!esp32Online) throw new Error("Heartbeats should keep it online");
  }

  receiveESP32Line("STATUS|OFFLINE");
  updateLinkStatus();
  if (esp32Online) throw new Error("STATUS|OFFLINE should mark offline");

  receiveESP32Line("STATUS|ONLINE");
  simMillis += 16000;
  updateLinkStatus();
  if (esp32Online) throw new Error("Silent link should time out to offline");
});

runTest("36. Nextion buttons do nothing until their IDs are configured", () => {
  resetMachine();
  nextionIds = { page: NEXTION_ID_UNSET, stop: NEXTION_ID_UNSET, start: NEXTION_ID_UNSET };
  feedNextionBytes(touch(1, 12));
  assertLogContains("NEXTION_TOUCH:1:12");
  if (emergencyStopActive) throw new Error("Unconfigured button must not act");
});

runTest("37. Nextion b3 latches the stop (stopping a running cycle); b4 resets only with the E-stop released", () => {
  resetMachine();
  nextionIds = { page: 1, stop: 12, start: 13 };

  feedNextionBytes([0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0x88, 0xFF, 0xFF, 0xFF, 0x1A, 0xFF, 0xFF, 0xFF]);
  feedNextionBytes([...Buffer.from('Sched.t4.txt+=":"'), 0xFF, 0xFF, 0xFF]);
  if (emergencyStopActive) throw new Error("Noise frames must be ignored");

  processRemoteCommand("CMD|ID:nx1|ACTION:MANUAL_FEED|TARGET:50");
  runUntil(() => cycleStep === "DISPENSING");
  feedNextionBytes(touch(1, 12, 0x01));
  feedNextionBytes(touch(1, 12, 0x00));
  if (!emergencyStopActive) throw new Error("b3 should latch the stop");
  assertMotorsOff();
  if (alertQueue.filter(a => a === "EMERGENCY_STOP").length !== 1) throw new Error("Stop should trigger once");
  assertLogContains("CMD_DONE|ID:nx1|STATUS:FAILED|REASON:ESTOP_ACTIVE");

  pins.EMERGENCY_STOP = 0;
  simMillis += 1000;
  feedNextionBytes(touch(1, 13));
  assertLogContains("NEXTION_START_REJECTED:PHYSICAL_ESTOP_ENGAGED");
  if (!emergencyStopActive) throw new Error("Reset must be refused while the button is pressed");

  pins.EMERGENCY_STOP = 1;
  simMillis += 1000;
  feedNextionBytes(touch(1, 13));
  if (emergencyStopActive) throw new Error("b4 should reset the latch");

  simMillis += 1000;
  feedNextionBytes(touch(4, 12));
  if (emergencyStopActive) throw new Error("Touches on other pages must be ignored");
  resetMachine();
});

// ---------- Alert resolution (R-23) ----------

runTest("38. hopper refilled above 25%: LOW_FEED_CLEARED once; not sent if no alert was raised", () => {
  resetMachine();
  currentHopperLevelPercent = 15; tick();
  assertLogContains("QUEUED:LOW_FEED");
  currentHopperLevelPercent = 22; runFor(500);   // inside the hysteresis band
  assertLogNotContains("QUEUED:LOW_FEED_CLEARED");
  currentHopperLevelPercent = 80; runFor(1000);
  if (outputLog.filter(l => l === "QUEUED:LOW_FEED_CLEARED").length !== 1) throw new Error("Expected one LOW_FEED_CLEARED");
  outputLog = [];
  currentHopperLevelPercent = 90; runFor(1000);
  assertLogNotContains("QUEUED:LOW_FEED_CLEARED");
});

runTest("39. reservoir refilled: LOW_WATER_CLEARED once after the debounce", () => {
  resetMachine();
  waterLow = false; waterLowCandidate = false; lowWaterAlertSent = false;
  floatSwitchLow = true; runFor(3000);
  assertLogContains("QUEUED:LOW_WATER");
  floatSwitchLow = false; runFor(1000);
  assertLogNotContains("QUEUED:LOW_WATER_CLEARED"); // still debouncing
  runFor(2000);
  if (outputLog.filter(l => l === "QUEUED:LOW_WATER_CLEARED").length !== 1) throw new Error("Expected one LOW_WATER_CLEARED");
});

runTest("40. E-stop reset sends EMERGENCY_STOP_RELEASED; a full cycle sends FEEDING_COMPLETED", () => {
  resetMachine();
  pins.EMERGENCY_STOP = 0; tick();
  pins.EMERGENCY_STOP = 1; tick();
  processRemoteCommand("CMD|ID:r23a|ACTION:ESTOP_RELEASE");
  assertLogContains("QUEUED:EMERGENCY_STOP_RELEASED");
  processRemoteCommand("CMD|ID:r23b|ACTION:MANUAL_FEED|TARGET:10");
  runUntil(() => !feedingActive);
  assertLogContains("QUEUED:FEEDING_COMPLETED");
});

runTest("41. boot clears: report conditions that are fine; SYSTEM_START is never dropped", () => {
  resetMachine();
  alertQueue = [];
  waterLow = false; lowWaterAlertSent = false; lowFeedAlertSent = false;
  currentHopperLevelPercent = 70;
  queueAlertEvent("SYSTEM_START");
  queueBootClears();
  if (alertQueue.join(",") !== "SYSTEM_START,LOW_FEED_CLEARED,LOW_WATER_CLEARED,EMERGENCY_STOP_RELEASED") {
    throw new Error("Boot queue: " + alertQueue.join(","));
  }
  // Low hopper and low water at boot: their alerts instead of clears.
  alertQueue = []; outputLog = [];
  currentHopperLevelPercent = 10; lowFeedAlertSent = false; updateFeedLevel();
  waterLow = true; lowWaterAlertSent = false; checkLowWaterAlert();
  queueAlertEvent("SYSTEM_START");
  queueBootClears();
  assertLogNotContains("QUEUED:LOW_FEED_CLEARED");
  assertLogNotContains("QUEUED:LOW_WATER_CLEARED");
  if (!alertQueue.includes("SYSTEM_START")) throw new Error("SYSTEM_START dropped from the boot burst");
  waterLow = false; lowWaterAlertSent = false; alertQueue = [];
});

console.log(`ALL ${passed} SIMULATION TESTS PASSED.`);
