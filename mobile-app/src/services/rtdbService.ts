import { ref, set, onValue, query, orderByChild, limitToLast, get, equalTo } from 'firebase/database';
import { rtdb } from './firebase';
import { RTDBDevice, RTDBDeviceState, RTDBSystemDataSnapshot, RTDBAlert, RTDBCommand, RTDBCommandAction, RTDBSchedule, RTDBScheduleStatus } from '../types/rtdb';
import { SystemData, TRAY_COUNT } from '../types';

const CYCLE_STEPS = ['IDLE', 'HOMING', 'TO_TRAY', 'TARING', 'DISPENSING', 'TO_END', 'RETURNING'];
const TIME_SOURCES = ['NETWORK', 'RTC', 'INVALID'];

/**
 * Lightweight runtime validation
 */
export const isValidDeviceState = (data: any): boolean => {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.feedWeightGrams !== 'number') return false;
  if (typeof data.targetFeedGrams !== 'number') return false;
  if (typeof data.hopperLevelPercent !== 'number') return false;
  if (!Array.isArray(data.trayWeightsGrams) || data.trayWeightsGrams.length !== TRAY_COUNT) return false;
  if (!data.trayWeightsGrams.every((g: unknown) => typeof g === 'number')) return false;
  if (typeof data.waterLow !== 'boolean') return false;
  if (typeof data.feedingActive !== 'boolean') return false;
  if (typeof data.cycleStep !== 'string' || !CYCLE_STEPS.includes(data.cycleStep)) return false;
  if (typeof data.currentTray !== 'number') return false;
  if (typeof data.emergencyStopActive !== 'boolean') return false;
  if (data.timeSource !== undefined && !TIME_SOURCES.includes(data.timeSource)) return false;
  if (typeof data.timestamp !== 'number') return false;
  return true;
};

// RTDB state (numeric timestamp) -> the app's SystemData.
export const toSystemData = (state: RTDBDeviceState): SystemData => ({
  feedWeightGrams: state.feedWeightGrams,
  targetFeedGrams: state.targetFeedGrams,
  trayWeightsGrams: state.trayWeightsGrams,
  hopperLevelPercent: state.hopperLevelPercent,
  waterLow: state.waterLow,
  feedingActive: state.feedingActive,
  cycleStep: state.cycleStep,
  currentTray: state.currentTray,
  emergencyStopActive: state.emergencyStopActive,
  timeSource: state.timeSource ?? null,
  timestamp: new Date(state.timestamp).toISOString(),
});

export const isValidDevice = (data: any): boolean => {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.status !== 'string' || !['online', 'offline'].includes(data.status)) return false;
  if (typeof data.lastHeartbeat !== 'number') return false;
  if (data.megaLinkOk !== undefined && typeof data.megaLinkOk !== 'boolean') return false;
  if (data.state !== undefined && !isValidDeviceState(data.state)) return false;
  return true;
};

export const isValidAlert = (data: any): boolean => {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.eventId !== 'string') return false;
  if (typeof data.name !== 'string') return false;
  if (typeof data.timestamp !== 'number') return false;
  if (typeof data.resolved !== 'boolean') return false;
  if (data.resolvedAt !== undefined && typeof data.resolvedAt !== 'number') return false;
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
  },

  async getDevicesByOwner(uid: string): Promise<any[]> {
    const devicesQuery = query(ref(rtdb, 'devices'), orderByChild('ownerId'), equalTo(uid));
    const snapshot = await get(devicesQuery);
    if (!snapshot.exists()) {
      return [];
    }
    const devices: any[] = [];
    snapshot.forEach((childSnap) => {
      devices.push({ id: childSnap.key, ...childSnap.val() });
    });
    return devices;
  },

  async createCommand(deviceId: string, command: RTDBCommandAction, issuedBy: string, parameters?: Record<string, any>): Promise<string> {
    const commandId = `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
    const cmdRef = ref(rtdb, `commands/${deviceId}/${commandId}`);

    const payload: RTDBCommand = {
      commandId,
      command,
      issuedBy,
      createdAt: Date.now(),
      status: 'queued'
    };
    if (parameters) {
      payload.parameters = parameters;
    }

    await set(cmdRef, payload);
    return commandId;
  },

  subscribeToCommands(deviceId: string, limit: number = 10, callback: (commands: RTDBCommand[], error?: Error) => void): () => void {
    const cmdsQuery = query(ref(rtdb, `commands/${deviceId}`), limitToLast(limit));
    const unsubscribe = onValue(
      cmdsQuery,
      (snapshot) => {
        if (!snapshot.exists()) {
          callback([]);
          return;
        }

        const records: RTDBCommand[] = [];
        snapshot.forEach((childSnap) => {
          const val = childSnap.val();
          if (val && val.commandId && val.command && val.status) { // Light validation
            records.push(val as RTDBCommand);
          }
        });

        // Sort newest first by createdAt
        records.sort((a, b) => b.createdAt - a.createdAt);
        callback(records);
      },
      (error) => {
        callback([], error);
      }
    );
    return () => unsubscribe();
  },

  async updateSchedule(deviceId: string, schedule: RTDBSchedule): Promise<void> {
    const schedRef = ref(rtdb, `schedules/${deviceId}/${schedule.scheduleId}`);
    await set(schedRef, schedule);
  },

  subscribeToSchedules(deviceId: string, callback: (schedules: RTDBSchedule[], error?: Error) => void): () => void {
    const schedQuery = query(ref(rtdb, `schedules/${deviceId}`));
    const unsubscribe = onValue(
      schedQuery,
      (snapshot) => {
        if (!snapshot.exists()) {
          callback([]);
          return;
        }

        const records: RTDBSchedule[] = [];
        snapshot.forEach((childSnap) => {
          records.push(childSnap.val() as RTDBSchedule);
        });

        callback(records);
      },
      (error) => {
        callback([], error);
      }
    );
    return () => unsubscribe();
  },

  // R-43: what the Mega accepted per slot, keyed by scheduleId.
  subscribeToScheduleStatus(
    deviceId: string,
    callback: (status: Record<string, RTDBScheduleStatus>, error?: Error) => void
  ): () => void {
    const unsubscribe = onValue(
      ref(rtdb, `scheduleStatus/${deviceId}`),
      (snapshot) => {
        const out: Record<string, RTDBScheduleStatus> = {};
        snapshot.forEach((child) => {
          const v = child.val();
          if (v && typeof v.hour === 'number' && typeof v.minute === 'number' &&
              typeof v.targetGrams === 'number' && typeof v.enabled === 'boolean' &&
              typeof v.appliedAt === 'number' && child.key) {
            out[child.key] = v as RTDBScheduleStatus;
          }
        });
        callback(out);
      },
      (error) => callback({}, error)
    );
    return () => unsubscribe();
  }
};
