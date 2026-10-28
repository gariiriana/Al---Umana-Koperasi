import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut, type User } from "firebase/auth";
import { getAbsensiAuth } from "@/absensi/firebaseAbsensi";
import { AbsensiApiError, getMe } from "@/absensi/api";
import type { Me, ShiftStatus } from "@/absensi/types";

export interface AbsensiSessionValue {
  user: User | null;
  me: Me | null;
  loading: boolean;
  /** Kode error terakhir (lihat messages.ts), mis. BUKAN_AKUN_ABSENSI. */
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setStatus: (status: ShiftStatus) => void;
  reloadMe: () => Promise<void>;
}

const AbsensiSessionContext = createContext<AbsensiSessionValue | null>(null);

// Akun yang ditolak Worker tidak boleh tetap login di pintu Absensi.
const SIGN_OUT_CODES = new Set(["BUKAN_AKUN_ABSENSI", "AKUN_NONAKTIF", "UNAUTHENTICATED"]);

export function AbsensiSessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const authEventRef = useRef(0);

  const loadMe = useCallback(async () => {
    try {
      const data = await getMe();
      setMe(data);
      setError(null);
    } catch (err) {
      const code = err instanceof AbsensiApiError ? err.code : "INTERNAL";
      setMe(null);
      setError(code);
      if (SIGN_OUT_CODES.has(code)) await firebaseSignOut(getAbsensiAuth());
    }
  }, []);

  useEffect(() => onAuthStateChanged(getAbsensiAuth(), async (next) => {
    const thisEvent = ++authEventRef.current;
    setUser(next);
    if (next) {
      setLoading(true);
      await loadMe();
      if (thisEvent !== authEventRef.current) return;
    } else {
      setMe(null);
    }
    setLoading(false);
  }), [loadMe]);

  const signIn = useCallback(async (email: string, password: string) => {
    setError(null);
    try {
      await signInWithEmailAndPassword(getAbsensiAuth(), email.trim(), password);
    } catch {
      throw new AbsensiApiError("LOGIN_GAGAL", 401);
    }
  }, []);

  const value = useMemo<AbsensiSessionValue>(() => ({
    user, me, loading, error, signIn,
    signOut: () => firebaseSignOut(getAbsensiAuth()),
    setStatus: (status) => setMe((current) => (current ? { ...current, status } : current)),
    reloadMe: loadMe,
  }), [user, me, loading, error, signIn, loadMe]);

  return <AbsensiSessionContext.Provider value={value}>{children}</AbsensiSessionContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAbsensiSession(): AbsensiSessionValue {
  const value = useContext(AbsensiSessionContext);
  if (!value) throw new Error("useAbsensiSession must be used inside AbsensiSessionProvider");
  return value;
}
