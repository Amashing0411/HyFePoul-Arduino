/**
 * seed-screenshot-demo.js
 *
 * Fills the LOCAL Firebase emulators (auth 9099, database 9000) with one
 * believable day of HyFePoul data, so the app can be screenshotted for the
 * showcase site without touching the live project.
 *
 *   firebase emulators:start --only auth,database --project hyfepoul-dev
 *   node scripts/seed-screenshot-demo.js
 *
 * Emulator-only demo accounts (they do not exist in the live project):
 *   owner   demo-owner@hyfepoul.test   / demo-owner-2026
 *   device  demo-device@hyfepoul.test  / demo-device-2026
 */
const AUTH = 'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1';
const DB = 'http://127.0.0.1:9000';
const NS = 'hyfepoul-dev-default-rtdb';
const DEVICE = 'device-001';
const OWNER = { email: 'demo-owner@hyfepoul.test', password: 'demo-owner-2026' };
const ESP = { email: 'demo-device@hyfepoul.test', password: 'demo-device-2026' };

async function account({ email, password }) {
  const body = JSON.stringify({ email, password, returnSecureToken: true });
  let r = await fetch(`${AUTH}/accounts:signUp?key=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  if (!r.ok) r = await fetch(`${AUTH}/accounts:signInWithPassword?key=demo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const j = await r.json();
  if (!j.localId) throw new Error(`account ${email}: ${JSON.stringify(j)}`);
  return j.localId;
}

const put = async (path, value) => {
  const r = await fetch(`${DB}/${path}.json?ns=${NS}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(value) });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
};

const round = (x) => Math.round(x * 10) / 10;

(async () => {
  const ownerUid = await account(OWNER);
  const espUid = await account(ESP);
  const now = Date.now();
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;

  // After the 12:00 feed: every tray close to its 50 g target, birds eating a little since.
  const trays = [48.6, 47.9, 49.2, 46.8, 48.1];
  const state = {
    feedWeightGrams: round(trays.reduce((a, b) => a + b, 0)), targetFeedGrams: 50, trayWeightsGrams: trays,
    hopperLevelPercent: 68, waterLow: false, feedingActive: false, cycleStep: 'IDLE', currentTray: 0,
    timeSource: 'NETWORK', timestamp: now - 20 * 1000,
  };
  await put(`devices/${DEVICE}`, { ownerId: ownerUid, deviceAuthUid: espUid, status: 'online', lastHeartbeat: now - 15 * 1000, megaLinkOk: true, state });

  // History: a row every 5 minutes for the last 2 hours, trays slowly emptying, hopper steady.
  const history = {};
  for (let k = 24; k >= 0; k--) {
    const t = now - k * 5 * MIN - 30 * 1000;
    const eaten = k * 0.45;
    const tw = trays.map((g, i) => round(Math.min(50.4, g + eaten * (0.8 + i * 0.08))));
    history[`snap${String(t)}`] = {
      feedWeightGrams: round(tw.reduce((a, b) => a + b, 0)), targetFeedGrams: 50, trayWeightsGrams: tw,
      hopperLevelPercent: 68, waterLow: false, feedingActive: false, cycleStep: 'IDLE', currentTray: 0, timeSource: 'NETWORK', timestamp: t,
    };
  }
  await put(`systemData/${DEVICE}`, history);

  // Alerts: all resolved, the newest first in the app.
  const alert = (name, ago, fixedAfter) => ({ eventId: name, name, timestamp: now - ago, resolved: true, resolvedAt: now - ago + fixedAfter });
  await put(`alerts/${DEVICE}`, {
    LOW_FEED: alert('LOW_FEED', 3 * HOUR, 25 * MIN),
    LOW_WATER: alert('LOW_WATER', 9 * HOUR, 40 * MIN),
    TRAY_TIMEOUT: alert('TRAY_TIMEOUT', 2 * DAY, 2 * MIN),
  });

  // Three daily feeds at 50 g per tray, confirmed by the device.
  const slots = [[6, 30], [12, 0], [17, 30]];
  const schedules = {}, status = {};
  slots.forEach(([hour, minute], i) => {
    const id = `sched_${i}`;
    schedules[id] = { scheduleId: id, hour, minute, targetGrams: 50, enabled: true, daysOfWeek: [0, 1, 2, 3, 4, 5, 6], updatedBy: 'app', updatedAt: now - 3 * DAY };
    status[id] = { hour, minute, targetGrams: 50, enabled: true, appliedAt: now - 3 * DAY + 20 * 1000 };
  });
  await put(`schedules/${DEVICE}`, schedules);
  await put(`scheduleStatus/${DEVICE}`, status);

  // A week of daily totals (UTC+8 dates).
  const days = {};
  for (let k = 6; k >= 0; k--) {
    const d = new Date(now - k * DAY + 8 * HOUR).toISOString().slice(0, 10);
    const cycles = k === 0 ? 2 : 3;
    days[d] = {
      date: d, feedGrams: Math.round(cycles * 250 * (0.97 + ((k * 7) % 5) / 100)), cyclesCompleted: cycles, cyclesIncomplete: k === 2 ? 1 : 0,
      trayTimeouts: k === 2 ? 1 : 0, chainFaults: 0, lowWaterAlerts: k === 0 ? 1 : 0, lowFeedAlerts: k === 0 ? 1 : 0, updatedAt: now - k * DAY,
    };
  }
  await put(`dailySummary/${DEVICE}`, days);

  // One finished manual feed from the app.
  await put(`commands/${DEVICE}`, {
    cmd_demo1: { commandId: 'cmd_demo1', command: 'MANUAL_FEED', parameters: { targetGrams: 50 }, issuedBy: ownerUid, createdAt: now - 4 * HOUR, status: 'completed', acknowledgedAt: now - 4 * HOUR + 3000, completedAt: now - 4 * HOUR + 4 * MIN },
  });

  console.log(`Seeded ${DEVICE}: owner ${ownerUid}, device ${espUid}`);
})().catch((e) => { console.error(e); process.exit(1); });
