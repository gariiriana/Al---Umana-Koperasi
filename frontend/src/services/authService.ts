/**
 * Authentication service: thin wrapper around Firebase Auth that exposes a
 * promise-friendly API for sign-in / sign-out / token retrieval.
 *
 * Components should prefer the `useAuth()` hook instead of importing this
 * module directly — the hook handles state subscriptions and exposes the
 * same operations.
 */
import {
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
  type User,
  type Unsubscribe,
} from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

/** Sign in with email + password. Resolves to the authenticated user. */
export async function signIn(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

/** Create a new customer user with email, password, and displayName, and store in Firestore users collection. */
export async function signUp(
  email: string,
  password: string,
  displayName: string
): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const user = credential.user;
  await updateProfile(user, { displayName });
  
  // Write to users collection
  const userRef = doc(db, "users", user.uid);
  await setDoc(userRef, {
    email,
    displayName,
    role: "pelanggan",
    createdAt: new Date(),
  });
  
  return user;
}

/** Send password reset email. */
export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

/** Sign the current user out. Resolves once the local session is cleared. */
export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}

/**
 * Return a fresh Firebase ID token for the current user, or `null` when no
 * user is signed in. The token is auto-refreshed by the SDK; callers who
 * need a guaranteed-fresh token can pass `forceRefresh = true`.
 */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

/**
 * Subscribe to auth state changes. The listener is invoked once with the
 * current user (or `null`) immediately after subscribing, and again on each
 * subsequent state change. Returns the unsubscribe function from the
 * Firebase SDK.
 */
export function onAuthStateChanged(
  listener: (user: User | null) => void
): Unsubscribe {
  return firebaseOnAuthStateChanged(auth, listener);
}

/** Return the currently signed-in user synchronously, or `null`. */
export function currentUser(): User | null {
  return auth.currentUser;
}
