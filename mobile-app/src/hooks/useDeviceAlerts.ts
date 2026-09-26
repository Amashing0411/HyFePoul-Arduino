import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Alert, AlertType } from '../types';
import { rtdbService } from '../services/rtdbService';

export function useDeviceAlerts() {
  const { ownedDevices } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (!ownedDevices || ownedDevices.length === 0) {
      setAlerts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const activeDeviceId = ownedDevices[0].id;
    
    const unsubscribe = rtdbService.subscribeToAlerts(activeDeviceId, 50, (records, err) => {
      if (err) {
        console.error('Error fetching alerts from RTDB:', err);
        setError('Failed to load alerts.');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      const mappedData: Alert[] = records.map(d => ({
        id: d.eventId,
        type: d.name as AlertType,
        timestamp: new Date(d.timestamp).toISOString(),
        resolved: d.resolved
      }));

      // Reverse to show newest first
      setAlerts(mappedData.reverse());
      setLoading(false);
      setRefreshing(false);
    });

    return () => unsubscribe();
  }, [ownedDevices]);

  // Provide a dummy refreshData to satisfy the existing interface
  const refreshData = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  return { alerts, loading, error, refreshing, refreshData };
}
