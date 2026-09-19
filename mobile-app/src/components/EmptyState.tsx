import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing } from '../theme';
import Button from './Button';

interface EmptyStateProps {
  iconName?: keyof typeof Ionicons.glyphMap;
  message: string;
  actionText?: string;
  onAction?: () => void;
}

export default function EmptyState({ iconName = 'file-tray-outline', message, actionText, onAction }: EmptyStateProps) {
  const { colors, typography } = useTheme();

  return (
    <View style={styles.container}>
      <Ionicons name={iconName} size={48} color={colors.neutral} accessible={false} />
      <Text style={[typography.body, { color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md }]}>{message}</Text>
      {actionText && onAction && (
        <View style={styles.actionContainer}>
          <Button title={actionText} onPress={onAction} variant="outline" accessibilityLabel={actionText} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  actionContainer: {
    marginTop: spacing.lg,
    width: '100%',
  },
});
