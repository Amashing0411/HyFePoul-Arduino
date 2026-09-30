# HYFEPOUL HARDWARE DEBUGGING LOG TEMPLATE
*Use this template to document any discrepancies between expected software behavior and actual physical hardware behavior. Do not blindly change firmware until the root cause is investigated.*

## ENTRY TEMPLATE

**Date/Time:** YYYY-MM-DD HH:MM
**Subsystem:** (e.g., UART, Load Cell, Relay, ESP32 Power)

**Expected Behavior:**
(What the software/architecture dictates should happen)

**Actual Behavior:**
(What the physical prototype actually did)

**Evidence:**
(Serial log snippet, multimeter reading, photo, etc.)

**Suspected Cause:**
(e.g., Wiring reversed, active-low relay module, ground loop, noise)

**Category:** [ ] Hardware Issue  [ ] Software Issue  [ ] Unknown

**Investigation / Test Performed:**
(e.g., "Probed Pin 36 with multimeter while commanding HIGH via Serial")

**Change Made:**
(e.g., "Swapped TX and RX wires", "Inverted LOW/HIGH logic in Config.ino")

**Result:**
(e.g., "Relay now actuates correctly", "UART communication established")

**Commit / Reference:**
(Hash or branch name if software was altered)

**Final Status:** [ ] RESOLVED  [ ] PENDING

---

## EXAMPLE ENTRY

**Date/Time:** 2026-10-31 10:00
**Subsystem:** UART Communication (Mega <-> ESP32)

**Expected Behavior:**
ESP32 receives `DATA|...` strings from Mega cleanly.

**Actual Behavior:**
ESP32 serial monitor shows garbage characters ``.

**Evidence:**
Serial output screenshot.

**Suspected Cause:**
Baud rate mismatch or missing common ground between Mega and ESP32.

**Category:** [x] Hardware Issue  [ ] Software Issue  [ ] Unknown

**Investigation / Test Performed:**
Checked ground pins. Found that ESP32 ground was isolated from Mega ground.

**Change Made:**
Wired ESP32 GND to Mega GND plane.

**Result:**
Strings parse perfectly.

**Commit / Reference:**
N/A (Hardware fix only).

**Final Status:** [x] RESOLVED  [ ] PENDING
