import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import ProgressBar from '../components/ProgressBar';
import DeviceDataUnavailable from '../components/DeviceDataUnavailable';
import Button from '../components/Button';
import { describeCycleStep } from '../utils/feedCycle';
import { useFirebaseData } from '../context/FirebaseDataContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { spacing } from '../theme';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { MainTabParamList } from '../navigation/AppNavigator';

export default function DashboardScreen() {
  const { deviceData, systemData, deviceOnline, controllerResponding, nowMs, commands, loading, issueCommand } = useFirebaseData();
  const { colors, typography } = useTheme();
  const { t } = useLanguage();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await issueCommand('STATUS_REQ');
    setTimeout(() => setRefreshing(false), 1500);
  };

  const handleEmergencyStop = () => {
    if (!systemData) return;
    if (systemData.emergencyStopActive) {
      Alert.alert(
        t('estopReleaseTitle') || "Release E-Stop",
        t('estopReleaseMsg') || "Are you sure you want to release the emergency stop? Only do this if the physical switch is cleared.",
        [
          { text: t('cancel') || "Cancel", style: "cancel" },
          {
            text: t('releaseEmergencyStop') || "Release",
            style: "destructive",
            onPress: () => issueCommand('ESTOP_RELEASE')
          }
        ]
      );
    } else {
      Alert.alert(
        "Remote E-Stop Activation",
        "The system does not currently support activating E-Stop via remote command. E-Stop must be triggered physically.",
        [
          { text: "OK", style: "default" }
        ]
      );
    }
  };

  // Manual feed lives on the Feeding tab (inline target entry, limits,
  // E-stop and in-flight checks, command status). Alert.prompt, used here
  // before, is iOS-only and did nothing on Android.
  const handleManualFeed = () => {
    navigation.navigate('Feeding');
  };

  if (loading || !deviceData || !systemData) {
    return <DeviceDataUnavailable />;
  }

  const feedColor = systemData.hopperLevelPercent < 20 ? colors.error : colors.warning;
  const isStale = (nowMs - new Date(systemData.timestamp).getTime()) > 300000;
  const activeCommand = commands.length > 0 ? commands[0] : null;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
    >
      <Card title={t('deviceStatus')}>
        <View style={styles.row}>
          <View style={styles.deviceInfo}>
            <Ionicons name="hardware-chip" size={24} color={colors.textSecondary} />
            <Text style={[typography.h2, { marginLeft: spacing.sm }]}>{deviceData.name}</Text>
          </View>
          <StatusBadge
            status={!deviceOnline ? 'offline' : controllerResponding ? 'success' : 'error'}
            text={!deviceOnline ? t('offline') : controllerResponding ? t('online') : t('notResponding')}
          />
        </View>
        <View style={styles.row}>
          <Text style={typography.caption}>
            {t('updated')}: {new Date(systemData.timestamp).toLocaleTimeString()} {isStale && `(${t('stale')})`}
          </Text>
        </View>
        {deviceOnline && !controllerResponding && (
          <Text style={[typography.caption, { color: colors.error, marginTop: spacing.xs }]}>
            {t('controllerNotRespondingHint')}
          </Text>
        )}
        {!deviceOnline && deviceData.lastHeartbeat && (
          <Text style={[typography.caption, { color: colors.error, marginTop: spacing.xs }]}>
            {t('lastHeardFrom', { time: new Date(deviceData.lastHeartbeat).toLocaleString() })}
          </Text>
        )}
      </Card>

      <Card title={t('feedSystem')}>
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <Ionicons name="scale-outline" size={24} color={colors.neutral} />
            <Text style={[typography.caption, styles.gridLabel]}>{t('feedInTrays')}</Text>
            <Text style={[typography.body, { fontWeight: 'bold' }]}>{systemData.feedWeightGrams.toFixed(0)} g</Text>
          </View>
          <View style={styles.gridItem}>
            <Ionicons name="restaurant-outline" size={24} color={colors.neutral} />
            <Text style={[typography.caption, styles.gridLabel]}>{t('deviceStatus')}</Text>
            <View style={styles.badgeWrapper}>
              <StatusBadge status={systemData.feedingActive ? 'warning' : 'success'} text={systemData.feedingActive ? t('active') : t('idle')} />
            </View>
          </View>
        </View>
        {systemData.feedingActive && (
          <Text style={[typography.caption, { textAlign: 'center', marginBottom: spacing.sm }]}>
            {describeCycleStep(t, systemData.cycleStep, systemData.currentTray)}
          </Text>
        )}
        <View style={[styles.progressContainer, { borderTopColor: colors.border }]}>
          <View style={styles.row}>
            <Text style={typography.caption}>{t('hopperLevel')}</Text>
            <Text style={[typography.body, { fontWeight: 'bold' }]}>{systemData.hopperLevelPercent.toFixed(0)}%</Text>
          </View>
          <ProgressBar progress={systemData.hopperLevelPercent} color={feedColor} />
        </View>

        <View style={{ marginTop: spacing.md }}>
          <Button
            title={t('manualFeed')}
            onPress={handleManualFeed}
            variant="outline"
            accessibilityLabel={t('manualFeed')}
          />
        </View>
      </Card>

      <Card title={t('waterSystem')}>
        <View style={styles.row}>
          <View style={styles.deviceInfo}>
            <Ionicons name="water-outline" size={24} color={colors.neutral} />
            <Text style={[typography.body, { marginLeft: spacing.sm }]}>{t('tank')}</Text>
          </View>
          <StatusBadge
            status={systemData.waterLow ? 'error' : 'success'}
            text={systemData.waterLow ? t('refillNeeded') : t('ok')}
          />
        </View>
      </Card>

      <Card title={t('safety')}>
        <View style={styles.row}>
          <Text style={typography.body}>{t('systemState')}:</Text>
          <StatusBadge
            status={systemData.emergencyStopActive ? 'error' : 'success'}
            text={systemData.emergencyStopActive ? t('halted') : t('running')}
          />
        </View>
        <View style={{ marginTop: spacing.md }}>
          <Button
            title={systemData.emergencyStopActive ? t('releaseEmergencyStop') || "Release E-Stop" : t('emergencyStop') || "E-Stop Engaged"}
            onPress={handleEmergencyStop}
            variant={systemData.emergencyStopActive ? "outline" : "danger"}
            accessibilityLabel={systemData.emergencyStopActive ? "Release E-Stop" : "Emergency Stop"}
          />
        </View>
      </Card>

      {activeCommand && (
        <Card title="Last Remote Command">
          <View style={styles.row}>
            <Text style={typography.body}>{activeCommand.command}</Text>
            <StatusBadge
              status={
                activeCommand.status === 'completed' ? 'success' :
                activeCommand.status === 'failed' || activeCommand.status === 'rejected' ? 'error' : 'warning'
              }
              text={activeCommand.status.toUpperCase()}
            />
          </View>
          {activeCommand.error && (
            <Text style={[typography.caption, { color: colors.error, marginTop: spacing.xs }]}>
              {activeCommand.error}
            </Text>
          )}
          <Text style={[typography.caption, { marginTop: spacing.xs, color: colors.textSecondary }]}>
            {new Date(activeCommand.createdAt).toLocaleTimeString()}
          </Text>
        </Card>
      )}
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
