import React from 'react';
import { FlatList, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mockAlerts } from '../mock/data';
import { Alert } from '../types';

export default function NotificationsScreen() {
  const getIconForType = (type: string) => {
    switch (type) {
      case 'LOW_FEED': return 'restaurant';
      case 'LOW_WATER': return 'water';
      case 'WATER_PUMP_TIMEOUT': return 'warning';
      case 'EMERGENCY_STOP': return 'alert-circle';
      case 'DEVICE_OFFLINE': return 'cloud-offline';
      default: return 'notifications';
    }
  };

  const getAlertColor = (type: string, resolved: boolean) => {
    if (resolved) return '#aaa';
    if (type === 'EMERGENCY_STOP') return '#d32f2f';
    if (type === 'DEVICE_OFFLINE') return '#f57c00';
    return '#1976d2';
  };

  const formatTitle = (type: string) => {
    return type.replace(/_/g, ' ');
  };

  const renderItem = ({ item }: { item: Alert }) => (
    <View style={[styles.alertCard, item.resolved && styles.resolvedCard]}>
      <View style={styles.iconContainer}>
        <Ionicons 
          name={getIconForType(item.type) as keyof typeof Ionicons.glyphMap} 
          size={32} 
          color={getAlertColor(item.type, item.resolved)} 
        />
      </View>
      <View style={styles.textContainer}>
        <Text style={[styles.title, item.resolved && styles.resolvedText]}>
          {formatTitle(item.type)}
        </Text>
        <Text style={styles.time}>{new Date(item.timestamp).toLocaleString()}</Text>
        <Text style={[styles.status, { color: item.resolved ? 'green' : 'red' }]}>
          {item.resolved ? 'RESOLVED' : 'ACTION REQUIRED'}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={mockAlerts}
        keyExtractor={item => item.id}
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
    padding: 16,
  },
  alertCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  resolvedCard: {
    opacity: 0.7,
  },
  iconContainer: {
    marginRight: 16,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  resolvedText: {
    color: '#666',
    textDecorationLine: 'line-through',
  },
  time: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  status: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 8,
  }
});
