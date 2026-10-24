import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useFirebaseData } from '../context/FirebaseDataContext';
import { useDailySummaries } from '../hooks/useDailySummaries';
import {
  buildDayBars, deviceDate, deviceMonth, formatKg, isSameMonth, MonthRef, shiftMonth, summarizeMonth,
} from '../utils/monthlySummary';
import Card from './Card';
import EmptyState from './EmptyState';
import Skeleton from './Skeleton';
import { spacing, layout } from '../theme';

const BAR_AREA_HEIGHT = 120;

// Monthly progress for the owner (R-22): totals and feed per day, from the
// daily summaries the device writes to /dailySummary.
export default function MonthlySummary() {
  const { colors, typography } = useTheme();
  const { t, language } = useLanguage();
  const { nowMs } = useFirebaseData();

  const currentMonth = deviceMonth(nowMs);
  const today = deviceDate(nowMs);
  const [month, setMonth] = useState<MonthRef>(currentMonth);
  const { days, loading, error } = useDailySummaries(month);

  const isCurrent = isSameMonth(month, currentMonth);
  const totals = useMemo(() => summarizeMonth(days), [days]);
  const bars = useMemo(() => buildDayBars(month, days, isCurrent ? today : undefined), [month, days, isCurrent, today]);
  const maxGrams = Math.max(1, ...bars.map((b) => b.feedGrams ?? 0));
  const todayGrams = days.find((d) => d.date === today)?.feedGrams;

  const monthLabel = new Date(Date.UTC(month.year, month.month - 1, 1)).toLocaleDateString(
    language === 'tl' ? 'fil-PH' : 'en-US',
    { month: 'long', year: 'numeric', timeZone: 'UTC' }
  );
  const fileMonth = `${month.year}${String(month.month).padStart(2, '0')}`;
  const problems = [
    { label: t('monthLowWater'), value: totals.lowWaterAlerts },
    { label: t('monthLowFeed'), value: totals.lowFeedAlerts },
    { label: t('monthEstops'), value: totals.emergencyStops },
    { label: t('monthTrayTimeouts'), value: totals.trayTimeouts },
    { label: t('monthChainFaults'), value: totals.chainFaults },
  ];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.monthPicker}>
        <TouchableOpacity
          onPress={() => setMonth(shiftMonth(month, -1))}
          style={styles.arrow}
          accessibilityRole="button"
          accessibilityLabel={t('previousMonth')}
        >
          <Ionicons name="chevron-back" size={24} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[typography.h2, styles.monthLabel]} accessibilityRole="header">{monthLabel}</Text>
        <TouchableOpacity
          onPress={() => setMonth(shiftMonth(month, 1))}
          style={styles.arrow}
          disabled={isCurrent}
          accessibilityRole="button"
          accessibilityLabel={t('nextMonth')}
          accessibilityState={{ disabled: isCurrent }}
        >
          <Ionicons name="chevron-forward" size={24} color={isCurrent ? colors.border : colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={[styles.card, { backgroundColor: colors.card }]}><Skeleton height={160} /></View>
      ) : error ? (
        <Card title="Data Error">
          <Text style={[typography.body, { color: colors.error }]}>{error}</Text>
        </Card>
      ) : days.length === 0 ? (
        <EmptyState message={t('monthNoData')} />
      ) : (
        <>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={typography.caption}>{t('monthFeed')}</Text>
            <Text style={typography.h1}>{t('monthFeedUnit', { kg: formatKg(totals.feedGrams) })}</Text>
            <Text style={[typography.caption, { marginTop: spacing.xs }]}>
              {t('monthFeedAverage', { kg: formatKg(totals.feedGrams / totals.daysReported), days: totals.daysReported })}
            </Text>
            {isCurrent && todayGrams !== undefined && (
              <Text style={[typography.bodySecondary, { marginTop: spacing.xs }]}>
                {t('monthSoFar', { grams: todayGrams.toFixed(0) })}
              </Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[typography.body, styles.cardTitle]}>{t('monthCycles')}</Text>
            <View style={styles.row}>
              <Text style={[typography.bodySecondary, { color: colors.success, fontWeight: 'bold' }]}>
                {t('monthCyclesDone', { done: totals.cyclesCompleted })}
              </Text>
              <Text style={[typography.bodySecondary, { color: totals.cyclesIncomplete > 0 ? colors.warning : colors.textSecondary, fontWeight: 'bold' }]}>
                {t('monthCyclesIncomplete', { count: totals.cyclesIncomplete })}
              </Text>
            </View>
          </View>

          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[typography.body, styles.cardTitle]}>{t('monthAlerts')}</Text>
            {problems.map((p) => (
              <View key={p.label} style={styles.row}>
                <Text style={typography.bodySecondary}>{p.label}</Text>
                <Text style={[typography.bodySecondary, { fontWeight: 'bold', color: p.value > 0 ? colors.error : colors.textSecondary }]}>
                  {p.value}
                </Text>
              </View>
            ))}
          </View>

          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <Text style={[typography.body, styles.cardTitle]}>{t('monthDailyFeed')}</Text>
            <View style={[styles.bars, { borderBottomColor: colors.border }]}>
              {bars.map((b) => (
                <View
                  key={b.date}
                  style={styles.barSlot}
                  accessible={true}
                  accessibilityLabel={b.feedGrams === null
                    ? t('monthDayNoData', { day: b.day })
                    : t('monthDayA11y', { day: b.day, grams: b.feedGrams.toFixed(0) })}
                >
                  <View
                    style={{
                      height: b.feedGrams ? Math.max(2, (b.feedGrams / maxGrams) * BAR_AREA_HEIGHT) : 2,
                      backgroundColor: b.feedGrams === null ? colors.border : b.date === today ? colors.warning : colors.primary,
                      borderTopLeftRadius: 2,
                      borderTopRightRadius: 2,
                    }}
                  />
                </View>
              ))}
            </View>
            <View style={styles.row}>
              <Text style={typography.caption}>1</Text>
              <Text style={typography.caption}>{bars.length}</Text>
            </View>
            <Text style={[typography.caption, { marginTop: spacing.xs }]}>{t('monthDetailHint', { month: fileMonth })}</Text>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, flexGrow: 1 },
  monthPicker: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  arrow: { minWidth: layout.minTouchTarget, minHeight: layout.minTouchTarget, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { flex: 1, textAlign: 'center' },
  card: { borderRadius: layout.borderRadius, padding: spacing.md, marginBottom: spacing.sm, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardTitle: { fontWeight: 'bold', marginBottom: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: BAR_AREA_HEIGHT, borderBottomWidth: 1 },
  barSlot: { flex: 1, marginHorizontal: 1, justifyContent: 'flex-end' },
});
