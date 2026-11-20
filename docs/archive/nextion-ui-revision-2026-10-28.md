# Nextion HMI UI Revision — 28 October 2026

## Purpose and device roles

The Nextion is the local operator display for the owner standing beside the
feeder. The Android app is the owner's remote view and command interface through
Firebase and the ESP32. The Mega remains responsible for sensors, schedules,
feeding and safety. This revision keeps that division intact.

## UI changes

- Replaced the startup university mark with the HyFePoul logo used by the app.
- Kept the Home navigation as a four-button stack: Schedule, Feed Target, Log,
  and System Check. Feed Now remains green and Stop remains red.
- Separated the onsite Log from System Check. Log is page 3 and reads the Mega's
  local SD event CSV. System Check is page 9 and displays hopper level, water
  state, ESP32 link state, and the local feed target.
- Aligned the Log and System Check cards and action rows. Back controls are navy
  with white labels. Feed Now, Save, and Refresh controls are green with black
  labels for contrast. Feed Target and schedule editor Back/Save controls use
  consistent 200x64 dimensions.
- Preserved the existing target and schedule increment/decrement controls and
  their Mega touch IDs. The Save touch IDs still route into the Mega's local
  EEPROM handling.

## Onsite Event Log behavior

On opening or refreshing page 3, the Mega selects the active monthly CSV (or
`HFNOTIME.CSV` if the RTC is unset) and scans backward through at most the last
64 KiB. It skips the CSV header and periodic rows, then displays up to four
newest nonempty event rows. Long event names are clipped to fit the UART write.
The page shows `NO RECENT EVENTS` when no events are available and
`SD LOG UNAVAILABLE` when the card or file cannot be read. This page is a local
record; it does not mirror the app's cloud History and remains independent of
Firebase availability.

## Artifacts

| File | Use | Recorded result |
|---|---|---|
| `Nextion/ChickenFeederV1 (1).hmi` | Editable Nextion Editor source | Compiled successfully; 0 errors, 0 warnings |
| `Nextion/ChickenFeederV1 (1).tft` | Compiled image for the documented 800x480 panel | 1,205,984 bytes; SHA-256 `B8BF5A7043C7A9B019BDF0B1E59D5836DE918859762AD36DF9D152195A9DAA3A` |
| `Nextion/assets/hyfepoul-logo-480.png` | Imported app logo source | Derived from `mobile-app/assets/hyfepoul-logo.png` |
| `Nextion/Nextion_IDs.txt` | Page/component map and physical limitations | Updated with page 3 Log, page 9 System Check and current controls |

## Verification

- Nextion Editor compile: **PASS**, 0 errors and 0 warnings.
- Mega logic simulator: **PASS**, 56/56 checks, including Log refresh mapping,
  four local event fields, System Check refresh pacing and schedule/target saves.
- Nextion Debug simulator: Home → Log navigation returned page ID 3.
- Mega AVR build: **PASS** at 53,822 bytes flash and 3,848 bytes RAM. The local
  HEX checksum and path are recorded in `firmware-build-environment.md`.
- `git diff --check`: **PASS** after the HMI editor released its file lock.

These checks cover the software and the Nextion Editor simulator. No Mega,
physical panel, or SD card was attached, so no live values, SD read, EEPROM
retention, physical touch, UART voltage levels, Stop/Reset path, or panel color
and touch feel have been accepted. HIT-12 remains blocked until the actual panel
and Mega are wired and tested with actuator loads disconnected initially.

## Known boundary

Nextion schedule edits are stored in Mega EEPROM but are not sent back to
Firebase. An online schedule restore can replace an onsite edit. R-54 tracks the
write-back and conflict design. The schedule pages edit hour and minute but do
not provide an onsite enable/disable control.
