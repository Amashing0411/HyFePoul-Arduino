/* eslint-disable */
const admin = require("firebase-admin");

// Initialize the master app (admin bypasses all rules) to set up test state
const masterApp = admin.initializeApp({
  projectId: "hyfepoul-dev",
  databaseURL: "http://127.0.0.1:9000/?ns=hyfepoul-dev-default-rtdb"
}, "masterApp");
const masterDb = masterApp.database();

// Helper to create an authenticated client constrained by rules
function createAuthApp(uid) {
  return admin.initializeApp({
    projectId: "hyfepoul-dev",
    databaseURL: "http://127.0.0.1:9000/?ns=hyfepoul-dev-default-rtdb",
    databaseAuthVariableOverride: uid ? { uid: uid } : null
  }, `app_${uid}_${Date.now()}`);
}

async function assertFails(promise) {
  try {
    await promise;
    throw new Error("Expected request to fail, but it succeeded.");
  } catch (error) {
    if (error.message.includes("Expected request to fail") || !error.message.toLowerCase().includes("permission_denied")) {
      throw error;
    }
  }
}

async function assertSucceeds(promise) {
  try {
    await promise;
  } catch (error) {
    throw new Error(`Expected request to succeed, but it failed with: ${error.message}`);
  }
}

async function runTests() {
  console.log("Starting RTDB Security Rules Tests...");
  let passed = 0;
  let failed = 0;

  async function test(name, testFn) {
    try {
      await testFn();
      console.log(`[PASS] ${name}`);
      passed++;
    } catch (e) {
      console.error(`[FAIL] ${name}`);
      console.error(e.message);
      failed++;
    }
  }

  // Clear database and set up mock secrets
  await masterDb.ref("/").set(null);
  await masterDb.ref("deviceSecrets/dev1").set({ setupPin: "123456" });
  await masterDb.ref("devices/dev2").set({ ownerId: "owner2", deviceAuthUid: "esp32_dev2" });

  const unauthApp = createAuthApp(null);
  const unauthDb = unauthApp.database();

  const user1App = createAuthApp("user1");
  const user1Db = user1App.database();

  const user2App = createAuthApp("owner2");
  const user2Db = user2App.database();

  const esp32App = createAuthApp("esp32_dev2");
  const esp32Db = esp32App.database();

  await test("Authentication: unauthenticated read denied", async () => {
    await assertFails(unauthDb.ref("devices/dev2").once("value"));
  });

  await test("Authentication: unauthenticated write denied", async () => {
    await assertFails(unauthDb.ref("devices/dev2/status").set("online"));
  });

  await test("Owner access: owner can read own device", async () => {
    await assertSucceeds(user2Db.ref("devices/dev2").once("value"));
  });

  await test("Owner access: owner cannot read another user's device", async () => {
    await assertFails(user1Db.ref("devices/dev2").once("value"));
  });

  await test("Secrets: nobody can read setup PIN (unauth, owner, device)", async () => {
    await assertFails(unauthDb.ref("deviceSecrets/dev1").once("value"));
    await assertFails(user1Db.ref("deviceSecrets/dev1").once("value"));
    await assertFails(esp32Db.ref("deviceSecrets/dev1").once("value"));
  });

  await test("Ownership: wrong PIN claim rejected", async () => {
    await assertFails(user1Db.ref("claimRequests/dev1").set({ uid: "user1", pin: "wrong" }));
  });

  await test("Ownership: unauthenticated claim rejected", async () => {
    await assertFails(unauthDb.ref("claimRequests/dev1").set({ uid: "user1", pin: "123456" }));
  });

  await test("Ownership: successfully create claim request with correct PIN", async () => {
    await assertSucceeds(user1Db.ref("claimRequests/dev1").set({ uid: "user1", pin: "123456" }));
  });

  await test("Ownership: another user cannot overwrite claim request", async () => {
    await assertFails(user2Db.ref("claimRequests/dev1").set({ uid: "owner2", pin: "123456" }));
  });

  await test("Ownership: user can establish ownership after valid claim request", async () => {
    await assertSucceeds(user1Db.ref("devices/dev1/ownerId").set("user1"));
  });

  await test("Ownership: cannot replay claim after ownership exists", async () => {
    // Already claimed by user1. user2 tries to create claim request.
    await assertFails(user2Db.ref("claimRequests/dev1").set({ uid: "owner2", pin: "123456" }));
  });

  await test("Ownership: existing owner cannot transfer ownership", async () => {
    await assertFails(user1Db.ref("devices/dev1/ownerId").set("owner2"));
  });

  await test("Ownership: mobile user cannot modify deviceAuthUid", async () => {
    await assertFails(user1Db.ref("devices/dev1/deviceAuthUid").set("hacked_uid"));
  });

  await test("Device identity: ESP32 can write its own status", async () => {
    await assertSucceeds(esp32Db.ref("devices/dev2/status").set("online"));
  });

  await test("Device identity: ESP32 cannot write another device", async () => {
    await assertFails(esp32Db.ref("devices/dev1/status").set("online"));
  });

  await test("Device identity: ESP32 cannot change ownerId", async () => {
    await assertFails(esp32Db.ref("devices/dev2/ownerId").set("esp32_dev2"));
  });

  await test("Device identity: ESP32 cannot modify another device's state", async () => {
    await assertFails(esp32Db.ref("devices/dev1/state/feedingActive").set(true));
  });

  await test("Device-generated data: ESP32 can write own history", async () => {
    await assertSucceeds(esp32Db.ref("systemData/dev2/push1").set({ temp: 30 }));
  });

  await test("Device-generated data: owner cannot forge history", async () => {
    await assertFails(user2Db.ref("systemData/dev2/push2").set({ temp: 99 }));
  });

  await test("Device-generated data: another device cannot write the device's history", async () => {
    // esp32 (dev2) tries to write to dev1
    await assertFails(esp32Db.ref("systemData/dev1/push1").set({ temp: 10 }));
  });

  // Moving-hopper state: 5 tray weights, per-tray target, cycle step/tray.
  const validState = () => ({
    feedWeightGrams: 250,
    targetFeedGrams: 50,
    trayWeightsGrams: [50, 50, 50, 50, 50],
    hopperLevelPercent: 50,
    waterLow: false,
    feedingActive: true,
    cycleStep: "DISPENSING",
    currentTray: 3,
    emergencyStopActive: false,
    timestamp: 1690000000
  });

  await test("Data Validation: ESP32 can write state with correct types", async () => {
    await assertSucceeds(esp32Db.ref("devices/dev2/state").set(validState()));
  });

  await test("Data Validation: ESP32 cannot write state with wrong types", async () => {
    await assertFails(esp32Db.ref("devices/dev2/state").set({
      ...validState(),
      feedWeightGrams: "five hundred" // String instead of number
    }));
  });

  await test("Data Validation: state rejects a sixth tray or a non-numeric tray weight", async () => {
    await assertFails(esp32Db.ref("devices/dev2/state").set({ ...validState(), trayWeightsGrams: [1, 2, 3, 4, 5, 6] }));
    await assertFails(esp32Db.ref("devices/dev2/state").set({ ...validState(), trayWeightsGrams: [1, "x", 3, 4, 5] }));
  });

  await test("Data Validation: state rejects an unknown cycle step or tray out of range", async () => {
    await assertFails(esp32Db.ref("devices/dev2/state").set({ ...validState(), cycleStep: "PUMPING" }));
    await assertFails(esp32Db.ref("devices/dev2/state").set({ ...validState(), currentTray: 6 }));
  });

  await test("Data Validation: removed pump fields are rejected (old firmware format)", async () => {
    await assertFails(esp32Db.ref("devices/dev2/state").set({ ...validState(), waterHigh: true }));
    await assertFails(esp32Db.ref("devices/dev2/state").set({ ...validState(), pumpActive: false }));
  });

  // --- 5B.8 Remote Command Security Tests ---

  // Setup command test device
  await masterDb.ref("devices/dev3").set({ ownerId: "owner3", deviceAuthUid: "esp32_dev3" });
  const owner3App = createAuthApp("owner3");
  const owner3Db = owner3App.database();
  const esp32_3App = createAuthApp("esp32_dev3");
  const esp32_3Db = esp32_3App.database();

  const validCommandPayload = {
    commandId: "cmd1",
    command: "MANUAL_FEED",
    issuedBy: "owner3",
    createdAt: 1790000000000,
    status: "queued"
  };

  // Owner Tests
  await test("owner creates valid command", async () => {
    await assertSucceeds(owner3Db.ref("commands/dev3/cmd1").set(validCommandPayload));
  });

  await test("owner cannot create command for another device", async () => {
    await assertFails(owner3Db.ref("commands/dev2/cmd2").set({
      ...validCommandPayload,
      commandId: "cmd2",
      issuedBy: "owner3"
    }));
  });

  await test("owner cannot overwrite command", async () => {
    await assertFails(owner3Db.ref("commands/dev3/cmd1").set(validCommandPayload));
  });

  await test("owner cannot create with status != queued", async () => {
    await assertFails(owner3Db.ref("commands/dev3/cmd3").set({
      ...validCommandPayload,
      commandId: "cmd3",
      status: "acknowledged"
    }));
  });

  await test("owner cannot spoof issuedBy", async () => {
    await assertFails(owner3Db.ref("commands/dev3/cmd4").set({
      ...validCommandPayload,
      commandId: "cmd4",
      issuedBy: "otherUser"
    }));
  });

  await test("owner cannot modify command after creation", async () => {
    await assertFails(owner3Db.ref("commands/dev3/cmd1/command").set("ESTOP_RELEASE"));
  });

  await test("owner cannot modify status", async () => {
    await assertFails(owner3Db.ref("commands/dev3/cmd1/status").set("acknowledged"));
  });

  await test("owner cannot modify execution fields", async () => {
    await assertFails(owner3Db.ref("commands/dev3/cmd1/acknowledgedAt").set(1790000000001));
  });

  await test("owner cannot read another owner's commands", async () => {
    await assertFails(user1Db.ref("commands/dev3").once("value"));
  });

  // Device Tests
  await test("correct ESP32 can read its commands", async () => {
    await assertSucceeds(esp32_3Db.ref("commands/dev3").once("value"));
  });

  await test("wrong ESP32 cannot read them", async () => {
    await assertFails(esp32Db.ref("commands/dev3").once("value"));
  });

  await test("correct ESP32 can transition execution status", async () => {
    await assertSucceeds(esp32_3Db.ref("commands/dev3/cmd1/status").set("acknowledged"));
  });

  await test("ESP32 cannot create commands", async () => {
    await assertFails(esp32_3Db.ref("commands/dev3/cmd5").set({
      commandId: "cmd5",
      command: "MANUAL_FEED",
      issuedBy: "owner3",
      createdAt: 1790000000000,
      status: "queued"
    }));
  });

  await test("ESP32 cannot modify command", async () => {
    await assertFails(esp32_3Db.ref("commands/dev3/cmd1/command").set("ESTOP_RELEASE"));
  });

  await test("ESP32 cannot modify parameters", async () => {
    await assertFails(esp32_3Db.ref("commands/dev3/cmd1/parameters").set({ targetGrams: 9000 }));
  });

  await test("ESP32 cannot modify issuedBy", async () => {
    await assertFails(esp32_3Db.ref("commands/dev3/cmd1/issuedBy").set("esp32_dev3"));
  });

  await test("ESP32 cannot modify createdAt", async () => {
    await assertFails(esp32_3Db.ref("commands/dev3/cmd1/createdAt").set(12345));
  });

  await test("ESP32 cannot access another device's commands", async () => {
    await assertFails(esp32_3Db.ref("commands/dev2").once("value"));
  });

  // Unauthenticated Tests
  await test("unauthenticated client cannot read commands", async () => {
    await assertFails(unauthDb.ref("commands/dev3").once("value"));
  });

  await test("unauthenticated client cannot create commands", async () => {
    await assertFails(unauthDb.ref("commands/dev3/cmd6").set(validCommandPayload));
  });

  await test("unauthenticated client cannot modify commands", async () => {
    await assertFails(unauthDb.ref("commands/dev3/cmd1/status").set("failed"));
  });

  // Lifecycle Tests
  // Current status of cmd1 is 'acknowledged' (set in test 12)
  await test("invalid status transition rejected", async () => {
    // Cannot go acknowledged -> queued
    await assertFails(esp32_3Db.ref("commands/dev3/cmd1/status").set("queued"));
  });

  await test("valid transition accepted", async () => {
    // acknowledged -> executing
    await assertSucceeds(esp32_3Db.ref("commands/dev3/cmd1/status").set("executing"));
  });

  await test("completed command cannot be returned to queued", async () => {
    // First make it completed
    await assertSucceeds(esp32_3Db.ref("commands/dev3/cmd1/status").set("completed"));
    // Then try queued
    await assertFails(esp32_3Db.ref("commands/dev3/cmd1/status").set("queued"));
  });

  await test("failed command cannot be rewritten by owner", async () => {
    // Setup a failed command
    await assertSucceeds(owner3Db.ref("commands/dev3/cmdFail").set({
      commandId: "cmdFail",
      command: "MANUAL_FEED",
      issuedBy: "owner3",
      createdAt: 1790000000000,
      status: "queued"
    }));
    await assertSucceeds(esp32_3Db.ref("commands/dev3/cmdFail/status").set("acknowledged"));
    await assertSucceeds(esp32_3Db.ref("commands/dev3/cmdFail/status").set("failed"));
    
    // Owner tries to rewrite it to queued
    await assertFails(owner3Db.ref("commands/dev3/cmdFail/status").set("queued"));
    await assertFails(owner3Db.ref("commands/dev3/cmdFail").set({
      commandId: "cmdFail",
      command: "MANUAL_FEED",
      issuedBy: "owner3",
      createdAt: 1790000000000,
      status: "queued"
    }));
  });

  // ==========================================
  // SCHEDULES TESTS (5B.13 & 5B.14)
  // ==========================================
  
  await test("Schedules: owner can create valid schedule", async () => {
    await assertSucceeds(owner3Db.ref("schedules/dev3/sched_0").set({
      scheduleId: "sched_0",
      hour: 9,
      minute: 30,
      targetGrams: 250,
      enabled: true,
      daysOfWeek: [1,2,3,4,5,6,7]
    }));
  });

  await test("Schedules: owner cannot create invalid schedule (hour 25)", async () => {
    await assertFails(owner3Db.ref("schedules/dev3/sched_1").set({
      scheduleId: "sched_1",
      hour: 25,
      minute: 30,
      targetGrams: 250,
      enabled: true,
      daysOfWeek: [1]
    }));
  });

  await test("Schedules: owner cannot create invalid schedule (target > 1000 g per tray)", async () => {
    await assertFails(owner3Db.ref("schedules/dev3/sched_2").set({
      scheduleId: "sched_2",
      hour: 12,
      minute: 0,
      targetGrams: 1001,
      enabled: true,
      daysOfWeek: [1]
    }));
  });

  // R-54: the device writes a schedule edited on the onsite panel.
  const panelEdit = (extra = {}) => ({
    scheduleId: "sched_0", hour: 10, minute: 30, targetGrams: 50, enabled: true,
    daysOfWeek: [1, 2, 3, 4, 5, 6, 7], updatedBy: "panel", updatedAt: 1790000000000, ...extra,
  });

  await test("Schedules: device writes its own schedule edited on the panel (R-54)", async () => {
    await assertSucceeds(esp32_3Db.ref("schedules/dev3/sched_0").set(panelEdit()));
  });

  await test("Schedules: device writes are validated like the owner's", async () => {
    await assertFails(esp32_3Db.ref("schedules/dev3/sched_0").set(panelEdit({ hour: 25 })));
    await assertFails(esp32_3Db.ref("schedules/dev3/sched_0").set(panelEdit({ targetGrams: 1500 })));
    await assertFails(esp32_3Db.ref("schedules/dev3/sched_0").set(panelEdit({ updatedBy: "hacker" })));
    await assertFails(esp32_3Db.ref("schedules/dev3/sched_0").set(panelEdit({ updatedAt: "now" })));
    await assertFails(esp32_3Db.ref("schedules/dev3/sched_0").set({ hour: 10, minute: 30 }));
  });

  await test("Schedules: another device cannot write this device's schedules", async () => {
    await assertFails(esp32Db.ref("schedules/dev3/sched_0").set(panelEdit()));
  });

  await test("Schedules: the owner can still save over a panel edit", async () => {
    const { updatedBy, updatedAt, ...ownerSave } = panelEdit({ hour: 11 });
    await assertSucceeds(owner3Db.ref("schedules/dev3/sched_0").set(ownerSave));
  });

  await test("Schedules: unauthenticated cannot read schedules", async () => {
    await assertFails(unauthDb.ref("schedules/dev3").once("value"));
  });

  await test("Schedules: device can read schedules", async () => {
    await assertSucceeds(esp32_3Db.ref("schedules/dev3").once("value"));
  });

  // ==========================================
  // OWNER DEVICE DISCOVERY (Phase 2, APP-0)
  // The app finds owned devices with
  // query(ref('devices'), orderByChild('ownerId'), equalTo(uid)).
  // ==========================================

  await test("Device discovery: owner can query own devices by ownerId", async () => {
    const snap = await user2Db.ref("devices").orderByChild("ownerId").equalTo("owner2").once("value");
    if (!snap.child("dev2").exists()) throw new Error("Owner query did not return dev2");
    if (snap.child("dev3").exists()) throw new Error("Owner query returned another owner's device");
  });

  await test("Device discovery: owner cannot query another user's devices", async () => {
    await assertFails(user2Db.ref("devices").orderByChild("ownerId").equalTo("owner3").once("value"));
  });

  await test("Device discovery: owner cannot read the whole devices list", async () => {
    await assertFails(user2Db.ref("devices").once("value"));
  });

  await test("Device discovery: unauthenticated query denied", async () => {
    await assertFails(unauthDb.ref("devices").orderByChild("ownerId").equalTo("owner2").once("value"));
  });

  // ==========================================
  // STALE COMMAND FAILURE (Phase 2, RULES-1)
  // The ESP32 marks commands older than 5 min as failed straight from queued.
  // ==========================================

  const staleCommand = (id) => ({
    commandId: id,
    command: "MANUAL_FEED",
    issuedBy: "owner3",
    createdAt: 1790000000000,
    status: "queued"
  });

  await test("Stale command: device can move queued -> failed", async () => {
    await assertSucceeds(owner3Db.ref("commands/dev3/cmdStale1").set(staleCommand("cmdStale1")));
    await assertSucceeds(esp32_3Db.ref("commands/dev3/cmdStale1").update({ status: "failed", error: "STALE_COMMAND" }));
  });

  await test("Stale command: owner cannot move queued -> failed", async () => {
    await assertSucceeds(owner3Db.ref("commands/dev3/cmdStale2").set(staleCommand("cmdStale2")));
    await assertFails(owner3Db.ref("commands/dev3/cmdStale2/status").set("failed"));
  });

  await test("Stale command: another device cannot fail this device's command", async () => {
    await assertFails(esp32Db.ref("commands/dev3/cmdStale2/status").set("failed"));
  });

  await test("Stale command: queued cannot jump to completed", async () => {
    await assertFails(esp32_3Db.ref("commands/dev3/cmdStale2/status").set("completed"));
  });

  // ==========================================
  // ALERTS (R-23: resolution)
  // ==========================================
  const alertRecord = (name, extra = {}) => ({ eventId: name, name, timestamp: 1790000000000, resolved: false, ...extra });

  await test("Alerts: device can write a complete alert", async () => {
    await assertSucceeds(esp32_3Db.ref("alerts/dev3/LOW_FEED").set(alertRecord("LOW_FEED")));
  });

  await test("Alerts: device can mark its alert resolved with resolvedAt", async () => {
    await assertSucceeds(esp32_3Db.ref("alerts/dev3/LOW_FEED").update({ resolved: true, resolvedAt: 1790000060000 }));
  });

  await test("Alerts: a new occurrence (PUT) makes it active again and drops resolvedAt", async () => {
    await assertSucceeds(esp32_3Db.ref("alerts/dev3/LOW_FEED").set(alertRecord("LOW_FEED", { timestamp: 1790000120000 })));
  });

  await test("Alerts: device cannot create a partial alert (resolve of a missing alert)", async () => {
    await assertFails(esp32_3Db.ref("alerts/dev3/LOW_WATER").update({ resolved: true, resolvedAt: 1790000060000 }));
  });

  await test("Alerts: record key must match the alert name", async () => {
    await assertFails(esp32_3Db.ref("alerts/dev3/LOW_WATER").set(alertRecord("LOW_FEED")));
  });

  await test("Alerts: wrong types and unknown fields are rejected", async () => {
    await assertFails(esp32_3Db.ref("alerts/dev3/LOW_FEED").update({ resolved: "yes" }));
    await assertFails(esp32_3Db.ref("alerts/dev3/LOW_FEED").update({ note: "x" }));
  });

  await test("Alerts: owner can read but cannot resolve alerts", async () => {
    await assertSucceeds(owner3Db.ref("alerts/dev3").once("value"));
    await assertFails(owner3Db.ref("alerts/dev3/LOW_FEED").update({ resolved: true }));
  });

  await test("Alerts: device can read its own alert (resolve checks it is still active)", async () => {
    await assertSucceeds(esp32_3Db.ref("alerts/dev3/LOW_FEED/resolved").once("value"));
  });

  await test("Alerts: another device cannot read this device's alerts", async () => {
    await assertFails(esp32Db.ref("alerts/dev3/LOW_FEED").once("value"));
  });

  await test("Alerts: another device cannot write this device's alerts", async () => {
    await assertFails(esp32Db.ref("alerts/dev3/LOW_FEED").update({ resolved: true }));
  });

  // ==========================================
  // MEGA LINK HEALTH (R-24)
  // ==========================================
  await test("Mega link: device can report megaLinkOk", async () => {
    await assertSucceeds(esp32_3Db.ref("devices/dev3/megaLinkOk").set(false));
    await assertSucceeds(esp32_3Db.ref("devices/dev3/megaLinkOk").set(true));
  });

  await test("Mega link: megaLinkOk must be a boolean", async () => {
    await assertFails(esp32_3Db.ref("devices/dev3/megaLinkOk").set("down"));
  });

  await test("Mega link: owner and other devices cannot set megaLinkOk", async () => {
    await assertFails(owner3Db.ref("devices/dev3/megaLinkOk").set(true));
    await assertFails(esp32Db.ref("devices/dev3/megaLinkOk").set(true));
  });

  await test("Mega link: CONTROLLER_OFFLINE alert can be raised and resolved", async () => {
    await assertSucceeds(esp32_3Db.ref("alerts/dev3/CONTROLLER_OFFLINE").set({ eventId: "CONTROLLER_OFFLINE", name: "CONTROLLER_OFFLINE", timestamp: 1790000000000, resolved: false }));
    await assertSucceeds(esp32_3Db.ref("alerts/dev3/CONTROLLER_OFFLINE").update({ resolved: true, resolvedAt: 1790000030000 }));
  });

  // ==========================================
  // DEVICE CLOCK SOURCE (R-44)
  // ==========================================
  await test("Time source: state accepts NETWORK, RTC and INVALID", async () => {
    for (const ts of ["NETWORK", "RTC", "INVALID"]) {
      await assertSucceeds(esp32Db.ref("devices/dev2/state").set({ ...validState(), timeSource: ts }));
    }
  });

  await test("Time source: other values are rejected", async () => {
    await assertFails(esp32Db.ref("devices/dev2/state").set({ ...validState(), timeSource: "GPS" }));
    await assertFails(esp32Db.ref("devices/dev2/state").set({ ...validState(), timeSource: 1 }));
  });

  // ==========================================
  // DEVICE-CONFIRMED SCHEDULES (R-43)
  // ==========================================
  const applied = (extra = {}) => ({ hour: 7, minute: 0, targetGrams: 50, enabled: true, appliedAt: 1790000000000, ...extra });

  await test("Schedule status: device records what the Mega accepted", async () => {
    await assertSucceeds(esp32_3Db.ref("scheduleStatus/dev3/sched_0").set(applied()));
  });

  await test("Schedule status: owner can read it but cannot write (no faked confirmations)", async () => {
    await assertSucceeds(owner3Db.ref("scheduleStatus/dev3").once("value"));
    await assertFails(owner3Db.ref("scheduleStatus/dev3/sched_1").set(applied()));
  });

  await test("Schedule status: other devices and strangers are denied", async () => {
    await assertFails(esp32Db.ref("scheduleStatus/dev3/sched_0").set(applied()));
    await assertFails(user2Db.ref("scheduleStatus/dev3").once("value"));
  });

  await test("Schedule status: slot id, ranges and completeness are validated", async () => {
    await assertFails(esp32_3Db.ref("scheduleStatus/dev3/sched_3").set(applied()));
    await assertFails(esp32_3Db.ref("scheduleStatus/dev3/sched_0").set(applied({ targetGrams: 1500 })));
    await assertFails(esp32_3Db.ref("scheduleStatus/dev3/sched_0").set({ hour: 7, minute: 0 }));
    await assertFails(esp32_3Db.ref("scheduleStatus/dev3/sched_0").set(applied({ note: "x" })));
  });

  // ==========================================
  // DAILY SUMMARY (R-22)
  // ==========================================
  const summary = (extra = {}) => ({
    date: "2026-10-24", feedGrams: 1500, cyclesCompleted: 3, cyclesIncomplete: 0,
    trayTimeouts: 0, chainFaults: 0, lowWaterAlerts: 1, lowFeedAlerts: 0, emergencyStops: 0,
    updatedAt: 1790000000000, ...extra,
  });

  await test("Daily summary: device writes and replaces a day", async () => {
    await assertSucceeds(esp32_3Db.ref("dailySummary/dev3/2026-10-24").set(summary()));
    await assertSucceeds(esp32_3Db.ref("dailySummary/dev3/2026-10-24").set(summary({ feedGrams: 1750 })));
  });

  await test("Daily summary: owner can read a month range but cannot write", async () => {
    await assertSucceeds(owner3Db.ref("dailySummary/dev3").orderByKey().startAt("2026-10-01").endAt("2026-10-31").once("value"));
    await assertFails(owner3Db.ref("dailySummary/dev3/2026-10-25").set(summary({ date: "2026-10-25" })));
  });

  await test("Daily summary: other devices and strangers are denied", async () => {
    await assertFails(esp32Db.ref("dailySummary/dev3/2026-10-24").set(summary()));
    await assertFails(user2Db.ref("dailySummary/dev3").once("value"));
  });

  await test("Daily summary: date key, counts and completeness are validated", async () => {
    await assertFails(esp32_3Db.ref("dailySummary/dev3/24-10-2026").set(summary({ date: "24-10-2026" })));
    await assertFails(esp32_3Db.ref("dailySummary/dev3/2026-10-24").set(summary({ date: "2026-10-23" })));
    await assertFails(esp32_3Db.ref("dailySummary/dev3/2026-10-24").set(summary({ feedGrams: -5 })));
    await assertFails(esp32_3Db.ref("dailySummary/dev3/2026-10-24").set(summary({ cyclesCompleted: "3" })));
    await assertFails(esp32_3Db.ref("dailySummary/dev3/2026-10-24").set({ date: "2026-10-24", feedGrams: 10 }));
    await assertFails(esp32_3Db.ref("dailySummary/dev3/2026-10-24").set(summary({ note: "x" })));
  });

  console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
