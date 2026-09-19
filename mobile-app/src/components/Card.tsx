import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { layout, spacing } from '../theme';

interface CardProps {
  title: string;
  children: React.ReactNode;
}

export default function Card({ title, children }: CardProps) {
  const { colors, typography } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={typography.h2}>{title}</Text>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    marginVertical: spacing.sm,
    marginHorizontal: spacing.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  divider: {
    height: 1,
    marginVertical: spacing.sm,
  }
});
