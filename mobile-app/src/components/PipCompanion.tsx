import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import Pip, { PipClip, useReduceMotion } from './Pip';
import { useFirebaseData } from '../context/FirebaseDataContext';
import { useLanguage } from '../context/LanguageContext';
import { useTheme } from '../context/ThemeContext';
import { HOPPER_LOW_PERCENT } from '../utils/hopper';

// Hidden for the rest of the app session once the user tucks PIP away.
let tuckedAway = false;
const TIPS = ['pipTip1', 'pipTip2', 'pipTip3', 'pipTip4', 'pipTip5'] as const;
const SAY_MS = 6000;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * PIP in the corner of the Dashboard. He reacts to the device data the app already reads
 * (low water, low feed, a feed finishing, the device going offline) and shares a tip now and then.
 * He never writes anything.
 */
export default function PipCompanion() {
  const { systemData, deviceOnline } = useFirebaseData();
  const { t } = useLanguage();
  const { colors } = useTheme();
  const focused = useIsFocused();
  const reduce = useReduceMotion();
  const [hidden, setHidden] = useState(tuckedAway);
  const [clip, setClip] = useState<PipClip>('Web_Appear');
  const [playKey, setPlayKey] = useState(0);
  const [line, setLine] = useState<string | null>(null);
  const bubble = useRef(new Animated.Value(0)).current;
  const sayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prev = useRef<{ waterLow?: boolean; feedLow?: boolean; feeding?: boolean; online?: boolean }>({});

  const react = (next: PipClip, text: string) => {
    setClip(next); setPlayKey(k => k + 1);
    setLine(text);
    Animated.timing(bubble, { toValue: 1, duration: reduce ? 0 : 220, useNativeDriver: true }).start();
    if (sayTimer.current) clearTimeout(sayTimer.current);
    sayTimer.current = setTimeout(() => {
      Animated.timing(bubble, { toValue: 0, duration: reduce ? 0 : 300, useNativeDriver: true }).start(() => setLine(null));
    }, SAY_MS);
  };

  // Greeting when the Dashboard opens.
  useEffect(() => {
    if (!focused || hidden) return;
    setClip('Web_Appear'); setPlayKey(k => k + 1);
    const id = setTimeout(() => react('Pers_Wave', t('pipHello')), 1600);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, hidden]);

  // React when the device data changes.
  useEffect(() => {
    if (!systemData || hidden) return;
    const now = {
      waterLow: systemData.waterLow,
      feedLow: systemData.hopperLevelPercent <= HOPPER_LOW_PERCENT,
      feeding: systemData.feedingActive,
      online: deviceOnline,
    };
    const p = prev.current;
    if (p.online !== undefined) {
      if (p.online && !now.online) react('Web_DeviceDisconnected', t('pipOffline'));
      else if (!p.online && now.online) react('Pers_HappyJump', t('pipBackOnline'));
      else if (!p.waterLow && now.waterLow) react('Web_LowWater', t('pipLowWater'));
      else if (!p.feedLow && now.feedLow) react('Web_LowFeed', t('pipLowFeed', { percent: Math.round(systemData.hopperLevelPercent) }));
      else if (p.feeding && !now.feeding) react('Web_FeedingComplete', t('pipFeedDone'));
    } else if (now.waterLow) {
      setTimeout(() => react('Web_LowWater', t('pipLowWater')), 4000);
    } else if (now.feedLow) {
      setTimeout(() => react('Web_LowFeed', t('pipLowFeed', { percent: Math.round(systemData.hopperLevelPercent) })), 4000);
    }
    prev.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemData?.waterLow, systemData?.hopperLevelPercent, systemData?.feedingActive, deviceOnline, hidden]);

  // A tip now and then while the Dashboard is open.
  useEffect(() => {
    if (!focused || hidden) return;
    let id: ReturnType<typeof setTimeout>;
    const next = () => { id = setTimeout(() => { react('Pers_Wave', t(TIPS[Math.floor(Math.random() * TIPS.length)])); next(); }, rand(45000, 90000)); };
    next();
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focused, hidden]);

  useEffect(() => () => { if (sayTimer.current) clearTimeout(sayTimer.current); }, []);

  if (!focused) return null;   // stops the animation while another tab is open
  if (hidden) {
    return (
      <Pressable
        style={[styles.back, { backgroundColor: colors.primary }]}
        onPress={() => { tuckedAway = false; setHidden(false); }}
        accessibilityRole="button"
        accessibilityLabel={t('pipShow')}
      >
        <Text style={styles.backText}>PIP</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {line && (
        <Animated.View
          style={[styles.bubble, { backgroundColor: colors.card, opacity: bubble, transform: [{ translateY: bubble.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] }]}
          pointerEvents="none"
          accessibilityLiveRegion="polite"
        >
          <Text style={[styles.say, { color: colors.text }]}>{line}</Text>
        </Animated.View>
      )}
      <View>
      <Pressable
        onPress={() => react(Math.random() < 0.5 ? 'Pers_HappyJump' : 'Pers_Celebrate', t(TIPS[Math.floor(Math.random() * TIPS.length)]))}
        accessibilityRole="imagebutton"
        accessibilityLabel={t('pipTapHint')}
      >
        <Pip clip={clip} playKey={playKey} size={104} />
      </Pressable>
      <Pressable
        style={[styles.tuck, { backgroundColor: colors.card }]}
        onPress={() => { tuckedAway = true; setHidden(true); }}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t('pipHide')}
      >
        <Ionicons name="remove" size={16} color={colors.text} />
      </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 6, bottom: 4, alignItems: 'flex-end' },
  bubble: {
    maxWidth: 220, marginRight: 70, marginBottom: -6, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 14, borderBottomRightRadius: 4,
    shadowColor: '#12306b', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 4,
  },
  say: { fontSize: 13.5, lineHeight: 18, fontWeight: '600' },
  tuck: {
    position: 'absolute', right: 0, top: 6, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#12306b', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  back: { position: 'absolute', right: 12, bottom: 12, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', elevation: 4 },
  backText: { color: '#fff', fontWeight: '800', fontSize: 12 },
});
