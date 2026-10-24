import { describe, it, expect } from '@jest/globals';
import {
  buildDayBars, deviceDate, deviceMonth, formatKg, monthKeyRange, shiftMonth, summarizeMonth,
} from '../monthlySummary';
import { RTDBDailySummary } from '../../types/rtdb';

const day = (date: string, extra: Partial<RTDBDailySummary> = {}): RTDBDailySummary => ({
  date, feedGrams: 750, cyclesCompleted: 3, cyclesIncomplete: 0, trayTimeouts: 0, chainFaults: 0,
  lowWaterAlerts: 0, lowFeedAlerts: 0, emergencyStops: 0, updatedAt: 1, ...extra,
});

describe('monthly summary (R-22)', () => {
  it('uses device time (UTC+8) for today and the month', () => {
    // 2026-10-31 17:00 UTC is already 2026-11-01 01:00 in the Philippines.
    const ms = Date.UTC(2026, 9, 31, 17, 0);
    expect(deviceDate(ms)).toBe('2026-11-01');
    expect(deviceMonth(ms)).toEqual({ year: 2026, month: 11 });
  });

  it('moves between months across years', () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
  });

  it('gives the key range of a month, including leap years', () => {
    expect(monthKeyRange({ year: 2028, month: 2 })).toEqual({ start: '2028-02-01', end: '2028-02-29' });
    expect(monthKeyRange({ year: 2026, month: 10 })).toEqual({ start: '2026-10-01', end: '2026-10-31' });
  });

  it('adds up the days of a month', () => {
    const t = summarizeMonth([
      day('2026-10-01'),
      day('2026-10-02', { feedGrams: 500, cyclesCompleted: 2, cyclesIncomplete: 1, lowWaterAlerts: 1, emergencyStops: 1 }),
    ]);
    expect(t).toMatchObject({ feedGrams: 1250, cyclesCompleted: 5, cyclesIncomplete: 1, lowWaterAlerts: 1, emergencyStops: 1, daysReported: 2 });
  });

  it('builds one bar per day, marks missing days and stops at today', () => {
    const bars = buildDayBars({ year: 2026, month: 10 }, [day('2026-10-02', { feedGrams: 600 })], '2026-10-03');
    expect(bars).toEqual([
      { day: 1, date: '2026-10-01', feedGrams: null },
      { day: 2, date: '2026-10-02', feedGrams: 600 },
      { day: 3, date: '2026-10-03', feedGrams: null },
    ]);
    expect(buildDayBars({ year: 2026, month: 9 }, [])).toHaveLength(30);
  });

  it('formats kilograms', () => {
    expect(formatKg(12345)).toBe('12.3');
    expect(formatKg(150400)).toBe('150');
  });
});
