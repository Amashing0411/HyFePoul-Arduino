import { describe, it, expect } from '@jest/globals';
import { heartbeatAgeMs, isDeviceOnline, OFFLINE_AFTER_MS } from '../deviceStatus';

const NOW = Date.UTC(2026, 9, 21, 6, 0, 0);
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('deviceStatus', () => {
  it('is online with a recent heartbeat and status online', () => {
    expect(isDeviceOnline('online', iso(10_000), NOW)).toBe(true);
    expect(isDeviceOnline('online', iso(OFFLINE_AFTER_MS), NOW)).toBe(true);
  });

  it('is offline once three heartbeats are missed, even if status still says online', () => {
    expect(isDeviceOnline('online', iso(OFFLINE_AFTER_MS + 1), NOW)).toBe(false);
    expect(isDeviceOnline('online', iso(60 * 60_000), NOW)).toBe(false);
  });

  it('is offline when status is offline or unknown', () => {
    expect(isDeviceOnline('offline', iso(1_000), NOW)).toBe(false);
    expect(isDeviceOnline(null, iso(1_000), NOW)).toBe(false);
  });

  it('handles missing or invalid heartbeats', () => {
    expect(isDeviceOnline('online', null, NOW)).toBe(false);
    expect(heartbeatAgeMs('not-a-date', NOW)).toBeNull();
  });

  it('treats a small phone-clock lag (negative age) as just now', () => {
    expect(heartbeatAgeMs(iso(-5_000), NOW)).toBe(0);
    expect(isDeviceOnline('online', iso(-5_000), NOW)).toBe(true);
  });
});
