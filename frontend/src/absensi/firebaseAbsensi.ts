/**
 * Aplikasi Firebase kedua khusus Absensi. Sesinya terpisah dari KASMA JOB
 * (`lib/firebase.ts`), jadi satu HP bisa login di keduanya, dan akun absensi
 * tidak pernah memicu listener Firestore KASMA JOB. Dibuat saat pertama dipakai,
 * supaya pengunjung toko tidak ikut menyalakan Auth kedua.
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  connectAuthEmulator, indexedDBLocalPersistence, initializeAuth, signInWithEmailAndPassword, type Auth,
} from "firebase/auth";
import { firebaseConfig, useEmulators } from "@/lib/firebaseConfig";

let absensiApp: FirebaseApp | null = null;
let absensiAuth: Auth | null = null;

/** App Firebase "absensi" (juga dipakai untuk token pengingat FCM, lihat absensi/pengingat.ts). */
export function getAbsensiApp(): FirebaseApp {
  if (!absensiApp) absensiApp = initializeApp(firebaseConfig, "absensi");
  return absensiApp;
}

export function getAbsensiAuth(): Auth {
  if (!absensiAuth) {
    absensiAuth = initializeAuth(getAbsensiApp(), { persistence: indexedDBLocalPersistence });
    if (useEmulators) connectAuthEmulator(absensiAuth, "http://127.0.0.1:9099", { disableWarnings: true });
    if (useEmulators && typeof window !== "undefined") {
      (window as unknown as { __absensiAuth?: Auth }).__absensiAuth = absensiAuth;
    }
  }
  return absensiAuth;
}

if (useEmulators && typeof window !== "undefined") {
  // Login cepat untuk skrip uji lokal (tanpa Turnstile), seperti __emulatorSignIn KASMA JOB.
  const win = window as unknown as {
    __absensiAuth?: Auth;
    __absensiEmulatorSignIn?: (email: string, password: string) => Promise<unknown>;
  };
  win.__absensiEmulatorSignIn = (email, password) => {
    const auth = getAbsensiAuth();
    win.__absensiAuth = auth;
    return signInWithEmailAndPassword(auth, email, password);
  };
}
