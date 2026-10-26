# Firebase and app integration QA

**Date:** 2026-10-27
**Environment:** Local Firebase Auth and Realtime Database emulators for `hyfepoul-dev`. These checks used disposable emulator accounts and data; all test Auth/RTDB requests stayed on localhost, with no production data read or written.

## Results

| Check | Result | Scope |
|---|---|---|
| RTDB security rules (`node backend/functions/scripts/test-rtdb-rules.js`) | **88 passed, 0 failed** | PIN claim validation, ownership, device identity, commands, schedules, alerts, state/data validation and access rules |
| Mobile Jest (`npm --prefix mobile-app test -- --detectOpenHandles`) | **53 passed, 8 suites** | App service and utility tests against local emulators; Jest exited with no open-handle warning |
| ESP32 simulator (`node scripts/simulate-esp32.js`) | **Passed** | Auth, heartbeat, state/history/alerts, command lifecycle, schedule restore, summary/history behavior and UART line-size checks |
| Owner-to-device journey (`node scripts/test-e2e-journey.js`) | **Passed** | Owner signup and claim, device state, schedule, manual-feed lifecycle, alert resolution, history and sign-out |
| Mobile command flow (`node scripts/test-mobile-commands.js`) | **Passed** | Simulated state/alerts, command creation and schedule validation/authorization |

The mobile service tests now sign out and delete their Firebase app instances during teardown. This cleared a lingering Jest connection, confirmed by the full suite with `--detectOpenHandles`.

## Limits

- These are emulator and simulator results, not tests with Arduino-generated data or physical hardware.
- The installed phone APK was not rebuilt or tested against the local emulator in this run. The automated app integration suite tests Firebase services, not the visible phone UI.
- Production provisioning for `device-001` and its owner setup PIN remains unconfirmed (R-14). The test PINs are fixtures and must not be used as the production PIN.
- Physical serial reliability, Arduino↔Nextion operation, ESP32 Wi-Fi/TLS behavior and calibration remain for the prototype commissioning session.
