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
let manualFeedTargetGrams = DEFAULT_FEED_TARGET_GRAMS;

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
      statLowFeed();
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
      statLowWater();
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
  if (benchMove !== "IDLE") return "BENCH_ACTIVE";
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
  if (feedingActive && cycleStep === "DISPENSING" && currentTray > 0) statAddFeed(trayWeightsGrams[currentTray - 1]);
  const wasActive = feedingActive;
  feedingActive = false;
  currentTray = 0;
  cycleStep = "IDLE";
  if (wasActive) { logEventToSD(reason); statCycleEnded(false); }
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
    statCycleEnded(true);
  } else {
    logEventToSD("FEEDING_INCOMPLETE");
    finishRemoteCommand("FAILED", cycleFailReason);
    statCycleEnded(false);
  }
};

const chainFault = () => {
  statChainFault();
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
  statTrayTimeout();
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
    statAddFeed(trayWeightsGrams[i]);
    nextTray();
    return;
  }
  if (elapsed >= TRAY_DISPENSE_TIMEOUT_MS) {
    pins.DISPENSER_RELAY = 0;
    statAddFeed(trayWeightsGrams[i]);
    trayFailed();
  }
};

const runFeedCycle = () => {
  const elapsed = simMillis - cycleStepStartMillis;

  if ((cycleStep === "TO_TRAY" || cycleStep === "TARING" || cycleStep === "DISPENSING") &&
      currentHopperLevelPercent <= HOPPER_EMPTY_PERCENT) {
    pins.DISPENSER_RELAY = 0;
    if (cycleStep === "DISPENSING") statAddFeed(trayWeightsGrams[currentTray - 1]);
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
  statEmergencyStop();
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
// --- SerialConsole.ino (bench commissioning moves) ---
let benchMove = "IDLE";
let benchDir = "STOPPED";
let benchMs = 0;
let benchStart = 0;
let benchStarted = false;
const benchLog = (m) => outputLog.push(`BENCH:${m}`);

const benchBlocked = () => {
  if (emergencyStopActive) return "ESTOP";
  if (feedingActive) return "FEEDING";
  if (benchMove !== "IDLE") return "BUSY";
  return null;
};

const benchStop = (why) => {
  if (benchMove === "DISPENSE") pins.DISPENSER_RELAY = 0;
  else if (benchMove !== "IDLE") stopChain();
  if (benchMove !== "IDLE") benchLog(`ended:${why}`);
  benchMove = "IDLE";
};

// Mirrors handleBenchCommand() for the motor commands; returns a refusal or null.
const benchCommand = (line) => {
  const [cmd, a, b] = line.trim().toUpperCase().split(/\s+/);
  if (cmd === "STOP") { benchStop("STOP"); return null; }
  if (cmd === "FEED") {
    if (benchMove !== "IDLE") return "BUSY";
    return startFeedCycle(parseFloat(a));
  }
  const blocked = benchBlocked();
  if (blocked) { benchLog(`refused:${blocked}`); return blocked; }
  if (cmd === "JOG") {
    const ms = parseInt(b, 10);
    if (!(a === "F" || a === "R") || !(ms >= 100 && ms <= 5000)) return "USAGE";
    benchDir = a === "F" ? "FORWARD" : "REVERSE";
    benchMs = ms; benchStarted = false; benchStart = simMillis; benchMove = "JOG";
  } else if (cmd === "HOME") {
    if (isHomeSwitchPressed()) return "ALREADY_HOME";
    benchDir = "REVERSE"; benchStarted = false; benchStart = simMillis; benchMove = "HOME";
  } else if (cmd === "DISP") {
    const ms = parseInt(a, 10);
    if (!(ms >= 100 && ms <= 5000)) return "USAGE";
    benchMs = ms; benchStart = simMillis; benchMove = "DISPENSE"; pins.DISPENSER_RELAY = 1;
  }
  return null;
};

// Mirrors updateBench().
const updateBench = () => {
  if (benchMove === "IDLE") return;
  if (emergencyStopActive) { benchStop("ESTOP"); return; }
  if (benchMove === "DISPENSE") {
    if (simMillis - benchStart >= benchMs) benchStop("time");
    return;
  }
  if (!benchStarted) {
    if (setChainDirection(benchDir)) benchStarted = true;
    else if (simMillis - benchStart > 2000) benchStop("could_not_start");
    return;
  }
  const ran = simMillis - chainRunStartMillis;
  if (benchMove === "HOME") {
    if (isHomeSwitchPressed()) { stopChain(); benchLog(`home:${ran}`); benchMove = "IDLE"; }
    else if (chainDirection === "STOPPED") { benchLog("home:stopped"); benchMove = "IDLE"; }
    else if (ran >= CHAIN_HOME_TIMEOUT_MS) benchStop("home_timeout");
    return;
  }
  if (chainDirection === "STOPPED") { benchLog(`limit:${ran}`); benchMove = "IDLE"; return; }
  if (ran >= benchMs) { stopChain(); benchLog(`jog:${ran}`); benchMove = "IDLE"; }
};

const tick = () => {
  handleSafety();
  updateFeedLevel();
  updateHydration();
  handleFeeding();
  updateBench();
  handleDailyStats();
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
  manualFeedTargetGrams = DEFAULT_FEED_TARGET_GRAMS;
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
  else if (line.startsWith("HIST|")) processNextionHistoryLine(line);
};

const updateLinkStatus = () => {
  const linkAlive = lastESP32MessageMillis !== 0 && simMillis - lastESP32MessageMillis <= ESP32_TIMEOUT_MS;
  esp32Online = esp32ReportsOnline && linkAlive;
};

// --- Nextion touch input (Nextion.ino) ---
const NEXTION_ID_UNSET = 255;
const NEXTION_HOME_PAGE_ID = 1;
const NEXTION_SCHEDULE_PAGE_ID = 2;
const NEXTION_LOG_PAGE_ID = 3;
const NEXTION_TARGET_PAGE_ID = 4;
const NEXTION_SYSTEM_PAGE_ID = 9;
const NEXTION_SCHEDULE_EDITOR_FIRST_PAGE_ID = 5;
const NEXTION_SCHEDULE_EDITOR_LAST_PAGE_ID = 7;
const NEXTION_STOP_BUTTON_ID = 8;
const NEXTION_FEED_RESET_BUTTON_ID = 9;
const NEXTION_TARGET_SAVE_BUTTON_ID = 4;
const NEXTION_TARGET_PLUS_BUTTON_ID = 5;
const NEXTION_TARGET_MINUS_BUTTON_ID = 6;
const NEXTION_SCHEDULE_PLUS_HOUR_ID = 7;
const NEXTION_SCHEDULE_MINUS_HOUR_ID = 8;
const NEXTION_SCHEDULE_PLUS_MINUTE_ID = 9;
const NEXTION_SCHEDULE_MINUS_MINUTE_ID = 10;
const NEXTION_SCHEDULE_SAVE_BUTTON_ID = 11;
const NEXTION_SYSTEM_REFRESH_BUTTON_ID = 4;
const NEXTION_LOG_REFRESH_BUTTON_ID = 4;
const NEXTION_LOG_EVENT_COUNT = 4;
const NEXTION_SCHEDULE_TIME_FIELDS = ["t4", "t7", "t5", "t6", "t8", "t9"];
const NEXTION_SCHEDULE_SUMMARY_FIELDS = ["t1", "t2", "t3"];
let nextionFrame = [];
let nextionFfCount = 0;
let nextionCurrentPageId = NEXTION_ID_UNSET;
let nextionDraftScheduleIndex = NEXTION_ID_UNSET;
let nextionScheduleField = 0;
let nextionSystemField = 0;
let nextionLogField = 0;
let nextionLogEntries = ["NO HISTORY YET", "", "", ""];
let nextionHistoryRowsReceived = 0;
let nextionScheduleDraft = null;
let nextionManualTargetDraft = DEFAULT_FEED_TARGET_GRAMS;
let nextionLastTouchMs = 0;
let nextionHasLastTouch = false;
const NEXTION_BUTTON_DEBOUNCE_MS = 35;

const handleNextionPageChange = (page) => {
  nextionCurrentPageId = page;
  nextionDraftScheduleIndex = NEXTION_ID_UNSET;
  if (page === NEXTION_SCHEDULE_PAGE_ID) nextionScheduleField = 0;
  if (page === NEXTION_SYSTEM_PAGE_ID) nextionSystemField = 0;
  if (page === NEXTION_LOG_PAGE_ID) {
    nextionLogField = 0;
    nextionLogEntries = esp32Online
      ? ["LOADING HISTORY", "", "", ""]
      : ["HISTORY UNAVAILABLE", "", "", ""];
    nextionHistoryRowsReceived = 0;
    if (esp32Online) outputLog.push("HISTORY_REQ");
  }
  if (page === NEXTION_TARGET_PAGE_ID) nextionManualTargetDraft = manualFeedTargetGrams;
  if (page >= NEXTION_SCHEDULE_EDITOR_FIRST_PAGE_ID && page <= NEXTION_SCHEDULE_EDITOR_LAST_PAGE_ID) {
    nextionDraftScheduleIndex = page - NEXTION_SCHEDULE_EDITOR_FIRST_PAGE_ID;
    nextionScheduleDraft = { ...feedSchedules[nextionDraftScheduleIndex] };
  }
};

// Mirrors the Mega's one-component-per-tick schedule overview refresh. The
// overview shows the app's time, target grams and enabled state for each slot.
const nextionNextScheduleDisplayUpdate = () => {
  const field = nextionScheduleField;
  let component;
  let value;
  if (field < 6) {
    const slot = Math.floor(field / 2);
    const isHour = field % 2 === 0;
    const schedule = feedSchedules[slot];
    value = !schedule.enabled
      ? (isHour ? "OFF" : "")
      : (isHour
        ? `${String(schedule.hour).padStart(2, "0")}:`
        : String(schedule.minute).padStart(2, "0"));
    component = NEXTION_SCHEDULE_TIME_FIELDS[field];
  } else {
    const slot = field - 6;
    const schedule = feedSchedules[slot];
    component = NEXTION_SCHEDULE_SUMMARY_FIELDS[slot];
    value = `S${slot + 1} ${Math.round(schedule.targetGrams)}g ${schedule.enabled ? "ON" : "OFF"}`;
  }
  nextionScheduleField = (nextionScheduleField + 1) % 9;
  return { component, value };
};

const processNextionHistoryLine = (line) => {
  if (line === "HIST|BEGIN") {
    nextionLogEntries = ["LOADING HISTORY", "", "", ""];
    nextionHistoryRowsReceived = 0;
    nextionLogField = 0;
    return;
  }
  if (line === "HIST|EMPTY") {
    nextionLogEntries = ["NO HISTORY YET", "", "", ""];
    nextionHistoryRowsReceived = 0;
    nextionLogField = 0;
    return;
  }
  if (line.startsWith("HIST|ERROR|")) {
    nextionLogEntries = ["HISTORY UNAVAILABLE", "", "", ""];
    nextionHistoryRowsReceived = 0;
    nextionLogField = 0;
    return;
  }
  if (line === "HIST|END") {
    if (!nextionHistoryRowsReceived) nextionLogEntries = ["NO HISTORY YET", "", "", ""];
    nextionLogField = 0;
    return;
  }
  if (!line.startsWith("HIST|ROW|")) return;
  const value = (key) => {
    const i = line.indexOf(key);
    if (i < 0) return "";
    const j = line.indexOf("|", i + key.length);
    return line.substring(i + key.length, j < 0 ? line.length : j);
  };
  const index = Number(value("IDX:"));
  const timestampSeconds = Number(value("TS:"));
  const feed = Number(value("FEED:"));
  const hopper = Number(value("HOP:"));
  const water = Number(value("W:"));
  const feeding = Number(value("DISP:"));
  if (!Number.isInteger(index) || index < 0 || index >= 4 || !timestampSeconds ||
      feed < 0 || hopper < 0 || hopper > 100 || ![0, 1].includes(water) || ![0, 1].includes(feeding)) return;
  const local = new Date(timestampSeconds * 1000 + 8 * 60 * 60 * 1000);
  const date = `${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
  const time = `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
  nextionLogEntries[index] = `${date} ${time}  ${feed}g  ${hopper}%  W:${water ? "LOW" : "OK"} D:${feeding ? "ON" : "OFF"}`;
  nextionHistoryRowsReceived = Math.max(nextionHistoryRowsReceived, index + 1);
  nextionLogField = 0;
};

// Mirrors the four System Check cards and the Mega's one-component-per-tick
// pacing, keeping each serial command small enough for Serial2's TX buffer.
const nextionNextSystemDisplayUpdate = () => {
  const fields = [
    { component: "t1", value: `HOPPER ${Math.round(currentHopperLevelPercent)}%` },
    { component: "t2", value: waterLow ? "WATER LOW - REFILL" : "WATER OK" },
    { component: "t3", value: esp32Online ? "ESP32 LINK OK" : "ESP32 LINK OFF" },
    { component: "t4", value: `TARGET ${Math.round(manualFeedTargetGrams)} g` }
  ];
  const field = fields[nextionSystemField];
  nextionSystemField = (nextionSystemField + 1) % fields.length;
  return field;
};

const nextionNextLogDisplayUpdate = () => {
  const field = nextionLogField;
  const update = { component: `t${field + 1}`, value: nextionLogEntries[field] };
  nextionLogField = (nextionLogField + 1) % NEXTION_LOG_EVENT_COUNT;
  return update;
};

const saveManualFeedTarget = (grams) => {
  if (!Number.isFinite(grams) || grams < 1 || grams > MAX_TRAY_TARGET_GRAMS) return false;
  const bytes = new Uint8Array(7);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0x4D46, true);
  bytes[2] = 1;
  view.setFloat32(3, grams, true);
  const checksum = scheduleChecksum(bytes);
  const record = [...bytes, checksum];
  record.forEach((value, i) => {
    if (eeprom[32 + i] !== value) eepromByteWrites++;
    eeprom[32 + i] = value;
  });
  manualFeedTargetGrams = grams;
  return true;
};

const handleNextionTouch = (page, id) => {
  if (page === NEXTION_HOME_PAGE_ID) {
    if (id === NEXTION_STOP_BUTTON_ID) tripEmergencyStop();
    else if (id === NEXTION_FEED_RESET_BUTTON_ID) {
      if (emergencyStopActive) {
        const reason = resetEmergencyStop();
        if (reason) outputLog.push(`NEXTION_START_REJECTED:${reason}`);
      } else {
        const reason = startFeedCycle(manualFeedTargetGrams);
        if (reason) outputLog.push(`NEXTION_FEED_REJECTED:${reason}`);
        else outputLog.push(`NEXTION_FEED_STARTED:${manualFeedTargetGrams}`);
      }
    }
    return;
  }
  if (page === NEXTION_TARGET_PAGE_ID) {
    if (id === NEXTION_TARGET_PLUS_BUTTON_ID) nextionManualTargetDraft = Math.min(MAX_TRAY_TARGET_GRAMS, nextionManualTargetDraft + 10);
    else if (id === NEXTION_TARGET_MINUS_BUTTON_ID) nextionManualTargetDraft = Math.max(1, nextionManualTargetDraft - 10);
    else if (id === NEXTION_TARGET_SAVE_BUTTON_ID) {
      if (!saveManualFeedTarget(nextionManualTargetDraft)) outputLog.push("NEXTION_TARGET_REJECTED");
      else outputLog.push(`NEXTION_TARGET_SAVED:${manualFeedTargetGrams}`);
    }
    return;
  }
  if (page >= NEXTION_SCHEDULE_EDITOR_FIRST_PAGE_ID &&
      page <= NEXTION_SCHEDULE_EDITOR_LAST_PAGE_ID &&
      nextionDraftScheduleIndex < feedSchedules.length) {
    if (id === NEXTION_SCHEDULE_PLUS_HOUR_ID) nextionScheduleDraft.hour = (nextionScheduleDraft.hour + 1) % 24;
    else if (id === NEXTION_SCHEDULE_MINUS_HOUR_ID) nextionScheduleDraft.hour = (nextionScheduleDraft.hour + 23) % 24;
    else if (id === NEXTION_SCHEDULE_PLUS_MINUTE_ID) nextionScheduleDraft.minute = (nextionScheduleDraft.minute + 1) % 60;
    else if (id === NEXTION_SCHEDULE_MINUS_MINUTE_ID) nextionScheduleDraft.minute = (nextionScheduleDraft.minute + 59) % 60;
    else if (id === NEXTION_SCHEDULE_SAVE_BUTTON_ID) {
      feedSchedules[nextionDraftScheduleIndex].hour = nextionScheduleDraft.hour;
      feedSchedules[nextionDraftScheduleIndex].minute = nextionScheduleDraft.minute;
      saveSchedulesToEEPROM();
      outputLog.push(`NEXTION_SCHEDULE_SAVED:${nextionDraftScheduleIndex}:${nextionScheduleDraft.hour}:${nextionScheduleDraft.minute}`);
      nextionDraftScheduleIndex = NEXTION_ID_UNSET;
    }
  }
  if (page === NEXTION_SYSTEM_PAGE_ID && id === NEXTION_SYSTEM_REFRESH_BUTTON_ID) {
    nextionSystemField = 0;
    outputLog.push("NEXTION_SYSTEM_REFRESHED");
  }
  if (page === NEXTION_LOG_PAGE_ID && id === NEXTION_LOG_REFRESH_BUTTON_ID) {
    nextionLogField = 0;
    outputLog.push("HISTORY_REQ");
  }
};

const processNextionFrame = (frame) => {
  if (frame.length === 2 && frame[0] === 0x66) {
    handleNextionPageChange(frame[1]);
    return;
  }
  if (frame.length !== 4 || frame[0] !== 0x65) return;
  const [, page, id, event] = frame;
  outputLog.push(`NEXTION_TOUCH:${page}:${id}:${event}`);
  nextionCurrentPageId = page;
  if (event !== 0x01) return;
  if (nextionHasLastTouch && simMillis - nextionLastTouchMs < NEXTION_BUTTON_DEBOUNCE_MS) return;
  nextionHasLastTouch = true;
  nextionLastTouchMs = simMillis;
  handleNextionTouch(page, id);
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

// --- DailyStats.ino: per-day totals, EEPROM at 64, SUMMARY lines ---
// simDate is the device's local date ("YYYY-MM-DD"), null while the clock is invalid.
let simDate = null;
const DAILY_STATS_ADDRESS = 64;
const DAILY_STATS_SIZE = 26; // static_assert in the firmware
const DAILY_SUMMARY_INTERVAL_MS = 30 * 60 * 1000;
const STAT_COUNTERS = ["cyclesCompleted", "cyclesIncomplete", "trayTimeouts", "chainFaults", "lowWater", "lowFeed", "estops"];
const blankStats = () => ({ year: 0, month: 0, day: 0, feedGrams: 0, ...Object.fromEntries(STAT_COUNTERS.map(k => [k, 0])) });
let statsToday = blankStats();
let statsYesterday = blankStats();
let lastSummarySentMillis = 0;

// Byte layout of struct DailyStats on the AVR (packed, little-endian).
const serializeStats = (st) => {
  const bytes = new Uint8Array(DAILY_STATS_SIZE);
  const dv = new DataView(bytes.buffer);
  dv.setUint16(0, 0x4453, true);
  dv.setUint8(2, 1);
  dv.setUint16(3, st.year, true);
  dv.setUint8(5, st.month);
  dv.setUint8(6, st.day);
  dv.setFloat32(7, st.feedGrams, true);
  STAT_COUNTERS.forEach((k, i) => dv.setUint16(11 + i * 2, st[k], true));
  bytes[25] = scheduleChecksum(bytes.subarray(0, 25));
  return bytes;
};
const deserializeStats = (bytes) => {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (dv.getUint16(0, true) !== 0x4453 || dv.getUint8(2) !== 1) return blankStats();
  if (scheduleChecksum(bytes.subarray(0, 25)) !== bytes[25]) return blankStats();
  const st = { year: dv.getUint16(3, true), month: dv.getUint8(5), day: dv.getUint8(6), feedGrams: dv.getFloat32(7, true) };
  STAT_COUNTERS.forEach((k, i) => { st[k] = dv.getUint16(11 + i * 2, true); });
  return st;
};
const saveDailyStats = () => {
  [statsToday, statsYesterday].forEach((st, r) => serializeStats(st).forEach((v, i) => {
    const a = DAILY_STATS_ADDRESS + r * DAILY_STATS_SIZE + i;
    if (eeprom[a] !== v) { eeprom[a] = v; eepromByteWrites++; }
  }));
};
const initializeDailyStats = () => {
  statsToday = deserializeStats(eeprom.slice(DAILY_STATS_ADDRESS, DAILY_STATS_ADDRESS + DAILY_STATS_SIZE));
  statsYesterday = deserializeStats(eeprom.slice(DAILY_STATS_ADDRESS + DAILY_STATS_SIZE, DAILY_STATS_ADDRESS + 2 * DAILY_STATS_SIZE));
  updateDailyStatsDate();
};
const statsDate = (st) => `${String(st.year).padStart(4, "0")}-${String(st.month).padStart(2, "0")}-${String(st.day).padStart(2, "0")}`;
const sendDailySummaryLine = (st) => {
  if (st.year === 0) return;
  outputLog.push(`SUMMARY|${statsDate(st)}|${st.feedGrams.toFixed(0)}|` + STAT_COUNTERS.map(k => st[k]).join("|"));
};
const sendDailySummaries = () => {
  lastSummarySentMillis = simMillis;
  sendDailySummaryLine(statsYesterday);
  sendDailySummaryLine(statsToday);
};
const updateDailyStatsDate = () => {
  if (!simDate) return;
  const [y, m, d] = simDate.split("-").map(Number);
  if (y < 2024) return;
  if (statsToday.year === y && statsToday.month === m && statsToday.day === d) return;
  if (statsToday.year !== 0) { statsYesterday = statsToday; statsToday = blankStats(); }
  Object.assign(statsToday, { year: y, month: m, day: d });
  saveDailyStats();
  sendDailySummaries();
};
const handleDailyStats = () => {
  updateDailyStatsDate();
  if (simMillis - lastSummarySentMillis >= DAILY_SUMMARY_INTERVAL_MS) sendDailySummaries();
};
const statAddFeed = (g) => { if (g > 0) statsToday.feedGrams = Math.fround(statsToday.feedGrams + g); };
const statCycleEnded = (completed) => {
  if (completed) statsToday.cyclesCompleted++; else statsToday.cyclesIncomplete++;
  saveDailyStats();
  sendDailySummaries();
};
const statCount = (k) => { statsToday[k]++; saveDailyStats(); };
const statTrayTimeout = () => statCount("trayTimeouts");
const statChainFault = () => statCount("chainFaults");
const statLowWater = () => statCount("lowWater");
const statLowFeed = () => statCount("lowFeed");
const statEmergencyStop = () => statCount("estops");

// --- SDLogging.ino: monthly files and cleanup (file names only) ---
const LOG_KEEP_MONTHS = 24;
let sdFiles = new Set();
let currentLogName = "";
const logMonthIndex = (name) => {
  const m = /^HF(\d{4})(\d{2})\.CSV$/.exec(name);
  if (!m) return -1;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return -1;
  return Number(m[1]) * 12 + month - 1;
};
const pruneOldLogs = (currentIndex, oldestOnly) => {
  if (currentIndex < 0 && !oldestOnly) return false;
  let oldest = null, oldestIndex = Infinity, deleted = false;
  for (const name of [...sdFiles]) {
    const idx = logMonthIndex(name);
    if (idx < 0 || name === currentLogName) continue;
    if (oldestOnly) { if (idx < oldestIndex) { oldestIndex = idx; oldest = name; } }
    else if (idx <= currentIndex - LOG_KEEP_MONTHS) { sdFiles.delete(name); deleted = true; }
  }
  if (oldestOnly && oldest) { sdFiles.delete(oldest); deleted = true; }
  return deleted;
};
const selectLogFile = () => {
  const name = simDate ? `HF${simDate.slice(0, 4)}${simDate.slice(5, 7)}.CSV` : "HFNOTIME.CSV";
  if (name === currentLogName) return;
  currentLogName = name;
  if (!sdFiles.has(name)) {
    pruneOldLogs(logMonthIndex(name), false);
    sdFiles.add(name);
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

runTest("36. Nextion ignores noise and release edges; System Check refresh uses HMI component 4", () => {
  resetMachine();
  feedNextionBytes([0x66, NEXTION_HOME_PAGE_ID, 0xFF, 0xFF, 0xFF]);
  feedNextionBytes(touch(NEXTION_HOME_PAGE_ID, 99, 0x01));
  feedNextionBytes(touch(NEXTION_HOME_PAGE_ID, NEXTION_STOP_BUTTON_ID, 0x00));
  feedNextionBytes([0x66, NEXTION_SYSTEM_PAGE_ID, 0xFF, 0xFF, 0xFF]);
  feedNextionBytes(touch(NEXTION_SYSTEM_PAGE_ID, 3, 0x01)); // old, incorrect mapping
  simMillis += 100;
  feedNextionBytes(touch(NEXTION_SYSTEM_PAGE_ID, NEXTION_SYSTEM_REFRESH_BUTTON_ID, 0x01));
  assertLogContains(`NEXTION_TOUCH:${NEXTION_HOME_PAGE_ID}:99:1`);
  assertLogContains(`NEXTION_TOUCH:${NEXTION_HOME_PAGE_ID}:${NEXTION_STOP_BUTTON_ID}:0`);
  assertLogContains("NEXTION_SYSTEM_REFRESHED");
  if (outputLog.filter(line => line === "NEXTION_SYSTEM_REFRESHED").length !== 1) {
    throw new Error("Refresh must fire only for the HMI's component 4");
  }
  if (emergencyStopActive) throw new Error("Unconfigured button must not act");
});

runTest("Nextion System Check streams four separate readouts one field per update", () => {
  resetMachine();
  currentHopperLevelPercent = 67;
  waterLow = true;
  esp32Online = true;
  manualFeedTargetGrams = 70;
  handleNextionPageChange(NEXTION_SYSTEM_PAGE_ID);
  const updates = Array.from({ length: 4 }, () => nextionNextSystemDisplayUpdate());
  const expected = [
    { component: "t1", value: "HOPPER 67%" },
    { component: "t2", value: "WATER LOW - REFILL" },
    { component: "t3", value: "ESP32 LINK OK" },
    { component: "t4", value: "TARGET 70 g" }
  ];
  if (JSON.stringify(updates) !== JSON.stringify(expected)) {
    throw new Error(`System Check field mapping mismatch: ${JSON.stringify(updates)}`);
  }
  if (nextionSystemField !== 0) throw new Error("System Check cycle must wrap after four fields");
});

runTest("Nextion History requests cloud rows and displays the same four fields as app History", () => {
  resetMachine();
  esp32Online = true;
  handleNextionPageChange(NEXTION_LOG_PAGE_ID);
  if (NEXTION_LOG_PAGE_ID !== 3 || NEXTION_SYSTEM_PAGE_ID !== 9) {
    throw new Error("Log and System Check page IDs must remain distinct and match the HMI");
  }
  if (!outputLog.includes("HISTORY_REQ")) throw new Error("Opening History must request cloud system data from ESP32");
  const newest = Math.floor(Date.UTC(2026, 9, 28, 0, 15) / 1000);
  receiveESP32Line("HIST|BEGIN");
  receiveESP32Line(`HIST|ROW|IDX:0|TS:${newest}|FEED:250|HOP:65|W:0|DISP:1`);
  receiveESP32Line(`HIST|ROW|IDX:1|TS:${newest - 300}|FEED:225|HOP:70|W:1|DISP:0`);
  receiveESP32Line("HIST|END");
  if (!nextionLogEntries[0].startsWith("10-28 08:15  250g  65%  W:OK D:ON")) {
    throw new Error(`Newest app history fields/time mismatch: ${nextionLogEntries[0]}`);
  }
  if (!nextionLogEntries[1].startsWith("10-28 08:10  225g  70%  W:LOW D:OFF")) {
    throw new Error(`Second newest app history row mismatch: ${nextionLogEntries[1]}`);
  }
  const updates = Array.from({ length: 4 }, () => nextionNextLogDisplayUpdate());
  const expected = nextionLogEntries.map((value, index) => ({
    component: `t${index + 1}`, value
  }));
  if (JSON.stringify(updates) !== JSON.stringify(expected)) {
    throw new Error(`Log field mapping mismatch: ${JSON.stringify(updates)}`);
  }
  nextionLogField = 3;
  handleNextionTouch(NEXTION_LOG_PAGE_ID, NEXTION_LOG_REFRESH_BUTTON_ID);
  if (nextionLogField !== 0 || outputLog.filter(line => line === "HISTORY_REQ").length !== 2) {
    throw new Error("History refresh must request cloud data again and restart the four-row update sequence");
  }
});

runTest("37. Nextion Home Stop latches; Feed Now uses saved target; reset requires physical E-stop released", () => {
  resetMachine();

  feedNextionBytes([0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0x88, 0xFF, 0xFF, 0xFF, 0x1A, 0xFF, 0xFF, 0xFF]);
  feedNextionBytes([...Buffer.from('Sched.t4.txt+=":"'), 0xFF, 0xFF, 0xFF]);
  if (emergencyStopActive) throw new Error("Noise frames must be ignored");

  manualFeedTargetGrams = 80;
  feedNextionBytes([0x66, NEXTION_HOME_PAGE_ID, 0xFF, 0xFF, 0xFF]);
  feedNextionBytes(touch(NEXTION_HOME_PAGE_ID, NEXTION_FEED_RESET_BUTTON_ID, 0x01));
  assertActive(true);
  if (activeFeedTargetGrams !== 80) throw new Error("Feed Now did not use saved local per-tray target");
  runUntil(() => cycleStep === "DISPENSING");
  simMillis += 100;
  feedNextionBytes(touch(NEXTION_HOME_PAGE_ID, NEXTION_STOP_BUTTON_ID, 0x01));
  feedNextionBytes(touch(NEXTION_HOME_PAGE_ID, NEXTION_STOP_BUTTON_ID, 0x00));
  if (!emergencyStopActive) throw new Error("b3 should latch the stop");
  assertMotorsOff();
  if (alertQueue.filter(a => a === "EMERGENCY_STOP").length !== 1) throw new Error("Stop should trigger once");
  if (outputLog.some((line) => line.includes("CMD_DONE|ID:nx1"))) {
    throw new Error("Local Nextion feed must not fabricate a remote command lifecycle");
  }

  pins.EMERGENCY_STOP = 0;
  simMillis += 1000;
  feedNextionBytes(touch(NEXTION_HOME_PAGE_ID, NEXTION_FEED_RESET_BUTTON_ID, 0x01));
  assertLogContains("NEXTION_START_REJECTED:PHYSICAL_ESTOP_ENGAGED");
  if (!emergencyStopActive) throw new Error("Reset must be refused while the button is pressed");

  pins.EMERGENCY_STOP = 1;
  simMillis += 1000;
  feedNextionBytes(touch(NEXTION_HOME_PAGE_ID, NEXTION_FEED_RESET_BUTTON_ID, 0x01));
  if (emergencyStopActive) throw new Error("b4 should reset the latch");

  simMillis += 1000;
  feedNextionBytes(touch(NEXTION_TARGET_PAGE_ID, NEXTION_STOP_BUTTON_ID, 0x01));
  if (emergencyStopActive) throw new Error("Touches on other pages must be ignored");
  resetMachine();
});

runTest("Nextion schedule overview shows app time, target and enabled status one field at a time", () => {
  const savedSchedules = feedSchedules;
  feedSchedules = [
    { hour: 7, minute: 0, targetGrams: 50, enabled: true },
    { hour: 12, minute: 5, targetGrams: 50, enabled: true },
    { hour: 18, minute: 30, targetGrams: 50, enabled: false }
  ];
  nextionScheduleField = 4;
  feedNextionBytes([0x66, NEXTION_SCHEDULE_PAGE_ID, 0xFF, 0xFF, 0xFF]);
  const updates = Array.from({ length: 9 }, () => nextionNextScheduleDisplayUpdate());
  const expected = [
    { component: "t4", value: "07:" }, { component: "t7", value: "00" },
    { component: "t5", value: "12:" }, { component: "t6", value: "05" },
    { component: "t8", value: "OFF" }, { component: "t9", value: "" },
    { component: "t1", value: "S1 50g ON" }, { component: "t2", value: "S2 50g ON" },
    { component: "t3", value: "S3 50g OFF" }
  ];
  if (JSON.stringify(updates) !== JSON.stringify(expected)) {
    feedSchedules = savedSchedules;
    throw new Error(`Unexpected schedule field mapping: ${JSON.stringify(updates)}`);
  }
  if (nextionNextScheduleDisplayUpdate().component !== "t4") {
    feedSchedules = savedSchedules;
    throw new Error("Schedule field queue did not wrap to slot 1");
  }
  feedSchedules = savedSchedules;
});

runTest("38. Nextion schedule editor wraps time and saves the Mega EEPROM schedule", () => {
  resetMachine();
  feedNextionBytes([0x66, NEXTION_SCHEDULE_EDITOR_FIRST_PAGE_ID, 0xFF, 0xFF, 0xFF]);
  nextionScheduleDraft = { ...feedSchedules[0], hour: 23, minute: 59 };
  simMillis += 100;
  feedNextionBytes(touch(NEXTION_SCHEDULE_EDITOR_FIRST_PAGE_ID, NEXTION_SCHEDULE_PLUS_HOUR_ID, 0x01));
  if (nextionScheduleDraft.hour !== 0) throw new Error("Hour did not wrap 23 to 0");
  simMillis += 100;
  feedNextionBytes(touch(NEXTION_SCHEDULE_EDITOR_FIRST_PAGE_ID, NEXTION_SCHEDULE_PLUS_MINUTE_ID, 0x01));
  if (nextionScheduleDraft.minute !== 0) throw new Error("Minute did not wrap 59 to 0");
  simMillis += 100;
  feedNextionBytes(touch(NEXTION_SCHEDULE_EDITOR_FIRST_PAGE_ID, NEXTION_SCHEDULE_SAVE_BUTTON_ID, 0x01));
  if (feedSchedules[0].hour !== 0 || feedSchedules[0].minute !== 0) throw new Error("Schedule save did not update the slot");
  if (!loadSchedulesFromEEPROM() || feedSchedules[0].hour !== 0 || feedSchedules[0].minute !== 0) throw new Error("Schedule save did not survive simulated reboot");
  resetMachine();
});

runTest("39. Nextion manual target adjusts in 10 g steps, stays bounded and persists", () => {
  resetMachine();
  feedNextionBytes([0x66, NEXTION_TARGET_PAGE_ID, 0xFF, 0xFF, 0xFF]);
  nextionManualTargetDraft = 990;
  simMillis += 100;
  feedNextionBytes(touch(NEXTION_TARGET_PAGE_ID, NEXTION_TARGET_PLUS_BUTTON_ID, 0x01));
  if (nextionManualTargetDraft !== 1000) throw new Error("Manual target did not cap at 1000 g");
  simMillis += 100;
  feedNextionBytes(touch(NEXTION_TARGET_PAGE_ID, NEXTION_TARGET_PLUS_BUTTON_ID, 0x01));
  if (nextionManualTargetDraft !== 1000) throw new Error("Manual target exceeded 1000 g");
  simMillis += 100;
  feedNextionBytes(touch(NEXTION_TARGET_PAGE_ID, NEXTION_TARGET_SAVE_BUTTON_ID, 0x01));
  if (manualFeedTargetGrams !== 1000) throw new Error("Manual target was not saved");
  if (Math.round(new DataView(eeprom.buffer).getFloat32(35, true)) !== 1000) throw new Error("Manual target EEPROM bytes wrong");
  nextionManualTargetDraft = 1;
  simMillis += 100;
  feedNextionBytes(touch(NEXTION_TARGET_PAGE_ID, NEXTION_TARGET_MINUS_BUTTON_ID, 0x01));
  if (nextionManualTargetDraft !== 1) throw new Error("Manual target went below 1 g");
  resetMachine();
});

// ---------- Alert resolution (R-23) ----------

runTest("40. hopper refilled above 25%: LOW_FEED_CLEARED once; not sent if no alert was raised", () => {
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

runTest("41. reservoir refilled: LOW_WATER_CLEARED once after the debounce", () => {
  resetMachine();
  waterLow = false; waterLowCandidate = false; lowWaterAlertSent = false;
  floatSwitchLow = true; runFor(3000);
  assertLogContains("QUEUED:LOW_WATER");
  floatSwitchLow = false; runFor(1000);
  assertLogNotContains("QUEUED:LOW_WATER_CLEARED"); // still debouncing
  runFor(2000);
  if (outputLog.filter(l => l === "QUEUED:LOW_WATER_CLEARED").length !== 1) throw new Error("Expected one LOW_WATER_CLEARED");
});

runTest("42. E-stop reset sends EMERGENCY_STOP_RELEASED; a full cycle sends FEEDING_COMPLETED", () => {
  resetMachine();
  pins.EMERGENCY_STOP = 0; tick();
  pins.EMERGENCY_STOP = 1; tick();
  processRemoteCommand("CMD|ID:r23a|ACTION:ESTOP_RELEASE");
  assertLogContains("QUEUED:EMERGENCY_STOP_RELEASED");
  processRemoteCommand("CMD|ID:r23b|ACTION:MANUAL_FEED|TARGET:10");
  runUntil(() => !feedingActive);
  assertLogContains("QUEUED:FEEDING_COMPLETED");
});

runTest("43. boot clears: report conditions that are fine; SYSTEM_START is never dropped", () => {
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

// ---------- Bench console (commissioning) ----------

runTest("44. bench JOG F runs the chain for the requested time, then stops", () => {
  resetMachine();
  if (benchCommand("JOG F 3000") !== null) throw new Error("JOG refused");
  runFor(4000);
  assertLogContains("BENCH:jog:3000");
  if (hw.chainPos !== trayPosition(1)) throw new Error(`Chain at ${hw.chainPos}, expected tray 1 at ${trayPosition(1)}`);
  assertMotorsOff();
  assertSafeRelays();
});

runTest("45. bench HOME reverses to the home switch and reports the time", () => {
  resetMachine();
  hw.chainPos = 7000;
  if (benchCommand("HOME") !== null) throw new Error("HOME refused");
  runFor(9000);
  if (!isHomeSwitchPressed()) throw new Error("Not home");
  assertLogContains("BENCH:home:");
  assertMotorsOff();
});

runTest("46. bench JOG into the end switch is stopped by the limit, not the timer", () => {
  resetMachine();
  hw.chainPos = END_POSITION - 1000;
  benchCommand("JOG F 5000");
  runFor(6000);
  assertLogContains("BENCH:limit:");
  if (!isEndSwitchPressed()) throw new Error("Should rest on the end switch");
  assertMotorsOff();
});

runTest("47. bench moves are refused while the E-stop is latched or a cycle runs, and stop on E-stop", () => {
  resetMachine();
  pins.EMERGENCY_STOP = 0; tick();
  if (benchCommand("JOG F 1000") !== "ESTOP") throw new Error("JOG allowed with E-stop latched");
  pins.EMERGENCY_STOP = 1; tick();
  resetEmergencyStop();
  processRemoteCommand("CMD|ID:b1|ACTION:MANUAL_FEED|TARGET:20");
  if (benchCommand("DISP 1000") !== "FEEDING") throw new Error("DISP allowed during a cycle");
  stopFeedCycle("TEST");
  activeRemoteCommandId = "";
  benchCommand("JOG F 5000");
  runFor(1000);
  pins.EMERGENCY_STOP = 0; tick();
  assertMotorsOff();
  if (benchMove !== "IDLE") throw new Error("Bench move not cancelled by E-stop");
  pins.EMERGENCY_STOP = 1; tick(); resetEmergencyStop();
});

runTest("48. a feed cycle cannot start during a bench move; DISP times out; STOP works", () => {
  resetMachine();
  benchCommand("DISP 2000");
  if (pins.DISPENSER_RELAY !== 1) throw new Error("Dispenser not on");
  processRemoteCommand("CMD|ID:b2|ACTION:MANUAL_FEED|TARGET:20");
  assertLogContains("CMD_ACK|ID:b2|STATUS:REJECTED|REASON:BENCH_ACTIVE");
  runFor(2200);
  if (pins.DISPENSER_RELAY !== 0) throw new Error("Dispenser not stopped after its time");
  benchCommand("JOG F 5000");
  runFor(500);
  benchCommand("STOP");
  assertMotorsOff();
  if (benchCommand("JOG F 50") !== "USAGE") throw new Error("Out-of-range duration accepted");
});

runTest("49. SD: one file per month; a new month deletes files 24+ months old, never other files", () => {
  sdFiles = new Set(["HF202310.CSV", "HF202410.CSV", "HF202411.CSV", "HF202609.CSV", "HFNOTIME.CSV", "NOTES.TXT", "HF202413.CSV"]);
  currentLogName = "";
  simDate = "2026-10-05";
  selectLogFile();
  const files = [...sdFiles].sort().join(",");
  if (files !== "HF202411.CSV,HF202413.CSV,HF202609.CSV,HF202610.CSV,HFNOTIME.CSV,NOTES.TXT") throw new Error(`Files: ${files}`);
  simDate = null; selectLogFile();
  if (currentLogName !== "HFNOTIME.CSV") throw new Error("Clock invalid should log to HFNOTIME.CSV");
});

runTest("50. SD full: the oldest month (not the current one) is deleted first", () => {
  sdFiles = new Set(["HF202501.CSV", "HF202412.CSV", "HF202610.CSV", "HFNOTIME.CSV"]);
  currentLogName = "HF202610.CSV";
  if (!pruneOldLogs(-1, true)) throw new Error("Nothing deleted");
  if (sdFiles.has("HF202412.CSV") || !sdFiles.has("HF202501.CSV") || !sdFiles.has("HF202610.CSV")) throw new Error([...sdFiles].join(","));
  sdFiles = new Set(["HF202610.CSV"]);
  if (pruneOldLogs(-1, true)) throw new Error("Deleted the current month");
});

runTest("51. daily stats: feed grams, completed/incomplete cycles and problems are counted; SUMMARY is sent", () => {
  resetMachine();
  eeprom.fill(0xFF, DAILY_STATS_ADDRESS, DAILY_STATS_ADDRESS + 2 * DAILY_STATS_SIZE);
  simDate = "2026-10-24";
  initializeDailyStats();
  assertLogNotContains("SUMMARY|2026-10-23");
  processRemoteCommand("CMD|ID:s1|ACTION:MANUAL_FEED|TARGET:50");
  runUntil(() => !feedingActive);
  if (statsToday.cyclesCompleted !== 1) throw new Error("Cycle not counted");
  if (statsToday.feedGrams < 250 || statsToday.feedGrams > 300) throw new Error(`Feed ${statsToday.feedGrams}`);
  assertLogContains(`SUMMARY|2026-10-24|${statsToday.feedGrams.toFixed(0)}|1|0|0|0|0|0|0`);
  processRemoteCommand("CMD|ID:s2|ACTION:MANUAL_FEED|TARGET:50");
  runUntil(() => cycleStep === "DISPENSING");
  runFor(500);
  pins.EMERGENCY_STOP = 0; tick();
  if (statsToday.cyclesIncomplete !== 1 || statsToday.estops !== 1) throw new Error(JSON.stringify(statsToday));
  if (!(statsToday.feedGrams > 250)) throw new Error("Partial tray not added on E-stop");
  pins.EMERGENCY_STOP = 1; tick(); resetEmergencyStop();
  floatSwitchLow = true; runFor(3000); floatSwitchLow = false; runFor(3000);
  if (statsToday.lowWater !== 1) throw new Error("Low water episode not counted");
});

runTest("52. daily stats survive a reboot and roll over at local midnight (yesterday re-sent)", () => {
  const before = { ...statsToday };
  statsToday = blankStats(); statsYesterday = blankStats();
  initializeDailyStats(); // reboot, same day
  if (statsToday.cyclesCompleted !== before.cyclesCompleted || statsToday.feedGrams !== before.feedGrams) throw new Error("Lost on reboot");
  outputLog = [];
  simDate = "2026-10-25"; tick();
  if (statsYesterday.day !== 24 || statsToday.day !== 25 || statsToday.cyclesCompleted !== 0) throw new Error("No rollover");
  assertLogContains("SUMMARY|2026-10-24|");
  assertLogContains("SUMMARY|2026-10-25|0|0|0|0|0|0|0|0");
  outputLog = [];
  runFor(DAILY_SUMMARY_INTERVAL_MS);
  assertLogContains("SUMMARY|2026-10-24|");
});

runTest("53. daily stats: counts made before the clock is set are kept for the first valid date", () => {
  eeprom.fill(0xFF, DAILY_STATS_ADDRESS, DAILY_STATS_ADDRESS + 2 * DAILY_STATS_SIZE);
  simDate = null;
  initializeDailyStats();
  statLowFeed();
  outputLog = [];
  sendDailySummaries();
  assertLogNotContains("SUMMARY|");
  simDate = "2026-10-26"; updateDailyStatsDate();
  if (statsToday.lowFeed !== 1 || statsToday.day !== 26) throw new Error(JSON.stringify(statsToday));
  if (serializeStats(statsToday).length !== DAILY_STATS_SIZE) throw new Error("Layout size");
  simDate = null;
});

console.log(`ALL ${passed} SIMULATION TESTS PASSED.`);
