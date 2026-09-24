import React from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { spacing, layout } from '../theme';

export default function SettingsScreen() {
  const { mode, toggleTheme, fontSize, setFontSize, colors, typography } = useTheme();
  const { language, setLanguage, t } = useLanguage();

  const handleFontChange = (size: 'small' | 'medium' | 'large') => {
    setFontSize(size);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[typography.h1, styles.header]}>{t('settings')}</Text>

      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        
        {/* Language Selection */}
        <View style={styles.column}>
          <View style={styles.iconText}>
            <Ionicons name="language" size={24} color={colors.primary} />
            <Text style={[typography.body, styles.label]}>{t('language')}</Text>
          </View>
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[
                styles.segmentButton,
                { borderColor: colors.border },
                language === 'en' && { backgroundColor: colors.primary, borderColor: colors.primary }
              ]}
              onPress={() => setLanguage('en')}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={t('english')}
            >
              <Text style={[
                typography.bodySecondary,
                language === 'en' ? { color: '#fff', fontWeight: 'bold' } : { color: colors.textSecondary }
              ]}>
                {t('english')}
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[
                styles.segmentButton,
                { borderColor: colors.border },
                language === 'tl' && { backgroundColor: colors.primary, borderColor: colors.primary }
              ]}
              onPress={() => setLanguage('tl')}
              accessible={true}
              accessibilityRole="button"
              accessibilityLabel={t('tagalog')}
            >
              <Text style={[
                typography.bodySecondary,
                language === 'tl' ? { color: '#fff', fontWeight: 'bold' } : { color: colors.textSecondary }
              ]}>
                {t('tagalog')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Dark Mode */}
        <View style={styles.row}>
          <View style={styles.iconText}>
            <Ionicons name={mode === 'dark' ? 'moon' : 'sunny'} size={24} color={colors.primary} />
            <Text style={[typography.body, styles.label]}>{t('darkMode')}</Text>
          </View>
          <Switch 
            value={mode === 'dark'} 
            onValueChange={toggleTheme}
            trackColor={{ false: colors.neutralLight, true: colors.primary }}
            accessible={true}
            accessibilityLabel={t('darkMode')}
          />
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Text Size */}
        <View style={styles.column}>
          <View style={styles.iconText}>
            <Ionicons name="text" size={24} color={colors.primary} />
            <Text style={[typography.body, styles.label]}>{t('textSize')}</Text>
          </View>
          <View style={styles.segmentedControl}>
            {(['small', 'medium', 'large'] as const).map((size) => (
              <TouchableOpacity
                key={size}
                style={[
                  styles.segmentButton,
                  { borderColor: colors.border },
                  fontSize === size && { backgroundColor: colors.primary, borderColor: colors.primary }
                ]}
                onPress={() => handleFontChange(size)}
                accessible={true}
                accessibilityRole="button"
                accessibilityLabel={t(size)}
              >
                <Text style={[
                  typography.bodySecondary,
                  fontSize === size ? { color: '#fff', fontWeight: 'bold' } : { color: colors.textSecondary }
                ]}>
                  {t(size)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md },
  header: { marginBottom: spacing.lg, marginTop: spacing.md },
  card: {
    borderRadius: layout.borderRadius,
    padding: spacing.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: spacing.sm },
  column: { marginVertical: spacing.sm },
  iconText: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  label: { marginLeft: spacing.sm, fontWeight: '600' },
  divider: { height: 1, marginVertical: spacing.md },
  segmentedControl: { flexDirection: 'row', marginTop: spacing.sm },
  segmentButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    alignItems: 'center',
    marginHorizontal: 2,
    borderRadius: layout.borderRadius / 2,
    minHeight: layout.minTouchTarget,
    justifyContent: 'center'
  }
});
