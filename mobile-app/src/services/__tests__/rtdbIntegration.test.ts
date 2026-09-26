import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';

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

import { app, auth, rtdb } from '../firebase';
import { rtdbService } from '../rtdbService';
import { RTDBDeviceState } from '../../types/rtdb';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { ref, set, get } from 'firebase/database';

// Helper to seed database bypassing rules
const adminPut = async (path: string, data: any) => {
  const url = `http://127.0.0.1:9000/${path}.json?ns=hyfepoul-dev-default-rtdb`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Authorization': 'Bearer owner' },
    body: JSON.stringify(data)
  });
  if (!res.ok) throw new Error(`adminPut failed: ${res.statusText}`);
};

const setupUsers = async () => {
  const users = [
    { email: 'usera@test.com', password: 'password' },
    { email: 'userb@test.com', password: 'password' },
    { email: 'deva@test.com', password: 'password' },
    { email: 'devb@test.com', password: 'password' },
  ];
  const uids: Record<string, string> = {};
  for (const u of users) {
    try {
      // Create user if not exists
      const cred = await createUserWithEmailAndPassword(auth, u.email, u.password);
      uids[u.email.split('@')[0]] = cred.user.uid;
    } catch (e: any) {
      if (e.code === 'auth/email-already-in-use') {
        const cred = await signInWithEmailAndPassword(auth, u.email, u.password);
        uids[u.email.split('@')[0]] = cred.user.uid;
      } else {
        throw e;
      }
    }
  }
  return uids;
};

describe('Checkpoint 5B.3 - Authenticated RTDB Integration', () => {
  let uids: Record<string, string> = {};

  beforeAll(async () => {
    // 1. Wipe DB
    await adminPut('', null);

    // 2. Create users
    uids = await setupUsers();
    await signOut(auth);

    // 3. Seed Device Secrets and initial device skeleton
    await adminPut('deviceSecrets', {
      'device-001': { setupPin: '123456' },
      'device-002': { setupPin: '654321' }
    });
    
    await adminPut('devices/device-001', {
      deviceAuthUid: uids['deva'],
      status: 'offline',
      lastHeartbeat: 0
    });
    await adminPut('devices/device-002', {
      deviceAuthUid: uids['devb'],
      status: 'offline',
      lastHeartbeat: 0
    });
  });

  afterAll(async () => {
    await signOut(auth);
  });

  const getCallbackPromise = (fn: any, ...args: any[]) => new Promise<{data: any, error: any}>((resolve) => {
    const unsub = fn(...args, (data: any, error: any) => {
      unsub();
      resolve({ data, error });
    });
  });

  describe('Unauthenticated Client', () => {
    it('fails to read device data', async () => {
      await signOut(auth);
      const res = await getCallbackPromise(rtdbService.subscribeToDevice, 'device-001');
      expect(res.data).toBeNull();
      expect(res.error).toBeDefined();
      expect(res.error.message).toMatch(/permission_denied/i);
    });
  });

  describe('Claiming Flow Integration (User A)', () => {
    beforeAll(async () => {
      await signOut(auth);
      await signInWithEmailAndPassword(auth, 'usera@test.com', 'password');
    });

    it('fails with wrong PIN', async () => {
      await expect(rtdbService.createClaimRequest('device-001', uids['usera'], 'wrong')).rejects.toThrow(/permission/i);
    });

    it('succeeds with correct PIN', async () => {
      await rtdbService.createClaimRequest('device-001', uids['usera'], '123456');
      const res = await fetch(`http://127.0.0.1:9000/claimRequests/device-001.json?ns=hyfepoul-dev-default-rtdb`, { headers: { Authorization: 'Bearer owner' } });
      const snap = await res.json();
      expect(snap).toEqual({ uid: uids['usera'], pin: '123456' });
    });

    it('establishes ownership after valid claim', async () => {
      await rtdbService.establishOwnership('device-001', uids['usera']);
      const res = await fetch(`http://127.0.0.1:9000/devices/device-001/ownerId.json?ns=hyfepoul-dev-default-rtdb`, { headers: { Authorization: 'Bearer owner' } });
      const snap = await res.json();
      expect(snap).toEqual(uids['usera']);
    });
  });

  describe('Owner Authorization (User A)', () => {
    beforeAll(async () => {
      await signOut(auth);
      await signInWithEmailAndPassword(auth, 'usera@test.com', 'password');
    });

    it('allows owner to read device state', async () => {
      const res = await getCallbackPromise(rtdbService.subscribeToDevice, 'device-001');
      expect(res.error).toBeUndefined();
      expect(res.data.ownerId).toBe(uids['usera']);
    });

    it('prevents owner from modifying state directly', async () => {
      await expect(set(ref(rtdb, 'devices/device-001/state/pumpActive'), true)).rejects.toThrow(/permission/i);
    });

    it('prevents owner from modifying ownerId after initial claim', async () => {
      await expect(set(ref(rtdb, 'devices/device-001/ownerId'), 'some_other_uid')).rejects.toThrow(/permission/i);
    });

    it('prevents owner from modifying deviceAuthUid', async () => {
      await expect(set(ref(rtdb, 'devices/device-001/deviceAuthUid'), 'hacker')).rejects.toThrow(/permission/i);
    });

    it('prevents owner from reading setupPin', async () => {
      await expect(get(ref(rtdb, 'deviceSecrets/device-001/setupPin'))).rejects.toThrow(/permission/i);
    });
  });

  describe('Unauthorized User (User B)', () => {
    beforeAll(async () => {
      await signOut(auth);
      await signInWithEmailAndPassword(auth, 'userb@test.com', 'password');
    });

    it('prevents User B from reading User A device', async () => {
      const res = await getCallbackPromise(rtdbService.subscribeToDevice, 'device-001');
      expect(res.error).toBeDefined();
      expect(res.error.message).toMatch(/permission/i);
    });

    it('prevents User B from claiming already claimed device', async () => {
      await expect(rtdbService.createClaimRequest('device-001', uids['userb'], '123456')).rejects.toThrow(/permission/i);
    });

    it('prevents User B from replaying an old claim request to transfer ownership', async () => {
      // Even if User B somehow wrote a claim request in the past before it was owned,
      // User B cannot change the ownerId because data.val() == null check fails.
      await expect(set(ref(rtdb, 'devices/device-001/ownerId'), uids['userb'])).rejects.toThrow(/permission/i);
    });
  });

  describe('Device Authorization (Device A)', () => {
    beforeAll(async () => {
      await signOut(auth);
      await signInWithEmailAndPassword(auth, 'deva@test.com', 'password');
    });

    it('allows Device A to write its own state', async () => {
      const state: RTDBDeviceState = {
        feedWeightGrams: 500, targetFeedGrams: 1000, hopperLevelPercent: 50,
        waterLow: false, waterHigh: true, pumpActive: false,
        feedingActive: true, emergencyStopActive: false, timestamp: 1690000000,
      };
      await set(ref(rtdb, 'devices/device-001/state'), state);
    });

    it('prevents Device A from modifying ownerId', async () => {
      await expect(set(ref(rtdb, 'devices/device-001/ownerId'), 'hacker')).rejects.toThrow(/permission_denied/i);
    });

    it('prevents Device A from writing Device B', async () => {
      await expect(set(ref(rtdb, 'devices/device-002/state/feedWeightGrams'), 500)).rejects.toThrow(/permission_denied/i);
    });
  });

  describe('Runtime Validation & Listeners (Service Layer)', () => {
    it('safely skips malformed history records', async () => {
      await adminPut('systemData/device-001/p1', { timestamp: 1000, feedWeightGrams: 500, targetFeedGrams: 1000, hopperLevelPercent: 50, waterLow: false, waterHigh: true, pumpActive: false, feedingActive: true, emergencyStopActive: false }); // Valid
      await adminPut('systemData/device-001/p2', { timestamp: 2000, feedWeightGrams: "invalid" }); // Malformed

      await signOut(auth);
      await signInWithEmailAndPassword(auth, 'usera@test.com', 'password');

      const res = await getCallbackPromise(rtdbService.subscribeToHistory, 'device-001', 10);
      expect(res.error).toBeUndefined();
      expect(res.data.length).toBe(1); 
      expect(res.data[0].timestamp).toBe(1000);
    });

    it('safely filters malformed device state on subscribeToDevice', async () => {
      await adminPut('devices/device-001/status', 'weird_status'); 

      const res = await getCallbackPromise(rtdbService.subscribeToDevice, 'device-001');
      expect(res.data).toBeNull();
      expect(res.error).toBeDefined();
      expect(res.error.message).toMatch(/Malformed device data/);
    });
  });

  describe('Authentication Lifecycle & Teardown', () => {
    it('prevents access after sign-out', async () => {
      await signOut(auth);
      const res = await getCallbackPromise(rtdbService.subscribeToDevice, 'device-001');
      expect(res.error).toBeDefined();
    });
  });
});
