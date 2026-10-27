# Development Status

**2026-10-27 production credential recheck:** A temporary Firebase Auth export
confirmed that the account configured in the local, Git-ignored ESP32 `Config.h`
exists and its UID matches `devices/device-001/deviceAuthUid`; the export was
deleted immediately. The initial sign-in with the local value returned
`INVALID_LOGIN_CREDENTIALS`. With the user's approval, the dedicated device
account password was synchronized to the value in local `Config.h`; production
sign-in then passed, and the authenticated RTDB read of the device binding
matched the sign-in UID. The ESP32 API key was synchronized from the matching
production mobile-app config, and the ESP32 build passed (1,147,088 bytes flash,
49,688 bytes RAM). Wi-Fi settings in local `Config.h` remain placeholders. This
checks the Firebase REST path, not sign-in or writes from flashed ESP32 hardware.
No credentials, setup PIN, auth tokens, or user records are included here.

**2026-10-27 API key restriction review:** The production app key already has
API and Android application restrictions, but the Android package/certificate
allowlist does not match this app and the API allowlist contains 27 services.
The Expo app uses Firebase's JavaScript SDK and the ESP32 shares the same key
for direct REST calls. The current SDK package does not contain Android package
or certificate headers. Google's Firebase key guidance identifies Identity
Toolkit and Secure Token for Auth, and Realtime Database for the ESP32's direct
REST use; it also warns to test restriction changes before changing a production
key. A separate candidate was created for controlled testing; the production
key restrictions were not changed. See the [Firebase API key guide](https://firebase.google.com/docs/projects/api-keys)
and [Google Android key restriction requirements](https://docs.cloud.google.com/docs/authentication/api-keys).

**2026-10-27 candidate API key test:** The approved candidate is restricted to
Identity Toolkit, Secure Token, and Realtime Database, with no application
restriction. Firebase JavaScript SDK sign-in, forced token refresh, and RTDB
read passed; an ESP32-style authenticated RTDB REST read also passed, with the
UID matching `device-001`. No database writes were made. The candidate remains
unused; the existing production key, EAS settings, and ignored ESP32 config
were left unchanged pending an adoption decision.

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

**2026-10-27 pre-session recheck:** Mobile Jest passed 53/53 with local Auth and
Realtime Database emulators; the RTDB rules suite passed 88/88; Mega simulation
passed 51/51; the ESP32 simulator, mobile command flow, schedule restore/UART
line checks, and owner-device journey passed. Arduino CLI builds for the Mega
and ESP32 targets passed. TypeScript passed. Expo lint reported 0 errors and 3
`react-hooks/set-state-in-effect` warnings. Emulator tests used local Firebase
only; none of these checks verifies the production device password, physical
phone, or hardware.

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
original device account credentials failed. The dedicated account initially
returned `INVALID_LOGIN_CREDENTIALS`; after the approved password sync, its
production REST sign-in and authenticated device-binding read passed. Actual
ESP32 sign-in, state writes, and TLS verification still need the device.
Owner claim, physical-phone verification, and hardware tests are pending.

**2026-10-27 credential follow-up:** The original ESP32 Auth UID was also
assigned to the existing `prod-test-device` record, which has an owner and a
prior heartbeat. That binding and account were left unchanged. A dedicated
Firebase Auth user was created for `device-001`; its UID is now saved in
`devices/device-001/deviceAuthUid` and was verified in the Firebase Console.
The configured email was confirmed to map to that UID by a temporary Auth
export, which was deleted after checking. A sign-in attempt using the current
local password initially returned `INVALID_LOGIN_CREDENTIALS`; after the
user-approved sync, production REST sign-in and the authenticated RTDB binding
read passed. Do not mark ESP32 hardware authentication ready until on-device
sign-in, TLS, and state writes pass. The production API key is now present in
ignored local `Config.h`, but Wi-Fi settings remain placeholders.

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
| **ESP32** (communication bridge) | Firmware implements Wi-Fi reconnect, TLS certificate verification, Firebase sign-in, RTDB writes, command transport, and schedule restore. Simulator and compile checks passed; production REST sign-in and device UID match passed, but the firmware has **not been flashed** and Wi-Fi credentials remain placeholders. |
| **Firebase** (Auth + RTDB, Spark plan) | Revised RTDB rules deployed to production on 2026-10-27; `device-001` has a dedicated Auth UID and string setup PIN. The dedicated account signs in through the production REST API, matches the device binding, and can read that binding. The record remains offline and unclaimed. Firestore and Cloud Functions are **not used**. |
| **Mobile app** (React Native / Expo SDK 57) | Feature-complete; shows tray weights and cycle progress, reservoir status; Jest 53/53 and TypeScript pass. Expo lint reports 0 errors and 3 `react-hooks/set-state-in-effect` warnings. Revised screens and empty states were checked on Android emulators (R-49; see the QA records). **Not yet run on a physical phone against production.** Expo Go is not supported. |
| **Nextion HMI** | HMI project in `Nextion/`. Firmware writes the real Home page fields; the Stop/Start buttons are coded but stay disabled until their IDs are read on the bench (R-20). |

## Constraints (from AGENTS.md)

- The Mega is the authority for control and safety; the ESP32 only communicates; the app talks only to Firebase.
- No paid infrastructure (no Blaze, no Cloud Functions). Phone notifications therefore work only while the app is running.
- Fixed hardware scope; no GSM/SMS or extra sensors.
