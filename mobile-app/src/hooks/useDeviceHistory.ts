import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { SystemData } from '../types';
import { rtdbService } from '../services/rtdbService';

export function useDeviceHistory() {
  const { ownedDevices } = useAuth();
  const [history, setHistory] = useState<SystemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!ownedDevices || ownedDevices.length === 0) {
      setHistory([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const activeDeviceId = ownedDevices[0].id;
    
    const unsubscribe = rtdbService.subscribeToHistory(activeDeviceId, 50, (records, err) => {
      if (err) {
        console.error('Error fetching history from RTDB:', err);
        setError('Failed to load history.');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const mappedData = records.map(d => ({
        feedWeightGrams: d.feedWeightGrams,
        targetFeedGrams: d.targetFeedGrams,
        hopperLevelPercent: d.hopperLevelPercent,
        waterLow: d.waterLow,
        waterHigh: d.waterHigh,
        pumpActive: d.pumpActive,
        feedingActive: d.feedingActive,
        emergencyStopActive: d.emergencyStopActive,
        timestamp: new Date(d.timestamp).toISOString()
      }));

      // RTDB limitToLast with orderByChild('timestamp') returns oldest first (ascending).
      // The UI usually expects newest first, so we reverse it.
      setHistory(mappedData.reverse());
      setLoading(false);
      setRefreshing(false);
    });

    return () => unsubscribe();
  }, [ownedDevices]);

  // Provide a dummy refreshData to satisfy the existing interface
  const refreshData = useCallback(() => {
    setRefreshing(true);
    // RTDB listener automatically handles updates, but we can simulate a brief refresh state
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  return { history, loading, error, refreshing, refreshData };
}
