import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, initializeAuth } from 'firebase/auth';
// @ts-ignore - TS resolves the browser types by default, missing the RN export
import { getReactNativePersistence } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

// PLACEHOLDER CONFIGURATION
// In production, these should be securely injected via environment variables
// (e.g., EXPO_PUBLIC_FIREBASE_API_KEY).
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'PLACEHOLDER_API_KEY',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'PLACEHOLDER_AUTH_DOMAIN',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'hyfepoul-dev',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'PLACEHOLDER_STORAGE_BUCKET',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || 'PLACEHOLDER_MESSAGING_SENDER_ID',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || 'PLACEHOLDER_APP_ID',
  // Database URL is required for RTDB to initialize properly (especially in Spark / default instances)
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || 'http://127.0.0.1:9000/?ns=hyfepoul-dev-default-rtdb',
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth
// Since tests don't have React Native environment, we dynamically choose persistence
const auth = initializeAuth(app, {
  persistence: typeof window !== 'undefined' ? getReactNativePersistence(AsyncStorage) : undefined
});

// Initialize Firestore (default in-memory cache)
const db = getFirestore(app);

// Initialize Cloud Functions (default region us-central1)
const functions = getFunctions(app);

// Initialize Realtime Database
const rtdb = getDatabase(app);

// Use local emulators in development if explicit environment variable is set
if (process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
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
export { app, auth, db, functions, rtdb, getAuth };
