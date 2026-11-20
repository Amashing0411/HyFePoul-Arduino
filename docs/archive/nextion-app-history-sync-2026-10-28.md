# Nextion and app data alignment — 2026-10-28

## Goal

The onsite Nextion and away-from-device mobile app should present the same
cloud History records and app-configured feeding schedules, while the Mega
remains the controller and safety authority.

## Recent History on the Nextion

- App `HistoryScreen` subscribes to `/systemData/{deviceId}`, requests the latest
  50 children ordered by `timestamp`, skips malformed rows and presents newest
  first. Its Recent History cards show timestamp, total `feedWeightGrams`,
  `hopperLevelPercent`, `waterLow`, and `feedingActive`.
- HMI page 3 (page name `Log`) shows the newest four valid rows from that same
  RTDB node. Four is the number of visible cards on the panel. The fields map to
  the app as follows: date/time, total tray feed grams, hopper percentage,
  reservoir state and dispenser state. The panel uses the project's fixed
  UTC+8 local display offset.
- Opening the page and pressing Refresh sends `HISTORY_REQ` from Mega to ESP32.
  ESP32 reads `systemData/{deviceId}.json` with `orderBy="timestamp"` and
  `limitToLast=4`, filters malformed snapshots, sorts the result newest first,
  and sends `HIST|ROW` frames to the Mega. Mega updates one card at a time.
- Empty history shows `NO HISTORY YET`. Wi-Fi, Firebase or parse failures show
  `HISTORY UNAVAILABLE`. The SD CSV event log remains available locally for
  diagnostics but is no longer presented as app History.

## App schedules on the Nextion

The existing app save path writes `/schedules/{deviceId}` and queues
`SCHEDULE_SET`. ESP32 restores those slots to `feedSchedules[]` in the Mega;
page 2 now displays each slot's time, target grams and enabled state. The app
stores daily schedules, so the omitted weekdays field is not a behavioral
difference.

The Nextion's existing time editor still saves hour/minute to Mega EEPROM only.
It does not write back to Firebase, and a later cloud restore can replace the
onsite edit. This remains roadmap item R-54; this change implements app-to-HMI
reflection, not bidirectional editing.

## Firebase permission

`database.rules.json` now permits the `deviceAuthUid` for a device to read only
that device's `systemData` node. Owner access remains unchanged. Emulator and
Jest coverage was added for allowing the matching device account and denying a
different device. Those checks could not run: Firebase CLI exits with “No
emulators to start” despite `firebase.json` defining Auth and RTDB emulators,
and the ESP32 simulator consequently cannot connect to `127.0.0.1:9099`. The
rules change still needs emulator validation and production deployment before
an ESP32 using the currently deployed rules can fetch history. This work does
not alter Firebase data or let the device read the owner's other records.

## Verification

- Mega JS simulator: 56/56 pass, including cloud History row formatting and
  newest-first order, Refresh request, and schedule target/enabled display.
- Mega compile: 54,434 bytes flash / 3,987 bytes RAM. ESP32 compile: 1,150,528
  bytes flash / 49,688 bytes RAM. Build paths and SHA-256 values are recorded
  in `firmware-build-environment.md`.
- Nextion Editor compile: 0 errors, 0 warnings. The saved HMI Home button reads
  **History**, and the updated 1,205,984-byte TFT was exported from the compiled
  project. Its SHA-256 is recorded in `firmware-build-environment.md`.
- Four manuals rebuilt and all 36 pages passed automated checks and were
  visually reviewed. `docs/manuals/verification.json` records PDF hashes.
- Firebase emulator REST/rules tests remain blocked by the local CLI issue
  described above. Production RTDB rules have not been deployed.
- Physical panel display/wrapping, serial transport, live Firebase access and
  app parity remain unverified until HIT-12 with the assembled prototype.
