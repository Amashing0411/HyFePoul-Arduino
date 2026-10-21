# HARDWARE COMMISSIONING PROCEDURE

This document defines the strict sequential procedure to validate the physical prototype upon arrival (Expected: October 30, 2026).

**IMPORTANT SAFETY RULE**: DO NOT assume software pin assignments match physical wiring. DO NOT energize unverified circuits.

## 1. Electrical / Logic-Level Readiness Checklist

Before applying any power, inspect the physical circuit board and wiring:
- [ ] **Mega 5V logic** vs **ESP32 3.3V logic**: ⚠️ **CRITICAL FLAG**: Is there a physical level shifter (or resistor divider) on the UART RX/TX lines between the Mega (5V) and ESP32 (3.3V)? If a 5V Mega TX connects directly to the 3.3V ESP32 RX without protection, it may damage the ESP32.
- [ ] **Common Ground**: Verify continuity between the Mega GND, ESP32 GND, Relay GND, and Sensor GNDs.
- [ ] **Sensor Voltage**: Verify if the ultrasonic and HX711 are powered by 5V or 3.3V, and if their data lines match the Mega's 5V input tolerance.
- [ ] **Relay Input Voltage**: Confirm the relay coil/opto-isolator is compatible with the Mega's 5V output.
- [ ] **Nextion UART Voltage**: Verify if the Nextion RX is 5V tolerant.
- [ ] **RTC / SD Interface**: Confirm physical wiring to I2C/SPI pins.

## 2. Power System Readiness Checklist

DO NOT assume voltages based on component markings without measuring.
- [ ] 1. Source voltage (Solar/Grid input) measured.
- [ ] 2. Battery voltage (12V 12Ah) measured.
- [ ] 3. DC-DC Buck converter outputs measured (verify exact output before connecting logic boards).
- [ ] 4. Mega supply voltage measured (Expected: ~5V or 7-12V on VIN).
- [ ] 5. ESP32 supply voltage measured (Expected: 3.3V or 5V on VIN).
- [ ] 6. Sensor supplies measured.
- [ ] 7. Relay board supply measured (Expected: 5V or 12V).
- [ ] 8. Pump supply measured (Expected: 12V).
- [ ] 9. Dispenser motor supply measured (Expected: 12V).
- [ ] 10. Common ground integrity verified.
- [ ] 11. Fuses / overcurrent protection inspected.
- [ ] 12. Wiring polarity verified (VCC/GND not swapped).

## 3. Safe First-Power Procedure

1. **Visual Inspection**: Look for exposed conductors, loose strands, or obvious shorts.
2. **Cold Continuity Test**: With POWER OFF, check for shorts between VCC rails and GND.
3. **Disconnect High-Power Loads**: Disconnect the pump and dispenser motor completely.
4. **Logic First**: Power only the logic electronics (Mega, ESP32, sensors).
5. **Verify Boot**: Observe status LEDs on the Mega and ESP32.
6. **Observe Relays**: Ensure relays do NOT click (energize) during boot. 

**STOP CONDITIONS**: Immediately disconnect power if:
- Unexpected voltage on logic rails.
- Short circuit detected.
- Reversed polarity discovered.
- Overheating components.
- Smoke or smell of burning.
- Abnormal current draw.
- Unexpected relay activation upon boot.
- E-Stop does not physically interrupt power as designed.
- Exposed conductors are found.

## 4. Mega Commissioning Procedure

| Step | Setup | Action | Expected Result | Pass Criteria | Fail Criteria | Evidence |
|---|---|---|---|---|---|---|
| 1 | Mega powered | Apply 5V | Mega power LED illuminates | LED is ON and stable | LED blinks erratically / no power | Photo of LED |
| 2 | Serial Monitor | Boot Mega | Serial prints "HyFePoul Arduino Mega Starting" | Text is readable at 115200 baud | Garbled text or no output | Serial log |
| 3 | Boot complete | Observe Relay LEDs | Relays remain OFF | Relay LEDs OFF, no click | Relay clicks ON at boot | Visual/Auditory observation |
| 4 | Safe Idle | Press E-Stop | Serial prints "Emergency Stop Active!" | Software registers E-Stop | Software ignores E-Stop | Serial log |
| 5 | E-Stop active | Observe Buzzer | Buzzer activates | Buzzer sounds continuously | Buzzer silent | Video/Audio |
| 6 | RTC connected | Boot Mega | RTC initializes with valid time | "RTC initialized" in log | "Couldn't find RTC" | Serial log |
| 7 | SD connected | Boot Mega | SD initializes | "SD Card initialized" | "SD initialization failed" | Serial log |
| 8 | HX711 connected | Check Serial | Weight outputs | Stable non-zero raw value | Value is constant 0 or NaN | Serial log |
| 9 | Ultrasonic | Move hand | Distance changes | Distance correlates with hand | Distance frozen | Serial log |
| 10 | Water LOW Float | Move float | Value toggles | State changes 1 -> 0 | No change | Serial log |
| 11 | Water HIGH Float| Move float | Value toggles | State changes 1 -> 0 | No change | Serial log |
| 12 | NO LOADS ATTACHED | Send Manual Feed via ESP (sim) | Dispenser Relay clicks | Relay LED ON, clicks | No relay action | Visual/Auditory |
| 13 | Nextion connected | Boot Mega | Screen shows UI | UI matches Mega state | Screen blank / timeout | Photo |
| 14 | Schedule Set | Wait for schedule | Auto feed triggers | Relay clicks at exact time | Missed schedule | Serial log |

## 5. ESP32 Commissioning Procedure

1. Verify ESP32 powers correctly (LED on).
2. Firmware boots (Serial prints "HyFePoul ESP32 Bridge Starting").
3. Wi-Fi connects successfully.
4. NTP synchronizes time.
5. Firebase authenticates successfully.
6. RTDB connectivity confirmed (no connection errors).
7. UART connection to Mega established (no timeouts).
8. `DATA` packets received from Mega.
9. `EVENT` packets received from Mega.
10. `TIME` packets sent to Mega.
11. `HEARTBEAT` pushes to RTDB successfully.
12. RTDB command polling executes successfully.
13. `CMD` transmitted to Mega successfully.
14. `CMD_ACK` received from Mega.
15. `CMD_DONE` received from Mega.
16. **Auth with real Firebase (F27):** the serial log shows `Auth successful. UID: <uid>` and the UID matches `devices/device-001/deviceAuthUid`, followed by successful state writes (no `Failed to write state, code: 401`).
17. **TLS verification:** with the production config, auth and RTDB requests succeed (certificate accepted by the built-in CA bundle). Optional negative test: point the ESP32 at a network with an HTTPS-intercepting proxy, and confirm requests **fail** rather than succeed.
18. **Wi-Fi loss:** switch the access point off for at least 60 s. The ESP32 must keep running (no reboot loop), the Mega shows `OFFLINE` within about 15 s, and local feeding and hydration continue. Switch it back on: the ESP32 logs `WiFi connected`, signs in again if needed, sends `STATUS|ONLINE`, and logs `Schedule restore complete.`
19. **Boot without Wi-Fi:** power the ESP32 with the access point off. It must start, send `STATUS|OFFLINE` to the Mega, and connect later when the access point comes back.
20. **UART line length:** confirm no `UART line too long` or `LINE_TOO_LONG` appears during normal app use.
21. **Core Debug Level:** confirm the build uses **None** (no `#warning … ID token` during compile), so request URLs containing the token are never logged.

## 6. Physical E-Stop Verification

**Goal:** Distinguish software detection from actual electrical cutoff.
1. Put system in safe idle state.
2. Verify physical E-Stop mechanism (latching vs momentary).
3. Start a controlled actuator test (e.g., pump running without water).
4. Activate the physical E-Stop.
5. **Verify actuator de-energizes instantly** (physical cutoff confirmation).
6. Verify Mega detects the E-Stop state via GPIO.
7. Verify relay driver software sets output to LOW.
8. Verify attempting a remote `MANUAL_FEED` returns `failed` (`ESTOP_ACTIVE`).
9. Verify sending `ESTOP_RELEASE` via software does NOT re-energize the actuator (physical unlatching required).
10. Verify system recovers safely only after physical unlatch and software release.
11. Release the physical E-Stop **without** sending a reset. Verify the Mega stays stopped (Nextion shows `STOPPED`, pump does not start even with the low float active, `MANUAL_FEED` still returns `ESTOP_ACTIVE`).
12. With the button released, type `RESET` in the Mega USB serial monitor (115200 baud). Verify `Emergency stop reset.` is printed and automation resumes. Repeat with the button pressed and verify `RESET rejected: PHYSICAL_ESTOP_ENGAGED`.
13. Start a remote `MANUAL_FEED`, then press the E-Stop mid-feed. Verify the command ends as `failed` with `ESTOP_ACTIVE`, and that a following `STATUS_REQ` completes (not rejected as `SYSTEM_BUSY`).
14. Hold the low float switch active with the pump outlet disconnected for more than 120 s. Verify the pump stops at the timeout, does **not** restart, `WATER_PUMP_TIMEOUT` and `LOW_WATER` alerts appear once, and the fault clears only when the high float is reached or the E-Stop is reset.

## 7. Relay / Actuator Commissioning

For both the Pump and Dispenser motor:
1. Determine Relay active state: Does `digitalWrite(HIGH)` close the circuit?
2. Determine NO/NC behavior: Are loads wired to Normally Open (NO)?
3. Verify startup behavior: Disconnect load, boot Mega, ensure NO contacts do not close.
4. Test Load: Connect pump/motor. Send command for short 3-second burst.
5. Observe: Expected state vs actual state, actuator response, abnormal noise/heat.
6. Verify Safety Timeout: Trigger pump, wait for 120s timeout, ensure it cuts off automatically.

## 8. Sensor Commissioning

**Load Cell / HX711**: Verify wiring (E+/E-/A+/A-). Ensure zero reading is stable. Place a known weight (e.g., 500g). Calculate actual calibration factor. DO NOT use the source code placeholder (`-7050.0f`).
**Ultrasonic**: Verify trigger/echo. Measure physical distances for Hopper Empty / Hopper Full. Update source code limits to match reality.
**Water Floats**: Verify physical installation orientation. Determine if floating UP is logically HIGH or LOW. Update code to match actual physics.

## 9. RTC / SD / Nextion

**RTC**: Verify initial time, check if NTP sync from ESP32 successfully overwrites RTC time. Unplug ESP32, verify RTC maintains time.
**SD**: Verify card detection. Trigger a system event, pull SD card, read on PC to confirm log integrity.
**Nextion**: Verify boot and baud rate. Verify feed/water data mirrors Mega state. Disconnect UART, verify screen handles timeout gracefully.

**Nextion buttons (R-20)**: the Stop (`b3`) and Start (`b4`) buttons are disabled in firmware until their IDs are confirmed.
1. In the Nextion Editor, tick **Send Component ID** on the Touch Release Event of `b3` and `b4`, and upload the HMI.
2. With the Mega USB serial monitor open (115200), press `b3` and then `b4`. Note the `Nextion touch: page P id C` lines.
3. Set `NEXTION_HOME_PAGE_ID`, `NEXTION_STOP_BUTTON_ID` and `NEXTION_START_BUTTON_ID` at the top of `Nextion.ino` to those numbers, then re-flash.
4. Verify that `b3` latches the stop (actuators off, `STOPPED` shown, `EMERGENCY_STOP` alert) and that `b4` shows `Status: RELEASE E-STOP` while the physical button is pressed and resets the latch once it is released.
5. Confirm that other buttons (`b0`–`b2`) and other pages do not stop or reset anything.

**Schedule persistence (Phase 3)**:
1. Set a schedule from the app (ESP32 connected), then disconnect the ESP32 UART wires, power-cycle the Mega, and verify the serial log shows `Schedules loaded from EEPROM.` and that the schedule still fires at its set local time.
2. On a Mega with blank EEPROM, verify `No valid schedules in EEPROM; using defaults.`
3. With the ESP32 connected and online, change a schedule in the app, power-cycle only the Mega, and verify the ESP32 log shows `Schedule restore complete.` and that the Mega slots match the app (including deleted slots staying disabled).
4. Delete all schedules in the app, power-cycle the Mega, and verify that no feed happens at 07:00, 12:00 or 18:00.
5. **UART line integrity (F26):** send 20 schedule edits from the app while the Mega is idle and 10 while feeding. Record how many `SCHEDULE_SET` commands end in `UART_TIMEOUT`, and confirm each one is followed by `Schedule restore complete.`

## 10. Software/Hardware Discrepancy Procedure

If the physical hardware behaves differently than the software assumes, DO NOT blindly modify firmware to bypass the test.

Classify discrepancy as:
A. Software assumption incorrect
B. Fabrication/wiring incorrect
C. Component specification differs
D. Documentation incorrect
E. Hardware design intentionally changed
F. Unknown (Requires investigation)

Record in `hardware-commissioning-log.md`:
* Expected vs Observed
* Evidence (e.g., Multimeter reads 3.3V instead of 5V)
* Likely Source
* Required Correction
* Person Responsible
* Retest Required

## 11. Full E2E System Commissioning

Test the entire data pipeline:
1. Trigger physical sensor (e.g., push water float down).
2. Mega processes state change.
3. Mega transmits `DATA` over UART.
4. ESP32 parses `DATA` and pushes to RTDB `/state`.
5. Mobile App listener detects RTDB change and updates UI.

Test the entire command pipeline:
1. Mobile App creates `MANUAL_FEED` command in RTDB.
2. ESP32 polls RTDB and pulls command.
3. ESP32 transmits `CMD` over UART.
4. Mega validates safety, activates relay.
5. Mega transmits `CMD_ACK` then `CMD_DONE`.
6. ESP32 pushes updates to RTDB.
7. Mobile UI shows "Completed".

## 12. Evidence Requirements

During commissioning, collect:
- Wiring photos (especially Mega-ESP32 UART).
- Multimeter measurements of supply rails.
- Component labels/datasheets.
- Serial logs demonstrating E2E data flow.
- Screenshots of the Mobile App receiving real-time states.
- Exact calculated calibration values (HX711 factor, ultrasonic cm thresholds).
