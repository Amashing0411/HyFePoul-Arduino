import React from 'react';
import { ScrollView, View, Text, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import ProgressBar from '../components/ProgressBar';
import Skeleton from '../components/Skeleton';
import Button from '../components/Button';
import { useMockData } from '../context/MockDataContext';
import { useTheme } from '../context/ThemeContext';
import { spacing, layout } from '../theme';

export default function DashboardScreen() {
  const { deviceData, systemData, schedules, loading, refreshing, refreshData, toggleEmergencyStop } = useMockData();
  const { colors, typography } = useTheme();

  const getNextFeeding = () => {
    const activeSchedules = schedules.filter(s => s.enabled);
    if (activeSchedules.length === 0) return 'None';
    
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    
    let next = activeSchedules.find(s => (s.hour * 60 + s.minute) > currentMins);
    if (!next) next = activeSchedules[0]; 

    const h = next.hour.toString().padStart(2, '0');
    const m = next.minute.toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  const handleEmergencyStop = () => {
    if (systemData.emergencyStopActive) {
      Alert.alert(
        "Release Emergency Stop",
        "Resume normal system operation?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Release", style: "destructive", onPress: toggleEmergencyStop }
        ]
      );
    } else {
      Alert.alert(
        "Activate Emergency Stop",
        "DANGER: This will halt all motors and pumps. Proceed?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "EMERGENCY STOP", style: "destructive", onPress: toggleEmergencyStop }
        ]
      );
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Card title="Status">
          <Skeleton height={24} width="50%" />
          <Skeleton height={16} width="30%" />
        </Card>
        <Card title="Feed">
          <Skeleton height={24} width="40%" />
          <Skeleton height={8} />
          <Skeleton height={24} width="40%" />
        </Card>
        <Card title="Water">
          <Skeleton height={24} width="40%" />
          <Skeleton height={24} width="40%" />
        </Card>
      </View>
    );
  }

  const feedColor = systemData.hopperLevelPercent < 20 ? colors.error : colors.warning;
  const isStale = (new Date().getTime() - new Date(systemData.timestamp).getTime()) > 300000; // 5 mins

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.primary} />}
    >
      <Card title="Status">
        <View style={styles.row}>
          <View style={styles.deviceInfo}>
            <Ionicons name="hardware-chip" size={24} color={colors.textSecondary} />
            <Text style={[typography.h2, { marginLeft: spacing.sm }]}>{deviceData.name}</Text>
          </View>
          <StatusBadge 
            status={deviceData.status === 'online' ? 'success' : 'offline'} 
            text={deviceData.status.toUpperCase()} 
          />
        </View>
        <View style={styles.row}>
          <Text style={typography.caption} accessible={true} accessibilityLabel={`Last updated: ${new Date(systemData.timestamp).toLocaleTimeString()}`}>
            Updated: {new Date(systemData.timestamp).toLocaleTimeString()} {isStale && '(Stale)'}
          </Text>
        </View>
      </Card>

      <Card title="Feed">
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <Ionicons name="scale-outline" size={24} color={colors.neutral} />
            <Text style={[typography.caption, styles.gridLabel]}>Weight</Text>
            <Text style={[typography.body, { fontWeight: 'bold' }]}>{systemData.feedWeightGrams.toFixed(0)} g</Text>
          </View>
          <View style={styles.gridItem}>
            <Ionicons name="time-outline" size={24} color={colors.neutral} />
            <Text style={[typography.caption, styles.gridLabel]}>Next</Text>
            <Text style={[typography.body, { fontWeight: 'bold' }]}>{getNextFeeding()}</Text>
          </View>
          <View style={styles.gridItem}>
            <Ionicons name="restaurant-outline" size={24} color={colors.neutral} />
            <Text style={[typography.caption, styles.gridLabel]}>Status</Text>
            <View style={styles.badgeWrapper}>
              <StatusBadge status={systemData.feedingActive ? 'warning' : 'success'} text={systemData.feedingActive ? 'ACTIVE' : 'IDLE'} />
            </View>
          </View>
        </View>
        <View style={[styles.progressContainer, { borderTopColor: colors.border }]}>
          <View style={styles.row}>
            <Text style={typography.caption}>Hopper Level</Text>
            <Text style={[typography.body, { fontWeight: 'bold' }]}>{systemData.hopperLevelPercent.toFixed(0)}%</Text>
          </View>
          <ProgressBar progress={systemData.hopperLevelPercent} color={feedColor} />
        </View>
      </Card>

      <Card title="Water">
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <Ionicons name="water-outline" size={24} color={colors.neutral} />
            <Text style={[typography.caption, styles.gridLabel]}>Tank</Text>
            <View style={styles.badgeWrapper}>
              <StatusBadge 
                status={systemData.waterLow ? 'error' : (systemData.waterHigh ? 'success' : 'online')} 
                text={systemData.waterLow ? 'LOW' : (systemData.waterHigh ? 'HIGH' : 'OK')} 
              />
            </View>
          </View>
          <View style={styles.gridItem}>
            <Ionicons name="color-filter-outline" size={24} color={colors.neutral} />
            <Text style={[typography.caption, styles.gridLabel]}>Pump</Text>
            <View style={styles.badgeWrapper}>
              <StatusBadge 
                status={systemData.pumpActive ? 'warning' : 'success'} 
                text={systemData.pumpActive ? 'RUNNING' : 'OFF'} 
              />
            </View>
          </View>
        </View>
      </Card>

      <Card title="Safety">
        <View style={styles.row}>
          <Text style={typography.body}>System State:</Text>
          <StatusBadge 
            status={systemData.emergencyStopActive ? 'error' : 'success'} 
            text={systemData.emergencyStopActive ? 'HALTED' : 'RUNNING'} 
          />
        </View>
        <View style={{ marginTop: spacing.md }}>
          <Button 
            title={systemData.emergencyStopActive ? "RELEASE EMERGENCY STOP" : "EMERGENCY STOP"}
            onPress={handleEmergencyStop}
            variant={systemData.emergencyStopActive ? "outline" : "danger"}
            accessibilityLabel={systemData.emergencyStopActive ? "Release emergency stop to resume system" : "Activate emergency stop to halt system"}
          />
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: spacing.xs },
  deviceInfo: { flexDirection: 'row', alignItems: 'center' },
  grid: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
  gridItem: { alignItems: 'center', width: '30%', marginBottom: spacing.md },
  gridLabel: { marginVertical: spacing.xs },
  badgeWrapper: { alignItems: 'center', width: '100%' },
  progressContainer: { marginTop: spacing.sm, borderTopWidth: 1, paddingTop: spacing.sm }
});
