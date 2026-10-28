# Checkpoint Report: Audit and Remediation (Phases 0–6)

**Date:** 2026-10-21
**Baseline:** `main` at `2ac6bc7` ("Document ESP32 Firebase production integration progress"), before this audit
**Result:** `main` at `c0dc92b` (PRs #1–#6 merged) plus this Phase 6 documentation PR
**Detailed log:** [`comprehensive-work-plan.md`](comprehensive-work-plan.md)

## 1. Baseline found at the start (Phase 0)

Earlier checkpoints reported "all tests passing". A fresh run on 2026-10-21 showed:

| Check | Baseline result |
|-------|-----------------|
| RTDB rules | 53/53 pass |
| Mega simulator | Pass (20 checks) |
| ESP32 simulator, mobile commands, E2E | Pass, **only with the emulators running** |
| Mobile Jest | **8 failed / 18 passed**: a stale suite written before the current rules |
| Mobile type-check | Pass |
| Mega and ESP32 compile | Pass (ESP32 flash 80%) |
| App on a device | Not possible: **no production RTDB URL was configured** (the app fell back to `127.0.0.1`) |

Passing suites hid real defects. The most important ones:

- **Owners could never see their device.** The app's owned-device query was denied by the rules (F18).
- **Mega safety:**
  - a remote feed stopped by the E-stop locked out every later command (`SYSTEM_BUSY`);
  - the pump timeout restarted the pump immediately;
  - the E-stop auto-released when the button was let go;
  - alerts overwrote each other.
- **Schedules:**
  - they fired 8 hours late (UTC vs local time);
  - they were lost on reset, bringing back three enabled 500 g defaults even if the user had deleted them.
- **UART:** app `SCHEDULE_SET` lines (about 82 bytes) exceeded the Mega's 64-byte receive buffer (F26).
- **ESP32:**
  - HTTPS certificate checking was off (core default `setInsecure()`);
  - the sign-in parser would have stored the ID token as `"null"` (F27);
  - Wi-Fi was never reconnected.
- **App:**
  - Manual Feed did nothing on Android (`Alert.prompt` is iOS-only);
  - push notifications depended on undeployable Cloud Functions;
  - a powered-off device still showed ONLINE.

## 2. Work performed

| Phase | Scope | PR | Key commits |
|-------|-------|----|-------------|
| 0 | Baseline audit, findings F1–F22 | (in PR #1) | `7bf6eca` |
| 1 | Mega safety: E-stop failure report, pump latch, alert queue + LOW_WATER, local-time schedules, latching E-stop | #1 | `f6ed0fb`, `8540a05`, `1f24748`, `d5f1992`, `94d15f1` |
| 2 | Rules (owner query, stale failure; **deployed**), production RTDB URL, Jest suite, `Config.h`/`node_modules` untracked | #1 | `257d811`, `4d2800c`, `07ea2a8`, `644ebb2`, `91a681a`, `5861439` |
| 2b | Local notifications, daily schedules, working Android manual feed, completion evidence, keyboard fix | #2 | `83bf74d`, `7b591d3`, `b763f62`, `902685e` |
| 3 | EEPROM schedules, RTDB restore, Mega UART servicing | #3 | `270c597`, `27834d9` |
| — | Root README | #4 | `63efac6` |
| 4 | ESP32 Wi-Fi reconnect, verified TLS, auth fix, short UART IDs, STATUS-based online, protocol rewrite | #5 | `74034f1`, `63d6266`, `cd9b09e` |
| 5 | Heartbeat-based online status, app name, RTDB schema doc, Claim/Save emulator tests | #6 | `e517efb`, `5100d1d`, `38c60d2` |
| 6 | Audit deliverables A–E, development-status update | this PR | — |

**Production change:** the RTDB rules were deployed to `hyfepoul-dev` on 2026-10-21 06:02 UTC, with explicit approval. The live rules were read back and match the repo. Eight unauthenticated reads are still denied.

## 3. Commands run and results (final run, 2026-10-21 ~10:49 UTC, on the current `main` code)

| Command | Result |
|---------|--------|
| `firebase emulators:exec --only auth,database --project hyfepoul-dev "node backend/functions/scripts/test-rtdb-rules.js"` | **61 passed, 0 failed** |
| `… "node scripts/simulate-esp32.js"` | Pass: command tests, schedule restore R1–R4, UART line tests U1–U4 |
| `… "node scripts/test-mobile-commands.js"` | Pass |
| `… "node scripts/test-e2e-journey.js"` | Pass |
| `… "cd mobile-app && npm test -- --forceExit"` | **3 suites, 30/30** |
| `node scripts/simulate-mega.js` | **34/34** |
| `cd mobile-app && npm run typecheck` | Pass |
| `cd backend/functions && npm run lint` | 0 errors, 3 warnings (unchanged legacy code) |
| `arduino-cli compile --fqbn arduino:avr:mega firmware/arduino-mega/HyFePoul_Arduino` | Pass: 36,826 B flash (14%), 2,428 B RAM (29%) |
| `arduino-cli compile --fqbn esp32:esp32:esp32 firmware/esp32/HyFePoul_ESP32` | Pass: 1,129,472 B flash (86%), 49,592 B RAM (15%) |

**Android emulator sessions** (development build, local Firebase emulators, throwaway accounts) are recorded in `comprehensive-work-plan.md` and summarised in [`mobile-app-completion-matrix.md`](../mobile-app-completion-matrix.md). All checked items passed. One defect found there (the keyboard swallowing the first tap) was fixed and re-verified.

**Not run, and why:**
- No physical prototype was available.
- No physical phone test was done.
- No host C++ compiler was available, so the firmware C++ is compile-checked and logic-simulated only.
- Mobile ESLint is not configured.

## 4. Files changed since the baseline

42 files, +3,107 / −858 lines, not counting the root `node_modules` untracking:
- **Firmware (Mega):**
  - `Config.ino`, `ESP32Communication.ino`, `Feeding.ino`, `HyFePoul.h`, `HyFePoul_Arduino.ino`, `Hydration.ino`, `Nextion.ino`, `Safety.ino`, `TimeManager.ino`, `README.md`;
  - new: `ScheduleStorage.ino`.
- **Firmware (ESP32):** `HyFePoul_ESP32.ino` (rewritten); `Config.h` → `Config.example.h` (template; the real file is gitignored).
- **Firebase:** `database.rules.json`, `backend/functions/scripts/test-rtdb-rules.js`.
- **App:**
  - `app.json`, `eas.json`, `package.json`;
  - `services/firebase.ts`, `context/FirebaseDataContext.tsx`, `navigation/AppNavigator.tsx`;
  - screens: Claim, Dashboard, Feeding, Notifications;
  - `i18n/translations.ts`, `types/rtdb.ts`;
  - new `hooks/useAlertNotifications.ts` (replaces `usePushNotifications.ts`);
  - new `utils/deviceStatus.ts` plus tests;
  - rewritten `services/__tests__/rtdbService.test.ts`.
- **Simulators:** `scripts/simulate-mega.js`, `scripts/simulate-esp32.js`.
- **Docs:**
  - new `README.md`, `comprehensive-work-plan.md`, and the five Phase 6 documents;
  - rewritten `mega-esp32-protocol.md`, `database-schema.md`, `notifications.md`;
  - updated `firmware-build-environment.md`, `hardware-commissioning-procedure.md`, `development-status.md`;
  - `.gitignore` repaired (UTF-16 lines).

## 5. Unresolved issues

Full list with priorities: [`remaining-work-roadmap.md`](../remaining-work-roadmap.md). The most important:
1. **All hardware verification**, including E-stop electrical isolation, calibration, relay and float polarity, the UART link, and real ESP32 sign-in and TLS ([`hardware-integration-test-plan.md`](../hardware-integration-test-plan.md), all `BLOCKED`).
2. **No physical-phone test against production.**
3. **Owner actions:**
   - restrict the API key;
   - rotate the device password if needed;
   - confirm production device provisioning;
   - choose a license;
   - decide on `systemData` retention.
4. **Nextion component mapping** (F14) and the local reset button.
5. **Minor app items:** Water screen refresh and stale label, schedule editor scrolling, unused Firestore initialisation, lint, Tagalog review, sign-out confirmation.
6. **Stale design docs** still describing Firestore and Cloud Functions.

## 6. Next steps

1. Owner: restrict the API key (R-04), confirm `device-001` provisioning in the console (R-14), and rotate the device password if it was ever production (R-05).
2. Small software items that need no hardware: Nextion mapping (R-20), Water screen (R-30), dead Firestore initialisation (R-32), untrack the emulator debug logs (R-38).
3. When the prototype is available: run HIT-01 → HIT-15 in order, starting with electrical readiness and the first real ESP32 sign-in.
4. Install a build on a physical phone and run the app matrix against production (R-13 / HIT-15).
5. After 24 h of real data: decide `systemData` retention (R-22).
