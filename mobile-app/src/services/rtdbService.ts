import { ref, set, onValue, query, orderByChild, limitToLast, update, get } from 'firebase/database';
import { rtdb } from './firebase';
import { RTDBDevice, RTDBSystemDataSnapshot, RTDBAlert } from '../types/rtdb';

/**
 * Service layer for interacting with Firebase Realtime Database.
 * This encapsulates all the RTDB read/write logic for the mobile app.
 */
export const rtdbService = {
  /**
   * Step 1 of the Device Claiming Process:
   * Writes the user's UID and the provided PIN to the secure claimRequests node.
   * If the PIN is incorrect, RTDB security rules will reject the write.
   */
  async createClaimRequest(deviceId: string, uid: string, pin: string): Promise<void> {
    const claimRef = ref(rtdb, `claimRequests/${deviceId}`);
    await set(claimRef, { uid, pin });
  },

  /**
   * Step 2 of the Device Claiming Process:
   * Asserts ownership of the device by writing the UID to ownerId.
   * RTDB security rules will reject this if the claim request from Step 1 is invalid.
   */
  async establishOwnership(deviceId: string, uid: string): Promise<void> {
    const ownerRef = ref(rtdb, `devices/${deviceId}/ownerId`);
    await set(ownerRef, uid);
  },

  /**
   * Listen to real-time changes on the current device state.
   */
  subscribeToDevice(deviceId: string, callback: (device: RTDBDevice | null) => void): () => void {
    const deviceRef = ref(rtdb, `devices/${deviceId}`);
    const unsubscribe = onValue(deviceRef, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as RTDBDevice);
      } else {
        callback(null);
      }
    }, (error) => {
      console.error(`Error listening to device ${deviceId}:`, error);
    });

    return () => unsubscribe();
  },

  /**
   * Listen to the most recent historical snapshots (e.g., last 50).
   */
  subscribeToHistory(deviceId: string, limit: number = 50, callback: (data: Record<string, RTDBSystemDataSnapshot>) => void): () => void {
    const historyQuery = query(ref(rtdb, `systemData/${deviceId}`), limitToLast(limit));
    const unsubscribe = onValue(historyQuery, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as Record<string, RTDBSystemDataSnapshot>);
      } else {
        callback({});
      }
    }, (error) => {
      console.error(`Error listening to history for ${deviceId}:`, error);
    });

    return () => unsubscribe();
  },

  /**
   * Listen to device alerts.
   */
  subscribeToAlerts(deviceId: string, limit: number = 20, callback: (alerts: Record<string, RTDBAlert>) => void): () => void {
    const alertsQuery = query(ref(rtdb, `alerts/${deviceId}`), limitToLast(limit));
    const unsubscribe = onValue(alertsQuery, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.val() as Record<string, RTDBAlert>);
      } else {
        callback({});
      }
    }, (error) => {
      console.error(`Error listening to alerts for ${deviceId}:`, error);
    });

    return () => unsubscribe();
  }
};
