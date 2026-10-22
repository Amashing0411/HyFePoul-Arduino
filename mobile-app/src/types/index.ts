// Feed cycle step reported by the Mega (moving hopper over 5 trays).
export type CycleStep = 'IDLE' | 'HOMING' | 'TO_TRAY' | 'TARING' | 'DISPENSING' | 'TO_END' | 'RETURNING';

export const TRAY_COUNT = 5;

export interface SystemData {
  feedWeightGrams: number;    // total feed in the 5 trays
  targetFeedGrams: number;    // target per tray for the running/last cycle
  trayWeightsGrams: number[]; // grams in trays 1-5
  hopperLevelPercent: number;
  waterLow: boolean;          // reservoir float switch reads low
  feedingActive: boolean;
  cycleStep: CycleStep;
  currentTray: number;        // 1-5 while at/heading to a tray, else 0
  emergencyStopActive: boolean;
  timestamp: string;
}

export interface DeviceData {
  deviceId: string;
  name: string;
  status: 'online' | 'offline' | null;
  lastHeartbeat: string | null;
}

export interface FeedSchedule {
  id: string;
  hour: number;
  minute: number;
  targetGrams: number;
  enabled: boolean;
}

export type AlertType = 'LOW_FEED' | 'LOW_WATER' | 'CHAIN_TIMEOUT' | 'TRAY_TIMEOUT' | 'EMERGENCY_STOP' | 'DEVICE_OFFLINE';

export interface Alert {
  id: string;
  type: AlertType;
  timestamp: string;
  resolved: boolean;
}
