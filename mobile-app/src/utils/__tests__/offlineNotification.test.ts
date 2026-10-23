import { describe, it, expect } from '@jest/globals';
import { offlineNotificationAction } from '../offlineNotification';

describe('offlineNotificationAction (R-40)', () => {
  it('uses the first status as a baseline, even if offline', () => {
    expect(offlineNotificationAction(null, false)).toBeNull();
    expect(offlineNotificationAction(null, true)).toBeNull();
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
