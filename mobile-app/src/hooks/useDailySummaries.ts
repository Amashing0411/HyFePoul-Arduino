import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { RTDBDailySummary } from '../types/rtdb';
import { rtdbService } from '../services/rtdbService';
import { MonthRef, monthKeyRange } from '../utils/monthlySummary';

interface MonthResult {
  key: string; // deviceId|month the result belongs to
  days: RTDBDailySummary[];
  error: string | null;
}

// The device's daily totals for one month (R-22), oldest day first.
export function useDailySummaries(month: MonthRef) {
  const { ownedDevices } = useAuth();
  const deviceId = ownedDevices && ownedDevices.length > 0 ? ownedDevices[0].id : null;
  const { start, end } = monthKeyRange(month);
  const key = `${deviceId}|${start}`;
  const [result, setResult] = useState<MonthResult | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    const resultKey = `${deviceId}|${start}`;
    const unsubscribe = rtdbService.subscribeToDailySummaries(deviceId, start, end, (records, err) => {
      if (err) {
        console.error('Error fetching daily summaries from RTDB:', err);
        setResult({ key: resultKey, days: [], error: 'Failed to load monthly totals.' });
      } else {
        setResult({ key: resultKey, days: records, error: null });
      }
    });
    return () => unsubscribe();
  }, [deviceId, start, end]);

  if (!deviceId) return { days: [], loading: false, error: null };
  // Until the new month arrives, show loading rather than the previous month.
  if (!result || result.key !== key) return { days: [], loading: true, error: null };
  return { days: result.days, loading: false, error: result.error };
}
