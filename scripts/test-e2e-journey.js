const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, connectAuthEmulator } = require('firebase/auth');
const { getDatabase, ref, set, get, update, connectDatabaseEmulator } = require('firebase/database');

const EMULATOR_HOST = "127.0.0.1";
const EMULATOR_AUTH_PORT = 9099;
const EMULATOR_RTDB_PORT = 9000;
const FIREBASE_PROJECT_ID = "hyfepoul-dev";

// Generate unique test credentials to ensure clean state
const testTimestamp = Date.now();
const OWNER_EMAIL = `e2e_user_${testTimestamp}@example.com`;
const OWNER_PASSWORD = "password123";
const DEVICE_ID = `E2E_DEV_${testTimestamp}`;
const DEVICE_PIN = "123456";
const DEVICE_EMAIL = `device_${DEVICE_ID}@hyfepoul.local`;
const DEVICE_PASSWORD = "devicepassword";

// App 1: Owner Application
const appOwner = initializeApp({
  apiKey: "fake-api-key",
  authDomain: `${FIREBASE_PROJECT_ID}.firebaseapp.com`,
  databaseURL: `http://${EMULATOR_HOST}:${EMULATOR_RTDB_PORT}/?ns=${FIREBASE_PROJECT_ID}-default-rtdb`,
  projectId: FIREBASE_PROJECT_ID,
}, "OwnerApp");
const authOwner = getAuth(appOwner);
const dbOwner = getDatabase(appOwner);
connectAuthEmulator(authOwner, `http://${EMULATOR_HOST}:${EMULATOR_AUTH_PORT}`);
connectDatabaseEmulator(dbOwner, EMULATOR_HOST, EMULATOR_RTDB_PORT);

// App 2: Device Simulator
const appDevice = initializeApp({
  apiKey: "fake-api-key",
  authDomain: `${FIREBASE_PROJECT_ID}.firebaseapp.com`,
  databaseURL: `http://${EMULATOR_HOST}:${EMULATOR_RTDB_PORT}/?ns=${FIREBASE_PROJECT_ID}-default-rtdb`,
  projectId: FIREBASE_PROJECT_ID,
}, "DeviceApp");
const authDevice = getAuth(appDevice);
const dbDevice = getDatabase(appDevice);
connectAuthEmulator(authDevice, `http://${EMULATOR_HOST}:${EMULATOR_AUTH_PORT}`);
connectDatabaseEmulator(dbDevice, EMULATOR_HOST, EMULATOR_RTDB_PORT);

// Helper to do admin RTDB writes via REST
async function adminPut(path, data) {
  const url = `http://${EMULATOR_HOST}:${EMULATOR_RTDB_PORT}/${path}.json?ns=${FIREBASE_PROJECT_ID}-default-rtdb`;
  const res = await fetch(url, {
    method: 'PUT',
    // In emulator, we can bypass rules by not providing auth, or providing a mocked admin token if needed.
    // Actually, to bypass rules, we can append `disableAuth=true` or just rely on REST backdoor if open.
    // Let's use `Authorization: Bearer owner` as used in other scripts.
    headers: { 'Authorization': 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error("Admin inject failed: " + await res.text());
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runE2E() {
  console.log("======================================");
  console.log("E2E COMPLETE USER JOURNEY TEST");
  console.log("======================================");

  let ownerUid;
  let deviceUid;

  try {
    // --------------------------------------------------
    // PRE-PROVISION DEVICE (Admin)
    // --------------------------------------------------
    console.log("\n[Admin] Pre-provisioning device credentials...");
    // Create device user via standard client auth
    const devRecord = await createUserWithEmailAndPassword(authDevice, DEVICE_EMAIL, DEVICE_PASSWORD);
    deviceUid = devRecord.user.uid;
    // Sign out to clear device app session so it's fresh for later
    await authDevice.signOut();

    await adminPut(`deviceSecrets/${DEVICE_ID}`, {
      setupPin: DEVICE_PIN,
      deviceAuthUid: deviceUid
    });
    await adminPut(`devices/${DEVICE_ID}/deviceAuthUid`, deviceUid);
    console.log("[Admin] Success.");

    // --------------------------------------------------
    // 1. REGISTER & LOGIN
    // --------------------------------------------------
    console.log("\n[Owner] Registering new user...");
    const userCred = await createUserWithEmailAndPassword(authOwner, OWNER_EMAIL, OWNER_PASSWORD);
    ownerUid = userCred.user.uid;
    console.log(`[Owner] Registered successfully (UID: ${ownerUid})`);

    console.log("[Owner] Logging in...");
    await signInWithEmailAndPassword(authOwner, OWNER_EMAIL, OWNER_PASSWORD);
    console.log("[Owner] Login successful.");

    // --------------------------------------------------
    // 2. CLAIM DEVICE
    // --------------------------------------------------
    console.log("\n[Owner] Claiming device...");
    await set(ref(dbOwner, `claimRequests/${DEVICE_ID}`), {
      uid: ownerUid,
      pin: DEVICE_PIN,
      timestamp: Date.now()
    });
    
    // Wait for mock cloud function / rules to allow establishment
    // Since we are simulating the client, we establish ownership directly as allowed by rules
    // Rule for ownerId: "auth != null && data.val() == null && root.child('claimRequests').child($deviceId).child('uid').val() === auth.uid && newData.val() === auth.uid"
    // So we just set ownerId specifically!
    await set(ref(dbOwner, `devices/${DEVICE_ID}/ownerId`), ownerUid);
    console.log("[Owner] Device claimed successfully.");

    // --------------------------------------------------
    // 3. DEVICE LOGIN & STATE APPEARS
    // --------------------------------------------------
    console.log("\n[Device] Logging in...");
    await signInWithEmailAndPassword(authDevice, DEVICE_EMAIL, DEVICE_PASSWORD);
    console.log("[Device] Login successful.");

    console.log("[Device] Publishing state...");
    const stateUpdate = {
      status: "online",
      lastHeartbeat: Date.now(),
      state: {
        timestamp: Date.now(),
        feedWeightGrams: 250,
        hopperLevelPercent: 50,
        waterLow: false,
        trayWeightsGrams: [50, 50, 50, 50, 50],
        cycleStep: "IDLE",
        currentTray: 0,
        feedingActive: false,
        emergencyStopActive: false,
        targetFeedGrams: 50
      }
    };
    await update(ref(dbDevice, `devices/${DEVICE_ID}`), stateUpdate);
    console.log("[Device] State published.");

    // Verify Owner can read it (DASHBOARD UPDATES)
    const ownerRead = await get(ref(dbOwner, `devices/${DEVICE_ID}`));
    if (!ownerRead.exists() || ownerRead.val().status !== "online") {
      throw new Error("Owner failed to read updated device state.");
    }
    console.log("[Owner] Dashboard successfully read device state.");

    // --------------------------------------------------
    // 4. CREATE FEEDING SCHEDULE
    // --------------------------------------------------
    console.log("\n[Owner] Creating feeding schedule...");
    await set(ref(dbOwner, `schedules/${DEVICE_ID}/sched_0`), {
      scheduleId: 'sched_0',
      hour: 8,
      minute: 30,
      targetGrams: 150,
      enabled: true,
      daysOfWeek: [1,2,3,4,5,6,7]
    });
    console.log("[Owner] Schedule created.");

    // --------------------------------------------------
    // 5. SEND MANUAL FEED COMMAND
    // --------------------------------------------------
    console.log("\n[Owner] Sending MANUAL_FEED command...");
    const commandId = `cmd_${Date.now()}`;
    await set(ref(dbOwner, `commands/${DEVICE_ID}/${commandId}`), {
      commandId: commandId,
      command: "MANUAL_FEED",
      parameters: { targetGrams: 200 },
      issuedBy: ownerUid,
      createdAt: Date.now(),
      status: "queued"
    });
    console.log("[Owner] Command QUEUED.");

    // --------------------------------------------------
    // 6. DEVICE ACKNOWLEDGES & EXECUTES
    // --------------------------------------------------
    console.log("\n[Device] Reading command and updating status...");
    await update(ref(dbDevice, `commands/${DEVICE_ID}/${commandId}`), {
      status: "acknowledged",
      acknowledgedAt: Date.now()
    });
    console.log("[Device] Command ACKNOWLEDGED.");

    await update(ref(dbDevice, `commands/${DEVICE_ID}/${commandId}`), {
      status: "executing"
    });
    console.log("[Device] Command EXECUTING.");

    await update(ref(dbDevice, `commands/${DEVICE_ID}/${commandId}`), {
      status: "completed",
      completedAt: Date.now()
    });
    console.log("[Device] Command COMPLETED.");

    // --------------------------------------------------
    // 7. GENERATE ALERT
    // --------------------------------------------------
    console.log("\n[Device] Generating LOW_WATER alert...");
    const alertId = `alert_${Date.now()}`;
    await set(ref(dbDevice, `alerts/${DEVICE_ID}/${alertId}`), {
      eventId: "LOW_WATER",
      name: "Water level is low",
      timestamp: Date.now(),
      resolved: false
    });
    console.log("[Device] Alert generated.");

    // Verify Owner can read alert
    const alertRead = await get(ref(dbOwner, `alerts/${DEVICE_ID}/${alertId}`));
    if (!alertRead.exists()) throw new Error("Owner failed to read alert.");
    console.log("[Owner] Alert appears in Notifications.");

    // --------------------------------------------------
    // 8. GENERATE HISTORY (System Data)
    // --------------------------------------------------
    console.log("\n[Device] Pushing system data to history...");
    const pushId = `push_${Date.now()}`;
    await set(ref(dbDevice, `systemData/${DEVICE_ID}/${pushId}`), {
      timestamp: Date.now(),
      feedWeightGrams: 250,
      hopperLevelPercent: 50,
      waterLow: true,
      trayWeightsGrams: [50, 50, 50, 50, 50],
      cycleStep: "IDLE",
      currentTray: 0,
      feedingActive: false,
      emergencyStopActive: false,
      targetFeedGrams: 50
    });
    console.log("[Device] History written.");

    // Verify Owner can read history
    const historyRead = await get(ref(dbOwner, `systemData/${DEVICE_ID}/${pushId}`));
    if (!historyRead.exists()) throw new Error("Owner failed to read history.");
    console.log("[Owner] System data appears in History.");

    // --------------------------------------------------
    // 9. SIGN OUT
    // --------------------------------------------------
    console.log("\n[Owner] Signing out...");
    await authOwner.signOut();
    console.log("[Owner] Sign out successful.");

    console.log("\n======================================");
    console.log("ALL E2E WORKFLOW TESTS PASSED.");
    console.log("======================================");
    process.exit(0);
  } catch (error) {
    console.error("\n[!] E2E TEST FAILED:", error);
    process.exit(1);
  }
}

runE2E();
