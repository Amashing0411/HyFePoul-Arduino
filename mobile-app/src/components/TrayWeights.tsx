import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { spacing, layout } from '../theme';

interface TrayWeightsProps {
  weights: number[];
  // Tray the hopper is at or heading to (1-5), 0 when none.
  currentTray: number;
}

// One box per tray with the grams its load cell reports.
export default function TrayWeights({ weights, currentTray }: TrayWeightsProps) {
  const { colors, typography } = useTheme();
  const { t } = useLanguage();

  return (
    <View style={styles.row}>
      {weights.map((grams, i) => {
        const isCurrent = currentTray === i + 1;
        return (
          <View
            key={i}
            style={[
              styles.tray,
              { borderColor: isCurrent ? colors.primary : colors.border, backgroundColor: colors.neutralLight },
              isCurrent && styles.current,
            ]}
            accessible={true}
            accessibilityLabel={t('trayWeightA11y', { n: i + 1, weight: grams.toFixed(0) })}
          >
            <Text style={typography.caption}>{t('trayN', { n: i + 1 })}</Text>
            <Text style={[typography.body, { fontWeight: 'bold' }]}>{grams.toFixed(0)}</Text>
            <Text style={typography.caption}>g</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  tray: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    marginHorizontal: 2,
    borderWidth: 1,
    borderRadius: layout.borderRadius / 2,
  },
  current: { borderWidth: 2 },
});
