import React from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing, layout } from '../theme';

export default function SettingsScreen() {
  const { mode, toggleTheme, fontSize, setFontSize, colors, typography } = useTheme();

  const handleFontChange = (size: 'small' | 'medium' | 'large') => {
    setFontSize(size);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[typography.h1, styles.header]}>Settings</Text>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.row}>
          <View style={styles.iconText}>
            <Ionicons name={mode === 'dark' ? 'moon' : 'sunny'} size={24} color={colors.primary} />
            <Text style={[typography.body, styles.label]}>Dark Mode</Text>
          </View>
          <Switch 
            value={mode === 'dark'} 
            onValueChange={toggleTheme}
            trackColor={{ false: colors.neutralLight, true: colors.primary }}
          />
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <View style={styles.column}>
          <View style={styles.iconText}>
            <Ionicons name="text" size={24} color={colors.primary} />
            <Text style={[typography.body, styles.label]}>Text Size</Text>
          </View>
          <View style={styles.segmentedControl}>
            {(['small', 'medium', 'large'] as const).map((size) => (
              <TouchableOpacity
                key={size}
                style={[
                  styles.segmentButton,
                  { borderColor: colors.border },
                  fontSize === size && { backgroundColor: colors.primary, borderColor: colors.primary }
                ]}
                onPress={() => handleFontChange(size)}
              >
                <Text style={[
                  typography.bodySecondary,
                  fontSize === size ? { color: '#fff', fontWeight: 'bold' } : { color: colors.textSecondary }
                ]}>
                  {size.charAt(0).toUpperCase() + size.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md },
  header: { marginBottom: spacing.lg, marginTop: spacing.md },
  card: {
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: spacing.sm },
  column: { marginVertical: spacing.sm },
  iconText: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  label: { marginLeft: spacing.sm, fontWeight: '600' },
  divider: { height: 1, marginVertical: spacing.md },
  segmentedControl: { flexDirection: 'row', marginTop: spacing.sm },
  segmentButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    alignItems: 'center',
    marginHorizontal: 2,
    borderRadius: layout.borderRadius / 2,
  }
});
