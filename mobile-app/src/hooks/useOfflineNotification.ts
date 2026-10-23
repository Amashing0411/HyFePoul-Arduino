import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useFirebaseData } from '../context/FirebaseDataContext';
import { useLanguage } from '../context/LanguageContext';
import { offlineNotificationAction } from '../utils/offlineNotification';
import { ALERT_CHANNEL_ID, prepareNotificationsAsync } from './useAlertNotifications';

// Local phone notification when the device goes offline (no heartbeat for
// 90 s, see utils/deviceStatus.ts), removed again when it comes back (R-40).
//
// Nothing on the server can push this (Spark plan, no Cloud Functions), so,
// like the alert notifications, it only works while the app is running:
// the status is re-checked every 15 s by FirebaseDataContext.
export function useOfflineNotification() {
  const { deviceData, deviceOnline } = useFirebaseData();
  const { t } = useLanguage();

  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const deviceId = deviceData?.deviceId ?? null;
  const lastHeartbeat = deviceData?.lastHeartbeat ?? null;

  // Last status seen for this device, and the notification currently shown.
  const previousRef = useRef<{ deviceId: string | null; online: boolean | null }>({ deviceId: null, online: null });
  const shownIdRef = useRef<string | null>(null);

  useEffect(() => {
    // No device data yet: nothing to compare against.
    if (!deviceId) return;

    // A different device (or a fresh sign-in) starts a new baseline.
    if (previousRef.current.deviceId !== deviceId) {
      previousRef.current = { deviceId, online: null };
    }

    const action = offlineNotificationAction(previousRef.current.online, deviceOnline);
    previousRef.current.online = deviceOnline;

    if (action === 'notifyOffline') {
      const since = lastHeartbeat ? new Date(lastHeartbeat).toLocaleTimeString() : '?';
      prepareNotificationsAsync()
        .then((granted) => {
          if (!granted) return null;
          return Notifications.scheduleNotificationAsync({
            content: {
              title: tRef.current('deviceOfflineTitle'),
              body: tRef.current('deviceOfflineBody', { time: since }),
            },
            trigger: Platform.OS === 'android' ? { channelId: ALERT_CHANNEL_ID } : null,
          });
        })
        .then((id) => {
          if (id) shownIdRef.current = id;
        })
        .catch((e) => console.log('Failed to show offline notification', e));
    } else if (action === 'dismiss' && shownIdRef.current) {
      const id = shownIdRef.current;
      shownIdRef.current = null;
      Notifications.dismissNotificationAsync(id).catch(() => {});
    }
  }, [deviceId, deviceOnline, lastHeartbeat]);
}
