# HARDWARE DEBUGGING LOG TEMPLATE

Use this template to document any discrepancies found during physical commissioning.

## Discrepancy Record: [DR-YYYYMMDD-00X]

**Date:** YYYY-MM-DD
**Investigator:** [Name]
**Subsystem:** [e.g., Power, ESP32 UART, Pump Relay]

### Description
**Expected Behavior:**
[Describe what the software/architecture assumed would happen.]

**Observed Behavior:**
[Describe what physically happened on the hardware.]

**Evidence:**
[e.g., Multimeter read 2.1V, Serial log showed "NaN", Relay clicked but motor didn't spin, attached Photo 1]

### Classification
- [ ] A. Software assumption incorrect
- [ ] B. Fabrication/wiring incorrect
- [ ] C. Component specification differs
- [ ] D. Documentation incorrect
- [ ] E. Hardware design intentionally changed
- [ ] F. Unknown — requires investigation

### Root Cause Analysis
[Briefly explain why the discrepancy occurred.]

### Required Correction
[State exactly what needs to be changed. e.g., "Change WATER_LOW pin configuration in Config.ino from INPUT_PULLUP to INPUT", or "Rewire Mega TX through logic level converter before hitting ESP32 RX".]

### Sign-off
**Person Responsible for Correction:** [Name]
**Correction Applied (Date):** [YYYY-MM-DD]
**Retest Result:** [PASS / FAIL]
