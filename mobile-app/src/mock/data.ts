import { SystemData, DeviceData, FeedSchedule, Alert } from '../types';

export const mockDeviceData: DeviceData = {
  deviceId: 'HYFE-001',
  name: 'Main Coop Feeder',
  status: 'online',
  lastHeartbeat: new Date().toISOString(),
};

export const mockSystemData: SystemData = {
  feedWeightGrams: 450,
  hopperLevelPercent: 65,
  waterLow: false,
  waterHigh: true,
  pumpActive: false,
  feedingActive: false,
  emergencyStopActive: false,
  timestamp: new Date().toISOString(),
};

export const mockSchedules: FeedSchedule[] = [
  { id: '1', hour: 7, minute: 0, targetGrams: 500, enabled: true },
  { id: '2', hour: 12, minute: 0, targetGrams: 500, enabled: true },
  { id: '3', hour: 18, minute: 0, targetGrams: 500, enabled: false },
];

export const mockAlerts: Alert[] = [
  { id: 'a1', type: 'LOW_FEED', timestamp: new Date(Date.now() - 3600000).toISOString(), resolved: true },
  { id: 'a2', type: 'EMERGENCY_STOP', timestamp: new Date(Date.now() - 7200000).toISOString(), resolved: true },
  { id: 'a3', type: 'DEVICE_OFFLINE', timestamp: new Date(Date.now() - 86400000).toISOString(), resolved: false },
];

// Generate some history mock data
export const mockHistory: SystemData[] = Array.from({ length: 10 }).map((_, i) => ({
  ...mockSystemData,
  feedWeightGrams: 400 + Math.random() * 100,
  hopperLevelPercent: 80 - i * 5,
  timestamp: new Date(Date.now() - i * 3600000).toISOString(),
}));
