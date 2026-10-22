# HYFEPOUL HARDWARE ASSUMPTION MATRIX

*This document defines the software-intended hardware configuration. These are INTENDED MAPPINGS, NOT PHYSICALLY VERIFIED FACTS.*

## Architecture Assumptions
- **Arduino Mega 2560**: Primary controller and hardware safety authority.
- **ESP32**: Wi-Fi/Internet communication co-processor and transport broker.

## Pin & Interface Assumptions

| Component | Expected Role | Expected Interface | Expected Mega Pin | Expected ESP32 Pin | Expected Logic Level | Software Dependency | Verification Status | Physical Verification Required |
|---|---|---|---|---|---|---|---|---|
| ESP32 Co-processor | Wi-Fi/RTDB Bridge | UART (Serial1) | RX: 19, TX: 18 | RX: GPIO16, TX: GPIO17 | **3.3V (ESP32) vs 5V (Mega)** | `<Arduino.h>` HardwareSerial | Unverified | Level-shifting / common ground |
| Nextion HMI | Local Display | UART (Serial2) | RX: 17, TX: 16 | N/A | **5V** | `<Arduino.h>` HardwareSerial | Unverified | Baud rate matching (9600), Logic levels |
| RTC (DS3231) | Fallback Clock | I2C | SDA: 20, SCL: 21 | N/A | **5V** (I2C) | `RTClib` | Unverified | I2C pullups, Address |
| SD Card Reader | Data Logging | SPI | CS: 53, MOSI: 51, MISO: 50, SCK: 52 | N/A | **5V** (or 3.3V w/ onboard reg) | `<SD.h>`, `<SPI.h>` | Unverified | SPI logic level compatibility |
| HX711 Amp ×5 | Tray load cell digitizers (trays 1–5) | 2-wire serial, shared SCK | DOUT: 30, 40, 41, 42, 43; SCK: 31 (shared) | N/A | **5V** | `HX711 Arduino Library` | Unverified | Load cell wiring (E+/E-/A+/A-) per tray; shared-SCK reads |
| Ultrasonic Sensor | Hopper Feed Level | Trigger / Echo | TRIG: 32, ECHO: 33 | N/A | **5V** | `<Arduino.h>` pulseIn | Unverified | Acoustic range, mounting |
| Reservoir Float | Water reservoir low (gravity-fed drinker, no pump) | Digital Input | 34 | N/A | **5V** (INPUT_PULLUP) | `<Arduino.h>` digitalRead | Unverified | NO vs NC polarity; closed = low assumed |
| Home Limit Switch | Hopper at start position | Digital Input | 45 | N/A | **5V** (INPUT_PULLUP) | `<Arduino.h>` digitalRead | Unverified | NO vs NC (NC is fail-safe); pressed = LOW assumed |
| End Limit Switch | Hopper at far end (past tray 5) | Digital Input | 46 | N/A | **5V** (INPUT_PULLUP) | `<Arduino.h>` digitalRead | Unverified | NO vs NC; pressed = LOW assumed |
| E-Stop Button | Emergency Cutoff | Digital Input | 38 | N/A | **5V** (INPUT_PULLUP) | `<Arduino.h>` digitalRead | Unverified | Hardware isolation vs just GPIO |
| Chain Forward Relay | Chain motor forward polarity | Digital Output | 36 | N/A | **5V** | `<Arduino.h>` digitalWrite | Unverified | Active-HIGH vs Active-LOW; polarity-swap wiring |
| Chain Reverse Relay | Chain motor reverse polarity | Digital Output | 44 | N/A | **5V** | `<Arduino.h>` digitalWrite | Unverified | Never on with the forward relay (firmware interlock + 300 ms dead time) |
| Dispenser Relay | Feed Motor Control | Digital Output | 37 | N/A | **5V** | `<Arduino.h>` digitalWrite | Unverified | Active-HIGH vs Active-LOW |
| Buzzer | Audible Alarm | Digital Output | 39 | N/A | **5V** | `<Arduino.h>` digitalWrite | Unverified | Passive vs Active buzzer |

## Calibration Assumptions (Must be established physically)
| Component | Metric | Assumed Placeholder Value |
|---|---|---|
| Load Cells (×5) | Calibration Factor, per tray | `-7050.0f` each |
| Chain | Forward travel time to each tray (`TRAY_TRAVEL_MS`) | 3000 ms per segment |
| Chain | Timeouts: home/return, to end | 30 s, 15 s |
| Dispenser | Per-tray dispense timeout | 30 s |
| Ultrasonic | Hopper Empty Distance | `40.0f` cm |
| Ultrasonic | Hopper Full Distance | `5.0f` cm |

**NOTE:** Do not treat these values as verified. Physical testing is strictly required when the prototype arrives.
