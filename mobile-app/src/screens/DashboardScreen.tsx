import React from 'react';
import { ScrollView, View, Text, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import ProgressBar from '../components/ProgressBar';
import Skeleton from '../components/Skeleton';
import Button from '../components/Button';
import { useMockData } from '../context/MockDataContext';
import { useFirebaseData } from '../context/FirebaseDataContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { spacing, layout } from '../theme';

export default function DashboardScreen() {
  const { schedules, refreshing, refreshData, toggleEmergencyStop } = useMockData();
  const { deviceData, systemData, loading, error } = useFirebaseData();
  const { colors, typography } = useTheme();
  const { t } = useLanguage();

  const getNextFeeding = () => {
    const activeSchedules = schedules.filter(s => s.enabled);
    if (activeSchedules.length === 0) return t('none');
    
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    
    let next = activeSchedules.find(s => (s.hour * 60 + s.minute) > currentMins);
    if (!next) next = activeSchedules[0]; 

    const h = next.hour.toString().padStart(2, '0');
    const m = next.minute.toString().padStart(2, '0');
    return `${h}:${m}`;
  };

  const handleEmergencyStop = () => {
    if (!systemData) return;
    if (systemData.emergencyStopActive) {
      Alert.alert(
        t('estopReleaseTitle'),
        t('estopReleaseMsg'),
        [
          { text: t('cancel'), style: "cancel" },
          { text: t('releaseEmergencyStop'), style: "destructive", onPress: toggleEmergencyStop }
        ]
      );
    } else {
      Alert.alert(
        t('estopActivateTitle'),
        t('estopActivateMsg'),
        [
          { text: t('cancel'), style: "cancel" },
          { text: t('emergencyStop'), style: "destructive", onPress: toggleEmergencyStop }
        ]
      );
    }
  };

  if (loading || !deviceData || !systemData) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {error ? (
          <Card title="Connection Error">
            <Text style={[typography.body, { color: colors.error, marginBottom: 16 }]}>{error}</Text>
          </Card>
        ) : (
          <>
            <Card title={t('deviceStatus')}>
              <Skeleton height={24} width="50%" />
              <Skeleton height={16} width="30%" />
            </Card>
            <Card title={t('feedSystem')}>
              <Skeleton height={24} width="40%" />
              <Skeleton height={8} />
              <Skeleton height={24} width="40%" />
            </Card>
            <Card title={t('waterSystem')}>
              <Skeleton height={24} width="40%" />
              <Skeleton height={24} width="40%" />
            </Card>
          </>
        )}
      </View>
    );
  }

  const feedColor = systemData.hopperLevelPercent < 20 ? colors.error : colors.warning;
  const isStale = (new Date().getTime() - new Date(systemData.timestamp).getTime()) > 300000; 

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.primary} />}
    >
      <Card title={t('deviceStatus')}>
        <View style={styles.row}>
          <View style={styles.deviceInfo}>
            <Ionicons name="hardware-chip" size={24} color={colors.textSecondary} />
            <Text style={[typography.h2, { marginLeft: spacing.sm }]}>{deviceData.name}</Text>
          </View>
          <StatusBadge 
            status={deviceData.status === 'online' ? 'success' : 'offline'} 
            text={deviceData.status === 'online' ? t('online') : t('offline')} 
          />
        </View>
        <View style={styles.row}>
          <Text style={typography.caption} accessible={true} accessibilityLabel={`${t('updated')}: ${new Date(systemData.timestamp).toLocaleTimeString()}`}>
            {t('updated')}: {new Date(systemData.timestamp).toLocaleTimeString()} {isStale && `(${t('stale')})`}
          </Text>
        </View>
      </Card>

      <Card title={t('feedSystem')}>
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <Ionicons name="scale-outline" size={24} color={colors.neutral} />
            <Text style={[typography.caption, styles.gridLabel]}>{t('weight')}</Text>
            <Text style={[typography.body, { fontWeight: 'bold' }]}>{systemData.feedWeightGrams.toFixed(0)} g</Text>
          </View>
          <View style={styles.gridItem}>
            <Ionicons name="time-outline" size={24} color={colors.neutral} />
            <Text style={[typography.caption, styles.gridLabel]}>{t('nextFeed')}</Text>
            <Text style={[typography.body, { fontWeight: 'bold' }]}>{getNextFeeding()}</Text>
          </View>
          <View style={styles.gridItem}>
            <Ionicons name="restaurant-outline" size={24} color={colors.neutral} />
            <Text style={[typography.caption, styles.gridLabel]}>{t('deviceStatus')}</Text>
            <View style={styles.badgeWrapper}>
              <StatusBadge status={systemData.feedingActive ? 'warning' : 'success'} text={systemData.feedingActive ? t('active') : t('idle')} />
            </View>
          </View>
        </View>
        <View style={[styles.progressContainer, { borderTopColor: colors.border }]}>
          <View style={styles.row}>
            <Text style={typography.caption}>{t('hopperLevel')}</Text>
            <Text style={[typography.body, { fontWeight: 'bold' }]}>{systemData.hopperLevelPercent.toFixed(0)}%</Text>
          </View>
          <ProgressBar progress={systemData.hopperLevelPercent} color={feedColor} />
        </View>
      </Card>

      <Card title={t('waterSystem')}>
        <View style={styles.grid}>
          <View style={styles.gridItem}>
            <Ionicons name="water-outline" size={24} color={colors.neutral} />
            <Text style={[typography.caption, styles.gridLabel]}>{t('tank')}</Text>
            <View style={styles.badgeWrapper}>
              <StatusBadge 
                status={systemData.waterLow ? 'error' : (systemData.waterHigh ? 'success' : 'online')} 
                text={systemData.waterLow ? t('low') : (systemData.waterHigh ? t('high') : t('ok'))} 
              />
            </View>
          </View>
          <View style={styles.gridItem}>
            <Ionicons name="color-filter-outline" size={24} color={colors.neutral} />
            <Text style={[typography.caption, styles.gridLabel]}>{t('pump')}</Text>
            <View style={styles.badgeWrapper}>
              <StatusBadge 
                status={systemData.pumpActive ? 'warning' : 'success'} 
                text={systemData.pumpActive ? t('running') : t('off')} 
              />
            </View>
          </View>
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
            title={systemData.emergencyStopActive ? t('releaseEmergencyStop') : t('emergencyStop')}
            onPress={handleEmergencyStop}
            variant={systemData.emergencyStopActive ? "outline" : "danger"}
            accessibilityLabel={systemData.emergencyStopActive ? t('estopReleaseTitle') : t('estopActivateTitle')}
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
