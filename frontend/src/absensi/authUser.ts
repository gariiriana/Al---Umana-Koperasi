import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { absensiAuth } from "@/absensi/firebaseAbsensi";

/** Sesi Absensi di perangkat ini (tanpa memanggil API), untuk pintu /masuk dan root PWA. */
export function useAbsensiAuthUser(): { user: User | null; loading: boolean } {
  const [state, setState] = useState<{ user: User | null; loading: boolean }>({
    user: absensiAuth.currentUser,
    loading: true,
  });
  useEffect(() => onAuthStateChanged(absensiAuth, (user) => setState({ user, loading: false })), []);
  return state;
}
