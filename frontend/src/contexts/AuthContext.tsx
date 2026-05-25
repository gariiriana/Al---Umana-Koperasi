import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "firebase/auth";

import {
  onAuthStateChanged,
  signIn as authSignIn,
  signOut as authSignOut,
} from "@/services/authService";

/** Shape of the value exposed by useAuth(). */
export interface AuthContextValue {
  /** Authenticated user, or `null` when signed out. */
  user: User | null;
  /** True until the first auth state event arrives from Firebase. */
  loading: boolean;
  /** Sign in with email + password. Throws on failure. */
  signIn: (email: string, password: string) => Promise<void>;
  /** Sign out the current user. */
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export interface AuthProviderProps {
  children: ReactNode;
}

/**
 * AuthProvider subscribes to Firebase auth state once on mount and exposes
 * the current user, sign-in, and sign-out operations to its children via
 * React context. The `loading` flag is true on first paint and flips to
 * false once Firebase reports its initial state — components should gate
 * protected UI on `loading === false`.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged((next) => {
      setUser(next);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signIn: async (email, password) => {
        await authSignIn(email, password);
      },
      signOut: () => authSignOut(),
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * useAuth returns the current auth context. Throws if called outside an
 * `<AuthProvider>` so missing wiring fails loudly instead of producing
 * mystery undefined values.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an <AuthProvider>");
  }
  return ctx;
}
