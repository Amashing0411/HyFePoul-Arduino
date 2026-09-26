import { ref, set, onValue, query, orderByChild, limitToLast } from 'firebase/database';
import { rtdb } from './firebase';
import { RTDBDevice, RTDBSystemDataSnapshot, RTDBAlert } from '../types/rtdb';

/**
 * Lightweight runtime validation
 */
export const isValidDeviceState = (data: any): boolean => {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.feedWeightGrams !== 'number') return false;
  if (typeof data.targetFeedGrams !== 'number') return false;
  if (typeof data.hopperLevelPercent !== 'number') return false;
  if (typeof data.waterLow !== 'boolean') return false;
  if (typeof data.waterHigh !== 'boolean') return false;
  if (typeof data.pumpActive !== 'boolean') return false;
  if (typeof data.feedingActive !== 'boolean') return false;
  if (typeof data.emergencyStopActive !== 'boolean') return false;
  if (typeof data.timestamp !== 'number') return false;
  return true;
};

export const isValidDevice = (data: any): boolean => {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.status !== 'string' || !['online', 'offline'].includes(data.status)) return false;
  if (typeof data.lastHeartbeat !== 'number') return false;
  if (data.state !== undefined && !isValidDeviceState(data.state)) return false;
  return true;
};

export const isValidAlert = (data: any): boolean => {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.eventId !== 'string') return false;
  if (typeof data.name !== 'string') return false;
  if (typeof data.timestamp !== 'number') return false;
  if (typeof data.resolved !== 'boolean') return false;
  return true;
};

/**
 * Service layer for interacting with Firebase Realtime Database.
 */
export const rtdbService = {
  async createClaimRequest(deviceId: string, uid: string, pin: string): Promise<void> {
    const claimRef = ref(rtdb, `claimRequests/${deviceId}`);
    await set(claimRef, { uid, pin });
  },

  async establishOwnership(deviceId: string, uid: string): Promise<void> {
    const ownerRef = ref(rtdb, `devices/${deviceId}/ownerId`);
    await set(ownerRef, uid);
  },

  subscribeToDevice(deviceId: string, callback: (device: RTDBDevice | null, error?: Error) => void): () => void {
    const deviceRef = ref(rtdb, `devices/${deviceId}`);
    const unsubscribe = onValue(
      deviceRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          callback(null);
          return;
        }
        const val = snapshot.val();
        if (isValidDevice(val)) {
          callback(val as RTDBDevice);
        } else {
          // Reject malformed data safely instead of crashing
          callback(null, new Error("Malformed device data received"));
        }
      },
      (error) => {
        callback(null, error);
      }
    );
    return () => unsubscribe();
  },

  subscribeToHistory(deviceId: string, limit: number = 50, callback: (data: RTDBSystemDataSnapshot[], error?: Error) => void): () => void {
    // We order by timestamp physically in the query
    const historyQuery = query(ref(rtdb, `systemData/${deviceId}`), orderByChild('timestamp'), limitToLast(limit));
    const unsubscribe = onValue(
      historyQuery,
      (snapshot) => {
        if (!snapshot.exists()) {
          callback([]);
          return;
        }
        
        const records: RTDBSystemDataSnapshot[] = [];
        // snapshot.forEach respects the order requested by orderByChild
        snapshot.forEach((childSnap) => {
          const val = childSnap.val();
          if (isValidDeviceState(val)) {
            records.push(val as RTDBSystemDataSnapshot);
          }
        });
        
        callback(records);
      },
      (error) => {
        callback([], error);
      }
    );
    return () => unsubscribe();
  },

  subscribeToAlerts(deviceId: string, limit: number = 20, callback: (alerts: RTDBAlert[], error?: Error) => void): () => void {
    const alertsQuery = query(ref(rtdb, `alerts/${deviceId}`), orderByChild('timestamp'), limitToLast(limit));
    const unsubscribe = onValue(
      alertsQuery,
      (snapshot) => {
        if (!snapshot.exists()) {
          callback([]);
          return;
        }
        
        const records: RTDBAlert[] = [];
        snapshot.forEach((childSnap) => {
          const val = childSnap.val();
          if (isValidAlert(val)) {
            records.push(val as RTDBAlert);
          }
        });
        
        // Return latest alerts
        callback(records);
      },
      (error) => {
        callback([], error);
      }
    );
    return () => unsubscribe();
  }
};
