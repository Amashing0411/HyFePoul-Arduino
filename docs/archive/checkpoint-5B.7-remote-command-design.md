# Checkpoint 5B.7: Remote Command Security & Protocol Design

## 1. Candidate Command Boundary
The cloud-to-device command flow allows the mobile application to trigger specific actions on the Arduino Mega. The Mega remains the absolute authority regarding safety.

| Command Name | Parameters | Issuer | Validator | Acknowledgement | Operates during E-Stop? | Expected Response | Failure Behavior |
|--------------|------------|--------|-----------|-----------------|-------------------------|-------------------|------------------|
| `MANUAL_FEED` | `targetGrams` (number) | Owner | Mega | Yes | No | Starts feeding, responds `completed` when target hit. | Fails if E-stop active, scale disconnected, or timeout. |
| `ESTOP_RELEASE`| None | Owner | Mega | Yes | Yes (clears it) | Clears software E-stop state. | Fails if physical E-Stop pin is still `LOW` (engaged). |
| `SYSTEM_RESTART`| None | Owner | Mega | Yes | Yes | Mega reboots via WDT. | Responds `acknowledged` just before reboot. |
| `STATUS_REQ` | None | Owner | ESP32 | Yes | Yes | Immediately pushes state to RTDB. | Fails if UART is disconnected. |

## 2. Safety Authority
The **Arduino Mega 2560** is the strict hardware safety controller.
- **Physical Precedence**: Remote commands cannot override the physical `EMERGENCY_STOP_PIN`. If the pin is pulled `LOW`, a remote `ESTOP_RELEASE` will be rejected by the Mega.
- **Limit Enforcement**: A `MANUAL_FEED` command exceeding logical hopper limits or safety timeouts will be naturally truncated by the Mega's local `runActiveFeeding()` fail-safes.
- **ESP32 Role**: The ESP32 acts solely as an untrusted message broker. It translates RTDB JSON to UART strings but executes no physical actuation.

## 3. RTDB Command Schema
Commands will be stored under a new `commands` node, indexed by `deviceId` and a unique `commandId`.

**Path:** `commands/{deviceId}/{commandId}`
```json
{
  "commandId": "-Nxyz123...",
  "command": "MANUAL_FEED",
  "parameters": { "targetGrams": 500 },
  "createdAt": 1790000000000,
  "issuedBy": "owner_uid",
  "status": "queued", 
  "acknowledgedAt": null,
  "completedAt": null,
  "error": null
}
```

## 4. Authorization Model (RTDB Rules)
Security rules must strictly separate the Owner's privileges from the Device's privileges.

- **Owner Privileges**:
  - Can **CREATE** a command ONLY if `devices/{deviceId}/ownerId` matches their `auth.uid`.
  - Can ONLY set initial `status` to `"queued"`.
  - Can **READ** commands for their device.
  - CANNOT modify `acknowledgedAt`, `completedAt`, `error`, or alter `status` after creation.
- **Device (ESP32) Privileges**:
  - Can **READ** commands ONLY if `devices/{deviceId}/deviceAuthUid` matches its `auth.uid`.
  - Can **UPDATE** `status` (to `acknowledged`, `executing`, `completed`, `failed`).
  - Can **UPDATE** `acknowledgedAt`, `completedAt`, and `error`.
  - CANNOT create new commands or modify `command`/`parameters` fields.

## 5. Replay Protection
- **Duplicate IDs**: RTDB rules (`!data.exists()`) ensure the mobile app generates a unique Push ID for every command. The ESP32 cannot overwrite an existing command with a new payload.
- **Stale Commands**: If the ESP32 receives a `"queued"` command where `(current_NTP_time - createdAt) > 5_MINUTES`, the ESP32 automatically marks it as `failed` with error `"STALE_COMMAND"`, preventing a queued feed command from dropping feed hours later after an internet outage.
- **Device Targeting**: A command is strictly written to `commands/{deviceId}`. The ESP32 only listens to its own tree.
- **Mega Replay Filter**: The Mega tracks the currently executing `commandId`. If it receives a duplicate `commandId` while active, it ignores the redundant frame.

## 6. Command Lifecycle
The state machine utilizes the `status` field:
1. `queued`: Written by Mobile App.
2. `acknowledged`: Written by ESP32 upon receiving the RTDB event.
3. `executing`: Written by ESP32 after the Mega ACKs the UART command.
4. `completed`: Written by ESP32 when the Mega signals UART completion.
5. `failed`: Written by ESP32 if the Mega rejects it, UART times out, or the command is stale.

## 7. UART Protocol Extension
To transport commands seamlessly across the serial bridge, we define the following frames, adhering to the requested `TYPE|KEY:VALUE` format.

**ESP32 → Mega (Issue Command):**
`CMD|ID:-Nxyz|ACTION:MANUAL_FEED|TARGET:500\n`

**Mega → ESP32 (Acknowledge / Reject):**
`CMD_ACK|ID:-Nxyz|STATUS:ACCEPTED\n`
`CMD_ACK|ID:-Nxyz|STATUS:REJECTED|REASON:ESTOP_ACTIVE\n`

**Mega → ESP32 (Completion):**
`CMD_DONE|ID:-Nxyz|STATUS:SUCCESS\n`
`CMD_DONE|ID:-Nxyz|STATUS:FAILED|REASON:TIMEOUT\n`

## 8. Offline Behavior
- **Mobile Offline**: UI prevents pushing to RTDB. App shows offline indicator.
- **ESP32 Offline (Wi-Fi drop)**: Commands queue in RTDB. Upon reconnection, the ESP32 pulls all `"queued"` commands. Any command older than the stale threshold (e.g., 5 mins) is immediately marked `failed`.
- **Mega Offline (UART drop)**: The ESP32 detects the RTDB command, forwards it over UART, but receives no `CMD_ACK`. After a 3-second timeout, the ESP32 marks the RTDB command `failed` (`"UART_TIMEOUT"`).
- **Autonomous Safeties**: If the ESP32 drops off the network entirely, the Mega seamlessly continues executing its internal feeding schedule, local float-switch hydration logic, and physical E-Stop monitoring without interruption.

## 9. Unresolved Decisions
- **Parameter Types**: Should parameters be rigidly defined in RTDB rules per command, or passed as a generic JSON string validated by the Mega? (Recommendation: Keep rules generic, let Mega validate parameters for maximum flexibility).
- **Command History**: Should completed commands be pruned from RTDB to save space, or retained for audit logs? (Recommendation: Mobile app deletes commands older than 7 days, or a Cloud Function handles TTL cleanup).
