# Checkpoint 5B.8 Report: Remote Command RTDB Security

## Implemented Security Foundation
This checkpoint establishes the Firebase Realtime Database schema and strictly enforced security boundaries for future remote commands. Remote command execution is **NOT** implemented in this checkpoint.

### 1. Command Schema
Commands are stored securely at `commands/{deviceId}/{commandId}`.
During creation, the rules strictly enforce the presence of:
- `commandId` (matching the path key)
- `command` (must be an approved string)
- `issuedBy` (must match the Owner's `auth.uid`)
- `createdAt` (must be a number)
- `status` (must initially be `"queued"`)

### 2. Owner Permissions
The authenticated mobile app (Owner) acts as the command issuer.
- **Can Create:** YES, but only if they legitimately own the `deviceId`.
- **Can Read:** YES, for their owned devices.
- **Can Overwrite/Modify:** NO. `!data.exists()` strictly prevents replay attacks or modification of executing commands.
- **Can Bypass Status Lifecycle:** NO. Creation mandates `status === "queued"`. They cannot maliciously forge `completed` or `executing`.

### 3. ESP32 Permissions
The authenticated Wi-Fi bridge (ESP32) acts as the state transitioner.
- **Can Read:** YES, only for its mapped `deviceId`.
- **Can Create:** NO. 
- **Can Modify Command Payload:** NO. The rules strictly block the ESP32 from updating `command`, `parameters`, `createdAt`, or `issuedBy`.
- **Can Update Execution Fields:** YES. The ESP32 is explicitly allowed to update `status`, `acknowledgedAt`, `completedAt`, and `error`.

### 4. Lifecycle Restrictions
The ESP32 is mathematically constrained by `.validate` rules to only step through the approved lifecycle:
- `queued` → `acknowledged`
- `acknowledged` → `executing` OR `failed`
- `executing` → `completed` OR `failed`
An invalid transition (e.g., reverting a `completed` command back to `queued`) triggers an immediate `permission_denied` error.

### 5. Replay Protection & Whitelisting
- Overwriting is physically impossible at the database layer.
- Supported commands are rigorously validated against the whitelist: `MANUAL_FEED`, `ESTOP_RELEASE`, `SYSTEM_RESTART`, `STATUS_REQ`. Any other command name is rejected at insertion.

### 6. E-Stop Boundary
The `ESTOP_RELEASE` command can now be successfully queued by an Owner. However, the database layer does not (and cannot) actuate physical hardware. The future ESP32/Mega implementation will pull this command and determine locally if it is safe to execute.

## Test Results
A rigorous suite of **25 new security tests** was added to the emulator test script, covering every edge case from unauthenticated spoofing to lifecycle inversion.

- RTDB Security Rules Tests: **47/47 PASS**
- TypeScript / Lint: **PASS** (No application code modified)

## Limitations
- Stale command age (e.g., > 5 mins) is not validated by RTDB rules, as this requires device-side local time awareness. This must be enforced by the ESP32 firmware in the next checkpoint.
- Parameters are purposefully left unvalidated at the RTDB level to allow flexible JSON payloads. The Mega will validate strict numerical bounds locally.
