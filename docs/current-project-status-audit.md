# HyFePoul: Current Project Status Audit

**Audit date:** 2026-10-21
**Repository state:** `main` at `c0dc92b` (after PRs #1–#6). **Updated 2026-10-23** for the moving-hopper design revision (branch `design-moving-hopper`).
**Scope:** firmware (Mega, ESP32), Firebase (Auth + RTDB), mobile app, documentation, build and deployment.

The work history, decisions and per-phase evidence are in [`comprehensive-work-plan.md`](comprehensive-work-plan.md). This document is a snapshot of where things stand now.

## 1. Bottom line

- **Software: complete for the prototype scope, and tested without hardware.** The firmware logic, database rules, app and docs are done. They were tested with JavaScript simulators that mirror the firmware, the Firebase emulators, and an Android emulator running a development build.
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
| Local display on the Nextion Home page (`t2` feed, `t3` water, `t4` status, `t5` time); Stop/Start buttons | Mega `Nextion.ino` | Compile-checked; touch parser simulated (tests 34–35); **button IDs disabled until read on the bench** |
| SD CSV log | Mega `SDLogging.ino` | Compile-checked |
| Network time to RTC (ESP32 NTP, every 30 s) | ESP32, Mega | Compile-checked |
| HTTPS with certificate verification | ESP32 | Compile-checked |

## 4. Partially implemented or limited

| Item | Limitation |
|------|------------|
| Nextion HMI (F14) | Mapped to the real Home page fields (R-20). Stop (`b3`) and Start (`b4`, local E-stop reset) are coded but **disabled until their numeric IDs are read on the bench**; every touch is logged to make that a one-press job. The Home page has no field for hopper level % or network status. `b0`–`b2` (schedule and weight entry on the HMI) are not handled. |
| Notifications | Delivered only while the app is running (Spark plan, no server push). Alerts raised while it is closed appear in the Notifications tab later. |
| Alert resolution (F24) | Done in software (R-23): the Mega sends clear events, the ESP32 marks the alert resolved, and the app lists active alerts first. Alerts raised while the ESP32 is offline are kept and written when it is back online. |
| Load cell meaning | Resolved (R-16): one load cell under each tray weighs dispensed feed. The HMI caption `t0` still says "Hopper Load" (R-48). |
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
| 7 | Revised RTDB rules not deployed (R-45) | High | Deploy with the new firmware on both boards. No saved schedules exist in production (checked 2026-10-23), so none need converting (R-50). |
| 8 | Firebase web API key not restricted (SEC-2) | Medium | The key is public in `eas.json` (by design for web keys); restrict it in Google Cloud Console. |
| 9 | Old `Config.h` values in git history | Low–Medium | Probably the emulator test password; rotate it if it was used for the production device account. |
| 10 | Nextion button IDs not yet confirmed | Low | Stop/Start on the HMI do nothing until set (procedure §9). |
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
| **Mobile app** | Feature-complete for scope; emulator-verified | Jest 30/30, `tsc`, Android emulator runs ([`mobile-app-completion-matrix.md`](mobile-app-completion-matrix.md)). No physical phone yet. |
| **Backend / security** | Ready; deployed | 61/61 rules tests; production rules deployed and read back 2026-10-21; unauthenticated access denied on every protected path. Owner and device positive paths not yet exercised in production. |
| **Firmware (Mega)** | Logic complete; compile-checked and simulated | Mega simulator 34/34. Flash 14%, RAM 29%. Calibration and pins unverified. |
| **Firmware (ESP32)** | Logic complete; compile-checked and simulated | ESP32 simulator (commands, restore R1–R4, UART U1–U4). Flash 86% of the default partition (CA bundle). |
| **Build** | Reproducible | `arduino-cli` builds for both boards; `npx expo run:android` development build; EAS profiles configured with the production RTDB URL. |
| **Deployment** | Not started on hardware | Requires commissioning ([`hardware-integration-test-plan.md`](hardware-integration-test-plan.md)). |

Build and deployment levels reached so far:

| Level | Reached? |
|-------|----------|
| Local development build | Yes |
| Emulator-tested build (against Firebase emulators) | Yes |
| Installed on a physical phone | No |
| Production-configured build | Configured (`eas.json` development, preview and production profiles), not yet built |
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
