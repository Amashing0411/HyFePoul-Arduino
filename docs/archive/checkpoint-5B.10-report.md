# Checkpoint 5B.10 Report: Arduino Mega Remote Command Safety Layer

## Overview
This checkpoint implements the Arduino Mega side of the remote command protocol. The Mega firmware (`HyFePoul_Arduino`) is now capable of receiving, parsing, validating, and safely executing (or rejecting) commands originating from the ESP32. 

The primary architectural mandate remains intact: **The Arduino Mega is the absolute authority on physical safety.** The ESP32 acts solely as a communication bridge.

## UART Command Parser
The Mega parses incoming `CMD|` frames in `ESP32Communication.ino` via `processRemoteCommand()`.
- Missing or malformed commands are silently ignored (if no ID is present) or explicitly rejected.
- String conversion is done safely, explicitly rejecting parameters that convert to `NaN`, negative numbers, or missing parameters.

## Validation Rules & Safety Checks
Before any physical actuation, the Mega strictly validates the command against its internal state:

1. **`MANUAL_FEED`**: 
   - Rejects if `TARGET` is missing, ≤0, or >5000g.
   - Rejects if `emergencyStopActive` is `true`.
   - Rejects if `feedingActive` is already `true`.
   - Uses the existing `Feeding.ino` logic. 

2. **`ESTOP_RELEASE`**:
   - Rejects if the physical E-Stop button (`EMERGENCY_STOP_PIN`) is currently engaged (`LOW`). Remote software cannot bypass physical safety.
   - Rejects if `emergencyStopActive` is already false.
   - Only clears the software lock if the physical switch is safe.

3. **`SYSTEM_RESTART`**:
   - **Safely rejected/stubbed**. Without a dedicated hardware watchdog chip/circuit ensuring absolute actuator isolation during boot, a remote software reset poses a safety risk (e.g. bootloader pin toggling). It returns `REJECTED|REASON:NOT_IMPLEMENTED_SAFELY`.

4. **`STATUS_REQ`**:
   - Safely triggers the existing `sendCurrentDataToESP32()` method and completes immediately without actuating anything.

## Duplicate Handling & Communication Loss
- **Duplicate ID**: If the ESP32 re-transmits a command ID that is already the `activeRemoteCommandId`, it returns `REJECTED|REASON:DUPLICATE_ID`.
- **System Busy**: If a new command arrives while the Mega is executing an existing one, it returns `REJECTED|REASON:SYSTEM_BUSY`.
- **Communication Loss**: The Mega's safety loops (`runActiveFeeding()`, `handleSafety()`) execute independently in `loop()`. If the ESP32 goes offline or Wi-Fi drops, the Mega naturally stops feeding via its existing target weight check or its `FEEDING_TIMEOUT_MS` watchdog. 

## Actuator Safe-State Behavior
Inspected and corrected `initializePins()` in `Config.ino`. 
Previously, `pinMode(OUTPUT)` was called before `digitalWrite(LOW)`. This could cause the pins to float or glitch `HIGH` for a few milliseconds upon boot, potentially jogging the dispenser motor or water pump.
- **Fix**: Actuator pins are now explicitly driven `LOW` *before* enabling `pinMode(OUTPUT)` to ensure zero startup glitches.

## Acknowledgement & Completion Protocol
- Acknowledges accepted commands: `CMD_ACK|ID:<id>|STATUS:ACCEPTED`
- Acknowledges rejected commands: `CMD_ACK|ID:<id>|STATUS:REJECTED|REASON:<reason>`
- Completes finished operations: `CMD_DONE|ID:<id>|STATUS:SUCCESS`
- Reports aborted operations (e.g., E-Stop pressed mid-feed): `CMD_DONE|ID:<id>|STATUS:FAILED|REASON:<reason>`

## Test Results
Due to the absence of a C++ compiler (`arduino-cli` or `g++`) in the CI environment, we could not run a desktop C++ test harness. To verify the safety logic deterministically as requested:
1. We replicated the exact parsing, state-machine, and safety constraints from the C++ firmware into a dedicated Node.js test harness (`scripts/simulate-mega.js`).
2. **15/15 Command Edge Cases PASSED**: Tested valid execution, duplicate prevention, physical E-stop overriding prevention, invalid parameter types, and unknown commands.
3. Existing RTDB/ESP32 tests also remain intact.

## Physical Verification Status
- RTDB Rules verification: **PERFORMED** (Passed)
- ESP32 Transport verification: **PERFORMED** (Passed)
- Mega Logic Simulator verification: **PERFORMED** (Passed)
- Firmware compilation verification: **DEFERRED** (No local compiler)
- Physical hardware verification: **NOT PERFORMED** (Targeted for a future checkpoint)

## Unresolved Limitations
- Final verification relies on uploading to a physical Arduino Mega 2560 and observing the relays/actuators. 
- The load-cell `scale.get_units()` calibration remains a placeholder (`-7050.0f`).
