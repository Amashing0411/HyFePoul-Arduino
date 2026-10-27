# Development Status

**2026-10-26 mobile follow-up:** Fixed indefinite loading after claiming a device
that has not sent its first sensor update, and inaccessible Settings controls.
Verified empty and populated Status/Feeding/Water views on the Android emulator
using local Firebase, with temporary simulated readings. See the
[verification record](mobile-empty-state-qa-2026-10-26.md) for scope and limitations.

**2026-10-27 HMI follow-up:** Renamed the Nextion Home page `t0` caption to
"Feed in Trays:" to match the five-tray load-cell reading. Nextion compile passed
with 0 errors and 0 warnings; physical display appearance remains unverified.

**2026-10-27 Firebase/app follow-up:** Local emulator verification passed: RTDB
rules 88/88, mobile Jest 53/53 (8 suites, no open handles), ESP32 simulator,
mobile command flow, and owner-to-device end-to-end journey. See the
[QA record](firebase-emulator-qa-2026-10-27.md). Production provisioning and
physical hardware checks remain unverified.

The same QA record now includes a visible Android 15 emulator walkthrough using
a separate debug build: local sign-up and device claim passed, the pre-update
empty state rendered clearly, Status, Feeding, Water, and History displayed
local simulated data, and Notifications and Settings rendered their empty state
and controls. This does not verify the APK on the physical phone or data from
Arduino/ESP32 hardware.

**2026-10-27 standalone APK check:** Built and installed a release-variant QA
APK with an embedded app bundle and local-emulator-only HTTP access. It launched
directly into HyFePoul and a disposable sign-up reached Claim Device through the
local Auth emulator. Physical phone testing and production Firebase remain
pending. See the [APK and emulator QA record](firebase-emulator-qa-2026-10-27.md).

**2026-10-27 production APK preparation:** Built a standalone release APK with
the EAS preview production Firebase settings, emulator use disabled, and
cleartext traffic false. It is ready for direct installation; production
provisioning is now complete, but the APK has not been tested on a physical
phone. See the [device provisioning guide](device-provisioning-guide.md).

**2026-10-27 production Firebase provisioning:** Deployed the reviewed RTDB
rules and provisioned `device-001`. The configured ESP32 Auth account UID
matches the device record; the setup PIN is saved as a string and is omitted
from Git and reports. R-14 and R-45 are complete. A sign-in check with the
original device account credentials failed, so device authentication still
needs to be reconciled. Owner claim, physical-phone verification, and hardware
tests are still pending.

**2026-10-27 credential follow-up:** The original ESP32 Auth UID was also
assigned to the existing `prod-test-device` record, which has an owner and a
prior heartbeat. That binding and account were left unchanged. A dedicated
Firebase Auth user was created for `device-001`; its UID is now saved in
`devices/device-001/deviceAuthUid` and was verified in the Firebase Console.
The local ESP32 `Config.h` email matches this dedicated account, but its
password has not been verified against the account. Do not mark ESP32
authentication ready until the local password is reconciled and a live sign-in
is observed. The Firebase CLI admin session is expired; the database binding
was completed in the Firebase Console.

**Updated:** 2026-10-27. **Current phase:** design revision implemented in software ([`design-revision-moving-hopper.md`](design-revision-moving-hopper.md)): the hopper moves on a chain past 5 trays, each with its own load cell (50 g per tray by default), and water is gravity-fed with no pump. **Hardware commissioning has not started** (prototype not yet available). Production RTDB rules and `device-001` provisioning are complete; see the open credential and phone-test notes above.

Read these before starting new work:

| Document | Use it for |
|----------|-----------|
| [`current-project-status-audit.md`](current-project-status-audit.md) | What works, what is only simulated, known defects, readiness by area |
| [`remaining-work-roadmap.md`](remaining-work-roadmap.md) | Prioritised open tasks (IDs `R-xx`), with files, tests and acceptance criteria |
| [`device-provisioning-guide.md`](device-provisioning-guide.md) | Admin steps for the ESP32 Firebase account, device record, private setup PIN, app claim, and transfer |
| [`mobile-app-completion-matrix.md`](mobile-app-completion-matrix.md) | Screen-by-screen app status and test evidence |
| [`hardware-integration-test-plan.md`](hardware-integration-test-plan.md) | Physical tests `HIT-01`–`HIT-16`, all currently `BLOCKED` |
| [`hardware-test-day-run-sheet.md`](hardware-test-day-run-sheet.md) | One ordered session plan for the 2026-10-28 prototype checks, with stop gates and completion criteria |
| [`checkpoint-current-status-report.md`](checkpoint-current-status-report.md) | What was changed in the audit, commands run, results |
| [`comprehensive-work-plan.md`](comprehensive-work-plan.md) | Full history: findings F1–F27, decisions D1–D6, per-phase evidence |

## Subsystems at a glance

| Subsystem | Status |
|-----------|--------|
| **Arduino Mega** (primary controller) | Logic complete: 5-tray feed cycle (chain motor with interlocked relays, home/end limit switches, timed travel, per-tray tare and target, chain/tray timeouts, empty-hopper return), reservoir water alert, latching E-stop, EEPROM schedules, SD log. Simulated (51 tests) and compile-checked. Calibration, tray travel times and pins **unverified** (R-46). |
| **ESP32** (communication bridge) | Firmware implements Wi-Fi reconnect, TLS certificate verification, Firebase sign-in, RTDB writes, command transport, and schedule restore. Simulator and compile checks passed; the firmware has **not been flashed** and physical sign-in/TLS remain unverified. |
| **Firebase** (Auth + RTDB, Spark plan) | Revised RTDB rules deployed to production on 2026-10-27; `device-001` has a dedicated Auth UID and string setup PIN. The earlier sign-in attempt used the original device account and failed; the new account password has not been verified against local `Config.h`. The record remains offline and unclaimed. Firestore and Cloud Functions are **not used**. |
| **Mobile app** (React Native / Expo SDK 57) | Feature-complete; shows tray weights and cycle progress, reservoir status; Jest 53/53, tsc and targeted lint clean. Revised screens and empty states were checked on Android emulators (R-49; see the QA records). **Not yet run on a physical phone against production.** Expo Go is not supported. |
| **Nextion HMI** | HMI project in `Nextion/`. Firmware writes the real Home page fields; the Stop/Start buttons are coded but stay disabled until their IDs are read on the bench (R-20). |

## Constraints (from AGENTS.md)

- The Mega is the authority for control and safety; the ESP32 only communicates; the app talks only to Firebase.
- No paid infrastructure (no Blaze, no Cloud Functions). Phone notifications therefore work only while the app is running.
- Fixed hardware scope; no GSM/SMS or extra sensors.
