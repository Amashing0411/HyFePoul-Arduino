import React, { createContext, useState, useContext, ReactNode, useEffect } from 'react';
import { SystemData, DeviceData, FeedSchedule, Alert } from '../types';
import { mockDeviceData, mockSystemData, mockSchedules, mockAlerts, mockHistory } from '../mock/data';

interface MockDataContextType {
  deviceData: DeviceData;
  systemData: SystemData;
  schedules: FeedSchedule[];
  alerts: Alert[];
  history: SystemData[];
  
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  
  refreshData: () => Promise<void>;
  toggleEmergencyStop: () => void;
  updateSchedule: (schedule: FeedSchedule) => void;
  addSchedule: (schedule: FeedSchedule) => void;
  deleteSchedule: (id: string) => void;
  toggleSchedule: (id: string) => void;
}

const MockDataContext = createContext<MockDataContextType | undefined>(undefined);

export const MockDataProvider = ({ children }: { children: ReactNode }) => {
  const [deviceData, setDeviceData] = useState<DeviceData>(mockDeviceData);
  const [systemData, setSystemData] = useState<SystemData>(mockSystemData);
  const [schedules, setSchedules] = useState<FeedSchedule[]>(mockSchedules);
  const [alerts, setAlerts] = useState<Alert[]>(mockAlerts);
  const [history, setHistory] = useState<SystemData[]>(mockHistory);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initial load simulation
  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, []);

  const refreshData = async () => {
    setRefreshing(true);
    setError(null);
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // Update timestamp to simulate fresh data
        const now = new Date().toISOString();
        setSystemData(prev => ({ ...prev, timestamp: now }));
        setDeviceData(prev => ({ ...prev, lastHeartbeat: now }));
        setRefreshing(false);
        resolve();
      }, 1000);
    });
  };

  const toggleEmergencyStop = () => {
    const newState = !systemData.emergencyStopActive;
    setSystemData(prev => ({
      ...prev,
      emergencyStopActive: newState,
      timestamp: new Date().toISOString(),
    }));
    if (newState) {
      setAlerts(prev => [
        { id: Math.random().toString(), type: 'EMERGENCY_STOP', timestamp: new Date().toISOString(), resolved: false },
        ...prev,
      ]);
    }
  };

  const updateSchedule = (updatedSchedule: FeedSchedule) => {
    setSchedules(prev => prev.map(s => (s.id === updatedSchedule.id ? updatedSchedule : s)));
  };

  const addSchedule = (schedule: FeedSchedule) => {
    setSchedules(prev => [...prev, schedule].sort((a, b) => (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute)));
  };

  const deleteSchedule = (id: string) => {
    setSchedules(prev => prev.filter(s => s.id !== id));
  };

  const toggleSchedule = (id: string) => {
    setSchedules(prev => prev.map(s => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  return (
    <MockDataContext.Provider
      value={{
        deviceData,
        systemData,
        schedules,
        alerts,
        history,
        loading,
        refreshing,
        error,
        refreshData,
        toggleEmergencyStop,
        updateSchedule,
        addSchedule,
        deleteSchedule,
        toggleSchedule,
      }}
    >
      {children}
    </MockDataContext.Provider>
  );
};

export const useMockData = () => {
  const context = useContext(MockDataContext);
  if (!context) {
    throw new Error('useMockData must be used within a MockDataProvider');
  }
  return context;
};
