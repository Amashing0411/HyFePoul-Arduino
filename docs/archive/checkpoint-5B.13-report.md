# Checkpoint 5B.13 Report — Scheduled Feeding Architecture & Implementation

## Objective
Implement scheduled feeding functionality, ensuring that the Arduino Mega remains the absolute authority over physical execution and safety, while leveraging the Firebase RTDB to persist schedules and the React Native application to provide a user interface.

## Implementation Details

### 1. Data Model & Security (RTDB)
- **New Path:** Added `/schedules/{deviceId}/{scheduleId}` to `database.rules.json`.
- **Validation:** Enforced structured properties: `hour` (0-23), `minute` (0-59), `targetGrams` (1-2000), `enabled` (boolean), `daysOfWeek` (array).
- **Access Control:** Verified that only the `ownerId` can write schedules, and both the `ownerId` and `deviceAuthUid` can read them. (Re-verified schema rules dynamically handle malicious inputs via `test-mobile-commands.js`).

### 2. Synchronization Protocol
- **Commands:** Extended the `/commands` validation rule to whitelist `SCHEDULE_SET` actions.
- **Data Flow:** When a user modifies a schedule in the app, the UI simultaneously updates the `/schedules/` node (for cloud persistence) and queues a `SCHEDULE_SET` command.
- **ESP32 Transport:** The ESP32 parses `SCHEDULE_SET` from Firebase, flattens the JSON, and forwards it to the Mega over UART as:
  `CMD|ID:<cmdId>|ACTION:SCHEDULE_SET|IDX:<idx>|HR:<hr>|MIN:<min>|TGT:<tgt>|EN:<1/0>`

### 3. Firmware Adaptation (Arduino Mega)
- **Memory Integrity:** Adapted the cloud schema to map explicitly into the existing `FeedSchedule feedSchedules[3]` statically allocated array on the Mega. The cloud `scheduleId` maps directly to array indices (`sched_0` -> `0`).
- **RTC Execution:** The Mega already has `checkScheduledFeeding()` built into `Feeding.ino` and tied to the RTC. By mapping the cloud schedules into this array, the Mega maintains the ability to execute feeds independently of internet connectivity.
- **Verification:** Updated `scripts/simulate-mega.js` to test `SCHEDULE_SET` buffer parsing, index bounds checking, state hydration, and command lifecycle.

### 4. React Native User Interface
- **Complete Refactor:** `FeedingScreen.tsx` was fully rewritten to drop its dependency on `useMockData` and integrate tightly with `FirebaseDataContext`.
- **Live Streams:** Implemented live multi-path subscriptions in `rtdbService.ts` to stream the 3 allocated schedule slots to the UI.
- **Synchronous Actions:** The UI now dispatches mutations using `updateSchedule()`, providing immediate UI feedback and displaying a "Syncing..." badge while the `SCHEDULE_SET` command remains queued/executing.

## Results
- **Simulator Testing:** C++ string extraction logic successfully parses UART schedules. Rejections for out-of-bounds indices and malformed inputs act identically to manual feed rejections.
- **RTDB Testing:** Emulator verification strictly prevented invalid schedule times (e.g. 25:00), negative targets, and unauthorized writes.
- **Integration:** The mobile UI correctly synchronizes multi-slot schedules across the network down to the C++ logic array.
- **Safety Maintained:** The ESP32 is preserved purely as a network transport layer, the Mega retains absolute control over its physical limits, and the UI remains completely detached from manual Bluetooth dependencies.

## Next Steps
This concludes the 5B architecture updates for scheduling. Future checkpoints can build on this by refining the UI styling or addressing local timezone reconciliation on the RTC.
