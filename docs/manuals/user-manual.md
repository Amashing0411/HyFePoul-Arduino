# User's Manual

## Before you operate

HyFePoul moves a feed hopper along five trays, weighs the feed dispensed at each tray, and monitors the water reservoir. Use the Android app for status, schedules, commands and alerts. The Mega controller performs the feeding and safety logic locally.

:::note COMMISSIONING EDITION | This guide describes the current software. The assembled prototype must pass its wiring, safety, calibration and feeding checks before normal use. Simulator screenshots are examples, not proof that the physical device is ready.

### Who should do what

| Person | Responsibility |
| --- | --- |
| Operator | Inspect the equipment, refill feed and water, use the app, observe alerts and record problems. |
| Technician | Verify wiring and power, upload firmware, calibrate sensors, validate travel and test safety functions. |
| Firebase administrator | Provision the device account, manage the private setup PIN and coordinate ownership transfer. |

### Daily pre-start check

1. Confirm the commissioning record permits operation. Keep people and animals away from the hopper travel, chain, dispenser and pinch points.
2. Inspect the path, tray mounting, hopper and water reservoir. Have a technician isolate power before clearing a mechanical obstruction.
3. Make sure the physical E-stop is accessible and the approved guards and power arrangement are in place.
4. Open the app. Check the device identity, update time, controller status and any active alerts.
5. Check feed and water physically. A displayed value can be stale or uncalibrated. Confirm the clock and intended schedules before enabling operation.

### Stop immediately if

There is unexpected motion, incorrect direction, a loose tray, a jam, a burning smell, damaged wiring or an E-stop that does not stop the equipment. Use the physical stop and isolate actuator power through the approved local procedure. Keep the equipment stopped for the technician.

Do not reach into the moving mechanism, bypass switches, or repeatedly reset a fault to keep feeding. The app stop depends on connectivity and must not be the only emergency protection.

Source: hardware-test-day-run-sheet.md; Config.ino; Safety.ino.

<!-- page -->

## Read the Status screen

:::screen status-populated.png | Status tab - simulator example | Device card: check the name, ONLINE/OFFLINE state and last update. Online describes the communication state; it does not certify every sensor. || Feed card: In trays is the combined scale reading. Hopper Level is the ultrasonic estimate of feed remaining. || Manual Feed: opens the grams-per-tray prompt. Use only after the physical equipment has been cleared for operation. || Water and Safety: inspect reservoir state and the stop latch. Scroll to see the full Safety card; the example image cuts off the lower control.

### What the connection labels mean

| Label or state | What to do |
| --- | --- |
| ONLINE | Check the timestamp and controller status before a command. |
| OFFLINE | The device is not reporting a fresh heartbeat. Check power and Wi-Fi; do not assume the displayed readings are current. |
| NOT RESPONDING | The Wi-Fi module is reachable but the Mega has stopped sending data. Manual feeding is unavailable; ask the technician to check power and UART. |
| Waiting for first device update | The account is linked, but the device has not supplied its first readings. This is not a zero-feed or zero-water measurement. |

The app checks for a heartbeat older than 90 seconds, so connection changes are not instantaneous. A healthy Mega can continue its stored schedules without the phone or Wi-Fi when its clock is valid; this behavior must be proven during commissioning.

Source: translations.ts; useOfflineNotification; docs/notifications.md.

<!-- page -->

## Run a supervised manual feed

:::diagram cycle

### Before pressing Start Feed

Confirm the device and controller are responding, the hopper contains feed, the E-stop is clear, no other cycle is running, and the path is clear. A feed cycle moves machinery. Keep a supervisor beside the physical E-stop during prototype testing.

1. On Status or Feeding, select **Manual Feed**.
2. Enter **1 to 1000 grams per tray** and select **Start Feed**. The value is the amount to dispense during this visit to each tray, not a combined amount for all trays.
3. Observe Command Status: **Waiting for device**, **Received by device**, **Running on device**, then **Device reported done** or **Failed**.
4. Watch the actual hopper and trays. The hopper homes first, visits trays 1 through 5, moves to the end, and returns home.
5. After completion, confirm the hopper is home and check the measured feed. Record shortages or overshoot for calibration; do not treat a software completion label as a weighing certificate.

:::note EXAMPLE, NOT A FEEDING RECOMMENDATION | 50 g per tray means a nominal 250 g delivered across five trays in one cycle. Select the feeding amount with the person responsible for the flock. This manual does not prescribe a nutrition plan.

### Understand the weights

The firmware tares each tray at the start of its dispensing visit. Displayed tray readings are relative to that tare, not an absolute inventory of everything previously in the tray. Consumption, movement and calibration affect subsequent readings.

If the command fails or times out, inspect the physical state before sending another command. A communication timeout alone does not prove that motion has stopped. Use the Troubleshooting Manual to identify the failure reason.

Source: Feeding.ino; Config.ino; SerialConsole.ino; mobile app command labels.

<!-- page -->

## Set and confirm daily schedules

:::screen feeding-populated.png | Feeding tab - simulator example | Tray tiles show separate scale readings. These sample numbers are not calibration results. || Feed cycle describes the current step and tray. Confirm that the physical movement agrees. || Schedules are below the feed card. Scroll to access all three available slots. || Add Schedule opens the time and per-tray amount controls. Verify the delivery marker after every change.

1. Open **Feeding**, scroll to **Schedules**, and select an available **Add Schedule** slot.
2. Enter the hour (0-23), minute (0-59), and per-tray amount. Review the intended local time and save.
3. Confirm the slot is enabled. Wait for **ON DEVICE**; **WAITING FOR DEVICE** means the change has not yet been confirmed on the Mega.
4. To pause a schedule, turn its switch off and confirm delivery. To remove one, use its delete control and confirm removal.

There are at most three daily schedules. The Mega uses Philippine local time (UTC+8) for feeding; RTC and stored timestamps use UTC. Check **Device clock** in Settings. An invalid clock needs technician attention before relying on schedules.

Fresh firmware defaults contain enabled 07:00, 12:00 and 18:00 slots at 50 g per tray; saved EEPROM or cloud restore can replace them. Inspect the actual stored schedule with actuator power disconnected during setup. Do not assume a fresh install has no schedules.

Source: Config.ino; ScheduleStorage.ino; FeedingScreen.tsx; translations.ts.

<!-- page -->

## Water, alerts and the stop latch

:::screen water-low.png | Water tab - simulator example | LOW / Refill Needed means the reservoir float switch has reported low. It is not a continuous percentage measurement. || Refill the reservoir using the approved local procedure and physically check the drinker flow. Keep water away from electrical parts. || The float state must remain stable for about 2 seconds before it changes. Phone updates take additional time. || Water is gravity-fed. HyFePoul monitors reservoir level; there is no water pump to start from the app.

### Alerts need a physical check

Open **Notifications**. Active alerts appear first; resolved alerts remain visible with their resolution time. Low hopper feed is reported at or below 20% and clears at or above 25%. A value at or below 5% blocks feeding or stops dispensing in a cycle.

Phone notifications depend on the app running and Android allowing delivery. They are not server push alerts and are not guaranteed while the app is backgrounded or suspended. When the app is closed, check the in-app alert list after reopening. Only the latest report of each alert type is retained there.

### Recover from an E-stop

Keep the equipment stopped, find and correct the cause, and have the technician confirm the area is safe. Release the physical button, then use **RELEASE EMERGENCY STOP** only when authorized to restore operation. The physical release alone does not clear the software latch. Reset does not resume an interrupted feed; a new feed starts with homing. Recheck enabled schedules before leaving the unit active.

Source: Hydration.ino; FeedLevel.ino; Safety.ino; docs/notifications.md.

<!-- page -->

## History, local display and care

### Review what happened

| View | Meaning and limitation |
| --- | --- |
| History / Recent | Periodic device readings, normally every 5 minutes, plus feed start and end. Missing records are not proof that nothing happened. |
| History / Monthly | Daily feed totals, completed and incomplete feedings, and problem counts. The current day can change as more data arrives. |
| SD card | The Mega records detailed data and events in monthly HFyyyymm.CSV files. A technician should isolate power before removing the card and preserve the original files. |

The monthly total describes recorded dispensing. It does not measure how much feed the birds consumed. The system is not a permanent cloud audit archive; keep required test evidence separately.

### Use the local Nextion display

The current Home page shows total tray grams, water state, cycle status and local time. It has no live hopper-percentage or network-status field. An older HMI caption can still say **Hopper Load** for the tray-weight value; the technician must verify the loaded display project.

:::note CURRENT DISPLAY LIMITATION | Nextion Stop and Start touch actions are disabled until the real page/button IDs are verified and firmware is rebuilt. Set Feed Schedule, Log Book and Set Feed Weight pages are not connected to the Mega functions yet. Use the verified app and technician console procedures; do not depend on these touch buttons.

### Settings and routine care

- Settings provides language (English or Tagalog), text size, dark mode, version, device clock and Log Out. Logging out stops app updates and notifications until you sign in again.
- At each operating session, inspect feed, water, trays, travel path, visible cables and mounting. Clear dust or feed only with machinery safely isolated.
- Do not spray the electronics or treat sensor boards as waterproof. Ask the installer for component-specific cleaning instructions.
- After moving a tray, replacing a load cell, changing motor mechanics or changing wiring, stop normal use until the affected calibration and safety checks are repeated.

Source: SDLogging.ino; DailyStats.ino; Nextion.ino; SettingsScreen.tsx.

<!-- page -->

## Operator handover and quick reference

### Before accepting the device

- [ ] Technician has signed the required physical HIT checks and recorded the firmware revision.
- [ ] All five trays are calibrated, actual travel times are recorded and a supervised full cycle passes.
- [ ] The physical E-stop removes actuator power and the software latch/reset behavior has been demonstrated.
- [ ] The correct owner account claims the correct Device ID. A test account has not been mistaken for the client account.
- [ ] The owner has the private PIN through a separate secure handover, understands alerts and has a technician contact.
- [ ] The installed APK, schedules, local time and offline behavior have been checked on the actual phone.

### Which manual to open

| Need | Go to |
| --- | --- |
| Sign up, find the private PIN, claim or transfer the device | Account / Device Setup Manual |
| Check pins, upload boards, calibrate, test physical safety | Hardware / Technical Manual |
| Empty screen, offline device, failed command, incorrect readings | Troubleshooting Manual |
| Full test acceptance and measurements | docs/hardware-integration-test-plan.md and commissioning log |

### Local contact card

Device ID: ____________________     Location: ____________________

Technician / support: ___________________________________________

Contact method: _______________________________________________

Approved firmware revision: _______________     Date: _______________

Owner handover accepted by: ____________________________________

Keep passwords and the setup PIN off this public worksheet.

### Edition notes and sources

Edition 1.0, 27 October 2026; source baseline d623cce. This is a precommissioning guide. All hardware HIT results remain pending in the baseline. Screenshots are historical emulator QA captures with simulated values; layout may vary slightly in the production APK.

Source paths are repository-relative. Firmware files are in firmware/arduino-mega/HyFePoul_Arduino/; app screens in mobile-app/src/screens/; labels in mobile-app/src/i18n/translations.ts. Recheck this guide whenever the firmware, app or wiring changes.
