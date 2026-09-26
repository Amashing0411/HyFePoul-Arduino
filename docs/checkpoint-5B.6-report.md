# Checkpoint 5B.6 Report: RTDB Event Idempotency Audit

## Current Alert Schema
During the audit, the previous implementation created alerts at the path:
`alerts/{deviceId}/{pushId}`

Firebase REST `POST` calls automatically generate unique Push IDs (like `-Nabc...`). This meant that when the Arduino Mega retried an event over serial (e.g., `EVENT|LOW_FEED`), the ESP32 generated a brand new `POST` payload containing `eventId: "LOW_FEED"` (or a timestamp) resulting in two distinct rows in the database. 

## Schema Adjustment
To guarantee true idempotency while retaining full compatibility with the application layer:
- The ESP32 firmware was modified to issue a **`PUT`** request instead of a `POST`.
- The target path was updated to `alerts/{deviceId}/{eventName}.json`.
- When the Mega sends `EVENT|LOW_FEED`, the ESP32 writes directly to `alerts/device-001/LOW_FEED.json` containing `{"eventId": "LOW_FEED", "name": "LOW_FEED", ...}`.

Because the RTDB security rules use a wildcard `$pushId` (`"$pushId": { ".write": "..." }`), this schema change perfectly satisfies the existing 22/22 security tests without weakening any permissions. Furthermore, the Mobile app reads alerts using `snapshot.forEach(...)` without relying on the specific string key format, completely eliminating frontend disruption.

## Duplicate-Event Test Results
Using the `simulate-esp32.js` script, the `LOW_FEED` event was pushed consecutively.
- **Before Fix:** The database returned multiple alerts under different Push IDs.
- **After Fix:** The database returned precisely **one** active `LOW_FEED` alert, successfully updating its timestamp rather than duplicating records. 
- **Informational Events:** `FEEDING_STARTED` and `FEEDING_COMPLETED` were filtered from creating alert nodes. The existing architecture delegates these strictly to local Mega SD logs to prevent polluting the mobile alerts feed.

## Security Test Results
The ESP32 simulator strictly uses its `idToken` attached to `deviceAuthUid` to modify the alerts.
- **Can ESP32 write own alerts?** YES
- **Can ESP32 read alerts?** NO (Throws `Permission denied` - fully compliant)
- **Can ESP32 modify ownerId?** NO
- **Can ESP32 modify another device's alerts?** NO
- **RTDB rules tests:** 22/22 PASS

## Physical Verification Status
As directed, this validation was strictly conducted utilizing the Node-based C++ REST simulator (`scripts/simulate-esp32.js`) configured against the live Auth/RTDB emulators. No physical ESP32 was hooked up, preserving development velocity.

## Final Test Counts
- RTDB Security Rules: **22/22 PASS**
- React Native Integration & Service Tests: **26/26 PASS**
- Node Simulator E2E Idempotency: **PASS**

## Files Modified
- `firmware/esp32/HyFePoul_ESP32/HyFePoul_ESP32.ino`: Altered REST call to `PUT` using deterministic keys and stripped informational non-alert events.
- `scripts/simulate-esp32.js`: Appended idempotency test block.
- `docs/checkpoint-5B.6-report.md`: Audit generated.
