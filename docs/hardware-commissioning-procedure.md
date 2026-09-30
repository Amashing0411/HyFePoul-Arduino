# HYFEPOUL HARDWARE COMMISSIONING PROCEDURE
*This is the strict step-by-step checklist to execute when the physical prototype arrives.*

---

## 1. Visual Inspection
- **Prerequisite:** Device unboxed, NO POWER CONNECTED.
- **Action:** Visually trace wiring from Mega headers to every sensor/relay.
- **Expected Result:** Wiring strictly matches `docs/hardware-assumption-matrix.md`.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** If pins differ, update `Config.ino` to match hardware before proceeding.

## 2. Power OFF Wiring/Pin Verification
- **Prerequisite:** Device unboxed, NO POWER CONNECTED.
- **Action:** Use a multimeter in continuity mode. Verify GND connects across Mega, ESP32, Relays, Sensors. Verify 5V/12V rails are not shorted to GND.
- **Expected Result:** Near 0Ω on GND plane. Infinite resistance between power and GND.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Resolve shorts immediately. Never power on a shorted board.

## 3. Power and Ground Verification
- **Prerequisite:** Mega/ESP32 UNPLUGGED/DISCONNECTED if socketed, or actuators disconnected.
- **Action:** Turn on Main Power. Measure buck converter/regulator outputs.
- **Expected Result:** Stable 5.0V on 5V rail. Stable 12V on 12V rail.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Adjust buck converters with a screwdriver if voltages are incorrect.

## 4. Mega Startup Test (Actuators Disconnected)
- **Prerequisite:** Water Pump and Feed Motor completely disconnected from relay outputs.
- **Action:** Connect Mega to PC via USB. Monitor Serial at 115200. Power the system.
- **Expected Result:** Mega boots, prints startup banner. Relays do NOT click on.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** If relays energize on boot, investigate Active LOW vs Active HIGH logic on relay modules.

## 5. ESP32 Startup Test
- **Prerequisite:** Mega running successfully.
- **Action:** Connect ESP32 to PC via USB. Monitor Serial at 115200.
- **Expected Result:** ESP32 boots, attempts Wi-Fi connection.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Verify ESP32 receives stable 3.3V/5V.

## 6. Mega ↔ ESP32 UART Test
- **Prerequisite:** Both controllers powered. Serial monitors open.
- **Action:** Observe UART cross-talk.
- **Expected Result:** Clean `DATA|` packets leaving Mega, clean `TIME|` / `CMD|` packets arriving at Mega. No garbage text.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Check baud rates, ground loops, or need for logic level shifters (5V vs 3.3V).

## 7. RTC Test
- **Prerequisite:** Mega running.
- **Action:** Check Mega Serial monitor for RTC init logs.
- **Expected Result:** RTC prints correct time (or a valid time indicating I2C communication success).
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Verify SDA (20) and SCL (21) pins. Check CR2032 battery.

## 8. SD Card Test
- **Prerequisite:** FAT32 formatted SD card inserted.
- **Action:** Boot Mega.
- **Expected Result:** Serial prints SD initialized.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Verify CS Pin (53) and SPI MOSI/MISO/SCK connections.

## 9. Nextion Test
- **Prerequisite:** Nextion screen wired to Mega RX2/TX2.
- **Action:** Boot Mega.
- **Expected Result:** Nextion displays UI. Serial2 receives/transmits data.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Ensure Nextion RX goes to Mega TX2 (16), and TX to Mega RX2 (17).

## 10. Ultrasonic Sensor Test
- **Prerequisite:** Mega running, Serial monitor open.
- **Action:** Place objects at varying distances (e.g., 5cm, 40cm) from the Ultrasonic sensor.
- **Expected Result:** `currentHopperLevelPercent` updates logically in Serial logs.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Verify TRIG (32) and ECHO (33) pins. Adjust calibration constants in `Config.ino`.

## 11. Water-Level / Float Switch Test
- **Prerequisite:** Mega running, Serial monitor open.
- **Action:** Manually lift and drop the LOW and HIGH float switches.
- **Expected Result:** Serial logs reflect changes to `waterLow` and `waterHigh`.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Verify if the physical float switch is NO or NC and invert logic in `FeedLevel.ino`/`Hydration.ino` if necessary.

## 12. HX711 / Load-Cell Test
- **Prerequisite:** Empty hopper. Known reference weight (e.g., 1000g).
- **Action:** Place weight on scale. Record raw output. Calculate new `LOAD_CELL_CALIBRATION_FACTOR`.
- **Expected Result:** Stable zero. Accurate linear reading with weight.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Verify DOUT (30) / SCK (31). Check for mechanical binding on the load cell.

## 13. Relay Test (Actuators Disconnected)
- **Prerequisite:** Actuators still physically disconnected.
- **Action:** Send a dummy command to trigger the Dispenser Relay.
- **Expected Result:** Audible "click". Relay LED indicator turns ON.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Check relay control signal wire.

## 14. E-Stop Test
- **Prerequisite:** Relay energized (from Step 13).
- **Action:** Press the physical Emergency Stop button.
- **Expected Result:** Relay immediately clicks OFF. Mega logs `emergencyStopActive`.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Verify button is wired to Pin 38 and GND. Adjust NO/NC logic if reversed.

## 15. Pump Test
- **Prerequisite:** Safety and relays verified.
- **Action:** Connect Water Pump. Send pump activation signal.
- **Expected Result:** Pump turns on.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Check 12V supply capacity.

## 16. Dispenser Motor Test
- **Prerequisite:** Safety and relays verified.
- **Action:** Connect Dispenser Motor. Send dispenser activation signal.
- **Expected Result:** Motor spins in correct direction.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Reverse motor wires if spinning backward.

## 17. Local Feeding Test
- **Prerequisite:** Load cell calibrated. Hopper filled.
- **Action:** Trigger a local feeding event via physical button or simulator hook for 100g.
- **Expected Result:** Motor dispenses. Scale reading increases. Motor stops exactly at 100g.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Adjust delay tolerances or mechanical dispensing rate.

## 18. Local Water-Control Test
- **Prerequisite:** Float switches in place.
- **Action:** Simulate low water.
- **Expected Result:** Pump turns on. Simulate high water -> Pump turns off.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Check `Hydration.ino` hysteresis logic.

## 19. ESP32 Wi-Fi / RTDB Test
- **Prerequisite:** ESP32 configured with local Wi-Fi credentials.
- **Action:** Boot ESP32.
- **Expected Result:** Connects to Wi-Fi. Authenticates with Firebase. Pushes status to RTDB.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Check 2.4GHz Wi-Fi availability. Check Firebase credentials.

## 20. Mobile App Live-State Test
- **Prerequisite:** Mobile App running. ESP32 connected.
- **Action:** Open Dashboard.
- **Expected Result:** App shows "Online", correct hopper level, correct water status.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Check RTDB security rules if data is blank.

## 21. Remote Command Test
- **Prerequisite:** Entire system connected and idle.
- **Action:** Send `MANUAL_FEED` command from Mobile App.
- **Expected Result:** App sends command → ESP32 receives → Mega receives → Relay clicks → Feeding executes → Acknowledgment returns to App.
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Track the `CMD|` lifecycle via Serial monitors to see where the chain breaks.

## 22. Full Integrated Feeding Test
- **Prerequisite:** E-Stop verified. System ready.
- **Action:** Send a full `MANUAL_FEED` command and let the system dispense physical feed.
- **Expected Result:** Flawless execution. Safety timeouts do not trigger. Mobile app shows "Completed".
- **Actual Observation:** _________________________
- **PASS/FAIL:** [  ]
- **Troubleshooting:** Final tuning of hardware integration.
