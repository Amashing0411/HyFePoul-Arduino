const fs = require('fs');

const API_KEY = "dummy-api-key";
const EMULATOR_HOST = "127.0.0.1";
const EMULATOR_AUTH_PORT = 9099;
const EMULATOR_RTDB_PORT = 9000;
const PROJECT_ID = "hyfepoul-dev";
const NAMESPACE = `${PROJECT_ID}-default-rtdb`;

const DEVICE_EMAIL = "esp32-sim@test.com";
const DEVICE_PASSWORD = "esp32_secret_password";
const DEVICE_ID = "device-002"; // Let's simulate a brand new device! Or device-001.

let idToken = "";
let deviceAuthUid = "";

async function setup() {
  console.log("Setting up simulation...");
  // 1. We must pre-create the device auth user in the emulator using Admin SDK or just Auth API?
  // We can just try to sign up, and if it exists, sign in.
  let res = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_AUTH_PORT}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEVICE_EMAIL, password: DEVICE_PASSWORD, returnSecureToken: true })
  });
  
  if (res.status === 400) {
    const data = await res.json();
    if (data.error.message === 'EMAIL_EXISTS') {
      console.log("ESP32 Auth user exists. Signing in...");
      res = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_AUTH_PORT}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: DEVICE_EMAIL, password: DEVICE_PASSWORD, returnSecureToken: true })
      });
    } else {
      throw new Error(`Auth Error: ${data.error.message}`);
    }
  }

  const authData = await res.json();
  if (!authData.idToken) throw new Error("Failed to get ID token");
  
  idToken = authData.idToken;
  deviceAuthUid = authData.localId;
  console.log(`[ESP32] Authenticated successfully. deviceAuthUid: ${deviceAuthUid}`);

  // 2. We must bypass rules to assign this deviceAuthUid to the device in RTDB,
  // because only the owner or admin can assign deviceAuthUid initially?
  // Wait, let's look at the database.rules.json:
  // "deviceAuthUid": { ".write": false }
  // Oh, deviceAuthUid is READ-ONLY to clients! That means a Cloud Function or Admin script MUST provision it!
  // The ESP32 CANNOT set its own deviceAuthUid!
  console.log(`[Admin] Provisioning deviceAuthUid into RTDB...`);
  const adminUrl = `http://${EMULATOR_HOST}:${EMULATOR_RTDB_PORT}/devices/${DEVICE_ID}/deviceAuthUid.json?ns=${NAMESPACE}`;
  await fetch(adminUrl, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify(deviceAuthUid)
  });
}

function getDbUrl(path) {
  return `http://${EMULATOR_HOST}:${EMULATOR_RTDB_PORT}/${path}?ns=${NAMESPACE}&auth=${idToken}`;
}

async function simulate() {
  await setup();

  const timestamp = Date.now();

  console.log(`[ESP32] Sending Heartbeat (status='online', lastHeartbeat=${timestamp})...`);
  let res = await fetch(getDbUrl(`devices/${DEVICE_ID}/status.json`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify("online")
  });
  if (res.status !== 200) throw new Error(`Status write failed: ${await res.text()}`);

  res = await fetch(getDbUrl(`devices/${DEVICE_ID}/lastHeartbeat.json`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(timestamp)
  });
  if (res.status !== 200) throw new Error(`Heartbeat write failed: ${await res.text()}`);

  const statePayload = {
    feedWeightGrams: 250,
    targetFeedGrams: 0,
    hopperLevelPercent: 75,
    waterLow: false,
    waterHigh: true,
    pumpActive: false,
    feedingActive: false,
    emergencyStopActive: false,
    timestamp: timestamp
  };

  console.log(`[ESP32] Pushing State update...`);
  res = await fetch(getDbUrl(`devices/${DEVICE_ID}/state.json`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(statePayload)
  });
  if (res.status !== 200) throw new Error(`State write failed: ${await res.text()}`);

  console.log(`[ESP32] Pushing SystemData (history) record...`);
  res = await fetch(getDbUrl(`systemData/${DEVICE_ID}.json`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(statePayload)
  });
  if (res.status !== 200) throw new Error(`History write failed: ${await res.text()}`);

  console.log(`[ESP32] Pushing Alert EVENT|LOW_FEED...`);
  const alertPayload = {
    eventId: timestamp.toString(),
    name: "LOW_FEED",
    timestamp: timestamp,
    resolved: false
  };
  res = await fetch(getDbUrl(`alerts/${DEVICE_ID}.json`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(alertPayload)
  });
  if (res.status !== 200) throw new Error(`Alert write failed: ${await res.text()}`);

  console.log("======================================");
  console.log("ESP32 SIMULATION SUCCESSFUL!");
  console.log("======================================");
}

simulate().catch(err => {
  console.error(err);
  process.exit(1);
});
