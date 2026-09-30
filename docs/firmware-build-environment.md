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

### Compile Command

To verify the ESP32 firmware, run from the repository root:
```powershell
arduino-cli compile --fqbn esp32:esp32:esp32 firmware/esp32/HyFePoul_ESP32
```

---

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
