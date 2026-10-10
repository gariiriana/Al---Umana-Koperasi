import { useEffect, useState } from "react";

/** Waktu sekarang (millis) yang diperbarui berkala, agar status deadline ikut berubah tanpa reload. */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
