import { RTDBDailySummary } from '../types/rtdb';

// The device counts days in Philippine time (UTC+8), like its schedules.
const DEVICE_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface MonthRef {
  year: number;
  month: number; // 1-12
}

export interface MonthTotals {
  feedGrams: number;
  cyclesCompleted: number;
  cyclesIncomplete: number;
  trayTimeouts: number;
  chainFaults: number;
  lowWaterAlerts: number;
  lowFeedAlerts: number;
  emergencyStops: number;
  daysReported: number;
}

export interface DayBar {
  day: number;
  date: string;      // YYYY-MM-DD
  feedGrams: number | null; // null = no summary for that day
}

const pad = (n: number) => String(n).padStart(2, '0');

// The device's current month, from a UTC timestamp.
export const deviceMonth = (nowMs: number): MonthRef => {
  const d = new Date(nowMs + DEVICE_UTC_OFFSET_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
};

// The device's current date as YYYY-MM-DD.
export const deviceDate = (nowMs: number): string =>
  new Date(nowMs + DEVICE_UTC_OFFSET_MS).toISOString().slice(0, 10);

export const shiftMonth = ({ year, month }: MonthRef, delta: number): MonthRef => {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
};

export const isSameMonth = (a: MonthRef, b: MonthRef) => a.year === b.year && a.month === b.month;

export const daysInMonth = ({ year, month }: MonthRef) => new Date(Date.UTC(year, month, 0)).getUTCDate();

// First and last date keys of a month, for an orderByKey range query.
export const monthKeyRange = (m: MonthRef) => ({
  start: `${m.year}-${pad(m.month)}-01`,
  end: `${m.year}-${pad(m.month)}-${pad(daysInMonth(m))}`,
});

export const summarizeMonth = (days: RTDBDailySummary[]): MonthTotals =>
  days.reduce<MonthTotals>(
    (t, d) => ({
      feedGrams: t.feedGrams + d.feedGrams,
      cyclesCompleted: t.cyclesCompleted + d.cyclesCompleted,
      cyclesIncomplete: t.cyclesIncomplete + d.cyclesIncomplete,
      trayTimeouts: t.trayTimeouts + d.trayTimeouts,
      chainFaults: t.chainFaults + d.chainFaults,
      lowWaterAlerts: t.lowWaterAlerts + d.lowWaterAlerts,
      lowFeedAlerts: t.lowFeedAlerts + d.lowFeedAlerts,
      emergencyStops: t.emergencyStops + d.emergencyStops,
      daysReported: t.daysReported + 1,
    }),
    {
      feedGrams: 0, cyclesCompleted: 0, cyclesIncomplete: 0, trayTimeouts: 0, chainFaults: 0,
      lowWaterAlerts: 0, lowFeedAlerts: 0, emergencyStops: 0, daysReported: 0,
    }
  );

// One bar per day of the month; days after `today` (if given) are left out.
export const buildDayBars = (m: MonthRef, days: RTDBDailySummary[], today?: string): DayBar[] => {
  const byDate = new Map(days.map((d) => [d.date, d.feedGrams]));
  const bars: DayBar[] = [];
  for (let day = 1; day <= daysInMonth(m); day++) {
    const date = `${m.year}-${pad(m.month)}-${pad(day)}`;
    if (today && date > today) break;
    bars.push({ day, date, feedGrams: byDate.get(date) ?? null });
  }
  return bars;
};

// Feed in kg with one decimal below 100 kg ("12.3"), whole kg above.
export const formatKg = (grams: number) => {
  const kg = grams / 1000;
  return kg < 100 ? kg.toFixed(1) : kg.toFixed(0);
};
