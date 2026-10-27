/**
 * Firebase web config from Vite env vars. Kept apart from `lib/firebase.ts` so the
 * Absensi app can start its own Auth instance without initializing Firestore.
 */
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

/** Auth & Firestore Emulator mode (`vite --mode emulator`, see .env.emulator). */
export const useEmulators = import.meta.env.DEV && import.meta.env.VITE_USE_EMULATORS === "true";
