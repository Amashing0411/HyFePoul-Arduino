# Development Status

## Current Phase: Architecture Initialization

### 1. Arduino Mega (Primary Controller)
- **Status**: **Drafted / Relocated**
- **Notes**: The core logic (feeding, hydration, time management, safety, Nextion interface, SD logging, and serial communication placeholder) is drafted. The code has been safely relocated to `firmware/arduino-mega/HyFePoul_Arduino/`.
- **Pending**: Hardware validation, sensor calibration, Nextion integration, and final testing.

### 2. ESP32 (Communication Module)
- **Status**: **Pending**
- **Notes**: Awaiting implementation.
- **Pending**: Wi-Fi connection logic, backend communication, and finalized serial protocol with the Mega.

### 3. Backend (Firebase)
- **Status**: **In Progress / Initialized**
- **Notes**: Architecture, schemas, and API contracts defined. Checkpoints 3B-3D established device claiming and API keys. Checkpoints 4E and 4F established Firestore alert generation and FCM push notifications.
- **FCM Architecture**: Mobile registration tokens are explicitly isolated within `users/{uid}/fcmTokens/{token}` using an Admin SDK HTTPS Callable (`registerFcmToken`) to prevent clients from writing tokens directly or exposing them to unauthorized devices. FCM delivery is processed exclusively as an idempotent side-effect of actionable hardware events resolving safely into persistent Firestore alerts.
- **Pending**: Final device hardware deployment, complete Cloud Function coverage, scheduled feed triggers.

### 4. Mobile Application (React Native / Expo)
- **Status**: **In Progress (Checkpoint 4F)**
- **Notes**: Firebase Auth, Device Claiming (4C), Live Data (4D), and Historical/Notification fetching (4E) are complete.
- **FCM Status**: Checkpoint 4F implemented Android Push Notifications using `expo-notifications`. Physical FCM delivery is **NOT YET VERIFIED**.
- **Expo FCM Build Requirements**: Native Android push delivery completely bypasses Expo Go due to requiring FCM natively. A custom EAS build (`eas build -p android --profile development`) plus an explicit `google-services.json` injection is definitively required.
- **Pending**: Final UI/UX refinement, iOS support, and real-world hardware integration.

### 5. Nextion Touchscreen (Local HMI)
- **Status**: **Pending**
- **Notes**: Placeholder folder created at `firmware/nextion/`.
- **Pending**: GUI design, component mapping, and generation of `.HMI`/`.tft` files.
