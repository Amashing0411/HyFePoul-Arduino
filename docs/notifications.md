# Notification Strategy

This document describes how HyFePoul alerts reach the user **as currently implemented**. The project stays on the Firebase Spark (no-billing) plan, which rules out Cloud Functions and therefore server-sent push notifications.

## Current path (RTDB alert feed + local notifications)

1. **Mega** raises an alert event (for example `LOW_FEED`) and sends `EVENT|LOW_FEED` to the ESP32 over UART.
2. **ESP32** forwards only actionable events (`LOW_FEED`, `LOW_WATER`, `CHAIN_TIMEOUT`, `TRAY_TIMEOUT`, `EMERGENCY_STOP`, `DEVICE_ERROR`), plus `CONTROLLER_OFFLINE`, which it raises itself when the Mega goes silent. It writes each one with `PUT` to `/alerts/{deviceId}/{eventName}`, so there is **one record per alert type**, overwritten with the latest timestamp. Informational events (for example `FEEDING_STARTED`) are logged only on the Mega SD card.
3. **Mobile app, Notifications tab** (`useDeviceAlerts`): subscribes to `/alerts/{deviceId}` and lists the latest report of each alert type, newest first.
4. **Mobile app, local notifications** (`useAlertNotifications`): while the app is running, the same subscription compares each alert's timestamp with the last one seen. A newer timestamp raises an on-device notification on the Android channel `alerts`. The first snapshot after the app opens is treated as a baseline, so existing alerts are not re-notified on every launch.
5. **Mobile app, device offline** (`useOfflineNotification`, R-40): nothing writes an alert when the whole device goes offline (it can no longer reach Firebase), so the app watches the heartbeat itself. When the device's online status changes from online to offline (no heartbeat for 90 s, re-checked every 15 s), it shows "Device offline. No contact from the device since <time>." on the same channel. The notification is removed when heartbeats resume. The first status after the app opens is a baseline, so opening the app while the device is already offline does not notify.

## Limitations (do not describe this as push notifications)

- **No delivery while the app is closed.** Local notifications come from the running app. Alerts raised while the app is closed or killed by the OS appear in the Notifications tab the next time the app opens, but no phone notification is shown for them.
- **Resolution (R-23).** When a condition clears, the Mega sends a clear event and the ESP32 marks the record `resolved: true` with `resolvedAt` (low feed: hopper back to 25%; low water: reservoir refilled; E-stop: released; chain/tray timeout: the next cycle that fills every tray). The Notifications tab lists active alerts first ("ACTIVE"), then resolved ones dimmed ("RESOLVED <time>"). Resolving never triggers a phone notification, because only a newer `timestamp` does.
- **One record per type.** Two `LOW_FEED` occurrences produce a single record holding the later timestamp. The full sequence is in the Mega SD log.
- **Permission.** Android 13+ asks for notification permission on first launch after login. If it is denied, the in-app alert feed still works.

## Alert types

| Event | Raised by | Meaning |
|-------|-----------|---------|
| `EMERGENCY_STOP` | Mega, `Safety.ino` | Physical E-stop pressed. The stop is latched until it is reset. |
| `LOW_FEED` | Mega, `FeedLevel.ino` | Hopper level at or below 20% (clears above 25%). |
| `CHAIN_TIMEOUT` | Mega, `Feeding.ino` | A chain move did not reach its limit switch in time. Chain and dispenser stop; buzzer. |
| `TRAY_TIMEOUT` | Mega, `Feeding.ino` | A tray was not filled (30 s dispense limit or load cell not responding). Raised once per cycle; buzzer. |
| `CONTROLLER_OFFLINE` | ESP32 (R-24) | No data from the Mega for 30 s while the ESP32 is online (crash, power, or a loose UART cable). Resolved when the Mega is heard again. |
| `LOW_WATER` | Mega, `Hydration.ino` | The reservoir float switch reads low (2 s debounce): refill the reservoir. Once per low episode, with a buzzer beep. |
| `DEVICE_ERROR` | Whitelisted on the ESP32 | Not raised by the current Mega firmware. |

`DEVICE_OFFLINE` appears in the app's icon map but is not produced by anything in the current architecture. Offline detection needs either a backend or app-side logic based on `devices/{id}/lastHeartbeat`.

## Legacy FCM path (not active)

`backend/functions` still contains the earlier Firestore and Cloud Functions pipeline (`registerFcmToken`, FCM sends from alert processing). It is **not deployed** and would require the Blaze plan. The app hook that registered FCM tokens (`usePushNotifications.ts`) was removed in Phase 2. To restore it, recover that file from git history (it was last present in commit `c5e5f6c`) and deploy the functions after a billing decision.
