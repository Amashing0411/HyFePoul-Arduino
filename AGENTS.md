# HyFePoul Agent Instructions

These rules apply to all AI agents acting as developers on the HyFePoul repository. 

## 1. Architectural Integrity
- **Mega is Primary**: The Arduino Mega 2560 is the primary controller. It handles all sensor reads, automation logic, SD logging, safety checks, and local display.
- **ESP32 is Communication**: The ESP32 acts solely as the Wi-Fi bridge. Do not place core poultry management logic on the ESP32.
- **Backend Routing**: The ESP32 communicates with the internet (Backend). The Mobile app communicates with the Database/Backend. The Mobile app never directly communicates with the Arduino.

## 2. Hardware Constraints
- **Do not invent hardware**: Stick to the designated components (Mega, ESP32, HX711, Load Cell, Ultrasonic, Float Switches, RTC, Nextion, SD Card, Pump, Motor, Relay, E-Stop, Buzzer).
- **Prohibited Components**: Absolutely NO GSM, SIM800L, SMS, temperature, humidity, air-quality, or lighting sensors unless explicitly directed by the user.

## 3. Technology Stack
- **Mobile**: React Native, Expo, TypeScript (Android primary, cross-platform capable).
- **Backend**: Firebase Authentication, Cloud Firestore, Cloud Functions, FCM.
- **Firmware**: Arduino framework (or C/C++ variants suitable for the environment).

## 4. Documentation & Terminology Constraints
- **NO "Telemetry"**: Intentionally avoid using the word "telemetry". Use "system data", "device data", or "data transmission" instead.
- **NO "Real-time"**: Use "timely system updates". Do not guarantee "real-time" performance natively without validation.
- **Database Limits**: Do not hardcode arbitrary operation limits (e.g., 20,000 writes/day). Estimate and define operations only based on actual transmission design.
- **Extensibility**: Design databases and schemas to be extensible for multiple users and future roles, even if the current implementation targets a single user.
- **Provisioning**: The initial prototype relies on a configured Device ID; QR-code provisioning is documented only as a future enhancement.

## 5. Development Workflow
- Check `docs/development-status.md` before starting new major tasks to understand the current phase of the project.
- Always propose plans before creating breaking changes.
- Ensure Arduino sketches reside in properly named directories for IDE compatibility.
