/**
 * Aplikasi Firebase kedua khusus Absensi. Sesinya terpisah dari KASMA JOB
 * (`lib/firebase.ts`), jadi satu HP bisa login di keduanya, dan akun absensi
 * tidak pernah memicu listener Firestore KASMA JOB.
 */
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, indexedDBLocalPersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";
import { firebaseConfig, useEmulators } from "@/lib/firebaseConfig";

export const absensiApp = initializeApp(firebaseConfig, "absensi");
export const absensiAuth = initializeAuth(absensiApp, { persistence: indexedDBLocalPersistence });

if (useEmulators) {
  connectAuthEmulator(absensiAuth, "http://127.0.0.1:9099", { disableWarnings: true });
  // Login cepat untuk skrip uji lokal (tanpa Turnstile), seperti __emulatorSignIn KASMA JOB.
  (window as unknown as { __absensiEmulatorSignIn?: (email: string, password: string) => Promise<unknown> })
    .__absensiEmulatorSignIn = (email, password) => signInWithEmailAndPassword(absensiAuth, email, password);
}
