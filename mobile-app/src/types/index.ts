// Feed cycle step reported by the Mega (moving hopper over 5 trays).
export type CycleStep = 'IDLE' | 'HOMING' | 'TO_TRAY' | 'TARING' | 'DISPENSING' | 'TO_END' | 'RETURNING';

export const TRAY_COUNT = 5;

// Where the Mega's clock comes from: network time via the ESP32, its own
// backup RTC, or neither (clock not set).
export type TimeSource = 'NETWORK' | 'RTC' | 'INVALID';

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
  timeSource: TimeSource | null; // null when not reported (older firmware)
  timestamp: string;
}

export interface DeviceData {
  deviceId: string;
  name: string;
  status: 'online' | 'offline' | null;
  lastHeartbeat: string | null;
  // The ESP32's report on whether the Mega is still sending data; null when
  // not reported yet (older firmware).
  megaLinkOk: boolean | null;
}

export interface FeedSchedule {
  id: string;
  hour: number;
  minute: number;
  targetGrams: number;
  enabled: boolean;
}

export type AlertType = 'LOW_FEED' | 'LOW_WATER' | 'CHAIN_TIMEOUT' | 'TRAY_TIMEOUT' | 'EMERGENCY_STOP' | 'CONTROLLER_OFFLINE' | 'DEVICE_OFFLINE';

export interface Alert {
  id: string;
  type: AlertType;
  timestamp: string;
  resolved: boolean;
  resolvedAt?: string; // when the device reported the condition cleared
}
