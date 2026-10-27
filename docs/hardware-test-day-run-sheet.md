# HyFePoul Hardware Test-Day Run Sheet

**Planned session:** 2026-10-28, when the prototype is available

**Purpose:** Move from simulator/emulator evidence to recorded checks on the assembled prototype and production-connected phone. This is an ordered session plan, not a promise that every check will pass in one day. Stop at the first failed prerequisite and record it.

Use this with the detailed [hardware commissioning procedure](hardware-commissioning-procedure.md), the [hardware integration test matrix](hardware-integration-test-plan.md), and the [commissioning log](hardware-commissioning-log.md). The HIT matrix is the source of truth for expected results and pass/fail evidence.

## Starting state

- Production RTDB rules and the `device-001` record are provisioned. The dedicated ESP32 Auth UID is bound to `device-001`; the record is expected to remain `offline` until the device connects.
- The six-digit setup PIN is stored privately in Firebase. It is deliberately omitted here and from Git.
- The production APK is built. A temporary test-owner account is available for production QA; the actual client account is not implemented.
- A production Auth check confirmed the configured account UID matches the device binding, but sign-in with the current local `Config.h` credential returned `INVALID_LOGIN_CREDENTIALS`. The API key has been synchronized from the production app config. Wi-Fi SSID/password are still placeholders. Resolve both before HIT-03.
- Simulator and emulator checks have passed, but the prototype has not yet supplied physical evidence for HIT-01–HIT-16.

## Before powering anything

- [ ] Reconcile the failed production sign-in: make the `FIREBASE_AUTH_PASSWORD` in ignored local ESP32 `Config.h` match the dedicated device Auth account, then verify sign-in before HIT-03. Do not put the password in chat, logs, screenshots, or Git.
- [ ] Replace the Wi-Fi SSID/password placeholders and confirm `DEVICE_ID`, Firebase project, and device account in `Config.h`; keep ESP32 Core Debug Level at **None** so logs do not expose authentication tokens.
- [ ] Have the current Mega and ESP32 firmware, production APK, wiring/pin documents, a multimeter, and the required board/programming cables ready.
- [ ] Have the person responsible for the Firebase test-owner account present for the phone claim. Keep the setup PIN private.
- [ ] Set up the bench with the physical E-stop reachable. Start with actuator power disconnected. Follow the actual wiring documentation; do not infer missing pins or hardware.

If the device-account password cannot be reconciled, continue only with the safe local checks that do not depend on ESP32 authentication. Mark HIT-03 and dependent checks `BLOCKED`; do not claim that production integration passed.

## One-session sequence

| Order | Checks | Do this | Continue only when |
|---|---|---|---|
| 1. Inspect wiring and power | HIT-01 | With power off, compare wiring to the documented pin map; check rails, grounds, fuses, and relay connections. Verify the Mega 5 V TX line is level-shifted before it reaches the ESP32 3.3 V RX. | HIT-01 passes with measured evidence. Stop for any mismatch, missing level protection, short, or unexplained power reading. |
| 2. Boot the Mega safely | HIT-02 | Keep actuator loads disconnected. Power the Mega and check startup, RTC, SD logging, EEPROM schedule load, and that relays stay off. | HIT-02 passes. Any unexpected relay activation or failed safety boot is a stop. |
| 3. Authenticate the ESP32 and prove the link | HIT-03, HIT-04 | Flash the configured ESP32. Check Wi-Fi, Firebase sign-in UID, TLS, heartbeat/state writes, UART status/data exchange, and recovery when Wi-Fi is unavailable and restored. Capture redacted serial evidence. | The sign-in UID matches the provisioned device UID, writes succeed, the Mega and ESP32 exchange valid messages, and no token or password appears in logs. Otherwise stop production integration here. |
| 4. Exercise the production app path | HIT-05, then HIT-15 app claim | Install/open the production APK, sign in with the temporary test-owner account, and claim `device-001` with the privately held setup PIN only if accepting the later transfer cleanup. Verify the app account matches `ownerId`. With motors still disconnected, exercise status, schedule edit, and command lifecycle; a manual feed must fail safely rather than move an actuator. | Claim and app operations behave as expected, with no unauthorized database access or serial line errors. If the app reports a failed claim, inspect both `claimRequests/device-001` and `devices/device-001/ownerId` before retrying; do not switch accounts or loosen rules. A production claim is one-time: before the client claims later, follow the admin transfer process in the provisioning guide, including a fresh PIN and cleanup of both `ownerId` and the retained claim request. |
| 5. Verify stop and actuator protections | HIT-06, HIT-07, HIT-11 | Follow the procedure's separate software and electrical E-stop checks. Independently hold a relay output ON using only a documented, supervised bench method, press the E-stop, and measure that actuator power is removed; never jumper live contacts. If that method is unavailable, mark the check `BLOCKED`. Then run supervised unloaded chain/relay checks. Operate limit switches from outside the travel/pinch areas; isolate actuator power before disconnecting or restoring switch wiring. | The physical E-stop removes actuator power even while a relay-ON command is held; limits stop motion in the correct direction; opposing relays never energize together. Stop immediately if any condition fails or requires reaching into moving machinery. |
| 6. Check sensors and local display/logging | HIT-08–HIT-10, HIT-12 | Calibrate all five tray load cells using known weights; check hopper empty/full distances and reservoir float-switch behavior; verify RTC, SD, and Nextion values. Identify actual Nextion button IDs before enabling touch controls. | Record measured calibration values and sensor states. Do not guess constants or enable unverified controls. |
| 7. Check offline behavior and feeding logic | HIT-13, HIT-14 | Verify a saved schedule after a Mega power cycle, then test Wi-Fi loss/recovery, ESP32 disconnect/reconnect, whole-system restart, and a sensor fault. | Local safety behavior remains correct, the system reports offline/online changes truthfully, and stored schedules recover. Stop if a fault causes unsafe actuation or loss of the E-stop. |
| 8. Run the full end-to-end feed last | HIT-16, final HIT-15 review | Only after all preceding prerequisites pass, supervise a complete five-tray run with the hopper unloaded for initial motion tuning, then with feed as specified by the matrix. Check tray order, measured weights, return-to-home, empty-hopper behavior, and blocked-outlet response. Recheck the phone screens against the actual device data. | Every expected result is backed by readings, logs, photos, or video. Record discrepancies and do not call the prototype fully integrated if any required check is failed or blocked. |

## Stop, record, and resume rules

1. Do not skip a failed prerequisite to reach a later test. Keep motors disconnected until HIT-01–HIT-05 pass; do not run a full feed until the E-stop, relay, limit-switch, and sensor prerequisites pass.
2. If a check fails, set that HIT row to `FAIL`, save the actual observation and evidence, and record the corrective action. If the hardware, credential, or required account is unavailable, use `BLOCKED`. Resume at the failed check after correcting it, then repeat dependent checks.
3. Never mark a hardware check `PASS` using simulator output alone. Keep passwords, setup PINs, Firebase tokens, and unredacted auth logs out of the commissioning log and screenshots.
4. At the end, update the HIT matrix and commissioning log with date, firmware/build identifiers, measurements, and the next open issue. If the test-owner account claimed the device, leave a transfer reminder and complete the documented handoff before client ownership.

## What counts as achieved

- **Safe bring-up:** HIT-01–HIT-05 pass; the boards boot, authenticate, and exchange data without actuators connected.
- **Actuator-safe prototype:** the safe bring-up checks plus HIT-06, HIT-07, and HIT-11 pass.
- **End-to-end prototype demonstration:** the required HIT-01–HIT-16 checks pass with physical evidence, including actual Mega data visible in Firebase and the phone app.
- **Client handoff:** separately requires the actual client account and the documented Firebase ownership transfer. The temporary test-owner account does not satisfy this.
