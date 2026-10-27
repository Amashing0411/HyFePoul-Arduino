# Firebase device provisioning and setup PIN guide

**For:** the Firebase project administrator and the person setting up the HyFePoul ESP32 and owner app.

This guide is the runbook and status record for first-time provisioning of `device-001` in the production Firebase project. Do not put the actual setup PIN or either account password in this document, source control, or screenshots.

## Current project status

On 2026-10-27, the production project `hyfepoul-dev` was provisioned and verified. The dedicated ESP32 Auth account exists; its UID matches `devices/device-001/deviceAuthUid`. The device record contains `status: "offline"` and numeric `lastHeartbeat: 0`, with no `ownerId`. A six-digit setup PIN is saved as a string at `deviceSecrets/device-001/setupPin`; its value is intentionally excluded from this guide and Git. Roadmap items R-14 and R-45 are **complete**.

The original ESP32 Auth account is also assigned to the existing `prod-test-device` record, which has an owner and prior heartbeat. That account and record remain unchanged. A separate account is bound to `device-001`. Its initial local password failed sign-in; with the user's approval, the dedicated account password was synchronized to the current value in ignored local `Config.h`. Production Auth sign-in and an authenticated read of the device UID binding then passed. This is a REST-level check, not proof that the firmware has signed in or written state.

The restricted Firebase API key is synchronized into ignored local `Config.h`; the original Firebase-created key remains enabled in Cloud for rollback. The Wi-Fi SSID and password are still placeholders, so physical network connection remains blocked until those are set privately. The record is expected to remain offline until the ESP32 is configured and online. The production owner claim and physical-phone checks have not yet been run. Never put passwords, setup PINs, or Auth tokens in chat, Git, or screenshots.

The approved candidate is restricted to Identity Toolkit, Secure Token, and
Realtime Database, with no application restriction. It passed Firebase JavaScript
SDK sign-in, token refresh, RTDB read, and an ESP32-style RTDB REST read on
2026-10-27. It is now adopted in all three EAS profiles, ignored `.env.local`,
and ignored ESP32 `Config.h`. The ESP32 compile passed after adoption; actual
device sign-in, TLS, and state writes still need hardware.

The earlier `app-release.apk` was a **local-emulator QA build** and is not
suitable for claiming a production device; it was overwritten during the
production rebuild and is no longer retained.

The production-configured release APK was rebuilt locally on 2026-10-27 at
`mobile-app/android/app/build/outputs/apk/release/app-release-production.apk`
using the restricted candidate key, production endpoints, Firebase emulators
disabled, and Android cleartext traffic disabled. The embedded JS bundle contains
the candidate key, `aapt` confirmed `usesCleartextTraffic=false`, and `apksigner`
verified the APK signature. SHA-256: `86F677D1B5B7D1FBD72CED83C75383F18961C0B1EDDEBC975757ADE0B11492BF`;
size: 82,507,509 bytes. It has not been used to claim a device or tested on the
owner's physical phone. The local build is signed with the development key for
direct installation, not Play Store distribution.

## What the setup PIN is

- It is a six-digit, one-time claim credential that links an owner account to a device ID.
- The administrator chooses it and stores it at `deviceSecrets/{deviceId}/setupPin` as a **string**. Do not store it as a number; strings preserve leading zeroes and match the app's submitted text.
- Choose a value that is not a birthday, repeated digits, or another easy guess. Keep it private and give it to the intended owner through a separate, private channel.
- It is not the ESP32 Firebase password, the owner's app password, or a production default. The repo has no production PIN value.
- RTDB rules deny app clients direct reads and writes to `deviceSecrets`. During claiming, the app submits the PIN to `claimRequests/{deviceId}`; the claimant can read their own claim request, which is retained after a successful claim. Treat the PIN as a claim credential, not a long-term password, and do not reuse it for another device.

## Before provisioning

Have these ready:

1. Firebase Console access with permission to manage Authentication, Realtime Database data, and database rules.
2. The exact Device ID from the ESP32 `Config.h`. The checked-in template currently sets `DEVICE_ID` to `device-001`; the local `Config.h` may differ.
3. Access to the local ESP32 `Config.h` on the machine used to flash the device. It is gitignored. Check `FIREBASE_PROJECT_ID`, `FIREBASE_AUTH_EMAIL`, and `FIREBASE_AUTH_PASSWORD` privately. Never paste or commit the password.
4. A production-connected owner app build. Ensure `EXPO_PUBLIC_USE_FIREBASE_EMULATOR` is unset/false and the app's `EXPO_PUBLIC_FIREBASE_DATABASE_URL` is the production URL. Do not use the localhost QA APK.
5. A newly chosen six-digit setup PIN. Keep it out of this checklist and any screenshots.

The device account and owner account are different accounts:

| Account | Used by | Purpose |
|---|---|---|
| Device account | ESP32 only | Signs the ESP32 into Firebase. Its Auth UID is saved in `devices/{deviceId}/deviceAuthUid`. |
| Owner account | Farm owner in the app | Claims and reads the device. Its Auth UID is saved in `devices/{deviceId}/ownerId` after a successful claim. |

## Provision `device-001`

### 1. Confirm the Firebase project and rules

1. Open the [Firebase Console](https://console.firebase.google.com/) and select **`hyfepoul-dev`**. Check the project ID carefully before editing anything.
2. Open **Realtime Database** and confirm the instance is `hyfepoul-dev-default-rtdb` in `asia-southeast1` (the URL in the app configuration is `https://hyfepoul-dev-default-rtdb.asia-southeast1.firebasedatabase.app`).
3. Open the database **Rules** tab. The reviewed repository rules in [`database.rules.json`](../database.rules.json) were deployed on 2026-10-27. Recheck them before future changes. A production owner claim depends on the rules that protect `deviceSecrets`, validate `claimRequests`, and allow a first `ownerId` claim. Do not loosen the rules to make a claim work.
4. Confirm that Email/Password sign-in is enabled under **Authentication → Sign-in method** (the exact console label may be **Sign-in providers**).

Firebase's official guides: [view/edit RTDB data in the console](https://firebase.google.com/docs/database/manage-data-console) and [manage Firebase Authentication users](https://firebase.google.com/docs/auth/admin/manage-users).

### 2. Create or locate the ESP32 device account

1. In Firebase Console, open **Authentication → Users**.
2. Find the exact email configured as `FIREBASE_AUTH_EMAIL` in the ESP32's local `Config.h`.
3. If the account already exists, use that account and copy its **UID**. Do not create a duplicate.
4. If it does not exist, choose **Add user**, enter the configured email and a strong password, and create the account. Copy the returned **UID**. Put the same password in the ESP32's local `FIREBASE_AUTH_PASSWORD` setting before flashing.
5. Keep the device account credentials private and separate from the owner's app login. Do not send either password in chat. If an existing account's password and `Config.h` do not match, coordinate a password reset/update before hardware testing; do not guess.

The UID is an identifier, not a password. It is the value that must match `deviceAuthUid` below.

### 3. Create the device record

1. Open **Realtime Database → Data**.
2. Under the database root, create `devices/device-001` with these fields, replacing the UID placeholder with the UID from step 2:

   ```json
   {
     "devices": {
       "device-001": {
         "deviceAuthUid": "<ESP32 Auth UID>",
         "status": "offline",
         "lastHeartbeat": 0
       }
     }
   }
   ```

   This is an example of the branch to add, not a replacement for the full database. If the database already contains other data, add/edit only `devices/device-001`; do not import this fragment over the root.

3. **Do not create `ownerId` by hand.** The app writes it after a valid owner claim. Do not change the `deviceAuthUid` to the owner's UID.
4. Check the saved tree: the Device ID is spelled exactly as in `Config.h`, `deviceAuthUid` is a string matching the Auth user's UID, `status` is the string `offline`, `lastHeartbeat` is numeric zero, and `ownerId` is absent.

### 4. Store the setup PIN

1. In the Data tab, add the path `deviceSecrets/device-001/setupPin`.
2. Enter the PIN you chose directly into Firebase Console. Set the value type to **string**. If the console is in JSON editing mode, the value must be represented as a quoted JSON string. Do not include the PIN in this guide, a screenshot, or a chat message.
3. Confirm in the console that the saved value is a string of exactly six digits. If it begins with zero, verify that the zero is still present.
4. Store the PIN in a password manager or securely with the physical device, then provide it only to the intended owner through a private channel.

The app should not be able to read `deviceSecrets/device-001/setupPin`. That denial is intentional. Do not change `.read` or `.write` to `true` to inspect or test the value.

### 5. Verify before opening the app

As a Firebase administrator, check each item in the console without putting secret values into a report:

- [ ] Correct project: `hyfepoul-dev`.
- [ ] Deployed RTDB rules have been reviewed and match the intended rules; R-45 deployment is recorded.
- [ ] Device Auth user exists and is enabled.
- [ ] Auth email matches `FIREBASE_AUTH_EMAIL` in the ESP32's local config.
- [ ] `devices/device-001/deviceAuthUid` exactly matches that user's UID.
- [ ] `devices/device-001/status` is `offline` and `lastHeartbeat` is numeric `0` before first boot (or shows current values if the device has already connected).
- [ ] `devices/device-001/ownerId` does not exist yet.
- [ ] `deviceSecrets/device-001/setupPin` exists as a six-character string. Do not copy the value into notes.
- [ ] The installed app build targets production Firebase, not the local emulator.

Record only the project, Device ID, date, administrator, Auth UID match (yes/no), PIN type/length check (yes/no), rules deployment revision, and result. Do not record either password or the PIN.

### 6. Claim the device in the production app

1. Open the **production-connected** HyFePoul APK on the owner's phone. The emulator QA APK has `127.0.0.1` emulator settings and will not reach production.
2. Sign up or log in with the owner's account. Do not use the ESP32 device account in the mobile app.
3. On **Claim Device**, enter Device ID `device-001` and the setup PIN exactly as provided, including any leading zero.
4. Submit once and wait for the result. The app first writes `claimRequests/device-001`, then sets `devices/device-001/ownerId` to the signed-in owner's UID if the claim request is valid and the device has no owner.
5. Confirm that the device appears in the owner's app. An **OFFLINE** status is expected until the ESP32 is flashed with the matching Firebase project/device account, powered, connected to Wi-Fi, and sending heartbeats.
6. Once the device boots, the ESP32 serial log should report successful Firebase authentication; its UID must match `devices/device-001/deviceAuthUid`. Confirm `lastHeartbeat` updates and status becomes online according to the app's heartbeat-age check.

Claiming is one-time under the current rules: an owner cannot replace an existing `ownerId` from the app. A temporary test-owner account is available for production QA, but using it claims the device and requires the documented admin transfer steps before handing the device to the actual client. Do not use that account for the client handoff.

## Troubleshooting

| Symptom | Check |
|---|---|
| App says wrong PIN | Confirm the exact Device ID, six digits including leading zero, and string type. Check that the app targets the same Firebase project where the PIN was saved. Confirm deployed claim rules compare a string. Do not make the secret publicly readable. |
| Permission denied while claiming | Check that the signed-in app is connected to production, the reviewed RTDB rules are deployed, the device has no `ownerId`, and the PIN matches. `deviceSecrets` direct reads are denied by design. |
| Device does not appear after claim | Check that the app's signed-in account is the intended owner and that `devices/{id}/ownerId` matches that account's Auth UID. Check the app's Firebase project/database URL. |
| Claim is rejected because it is already owned | Check `devices/{id}/ownerId` in the console. Do not delete it casually; follow the authorized transfer steps below. |
| Claim succeeds but device is offline | This is expected before ESP32 commissioning. Verify the flashed `DEVICE_ID`, project ID, device email/password, Wi-Fi, Auth UID match, TLS, and heartbeat on the bench. |
| Device Auth user already exists | Use its existing UID. Ensure the firmware's local password still matches that Firebase account. Do not make a second account with the same email. |
| ESP32 REST sign-in returns `INVALID_LOGIN_CREDENTIALS` | Confirm the firmware email belongs to the dedicated device Auth UID bound at `devices/{id}/deviceAuthUid`. Privately make the local `FIREBASE_AUTH_PASSWORD` and that Auth user's password match. Leave any account used by another device unchanged. Never send the password in chat or logs. |
| Claim works in emulator but not production | Emulator accounts, devices, rules, and PINs are separate from production. Provision production independently and use a production-connected APK. Never copy a test PIN into production. |

## Changing or transferring a device

Do not change a working device's setup PIN as routine maintenance; after ownership is established, the app claim is already blocked by `ownerId`. If the PIN was exposed **before** claim, replace `deviceSecrets/{id}/setupPin` in the admin console and give the new value privately.

For an authorized change of owner, first agree who should retain access. The current claim request is retained at `claimRequests/{id}` and contains the submitted PIN. Under the current rules, deleting only `devices/{id}/ownerId` is not enough: the previous user's `claimRequests/{id}` can block a different user from creating a new request. An administrator must coordinate the handover, set a fresh PIN, remove the old `ownerId` and `claimRequests/{id}` records in the console, then have the new owner claim with the new PIN. Verify the new owner UID and remove/revoke the previous owner's access as appropriate. Never do this as a troubleshooting shortcut on a live device.

## Completion record for R-14

R-14 was completed on 2026-10-27. The production evidence was verified without recording secret values:

1. The ESP32 Firebase Auth account exists.
2. Its email matches local `Config.h`, and `devices/device-001/deviceAuthUid` matches its Auth UID.
3. `deviceSecrets/device-001/setupPin` exists as a six-digit string.

The dedicated device account's REST sign-in and UID match have since been verified. This does not verify on-device firmware sign-in, TLS, state writes, Wi-Fi connectivity, owner claim, or physical-phone behavior; those checks remain open under the app and hardware commissioning tasks.

Owner claiming and ESP32 online status are separate checks. Record the owner claim result under the app commissioning work and the online/heartbeat result under the hardware integration test plan; do not mark hardware tests passed from console setup alone.
