import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import Skeleton from '../components/Skeleton';
import { useFirebaseData } from '../context/FirebaseDataContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { spacing, layout } from '../theme';

// Gravity-fed water: a reservoir on top drains to the drinker through a
// valve. The device has one float switch in the reservoir and no pump, so
// this screen only reports whether the reservoir needs refilling.
export default function WaterScreen() {
  // Data arrives through the live device listener, so there is nothing to
  // pull-to-refresh; online/stale state comes from the shared context.
  const { systemData, deviceData, deviceOnline, nowMs, loading, error } = useFirebaseData();
  const { colors, typography } = useTheme();
  const { t } = useLanguage();

  // Without this, a listener error left the loading skeleton up forever.
  if (error && !systemData) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, padding: spacing.md }]}>
        <Card title="Data Error">
          <Text style={[typography.body, { color: colors.error }]}>{error}</Text>
        </Card>
      </View>
    );
  }

  if (loading || !systemData) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Card title={t('waterTank')}><Skeleton height={150} /></Card>
      </View>
    );
  }

  const { waterLow, timestamp } = systemData;

  const tank = waterLow
    ? { text: t('refillNeeded'), icon: 'water-outline', color: colors.error }
    : { text: t('reservoirOk'), icon: 'water', color: colors.success };

  const isStale = (nowMs - new Date(timestamp).getTime()) > 300000;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Card title={t('waterTank')}>
        {!deviceOnline && deviceData?.lastHeartbeat && (
          <Text style={[typography.caption, { color: colors.error, marginBottom: spacing.sm }]}>
            {t('lastHeardFrom', { time: new Date(deviceData.lastHeartbeat).toLocaleString() })}
          </Text>
        )}
        <View style={[styles.tankVisualContainer, { backgroundColor: colors.neutralLight }]} accessible={true} accessibilityLabel={`${t('tank')}: ${tank.text}`}>
          <Ionicons name={tank.icon as any} size={64} color={tank.color} />
          <Text style={[typography.h1, { color: tank.color, marginTop: spacing.sm }]}>{tank.text}</Text>
          {waterLow && (
            <Text style={[typography.body, styles.hint, { color: colors.error }]}>{t('refillReservoirHint')}</Text>
          )}
        </View>

        <View style={[styles.row, { borderBottomColor: colors.border }]}>
          <Text style={typography.body}>{t('floatSwitch')}</Text>
          <StatusBadge status={waterLow ? 'error' : 'success'} text={waterLow ? t('low') : t('ok')} />
        </View>
        <View style={[styles.row, { borderBottomWidth: 0 }]}>
          <Text style={typography.body}>{t('updated')}</Text>
          <Text style={typography.bodySecondary}>{new Date(timestamp).toLocaleTimeString()} {isStale && `(${t('stale')})`}</Text>
        </View>
        <Text style={[typography.caption, { color: colors.textSecondary, marginTop: spacing.sm }]}>
          {t('gravityWaterNote')}
        </Text>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1 },
  tankVisualContainer: { alignItems: 'center', paddingVertical: spacing.xl, paddingHorizontal: spacing.md, marginBottom: spacing.md, borderRadius: layout.borderRadius },
  hint: { textAlign: 'center', marginTop: spacing.sm },
});
