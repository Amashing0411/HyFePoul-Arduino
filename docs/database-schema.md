# Database Schema (Firebase Realtime Database)

HyFePoul stores everything in the Firebase **Realtime Database (RTDB)** instance `hyfepoul-dev-default-rtdb` (region `asia-southeast1`). This document describes the structure **as currently used** by the ESP32 firmware and the mobile app, and as enforced by [`database.rules.json`](../database.rules.json). The TypeScript models live in [`mobile-app/src/types/rtdb.ts`](../mobile-app/src/types/rtdb.ts).

> An earlier version of this document described a Cloud Firestore schema (`users`, `fcmTokens`, Cloud Functions). That pipeline is not used; see §9.

All timestamps are **UTC milliseconds since the epoch**. The ESP32 sets them from NTP; the app sets command `createdAt` from the phone clock.

## 1. Overview

```
/
├── deviceSecrets/{deviceId}            setup PIN (nobody can read via clients)
├── claimRequests/{deviceId}            owner's claim attempt (uid + PIN)
├── devices/{deviceId}                  identity, ownership, heartbeat, current state
│   ├── ownerId, deviceAuthUid, status, lastHeartbeat
│   └── state/                          latest system data
├── systemData/{deviceId}/{pushId}      history of system data (append-only)
├── alerts/{deviceId}/{EVENT_NAME}      latest occurrence of each alert type
├── commands/{deviceId}/{commandId}     remote commands and their lifecycle
└── schedules/{deviceId}/{scheduleId}   feeding schedules (source of truth when online)
```

There are two kinds of identity, and each is a separate Firebase Auth account:
- **Owner:** a person who signed up in the app. Linked via `devices/{id}/ownerId`.
- **Device:** the ESP32's own account. Linked via `devices/{id}/deviceAuthUid`.

## 2. `deviceSecrets/{deviceId}`

| Field | Type | Notes |
|-------|------|-------|
| `setupPin` | string | The PIN printed or supplied with the device |

- **Read and write:** denied to all clients. It is set by an admin in the Firebase console during provisioning.
- The rules compare a claim's PIN against it without ever exposing it.

## 3. `claimRequests/{deviceId}`

| Field | Type | Notes |
|-------|------|-------|
| `uid` | string | Must equal the writer's `auth.uid` |
| `pin` | string | Must equal `deviceSecrets/{deviceId}/setupPin` |

- **Write:** a signed-in user, only while the device has **no owner**, only with the correct PIN, and only over their own (or no) earlier request.
- **Read:** only the user named in `uid`.
- **Claim flow (app):**
  1. Write `claimRequests/{id}` = `{uid, pin}`.
  2. Write `devices/{id}/ownerId` = `uid` (allowed only if a valid claim request for that user exists and `ownerId` is still empty).
  3. Re-query owned devices.
- The request is not deleted after a successful claim. It stays readable only by the claimant, and it cannot be used to claim the device again, because ownership already exists.

## 4. `devices/{deviceId}`

| Field | Type | Written by | Notes |
|-------|------|------------|-------|
| `ownerId` | string | Owner (once, via claim) | Cannot be changed afterwards (no transfer) |
| `deviceAuthUid` | string | Admin only (`.write: false`) | Set during provisioning |
| `status` | `"online"` | Device | Written on every heartbeat. Nothing writes `"offline"`; see the note below |
| `lastHeartbeat` | number | Device | Every 30 s while the ESP32 has Wi-Fi and a session |
| `megaLinkOk` | boolean | Device | `false` when the ESP32 has heard nothing from the Mega for 30 s, `true` again when it does (R-24). Validated as boolean |
| `state` | object | Device | Latest system data (§5) |

- **Read `devices/{id}`:** its owner or its device.
- **Read `/devices` (owned-device query):** only the exact query `orderByChild("ownerId").equalTo(auth.uid)`. An unfiltered read, or a query for another uid, is denied. Indexed on `ownerId`.

**Online status.** Because nothing sets `status` to `"offline"` when the device loses power or Wi-Fi, the app treats a device as online only if `status == "online"` **and** `lastHeartbeat` is within 90 s, which is three missed heartbeats (`mobile-app/src/utils/deviceStatus.ts`). The controller counts as responding only if the device is online and `megaLinkOk` is not `false`.

## 5. `devices/{deviceId}/state` and `systemData/{deviceId}/{pushId}`

Both use the same record. `state` holds the latest copy, and `systemData` gets one append per update.

| Field | Type | Validated (in `state`) |
|-------|------|------------------------|
| `feedWeightGrams` | number | yes. Sum of the 5 trays |
| `targetFeedGrams` | number | yes. Grams **per tray** for the running/last cycle |
| `trayWeightsGrams` | array of 5 numbers (keys `0`–`4`) | yes. Grams on each tray's load cell |
| `hopperLevelPercent` | number | yes |
| `waterLow` | boolean | yes. Reservoir float switch (gravity water, no pump) |
| `feedingActive` | boolean | yes |
| `cycleStep` | string | yes. `IDLE`, `HOMING`, `TO_TRAY`, `TARING`, `DISPENSING`, `TO_END`, `RETURNING` |
| `currentTray` | number | yes. 0–5 (0 = none) |
| `emergencyStopActive` | boolean | yes |
| `timeSource` | string (optional) | yes. `NETWORK`, `RTC` or `INVALID`: where the Mega's clock comes from (R-44); shown in the app's Settings |
| `timestamp` | number | yes |
| any other child | | rejected |

The pump-era fields `waterHigh` and `pumpActive` were removed in the moving-hopper revision; the rules now reject them, so the old firmware can no longer write `state`. Old `systemData` records without tray fields are skipped by the app.

- **Write:** only the device (`deviceAuthUid`).
- **Read:** `state` by the owner or the device; `systemData` by the owner only.
- `systemData` is indexed on `timestamp`. The app reads the latest 50 records with `orderByChild("timestamp").limitToLast(50)` and skips malformed ones.
- **Cadence:** the Mega sends `DATA` every 10 s, and the ESP32 writes `state` (`PUT`) and then appends to `systemData` (`POST`).

**Growth estimate, from the transmission design and not from measurement:** one `systemData` record is roughly 350 bytes with the tray fields, so 8,640 records a day is about **3 MB/day, or around 90 MB/month**, with nothing deleting old records. On the Spark plan's database storage this lasts many months, but it **grows without bound**. A retention policy (for example, the ESP32 appending only every N-th sample, or periodic cleanup by an admin script) should be decided before long-term deployment. These figures should be checked against real usage in the Firebase console.

## 6. `alerts/{deviceId}/{EVENT_NAME}`

| Field | Type | Notes |
|-------|------|-------|
| `eventId` | string | Equals the event name |
| `name` | string | `LOW_FEED`, `LOW_WATER`, `CHAIN_TIMEOUT`, `TRAY_TIMEOUT`, `EMERGENCY_STOP` (`DEVICE_ERROR` is allowed but not produced) |
| `timestamp` | number | Latest occurrence |
| `resolved` | boolean | `false` when raised; `true` once the device reports the condition cleared (R-23) |
| `resolvedAt` | number (optional) | When it was marked resolved. Removed when the alert is raised again (the `PUT` replaces the record) |

- **Write:** only the device. A new occurrence is a `PUT` keyed by event name, so there is **one record per alert type**, overwritten with the latest occurrence, and repeats are idempotent. Resolution is a `PATCH` of `resolved` and `resolvedAt` ([protocol §3.2.1](mega-esp32-protocol.md)).
- **Validation:** `eventId` and `name` must equal the key; `eventId`, `name`, `timestamp` and `resolved` are required, so a partial record cannot be created; no other fields.
- **Read:** the owner, and the device (it checks an alert is still active before resolving it). Indexed on `timestamp`.
- The app lists these in the Notifications tab and raises a local phone notification while it is running, when a timestamp is newer than the last one seen ([`docs/notifications.md`](notifications.md)).
- The `RTDBAlertType` union in the app also lists `DEVICE_OFFLINE`, which nothing produces. Offline status comes from heartbeat age (§4).

## 7. `commands/{deviceId}/{commandId}`

| Field | Type | Written by | Notes |
|-------|------|------------|-------|
| `commandId` | string | Owner | Must equal the key (app format: `cmd_<ms>_<rand>`) |
| `command` | string | Owner | `MANUAL_FEED`, `ESTOP_RELEASE`, `SYSTEM_RESTART`, `STATUS_REQ`, `SCHEDULE_SET` |
| `parameters` | object | Owner | `MANUAL_FEED`: `{targetGrams}`. `SCHEDULE_SET`: `{index, hour, minute, targetGrams, enabled}` |
| `issuedBy` | string | Owner | Must equal `auth.uid` |
| `createdAt` | number | Owner | Phone clock |
| `status` | string | Owner (create) / device | See the lifecycle below |
| `acknowledgedAt`, `completedAt` | number | Device | |
| `error` | string | Device | Failure reason |

- **Create:** the owner only, once (`!data.exists()`), with `status: "queued"`. Owners cannot modify a command after creation.
- **Update:** only the device, and only for `status`, `acknowledgedAt`, `completedAt` and `error`.
- **Read:** the owner or the device. Indexed on `status`; the ESP32 polls `orderByChild("status").equalTo("queued")`.
- **Allowed `status` transitions:**

  ```
  (new) → queued → acknowledged → executing → completed
                 ↘ failed       ↘ failed     ↘ failed
  ```

  `queued → failed` is used for stale commands (older than 5 minutes) and lines that are too long.
- Failure reasons and the full lifecycle are in [`docs/mega-esp32-protocol.md`](mega-esp32-protocol.md) §5.
- **Growth:** commands are never deleted. The app reads the latest 10.

## 8. `schedules/{deviceId}/{scheduleId}`

| Field | Type | Validated | Notes |
|-------|------|-----------|-------|
| `scheduleId` | string | must equal the key | `sched_0`, `sched_1`, `sched_2` (slot index = Mega `feedSchedules[i]`) |
| `hour` | number | 0–23 | **Local time** (PHT), as entered |
| `minute` | number | 0–59 | |
| `targetGrams` | number | > 0 and ≤ 1000 | Grams **per tray**; the app saves whole grams (default 50) |
| `enabled` | boolean | yes | "Delete" in the app writes `enabled: false` at 00:00 |
| `daysOfWeek` | number[] | required | Always `[1..7]`; the Mega runs every schedule daily (decision D3) |

- **Write:** the owner only. The app writes the schedule and queues a matching `SCHEDULE_SET` command.
- **Read:** the owner or the device.
- **Source of truth when online:** after a Mega or ESP32 restart, after Wi-Fi returns, or after a failed `SCHEDULE_SET`, the ESP32 reads this node and re-sends every slot to the Mega. A missing slot is sent as disabled. Offline, the Mega runs its EEPROM copy.

## 9. Not used

- **Cloud Firestore and Cloud Functions** (`firestore.rules`, `backend/functions`): this was the earlier backend design (alerts in Firestore, FCM token registration). It is not deployed and would require the Blaze plan. The app no longer calls it (see `docs/notifications.md`). The functions code is kept for reference.
- `MockDataContext` / `src/mock/data.ts` in the app: not mounted, used for early UI work only.

## 10. Rules tests

[`backend/functions/scripts/test-rtdb-rules.js`](../backend/functions/scripts/test-rtdb-rules.js) covers 61 cases against the emulator: ownership and claiming, device identity, data validation, command creation and lifecycle, schedules, the owned-device query, and stale-command failure. Run it with:

```bash
firebase emulators:exec --only auth,database --project hyfepoul-dev "node backend/functions/scripts/test-rtdb-rules.js"
```
