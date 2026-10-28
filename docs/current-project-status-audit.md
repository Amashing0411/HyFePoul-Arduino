# HyFePoul: Current Project Status Audit

**Audit baseline:** 2026-10-21 at `c0dc92b` (after PRs #1–#6); moving-hopper revision added 2026-10-23. **Current status refreshed:** 2026-10-28.
**Scope:** firmware (Mega, ESP32), Firebase (Auth + RTDB), mobile app, documentation, build and deployment.

The work history, decisions and per-phase evidence are in [`comprehensive-work-plan.md`](comprehensive-work-plan.md). This document is a snapshot of where things stand now.

## 1. Bottom line

- **Software: prototype path is implemented and tested without hardware, with follow-up work still open.** Firmware behavior, database rules and app flows have simulator/emulator coverage. R-54 remains open for synchronizing onsite schedule edits with Firebase. No simulator result is a physical hardware pass.
- **Hardware: not commissioned.** Every row in [`hardware-commissioning-log.md`](hardware-commissioning-log.md) is still `PENDING – Hardware unavailable`. Nothing has been verified on the physical prototype: sensors, actuators, calibration, the E-stop circuit, the UART link, or real-world ESP32 networking.
- **Production backend:** `hyfepoul-dev` with RTDB `hyfepoul-dev-default-rtdb` (`asia-southeast1`). The current security rules are deployed and were verified on 2026-10-21. **The app has not been run on a physical phone against production.**

Status words used below:
- **Verified (emulator):** checked on the Firebase or Android emulators.
- **Simulated:** checked in the JS mirror of the firmware.
- **Compile-checked:** builds, but has not been run.
- **Unverified:** not tested at all.

## 2. Actual architecture

```
Arduino Mega 2560 ──UART 115200 (≤63 chars/line)── ESP32 ──HTTPS (CA-verified)── Firebase Auth + RTDB ── Android app
 (control + safety)                                (bridge)                        (Spark plan)            (Expo dev build)
```

- **Mega:**
  - all sensors and actuators;
  - schedules (EEPROM, local time UTC+8);
  - 5-tray feed cycle: chain motor (two interlocked relays), home/end limit switches, timed travel, per-tray load cell and target, chain and tray timeouts;
  - latching E-stop; reservoir float alert (no pump);
  - 4-slot alert queue, SD CSV log, Nextion display.
- **ESP32:**
  - Wi-Fi with background reconnect;
  - Firebase email/password sign-in for the device account;
  - REST writes for state, history, alerts and heartbeat;
  - command polling every 5 s;
  - schedule restore from RTDB;
  - `STATUS`/`TIME` to the Mega.
- **RTDB:** `devices`, `systemData`, `alerts`, `commands`, `schedules`, `claimRequests`, `deviceSecrets` ([`database-schema.md`](database-schema.md)).
- **App:**
  - React Native + Expo SDK 57 + TypeScript, Android first;
  - RTDB listeners, command lifecycle UI;
  - local notifications while running.
- **Not used:** Cloud Firestore, Cloud Functions and FCM push (legacy code kept in `backend/functions`, not deployed).

## 3. Implemented features

| Feature | Where | Evidence |
|---------|-------|----------|
| Scheduled feeding (3 daily slots, local time, per-tray target) running the 5-tray cycle | Mega `Feeding.ino`, `TimeManager.ino` | Simulated (tests 10–24) |
| Schedules survive reset or power loss (EEPROM) and re-sync from RTDB | Mega `ScheduleStorage.ino`, ESP32 restore | Simulated (28–32, R1–R4) |
| Manual feed from the app (1–1000 g per tray) with plain-language lifecycle, tray weights and cycle step | App Feeding, Mega, ESP32 | Simulated; tsc/Jest. Pre-revision version verified on the emulator |
| Water: reservoir float switch, debounced `LOW_WATER` + beep once per episode (gravity-fed, no pump) | Mega `Hydration.ino` | Simulated (25, 26) |
| Latching E-stop; reset via app `ESTOP_RELEASE` or serial `RESET`; refused while the button is pressed | Mega `Safety.ino` | Simulated (26, 27) |
| A remote command interrupted by the E-stop reports failure and frees the command slot | Mega | Simulated (20) |
| Alerts: LOW_FEED, LOW_WATER, CHAIN_TIMEOUT, TRAY_TIMEOUT, EMERGENCY_STOP | Mega → ESP32 → RTDB | Simulated; ESP32 compile-checked |
| Phone notifications for new alerts while the app is running | App `useAlertNotifications` | Verified (emulator): foreground and background |
| Owner sign-up and sign-in, session restore | App | Verified (emulator) |
| Device claiming with setup PIN (wrong PIN denied, no transfer) | App, RTDB rules | Verified (emulator, rules tests) |
| Device online status from heartbeat age (90 s) | App | Verified (emulator), 5 unit tests |
| History (latest 50 records), alert feed, settings (language, dark mode, text size) | App | Emulator (partial; see the matrix) |
| Nextion onsite UI: Home values/navigation, Stop/Feed Now, app History, System Check, Feed Target, three schedule editors | Mega `Nextion.ino`, ESP32 bridge, RTDB rules, checked-in HMI and TFT | Mega simulator 56/56 covers app-history row formatting/order, refresh mapping, schedule target/enabled display and touch handling. Physical Firebase read, UART/touch/display/history parity remains HIT-12. |
| SD CSV log | Mega `SDLogging.ino` | Compile-checked |
| Network time to RTC (ESP32 NTP, every 30 s) | ESP32, Mega | Compile-checked |
| HTTPS with certificate verification | ESP32 | Compile-checked |

## 4. Partially implemented or limited

| Item | Limitation |
|------|------------|
| Nextion HMI (R-20) | Page 3 (named `Log`) requests the latest four `/systemData/{deviceId}` snapshots also shown in app Recent History; page 9 is System Check with hopper, water, ESP32 link and target. Page 2 shows app-synchronized time, target and enabled status. Mega/ESP32 simulators cover row and schedule mapping; a scoped device read rule is present in source but is not deployed yet. Physical Firebase read, UART/touch/display/history parity remains unverified until HIT-12. Onsite schedule time edits persist to EEPROM but do not write to Firebase (R-54). |
| Notifications | Delivered only while the app is running (Spark plan, no server push). Alerts raised while it is closed appear in the Notifications tab later. |
| Alert resolution (F24) | Done in software (R-23): the Mega sends clear events, the ESP32 marks the alert resolved, and the app lists active alerts first. Alerts raised while the ESP32 is offline are kept and written when it is back online. |
| Load cell meaning | Resolved (R-16): one load cell under each tray weighs dispensed feed. The HMI caption `t0` now says "Feed in Trays:" (R-48; HMI project compile passed, physical display appearance not checked). |
| `SYSTEM_RESTART` | Always rejected by the Mega (`NOT_IMPLEMENTED_SAFELY`), by design. |
| ESP32 → Mega link health | Both directions are tracked. The Mega times out the ESP32 after 15 s; the ESP32 times out the Mega after 30 s and reports `megaLinkOk` plus a `CONTROLLER_OFFLINE` alert (R-24). |
| Feeding accuracy | The tray weight is read without blocking (one HX711 sample when ready). Overshoot from feed still falling after the dispenser stops is not measured yet. |
| History retention | Resolved (R-22): `systemData` gets a row every 5 minutes plus each feeding's start and end (~0.1 MB/day); every reading stays on the SD card. |
| iOS | Not built or tested (Android is the target). |

## 5. Untested features

- **Everything that needs the prototype:**
  - sensor readings and calibration;
  - relay polarity, actuators;
  - E-stop electrical isolation;
  - SD and Nextion on real hardware;
  - Mega ↔ ESP32 UART, including the 64-byte line limit in practice;
  - ESP32 Wi-Fi drop and recovery;
  - **first real Firebase sign-in with a ~1 KB token (F27 fix)**;
  - TLS against the real Firebase certificate chain.
- **App on a physical phone against production:**
  - owner sign-in;
  - owned-device discovery through the deployed rules;
  - live state, commands and notifications.
- Firmware C++ has not been run anywhere. The simulators mirror the logic, and the C++ is only compile-checked; no host C++ compiler was available.

## 6. Known defects and risks (open)

| # | Item | Severity | Notes |
|---|------|----------|-------|
| 1 | E-stop electrical isolation unverified | High (safety) | Software latches and forces relays off; whether the button also cuts actuator power in hardware is unknown. |
| 2 | Real-token ESP32 sign-in untested (F27 fix) | High | Watch the first boot on the serial monitor. |
| 3 | Load-cell calibration factor `-7050.0f` is a placeholder | High | Feeding weights are meaningless until calibrated. |
| 4 | Relay active level and NO/NC wiring unverified | High | Code assumes HIGH = ON. |
| 5 | Timed travel to each tray is uncalibrated (R-46) | High | Placeholder 3 s per tray; wrong values spill feed between trays or hit the end switch early (`END_LIMIT_EARLY`). |
| 6 | `systemData` unbounded growth | Medium | Retention decision needed. |
| 7 | Production owner/device flows are not fully verified | High | R-45 and R-14 provisioning completed 2026-10-27. Dedicated device-account REST sign-in and UID binding read passed; owner claim in the physical APK, flashed-device writes and recovery remain unverified. |
| 8 | Firebase API key restriction narrowed (SEC-2) | Low | The app and ESP32 now use the approved candidate restricted to Identity Toolkit, Secure Token, and Realtime Database, with no application restriction. SDK Auth/token-refresh/RTDB and ESP32-style REST checks passed; the ESP32 compile passed after adoption. The original Firebase-created key remains active for rollback. An unrelated-service denial was not separately probed. |
| 9 | Old `Config.h` values in git history | Low–Medium | Probably the emulator test password; rotate it if it was used for the production device account. |
| 10 | Physical Nextion ID and UART mapping not yet confirmed | High | Firmware IDs match the checked-in HMI map and parser simulation. Verify every touch, especially Stop and Reset Stop, on the panel before actuator testing (HIT-12). |
| 11 | Stale design docs (`architecture.md`, `api-contract.md`, `firebase-backend-architecture.md`) | Low | Still describe Firestore and Cloud Functions. |

## 7. Hardware-dependent assumptions

All pins, levels and polarities are **intended, not verified** ([`hardware-assumption-matrix.md`](hardware-assumption-matrix.md)). The key ones:
- **Mega 5 V TX → ESP32 3.3 V RX needs a level shifter.**
- Float switches are assumed active-LOW with `INPUT_PULLUP`; relays are assumed active-HIGH.
- Ultrasonic empty/full distances are placeholders (40 cm / 5 cm).
- Nextion runs at 9600 baud.
- DS3231 RTC with a backup battery.
- UART at 115200 baud.

## 8. Readiness by area

| Area | Readiness | Basis |
|------|-----------|-------|
| **Mobile app** | Feature-complete for scope; emulator-verified | Jest 53/53, `tsc`, Android emulator runs ([`mobile-app-completion-matrix.md`](mobile-app-completion-matrix.md)); Firebase/app QA details in [`firebase-emulator-qa-2026-10-27.md`](firebase-emulator-qa-2026-10-27.md). No physical phone against production yet. |
| **Backend / security** | Revised rules deployed; production claim and device sign-in remain unverified | 88/88 local rules tests; R-45 deployed 2026-10-27 and R-14 provisioning completed. Sign-in with the local ESP32 password failed; owner claim and physical device writes have not been exercised in production. |
| **Firmware (Mega)** | Logic complete; compiled and simulated | Mega simulator 56/56; current source uses 53,822 bytes flash and 3,848 bytes RAM. Calibration and pins unverified. |
| **Firmware (ESP32)** | Logic complete; compile-checked and simulated | ESP32 simulator (commands, restore R1–R4, UART U1–U4). Flash 86% of the default partition (CA bundle). |
| **Build** | Reproducible | `arduino-cli` builds for both boards; `npx expo run:android` development build; EAS profiles configured with the production RTDB URL. |
| **Deployment** | Not started on hardware | Requires commissioning ([`hardware-integration-test-plan.md`](hardware-integration-test-plan.md)). |

Build and deployment levels reached so far:

| Level | Reached? |
|-------|----------|
| Local development build | Yes |
| Emulator-tested build (against Firebase emulators) | Yes |
| Installed on a physical phone | User reports a production-configured APK is installed; physical owner claim and device flow remain unverified |
| Production-configured build | Yes; standalone release APK built and signature verified; direct install, not Play Store distribution |
| End-to-end tested against production | No |

## 9. Cost and infrastructure constraints

- **Firebase Spark (free) plan only.** No Blaze upgrade, no Cloud Functions, no paid services. Deliberate consequences:
  - no server-side push notifications (local notifications only while the app runs);
  - no server-side alert resolution, offline detection or data cleanup. These are done in the app or left to an admin.
- **Load drivers, from the design (not measured):**
  - per device: one `state` `PUT` and one `systemData` `POST` every 10 s; heartbeat (2 writes) every 30 s; command poll every 5 s (one read, usually empty); alerts on events.
  - per app session: listeners on device, latest 10 commands, schedules, latest 50 history records and alerts.

  Usage should be checked in the Firebase console during commissioning, against the plan's limits at that time, before deciding on retention or polling intervals.
- **No paid infrastructure is required** for anything implemented.
