import React, { createContext, useContext, useEffect, useState } from 'react';
import { doc, onSnapshot, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
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

    const deviceRef = doc(db, 'devices', activeDeviceId);
    
    const unsubscribe = onSnapshot(
      deviceRef,
      (docSnap) => {
        if (!docSnap.exists()) {
          setError(`Device document not found for ID: ${activeDeviceId}`);
          setLoading(false);
          return;
        }

        const data = docSnap.data();
        // Validate esp32Status without coercing missing to offline
        let mappedStatus: 'online' | 'offline' | null = null;
        if (data.esp32Status === 'online' || data.esp32Status === 'offline') {
          mappedStatus = data.esp32Status;
        }

        let mappedHeartbeat: string | null = null;
        if (data.lastHeartbeat instanceof Timestamp) {
          mappedHeartbeat = data.lastHeartbeat.toDate().toISOString();
        } else if (typeof data.lastHeartbeat === 'string') {
          mappedHeartbeat = data.lastHeartbeat;
        }

        // Map device-level fields
        const mappedDeviceData: DeviceData = {
          deviceId: docSnap.id,
          name: typeof data.name === 'string' ? data.name : 'Unnamed Device',
          status: mappedStatus,
          lastHeartbeat: mappedHeartbeat
        };

        // Map systemData (from currentState)
        const currentState = data.currentState;
        if (!currentState || typeof currentState !== 'object') {
          setError(`Invalid device state: Missing currentState object.`);
          setLoading(false);
          return;
        }
        
        // Strict timestamp validation
        let mappedTimestamp: string;
        if (currentState.timestamp instanceof Timestamp) {
          mappedTimestamp = currentState.timestamp.toDate().toISOString();
        } else if (typeof currentState.timestamp === 'string') {
          mappedTimestamp = currentState.timestamp;
        } else if (typeof currentState.timestamp === 'number') {
          mappedTimestamp = new Date(currentState.timestamp).toISOString();
        } else {
          setError(`Invalid device state: Missing or invalid timestamp.`);
          setLoading(false);
          return;
        }

        // Strict validation for required fields
        if (
          typeof currentState.feedWeightGrams !== 'number' || !isFinite(currentState.feedWeightGrams) ||
          typeof currentState.targetFeedGrams !== 'number' || !isFinite(currentState.targetFeedGrams) ||
          typeof currentState.hopperLevelPercent !== 'number' || !isFinite(currentState.hopperLevelPercent) ||
          typeof currentState.waterLow !== 'boolean' ||
          typeof currentState.waterHigh !== 'boolean' ||
          typeof currentState.pumpActive !== 'boolean' ||
          typeof currentState.feedingActive !== 'boolean' ||
          typeof currentState.emergencyStopActive !== 'boolean'
        ) {
          setError(`Invalid device state: Missing or invalid required sensor fields.`);
          setLoading(false);
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
          timestamp: mappedTimestamp
        };

        setDeviceData(mappedDeviceData);
        setSystemData(mappedSystemData);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error("Firestore device listener error:", err);
        setError('Failed to sync device status. Please check your connection.');
        setLoading(false);
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
