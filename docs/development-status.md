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
- **Status**: **In Progress**
- **Notes**: Architecture, schemas, and API contracts defined. 
- **Pending**: Setup Firebase project, write Cloud Functions, deploy Firestore rules, configure FCM.

### 4. Mobile Application (React Native / Expo)
- **Status**: **Pending**
- **Notes**: Architecture defined.
- **Pending**: App initialization, UI/UX implementation, authentication flow, data fetching, push notification handling.

### 5. Nextion Touchscreen (Local HMI)
- **Status**: **Pending**
- **Notes**: Placeholder folder created at `firmware/nextion/`.
- **Pending**: GUI design, component mapping, and generation of `.HMI`/`.tft` files.
