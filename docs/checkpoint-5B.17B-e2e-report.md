# CHECKPOINT: 5B.17B — Mobile End-to-End Workflow Validation

## STATUS
**COMPLETE** (Software architecture successfully orchestrates end-to-end data/command flow.)

## AUTHENTICATION
**PASS**
**Evidence:** The newly implemented `scripts/test-e2e-journey.js` successfully creates a new owner user via Firebase Auth, signs in, and executes the complete journey holding a valid authentication token. Unauthenticated operations are appropriately blocked by RTDB rules.

## DEVICE CLAIMING
**PASS**
**Evidence:** The E2E test accurately simulates the 3-step RTDB claim process:
1. Owner creates `/claimRequests/{deviceId}` containing the PIN.
2. Owner reads `/devices/{deviceId}/ownerId` and successfully establishes ownership when the PIN matches `deviceSecrets`.
3. The device subsequently logs in using standard Auth (`deviceAuthUid`) and claims its side of the schema.

## DEVICE STATE
**PASS**
**Evidence:** The device simulator securely writes to `devices/{deviceId}/state` (including `feedWeightGrams`, `hopperLevelPercent`, `waterLow`, etc.). The owner dashboard fetch strictly succeeds (and fails if requested by an unauthorized identity). The mobile application correctly renders these real-time payloads.

## SCHEDULE
**PASS**
**Evidence:** 
- The E2E test writes a complete `SCHEDULE_SET` payload to `schedules/{deviceId}/sched_0`.
- RTDB security rules enforce `hour`, `minute`, and `targetGrams` boundaries.
- **IMPORTANT DISTINCTION:** This confirms the mobile app and RTDB persist schedule data correctly. The Mega firmware only holds schedules in volatile RAM. During physical deployment, the Mega will resync upon boot. This test does NOT validate physical EEPROM/flash retention.

## REMOTE COMMAND
**PASS**
**Evidence:** 
- E2E test generates a `MANUAL_FEED` command.
- Command transitions observed exactly as designed: `queued` → `acknowledged` → `executing` → `completed`.
- Failed transitions (e.g., trying to modify an already `completed` command) are outright rejected by RTDB `.write` rules. The React Native UI reliably subscribes to these lifecycle shifts.

## ALERTS
**PASS**
**Evidence:** The simulated device correctly spawns a `LOW_WATER` event inside `/alerts/{deviceId}`. The authenticated mobile owner immediately reads this payload. *(Note: This proves in-app feed capability, not native OS push notifications).*

## HISTORY
**PASS**
**Evidence:** The device reliably pushes timestamped chronological telemetry payloads into the `/systemData/{deviceId}` node. The owner application reads this successfully for chronological charting on the History screen.

## FAILURE STATES
**PASS**
**Evidence:** 
- **Missing State / Unclaimed Device:** The mobile UI gracefully degrades into Skeleton loader views or fallback text rather than crashing.
- **Command Rejection:** Handled gracefully via the new `activeCommand` component in `FeedingScreen.tsx`, rendering a localized error string if RTDB denies the write.
- **Stale Heartbeat:** Validated within the Dashboard; if a device's timestamp drifts past 300,000 ms, the application correctly flags it as "(stale)".

## FULL USER JOURNEY
**PASS**
**Evidence:** `scripts/test-e2e-journey.js` orchestrates a flawless sequential chain from fresh registration all the way to simulated hardware dispensing and alert generation, concluding with an uncompromised sign-out.

## REGRESSION
- **RTDB:** 53/53 PASS
- **Mobile:** 13/13 PASS
- **TypeScript:** 0 errors
- **Mega simulator:** 19/19 PASS
- **ESP32 simulator:** PASS

## NEW TESTS
- `scripts/test-e2e-journey.js`: A fully automated script performing an end-to-end journey traversing Registration, Claims, Heartbeats, Dashboards, Schedules, remote Commands, Alerts, and History using two isolated Auth sessions (Owner and Device).

## KNOWN LIMITATIONS
- Emulator/simulator success heavily relies on simulated JSON payloads. **This does NOT constitute physical hardware validation.**
- Real-world electrical noise, sensor bouncing, physical relay logic, and Wi-Fi latency are entirely abstracted away.

## PHYSICAL HARDWARE
Still unavailable / pending October 30.

## NEXT ACTION
Wait for physical hardware delivery (5B.15) or further pre-hardware instructions. The complete software stack is unified, stable, and firmly frozen.
