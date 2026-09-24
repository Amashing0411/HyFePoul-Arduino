import { useState, useEffect, useCallback } from 'react';
import { collection, query, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../context/AuthContext';
import { Alert, AlertType } from '../types';

export function useDeviceAlerts() {
  const { ownedDevices } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlerts = useCallback(async (isRefresh = false) => {
    if (!ownedDevices || ownedDevices.length === 0) {
      setAlerts([]);
      setLoading(false);
      return;
    }

    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    const activeDeviceId = ownedDevices[0].id;
    
    try {
      const q = query(
        collection(db, `devices/${activeDeviceId}/alerts`),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      const snapshot = await getDocs(q);
      const data: Alert[] = [];

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
          console.warn(`Skipping malformed alert record ${docSnap.id}: invalid timestamp.`);
          return;
        }

        if (typeof d.type !== 'string' || !d.type) {
          console.warn(`Skipping malformed alert record ${docSnap.id}: invalid type.`);
          return;
        }

        if (typeof d.resolved !== 'boolean') {
          console.warn(`Skipping malformed alert record ${docSnap.id}: missing or invalid resolved field.`);
          return;
        }

        data.push({
          id: docSnap.id,
          type: d.type as AlertType,
          timestamp: mappedTimestamp,
          resolved: d.resolved
        });
      });

      setAlerts(data);
    } catch (err) {
      console.error('Error fetching alerts:', err);
      setError('Failed to load alerts.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [ownedDevices]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  return { alerts, loading, error, refreshing, refreshData: () => fetchAlerts(true) };
}
