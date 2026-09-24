import React from 'react';
import { ScrollView, View, Text, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../components/Card';
import StatusBadge from '../components/StatusBadge';
import Skeleton from '../components/Skeleton';
import { useMockData } from '../context/MockDataContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { spacing, layout } from '../theme';

export default function WaterScreen() {
  const { systemData, loading, refreshing, refreshData } = useMockData();
  const { colors, typography } = useTheme();
  const { t } = useLanguage();
  const { waterLow, waterHigh, pumpActive, timestamp } = systemData;

  const getTankStatus = () => {
    if (waterLow) return { text: t('refillNeeded'), badge: 'error' as const, icon: 'water-outline', color: colors.error };
    if (waterHigh) return { text: t('tankFull'), badge: 'success' as const, icon: 'water', color: colors.primary };
    return { text: t('normal'), badge: 'success' as const, icon: 'water', color: colors.success };
  };

  const tank = getTankStatus();
  const isStale = (new Date().getTime() - new Date(timestamp).getTime()) > 300000;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Card title={t('waterTank')}><Skeleton height={150} /></Card>
        <Card title={t('pumpSystem')}><Skeleton height={100} /></Card>
      </View>
    );
  }

  return (
    <ScrollView 
      style={[styles.container, { backgroundColor: colors.background }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.primary} />}
    >
      <Card title={t('waterTank')}>
        <View style={[styles.tankVisualContainer, { backgroundColor: colors.neutralLight }]} accessible={true} accessibilityLabel={`${t('tank')}: ${tank.text}`}>
          <Ionicons name={tank.icon as any} size={64} color={tank.color} />
          <Text style={[typography.h1, { color: tank.color, marginTop: spacing.sm }]}>{tank.text}</Text>
        </View>

        <View style={[styles.row, { borderBottomColor: colors.border }]}>
          <Text style={typography.body}>{t('lowFloat')}</Text>
          <StatusBadge status={waterLow ? 'warning' : 'neutral'} text={waterLow ? t('triggered') : t('clear')} />
        </View>
        <View style={[styles.row, { borderBottomColor: colors.border }]}>
          <Text style={typography.body}>{t('highFloat')}</Text>
          <StatusBadge status={waterHigh ? 'success' : 'neutral'} text={waterHigh ? t('triggered') : t('clear')} />
        </View>
      </Card>

      <Card title={t('pumpSystem')}>
        <View style={[styles.pumpVisualContainer, { backgroundColor: colors.neutralLight }]} accessible={true} accessibilityLabel={pumpActive ? t('pumpRunning') : t('pumpIdle')}>
          <Ionicons name="color-filter-outline" size={48} color={pumpActive ? colors.warning : colors.neutral} />
          <View style={styles.pumpInfo}>
            <Text style={[typography.body, { fontWeight: 'bold', marginBottom: spacing.xs }]}>{pumpActive ? t('pumpRunning') : t('pumpIdle')}</Text>
            <StatusBadge status={pumpActive ? 'warning' : 'neutral'} text={pumpActive ? t('active') : t('off')} />
          </View>
        </View>
        <View style={[styles.row, { marginTop: spacing.md, borderBottomWidth: 0 }]}>
          <Text style={typography.body}>{t('updated')}</Text>
          <Text style={typography.bodySecondary}>{new Date(timestamp).toLocaleTimeString()} {isStale && `(${t('stale')})`}</Text>
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
