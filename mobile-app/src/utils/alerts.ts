import { Alert } from '../types';

// The device has no emergency stop any more. An old record could stay active
// forever because nothing will report it released, so these are not shown.
const RETIRED_ALERT_NAMES = ['EMERGENCY_STOP'];

export const isRetiredAlert = (name: string): boolean => RETIRED_ALERT_NAMES.includes(name);

// Active alerts first, then newest first within each group.
export const sortAlerts = (alerts: Alert[]): Alert[] =>
  [...alerts].sort((a, b) =>
    a.resolved !== b.resolved
      ? (a.resolved ? 1 : -1)
      : new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
