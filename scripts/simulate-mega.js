/**
 * simulate-mega.js
 * 
 * Simulates the exact parsing and state machine logic implemented in the 
 * Arduino Mega C++ firmware (ESP32Communication.ino, Feeding.ino, Safety.ino).
 * 
 * This harness verifies that the command validation logic handles all edge cases 
 * securely without bypassing the physical safety constraints.
 */

// --- Mega State ---
let emergencyStopActive = false;
let feedingActive = false;
let currentFeedWeightGrams = 0;
let activeRemoteCommandId = "";
let outputLog = [];
let feedSchedules = [
  { hour: 7, minute: 0, targetGrams: 250, enabled: true },
  { hour: 12, minute: 0, targetGrams: 250, enabled: true },
  { hour: 17, minute: 0, targetGrams: 250, enabled: true }
];

const pinStates = {
  EMERGENCY_STOP_PIN: 1, // HIGH = OK, LOW = ESTOP
  DISPENSER_RELAY_PIN: 0 // LOW = OFF, HIGH = ON
};

// --- Mega Mock Functions ---
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

// --- Hydration state (Hydration.ino) ---
const WATER_PUMP_MAX_RUNTIME_MS = 120000;
let simMillis = 0;
let waterLow = false;
let waterHigh = false;
let waterPumpActive = false;
let waterPumpStartMillis = 0;
let waterPumpFaultLatched = false;

// --- Alert queue (Config.ino / ESP32Communication.ino) ---
const ALERT_QUEUE_SIZE = 4;
let alertQueue = [];
let lowWaterAlertSent = false;

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

const checkLowWaterAlert = () => {
  const cannotRefill = emergencyStopActive || waterPumpFaultLatched;
  if (waterLow && cannotRefill) {
    if (!lowWaterAlertSent) {
      lowWaterAlertSent = true;
      queueAlertEvent("LOW_WATER");
    }
  } else if (!waterLow) {
    lowWaterAlertSent = false;
  }
};

const startWaterPump = () => {
  if (waterPumpActive || emergencyStopActive || waterPumpFaultLatched) return;
  waterPumpActive = true;
  waterPumpStartMillis = simMillis;
};

const stopWaterPump = () => {
  waterPumpActive = false;
};

const checkWaterPumpTimeout = () => {
  if (!waterPumpActive) return;
  if (simMillis - waterPumpStartMillis >= WATER_PUMP_MAX_RUNTIME_MS) {
    stopWaterPump();
    if (!waterPumpFaultLatched) {
      waterPumpFaultLatched = true;
      queueAlertEvent("WATER_PUMP_TIMEOUT");
    }
  }
};

const controlWaterPump = () => {
  if (waterHigh) {
    stopWaterPump();
    waterPumpFaultLatched = false;
    return;
  }
  if (waterLow && !waterHigh) startWaterPump();
  checkWaterPumpTimeout();
};

const updateHydration = () => {
  if (emergencyStopActive) {
    stopWaterPump();
  } else {
    controlWaterPump();
  }
  checkLowWaterAlert();
};

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

// Mirrors finishRemoteCommand() in ESP32Communication.ino.
const finishRemoteCommand = (status, reason = "") => {
  if (activeRemoteCommandId === "") return;
  sendCmdDone(activeRemoteCommandId, status, reason);
  activeRemoteCommandId = "";
};

// Mirrors handleSafety() / tripEmergencyStop() / resetEmergencyStop() in
// Safety.ino. The E-stop latches; releasing the button does not clear it.
let emergencyButtonPressed = false;

const tripEmergencyStop = () => {
  emergencyStopActive = true;
  pinStates.DISPENSER_RELAY_PIN = 0;
  feedingActive = false;
  waterPumpActive = false;
  finishRemoteCommand("FAILED", "ESTOP_ACTIVE");
  queueAlertEvent("EMERGENCY_STOP");
};

const handleSafety = () => {
  const pressed = pinStates.EMERGENCY_STOP_PIN === 0;
  if (pressed && !emergencyButtonPressed) {
    emergencyButtonPressed = true;
    if (!emergencyStopActive) tripEmergencyStop();
  }
  if (!pressed && emergencyButtonPressed) {
    emergencyButtonPressed = false;
  }
  if (emergencyStopActive) pinStates.DISPENSER_RELAY_PIN = 0;
};

// Returns null on success, otherwise the rejection reason.
const resetEmergencyStop = () => {
  if (pinStates.EMERGENCY_STOP_PIN === 0) return "PHYSICAL_ESTOP_ENGAGED";
  if (!emergencyStopActive) return "ESTOP_NOT_ACTIVE";
  emergencyStopActive = false;
  waterPumpFaultLatched = false;
  queueAlertEvent("EMERGENCY_STOP_RELEASED");
  return null;
};

const startRemoteFeeding = (target) => {
  if (emergencyStopActive) return;
  if (feedingActive) return;
  feedingActive = true;
  pinStates.DISPENSER_RELAY_PIN = 1;
};

const startScheduledFeeding = (index) => {
  if (emergencyStopActive || feedingActive || index >= 3) return;
  feedingActive = true;
  pinStates.DISPENSER_RELAY_PIN = 1;
};

const checkScheduledFeeding = (simHour, simMinute) => {
  for (let i = 0; i < 3; i++) {
    if (!feedSchedules[i].enabled) continue;
    if (simHour === feedSchedules[i].hour && simMinute === feedSchedules[i].minute) {
       startScheduledFeeding(i);
       return; // Execute only one
    }
  }
};

// --- EEPROM schedule store (ScheduleStorage.ino), byte-for-byte ---
// 25 bytes: magic u16 LE | version u8 | 3 x {hour u8, minute u8, float32 LE, enabled u8} | checksum u8
const FIRMWARE_DEFAULT_SCHEDULES = () => [
  { hour: 7, minute: 0, targetGrams: 500, enabled: true },
  { hour: 12, minute: 0, targetGrams: 500, enabled: true },
  { hour: 18, minute: 0, targetGrams: 500, enabled: true }
];
let eeprom = new Uint8Array(4096).fill(0xFF); // blank AVR EEPROM
let eepromByteWrites = 0;

const scheduleChecksum = (bytes) => {
  let sum = 0;
  for (const b of bytes) sum = ((((sum << 1) | (sum >> 7)) & 0xFF) ^ b) & 0xFF;
  return sum;
};

const serializeScheduleStore = (schedules) => {
  const bytes = new Uint8Array(25);
  const dv = new DataView(bytes.buffer);
  dv.setUint16(0, 0x4846, true);
  dv.setUint8(2, 1);
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
  if (dv.getUint16(0, true) !== 0x4846 || dv.getUint8(2) !== 1) return false;
  if (scheduleChecksum(bytes.subarray(0, 24)) !== bytes[24]) return false;
  const slots = [];
  for (let i = 0; i < 3; i++) {
    const o = 3 + i * 7;
    const slot = {
      hour: dv.getUint8(o), minute: dv.getUint8(o + 1),
      targetGrams: dv.getFloat32(o + 2, true), enabled: dv.getUint8(o + 6) !== 0
    };
    if (slot.hour > 23 || slot.minute > 59 || !(slot.targetGrams > 0 && slot.targetGrams <= 5000)) return false;
    slots.push(slot);
  }
  feedSchedules = slots;
  return true;
};

// Mega power cycle: RAM back to firmware defaults, then initializeSchedules().
const rebootMega = () => {
  feedSchedules = FIRMWARE_DEFAULT_SCHEDULES();
  feedingActive = false;
  activeRemoteCommandId = "";
  return loadSchedulesFromEEPROM();
};

// Mirrors getLocalDateTime(): the RTC holds UTC, schedules are local time.
const LOCAL_UTC_OFFSET_MINUTES = 480;
const checkScheduledFeedingAtUtc = (utcHour, utcMinute) => {
  const localTotal = (utcHour * 60 + utcMinute + LOCAL_UTC_OFFSET_MINUTES) % (24 * 60);
  checkScheduledFeeding(Math.floor(localTotal / 60), localTotal % 60);
};

// --- The Exact C++ Parsing Logic Translated to JS ---
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
    if (isNaN(targetGrams) || targetGrams <= 0 || targetGrams > 5000) { 
      sendCmdAck(cmdId, "REJECTED", "INVALID_TARGET");
      return;
    }
    
    if (emergencyStopActive) {
      sendCmdAck(cmdId, "REJECTED", "ESTOP_ACTIVE");
      return;
    }
    
    if (feedingActive) {
      sendCmdAck(cmdId, "REJECTED", "FEEDING_ACTIVE");
      return;
    }
    
    activeRemoteCommandId = cmdId;
    sendCmdAck(cmdId, "ACCEPTED");
    startRemoteFeeding(targetGrams);
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
    outputLog.push("DATA|...");
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
    if (isNaN(tgt) || tgt <= 0 || tgt > 5000.0) {
      sendCmdAck(cmdId, "REJECTED", "INVALID_TARGET");
      return;
    }
    
    feedSchedules[idx].hour = hr;
    feedSchedules[idx].minute = mn;
    feedSchedules[idx].targetGrams = tgt;
    feedSchedules[idx].enabled = en;
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

// --- Test Harness ---
const runTest = (name, fn) => {
  outputLog = [];
  try {
    fn();
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

console.log("======================================");
console.log("RUNNING MEGA FIRMWARE LOGIC SIMULATION");
console.log("======================================");

// Setup
emergencyStopActive = false;
feedingActive = false;
activeRemoteCommandId = "";
pinStates.EMERGENCY_STOP_PIN = 1;

runTest("1. valid MANUAL_FEED", () => {
  processRemoteCommand("CMD|ID:cmd1|ACTION:MANUAL_FEED|TARGET:500");
  assertLogContains("CMD_ACK|ID:cmd1|STATUS:ACCEPTED");
  assertActive(true);
});

runTest("8. duplicate command ID", () => {
  processRemoteCommand("CMD|ID:cmd1|ACTION:MANUAL_FEED|TARGET:500");
  assertLogContains("CMD_ACK|ID:cmd1|STATUS:REJECTED|REASON:DUPLICATE_ID");
});

runTest("7. feeding already active", () => {
  processRemoteCommand("CMD|ID:cmd2|ACTION:MANUAL_FEED|TARGET:500");
  assertLogContains("CMD_ACK|ID:cmd2|STATUS:REJECTED|REASON:SYSTEM_BUSY");
});

// Clean up for next tests
activeRemoteCommandId = "";
feedingActive = false;

runTest("2. invalid target (NaN)", () => {
  processRemoteCommand("CMD|ID:cmd3|ACTION:MANUAL_FEED|TARGET:abc");
  assertLogContains("CMD_ACK|ID:cmd3|STATUS:REJECTED|REASON:INVALID_TARGET");
});

runTest("3. zero/negative target", () => {
  processRemoteCommand("CMD|ID:cmd4|ACTION:MANUAL_FEED|TARGET:-10");
  assertLogContains("CMD_ACK|ID:cmd4|STATUS:REJECTED|REASON:INVALID_TARGET");
});

runTest("4. excessive target", () => {
  processRemoteCommand("CMD|ID:cmd5|ACTION:MANUAL_FEED|TARGET:9000");
  assertLogContains("CMD_ACK|ID:cmd5|STATUS:REJECTED|REASON:INVALID_TARGET");
});

runTest("11. missing TARGET", () => {
  processRemoteCommand("CMD|ID:cmd10|ACTION:MANUAL_FEED");
  assertLogContains("CMD_ACK|ID:cmd10|STATUS:REJECTED|REASON:MISSING_TARGET");
});

runTest("5. physical E-stop active", () => {
  pinStates.EMERGENCY_STOP_PIN = 0;
  emergencyStopActive = true;
  processRemoteCommand("CMD|ID:cmd5|ACTION:MANUAL_FEED|TARGET:500");
  assertLogContains("CMD_ACK|ID:cmd5|STATUS:REJECTED|REASON:ESTOP_ACTIVE");
});

runTest("13. ESTOP_RELEASE while physical E-stop active", () => {
  processRemoteCommand("CMD|ID:cmd6|ACTION:ESTOP_RELEASE");
  assertLogContains("CMD_ACK|ID:cmd6|STATUS:REJECTED|REASON:PHYSICAL_ESTOP_ENGAGED");
});

runTest("6. software safety condition active", () => {
  pinStates.EMERGENCY_STOP_PIN = 1; // Physical released, but software still active
  processRemoteCommand("CMD|ID:cmd7|ACTION:MANUAL_FEED|TARGET:500");
  assertLogContains("CMD_ACK|ID:cmd7|STATUS:REJECTED|REASON:ESTOP_ACTIVE");
});

runTest("13b. Valid ESTOP_RELEASE", () => {
  processRemoteCommand("CMD|ID:cmd8|ACTION:ESTOP_RELEASE");
  assertLogContains("CMD_ACK|ID:cmd8|STATUS:ACCEPTED");
  assertLogContains("CMD_DONE|ID:cmd8|STATUS:SUCCESS");
  if (emergencyStopActive !== false) throw new Error("E-Stop should be false");
});

runTest("9. unknown command", () => {
  processRemoteCommand("CMD|ID:cmd9|ACTION:HACK_FEED");
  assertLogContains("CMD_ACK|ID:cmd9|STATUS:REJECTED|REASON:UNKNOWN_COMMAND");
});

runTest("10. malformed command", () => {
  processRemoteCommand("CMD|ACTION:MANUAL_FEED|TARGET:500");
  if (outputLog.length > 0) throw new Error("Should be silently ignored");
});

runTest("12. valid STATUS_REQ", () => {
  processRemoteCommand("CMD|ID:cmd11|ACTION:STATUS_REQ");
  assertLogContains("CMD_ACK|ID:cmd11|STATUS:ACCEPTED");
  assertLogContains("DATA|...");
  assertLogContains("CMD_DONE|ID:cmd11|STATUS:SUCCESS");
});

runTest("14. SYSTEM_RESTART safety behavior", () => {
  processRemoteCommand("CMD|ID:cmd12|ACTION:SYSTEM_RESTART");
  assertLogContains("CMD_ACK|ID:cmd12|STATUS:REJECTED|REASON:NOT_IMPLEMENTED_SAFELY");
});

runTest("15. valid SCHEDULE_SET", () => {
  processRemoteCommand("CMD|ID:cmd13|ACTION:SCHEDULE_SET|IDX:0|HR:7|MIN:30|TGT:250|EN:1");
  assertLogContains("CMD_ACK|ID:cmd13|STATUS:ACCEPTED");
  assertLogContains("CMD_DONE|ID:cmd13|STATUS:SUCCESS");
});

runTest("16. invalid SCHEDULE_SET (missing params)", () => {
  processRemoteCommand("CMD|ID:cmd14|ACTION:SCHEDULE_SET|IDX:0|HR:7");
  assertLogContains("CMD_ACK|ID:cmd14|STATUS:REJECTED|REASON:MALFORMED_SCHEDULE");
});

runTest("17. invalid SCHEDULE_SET (invalid index)", () => {
  processRemoteCommand("CMD|ID:cmd15|ACTION:SCHEDULE_SET|IDX:4|HR:7|MIN:30|TGT:250|EN:1");
  assertLogContains("CMD_ACK|ID:cmd15|STATUS:REJECTED|REASON:INVALID_INDEX");
});

runTest("18. E2E: Sync schedule and trigger via RTC", () => {
  // Sync schedule 0
  processRemoteCommand("CMD|ID:e2e1|ACTION:SCHEDULE_SET|IDX:0|HR:9|MIN:30|TGT:250|EN:1");
  assertLogContains("CMD_ACK|ID:e2e1|STATUS:ACCEPTED");
  
  if (feedSchedules[0].hour !== 9 || feedSchedules[0].minute !== 30 || feedSchedules[0].targetGrams !== 250 || feedSchedules[0].enabled !== true) {
    throw new Error("Schedule 0 not updated correctly");
  }

  // Simulate RTC reaching 09:30
  checkScheduledFeeding(9, 30);
  if (!feedingActive || pinStates.DISPENSER_RELAY_PIN !== 1) {
    throw new Error("Scheduled feeding did not start");
  }
});

runTest("19. E2E: Manual feed blocks scheduled feed", () => {
  // Reset
  feedingActive = false;
  pinStates.DISPENSER_RELAY_PIN = 0;
  
  // Sync schedule 1
  processRemoteCommand("CMD|ID:e2e2|ACTION:SCHEDULE_SET|IDX:1|HR:14|MIN:0|TGT:300|EN:1");
  
  // Start manual feed
  processRemoteCommand("CMD|ID:m1|ACTION:MANUAL_FEED|TARGET:100");
  if (!feedingActive) throw new Error("Manual feeding failed to start");
  
  // Simulate RTC reaching 14:00 while manual feed is running
  checkScheduledFeeding(14, 0);
  
  // End manual feed
  feedingActive = false;
  pinStates.DISPENSER_RELAY_PIN = 0;
  
  // Simulate RTC next minute
  checkScheduledFeeding(14, 1);
  if (feedingActive) throw new Error("Scheduled feed bypassed the safety block and executed later incorrectly");
});

// Clean up after test 19 (manual feed m1 left the command slot occupied).
activeRemoteCommandId = "";

runTest("20. FW-1: E-stop during remote feed reports failure and frees command slot", () => {
  pinStates.EMERGENCY_STOP_PIN = 1;
  emergencyStopActive = false;
  feedingActive = false;

  processRemoteCommand("CMD|ID:fw1a|ACTION:MANUAL_FEED|TARGET:200");
  assertActive(true);

  pinStates.EMERGENCY_STOP_PIN = 0;
  handleSafety();
  assertLogContains("CMD_DONE|ID:fw1a|STATUS:FAILED|REASON:ESTOP_ACTIVE");
  if (activeRemoteCommandId !== "") throw new Error("Command slot was not freed");

  // A later command must not be rejected as SYSTEM_BUSY.
  processRemoteCommand("CMD|ID:fw1b|ACTION:STATUS_REQ");
  assertLogNotContains("SYSTEM_BUSY");
  assertLogContains("CMD_DONE|ID:fw1b|STATUS:SUCCESS");
});

runTest("21. FW-2: pump timeout latches and does not restart while water stays low", () => {
  emergencyStopActive = false;
  pinStates.EMERGENCY_STOP_PIN = 1;
  simMillis = 0;
  waterLow = true;
  waterHigh = false;

  updateHydration();
  if (!waterPumpActive) throw new Error("Pump should start on low water");

  simMillis = WATER_PUMP_MAX_RUNTIME_MS;
  updateHydration();
  if (waterPumpActive) throw new Error("Pump should stop at max runtime");
  if (!waterPumpFaultLatched) throw new Error("Fault should be latched");
  assertLogContains("QUEUED:WATER_PUMP_TIMEOUT");

  // Water is still low on later loops: the pump must stay off.
  simMillis += 100;
  updateHydration();
  simMillis += 5000;
  updateHydration();
  if (waterPumpActive) throw new Error("Pump restarted despite latched fault");

  // Reaching the high float clears the latch.
  waterLow = false;
  waterHigh = true;
  updateHydration();
  if (waterPumpFaultLatched) throw new Error("High level should clear the fault latch");
});

runTest("22. FW-3: alerts raised in the same loop are all delivered in order", () => {
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

runTest("23. FW-3: full alert queue drops the oldest entry", () => {
  alertQueue = [];
  ["A", "B", "C", "D", "E"].forEach(queueAlertEvent);
  assertLogContains("DROPPED:A");
  if (alertQueue.join(",") !== "B,C,D,E") throw new Error("Queue contents: " + alertQueue.join(","));
  alertQueue = [];
});

runTest("24. FW-3: LOW_WATER only when pump cannot refill, once per low episode", () => {
  alertQueue = [];
  emergencyStopActive = false;
  waterPumpFaultLatched = false;
  waterPumpActive = false;
  lowWaterAlertSent = false;
  simMillis = 0;
  waterHigh = false;
  waterLow = true;

  // Normal refill: no LOW_WATER.
  updateHydration();
  assertLogNotContains("QUEUED:LOW_WATER");

  // Pump times out while still low: LOW_WATER raised exactly once.
  simMillis = WATER_PUMP_MAX_RUNTIME_MS;
  updateHydration();
  updateHydration();
  const count = outputLog.filter(l => l === "QUEUED:LOW_WATER").length;
  if (count !== 1) throw new Error(`Expected 1 LOW_WATER, got ${count}`);

  // Clean up hydration state.
  waterLow = false;
  waterHigh = true;
  updateHydration();
  waterHigh = false;
  alertQueue = [];
});

runTest("25. FW-4: local 07:00 schedule fires at 23:00 UTC, not 07:00 UTC", () => {
  feedingActive = false;
  emergencyStopActive = false;
  activeRemoteCommandId = "";
  processRemoteCommand("CMD|ID:fw4|ACTION:SCHEDULE_SET|IDX:0|HR:7|MIN:0|TGT:250|EN:1");
  assertLogContains("CMD_DONE|ID:fw4|STATUS:SUCCESS");

  // 07:00 UTC is 15:00 PHT: must not feed.
  checkScheduledFeedingAtUtc(7, 0);
  if (feedingActive) throw new Error("Fed at 07:00 UTC (15:00 local)");

  // 23:00 UTC is 07:00 PHT: must feed.
  checkScheduledFeedingAtUtc(23, 0);
  if (!feedingActive) throw new Error("Did not feed at 07:00 local");
  feedingActive = false;
  pinStates.DISPENSER_RELAY_PIN = 0;
});

runTest("26. FW-5: E-stop stays latched after button release until remote reset", () => {
  emergencyStopActive = false;
  emergencyButtonPressed = false;
  activeRemoteCommandId = "";
  pinStates.EMERGENCY_STOP_PIN = 1;
  alertQueue = [];

  pinStates.EMERGENCY_STOP_PIN = 0;
  handleSafety();
  if (!emergencyStopActive) throw new Error("E-stop did not trip");

  // Release the button: automation must NOT resume.
  pinStates.EMERGENCY_STOP_PIN = 1;
  handleSafety();
  handleSafety();
  if (!emergencyStopActive) throw new Error("E-stop auto-released");

  waterLow = true;
  waterHigh = false;
  updateHydration();
  if (waterPumpActive) throw new Error("Pump ran while E-stop latched");
  processRemoteCommand("CMD|ID:fw5a|ACTION:MANUAL_FEED|TARGET:100");
  assertLogContains("CMD_ACK|ID:fw5a|STATUS:REJECTED|REASON:ESTOP_ACTIVE");

  // Explicit reset clears the latch.
  processRemoteCommand("CMD|ID:fw5b|ACTION:ESTOP_RELEASE");
  assertLogContains("CMD_ACK|ID:fw5b|STATUS:ACCEPTED");
  assertLogContains("CMD_DONE|ID:fw5b|STATUS:SUCCESS");
  assertLogContains("QUEUED:EMERGENCY_STOP_RELEASED");
  if (emergencyStopActive) throw new Error("Reset did not clear latch");

  waterLow = false;
  stopWaterPump();
  alertQueue = [];
});

runTest("27. FW-5: reset rejected while button still pressed; reset clears pump fault", () => {
  emergencyStopActive = false;
  emergencyButtonPressed = false;
  pinStates.EMERGENCY_STOP_PIN = 0;
  handleSafety();
  waterPumpFaultLatched = true;

  processRemoteCommand("CMD|ID:fw5c|ACTION:ESTOP_RELEASE");
  assertLogContains("CMD_ACK|ID:fw5c|STATUS:REJECTED|REASON:PHYSICAL_ESTOP_ENGAGED");
  if (!emergencyStopActive) throw new Error("Latch cleared while button pressed");

  pinStates.EMERGENCY_STOP_PIN = 1;
  handleSafety();
  processRemoteCommand("CMD|ID:fw5d|ACTION:ESTOP_RELEASE");
  assertLogContains("CMD_DONE|ID:fw5d|STATUS:SUCCESS");
  if (waterPumpFaultLatched) throw new Error("Reset should clear pump fault latch");
  alertQueue = [];
});

runTest("28. Phase 3: blank EEPROM falls back to firmware defaults", () => {
  eeprom = new Uint8Array(4096).fill(0xFF);
  if (rebootMega() !== false) throw new Error("Blank EEPROM should not load");
  if (feedSchedules[0].targetGrams !== 500 || !feedSchedules[2].enabled) throw new Error("Defaults not in place");
});

runTest("29. Phase 3: schedule changes survive a Mega power cycle", () => {
  processRemoteCommand("CMD|ID:p3a|ACTION:SCHEDULE_SET|IDX:0|HR:6|MIN:45|TGT:300|EN:1");
  processRemoteCommand("CMD|ID:p3b|ACTION:SCHEDULE_SET|IDX:1|HR:0|MIN:0|TGT:250|EN:0");
  processRemoteCommand("CMD|ID:p3c|ACTION:SCHEDULE_SET|IDX:2|HR:0|MIN:0|TGT:250|EN:0");
  assertLogContains("CMD_DONE|ID:p3c|STATUS:SUCCESS");

  if (rebootMega() !== true) throw new Error("Saved schedules did not load");
  const s = feedSchedules;
  if (s[0].hour !== 6 || s[0].minute !== 45 || s[0].targetGrams !== 300 || !s[0].enabled) throw new Error("Slot 0 not restored");
  if (s[1].enabled || s[2].enabled) throw new Error("Deleted slots came back enabled after reboot");

  // A deleted slot must not feed after the reboot (old bug: defaults re-enabled).
  checkScheduledFeeding(12, 0);
  if (feedingActive) throw new Error("Fed from a deleted default schedule after reboot");
});

runTest("30. Phase 3: corrupted EEPROM record is rejected (defaults used)", () => {
  eeprom[5] ^= 0x01; // flip one bit inside slot 0
  if (rebootMega() !== false) throw new Error("Corrupted record was accepted");
  if (feedSchedules[0].hour !== 7) throw new Error("Defaults not restored after corruption");
});

runTest("31. Phase 3: ACK-paced RTDB restore (R0..R2) applies slots; repeating it writes nothing", () => {
  eeprom = new Uint8Array(4096).fill(0xFF);
  rebootMega();
  const restoreLines = [
    "CMD|ID:R0|ACTION:SCHEDULE_SET|IDX:0|HR:12|MIN:30|TGT:2000|EN:1",
    "CMD|ID:R1|ACTION:SCHEDULE_SET|IDX:1|HR:0|MIN:0|TGT:250|EN:0",
    "CMD|ID:R2|ACTION:SCHEDULE_SET|IDX:2|HR:0|MIN:0|TGT:250|EN:0"
  ];
  for (const line of restoreLines) {
    // Must fit the Mega's 64-byte Serial1 RX buffer including the newline.
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

  if (rebootMega() !== true || feedSchedules[0].targetGrams !== 2000) throw new Error("Restored schedule not persisted");
});

runTest("32. Phase 3: restore is rejected while a remote feed is running (ESP32 retries later)", () => {
  feedingActive = false;
  activeRemoteCommandId = "";
  processRemoteCommand("CMD|ID:busyfeed|ACTION:MANUAL_FEED|TARGET:100");
  outputLog = [];
  processRemoteCommand("CMD|ID:R0|ACTION:SCHEDULE_SET|IDX:0|HR:8|MIN:0|TGT:250|EN:1");
  assertLogContains("CMD_ACK|ID:R0|STATUS:REJECTED|REASON:SYSTEM_BUSY");
  if (feedSchedules[0].hour === 8) throw new Error("Busy restore should not change the slot");
  feedingActive = false;
  activeRemoteCommandId = "";
});

runTest("33. Phase 4: online status follows ESP32 STATUS reports plus a 15 s link timeout", () => {
  simMillis = 1000;
  esp32ReportsOnline = false;
  lastESP32MessageMillis = 0;

  // A TIME line proves the link but does not mean the device is online.
  receiveESP32Line("TIME|2026-10-21|06:00:00");
  updateLinkStatus();
  if (esp32Online) throw new Error("TIME alone must not mark the device online");

  receiveESP32Line("STATUS|ONLINE");
  updateLinkStatus();
  if (!esp32Online) throw new Error("STATUS|ONLINE should mark online");

  // 10 s STATUS heartbeats keep it online.
  for (let i = 0; i < 3; i++) {
    simMillis += 10000;
    receiveESP32Line("STATUS|ONLINE");
    updateLinkStatus();
    if (!esp32Online) throw new Error("Heartbeats should keep it online");
  }

  // ESP32 reports Wi-Fi loss.
  receiveESP32Line("STATUS|OFFLINE");
  updateLinkStatus();
  if (esp32Online) throw new Error("STATUS|OFFLINE should mark offline");

  // Back online, then the UART goes silent (ESP32 crashed or unplugged).
  receiveESP32Line("STATUS|ONLINE");
  simMillis += 16000;
  updateLinkStatus();
  if (esp32Online) throw new Error("Silent link should time out to offline");
});

runTest("34. R-20: Nextion buttons do nothing until their IDs are configured", () => {
  emergencyStopActive = false;
  emergencyButtonPressed = false;
  pinStates.EMERGENCY_STOP_PIN = 1;
  nextionIds = { page: NEXTION_ID_UNSET, stop: NEXTION_ID_UNSET, start: NEXTION_ID_UNSET };
  feedNextionBytes(touch(1, 12));
  assertLogContains("NEXTION_TOUCH:1:12"); // logged so the IDs can be discovered
  if (emergencyStopActive) throw new Error("Unconfigured button must not act");
});

runTest("35. R-20: b3 latches the stop; b4 resets only with the E-stop button released", () => {
  nextionIds = { page: 1, stop: 12, start: 13 };
  emergencyStopActive = false;
  emergencyButtonPressed = false;
  pinStates.EMERGENCY_STOP_PIN = 1;
  simMillis = 100000;
  alertQueue = [];

  // Noise the HMI also sends: startup bytes, an invalid-variable error, page text.
  feedNextionBytes([0x00, 0x00, 0x00, 0xFF, 0xFF, 0xFF, 0x88, 0xFF, 0xFF, 0xFF, 0x1A, 0xFF, 0xFF, 0xFF]);
  feedNextionBytes([...Buffer.from('Sched.t4.txt+=":"'), 0xFF, 0xFF, 0xFF]);
  if (emergencyStopActive) throw new Error("Noise frames must be ignored");

  // b3 press + release within the debounce window: one stop.
  feedNextionBytes(touch(1, 12, 0x01));
  feedNextionBytes(touch(1, 12, 0x00));
  if (!emergencyStopActive) throw new Error("b3 should latch the stop");
  if (alertQueue.filter(a => a === "EMERGENCY_STOP").length !== 1) throw new Error("Stop should trigger once");

  // b4 while the physical E-stop is pressed: rejected.
  pinStates.EMERGENCY_STOP_PIN = 0;
  simMillis += 1000;
  feedNextionBytes(touch(1, 13));
  assertLogContains("NEXTION_START_REJECTED:PHYSICAL_ESTOP_ENGAGED");
  if (!emergencyStopActive) throw new Error("Reset must be refused while the button is pressed");

  // Button released: b4 resets.
  pinStates.EMERGENCY_STOP_PIN = 1;
  simMillis += 1000;
  feedNextionBytes(touch(1, 13));
  if (emergencyStopActive) throw new Error("b4 should reset the latch");

  // Same IDs on another page do nothing.
  simMillis += 1000;
  feedNextionBytes(touch(4, 12));
  if (emergencyStopActive) throw new Error("Touches on other pages must be ignored");
  alertQueue = [];
});

console.log("ALL SIMULATION TESTS PASSED.");
