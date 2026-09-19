import React from 'react';
import { FlatList, View, Text, StyleSheet } from 'react-native';
import { mockHistory } from '../mock/data';
import { SystemData } from '../types';
import Card from '../components/Card';

export default function HistoryScreen() {
  const renderItem = ({ item }: { item: SystemData }) => (
    <Card title={new Date(item.timestamp).toLocaleString()}>
      <View style={styles.row}>
        <Text style={styles.label}>Feed Weight:</Text>
        <Text style={styles.value}>{item.feedWeightGrams.toFixed(1)} g</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Hopper Level:</Text>
        <Text style={styles.value}>{item.hopperLevelPercent.toFixed(1)}%</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Water Tank:</Text>
        <Text style={styles.value}>{item.waterLow ? 'LOW' : (item.waterHigh ? 'HIGH' : 'OK')}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Feeding Active:</Text>
        <Text style={styles.value}>{item.feedingActive ? 'YES' : 'NO'}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Pump Active:</Text>
        <Text style={styles.value}>{item.pumpActive ? 'YES' : 'NO'}</Text>
      </View>
    </Card>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={mockHistory}
        keyExtractor={(item) => item.timestamp}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  list: {
    paddingBottom: 16,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  label: {
    fontSize: 14,
    color: '#666',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  }
});
