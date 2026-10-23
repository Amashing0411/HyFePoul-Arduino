// Decides what to do with the "device offline" phone notification when the
// device's online status is re-evaluated (R-40).
//
// previous: the last online status seen, or null before the first one (the
// first status after the app opens is a baseline, so opening the app while
// the device is already offline does not notify).
export type OfflineNotificationAction = 'notifyOffline' | 'dismiss' | null;

export function offlineNotificationAction(
  previous: boolean | null,
  current: boolean
): OfflineNotificationAction {
  if (previous === null || previous === current) return null;
  return current ? 'dismiss' : 'notifyOffline';
}
