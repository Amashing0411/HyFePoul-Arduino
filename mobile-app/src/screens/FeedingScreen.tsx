import React from 'react';
import { ScrollView, View, Text, StyleSheet, Switch } from 'react-native';
import Card from '../components/Card';
import { mockSchedules, mockSystemData } from '../mock/data';

export default function FeedingScreen() {
  const formatTime = (h: number, m: number) => {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  return (
    <ScrollView style={styles.container}>
      <Card title="Current Status">
        <View style={styles.row}>
          <Text style={styles.label}>Feeding Active:</Text>
          <Text style={styles.value}>{mockSystemData.feedingActive ? 'YES' : 'NO'}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Feed Weight:</Text>
          <Text style={styles.value}>{mockSystemData.feedWeightGrams.toFixed(1)} g</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Hopper Level:</Text>
          <Text style={styles.value}>{mockSystemData.hopperLevelPercent.toFixed(1)}%</Text>
        </View>
      </Card>

      <Card title="Feeding Schedules">
        {mockSchedules.map((schedule) => (
          <View key={schedule.id} style={styles.scheduleItem}>
            <View>
              <Text style={styles.timeText}>{formatTime(schedule.hour, schedule.minute)}</Text>
              <Text style={styles.targetText}>Target: {schedule.targetGrams} g</Text>
            </View>
            <Switch
              value={schedule.enabled}
              onValueChange={() => {}} // Read-only for now
              trackColor={{ false: '#767577', true: '#81b0ff' }}
              thumbColor={schedule.enabled ? '#2f95dc' : '#f4f3f4'}
            />
          </View>
        ))}
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
  scheduleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  timeText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  targetText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  }
});
