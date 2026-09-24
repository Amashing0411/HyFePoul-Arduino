# HyFePoul Mega ↔ ESP32 Serial Protocol Specification

## 1. Purpose
This document specifies the finalized software-level communication protocol between the Arduino Mega 2560 (Primary Controller) and the ESP32 (Wi-Fi/Communication Module). It builds upon the high-level data contracts established in `docs/data-communication-contract.md` by defining exact message formatting, parsing rules, and error handling for the physical serial connection.

*(Note: All hardware configurations mentioned herein are provisional and require physical validation on the actual hardware.)*

## 2. Serial Configuration
The communication relies on a hardware UART serial connection. 

*   **Interface:** Hardware Serial (e.g., Serial1 on Arduino Mega, UART2 on ESP32)
*   **Baud Rate:** 115200 bps *(Provisional — requires hardware validation)*
*   **Data Bits:** 8
*   **Parity:** None
*   **Stop Bits:** 1
*   **Line Termination:** `\n` (LF) for end-of-message
*   **Character Encoding:** ASCII / UTF-8

## 3. Message Framing
To ensure robustness while remaining lightweight for the Arduino Mega, the protocol uses a **pipe-delimited text format with key:value pairs**. This allows for easy string tokenization without the overhead of parsing complex JSON.

**Format Structure:**
`TYPE|KEY1:VALUE1|KEY2:VALUE2\n`

*   `TYPE`: The message category (e.g., `DATA`, `EVENT`, `TIME`, `CMD_RESERVED`).
*   `|` (Pipe): Delimiter separating message segments.
*   `:` (Colon): Delimiter separating a field key from its value.
*   `\n` (Newline): End of message terminator.

## 4. Message Types

### 4.1 Mega ↔ ESP32 Shared Message Types
*   **`HEARTBEAT`**: Periodic ping sent by both devices to verify serial link health.

### 4.2 Mega → ESP32 Message Types
*   **`DATA`**: Periodic transmission of complete system status (sensor readings and actuator states). Fire-and-forget.
*   **`EVENT`**: Asynchronous notification of a state change or alert trigger.
*   **`ACK_CMD`**: Reserved format for future Mega acknowledgment of backend commands. (Not implemented).

### 4.3 ESP32 → Mega Message Types
*   **`TIME`**: Network time synchronization payload derived from NTP.
*   **`NET_STATUS`**: Updates regarding Wi-Fi or backend connectivity.
*   **`ACK`**: Acknowledgment of a received actionable `EVENT` message.
*   **`CMD_RESERVED`**: Reserved format for future commands from the backend.

## 5. Exact Message Format

### 5.1 System Data (`DATA`)
*   **Sender:** Mega
*   **Receiver:** ESP32
*   **Purpose:** Transmit the current state of all sensors and actuators.
*   **Required Fields:** `feedWeightGrams`, `targetFeedGrams`, `hopperLevelPercent`, `waterLow`, `waterHigh`, `pumpActive`, `feedingActive`, `emergencyStopActive`, `timestamp`.
*   **Syntax:** `DATA|feedWeightGrams:<int>|targetFeedGrams:<int>|hopperLevelPercent:<int>|waterLow:<0/1>|waterHigh:<0/1>|pumpActive:<0/1>|feedingActive:<0/1>|emergencyStopActive:<0/1>|timestamp:<ISO8601>\n`
*   **Example:** `DATA|feedWeightGrams:450|targetFeedGrams:500|hopperLevelPercent:85|waterLow:0|waterHigh:0|pumpActive:0|feedingActive:1|emergencyStopActive:0|timestamp:2026-09-24T14:00:00Z\n`
*   **Expected Response:** None (Fire-and-forget).

### 5.2 Event Notification (`EVENT`)
*   **Sender:** Mega
*   **Receiver:** ESP32
*   **Purpose:** Notify the backend of a distinct occurrence.
*   **Fields:** `name` (required), `eventId` (required for actionable events only).
*   **Syntax (Actionable):** `EVENT|eventId:<id>|name:<event_name>\n`
*   **Syntax (Informational):** `EVENT|name:<event_name>\n`
*   **Example (Actionable):** `EVENT|eventId:42-1045|name:LOW_WATER\n`
*   **Example (Informational):** `EVENT|name:FEEDING_STARTED\n`
*   **Expected Response:** `ACK` for actionable events; None for informational events.

### 5.3 Heartbeat (`HEARTBEAT`)
*   **Sender:** Mega & ESP32 (Bi-directional)
*   **Receiver:** ESP32 & Mega
*   **Purpose:** Keep-alive ping to monitor the serial link.
*   **Syntax:** `HEARTBEAT\n`
*   **Expected Response:** None (Each device sends its own ping independently).

### 5.4 Time Synchronization (`TIME`)
*   **Sender:** ESP32
*   **Receiver:** Mega
*   **Purpose:** Sync the Mega's local RTC with NTP network time.
*   **Required Fields:** `timestamp` (ISO 8601 string in UTC)
*   **Syntax:** `TIME|timestamp:<ISO8601>\n`
*   **Example:** `TIME|timestamp:2026-09-24T14:00:00Z\n`
*   **Expected Response:** None.

### 5.5 Network Status (`NET_STATUS`)
*   **Sender:** ESP32
*   **Receiver:** Mega
*   **Purpose:** Inform the Mega of the ESP32's network/backend connectivity (online/offline). This is completely separate from Mega↔ESP32 serial-link health, which is monitored by `HEARTBEAT`.
*   **Syntax:** `NET_STATUS|state:<ONLINE/OFFLINE>\n`
*   **Example:** `NET_STATUS|state:ONLINE\n`
*   **Expected Response:** None.

### 5.6 Acknowledgment (`ACK`)
*   **Sender:** ESP32
*   **Receiver:** Mega
*   **Purpose:** Confirm receipt of an actionable `EVENT` message.
*   **Syntax:** `ACK|type:EVENT|eventId:<id>\n`
*   **Example:** `ACK|type:EVENT|eventId:42-1045\n`

## 6. Event Definitions and ACK Behavior
The Mega generates the following authorized events:

| Event Name | Type | Requires ACK | Event ID Needed |
| :--- | :--- | :--- | :--- |
| `LOW_FEED` | Actionable | Yes | Yes |
| `LOW_WATER` | Actionable | Yes | Yes |
| `PUMP_TIMEOUT` | Actionable | Yes | Yes |
| `EMERGENCY_STOP` | Actionable | Yes | Yes |
| `DEVICE_ERROR` | Actionable | Yes | Yes |
| `FEEDING_STARTED` | Informational | No | No |
| `FEEDING_COMPLETED` | Informational | No | No |

*(Note: `DEVICE_ONLINE` and `DEVICE_OFFLINE` are generated by the backend based on ESP32 Wi-Fi connectivity, not by the Mega).*

## 7. Event ID and Duplicate Handling
To prevent duplicate alerts when the Mega retries an unacknowledged event across restarts or network drops:
*   **Generation:** The Mega generates a lightweight, composite event identifier consisting of a `sessionId` and a sequential `counter`. The `sessionId` distinguishes reboots (e.g., a 32-bit persistent boot counter stored in EEPROM, incremented on every startup). The `counter` is a 32-bit integer that increments per event, providing a virtually infinite unique sequence without intentional wrapping during a single session. Example: `eventId:42-1045`.
*   **Retry:** If the Mega does not receive an `ACK`, it re-sends the exact same `EVENT` payload (reusing the exact same `eventId:42-1045`).
*   **ESP32 Duplicate Detection:** The ESP32 caches the last few received `eventId`s (e.g., last 5). If it receives an `EVENT` with an ID already in the cache, it sends an `ACK` back to the Mega (in case the previous ACK was lost on the wire) but **does not** forward the duplicate event to the backend.
*   **Backend Deduplication:** The backend can deduplicate events by verifying the unique `sessionId-counter` combination alongside the event name.
*   **Restart Behavior:** Upon Mega reboot, the `sessionId` increments, and the event `counter` resets to 0. This ensures post-reboot event IDs (`43-1`) never collide with pre-reboot IDs (`42-1`), preserving reliable duplicate detection.

## 8. Heartbeat / Serial Link Health
*   **Syntax:** Both devices use the simple payload `HEARTBEAT\n` (no additional fields). No `ACK` is required for a heartbeat.
*   **Mega → ESP32 HEARTBEAT:** ESP32 updates its last-received Mega heartbeat timestamp.
*   **ESP32 → Mega HEARTBEAT:** Mega updates its last-received ESP32 heartbeat timestamp.
*   **Interval:** Each endpoint independently sends a heartbeat every 30 seconds *(Provisional - requires physical validation)*.
*   **Timeout (ESP32 Side):** If the expected heartbeat has not been received for 3 consecutive intervals (90 seconds), the ESP32 marks the Mega as unreachable internally. The backend may receive/derive a communication status later based on this internal state. (The ESP32 does *not* generate a new system-wide `DEVICE_ERROR` event just for a serial timeout, preserving existing event definitions).
*   **Timeout (Mega Side):** If the expected heartbeat has not been received for 3 consecutive intervals (90 seconds), the Mega marks the serial link as unhealthy. 
*   **Core Safety:** Core Mega feeding, hydration, and safety logic must continue regardless of serial-link health. Both devices continue their local responsibilities if the link fails.

## 9. Malformed / Invalid Message Handling
To protect the Mega from serial buffer overflows and parsing crashes, the following rules apply:
*   **Missing Terminator:** If a message exceeds the maximum expected length (e.g., 256 bytes) before a `\n` is encountered, the serial buffer is flushed and the truncated message is discarded.
*   **DATA Message Validation:** If ANY required `DATA` field is missing, malformed, contains an invalid type (e.g., non-numeric where a number is expected), contains an invalid boolean (not 0/1), or has an invalid timestamp, the ENTIRE `DATA` message must be rejected/discarded. Partially applying a `DATA` payload is strictly prohibited to prevent mixed states containing current and stale values.
*   **EVENT Message Validation:** For `EVENT` messages, required fields must be valid; otherwise, the entire `EVENT` message is rejected.
*   **Unknown Message Type:** Messages lacking a valid `TYPE` prefix are silently discarded.

## 10. Timezone and Time Synchronization Design
To prevent timezone logic overhead on the 8-bit Mega, **the entire hardware stack operates in UTC**.
*   **ESP32:** Fetches NTP time in UTC.
*   **Mega RTC:** Stores and maintains time in UTC.
*   **Payloads:** All `timestamp` fields in `DATA` and SD logs are recorded in UTC (ISO 8601 `Z` format).
*   **Local Time Conversion:** The conversion to Philippine Standard Time (UTC+8) is handled exclusively by the Mobile App and Backend for user display.

## 11. Safety / Offline Behavior
*   **ESP32 Loses Wi-Fi/Internet:** The Mega continues local poultry-management functions using its own logic and RTC. Feeding and hydration do NOT depend on the Internet. 
*   **Serial Communication Fails:** If the Mega ↔ ESP32 serial link breaks, the Mega continues running local safety logic. No remote command can bypass the Mega's hardcoded safety overrides.

## 12. Remote Commands (RESERVED / FUTURE)
The control path (`Mobile App → Backend → ESP32 → Mega → Actuator`) is strictly **RESERVED** for future implementation. 

**Future Command Design Constraints:**
*   **Syntax:** `CMD_RESERVED|action:<action_name>|cmd_id:<uuid>\n`
*   **Validation:** Mega must validate all commands against local safety constraints (e.g., rejecting a remote "Pump On" if `waterHigh` is true).
*   **Acknowledgment:** Mega must reply with `ACK_CMD|cmd_id:<uuid>|status:<SUCCESS/REJECTED>\n`.
*   **Authentication:** Handled entirely by the backend/mobile app; the serial protocol assumes incoming ESP32 commands are pre-authorized.
*(Note: DO NOT implement these commands in firmware yet).*

## 13. Data Flow Examples

**A. Normal Startup:**
```text
ESP32 -> Mega: NET_STATUS|state:OFFLINE\n
(ESP32 connects to Wi-Fi/NTP)
ESP32 -> Mega: NET_STATUS|state:ONLINE\n
ESP32 -> Mega: TIME|timestamp:2026-09-24T14:00:00Z\n
Mega -> ESP32: DATA|feedWeightGrams:450|...|timestamp:2026-09-24T14:00:05Z\n
```

**B. Normal Status Transmission:**
```text
Mega -> ESP32: DATA|feedWeightGrams:450|targetFeedGrams:500|hopperLevelPercent:85|waterLow:0|waterHigh:0|pumpActive:0|feedingActive:0|emergencyStopActive:0|timestamp:2026-09-24T14:05:00Z\n
```

**C. Informational Event (No ACK):**
```text
Mega -> ESP32: EVENT|name:FEEDING_STARTED\n
Mega -> ESP32: DATA|feedWeightGrams:0|...|feedingActive:1|...|timestamp:2026-09-24T14:10:00Z\n
```

**D. Actionable Event (Requires ACK):**
```text
Mega -> ESP32: EVENT|eventId:42-1045|name:LOW_WATER\n
ESP32 -> Mega: ACK|type:EVENT|eventId:42-1045\n
```

**E. Event Retry (Lost ACK):**
```text
Mega -> ESP32: EVENT|eventId:42-1046|name:EMERGENCY_STOP\n
(No ACK received after 2 seconds)
Mega -> ESP32: EVENT|eventId:42-1046|name:EMERGENCY_STOP\n
ESP32 -> Mega: ACK|type:EVENT|eventId:42-1046\n
(ESP32 detects duplicate 42-1046, sends ACK but drops duplicate forwarding)
```

**F. Serial Link Health Check:**
```text
Mega -> ESP32: HEARTBEAT\n
ESP32 -> Mega: HEARTBEAT\n
```

**G. Future Command Flow (Documentation Only):**
```text
ESP32 -> Mega: CMD_RESERVED|action:EMERGENCY_STOP|cmd_id:12345\n
Mega -> ESP32: ACK_CMD|cmd_id:12345|status:SUCCESS\n
Mega -> ESP32: EVENT|eventId:42-1047|name:EMERGENCY_STOP\n
Mega -> ESP32: DATA|...|emergencyStopActive:1|...|timestamp:2026-09-24T14:15:00Z\n
```
