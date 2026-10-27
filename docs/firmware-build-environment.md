# HyFePoul Firmware Build Environment

This document outlines the requirements and commands for reproducing the firmware compilation locally using `arduino-cli`.

## Prerequisites

- **OS:** Windows (or Linux/macOS equivalents)
- **Toolchain:** `arduino-cli` (v1.0.0 or higher recommended)
- Download `arduino-cli` from the official Arduino repository and ensure it is in your system `PATH` or available locally in your working directory.

## Arduino Mega 2560 (Primary Controller)

### Configuration

- **Core:** `arduino:avr`
- **Board Target (FQBN):** `arduino:avr:mega`
- **Framework:** Arduino

### Dependencies

The Mega relies on several libraries for sensors, storage, and logic:
- `RTClib` (by Adafruit)
- `HX711 Arduino Library` (by Bogdan Necula)
- `SD` (built-in)
- `SPI` (built-in)
- `Wire` (built-in)

Install external libraries via:
```powershell
arduino-cli lib install "RTClib"
arduino-cli lib install "HX711 Arduino Library"
```

### Compile Command

To verify the Mega firmware, run from the repository root:
```powershell
arduino-cli compile --fqbn arduino:avr:mega firmware/arduino-mega/HyFePoul_Arduino
```

*Note: Ensure you are compiling the directory, not just the `.ino` file, so all modular `.ino` fragments are linked correctly.*

---

## ESP32 (Communication Module)

### Configuration

- **Core:** `esp32:esp32` (requires Espressif board manager URL)
- **Board Target (FQBN):** `esp32:esp32:esp32`
- **Framework:** Arduino

*Setup the board manager first:*
```powershell
arduino-cli config init
arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
arduino-cli core update-index
arduino-cli core install esp32:esp32
```

### Dependencies

- `ArduinoJson` (by Benoit Blanchon)
- `WiFi` (built-in to esp32 core)
- `HTTPClient` (built-in to esp32 core)

Install external libraries via:
```powershell
arduino-cli lib install "ArduinoJson@6.21.5"
```

### Credentials File (`Config.h`)

`firmware/esp32/HyFePoul_ESP32/Config.h` is gitignored because it holds the Wi-Fi credentials and the device's Firebase account. Before the first build, create it from the tracked template and fill in the real values:
```powershell
Copy-Item firmware/esp32/HyFePoul_ESP32/Config.example.h firmware/esp32/HyFePoul_ESP32/Config.h
```
The build fails with a missing `Config.h` until this is done. Never commit `Config.h`.

### Compile Command

To verify the ESP32 firmware, run from the repository root:
```powershell
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/esp32/HyFePoul_ESP32
```

**Build notes (Phase 4):**
- **Core Debug Level must be "None"** (the default) for any deployed build. At Debug or Verbose, `HTTPClient` logs request URLs, which contain the Firebase ID token. The sketch prints a compile-time `#warning` in that case.
- The sketch uses about **86%** of the default 1.3 MB app partition, because the built-in CA certificate bundle used to verify Firebase's TLS certificate adds roughly 73 KB. If new features push it over, select a larger partition scheme (for example `--fqbn esp32:esp32:esp32:PartitionScheme=huge_app`, which drops OTA updates). Do not remove the CA bundle.

---

## Local commissioning firmware images (2026-10-27)

Compile outputs are stored locally under `firmware/build/commissioning-2026-10-27/` and ignored by Git. They were built with the board targets above from the current source.

| Board | Artifact | Size | SHA-256 |
|---|---|---:|---|
| Mega 2560 | `mega/HyFePoul_Arduino.ino.hex` | 138,327 bytes | `FB951952113159D59FDA12A3729551A4AB657E0177B9F3FD54BC30CFB6262168` |
| ESP32 | `esp32/HyFePoul_ESP32.ino.bin` (application image) | 1,147,232 bytes | `3C72A38EB78C48545C49776297A218D0A607D4A059B48AE5BEB9AED078650E3D` |
| ESP32 | `esp32/HyFePoul_ESP32.ino.merged.bin` (full flash image) | 4,194,304 bytes | `0CE417FBF7ECCABA523AE0D3C24039F15EFF0C774B741D1E3612D18B3876FFD1` |

The ESP32 images were compiled from ignored local `Config.h`, which still has Wi-Fi placeholders. Rebuild after privately entering Wi-Fi credentials before HIT-03 or any Firebase connectivity test. ESP32 firmware contains the device account credentials; keep these local and do not commit or share the binary.

With the boards connected, identify the correct serial ports first, then upload the prepared images using the corresponding `--input-dir`:

```powershell
arduino-cli upload --fqbn arduino:avr:mega --port COMx --input-dir firmware/build/commissioning-2026-10-27/mega
arduino-cli upload --fqbn esp32:esp32:esp32 --port COMy --input-dir firmware/build/commissioning-2026-10-27/esp32
```

Replace `COMx` and `COMy` with the actual board ports. Do not connect actuator power until the commissioning run sheet prerequisites pass.

## Verifying Toolchain & Troubleshooting

### Check Installation
Run `arduino-cli version` to ensure the tool is available.

### Common Errors
1. **Missing Core/FQBN Not Found:** 
   Ensure you have installed the correct core (`arduino-cli core install arduino:avr` or `esp32:esp32`).
2. **Missing Library (`#include <...>` not found):**
   Ensure the library name perfectly matches the registry name when using `arduino-cli lib install`.
3. **Multiple Files Error:**
   Always point `arduino-cli compile` to the *directory* containing the sketches, not an individual `.ino` file.

### Expected Output
A successful build will print the memory usage summary (Sketch uses X bytes...) and will not produce any FATAL compilation errors. Warnings related to third-party libraries may occasionally appear and are generally acceptable unless they cause a compilation halt.
