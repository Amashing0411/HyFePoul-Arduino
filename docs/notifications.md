# Notification Strategy

This document outlines how critical events from the HyFePoul hardware are delivered to the user's mobile device to ensure timely system updates and responses.

## Infrastructure

We will utilize **Firebase Cloud Messaging (FCM)** to handle push notifications. 

1. **Trigger**: The ESP32 sends an event (e.g., `EVENT|LOW_FEED`) to the Backend.
2. **Processing**: The Firebase Cloud Function processes the event and determines if a notification is necessary based on user settings and alert history (to prevent spam).
3. **Delivery**: The Cloud Function sends a payload to FCM.
4. **Reception**: The React Native (Expo) mobile app receives the push notification and alerts the user, even if the app is in the background.

## Key Alert Types

- **Emergency Stop**: Triggered immediately when the physical emergency stop button on the Mega is engaged.
- **Low Feed**: Triggered when the ultrasonic sensor detects the hopper is below the configured threshold.
- **Water Pump Timeout / Low Water**: Triggered if the water pump runs continuously beyond the safety threshold, or if float switches indicate a dry tank.
- **Hardware Offline**: Triggered by the backend if it misses multiple expected heartbeats from the ESP32.

## Extensibility
The notification structure will allow for future enhancements, such as role-based alerts (e.g., notifying workers for low feed, but only admins for hardware disconnects) when the multi-user architecture is fully implemented.
