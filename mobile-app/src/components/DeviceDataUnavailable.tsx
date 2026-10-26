import React from 'react';
import { ScrollView, View, Text, StyleSheet } from 'react-native';
import Card from './Card';
import Skeleton from './Skeleton';
import StatusBadge from './StatusBadge';
import { useFirebaseData } from '../context/FirebaseDataContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { spacing } from '../theme';

/** A completed read with no sensor state is an empty state, not ongoing loading. */
export default function DeviceDataUnavailable() {
  const { deviceData, deviceOnline, controllerResponding, loading, error } = useFirebaseData();
  const { colors, typography } = useTheme();
  const { t } = useLanguage();

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {error ? (
        <Card title={t('deviceDataError')}>
          <Text accessibilityRole="alert" style={[typography.body, { color: colors.error }]}>{error}</Text>
        </Card>
      ) : loading ? (
        <Card title={t('loadingDeviceData')}>
          <Skeleton height={24} width="50%" />
          <Skeleton height={16} />
        </Card>
      ) : !deviceData ? (
        <Card title={t('deviceUnavailable')}>
          <Text style={typography.body}>{t('deviceUnavailableHint')}</Text>
        </Card>
      ) : (
        <>
          <Card title={t('deviceStatus')}>
            <Text style={[typography.body, styles.gap]}>{deviceData.name}</Text>
            <Text selectable style={[typography.caption, styles.gap]}>
              {t('deviceIdLabel')}: {deviceData.deviceId}
            </Text>
            <View style={styles.badge}>
              <StatusBadge status={deviceOnline ? 'online' : 'offline'} text={deviceOnline ? t('online') : t('offline')} />
            </View>
            {deviceOnline && !controllerResponding && (
              <Text style={[typography.caption, { color: colors.error, marginTop: spacing.sm }]}>
                {t('controllerNotRespondingHint')}
              </Text>
            )}
          </Card>
          <Card title={t('waitingDeviceData')}>
            <Text style={[typography.body, styles.gap]}>{t('waitingDeviceDataHint')}</Text>
            {!deviceOnline && <Text style={typography.bodySecondary}>{t('deviceOfflineSetupHint')}</Text>}
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: spacing.sm },
  gap: { marginBottom: spacing.sm },
  badge: { alignItems: 'flex-start' },
});
