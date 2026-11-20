export interface DeviceDataPayload {
  feedWeightGrams: number;
  targetFeedGrams: number;
  hopperLevelPercent: number;
  waterLow: boolean;
  waterHigh: boolean;
  pumpActive: boolean;
  feedingActive: boolean;
  emergencyStopActive: boolean;
  timestamp: string;
}

export type ActionableEventName =
  | "LOW_FEED"
  | "LOW_WATER"
  | "PUMP_TIMEOUT"
  | "EMERGENCY_STOP"
  | "DEVICE_ERROR"
  | "DEVICE_OFFLINE";

export type InformationalEventName =
  | "FEEDING_STARTED"
  | "FEEDING_COMPLETED"
  | "DEVICE_ONLINE";

export interface DeviceEventPayload {
  eventId?: string; // Required for actionable, optional for info
  name: ActionableEventName | InformationalEventName;
  timestamp: string;
}
