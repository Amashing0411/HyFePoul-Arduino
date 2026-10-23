import { describe, it, expect } from '@jest/globals';
import { offlineNotificationAction } from '../offlineNotification';

describe('offlineNotificationAction (R-40)', () => {
  it('uses the first status as a baseline: offline does not notify', () => {
    expect(offlineNotificationAction(null, false)).toBeNull();
  });

  it('clears a notification left from before a restart when first seen online', () => {
    expect(offlineNotificationAction(null, true)).toBe('dismiss');
  });

  it('notifies once when the device goes offline', () => {
    expect(offlineNotificationAction(true, false)).toBe('notifyOffline');
    expect(offlineNotificationAction(false, false)).toBeNull();
  });

  it('dismisses when the device is back online', () => {
    expect(offlineNotificationAction(false, true)).toBe('dismiss');
    expect(offlineNotificationAction(true, true)).toBeNull();
  });
});
