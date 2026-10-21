# HyFePoul — Comprehensive Audit, Fix, and Completion Plan

**Date:** 2026-10-21
**Repository:** https://github.com/Amashing0411/HyFePoul-Arduino (branch `main`, last commit `2ac6bc7`)
**Status of this document:** Phase 0 (baseline) complete; see §1.1. Phase 1 (firmware fixes FW-1 to FW-5) complete in software on branch `phase1-firmware-fixes`; see §2 Phase 1 results. Phase 2 core items (APP-0, RULES-1, APP-1, TEST-1, SEC-1, HYG-1) complete on branch `phase2-rules-app-config`; the rules were deployed to production on 2026-10-21. Physical verification is pending.

This plan merges two inputs:

1. The firmware review (five Mega/ESP32 defects found by reading the source).
2. The full project audit brief: establish the actual state, fix what can safely be fixed without hardware, produce the audit deliverables, and prepare physical commissioning.

## 0. Ground rules (apply to every phase)

- The Mega is the primary controller and the safety authority. The ESP32 only transports data. The app talks only to Firebase.
- Stay on the Firebase Spark (no-billing) plan. No Blaze upgrade, Cloud Functions deployment, Cloud Run, or any service that requires a billing card without explicit approval.
- No destructive Firebase operations. Do not edit production rules, delete accounts, or delete data in order to make a test pass. Diagnose first.
- Never print, copy, or commit secrets: `.env.local` values, device passwords, ID tokens, or Wi-Fi credentials.
- Do not change the Mega–ESP32 protocol silently. Any change is traced through the Mega, ESP32, simulators, protocol doc, and app before it lands.
- Do not mark a physical check as passed without measured evidence. Simulator or emulator results are recorded as "simulated", never as "verified".
- Run the baseline tests before changing code. After each logical change, run targeted tests, then regressions, review the diff, and update the docs.
- Use one commit per logical fix.
- Terminology follows AGENTS.md: use "system data" and "timely system updates", not "telemetry" or "real-time".

## 1. Facts already established (from source inspection, 2026-10-21)

These came from reading the code. They are not test results. Phase 0 re-confirms them.

| # | Finding | Evidence | Severity |
|---|---------|----------|----------|
| F1 | Schedules fire in UTC. The ESP32 sends UTC time (`gmtOffset_sec = 0`), and the Mega RTC holds UTC. The app sends the hour as the user typed it, so 07:00 local becomes 15:00 PHT. | `HyFePoul_ESP32.ino:55`, `Feeding.ino:32`, `FirebaseDataContext.tsx:150` | High |
| F2 | An E-stop during a remote feed leaves `activeRemoteCommandId` set. All later commands are rejected with `SYSTEM_BUSY` until the Mega is reset. | `Feeding.ino:10-15`, `Safety.ino:18-33` | High |
| F3 | The pump timeout does not latch. The pump restarts on the next loop and cycles in 120 s runs. | `Hydration.ino:46-52, 81-94` | High (safety) |
| F4 | The alert queue has one slot, so alerts raised in the same loop are lost. `LOW_WATER` is whitelisted on the ESP32 but never emitted by the Mega. | `ESP32Communication.ino:146`, `HyFePoul_ESP32.ino:350` | Medium |
| F5 | The E-stop auto-releases in software when the button is released, and automation resumes. The Node simulator models a latched E-stop instead, so its passing tests do not reflect the firmware. | `Safety.ino:35-42`, `scripts/simulate-mega.js:285` | High (safety, needs decision) |
| F6 | The mobile app has no production RTDB URL. `EXPO_PUBLIC_FIREBASE_DATABASE_URL` is not set in `.env.local` or in any `eas.json` profile, so the app falls back to `http://127.0.0.1:9000` (the emulator). | `mobile-app/src/services/firebase.ts:21`, `mobile-app/eas.json` | Blocker (app) |
| F7 | Push notifications depend on Cloud Functions. `AppNavigator` calls `usePushNotifications()`, which calls the `registerFcmToken` callable. Deploying Cloud Functions requires Blaze, which conflicts with the no-billing constraint. | `usePushNotifications.ts:60`, `AppNavigator.tsx:73` | High (cost/architecture) |
| F8 | `daysOfWeek` is required by the RTDB rules, but the Mega ignores it. The UI could offer day selection that the device does not honour. | `database.rules.json:104`, 5B.14 report §9 | Medium |
| F9 | Mega schedules are volatile (RAM only), and nothing restores them from `/schedules` after a reset. | `Config.ino:100`, 5B.14 report §4 | High |
| F10 | The ESP32 blocks forever in `setup()` waiting for Wi-Fi and has no reconnect path in `loop()`. | `HyFePoul_ESP32.ino:71-75` | Medium |
| F11 | `firmware/esp32/HyFePoul_ESP32/Config.h` is tracked. Real credentials put there would be committed. | `git ls-files` | High (secrets hygiene) |
| F12 | `node_modules/` at the repo root is committed. | `git ls-files` | Low (hygiene) |
| F13 | `docs/development-status.md` is stale ("ESP32: Pending", "Checkpoint 4F"), and the firmware README describes an outdated `DATA` field list. | — | Low (docs) |
| F14 | The Nextion code uses placeholder component names (`tFeed`…). The real IDs (`t0`–`t7`, `b0`–`b4`) are in `Nextion/Nextion_IDs.txt`, and no button events are handled. `firmware/nextion/` is empty. | `Nextion.ino`, `Nextion_IDs.txt` | Medium |
| F15 | Physical prototype: every row in `docs/hardware-commissioning-log.md` is `PENDING – Hardware unavailable`. The current availability needs confirmation from the team. | commissioning log | Blocker (hardware) |
| F16 | The mobile app has no `test`, `lint`, or `typecheck` npm scripts. Tests run through Jest directly. | `mobile-app/package.json` | Low |
| F17 | A Firebase web API key is committed in `mobile-app/eas.json`. Web API keys are identifiers, not secrets, but the key should be restricted (Android package + SHA-1, allowed APIs) in Google Cloud Console. | `eas.json` | Low–Medium |

### 1.1 Phase 0 baseline results (run 2026-10-21, no code changes)

Environment: Node 22.18.0, firebase-tools 14.12.0, arduino-cli 1.5.2-rc.1 (repo-local `arduino-cli-bin/`), cores `arduino:avr` 1.8.8 and `esp32:esp32` 3.3.12. Java is not on `PATH`, so the emulators were run with `JAVA_HOME` pointed at the Android Studio JBR. No physical Android device is connected (`adb devices` is empty). One AVD (`Medium_Phone_API_36.0`) exists but was not started.

| Suite | Command | Result |
|-------|---------|--------|
| Mega simulator | `node scripts/simulate-mega.js` | PASS (20 `[PASS]` lines; the reports cited 19) |
| ESP32 simulator | `firebase emulators:exec --only auth,database "node scripts/simulate-esp32.js"` | PASS (fails with `ECONNREFUSED` without emulators) |
| RTDB rules | `firebase emulators:exec ... "node backend/functions/scripts/test-rtdb-rules.js"` | PASS, 53 passed / 0 failed |
| Mobile command tests | `firebase emulators:exec ... "node scripts/test-mobile-commands.js"` | PASS |
| E2E journey | `firebase emulators:exec ... "node scripts/test-e2e-journey.js"` | PASS |
| Mobile Jest | `firebase emulators:exec ... "cd mobile-app && npx jest --runInBand --forceExit"` | **FAIL: 8 failed / 18 passed.** `rtdbIntegration.test.ts` passes. All 8 failures are in `rtdbService.test.ts`, which writes to `/` unauthenticated and gets `PERMISSION_DENIED` under the current rules. The test is stale; this is not an app defect (F20). |
| Mobile type-check | `cd mobile-app && npx tsc --noEmit` | PASS |
| Mobile lint | — | NOT AVAILABLE. ESLint is not installed or configured in `mobile-app` (F21). |
| Backend lint | `cd backend/functions && npm run lint` | PASS (0 errors, 3 warnings) |
| Mega compile | `arduino-cli compile --fqbn arduino:avr:mega ...` | PASS. Flash 35,352 B (13%), RAM 2,296 B (28%) |
| ESP32 compile | `arduino-cli compile --fqbn esp32:esp32:esp32 ...` | PASS. Flash 1,051,204 B (80%), RAM 49,344 B (15%) |
| Owner device query probe | scratch script under emulators, not committed | **FAIL:** direct read of `devices/device-001` OK; `query(devices, orderByChild('ownerId'), equalTo(uid))` gives `Permission denied` (F18). |
| Deployed rules vs repo | — | NOT VERIFIED. Comparing them needs authenticated access to production; check in the Firebase console. |
| App on device or emulator | — | NOT RUN. No device is connected and the production RTDB URL is not configured (F6). |

Side effect: the emulator runs modify the tracked `database-debug.log` (already modified before this phase).

### 1.2 New findings from Phase 0

| # | Finding | Evidence | Severity |
|---|---------|----------|----------|
| F18 | The app cannot discover owned devices. `rtdbService.getDevicesByOwner()` queries `/devices` by `ownerId`, but the rules define `.read` only at `devices/$deviceId`, so the query is denied. `AuthContext` then sets `ownershipError`, and a claimed device never appears. No test covers this query, which is how 53/53 rules tests and the E2E run passed. | emulator probe; `rtdbService.ts:134`; `database.rules.json:15-18` | **Blocker (app)** |
| F19 | A stale command cannot be failed. The rules allow `queued → acknowledged` only, but the ESP32 writes `queued → failed` (`STALE_COMMAND`). That write is denied, so the stale command stays `queued` and is re-read and re-rejected on every 5 s poll. | `database.rules.json` status `.validate`; `HyFePoul_ESP32.ino:426` | Medium |
| F20 | `rtdbService.test.ts` (8 tests) predates the current rules and fails. | Jest log | Low (test debt) |
| F21 | The mobile app has no ESLint. `firebase.ts` still initialises Firestore and Functions, and `AuthContext.tsx` has an unused Firestore import. These are leftovers from the legacy pipeline; the active data path is RTDB only. | `mobile-app/package.json`, `firebase.ts:5-6,34-37`, `AuthContext.tsx:3` | Low |
| F22 | `MockDataContext` is not mounted in `App.tsx` and not imported by any screen. It is dormant. | grep | Info |

## 2. Phases

### Phase 0 — Baseline audit (no code changes)

**Goal:** a fresh, evidence-backed baseline before touching code.

1. Record the Git state: branch, uncommitted files (`database-debug.log`, `arduino-cli-bin/`, `arduino-cli.zip`), and remote sync.
2. Inventory active versus legacy paths:
   - Active: RTDB rules, RTDB services, ESP32 REST.
   - Legacy: Firestore rules, `backend/functions` (Firestore and FCM controllers), `MockDataContext`.
   - For each, record whether anything still imports or calls it.
3. Confirm the Firebase target for each component: the app (env and `eas.json`), ESP32 `Config.h`, `.firebaserc`, and the scripts. The intended target is `hyfepoul-dev`, `hyfepoul-dev-default-rtdb`, region `asia-southeast1`.
4. Compare the deployed RTDB rules with `database.rules.json`, read-only (`firebase database:get`-style read of the rules, or a console check). Do not deploy.
5. Run the baseline tests. Phase 0 confirms the exact commands from the scripts and docs and records any that need emulators:

   | Suite | Command (to confirm) | Needs |
   |-------|---------------------|-------|
   | RTDB rules (53) | `firebase emulators:exec --only auth,database "node backend/functions/scripts/test-rtdb-rules.js"` | Emulators (Java) |
   | Mobile tests (13) | `cd mobile-app && npx jest` | — |
   | Mobile type-check | `cd mobile-app && npx tsc --noEmit` | — |
   | Backend lint | `cd backend/functions && npm run lint` | — |
   | Mega simulator (19) | `node scripts/simulate-mega.js` | — |
   | ESP32 simulator | `node scripts/simulate-esp32.js` | — |
   | E2E journey | `firebase emulators:exec --only auth,database "node scripts/test-e2e-journey.js"` | Emulators |
   | Mega compile | `arduino-cli-bin/arduino-cli.exe compile --fqbn arduino:avr:mega firmware/arduino-mega/HyFePoul_Arduino` | AVR core, RTClib, HX711 |
   | ESP32 compile | `arduino-cli-bin/arduino-cli.exe compile --fqbn esp32:esp32:esp32 firmware/esp32/HyFePoul_ESP32` | ESP32 core, ArduinoJson |
   | App startup | `cd mobile-app && npx expo start` (development client) | Android device or emulator |

6. Check whether an Android emulator or physical device is available (`adb devices`). If none is, record that as a limitation.

**Exit:** a baseline table (command → result → date) recorded in deliverable E.

### Phase 1 — Firmware safety and correctness fixes (software only)

Each fix gets one commit, updates `scripts/simulate-mega.js` so it mirrors the C++, adds one simulator test, and recompiles both boards.

| ID | Fix | Files |
|----|-----|-------|
| FW-1 (F2) | Add a `finishRemoteCommand(status, reason)` helper. Call it from `handleSafety()` when the E-stop trips during a remote feed, and use it to replace the three duplicated clean-up blocks in `runActiveFeeding()`. | `Safety.ino`, `Feeding.ino`, `ESP32Communication.ino` |
| FW-2 (F3) | Add a pump fault latch `waterPumpFaultLatched`. `startWaterPump()` refuses while it is set. It clears when the high float switch trips or on an E-stop reset. | `Config.ino`, `Hydration.ino`, `Safety.ino` |
| FW-3 (F4) | Replace the single alert slot with a 4-slot `const char*` alert queue, sending one alert per loop and warning on overflow. Emit `LOW_WATER` only when the water is low and the pump cannot refill (E-stop active or fault latched). | `Config.ino`, `ESP32Communication.ino`, `Hydration.ino` |
| FW-4 (F1) | Keep the RTC, logs, and `DATA` in UTC, as the protocol doc requires. Add `LOCAL_UTC_OFFSET_MINUTES = 480` and a `getLocalDateTime()` helper, and use it only for schedule matching (including the day rollover) and the Nextion clock. No protocol or app change is needed. | `Config.ino`, `TimeManager.ino`, `Feeding.ino`, `Nextion.ino`, `HyFePoul.h`, `docs/mega-esp32-protocol.md` |
| FW-5 (F5) | **Decision gate D1.** Latch the E-stop: releasing the button only clears `emergencyButtonPressed`, and the latch clears through remote `ESTOP_RELEASE`. A serial `RESET` provides a bench-test path; a Nextion reset button follows in Phase 5. | `Config.ino`, `Safety.ino`, `ESP32Communication.ino` |

**Exit:** both boards compile, all old and new simulator tests pass, and the change in Mega RAM use is recorded.

**Phase 1 results (2026-10-21):** DONE in software. NOT physically verified.

| ID | Commit | Simulator test |
|----|--------|----------------|
| FW-1 | `f6ed0fb` | 20 |
| FW-2 | `8540a05` | 21 |
| FW-3 | `1f24748` | 22, 23, 24 |
| FW-4 | `d5f1992` | 25 |
| FW-5 | `94d15f1` | 26, 27 |

- `node scripts/simulate-mega.js`: 28/28 PASS (the 20 original tests plus 8 new).
- Mega compile: PASS. Flash 36,382 B (14%), up from 35,352 B. RAM 2,390 B (29%), up 94 B from 2,296 B.
- ESP32 compile: PASS, unchanged (no ESP32 source changes in Phase 1).
- Bench checks for these fixes were added to `docs/hardware-commissioning-procedure.md` §6, steps 11–14.
- Still open from FW-5: the Nextion `b4` reset button (Phase 5).

### Phase 2 — Application blockers and cost compliance

| ID | Task | Files | Notes |
|----|------|-------|-------|
| APP-0 (F18) | **Decision gate D6 (rules change).** Add a query-scoped read at `/devices`: `".read": "auth != null && query.orderByChild == 'ownerId' && query.equalTo == auth.uid"`. Add rules tests showing an owner's own query is allowed, a query for another uid is denied, and an unfiltered read is denied. Deploying to production is a separate approval. | `database.rules.json`, `backend/functions/scripts/test-rtdb-rules.js` | Without this, no owner can use the app. |
| RULES-1 (F19) | **Decision gate D6.** Allow `queued → failed` for the device identity only, with a rules test. | `database.rules.json`, rules tests | Alternative without a rules change: the ESP32 does `acknowledged` then `failed`. That is more writes and misreports the lifecycle. |
| TEST-1 (F20) | Fix `rtdbService.test.ts` so it seeds and clears through emulator-admin access (as `rtdbIntegration.test.ts` does) instead of unauthenticated root writes. | `mobile-app/src/services/__tests__/rtdbService.test.ts` | — |
| APP-1 (F6) | Add `EXPO_PUBLIC_FIREBASE_DATABASE_URL=https://hyfepoul-dev-default-rtdb.asia-southeast1.firebasedatabase.app` to `.env.local` (local only) and to the `eas.json` development, preview, and production profiles. Make the production path fail loudly instead of silently falling back to `127.0.0.1`. | `mobile-app/src/services/firebase.ts`, `mobile-app/eas.json` | Verify by reading `/devices/device-001` as the owner on a real device. |
| APP-2 (F7) | **Decision gate D2.** Remove the `registerFcmToken` dependency from the active navigation path, or guard it so it is a no-op when Cloud Functions are unavailable. Present the Notifications screen as an **in-app alert feed** in the UI and the docs. Possible no-billing alternative: local notifications raised while the app is running in response to RTDB alert listeners. Delivery while the app is closed is documented as not available on Spark. | `AppNavigator.tsx`, `usePushNotifications.ts`, `NotificationsScreen.tsx`, `docs/notifications.md` | Do not delete the backend functions code; mark it legacy and document how to roll back. |
| APP-3 (F8) | Make `daysOfWeek` honest. Either the Mega honours it (FW extension: add a `DOW:` field to `SCHEDULE_SET` and a weekday check), or the app hides day selection and always writes all days. **Decision gate D3.** | `FeedingScreen.tsx`, possibly the protocol and Mega | Recommended: hide it for the prototype. That needs no protocol change. |
| APP-4 | Make sure a `completed` command is shown with the evidence it actually has: the Mega reports `TARGET_REACHED`, but the final dispensed weight is not reported. Show the latest `feedWeightGrams` next to the completion, or label it "device reported complete". | `FeedingScreen.tsx`, possibly the `CMD_DONE` payload | Changing the `CMD_DONE` payload is a protocol change, so trace it first. |
| SEC-1 (F11) | Untrack `Config.h` and add `Config.example.h` plus a `.gitignore` entry. Update the build doc. | `firmware/esp32/...`, `.gitignore`, `docs/firmware-build-environment.md` | Do this before any real credentials go into the file. |
| SEC-2 (F17) | Recommend restricting the web API key in Google Cloud Console (owner action; no code). | — | Approval needed, since it is an account change. |
| HYG-1 (F12) | Untrack the root `node_modules/` (`git rm -r --cached`) and add it to `.gitignore`. | `.gitignore` | Only removes it from the index; local files stay. |

**Phase 2 results (2026-10-21, branch `phase2-rules-app-config`, stacked on `phase1-firmware-fixes`):**

| ID | Commit | Status |
|----|--------|--------|
| APP-0 (F18) | `257d811` | DONE. Deployed to production 2026-10-21; see below. |
| RULES-1 (F19) | `257d811` | DONE. Deployed to production 2026-10-21; see below. |
| APP-1 (F6) | `4d2800c` | DONE. The production URL was confirmed read-only: the regional host answers `Permission denied` to unauthenticated requests, while the legacy `firebaseio.com` host returns 404. `.env.local` was updated locally (gitignored). Not yet run on a device. |
| TEST-1 (F20) | `07ea2a8` | DONE |
| SEC-1 (F11) | `644ebb2` | DONE. The old values remain in git history. |
| HYG-1 (F12) | `91a681a` | DONE. Index-only removal; restore with `npm install` at the repo root. |
| APP-2, APP-3, APP-4, SEC-2 | — | NOT STARTED |

New rules tests: owner device query (own uid allowed; other uid, unfiltered read and unauthenticated access denied) and stale commands (device `queued → failed` allowed; owner, other device, and `queued → completed` denied). Against the previous rules, the two positive cases fail, so the tests do detect the change.

**Production deploy (approved by the owner, 2026-10-21 06:02 UTC):**
- `firebase deploy --only database --project hyfepoul-dev`, from branch `phase2-rules-app-config` with `database.rules.json` at `257d811`. A dry run first confirmed valid syntax for `hyfepoul-dev-default-rtdb`, and the deploy reported "released successfully".
- **Verified:** the live rules, read back read-only with `firebase database:get /.settings/rules`, match `database.rules.json` (whitespace-insensitive comparison). Both new clauses are present.
- **Verified:** eight unauthenticated REST reads still return `Permission denied`: `/devices`, the `ownerId` query on `/devices`, `devices/device-001`, `deviceSecrets`, `commands`, `schedules`, `alerts`, and `systemData` for `device-001`.
- **Not verified in production:** an owner signing in and finding their device, and the ESP32 failing a stale command. Both need real account credentials. The owner check happens in Phase 5 (app on a phone); the ESP32 check happens in Phase 7.
- **Rollback:** use the rules history in the Firebase console (Realtime Database → Rules). The repo's previous version is `git show 2ac6bc7:database.rules.json`. It was never confirmed that production matched that file before this deploy.

Regression after Phase 2:

| Suite | Result |
|-------|--------|
| RTDB rules | 61/61 PASS (53 + 8 new) |
| Mobile Jest (`npm test` under emulators) | 25/25 PASS (was 18 pass / 8 fail) |
| ESP32 simulator, mobile commands, E2E journey | PASS |
| Mega simulator | 28/28 PASS |
| Mobile `tsc --noEmit` | PASS |
| Backend lint | PASS (0 errors, 3 warnings) |
| Mega and ESP32 compile | PASS. `Config.example.h` also compiles when copied to `Config.h`. |

### Phase 3 — Schedule persistence and recovery

**Trace first. Do not implement until the trace is written down.**

1. Map the current state: what happens on an app restart, an ESP32 reconnect, a Mega reset, and a power loss. Record where each piece of truth lives (RTDB, Mega RAM).
2. Proposed smallest safe design (**decision gate D4**):
   - **Mega:** store `feedSchedules[]` in EEPROM with a version byte and checksum. Load it at boot and fall back to defaults if the checksum fails. This keeps offline schedules running after a power loss without needing the network.
   - **Restore:** when the ESP32 sees `EVENT|SYSTEM_START` from the Mega, or on its own boot, it reads `/schedules/{deviceId}` and sends one `SCHEDULE_SET` per slot over UART. Device-initiated restores use synthetic local IDs (for example `RESTORE-<idx>`) and are not written to `/commands`. `SCHEDULE_SET` is already idempotent (it overwrites a slot), so repeats are safe.
   - **Confirmation:** let the app tell "saved in cloud" apart from "confirmed on device". The device would write a per-slot `appliedAt` or a hash under a device-writable path. That needs a rules change plus new rules tests, so it requires explicit approval.
3. Note: `SYSTEM_START` is currently logged to SD but **not** sent to the ESP32 (`Config.ino:191` only calls `logEventToSD`). Sending it is part of this phase.

**Exit:** a simulated reboot test shows schedules restored from both EEPROM and RTDB with no duplicate feeding.

### Phase 4 — ESP32 robustness

| ID | Task |
|----|------|
| ESP-1 (F10) | Non-blocking Wi-Fi connect and reconnect, re-authenticating after reconnect. Send `STATUS|ONLINE` and `STATUS|OFFLINE` to the Mega (the Mega already parses them). |
| ESP-2 | Audit TLS. Confirm whether `HTTPClient.begin(https)` validates certificates on the installed core. If it does not, pin the Google root CA bundle. |
| ESP-3 | Audit the token. `idToken` is sent in the URL query (`?auth=`), which is the standard RTDB REST method. Make sure it is never echoed in serial logs. |
| ESP-4 | Make sure the HTTP calls cannot starve the UART buffer. Measure the worst-case loop time and the UART RX buffer size (set `setRxBufferSize` if needed). |
| ESP-5 | Reconcile the protocol doc, firmware README, and both parsers so the `DATA` field list, line endings, and max line lengths match. |

### Phase 5 — Mobile app completion audit (screen by screen)

For Login, Registration, Claim Device, Dashboard, Feeding, Water, History, Notifications, and Settings, check against the brief's §4 checklist:
- Auth errors and session restore.
- The claim flow, including a second account being denied.
- Stale and offline indicators based on `lastHeartbeat`.
- The command lifecycle and duplicate-submit prevention.
- History in PHT with bounded queries.
- No mock fallbacks in production.
- Destructive-action confirmations, touch targets, and listener clean-up on sign-out.

Fix issues found here in order of user impact. Record them in deliverable C.

Also in this phase:
- Nextion (F14): map `t0`–`t7` to real values. Handle `b3 Stop` as a software stop request and `b4 Start` as the E-stop reset, subject to D1. Leave `b0`/`b2` (schedule and weight entry) as a scoped follow-up.
- Add `test`, `typecheck`, and `lint` scripts to `mobile-app/package.json` (F16).

### Phase 6 — Documentation deliverables

| ID | File | Content |
|----|------|---------|
| A | `docs/current-project-status-audit.md` | Architecture, feature status (implemented, partial, simulated, blocked, unverified), defects, and readiness per subsystem. |
| B | `docs/remaining-work-roadmap.md` | Every task in this plan plus anything Phase 0 or 5 finds, with ID, dependencies, files, test procedure, acceptance criteria, status, and whether hardware is required. |
| C | `docs/mobile-app-completion-matrix.md` | The screen-by-screen matrix. |
| D | `docs/hardware-integration-test-plan.md` | The 20-step commissioning plan from §8 of the brief, with columns for test ID, preconditions, procedure, expected, actual, status, evidence, and corrective action. Extends the existing `hardware-commissioning-procedure.md` and log rather than duplicating them. |
| E | `docs/checkpoint-current-status-report.md` | Baseline, commands run, results, files changed, open issues. |
| — | `docs/development-status.md` | Rewritten to the real state (F13). |

### Phase 7 — Physical commissioning (BLOCKED until hardware is confirmed available)

This follows deliverable D. The order is logic first and actuators last:

1. Wiring and power checks.
2. Mega 5 V TX → ESP32 3.3 V RX level shifting.
3. Boot with actuators disconnected.
4. UART, RTC, SD, and Nextion.
5. Load cell calibration with known weights. The current `-7050.0f` is a placeholder.
6. Ultrasonic empty and full distances.
7. Float switch polarity.
8. Relay polarity and NO/NC wiring.
9. Supervised actuator runs.
10. E-stop: software detection and electrical isolation tested **separately**.
11. Local schedule.
12. Network loss and recovery.
13. Live app state and commands.
14. Power-loss recovery, including schedule restore from Phase 3.

Every bench check for the Phase 1 fixes (E-stop during a remote feed, holding the low float for more than 120 s, simultaneous alerts, schedule at 07:00 PHT) is added to D.

## 3. Decision gates (need your answer before that step)

| Gate | Question | Decision (2026-10-21) |
|------|----------|----------------------|
| D1 | Latch the E-stop in software, and how should it be reset locally? | **DECIDED:** latch it. Reset through remote `ESTOP_RELEASE` plus the Nextion `b4` button, with a serial `RESET` for bench testing. |
| D2 | Push notifications without Blaze? | **DECIDED:** in-app alert feed plus local notifications while the app is running. Delivery while the app is closed is documented as not available on Spark. |
| D3 | Days of week: honour on the Mega, or hide in the app? | **DECIDED:** hide in the app; schedules run daily. No protocol change. |
| D4 | Schedule persistence: EEPROM, RTDB restore, and device confirmation path (rules change)? | **DECIDED:** EEPROM plus RTDB restore. The device confirmation path is deferred until a rules review. |
| D5 | Untrack `node_modules/` and `Config.h` (index-only removals)? | **DECIDED and DONE** (Phase 2). |
| D6 | RTDB rules changes APP-0 (owner device query) and RULES-1 (`queued → failed`)? Repo and tests first, production deploy as a separate step. | **DECIDED and DONE:** in the repo with tests (Phase 2), and deployed to production with approval on 2026-10-21. |

## 4. Order of execution

Phase 0 → Phase 1 (FW-1 to FW-4, then FW-5 after D1) → Phase 2 → Phase 3 (after D4) → Phase 4 → Phase 5 → Phase 6 (written progressively, finalised last) → Phase 7 when hardware is available.

Phases 1, 2, and 4 touch separate files and could run in parallel. Phase 3 depends on Phase 1 (it touches `Config.ino` and the protocol) and on Phase 4's ESP-5.

## 5. What "done" means

- **Software-complete:** all non-hardware tasks are DONE, all suites pass on a recorded date, and the app is installed on a physical Android phone and works against production RTDB (login, claim, live state, commands, alerts, restart).
- **System-verified:** every Phase 7 row has measured evidence. Until then, the project status stays "software-complete, physically unverified".
