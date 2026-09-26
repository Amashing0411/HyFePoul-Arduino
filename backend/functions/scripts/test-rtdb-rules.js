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
    await assertFails(esp32Db.ref("devices/dev1/state/pumpActive").set(true));
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

  await test("Data Validation: ESP32 can write state with correct types", async () => {
    await assertSucceeds(esp32Db.ref("devices/dev2/state").set({
      feedWeightGrams: 500,
      targetFeedGrams: 1000,
      hopperLevelPercent: 50,
      waterLow: false,
      waterHigh: true,
      pumpActive: false,
      feedingActive: true,
      emergencyStopActive: false,
      timestamp: 1690000000
    }));
  });

  await test("Data Validation: ESP32 cannot write state with wrong types", async () => {
    await assertFails(esp32Db.ref("devices/dev2/state").set({
      feedWeightGrams: "five hundred", // String instead of number
      targetFeedGrams: 1000,
      hopperLevelPercent: 50,
      waterLow: false,
      waterHigh: true,
      pumpActive: false,
      feedingActive: true,
      emergencyStopActive: false,
      timestamp: 1690000000
    }));
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

  console.log(`\nTests finished: ${passed} passed, ${failed} failed.`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests();
