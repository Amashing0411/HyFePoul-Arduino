# HyFePoul System Architecture

## Overall System Flow
**Arduino Mega → ESP32 → Wi-Fi/Internet → Backend → Database → Mobile App**

## Components

### 1. Arduino Mega 2560 (Primary Controller)
- **Role**: Core logic, sensor polling, and hardware actuation.
- **Responsibilities**: 
  - Read load cells, float switches, ultrasonic sensors, and emergency inputs.
  - Trigger motors and relays based on scheduled logic or threshold conditions.
  - Interface with the Nextion touchscreen.
  - Maintain system state and log physical actions to the SD card.
  - Send status updates to the ESP32.

### 2. ESP32 (Communication Module)
- **Role**: Wi-Fi bridge and internet connectivity layer.
- **Responsibilities**:
  - Connect to local Wi-Fi.
  - Receive serial packets from the Arduino Mega.
  - Transmit system data and alerts to the Cloud backend.
  - Provide network time (NTP) to the Arduino Mega.

### 3. Backend (Firebase Cloud Functions / FCM)
- **Role**: Processing and routing layer.
- **Responsibilities**:
  - Expose API endpoints for the ESP32.
  - Validate and route incoming device data to the database.
  - Trigger Firebase Cloud Messaging (FCM) notifications for alerts (low feed, low water, emergency).

### 4. Database (Cloud Firestore)
- **Role**: Persistent storage.
- **Responsibilities**:
  - Store user accounts, device registrations, historical system data, and configuration settings.
  - Provide secure, structured access to data for the mobile application.

### 5. Mobile Application (React Native / Expo)
- **Role**: User Interface and remote management.
- **Responsibilities**:
  - Authenticate the user.
  - Display timely system updates regarding feed, water, and device status.
  - Provide historical data visualization.
  - Receive push notifications for alerts.

## Design Constraints & Future Extensibility
- **Users**: The system starts with a single-user-per-farm/device model. The database schema will remain extensible to support multiple users (e.g., admin vs. worker roles) in the future.
- **Provisioning**: The initial prototype uses a configured Device ID to pair the mobile app with the hardware. QR-code based provisioning is considered a future enhancement.
- **Data Transmission**: The transmission strategy between the ESP32 and the backend (e.g., event-driven updates, heartbeat intervals) will remain configurable and will be finalized during integration and testing.
- **Data Retention**: Retention policies for device data are a backend configuration detail and will only be implemented (e.g., automatic pruning) if required by the final database design.
