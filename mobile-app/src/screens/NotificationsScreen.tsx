import React from 'react';
import { FlatList, View, Text, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useMockData } from '../context/MockDataContext';
import { useTheme } from '../context/ThemeContext';
import { Alert } from '../types';
import EmptyState from '../components/EmptyState';
import Skeleton from '../components/Skeleton';
import { spacing, layout } from '../theme';

export default function NotificationsScreen() {
  const { alerts, loading, refreshing, refreshData } = useMockData();
  const { colors, typography } = useTheme();

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
    if (resolved) return colors.neutral;
    if (type === 'EMERGENCY_STOP') return colors.error;
    if (type === 'DEVICE_OFFLINE') return colors.warning;
    return colors.primary;
  };

  const renderItem = ({ item }: { item: Alert }) => {
    const alertColor = getAlertColor(item.type, item.resolved);
    const title = item.type.replace(/_/g, ' ');
    
    return (
      <View 
        style={[styles.alertCard, { backgroundColor: colors.card, borderLeftColor: alertColor }, item.resolved && { opacity: 0.6 }]}
        accessible={true}
        accessibilityRole="text"
        accessibilityLabel={`${item.resolved ? 'Resolved' : 'Active'} alert: ${title}. Occurred at ${new Date(item.timestamp).toLocaleTimeString()}`}
      >
        <View style={styles.iconContainer}>
          <Ionicons name={getIconForType(item.type) as any} size={32} color={alertColor} />
        </View>
        <View style={styles.textContainer}>
          <Text style={[typography.h2, item.resolved && { textDecorationLine: 'line-through', color: colors.textSecondary }]}>
            {title}
          </Text>
          <Text style={[typography.caption, { marginTop: spacing.xs }]}>{new Date(item.timestamp).toLocaleString()}</Text>
          <Text style={[typography.caption, { fontWeight: 'bold', marginTop: spacing.sm, color: item.resolved ? colors.success : colors.error }]}>
            {item.resolved ? 'RESOLVED' : 'ACTIVE'}
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.list}>
          {[1,2,3].map(i => (
            <Skeleton key={i} height={80} style={{marginBottom: 12}} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={alerts}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={alerts.length === 0 ? styles.emptyList : styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.primary} />}
        ListEmptyComponent={<EmptyState iconName="checkmark-circle-outline" message="You're all caught up. No alerts." />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: spacing.md },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  alertCard: { borderRadius: layout.borderRadius, padding: spacing.md, marginBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, borderLeftWidth: 4 },
  iconContainer: { marginRight: spacing.md },
  textContainer: { flex: 1 },
});
