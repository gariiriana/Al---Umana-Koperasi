/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_INVOICE_API_BASE_URL?: string;
  /** Asal Worker push (default produksi: https://koperasi-alumana.com). */
  readonly VITE_PUSH_API_BASE_URL?: string;
  /** Opsional: kunci publik Web Push sendiri; kosong = kunci bawaan FCM. */
  readonly VITE_FIREBASE_VAPID_KEY?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_MEASUREMENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
