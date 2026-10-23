import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { rtdbService } from '../services/rtdbService';

// Local (on-device) notifications for new RTDB alerts.
//
// This replaces FCM push: remote push needs Cloud Functions, which need the
// Blaze plan. Local notifications are raised by the app itself, so they only
// appear while the app is running (foreground or recently backgrounded).
// Alerts that occur while the app is closed are not notified; they still
// appear in the Notifications tab the next time the app opens.

export const ALERT_CHANNEL_ID = 'alerts';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function prepareNotificationsAsync(): Promise<boolean> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ALERT_CHANNEL_ID, {
      name: 'Device alerts',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export function useAlertNotifications() {
  const { user, ownedDevices } = useAuth();
  const { t } = useLanguage();

  // Keep the latest translator without re-subscribing on language change.
  // Updated in an effect, not during render.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const activeDeviceId = ownedDevices && ownedDevices.length > 0 ? ownedDevices[0].id : null;

  useEffect(() => {
    if (!user || !activeDeviceId) return;

    let cancelled = false;
    let permitted = false;
    // eventId -> last notified timestamp. The ESP32 overwrites one record per
    // alert type, so a newer timestamp on a known eventId is a new occurrence.
    let seen: Map<string, number> | null = null;

    prepareNotificationsAsync()
      .then((granted) => { permitted = granted; })
      .catch((e) => console.log('Notification setup failed; in-app alerts still work.', e));

    const unsubscribe = rtdbService.subscribeToAlerts(activeDeviceId, 50, (alerts, err) => {
      if (err || cancelled) return;

      // First snapshot is the baseline: existing alerts are shown in the
      // Notifications tab but not re-notified on every app start.
      if (seen === null) {
        seen = new Map(alerts.map((a) => [a.eventId, a.timestamp]));
        return;
      }

      for (const alert of alerts) {
        const previous = seen.get(alert.eventId);
        if (previous !== undefined && alert.timestamp <= previous) continue;
        seen.set(alert.eventId, alert.timestamp);

        if (!permitted || alert.resolved) continue;

        Notifications.scheduleNotificationAsync({
          content: {
            title: alert.name.replace(/_/g, ' '),
            body: tRef.current('alertNotificationBody', {
              time: new Date(alert.timestamp).toLocaleTimeString(),
            }),
          },
          trigger: Platform.OS === 'android' ? { channelId: ALERT_CHANNEL_ID } : null,
        }).catch((e) => console.log('Failed to show alert notification', e));
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [user, activeDeviceId]);
}
