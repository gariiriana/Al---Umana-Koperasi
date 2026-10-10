/**
 * Push notification ke HP (Firebase Cloud Messaging lewat Web Push).
 *
 * Alur:
 *   1. User menekan "Aktifkan notifikasi" → izin browser diminta.
 *   2. Token FCM perangkat disimpan di `push_devices/{sha256(token)}` bersama
 *      uid & role terakhir yang login di perangkat itu.
 *   3. Setiap dokumen baru di `notifications` (pushStatus "pending") dikirim
 *      oleh Cloudflare Worker `al-umana-push` ke semua perangkat penerima.
 *
 * Perangkat sengaja TIDAK dihapus saat user menekan Keluar: HP tetap menerima
 * notifikasi role terakhir sampai ada akun lain yang login di HP itu.
 */

import { doc, deleteDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { app, auth, db } from "@/lib/firebase";

const DEVICE_STORAGE_KEY = "alumana-push-device";
const SW_READY_TIMEOUT_MS = 15_000;

/** Base URL Worker push; kosong di dev lokal supaya tidak memicu Worker produksi. */
const PUSH_API_BASE: string =
  import.meta.env.VITE_PUSH_API_BASE_URL ?? (import.meta.env.PROD ? "https://koperasi-alumana.com" : "");

export type PushAvailability = "ready" | "needs-install" | "unsupported";

export interface RegisteredDevice {
  id: string;
  uid: string;
  role: string;
  at: number;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  // iPadOS 13+ mengaku "Macintosh" tetapi punya layar sentuh.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

/**
 * "needs-install": iPhone/iPad hanya mengizinkan Web Push dari aplikasi yang
 * sudah dipasang ke Layar Utama (iOS 16.4+).
 */
export async function getPushAvailability(): Promise<PushAvailability> {
  if (typeof window === "undefined") return "unsupported";
  const hasApis = "serviceWorker" in navigator && "Notification" in window && "PushManager" in window;
  if (!hasApis) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  try {
    const { isSupported } = await import("firebase/messaging");
    return (await isSupported()) ? "ready" : "unsupported";
  } catch {
    return "unsupported";
  }
}

export function getRegisteredDevice(): RegisteredDevice | null {
  try {
    const raw = localStorage.getItem(DEVICE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RegisteredDevice) : null;
  } catch {
    return null;
  }
}

/** True kalau HP ini sudah terdaftar & izin notifikasi masih diberikan. */
export function isPushActiveOnThisDevice(): boolean {
  return typeof Notification !== "undefined" && Notification.permission === "granted" && getRegisteredDevice() !== null;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function describePlatform(userAgent: string): string {
  if (/iPad|iPhone|iPod/.test(userAgent)) return "ios";
  if (/Android/.test(userAgent)) return "android";
  if (/Windows/.test(userAgent)) return "windows";
  if (/Macintosh/.test(userAgent)) return "mac";
  return "other";
}

async function serviceWorkerReady(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Aplikasi belum siap menerima notifikasi. Muat ulang halaman lalu coba lagi.")), SW_READY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Ambil token FCM perangkat dan simpan sebagai milik `uid`/`role`.
 * Dipanggil setelah izin diberikan, dan ulang di setiap pembukaan aplikasi
 * supaya token yang berganti & perubahan role ikut tersimpan.
 */
export async function registerPushDevice(uid: string, role: string): Promise<RegisteredDevice> {
  const { getMessaging, getToken } = await import("firebase/messaging");
  const registration = await serviceWorkerReady();
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined;
  const token = await getToken(getMessaging(app), { serviceWorkerRegistration: registration, vapidKey });
  if (!token) throw new Error("Browser tidak memberikan token notifikasi.");

  const id = await sha256Hex(token);
  await setDoc(doc(db, "push_devices", id), {
    token,
    uid,
    role,
    platform: describePlatform(navigator.userAgent),
    standalone: isStandalone(),
    userAgent: navigator.userAgent.slice(0, 300),
    updatedAt: serverTimestamp(),
  });

  const device: RegisteredDevice = { id, uid, role, at: Date.now() };
  try { localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(device)); } catch { /* storage penuh/diblok */ }
  return device;
}

/** Minta izin (harus dari klik user) lalu daftarkan perangkat. */
export async function enablePushNotifications(uid: string, role: string): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission === "granted") await registerPushDevice(uid, role);
  return permission;
}

/** Berhenti menerima notifikasi di HP ini. */
export async function disablePushOnThisDevice(): Promise<void> {
  const device = getRegisteredDevice();
  try {
    const { getMessaging, deleteToken } = await import("firebase/messaging");
    await deleteToken(getMessaging(app));
  } catch { /* token mungkin sudah tidak ada */ }
  if (device) {
    try { await deleteDoc(doc(db, "push_devices", device.id)); } catch { /* dokumen milik akun lain */ }
  }
  try { localStorage.removeItem(DEVICE_STORAGE_KEY); } catch { /* ignore */ }
}

let kickTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Bangunkan Worker supaya notifikasi baru langsung dikirim (bukan menunggu
 * cron 1 menit). Beberapa notifikasi beruntun digabung jadi satu panggilan.
 */
export function kickPushWorker(): void {
  if (!PUSH_API_BASE || typeof fetch === "undefined") return;
  clearTimeout(kickTimer);
  kickTimer = setTimeout(() => {
    // Worker hanya menerima kick dari akun yang login (ID token Firebase).
    const user = auth.currentUser;
    if (!user) return;
    user.getIdToken()
      .then((idToken) => fetch(`${PUSH_API_BASE}/api/push/kick`, {
        method: "POST",
        keepalive: true,
        headers: { authorization: `Bearer ${idToken}` },
      }))
      .catch(() => {
        // Cron Worker tetap mengirim dalam ±1 menit.
      });
  }, 400);
}
