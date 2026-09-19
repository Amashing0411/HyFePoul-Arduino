import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { layout } from '../theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'danger' | 'outline';
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel: string;
}

export default function Button({ title, onPress, variant = 'primary', disabled = false, loading = false, accessibilityLabel }: ButtonProps) {
  const { colors, typography } = useTheme();

  let bgColor = colors.primary;
  let textColor = '#fff';
  let borderColor = 'transparent';

  if (variant === 'danger') {
    bgColor = colors.error;
  } else if (variant === 'outline') {
    bgColor = 'transparent';
    textColor = colors.primary;
    borderColor = colors.primary;
  }

  if (disabled) {
    bgColor = colors.neutralLight;
    textColor = colors.neutral;
    borderColor = 'transparent';
  }

  return (
    <TouchableOpacity
      style={[styles.button, { backgroundColor: bgColor, borderColor, borderWidth: variant === 'outline' ? 1 : 0 }]}
      onPress={onPress}
      disabled={disabled || loading}
      accessible={true}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[typography.body, styles.text, { color: textColor }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: layout.minTouchTarget,
    borderRadius: layout.borderRadius,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    marginVertical: 8,
  },
  text: {
    fontWeight: 'bold',
  },
});
