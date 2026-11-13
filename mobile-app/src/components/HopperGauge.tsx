import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated, AccessibilityInfo } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { spacing } from '../theme';
import { HOPPER_LOW_PERCENT, hopperLevelState, formatHopperLevel } from '../utils/hopper';

interface HopperGaugeProps {
  percent: number; // 0 to 100
}

const BIN_HEIGHT = 96;
const BIN_WIDTH = 72;

// A small hopper that fills from the bottom, with a dashed line at the LOW
// point (HOPPER_LOW_PERCENT) and the level and a plain-words status beside it.
export default function HopperGauge({ percent }: HopperGaugeProps) {
  const { colors, typography } = useTheme();
  const { t } = useLanguage();
  const clamped = Math.max(0, Math.min(100, percent));
  const state = hopperLevelState(clamped);
  const fillColor = state === 'plenty' ? colors.success : state === 'ok' ? colors.primary : colors.error;
  const statusKey = state === 'plenty' ? 'hopperPlenty'
    : state === 'ok' ? 'hopperOk'
    : state === 'low' ? 'hopperLowRefillSoon'
    : 'hopperEmptyRefillNow';

  // Lazy state keeps one Animated.Value per mount without reading a ref during render.
  const [animatedFill] = useState(() => new Animated.Value(0));
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((reducedMotion) => {
      Animated.timing(animatedFill, {
        toValue: clamped,
        duration: reducedMotion ? 0 : 500,
        useNativeDriver: false,
      }).start();
    });
  }, [clamped, animatedFill]);

  const fillHeight = animatedFill.interpolate({
    inputRange: [0, 100],
    outputRange: [0, BIN_HEIGHT],
  });
  const lowLineBottom = (HOPPER_LOW_PERCENT / 100) * BIN_HEIGHT;

  return (
    <View
      style={styles.row}
      accessible={true}
      accessibilityRole="progressbar"
      accessibilityLabel={`${t('hopperLevel')}: ${formatHopperLevel(t, clamped)}, ${t(statusKey)}`}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      <View style={styles.hopper}>
        <View style={[styles.bin, { borderColor: colors.textSecondary, backgroundColor: colors.card }]}>
          <Animated.View style={[styles.fill, { height: fillHeight, backgroundColor: fillColor }]} />
          <View style={[styles.lowLine, { bottom: lowLineBottom, borderColor: colors.error }]} />
        </View>
        {/* Funnel and outlet under the bin */}
        <View style={[styles.funnel, { borderTopColor: colors.textSecondary }]} />
        <View style={[styles.outlet, { backgroundColor: colors.textSecondary }]} />
      </View>

      <View style={styles.readout}>
        <Text style={[typography.h1, state === 'low' || state === 'empty' ? { color: colors.error } : null]}>
          {formatHopperLevel(t, clamped)}
        </Text>
        <Text style={[typography.body, { color: state === 'low' || state === 'empty' ? colors.error : colors.textSecondary }]}>
          {t(statusKey)}
        </Text>
        <View style={styles.lowLegend}>
          <View style={[styles.legendDash, { borderColor: colors.error }]} />
          <Text style={[typography.caption, { color: colors.textSecondary }]}>
            {t('hopperLowAt', { percent: HOPPER_LOW_PERCENT })}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  hopper: {
    alignItems: 'center',
    marginRight: spacing.lg,
  },
  bin: {
    width: BIN_WIDTH,
    height: BIN_HEIGHT,
    borderWidth: 2,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  fill: {
    width: '100%',
  },
  lowLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
  },
  // A trapezoid made from borders: the top border is the funnel wall.
  funnel: {
    width: BIN_WIDTH,
    height: 0,
    borderTopWidth: 14,
    borderLeftWidth: 22,
    borderRightWidth: 22,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
  },
  outlet: {
    width: 12,
    height: 8,
  },
  readout: {
    flex: 1,
  },
  lowLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  legendDash: {
    width: 18,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    marginRight: spacing.xs,
  },
});
