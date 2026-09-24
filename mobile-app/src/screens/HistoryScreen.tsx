import React from 'react';
import { FlatList, View, Text, StyleSheet, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDeviceHistory } from '../hooks/useDeviceHistory';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { SystemData } from '../types';
import EmptyState from '../components/EmptyState';
import Skeleton from '../components/Skeleton';
import Card from '../components/Card';
import { spacing, layout } from '../theme';

export default function HistoryScreen() {
  const { history, loading, error, refreshing, refreshData } = useDeviceHistory();
  const { colors, typography } = useTheme();
  const { t } = useLanguage();

  const renderItem = ({ item }: { item: SystemData }) => (
    <View style={[styles.card, { backgroundColor: colors.card }]} accessible={true} accessibilityRole="text" accessibilityLabel={t('historyLogA11y', { time: new Date(item.timestamp).toLocaleString(), feed: item.feedWeightGrams.toFixed(0), hopper: item.hopperLevelPercent.toFixed(0) })}>
      <View style={styles.header}>
        <Ionicons name="time-outline" size={20} color={colors.neutral} />
        <Text style={[typography.body, { fontWeight: 'bold', marginLeft: spacing.sm }]}>{new Date(item.timestamp).toLocaleString()}</Text>
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      
      <View style={styles.dataGrid}>
        <View style={styles.dataItem}>
          <Text style={typography.caption}>{t('feedSystem')}</Text>
          <Text style={[typography.bodySecondary, { fontWeight: 'bold' }]}>{item.feedWeightGrams.toFixed(0)}g</Text>
        </View>
        <View style={styles.dataItem}>
          <Text style={typography.caption}>{t('hopper')}</Text>
          <Text style={[typography.bodySecondary, { fontWeight: 'bold' }]}>{item.hopperLevelPercent.toFixed(0)}%</Text>
        </View>
        <View style={styles.dataItem}>
          <Text style={typography.caption}>{t('waterSystem')}</Text>
          <Text style={[typography.bodySecondary, { fontWeight: 'bold', color: item.waterLow ? colors.error : colors.success }]}>
            {item.waterLow ? t('low') : (item.waterHigh ? t('high') : t('ok'))}
          </Text>
        </View>
        <View style={styles.dataItem}>
          <Text style={typography.caption}>{t('pump')}</Text>
          <Text style={[typography.bodySecondary, { fontWeight: 'bold', color: item.pumpActive ? colors.warning : colors.neutral }]}>
            {item.pumpActive ? t('on') : t('off')}
          </Text>
        </View>
        <View style={styles.dataItem}>
          <Text style={typography.caption}>{t('dispenser')}</Text>
          <Text style={[typography.bodySecondary, { fontWeight: 'bold', color: item.feedingActive ? colors.warning : colors.neutral }]}>
            {item.feedingActive ? t('on') : t('off')}
          </Text>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.list}>
          {[1,2,3].map(i => (
            <View key={i} style={[styles.card, { backgroundColor: colors.card }]}><Skeleton height={100} /></View>
          ))}
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', padding: spacing.md }]}>
        <Card title="Data Error">
          <Text style={[typography.body, { color: colors.error }]}>{error}</Text>
        </Card>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={history}
        keyExtractor={(item) => item.timestamp}
        renderItem={renderItem}
        contentContainerStyle={history.length === 0 ? styles.emptyList : styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.primary} />}
        ListEmptyComponent={<EmptyState message={t('noHistory')} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: spacing.md },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  card: { borderRadius: layout.borderRadius, padding: spacing.md, marginBottom: spacing.sm, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  divider: { height: 1, marginVertical: spacing.sm },
  dataGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  dataItem: { width: '33%', marginBottom: spacing.sm, alignItems: 'flex-start' },
});
