import { Alert } from '../types';

// Active alerts first, then newest first within each group.
export const sortAlerts = (alerts: Alert[]): Alert[] =>
  [...alerts].sort((a, b) =>
    a.resolved !== b.resolved
      ? (a.resolved ? 1 : -1)
      : new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
