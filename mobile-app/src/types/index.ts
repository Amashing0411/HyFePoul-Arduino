export interface SystemData {
  feedWeightGrams: number;
  hopperLevelPercent: number;
  waterLow: boolean;
  waterHigh: boolean;
  pumpActive: boolean;
  feedingActive: boolean;
  emergencyStopActive: boolean;
  timestamp: string;
}

export interface DeviceData {
  deviceId: string;
  name: string;
  status: 'online' | 'offline';
  lastHeartbeat: string;
}

export interface FeedSchedule {
  id: string;
  hour: number;
  minute: number;
  targetGrams: number;
  enabled: boolean;
}

export type AlertType = 'LOW_FEED' | 'LOW_WATER' | 'WATER_PUMP_TIMEOUT' | 'EMERGENCY_STOP' | 'DEVICE_OFFLINE';

export interface Alert {
  id: string;
  type: AlertType;
  timestamp: string;
  resolved: boolean;
}
