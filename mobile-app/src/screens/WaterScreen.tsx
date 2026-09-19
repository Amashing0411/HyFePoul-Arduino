import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import Card from '../components/Card';
import { mockSystemData } from '../mock/data';

export default function WaterScreen() {
  const { waterLow, waterHigh, pumpActive, timestamp } = mockSystemData;

  return (
    <ScrollView style={styles.container}>
      <Card title="Water Tank Status">
        <View style={styles.row}>
          <Text style={styles.label}>Level State:</Text>
          <Text style={[styles.value, { color: waterLow ? 'red' : (waterHigh ? 'blue' : 'green') }]}>
            {waterLow ? 'LOW (Needs refill)' : (waterHigh ? 'HIGH (Full)' : 'NORMAL')}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Float Low Triggered:</Text>
          <Text style={styles.value}>{waterLow ? 'YES' : 'NO'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Float High Triggered:</Text>
          <Text style={styles.value}>{waterHigh ? 'YES' : 'NO'}</Text>
        </View>
      </Card>

      <Card title="Pump Status">
        <View style={styles.row}>
          <Text style={styles.label}>Pump Active:</Text>
          <Text style={styles.value}>{pumpActive ? 'RUNNING' : 'OFF'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Last Updated:</Text>
          <Text style={styles.value}>{new Date(timestamp).toLocaleTimeString()}</Text>
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
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
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
