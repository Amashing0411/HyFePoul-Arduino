# Legacy backend (not deployed)

The first backend design for HyFePoul used Cloud Functions (HTTP endpoints for the ESP32), Cloud Firestore and FCM push. It was replaced by the Firebase Realtime Database with security rules, on the free Spark plan, which the current system uses (`database.rules.json` at the repository root, tested by `scripts/test-rtdb-rules.js`).

This folder keeps that earlier code for reference only:

- `functions/` — the Cloud Functions source (TypeScript)
- `firestore.rules`, `firestore.indexes.json` — the Firestore rules and indexes

Nothing here is deployed, and `firebase.json` no longer points to it. See `docs/firebase-backend-architecture.md` for the original plan.
