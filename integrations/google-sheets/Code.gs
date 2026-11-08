/**
 * HyFePoul logs: copies the device's records from Firebase into this sheet.
 *
 * Runs on a timer inside Google Apps Script. It only reads Firebase, and the
 * Mega and ESP32 do not know it exists, so a failure here cannot affect feeding.
 *
 * Tabs:
 *   Readings YYYY-MM  one row per /systemData record, a new tab each month
 *   Daily Summary     one row per day, updated as the day's totals change
 *   Alerts            one row per alert occurrence, updated when it resolves
 *   Sync Status       when it last ran and what happened
 *
 * Run setup() once. See README.md in this folder.
 */

const CONFIG = {
  DATABASE_URL: 'https://hyfepoul-dev-default-rtdb.asia-southeast1.firebasedatabase.app',
  DEVICE_ID: 'device-001',
  TIME_ZONE: 'Asia/Manila',
  SYNC_EVERY_MINUTES: 15, // Apps Script allows 1, 5, 10, 15 or 30
  PAGE_SIZE: 500,
  SUMMARY_DAYS: 40,
  MAX_RUN_MS: 240000, // stop early; the next run continues from the same place
};

const TAB_DAILY = 'Daily Summary';
const TAB_ALERTS = 'Alerts';
const TAB_STATUS = 'Sync Status';
const READINGS_PREFIX = 'Readings ';
const TIME_FORMAT = 'yyyy-mm-dd hh:mm:ss'; // otherwise the sheet shows only the date

const READING_HEADERS = ['Time', 'Tray 1 (g)', 'Tray 2 (g)', 'Tray 3 (g)', 'Tray 4 (g)', 'Tray 5 (g)',
  'Total (g)', 'Target per tray (g)', 'Hopper (%)', 'Water', 'Feeding', 'Cycle step', 'At tray', 'Clock source'];
const DAILY_HEADERS = ['Date', 'Feed (g)', 'Cycles completed', 'Cycles incomplete', 'Tray timeouts',
  'Chain faults', 'Low water alerts', 'Low feed alerts', 'Updated'];
const ALERT_HEADERS = ['Time', 'Alert', 'Status', 'Resolved at', 'Record ID'];

// The machine no longer has an emergency stop. Old records would stay active
// forever because nothing reports them released.
const RETIRED_ALERTS = ['EMERGENCY_STOP'];

// Run this once from the Apps Script editor.
function setup() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(CONFIG.TIME_ZONE);
  getOrCreateTab_(TAB_DAILY, DAILY_HEADERS);
  getOrCreateTab_(TAB_ALERTS, ALERT_HEADERS);
  getOrCreateTab_(TAB_STATUS, ['Item', 'Value']);

  stopTimer();
  ScriptApp.newTrigger('syncToSheet').timeBased().everyMinutes(CONFIG.SYNC_EVERY_MINUTES).create();

  syncToSheet();
}

// Turns the timer off. Run setup() to turn it on again.
function stopTimer() {
  ScriptApp.getProjectTriggers()
    .filter(function (t) { return t.getHandlerFunction() === 'syncToSheet'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
}

// The timer runs this. It can also be run by hand.
function syncToSheet() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return; // the previous run is still going

  const started = Date.now();
  try {
    const added = syncReadings_(started);
    syncDailySummaries_();
    syncAlerts_();
    writeStatus_('OK', added);
  } catch (err) {
    writeStatus_('ERROR: ' + err.message, 0);
    throw err; // shows in the Executions list, and Google emails the owner
  } finally {
    lock.releaseLock();
  }
}

// ---------------- readings ----------------

// Reads forward from the newest reading already copied.
function syncReadings_(started) {
  const props = PropertiesService.getScriptProperties();
  let lastMs = Number(props.getProperty('lastReadingMs') || 0);
  let added = 0;

  while (Date.now() - started < CONFIG.MAX_RUN_MS) {
    const data = readFirebase_('systemData/' + CONFIG.DEVICE_ID, {
      orderBy: '"timestamp"',
      startAt: lastMs + 1,
      limitToFirst: CONFIG.PAGE_SIZE,
    });
    const records = Object.keys(data || {}).map(function (k) { return data[k]; })
      .filter(function (r) { return r && typeof r.timestamp === 'number'; })
      .sort(function (a, b) { return a.timestamp - b.timestamp; });
    if (records.length === 0) break;

    const byTab = {};
    records.forEach(function (r) {
      lastMs = Math.max(lastMs, r.timestamp);
      if (!isValidReading_(r)) return;
      const tab = READINGS_PREFIX + Utilities.formatDate(new Date(r.timestamp), CONFIG.TIME_ZONE, 'yyyy-MM');
      (byTab[tab] = byTab[tab] || []).push(readingRow_(r));
    });

    Object.keys(byTab).forEach(function (tab) {
      appendRows_(getOrCreateTab_(tab, READING_HEADERS), byTab[tab]);
      added += byTab[tab].length;
    });
    props.setProperty('lastReadingMs', String(lastMs));

    if (records.length < CONFIG.PAGE_SIZE) break;
  }
  return added;
}

function isValidReading_(r) {
  return r.timestamp >= 1000000000000 && Array.isArray(r.trayWeightsGrams) && r.trayWeightsGrams.length === 5 &&
    typeof r.feedWeightGrams === 'number';
}

function readingRow_(r) {
  return [
    new Date(r.timestamp),
    r.trayWeightsGrams[0], r.trayWeightsGrams[1], r.trayWeightsGrams[2], r.trayWeightsGrams[3], r.trayWeightsGrams[4],
    r.feedWeightGrams,
    r.targetFeedGrams,
    r.hopperLevelPercent,
    r.waterLow ? 'LOW' : 'OK',
    r.feedingActive ? 'YES' : 'NO',
    r.cycleStep,
    r.currentTray,
    r.timeSource || '',
  ];
}

// ---------------- daily summaries ----------------

function syncDailySummaries_() {
  const data = readFirebase_('dailySummary/' + CONFIG.DEVICE_ID, {
    orderBy: '"$key"',
    limitToLast: CONFIG.SUMMARY_DAYS,
  });
  const sheet = getOrCreateTab_(TAB_DAILY, DAILY_HEADERS);
  const dates = Object.keys(data || {}).sort();

  dates.forEach(function (date) {
    const d = data[date];
    upsertRow_(sheet, 1, date, [
      date, d.feedGrams, d.cyclesCompleted, d.cyclesIncomplete, d.trayTimeouts,
      d.chainFaults, d.lowWaterAlerts, d.lowFeedAlerts,
      typeof d.updatedAt === 'number' ? new Date(d.updatedAt) : '',
    ]);
  });
}

// ---------------- alerts ----------------

// Firebase keeps one record per alert type. A newer time on it is a new
// occurrence, so it gets a new row. Occurrences between two runs show as one.
function syncAlerts_() {
  const data = readFirebase_('alerts/' + CONFIG.DEVICE_ID, {});
  const sheet = getOrCreateTab_(TAB_ALERTS, ALERT_HEADERS);

  Object.keys(data || {})
    .map(function (k) { return data[k]; })
    .filter(function (a) {
      return a && typeof a.name === 'string' && typeof a.timestamp === 'number' && RETIRED_ALERTS.indexOf(a.name) === -1;
    })
    .sort(function (a, b) { return a.timestamp - b.timestamp; })
    .forEach(function (a) {
      const id = a.name + '-' + a.timestamp;
      upsertRow_(sheet, 5, id, [
        new Date(a.timestamp),
        a.name,
        a.resolved ? 'RESOLVED' : 'ACTIVE',
        typeof a.resolvedAt === 'number' ? new Date(a.resolvedAt) : '',
        id,
      ]);
    });
}

// ---------------- Firebase ----------------

// Reads with the sheet owner's Google sign-in, so no password or key is stored.
// The owner must have access to the Firebase project.
function readFirebase_(path, params) {
  const query = Object.keys(params).map(function (k) {
    return k + '=' + encodeURIComponent(params[k]);
  });
  query.push('access_token=' + ScriptApp.getOAuthToken());
  const url = CONFIG.DATABASE_URL + '/' + path + '.json?' + query.join('&');

  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const code = res.getResponseCode();
  if (code !== 200) {
    // The URL holds the access token, so it is never put in a message.
    const hint = code === 401 ? ' Is this Google account on the Firebase project?' : '';
    throw new Error('Firebase read failed (HTTP ' + code + ') for ' + path + '.' + hint);
  }
  return JSON.parse(res.getContentText());
}

// ---------------- sheet helpers ----------------

function getOrCreateTab_(name, headers) {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Reading rows hold their time in the first column.
function appendRows_(sheet, rows) {
  const first = sheet.getLastRow() + 1;
  sheet.getRange(first, 1, rows.length, rows[0].length).setValues(rows);
  sheet.getRange(first, 1, rows.length, 1).setNumberFormat(TIME_FORMAT);
}

// Updates the row whose key column holds `key`, or adds one. Keys are stored as
// text, so the sheet cannot turn a date key into a date value.
function upsertRow_(sheet, keyColumn, key, row) {
  const count = sheet.getLastRow() - 1;
  const keys = count > 0 ? sheet.getRange(2, keyColumn, count, 1).getValues() : [];
  let target = -1;
  for (let i = 0; i < keys.length; i++) {
    if (String(keys[i][0]) === key) { target = i + 2; break; }
  }
  if (target === -1) target = sheet.getLastRow() + 1;
  sheet.getRange(target, keyColumn, 1, 1).setNumberFormat('@');
  sheet.getRange(target, 1, 1, row.length).setValues([row]);
  row.forEach(function (cell, i) {
    if (cell instanceof Date) sheet.getRange(target, i + 1, 1, 1).setNumberFormat(TIME_FORMAT);
  });
}

function writeStatus_(result, added) {
  const sheet = getOrCreateTab_(TAB_STATUS, ['Item', 'Value']);
  const lastMs = Number(PropertiesService.getScriptProperties().getProperty('lastReadingMs') || 0);
  const rows = [
    ['Device', CONFIG.DEVICE_ID],
    ['Last run', new Date()],
    ['Result', result],
    ['New readings in last run', added],
    ['Newest reading', lastMs > 0 ? new Date(lastMs) : 'None yet'],
  ];
  sheet.getRange(2, 1, rows.length, 2).setValues(rows);
  sheet.getRange(3, 2, 1, 1).setNumberFormat(TIME_FORMAT);
  if (lastMs > 0) sheet.getRange(6, 2, 1, 1).setNumberFormat(TIME_FORMAT);
}
