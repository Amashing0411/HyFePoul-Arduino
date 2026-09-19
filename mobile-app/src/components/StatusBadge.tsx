import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { layout } from '../theme';

interface StatusBadgeProps {
  status: 'online' | 'offline' | 'warning' | 'error' | 'success' | 'neutral';
  text: string;
}

export default function StatusBadge({ status, text }: StatusBadgeProps) {
  const { colors, typography } = useTheme();

  let bgColor = colors.neutralLight;
  let textColor = colors.neutral;

  if (status === 'online' || status === 'success') {
    bgColor = colors.successLight;
    textColor = colors.success;
  } else if (status === 'error') {
    bgColor = colors.errorLight;
    textColor = colors.error;
  } else if (status === 'warning') {
    bgColor = colors.warningLight;
    textColor = colors.warning;
  }

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]} accessible={true} accessibilityLabel={`Status: ${text}`}>
      <Text style={[typography.caption, styles.text, { color: textColor }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: layout.borderRadius,
  },
  text: {
    fontWeight: 'bold',
  },
});
