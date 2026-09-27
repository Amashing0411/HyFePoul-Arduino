import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Switch, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../components/Card';
import ProgressBar from '../components/ProgressBar';
import StatusBadge from '../components/StatusBadge';
import Skeleton from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import Button from '../components/Button';
import { useFirebaseData } from '../context/FirebaseDataContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { spacing, layout } from '../theme';
import { RTDBSchedule } from '../types/rtdb';

export default function FeedingScreen() {
  const { deviceData, systemData, schedules, commands, loading, error, issueCommand, updateSchedule } = useFirebaseData();
  const { colors, typography } = useTheme();
  const { t } = useLanguage();
  
  const [refreshing, setRefreshing] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  
  const [newHour, setNewHour] = useState('');
  const [newMin, setNewMin] = useState('');
  const [newTarget, setNewTarget] = useState('');

  const formatTime = (h: number, m: number) => {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await issueCommand('STATUS_REQ');
    setTimeout(() => setRefreshing(false), 1500);
  };

  const startEdit = (index: number) => {
    const existing = schedules.find(s => s.scheduleId === `sched_${index}`);
    if (existing) {
      setNewHour(existing.hour.toString());
      setNewMin(existing.minute.toString());
      setNewTarget(existing.targetGrams.toString());
    } else {
      setNewHour('07');
      setNewMin('00');
      setNewTarget('250');
    }
    setEditingIndex(index);
  };

  const saveEdit = async () => {
    if (editingIndex === null) return;
    
    const h = parseInt(newHour, 10);
    const m = parseInt(newMin, 10);
    const tg = parseInt(newTarget, 10);

    if (isNaN(h) || h < 0 || h > 23 || isNaN(m) || m < 0 || m > 59) {
      Alert.alert(t('error') || "Error", t('invalidTime') || "Please enter a valid time (00-23 for hours, 00-59 for minutes).");
      return;
    }

    if (isNaN(tg) || tg <= 0 || tg > 2000) {
      Alert.alert(t('error') || "Error", t('invalidTarget') || "Please enter a valid target weight (1-2000g).");
      return;
    }

    const payload: RTDBSchedule = {
      scheduleId: `sched_${editingIndex}`,
      hour: h,
      minute: m,
      targetGrams: tg,
      enabled: true,
      daysOfWeek: [1,2,3,4,5,6,7]
    };

    try {
      await updateSchedule(payload);
      setEditingIndex(null);
    } catch (e) {
      Alert.alert("Error", "Failed to save schedule.");
    }
  };

  const toggleSchedule = async (index: number, currentEnabled: boolean) => {
    const existing = schedules.find(s => s.scheduleId === `sched_${index}`);
    if (!existing) return;
    
    try {
      await updateSchedule({
        ...existing,
        enabled: !currentEnabled
      });
    } catch (e) {
      Alert.alert("Error", "Failed to toggle schedule.");
    }
  };

  const handleManualFeed = () => {
    Alert.prompt(
      "Manual Feed",
      "Enter target weight in grams (e.g. 500):",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Start Feed", 
          onPress: (text) => {
            const grams = parseFloat(text || "");
            if (!isNaN(grams) && grams > 0 && grams <= 2000) {
              issueCommand('MANUAL_FEED', { targetGrams: grams });
            } else {
              Alert.alert("Invalid Input", "Please enter a valid number (1-2000g).");
            }
          }
        }
      ],
      "plain-text",
      "500",
      "number-pad"
    );
  };

  if (loading || !deviceData || !systemData) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.content}>
          <Skeleton height={150} style={{ marginBottom: spacing.md }} />
          <Skeleton height={80} style={{ marginBottom: spacing.sm }} />
          <Skeleton height={80} style={{ marginBottom: spacing.sm }} />
          <Skeleton height={80} />
        </View>
      </View>
    );
  }

  const feedColor = systemData.hopperLevelPercent < 20 ? colors.error : colors.warning;
  
  // Find if there is a pending sync command for schedules
  const pendingSyncCmd = commands.find(c => c.command === 'SCHEDULE_SET' && (c.status === 'queued' || c.status === 'acknowledged' || c.status === 'executing'));

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView 
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
        <Card title={t('feedSystem')}>
          <View style={styles.grid}>
            <View style={styles.gridItem}>
              <Ionicons name="scale-outline" size={24} color={colors.neutral} />
              <Text style={[typography.caption, styles.gridLabel]}>{t('weight')}</Text>
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
          <View style={[styles.progressContainer, { borderTopColor: colors.border }]}>
            <View style={styles.row}>
              <Text style={typography.caption}>{t('hopperLevel')}</Text>
              <Text style={[typography.body, { fontWeight: 'bold' }]}>{systemData.hopperLevelPercent.toFixed(0)}%</Text>
            </View>
            <ProgressBar progress={systemData.hopperLevelPercent} color={feedColor} />
          </View>
          
          <View style={{ marginTop: spacing.md }}>
            <Button 
              title="Manual Feed"
              onPress={handleManualFeed}
              variant="outline"
              disabled={systemData.emergencyStopActive || systemData.feedingActive}
            />
          </View>
        </Card>

        <View style={styles.sectionHeader}>
          <Text style={typography.h2}>{t('schedules') || "Feeding Schedules"}</Text>
          {pendingSyncCmd && (
            <StatusBadge status="warning" text="Syncing..." />
          )}
        </View>
        <Text style={[typography.caption, { marginBottom: spacing.md }]}>
          Supports up to 3 daily schedules. Synchronization to the physical device occurs automatically.
        </Text>

        {[0, 1, 2].map(index => {
          const schedule = schedules.find(s => s.scheduleId === `sched_${index}`);
          const isEditing = editingIndex === index;
          
          if (isEditing) {
            return (
              <Card key={`edit_${index}`} title={`Edit Schedule ${index + 1}`}>
                <View style={styles.formRow}>
                  <View style={styles.inputGroup}>
                    <Text style={typography.caption}>{t('time')}</Text>
                    <View style={styles.timeInputContainer}>
                      <TextInput 
                        style={[styles.input, typography.body, { borderColor: colors.border, color: colors.text }]}
                        value={newHour}
                        onChangeText={setNewHour}
                        placeholder="00-23"
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                      <Text style={[typography.h2, { marginHorizontal: 4 }]}>:</Text>
                      <TextInput 
                        style={[styles.input, typography.body, { borderColor: colors.border, color: colors.text }]}
                        value={newMin}
                        onChangeText={setNewMin}
                        placeholder="00-59"
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="number-pad"
                        maxLength={2}
                      />
                    </View>
                  </View>
                  <View style={styles.inputGroup}>
                    <Text style={typography.caption}>{t('amount')}</Text>
                    <TextInput 
                      style={[styles.input, typography.body, { borderColor: colors.border, color: colors.text }]}
                      value={newTarget}
                      onChangeText={setNewTarget}
                      placeholder="Grams (e.g. 250)"
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
                <View style={[styles.row, { marginTop: spacing.md }]}>
                  <Button title={t('cancel')} onPress={() => setEditingIndex(null)} variant="outline" style={{ flex: 1, marginRight: spacing.xs }} />
                  <Button title={t('save')} onPress={saveEdit} style={{ flex: 1, marginLeft: spacing.xs }} />
                </View>
              </Card>
            );
          }

          if (schedule) {
            return (
              <Card key={schedule.scheduleId}>
                <View style={styles.scheduleRow}>
                  <View style={styles.scheduleInfo}>
                    <Text style={[typography.h1, !schedule.enabled && { color: colors.textSecondary }]}>
                      {formatTime(schedule.hour, schedule.minute)}
                    </Text>
                    <View style={[styles.row, { justifyContent: 'flex-start', marginTop: 4 }]}>
                      <Ionicons name="restaurant" size={14} color={schedule.enabled ? colors.primary : colors.textSecondary} />
                      <Text style={[typography.body, { marginLeft: 4 }, !schedule.enabled && { color: colors.textSecondary }]}>
                        {schedule.targetGrams} g
                      </Text>
                    </View>
                  </View>
                  <View style={styles.scheduleActions}>
                    <TouchableOpacity onPress={() => startEdit(index)} style={styles.iconButton}>
                      <Ionicons name="create-outline" size={24} color={colors.primary} />
                    </TouchableOpacity>
                    <Switch
                      value={schedule.enabled}
                      onValueChange={() => toggleSchedule(index, schedule.enabled)}
                      trackColor={{ false: colors.border, true: colors.primary }}
                      thumbColor="#fff"
                    />
                  </View>
                </View>
              </Card>
            );
          }

          // Empty slot
          return (
            <TouchableOpacity key={`empty_${index}`} onPress={() => startEdit(index)} activeOpacity={0.7}>
              <View style={[styles.emptySchedule, { borderColor: colors.border, borderStyle: 'dashed', borderWidth: 2, backgroundColor: colors.card }]}>
                <Ionicons name="add-circle-outline" size={32} color={colors.textSecondary} />
                <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.xs }]}>
                  Add Schedule {index + 1}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: spacing.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: spacing.xs },
  grid: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
  gridItem: { alignItems: 'center', width: '45%', marginBottom: spacing.md },
  gridLabel: { marginVertical: spacing.xs },
  badgeWrapper: { alignItems: 'center', width: '100%' },
  progressContainer: { marginTop: spacing.sm, borderTopWidth: 1, paddingTop: spacing.sm },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md, marginBottom: spacing.sm },
  scheduleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scheduleInfo: { flex: 1 },
  scheduleActions: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { padding: spacing.sm, marginRight: spacing.sm },
  formRow: { flexDirection: 'row', justifyContent: 'space-between' },
  inputGroup: { flex: 1, marginRight: spacing.sm },
  timeInputContainer: { flexDirection: 'row', alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: layout.borderRadius, padding: spacing.sm, marginTop: spacing.xs, flex: 1, textAlign: 'center' },
  emptySchedule: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg, borderRadius: layout.borderRadius, marginBottom: spacing.sm }
});
