import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getAbsensiAuth } from "@/absensi/firebaseAbsensi";

/**
 * Sesi Absensi di perangkat ini (tanpa memanggil API), untuk pintu /masuk dan root PWA.
 * `enabled = false` tidak menyalakan Auth absensi sama sekali (mis. pengunjung toko di browser).
 */
export function useAbsensiAuthUser(enabled = true): { user: User | null; loading: boolean } {
  const [state, setState] = useState<{ user: User | null; loading: boolean }>({ user: null, loading: enabled });
  useEffect(() => {
    if (!enabled) return undefined;
    return onAuthStateChanged(getAbsensiAuth(), (user) => setState({ user, loading: false }));
  }, [enabled]);
  return enabled ? state : { user: null, loading: false };
}
