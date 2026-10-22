import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated, Image, AccessibilityInfo, ActivityIndicator } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

// Same colour and artwork as the native splash (app.json, expo-splash-screen),
// so the hand-over from the native splash to this screen is seamless.
const SPLASH_BACKGROUND = '#052D77';

export default function SplashScreen() {
  const { typography } = useTheme();
  const { t } = useLanguage();
  // Lazy state keeps one Animated.Value per mount without reading a ref during render.
  const [fadeAnim] = useState(() => new Animated.Value(0));
  // Lazy state keeps one Animated.Value per mount without reading a ref during render.
  const [scaleAnim] = useState(() => new Animated.Value(0.9));

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((reducedMotion) => {
      if (!reducedMotion) {
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            friction: 6,
            useNativeDriver: true,
          }),
        ]).start();
      } else {
        fadeAnim.setValue(1);
        scaleAnim.setValue(1);
      }
    });
  }, [fadeAnim, scaleAnim]);

  return (
    <View style={[styles.container, { backgroundColor: SPLASH_BACKGROUND }]} accessible={true} accessibilityLabel="HyFePoul startup screen">
      <Image
        source={require('../../assets/splash-icon.png')}
        style={styles.logo}
        resizeMode="contain"
        accessible={false}
      />
      <Animated.View style={[styles.details, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <Text style={[typography.bodySecondary, styles.subtitle]}>{t('managementSystem')}</Text>
        <ActivityIndicator color="#7CC4FF" style={styles.spinner} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // 220 dp matches imageWidth in app.json, so the logo does not jump.
  logo: {
    width: 220,
    height: 220,
  },
  details: {
    position: 'absolute',
    top: '62%',
    alignItems: 'center',
  },
  subtitle: {
    color: '#CFE6FF',
    letterSpacing: 1,
  },
  spinner: {
    marginTop: 16,
  },
});
