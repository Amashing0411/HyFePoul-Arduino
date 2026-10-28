# Design Revision: Moving Hopper, Five Trays, Gravity Water

**Status:** APPROVED 2026-10-23 (timed travel for O-1; O-3 as proposed). **Implemented in software** (Mega, ESP32, rules, app, simulators, docs). The revised RTDB rules were deployed to `hyfepoul-dev` on 2026-10-27; compatible firmware and hardware behavior remain untested.
**Source:** the updated block diagram, plus answers from the project owner in chat.

## 1. What changes

| Area | Current implementation | New design |
|---|---|---|
| Feeding | Fixed dispenser; one load cell weighs dispensed feed; one target per feed | **Hopper moves on a chain past 5 trays.** At each tray it dispenses until **that tray's load cell** reads the target, then moves on |
| Load cells | 1 load cell + 1 HX711 | **5 load cells (one under each tray) + 5 HX711** |
| Target weight | Total grams per feed | **Grams per tray** (default **50 g**) |
| Motors | Dispenser motor | Dispenser motor **+ chain motor**, reversed by **two relays swapping polarity** |
| Position inputs | none | **Home limit switch** (start) + **end limit switch** (far end) |
| Hopper level | Ultrasonic | Unchanged |
| Water | 2 float switches + pump, auto-refill, 120 s timeout | **No pump.** Gravity reservoir on top with a valve to the drinker; **1 float switch** |
| Water low | `LOW_WATER` only if the pump cannot refill | **`LOW_WATER` alert to refill + buzzer** |

R-16 is resolved: the load cells weigh feed **in the trays**. This means dispensed feed, which matches the feeding logic.

## 2. Feed cycle (firmware state machine on the Mega)

1. **Start** (schedule or manual feed). Abort if the E-stop is latched, the hopper level is too low, or a cycle is already running.
2. **Home check.** If the home switch is not pressed, reverse the chain until it is (with a timeout).
3. **For each tray 1 → 5:**
   1. Move **forward** to the tray (see open item O-1).
   2. Tare that tray's load cell, start the dispenser, and stop when the tray reads the target or the per-tray timeout (30 s) expires. A timeout is logged, and the cycle continues to the next tray.
4. **Move forward until the end limit switch** is hit, then stop.
5. **Reverse until the home limit switch** is hit, then stop. The cycle is complete.

**Safety rules:**
- Forward and reverse relays are **never on together**, with a dead time between direction changes.
- The **end switch stops forward motion** and the **home switch stops reverse**, whatever the software state.
- Every move has a timeout. On timeout: stop, `CHAIN_TIMEOUT` alert, buzzer.
- The E-stop stops everything and latches, as now.
- A remote `MANUAL_FEED` runs one full cycle with the given per-tray target. `CMD_DONE` reports success, or the failed tray or step.

## 3. Water (no pump)

- One float switch in the reservoir. Low → `LOW_WATER` alert ("refill the reservoir") plus a buzzer beep, once per low episode. It clears when the float rises.
- Removed: pump relay, pump timeout and fault latch, `WATER_PUMP_TIMEOUT`, high float switch.

## 4. Proposed pin changes (confirm against the real wiring)

| Signal | Pin |
|---|---|
| HX711 tray 1–5 DOUT | 30, 40, 41, 42, 43 |
| HX711 shared SCK | 31 |
| Float switch (reservoir low) | 34 |
| Chain motor forward relay | 36 (was the pump relay) |
| Chain motor reverse relay | 44 |
| Dispenser relay | 37 |
| Home / end limit switches | 45 / 46 (`INPUT_PULLUP`) |
| E-stop, buzzer, ultrasonic, SD, Nextion, ESP32 | unchanged |

## 5. Work breakdown

| # | Part | Change |
|---|---|---|
| 1 | Mega firmware | New feed-cycle state machine (`Feeding.ino`); 5 HX711s; chain motor driver with interlock and timeouts; limit switches; water = float alert + buzzer; remove pump logic. Nextion shows the current tray and cycle step. |
| 2 | Protocol | `DATA` gains per-tray weights and the cycle step and loses pump and high-float fields; new events `CHAIN_TIMEOUT` and `TRAY_TIMEOUT`. Protocol doc updated. |
| 3 | ESP32 | Parse the new `DATA`; forward the new alerts. |
| 4 | RTDB rules + schema | `state` validation updated (**breaking**: rules deploy needs approval); schema doc. |
| 5 | App | Feeding: 5 tray weights and cycle progress; schedule target labelled "per tray" (default 50 g). Water: reservoir OK/LOW with a refill message (no pump). Alerts: new types. |
| 6 | Simulators + tests | Mega simulator for the cycle (tray order, timeouts, limit switches, interlock, E-stop mid-cycle); ESP32, rules and Jest updates. |
| 7 | Docs | AGENTS.md hardware list (pump removed; chain motor, limit switches and 5 load cells added), hardware assumption matrix, commissioning procedure and test plan, README, audit and roadmap. |

## 6. Open items (need answers before or while building)

- **O-1, stopping at each tray.** The hopper must stop *in front of* each tray before dispensing. Without a position sensor per tray, the plan is **timed travel**: calibrated forward run times in `Config.ino`, tuned on the bench. Tray sensors could replace this later.
- **O-2 (done):** the block diagram is updated to 5 load cells / 5 HX711s, 2 limit switches, the chain motor on two relays and no pump: [`diagrams/hyfepoul-block-diagram.png`](diagrams/hyfepoul-block-diagram.png) (SVG next to it; regenerate with `python docs/diagrams/make_block_diagram.py`).
- **O-3:** what happens if the hopper runs empty mid-cycle (ultrasonic)? Proposed: stop dispensing, finish the return home, and raise `LOW_FEED`.
- **O-4:** the per-tray dispense timeout (30 s) and the chain travel timeouts need bench values.
