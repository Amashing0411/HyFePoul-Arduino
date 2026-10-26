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

## Standalone Android release APK smoke check

**Build:** `mobile-app/android/app/build/outputs/apk/release/app-release.apk`, built with an embedded JavaScript bundle and `EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true`, `EXPO_PUBLIC_EMULATOR_HOST=127.0.0.1` for local Auth/RTDB emulator access. The checked-in `mobile-app/app.config.js` sets `android:usesCleartextTraffic=true` only when both values match; otherwise it sets the attribute to `false`. This is an emulator QA build, not a production APK.

**SHA-256:** `A7BD004BABDCA85E7D6CB0B5177A1D7C2AE05F668A61428367E010DE45624AED`

Rebuild from `mobile-app/` in PowerShell:

```powershell
$env:EXPO_PUBLIC_USE_FIREBASE_EMULATOR = 'true'
$env:EXPO_PUBLIC_EMULATOR_HOST = '127.0.0.1'
npx expo prebuild --platform android
cd android
.\gradlew.bat :app:assembleRelease
```

For a physical phone connected over USB, forward the Auth and RTDB emulator
ports before launching this QA APK:

```powershell
adb reverse tcp:9099 tcp:9099
adb reverse tcp:9000 tcp:9000
```

The phone and laptop must stay connected for those forwarded localhost services
to work. A production build must use the normal HTTPS Firebase endpoints.

| Check | Result | Evidence |
|---|---|---|
| Install and launch | **Passed** | Installed on MuMu Android 15 (`emulator-5554`) and launched directly into HyFePoul; no Expo Go or dev launcher prompt appeared. |
| Local Auth connectivity | **Passed** | Created a disposable account from the APK; it advanced to Claim Device. Auth emulator port 9099 was forwarded to the emulator. |
| Local device claim | **Not repeated** | Stopped at Claim Device; this smoke check did not claim the existing QA fixture or touch production. |
| Physical phone | **Not tested** | No physical phone was connected to ADB during this check. |

The successful sign-up verifies that the APK can reach the local Auth emulator after enabling cleartext only for an explicitly flagged local-emulator build. It does not verify RTDB claim traffic, production Firebase, physical phone behavior, or Arduino/ESP32 data transmission. Do not use this APK as a production build: it is configured for localhost emulator services and signed with the development key.

## Limits

- These are emulator and simulator results, not tests with Arduino-generated data or physical hardware.
- The visible UI check used a separate debug APK in the Android emulator. The APK installed on the user's physical phone was not rebuilt or tested against this local emulator. The automated app integration suite tests Firebase services, not the visible phone UI.
- Production provisioning for `device-001` and its owner setup PIN remains unconfirmed (R-14). The test PINs are fixtures and must not be used as the production PIN.
- The production Firebase setup reported by the earlier audit remains unresolved: no independent production check or provisioning change was made during this APK work. R-14 is still `NOT STARTED (confirm)`.
- Physical serial reliability, Arduino↔Nextion operation, ESP32 Wi-Fi/TLS behavior and calibration remain for the prototype commissioning session.
