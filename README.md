# HyFePoul

<p align="center"><img src="mobile-app/assets/hyfepoul-logo.png" alt="HyFePoul logo" width="180"></p>

**HyFePoul: An Arduino-Based Precision Poultry Management System with Weight-Sensing Feeders and Automated Hydration Monitoring Device.** This is an undergraduate Computer Engineering thesis project.

HyFePoul automates feeding and watering for a small poultry setup. An Arduino Mega moves a feed hopper along a chain past 5 trays and fills each tray to a target weight measured by that tray's load cell, warns when the gravity-fed water reservoir needs refilling, and enforces a physical emergency stop. An ESP32 links the device to Firebase, so the owner can monitor it and send commands from an Android app.

> **Project status (October 2026):** the firmware, backend rules and mobile app are complete in software and tested with simulators, the Firebase emulators and an Android emulator. **The physical prototype has not been commissioned yet**, so sensor calibration, relay polarity, E-stop wiring and the Mega–ESP32 serial link are still unverified on hardware. See [`docs/comprehensive-work-plan.md`](docs/comprehensive-work-plan.md) for the detailed status.

## How it works

```
 ┌──────────────────────┐   UART    ┌──────────────┐  Wi-Fi / HTTPS  ┌───────────────────────┐        ┌──────────────────┐
 │ Arduino Mega 2560    │ ◄───────► │ ESP32        │ ◄─────────────► │ Firebase              │ ◄────► │ Android app      │
 │ sensors, actuators,  │ 115200    │ communication│   REST API      │ Auth + Realtime DB    │        │ (React Native /  │
 │ safety, schedules,   │           │ bridge only  │                 │ (Spark plan)          │        │  Expo)           │
 │ SD log, Nextion      │           └──────────────┘                 └───────────────────────┘        └──────────────────┘
 └──────────────────────┘
```

- **The Mega is in charge.** It reads every sensor, runs the feeding schedules and the feed cycle, writes the SD log, drives the Nextion display, and has the final say on safety. Remote commands are only requests, and the Mega validates them before acting.
- **The ESP32 only communicates.** It signs in to Firebase as the device and forwards Mega data and alerts to the Realtime Database. It also passes owner commands to the Mega and syncs network time.
- **The app only talks to Firebase**, never directly to the device.
- **The device works offline.** Schedules are stored in the Mega's EEPROM and run from its RTC without the network.

### Hardware

| Part | Role |
|------|------|
| Arduino Mega 2560 | Main controller |
| ESP32 | Wi-Fi bridge to Firebase |
| 5 load cells + 5 HX711 (one under each tray) | Weigh the feed dispensed into each tray |
| Ultrasonic sensor | Hopper feed level |
| Chain motor (reversed by two relays) + home/end limit switches | Moves the hopper past the trays and back |
| Dispenser motor + relay | Releases feed from the hopper |
| Float switch (reservoir) | Water reservoir low. Water reaches the drinker by gravity; there is no pump |
| DS3231 RTC | Timekeeping, synced from network time |
| SD card module | Local CSV activity log |
| Nextion 7" touchscreen | Local display |
| Emergency stop button, buzzer | Safety and alarms |

Block diagram: [`docs/diagrams/hyfepoul-block-diagram.png`](docs/diagrams/hyfepoul-block-diagram.png).

Pin assignments are in [`firmware/arduino-mega/HyFePoul_Arduino/Config.ino`](firmware/arduino-mega/HyFePoul_Arduino/Config.ino). Confirm them against the real wiring before powering anything.

## Features

- **Feed cycle:** the hopper homes, then for trays 1→5 it moves to the tray (timed travel), tares the tray's load cell and dispenses until the tray reaches the target (default **50 g per tray**, 30 s limit per tray). It then runs to the end limit switch and returns to the home switch. Chain moves have timeouts, the two direction relays are interlocked, and an empty hopper ends the cycle early and returns home.
- **Scheduled feeding:** up to 3 daily schedules in local time (UTC+8), each with a per-tray target.
- **Manual feed:** start a cycle from the app (1–1000 g per tray). The app shows the tray weights, the cycle step and each command step: waiting for device, received, running, and done or failed.
- **Water:** the reservoir float switch raises a refill alert with a buzzer beep. Nothing is switched for water.
- **Emergency stop:** latches until it is explicitly reset (from the app, or `RESET` on the serial monitor). Actuators are held off while it is latched.
- **Alerts:** low feed, low water (refill), chain timeout, tray not filled, and E-stop. They appear in the app's Notifications tab, and as phone notifications while the app is running.
- **Schedules survive restarts:** they are saved in EEPROM and re-synced from Firebase after either board restarts.
- **Owner accounts:** email sign-in, and device claiming with a setup PIN. Security rules limit each owner to their own devices.

## Repository layout

```
firmware/
  arduino-mega/HyFePoul_Arduino/   Mega sketch (multi-file .ino), see its README
  esp32/HyFePoul_ESP32/            ESP32 bridge sketch; Config.example.h template
mobile-app/                        React Native + Expo (TypeScript) Android app
backend/functions/                 Legacy Cloud Functions + RTDB rules test suite
scripts/                           Mega/ESP32 simulators and end-to-end test scripts
Nextion/                           Nextion HMI project and component IDs
docs/                              Design, protocol, commissioning and status documents
database.rules.json                Realtime Database security rules (deployed)
firebase.json, .firebaserc         Firebase CLI config (project: hyfepoul-dev)
```

## Getting started

### Prerequisites

- Node.js 22 and npm
- [Firebase CLI](https://firebase.google.com/docs/cli). The emulators need Java; Android Studio's bundled JBR works.
- [Arduino CLI](https://arduino.github.io/arduino-cli/) or the Arduino IDE
- Android Studio with an emulator, or an Android phone, for the app

Install the root dependencies, which the simulators and test scripts use:

```bash
npm install
```

### Firmware

Install the board cores and libraries, then compile. Full details are in [`docs/firmware-build-environment.md`](docs/firmware-build-environment.md).

```bash
arduino-cli lib install "RTClib" "HX711 Arduino Library" "ArduinoJson@6.21.5"
```

```bash
arduino-cli compile --fqbn arduino:avr:mega firmware/arduino-mega/HyFePoul_Arduino
```

The ESP32 needs a local `Config.h` with Wi-Fi and device-account credentials. That file is gitignored, so **never commit it**. Create it from the template:

```bash
cp firmware/esp32/HyFePoul_ESP32/Config.example.h firmware/esp32/HyFePoul_ESP32/Config.h
```

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/esp32/HyFePoul_ESP32
```

Commission the hardware step by step, logic first and actuators last, following [`docs/hardware-commissioning-procedure.md`](docs/hardware-commissioning-procedure.md).

### Mobile app

```bash
cd mobile-app
npm install
```

Create `mobile-app/.env.local` (gitignored) with the Firebase web config:

```
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_FIREBASE_DATABASE_URL=https://hyfepoul-dev-default-rtdb.asia-southeast1.firebasedatabase.app
```

The app needs a **development build**. It cannot run in Expo Go, because Expo Go (SDK 57) crashes on Android when `expo-notifications` loads.

```bash
npx expo run:android
```

To run against the local Firebase emulators instead of production, set these before starting. `10.0.2.2` is the host machine as seen from the Android emulator.

```
EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true
EXPO_PUBLIC_EMULATOR_HOST=10.0.2.2
```

Cloud builds use the profiles in `mobile-app/eas.json`, for example `eas build -p android --profile development`.

### Firebase

The project is `hyfepoul-dev`, with the Realtime Database instance `hyfepoul-dev-default-rtdb` in `asia-southeast1`. Security rules live in [`database.rules.json`](database.rules.json).

- **Deploying rules** affects the live app. Run the rules tests first, then deploy:

  ```bash
  firebase deploy --only database --project hyfepoul-dev
  ```

- **Provisioning a device** is done by an admin in the Firebase console. Create the device's Auth account, set `devices/{deviceId}/deviceAuthUid` to that account's UID, and set `deviceSecrets/{deviceId}/setupPin`. The owner then claims the device in the app with that PIN.

## Testing

Most suites need the Firebase emulators. Wrap a command with `firebase emulators:exec` so the emulators start and stop around it:

```bash
firebase emulators:exec --only auth,database --project hyfepoul-dev "node backend/functions/scripts/test-rtdb-rules.js"
```

| Suite | Command (inside `emulators:exec` unless marked) |
|-------|-----------------------------------------------|
| RTDB security rules | `node backend/functions/scripts/test-rtdb-rules.js` |
| ESP32 logic and schedule restore | `node scripts/simulate-esp32.js` |
| Mobile command flow | `node scripts/test-mobile-commands.js` |
| End-to-end journey | `node scripts/test-e2e-journey.js` |
| Mobile unit/integration (Jest) | `cd mobile-app && npm test` |
| Mega logic simulator (no emulators) | `node scripts/simulate-mega.js` |
| Mobile type-check (no emulators) | `cd mobile-app && npm run typecheck` |
| Mobile lint (no emulators) | `cd mobile-app && npm run lint` |

The simulators are JavaScript copies of the firmware logic. They don't run the C++, so hardware behaviour still has to be confirmed on the bench.

## Design constraints

- **No paid infrastructure.** The project stays on Firebase's free Spark plan, so there are no Cloud Functions or server-side push. Phone notifications therefore appear only while the app is running; alerts raised while it is closed show up in the Notifications tab later. See [`docs/notifications.md`](docs/notifications.md).
- **Hardware scope is fixed** to the parts listed above, with no GSM/SMS, temperature, humidity, air-quality or lighting sensors.
- The prototype uses one configured device ID (`device-001`). QR-code provisioning is a possible future enhancement.

## Documentation

| Document | What it covers |
|----------|----------------|
| [`docs/comprehensive-work-plan.md`](docs/comprehensive-work-plan.md) | **Start here.** Current status, findings, phase results and remaining work |
| [`docs/mega-esp32-protocol.md`](docs/mega-esp32-protocol.md) | Serial protocol between the Mega and the ESP32 |
| [`database.rules.json`](database.rules.json), [`mobile-app/src/types/rtdb.ts`](mobile-app/src/types/rtdb.ts) | Current Realtime Database structure: the enforced rules and the typed paths. (`docs/database-schema.md` still describes the earlier Firestore design.) |
| [`docs/notifications.md`](docs/notifications.md) | How alerts reach the user, and their limits |
| [`docs/firmware-build-environment.md`](docs/firmware-build-environment.md) | Toolchains, libraries and build commands |
| [`docs/hardware-commissioning-procedure.md`](docs/hardware-commissioning-procedure.md) | Step-by-step bench and integration checks |
| [`docs/hardware-calibration.md`](docs/hardware-calibration.md) | Load cell and sensor calibration |
| [`docs/hardware-commissioning-log.md`](docs/hardware-commissioning-log.md) | Commissioning results log |
| `docs/checkpoint-*.md` | Historical checkpoint reports, kept as a record. Some describe earlier designs (for example the Firestore/FCM pipeline) that have since been replaced |

## License

No license has been chosen for this project yet. `mobile-app/LICENSE` is the MIT license that came with the Expo project template and does not cover the rest of the repository.
