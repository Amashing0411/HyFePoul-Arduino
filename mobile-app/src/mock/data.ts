import { SystemData, DeviceData, FeedSchedule, Alert } from '../types';

export const mockDeviceData: DeviceData = {
  deviceId: 'HYFE-001',
  name: 'Main Coop Feeder',
  status: 'online',
  lastHeartbeat: new Date().toISOString(),
  megaLinkOk: true,
};

export const mockSystemData: SystemData = {
  feedWeightGrams: 250,
  targetFeedGrams: 50,
  trayWeightsGrams: [50, 50, 50, 50, 50],
  hopperLevelPercent: 65,
  waterLow: false,
  feedingActive: false,
  cycleStep: 'IDLE',
  currentTray: 0,
  timeSource: 'NETWORK',
  emergencyStopActive: false,
  timestamp: new Date().toISOString(),
};

export const mockSchedules: FeedSchedule[] = [
  { id: '1', hour: 7, minute: 0, targetGrams: 50, enabled: true },
  { id: '2', hour: 12, minute: 0, targetGrams: 50, enabled: true },
  { id: '3', hour: 18, minute: 0, targetGrams: 50, enabled: false },
];

export const mockAlerts: Alert[] = [
  { id: 'a1', type: 'LOW_FEED', timestamp: new Date(Date.now() - 3600000).toISOString(), resolved: true },
  { id: 'a2', type: 'EMERGENCY_STOP', timestamp: new Date(Date.now() - 7200000).toISOString(), resolved: true },
  { id: 'a3', type: 'DEVICE_OFFLINE', timestamp: new Date(Date.now() - 86400000).toISOString(), resolved: false },
];

// Generate some history mock data
export const mockHistory: SystemData[] = Array.from({ length: 10 }).map((_, i) => ({
  ...mockSystemData,
  feedWeightGrams: 200 + Math.random() * 50,
  hopperLevelPercent: 80 - i * 5,
  timestamp: new Date(Date.now() - i * 3600000).toISOString(),
}));
