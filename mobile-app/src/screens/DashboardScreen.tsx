import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import Card from '../components/Card';
import { mockDeviceData, mockSystemData } from '../mock/data';

export default function DashboardScreen() {
  const { name, status } = mockDeviceData;
  const { 
    feedWeightGrams, 
    hopperLevelPercent, 
    waterLow, 
    waterHigh, 
    pumpActive, 
    feedingActive, 
    emergencyStopActive, 
    timestamp 
  } = mockSystemData;

  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString();
  };

  return (
    <ScrollView style={styles.container}>
      <Card title="Device Information">
        <View style={styles.row}>
          <Text style={styles.label}>Name:</Text>
          <Text style={styles.value}>{name}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Network Status:</Text>
          <Text style={[styles.value, { color: status === 'online' ? 'green' : 'red' }]}>
            {status.toUpperCase()}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Last Timely Update:</Text>
          <Text style={styles.value}>{formatDate(timestamp)}</Text>
        </View>
      </Card>

      <Card title="System Data Overview">
        <View style={styles.row}>
          <Text style={styles.label}>Feed Weight:</Text>
          <Text style={styles.value}>{feedWeightGrams.toFixed(1)} g</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Hopper Level:</Text>
          <Text style={styles.value}>{hopperLevelPercent.toFixed(1)}%</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Water Tank:</Text>
          <Text style={styles.value}>
            {waterLow ? 'LOW' : (waterHigh ? 'HIGH' : 'OK')}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Water Pump:</Text>
          <Text style={styles.value}>{pumpActive ? 'RUNNING' : 'OFF'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Feeding Status:</Text>
          <Text style={styles.value}>{feedingActive ? 'DISPENSING' : 'IDLE'}</Text>
        </View>
      </Card>

      <Card title="System Safety">
        <View style={styles.row}>
          <Text style={styles.label}>Emergency Stop:</Text>
          <Text style={[styles.value, { color: emergencyStopActive ? 'red' : 'green' }]}>
            {emergencyStopActive ? 'ENGAGED' : 'CLEAR'}
          </Text>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingTop: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  label: {
    fontSize: 16,
    color: '#555',
  },
  value: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
  },
});
