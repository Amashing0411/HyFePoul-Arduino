/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-empty-function */
const EMULATOR_BASE_URL = "http://127.0.0.1:5001/hyfepoul-dev/us-central1";

const validHeaders = {
  "Content-Type": "application/json",
  "X-Device-ID": "device-001",
  "X-Device-Token": "mock-secret-token-123",
};

const sendReq = async (endpoint, payload, headers, method = "POST") => {
  const reqOpts = {
    method,
    headers,
  };
  if (method !== "GET" && method !== "HEAD") {
    reqOpts.body = JSON.stringify(payload);
  }
  const res = await fetch(`${EMULATOR_BASE_URL}/${endpoint}`, reqOpts);
  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  return {status: res.status, data};
};

const runTests = async () => {
  let passed = 0;
  let total = 0;

  const assertEqual = (name, actual, expected) => {
    total++;
    if (actual === expected) {
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${name} | Expected: ${expected} | Got: ${actual}`);
    }
  };

  const ts = new Date().toISOString();

  console.log("--- Running Local API Tests against Emulator ---");

  // 1. Valid /device/data request
  let res = await sendReq("device/data", {
    feedWeightGrams: 450, targetFeedGrams: 500, hopperLevelPercent: 85,
    waterLow: false, waterHigh: false, pumpActive: false,
    feedingActive: true, emergencyStopActive: false, timestamp: ts,
  }, validHeaders);
  assertEqual("1. Valid /device/data request", res.status, 200);

  // 2. Missing required field
  res = await sendReq("device/data", {
    targetFeedGrams: 500, hopperLevelPercent: 85,
    waterLow: false, waterHigh: false, pumpActive: false,
    feedingActive: true, emergencyStopActive: false, timestamp: ts,
  }, validHeaders); // Missing feedWeightGrams
  assertEqual("2. Missing required field (feedWeightGrams)", res.status, 400);

  // 3. Wrong field type
  res = await sendReq("device/data", {
    feedWeightGrams: "450", targetFeedGrams: 500, hopperLevelPercent: 85,
    waterLow: false, waterHigh: false, pumpActive: false,
    feedingActive: true, emergencyStopActive: false, timestamp: ts,
  }, validHeaders); // String instead of number
  assertEqual("3. Wrong field type (string instead of number)", res.status, 400);

  // 4. Invalid timestamp
  res = await sendReq("device/data", {
    feedWeightGrams: 450, targetFeedGrams: 500, hopperLevelPercent: 85,
    waterLow: false, waterHigh: false, pumpActive: false,
    feedingActive: true, emergencyStopActive: false, timestamp: "2026-15-99T14:00:00",
  }, validHeaders);
  assertEqual("4. Invalid timestamp format", res.status, 400);

  // 5. Missing X-Device-ID
  res = await sendReq("device/data", {
    feedWeightGrams: 450, targetFeedGrams: 500, hopperLevelPercent: 85,
    waterLow: false, waterHigh: false, pumpActive: false,
    feedingActive: true, emergencyStopActive: false, timestamp: ts,
  }, {"Content-Type": "application/json", "X-Device-Token": "mock-secret-token-123"});
  assertEqual("5. Missing X-Device-ID", res.status, 401);

  // 6. Missing X-Device-Token
  res = await sendReq("device/data", {
    feedWeightGrams: 450, targetFeedGrams: 500, hopperLevelPercent: 85,
    waterLow: false, waterHigh: false, pumpActive: false,
    feedingActive: true, emergencyStopActive: false, timestamp: ts,
  }, {"Content-Type": "application/json", "X-Device-ID": "device-001"});
  assertEqual("6. Missing X-Device-Token", res.status, 401);

  // 7. Valid /device/event
  res = await sendReq("device/event", {
    eventId: "42-1045", name: "LOW_WATER", timestamp: ts,
  }, validHeaders);
  assertEqual("7. Valid /device/event (Actionable)", res.status, 200);

  // 8. Invalid event name
  res = await sendReq("device/event", {
    eventId: "42-1046", name: "NOT_A_REAL_EVENT", timestamp: ts,
  }, validHeaders);
  assertEqual("8. Invalid event name", res.status, 400);

  // 9. Missing eventId for actionable event
  res = await sendReq("device/event", {
    name: "LOW_WATER", timestamp: ts,
  }, validHeaders);
  assertEqual("9. Missing eventId for actionable event", res.status, 400);

  // 10. Informational event without eventId
  res = await sendReq("device/event", {
    name: "FEEDING_STARTED", timestamp: ts,
  }, validHeaders);
  assertEqual("10. Informational event without eventId", res.status, 200);

  // 11. Invalid authentication token
  res = await sendReq("device/data", {
    feedWeightGrams: 450, targetFeedGrams: 500, hopperLevelPercent: 85,
    waterLow: false, waterHigh: false, pumpActive: false,
    feedingActive: true, emergencyStopActive: false, timestamp: ts,
  }, {"Content-Type": "application/json", "X-Device-ID": "device-001", "X-Device-Token": "wrong-token"});
  assertEqual("11. Invalid authentication token", res.status, 403);

  // 12. Valid emulator-only mock authentication
  res = await sendReq("device/data", {
    feedWeightGrams: 450, targetFeedGrams: 500, hopperLevelPercent: 85,
    waterLow: false, waterHigh: false, pumpActive: false,
    feedingActive: true, emergencyStopActive: false, timestamp: ts,
  }, validHeaders);
  assertEqual("12. Valid emulator-only mock authentication", res.status, 200);

  // 13. Unsupported HTTP method
  res = await sendReq("device/data", {}, validHeaders, "GET");
  assertEqual("13. Unsupported HTTP method (GET returns 405)", res.status, 405);

  console.log("\n--- Testing Authentication Isolation ---");
  // Test mock credential refusal outside emulator by spawning a separate node script
  // that just calls authenticateDevice directly without the env var set.
  const {authenticateDevice} = require("../lib/auth.js");
  const mockReq = {
    header: (name) => {
      if (name === "X-Device-ID") return "device-001";
      if (name === "X-Device-Token") return "mock-secret-token-123";
      return undefined;
    },
  };
  let code = 0;
  const mockRes = {
    status: (c) => {
      code = c; return mockRes;
    },
    json: () => {},
  };

  // Temporarily unset the env var to mimic production
  const origEnv = process.env.FUNCTIONS_EMULATOR;
  process.env.FUNCTIONS_EMULATOR = "false";

  authenticateDevice(mockReq, mockRes);
  assertEqual("14. Mock credential rejected when not in emulator (Production fallback returns 501)", code, 501);

  // Restore env
  process.env.FUNCTIONS_EMULATOR = origEnv;

  console.log(`\nTests completed: ${passed}/${total} passed.`);
  process.exit(passed === total ? 0 : 1);
};

// Wait a moment for emulator to boot up if started recently
setTimeout(runTests, 2000);
