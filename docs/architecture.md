# HyFePoul System Architecture

**As implemented (October 2026).** Earlier versions of this document described a Cloud Functions + Firestore + FCM backend; that design was replaced by the Firebase Realtime Database and is not deployed (§6).

## Overall system flow

```
Arduino Mega 2560 ──UART── ESP32 ──Wi-Fi / HTTPS── Firebase (Auth + Realtime Database) ── Android app
 (control + safety)        (bridge)                  (Spark plan, no server code)          (React Native / Expo)
```

The Mega and the app never talk directly; everything goes through Firebase. The ESP32 talks to Firebase's REST API, and the app uses the Firebase JS SDK.

## Components

Hardware block diagram (moving-hopper revision): [`diagrams/hyfepoul-block-diagram.png`](diagrams/hyfepoul-block-diagram.png) (editable SVG next to it).

### 1. Arduino Mega 2560 (primary controller and safety authority)
`firmware/arduino-mega/HyFePoul_Arduino/`
- Reads the 5 tray load cells (HX711, one SCK/DT pair per tray), the ultrasonic hopper sensor, the home/end limit switches, the reservoir float switch and the E-stop input.
- Drives the chain motor (two interlocked polarity relays) that moves the hopper past the 5 trays, and the dispenser motor. Water is gravity-fed; there is no pump.
- Runs up to 3 daily feeding schedules in **local time** (UTC+8). The schedules are stored in **EEPROM**, so they survive power loss.
- Applies the safety logic:
  - latching E-stop (reset only while the button is released);
  - chain relays never on together, with a dead time before reversing; limit switches stop the chain in any state;
  - chain move timeouts (`CHAIN_TIMEOUT`) and a 30 s per-tray dispense limit (`TRAY_TIMEOUT`);
  - hopper empty mid-cycle: stop dispensing and return home.
- Validates every remote command before acting on it.
- Writes a CSV log to the SD card.
- Drives the Nextion display: Home page fields, plus Stop/Start buttons.
- Sends `DATA` every 10 s and `EVENT`s to the ESP32. It keeps working without the ESP32 or the network.

### 2. ESP32 (communication bridge, no control authority)
`firmware/esp32/HyFePoul_ESP32/`
- Keeps Wi-Fi connected, reconnecting in the background.
- Signs in to Firebase Auth with the device's own account and calls RTDB over **certificate-verified HTTPS**.
- Writes device state, history, heartbeat and alerts.
- Polls queued commands and forwards them to the Mega with short UART IDs, then reports the result back.
- Re-sends schedules from RTDB to the Mega after a restart or a failed sync.
- Sends NTP time and online/offline status to the Mega.
- Serial protocol: [`mega-esp32-protocol.md`](mega-esp32-protocol.md).

### 3. Backend: Firebase Auth + Realtime Database
- Project `hyfepoul-dev`, database `hyfepoul-dev-default-rtdb` (`asia-southeast1`), **Spark (free) plan**.
- No server code. Integrity is enforced entirely by the RTDB security rules ([`database.rules.json`](../database.rules.json), 61 tests):
  - device claiming with a setup PIN;
  - owner-only access;
  - device-only writes for device data;
  - a validated command lifecycle.
- Data model: [`database-schema.md`](database-schema.md).

### 4. Mobile application
`mobile-app/` (React Native, Expo SDK 57, TypeScript, Android development builds)
- Sign-in, device claiming, Dashboard, Feeding (schedules and manual feed), Water, History, Notifications, Settings.
- Live RTDB listeners. Online status is derived from heartbeat age.
- Commands go through the lifecycle with plain-language status.
- **Local** notifications are raised while the app is running ([`notifications.md`](notifications.md)).
- Screen status: [`mobile-app-completion-matrix.md`](mobile-app-completion-matrix.md).

## Key data paths

| Path | Route |
|------|-------|
| Device data | Mega `DATA` (10 s) → ESP32 → `devices/{id}/state` + `systemData/{id}` → app listener |
| Alerts | Mega `EVENT` → ESP32 (whitelisted) → `alerts/{id}/{NAME}` → app list + local notification |
| Commands | App → `commands/{id}/{cmdId}` (queued) → ESP32 poll (5 s) → Mega `CMD` → `CMD_ACK` / `CMD_DONE` → ESP32 updates status → app |
| Schedules | App → `schedules/{id}` + `SCHEDULE_SET` command → Mega EEPROM; restored from RTDB after restarts |
| Time | NTP → ESP32 → Mega RTC (UTC); schedules and display in local time |

## Design constraints and extensibility

- **Authority:** the Mega is the only component that can act on hardware, and it applies its safety checks to every remote request.
- **Cost:** no Blaze plan and no paid services. As a result there is no server push (notifications only while the app runs) and no server-side cleanup or alert resolution.
- **Users:** one owner per device in the prototype. Ownership is a field (`ownerId`) and the device identity is separate (`deviceAuthUid`), so roles or more users can be added later.
- **Provisioning:** the prototype uses a configured device ID (`device-001`) and a setup PIN set by an admin. QR-code provisioning is a future enhancement.
- **Data transmission:** `DATA` every 10 s, heartbeat every 30 s, command poll every 5 s. History retention is an open decision ([`remaining-work-roadmap.md`](remaining-work-roadmap.md) R-22).

## 6. Replaced design (not deployed)

The original plan used Firebase Cloud Functions (HTTP endpoints for the ESP32 with header-based device secrets), Cloud Firestore and FCM push. It needs the Blaze plan, was never deployed, and the app no longer calls it. The code remains in `backend/functions` for reference, and the design is described in [`firebase-backend-architecture.md`](firebase-backend-architecture.md) and [`api-contract.md`](api-contract.md), both marked historical.
