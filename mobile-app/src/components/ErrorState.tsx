import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { spacing } from '../theme';
import Button from './Button';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

export default function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { colors, typography } = useTheme();

  return (
    <View style={styles.container}>
      <Ionicons name="warning-outline" size={48} color={colors.error} accessible={false} />
      <Text style={[typography.body, { color: colors.error, textAlign: 'center', marginTop: spacing.md }]}>{message}</Text>
      {onRetry && (
        <View style={styles.actionContainer}>
          <Button title="Try Again" onPress={onRetry} accessibilityLabel="Retry loading data" />
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
