# HyFePoul Owner and Setup Guide

This guide is for the person who sets up the device and for the farm owner who uses the app. It covers which accounts exist, how to install and connect the app, daily use, and what to do when something goes wrong.

No passwords or PINs are written in this guide or anywhere in the repository. Keep them in a password manager or on paper with the device.

## 1. Accounts and secrets

| What | Who uses it | Where it is set | Notes |
|------|-------------|-----------------|-------|
| **Owner account** (email + password) | The farm owner, in the app | The owner creates it with **Sign up** in the app | Any email the owner controls. One owner per device. |
| **Device ID** | Typed once by the owner when claiming | `DEVICE_ID` in the ESP32's `Config.h`; `devices/{id}` in Firebase | The prototype uses `device-001`. QR-code provisioning is a future enhancement. |
| **Setup PIN** (6 digits) | Typed once by the owner when claiming | `deviceSecrets/device-001/setupPin` in the Firebase console (see Provisioning below) | Given to the owner with the device. Nobody can read it through the app. Stored as text, in quotes. |
| **Device account** (email + password) | Only the ESP32 | Firebase Console → Authentication; copied into `FIREBASE_AUTH_EMAIL` / `FIREBASE_AUTH_PASSWORD` in `Config.h` | Never give it to the owner. Its UID must be in `devices/device-001/deviceAuthUid` (roadmap R-14). Change it if an old value was ever committed (R-05). |
| **Wi-Fi name and password** | Only the ESP32 | `WIFI_SSID` / `WIFI_PASSWORD` in `Config.h` | 2.4 GHz network. Changing Wi-Fi means re-flashing the ESP32. |

`Config.h` is ignored by git; copy `Config.example.h` and fill it in on the computer used for flashing.

### Test and demo accounts

- The accounts used during development tests exist only in the **local Firebase emulator** on the developer's computer. They were generated randomly and **do not work** in the real app.
- There is no shared demo login in the real Firebase project. For a demonstration, the presenter signs up as the owner and claims `device-001` (section 3). After the demo, the device can be released to the real owner by clearing `devices/device-001/ownerId` in the Firebase console, after which the real owner claims it with the setup PIN.
- A demonstration without hardware can run against the local emulator (see `docs/hardware-commissioning-procedure.md` and the simulators in `scripts/`); it shows the app with sample data only.

### Provisioning `device-001` (admin, once, in the Firebase console)

Follow the full [Firebase device provisioning and setup PIN guide](device-provisioning-guide.md), especially its R-45 rules prerequisite, before touching production.

The 2026-10-27 read-only Firebase CLI check found no `devices/device-001` or `deviceSecrets/device-001/setupPin`; no production values were changed. The device Auth account and deployed rules were not checked. R-14 remains open until an admin confirms the device account and both database records in the [Firebase console](https://console.firebase.google.com), project **hyfepoul-dev**:

1. **Device account:** Authentication → Users. If no user has the email in the ESP32's `Config.h` (`FIREBASE_AUTH_EMAIL`), click **Add user** with that email and `FIREBASE_AUTH_PASSWORD`. Copy its **User UID**.
2. **Device record:** Realtime Database → Data, under the root add:
   ```
   devices
     └ device-001
         ├ deviceAuthUid: "<User UID from step 1>"
         ├ status: "offline"
         └ lastHeartbeat: 0
   ```
   Do not add `ownerId`; claiming sets it.
3. **Setup PIN:** add `deviceSecrets/device-001/setupPin` with your chosen six-digit PIN stored as a **string**, not a number. The app sends text and the rules compare types strictly; a numeric value makes a correct PIN fail as "wrong PIN". Do not reuse a sample or test PIN.
4. **Claim:** in the app, Sign up, then Device ID `device-001` and the PIN. The device shows as yours, OFFLINE until the ESP32 is flashed and online.

After a successful claim, an administrator can remove the retained `claimRequests/device-001` record after verifying `ownerId`; this removes the submitted PIN from that claim record. For a later owner transfer, follow the handover process in the full provisioning guide. Deleting only `ownerId` is insufficient under the current rules because the old claim request can block the next owner's request.

## 2. Install the app (Android)

1. Get the HyFePoul APK (a release build; see section 7) and copy it to the phone.
2. Open it and allow "Install unknown apps" for the file manager or browser when Android asks.
3. Open **HyFePoul**. Allow notifications when asked, so low-feed, low-water and E-stop alerts appear on the phone.

## 3. First-time setup (owner)

1. Tap **Sign up**, enter your email and a password, and confirm.
2. On **Claim your device**, enter the **Device ID** (`device-001`) and the **6-digit setup PIN** that came with the device.
3. The Status screen opens. Within about a minute of the device being powered and on Wi-Fi, it shows **ONLINE** with the tray weights and hopper level.

If the claim fails: check the ID and PIN, and make sure nobody else has claimed the device already.

## 4. Daily use

| Screen | What it shows / does |
|--------|----------------------|
| **Status** | Online or offline, controller responding, feed in each tray, hopper level, water, E-stop. |
| **Feeding** | Up to 3 daily schedules (time and grams **per tray**; 50 g per head per tray by default). Each shows **On device** once the device accepted it. **Manual Feed** runs one cycle now (only while online). |
| **Water** | Reservoir float switch: OK or LOW. Water is gravity-fed; refill the reservoir when LOW. |
| **History** | **Recent:** a reading every 5 minutes plus each feeding's start and end. **Monthly:** feed dispensed (kg), feedings completed and incomplete, problem counts, and a bar per day. |
| **Notifications** | Active problems first (low feed, low water, E-stop, tray timeout, chain fault, controller not responding), then resolved ones. |
| **Settings** | Dark mode, text size, English / Tagalog, app version, device clock, log out. |

Scheduled feeding runs on the device itself, so it continues when the phone or the internet is off.

## 5. Safety and alerts

- **Emergency stop:** pressing the E-stop button stops the chain and dispenser at once. Releasing the button does **not** restart anything. To resume, release the button, then reset it on the touch screen (**Start**) or from the app when it offers the release. The next feeding returns the hopper home first.
- **Low feed:** refill the hopper. The alert resolves by itself once the level is back up.
- **Low water:** refill the reservoir. The alert resolves by itself.
- **Tray timeout / chain fault:** check for a jam in the dispenser or the chain, and that nothing blocks the limit switches. The next feeding starts by homing.
- **Controller not responding:** the Wi-Fi module is online but the main controller is silent. Check the main controller's power and the cable between the boards.
- **Device offline (phone notification):** the device has not reported for 90 seconds. Check its power and Wi-Fi. Schedules still run on the device.

## 6. Records on the SD card

The device keeps every 30-second reading on its microSD card, one file per month: `HF202610.CSV` is October 2026. Remove the card only while the device is off, and open the file with Excel. Files older than 24 months are deleted automatically. Use an 8–32 GB card formatted FAT32.

## 7. For the developer: building the release APK

The debug APK in `mobile-app/android/app/build/outputs/apk/debug/` is a **development build**: it needs a computer running Metro and will not work on its own. For the owner, build a standalone APK:

- **Local:** with `mobile-app/.env.local` holding the Firebase settings, run `npx expo prebuild` if needed, then `cd android && ./gradlew assembleRelease`. The APK is `android/app/build/outputs/apk/release/app-release.apk` (signed with the debug key: fine for direct installs, not for the Play Store).
- **EAS (cloud):** `npx eas-cli build -p android --profile preview` produces an APK download link (uses the Expo account's free build quota).

The local-emulator QA APK described in [`firebase-emulator-qa-2026-10-27.md`](firebase-emulator-qa-2026-10-27.md) is for tests against localhost only. It is not the production APK and requires emulator-port forwarding when used on a phone.

Before handing it over: deploy the R-45 rules together with flashing both boards, and complete R-14 (device account, device record and setup PIN) in the Firebase console.
