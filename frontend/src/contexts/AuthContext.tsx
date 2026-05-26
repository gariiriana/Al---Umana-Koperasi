import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signIn as authSignIn,
  signUp as authSignUp,
  sendPasswordReset as authSendPasswordReset,
  signOut as authSignOut,
} from "@/services/authService";

/** Shape of the user profile document in Firestore. */
export interface UserProfile {
  uid?: string;
  email: string;
  displayName: string;
  role: "admin" | "tim_produksi" | "distribusi" | "monitoring" | "pelanggan";
  createdAt?: unknown;
  /** Optional delivery address saved during checkout for auto-fill. */
  savedDeliveryAddress?: string;
}

/** Shape of the value exposed by useAuth(). */
export interface AuthContextValue {
  /** Authenticated Firebase user, or `null` when signed out. */
  user: User | null;
  /** Dynamically synced user profile containing role and name. */
  profile: UserProfile | null;
  /** True until the first auth state and profile snapshot events arrive. */
  loading: boolean;
  /** Sign in with email + password. Throws on failure. */
  signIn: (email: string, password: string) => Promise<void>;
  /** Register a new customer user. Throws on failure. */
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  /** Send password reset link to email. Throws on failure. */
  sendPasswordReset: (email: string) => Promise<void>;
  /** Sign out the current user. */
  signOut: () => Promise<void>;
  /** Whether the sign-out confirmation dialog is visible. */
  isSignOutConfirmOpen: boolean;
  /** Requests signing out by opening the confirmation dialog. */
  requestSignOut: () => void;
  /** Cancels the sign-out and hides the dialog. */
  cancelSignOut: () => void;
  /** Confirms the sign-out, hides the dialog, and triggers actual sign-out. */
  confirmSignOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
}

/**
 * AuthProvider subscribes to Firebase auth state once on mount, then hooks
 * into Firestore to sync user profiles (specifically roles) in real-time.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSignOutConfirmOpen, setIsSignOutConfirmOpen] = useState(false);

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged((nextUser) => {
      // Clean up previous snapshot listener if active
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (nextUser) {
        setUser(nextUser);
        
        // Subscribe to Firestore user profile document
        const userDocRef = doc(db, "users", nextUser.uid);
        unsubscribeSnapshot = onSnapshot(
          userDocRef,
          async (docSnap) => {
            if (docSnap.exists()) {
              setProfile(docSnap.data() as UserProfile);
              setLoading(false);
            } else {
              // Automatically provision missing Firestore document on first login
              const fallbackDisplayName = nextUser.displayName ?? nextUser.email?.split("@")[0] ?? "User";

              try {
                await setDoc(userDocRef, {
                  email: nextUser.email ?? "",
                  displayName: fallbackDisplayName,
                  role: "pelanggan", // Selalu default ke pelanggan
                  createdAt: new Date(),
                });
                // NOTE: setLoading(false) will be called by the onSnapshot callback
                // when the document creation is confirmed. However, we set a fallback
                // profile here so the UI doesn't get stuck if onSnapshot is slow.
                setProfile({
                  email: nextUser.email ?? "",
                  displayName: fallbackDisplayName,
                  role: "pelanggan",
                });
                setLoading(false);
              } catch (err) {
                console.error("Failed to automatically create user profile:", err);
                setProfile(null);
                setLoading(false);
              }
            }
          },
          (error) => {
            console.error("Firestore user profile subscription error:", error);
            setProfile(null);
            setLoading(false);
          }
        );
      } else {
        setUser(null);
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
      }
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      profile,
      loading,
      signIn: async (email, password) => {
        await authSignIn(email, password);
      },
      signUp: async (email, password, displayName) => {
        await authSignUp(email, password, displayName);
      },
      sendPasswordReset: async (email) => {
        await authSendPasswordReset(email);
      },
      signOut: () => authSignOut(),
      isSignOutConfirmOpen,
      requestSignOut: () => {
        setIsSignOutConfirmOpen(true);
      },
      cancelSignOut: () => {
        setIsSignOutConfirmOpen(false);
      },
      confirmSignOut: async () => {
        setIsSignOutConfirmOpen(false);
        await authSignOut();
      },
    }),
    [user, profile, loading, isSignOutConfirmOpen]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * useAuth returns the current auth context. Throws if called outside an
 * `<AuthProvider>` so missing wiring fails loudly.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}
