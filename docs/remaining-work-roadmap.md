# HyFePoul: Remaining Work Roadmap

**As of:** 2026-10-27. Updated for the moving-hopper design revision ([`design-revision-moving-hopper.md`](design-revision-moving-hopper.md)): chain motor, 5 tray load cells, gravity water, no pump. Earlier baseline: `main` at `c0dc92b`. See [`current-project-status-audit.md`](current-project-status-audit.md) for the current state and [`comprehensive-work-plan.md`](comprehensive-work-plan.md) for history.

Tasks are ordered by priority: **P1** safety and security, **P2** blockers for a working system, **P3** integration quality, **P4** usability and docs, **P5** optional. Status is one of `DONE`, `IN PROGRESS`, `BLOCKED` or `NOT STARTED`. **HW** = needs the physical prototype.

## P1: Safety and security

| ID | Subsystem | Description | Why | Depends on | Files likely to change | Test procedure | Acceptance criteria | Status | HW |
|----|-----------|-------------|-----|-----------|------------------------|----------------|---------------------|--------|----|
| R-01 | Hardware / safety | Verify whether the E-stop **electrically** cuts actuator power, separately from software detection | Software latching cannot stop a welded relay or a firmware fault | R-10 | `hardware-commissioning-log.md` (evidence); wiring docs | `hardware-integration-test-plan.md` HIT-06 | Pressing the E-stop de-energises the chain and dispenser motors with the Mega's relay outputs forced HIGH (bench check), or the limitation is documented | BLOCKED | Yes |
| R-02 | Firmware / safety | Bench-verify the latching E-stop, the E-stop during a feed cycle, the limit switches, the chain relay interlock and the chain/tray timeouts | Phase 1 fixes are simulated only | R-10 | none expected | HIT-06, HIT-07 (commissioning procedure §6 steps 11–14, §7) | All behaviours match the procedure | BLOCKED | Yes |
| R-03 | ESP32 / security | First Firebase sign-in and TLS certificate verification | F27 would have broken every write; TLS was off before Phase 4 | R-10, dedicated production device account | `HyFePoul_ESP32.ino` only if it fails | HIT-03 (procedure §5 steps 16–17) | `Auth successful. UID: …` matching `deviceAuthUid`, state writes return 200, and an intercepted HTTPS connection fails | PARTIAL: production REST sign-in, UID match, and authenticated binding read pass; on-device TLS/state-write checks remain blocked until Wi-Fi is configured and hardware is available | Yes |
| R-04 | Firebase / security | Review and narrow the shared Firebase API key restrictions without breaking either client | The production key is shared by the Expo Firebase JavaScript SDK and ESP32 REST; its Android restriction does not match this APK and 27 APIs are allowlisted | none | `mobile-app/src/services/firebase.ts`, local ESP32 `Config.h` | Test a candidate API allowlist with Auth (`identitytoolkit.googleapis.com`, `securetoken.googleapis.com`) and ESP32 direct RTDB (`firebasedatabase.googleapis.com`) before changing the production key | Mobile Auth/token refresh and ESP32 Auth/RTDB still work; unrelated APIs are rejected | PARTIAL: separate candidate with the three approved API targets and no application restriction passed SDK Auth, token refresh, SDK RTDB read, and ESP32-style REST read. Production key/configs remain unchanged; adoption is pending. | No |
| R-05 | Firebase / security | Rotate the device-account password if the value once committed in `Config.h` was used in production | It remains in git history | none | local `Config.h` only | Sign in with the new password from the ESP32 | Old password rejected | NOT STARTED (owner action) | No |
| R-06 | Ops / security | Keep ESP32 Core Debug Level at **None** for deployments | Debug/Verbose logs URLs containing the ID token | none | build settings | Compile and check for the `#warning` | No token-logging warning | DONE in code (`#warning`); enforce per build | No |

## P2: Blockers for a working system

| ID | Subsystem | Description | Why | Depends on | Files likely to change | Test procedure | Acceptance criteria | Status | HW |
|----|-----------|-------------|-----|-----------|------------------------|----------------|---------------------|--------|----|
| R-10 | Hardware | Electrical readiness: wiring vs pins, power rails, grounds, fuses, **5 V → 3.3 V level shifting** on Mega TX → ESP32 RX | Prerequisite for every hardware test | Prototype available | `hardware-assumption-matrix.md` (findings) | HIT-01 | All rows measured and logged | BLOCKED | Yes |
| R-11 | Hardware | Load-cell calibration (replace placeholder `-7050.0f`). Bench console `TARE`/`CAL`/`FACTORS` ready (procedure §7a). | Feed targets depend on it | R-10 | `Config.ino` (`LOAD_CELL_CALIBRATION_FACTOR`) | HIT-08 with known weights | Error ≤ an agreed tolerance across the 50–2000 g range | BLOCKED | Yes |
| R-12 | Hardware | Ultrasonic empty/full distances; float switch polarity; relay polarity and NO/NC | Placeholders in `Config.ino` / `Hydration.ino` | R-10 | `Config.ino`, `Hydration.ino`, `Feeding.ino` | HIT-09, HIT-10, HIT-11 | Readings and actuator states match the physical state | BLOCKED | Yes |
| R-13 | App / backend | Install a build on a **physical Android phone** against production: owner sign-in, owned-device discovery (deployed APP-0 rule), live state, a command round trip, notifications | Never done against production | Production device provisioned (R-14); device round trip still requires working ESP32 credentials and hardware | `mobile-app` only if defects appear | HIT-15, plus the app matrix manual checks | All matrix rows marked "Phone: PASS" | NOT STARTED | Partly (the round trip needs the device) |
| R-14 | Firebase | Confirm production provisioning of `device-001`: device Auth account, `devices/device-001/deviceAuthUid`, `deviceSecrets/device-001/setupPin` | Required for the ESP32 and for claiming | none | none (console) | Read-only checks in the console | All three present and consistent | DONE 2026-10-27: account email matches local `Config.h`, UID match verified, PIN stored as a string; secret omitted from docs | No |
| R-16 | Hardware / firmware | Decide what the load cell weighs | Resolved by the moving-hopper revision: one load cell under each tray weighs the feed dispensed into it | Design decision | `Feeding.ino` | HIT-08, HIT-16 | Feeding logic matches the arrangement | DONE (design revision 2026-10-23) | Verify: Yes |
| R-15 | Integration | Mega ↔ ESP32 UART on hardware: `DATA`/`EVENT`/`TIME`/`STATUS`/commands, plus the F26 line-integrity measurement | All protocol work is simulated | R-10 | firmware only if defects appear | HIT-04, HIT-05 | No `UART_TIMEOUT` over 30 app commands; restore completes after a Mega reset | BLOCKED | Yes |

## P3: Integration quality

| ID | Subsystem | Description | Why | Depends on | Files likely to change | Test procedure | Acceptance criteria | Status | HW |
|----|-----------|-------------|-----|-----------|------------------------|----------------|---------------------|--------|----|
| R-20 | Firmware | Nextion: map the real component IDs (`t0`–`t7`), handle `b3 Stop` and `b4 Start` (local E-stop reset, D1), keep the one-field-per-update pacing (F14) | Display shows nothing correct today; no local reset | none (code); R-10 to verify | `Nextion.ino`, `Safety.ino`, `Nextion/Nextion_IDs.txt` | Mega simulator test for the reset path; HIT-12 | Fields update; `b4` resets the latch only when the button is released | IN PROGRESS: code done (`85053de`, sim tests 34–35); button IDs disabled until read on the bench (procedure §9 "Nextion buttons") | Verify: Yes |
| R-21 | Firmware | Non-blocking HX711 read while feeding | Blocking reads risked overshoot and UART loss | R-11 for tuning | `Feeding.ino` | Simulator; HIT-08/HIT-16 overshoot measurement | Overshoot within tolerance; loop time measured | DONE in code (single sample per loop when ready, non-blocking per-tray tare); overshoot to be measured | Verify: Yes |
| R-22 | Data | `systemData` retention and monthly progress for the owner | About 3 MB/day, unbounded | none | Mega, ESP32, rules, app | Mega sim 47–51; ESP32 sim; rules tests; Jest | History bounded; owner sees monthly totals | DONE in software (branch `monthly-logs`): history every 5 min plus feed start/end (~0.1 MB/day); Mega SD logs one file per month (`HFyyyymm.CSV`, ~9 MB) with 24-month cleanup; Mega counts daily totals (EEPROM) and sends `SUMMARY`; ESP32 writes `dailySummary/{id}/{date}`; app History → Monthly view. Rules change ships with R-45 | Verify: Yes |
| R-23 | App + firmware | Alert resolution (F24): the Mega sends clear events (`LOW_FEED_CLEARED`, `LOW_WATER_CLEARED`, `EMERGENCY_STOP_RELEASED`, `FEEDING_COMPLETED`, plus boot clears); the ESP32 marks the matching alert `resolved` with `resolvedAt`; the app lists active alerts first | Alerts stayed "last reported" forever | none | Mega, ESP32, rules, app | Mega sim 38–41; ESP32 sim; rules tests; e2e | Cleared conditions show as resolved | DONE in software (branch `r23-alert-resolution`); the alert rules change ships with R-45 | Verify: Yes |
| R-24 | ESP32 | Track Mega link health on the ESP32: no line for 30 s → `devices/{id}/megaLinkOk = false` and a `CONTROLLER_OFFLINE` alert, both cleared when the Mega is heard again; the app shows "NOT RESPONDING" and blocks manual feed | The app showed the device online with frozen values when the Mega stopped | R-23 | `HyFePoul_ESP32.ino`, rules, app | ESP32 sim; rules tests; Jest | Silence detected and shown | DONE in software (branch `r24-mega-link-health`); the rules change ships with R-45 | Verify: Yes |
| R-25 | System | Power-loss and network-loss scenarios end to end | Recovery is designed but unproven | R-15 | none expected | HIT-14 | Matches expected recovery in each scenario | BLOCKED | Yes |

## P4: Usability and documentation

| ID | Subsystem | Description | Why | Depends on | Files likely to change | Test procedure | Acceptance criteria | Status | HW |
|----|-----------|-------------|-----|-----------|------------------------|----------------|---------------------|--------|----|
| R-30 | App | Water screen: use `deviceOnline`/`nowMs` for stale status; make refresh real or remove it | Inconsistent with the Dashboard | none | `WaterScreen.tsx` | Emulator | Stale/offline status matches the Dashboard | DONE (`be9d714`; also fixes an endless skeleton on listener error). Not yet opened on the emulator | No |
| R-31 | App | Scroll the schedule editor into view when it opens | It opens under the tab bar | none | `FeedingScreen.tsx` | Emulator | Save visible without scrolling | DONE (`95c3761`; verified on the emulator: Save fully above the tab bar) | No |
| R-32 | App | Remove the unused Firestore/Functions initialisation and imports (F21) | Dead code; extra bundle | none | `services/firebase.ts`, `AuthContext.tsx` | `tsc`, Jest, emulator smoke test | No Firestore/Functions imports in `src` | DONE (`47e8006`; tsc + Jest 30/30) | No |
| R-33 | App | Mobile ESLint config and `lint` script (F16) | No linting today | none | `mobile-app/package.json`, eslint config | `npm run lint` | Runs clean or with a documented baseline | DONE (`6f42a08`; `npm run lint`: 0 errors, 3 documented `set-state-in-effect` warnings) | No |
| R-34 | App | Tagalog strings reviewed by a native speaker | Strings written without review | none | `i18n/translations.ts` | Review | Approved | NOT STARTED | No |
| R-35 | App | Confirmation before sign-out | Destructive-ish action without a prompt | none | `SettingsScreen.tsx` | Emulator | Prompt shown | DONE (`95c3761`; verified on the emulator: Cancel keeps the session, confirm signs out) | No |
| R-36 | Docs | Rewrite or retire `architecture.md`, `api-contract.md`, `firebase-backend-architecture.md` (they describe Firestore/Cloud Functions) | Misleading for thesis readers | none | those files | Review | Match the RTDB architecture, or marked historical | DONE (`add265d`: architecture.md rewritten; the other two marked historical) | No |
| R-37 | Repo | Choose a project license | None exists | Group decision | `LICENSE`, `README.md` | none | License file present | NOT STARTED (owner) | No |
| R-38 | Repo | Stop tracking `database-debug.log` and `firestore-debug.log` | Emulator runs keep modifying them | none | `.gitignore` | `git status` after an emulator run | Clean | DONE (`bdad629`; tree clean after a full emulator run) | No |

## Moving-hopper revision follow-ups

| ID | Subsystem | Description | Why | Status | HW |
|----|-----------|-------------|-----|--------|----|
| R-45 | Firebase | Deploy the revised RTDB rules (`state` now requires the tray fields and rejects `waterHigh`/`pumpActive`; schedule target ≤ 1000 g per tray; alert records validated and readable by the device for R-23; `megaLinkOk` for R-24; `state.timeSource` for R-44; `scheduleStatus` for R-43; `dailySummary` for R-22) | **Breaking:** old firmware cannot write the new rules' state shape. Flash compatible firmware before connecting the prototype to production | DONE 2026-10-27: reviewed repository rules deployed successfully to `hyfepoul-dev`; physical compatibility remains to be checked during commissioning | No |
| R-46 | Firmware | Tune `TRAY_TRAVEL_MS`, `TRAY_DISPENSE_TIMEOUT_MS`, `CHAIN_END/HOME_TIMEOUT_MS` on the bench (open items O-1, O-4). Bench console `HOME`/`JOG` ready to time each tray (procedure §7a). | Placeholders; timed travel must stop the outlet over each tray | BLOCKED | Yes |
| R-47 | Docs | Update the block diagram: 5 load cells / 5 HX711, 2 limit switches, chain motor with 2 relays, no pump (open item O-2) | Thesis figures must match the design | DONE: `docs/diagrams/hyfepoul-block-diagram.png` + `.svg`, generated by `make_block_diagram.py` in the same style as the original | No |
| R-48 | HMI | Rename the Home page caption `t0` from "Hopper Load:" to "Feed in Trays:" (t2 now shows feed in the 5 trays) | Label no longer matches | DONE IN SOFTWARE 2026-10-27: changed `t0` to "Feed in Trays:" in the HMI project; Nextion compile passed with 0 errors and 0 warnings. Physical display appearance not checked (no hardware available). | No |
| R-49 | App | Open the revised Feeding (tray weights, cycle step), Water (reservoir) and Dashboard screens on the Android emulator | Changed screens are covered by tsc, lint and Jest only | DONE 2026-10-23 on the Android emulator: Dashboard, Feeding (tray boxes, cycle step, per-tray schedule editor, 1000 g worst case), Water (OK and Refill Needed), Notifications (new alerts + phone notification). Fixed: tray box unit wrapped onto its own line | No |
| R-50 | Firebase data | Existing `/schedules` hold totals (e.g. 500 g) that the Mega now reads as grams **per tray**; the rules reject > 1000 g. Re-save each schedule in the app (default 50 g) after deploying R-45 | Otherwise one feed could dispense 5× the intended amount | DONE: checked 2026-10-23, production `/schedules` is empty, so nothing to convert. New schedules are entered per tray by the owner | No |
| R-51 | Firmware / safety | Watchdogs: Mega AVR watchdog (2 s; relays OFF at boot; `WATCHDOG_RESET` on SD; `WDTEST` bench check), ESP32 task watchdog (60 s per request/loop); I2C timeout on the RTC bus | A hung program could leave a motor running | DONE in software (branch `firmware-robustness`); `WDTEST` on the bench verifies the Mega bootloader handles it | Verify: Yes |
| R-52 | ESP32 | Alerts raised while offline are kept and written when back online, with the time they were raised; their resolves wait for them | Such alerts were dropped and never reached the app | DONE in software (branch `firmware-robustness`); ESP32 simulator | No |
| R-53 | ESP32 | Epoch timestamps are 64-bit (`uint64_t`): `unsigned long` is 32-bit on the ESP32, so every "time synced" check failed and **no Firebase write or command would have run** | Found while adding R-52; the JS simulator could not show it | DONE (branch `firmware-robustness`); confirmed with a compile-time size check; verify with HIT-03 | Verify: Yes |

## P5: Optional

| ID | Subsystem | Description | Status | HW |
|----|-----------|-------------|--------|----|
| R-40 | App | Local notification when the device goes offline (heartbeat age) | DONE (branch `r40-offline-notification`; verified on the emulator: shown ~90 s after the last heartbeat, removed when heartbeats resume). Works only while the app is running | No |
| R-41 | App | iOS build and test | NOT STARTED | No |
| R-42 | Repo | Delete merged branches (local and GitHub) | DONE 2026-10-24: 21 merged branches deleted locally and 20 on GitHub; only `main` and open PR branches remain (merged PRs keep their history and a "Restore branch" button) | No |
| R-43 | Firebase | Device-confirmed schedule marker (deferred in D4) | DONE (branch `r43-schedule-confirmation`): the ESP32 writes what the Mega accepted to `scheduleStatus/{id}`; the app shows each schedule as On device / Waiting for device. Rules change ships with R-45. Also fixed: the restore used the old 2000 g / 250 g limits, so a total above 1000 g would have been rejected by the Mega on every retry | No |
| R-44 | App | Show the app version and the device's last `timeSource` in Settings | DONE (branch `r44-settings-info`): the ESP32 now stores the Mega's `timeSource` in `state` (rules change ships with R-45); Settings shows the app version and the device clock (network / backup RTC / not set) | No |

## Completed (for reference)

| Area | Items | Merged in |
|------|-------|-----------|
| Mega safety and correctness | E-stop mid-feed failure report, pump fault latch, alert queue + LOW_WATER, local-time schedules, latching E-stop | PR #1 |
| Rules and app config | Owner device query, stale-command failure (**deployed**), production RTDB URL, stale Jest suite, `Config.h`/`node_modules` untracked | PR #1 |
| App honesty | Local notifications (no FCM), daily schedules, working Android manual feed, completion evidence, keyboard first-tap fix | PR #2 |
| Persistence | EEPROM schedules, RTDB restore, Mega UART servicing | PR #3 |
| Docs | Root README | PR #4 |
| ESP32 robustness | Wi-Fi reconnect, CA-verified TLS, auth parsing fix (F27), short UART IDs (F26), STATUS-based online status, protocol doc | PR #5 |
| App finish | Heartbeat-based online status (F25), "HyFePoul" name, RTDB schema doc, Claim/Save emulator tests | PR #6 |
| Moving-hopper revision | 5-tray feed cycle with chain motor, limit switches, interlock and timeouts; 5 load cells; gravity water alert; new `DATA`/state/rules; app tray and cycle display | branch `design-moving-hopper` |

## Suggested order

1. **Now, no hardware needed:** R-04, R-05, R-14 (owner and team decisions); R-45 (rules deploy, together with flashing), R-47, R-48, R-49, R-50; R-16 is resolved by the design revision; R-31, R-33, R-35 (small code changes); R-36 (docs). R-30, R-32 and R-38 are done; R-20 is done in code and only needs its button IDs read on the bench.
2. **When the prototype arrives:** R-10 → R-03 → R-15 → R-01/R-02 → R-11/R-12 → R-46 (tray travel times and timeouts) → R-21 → R-13 (phone against production) → R-25.
3. **On the hardware:** verify R-22, R-23 and R-24 (done in software).
