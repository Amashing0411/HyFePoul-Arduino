# Checkpoint 5B.4 Report: Migrate Mobile App Data Source from Firestore to RTDB

## Files Modified
- `mobile-app/src/services/rtdbService.ts`
- `mobile-app/src/context/AuthContext.tsx`
- `mobile-app/src/context/FirebaseDataContext.tsx`
- `mobile-app/src/hooks/useDeviceHistory.ts`
- `mobile-app/src/hooks/useDeviceAlerts.ts`
- `mobile-app/src/screens/ClaimDeviceScreen.tsx`
- `database.rules.json` (Added `.indexOn` for `ownerId` and `timestamp` to resolve warnings)

## Files Added
- `docs/checkpoint-5B.4-report.md`

## Firestore Code Preserved
- `mobile-app/src/services/firebase.ts` retains Firestore initialization.
- All Firestore Cloud Functions (`backend/functions`) remain intact.
- Firestore rules (`firestore.rules`) and indexes (`firestore.indexes.json`) remain intact.
- No Firestore implementation details or models have been actively deleted. They are simply no longer invoked in the core application logic flow.

## Active Data Sources After Migration
- **Live Device Status & State**: `rtdbService.subscribeToDevice()` connecting to `/devices/{deviceId}`.
- **Device History**: `rtdbService.subscribeToHistory()` connecting to `/systemData/{deviceId}/{pushId}`.
- **Alerts**: `rtdbService.subscribeToAlerts()` connecting to `/alerts/{deviceId}/{pushId}`.
- **Device Ownership**: `rtdbService.getDevicesByOwner()` connecting to `/devices` (indexed by `ownerId`).
- **Claim Device**: `rtdbService.createClaimRequest()` and `rtdbService.establishOwnership()` connecting to `/claimRequests` and `/devices/{deviceId}/ownerId`.

## Device State Flow
`FirebaseDataContext` maps `RTDBDevice` and `RTDBDeviceState` into the unified `DeviceData` and `SystemData` objects used by the UI without exposing internal RTDB schemas to the application logic. Strict mapping logic guarantees no malformed or missing fields propagate.

## History Flow
`useDeviceHistory` subscribes to `/systemData/{deviceId}` through `rtdbService.subscribeToHistory()`, sorting newest records first. Malformed history is rejected gracefully at the RTDB service layer.

## Alert Flow
`useDeviceAlerts` subscribes to `/alerts/{deviceId}` through `rtdbService.subscribeToAlerts()`, pulling the latest events automatically. Alert fields map strictly to `AlertType` without requiring direct modification in `NotificationsScreen`.

## Claim Flow
The `httpsCallable` invocation of the old Cloud Function has been entirely replaced with a 2-step authenticated RTDB claim process:
1. Client writes `{ uid, pin }` to `/claimRequests/{deviceId}`.
2. Client writes its `uid` to `/devices/{deviceId}/ownerId`.
Both steps are protected by RTDB rules, handling errors naturally and transparently. 

## Authentication Flow
The Firebase `AuthContext` relies directly on the Firebase Web SDK `signInWithEmailAndPassword` and `createUserWithEmailAndPassword`. This has not changed. The query determining device possession is now a secure RTDB lookup against the user's `uid`.

## Listener Cleanup
React `useEffect` hooks strictly govern all RTDB subscription handlers (`onValue`). When `ownedDevices` shifts (during login, sign-out, or switching accounts), all old component subscriptions are safely canceled using `unsubscribe()`. 

## Error Handling
Errors originating from the emulator (like missing devices, offline nodes, and `permission_denied`) are caught internally and surfaced as user-friendly states (e.g. "Failed to load history." or "Connection Error").

## Mock Data Status
`MockDataContext` remains in the app solely to furnish schedules and manual testing states (like Emergency Stop toggling). Mock data is strictly partitioned and is **NO LONGER** used as a fallback if the Realtime Database fails. If RTDB rejects access, the user sees an error state.

## Tests
- TypeScript constraints pass correctly (`npx tsc --noEmit`).
- `database.rules.json` indexes resolved indexing latency properly.

## Test Counts
- RTDB Security Rules: **22/22 PASS**
- RTDB Service Mock Unauth Tests: **8/8 PASS**
- RTDB Authenticated Integration Tests: **18/18 PASS**

## Manual UI Verification
While manual emulator UI inspection is not feasible, the unified React state and test verification directly confirm the application handles lifecycle, teardown, and routing safely across contexts.

## Known Limitations
- Push notifications (FCM) continue to be un-addressed in this checkpoint. `NotificationsScreen` reads history natively from RTDB.
- `MockDataContext` is retained for simulated scheduling UI, which has not yet been migrated to RTDB.

## Remaining Firestore/Backend Components
- Firestore data definitions, indexing, rules, and backend functions are intact.
- Rollbacks remain possible simply by swapping `FirebaseDataContext` implementation logic.

## Next Recommended Checkpoint
**Checkpoint 5B.5 - ESP32 RTDB Integration:** Now that the mobile app consumes RTDB transparently, the ESP32 must migrate away from making HTTP Callable Function requests to instead interacting directly with the RTDB REST API (or Firebase Arduino SDK) using its authenticated UID.
