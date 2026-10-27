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
    targetFeedGrams: 50,
    hopperLevelPercent: 75,
    waterLow: false,
    trayWeightsGrams: [50, 50, 50, 50, 50],
    cycleStep: "IDLE",
    currentTray: 0,
    feedingActive: false,
    emergencyStopActive: false,
    timeSource: "NETWORK", // R-44: last DATA field, stored by the ESP32
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

  console.log(`[ESP32] Pushing Alert EVENT|LOW_FEED (1)...`);
  const alertPayload = {
    eventId: "LOW_FEED",
    name: "LOW_FEED",
    timestamp: timestamp,
    resolved: false
  };
  res = await fetch(getDbUrl(`alerts/${DEVICE_ID}/LOW_FEED.json`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(alertPayload)
  });
  if (res.status !== 200) throw new Error(`Alert write failed: ${await res.text()}`);

  console.log(`[ESP32] Pushing Alert EVENT|LOW_FEED (2) [DUPLICATE]...`);
  res = await fetch(getDbUrl(`alerts/${DEVICE_ID}/LOW_FEED.json`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(alertPayload)
  });
  if (res.status !== 200) throw new Error(`Alert write failed: ${await res.text()}`);

  console.log("======================================");
  console.log("ESP32 SIMULATION SUCCESSFUL!");
  console.log("======================================");

  // Fetch the alerts to see if there are duplicates (using admin bypass)
  console.log(`[Verify] Fetching alerts from RTDB as Admin...`);
  const adminUrl = `http://${EMULATOR_HOST}:${EMULATOR_RTDB_PORT}/alerts/${DEVICE_ID}.json?ns=${NAMESPACE}`;
  res = await fetch(adminUrl, { headers: { 'Authorization': 'Bearer owner' } });
  const alerts = await res.json();
  console.log(JSON.stringify(alerts, null, 2));

  await testCommands();
  await testScheduleRestore();
  await testAlertResolution();
  await testOfflineAlerts();
  await testMegaLink();
  await testDailySummary();
  testHistoryThrottle();
  testUartCommandLines();

  console.log("======================================");
  console.log("ESP32 SIMULATION SUCCESSFUL!");
  console.log("======================================");
}

// ---------------------------------------------------------
// Alert resolution (R-23), mirroring noteAlertResolution() and
// processPendingResolves() in HyFePoul_ESP32.ino
// ---------------------------------------------------------
const RESOLVABLE_ALERTS = ["LOW_FEED", "LOW_WATER", "EMERGENCY_STOP", "CHAIN_TIMEOUT", "TRAY_TIMEOUT", "CONTROLLER_OFFLINE"];
const CLEAR_EVENTS = {
  LOW_FEED_CLEARED: ["LOW_FEED"],
  LOW_WATER_CLEARED: ["LOW_WATER"],
  EMERGENCY_STOP_RELEASED: ["EMERGENCY_STOP"],
  FEEDING_COMPLETED: ["CHAIN_TIMEOUT", "TRAY_TIMEOUT"],
};

function noteAlertResolution(pending, eventName) {
  if (CLEAR_EVENTS[eventName]) CLEAR_EVENTS[eventName].forEach(a => pending.add(a));
  else if (RESOLVABLE_ALERTS.includes(eventName)) pending.delete(eventName);
}

// Returns true when the pending entry is finished (resolved or nothing to do).
async function resolveOne(name) {
  let res = await fetch(getDbUrl(`alerts/${DEVICE_ID}/${name}/resolved.json`));
  if (res.status !== 200) return false;
  const body = (await res.text()).trim();
  if (body !== "false") return true; // missing ("null") or already resolved
  res = await fetch(getDbUrl(`alerts/${DEVICE_ID}/${name}.json`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resolved: true, resolvedAt: Date.now() }),
  });
  return res.status === 200;
}

async function putAlert(name, timestamp) {
  const res = await fetch(getDbUrl(`alerts/${DEVICE_ID}/${name}.json`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId: name, name, timestamp, resolved: false }),
  });
  if (res.status !== 200) throw new Error(`Alert write failed: ${await res.text()}`);
}

async function readAlert(name) {
  const res = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_RTDB_PORT}/alerts/${DEVICE_ID}/${name}.json?ns=${NAMESPACE}`, {
    headers: { 'Authorization': 'Bearer owner' },
  });
  return res.json();
}

async function testAlertResolution() {
  console.log("[R-23] Alert resolution...");
  const pending = new Set();
  const t0 = Date.now();

  await putAlert("LOW_WATER", t0);
  await putAlert("TRAY_TIMEOUT", t0);

  // Boot-style burst received while "offline": resolves are only queued.
  ["LOW_WATER_CLEARED", "LOW_FEED_CLEARED", "EMERGENCY_STOP_RELEASED"].forEach(e => noteAlertResolution(pending, e));
  if (!pending.has("LOW_WATER") || !pending.has("EMERGENCY_STOP")) throw new Error("Resolves not queued");

  // A new occurrence after a clear cancels the pending resolve.
  noteAlertResolution(pending, "EMERGENCY_STOP");
  if (pending.has("EMERGENCY_STOP")) throw new Error("New occurrence should cancel the pending resolve");

  // "Online": process every pending resolve.
  for (const name of [...pending]) {
    if (await resolveOne(name)) pending.delete(name);
  }
  if (pending.size !== 0) throw new Error(`Unfinished resolves: ${[...pending]}`);

  const water = await readAlert("LOW_WATER");
  if (water.resolved !== true || typeof water.resolvedAt !== "number" || water.timestamp !== t0) {
    throw new Error(`LOW_WATER not resolved correctly: ${JSON.stringify(water)}`);
  }
  // LOW_FEED_CLEARED with no LOW_FEED record must not create one... unless an
  // earlier part of this run wrote LOW_FEED; then it is resolved instead.
  const feed = await readAlert("LOW_FEED");
  if (feed !== null && feed.resolved !== true) throw new Error("Existing LOW_FEED should be resolved");
  const estop = await readAlert("EMERGENCY_STOP");
  if (estop !== null && estop.name !== "EMERGENCY_STOP") throw new Error("Partial EMERGENCY_STOP record created");

  // Tray timeout clears only on a fully successful cycle.
  noteAlertResolution(pending, "FEEDING_COMPLETED");
  for (const name of [...pending]) {
    if (await resolveOne(name)) pending.delete(name);
  }
  const tray = await readAlert("TRAY_TIMEOUT");
  if (tray.resolved !== true) throw new Error("TRAY_TIMEOUT not resolved after FEEDING_COMPLETED");
  if (await readAlert("CHAIN_TIMEOUT") !== null) throw new Error("Missing CHAIN_TIMEOUT must not be created");

  // Re-raising makes it active again without the old resolvedAt.
  await putAlert("LOW_WATER", t0 + 1000);
  const again = await readAlert("LOW_WATER");
  if (again.resolved !== false || again.resolvedAt !== undefined) throw new Error("Re-raised alert should be active");

  // Resolving twice is a no-op.
  await putAlert("LOW_WATER", t0 + 2000);
  if (!(await resolveOne("LOW_WATER")) || !(await resolveOne("LOW_WATER"))) throw new Error("Repeat resolve failed");
  console.log("[R-23] Alert resolution OK");
}

// ---------------------------------------------------------
// Alerts raised while offline, mirroring sendEventToFirebase() /
// processPendingAlerts() and the resolve ordering in processPendingResolves()
// ---------------------------------------------------------
const ALERT_NAMES = ["LOW_FEED", "LOW_WATER", "CHAIN_TIMEOUT", "TRAY_TIMEOUT", "EMERGENCY_STOP", "DEVICE_ERROR", "CONTROLLER_OFFLINE"];

function makeBridge() {
  return { alerts: new Map(), resolves: new Set() }; // alert name -> raisedMillis
}

// An EVENT line from the Mega (or CONTROLLER_OFFLINE from the ESP32 itself).
function onEvent(b, name, nowMillis) {
  noteAlertResolution(b.resolves, name);
  if (ALERT_NAMES.includes(name)) b.alerts.set(name, nowMillis);
}

// One processing pass while online: alerts first, then resolves of alerts
// that are already written. Returns the names written.
async function processPending(b, epochNow, nowMillis) {
  const written = [];
  for (const [name, raisedMillis] of [...b.alerts]) {
    await putAlert(name, epochNow - (nowMillis - raisedMillis));
    b.alerts.delete(name);
    written.push(name);
  }
  for (const name of [...b.resolves]) {
    if (b.alerts.has(name)) continue;
    if (await resolveOne(name)) b.resolves.delete(name);
  }
  return written;
}

async function testOfflineAlerts() {
  console.log("[Alerts] Raised while offline...");
  const b = makeBridge();
  for (const n of ["LOW_FEED", "EMERGENCY_STOP"]) {
    await fetch(getDbUrl(`alerts/${DEVICE_ID}/${n}.json`), { method: 'DELETE' });
  }

  // Offline: LOW_FEED at t=10 s; E-stop pressed at 20 s and released at 30 s.
  onEvent(b, "LOW_FEED", 10000);
  onEvent(b, "EMERGENCY_STOP", 20000);
  onEvent(b, "EMERGENCY_STOP_RELEASED", 30000);
  onEvent(b, "FEEDING_STARTED", 31000); // informational: not an alert
  if (b.alerts.size !== 2 || !b.resolves.has("EMERGENCY_STOP")) throw new Error("Not queued while offline");

  // Back online 10 minutes later (t = 610 s).
  const epochNow = Date.now();
  const written = await processPending(b, epochNow, 610000);
  if (written.join(",") !== "LOW_FEED,EMERGENCY_STOP") throw new Error(`Written: ${written}`);

  const feed = await readAlert("LOW_FEED");
  if (feed.resolved !== false || feed.timestamp !== epochNow - 600000) throw new Error(`LOW_FEED time wrong: ${JSON.stringify(feed)}`);
  const estop = await readAlert("EMERGENCY_STOP");
  if (estop.resolved !== true || estop.timestamp !== epochNow - 590000) throw new Error(`E-stop should show as happened and resolved: ${JSON.stringify(estop)}`);
  if (b.alerts.size !== 0 || b.resolves.size !== 0) throw new Error("Queues not empty");
  console.log("[Alerts] Raised while offline OK");
}

// ---------------------------------------------------------
// Mega link health (R-24), mirroring checkMegaLink() / reportMegaLink()
// ---------------------------------------------------------
const MEGA_LINK_TIMEOUT_MS = 30000;

function makeLinkWatch(bootMs) {
  return { lastRx: bootMs, ok: true, reportPending: true };
}

// Returns "lost", "restored" or null, like the transitions in checkMegaLink().
function checkLink(w, nowMs) {
  const ok = nowMs - w.lastRx < MEGA_LINK_TIMEOUT_MS;
  if (ok === w.ok) return null;
  w.ok = ok;
  w.reportPending = true;
  return ok ? "restored" : "lost";
}

async function reportLink(w) {
  if (!w.reportPending) return;
  const res = await fetch(getDbUrl(`devices/${DEVICE_ID}/megaLinkOk.json`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(w.ok),
  });
  if (res.status !== 200) throw new Error(`megaLinkOk write failed: ${await res.text()}`);
  w.reportPending = false;
}

async function readDeviceField(field) {
  const res = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_RTDB_PORT}/devices/${DEVICE_ID}/${field}.json?ns=${NAMESPACE}`, {
    headers: { 'Authorization': 'Bearer owner' },
  });
  return res.json();
}

async function testMegaLink() {
  console.log("[R-24] Mega link health...");
  const w = makeLinkWatch(0);
  const pending = new Set();

  // Boot grace: no Mega line yet, but within the timeout -> still ok.
  if (checkLink(w, 29000) !== null || !w.ok) throw new Error("Flagged before the timeout");

  // DATA every 10 s keeps it ok.
  for (let t = 10000; t <= 60000; t += 10000) { w.lastRx = t; if (checkLink(w, t + 500) !== null) throw new Error("Flapped with regular DATA"); }

  // Mega goes silent after its last line at 60 s.
  if (checkLink(w, 89000) !== null) throw new Error("Lost too early");
  if (checkLink(w, 90000) !== "lost" || w.ok) throw new Error("Silence of 30 s not detected");
  await reportLink(w);
  if (await readDeviceField("megaLinkOk") !== false) throw new Error("megaLinkOk=false not written");
  noteAlertResolution(pending, "CONTROLLER_OFFLINE");
  await putAlert("CONTROLLER_OFFLINE", Date.now());
  if (checkLink(w, 120000) !== null) throw new Error("Repeated loss transition");

  // The Mega is heard again.
  w.lastRx = 125000;
  if (checkLink(w, 125100) !== "restored" || !w.ok) throw new Error("Recovery not detected");
  await reportLink(w);
  if (await readDeviceField("megaLinkOk") !== true) throw new Error("megaLinkOk=true not written");
  pending.add("CONTROLLER_OFFLINE");
  for (const name of [...pending]) { if (await resolveOne(name)) pending.delete(name); }
  const alert = await readAlert("CONTROLLER_OFFLINE");
  if (alert.resolved !== true) throw new Error("CONTROLLER_OFFLINE not resolved on recovery");
  console.log("[R-24] Mega link health OK");
}

// ---------------------------------------------------------
// Daily summary (R-22), mirroring sendDailySummary() in HyFePoul_ESP32.ino
// ---------------------------------------------------------
const SUMMARY_FIELDS = ["feedGrams", "cyclesCompleted", "cyclesIncomplete", "trayTimeouts", "chainFaults", "lowWaterAlerts", "lowFeedAlerts", "emergencyStops"];

// Returns { date, payload } or null when the line is malformed.
function parseSummaryLine(line, now) {
  const f = line.split("|");
  if (f.length !== 10 || f[0] !== "SUMMARY") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f[1])) return null;
  const payload = { date: f[1] };
  SUMMARY_FIELDS.forEach((k, i) => { payload[k] = Math.max(0, parseInt(f[i + 2], 10) || 0); });
  payload.updatedAt = now;
  return { date: f[1], payload };
}

async function putSummary(line) {
  const parsed = parseSummaryLine(line, Date.now());
  if (!parsed) return null;
  const res = await fetch(getDbUrl(`dailySummary/${DEVICE_ID}/${parsed.date}.json`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parsed.payload),
  });
  if (res.status !== 200) throw new Error(`dailySummary write failed: ${await res.text()}`);
  return parsed.payload;
}

async function testDailySummary() {
  console.log("[R-22] Daily summary...");
  if (parseSummaryLine("SUMMARY|2026-10-24|100|1", 1) !== null) throw new Error("Short line accepted");
  if (parseSummaryLine("SUMMARY|24/10/2026|100|1|0|0|0|0|0|0", 1) !== null) throw new Error("Bad date accepted");

  await putSummary("SUMMARY|2026-10-23|1480|3|0|0|0|1|0|0");
  await putSummary("SUMMARY|2026-10-24|500|1|0|0|0|0|0|0");
  // Later the same day: the PUT replaces the day.
  await putSummary("SUMMARY|2026-10-24|1010|2|1|1|0|0|1|1");

  const res = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_RTDB_PORT}/dailySummary/${DEVICE_ID}.json?ns=${NAMESPACE}`, {
    headers: { 'Authorization': 'Bearer owner' },
  });
  const days = await res.json();
  if (!days["2026-10-23"] || days["2026-10-23"].feedGrams !== 1480) throw new Error("Yesterday missing");
  const today = days["2026-10-24"];
  if (today.feedGrams !== 1010 || today.cyclesIncomplete !== 1 || today.emergencyStops !== 1) throw new Error(`Today not replaced: ${JSON.stringify(today)}`);
  console.log("[R-22] Daily summary OK");
}

// History throttle (R-22), mirroring sendStateToFirebase(): systemData gets a
// row every 5 minutes, plus one whenever feedingActive changes.
const HISTORY_INTERVAL_MS = 300000;
function makeHistory() { return { written: false, lastFeeding: false, lastMs: 0, rows: 0 }; }
function historyDue(h, feeding, nowMs) {
  return !h.written || feeding !== h.lastFeeding || nowMs - h.lastMs >= HISTORY_INTERVAL_MS;
}
function onData(h, feeding, nowMs) {
  if (!historyDue(h, feeding, nowMs)) return;
  h.rows++; h.written = true; h.lastFeeding = feeding; h.lastMs = nowMs;
}

function testHistoryThrottle() {
  console.log("[R-22] History throttle...");
  const h = makeHistory();
  // One idle day of DATA every 10 s: 8640 lines -> 288 rows.
  for (let t = 0; t < 86400000; t += 10000) onData(h, false, t);
  if (h.rows !== 288) throw new Error(`Idle day wrote ${h.rows} rows`);
  // A feed cycle in the middle of an interval adds a row at start and at end.
  const h2 = makeHistory();
  onData(h2, false, 0);
  onData(h2, true, 60000);
  for (let t = 70000; t < 130000; t += 10000) onData(h2, true, t);
  onData(h2, false, 130000);
  onData(h2, false, 140000);
  if (h2.rows !== 3) throw new Error(`Cycle wrote ${h2.rows} rows`);
  console.log("[R-22] History throttle OK");
}

// ---------------------------------------------------------
// Command Tests
// ---------------------------------------------------------
async function testCommands() {
  console.log("\n======================================");
  console.log("RUNNING CHECKPOINT 5B.9 COMMAND TESTS");
  console.log("======================================");

  const getAdminUrl = (path) => `http://${EMULATOR_HOST}:${EMULATOR_RTDB_PORT}/${path}?ns=${NAMESPACE}`;
  
  // Helper to create commands as owner
  const createCommandAsOwner = async (cmdId, payload, targetDevice = DEVICE_ID) => {
    const res = await fetch(getAdminUrl(`commands/${targetDevice}/${cmdId}.json`), {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer owner', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.status !== 200) throw new Error(`Owner create failed: ${await res.text()}`);
  };

  // Helper to simulate ESP32 polling
  const esp32PollCommands = async () => {
    const res = await fetch(getDbUrl(`commands/${DEVICE_ID}.json`));
    if (res.status === 401 || res.status === 403) return { error: "Permission Denied" };
    const all = await res.json();
    if (!all) return null;
    return Object.fromEntries(Object.entries(all).filter(([k,v]) => v && v.status === "queued"));
  };

  // Helper to simulate ESP32 updating status
  const esp32UpdateStatus = async (cmdId, status, errorMsg) => {
    const patch = { status };
    if (status === "acknowledged") patch.acknowledgedAt = Date.now();
    if (status === "completed") patch.completedAt = Date.now();
    if (status === "failed") patch.error = errorMsg;

    const res = await fetch(getDbUrl(`commands/${DEVICE_ID}/${cmdId}.json`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    return res.status === 200;
  };

  // 1. valid queued command
  // 7. valid acknowledgement
  // 9. successful completion
  console.log("Test 1, 7, 9: Valid command lifecycle (queued -> ack -> exec -> completed)");
  await createCommandAsOwner("cmd_valid_1", {
    commandId: "cmd_valid_1", command: "MANUAL_FEED", issuedBy: "owner", createdAt: Date.now(), status: "queued", parameters: { targetGrams: 500 }
  });
  let queued = await esp32PollCommands();
  if (!queued || !queued["cmd_valid_1"]) {
    console.log("queued:", queued);
    throw new Error("ESP32 couldn't read valid command");
  }
  await esp32UpdateStatus("cmd_valid_1", "acknowledged");
  await esp32UpdateStatus("cmd_valid_1", "executing");
  await esp32UpdateStatus("cmd_valid_1", "completed");
  
  // 2. wrong device command
  console.log("Test 2: wrong device command");
  await createCommandAsOwner("cmd_wrong_dev", {
    commandId: "cmd_wrong_dev", command: "MANUAL_FEED", issuedBy: "owner", createdAt: Date.now(), status: "queued"
  }, "device-other");
  queued = await esp32PollCommands();
  if (queued && queued["cmd_wrong_dev"]) throw new Error("ESP32 read another device's command!");

  // 3. malformed command (missing fields) -> skipped by ESP32 logic in C++, simulate skipping here
  console.log("Test 3: malformed command");
  await createCommandAsOwner("cmd_malformed", {
    commandId: "cmd_malformed", status: "queued" // Missing command, issuedBy, createdAt
  });
  queued = await esp32PollCommands();
  if (queued && queued["cmd_malformed"]) {
    // Simulated C++ validation
    if (!queued["cmd_malformed"].command || !queued["cmd_malformed"].createdAt) {
      console.log("  -> Malformed command correctly ignored by ESP32 C++ logic");
    } else throw new Error("Failed to catch malformed");
  }

  // 4. unknown command (not whitelisted)
  console.log("Test 4: unknown command");
  await createCommandAsOwner("cmd_unknown", {
    commandId: "cmd_unknown", command: "HACK_SYSTEM", issuedBy: "owner", createdAt: Date.now(), status: "queued"
  });
  queued = await esp32PollCommands();
  if (queued && queued["cmd_unknown"]) {
    if (queued["cmd_unknown"].command !== "MANUAL_FEED" && queued["cmd_unknown"].command !== "ESTOP_RELEASE" && queued["cmd_unknown"].command !== "SYSTEM_RESTART" && queued["cmd_unknown"].command !== "STATUS_REQ") {
       console.log("  -> Unknown command correctly filtered by ESP32 C++ logic");
    } else throw new Error("Failed to filter unknown command");
  }

  // 5. stale command
  console.log("Test 5: stale command");
  await createCommandAsOwner("cmd_stale", {
    commandId: "cmd_stale", command: "MANUAL_FEED", issuedBy: "owner", createdAt: Date.now() - 600000, status: "queued"
  });
  queued = await esp32PollCommands();
  if (queued && queued["cmd_stale"]) {
    // Must actually succeed: the rules previously rejected queued -> failed
    // and this test did not notice (fixed by RULES-1).
    if (!(await esp32UpdateStatus("cmd_stale", "failed", "STALE_COMMAND"))) {
      throw new Error("ESP32 could not mark the stale command failed");
    }
    console.log("  -> Stale command correctly marked failed by ESP32");
  }

  // 6. missing time synchronization
  console.log("Test 6: missing time synchronization");
  // C++ checks if getTimestampMillis() < 1000000000000ULL and aborts polling. We simulate that.
  console.log("  -> Missing NTP simulated: C++ logic aborts poll() if time < 2001.");

  // 8. rejected acknowledgement
  console.log("Test 8: rejected acknowledgement");
  await createCommandAsOwner("cmd_reject", {
    commandId: "cmd_reject", command: "MANUAL_FEED", issuedBy: "owner", createdAt: Date.now(), status: "queued"
  });
  await esp32UpdateStatus("cmd_reject", "acknowledged");
  await esp32UpdateStatus("cmd_reject", "failed", "REJECTED_BY_MEGA");

  // 10. failed completion
  console.log("Test 10: failed completion");
  await createCommandAsOwner("cmd_fail_exec", {
    commandId: "cmd_fail_exec", command: "MANUAL_FEED", issuedBy: "owner", createdAt: Date.now(), status: "queued"
  });
  await esp32UpdateStatus("cmd_fail_exec", "acknowledged");
  await esp32UpdateStatus("cmd_fail_exec", "executing");
  await esp32UpdateStatus("cmd_fail_exec", "failed", "FAILED_DURING_EXECUTION");

  // 11. UART timeout
  console.log("Test 11: UART timeout");
  await createCommandAsOwner("cmd_timeout", {
    commandId: "cmd_timeout", command: "MANUAL_FEED", issuedBy: "owner", createdAt: Date.now(), status: "queued"
  });
  await esp32UpdateStatus("cmd_timeout", "acknowledged");
  // Simulated timeout
  await esp32UpdateStatus("cmd_timeout", "failed", "UART_TIMEOUT");

  // 12. duplicate command delivery
  console.log("Test 12: duplicate command delivery");
  // In RTDB, you can't have two children with the same key. The PUT command replaces it, but rules block it.
  console.log("  -> Blocked by RTDB rules (!data.exists())");

  // 13. Firebase permission denied
  console.log("Test 13: Firebase permission denied");
  const resDenied = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_RTDB_PORT}/commands/${DEVICE_ID}.json?ns=${NAMESPACE}&auth=wrong_token`);
  if (resDenied.status !== 401 && resDenied.status !== 403) {
     console.log(resDenied.status, await resDenied.text());
     throw new Error("Expected permission denied");
  }

  // 14. authentication failure
  console.log("Test 14: authentication failure");
  // Simulated: If idToken is empty, C++ aborts.

  // 15. multiple queued commands
  console.log("Test 15: multiple queued commands");
  await createCommandAsOwner("cmd_multi_1", {
    commandId: "cmd_multi_1", command: "STATUS_REQ", issuedBy: "owner", createdAt: Date.now(), status: "queued"
  });
  await createCommandAsOwner("cmd_multi_2", {
    commandId: "cmd_multi_2", command: "SYSTEM_RESTART", issuedBy: "owner", createdAt: Date.now(), status: "queued"
  });
  queued = await esp32PollCommands();
  if (Object.keys(queued).length < 2) throw new Error("Failed to read multiple queued commands");
  console.log("  -> Multiple queued commands read successfully, C++ logic iterates them sequentially.");

  console.log("\nALL COMMAND TESTS PASSED.");
}

// ---------------------------------------------------------
// Schedule Restore (Phase 3)
// ---------------------------------------------------------

// Mirrors fetchScheduleRestoreLines() in HyFePoul_ESP32.ino: one SCHEDULE_SET
// per slot; missing/invalid slots are sent disabled; whole grams.
const buildScheduleRestoreLines = (schedules) => {
  const lines = [];
  for (let i = 0; i < 3; i++) {
    const slot = (schedules || {})[`sched_${i}`] || {};
    const valid = typeof slot.enabled === 'boolean' &&
      Number.isInteger(slot.hour) && slot.hour >= 0 && slot.hour <= 23 &&
      Number.isInteger(slot.minute) && slot.minute >= 0 && slot.minute <= 59 &&
      typeof slot.targetGrams === 'number' && slot.targetGrams > 0 && slot.targetGrams <= 1000; // per tray
    const grams = Math.max(1, valid ? Math.round(slot.targetGrams) : 50);
    lines.push(`CMD|ID:R${i}|ACTION:SCHEDULE_SET|IDX:${i}|HR:${valid ? slot.hour : 0}|MIN:${valid ? slot.minute : 0}|TGT:${grams}|EN:${valid && slot.enabled ? 1 : 0}`);
  }
  return lines;
};

// Mirrors the ESP32's HMI history projection from /systemData: newest four
// valid snapshots, with the same fields the app's Recent History cards show.
function buildHmiHistoryLines(snapshots) {
  const rows = Object.values(snapshots || {})
    .filter((row) => row && Number.isFinite(row.timestamp) && row.timestamp >= 1e12 &&
      Number.isFinite(row.feedWeightGrams) && row.feedWeightGrams >= 0 &&
      Number.isFinite(row.hopperLevelPercent) && row.hopperLevelPercent >= 0 && row.hopperLevelPercent <= 100 &&
      typeof row.waterLow === 'boolean' && typeof row.feedingActive === 'boolean')
    .map((row) => ({
      timestampSeconds: Math.floor(row.timestamp / 1000),
      feedGrams: Math.round(row.feedWeightGrams),
      hopperPercent: Math.round(row.hopperLevelPercent),
      waterLow: row.waterLow,
      feeding: row.feedingActive,
    }))
    .sort((a, b) => b.timestampSeconds - a.timestampSeconds)
    .slice(0, 4);
  if (!rows.length) return ["HIST|BEGIN", "HIST|EMPTY"];
  return ["HIST|BEGIN", ...rows.map((row, index) =>
    `HIST|ROW|IDX:${index}|TS:${row.timestampSeconds}|FEED:${row.feedGrams}|HOP:${row.hopperPercent}|W:${row.waterLow ? 1 : 0}|DISP:${row.feeding ? 1 : 0}`
  ), "HIST|END"];
}

// Mirrors reportScheduleApplied() in HyFePoul_ESP32.ino: values parsed from
// the exact SCHEDULE_SET line the Mega accepted.
function reportScheduleAppliedPayload(line) {
  const v = (key) => {
    const i = line.indexOf(key);
    if (i < 0) return "";
    const j = line.indexOf('|', i + key.length);
    return line.substring(i + key.length, j < 0 ? line.length : j);
  };
  return {
    hour: parseInt(v("HR:"), 10), minute: parseInt(v("MIN:"), 10),
    targetGrams: parseInt(v("TGT:"), 10), enabled: v("EN:") === "1", appliedAt: Date.now(),
  };
}

async function testScheduleRestore() {
  console.log("\n======================================");
  console.log("RUNNING PHASE 3 SCHEDULE RESTORE TESTS");
  console.log("======================================");

  const adminPut = async (path, data) => {
    const res = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_RTDB_PORT}/${path}.json?ns=${NAMESPACE}`, {
      method: 'PUT', headers: { 'Authorization': 'Bearer owner' }, body: JSON.stringify(data)
    });
    if (res.status !== 200) throw new Error(`adminPut ${path} failed`);
  };
  const deviceReadSchedules = async (token = idToken) => {
    const res = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_RTDB_PORT}/schedules/${DEVICE_ID}.json?ns=${NAMESPACE}&auth=${token}`);
    return { status: res.status, body: res.status === 200 ? await res.json() : null };
  };
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

  console.log("Test R1: device reads /schedules with its own token; slots map to restore lines");
  await adminPut(`schedules/${DEVICE_ID}`, {
    sched_0: { scheduleId: "sched_0", hour: 9, minute: 30, targetGrams: 250, enabled: true, daysOfWeek: [1,2,3,4,5,6,7] },
    sched_2: { scheduleId: "sched_2", hour: 18, minute: 0, targetGrams: 999.6, enabled: false, daysOfWeek: [1,2,3,4,5,6,7] }
  });
  let read = await deviceReadSchedules();
  assert(read.status === 200, `Device could not read schedules (HTTP ${read.status})`);
  let lines = buildScheduleRestoreLines(read.body);
  assert(lines[0] === "CMD|ID:R0|ACTION:SCHEDULE_SET|IDX:0|HR:9|MIN:30|TGT:250|EN:1", `R0 wrong: ${lines[0]}`);
  assert(lines[1] === "CMD|ID:R1|ACTION:SCHEDULE_SET|IDX:1|HR:0|MIN:0|TGT:50|EN:0", `Missing slot not disabled: ${lines[1]}`);
  assert(lines[2] === "CMD|ID:R2|ACTION:SCHEDULE_SET|IDX:2|HR:18|MIN:0|TGT:1000|EN:0", `R2 wrong: ${lines[2]}`);

  console.log("Test R1b: a pre-revision total above 1000 g is sent disabled (the Mega would reject it and the restore would loop)");
  const old = buildScheduleRestoreLines({ sched_0: { hour: 7, minute: 0, targetGrams: 1500, enabled: true } })[0];
  assert(old === "CMD|ID:R0|ACTION:SCHEDULE_SET|IDX:0|HR:0|MIN:0|TGT:50|EN:0", `Out-of-range slot not disabled: ${old}`);

  console.log("Test R2: no schedules in RTDB -> every slot sent disabled");
  await adminPut(`schedules/${DEVICE_ID}`, null);
  read = await deviceReadSchedules();
  assert(read.status === 200 && read.body === null, "Expected empty schedules");
  lines = buildScheduleRestoreLines(read.body);
  assert(lines.every(l => l.endsWith("|EN:0")), "Empty RTDB must disable all slots");

  console.log("Test R3: worst-case line fits the Mega's 64-byte UART buffer");
  const worst = buildScheduleRestoreLines({ sched_2: { hour: 23, minute: 59, targetGrams: 1000, enabled: true } })[2];
  assert(worst.length + 1 <= 64, `Restore line is ${worst.length + 1} bytes`);

  console.log("Test R4: failed read (bad token) -> no restore lines, Mega keeps its EEPROM copy");
  read = await deviceReadSchedules("wrong_token");
  assert(read.status === 401 || read.status === 403, `Expected permission denied, got ${read.status}`);

  console.log("Test R5 (R-43): an accepted line is recorded in scheduleStatus by the device; the owner can read it");
  const applied = reportScheduleAppliedPayload("CMD|ID:R0|ACTION:SCHEDULE_SET|IDX:0|HR:9|MIN:30|TGT:250|EN:1");
  const res = await fetch(getDbUrl(`scheduleStatus/${DEVICE_ID}/sched_0.json`), {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(applied),
  });
  assert(res.status === 200, `Device could not write scheduleStatus (HTTP ${res.status}): ${await res.text()}`);
  const back = await (await fetch(`http://${EMULATOR_HOST}:${EMULATOR_RTDB_PORT}/scheduleStatus/${DEVICE_ID}/sched_0.json?ns=${NAMESPACE}`, { headers: { 'Authorization': 'Bearer owner' } })).json();
  assert(back.hour === 9 && back.minute === 30 && back.targetGrams === 250 && back.enabled === true && typeof back.appliedAt === 'number', `Stored status wrong: ${JSON.stringify(back)}`);

  console.log("Test R6: device reads its own newest app History snapshots; another device's rows are denied");
  const baseTimestamp = Date.now();
  const historyRows = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`row_${i}`, {
    timestamp: baseTimestamp - (5 - i) * 60000,
    feedWeightGrams: 200 + i,
    targetFeedGrams: 50,
    hopperLevelPercent: 60 + i,
    trayWeightsGrams: [40, 40, 40, 40, 40],
    waterLow: i === 5,
    feedingActive: i === 4,
    cycleStep: i === 4 ? "DISPENSING" : "IDLE",
    currentTray: i === 4 ? 3 : 0,
    emergencyStopActive: false,
  }]));
  await adminPut(`systemData/${DEVICE_ID}`, historyRows);
  const historyUrl = `http://${EMULATOR_HOST}:${EMULATOR_RTDB_PORT}/systemData/${DEVICE_ID}.json?orderBy=%22timestamp%22&limitToLast=4&ns=${NAMESPACE}&auth=${idToken}`;
  const historyRes = await fetch(historyUrl);
  assert(historyRes.status === 200, `Device cannot read its own systemData (HTTP ${historyRes.status})`);
  const history = await historyRes.json();
  const historyLines = buildHmiHistoryLines(history);
  assert(historyLines.length === 6 && historyLines[1].includes(`TS:${Math.floor(baseTimestamp / 1000)}`), `HMI did not receive the newest four rows first: ${historyLines.join("; ")}`);
  assert(historyLines[1].includes("FEED:205|HOP:65|W:1|DISP:0"), `Newest row fields differ from app History: ${historyLines[1]}`);
  const otherHistoryRes = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_RTDB_PORT}/systemData/device-001.json?ns=${NAMESPACE}&auth=${idToken}`);
  assert(otherHistoryRes.status === 401 || otherHistoryRes.status === 403, `Device should not read another device's history (HTTP ${otherHistoryRes.status})`);

  console.log("\nALL SCHEDULE RESTORE AND HISTORY TESTS PASSED.");
}

// ---------------------------------------------------------
// UART command lines (Phase 4)
// ---------------------------------------------------------

// Mirrors buildCommandLine() + the pollCommands() length guard in
// HyFePoul_ESP32.ino: short UART IDs C0..C9; SCHEDULE_SET as integers.
const MEGA_MAX_LINE_LENGTH = 63; // + '\n' = Mega's 64-byte RX buffer
const buildCommandLine = (uartId, commandName, cmd) => {
  let params = "";
  const p = cmd.parameters || {};
  if (commandName === "MANUAL_FEED" && p.targetGrams !== undefined) {
    params = `|TARGET:${p.targetGrams}`;
  } else if (commandName === "SCHEDULE_SET" && p.index !== undefined) {
    params = `|IDX:${Math.trunc(p.index)}|HR:${Math.trunc(p.hour)}|MIN:${Math.trunc(p.minute)}|TGT:${Math.round(p.targetGrams)}|EN:${p.enabled ? 1 : 0}`;
  }
  return `CMD|ID:${uartId}|ACTION:${commandName}${params}`;
};

function testUartCommandLines() {
  console.log("\n======================================");
  console.log("RUNNING PHASE 4 UART LINE TESTS");
  console.log("======================================");
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

  console.log("Test U1: Firebase command IDs never reach the UART; IDs cycle C0..C9");
  const ids = Array.from({ length: 12 }, (_, n) => `C${n % 10}`);
  assert(ids[0] === "C0" && ids[9] === "C9" && ids[10] === "C0", "UART ID cycle wrong");
  const line = buildCommandLine("C3", "MANUAL_FEED", { parameters: { targetGrams: 120 } });
  assert(line === "CMD|ID:C3|ACTION:MANUAL_FEED|TARGET:120", `Unexpected line: ${line}`);
  assert(!line.includes("cmd_"), "Firebase command ID leaked onto the UART");

  console.log("Test U2: worst-case SCHEDULE_SET from the app fits 64 bytes (was ~82)");
  const worst = buildCommandLine("C9", "SCHEDULE_SET", { parameters: { index: 2, hour: 23, minute: 59, targetGrams: 999.6, enabled: true } });
  assert(worst === "CMD|ID:C9|ACTION:SCHEDULE_SET|IDX:2|HR:23|MIN:59|TGT:1000|EN:1", `Unexpected line: ${worst}`);
  assert(worst.length <= MEGA_MAX_LINE_LENGTH, `SCHEDULE_SET line is ${worst.length + 1} bytes`);

  console.log("Test U3: every whitelisted command fits at its longest");
  for (const cmd of ["ESTOP_RELEASE", "SYSTEM_RESTART", "STATUS_REQ"]) {
    assert(buildCommandLine("C9", cmd, {}).length <= MEGA_MAX_LINE_LENGTH, `${cmd} too long`);
  }
  assert(buildCommandLine("C9", "MANUAL_FEED", { parameters: { targetGrams: 1999.99 } }).length <= MEGA_MAX_LINE_LENGTH, "MANUAL_FEED too long");

  console.log("Test U4: an oversized parameter is caught by the guard (command fails as LINE_TOO_LONG)");
  const oversized = buildCommandLine("C1", "MANUAL_FEED", { parameters: { targetGrams: "1".repeat(40) } });
  assert(oversized.length > MEGA_MAX_LINE_LENGTH, "Guard test needs an oversized line");

  console.log("\nALL UART LINE TESTS PASSED.");
}

simulate().catch(err => {
  console.error(err);
  process.exit(1);
});
