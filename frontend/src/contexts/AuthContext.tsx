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
import { getRedirectResult } from "firebase/auth";
import { useNavigate } from "react-router-dom";

import { db, auth } from "@/lib/firebase";
import { ABSENSI_ACCOUNT_NOTICE, isAbsensiAccount } from "@/services/absensiAccount";
import {
  onAuthStateChanged,
  signIn as authSignIn,
  sendPasswordReset as authSendPasswordReset,
  signOut as authSignOut,
  signInWithGoogle as authSignInWithGoogle,
} from "@/services/authService";

/** Shape of the user profile document in Firestore. */
export interface UserProfile {
  uid?: string;
  email: string;
  displayName: string;
  role: "admin" | "tim_produksi" | "distribusi" | "monitoring" | "kurir" | "pelanggan"
    | "produksi_1" | "distribusi_1" | "produksi_2" | "distribusi_2" | "mo_katering" | "co_mo_katering"
    | "admin_mbg" | "produksi_mbg" | "distribusi_mbg" | "kurir_mbg"
    | "MBG2" | "mbg2" | "produksi_mbg_2" | "distribusi_mbg_2" | "dokumentasi_produksiMBG" | "super_admin" | "developer"
    | "kepala_unit" | "tim_unit";
  /** Nama orang yang memegang akun ini, diisi Super Admin (akun dipakai per role). */
  holderName?: string;
  /** Kepala Unit: unit usaha yang dipimpin (lihat constants/units.ts). */
  unitId?: string;
  /** Unit tempat akun ini menjadi anggota tim (menerima task Kepala Unit-nya). */
  unitIds?: string[];
  /** Jabatan per unit anggota, mis. { toko_santri: "anggota_utama" }. */
  unitPositions?: Record<string, string>;
  createdAt?: unknown;
  /** Optional delivery address saved during checkout for auto-fill. */
  savedDeliveryAddress?: string;
  photoURL?: string;
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
  /** Sign in with Google provider. Throws on failure. */
  signInWithGoogle: () => Promise<void>;

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
  /** Set when an Absensi account was signed out of KASMA JOB; shown on the login page. */
  accountNotice: string | null;
  /** Hides `accountNotice`. */
  clearAccountNotice: () => void;
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
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    // Process redirect result if returning from Google OAuth redirect flow
    getRedirectResult(auth)
      .then((result) => {
        if (result) {
          console.log("Redirect login successful for user:", result.user.email);
        }
      })
      .catch((error) => {
        console.error("Redirect login error:", error);
      });

    let unsubscribeSnapshot: (() => void) | null = null;
    // Bumped per auth event; a claim check that finishes after a newer event is dropped.
    let authEvent = 0;

    const unsubscribeAuth = onAuthStateChanged(async (nextUser) => {
      // Clean up previous snapshot listener if active
      if (unsubscribeSnapshot) {
        try {
          unsubscribeSnapshot();
        } catch {
          // Ignore
        }
        unsubscribeSnapshot = null;
      }

      const thisEvent = ++authEvent;

      if (nextUser) {
        // Absensi accounts never get a KASMA JOB session, so no users/{uid} read or
        // auto-provisioned "pelanggan" profile.
        const absensiAccount = await isAbsensiAccount(nextUser);
        if (thisEvent !== authEvent) return;
        if (absensiAccount) {
          setAccountNotice(ABSENSI_ACCOUNT_NOTICE);
          setUser(null);
          setProfile(null);
          setLoading(false);
          await authSignOut();
          return;
        }

        setUser(nextUser);

        // Subscribe to Firestore user profile document
        const userDocRef = doc(db, "users", nextUser.uid);
        unsubscribeSnapshot = onSnapshot(
          userDocRef,
          async (docSnap) => {
            if (docSnap.exists()) {
              const data = docSnap.data();
              // Support the descriptive catering alias without rewriting stored roles.
              setProfile({ ...data, uid: nextUser.uid, role: data.role === 'kurir_katering' ? 'kurir' : data.role } as UserProfile);
              setLoading(false);
            } else {
              console.warn(`No user profile found for UID: ${nextUser.uid}. Auto-provisioning default profile...`);
              const email = nextUser.email || "";
              
              // Never infer an internal role from an email address. Admins
              // assign staff roles after provisioning the account.
              const defaultRole: UserProfile["role"] = "pelanggan";
              const defaultDisplayName = nextUser.displayName || email.split("@")[0] || "Pelanggan Baru";

              const defaultProfile: UserProfile = {
                email,
                displayName: defaultDisplayName,
                role: defaultRole,
                createdAt: new Date(),
              };
              try {
                await setDoc(userDocRef, defaultProfile);
              } catch (err) {
                console.error("Failed to auto-provision user profile in Firestore:", err);
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
      authEvent++;
      unsubscribeAuth();
      if (unsubscribeSnapshot) {
        try {
          unsubscribeSnapshot();
        } catch {
          // Ignore
        }
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
      signInWithGoogle: async () => {
        await authSignInWithGoogle();
      },

      sendPasswordReset: async (email) => {
        await authSendPasswordReset(email);
      },
      signOut: async () => {
        await authSignOut();
        navigate("/login");
      },
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
        navigate("/login");
      },
      accountNotice,
      clearAccountNotice: () => setAccountNotice(null),
    }),
    [user, profile, loading, isSignOutConfirmOpen, accountNotice, navigate]
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
