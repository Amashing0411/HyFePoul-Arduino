# HyFePoul: Hardware Integration Test Plan

**As of:** 2026-10-28 (moving-hopper revision: chain motor, 5 trays with load cells, gravity water, no pump). **Prototype status: not yet available for testing**, so every physical test below is `BLOCKED`.

This plan lists the physical checks the prototype must pass. Step-by-step instructions for each area are in [`hardware-commissioning-procedure.md`](hardware-commissioning-procedure.md), referenced as "Proc. §x". Record results here, and add raw evidence (photos, serial logs, meter readings) to [`hardware-commissioning-log.md`](hardware-commissioning-log.md).

## 1. Simulation vs physical verification

| Behaviour | Already shown in simulation / emulators | Still needs physical evidence |
|-----------|------------------------------------------|-------------------------------|
| 5-tray feed cycle, relay interlock and dead time, limit switches, chain/tray timeouts, empty hopper, E-stop latch, water alert, alert queue, local time, HMI History request/refresh and app-synced schedule display | Mega simulator (56 tests, modelled chain position and tray scales); both firmware targets compile; Nextion Editor compile | Real timing, Firebase read permission, sensors, relays, chain and dispenser motors |
| EEPROM persistence | Byte-for-byte JS mirror | Real EEPROM across a power cycle |
| UART protocol and 64-byte line limit | JS mirrors of both parsers | Real buffers, timing, level shifting, noise |
| ESP32 sign-in, TLS, RTDB writes, restore | Firmware compile-checked; existing simulator results are recorded in prior QA. The new HMI History REST query could not be run because the local Firebase Auth/RTDB emulators would not start. | Validate the History query and scoped read rule after the emulator issue is fixed; then check token size (F27), certificate chain and Wi-Fi on the device |
| Rules and app | Existing app/rules QA remains in earlier records. New coverage for device-only History access was added, but not run: Firebase CLI reported “No emulators to start.” The scoped `systemData/{deviceId}` read rule is in source and is not deployed to production. | Run the new rules/ESP32 checks; deploy the scoped rule with authorization; then verify History on a physical phone and panel against production |
| Calibration | none | All of it |
| E-stop electrical isolation | none (software only) | All of it |

**Rule:** a row may be marked `PASS` only with **measured evidence** (reading, log excerpt, photo or video). Simulator results never count as a hardware pass.

### 1.1 Claude's six checks mapped to current evidence

The six-item list is a useful summary, but it mixes software checks with physical commissioning. Mega simulation and firmware/HMI compile checks are complete as noted; the new Firebase History permission/query emulator check is blocked because the local emulators would not start. Physical evidence is still required wherever stated.

| Check | Current result | What remains |
|---|---|---|
| Send simulated/test data | **Mega-side software simulation passed (56/56).** It covers the HMI History request, newest-first formatting, Refresh and schedule overview. The new ESP32 RTDB History query was not validated against Firebase because the local emulators did not start. | No physical pass is implied. HIT-04, HIT-12 and HIT-15 verify the hardware-to-app path later. |
| Use actual Arduino-generated data when available | **Blocked until the prototype session.** | Capture one Mega `DATA` line, confirm the ESP32 accepted and wrote it to RTDB, and match the same readings in the app. Record the serial excerpt and screen evidence. HIT-04, HIT-15. |
| Check serial communication reliability | **Protocol behavior simulated; physical reliability unverified.** | With level shifting installed, observe repeated Mega↔ESP32 messages, recovery after disconnect, and absence of `UART_TIMEOUT` / `LINE_TOO_LONG` during the schedule-edit check. HIT-01, HIT-04, HIT-05, HIT-14. |
| Arduino↔Nextion integration | **Source mapping, Mega-side History formatting/request simulation (56/56), schedule overview mapping and Nextion Editor compile (0 errors/warnings) passed.** The Home button reads History; app-configured schedule time, target and enabled state are displayed. | HIT-12: verify physical baud, UART levels/wiring, panel display and touch, app-to-HMI History parity after the scoped Firebase read rule is deployed, schedule values, EEPROM persistence, Stop and guarded Reset Stop. Onsite schedule edits remain EEPROM-only (R-54). |
| ESP32 integration | **Firmware compile-checked.** The new History REST request could not be emulator-tested because Firebase CLI reports “No emulators to start”; physical operation is unverified. | After the emulator issue is resolved, test the own-device RTDB read and denied cross-device read. Then flash and verify device-account sign-in, TLS, heartbeat, state/history writes, UART behavior and Wi-Fi recovery. HIT-03, HIT-04, HIT-12, HIT-14. |
| Backend integration | **Partial.** Existing device provisioning and prior backend checks are recorded in earlier QA. The new scoped device read rule and its test are in source but emulator validation is blocked, and the rule is not deployed. | Run rules tests, deploy only with authorization, then verify ESP32 History reads and compare phone/panel records on production. HIT-03, HIT-12, HIT-15. |

### 1.2 Suggested order for the prototype session

Use the numbered HIT sequence as the safety gate: start with wiring and power checks (HIT-01–02), then bring up the ESP32 and prove the serial path (HIT-03–05), check the E-stop circuit before supervised actuators (HIT-06–07, HIT-11), calibrate sensors and verify the display (HIT-08–10, HIT-12), and only then test schedules, recovery and the complete feeding cycle (HIT-13–16). Stop at the first failed prerequisite; record the observation and corrective action before continuing. Do not connect or run motors before the stated HIT-01–05 prerequisites pass. The single-session sequence, credentials preflight, stop gates, and completion definitions are consolidated in the [hardware test-day run sheet](hardware-test-day-run-sheet.md).

## 2. Safety rules for every session

1. Follow logic first, actuators last (Proc. §3). Do not connect the chain or dispenser motor until HIT-01 to HIT-05 pass. For the first chain runs, keep the chain free of the hopper load and a hand on the E-stop.
2. Never energise an incomplete system. Check rails, grounds and fuses first.
3. Keep the physical E-stop within reach whenever actuators are powered.
4. Keep the ESP32 Core Debug Level at **None**. At higher levels the serial log would include the Firebase token.
5. Do not change calibration constants or pin assumptions based on guesses. Change them only from measurements recorded here.

## 3. Test matrix

Columns follow the audit brief: **ID · Preconditions · Procedure · Expected · Actual · Status · Evidence · Discrepancy / corrective action**.

| ID | Preconditions | Procedure | Expected | Actual | Status | Evidence | Discrepancy / corrective action |
|----|---------------|-----------|----------|--------|--------|----------|--------------------------------|
| **HIT-01** Electrical readiness | Prototype assembled; nothing powered | Check wiring against `Config.ino` pins and `hardware-assumption-matrix.md`. Measure rails, grounds and fuses. Confirm the **5 V Mega TX → 3.3 V ESP32 RX level shifter or divider** (Proc. §1–2) | Every pin matches; rails within tolerance; level shifting present | | BLOCKED | | |
| **HIT-02** Mega first power, actuators disconnected | HIT-01 PASS; relays not connected to loads | Power the Mega; read serial at 115200 (Proc. §3–4). Check RTC (no `WARNING: RTC not detected.` or `WARNING: RTC lost power.`), SD (`SD card ready.`, current `HFyyyymm.CSV` log), and `Schedules loaded from EEPROM.` or `…using defaults.` | Boot banner; RTC valid; SD log rows written; relays stay OFF | | BLOCKED | | |
| **HIT-03** ESP32 boot, sign-in, TLS | Production `Config.h`; device provisioned (R-14) | Boot with Wi-Fi available (Proc. §5 steps 1–6, 16–17). Then boot with Wi-Fi off and turn it on later (step 19) | `WiFi connected`, `Auth successful. UID: <uid>` matching `deviceAuthUid`, `lastHeartbeat` updating, no 401s. Boot without Wi-Fi does not hang. An intercepted HTTPS connection fails | | BLOCKED | | |
| **HIT-04** UART link | HIT-02, HIT-03 PASS; level shifting in place | Watch both serial logs (Proc. §5 steps 7–10) | Mega shows `ESP32 RX: STATUS|ONLINE` every ~10 s and `TIME|…`; ESP32 shows `Mega TX: DATA|…` every 10 s; Nextion and SD network status show ONLINE | | BLOCKED | | |
| **HIT-05** Commands, restore, line integrity | HIT-04 PASS; app signed in as owner | From the app: `STATUS_REQ`, a schedule edit, a manual feed (motor still disconnected, so expect a timeout). Reset the Mega and watch the restore. Send 20 schedule edits while idle and 10 while "feeding" (Proc. §9 schedule persistence step 5) | Lifecycle `queued → acknowledged → executing → completed/failed` in the app; `Schedule restore complete.` after a reset; **0** `UART_TIMEOUT` / `LINE_TOO_LONG` in normal use | | BLOCKED | | |
| **HIT-06** E-stop: software and electrical | HIT-02 PASS; a supervised actuator connected; documented safe bench method for independent relay-ON condition | Proc. §6: latch, release without reset, serial `RESET`, remote `ESTOP_RELEASE`, E-stop during a remote feed. **Separately:** under competent supervision, use the documented bench method to hold relay output ON, press the E-stop, and measure actuator power; do not jumper live contacts | Software latches and reports `ESTOP_ACTIVE`. **Electrical:** the actuator loses power with the E-stop pressed despite the relay-ON command. If no safe independent test method is available, record `BLOCKED` | | BLOCKED | | |
| **HIT-07** Chain motor, limit switches, interlock | Chain motor wired through both relays; hopper unloaded; limit switches mounted | Proc. §7: jog forward and reverse; operate each limit switch from outside the chain travel area; command an immediate reversal; isolate actuator power before disconnecting the end switch, then remove hands/tools before the timeout run | Each switch stops its direction; forward/reverse relays never on together (meter or scope on both coils) with ≥ 300 ms off between directions; missing switch → `CHAIN_TIMEOUT` + buzzer, motors off | | BLOCKED | | |
| **HIT-08** Tray load cells (×5) calibration and accuracy | 5 HX711, each on its own SCK/DT pair; known reference weights | Calibrate each tray (`hardware-calibration.md`), set `LOAD_CELL_CALIBRATION_FACTORS[i]`. Weigh 20, 50, 100 and 500 g on each tray. Check that reading one tray does not disturb the others | Every tray within the agreed tolerance; all 5 respond | | BLOCKED | | |
| **HIT-09** Hopper level (ultrasonic) | Sensor mounted | Measure empty and full distances; set `HOPPER_EMPTY_DISTANCE_CM` / `FULL`; check `LOW_FEED` at 20% or below and clearing at 25% or above | Level % tracks the real fill; alert hysteresis works | | BLOCKED | | |
| **HIT-10** Reservoir float switch | Float mounted in the reservoir | Lower and raise the water (or the float by hand); hold each state ≥ 2 s; read `waterLow` in serial or the app | Low → `LOW_WATER` once + beep; refilled → clears; ripples under 2 s ignored. Fix the polarity assumption if wrong | | BLOCKED | | |
| **HIT-11** Relays and actuators | HIT-06 PASS | Check NO/NC wiring and the active level (`Config.ino` assumes HIGH = ON) for the chain forward, chain reverse and dispenser relays. Run each motor under supervision | OFF at boot and on E-stop; ON only when commanded; the two chain relays never both ON | | BLOCKED | | |
| **HIT-12** Nextion onsite display | R-20 software checks passed; complete safe wiring review and HIT-01/HIT-02 first. For production History parity, the scoped RTDB device-read rule must also be validated and deployed. | Keep actuator loads disconnected. Confirm panel model, 9600 baud, common ground, Mega Serial2 UART and touch path. Load `Nextion/ChickenFeederV1 (1).tft` only after confirming the panel model. Navigate Home, Schedule, History (HMI page name `Log`), Feed Target and all three schedule editors. Confirm Home values, local clock and System Check. After the rule is deployed and ESP32 is online, compare the newest four HMI History rows with app Recent History; press Refresh and check newest-first order. Check empty/offline messages. Change a schedule in the app and compare time, target and enabled state on HMI. Confirm an onsite time edit is EEPROM-only (R-54). Test target +/-/Save and guarded Stop/Reset. Feed Now only after HIT-11 and direct supervision. | Physical display receives Mega values; pages and touch IDs work; History shows the same newest records as the app when backend permission is ready; app schedule values match; local edits persist; Stop and guarded reset behave safely. Record IDs, serial logs and evidence. | | BLOCKED | | |
| **HIT-13** Local scheduled feeding and persistence | HIT-08, HIT-11 PASS | Set a schedule 2 minutes ahead (local time) from the app; disconnect the ESP32; power-cycle the Mega before the time (Proc. §9 steps 1–4) | Feeds at the local time after the power cycle; deleted defaults do not feed | | BLOCKED | | |
| **HIT-14** Power and network loss | HIT-04 PASS | (a) Access point off for 60 s or more, then on (Proc. §5 step 18). (b) Unplug the ESP32. (c) Power-cycle the whole system. (d) Disconnect a sensor | (a) Mega shows OFFLINE within ~15 s, local control continues, restore after reconnect. (b) Same as (a). (c) Schedules from EEPROM, restore when online. (d) No crash; sensor failure is visible | | BLOCKED | | |
| **HIT-15** App on a physical phone against production | Development or preview build installed; owner account; device online | Sign in, claim (if not already claimed), Dashboard, Feeding (schedule and manual feed), Water, History, Notifications, Settings (see the app matrix) | All screens show live device data; command lifecycle and notifications work; offline shown within ~90 s of unplugging the ESP32 | | BLOCKED | | |
| **HIT-16** Full 5-tray feed cycle and timed travel | HIT-07, HIT-08, HIT-09 PASS; feed in the hopper | Tune `TRAY_TRAVEL_MS` until the hopper stops over each tray (open item O-1). Run 5 manual cycles at 50 g per tray; weigh each tray on an external scale. Then run one with the hopper nearly empty (O-3) and one with the dispenser outlet blocked at tray 3 | Trays filled in order 1→5 within tolerance, hopper ends at home, `CMD_DONE SUCCESS`; nearly empty → returns home, `LOW_FEED`, `HOPPER_EMPTY`; blocked → `TRAY_TIMEOUT` once, trays 4–5 still filled. Record per-tray overshoot and cycle time (O-4) | | BLOCKED | | |

## 4. Coverage of the brief's 20 commissioning steps

| Brief step | Test |
|------------|------|
| 1 Wiring vs pins · 2 Power rails, grounds, fuses · 3 Logic-level compatibility | HIT-01 |
| 4 Mega startup with actuators disconnected · 6 RTC and SD | HIT-02 |
| 5 ESP32 startup and UART | HIT-03, HIT-04 |
| 7 Nextion | HIT-12 |
| 8 Load cells | HIT-08 |
| 9 Hopper sensor | HIT-09 |
| 10 Water sensor polarity | HIT-10 |
| 11 Relay polarity and NO/NC · 12 Supervised chain and dispenser motors | HIT-11, HIT-07, HIT-16 |
| 13 E-stop software and electrical, separately | HIT-06 |
| 14 Local scheduled feeding | HIT-13, HIT-16 |
| 15 Water monitoring (reservoir float, no pump) | HIT-10 |
| 16 SD logging | HIT-02 |
| 17 Wi-Fi and Firebase reconnection | HIT-03, HIT-14 |
| 18 Live app updates · 19 Commands and truthful completion | HIT-05, HIT-15 |
| 20 Power loss, network loss, sensor fault, recovery | HIT-14 |
