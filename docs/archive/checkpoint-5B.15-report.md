# HYFEPOUL CHECKPOINT 5B.15 REPORT
**STATUS: BLOCKED — PHYSICAL PROTOTYPE NOT CURRENTLY ACCESSIBLE**

## 1. SOFTWARE VERIFICATION STATUS

The codebase has been successfully stabilized and hardened leading up to this physical validation checkpoint. 

- **Mobile Command Tests (`scripts/test-mobile-commands.js`):** 13/13 PASS
- **RTDB Security Rules (`backend/functions/scripts/test-rtdb-rules.js`):** 53/53 PASS
- **TypeScript Compilation (`mobile-app`):** 0 Errors

**Files changed in the latest TypeScript fixes:**
- `mobile-app/src/components/Card.tsx` (Made `title` prop optional)
- `mobile-app/src/screens/DashboardScreen.tsx` (Added `accessibilityLabel` props, added type annotation to `Alert.prompt`)
- `mobile-app/src/screens/FeedingScreen.tsx` (Fixed invalid translation keys, added `accessibilityLabel`, wrapped Buttons in `View` for styling layout, added type annotation)

**Confirmation:** 
No Firebase security rules, Arduino Mega firmware, ESP32 firmware, hardware pin definitions, or production architecture definitions were modified during the latest software stabilization. The established RTDB architecture remains perfectly intact.

## 2. HARDWARE VERIFICATION STATUS

**5B.15 STATUS: BLOCKED — PHYSICAL PROTOTYPE NOT CURRENTLY ACCESSIBLE**

It is critical to distinguish the current validation boundaries:
- **Verified by Source Inspection:** Pin definitions, software safety interlocking, UI states.
- **Verified by Automated Test:** Firebase RTDB access control, mobile-app remote command dispatching.
- **Verified by Simulator:** UART command lifecycle (queued → acknowledged → completed/failed), RTDB state updates.
- **NOT Physically Verified (REQUIRES HARDWARE):** Actual pin-to-wire correspondence, electrical continuity, actuator safety, sensor calibration, real UART cross-talk.

## 3. PIN/WIRING VALIDATION

The existing software pin configuration in `Config.ino` is preserved as the absolute reference. Do not change any pins based on assumptions.

The following require strict physical verification once the prototype is returned:
- **HX711:** DOUT (Mega 30), SCK (Mega 31)
- **Ultrasonic:** TRIG (Mega 32), ECHO (Mega 33)
- **Float Switches:** WATER_LOW (Mega 34), WATER_HIGH (Mega 35)
- **Relays:** PUMP_RELAY (Mega 36), DISPENSER_RELAY (Mega 37)
- **Safety:** E_STOP (Mega 38), BUZZER (Mega 39)
- **SPI:** SD_CS (Mega 53), SD card SPI lines
- **I2C:** RTC SDA (Mega 20), SCL (Mega 21)
- **UART (Mega ↔ ESP32):** Mega Serial1 RX1 (19) / TX1 (18) ↔ ESP32 UART TX / RX
- **UART (Mega ↔ Nextion):** Mega Serial2 RX2 (17) / TX2 (16) ↔ Nextion TX / RX
- **Power:** +5V, +12V, and common ground connections.

## 4. PHYSICAL VALIDATION REQUIREMENT

Software compilation and simulator tests CANNOT prove:
- Actual pin-to-wire correspondence.
- Sensor readings (load-cell calibration factors, ultrasonic noise, float switch bounce).
- Relay activation (NO/NC wiring correctness).
- Actual water pump and dispenser motor operation.
- Physical Emergency-Stop behavioral overrides (hardware interruption vs software polling).
- Buzzer operation (audibility and wiring).
- Nextion HMI physical communication.
- RTC battery backup operation and physical I2C presence.
- SD-card SPI operation and module presence.
- True electrical ESP32 ↔ Mega physical UART communication (logic levels, common ground).
- Power-rail correctness (buck converter outputs, battery polarity).
- Actuator safety under load.

## 5. NEXT HARDWARE PHASE (MASTER CHECKLIST)

This exact checklist must be executed once the prototype is returned from the fabrication company. 
**Do not execute or simulate these tests now.**

### IMPORTANT SAFETY RULE
**Do not energize the system or actuators blindly.** Before actuator testing, you MUST verify common ground, supply voltage, polarity, relay wiring, emergency-stop behavior, and safe actuator states. **Do not bypass the physical E-stop.**

---

### PHASE 1 — Pin and Wiring Verification
- **Physically check:** Trace every wire from the Mega/ESP32 headers to the components.
- **Power:** OFF
- **Multimeter Required:** No (visual inspection).
- **Actuator Involved:** No.
- **Expected Result:** Physical pins exactly match `Config.ino`.
- **Pass/Fail:** PASS if 100% matched, FAIL if any discrepancy.
- **Evidence:** High-resolution photographs of wire harnesses and headers.

### PHASE 2 — Power and Ground Verification
- **Physically check:** Ground continuity between all modules. Supply polarity. 5V and 12V rails.
- **Power:** OFF (for continuity), then Main Power ON (controllers DISCONNECTED) for voltage check.
- **Multimeter Required:** YES.
- **Actuator Involved:** No.
- **Expected Result:** Near 0Ω on all grounds. Exactly 5.0V on 5V rails, 12V on 12V rails.
- **Pass/Fail:** PASS if voltages are stable and grounds are common.
- **Evidence:** Multimeter readings recorded in documentation.

### PHASE 3 — Mega/ESP32 UART Verification
- **Physically check:** Mega TX1 goes to ESP32 RX. Mega RX1 goes to ESP32 TX.
- **Power:** ON (Actuators DISCONNECTED).
- **Multimeter Required:** No.
- **Actuator Involved:** No.
- **Expected Result:** Mega and ESP32 boot without errors. Serial monitors show `DATA|` and `TIME|` packets flowing bidirectionally.
- **Pass/Fail:** PASS if packets parse successfully without garbage characters.
- **Evidence:** Serial monitor logs from both Mega and ESP32.

### PHASE 4 — Sensor Verification
- **Physically check:** Ultrasonic distance, Float switches, HX711 load cell calibration.
- **Power:** ON.
- **Multimeter Required:** No.
- **Actuator Involved:** No.
- **Expected Result:** Floating the switch toggles the state. Placing a known mass (e.g., 1000g) allows calculation of the exact `LOAD_CELL_CALIBRATION_FACTOR`.
- **Pass/Fail:** PASS if raw readings are stable and respond logically to physical changes.
- **Evidence:** Recorded raw zero value, calibration mass value, and calculated factor.

### PHASE 5 — Actuator/Relay Verification
- **Physically check:** Relays are wired Normally Open (NO). Relays click when commanded.
- **Power:** ON.
- **Multimeter Required:** YES (to verify continuity across relay output when triggered).
- **Actuator Involved:** YES (but physically disconnected from power, testing relay only).
- **Expected Result:** Relays sit open (OFF) at boot. Relays close (ON) only when explicitly commanded.
- **Pass/Fail:** PASS if relays default to safe states.
- **Evidence:** Audible click observation and multimeter continuity across relay outputs.

### PHASE 6 — Emergency Stop and Safety Verification
- **Physically check:** Pressing E-Stop hardware button.
- **Power:** ON.
- **Multimeter Required:** No.
- **Actuator Involved:** YES.
- **Expected Result:** Mega registers `emergencyStopActive`. All relays immediately drop to LOW (OFF). Remote `MANUAL_FEED` or `ESTOP_RELEASE` commands are strictly rejected.
- **Pass/Fail:** PASS if the system physically refuses to actuate while the button is pressed.
- **Evidence:** Serial monitor logs showing command rejection and E-stop state.

### PHASE 7 — RTC/SD/Nextion Verification
- **Physically check:** SD card logs creation. RTC time retention. Nextion screen updates.
- **Power:** ON (then OFF/ON for RTC check).
- **Multimeter Required:** No.
- **Actuator Involved:** No.
- **Expected Result:** Time is retained through power cycle. SD card contains `SYSTEM_START` log. Nextion shows UI elements.
- **Pass/Fail:** PASS if all peripherals initialize and retain data.
- **Evidence:** SD card text file extract, photograph of Nextion screen.

### PHASE 8 — Local Feeding/Water Functional Test
- **Physically check:** A full feeding cycle and water pump cycle.
- **Power:** ON (Actuators CONNECTED).
- **Multimeter Required:** No.
- **Actuator Involved:** YES.
- **Expected Result:** Motor spins, feed dispenses. Load cell measures increasing weight. Motor stops exactly at target weight.
- **Pass/Fail:** PASS if the loop closes automatically without overfeeding.
- **Evidence:** Video of the mechanism stopping at the correct threshold.

### PHASE 9 — Wi-Fi/RTDB/Mobile Remote Command Test
- **Physically check:** Issuing a `MANUAL_FEED` from the React Native app to the physical device.
- **Power:** ON.
- **Multimeter Required:** No.
- **Actuator Involved:** YES.
- **Expected Result:** App sends command -> RTDB -> ESP32 -> Mega -> Actuator turns on. RTDB reflects `executing`. Actuator finishes. RTDB reflects `completed`.
- **Pass/Fail:** PASS if the physical actuator exactly mirrors the mobile app's requested lifecycle.
- **Evidence:** Screen recording of mobile app side-by-side with physical actuator movement.
