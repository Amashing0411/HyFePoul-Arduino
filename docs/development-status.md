# Development Status

**Updated:** 2026-10-23. **Current phase:** design revision implemented in software ([`design-revision-moving-hopper.md`](design-revision-moving-hopper.md), branch `design-moving-hopper`): the hopper moves on a chain past 5 trays, each with its own load cell (50 g per tray by default), and water is gravity-fed with no pump. **Hardware commissioning has not started** (prototype not yet available). The revised RTDB rules are **not deployed** (R-45).

Read these before starting new work:

| Document | Use it for |
|----------|-----------|
| [`current-project-status-audit.md`](current-project-status-audit.md) | What works, what is only simulated, known defects, readiness by area |
| [`remaining-work-roadmap.md`](remaining-work-roadmap.md) | Prioritised open tasks (IDs `R-xx`), with files, tests and acceptance criteria |
| [`mobile-app-completion-matrix.md`](mobile-app-completion-matrix.md) | Screen-by-screen app status and test evidence |
| [`hardware-integration-test-plan.md`](hardware-integration-test-plan.md) | Physical tests `HIT-01`–`HIT-16`, all currently `BLOCKED` |
| [`checkpoint-current-status-report.md`](checkpoint-current-status-report.md) | What was changed in the audit, commands run, results |
| [`comprehensive-work-plan.md`](comprehensive-work-plan.md) | Full history: findings F1–F27, decisions D1–D6, per-phase evidence |

## Subsystems at a glance

| Subsystem | Status |
|-----------|--------|
| **Arduino Mega** (primary controller) | Logic complete: 5-tray feed cycle (chain motor with interlocked relays, home/end limit switches, timed travel, per-tray tare and target, chain/tray timeouts, empty-hopper return), reservoir water alert, latching E-stop, EEPROM schedules, SD log. Simulated (37 tests) and compile-checked. Calibration, tray travel times and pins **unverified** (R-46). |
| **ESP32** (communication bridge) | Complete: Wi-Fi reconnect, verified TLS, Firebase sign-in, RTDB writes, command transport, schedule restore. Simulated and compile-checked; **never flashed**. |
| **Firebase** (Auth + RTDB, Spark plan) | Repo rules updated for the tray state and covered by 64 tests; **production still has the 2026-10-21 (pump-era) rules** until R-45. Firestore and Cloud Functions are **not used**. |
| **Mobile app** (React Native / Expo SDK 57) | Feature-complete; shows tray weights and cycle progress, reservoir status; Jest 33/33, tsc and lint clean. The revised screens have not been opened on the emulator yet (R-49); earlier screens were verified there. **Not yet run on a physical phone against production.** Expo Go is not supported. |
| **Nextion HMI** | HMI project in `Nextion/`. Firmware writes the real Home page fields; the Stop/Start buttons are coded but stay disabled until their IDs are read on the bench (R-20). |

## Constraints (from AGENTS.md)

- The Mega is the authority for control and safety; the ESP32 only communicates; the app talks only to Firebase.
- No paid infrastructure (no Blaze, no Cloud Functions). Phone notifications therefore work only while the app is running.
- Fixed hardware scope; no GSM/SMS or extra sensors.
