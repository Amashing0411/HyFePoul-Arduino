# Database Schema (Cloud Firestore)

This document outlines the proposed high-level schema for the HyFePoul database. The schema is designed for the initial single-user prototype but structured to be extensible for future multi-user support.

Database usage and operations will be estimated and documented after the database design and data transmission strategy are finalized.

## Collections

### 1. `Users`
Stores user profile information.
- `uid` (Document ID): Firebase Auth UID
- `email`: String
- `createdAt`: Timestamp
- `role`: String (e.g., "owner", "worker" - extensible for future multi-user)
- `farmId`: Reference/String (For future multi-farm grouping)

### 2. `Devices`
Stores hardware registration and configuration.
- `deviceId` (Document ID): Unique identifier for the ESP32 (Initial prototype uses configured Device ID).
- `ownerId`: String (UID of the claiming user)
- `name`: String (e.g., "Main Coop Feeder")
- `status`: String ("online", "offline")
- `lastHeartbeat`: Timestamp
- `settings`: Map
  - `feedSchedules`: Array
  - `thresholds`: Map (low water, low feed, etc.)

### 3. `SystemData`
Stores the periodic and event-driven data transmitted by the ESP32.
- `docId` (Auto-generated)
- `deviceId`: String
- `timestamp`: Timestamp
- `feedWeightGrams`: Number
- `hopperLevelPercent`: Number
- `waterLow`: Boolean
- `waterHigh`: Boolean
- `pumpActive`: Boolean
- `feedingActive`: Boolean
- `emergencyStopActive`: Boolean

*Data Retention Note: The retention policy for SystemData is a configurable backend consideration. Automatic pruning may be implemented later if deemed necessary based on finalized database design.*

### 4. `Alerts`
Stores historical events and notifications.
- `docId` (Auto-generated)
- `deviceId`: String
- `timestamp`: Timestamp
- `type`: String (e.g., "LOW_FEED", "WATER_PUMP_TIMEOUT", "EMERGENCY_STOP")
- `resolved`: Boolean
- `acknowledgedBy`: String (UID)
