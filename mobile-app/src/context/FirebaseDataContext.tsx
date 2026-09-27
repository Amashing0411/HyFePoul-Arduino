import React, { createContext, useContext, useEffect, useState } from 'react';
import { rtdbService } from '../services/rtdbService';
import { useAuth } from './AuthContext';
import { DeviceData, SystemData } from '../types';
import { RTDBCommand, RTDBCommandAction, RTDBSchedule } from '../types/rtdb';

interface FirebaseDataContextType {
  deviceData: DeviceData | null;
  systemData: SystemData | null;
  commands: RTDBCommand[];
  schedules: RTDBSchedule[];
  loading: boolean;
  error: string | null;
  issueCommand: (command: RTDBCommandAction, parameters?: Record<string, any>) => Promise<string | null>;
  updateSchedule: (schedule: RTDBSchedule) => Promise<void>;
}

const FirebaseDataContext = createContext<FirebaseDataContextType | undefined>(undefined);

export const FirebaseDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, ownedDevices } = useAuth();
  
  const [deviceData, setDeviceData] = useState<DeviceData | null>(null);
  const [systemData, setSystemData] = useState<SystemData | null>(null);
  const [commands, setCommands] = useState<RTDBCommand[]>([]);
  const [schedules, setSchedules] = useState<RTDBSchedule[]>([]);
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

    const unsubscribeDevice = rtdbService.subscribeToDevice(
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

    const unsubscribeCommands = rtdbService.subscribeToCommands(
      activeDeviceId,
      10,
      (cmds, err) => {
        if (err) {
          console.error("RTDB commands listener error:", err);
          return;
        }
        setCommands(cmds);
      }
    );

    const unsubscribeSchedules = rtdbService.subscribeToSchedules(
      activeDeviceId,
      (scheds, err) => {
        if (err) {
          console.error("RTDB schedules listener error:", err);
          return;
        }
        setSchedules(scheds);
      }
    );

    return () => {
      unsubscribeDevice();
      unsubscribeCommands();
      unsubscribeSchedules();
    };
  }, [ownedDevices]);

  const issueCommand = async (command: RTDBCommandAction, parameters?: Record<string, any>): Promise<string | null> => {
    if (!ownedDevices || ownedDevices.length === 0 || !user) return null;
    try {
      const activeDeviceId = ownedDevices[0].id;
      return await rtdbService.createCommand(activeDeviceId, command, user.uid, parameters);
    } catch (e) {
      console.error("Failed to issue command:", e);
      return null;
    }
  };

  const updateSchedule = async (schedule: RTDBSchedule): Promise<void> => {
    if (!ownedDevices || ownedDevices.length === 0 || !user) return;
    try {
      const activeDeviceId = ownedDevices[0].id;
      await rtdbService.updateSchedule(activeDeviceId, schedule);
      
      // Also send the sync command to the ESP32
      const match = schedule.scheduleId.match(/sched_(\d+)/);
      const index = match ? parseInt(match[1], 10) : 0;
      await rtdbService.createCommand(activeDeviceId, 'SCHEDULE_SET', user.uid, {
        index: index,
        hour: schedule.hour,
        minute: schedule.minute,
        targetGrams: schedule.targetGrams,
        enabled: schedule.enabled
      });
    } catch (e) {
      console.error("Failed to update schedule:", e);
      throw e;
    }
  };

  return (
    <FirebaseDataContext.Provider value={{ deviceData, systemData, commands, schedules, loading, error, issueCommand, updateSchedule }}>
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
