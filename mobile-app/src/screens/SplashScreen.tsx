import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Image, AccessibilityInfo } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

export default function SplashScreen() {
  const { colors, typography } = useTheme();
  const { t } = useLanguage();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;

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
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <Animated.View style={[styles.logoContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]} accessible={true} accessibilityLabel="HyFePoul startup screen">
        <Image 
          source={require('../../assets/icon.png')} 
          style={styles.logo} 
          resizeMode="contain" 
          accessible={false} 
        />
        <Text style={[typography.h1, { color: colors.primary, letterSpacing: 1 }]}>HyFePoul</Text>
        <Text style={[typography.bodySecondary, { marginTop: 8 }]}>{t('managementSystem')}</Text>
        <Text style={[typography.caption, { marginTop: 4, fontStyle: 'italic' }]}>{t('placeholderLogo')}</Text>
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
  logoContainer: {
    alignItems: 'center',
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 16,
  },
});
