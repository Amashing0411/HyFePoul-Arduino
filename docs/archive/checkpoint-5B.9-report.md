# Checkpoint 5B.9 Report: ESP32 Remote Command Transport

## Overview
This checkpoint successfully implements the ESP32 transport layer for processing Realtime Database remote commands and forwarding them to the Arduino Mega. Physical actuator control is **NOT** implemented in this checkpoint.

## Command Retrieval & Polling
The ESP32 now implements a 5-second polling loop (`pollCommands()`) targeting its specific `commands/{deviceId}.json` node. 
- It uses `?orderBy="status"&equalTo="queued"` to filter relevant commands via the REST API efficiently.
- An `.indexOn: ["status"]` rule was added to `database.rules.json` to permit this index query natively inside Firebase.
- The ESP32 enforces strict execution serialism: it processes exactly one command at a time and suppresses polling while `activeCommandId` is engaged.

## Validation & Stale Handling
Before forwarding any command over UART, the ESP32 performs client-side validation:
- **Structural**: Skips if `commandName`, `createdAt`, or `issuedBy` are missing.
- **Whitelist**: Skips if the command is not in the approved whitelist (`MANUAL_FEED`, `ESTOP_RELEASE`, `SYSTEM_RESTART`, `STATUS_REQ`).
- **NTP Stale Check**: Ensures the device possesses valid NTP time. It then evaluates `currentTime - createdAt`. If the command age exceeds 5 minutes, it is immediately aborted via a `PATCH` setting `status: "failed"` and `error: "STALE_COMMAND"`. 

## Lifecycle Transitions
The ESP32 correctly shepherds the RTDB command lifecycle via atomic HTTP `PATCH` requests, obeying the Checkpoint 5B.8 state rules:
- `queued` → `acknowledged` (Sent just before UART transmission)
- `acknowledged` → `executing` (Upon Mega `CMD_ACK|STATUS:ACCEPTED`)
- `executing` → `completed` (Upon Mega `CMD_DONE|STATUS:SUCCESS`)
- `*` → `failed` (Upon timeouts or Mega rejections)

## UART Transport & Safety Boundaries
Valid commands are translated into the designed deterministic frame schema:
`CMD|ID:<cmdId>|ACTION:<action>[|TARGET:<grams>]`
The ESP32 acts solely as a Wi-Fi bridge—it never directly energizes a relay, pump, or motor, ensuring the Arduino Mega remains the ultimate safety authority.

## Duplicate Handling & Timeout
- **Duplicate Protection**: The ESP32 tracks the `activeCommandId`. Any RTDB command arriving mid-execution is completely ignored until the current lifecycle completes.
- **Timeouts**: The ESP32 implements two watchdog bounds:
  - `UART_ACK_TIMEOUT` (3 seconds) for the Mega to receive and reply `CMD_ACK`.
  - `UART_EXEC_TIMEOUT` (120 seconds) for the Mega to complete the actuation.
  If breached, the command is failed with `error: "UART_TIMEOUT"` or `"EXECUTION_TIMEOUT"`, preventing the ESP32 from halting indefinitely.

## Testing Verification
The NodeJS integration simulator (`scripts/simulate-esp32.js`) was expanded with 15 intensive new test suites mocking the Mega hardware boundaries:
- **Validations**: Simulated malformed, unrecognized, stale, and duplicate payloads. All were caught.
- **Time Sync Constraints**: Verified that missing NTP explicitly stalls command intake safely.
- **Timeouts & Rejections**: Simulated UART timeouts and arbitrary `CMD_ACK|REJECTED` states.
- **RTDB Integrity**: 47/47 rules tests passed smoothly.

## Physical Verification Status
- RTDB emulator verification: **PERFORMED** (Passed)
- Node simulator verification: **PERFORMED** (Passed 15/15)
- Firmware compilation verification: **PERFORMED** (Passed)
- Physical hardware verification: **NOT PERFORMED** (Targeted for a future checkpoint)

## Limitations
- Actuation is stubbed; the Mega firmware does not yet process the `CMD|` strings over Serial.
- Network disconnection midway through execution will orphan the command on the ESP32, which will naturally `EXECUTION_TIMEOUT` upon reconnection.
