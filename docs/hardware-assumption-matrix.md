# HYFEPOUL HARDWARE ASSUMPTION MATRIX
*This matrix separates hardware-dependent assumptions into their respective confidence tiers. It must be strictly maintained during physical hardware commissioning.*

## A. CONFIRMED FROM DESIGN/SOURCE
These values are explicitly defined in the software architecture and `Config.ino` logic.

- **Primary Controller:** Arduino Mega 2560 (handles physical constraints, I/O, safety overrides).
- **Communication Module:** ESP32 (handles Wi-Fi, RTDB connection, NTP time).
- **UART Protocol:** Text-based over `Serial1` at `115200` baud.
- **Relay Initial State:** Software enforces `digitalWrite(LOW)` prior to setting `OUTPUT` mode.
- **ESP32 Timeout:** `ESP32_TIMEOUT_MS = 15000` (Mega assumes offline if no heartbeat).
- **Feed Timeout:** `FEEDING_TIMEOUT_MS = 30000` (Safety cutoff if weight doesn't increase).
- **Pump Timeout:** `WATER_PUMP_MAX_RUNTIME_MS = 120000` (Safety cutoff for pump).
- **E-Stop Software Handling:** Configured as `INPUT_PULLUP`, dropping all relays to `LOW`.

## B. PROVISIONAL / REQUIRES PHYSICAL VERIFICATION
These values exist in `Config.ino` as placeholder constants but MUST be verified against the physical fabrication.

- **Arduino Mega Pins:**
  - HX711 DOUT: `30`
  - HX711 SCK: `31`
  - Ultrasonic TRIG: `32`
  - Ultrasonic ECHO: `33`
  - Water LOW Float: `34`
  - Water HIGH Float: `35`
  - Pump Relay: `36`
  - Dispenser Relay: `37`
  - Emergency Stop: `38`
  - Buzzer: `39`
  - SD CS: `53`
  - Mega RX1/TX1: `19/18` (Mapped to ESP32 UART)
  - Mega RX2/TX2: `17/16` (Mapped to Nextion UART)
  - RTC SDA/SCL: `20/21`
- **ESP32 UART Pins:** The specific physical pins on the ESP32 wired to Mega 18/19.
- **Mega ↔ ESP32 Logic-Level Compatibility:** Does the hardware feature a level shifter (5V ↔ 3.3V)?
- **Relay Active HIGH/LOW Behavior:** Do the physical relay modules close their NO contacts on a `HIGH` signal or `LOW` signal?
- **E-Stop Electrical Behavior:** Is the physical switch Normally Closed (NC) or Normally Open (NO)?
- **Power Rails:** Are the pump/motor and logic boards on properly isolated/regulated rails?
- **Common Ground:** Are the Mega, ESP32, Relays, and Sensors physically sharing a stable ground?

## C. CALIBRATION REQUIRED
These values must be physically measured on the workbench. The code placeholders are arbitrary.

- **HX711 Calibration Factor:** Currently `-7050.0f`. **(NOT CALIBRATED)**
- **Hopper Empty Distance:** Currently `40.0f` cm. **(NOT CALIBRATED)**
- **Hopper Full Distance:** Currently `5.0f` cm. **(NOT CALIBRATED)**

## D. UNKNOWN UNTIL PROTOTYPE ARRIVES
These aspects are hardware mysteries that cannot be determined until the physical delivery.

- **Load Cell Capacity:** e.g., 5kg, 10kg, 20kg.
- **Relay Physical Wiring (NO vs NC):** Are the motors wired to Normally Open to ensure fail-safe behavior if the Mega loses power?
- **True E-Stop Power Interruption:** Does the E-Stop button sever the 12V supply to the actuators, or does it only notify the Mega GPIO?
- **Water Float Logic:** Does the float switch read CLOSED when floating up or down?
