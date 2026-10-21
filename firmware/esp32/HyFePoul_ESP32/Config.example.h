// Template for Config.h.
// Copy this file to Config.h in the same folder and fill in the real values.
// Config.h is gitignored: never commit Wi-Fi or device-account credentials.

#ifndef CONFIG_H
#define CONFIG_H

// ---------------------------------------------------------
// Wi-Fi Configuration
// ---------------------------------------------------------
#define WIFI_SSID "YOUR_WIFI_SSID"
#define WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// ---------------------------------------------------------
// Device Configuration
// ---------------------------------------------------------
#define DEVICE_ID "device-001"

// ---------------------------------------------------------
// Firebase Configuration
// ---------------------------------------------------------
// For production, use actual Firebase project details.
// For emulator, set FIREBASE_USE_EMULATOR to true.
#define FIREBASE_PROJECT_ID "hyfepoul-dev"
#define FIREBASE_API_KEY "YOUR_FIREBASE_WEB_API_KEY"

// ESP32 dedicated Firebase Auth Account
#define FIREBASE_AUTH_EMAIL "YOUR_DEVICE_ACCOUNT_EMAIL"
#define FIREBASE_AUTH_PASSWORD "YOUR_DEVICE_ACCOUNT_PASSWORD"

#define FIREBASE_USE_EMULATOR false
#define EMULATOR_HOST "192.168.1.100" // Replace with your computer's IP running emulators
#define EMULATOR_AUTH_PORT 9099
#define EMULATOR_RTDB_PORT 9000

// ---------------------------------------------------------
// Serial Configuration
// ---------------------------------------------------------
#define MEGA_SERIAL Serial2
#define MEGA_RX_PIN 16
#define MEGA_TX_PIN 17
#define MEGA_BAUD_RATE 115200

#endif
