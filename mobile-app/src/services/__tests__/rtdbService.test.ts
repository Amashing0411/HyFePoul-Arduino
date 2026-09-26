import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('firebase/auth', () => ({
  initializeAuth: jest.fn(),
  getAuth: jest.fn(),
  getReactNativePersistence: jest.fn(),
}));

import { rtdbService, isValidDeviceState, isValidDevice, isValidAlert } from '../rtdbService';
import { RTDBDevice, RTDBDeviceState, RTDBAlert, RTDBSystemDataSnapshot } from '../../types/rtdb';
import { ref, set, get } from 'firebase/database';
import { rtdb } from '../firebase';

describe('rtdbService - Data Layer Validation & Behavior', () => {
  beforeAll(async () => {
    // Clear the emulator database before running tests
    await set(ref(rtdb, '/'), null);
  });

  afterAll(async () => {
    // Clean up
    await set(ref(rtdb, '/'), null);
  });

  describe('Validation Functions', () => {
    it('isValidDeviceState handles good and bad input', () => {
      const validState: RTDBDeviceState = {
        feedWeightGrams: 500, targetFeedGrams: 1000, hopperLevelPercent: 50,
        waterLow: false, waterHigh: true, pumpActive: false,
        feedingActive: true, emergencyStopActive: false, timestamp: 1690000000,
      };
      expect(isValidDeviceState(validState)).toBe(true);
      expect(isValidDeviceState(null)).toBe(false);
      expect(isValidDeviceState({ feedWeightGrams: '500' })).toBe(false);
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
    });
  });

  describe('Device Claiming Flow', () => {
    it('creates a claim request', async () => {
      await rtdbService.createClaimRequest('test-dev', 'user1', '123456');
      const snap = await get(ref(rtdb, 'claimRequests/test-dev'));
      expect(snap.val()).toEqual({ uid: 'user1', pin: '123456' });
    });

    it('establishes ownership', async () => {
      await rtdbService.establishOwnership('test-dev', 'user1');
      const snap = await get(ref(rtdb, 'devices/test-dev/ownerId'));
      expect(snap.val()).toEqual('user1');
    });
  });

  describe('Listeners & Runtime Filtering', () => {
    it('subscribeToDevice receives valid updates and filters invalid ones', (done) => {
      // Because we bypass security rules in this test (we just use the generic SDK which connects to the emulator
      // without auth by default, which works since we disabled rules for tests or we are testing data layer only).
      // Wait, we didn't disable rules. The generic SDK will FAIL to write to protected paths unless we are auth'd.
      // But we just successfully wrote to `claimRequests` and `ownerId` above?
      // Ah! In Checkpoint 5B.1, we ran the emulator rules. If the emulator is running WITH rules, unauth writes will fail.
      // Let's see if the tests pass first. If they fail with PERMISSION_DENIED, we'll need to mock the test to use an admin SDK or mock the RTDB module.
      
      const deviceId = 'listener-dev';
      const validDevice: RTDBDevice = {
        ownerId: 'user1', deviceAuthUid: 'esp32', status: 'online', lastHeartbeat: 1690000000
      };

      let callCount = 0;
      const unsubscribe = rtdbService.subscribeToDevice(deviceId, async (device, error) => {
        callCount++;
        if (callCount === 1) {
          // First call is null because it's empty
          expect(device).toBeNull();
          await set(ref(rtdb, `devices/${deviceId}`), validDevice);
        } else if (callCount === 2) {
          // Second call gets the valid device
          expect(device).toEqual(validDevice);
          // Now write a malformed device
          await set(ref(rtdb, `devices/${deviceId}`), { status: 'weird', lastHeartbeat: 'not_a_number' });
        } else if (callCount === 3) {
          // Third call gets an error because the data is malformed
          expect(device).toBeNull();
          expect(error).toBeDefined();
          expect(error?.message).toBe("Malformed device data received");
          unsubscribe();
          done();
        }
      });
    });

    it('subscribeToHistory returns ordered data and skips malformed', (done) => {
      const deviceId = 'hist-dev';
      const snap1 = { feedWeightGrams: 500, targetFeedGrams: 1000, hopperLevelPercent: 50, waterLow: false, waterHigh: true, pumpActive: false, feedingActive: true, emergencyStopActive: false, timestamp: 1000 };
      const snap2 = { feedWeightGrams: 400, targetFeedGrams: 1000, hopperLevelPercent: 40, waterLow: false, waterHigh: true, pumpActive: false, feedingActive: true, emergencyStopActive: false, timestamp: 2000 };
      const snapMalformed = { bad: 'data' };

      const setup = async () => {
        await set(ref(rtdb, `systemData/${deviceId}/push1`), snap1);
        await set(ref(rtdb, `systemData/${deviceId}/push2`), snap2);
        await set(ref(rtdb, `systemData/${deviceId}/push3`), snapMalformed); // Should be filtered out
        
        let initialCall = true;
        const unsubscribe = rtdbService.subscribeToHistory(deviceId, 5, (records, error) => {
          if (!initialCall) return;
          initialCall = false;
          expect(error).toBeUndefined();
          expect(records.length).toBe(2);
          // Ordered by timestamp (ascending)
          expect(records[0].timestamp).toBe(1000);
          expect(records[1].timestamp).toBe(2000);
          unsubscribe();
          done();
        });
      };
      setup();
    });

    it('subscribeToAlerts returns ordered alerts and skips malformed', (done) => {
      const deviceId = 'alert-dev';
      const alert1: RTDBAlert = { eventId: '1', name: 'LOW_FEED', timestamp: 3000, resolved: false };
      const alert2: RTDBAlert = { eventId: '2', name: 'LOW_WATER', timestamp: 1000, resolved: true };
      const badAlert = { eventId: '3' };

      const setup = async () => {
        await set(ref(rtdb, `alerts/${deviceId}/push1`), alert1);
        await set(ref(rtdb, `alerts/${deviceId}/push2`), alert2);
        await set(ref(rtdb, `alerts/${deviceId}/push3`), badAlert); // filtered
        
        let initialCall = true;
        const unsubscribe = rtdbService.subscribeToAlerts(deviceId, 5, (alerts, error) => {
          if (!initialCall) return;
          initialCall = false;
          expect(error).toBeUndefined();
          expect(alerts.length).toBe(2);
          // Ordered by timestamp: 1000 first, 3000 second
          expect(alerts[0].timestamp).toBe(1000);
          expect(alerts[1].timestamp).toBe(3000);
          unsubscribe();
          done();
        });
      };
      setup();
    });
  });
});
