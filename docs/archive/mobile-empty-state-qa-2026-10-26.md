# Mobile empty-state correction and Android verification

Date: 2026-10-26. Environment: Android emulator `Medium_Phone_API_36.0`,
development app `com.hyfepoul.mobile`, local Firebase Auth and Database emulators.
The app logged its emulator connection to `10.0.2.2`. No production writes.

## Defects and changes

The earlier claim-flow check confirmed ownership and navigation but missed that
the destination screen was still showing loading placeholders. That did not
establish dashboard readiness.

1. A claimed device with `status: offline`, `lastHeartbeat: 0`, and no `state`
   is valid before its first hardware report. The data context finishes loading,
   but Status, Feeding, and Water also treated a missing `systemData` as loading.
   They therefore displayed placeholders indefinitely.
   The shared `DeviceDataUnavailable` component now distinguishes loading,
   read errors, a missing device, and a linked device awaiting its first update.
   The waiting view shows the device identity and connection status, explains
   when readings will appear, and exposes no device controls or invented readings.
   English and Tagalog messages are provided.
2. Settings used a fixed-height View. Text-size controls and Log Out extended
   below the viewport on this emulator. Its content now scrolls.

## Checks performed

| Scenario | Observed result |
|---|---|
| Claimed local device without sensor state | Status, Feeding, and Water show OFFLINE and Waiting for first device update; no loading placeholders remain. |
| First valid state arrives through the database listener | All three screens update without restarting the app. Status shows 220 g and 65% hopper; Feeding shows trays 42, 43, 44, 45, 46 g; Water shows Water OK. |
| Float-switch value changes to low | Water changes to Refill Needed and LOW, with the reservoir refill instruction. |
| Sensor state removed | The waiting view returns; previous sensor readings are not retained. |
| Malformed first state, then removal | An error card appears. Removing the malformed state restores the waiting view automatically. The expected development LogBox message is cleared by restarting the app. |
| History and Notifications without records | No history available and No alerts messages appear; neither stays loading. |
| Settings scrolling | Text-size buttons and Log Out become visible above the tab bar. |
| Restart and reopen development bundle | The account and ownership persist, and the waiting screen renders again with no test-error overlay. |
| TypeScript and ESLint | Typecheck passes; changed source files lint without warnings or errors. Full-project lint has the same three existing effect/setState warnings. |

Temporary sensor fixtures were removed from `LOCAL-UI-TEST-001`. Its ownership
remains in the local emulator with offline status and no sensor state. Local
screenshots are in `brag-output/` (not committed).

## Regression procedure

1. Use local Firebase emulators and an Android development build explicitly
   connected to them. Claim a disposable device with offline status, heartbeat
   zero, and no sensor state.
2. Open Status, Feeding, and Water. Each must show an explanation and device
   connection status after the first database response, with no indefinite
   loading placeholders or sensor/control values.
3. Send a valid five-tray state to that device in the local emulator. Verify the
   actual values appear automatically on the three screens.
4. Remove the state and verify the waiting view returns. Exercise a malformed
   first state and its recovery as well.
5. Open Settings and scroll to Text Size and Log Out.

These checks cover the reported UI defects and display transitions. They do not
validate physical sensors, motor behavior, calibration, or production delivery.
The APK already installed on the physical phone has not been rebuilt or replaced.
