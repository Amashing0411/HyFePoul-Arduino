# HyFePoul Arduino Mega 2560 – Modular Sketch

## Project architecture

Arduino Mega 2560 (primary controller)
→ ESP32 (Wi-Fi/Internet communication)
→ Wi-Fi/Internet
→ Backend/Server
→ Mobile App / Web App

## Files

- `HyFePoul_Arduino.ino` — main setup and loop
- `Config.ino` — pins, thresholds, shared variables, initialization
- `Feeding.ino` — moving-hopper feed cycle: chain motor (two polarity relays, interlocked), home/end limit switches, 5 tray load cells, dispenser motor
- `FeedLevel.ino` — ultrasonic hopper feed-level measurement
- `Hydration.ino` — reservoir float switch: `LOW_WATER` alert + buzzer (gravity-fed drinker, no pump)
- `TimeManager.ino` — RTC + ESP32 network-time synchronization/fallback
- `ESP32Communication.ino` — Mega↔ESP32 placeholder protocol
- `Nextion.ino` — Nextion display interface placeholder
- `SDLogging.ino` — CSV data logging, one file per month, 24-month cleanup
- `DailyStats.ino` — per-day totals (feed, cycles, problems) kept in EEPROM and sent as `SUMMARY` lines
- `Safety.ino` — emergency stop (latched until reset) and buzzer
- `ScheduleStorage.ino` — feeding schedules saved to and loaded from EEPROM (survive power loss)
- `SerialConsole.ino` — bench commissioning commands on the USB serial monitor (`HELP`): status, load-cell tare/calibration, chain jog/home, dispenser test, local feed. See `docs/hardware-commissioning-procedure.md` §7a

## Libraries required

- RTClib
- HX711
- SD
- SPI
- Wire

Install the required libraries through Arduino IDE's Library Manager where necessary.

## Important placeholders to confirm before hardware testing

1. HX711 calibration factor for each of the 5 tray load cells.
2. Tray travel times (`TRAY_TRAVEL_MS`), dispense and chain timeouts (bench values, open items O-1/O-4).
3. Ultrasonic empty/full hopper distances.
4. Ultrasonic sensor mounting and measurement area.
5. Water float-switch and limit-switch electrical logic (NO vs NC) and mounting.
6. Relay module active-HIGH or active-LOW behavior.
7. Final dispenser motor driver/relay wiring.
8. Chain motor rating and the two-relay polarity-reversal wiring.
9. Nextion baud rate.
10. Nextion component names and event IDs.
11. DS3231/RTC module actually used.
12. ESP32↔Mega serial voltage/interface arrangement.
13. Final ESP32 communication protocol.
14. Final backend API/data format.
15. Whether the application will be native mobile or web fallback.
16. Physical emergency-stop circuit.

## ESP32 protocol

The full, current specification is [`docs/mega-esp32-protocol.md`](../../../docs/mega-esp32-protocol.md). In short:

ESP32 → Mega (each line at most 63 characters + `\n`, because `Serial1` has a 64-byte receive buffer):
- `TIME|YYYY-MM-DD|HH:MM:SS` (UTC)
- `STATUS|ONLINE` / `STATUS|OFFLINE` (every 10 s; also the link heartbeat)
- `CMD|ID:<C0-C9 or R0-R2>|ACTION:<action>|…`

Mega → ESP32:
- `DATA|t1|t2|t3|t4|t5|target|hopper|waterLow|feeding|step|tray|estop|timeSource` (every 10 s; tray grams, target per tray, cycle step and tray)
- `EVENT|<name>` (including `SYSTEM_START` at boot)
- `CMD_ACK|ID:<id>|STATUS:ACCEPTED|REJECTED[|REASON:…]` and `CMD_DONE|ID:<id>|STATUS:SUCCESS|FAILED[|REASON:…]`
- `SUMMARY|YYYY-MM-DD|feedG|done|incomplete|trayTimeouts|chainFaults|lowWater|lowFeed|estops` (today and yesterday, after each feed cycle, at the day change and every 30 min)

## CSV log

The Mega writes one file per local month (UTC+8): `HFyyyymm.CSV`, for example `HF202610.CSV` for October 2026, each with its own header. Rows written while the clock is not set go to `HFNOTIME.CSV`.

- **Size:** one row every 30 s plus events is about 0.3 MB a day, so roughly **9 MB and 90,000 rows per month**. Excel opens a month easily.
- **Cleanup:** when a new month's file is created, monthly files from 24 or more months ago are deleted. If a write still fails (card full), the oldest month is deleted and the write retried once. Only files named `HFyyyymm.CSV` are ever deleted.
- **Card:** use an 8–32 GB microSD formatted **FAT32**. Two years of logs are about 220 MB, so any such card is plenty. The SD library cannot read exFAT, which larger cards come formatted with.

## Daily totals

`DailyStats.ino` counts, per local day: feed dispensed (each tray's load-cell reading when its dispensing ends, including a partial tray after a timeout, an empty hopper or an E-stop), feed cycles completed and incomplete, tray timeouts, chain faults, low-water and low-feed episodes, and E-stops. Today's and yesterday's records are kept in EEPROM at address 64 (2 × 26 bytes; the schedule store uses 0–24), so a restart keeps the day. Counts made before the clock is set are kept for the first valid date. The ESP32 writes each `SUMMARY` to `dailySummary/{deviceId}/{date}`, which the app's History → Monthly view reads.

Excel can open CSV directly. The Arduino is not generating a native `.xlsx` file.

## RTC/network-time behavior

- ESP32 obtains NTP/network time.
- ESP32 sends a valid `TIME|...` packet to the Mega.
- Mega updates its RTC.
- If ESP32/network time becomes unavailable, Mega continues using the RTC.
- RTC must have a functioning backup battery/supercapacitor to preserve time through a power interruption.
- If the RTC itself loses its backup time, network time or manual time setting is required.

## Development note

This is a modular base. Do not treat it as final production firmware until the actual wiring, sensor behavior, relay polarity, calibration values, Nextion HMI, and ESP32 protocol have been confirmed.
