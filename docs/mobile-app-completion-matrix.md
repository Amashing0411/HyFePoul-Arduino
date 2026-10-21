# HyFePoul: Mobile App Completion Matrix

**As of:** 2026-10-21, `main` at `c0dc92b`. App: React Native + Expo SDK 57, Android development build `com.hyfepoul.mobile`.

**What the evidence columns mean:**
- **Automated:** Jest suites run under the Firebase emulators.
  - `rtdbIntegration.test.ts` (18 tests): auth, claiming, owner/device authorization, filtering, sign-out.
  - `rtdbService.test.ts` (7 tests): validators, owned-device query, history/alert ordering.
  - `deviceStatus.test.ts` (5 tests): online rule.
- **Emulator:** manually exercised in the dev build on Android emulator `Medium_Phone_API_36.0` (Android 16) against the **local** Firebase emulators, with throwaway accounts and simulated device replies (sessions on 2026-10-21; evidence in `comprehensive-work-plan.md`).
- **Phone:** a physical Android phone against production `hyfepoul-dev`. **Not done for any screen.**

✅ done / passed · ⚠️ partial or with a known issue · ❌ missing / not done · — not applicable

## Summary

| Screen | UI complete | Backend connection | Error handling | Loading / empty | Automated | Emulator | Phone |
|--------|-------------|--------------------|----------------|-----------------|-----------|----------|-------|
| Login | ✅ | ✅ Auth | ✅ | ✅ | ⚠️ (service level) | ✅ | ❌ |
| Registration | ✅ | ✅ Auth | ✅ | ✅ | ⚠️ (service level) | ❌ | ❌ |
| Claim Device | ✅ | ✅ RTDB | ✅ | ✅ | ✅ | ✅ | ❌ |
| Dashboard (Status) | ✅ | ✅ RTDB | ✅ | ✅ | ⚠️ | ✅ | ❌ |
| Feeding | ✅ | ✅ RTDB | ✅ | ✅ | ⚠️ | ✅ | ❌ |
| Water | ✅ | ✅ RTDB | ✅ | ✅ | ❌ | ✅ | ❌ |
| History | ✅ | ✅ RTDB | ✅ | ✅ | ✅ (service) | ❌ | ❌ |
| Notifications | ✅ | ✅ RTDB + local notifications | ✅ | ✅ | ✅ (service) | ✅ | ❌ |
| Settings | ✅ | ✅ Auth | — | — | ❌ | ⚠️ (log out only) | ❌ |

## Per screen

### Login
- **UI:** email, password, Log In, link to Sign up.
- **Backend:** Firebase Auth `signInWithEmailAndPassword`; the session persists in AsyncStorage.
- **Errors:** maps `invalid-email`, `invalid-credential` / `invalid-login-credentials`, `too-many-requests` and `network-request-failed` to messages; empty fields are rejected locally.
- **Automated:** sign-in, and access denied after sign-out (integration suite).
- **Emulator:**
  - ✅ sign-in with a test account;
  - ✅ the "Please enter both email and password." message;
  - ✅ session restored after a force-stop (no re-login).
- **Remaining:** physical phone against production.

### Registration
- **UI:** email, password, confirm password; minimum-length check.
- **Errors:** maps `email-already-in-use`, `weak-password`, `invalid-email` and `network-request-failed`.
- **Emulator:** ❌ not exercised; test accounts were created through the Auth emulator API.
- **Remaining:** register through the UI on the emulator and on a phone.

### Claim Device
- **UI:** device ID, 6-digit PIN, Claim, Sign Out. Taps work while the keyboard is open (`keyboardShouldPersistTaps="handled"`).
- **Backend:** writes `claimRequests/{id}`, then `devices/{id}/ownerId`, then re-queries owned devices (query-scoped rule).
- **Errors:** "Claim denied. Invalid Device ID, incorrect Setup PIN, or device already claimed."; generic fallback for anything else.
- **Automated:** wrong PIN, correct PIN, ownership, no replay or transfer, second user denied (integration suite and rules tests).
- **Emulator:**
  - ✅ a user with no devices lands here;
  - ✅ a wrong PIN is denied with one tap while the keyboard is open, and `ownerId` is unchanged;
  - ✅ the correct PIN claims the device and opens the main tabs.
- **Remaining:**
  - On a wrong PIN, the dev-only LogBox toast appears (from `console.error`); this is not visible in release builds.
  - Physical phone against production.

### Dashboard (Status)
- **UI:** device card (name, ONLINE/OFFLINE, updated time, "No contact since …"); feed, water and safety cards; E-stop release with confirmation; Manual Feed button (opens the Feeding tab).
- **Backend:** `devices/{id}` listener; latest commands.
- **Online rule:** `status == "online"` and a heartbeat within 90 s, re-evaluated every 15 s.
- **Loading / error:** skeletons; error card on listener failure; "(Stale)" if data is more than 5 min old.
- **Automated:** online rule (5 unit tests); listener filtering (service).
- **Emulator:**
  - ✅ ONLINE/OFFLINE from heartbeat age, including flipping to offline with no new data;
  - ✅ "No contact since …";
  - ✅ the Manual Feed button navigates to Feeding.
- **Remaining:**
  - E-stop release flow not exercised in the UI (only in the simulator);
  - physical phone.

### Feeding
- **UI:**
  - feed card with an inline manual-feed form (1–2000 g);
  - command status card in plain language, with completion evidence;
  - 3 schedule slots: add, edit, enable/disable, delete with confirmation;
  - "runs every day" note.
- **Backend:** `commands` (create), `schedules` (write) plus a queued `SCHEDULE_SET`; listeners on commands and schedules.
- **Guards:** manual feed is blocked while the E-stop is active, while feeding, while a feed command is in progress, or while the device is offline (with a note).
- **Validation:** time 00–23 / 00–59; target 1–2000 g; matching RTDB rules (hour, minute, target ≤ 2000).
- **Emulator:**
  - ✅ invalid target rejected with no command written;
  - ✅ a valid feed is queued; waiting → running → done;
  - ✅ evidence text, and the last scale reading shown only when newer than completion;
  - ✅ in-progress blocking;
  - ✅ offline blocking and note;
  - ✅ schedule Save with one tap while the keyboard is open writes `sched_0` (all 7 days) and queues `SCHEDULE_SET`.
- ✅ **R-31 (`95c3761`):** opening the editor for slot 2 scrolls it fully above the tab bar (emulator).
- Error card when the device listener fails (previously an endless skeleton).
- **Remaining:**
  - enable/disable toggle and delete not exercised on the emulator;
  - physical phone.

### Water
- **UI:** tank status (low/high float), pump running/idle, updated time with "(Stale)"; "No contact from the device since …" when offline.
- **Backend:** shares the device listener and the context's heartbeat-based `deviceOnline` / `nowMs`.
- **Error / loading:** skeletons while loading; error card on a listener error (before R-30 this left the skeleton up forever).
- **R-30 done (`be9d714`):** the stale label is live; offline is shown; the no-op pull-to-refresh is removed (data is live).
- **Emulator:** ✅ with an offline device: "No contact from the device since …" shown above the last-known float and pump states (tank full, low float clear, high float triggered, pump idle).
- **Remaining:** physical phone.

### History
- **UI:** list of the latest 50 `systemData` records, newest first, with feed, hopper and water/pump; local date and time (`toLocaleString`, which shows PHT on a phone set to the Philippines).
- **Backend:** `systemData/{id}` ordered by `timestamp`, `limitToLast(50)` (bounded); malformed records skipped.
- **Loading / empty / error:** skeletons, "No history available.", error card.
- **Automated:** ordering and malformed filtering (service tests).
- **Emulator:** ❌ not opened in the test sessions.
- **Remaining:** emulator and phone check. Pull-to-refresh only animates; data is live from the listener.

### Notifications
- **UI:** one card per alert type, with the latest timestamp, "Last reported" label (F24) and an explainer line; empty state "You're all caught up."
- **Backend:** `alerts/{id}` ordered by `timestamp` (latest 50), plus `useAlertNotifications`, which raises a local notification on channel `alerts` when a timestamp is newer than the last one seen.
- **Automated:** ordering and malformed filtering (service tests).
- **Emulator:**
  - ✅ permission prompt ("Allow HyFePoul to send you notifications?");
  - ✅ notifications in the foreground and background;
  - ✅ no re-notification at launch;
  - ✅ none while force-stopped (documented limit);
  - ✅ alert still listed after reopening.
- **Remaining:**
  - alerts never resolve (R-23);
  - no delivery while the app is closed (Spark plan; [`notifications.md`](notifications.md));
  - physical phone.

### Settings
- **UI:** signed-in email, claimed device ID (or "No Device Claimed"), dark mode, text size, language (English/Tagalog), Log Out with confirmation.
- **Emulator:** ✅ **R-35 (`95c3761`):** Log Out asks first; Cancel keeps the session; confirming returns to the login screen. Dark mode, text size and language not exercised.
- **Remaining:**
  - Tagalog review (R-34);
  - optional app version display (R-44).

## Cross-cutting

| Item | Status |
|------|--------|
| Production configuration (RTDB URL in `.env.local` and all EAS profiles; fails loudly if missing) | ✅ |
| No mock data in the production path (`MockDataContext` not mounted) | ✅ |
| Only Auth and RTDB initialised (Firestore/Functions removed, R-32) | ✅ |
| Listener clean-up on sign-out (access denied afterwards) | ✅ automated |
| Expo Go | ❌ not supported (expo-notifications on SDK 57); use a development build |
| Lint | ✅ `npm run lint` (expo lint, R-33): 0 errors; 3 documented `set-state-in-effect` warnings |
| Type-check | ✅ `npm run typecheck` |
| iOS | ❌ not built (R-41) |
