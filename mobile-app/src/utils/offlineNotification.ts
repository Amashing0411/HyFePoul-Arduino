// Decides what to do with the "device offline" phone notification when the
// device's online status is re-evaluated (R-40).
//
// previous: the last online status seen, or null before the first one (the
// first status after the app opens is a baseline, so opening the app while
// the device is already offline does not notify).
//
// The notification has a fixed identifier, so an online device clears it
// even when it was posted before the app restarted: a first status of
// "online" also returns 'dismiss' (harmless when nothing is shown).
export type OfflineNotificationAction = 'notifyOffline' | 'dismiss' | null;

export const OFFLINE_NOTIFICATION_ID = 'device-offline';

export function offlineNotificationAction(
  previous: boolean | null,
  current: boolean
): OfflineNotificationAction {
  if (previous === null) return current ? 'dismiss' : null;
  if (previous === current) return null;
  return current ? 'dismiss' : 'notifyOffline';
}
