/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-empty-function */
const EMULATOR_BASE_URL = "http://127.0.0.1:5001/hyfepoul-dev/us-central1";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8085";
const admin = require("firebase-admin");
admin.initializeApp({projectId: "hyfepoul-dev"});
const db = admin.firestore();

const testEnv = require("firebase-functions-test")({projectId: "hyfepoul-dev"});
const {claimDevice} = require("../lib/controllers/claim.js");
const claimDeviceWrapped = testEnv.wrap(claimDevice);

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
  const ts2 = new Date().toISOString();

  // Clear Firestore before tests
  await fetch("http://127.0.0.1:8085/emulator/v1/projects/hyfepoul-dev/databases/(default)/documents", {method: "DELETE"});

  console.log("--- Running Local API Tests against Emulator ---");

  // DATA PERSISTENCE TESTS
  const dataPayload1 = {
    feedWeightGrams: 450, targetFeedGrams: 500, hopperLevelPercent: 85,
    waterLow: false, waterHigh: false, pumpActive: false,
    feedingActive: true, emergencyStopActive: false, timestamp: ts,
  };

  let res = await sendReq("device/data", dataPayload1, validHeaders);
  assertEqual("1. Valid DATA request status", res.status, 200);

  let deviceDoc = await db.collection("devices").doc("device-001").get();
  assertEqual("   -> Device doc created", deviceDoc.exists, true);
  assertEqual("   -> esp32Status is ONLINE", deviceDoc.data().esp32Status, "ONLINE");
  assertEqual("   -> feedWeightGrams match", deviceDoc.data().currentState.feedWeightGrams, 450);

  const dataPayload2 = {...dataPayload1, feedWeightGrams: 420, timestamp: ts2};
  res = await sendReq("device/data", dataPayload2, validHeaders);
  assertEqual("2. Second valid DATA request status", res.status, 200);

  deviceDoc = await db.collection("devices").doc("device-001").get();
  assertEqual("   -> Device doc updated", deviceDoc.data().currentState.feedWeightGrams, 420);

  const systemDataSnap = await db.collection("devices").doc("device-001").collection("systemData").get();
  assertEqual("3. Historical systemData records exist (2 snapshots)", systemDataSnap.size, 2);

  // EVENT PERSISTENCE TESTS
  const eventPayload1 = {eventId: "42-1045", name: "LOW_WATER", timestamp: ts};
  res = await sendReq("device/event", eventPayload1, validHeaders);
  assertEqual("4. First actionable event status", res.status, 200);

  let alertsSnap = await db.collection("devices").doc("device-001").collection("alerts").get();
  assertEqual("   -> Exactly one alert created", alertsSnap.size, 1);
  const alertDoc = alertsSnap.docs[0];
  assertEqual("   -> Alert is LOW_WATER", alertDoc.data().name, "LOW_WATER");
  assertEqual("   -> Alert is unresolved", alertDoc.data().resolved, false);

  res = await sendReq("device/event", eventPayload1, validHeaders);
  assertEqual("5. Resend same eventId status", res.status, 200);

  alertsSnap = await db.collection("devices").doc("device-001").collection("alerts").get();
  assertEqual("   -> Still exactly one alert (Idempotency check)", alertsSnap.size, 1);

  const eventPayload2 = {eventId: "42-1046", name: "LOW_WATER", timestamp: ts2};
  res = await sendReq("device/event", eventPayload2, validHeaders);
  assertEqual("6. Same event name with different eventId status", res.status, 200);

  alertsSnap = await db.collection("devices").doc("device-001").collection("alerts").get();
  assertEqual("   -> Two distinct alerts exist now", alertsSnap.size, 2);

  const infoEventPayload = {name: "FEEDING_STARTED", timestamp: ts};
  res = await sendReq("device/event", infoEventPayload, validHeaders);
  assertEqual("7. Informational event status", res.status, 200);

  alertsSnap = await db.collection("devices").doc("device-001").collection("alerts").get();
  assertEqual("   -> Three total events (2 actionable, 1 info)", alertsSnap.size, 3);
  const infoDoc = alertsSnap.docs.find((d) => d.data().name === "FEEDING_STARTED");
  assertEqual("   -> Informational event persisted", !!infoDoc, true);

  const invalidEventPayload = {eventId: "42-1047", name: "NOT_A_REAL_EVENT", timestamp: ts};
  res = await sendReq("device/event", invalidEventPayload, validHeaders);
  assertEqual("8. Invalid event status", res.status, 400);

  alertsSnap = await db.collection("devices").doc("device-001").collection("alerts").get();
  assertEqual("   -> No Firestore write for invalid event", alertsSnap.size, 3);

  // AUTH & VALIDATION TESTS
  const badAuthHeaders = {...validHeaders, "X-Device-Token": "wrong-token"};
  res = await sendReq("device/event", {eventId: "42-1048", name: "LOW_FEED", timestamp: ts}, badAuthHeaders);
  assertEqual("9. Unauthorized device status", res.status, 403);

  alertsSnap = await db.collection("devices").doc("device-001").collection("alerts").get();
  assertEqual("   -> No Firestore write for unauthorized", alertsSnap.size, 3);

  const invalidDataPayload = {...dataPayload1, hopperLevelPercent: 150}; // Out of bounds
  res = await sendReq("device/data", invalidDataPayload, validHeaders);
  assertEqual("10. Invalid DATA payload status", res.status, 400);

  const systemDataSnap2 = await db.collection("devices").doc("device-001").collection("systemData").get();
  assertEqual("    -> No Firestore write for invalid DATA", systemDataSnap2.size, 2);

  // New Secret Manager & Authentication Edge Cases
  console.log("--- Running Strict Authentication Tests ---");

  // 1. Missing X-Device-ID
  res = await sendReq("device/data", dataPayload1, {"Content-Type": "application/json", "X-Device-Token": "mock-secret-token-123"});
  assertEqual("A1. Missing X-Device-ID rejected", res.status, 401);

  // 2. Missing X-Device-Token
  res = await sendReq("device/data", dataPayload1, {"Content-Type": "application/json", "X-Device-ID": "device-001"});
  assertEqual("A2. Missing X-Device-Token rejected", res.status, 401);

  // 3. Empty credentials
  res = await sendReq("device/data", dataPayload1, {"Content-Type": "application/json", "X-Device-ID": "", "X-Device-Token": ""});
  assertEqual("A3. Empty credentials rejected", res.status, 401);

  // 4. Correct Secret Manager token accepted (using our emulator injection pattern)
  const smHeaders = {"Content-Type": "application/json", "X-Device-ID": "test-sm-valid", "X-Device-Token": "test-sm-token-123"};
  res = await sendReq("device/data", dataPayload1, smHeaders);
  assertEqual("A4. Correct Secret Manager token accepted", res.status, 200);

  // 5. Unknown device in SM rejected
  const smUnknownHeaders = {"Content-Type": "application/json", "X-Device-ID": "test-sm-unknown", "X-Device-Token": "test-sm-token-123"};
  res = await sendReq("device/data", dataPayload1, smUnknownHeaders);
  assertEqual("A5. Unknown Secret Manager device rejected", res.status, 403);

  // 6. Production mode rejects mock credential
  const {authenticateDevice} = require("../lib/auth.js");
  const origEnv = process.env.FUNCTIONS_EMULATOR;
  process.env.FUNCTIONS_EMULATOR = "false"; // Simulate production
  process.env.DISABLE_SM_CLIENT = "true"; // Prevent background gRPC crash
  const mockReq = {header: (k) => k === "X-Device-ID" ? "device-001" : "mock-secret-token-123"};
  let statusSet = 0;
  const mockRes = {status: (s) => {
    statusSet = s; return {json: () => {}};
  }};
  const authResult = await authenticateDevice(mockReq, mockRes);
  process.env.FUNCTIONS_EMULATOR = origEnv; // Restore
  delete process.env.DISABLE_SM_CLIENT;

  assertEqual("A6. Production mode rejects mock credential", authResult, false);
  assertEqual("    -> Status is 403", statusSet, 403);

  // MOBILE APP FIRESTORE SECURITY RULES TESTS
  console.log("--- Running Mobile App Security Rules Tests ---");

  // Set up ownerId on device-001 and device-002
  await db.collection("devices").doc("device-001").set({ownerId: "user123"}, {merge: true});
  await db.collection("devices").doc("device-002").set({ownerId: "otherUser"});

  const FIRESTORE_REST = "http://127.0.0.1:8085/v1/projects/hyfepoul-dev/databases/(default)/documents";

  const getMockToken = (uid) => {
    if (!uid) return null;
    const header = Buffer.from(JSON.stringify({alg: "none", type: "JWT"})).toString("base64url");
    const payload = Buffer.from(JSON.stringify({sub: uid, user_id: uid, project_id: "hyfepoul-dev"})).toString("base64url");
    return `${header}.${payload}.`;
  };

  const firestoreFetch = async (path, uid, method = "GET", body = null) => {
    const opts = {method};
    if (uid) {
      opts.headers = {Authorization: `Bearer ${getMockToken(uid)}`};
    }
    if (body) {
      opts.headers = {...opts.headers, "Content-Type": "application/json"};
      opts.body = JSON.stringify(body);
    }
    return fetch(`${FIRESTORE_REST}/${path}`, opts);
  };

  res = await firestoreFetch("devices/device-001", null);
  assertEqual("11. Unauthenticated read denied", res.status, 403);

  res = await firestoreFetch("devices/device-001", "user123");
  assertEqual("12. Authenticated owner read allowed", res.status, 200);

  res = await firestoreFetch("devices/device-002", "user123");
  assertEqual("13. Authenticated non-owner read denied", res.status, 403);

  res = await firestoreFetch("devices/device-001?updateMask.fieldPaths=ownerId", "user123", "PATCH", {
    fields: {ownerId: {stringValue: "hacked"}},
  });
  assertEqual("14. Owner update ownerId denied", res.status, 403);

  res = await firestoreFetch("devices/device-001?updateMask.fieldPaths=currentState", "user123", "PATCH", {
    fields: {currentState: {mapValue: {fields: {}}}},
  });
  assertEqual("15. Owner update currentState denied", res.status, 403);

  res = await firestoreFetch("devices/device-001/systemData", "user123");
  assertEqual("16. Owner read systemData denied", res.status, 403);

  res = await firestoreFetch("devices/device-001/systemData?documentId=hacked", "user123", "POST", {fields: {}});
  assertEqual("17. Owner write systemData denied", res.status, 403);

  res = await firestoreFetch("devices/device-001/alerts", "user123");
  assertEqual("18. Owner read alerts denied", res.status, 403);

  res = await firestoreFetch("devices/device-001/alerts?documentId=hacked", "user123", "POST", {fields: {}});
  assertEqual("19. Owner write alerts denied", res.status, 403);

  console.log("--- Running Device Claiming Tests ---");

  // Helper to run claim tests
  const runClaim = async (data, uid) => {
    try {
      const result = await claimDeviceWrapped(data, uid ? {auth: {uid}} : {});
      return {success: true, data: result};
    } catch (err) {
      return {success: false, code: err.code || err.message};
    }
  };

  const {hashPin} = require("../lib/controllers/claim.js");

  // Setup claim-001 with pin '123456'
  await db.collection("devices").doc("claim-001").set({
    setupPinHash: hashPin("123456", "claim-001"),
  });

  // Setup claim-002 already claimed
  await db.collection("devices").doc("claim-002").set({
    ownerId: "existingUser",
    setupPinHash: hashPin("999999", "claim-002"),
  });

  // 1. Unauthenticated claim
  let claimRes = await runClaim({deviceId: "claim-001", pin: "123456"}, null);
  assertEqual("20. Unauthenticated claim rejected", claimRes.success, false);
  assertEqual("    -> Status is unauthenticated", claimRes.code, "unauthenticated");

  // 2. Unknown device
  claimRes = await runClaim({deviceId: "unknown-dev", pin: "123456"}, "user123");
  assertEqual("21. Unknown device claim rejected", claimRes.success, false);
  assertEqual("    -> Status is not-found", claimRes.code, "not-found");

  // 3. Malformed deviceId
  claimRes = await runClaim({pin: "123456"}, "user123");
  assertEqual("22. Malformed deviceId claim rejected", claimRes.success, false);

  // 4. Malformed PIN
  claimRes = await runClaim({deviceId: "claim-001"}, "user123");
  assertEqual("23. Malformed PIN claim rejected", claimRes.success, false);

  // 5. Invalid PIN
  claimRes = await runClaim({deviceId: "claim-001", pin: "654321"}, "user123");
  assertEqual("24. Invalid PIN claim rejected", claimRes.success, false);
  assertEqual("    -> Status is invalid-argument", claimRes.code, "invalid-argument");

  // 6. Valid PIN + unclaimed device -> success
  claimRes = await runClaim({deviceId: "claim-001", pin: "123456"}, "user123");
  assertEqual("25. Valid PIN claim succeeded", claimRes.success, true);

  const claimDoc = await db.collection("devices").doc("claim-001").get();
  // 7. Verify ownerId equals authenticated UID
  assertEqual("26. Verify ownerId assigned", claimDoc.data().ownerId, "user123");
  // 8. Verify claimedAt exists
  assertEqual("27. Verify claimedAt exists", !!claimDoc.data().claimedAt, true);
  // 9. Verify setupPinHash is deleted
  assertEqual("28. Verify setupPinHash is deleted", claimDoc.data().setupPinHash, undefined);

  // 10. Same PIN after successful claim -> rejected
  claimRes = await runClaim({deviceId: "claim-001", pin: "123456"}, "user123");
  assertEqual("29. Same PIN after success rejected", claimRes.success, false);
  assertEqual("    -> Status is already-exists", claimRes.code, "already-exists");

  // 11. Already claimed device -> rejected
  claimRes = await runClaim({deviceId: "claim-002", pin: "999999"}, "user456");
  assertEqual("30. Already claimed device rejected", claimRes.success, false);

  // 12. Different authenticated user attempts same device -> rejected
  // Tested by #29 and #30 essentially.
  claimRes = await runClaim({deviceId: "claim-001", pin: "123456"}, "user456");
  assertEqual("31. Different user on claimed device rejected", claimRes.success, false);

  // 13. Attacker knows deviceId but no PIN -> rejected
  // Tested by #24 and #23.

  // 14. Two simultaneous claim attempts -> only one succeeds
  await db.collection("devices").doc("claim-003").set({
    setupPinHash: hashPin("777777", "claim-003"),
  });
  const p1 = runClaim({deviceId: "claim-003", pin: "777777"}, "user123");
  const p2 = runClaim({deviceId: "claim-003", pin: "777777"}, "user456");
  const results = await Promise.all([p1, p2]);
  const successCount = results.filter((r) => r.success).length;
  assertEqual("32. Concurrent claims only one succeeds", successCount, 1);

  testEnv.cleanup();

  console.log(`\nTests completed: ${passed}/${total} passed.`);
  process.exit(passed === total ? 0 : 1);
};

setTimeout(runTests, 2000);
