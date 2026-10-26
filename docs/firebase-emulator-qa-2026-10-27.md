# Firebase and app integration QA

**Date:** 2026-10-27
**Environment:** Local Firebase Auth and Realtime Database emulators for `hyfepoul-dev`. These checks used disposable emulator accounts and data; all test Auth/RTDB requests stayed on localhost, with no production data read or written.

## Results

| Check | Result | Scope |
|---|---|---|
| RTDB security rules (`node backend/functions/scripts/test-rtdb-rules.js`) | **88 passed, 0 failed** | PIN claim validation, ownership, device identity, commands, schedules, alerts, state/data validation and access rules |
| Mobile Jest (`npm --prefix mobile-app test -- --detectOpenHandles`) | **53 passed, 8 suites** | App service and utility tests against local emulators; Jest exited with no open-handle warning |
| Mega logic simulator (`node scripts/simulate-mega.js`) | **51 passed, 0 failed** | Feed-cycle and safety logic, persistence, schedule restore, system-data reporting and simulated Nextion button events |
| ESP32 simulator (`node scripts/simulate-esp32.js`) | **Passed** | Auth, heartbeat, state/history/alerts, command lifecycle, schedule restore, summary/history behavior and UART line-size checks |
| Owner-to-device journey (`node scripts/test-e2e-journey.js`) | **Passed** | Owner signup and claim, device state, schedule, manual-feed lifecycle, alert resolution, history and sign-out |
| Mobile command flow (`node scripts/test-mobile-commands.js`) | **Passed** | Simulated state/alerts, command creation and schedule validation/authorization |

The mobile service tests now sign out and delete their Firebase app instances during teardown. This cleared a lingering Jest connection, confirmed by the full suite with `--detectOpenHandles`.

## Visible Android app check

**Environment:** A locally built Android debug development client running in the MuMu Android 15 emulator, connected to the local Expo Metro server and local Firebase Auth/RTDB emulators. The app JS confirmed `Connected to Auth/RTDB Emulators on 10.0.2.2`. Production Firebase and the user's physical phone were not used.

| Check | Result | Evidence |
|---|---|---|
| App launch and sign-up | **Passed** | The debug APK launched, loaded its JS bundle from the local Metro server, and created a disposable owner account in the Auth emulator. |
| Device claim | **Passed** | The app accepted the local-only `LOCAL-UI-TEST-001` fixture and emulator test PIN, then opened Status. |
| First-update empty state | **Passed** | Before simulated readings were seeded, Status showed the device as offline and explained that it was waiting for its first update. |
| Status dashboard | **Passed** | After seeding a valid local state, the app rendered online status, 200 g across trays, 76% hopper level, Water OK, and Running safety state. |
| Feeding screen | **Passed** | The app rendered all five tray weights (42, 40, 39, 41, and 38 g), the 200 g sum, idle cycle, and hopper level. |
| Water screen | **Passed** | The app showed Water OK and the gravity-fed reservoir explanation. |
| History screen | **Passed** | One local sample history record appeared with its timestamp, feed weight, hopper level, water status, and dispenser state. |
| Notifications screen | **Passed** | The empty state explained that there were no alerts; it did not appear blank or stuck loading. |
| Settings screen | **Passed (visual check)** | Account, active device, device clock, app version, language, dark-mode, and text-size controls were visible. Preferences were not changed during this check. |

The sample was inserted directly into the local RTDB emulator as an administrator fixture. It did not come from an Arduino, ESP32, or physical sensor, and it does not verify hardware data transmission. The debug build is emulator evidence only; it does not update or verify the APK installed on the user's phone.

## Limits

- These are emulator and simulator results, not tests with Arduino-generated data or physical hardware.
- The visible UI check used a separate debug APK in the Android emulator. The APK installed on the user's physical phone was not rebuilt or tested against this local emulator. The automated app integration suite tests Firebase services, not the visible phone UI.
- Production provisioning for `device-001` and its owner setup PIN remains unconfirmed (R-14). The test PINs are fixtures and must not be used as the production PIN.
- Physical serial reliability, Arduino↔Nextion operation, ESP32 Wi-Fi/TLS behavior and calibration remain for the prototype commissioning session.
