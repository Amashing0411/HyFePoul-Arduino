import React, { useEffect, useState } from 'react';
import { Animated, StyleSheet, AccessibilityInfo, ViewStyle, DimensionValue } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { layout } from '../theme';

interface SkeletonProps {
  width?: DimensionValue;
  height?: DimensionValue;
  style?: ViewStyle;
}

export default function Skeleton({ width = '100%', height = 20, style }: SkeletonProps) {
  const { colors } = useTheme();
  // Lazy state keeps one Animated.Value per mount without reading a ref during render.
  const [opacity] = useState(() => new Animated.Value(0.3));

  useEffect(() => {
    let animation: Animated.CompositeAnimation;
    
    AccessibilityInfo.isReduceMotionEnabled().then((reducedMotion) => {
      if (!reducedMotion) {
        animation = Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true })
          ])
        );
        animation.start();
      }
    });

    return () => {
      if (animation) animation.stop();
    };
  }, [opacity]);

  return (
    <Animated.View 
      style={[
        styles.skeleton, 
        { width, height, opacity, backgroundColor: colors.neutralLight },
        style
      ]} 
      accessible={true}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading content"
    />
  );
}

const styles = StyleSheet.create({
  skeleton: {
    borderRadius: layout.borderRadius,
    marginVertical: 4,
  }
});
