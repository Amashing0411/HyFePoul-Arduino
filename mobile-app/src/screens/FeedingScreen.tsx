import React, { useRef, useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Switch, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../components/Card';
import ProgressBar from '../components/ProgressBar';
import StatusBadge from '../components/StatusBadge';
import DeviceDataUnavailable from '../components/DeviceDataUnavailable';
import Button from '../components/Button';
import TrayWeights from '../components/TrayWeights';
import { describeCycleStep } from '../utils/feedCycle';
import { scheduleSyncState } from '../utils/scheduleSync';
import { useFirebaseData } from '../context/FirebaseDataContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { spacing, layout } from '../theme';
import { RTDBCommand, RTDBCommandStatus, RTDBSchedule } from '../types/rtdb';

// Plain-language command states. "completed" only means the device reported
// done, not that someone checked the feeder.
const COMMAND_STATUS_LABELS: Partial<Record<RTDBCommandStatus, 'cmdQueued' | 'cmdAcknowledged' | 'cmdExecuting' | 'cmdCompleted' | 'cmdFailed'>> = {
  queued: 'cmdQueued',
  acknowledged: 'cmdAcknowledged',
  executing: 'cmdExecuting',
  completed: 'cmdCompleted',
  failed: 'cmdFailed',
};

const IN_FLIGHT_STATUSES: RTDBCommandStatus[] = ['queued', 'acknowledged', 'executing'];

// Targets are grams per tray (the hopper fills all 5 trays each cycle).
const DEFAULT_TRAY_TARGET_GRAMS = 50;
const MAX_TRAY_TARGET_GRAMS = 1000;

export default function FeedingScreen() {
  const { deviceData, systemData, deviceOnline, controllerResponding, schedules, scheduleStatus, commands, loading, issueCommand, updateSchedule } = useFirebaseData();
  const { colors, typography } = useTheme();
  const { t } = useLanguage();

  const [refreshing, setRefreshing] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const [newHour, setNewHour] = useState('');
  const [newMin, setNewMin] = useState('');
  const [newTarget, setNewTarget] = useState('');
  // null = manual feed form hidden. Alert.prompt is iOS-only, so the target
  // is entered inline to work on Android.
  const [manualTarget, setManualTarget] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollViewHeight = useRef(0);
  const scrollOffset = useRef(0);

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
      setNewTarget(String(DEFAULT_TRAY_TARGET_GRAMS));
    }
    setEditingIndex(index);
  };

  const saveEdit = async () => {
    if (editingIndex === null) return;

    const h = parseInt(newHour, 10);
    const m = parseInt(newMin, 10);
    const tg = parseInt(newTarget, 10);

    if (isNaN(h) || h < 0 || h > 23 || isNaN(m) || m < 0 || m > 59) {
      Alert.alert("Error", "Please enter a valid time (00-23 for hours, 00-59 for minutes).");
      return;
    }

    if (isNaN(tg) || tg <= 0 || tg > MAX_TRAY_TARGET_GRAMS) {
      Alert.alert(t('invalidTarget'), t('invalidFeedTarget'));
      return;
    }

    // The Mega runs every schedule daily (decision D3), so all days are
    // always written to satisfy the RTDB schema.
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
    } catch {
      Alert.alert("Error", "Failed to save schedule.");
    }
  };

  const deleteSchedule = async (index: number) => {
    const existing = schedules.find(s => s.scheduleId === `sched_${index}`);
    if (!existing) return;

    Alert.alert(
      t('delete') || "Delete",
      "Are you sure you want to delete this schedule?",
      [
        { text: t('cancel') || "Cancel", style: "cancel" },
        {
          text: t('delete') || "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              // "Delete" disables the slot and resets it to 00:00. updateSchedule
              // also queues the matching SCHEDULE_SET for the Mega.
              await updateSchedule({
                scheduleId: `sched_${index}`,
                hour: 0, minute: 0, targetGrams: DEFAULT_TRAY_TARGET_GRAMS, enabled: false, daysOfWeek: [1,2,3,4,5,6,7]
              });
            } catch {
              Alert.alert("Error", "Failed to delete schedule.");
            }
          }
        }
      ]
    );
  };

  const toggleSchedule = async (index: number, currentEnabled: boolean) => {
    const existing = schedules.find(s => s.scheduleId === `sched_${index}`);
    if (!existing) return;

    try {
      await updateSchedule({
        ...existing,
        enabled: !currentEnabled
      });
    } catch {
      Alert.alert("Error", "Failed to toggle schedule.");
    }
  };

  const startManualFeed = async () => {
    const grams = parseFloat(manualTarget || '');
    if (isNaN(grams) || grams <= 0 || grams > MAX_TRAY_TARGET_GRAMS) {
      Alert.alert(t('manualFeed'), t('invalidFeedTarget'));
      return;
    }
    setManualTarget(null);
    await issueCommand('MANUAL_FEED', { targetGrams: grams });
  };

  // What the app can actually show as evidence for a finished manual feed:
  // the Mega only reports SUCCESS when every tray's load cell reached the
  // target and the hopper is back home; the tray weights arrive separately
  // in the next state update.
  const renderFeedEvidence = (command: RTDBCommand) => {
    if (command.command !== 'MANUAL_FEED' || command.status !== 'completed' || !systemData) {
      return null;
    }

    const target = command.parameters?.targetGrams;
    const readingTime = new Date(systemData.timestamp).getTime();
    const readingIsAfterCompletion = command.completedAt !== undefined && readingTime >= command.completedAt;

    return (
      <View style={{ marginTop: spacing.xs }}>
        {target !== undefined && (
          <Text style={typography.caption}>{t('feedCompletedEvidence', { target })}</Text>
        )}
        <Text style={[typography.caption, { color: colors.textSecondary }]}>
          {readingIsAfterCompletion
            ? t('lastScaleReading', {
                weight: systemData.feedWeightGrams.toFixed(0),
                time: new Date(readingTime).toLocaleTimeString(),
              })
            : t('awaitingScaleReading')}
        </Text>
      </View>
    );
  };

  if (loading || !deviceData || !systemData) {
    return <DeviceDataUnavailable />;
  }

  const feedColor = systemData.hopperLevelPercent < 20 ? colors.error : colors.warning;

  const activeCommand = commands.length > 0 ? commands[0] : null;
  // Block a second manual feed until the first one has finished.
  const manualFeedInFlight = commands.some(c => c.command === 'MANUAL_FEED' && IN_FLIGHT_STATUSES.includes(c.status));
  // An offline device would only pick a feed up later (or let it go stale),
  // so manual feeding is blocked until heartbeats resume.
  // The same applies when the ESP32 is online but no longer hears the Mega.
  const manualFeedBlocked = systemData.emergencyStopActive || systemData.feedingActive || manualFeedInFlight || !controllerResponding;
  // Find if there is a pending sync command for schedules
  const pendingSyncCmd = commands.find(c => c.command === 'SCHEDULE_SET' && (c.status === 'queued' || c.status === 'acknowledged' || c.status === 'executing'));

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <ScrollView
        ref={scrollRef}
        onLayout={(e) => { scrollViewHeight.current = e.nativeEvent.layout.height; }}
        onScroll={(e) => { scrollOffset.current = e.nativeEvent.contentOffset.y; }}
        scrollEventThrottle={100}
        contentContainerStyle={styles.content}
        // Let a tap on Start Feed / Save act while the keyboard is open
        // (the default swallows the first tap to dismiss the keyboard).
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} />}
      >
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
          <View style={[styles.progressContainer, { borderTopColor: colors.border }]}>
            <Text style={[typography.caption, { marginBottom: spacing.xs }]}>{t('trays')}</Text>
            <TrayWeights weights={systemData.trayWeightsGrams} currentTray={systemData.feedingActive ? systemData.currentTray : 0} />
            <View style={[styles.row, { marginTop: spacing.sm }]}>
              <Text style={typography.caption}>{t('feedCycle')}</Text>
              <Text style={[typography.caption, { flexShrink: 1, textAlign: 'right', marginLeft: spacing.sm }]}>
                {describeCycleStep(t, systemData.cycleStep, systemData.currentTray)}
              </Text>
            </View>
            {systemData.feedingActive && (
              <Text style={[typography.caption, { color: colors.textSecondary }]}>
                {t('cycleTargetPerTray', { target: systemData.targetFeedGrams.toFixed(0) })}
              </Text>
            )}
          </View>
          <View style={[styles.progressContainer, { borderTopColor: colors.border }]}>
            <View style={styles.row}>
              <Text style={typography.caption}>{t('hopperLevel')}</Text>
              <Text style={[typography.body, { fontWeight: 'bold' }]}>{systemData.hopperLevelPercent.toFixed(0)}%</Text>
            </View>
            <ProgressBar progress={systemData.hopperLevelPercent} color={feedColor} />
          </View>

          <View style={{ marginTop: spacing.md }}>
            {manualTarget === null ? (
              <Button
                title={t('manualFeed')}
                onPress={() => setManualTarget(String(DEFAULT_TRAY_TARGET_GRAMS))}
                variant="outline"
                disabled={manualFeedBlocked}
                accessibilityLabel={t('manualFeed')}
              />
            ) : (
              <View>
                <Text style={typography.caption}>{t('manualFeedPrompt')}</Text>
                <TextInput
                  style={[styles.input, typography.body, { borderColor: colors.border, color: colors.text }]}
                  value={manualTarget}
                  onChangeText={setManualTarget}
                  keyboardType="number-pad"
                  maxLength={4}
                  accessibilityLabel={t('manualFeedPrompt')}
                />
                <View style={[styles.row, { marginTop: spacing.sm }]}>
                  <View style={{ flex: 1, marginRight: spacing.xs }}>
                    <Button title={t('cancel')} onPress={() => setManualTarget(null)} variant="outline" accessibilityLabel={t('cancel')} />
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.xs }}>
                    <Button
                      title={t('startFeed')}
                      onPress={startManualFeed}
                      disabled={manualFeedBlocked}
                      accessibilityLabel={t('startFeed')}
                    />
                  </View>
                </View>
              </View>
            )}
            {!deviceOnline && (
              <Text style={[typography.caption, { color: colors.error, marginTop: spacing.xs }]}>
                {t('deviceOfflineHint')}
              </Text>
            )}
            {deviceOnline && !controllerResponding && (
              <Text style={[typography.caption, { color: colors.error, marginTop: spacing.xs }]}>
                {t('controllerNotRespondingHint')}
              </Text>
            )}
          </View>
        </Card>

        {activeCommand && (
          <Card title={t('commandStatus')}>
            <View style={styles.row}>
              <Text style={typography.body}>{activeCommand.command}</Text>
              <StatusBadge
                status={
                  activeCommand.status === 'completed' ? 'success' :
                  activeCommand.status === 'failed' || activeCommand.status === 'rejected' ? 'error' : 'warning'
                }
                text={COMMAND_STATUS_LABELS[activeCommand.status] ? t(COMMAND_STATUS_LABELS[activeCommand.status]!) : activeCommand.status.toUpperCase()}
              />
            </View>
            {activeCommand.error && (
              <Text style={[typography.caption, { color: colors.error, marginTop: spacing.xs }]}>
                {activeCommand.error}
              </Text>
            )}
            {renderFeedEvidence(activeCommand)}
            <Text style={[typography.caption, { marginTop: spacing.xs, color: colors.textSecondary }]}>
              {new Date(activeCommand.createdAt).toLocaleTimeString()}
            </Text>
          </Card>
        )}

        <View style={styles.sectionHeader}>
          <Text style={typography.h2}>{t('schedules') || "Feeding Schedules"}</Text>
          {pendingSyncCmd && (
            <StatusBadge status="warning" text="Syncing..." />
          )}
        </View>
        <Text style={[typography.caption, { marginBottom: spacing.md }]}>
          {t('schedulesRunDaily')}
        </Text>

        {[0, 1, 2].map(index => {
          const schedule = schedules.find(s => s.scheduleId === `sched_${index}`);
          const isEditing = editingIndex === index;

          if (isEditing) {
            return (
              // The editor opens at the bottom of the list, partly under the
              // tab bar; scroll it fully into view once it has been laid out.
              <View
                key={`edit_${index}`}
                onLayout={(e) => {
                  const { y, height } = e.nativeEvent.layout;
                  // Scroll down only if the editor's bottom is out of view.
                  const target = y + height + spacing.md - scrollViewHeight.current;
                  if (target > scrollOffset.current) {
                    scrollRef.current?.scrollTo({ y: target, animated: true });
                  }
                }}
              >
              <Card title={`Edit Schedule ${index + 1}`}>
                <View style={styles.formRow}>
                  <View style={styles.inputGroup}>
                    <Text style={typography.caption}>Time</Text>
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
                    <Text style={typography.caption}>{t('amountPerTray')}</Text>
                    <TextInput
                      style={[styles.input, typography.body, { borderColor: colors.border, color: colors.text }]}
                      value={newTarget}
                      onChangeText={setNewTarget}
                      placeholder="e.g. 50"
                      placeholderTextColor={colors.textSecondary}
                      keyboardType="number-pad"
                    />
                  </View>
                </View>
                <View style={[styles.row, { marginTop: spacing.md }]}>
                  <View style={{ flex: 1, marginRight: spacing.xs }}>
                    <Button title={t('cancel')} onPress={() => setEditingIndex(null)} variant="outline" accessibilityLabel="Cancel" />
                  </View>
                  <View style={{ flex: 1, marginLeft: spacing.xs }}>
                    <Button title={t('save')} onPress={saveEdit} accessibilityLabel="Save" />
                  </View>
                </View>
              </Card>
              </View>
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
                        {schedule.targetGrams} g {t('perTray')}
                      </Text>
                    </View>
                    {/* R-43: does the Mega have exactly this schedule? */}
                    <View style={{ alignSelf: 'flex-start', marginTop: spacing.xs }}>
                      {scheduleSyncState(schedule, scheduleStatus[schedule.scheduleId]) === 'onDevice' ? (
                        <StatusBadge status="success" text={t('scheduleOnDevice')} />
                      ) : (
                        <StatusBadge status="warning" text={t('scheduleWaiting')} />
                      )}
                    </View>
                  </View>
                  <View style={styles.scheduleActions}>
                    <TouchableOpacity onPress={() => startEdit(index)} style={styles.iconButton}>
                      <Ionicons name="create-outline" size={24} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteSchedule(index)} style={styles.iconButton}>
                      <Ionicons name="trash-outline" size={24} color={colors.error} />
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
