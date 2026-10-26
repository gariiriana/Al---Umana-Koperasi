/**
 * Pembaruan aplikasi setelah deploy. Service worker versi baru menunggu sampai pengguna
 * menekan "Perbarui" di AppUpdatePrompt; baru setelah itu ia aktif dan halaman dimuat ulang.
 * Didaftarkan dari main.tsx lewat `virtual:pwa-register` (vite.config.ts: registerType "prompt").
 */
import type { RegisterSWOptions } from "vite-plugin-pwa/types";

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;
type RegisterSW = (options: RegisterSWOptions) => UpdateServiceWorker;

/** Seberapa sering aplikasi yang sedang terbuka menanyakan versi baru ke server. */
const CHECK_EVERY_MS = 10 * 60_000;
/** Bila service worker baru tidak mengambil alih (mis. sudah tidak ada), muat ulang saja. */
const RELOAD_FALLBACK_MS = 5_000;

let updateServiceWorker: UpdateServiceWorker | null = null;
let updateReady = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export function watchAppUpdates(registerSW: RegisterSW): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateReady = true;
      emit();
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Aplikasi terpasang biasanya dilanjutkan dari latar belakang, bukan dimuat ulang, jadi
      // tidak pernah memeriksa versi baru sendiri. Periksa saat kembali ke layar dan berkala.
      const check = () => {
        if (document.visibilityState !== "visible" || !navigator.onLine || registration.installing) return;
        registration.update().catch(() => {
          // Gagal sementara (sinyal); dicoba lagi pada pemeriksaan berikutnya.
        });
      };
      document.addEventListener("visibilitychange", check);
      window.setInterval(check, CHECK_EVERY_MS);
    },
  });
}

export function isAppUpdateReady(): boolean {
  return updateReady;
}

export function onAppUpdateChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Aktifkan versi baru; halaman dimuat ulang begitu service worker baru mengambil alih. */
export async function applyAppUpdate(): Promise<void> {
  window.setTimeout(() => window.location.reload(), RELOAD_FALLBACK_MS);
  await updateServiceWorker?.(true);
}
