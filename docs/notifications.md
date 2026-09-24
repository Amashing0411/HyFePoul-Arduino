# Notification Strategy

This document outlines how critical events from the HyFePoul hardware are delivered to the user's mobile device.

## Infrastructure

We utilize **Firebase Cloud Messaging (FCM)** to handle push notifications. 

1. **Trigger**: The ESP32 sends an event (e.g., `POST /device/event` with `LOW_FEED`) to the Firebase Cloud Function API.
2. **Deduplication**: The Cloud Function uses the Mega-generated `eventId` as the idempotency key. If the same `eventId` is received again, the request is treated as a retry/duplicate and must not create another alert or notification. A new event with a different `eventId` is treated as a new event, even if the same event type currently has or previously had an alert.
3. **Processing**: If valid, the Cloud Function creates an alert document in Firestore.
4. **Delivery**: The Cloud Function looks up the `fcmTokens` associated with the device's owner and sends a payload to FCM.
5. **Reception**: The React Native mobile app receives the push notification and alerts the user, even if the app is in the background.

## Key Alert Types (Actionable)

*   **Emergency Stop**: (`EMERGENCY_STOP`) Triggered immediately when the physical emergency stop button on the Mega is engaged.
*   **Low Feed**: (`LOW_FEED`) Triggered when the ultrasonic sensor detects the hopper is below the configured threshold.
*   **Water Pump Timeout**: (`PUMP_TIMEOUT`) Triggered if the water pump runs continuously beyond the safety threshold.
*   **Low Water**: (`LOW_WATER`) Triggered when float switches indicate a dry tank.
*   **Device Offline**: (`DEVICE_OFFLINE`) Triggered by the backend if it detects missed heartbeats from the ESP32 network connection.
*   **Device Error**: (`DEVICE_ERROR`) General fault reported by the Mega (e.g., sensor failure).

## Alert Resolution
Alerts are created with a `resolved: false` state. When subsequent `DATA` payloads indicate the condition has normalized (e.g., water tank is refilled), the backend automatically marks the alert as `resolved: true`, reflecting immediately on the mobile dashboard.
