import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import { deleteApp } from 'firebase/app';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('firebase/auth', () => {
  const actual = jest.requireActual('firebase/auth') as any;
  return {
    ...actual,
    getReactNativePersistence: jest.fn(),
  };
});

process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR = 'true';
process.env.EXPO_PUBLIC_EMULATOR_HOST = '127.0.0.1';

import { rtdbService, isValidDeviceState, isValidDevice, isValidAlert } from '../rtdbService';
import { RTDBDevice, RTDBDeviceState, RTDBAlert, RTDBDailySummary } from '../../types/rtdb';
import { auth } from '../firebase';
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';

// Seeds the emulator as admin (bypasses security rules). Each run uses its
// own device IDs and never wipes the root, so it cannot disturb other suites.
const adminPut = async (path: string, data: any) => {
  const url = `http://127.0.0.1:9000/${path}.json?ns=hyfepoul-dev-default-rtdb`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer owner' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`adminPut failed: ${res.statusText}`);
};

const runId = Date.now().toString(36);
const deviceIds = {
  owned: `svc-owned-${runId}`,
  other: `svc-other-${runId}`,
  listener: `svc-listener-${runId}`,
};

const getFirstCallback = <T>(subscribe: (cb: (data: T, error?: Error) => void) => () => void) =>
  new Promise<{ data: T; error?: Error }>((resolve) => {
    let unsubscribe: (() => void) | undefined;
    let done = false;
    unsubscribe = subscribe((data, error) => {
      if (done) return;
      done = true;
      // The callback can fire before subscribe() returns.
      setTimeout(() => unsubscribe && unsubscribe(), 0);
      resolve({ data, error });
    });
  });

describe('rtdbService - validation functions', () => {
  it('isValidDeviceState handles good and bad input', () => {
    const validState: RTDBDeviceState = {
      feedWeightGrams: 500, targetFeedGrams: 50, hopperLevelPercent: 50,
      trayWeightsGrams: [50, 50, 50, 50, 50], waterLow: false, cycleStep: 'DISPENSING', currentTray: 3,
      feedingActive: true, emergencyStopActive: false, timestamp: 1690000000,
    };
    expect(isValidDeviceState(validState)).toBe(true);
    expect(isValidDeviceState(null)).toBe(false);
    expect(isValidDeviceState({ feedWeightGrams: '500' })).toBe(false);
    // Moving-hopper state: exactly 5 numeric tray weights and a known cycle step.
    expect(isValidDeviceState({ ...validState, trayWeightsGrams: [1, 2, 3, 4] })).toBe(false);
    expect(isValidDeviceState({ ...validState, trayWeightsGrams: [1, 2, 'x', 4, 5] })).toBe(false);
    expect(isValidDeviceState({ ...validState, cycleStep: 'PUMPING' })).toBe(false);
    // R-44: timeSource is optional; when present it must be a known value.
    expect(isValidDeviceState({ ...validState, timeSource: 'RTC' })).toBe(true);
    expect(isValidDeviceState({ ...validState, timeSource: 'GPS' })).toBe(false);
    // Old pump-era records (no tray fields) are not shown.
    const { trayWeightsGrams: _t, cycleStep: _c, currentTray: _n, ...oldShape } = validState;
    expect(isValidDeviceState({ ...oldShape, waterHigh: true, pumpActive: false })).toBe(false);
  });

  it('isValidDevice handles good and bad input', () => {
    const validDevice: RTDBDevice = { ownerId: 'user1', deviceAuthUid: 'esp32', status: 'online', lastHeartbeat: 1690000000 };
    expect(isValidDevice(validDevice)).toBe(true);
    expect(isValidDevice({ status: 'broken', lastHeartbeat: 123 })).toBe(false);
  });

  it('isValidAlert handles good and bad input', () => {
    const alert: RTDBAlert = { eventId: 'evt1', name: 'LOW_FEED', timestamp: 12345, resolved: false };
    expect(isValidAlert(alert)).toBe(true);
    expect(isValidAlert({ name: 'LOW_FEED' })).toBe(false);
    // R-23: resolvedAt is optional but must be a number when present.
    expect(isValidAlert({ ...alert, resolved: true, resolvedAt: 12400 })).toBe(true);
    expect(isValidAlert({ ...alert, resolved: true, resolvedAt: 'later' })).toBe(false);
  });
});

// Claiming and owner/device authorization are covered by
// rtdbIntegration.test.ts; this suite covers the service-layer queries and
// runtime filtering as an authenticated owner.
describe('rtdbService - owner data access (emulator)', () => {
  let ownerUid = '';

  beforeAll(async () => {
    const cred = await createUserWithEmailAndPassword(auth, `svc-owner-${runId}@test.com`, 'password');
    ownerUid = cred.user.uid;

    const device = (ownerId: string): RTDBDevice => ({
      ownerId, deviceAuthUid: `esp32-${runId}`, status: 'online', lastHeartbeat: 1690000000,
    });
    await adminPut(`devices/${deviceIds.owned}`, device(ownerUid));
    await adminPut(`devices/${deviceIds.other}`, device(`someone-else-${runId}`));
    await adminPut(`devices/${deviceIds.listener}`, { ...device(ownerUid), status: 'weird', lastHeartbeat: 'not_a_number' });

    const snapshot = (feedWeightGrams: number, timestamp: number): RTDBDeviceState => ({
      feedWeightGrams, targetFeedGrams: 50, hopperLevelPercent: 50, trayWeightsGrams: [50, 50, 50, 50, 50], waterLow: false, cycleStep: 'DISPENSING', currentTray: 3, feedingActive: true, emergencyStopActive: false, timestamp,
    });
    await adminPut(`systemData/${deviceIds.owned}`, {
      push1: snapshot(500, 1000),
      push2: snapshot(400, 2000),
      push3: { bad: 'data' },
    });

    await adminPut(`alerts/${deviceIds.owned}`, {
      push1: { eventId: '1', name: 'LOW_FEED', timestamp: 3000, resolved: false },
      push2: { eventId: '2', name: 'LOW_WATER', timestamp: 1000, resolved: true },
      push3: { eventId: '3' },
    });

    const day = (date: string, feedGrams: number) => ({
      date, feedGrams, cyclesCompleted: 3, cyclesIncomplete: 0, trayTimeouts: 0, chainFaults: 0,
      lowWaterAlerts: 0, lowFeedAlerts: 0, emergencyStops: 0, updatedAt: 1,
    });
    await adminPut(`dailySummary/${deviceIds.owned}`, {
      '2026-09-30': day('2026-09-30', 100),
      '2026-10-01': day('2026-10-01', 700),
      '2026-10-15': day('2026-10-15', 750),
      '2026-10-20': { date: '2026-10-20', feedGrams: -1 },
      '2026-11-01': day('2026-11-01', 800),
    });
  });

  afterAll(async () => {
    await signOut(auth);
    await deleteApp(auth.app);
  });

  it('getDevicesByOwner returns only the signed-in owner\'s devices', async () => {
    const devices = await rtdbService.getDevicesByOwner(ownerUid);
    const ids = devices.map((d) => d.id).sort();
    expect(ids).toEqual([deviceIds.listener, deviceIds.owned].sort());
  });

  it('subscribeToDevice reports malformed device data as an error', async () => {
    const res = await getFirstCallback<RTDBDevice | null>((cb) => rtdbService.subscribeToDevice(deviceIds.listener, cb));
    expect(res.data).toBeNull();
    expect(res.error?.message).toBe('Malformed device data received');
  });

  it('subscribeToHistory returns ordered data and skips malformed records', async () => {
    const res = await getFirstCallback<any[]>((cb) => rtdbService.subscribeToHistory(deviceIds.owned, 5, cb));
    expect(res.error).toBeUndefined();
    expect(res.data.map((r) => r.timestamp)).toEqual([1000, 2000]);
  });

  it('subscribeToAlerts returns ordered alerts and skips malformed ones', async () => {
    const res = await getFirstCallback<RTDBAlert[]>((cb) => rtdbService.subscribeToAlerts(deviceIds.owned, 5, cb));
    expect(res.error).toBeUndefined();
    expect(res.data.map((a) => a.timestamp)).toEqual([1000, 3000]);
  });

  it('subscribeToDailySummaries returns one month in date order and skips malformed days', async () => {
    const res = await getFirstCallback<RTDBDailySummary[]>((cb) =>
      rtdbService.subscribeToDailySummaries(deviceIds.owned, '2026-10-01', '2026-10-31', cb));
    expect(res.error).toBeUndefined();
    expect(res.data.map((d) => [d.date, d.feedGrams])).toEqual([['2026-10-01', 700], ['2026-10-15', 750]]);
  });
});
