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

const startRemoteFeeding = (target) => {
  if (emergencyStopActive) return;
  feedingActive = true;
  pinStates.DISPENSER_RELAY_PIN = 1;
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

console.log("ALL SIMULATION TESTS PASSED.");
