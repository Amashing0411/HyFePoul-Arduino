# API & Communication Contract

This document outlines the API endpoints and communication protocols between the ESP32 and the Firebase Backend.

For the Arduino Mega ↔ ESP32 physical serial protocol, see `docs/mega-esp32-protocol.md`.

## 1. ESP32 → Backend API (Firebase Cloud Functions)

The ESP32 communicates with the Firebase backend via Cloud Functions HTTP REST endpoints.

### Authentication Model
The ESP32 authenticates its requests using HTTP headers:
*   `X-Device-ID: <deviceId>`
*   `X-Device-Token: <device-secret>`

The backend utilizes Firebase/Google Cloud Secret Manager to verify the device secret, verify the device is registered, and validate the payload before writing to Firestore.

### Data Transmission Strategy
*   The initial backend implementation will use a configurable DATA transmission interval for testing. The final transmission frequency will be determined during firmware and physical-system validation.
*   Data Storage Strategy:
    *   Current state is written to `devices/{deviceId}`.
    *   Meaningful events are written to event/alert documents.
    *   Periodic historical snapshots are written to `systemData`.

## 2. API Endpoints

### `POST /device/data`
Transmits the current sensor and state values.

**Payload Requirements:**
All fields defined in the communication contract are strictly required. Missing or malformed fields will result in the entire payload being rejected (400 Bad Request) to prevent mixed state corruption.

**Example Payload:**
```json
{
  "feedWeightGrams": 450,
  "targetFeedGrams": 500,
  "hopperLevelPercent": 85,
  "waterLow": false,
  "waterHigh": false,
  "pumpActive": false,
  "feedingActive": true,
  "emergencyStopActive": false,
  "timestamp": "2026-09-24T14:00:00Z"
}
```

### `POST /device/event`
Transmits an alert or discrete event.

**Payload Requirements:**
*   Actionable events: `eventId` is required and used for idempotency/deduplication.
*   Informational events: `eventId` is not required unless the backend implementation specifically chooses to assign one.

**Example Payload:**
```json
{
  "eventId": "42-1045",
  "name": "LOW_WATER",
  "timestamp": "2026-09-24T14:00:00Z"
}
```

## 3. Backend → Mobile App

The mobile application retrieves system data from the Database (Firestore).
*   **Data Fetching:** The dashboard listens to a single `devices/{deviceId}` document to minimize document reads rather than querying historical `systemData`. (Note: Firestore real-time listener updates still count as document reads).
*   **Offline Behavior:** The mobile application may use Firebase offline caching capabilities for previously retrieved data. Remote device-control commands are not currently implemented and therefore are not queued or transmitted to physical hardware.
*   **Notifications:** Critical events routed through the backend will trigger Firebase Cloud Messaging (FCM) push notifications to the user's device.
