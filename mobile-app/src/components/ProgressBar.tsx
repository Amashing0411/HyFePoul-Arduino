import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, AccessibilityInfo } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { layout } from '../theme';

interface ProgressBarProps {
  progress: number; // 0 to 100
  color?: string;
}

export default function ProgressBar({ progress, color }: ProgressBarProps) {
  const { colors } = useTheme();
  const animatedWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((reducedMotion) => {
      Animated.timing(animatedWidth, {
        toValue: progress,
        duration: reducedMotion ? 0 : 500,
        useNativeDriver: false,
      }).start();
    });
  }, [progress, animatedWidth]);

  const widthInterpolation = animatedWidth.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View 
      style={[styles.container, { backgroundColor: colors.border }]} 
      accessible={true} 
      accessibilityRole="progressbar" 
      accessibilityValue={{ min: 0, max: 100, now: progress }}
    >
      <Animated.View 
        style={[
          styles.fill, 
          { 
            width: widthInterpolation,
            backgroundColor: color || colors.primary
          }
        ]} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 8,
    borderRadius: layout.borderRadius,
    overflow: 'hidden',
    width: '100%',
    marginVertical: 4,
  },
  fill: {
    height: '100%',
    borderRadius: layout.borderRadius,
  },
});
