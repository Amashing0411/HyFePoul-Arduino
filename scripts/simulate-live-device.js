/**
 * simulate-live-device.js
 *
 * Acts like the ESP32 against LIVE Firebase, so the app and Google Sheet can be
 * tested without the machine. It signs in with the device's own login from
 * firmware/esp32/HyFePoul_ESP32/Config.h, so the live rules apply as they would
 * for real hardware. It does not test the Mega, the ESP32 or the machine.
 *
 *   node scripts/simulate-live-device.js run [minutes]   default 20
 *   node scripts/simulate-live-device.js restore         puts the data back
 *
 * "run" saves a snapshot of this device's data first (only if there is not one
 * already), and "restore" writes it back and deletes it. Restoring also removes
 * schedules and commands made in the app during the test.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const DB = 'https://hyfepoul-dev-default-rtdb.asia-southeast1.firebasedatabase.app';
const DEVICE = 'device-001';
const SNAPSHOT = path.join(os.tmpdir(), `hyfepoul-live-snapshot-${DEVICE}.json`);
const NODES = [
  `devices/${DEVICE}/status`, `devices/${DEVICE}/lastHeartbeat`, `devices/${DEVICE}/megaLinkOk`, `devices/${DEVICE}/state`,
  `systemData/${DEVICE}`, `alerts/${DEVICE}`, `dailySummary/${DEVICE}`,
  `commands/${DEVICE}`, `schedules/${DEVICE}`, `scheduleStatus/${DEVICE}`,
];

// Tray numbers in travel order from the right (Config.ino HOPPER_START_SIDE).
const TRAY_ORDER = [1, 2, 3, 5, 4];
const SPOTS = 5;
const TICK_MS = 2000;
const HEARTBEAT_MS = 30000;
const STATE_MS = 10000;
const HISTORY_MS = 60000; // the firmware uses 5 min; shorter so a test shows more rows
const POLL_MS = 5000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[${new Date().toLocaleTimeString()}] ${m}`);

// ---------------- administrator access (the Firebase CLI's login) ----------------

function adminToken() {
  const file = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
  const read = () => JSON.parse(fs.readFileSync(file, 'utf8')).tokens;
  if (read().expires_at < Date.now() + 60000) {
    execSync('npx firebase projects:list', { stdio: 'ignore' }); // refreshes the token
  }
  return read().access_token;
}

async function adminRequest(method, node, value) {
  const res = await fetch(`${DB}/${node}.json?access_token=${adminToken()}`, {
    method,
    ...(value === undefined ? {} : { body: JSON.stringify(value), headers: { 'Content-Type': 'application/json' } }),
  });
  if (!res.ok) throw new Error(`${method} ${node} failed: HTTP ${res.status}`);
  return res.json();
}

async function takeSnapshot() {
  if (fs.existsSync(SNAPSHOT)) {
    log('Keeping the existing snapshot, taken before an earlier simulated run.');
    return;
  }
  const snapshot = {};
  for (const node of NODES) snapshot[node] = await adminRequest('GET', node);
  fs.writeFileSync(SNAPSHOT, JSON.stringify(snapshot));
  log('Saved a snapshot of the live data.');
}

async function restore() {
  if (!fs.existsSync(SNAPSHOT)) {
    console.log('No snapshot found, so there is nothing to restore.');
    return;
  }
  const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
  for (const node of NODES) {
    await adminRequest('PUT', node, snapshot[node]);
    const back = await adminRequest('GET', node);
    if (JSON.stringify(back) !== JSON.stringify(snapshot[node])) throw new Error(`${node} did not restore`);
  }
  fs.unlinkSync(SNAPSHOT);
  console.log('Live data restored and checked. The snapshot was deleted.');
}

// ---------------- device access (same login and requests as the ESP32) ----------------

function deviceLogin() {
  const text = fs.readFileSync(path.join(__dirname, '../firmware/esp32/HyFePoul_ESP32/Config.h'), 'utf8');
  const value = (name) => {
    const m = text.match(new RegExp(`#define\\s+${name}\\s+"([^"]*)"`));
    if (!m) throw new Error(`${name} missing from Config.h`);
    return m[1];
  };
  return { apiKey: value('FIREBASE_API_KEY'), email: value('FIREBASE_AUTH_EMAIL'), password: value('FIREBASE_AUTH_PASSWORD') };
}

let idToken = '';
let tokenExpiresAt = 0;

async function signIn() {
  const { apiKey, email, password } = deviceLogin();
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`Device sign-in failed: HTTP ${res.status}`);
  const data = await res.json();
  idToken = data.idToken;
  tokenExpiresAt = Date.now() + (Number(data.expiresIn) - 300) * 1000;
  log('Signed in with the device login.');
}

// Reports a refused write loudly: a refusal means the rules or format are wrong.
let writeFailures = 0;
async function device(method, node, value, query = '') {
  if (Date.now() > tokenExpiresAt) await signIn();
  const res = await fetch(`${DB}/${node}.json?auth=${idToken}${query}`, {
    method,
    ...(value === undefined ? {} : { body: JSON.stringify(value), headers: { 'Content-Type': 'application/json' } }),
  });
  if (!res.ok) {
    writeFailures++;
    log(`REFUSED: ${method} ${node} -> HTTP ${res.status}`);
    return null;
  }
  return res.json();
}

// ---------------- simulated machine ----------------

const machine = {
  trays: [0, 0, 0, 0, 0],
  target: 50,
  hopper: 72,
  waterLow: false,
  feeding: false,
  step: 'IDLE',
  tray: 0,
  cycle: null,
  commandId: null,
  today: { feedGrams: 0, cyclesCompleted: 0, cyclesIncomplete: 0, trayTimeouts: 0, chainFaults: 0, lowWaterAlerts: 0, lowFeedAlerts: 0 },
};

const stateDoc = () => ({
  trayWeightsGrams: machine.trays.map((g) => Math.round(g * 10) / 10),
  feedWeightGrams: Math.round(machine.trays.reduce((a, b) => a + b, 0) * 10) / 10,
  targetFeedGrams: machine.target,
  hopperLevelPercent: Math.round(machine.hopper * 10) / 10,
  waterLow: machine.waterLow,
  feedingActive: machine.feeding,
  cycleStep: machine.step,
  currentTray: machine.tray,
  timeSource: 'NETWORK',
  timestamp: Date.now(),
});

const manilaDate = () => new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

async function sendState() { await device('PUT', `devices/${DEVICE}/state`, stateDoc()); }
async function sendHistory() { await device('POST', `systemData/${DEVICE}`, stateDoc()); }
async function sendSummary() {
  const date = manilaDate();
  await device('PUT', `dailySummary/${DEVICE}/${date}`, { date, ...machine.today, feedGrams: Math.round(machine.today.feedGrams), updatedAt: Date.now() });
}
async function raiseAlert(name) {
  await device('PUT', `alerts/${DEVICE}/${name}`, { eventId: name, name, timestamp: Date.now(), resolved: false });
  log(`Alert raised: ${name}`);
}
async function resolveAlert(name) {
  await device('PATCH', `alerts/${DEVICE}/${name}`, { resolved: true, resolvedAt: Date.now() });
  log(`Alert resolved: ${name}`);
}
async function setCommand(id, status, error) {
  const doc = { status };
  if (status === 'acknowledged') doc.acknowledgedAt = Date.now();
  if (status === 'completed') doc.completedAt = Date.now();
  if (status === 'failed') doc.error = error;
  await device('PATCH', `commands/${DEVICE}/${id}`, doc);
}

// One feed: every tray moves, tares, then fills across its spots. One entry per tick.
function buildCycle() {
  const steps = [];
  TRAY_ORDER.forEach((tray) => {
    steps.push({ step: 'TO_TRAY', tray }, { step: 'TARING', tray });
    for (let spot = 0; spot < SPOTS; spot++) steps.push({ step: 'DISPENSING', tray, grams: machine.target / SPOTS + (spot === SPOTS - 1 ? 2 : 0) });
  });
  steps.push({ step: 'TO_END', tray: 0 }, { step: 'RETURNING', tray: 0 }, { step: 'RETURNING', tray: 0 });
  return steps;
}

async function startCycle(target, commandId = null) {
  machine.target = target;
  machine.trays = [0, 0, 0, 0, 0];
  machine.feeding = true;
  machine.commandId = commandId;
  machine.cycle = buildCycle();
  log(`Feed started: ${target} g per tray, trays ${TRAY_ORDER.join(', ')}`);
  await sendHistory();
}

async function advanceCycle() {
  const next = machine.cycle.shift();
  if (next) {
    machine.step = next.step;
    machine.tray = next.tray;
    if (next.grams) {
      machine.trays[next.tray - 1] += next.grams;
      machine.today.feedGrams += next.grams;
      machine.hopper = Math.max(0, machine.hopper - next.grams * 0.02);
    }
    return;
  }
  machine.feeding = false;
  machine.step = 'IDLE';
  machine.tray = 0;
  machine.cycle = null;
  machine.today.cyclesCompleted++;
  log(`Feed finished. Trays: ${machine.trays.map((g) => g.toFixed(0)).join(', ')} g`);
  if (machine.commandId) {
    await setCommand(machine.commandId, 'completed');
    machine.commandId = null;
  }
  await sendHistory();
  await sendSummary();
}

// Answers what the app sends, like the ESP32 and Mega together.
async function pollCommands() {
  const queued = await device('GET', `commands/${DEVICE}`, undefined, `&orderBy=${encodeURIComponent('"status"')}&equalTo=${encodeURIComponent('"queued"')}`);
  if (!queued) return;
  for (const [id, cmd] of Object.entries(queued)) {
    log(`Command from the app: ${cmd.command}`);
    await setCommand(id, 'acknowledged');
    const p = cmd.parameters || {};
    if (cmd.command === 'MANUAL_FEED') {
      if (machine.feeding) { await setCommand(id, 'failed', 'FEEDING_ACTIVE'); continue; }
      await setCommand(id, 'executing');
      await startCycle(Number(p.targetGrams) || 50, id);
    } else if (cmd.command === 'SCHEDULE_SET') {
      await setCommand(id, 'executing');
      await device('PUT', `scheduleStatus/${DEVICE}/sched_${p.index}`, {
        hour: p.hour, minute: p.minute, targetGrams: Math.round(p.targetGrams), enabled: !!p.enabled, appliedAt: Date.now(),
      });
      await setCommand(id, 'completed');
    } else if (cmd.command === 'STATUS_REQ') {
      await setCommand(id, 'executing');
      await sendState();
      await setCommand(id, 'completed');
    } else {
      await setCommand(id, 'failed', 'NOT_IMPLEMENTED_SAFELY');
    }
  }
}

// Things that happen by themselves, by seconds since the start.
const SCENARIO = [
  [20, () => startCycle(50)],
  [150, async () => { machine.waterLow = true; machine.today.lowWaterAlerts++; await raiseAlert('LOW_WATER'); await sendSummary(); }],
  [190, async () => { machine.waterLow = false; await resolveAlert('LOW_WATER'); }],
  [210, () => raiseAlert('HOPPER_SENSOR_FAULT')],
  [250, () => resolveAlert('HOPPER_SENSOR_FAULT')],
  [270, async () => { machine.today.lowFeedAlerts++; await raiseAlert('LOW_FEED'); await sendSummary(); }],
];

async function run(minutes) {
  await takeSnapshot();
  await signIn();
  const started = Date.now();
  const end = started + minutes * 60000;
  let lastHeartbeat = 0;
  let lastState = 0;
  let lastHistory = 0;
  let lastPoll = 0;
  const scenario = [...SCENARIO];

  await device('PUT', `devices/${DEVICE}/megaLinkOk`, true);
  log(`Simulated device running for ${minutes} min. Press Ctrl+C to stop early.`);

  while (Date.now() < end) {
    const now = Date.now();
    if (now - lastHeartbeat >= HEARTBEAT_MS) {
      await device('PUT', `devices/${DEVICE}/status`, 'online');
      await device('PUT', `devices/${DEVICE}/lastHeartbeat`, now);
      lastHeartbeat = now;
    }
    while (scenario.length && (now - started) / 1000 >= scenario[0][0]) await scenario.shift()[1]();
    if (machine.cycle) await advanceCycle();
    if (now - lastState >= STATE_MS || machine.feeding) {
      await sendState();
      lastState = now;
    }
    if (now - lastHistory >= HISTORY_MS) {
      await sendHistory();
      await sendSummary();
      lastHistory = now;
    }
    if (now - lastPoll >= POLL_MS) {
      await pollCommands();
      lastPoll = now;
    }
    await sleep(TICK_MS);
  }

  await device('PUT', `devices/${DEVICE}/status`, 'offline');
  log(`Simulated device finished. Refused writes: ${writeFailures}.`);
  log('Run "restore" when you are done checking the app and sheet.');
  if (writeFailures) process.exitCode = 1;
}

const [mode, arg] = process.argv.slice(2);
(mode === 'restore' ? restore() : mode === 'run' ? run(Number(arg) || 20) : Promise.reject(new Error('Use: run [minutes] | restore')))
  .catch((err) => { console.error(err.message); process.exit(1); });
