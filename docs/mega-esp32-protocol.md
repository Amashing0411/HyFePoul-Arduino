# HyFePoul Mega ↔ ESP32 Serial Protocol

This document describes the serial protocol **as implemented** in `firmware/arduino-mega/HyFePoul_Arduino/` and `firmware/esp32/HyFePoul_ESP32/HyFePoul_ESP32.ino` (rewritten in Phase 4, October 2026). The earlier version of this document described a design that was never built; §11 lists the differences.

The behaviour here has been checked with the JavaScript simulators (`scripts/simulate-mega.js`, `scripts/simulate-esp32.js`), which mirror the firmware logic. **It has not yet been verified on the physical serial link.**

## 1. Roles

- **Arduino Mega 2560** is the primary controller. It owns all sensors, actuators, schedules and safety decisions. Commands from the ESP32 are requests, and the Mega validates them before acting.
- **ESP32** is the communication bridge. It translates between this serial protocol and Firebase (Auth + Realtime Database). It never drives actuators.

## 2. Physical link and framing

| Setting | Value |
|---------|-------|
| Mega port | `Serial1` (`ESP32_SERIAL`) |
| ESP32 port | `Serial2` (`MEGA_SERIAL`), RX 16 / TX 17 |
| Baud | 115200, 8N1 *(provisional; confirm on hardware)* |
| Logic levels | Mega TX is 5 V and ESP32 RX is 3.3 V, so a **level shifter or divider is required** |
| Encoding | ASCII text |
| Terminator | `\n`. `\r` is ignored by both sides. |
| Field separator | `|`. Commands and replies use `KEY:value` fields; `DATA`, `EVENT`, `TIME` and `STATUS` are positional. |

**Line length limit (ESP32 → Mega).** The Mega's `Serial1` receive buffer is **64 bytes** (AVR core default). Every line the ESP32 sends must therefore be **at most 63 characters plus `\n`**. The ESP32 enforces this in `sendToMega()`: longer lines are not sent, and a command that would be too long fails in RTDB as `LINE_TOO_LONG`. Consecutive ESP32 → Mega lines are spaced at least **50 ms** apart. The Mega reads the UART continuously while idle (`waitServicingESP32()`).

**Oversized input.** The Mega discards a partial line longer than 200 characters; the ESP32 discards one longer than 512 characters.

## 3. Messages: Mega → ESP32

### 3.1 `DATA` (system data, every 10 s)

```
DATA|<tray1>|<tray2>|<tray3>|<tray4>|<tray5>|<targetPerTray>|<hopperLevelPercent>|<waterLow>|<feedingActive>|<cycleStep>|<currentTray>|<emergencyStopActive>|<timeSource>
```

- `tray1`..`tray5` are the grams on each tray's load cell; `targetPerTray` is the per-tray target of the running/last cycle. Numbers have one decimal place. Booleans are `0` or `1`.
- `cycleStep` is `IDLE`, `HOMING`, `TO_TRAY`, `TARING`, `DISPENSING`, `TO_END` or `RETURNING`; `currentTray` is 1–5 while the hopper is at or heading to a tray, otherwise 0. `waterLow` is the reservoir float switch (debounced 2 s). `timeSource` is `NETWORK`, `RTC` or `INVALID`.
- It is also sent immediately in response to `STATUS_REQ`.
- The ESP32 requires exactly 13 separators (14 fields) and ignores other lines. It writes `trayWeightsGrams`, their sum as `feedWeightGrams`, and a UTC timestamp from NTP to `devices/{id}/state`, then appends the record to `systemData/{id}`. It skips the write if NTP time is not yet valid.

Example: `DATA|50.2|51.0|12.4|0.0|0.0|50.0|64.0|0|1|DISPENSING|3|0|NETWORK`

This line replaced the pump-era format (`…|waterLow|waterHigh|pump|feeding|…`) in the moving-hopper revision. Both boards must run matching firmware.

### 3.2 `EVENT`

```
EVENT|<NAME>
```

Events are queued on the Mega (4 slots; the oldest is dropped when full) and sent one per loop. They are not acknowledged and not retried.

| Event | Raised when | Forwarded to RTDB `/alerts`? |
|-------|-------------|------------------------------|
| `SYSTEM_START` | Every Mega boot | No. It makes the ESP32 restore schedules and resend the link status (§7). |
| `EMERGENCY_STOP` | E-stop pressed (latches) | Yes |
| `EMERGENCY_STOP_RELEASED` | E-stop reset (remote, serial `RESET` or Nextion), and once at boot | No. Resolves `EMERGENCY_STOP` (§3.2.1) |
| `LOW_FEED_CLEARED` | Hopper back to 25% or more after a `LOW_FEED`, and at boot if the level is fine | No. Resolves `LOW_FEED` |
| `LOW_WATER_CLEARED` | Reservoir float no longer low (2 s debounce) after a `LOW_WATER`, and at boot if it is fine | No. Resolves `LOW_WATER` |
| `LOW_FEED` | Hopper at or below 20% (clears at 25% or more) | Yes |
| `LOW_WATER` | Reservoir float switch low for 2 s (refill needed); once per low episode, with a buzzer beep | Yes |
| `CHAIN_TIMEOUT` | A chain move did not reach its limit switch in time (homing/return 30 s, to end 15 s). Motors stop; buzzer | Yes |
| `TRAY_TIMEOUT` | A tray was not filled: its dispense ran 30 s without reaching the target, or its load cell did not respond. The cycle continues with the next tray. Once per cycle; buzzer | Yes |
| `LOW_FEED` (mid-cycle) | Also raised again when the hopper drops to 5% during a cycle; the cycle stops dispensing and returns home | Yes |
| `FEEDING_STARTED` / `FEEDING_COMPLETED` | Scheduled cycle started / any cycle finished with every tray filled | No (logged on the Mega SD card) |

`DEVICE_ERROR` is on the ESP32 whitelist but is not raised by the current Mega firmware.

The ESP32 writes forwarded events with `PUT` to `/alerts/{deviceId}/{NAME}`. That gives **one record per event type**, overwritten with the latest timestamp, so a repeated event is idempotent.

#### 3.2.1 Alert resolution (R-23)

Clear events mark the matching alert record `resolved: true` with `resolvedAt`:

| Event | Resolves |
|-------|----------|
| `LOW_FEED_CLEARED` | `LOW_FEED` |
| `LOW_WATER_CLEARED` | `LOW_WATER` |
| `EMERGENCY_STOP_RELEASED` | `EMERGENCY_STOP` |
| `FEEDING_COMPLETED` (every tray filled, hopper back home) | `CHAIN_TIMEOUT`, `TRAY_TIMEOUT` |

- **At boot** the Mega sends the clears for every condition that is fine (after `SYSTEM_START`), so alerts left from before a power loss are resolved. The alert queue holds 8 events for this burst.
- **The ESP32 keeps pending resolves** (one bit per alert type) until it is online with a valid token, because the boot clears usually arrive before Wi-Fi is up. It retries every 5 s until the write succeeds.
- **Only existing, still-active records change:** the ESP32 first reads `/alerts/{id}/{NAME}/resolved`, then `PATCH`es `{resolved: true, resolvedAt}` only if it is `false`. A missing alert is never created. The rules also reject partial records.
- **Order is kept:** a new occurrence of an alert (its own event) cancels a pending resolve for it, and its `PUT` replaces the record (`resolved: false`, no `resolvedAt`).
- **Limitation:** an alert raised while the ESP32 is offline is still not written (no event retry); its clear then finds nothing to resolve.

### 3.3 `CMD_ACK` and `CMD_DONE` (command replies)

```
CMD_ACK|ID:<id>|STATUS:ACCEPTED
CMD_ACK|ID:<id>|STATUS:REJECTED|REASON:<reason>
CMD_DONE|ID:<id>|STATUS:SUCCESS
CMD_DONE|ID:<id>|STATUS:FAILED|REASON:<reason>
```

`<id>` echoes the UART ID from the `CMD` line (§4.3).

## 4. Messages: ESP32 → Mega

### 4.1 `TIME` (every 30 s once NTP is synced)

```
TIME|YYYY-MM-DD|HH:MM:SS
```

The time is in UTC. The Mega rejects values with a year before 2024 or out-of-range fields. Otherwise it writes the RTC and marks the time source `NETWORK` for 5 minutes.

### 4.2 `STATUS` (on change and every 10 s)

```
STATUS|ONLINE      (Wi-Fi connected and a valid Firebase session)
STATUS|OFFLINE
```

On the Mega, `esp32Online` is true only if the last `STATUS` was `ONLINE` **and** some line arrived within the last **15 s**. Any line refreshes the link timer, but only `STATUS` lines change the online flag. The value feeds the Nextion network field and the SD log column.

### 4.3 `CMD` (remote command)

```
CMD|ID:<id>|ACTION:<ACTION>[|<KEY>:<value>...]
```

**IDs.** Firebase command IDs (about 23 characters) never reach the UART. The ESP32 gives each forwarded command a short UART ID, **`C0`–`C9`** (cycling), and keeps the mapping to the Firebase ID itself. Schedule restores use **`R0`–`R2`** (§7). The Mega treats IDs as opaque strings.

| `ACTION` | Parameters | Mega validation → `CMD_ACK` `REJECTED` reasons | Completion |
|----------|------------|-----------------------------------------------|------------|
| `MANUAL_FEED` | `TARGET:<grams per tray>` | `MISSING_TARGET`; `INVALID_TARGET` (≤ 0 or > 1000); `ESTOP_ACTIVE`; `FEEDING_ACTIVE`; `HOPPER_LOW` (hopper ≤ 5%) | Runs one full 5-tray cycle. `CMD_DONE SUCCESS` when every tray reached the target and the hopper is back home. `FAILED` with the first problem: `TRAY_TIMEOUT`, `HOPPER_EMPTY`, `END_LIMIT_EARLY` (tray timings too long), `CHAIN_TIMEOUT` or `ESTOP_ACTIVE`. A cycle takes about a minute; the ESP32 allows 300 s. |
| `SCHEDULE_SET` | `IDX:<0-2>|HR:<0-23>|MIN:<0-59>|TGT:<whole grams per tray, ≤ 1000>|EN:<0/1>` | `MALFORMED_SCHEDULE`; `INVALID_INDEX`; `INVALID_TIME`; `INVALID_TARGET` | Applied, saved to EEPROM, then `CMD_DONE SUCCESS` immediately. Hours and minutes are **local time** (§6). |
| `ESTOP_RELEASE` | none | `PHYSICAL_ESTOP_ENGAGED` (button still pressed); `ESTOP_NOT_ACTIVE` | Clears the latch, then `CMD_DONE SUCCESS`. The hopper stays where it stopped; the next cycle homes first. |
| `STATUS_REQ` | none | none | Sends `DATA`, then `CMD_DONE SUCCESS`. |
| `SYSTEM_RESTART` | none | Always `NOT_IMPLEMENTED_SAFELY` | none |
| anything else | | `UNKNOWN_COMMAND` | |

Rejections that apply to every command:
- `MALFORMED`: there is an `ID` but no `ACTION`. A line with no `ID` is ignored silently.
- `DUPLICATE_ID`: the same ID as the command still in progress.
- `SYSTEM_BUSY`: another command is still in progress. Only `MANUAL_FEED` stays in progress across loops.

Longest app-originated line: `CMD|ID:C9|ACTION:SCHEDULE_SET|IDX:2|HR:23|MIN:59|TGT:2000|EN:1`, which is 62 characters.

## 5. Command lifecycle (RTDB ↔ UART)

The app writes `/commands/{deviceId}/{commandId}` with `status: queued`. The ESP32 polls every 5 s and handles **one command at a time**:

| Step | RTDB `status` | Trigger |
|------|---------------|---------|
| ESP32 picks up a queued command | `acknowledged` | The UART line is built first. Then the RTDB status is updated and the `CMD` is sent. |
| Mega accepts | `executing` | `CMD_ACK … ACCEPTED` |
| Mega finishes | `completed` | `CMD_DONE … SUCCESS` |
| Failure | `failed` + `error` | See below |

`error` values written by the ESP32:
- the Mega's `REASON`, or `REJECTED_BY_MEGA` / `FAILED_DURING_EXECUTION` if it gave none;
- `STALE_COMMAND`: the command was older than 5 minutes when picked up (rules allow `queued → failed` for the device);
- `UART_TIMEOUT`: no `CMD_ACK` within 3 s;
- `EXECUTION_TIMEOUT`: no `CMD_DONE` within 120 s;
- `LINE_TOO_LONG`: the UART line would exceed 63 characters.

A `SCHEDULE_SET` that fails for any of these reasons also triggers a schedule restore (§7).

## 6. Time and time zone

- The ESP32 gets NTP time in **UTC** and the Mega RTC stores **UTC**. `DATA` timestamps (added by the ESP32), RTDB records and the SD log are all UTC.
- **Exception, feed schedules:** `SCHEDULE_SET` hours and minutes are local wall-clock time, as the user enters them in the app and as stored under `/schedules`. The Mega applies a fixed offset (`LOCAL_UTC_OFFSET_MINUTES = 480`, Philippine Standard Time, no daylight saving) only when matching schedules and when drawing the Nextion clock (`getLocalDateTime()`).
- The app converts UTC to local time for display.

## 7. Schedule persistence and restore

- **Mega EEPROM:** every accepted `SCHEDULE_SET` is saved to EEPROM, as a 25-byte record with magic, version and checksum, and reloaded at boot. A blank or corrupt record falls back to the firmware defaults.
- **Restore (ESP32 → Mega).** It is triggered by:
  - ESP32 boot;
  - Wi-Fi coming back;
  - `EVENT|SYSTEM_START`;
  - a `SCHEDULE_SET` that went stale, was rejected, timed out or was too long.

  The ESP32 reads `/schedules/{deviceId}` and sends, **one at a time, waiting for each `CMD_ACK`**:

  ```
  CMD|ID:R<i>|ACTION:SCHEDULE_SET|IDX:<i>|HR:<h>|MIN:<m>|TGT:<whole grams>|EN:<0|1>     (i = 0, 1, 2)
  ```

  - A slot missing or invalid in RTDB is sent with `EN:0`, because RTDB is the source of truth when online.
  - If the RTDB read fails, nothing is sent and the Mega keeps its EEPROM copy.
  - If a line is rejected (for example `SYSTEM_BUSY` during a feed) or gets no ACK within 3 s, the restore is retried after 30 s.
  - Command polling pauses during a restore.
  - Restore IDs are never written to `/commands`.

## 8. Timing summary

| What | Interval / timeout |
|------|--------------------|
| Mega `DATA` | 10 s |
| ESP32 `STATUS` | 10 s and on change |
| Mega link timeout (`esp32Online`) | 15 s without any line |
| ESP32 `TIME` and RTDB heartbeat | 30 s |
| ESP32 command poll | 5 s |
| `CMD_ACK` timeout | 3 s |
| `CMD_DONE` timeout | 120 s |
| Stale command | older than 5 min |
| Schedule restore retry | 30 s |
| Wi-Fi reconnect attempt | every 15 s while disconnected |
| Firebase sign-in retry | 30 s; token refreshed 5 min before expiry or after a 401 |
| Gap between ESP32 → Mega lines | ≥ 50 ms |

## 9. Safety and offline behaviour

- **No network:** the Mega keeps running feeding, hydration, E-stop and SD logging from its RTC and EEPROM schedules. The ESP32 keeps the UART link and `STATUS|OFFLINE` going, and reconnects in the background.
- **UART link down:** the Mega's local logic is unaffected; `esp32Online` goes false after 15 s.
- No remote command can bypass the Mega's safety checks: the E-stop latch, the physical button check, feed limits and timeouts.

### 9.1 Mega link health on the ESP32 (R-24)

- The ESP32 records the time of every line it receives from the Mega (`DATA` every 10 s, events, command replies).
- No line for **30 s** (three missed `DATA`) means the Mega is silent, for example crashed, unpowered, or with a loose UART cable. The ESP32 then:
  - writes `devices/{id}/megaLinkOk = false`;
  - raises a `CONTROLLER_OFFLINE` alert. The ESP32 itself is still online, so the write goes through and the app shows a phone notification.
- When a line arrives again, it writes `megaLinkOk = true` and resolves `CONTROLLER_OFFLINE` (the R-23 path, §3.2.1).
- `megaLinkOk` is written on its own request whenever it changes, and re-asserted with every heartbeat (30 s), so a failed write heals itself. Because it is separate from the heartbeat writes, rules that do not know the field yet (before R-45 is deployed) reject only this write.
- The boot time counts as "last heard". A freshly started ESP32 reports a problem only if the Mega stays silent for 30 s.
- The app shows the controller as "NOT RESPONDING" and blocks manual feeding while `megaLinkOk` is `false` and the device is otherwise online. A missing field (older firmware) is not treated as a fault.

## 10. Security notes (ESP32 side)

- Production HTTPS requests verify Firebase's certificate against the esp32 core's built-in CA bundle (`NetworkClientSecure::useBuiltinCACertBundle()`). The emulator uses plain HTTP on the LAN.
- The Firebase ID token is sent as the RTDB `?auth=` query parameter, which is the standard REST method, so it stays encrypted on the wire. At **Core Debug Level** Debug/Verbose, `HTTPClient` logs request URLs including the token, and the sketch emits a compile-time warning in that case. Keep the level at **None** for deployments.
- Wi-Fi and device-account credentials live in `Config.h`, which is gitignored (template: `Config.example.h`).

## 11. Differences from the original design

| Original design (pre-implementation) | Implemented |
|--------------------------------------|-------------|
| `KEY:value` fields in `DATA` with an ISO 8601 timestamp | Positional `DATA` fields. The ESP32 adds the timestamp. |
| Actionable `EVENT`s carry `eventId` (session-counter); the ESP32 `ACK`s; the Mega retries; the ESP32 deduplicates | No event IDs, ACKs or retries. Duplicates are harmless because RTDB alerts are `PUT` per event type. A Mega-side 4-slot queue prevents loss within a loop. |
| `HEARTBEAT` both ways every 30 s, 90 s timeout | ESP32 `STATUS` every 10 s doubles as the heartbeat, with a 15 s timeout on the Mega. The ESP32 tracks the Mega too (R-24): no line for 30 s means the Mega is silent (§9.1). |
| `NET_STATUS|state:ONLINE` | `STATUS|ONLINE` / `STATUS|OFFLINE` |
| `TIME|timestamp:<ISO8601>` | `TIME|YYYY-MM-DD|HH:MM:SS` |
| `CMD_RESERVED` / `ACK_CMD` (reserved, not to be implemented) | `CMD` / `CMD_ACK` / `CMD_DONE` with the full lifecycle (Checkpoints 5B.7–5B.9, short UART IDs in Phase 4) |
| `PUMP_TIMEOUT` | Removed with the pump (moving-hopper revision); `CHAIN_TIMEOUT` and `TRAY_TIMEOUT` added |
| Maximum line 256 bytes | Maximum 63 characters + `\n` toward the Mega (64-byte receive buffer) |

## 12. Example exchanges

**Startup (Mega boots while the ESP32 is online):**
```text
Mega  -> ESP32: EVENT|SYSTEM_START
ESP32 -> Mega:  STATUS|ONLINE
ESP32 -> Mega:  CMD|ID:R0|ACTION:SCHEDULE_SET|IDX:0|HR:7|MIN:0|TGT:250|EN:1
Mega  -> ESP32: CMD_ACK|ID:R0|STATUS:ACCEPTED
Mega  -> ESP32: CMD_DONE|ID:R0|STATUS:SUCCESS
ESP32 -> Mega:  CMD|ID:R1|ACTION:SCHEDULE_SET|IDX:1|HR:0|MIN:0|TGT:250|EN:0
...                                                     (R2, then "Schedule restore complete.")
ESP32 -> Mega:  TIME|2026-10-21|06:00:00
Mega  -> ESP32: DATA|0.0|0.0|64.0|0|1|0|0|0|NETWORK
```

**Manual feed from the app:**
```text
(RTDB /commands/device-001/cmd_1792564656742_a7djh: queued -> acknowledged)
ESP32 -> Mega:  CMD|ID:C3|ACTION:MANUAL_FEED|TARGET:120
Mega  -> ESP32: CMD_ACK|ID:C3|STATUS:ACCEPTED            (RTDB: executing)
Mega  -> ESP32: DATA|40.0|120.0|64.0|0|1|0|1|0|NETWORK
Mega  -> ESP32: EVENT|FEEDING_COMPLETED                   (not forwarded)
Mega  -> ESP32: CMD_DONE|ID:C3|STATUS:SUCCESS            (RTDB: completed)
```

**E-stop during a feed:**
```text
Mega  -> ESP32: CMD_DONE|ID:C4|STATUS:FAILED|REASON:ESTOP_ACTIVE   (RTDB: failed / ESTOP_ACTIVE)
Mega  -> ESP32: EVENT|EMERGENCY_STOP                                (RTDB /alerts/device-001/EMERGENCY_STOP)
ESP32 -> Mega:  CMD|ID:C5|ACTION:ESTOP_RELEASE                      (button still pressed)
Mega  -> ESP32: CMD_ACK|ID:C5|STATUS:REJECTED|REASON:PHYSICAL_ESTOP_ENGAGED
```

**Wi-Fi drops and returns:**
```text
ESP32 -> Mega:  STATUS|OFFLINE        (Nextion shows OFFLINE; local control continues)
...                                   (ESP32 retries Wi-Fi every 15 s)
ESP32 -> Mega:  STATUS|ONLINE
ESP32 -> Mega:  CMD|ID:R0|ACTION:SCHEDULE_SET|...   (restore after reconnect)
```
