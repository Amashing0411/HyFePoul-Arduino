/**
 * test-sheets-logging.js
 *
 * Runs integrations/google-sheets/Code.gs against the Firebase emulator, with
 * small stand-ins for the Google services. It checks the script's logic and
 * its Firebase queries. It does not prove Google's sign-in or sheet behavior.
 *
 * Run: npx firebase emulators:exec --only auth,database --project hyfepoul-dev "node scripts/test-sheets-logging.js"
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const DB = 'http://127.0.0.1:9000';
const NS = 'hyfepoul-dev-default-rtdb';
const curl = (args) => execFileSync('curl', ['-s', '-w', '\n%{http_code}', ...args], { encoding: 'utf8' });

// Writes as an administrator, past the rules.
const adminPut = (p, value) => curl(['-X', 'PUT', '-H', 'Authorization: Bearer owner', '-d', JSON.stringify(value), `${DB}/${p}.json?ns=${NS}`]);
const clearDb = () => { ['systemData', 'dailySummary', 'alerts'].forEach(p => adminPut(p, null)); };

class Range {
  constructor(sheet, row, col, rows, cols) { Object.assign(this, { sheet, row, col, rows, cols }); }
  setValues(values) {
    if (values.length !== this.rows || values[0].length !== this.cols) throw new Error('setValues size mismatch');
    values.forEach((v, r) => v.forEach((cell, c) => {
      const rowIndex = this.row - 1 + r;
      while (this.sheet.data.length <= rowIndex) this.sheet.data.push([]);
      this.sheet.data[rowIndex][this.col - 1 + c] = cell;
    }));
    return this;
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) row.push((this.sheet.data[this.row - 1 + r] || [])[this.col - 1 + c] ?? '');
      out.push(row);
    }
    return out;
  }
  setNumberFormat() { return this; }
  setFontWeight() { return this; }
}

class Sheet {
  constructor(name) { this.name = name; this.data = []; }
  getLastRow() { return this.data.length; }
  getRange(row, col, rows, cols) {
    if (row < 1) throw new Error('Rows start at 1');
    return new Range(this, row, col, rows, cols);
  }
  setFrozenRows() {}
}

const newContext = () => {
  const tabs = {};
  const props = {};
  const triggers = [];
  const urls = [];
  const state = { failWith: 0 };
  const spreadsheet = {
    setSpreadsheetTimeZone() {},
    getSheetByName: (n) => tabs[n] || null,
    insertSheet: (n) => { tabs[n] = new Sheet(n); return tabs[n]; },
  };
  const trigger = (handler) => ({ getHandlerFunction: () => handler });
  const ctx = {
    console, Date, JSON, Object, Array, Number, String, Math, encodeURIComponent, Error,
    SpreadsheetApp: { getActive: () => spreadsheet },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (k) => (k in props ? props[k] : null),
      setProperty: (k, v) => { props[k] = String(v); },
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    Utilities: { formatDate: (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit' }).format(d).slice(0, 7) },
    ScriptApp: {
      getOAuthToken: () => 'TEST_TOKEN',
      getProjectTriggers: () => triggers,
      deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1),
      newTrigger: (handler) => ({ timeBased: () => ({ everyMinutes: (m) => ({ create: () => { triggers.push(Object.assign(trigger(handler), { minutes: m })); } }) }) }),
    },
    UrlFetchApp: { fetch: (url) => {
      urls.push(url);
      if (state.failWith) return { getResponseCode: () => state.failWith, getContentText: () => '{}' };
      const emulatorUrl = url.replace(/^https:\/\/[^/]+/, DB).replace('access_token=TEST_TOKEN', `ns=${NS}`);
      const out = curl(['-H', 'Authorization: Bearer owner', emulatorUrl]);
      const cut = out.lastIndexOf('\n');
      return { getResponseCode: () => Number(out.slice(cut + 1)), getContentText: () => out.slice(0, cut) };
    } },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../integrations/google-sheets/Code.gs'), 'utf8'), ctx);
  return { ctx, tabs, props, triggers, urls, state };
};

let passed = 0;
const test = (name, fn) => {
  clearDb();
  try {
    fn();
    passed++;
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}\n       ${err.message}`);
    process.exit(1);
  }
};
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

const DEV = 'device-001';
const NOV_6 = Date.UTC(2026, 10, 6, 4, 0); // 12:00 in Manila
const reading = (timestamp, extra = {}) => ({
  timestamp, feedWeightGrams: 250, targetFeedGrams: 50, hopperLevelPercent: 65,
  trayWeightsGrams: [10, 20, 30, 40, 150], waterLow: false, feedingActive: true,
  cycleStep: 'DISPENSING', currentTray: 3, timeSource: 'NETWORK', ...extra,
});
const day = (date, feedGrams) => ({
  date, feedGrams, cyclesCompleted: 2, cyclesIncomplete: 1, trayTimeouts: 1, chainFaults: 0,
  lowWaterAlerts: 0, lowFeedAlerts: 1, updatedAt: NOV_6,
});

console.log('RUNNING GOOGLE SHEETS LOGGING TESTS');

test('1. setup makes the tabs and one timer, and running it twice still leaves one', () => {
  const t = newContext();
  t.ctx.setup();
  t.ctx.setup();
  ['Daily Summary', 'Alerts', 'Sync Status'].forEach(n => assert(t.tabs[n], `Missing ${n}`));
  assert(t.triggers.length === 1, `${t.triggers.length} timers`);
  assert(t.triggers[0].minutes === 15, 'Wrong interval');
  assert(t.triggers[0].getHandlerFunction() === 'syncToSheet', 'Wrong handler');
  t.ctx.stopTimer();
  assert(t.triggers.length === 0, 'stopTimer left a timer');
});

test('2. readings land in tray-number columns, in time order, with plain values', () => {
  const t = newContext();
  adminPut(`systemData/${DEV}/b`, reading(NOV_6 + 300000, { waterLow: true, feedingActive: false, currentTray: 0, cycleStep: 'IDLE' }));
  adminPut(`systemData/${DEV}/a`, reading(NOV_6));
  t.ctx.syncToSheet();
  const rows = t.tabs['Readings 2026-11'].data;
  assert(rows.length === 3, `${rows.length} rows`);
  assert(rows[0][1] === 'Tray 1 (g)' && rows[0].length === 14, 'Headers');
  assert(rows[1][0].getTime() === NOV_6, 'Not in time order');
  assert(rows[1].slice(1, 6).join() === '10,20,30,40,150', `Trays ${rows[1].slice(1, 6)}`);
  assert(rows[1][9] === 'OK' && rows[1][10] === 'YES' && rows[1][11] === 'DISPENSING' && rows[1][12] === 3, 'Row 1 values');
  assert(rows[2][9] === 'LOW' && rows[2][10] === 'NO', 'Row 2 values');
});

test('3. the next run only adds new readings', () => {
  const t = newContext();
  adminPut(`systemData/${DEV}/a`, reading(NOV_6));
  t.ctx.syncToSheet();
  t.ctx.syncToSheet();
  assert(t.tabs['Readings 2026-11'].data.length === 2, 'Duplicated a reading');
  adminPut(`systemData/${DEV}/b`, reading(NOV_6 + 1));
  t.ctx.syncToSheet();
  assert(t.tabs['Readings 2026-11'].data.length === 3, 'Missed a new reading');
});

test('4. months split by Manila time, not UTC', () => {
  const t = newContext();
  adminPut(`systemData/${DEV}/a`, reading(Date.UTC(2026, 10, 30, 15, 59))); // Nov 30 23:59 Manila
  adminPut(`systemData/${DEV}/b`, reading(Date.UTC(2026, 10, 30, 16, 0)));  // Dec 1 00:00 Manila, still Nov in UTC
  t.ctx.syncToSheet();
  assert(t.tabs['Readings 2026-11'].data.length === 2, 'November tab');
  assert(t.tabs['Readings 2026-12'].data.length === 2, 'December tab');
});

test('5. more readings than one page are all copied, once each', () => {
  const t = newContext();
  vm.runInContext('CONFIG.PAGE_SIZE = 2', t.ctx);
  const seed = {};
  for (let i = 0; i < 7; i++) seed[`r${i}`] = reading(NOV_6 + i);
  adminPut(`systemData/${DEV}`, seed);
  t.ctx.syncToSheet();
  const rows = t.tabs['Readings 2026-11'].data.slice(1);
  assert(rows.length === 7, `${rows.length} rows`);
  assert(new Set(rows.map(r => r[0].getTime())).size === 7, 'Duplicates');
});

test('6. bad records are skipped without blocking the good ones', () => {
  const t = newContext();
  adminPut(`systemData/${DEV}/bad1`, { timestamp: NOV_6, feedWeightGrams: 'invalid' });
  adminPut(`systemData/${DEV}/bad2`, { timestamp: 1000, feedWeightGrams: 1, trayWeightsGrams: [1, 2, 3, 4, 5] });
  adminPut(`systemData/${DEV}/good`, reading(NOV_6 + 1));
  t.ctx.syncToSheet();
  assert(t.tabs['Readings 2026-11'].data.length === 2, 'Expected one good row');
  t.ctx.syncToSheet();
  assert(t.tabs['Readings 2026-11'].data.length === 2, 'Re-read a bad record');
});

test('7. daily totals update the same row, and a new day adds one', () => {
  const t = newContext();
  adminPut(`dailySummary/${DEV}/2026-11-05`, day('2026-11-05', 1000));
  adminPut(`dailySummary/${DEV}/2026-11-06`, day('2026-11-06', 500));
  t.ctx.syncToSheet();
  adminPut(`dailySummary/${DEV}/2026-11-06`, day('2026-11-06', 750));
  t.ctx.syncToSheet();
  const rows = t.tabs['Daily Summary'].data;
  assert(rows.length === 3, `${rows.length} rows`);
  assert(rows[1][0] === '2026-11-05' && rows[2][0] === '2026-11-06', 'Dates');
  assert(rows[2][1] === 750, `Feed ${rows[2][1]}`);
  assert(rows[2].slice(2, 8).join() === '2,1,1,0,0,1', `Counts ${rows[2].slice(2, 8)}`);
  adminPut(`dailySummary/${DEV}/2026-11-07`, day('2026-11-07', 100));
  t.ctx.syncToSheet();
  assert(t.tabs['Daily Summary'].data.length === 4, 'New day not added');
});

test('8. an alert resolves on its own row; a repeat gets a new row; old stop records stay out', () => {
  const t = newContext();
  const alert = (timestamp, extra = {}) => ({ eventId: 'LOW_FEED', name: 'LOW_FEED', timestamp, resolved: false, ...extra });
  adminPut(`alerts/${DEV}/LOW_FEED`, alert(NOV_6));
  adminPut(`alerts/${DEV}/EMERGENCY_STOP`, { eventId: 'EMERGENCY_STOP', name: 'EMERGENCY_STOP', timestamp: NOV_6, resolved: false });
  t.ctx.syncToSheet();
  assert(t.tabs.Alerts.data.length === 2, 'Expected one alert row');
  assert(t.tabs.Alerts.data[1][1] === 'LOW_FEED' && t.tabs.Alerts.data[1][2] === 'ACTIVE', 'Active row');

  adminPut(`alerts/${DEV}/LOW_FEED`, alert(NOV_6, { resolved: true, resolvedAt: NOV_6 + 5000 }));
  t.ctx.syncToSheet();
  assert(t.tabs.Alerts.data.length === 2, 'Resolving added a row');
  assert(t.tabs.Alerts.data[1][2] === 'RESOLVED' && t.tabs.Alerts.data[1][3].getTime() === NOV_6 + 5000, 'Not resolved');

  adminPut(`alerts/${DEV}/LOW_FEED`, alert(NOV_6 + 60000));
  t.ctx.syncToSheet();
  assert(t.tabs.Alerts.data.length === 3, 'A repeat should add a row');
  assert(t.tabs.Alerts.data[1][2] === 'RESOLVED' && t.tabs.Alerts.data[2][2] === 'ACTIVE', 'Repeat rows');
});

test('9. empty Firebase works, and Sync Status says so', () => {
  const t = newContext();
  t.ctx.setup();
  const status = Object.fromEntries(t.tabs['Sync Status'].data.slice(1));
  assert(status.Result === 'OK', `Result ${status.Result}`);
  assert(status['Newest reading'] === 'None yet', 'Newest reading');
  assert(!Object.keys(t.tabs).some(n => n.startsWith('Readings')), 'Made an empty month tab');
});

test('10. a failed read is recorded, keeps the place, and never exposes the token', () => {
  const t = newContext();
  adminPut(`systemData/${DEV}/a`, reading(NOV_6));
  t.state.failWith = 401;
  let thrown = null;
  try { t.ctx.syncToSheet(); } catch (err) { thrown = err; }
  assert(thrown, 'Should rethrow so Google records the failure');
  assert(!thrown.message.includes('TEST_TOKEN'), 'Token in the error');
  const status = Object.fromEntries(t.tabs['Sync Status'].data.slice(1));
  assert(status.Result.startsWith('ERROR') && status.Result.includes('HTTP 401'), status.Result);
  assert(!status.Result.includes('TEST_TOKEN'), 'Token in the sheet');
  assert(!t.tabs['Readings 2026-11'], 'Wrote rows on a failed read');

  t.state.failWith = 0;
  t.ctx.syncToSheet();
  assert(t.tabs['Readings 2026-11'].data.length === 2, 'Did not catch up');
  assert(Object.fromEntries(t.tabs['Sync Status'].data.slice(1)).Result === 'OK', 'Status not cleared');
});

test('11. every request is authorized and only reads this device', () => {
  const t = newContext();
  t.ctx.syncToSheet();
  assert(t.urls.length === 3, `${t.urls.length} requests`);
  t.urls.forEach((u) => {
    assert(u.includes('access_token=TEST_TOKEN'), 'No token');
    assert(u.includes(`/${DEV}.json?`), `Wrong path: ${u}`);
    assert(u.startsWith('https://hyfepoul-dev-default-rtdb.'), 'Wrong database');
  });
});

clearDb();
console.log(`ALL ${passed} GOOGLE SHEETS LOGGING TESTS PASSED.`);
