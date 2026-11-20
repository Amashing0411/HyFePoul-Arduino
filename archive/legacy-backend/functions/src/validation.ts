const ACTIONABLE_EVENTS = new Set<string>([
  "LOW_FEED", "LOW_WATER", "PUMP_TIMEOUT", "EMERGENCY_STOP",
  "DEVICE_ERROR", "DEVICE_OFFLINE",
]);

const INFORMATIONAL_EVENTS = new Set<string>([
  "FEEDING_STARTED", "FEEDING_COMPLETED", "DEVICE_ONLINE",
]);

const isValidISO8601 = (dateStr: string): boolean => {
  // Enforce strict ISO 8601 UTC format: YYYY-MM-DDTHH:mm:ssZ
  const regex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
  if (!regex.test(dateStr)) return false;

  const date = new Date(dateStr);
  return !isNaN(date.getTime());
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const validateDeviceData = (data: any):
  { valid: boolean; error?: string } => {
  if (typeof data !== "object" || data === null) {
    return {valid: false, error: "Payload must be a JSON object"};
  }

  const requiredNumeric = [
    "feedWeightGrams", "targetFeedGrams", "hopperLevelPercent",
  ];
  for (const field of requiredNumeric) {
    if (typeof data[field] !== "number") {
      return {
        valid: false,
        error: `Missing or invalid numeric field: ${field}`,
      };
    }
  }

  if (data.hopperLevelPercent < 0 || data.hopperLevelPercent > 100) {
    return {
      valid: false,
      error: "hopperLevelPercent must be between 0 and 100",
    };
  }

  const requiredBoolean = [
    "waterLow", "waterHigh", "pumpActive",
    "feedingActive", "emergencyStopActive",
  ];
  for (const field of requiredBoolean) {
    if (typeof data[field] !== "boolean") {
      return {
        valid: false,
        error: `Missing or invalid boolean field: ${field}`,
      };
    }
  }

  if (typeof data.timestamp !== "string" || !isValidISO8601(data.timestamp)) {
    return {
      valid: false,
      error: "Missing or invalid timestamp (must be ISO 8601 UTC)",
    };
  }

  return {valid: true};
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const validateDeviceEvent = (data: any):
  { valid: boolean; error?: string } => {
  if (typeof data !== "object" || data === null) {
    return {valid: false, error: "Payload must be a JSON object"};
  }

  if (typeof data.name !== "string") {
    return {valid: false, error: "Missing or invalid field: name"};
  }

  const isActionable = ACTIONABLE_EVENTS.has(data.name);
  const isInformational = INFORMATIONAL_EVENTS.has(data.name);

  if (!isActionable && !isInformational) {
    return {valid: false, error: `Unsupported event name: ${data.name}`};
  }

  if (isActionable && typeof data.eventId !== "string") {
    return {
      valid: false,
      error: "eventId is required for actionable events",
    };
  }

  if (typeof data.timestamp !== "string" || !isValidISO8601(data.timestamp)) {
    return {
      valid: false,
      error: "Missing or invalid timestamp (must be ISO 8601 UTC)",
    };
  }

  return {valid: true};
};
