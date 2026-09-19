import React, { useState } from 'react';
import { ScrollView, View, Text, StyleSheet, Switch, TouchableOpacity, TextInput, Alert, KeyboardAvoidingView, Platform, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Card from '../components/Card';
import ProgressBar from '../components/ProgressBar';
import StatusBadge from '../components/StatusBadge';
import Skeleton from '../components/Skeleton';
import EmptyState from '../components/EmptyState';
import Button from '../components/Button';
import { useMockData } from '../context/MockDataContext';
import { useTheme } from '../context/ThemeContext';
import { spacing, layout } from '../theme';

export default function FeedingScreen() {
  const { systemData, schedules, toggleSchedule, deleteSchedule, addSchedule, loading, refreshing, refreshData } = useMockData();
  const { colors, typography } = useTheme();
  const [isAdding, setIsAdding] = useState(false);
  const [newHour, setNewHour] = useState('');
  const [newMin, setNewMin] = useState('');
  const [newTarget, setNewTarget] = useState('');

  const formatTime = (h: number, m: number) => {
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  };

  const handleAdd = () => {
    const h = parseInt(newHour, 10);
    const m = parseInt(newMin, 10);
    const t = parseInt(newTarget, 10);

    if (isNaN(h) || h < 0 || h > 23 || isNaN(m) || m < 0 || m > 59) {
      Alert.alert('Invalid Time', 'Please enter a valid hour (0-23) and minute (0-59).');
      return;
    }
    if (isNaN(t) || t <= 0) {
      Alert.alert('Invalid Target', 'Target feed must be greater than 0 g.');
      return;
    }

    addSchedule({
      id: Math.random().toString(),
      hour: h,
      minute: m,
      targetGrams: t,
      enabled: true,
    });
    
    setIsAdding(false);
    setNewHour('');
    setNewMin('');
    setNewTarget('');
  };

  const confirmDelete = (id: string, timeStr: string) => {
    Alert.alert('Delete Schedule', `Remove the ${timeStr} schedule?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSchedule(id) }
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Card title="Feed Status"><Skeleton height={60} /></Card>
        <Card title="Schedules"><Skeleton height={100} /></Card>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refreshData} tintColor={colors.primary} />}>
        <Card title="Feed Status">
          <View style={styles.row}>
            <Text style={typography.body}>Hopper</Text>
            <Text style={[typography.body, { fontWeight: 'bold' }]}>{systemData.hopperLevelPercent.toFixed(0)}%</Text>
          </View>
          <ProgressBar progress={systemData.hopperLevelPercent} color={systemData.hopperLevelPercent < 20 ? colors.error : colors.warning} />
          <View style={[styles.row, { marginTop: spacing.md }]}>
            <Text style={typography.body}>Weight:</Text>
            <Text style={[typography.body, { fontWeight: 'bold' }]}>{systemData.feedWeightGrams.toFixed(0)} g</Text>
          </View>
          <View style={styles.row}>
            <Text style={typography.body}>State:</Text>
            <StatusBadge status={systemData.feedingActive ? 'warning' : 'success'} text={systemData.feedingActive ? 'DISPENSING' : 'IDLE'} />
          </View>
        </Card>

        <Card title="Schedules">
          {schedules.length === 0 && !isAdding ? (
            <EmptyState message="No feeding schedules configured." actionText="Add Schedule" onAction={() => setIsAdding(true)} />
          ) : (
            schedules.map((schedule) => {
              const timeStr = formatTime(schedule.hour, schedule.minute);
              return (
                <View key={schedule.id} style={[styles.scheduleItem, { borderBottomColor: colors.border }]}>
                  <View style={styles.scheduleInfo}>
                    <Text style={[typography.h1, !schedule.enabled && { color: colors.neutral }]}>{timeStr}</Text>
                    <Text style={[typography.bodySecondary, !schedule.enabled && { color: colors.neutral }]}>{schedule.targetGrams} g</Text>
                  </View>
                  <View style={styles.scheduleActions}>
                    <Switch
                      value={schedule.enabled}
                      onValueChange={() => toggleSchedule(schedule.id)}
                      trackColor={{ false: colors.neutralLight, true: colors.primary }}
                      accessible={true}
                      accessibilityLabel={`Toggle ${timeStr} schedule`}
                    />
                    <TouchableOpacity 
                      onPress={() => confirmDelete(schedule.id, timeStr)} 
                      style={styles.deleteBtn}
                      accessible={true}
                      accessibilityLabel={`Delete ${timeStr} schedule`}
                      hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}
                    >
                      <Ionicons name="trash-outline" size={24} color={colors.error} />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}

          {!isAdding && schedules.length > 0 && (
            <Button title="Add Schedule" onPress={() => setIsAdding(true)} variant="outline" accessibilityLabel="Add new feeding schedule" />
          )}

          {isAdding && (
            <View style={[styles.addForm, { backgroundColor: colors.neutralLight }]}>
              <View style={styles.formRow}>
                <View style={styles.inputGroup}>
                  <Text style={typography.caption}>Hour</Text>
                  <TextInput 
                    style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} 
                    placeholder="0-23" 
                    placeholderTextColor={colors.textSecondary}
                    value={newHour} 
                    onChangeText={setNewHour} 
                    keyboardType="number-pad" 
                    maxLength={2} 
                    accessibilityLabel="Hour input" 
                  />
                </View>
                <Text style={[styles.colon, { color: colors.text }]}>:</Text>
                <View style={styles.inputGroup}>
                  <Text style={typography.caption}>Min</Text>
                  <TextInput 
                    style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} 
                    placeholder="0-59" 
                    placeholderTextColor={colors.textSecondary}
                    value={newMin} 
                    onChangeText={setNewMin} 
                    keyboardType="number-pad" 
                    maxLength={2} 
                    accessibilityLabel="Minute input" 
                  />
                </View>
                <View style={[styles.inputGroup, { marginLeft: spacing.md }]}>
                  <Text style={typography.caption}>Amount (g)</Text>
                  <TextInput 
                    style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }]} 
                    placeholder="Grams" 
                    placeholderTextColor={colors.textSecondary}
                    value={newTarget} 
                    onChangeText={setNewTarget} 
                    keyboardType="number-pad" 
                    accessibilityLabel="Target grams input" 
                  />
                </View>
              </View>
              <View style={styles.formActions}>
                <View style={{flex: 1, marginRight: spacing.sm}}>
                  <Button title="Cancel" onPress={() => setIsAdding(false)} variant="outline" accessibilityLabel="Cancel adding schedule" />
                </View>
                <View style={{flex: 1}}>
                  <Button title="Save" onPress={handleAdd} accessibilityLabel="Save new schedule" />
                </View>
              </View>
            </View>
          )}
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: spacing.xs },
  scheduleItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md, borderBottomWidth: 1 },
  scheduleInfo: { flex: 1 },
  scheduleActions: { flexDirection: 'row', alignItems: 'center' },
  deleteBtn: { marginLeft: spacing.md, padding: spacing.xs, minHeight: layout.minTouchTarget, justifyContent: 'center' },
  addForm: { padding: spacing.md, borderRadius: layout.borderRadius, marginTop: spacing.md },
  formRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  inputGroup: { flex: 1 },
  input: { borderWidth: 1, borderRadius: layout.borderRadius, padding: spacing.sm, fontSize: 16, textAlign: 'center', minHeight: layout.minTouchTarget, marginTop: 4 },
  colon: { fontSize: 24, fontWeight: 'bold', marginHorizontal: spacing.xs, marginTop: 16 },
  formActions: { flexDirection: 'row', justifyContent: 'space-between' }
});
