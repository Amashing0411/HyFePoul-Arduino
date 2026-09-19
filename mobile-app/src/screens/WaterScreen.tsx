import React from 'react';
import { ScrollView, View, Text, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import Skeleton from '../components/Skeleton';
import { useMockData } from '../context/MockDataContext';
import { useTheme } from '../context/ThemeContext';
import { spacing, layout } from '../theme';

export default function WaterScreen() {
  const { systemData, loading, refreshing, refreshData } = useMockData();
  const { colors, typography } = useTheme();
  const { waterLow, waterHigh, pumpActive, timestamp } = systemData;

  const getTankStatus = () => {
    if (waterLow) return { text: 'Refill Needed', badge: 'error' as const, icon: 'water-outline', color: colors.error };
    if (waterHigh) return { text: 'Tank Full', badge: 'success' as const, icon: 'water', color: colors.primary };
    return { text: 'Normal', badge: 'success' as const, icon: 'water', color: colors.success };
  };

  const tank = getTankStatus();
  const isStale = (new Date().getTime() - new Date(timestamp).getTime()) > 300000;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Card title="Water Tank"><Skeleton height={150} /></Card>
        <Card title="Pump System"><Skeleton height={100} /></Card>
      </View>
    );
  }

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.primary} />}
    >
      <Card title="Water Tank">
        <View style={[styles.tankVisualContainer, { backgroundColor: colors.neutralLight }]} accessible={true} accessibilityLabel={`Tank status: ${tank.text}`}>
          <Ionicons name={tank.icon as any} size={64} color={tank.color} />
          <Text style={[typography.h1, { color: tank.color, marginTop: spacing.sm }]}>{tank.text}</Text>
        </View>

        <View style={[styles.row, { borderBottomColor: colors.border }]}>
          <Text style={typography.body}>Low Float</Text>
          <StatusBadge status={waterLow ? 'warning' : 'neutral'} text={waterLow ? 'TRIGGERED' : 'CLEAR'} />
        </View>
        <View style={[styles.row, { borderBottomColor: colors.border }]}>
          <Text style={typography.body}>High Float</Text>
          <StatusBadge status={waterHigh ? 'success' : 'neutral'} text={waterHigh ? 'TRIGGERED' : 'CLEAR'} />
        </View>
      </Card>

      <Card title="Pump System">
        <View style={[styles.pumpVisualContainer, { backgroundColor: colors.neutralLight }]} accessible={true} accessibilityLabel={`Pump is ${pumpActive ? 'running' : 'idle'}`}>
          <Ionicons name="color-filter-outline" size={48} color={pumpActive ? colors.warning : colors.neutral} />
          <View style={styles.pumpInfo}>
            <Text style={[typography.body, { fontWeight: 'bold', marginBottom: spacing.xs }]}>{pumpActive ? 'Pump Running' : 'Pump Idle'}</Text>
            <StatusBadge status={pumpActive ? 'warning' : 'neutral'} text={pumpActive ? 'ACTIVE' : 'OFF'} />
          </View>
        </View>
        <View style={[styles.row, { marginTop: spacing.md, borderBottomWidth: 0 }]}>
          <Text style={typography.body}>Updated</Text>
          <Text style={typography.bodySecondary}>{new Date(timestamp).toLocaleTimeString()} {isStale && '(Stale)'}</Text>
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1 },
  tankVisualContainer: { alignItems: 'center', paddingVertical: spacing.xl, marginBottom: spacing.md, borderRadius: layout.borderRadius },
  pumpVisualContainer: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: layout.borderRadius },
  pumpInfo: { marginLeft: spacing.md },
});
