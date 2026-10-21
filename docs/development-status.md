# Development Status

**Updated:** 2026-10-21. **Current phase:** software complete for the prototype scope. **Hardware commissioning has not started** (prototype not yet available).

Read these before starting new work:

| Document | Use it for |
|----------|-----------|
| [`current-project-status-audit.md`](current-project-status-audit.md) | What works, what is only simulated, known defects, readiness by area |
| [`remaining-work-roadmap.md`](remaining-work-roadmap.md) | Prioritised open tasks (IDs `R-xx`), with files, tests and acceptance criteria |
| [`mobile-app-completion-matrix.md`](mobile-app-completion-matrix.md) | Screen-by-screen app status and test evidence |
| [`hardware-integration-test-plan.md`](hardware-integration-test-plan.md) | Physical tests `HIT-01`–`HIT-15`, all currently `BLOCKED` |
| [`checkpoint-current-status-report.md`](checkpoint-current-status-report.md) | What was changed in the audit, commands run, results |
| [`comprehensive-work-plan.md`](comprehensive-work-plan.md) | Full history: findings F1–F27, decisions D1–D6, per-phase evidence |

## Subsystems at a glance

| Subsystem | Status |
|-----------|--------|
| **Arduino Mega** (primary controller) | Logic complete: feeding, hydration, latching E-stop, EEPROM schedules, SD log. Simulated (36 tests) and compile-checked. Calibration and pins **unverified**; what the load cell weighs needs a decision (R-16). |
| **ESP32** (communication bridge) | Complete: Wi-Fi reconnect, verified TLS, Firebase sign-in, RTDB writes, command transport, schedule restore. Simulated and compile-checked; **never flashed**. |
| **Firebase** (Auth + RTDB, Spark plan) | Rules deployed to `hyfepoul-dev` (2026-10-21) and covered by 61 tests. Firestore and Cloud Functions are **not used**. |
| **Mobile app** (React Native / Expo SDK 57) | Feature-complete; Jest 30/30; verified on the Android emulator with a development build. **Not yet run on a physical phone against production.** Expo Go is not supported. |
| **Nextion HMI** | HMI project in `Nextion/`. Firmware writes the real Home page fields; the Stop/Start buttons are coded but stay disabled until their IDs are read on the bench (R-20). |

## Constraints (from AGENTS.md)

- The Mega is the authority for control and safety; the ESP32 only communicates; the app talks only to Firebase.
- No paid infrastructure (no Blaze, no Cloud Functions). Phone notifications therefore work only while the app is running.
- Fixed hardware scope; no GSM/SMS or extra sensors.
