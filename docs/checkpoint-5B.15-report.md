# Checkpoint 5B.15 Report — Hardware Verification & Sensor Calibration

## 1. Objective
Transition the verified software architecture from the emulator/simulator environment onto the physical HyFePoul hardware prototype. Physically calibrate the HX711 load cell, confirm actuator safety boundaries, verify Nextion display operation, and validate the end-to-end integration across physical Wi-Fi and UART layers.

## 2. Final Hardware Status
**STATUS: BLOCKED PENDING HUMAN INTERVENTION**

As an automated AI agent without physical appendages or a hardware lab, I cannot physically power up the Mega/ESP32, place reference weights on the scale, measure relay output voltages, press the E-stop button, or verify the Nextion display's rendering.

All phases of this checkpoint are intentionally marked as **NOT TESTED** in compliance with the critical rules:
> "DO NOT claim hardware verification unless the physical device is actually connected and tested."
> "Do NOT fabricate sensor readings."

## 3. Firmware Version/Commit
- **Latest Commit Analyzed**: `7652987`
- **Firmware Integrity**: The Mega and ESP32 firmwares remain exactly as they were at the end of 5B.14. No arbitrary code changes were introduced because no physical hardware bug has been observed yet.

## 4. Phase 1: Pin Verification Checklist
An audit of `firmware/arduino-mega/HyFePoul_Arduino/Config.ino` yields the following expected pinout map. A human operator must verify this against the physical prototype.

| COMPONENT | EXPECTED PIN | ACTUAL PIN | EXPECTED BEHAVIOR | VERIFIED? | OBSERVATION |
| :--- | :--- | :--- | :--- | :--- | :--- |
| HX711_DOUT | 30 | NOT TESTED | Load cell digital out | NOT TESTED | |
| HX711_SCK | 31 | NOT TESTED | Load cell clock | NOT TESTED | |
| ULTRASONIC_TRIG | 32 | NOT TESTED | Ultrasonic pulse | NOT TESTED | |
| ULTRASONIC_ECHO | 33 | NOT TESTED | Ultrasonic receive | NOT TESTED | |
| WATER_LOW | 34 | NOT TESTED | Low float switch | NOT TESTED | |
| WATER_HIGH | 35 | NOT TESTED | High float switch | NOT TESTED | |
| PUMP_RELAY | 36 | NOT TESTED | Activates water pump | NOT TESTED | |
| DISPENSER_RELAY | 37 | NOT TESTED | Activates feed motor | NOT TESTED | |
| E_STOP | 38 | NOT TESTED | Halts all actuators | NOT TESTED | |
| BUZZER | 39 | NOT TESTED | Audible alarm | NOT TESTED | |
| SD_CS | 53 | NOT TESTED | SD card chip select | NOT TESTED | |
| ESP32_RX (Serial1) | 19 | NOT TESTED | UART from ESP32 | NOT TESTED | |
| ESP32_TX (Serial1) | 18 | NOT TESTED | UART to ESP32 | NOT TESTED | |
| NEXTION_RX (Serial2) | 17 | NOT TESTED | UART from Nextion | NOT TESTED | |
| NEXTION_TX (Serial2) | 16 | NOT TESTED | UART to Nextion | NOT TESTED | |

## 5. Subsystem Physical Tests

| System | Status | Operator Notes |
| :--- | :--- | :--- |
| **Power Verification** | FAIL / NOT TESTED | Awaiting human verification of 5V/12V rails and actuator isolation. |
| **E-Stop** | FAIL / NOT TESTED | Awaiting physical button press test to confirm firmware safety isolation. |
| **RTC** | FAIL / NOT TESTED | Awaiting physical I2C validation and ESP32 NTP injection. |
| **HX711 Calibration** | FAIL / NOT TESTED | Calibration factor remains `-7050.0f` (placeholder). See `docs/hardware-calibration.md`. |
| **Load Cell (Tare/Weight)** | FAIL / NOT TESTED | Awaiting reference weight testing. |
| **Feeding Activation** | FAIL / NOT TESTED | Awaiting observation of actual feed dispenser rotation. |
| **Scheduled Feeding** | FAIL / NOT TESTED | Awaiting RTC trigger test. |
| **Manual/Schedule Collision**| FAIL / NOT TESTED | Awaiting simultaneous command trigger test. |
| **Water System** | FAIL / NOT TESTED | Awaiting float switch manual manipulation and pump relay test. |
| **Nextion Display** | FAIL / NOT TESTED | Awaiting visual confirmation of UI rendering and UART mapping. |
| **SD Card** | FAIL / NOT TESTED | Awaiting file write verification. |
| **ESP32 / Wi-Fi** | FAIL / NOT TESTED | Awaiting actual router connection and Firebase cloud write. |
| **Firebase / Mobile App** | FAIL / NOT TESTED | Awaiting end-to-end trace from physical device to phone screen. |
| **Offline Test** | FAIL / NOT TESTED | Awaiting physical router disconnect test. |
| **Power-Cycle Test** | FAIL / NOT TESTED | Known Limitation from 5B.14: Mega RAM resets schedules. Needs physical observation. |

## 6. Corrective Changes
None. Code modification is paused until physical hardware bugs or calibration factors are obtained.

## 7. Next Steps
1. A human operator must securely connect the prototype according to the pinout.
2. The operator must fill out `docs/hardware-calibration.md`.
3. The operator must fill out this report's matrices.
4. Once actual physical measurements are recorded, the agent can resume to hardcode the HX711 factor and patch any real-world edge cases discovered.
