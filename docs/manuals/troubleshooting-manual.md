# Troubleshooting Manual

## Start here: safe diagnosis

:::diagram diagnosis

If there is unexpected motion, overheating, exposed wiring, a jam, wrong direction or a failed stop, use the physical E-stop and the approved power-isolation procedure. Keep the mechanism stopped for the technician. Do not troubleshoot by reaching into a moving hopper or bypassing a switch.

### Capture the problem before changing anything

1. Record the Device ID, date/time, app version, firmware revision and the exact screen or serial error. Use a redacted screenshot where useful.
2. Note whether the phone has internet, whether the ESP32 is online, and whether the Mega is responding. These are separate facts.
3. Check the last update time. Old data, zero values and missing data are different states.
4. Make one justified change at a time. Repeat the relevant check and record the result.

| Symptom | Start on page |
| --- | --- |
| Empty app, first update missing, device unavailable | 3 |
| Claim denied, lost PIN, login error | 4 |
| Offline device or controller not responding | 5 |
| Manual feed or schedule not working | 6 |
| Wrong weight, hopper, water or display readings | 7 |
| Logs, alerts, installation or upload problems | 8 |
| Record evidence and decide whether to resume | 9 |

This guide is for the commissioning baseline of 27 October 2026. No physical HIT test has passed in that baseline. Examples of software behavior do not establish that the actual wiring or motor system is safe.

Source: hardware-test-day-run-sheet.md; development-status.md.

<!-- page -->

## The app is empty or has old readings

:::screen dashboard-empty-final.png | Linked demo device awaiting data | Waiting for first device update means ownership was found but no first device readings are available. || OFFLINE is expected when the board is not powered or connected. Claiming alone does not make the device online. || LOCAL-UI-TEST-001 is an emulator example ID. Enter the actual configured Device ID during setup. || This screen is different from a loading error. Do not add fake cloud readings to make a production screen appear populated.

| What you see | Check | Expected recovery |
| --- | --- | --- |
| Waiting for first device update | Technician checks ESP32 Wi-Fi, Auth binding, network time, Mega UART and state writes. | First valid device state fills the cards. |
| Could not load device data | Phone internet, signed-in owner, correct project/build and database permission error. | Correct access or network issue, then retry. |
| Device unavailable | Account ownership lookup and device record. Do not switch randomly between accounts. | Correct owner can load the linked device. |
| Old timestamp / OFFLINE | Power, Wi-Fi and last heartbeat; see page 5. | Fresh heartbeat and fresh state return. |

A fresh installation can have no history, no alerts and no cloud readings. Those states are not automatically an app defect. Conversely, a permission error or indefinite loading is not a valid empty state and should be recorded as a fault.

Source: mobile-empty-state-qa-2026-10-26.md; translations.ts; AuthContext and RTDB service.

<!-- page -->

## Login, PIN and claim failures

### Claim denied

The app uses the same message for an invalid Device ID, an incorrect PIN or an already claimed device. The administrator must inspect the exact condition; the message alone does not identify it.

1. Confirm the production APK and the intended Firebase project. A local-emulator PIN does not provision production.
2. Enter the exact Device ID, including case. The prototype is configured as **device-001**; check for keyboard capitalization or spaces.
3. Confirm that the private PIN contains six digits and that the database value is a string. Preserve leading zeros. There is no universal default PIN.
4. Have the administrator inspect **devices/device-001/ownerId** and **claimRequests/device-001**. A two-step claim can leave evidence even if the app reports a failure.
5. If another owner already holds the device, use the approved transfer procedure. Do not delete ownership as a shortcut or relax database rules.

### Login and account diagnosis

| Problem | Safe next step |
| --- | --- |
| Email/password rejected in the phone | Use the owner account, not the ESP32 account. Confirm the email and password privately; follow the administrator's account-recovery process. |
| Password reset email does not arrive | On the production Login screen, enter the exact owner-account email and tap **Forgot password?**. Check Firebase Authentication / Users for that exact address, then check Inbox, Spam and filtered mail. A local Auth Emulator does not send production email. The app's generic confirmation does not prove that the account exists. |
| ESP32 sign-in fails | Technician compares the dedicated device account with ignored Config.h and the bound deviceAuthUid. Reset only the authorized device account if necessary. |
| Email already in use | Sign in to the existing intended account or recover it. Do not create variants that obscure ownership. |
| API key / application restriction error | Administrator verifies the selected project's active key restrictions against the SDK and ESP32 REST requirements. Do not remove all restrictions or disclose the key in a report. |
| PIN lost | Authorized administrator securely sets a new six-digit string and hands it to the intended owner privately. Follow transfer steps if ownership changes. |

:::note RETAINED CLAIM RECORD | The current implementation can retain the submitted PIN in claimRequests. Never paste this record into a ticket or screenshot. After ownership is verified, the administrator may remove the retained request. A transfer must address both the old ownerId and the old request.

Source: device-provisioning-guide.md; ClaimDeviceScreen.tsx; rtdbService; RTDB rules.

<!-- page -->

## Device offline or controller not responding

:::diagram linkcheck

### Phone and backend checks

Verify phone internet and the correct signed-in owner. Check the last heartbeat and state timestamps through the app or authorized console. A cached ONLINE label is not enough. App offline detection occurs after 90 seconds without a fresh heartbeat, with periodic checks.

### ESP32 checks - technician

With actuator power disconnected, check board power and redacted serial output. Confirm the 2.4 GHz Wi-Fi settings were entered privately and the ESP32 was rebuilt afterward. The prepared baseline image still used Wi-Fi placeholders.

Confirm the dedicated account can authenticate and its UID matches deviceAuthUid. Check network time, TLS and authorized database writes. Firebase writes wait for valid network time; successful Wi-Fi association alone is insufficient. Keep Core Debug Level at None and do not disable certificate validation to hide a TLS failure.

### Mega link checks - technician

If the ESP32 is online but the controller is NOT RESPONDING, inspect Mega power, UART wiring and baud rates. Isolate power before changing wires. Confirm Mega TX1 18 reaches ESP32 RX2 16 through appropriate level protection, and ESP32 TX2 17 reaches Mega RX1 19. Check grounds and the actual signal levels.

The ESP32 marks the controller absent after 30 seconds of Mega silence. The Mega expires ESP32 status after 15 seconds. Capture redacted complete lines and check newline framing. Do not diagnose reliability from one successful packet: run the disconnect/reconnect and prolonged-link checks in HIT-04.

### Recovery test

After correction, verify fresh state and heartbeat, a responding controller, schedule delivery and a safe command lifecycle with actuator loads disconnected. Then repeat the affected hardware checks before powered motion.

Source: HyFePoul_ESP32.ino; ESP32Communication.ino; notifications.md; HIT-03 / HIT-04.

<!-- page -->

## Commands and schedules fail

| Result / reason | Meaning | Next action |
| --- | --- | --- |
| Waiting for device | Command queued; execution is not confirmed. | Check fresh heartbeat and controller response. Avoid repeated submissions. |
| ESTOP_ACTIVE | Stop latch is active. | Correct the cause, release the physical button, then authorized reset. |
| PHYSICAL_ESTOP_ENGAGED | Button is still sensed pressed. | Inspect button/wiring safely; do not force a reset. |
| FEEDING_ACTIVE | A cycle is already running. | Observe it; do not start a second cycle. |
| HOPPER_LOW / HOPPER_EMPTY | Insufficient hopper level or empty during a cycle. | Refill safely and verify the ultrasonic measurement. |
| UART_TIMEOUT | No Mega acknowledgement within 3 s. | Inspect link and controller. Determine physical state before retry. |
| EXECUTION_TIMEOUT | No final result within 300 s. | Inspect motion and logs. A timeout is not proof of stopped motors. |
| TRAY_TIMEOUT | Target not reached in time or scale not responding. | Check load cell, outlet, feed supply and calibration with power isolated. |
| CHAIN_TIMEOUT / END_LIMIT_EARLY | Travel or limit behavior does not match the expected path. | Stop and isolate; check direction, switches, obstruction and measured timing. |
| LINE_TOO_LONG / stale command | Protocol line rejected or queued command too old. | Technician investigates command formatting or connectivity; do not edit live command records casually. |
| NOT_IMPLEMENTED_SAFELY | Remote restart is intentionally rejected. | Use a supervised local shutdown/restart procedure if needed. |

### Schedule saved, but no feed

Check that the intended slot is enabled and shows ON DEVICE. Confirm the Mega's clock is valid and the local time is correct. Review stop latch, hopper level and whether another feed cycle was active at that time. Saving to the cloud alone is not confirmation that the Mega stored the change.

Inspect EEPROM and restore behavior with motors safely disconnected. Do not solve a missed schedule by repeatedly issuing manual feeds; first determine whether feed was already dispensed. A restart can restore cloud schedules, so review all three slots after reconnecting.

Source: Feeding.ino; ESP32Communication.ino; HyFePoul_ESP32.ino; ScheduleStorage.ino.

<!-- page -->

## Sensor, motion and display faults

| Symptom | Likely checks | Verify after correction |
| --- | --- | --- |
| Tray NOT READY | HX711 power, that tray's SCK and DT pins. | Stable raw value; known mass. |
| Weight implausible | Tare, factor sign/value, load path, tray contact. | Known masses; reboot check. |
| Tray readings drift | Vibration, independent SCK/DT wiring, grounding, sampling. | Test all five independent channels separately and together. |
| Hopper percentage wrong | Sensor aim, obstruction, measured empty/full distance. | Empty, full and mid-level readings. |
| Water LOW when full | Float orientation, configured pin 35 (placeholder), active-low wiring. | Confirm the pin against actual wiring; test stable low/full states and 2 s debounce. |
| Wrong direction / overshoot | Relay polarity, motor wiring, limits, travel timing. | Stop; repeat unloaded safety check. |
| Nextion blank or buttons fail | Panel power, TX/RX, ground, 9600 baud, matching TFT and IDs. | HIT-12: check live values and touch controls with actuators disconnected. |
| Recent History empty / unavailable | History requires the ESP32 Wi-Fi/Firebase link and at least one valid `/systemData` snapshot; the page shows the latest four. | HIT-12: compare p3 values and ordering with the app's Recent History screen; test Refresh online and offline. SD CSV events are logged separately and are not shown here. |
| App and Nextion schedules differ | A panel save waits for Wi-Fi/Firebase before the app sees it (R-54). | Check Wi-Fi and the ESP32 link; the panel resends every 30 s. The newest change wins once online. |

### Weight changes after a feed

Each tray is tared before dispensing. Later readings change with feed use, vibration or movement. During commissioning, compare delivered amounts with an independent scale.

### A stop will not reset

Confirm that the physical button is released and the mechanism is safe. If the input remains active, inspect wiring and switch behavior. Do not defeat the input or use a different owner account to work around it. Reset clears the latch; it does not fix the original mechanical or electrical problem.

:::note KEEP FAULTS VISIBLE | Do not increase timeouts, change thresholds or alter calibration solely to suppress an alert. Measure the actual cause, justify the change and rerun the affected HIT checks.

Source: Config.ino; SerialConsole.ino; Nextion.ino; Safety.ino; commissioning procedure.

<!-- page -->

## Logs, notifications, APK and upload problems

### No phone notification

Open Notifications and inspect active alerts. Android permission may be denied, the app may be closed or suspended, or the alert may have existed before the app opened. The first snapshot is a baseline and is not re-notified. Only a newer occurrence produces a local notification; resolution does not. There is no deployed server push path for this edition.

### Missing SD or monthly history

Check SD initialization and the RTC date before concluding that records are lost. Monthly filenames use UTC. Isolate power before handling the card, preserve existing files and test with a technician-approved compatible card if needed. Do not format the original card before copying required evidence.

Phone Recent data is normally written every 5 minutes and at feed start/end; daily totals are sent after feeds and periodically. Cloud outages or restarts can leave gaps. One record per alert type means repeat incidents may replace the previous cloud timestamp; inspect the SD event sequence where available.

### APK will not install or opens the wrong experience

Use the standalone production APK supplied for this edition. It contains the application bundle and does not require Expo Go or Metro. Verify the file checksum with the release record. If Android reports a signature conflict, the existing app may use a different signing certificate; preserve needed information and credentials before deciding whether to uninstall it. Uninstalling deletes local app data.

The current direct-install APK is development-key signed and is not a Play Store release. Do not substitute an emulator build that points at a laptop or local Firebase. Use the Account / Device Setup Manual to verify the production build and owner claim.

### Board upload fails

| Failure | Check |
| --- | --- |
| No port | Data-capable USB cable, board power, driver and operating-system detection. |
| Port busy | Close serial monitors and other software using that board. |
| Wrong target / missing core | Confirm Mega versus ESP32 and the installed FQBN/core from the build guide. |
| Missing library | Restore the documented library version; compile the whole sketch directory. |
| Old settings still used | Recompile after editing local configuration, then upload that exact output. |

Do not randomly change board targets, boot offsets or partition layouts to force an upload. Record the full error with secrets removed and use the installed toolchain guide.

Source: notifications.md; SDLogging.ino; firmware-build-environment.md; development-status.md.

<!-- page -->

## Record, repair and release

### Fault report

Device ID: ____________________     Date/time/timezone: ______________

App version / APK checksum reference: ______________________________

Firmware commit / board / wiring revision: __________________________

Exact symptom and expected result: _________________________________

_____________________________________________________________

Last known safe state / physical action taken: ________________________

_____________________________________________________________

Measurements and redacted evidence location: ________________________

Corrective change: ______________________________________________

Retest / HIT IDs / result: __________________________________________

Technician and reviewer: _________________________________________

### Resume only when

- [ ] The cause has been identified and the corrective action recorded.
- [ ] Wiring and configuration agree with the revised documentation.
- [ ] The failed test and dependent safety/calibration checks pass physically.
- [ ] The actual phone, backend and device agree on identity and status.
- [ ] A supervisor approves the next operating step and the operator understands the change.

Use FAIL for an observed failed expectation and BLOCKED when hardware, credentials or a required safe test method is unavailable. Keep the earlier evidence. A simulator result cannot replace the physical retest.

### References and edition

Edition 1.1, 28 October 2026. Firmware filenames refer to firmware/arduino-mega/HyFePoul_Arduino/ unless the ESP32 sketch is named. App labels come from mobile-app/src/i18n/translations.ts. Detailed acceptance criteria are in docs/hardware-integration-test-plan.md and docs/hardware-commissioning-procedure.md.

Never include passwords, setup PINs, authentication tokens, private account exports or unredacted claim records in reports, screenshots or Git. Support contact details should be entered in the User's Manual handover card.
