# API & Communication Contract

This document outlines the communication protocols between the different layers of the HyFePoul architecture. The specific endpoints, payload structures, and intervals will be finalized during integration.

## 1. Mega ↔ ESP32 Serial Protocol

The Arduino Mega and ESP32 communicate via UART Serial. 

### Mega → ESP32
Sends system data, sensor values, and critical events.
- **Data Packet (Placeholder)**: `DATA|<feedWeight>|<hopperLevel>|<waterLow>|<waterHigh>|<pump>|<feeding>|<emergency>|<timeSource>`
- **Event Packet (Placeholder)**: `EVENT|<eventName>`

### ESP32 → Mega
Provides network connectivity status, time synchronization, and potentially remote commands.
- **Time Packet (Placeholder)**: `TIME|YYYY-MM-DD|HH:MM:SS`
- **Status Packet (Placeholder)**: `STATUS|ONLINE` or `STATUS|OFFLINE`

## 2. ESP32 → Backend API (Proposed)

The ESP32 communicates with the Firebase backend (e.g., via Cloud Functions HTTP endpoints or direct RTDB/Firestore REST).

### Data Transmission Strategy
- The exact interval for pushing data (e.g., heartbeat intervals) and the triggers for event-driven updates are configurable.
- The transmission logic will aim to provide **timely system updates** to the mobile application while optimizing network and database operations.
- Final database operations and usage expectations will be estimated once this transmission strategy is finalized.

### Example Endpoints (To be finalized)
- `POST /api/device/data`: Send current sensor and state values.
- `POST /api/device/event`: Send an alert or discrete event.

## 3. Backend → Mobile App

The mobile application retrieves system data from the Database (Firestore).
- **Data Fetching**: The app will listen to Firestore collections for timely system updates.
- **Notifications**: Critical events routed through the backend will trigger Firebase Cloud Messaging (FCM) push notifications to the user's device.
