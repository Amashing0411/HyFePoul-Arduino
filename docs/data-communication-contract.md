# HyFePoul Data and Communication Contract (Provisional)

## 1. Purpose
This document establishes the provisional data and communication contract for the HyFePoul system. It serves as a shared reference for Arduino, ESP32, backend, and mobile-app developers prior to backend implementation and physical hardware integration. It clearly distinguishes defined requirements from provisional decisions, hardware-dependent validation, and pending backend platform choices.

## 2. System Communication Architecture
The intended data flow for the HyFePoul system is strictly unidirectional for status updates and bi-directional for control/synchronization, following this layered architecture:

`Arduino Mega 2560 (Primary Controller) → ESP32 (Wi-Fi Module) → Wi-Fi/Internet → Backend/API → Database → Mobile Application`

**Important Constraints:**
*   The Mobile Application MUST NOT communicate directly with the Arduino Mega or ESP32.
*   The ESP32 MUST NOT handle core poultry management logic; it serves purely as a Wi-Fi communication bridge.
*   The Arduino Mega handles all sensor reads, local logic, SD logging, safety checks, and local display (Nextion HMI).

## 3. Arduino Mega ↔ ESP32 Communication
Communication between the Mega and ESP32 will occur over a physical serial connection. 
*   **Mega's Role:** Sends system status updates and critical events. Receives time synchronization and network status from the ESP32.
*   **ESP32's Role:** Listens for Wi-Fi/Internet status, fetches NTP time (when available), and forwards the Mega's data to the backend.

*(Note: The exact message framing, baud rate, and serialization protocol are detailed in `docs/mega-esp32-protocol.md`, and remain provisional subject to hardware validation.)*

## 4. ESP32 ↔ Backend Communication
The ESP32 will transmit system status updates and event-based notifications to the backend over Wi-Fi. It may also periodically poll or maintain a connection to receive commands from the backend. **Note:** Remote command functionality is strictly reserved/future and is NOT currently implemented.

*(Note: The exact protocol is an open decision pending the backend platform choice.)*

## 5. Backend ↔ Mobile App Data Requirements
The mobile application retrieves system status, historical logs, feeding schedules, and alerts from the database. The downward routing of user commands (e.g., triggering an emergency stop) to the physical ESP32/Mega is a future/reserved control path subject to strict authentication, authorization, acknowledgment, timeout, and safety requirements. Currently, no user commands are routed to physical hardware.

## 6. Future Mobile App → Device Control Path
The intended control path for future mobile commands (such as Emergency Stop or approved feeding controls) is:

`Mobile App → Backend → ESP32 → Arduino Mega → Actuator`

**IMPORTANT:** These commands are currently simulated in the mobile application and are NOT hardware-functional. Command authorization, acknowledgment, timeout behavior, and safety handling must be explicitly defined before actual implementation.

## 7. Data Fields
The system exclusively tracks the following variables based on the authorized hardware:
*   `feedWeightGrams`: Current weight of feed in the dispenser.
*   `targetFeedGrams`: User-defined target feed quantity for the current feeding operation.
*   `hopperLevelPercent`: Current fullness of the main feed hopper.
*   `waterLow`: State of the low-level water float switch.
*   `waterHigh`: State of the high-level water float switch. (Note: `waterLow=0` and `waterHigh=0` may represent a legitimate intermediate water condition depending on float switch placement and is not inherently an error).
*   `pumpActive`: Operational state of the water pump.
*   `feedingActive`: Operational state of the feed dispenser motor.
*   `emergencyStopActive`: State of the physical/digital emergency stop.
*   `esp32Status`: Indicates ESP32 network/backend connectivity (e.g., ONLINE/OFFLINE). This is strictly separate from Mega ↔ ESP32 serial-link health.
*   `timestamp`: The time the data was generated/recorded.

*(Constraint: No temperature, humidity, air quality, or lighting data is supported or transmitted.)*

## 8. Data Types and Units
*   **Feed Weight:** Integer (`grams`)
*   **Target Feed Quantity:** Integer (`grams`)
*   **Hopper Level:** Integer (`percentage`, 0-100)
*   **Water States (Low/High):** Boolean (`true` = triggered, `false` = clear)
*   **Motor/Pump States:** Boolean (`true` = running, `false` = off)
*   **Emergency Stop:** Boolean (`true` = halted, `false` = normal)
*   **ESP32 Status:** String (`"ONLINE"`, `"OFFLINE"`)
*   **Timestamp:** String (ISO 8601 format, e.g., `YYYY-MM-DDTHH:mm:ssZ`)

## 9. Timestamp/Time-Source Handling
The system prioritizes accurate timestamps for historical logging and scheduled feedings.
*   **Intended Design:** When the ESP32 has an active Internet connection, it obtains network time via NTP. It sends this date/time information to the Arduino Mega.
*   **Fallback Design:** The Arduino Mega uses the network time to update its local RTC (Real-Time Clock) module. If network time is unavailable or the ESP32 goes offline, the Mega relies exclusively on the RTC to maintain schedules and log data locally to the SD card.

*(Note: This is the intended design, not hardware-validated behavior.)*

## 10. System States
The system operates under defined states to prevent conflicting commands:
*   **NORMAL:** System is operating automatically based on sensor inputs and schedules.
*   **DISPENSING:** Feed motor is actively running.
*   **PUMPING:** Water pump is actively running.
*   **HALTED:** Emergency stop is engaged. The Mega is designed to disable the feed motor and water pump when the emergency stop is active. The final hardware-level safety implementation requires physical validation.

## 11. Event Definitions
Events trigger specific notifications or logs. Authorized events include:
*   `LOW_FEED`: Hopper ultrasonic sensor detects feed below minimum threshold.
*   `LOW_WATER`: Low float switch is triggered.
*   `FEEDING_STARTED`: Dispenser motor turns on (manual or scheduled).
*   `FEEDING_COMPLETED`: Dispenser motor turns off after reaching target weight.
*   `PUMP_TIMEOUT`: Pump runs continuously beyond a safe maximum duration.
*   `EMERGENCY_STOP`: E-stop is engaged (physical button or mobile command).
*   `DEVICE_ERROR`: General fault reported by Mega (e.g., sensor failure).
*   `DEVICE_ONLINE`: ESP32 successfully connects to Wi-Fi and backend.
*   `DEVICE_OFFLINE`: Backend-derived status indicating loss of the ESP32's expected network/backend communication path.

## 12. Alert Definitions
Alerts are derived directly from events and require user attention.
*   **Actionable Alerts:** `LOW_FEED`, `LOW_WATER`, `PUMP_TIMEOUT`, `EMERGENCY_STOP`, `DEVICE_ERROR`, `DEVICE_OFFLINE`.
*   **Informational Events (No Alert Required):** `FEEDING_STARTED`, `FEEDING_COMPLETED`, `DEVICE_ONLINE`.

## 13. Alert Lifecycle / Duplicate-Alert Prevention
To prevent database bloating and notification spam, the system uses event-based notification behavior.
*   **Trigger:** Transition from Normal → Low Water generates exactly **one** `LOW_WATER` alert.
*   **Sustain:** While the condition remains low, the system **does not** repeatedly generate identical alerts.
*   **Resolution:** When the state transitions from Low Water → Normal, the backend records/marks the existing alert as `RESOLVED`, and the mobile app displays the updated status.
*   **Recurrence:** If the condition becomes low again *after* being resolved, a **new** `LOW_WATER` event/alert is generated.

## 14. Connection Failure and Reconnection Behavior
*   **ESP32 Offline:** The Arduino Mega is designed to continue local operation using the RTC and SD card. Wi-Fi-based data transmission is unavailable while the network connection is down. This behavior requires physical validation.
*   **ESP32 Reconnection:** Once Wi-Fi is restored, the ESP32 resumes sending system status updates. *(Note: Syncing offline historical logs from the Mega's SD card to the cloud upon reconnection is a complex feature and is subject to open decisions regarding bandwidth and database retention.)*

## 15. Invalid/Missing Data Handling
*   If a sensor produces invalid or unavailable data, the Mega should indicate the invalid state explicitly rather than treating the value as a valid measurement. The final representation (e.g., null, an error flag, or a dedicated error event) remains subject to firmware/backend implementation.
*   If the mobile app receives data older than a defined threshold, it should display a 'Stale' indicator. The final threshold will be determined after the communication method and expected update interval are established.

## 16. Mega ↔ ESP32 Protocol Reference
The exact message formatting, framing, parsing, data validation, event ACKs, event IDs, heartbeat, time synchronization, and reserved command formats are defined authoritatively in `docs/mega-esp32-protocol.md`.

## 17. Integration Dependencies
*   **Firmware:** Requires finalized serial parsing logic on both Mega and ESP32.
*   **Backend:** Requires API endpoints or database listeners capable of accepting the ESP32 payloads.
*   **Mobile:** Requires updating the current mock data context to connect to real backend listeners.

## 18. Items Requiring Confirmation Before Physical Integration
*   **Serial Reliability:** Verification that the Mega and ESP32 do not drop serial packets or block each other's execution loops.
*   **NTP Latency:** Verification that NTP time fetches do not cause watchdog resets on the ESP32.
*   **Hardware Validation:** The entire physical flow (Sensors → Mega → ESP32) must be physically tested on actual hardware.

## 19. Open Decisions
The following architectural choices are unresolved and MUST be decided before backend integration begins:
*   **Backend Platform:** Firebase vs. Supabase vs. custom MySQL + Node.js backend.
*   **API/Protocol Choice:** How the ESP32 communicates with the backend, such as REST, MQTT, or another appropriate application-layer protocol.
*   **Authentication Method:** How farm users log into the app and secure their data.
*   **Device Identification/Claiming:** How a specific physical HyFePoul device is securely linked to a user's account.
*   **Notification Service:** Platform for handling background push notifications.
*   **Database Retention Limits:** How long historical data and resolved alerts are stored before pruning.

## 20. Serial Protocol Status
The Mega ↔ ESP32 software-level serial protocol is defined in `docs/mega-esp32-protocol.md` and serves as the authoritative reference for message types, framing, fields, validation, acknowledgments, heartbeat behavior, event IDs, and reserved command formats.

Hardware-dependent parameters such as baud rate, UART pin assignment, and buffer sizing remain provisional and require physical hardware validation before being treated as final.
