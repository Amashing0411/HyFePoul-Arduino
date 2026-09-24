/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-empty-function */
const EMULATOR_BASE_URL = "http://127.0.0.1:5001/hyfepoul-dev/us-central1";

process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8085";
const admin = require("firebase-admin");
admin.initializeApp({projectId: "hyfepoul-dev"});
const db = admin.firestore();

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

  console.log(`\nTests completed: ${passed}/${total} passed.`);
  process.exit(passed === total ? 0 : 1);
};

setTimeout(runTests, 2000);
