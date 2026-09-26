import React, { createContext, useContext, useEffect, useState } from 'react';
// import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
// import { db } from '../services/firebase';
import { rtdbService } from '../services/rtdbService';
import { useAuth } from './AuthContext';
import { DeviceData, SystemData } from '../types';

interface FirebaseDataContextType {
  deviceData: DeviceData | null;
  systemData: SystemData | null;
  loading: boolean;
  error: string | null;
}

const FirebaseDataContext = createContext<FirebaseDataContextType | undefined>(undefined);

export const FirebaseDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { ownedDevices } = useAuth();
  
  const [deviceData, setDeviceData] = useState<DeviceData | null>(null);
  const [systemData, setSystemData] = useState<SystemData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If no devices or ownedDevices not loaded yet, reset state and do not subscribe
    if (!ownedDevices || ownedDevices.length === 0) {
      setDeviceData(null);
      setSystemData(null);
      setLoading(false);
      setError(null);
      return;
    }

    // Temporarily use the first device for Checkpoint 4D
    const activeDeviceId = ownedDevices[0].id;
    
    setLoading(true);
    setError(null);

    const unsubscribe = rtdbService.subscribeToDevice(
      activeDeviceId,
      (deviceSnap, err) => {
        if (err) {
          console.error("RTDB device listener error:", err);
          setError(err.message || 'Failed to sync device status. Please check your connection.');
          setLoading(false);
          return;
        }

        if (!deviceSnap) {
          setError(`Device not found for ID: ${activeDeviceId}`);
          setLoading(false);
          return;
        }

        // Map device-level fields
        const mappedDeviceData: DeviceData = {
          deviceId: activeDeviceId,
          name: 'Smart Coop Device', // RTDB does not currently store a name, default it
          status: deviceSnap.status,
          lastHeartbeat: new Date(deviceSnap.lastHeartbeat).toISOString()
        };

        // Map systemData (from device state)
        const currentState = deviceSnap.state;
        if (!currentState) {
          // Device hasn't reported state yet
          setDeviceData(mappedDeviceData);
          setSystemData(null);
          setLoading(false);
          setError(null);
          return;
        }
        
        const mappedSystemData: SystemData = {
          feedWeightGrams: currentState.feedWeightGrams,
          targetFeedGrams: currentState.targetFeedGrams,
          hopperLevelPercent: currentState.hopperLevelPercent,
          waterLow: currentState.waterLow,
          waterHigh: currentState.waterHigh,
          pumpActive: currentState.pumpActive,
          feedingActive: currentState.feedingActive,
          emergencyStopActive: currentState.emergencyStopActive,
          timestamp: new Date(currentState.timestamp).toISOString()
        };

        setDeviceData(mappedDeviceData);
        setSystemData(mappedSystemData);
        setLoading(false);
        setError(null);
      }
    );

    return () => {
      // Unsubscribe when component unmounts or active device changes
      unsubscribe();
    };
  }, [ownedDevices]);

  return (
    <FirebaseDataContext.Provider value={{ deviceData, systemData, loading, error }}>
      {children}
    </FirebaseDataContext.Provider>
  );
};

export const useFirebaseData = () => {
  const context = useContext(FirebaseDataContext);
  if (context === undefined) {
    throw new Error('useFirebaseData must be used within a FirebaseDataProvider');
  }
  return context;
};
