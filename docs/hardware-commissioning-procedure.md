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
- [ ] 8. Chain motor supply measured (Expected: 12V) at both polarity relays.
- [ ] 9. Dispenser motor supply measured (Expected: 12V).
- [ ] 10. Common ground integrity verified.
- [ ] 11. Fuses / overcurrent protection inspected.
- [ ] 12. Wiring polarity verified (VCC/GND not swapped).

## 3. Safe First-Power Procedure

1. **Visual Inspection**: Look for exposed conductors, loose strands, or obvious shorts.
2. **Cold Continuity Test**: With POWER OFF, check for shorts between VCC rails and GND.
3. **Disconnect High-Power Loads**: Disconnect the chain motor and dispenser motor completely.
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
| 8 | 5 HX711 connected | Boot Mega | `HX711 tray N ready.` for N = 1–5 | All 5 ready; tray weights stable in `DATA` | `WARNING not detected` for any tray | Serial log |
| 9 | Ultrasonic | Move hand | Distance changes | Distance correlates with hand | Distance frozen | Serial log |
| 10 | Reservoir Float | Move float, hold ≥ 2 s | `waterLow` toggles | `LOW WATER: refill the reservoir.` + beep once | No change / repeated beeps | Serial log |
| 11 | Limit switches | Press home, then end switch by hand | Pin reads LOW while pressed | Chain refuses to drive into a pressed switch | No change | Serial log |
| 12 | NO LOADS ATTACHED | Send Manual Feed via ESP (sim) | `FEED STEP:` lines; chain relays then dispenser relay click in order | Forward and reverse relay LEDs never lit together | Both relay LEDs lit / no relay action | Visual/Serial |
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
3. Start a controlled actuator test (e.g., a feed cycle with the chain unloaded).
4. Activate the physical E-Stop.
5. **Verify actuator de-energizes instantly** (physical cutoff confirmation).
6. Verify Mega detects the E-Stop state via GPIO.
7. Verify relay driver software sets output to LOW.
8. Verify attempting a remote `MANUAL_FEED` returns `failed` (`ESTOP_ACTIVE`).
9. Verify sending `ESTOP_RELEASE` via software does NOT re-energize the actuator (physical unlatching required).
10. Verify system recovers safely only after physical unlatch and software release.
11. Release the physical E-Stop **without** sending a reset. Verify the Mega stays stopped (Nextion shows `STOPPED`, the chain and dispenser stay off, `MANUAL_FEED` still returns `ESTOP_ACTIVE`).
12. With the button released, type `RESET` in the Mega USB serial monitor (115200 baud). Verify `Emergency stop reset.` is printed and automation resumes. Repeat with the button pressed and verify `RESET rejected: PHYSICAL_ESTOP_ENGAGED`.
13. Start a remote `MANUAL_FEED`, then press the E-Stop mid-feed. Verify the command ends as `failed` with `ESTOP_ACTIVE`, and that a following `STATUS_REQ` completes (not rejected as `SYSTEM_BUSY`).
14. Press the E-Stop while the chain is moving between trays. Verify the chain and dispenser stop at once, and that after reset the next cycle starts by homing (`FEED STEP: HOMING`).

## 7. Relay / Actuator Commissioning

For the chain forward relay, chain reverse relay and dispenser relay:
1. Determine Relay active state: Does `digitalWrite(HIGH)` close the circuit?
2. Determine NO/NC behavior: Are loads wired to Normally Open (NO)?
3. Verify startup behavior: Disconnect load, boot Mega, ensure NO contacts do not close.
4. Test Load: Connect the motor. Run a short supervised move or dispense.
5. Observe: Expected state vs actual state, actuator response, abnormal noise/heat.

Chain motor (two relays swapping polarity):
6. Confirm the wiring cannot short the supply if both relays close (typical 2× SPDT H-bridge: both on = motor braked, not shorted). The firmware never turns both on, but the wiring should be safe anyway.
7. With the hopper unloaded, verify forward moves toward the end switch and reverse toward home. Swap the motor leads if not.
8. Run toward each limit switch and confirm the switch stops the motor. Request a reversal while moving and confirm both relays are off for ≥ 300 ms before the other closes.
9. Disconnect the end switch and run a cycle: after the last tray the chain must stop within 15 s with `CHAIN_TIMEOUT` and a beep.
10. Tune `TRAY_TRAVEL_MS` (open item O-1) so the hopper outlet stops over each tray; record the values in the commissioning log. Use the bench console (§7a).

## 7a. Bench Console (USB serial monitor)

The Mega firmware has commissioning commands on the USB serial monitor (115200 baud, line ending "Newline"). Type `HELP` for the list. Motor commands are refused while the E-stop is latched, while a feed cycle runs, or while another bench move is active. They stop at once on the E-stop or `STOP`, and they go through the normal chain driver, so the relay interlock, dead time and limit switches still apply. A feed cycle (scheduled or from the app) cannot start during a bench move.

| Command | Use |
|---------|-----|
| `STATUS` | E-stop button and latch, home/end switches, reservoir float, hopper distance and %, chain, dispenser, cycle step, tray weights |
| `WEIGH` | All 5 trays: grams, raw counts and current factor (about 1 s) |
| `TARE <1-5\|ALL>` | Zero a tray (empty tray on its load cell) |
| `CAL <1-5> <grams>` | After `TARE`, with a known weight on the tray: computes and applies that tray's factor (until reboot) |
| `FACTORS` | Prints the factors as a `Config.ino` line to paste in |
| `JOG <F\|R> <ms>` | Runs the chain 100–5000 ms and reports how long it actually ran (or that a limit switch stopped it) |
| `HOME` | Reverses to the home switch and reports the time (30 s timeout) |
| `DISP <ms>` | Runs the dispenser 100–5000 ms (flow-rate check) |
| `FEED <grams>` | Starts a full 5-tray cycle at that many grams per tray, without the app |
| `STOP` | Ends a bench move at once |
| `WDTEST` | Stops the program on purpose (only while nothing moves). The Mega must restart within about 2 s and print "Restarted by the watchdog". If it keeps restarting or hangs, burn the current Arduino Mega bootloader before relying on the watchdog |
| `RESET` | Clears a latched E-stop (button released) |

**Calibrating the tray load cells (R-11, HIT-08):**
1. Empty all trays. `TARE ALL`.
2. For each tray: put a known weight on it (for example 500 g), type `CAL <tray> 500`, remove the weight. `TARE <tray>` again if the empty reading drifts.
3. `WEIGH` with known weights on several trays to check the accuracy; repeat `CAL` if needed.
4. `FACTORS`, then paste the printed line over `LOAD_CELL_CALIBRATION_FACTORS` in `Config.ino`, rebuild and flash. Record the values in the commissioning log.

**Timing the travel to each tray (R-46, O-1):**
1. Chain unloaded first, hand on the E-stop. `HOME`.
2. `JOG F <ms>`, starting with the current `TRAY_TRAVEL_MS[0]` (3000 ms). Check where the hopper outlet stops relative to tray 1. `HOME` and adjust until it stops over the tray.
3. From tray 1, find the time to tray 2 the same way (each `TRAY_TRAVEL_MS` entry is measured from the previous stop), then trays 3–5.
4. From tray 5, `JOG F 5000` and note whether the end switch is reached (`Limit switch reached after … ms`); that confirms the end timeout (15 s) is generous.
5. Put the values in `TRAY_TRAVEL_MS`, rebuild, flash, then `FEED 20` and check the hopper stops over every tray.

## 8. Sensor Commissioning

**Tray Load Cells / 5 HX711**: For each tray verify wiring (E+/E-/A+/A-). Ensure zero reading is stable. Place a known weight (e.g., 50 g and 500 g). Calculate that tray's calibration factor (`LOAD_CELL_CALIBRATION_FACTORS[i]`). DO NOT use the source code placeholder (`-7050.0f`). Confirm the 5 boards on the shared SCK each read correctly.
**Ultrasonic**: Verify trigger/echo. Measure physical distances for Hopper Empty / Hopper Full. Update source code limits to match reality.
**Reservoir Float**: Verify physical installation orientation. Determine whether a low reservoir reads LOW (assumed) or HIGH. Update `isWaterLow()` to match.
**Limit Switches**: Decide NO or NC (NC is fail-safe: a broken wire reads as pressed). Update `isHomeSwitchPressed()` / `isEndSwitchPressed()` to match.

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
