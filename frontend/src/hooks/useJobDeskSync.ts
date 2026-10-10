import { useCallback, useEffect, useRef, useState } from "react";
import { Timestamp, collection, getDocsFromServer, limit, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { pendingResync, resyncFirestore, withTimeout } from "@/services/firestoreResync";
import type { CateringJobDesk } from "@/types/cateringJobDesk";

export type JobDeskSyncState = "checking" | "live" | "stale";

const CHECK_EVERY_MS = 2 * 60_000;
const PROBE_TIMEOUT_MS = 15_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Waktu update job desk terbaru menurut server (membaca 1 dokumen). */
async function serverLatestUpdate(): Promise<number> {
  const snap = await withTimeout(
    getDocsFromServer(query(collection(db, "catering_jobdesks"), orderBy("updatedAt", "desc"), limit(1))),
    PROBE_TIMEOUT_MS
  );
  const v = snap.docs[0]?.get("updatedAt");
  return v instanceof Timestamp ? v.toMillis() : 0;
}

const latestLocal = (desks: CateringJobDesk[]) =>
  desks.reduce((max, d) => Math.max(max, Date.parse(d.updatedAt) || 0), 0);

/**
 * Memastikan daftar job desk di layar sama dengan server. Saat halaman siap, tiap
 * 2 menit, dan saat aplikasi dibuka lagi, waktu update terbaru di server
 * dibandingkan dengan data listener. Bila tertinggal, koneksi disambung ulang;
 * bila tetap tertinggal, status menjadi "stale" supaya pengguna bisa memuat ulang.
 */
export function useJobDeskSync(jobDesks: CateringJobDesk[], ready: boolean) {
  const [state, setState] = useState<JobDeskSyncState>("checking");
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const desksRef = useRef(jobDesks);
  const running = useRef(false);

  useEffect(() => {
    desksRef.current = jobDesks;
  }, [jobDesks]);

  const check = useCallback(async (force: boolean) => {
    if (running.current || !navigator.onLine) return;
    running.current = true;
    if (force) setState("checking");
    try {
      if (force) await resyncFirestore();
      else await pendingResync();
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const server = await serverLatestUpdate();
          // Beri waktu listener mengantar perubahan yang baru saja terjadi.
          if (server > latestLocal(desksRef.current)) await sleep(4000);
          if (server <= latestLocal(desksRef.current)) {
            setState("live");
            setCheckedAt(Date.now());
            return;
          }
        } catch {
          // Gagal / timeout menghubungi server: diperlakukan sama seperti tertinggal.
        }
        if (attempt === 0) {
          await resyncFirestore();
          await sleep(6000);
        }
      }
      setState("stale");
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void check(false);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void check(false);
    }, CHECK_EVERY_MS);
    let resumeTimer: ReturnType<typeof setTimeout> | undefined;
    const onResume = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(resumeTimer);
      // Tunggu sebentar supaya sambung ulang global (firestoreResync) mulai lebih dulu.
      resumeTimer = setTimeout(() => void check(false), 1500);
    };
    document.addEventListener("visibilitychange", onResume);
    window.addEventListener("online", onResume);
    return () => {
      clearInterval(timer);
      clearTimeout(resumeTimer);
      document.removeEventListener("visibilitychange", onResume);
      window.removeEventListener("online", onResume);
    };
  }, [ready, check]);

  const syncNow = useCallback(() => void check(true), [check]);
  return { state, checkedAt, syncNow };
}
