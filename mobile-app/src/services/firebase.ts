import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, initializeAuth } from 'firebase/auth';
// @ts-ignore - TS resolves the browser types by default, missing the RN export
import { getReactNativePersistence } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configuration is injected through EXPO_PUBLIC_* environment variables
// (mobile-app/.env.local for local runs, eas.json "env" for EAS builds).
const useFirebaseEmulator = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true';

// The emulator URL is only an acceptable fallback for emulator runs and Jest.
// Any other build without a configured URL would silently point RTDB at
// 127.0.0.1 on the phone, so fail loudly instead.
const EMULATOR_DATABASE_URL = 'http://127.0.0.1:9000/?ns=hyfepoul-dev-default-rtdb';
const databaseURL =
  process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL ||
  (useFirebaseEmulator || process.env.NODE_ENV === 'test' ? EMULATOR_DATABASE_URL : undefined);

if (!databaseURL) {
  throw new Error(
    'EXPO_PUBLIC_FIREBASE_DATABASE_URL is not set. Add it to mobile-app/.env.local ' +
    '(local) or the eas.json build profile env (EAS), or set ' +
    'EXPO_PUBLIC_USE_FIREBASE_EMULATOR=true to use the local emulators.'
  );
}

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'PLACEHOLDER_API_KEY',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'PLACEHOLDER_AUTH_DOMAIN',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'hyfepoul-dev',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'PLACEHOLDER_STORAGE_BUCKET',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || 'PLACEHOLDER_MESSAGING_SENDER_ID',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || 'PLACEHOLDER_APP_ID',
  // The production instance is regional (asia-southeast1), so its URL cannot
  // be derived from the project ID.
  databaseURL,
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth
// Since tests don't have React Native environment, we dynamically choose persistence
const auth = initializeAuth(app, {
  persistence: typeof window !== 'undefined' ? getReactNativePersistence(AsyncStorage) : undefined
});

// Initialize Realtime Database (the only data store the app uses; the earlier
// Firestore / Cloud Functions pipeline is not deployed, see docs/notifications.md)
const rtdb = getDatabase(app);

// Use local emulators in development if explicit environment variable is set
if (useFirebaseEmulator) {
  // Use 10.0.2.2 for Android Emulator, or localhost/custom IP for physical device
  const host = process.env.EXPO_PUBLIC_EMULATOR_HOST || '10.0.2.2';
  
  // Only connect if not already connected
  try {
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectDatabaseEmulator(rtdb, host, 9000);
    console.log(`Connected to Auth/RTDB Emulators on ${host}`);
  } catch (err) {
    console.log('Emulators already connected or connection failed.', err);
  }
}

// Re-export getAuth for isolated imports if needed, though we export our single instance
export { app, auth, rtdb, getAuth };
