# HyFePoul Hardware Calibration Record

**Status**: PENDING PHYSICAL VERIFICATION

*Note: This document contains templates for hardware calibration values. Because physical access to the prototype is required, all values are currently marked as NOT TESTED. A human operator must perform these tests on the actual hardware and update this document.*

## 1. Load Cell (HX711) Calibration

| Test | Reference Weight (g) | Measured Raw (ADC) | Measured Scaled (g) | Error (g) | Result |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Zero/Tare | 0 g | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Low Weight | e.g. 50 g | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Med Weight | e.g. 250 g | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| High Weight | e.g. 1000 g | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |

**Final Calibration Factor Calculated**: `NOT TESTED` (Replace placeholder `-7050.0f` in firmware once known).

## 2. RTC (Real-Time Clock)

- **Module Detected**: NOT TESTED
- **Initial Sync (ESP32 NTP -> UART -> RTC)**: NOT TESTED
- **Time Drift Observed**: NOT TESTED
- **Power Loss Persistence**: NOT TESTED

## 3. Water Level Sensors

| Sensor | Physical State | Output Pin State (Voltage) | Firmware Detection | Result |
| :--- | :--- | :--- | :--- | :--- |
| WATER_LOW_PIN | Empty | NOT TESTED | NOT TESTED | NOT TESTED |
| WATER_LOW_PIN | Submerged | NOT TESTED | NOT TESTED | NOT TESTED |
| WATER_HIGH_PIN | Empty | NOT TESTED | NOT TESTED | NOT TESTED |
| WATER_HIGH_PIN | Submerged | NOT TESTED | NOT TESTED | NOT TESTED |

## 4. Ultrasonic Sensor

| Physical Distance (cm) | Measured Distance (cm) | Hopper % Calculated | Error | Result |
| :--- | :--- | :--- | :--- | :--- |
| Near Empty (~40cm) | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Half Full (~20cm) | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Full (~5cm) | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |

## 5. Actuators & Relays (Safe States)

- **Feed Dispenser Relay Default State**: NOT TESTED (Expected: OFF during boot)
- **Water Pump Relay Default State**: NOT TESTED (Expected: OFF during boot)
- **Buzzer Default State**: NOT TESTED (Expected: OFF during boot)

## 6. Emergency Stop (E-Stop)

- **Physical Switch Pressed**: NOT TESTED (Expected: Firmware immediately halts feeding/pump, logs EVENT, safely isolates)
- **Physical Switch Released**: NOT TESTED (Expected: Firmware recovers and permits commands)
