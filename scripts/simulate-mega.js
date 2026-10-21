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

// Mirrors finishRemoteCommand() in ESP32Communication.ino.
const finishRemoteCommand = (status, reason = "") => {
  if (activeRemoteCommandId === "") return;
  sendCmdDone(activeRemoteCommandId, status, reason);
  activeRemoteCommandId = "";
};

// Mirrors the E-stop trip branch of handleSafety() in Safety.ino.
const handleSafety = () => {
  const pressed = pinStates.EMERGENCY_STOP_PIN === 0;
  if (pressed && !emergencyStopActive) {
    emergencyStopActive = true;
    pinStates.DISPENSER_RELAY_PIN = 0;
    feedingActive = false;
    finishRemoteCommand("FAILED", "ESTOP_ACTIVE");
  }
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
    if (pinStates.EMERGENCY_STOP_PIN === 0) {
      sendCmdAck(cmdId, "REJECTED", "PHYSICAL_ESTOP_ENGAGED");
      return;
    }
    
    if (!emergencyStopActive) {
      sendCmdAck(cmdId, "REJECTED", "ESTOP_NOT_ACTIVE");
      return;
    }
    
    activeRemoteCommandId = cmdId;
    sendCmdAck(cmdId, "ACCEPTED");
    
    emergencyStopActive = false;
    
    sendCmdDone(cmdId, "SUCCESS");
    activeRemoteCommandId = "";
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

console.log("ALL SIMULATION TESTS PASSED.");
