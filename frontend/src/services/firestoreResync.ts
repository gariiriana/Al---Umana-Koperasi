// ============================================================================
// Firestore resync — pulihkan koneksi realtime yang macet diam-diam
// ============================================================================
// Di HP/PWA, koneksi listener Firestore bisa mati tanpa error setelah aplikasi
// lama di background, layar terkunci, atau sinyal sempat putus. Listener tetap
// menampilkan data cache dan tidak menerima perubahan baru sampai aplikasi
// ditutup penuh. disableNetwork + enableNetwork memaksa semua stream tersambung
// ulang; listener melanjutkan dari resume token sehingga hanya perubahan yang
// terbaca (bukan seluruh koleksi).

import { disableNetwork, enableNetwork } from "firebase/firestore";
import { db } from "@/lib/firebase";

/** Aplikasi dianggap "kembali dibuka" bila sebelumnya tersembunyi selama ini. */
const RESUME_AFTER_MS = 30_000;
/** Sambung ulang berkala selama aplikasi terbuka, untuk stream yang macet di foreground. */
const PERIODIC_MS = 10 * 60_000;
const STEP_TIMEOUT_MS = 10_000;

let inflight: Promise<boolean> | null = null;

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

async function doResync(): Promise<boolean> {
  try {
    await withTimeout(disableNetwork(db), STEP_TIMEOUT_MS);
    await withTimeout(enableNetwork(db), STEP_TIMEOUT_MS);
    return true;
  } catch (err) {
    console.warn("[firestore] sambung ulang gagal:", err);
    // Jangan sampai jaringan tertinggal dalam keadaan dimatikan.
    enableNetwork(db).catch(() => {});
    return false;
  }
}

/** Paksa semua listener Firestore tersambung ulang. Panggilan bersamaan digabung. */
export function resyncFirestore(): Promise<boolean> {
  if (!inflight) inflight = doResync().finally(() => { inflight = null; });
  return inflight;
}

/** Menunggu sambung ulang yang sedang berjalan (kalau ada). */
export function pendingResync(): Promise<unknown> {
  return inflight ?? Promise.resolve();
}

/** Pasang pemicu otomatis: kembali dari background, sinyal kembali, bfcache, dan berkala. */
export function startFirestoreAutoResync(): () => void {
  let hiddenAt = document.visibilityState === "hidden" ? Date.now() : 0;

  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt && Date.now() - hiddenAt >= RESUME_AFTER_MS) void resyncFirestore();
    hiddenAt = 0;
  };
  const onOnline = () => void resyncFirestore();
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) void resyncFirestore();
  };
  const timer = setInterval(() => {
    if (document.visibilityState === "visible" && navigator.onLine) void resyncFirestore();
  }, PERIODIC_MS);

  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("online", onOnline);
  window.addEventListener("pageshow", onPageShow);
  return () => {
    clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("pageshow", onPageShow);
  };
}
