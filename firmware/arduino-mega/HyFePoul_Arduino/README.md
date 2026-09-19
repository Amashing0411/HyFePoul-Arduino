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
- `Feeding.ino` — scheduled feeding, load cell, dispenser motor
- `FeedLevel.ino` — ultrasonic hopper feed-level measurement
- `Hydration.ino` — float switches and one water pump
- `TimeManager.ino` — RTC + ESP32 network-time synchronization/fallback
- `ESP32Communication.ino` — Mega↔ESP32 placeholder protocol
- `Nextion.ino` — Nextion display interface placeholder
- `SDLogging.ino` — CSV data logging
- `Safety.ino` — emergency stop and buzzer

## Libraries required

- RTClib
- HX711
- SD
- SPI
- Wire

Install the required libraries through Arduino IDE's Library Manager where necessary.

## Important placeholders to confirm before hardware testing

1. HX711 calibration factor.
2. Actual load-cell mechanical arrangement and what the load cell is measuring.
3. Ultrasonic empty/full hopper distances.
4. Ultrasonic sensor mounting and measurement area.
5. Water float-switch electrical logic and physical mounting.
6. Relay module active-HIGH or active-LOW behavior.
7. Final dispenser motor driver/relay wiring.
8. Final water pump electrical rating and switching circuit.
9. Nextion baud rate.
10. Nextion component names and event IDs.
11. DS3231/RTC module actually used.
12. ESP32↔Mega serial voltage/interface arrangement.
13. Final ESP32 communication protocol.
14. Final backend API/data format.
15. Whether the application will be native mobile or web fallback.
16. Physical emergency-stop circuit.

## ESP32 protocol currently proposed

ESP32 → Mega:
- `TIME|YYYY-MM-DD|HH:MM:SS`
- `STATUS|ONLINE`
- `STATUS|OFFLINE`

Mega → ESP32:
- `DATA|feedWeight|hopperLevel|waterLow|waterHigh|pump|feeding|emergency|timeSource`
- `EVENT|eventName`

This is a working placeholder, not the final protocol. Coordinate it with the ESP32/backend developer before integration.

## CSV log

The Mega writes `HYFEPOUL.CSV`.

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
