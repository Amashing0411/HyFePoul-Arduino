import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { SystemData } from '../types';

export function useDeviceHistory() {
  const { ownedDevices } = useAuth();
  const [history, setHistory] = useState<SystemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = useCallback(async (isRefresh = false) => {
    if (!ownedDevices || ownedDevices.length === 0) {
      setHistory([]);
      setLoading(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const activeDeviceId = ownedDevices[0].id;
    
    try {
      const q = query(
        collection(db, `devices/${activeDeviceId}/systemData`),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const data: SystemData[] = [];

      snapshot.forEach(docSnap => {
        const d = docSnap.data();
        
        let mappedTimestamp: string;
        if (d.timestamp instanceof Timestamp) {
          mappedTimestamp = d.timestamp.toDate().toISOString();
        } else if (typeof d.timestamp === 'string') {
          mappedTimestamp = d.timestamp;
        } else if (typeof d.timestamp === 'number') {
          mappedTimestamp = new Date(d.timestamp).toISOString();
        } else {
          console.warn(`Skipping malformed history record ${docSnap.id}: invalid timestamp.`);
          return;
        }

        if (
          typeof d.feedWeightGrams !== 'number' || !isFinite(d.feedWeightGrams) ||
          typeof d.hopperLevelPercent !== 'number' || !isFinite(d.hopperLevelPercent) ||
          typeof d.waterLow !== 'boolean' ||
          typeof d.waterHigh !== 'boolean' ||
          typeof d.pumpActive !== 'boolean' ||
          typeof d.feedingActive !== 'boolean' ||
          typeof d.emergencyStopActive !== 'boolean'
        ) {
          console.warn(`Skipping malformed history record ${docSnap.id}: missing or invalid fields.`);
          return;
        }

        // targetFeedGrams is optional in history records (depends on if it was recorded)
        // If it exists, it should be a number.
        const targetFeed = typeof d.targetFeedGrams === 'number' && isFinite(d.targetFeedGrams) ? d.targetFeedGrams : 0;

        data.push({
          feedWeightGrams: d.feedWeightGrams,
          targetFeedGrams: targetFeed,
          hopperLevelPercent: d.hopperLevelPercent,
          waterLow: d.waterLow,
          waterHigh: d.waterHigh,
          pumpActive: d.pumpActive,
          feedingActive: d.feedingActive,
          emergencyStopActive: d.emergencyStopActive,
          timestamp: mappedTimestamp
        });
      });

      setHistory(data);
    } catch (err) {
      console.error('Error fetching history:', err);
      setError('Failed to load history.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ownedDevices]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, error, refreshing, refreshData: () => fetchHistory(true) };
}
