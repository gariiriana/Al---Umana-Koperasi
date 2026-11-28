/**
 * Pengingat clock in (07:30 WIB) dan clock out (16:30 WIB) ke HP lewat Web Push (FCM).
 * Jamnya sama untuk semua karyawan, dikirim cron Worker absensi (workers/absensi/src/reminders.js).
 * HP cukup memberi izin notifikasi sekali, lalu token FCM-nya didaftarkan ke Worker (D1, tanpa Firestore).
 * Notifikasinya ditampilkan service worker aplikasi (public/push-sw.js), juga saat aplikasi ditutup.
 *
 * Sengaja tidak memakai services/pushService.ts: modul itu memuat Firestore KASMA JOB.
 */
import { registerReminderDevice, removeReminderDevice } from "@/absensi/api";
import { getAbsensiApp } from "@/absensi/firebaseAbsensi";

const STORAGE_KEY = "absensi-pengingat";
const REFRESH_MS = 24 * 3600_000;
const SW_READY_TIMEOUT_MS = 15_000;

export type PengingatAvailability = "ready" | "needs-install" | "unsupported";

interface StoredDevice {
  uid: string;
  token: string;
  at: number;
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia?.("(display-mode: standalone)").matches === true || nav.standalone === true;
}

function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function platform(): string {
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  if (/Macintosh/.test(ua)) return "mac";
  return "other";
}

function readStored(): StoredDevice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredDevice) : null;
  } catch {
    return null;
  }
}

function writeStored(device: StoredDevice | null) {
  try {
    if (device) localStorage.setItem(STORAGE_KEY, JSON.stringify(device));
    else localStorage.removeItem(STORAGE_KEY);
  } catch { /* storage penuh / diblok: tetap jalan, didaftarkan ulang lain kali */ }
}

/** "needs-install": iPhone / iPad hanya mengizinkan notifikasi dari aplikasi yang dipasang ke Layar Utama (iOS 16.4+). */
export async function pengingatAvailability(): Promise<PengingatAvailability> {
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

/** HP ini sudah menerima pengingat untuk akun `uid`. */
export function pengingatAktif(uid: string): boolean {
  return typeof Notification !== "undefined" && Notification.permission === "granted" && readStored()?.uid === uid;
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

async function register(uid: string): Promise<void> {
  const { getMessaging, getToken } = await import("firebase/messaging");
  const registration = await serviceWorkerReady();
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || undefined;
  const token = await getToken(getMessaging(getAbsensiApp()), { serviceWorkerRegistration: registration, vapidKey });
  if (!token) throw new Error("HP tidak memberikan izin notifikasi.");
  await registerReminderDevice({ token, platform: platform() });
  writeStored({ uid, token, at: Date.now() });
}

/** Minta izin (harus dari ketukan pengguna), lalu daftarkan HP ini. */
export async function nyalakanPengingat(uid: string): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission === "granted") await register(uid);
  return permission;
}

/** Saat aplikasi dibuka: daftar ulang kalau izin ada tapi belum terdaftar untuk akun ini, atau sudah lewat sehari. */
export async function segarkanPengingat(uid: string): Promise<void> {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const stored = readStored();
  if (stored && stored.uid === uid && Date.now() - stored.at < REFRESH_MS) return;
  await register(uid);
}

/** Saat Keluar: HP ini berhenti menerima pengingat akun itu. */
export async function lepasPengingat(): Promise<void> {
  const stored = readStored();
  writeStored(null);
  if (stored) await removeReminderDevice(stored.token).catch(() => {});
}
