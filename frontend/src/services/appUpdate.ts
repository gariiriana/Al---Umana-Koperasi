/**
 * Pembaruan aplikasi setelah deploy. Service worker versi baru menunggu sampai pengguna
 * menekan "Perbarui" di AppUpdatePrompt; baru setelah itu ia aktif dan halaman dimuat ulang.
 * Didaftarkan dari main.tsx lewat `virtual:pwa-register` (vite.config.ts: registerType "prompt").
 */
import type { RegisterSWOptions } from "vite-plugin-pwa/types";

type UpdateServiceWorker = (reloadPage?: boolean) => Promise<void>;
type RegisterSW = (options: RegisterSWOptions) => UpdateServiceWorker;

/**
 * idle: tidak ada versi baru. ready: versi baru menunggu tombol Perbarui. applying: tombol sudah
 * ditekan, menunggu versi baru mengambil alih. stuck: versi baru belum bisa mengambil alih.
 * dismissed: pengguna memilih lanjut dulu setelah tertunda.
 */
export type AppUpdateStatus = "idle" | "ready" | "applying" | "stuck" | "dismissed";

/** Seberapa sering aplikasi yang sedang terbuka menanyakan versi baru ke server. */
const CHECK_EVERY_MS = 10 * 60_000;
/** Batas tunggu versi baru mengambil alih setelah Perbarui ditekan (biasanya beberapa milidetik). */
const TAKEOVER_TIMEOUT_MS = 8_000;
/** Batas tunggu mengunduh versi terbaru sebelum Perbarui memasang versi yang sudah siap. */
const NEWEST_VERSION_WAIT_MS = 30_000;

let updateServiceWorker: UpdateServiceWorker | null = null;
let registration: ServiceWorkerRegistration | null = null;
let status: AppUpdateStatus = "idle";
let takeoverTimer: number | undefined;
const listeners = new Set<() => void>();

function setStatus(next: AppUpdateStatus) {
  status = next;
  listeners.forEach((fn) => fn());
}

export function watchAppUpdates(registerSW: RegisterSW): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      if (status === "idle") setStatus("ready");
    },
    onRegisteredSW(_swUrl, reg) {
      if (!reg) return;
      registration = reg;
      // Aplikasi terpasang biasanya dilanjutkan dari latar belakang, bukan dimuat ulang, jadi
      // tidak pernah memeriksa versi baru sendiri. Periksa saat kembali ke layar dan berkala.
      const check = () => {
        if (document.visibilityState !== "visible" || !navigator.onLine || reg.installing) return;
        reg.update().catch(() => {
          // Gagal sementara (sinyal); dicoba lagi pada pemeriksaan berikutnya.
        });
      };
      document.addEventListener("visibilitychange", check);
      window.setInterval(check, CHECK_EVERY_MS);
    },
  });
}

export function getAppUpdateStatus(): AppUpdateStatus {
  return status;
}

export function onAppUpdateChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Aktifkan versi baru. Begitu ia mengambil alih, vite-plugin-pwa memuat ulang halaman.
 *
 * Service worker lama tidak bisa menyerahkan halaman selama ia masih melayani request yang
 * belum dijawab server (berlaku di Chrome dan Safari). Memuat ulang tidak membantu: versi baru
 * tetap menunggu dan pop-up yang sama muncul lagi. Jadi bila versi baru masih menunggu setelah
 * batas waktu, tampilkan petunjuk alih-alih memuat ulang.
 */
export async function applyAppUpdate(): Promise<void> {
  window.clearTimeout(takeoverTimer);
  setStatus("applying");
  if (registration) await settleNewestVersion(registration);
  takeoverTimer = window.setTimeout(() => {
    if (registration?.waiting) setStatus("stuck");
    // Versi baru sudah aktif atau tidak ada lagi, tapi halaman belum dimuat ulang.
    else window.location.reload();
  }, TAKEOVER_TIMEOUT_MS);
  await updateServiceWorker?.(true);
}

/**
 * Versi yang menunggu bisa sudah usang: ia terpasang saat kunjungan sebelumnya, lalu ada deploy
 * lagi. Bila versi itu yang dipasang, aplikasi dimuat ulang dan beberapa detik kemudian pop-up
 * muncul lagi untuk deploy terbaru. Jadi tanyakan dulu versi terbaru ke server dan tunggu
 * unduhannya selesai, supaya satu kali Perbarui langsung memasang versi paling baru. Bila
 * offline atau terlalu lama, pasang saja versi yang sudah siap.
 */
async function settleNewestVersion(reg: ServiceWorkerRegistration): Promise<void> {
  let timer: number | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = window.setTimeout(resolve, NEWEST_VERSION_WAIT_MS);
  });
  const newest = (async () => {
    await reg.update().catch(() => {
      // Offline atau server tidak terjangkau: pakai versi yang sudah menunggu.
    });
    const installing = reg.installing;
    if (!installing) return;
    await new Promise<void>((resolve) => {
      const done = () => {
        if (installing.state === "installing") return;
        installing.removeEventListener("statechange", done);
        resolve();
      };
      installing.addEventListener("statechange", done);
      done();
    });
  })();
  await Promise.race([newest, timeout]);
  window.clearTimeout(timer);
}

/** Setelah tertunda, pengguna boleh lanjut memakai versi ini; pop-up muncul lagi saat dibuka ulang. */
export function dismissAppUpdate(): void {
  window.clearTimeout(takeoverTimer);
  setStatus("dismissed");
}
