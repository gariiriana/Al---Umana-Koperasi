/**
 * Firebase client SDK initialization.
 *
 * All configuration values are loaded from environment variables (Vite
 * `import.meta.env`) so that no secrets are committed to source control.
 * See `.env.example` for the required keys.
 *
 * Exports:
 * - `app`       — the initialized FirebaseApp
 * - `auth`      — Firebase Authentication instance
 * - `db`        — Firestore instance
 * - `analytics` — Firebase Analytics instance (browser only, may be `null`)
 *
 * Requirements: 10.4 (secrets only via env vars), 8.3 (auth available for
 * Firestore access).
 */

import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import {
  getAnalytics,
  isSupported as isAnalyticsSupported,
  type Analytics,
} from 'firebase/analytics';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

// Fail fast in development if required keys are missing — easier to debug
// than the cryptic errors thrown later by individual Firebase SDKs.
const requiredKeys: Array<keyof typeof firebaseConfig> = [
  'apiKey',
  'authDomain',
  'projectId',
  'appId',
];
for (const key of requiredKeys) {
  if (!firebaseConfig[key]) {
    console.warn(
      `[firebase] Missing required env var for "${key}". ` +
        `Check your .env file (see .env.example for required keys).`
    );
  }
}

export const app: FirebaseApp = initializeApp(firebaseConfig);
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

// Analytics is only valid in a browser environment that supports the required
// APIs (e.g., IndexedDB, cookies). `isSupported()` resolves asynchronously, so
// `analytics` starts as `null` and is populated once support is confirmed.
// Consumers see the updated value through ES module live bindings.
export let analytics: Analytics | null = null;
if (typeof window !== 'undefined') {
  isAnalyticsSupported()
    .then((supported) => {
      if (supported) {
        analytics = getAnalytics(app);
      }
    })
    .catch(() => {
      // Analytics is best-effort; silently ignore unsupported environments.
      analytics = null;
    });
}
