import { useCallback, useEffect, useState } from "react";
import { BellRing, BellOff, Download, Share, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import {
  enablePushNotifications,
  getPushAvailability,
  isIos,
  isStandalone,
  refreshPushDevice,
  type PushAvailability,
} from "@/services/pushService";
import { canPromptInstall, onInstallPromptChange, promptInstall } from "@/services/installPrompt";
import { pushNotification } from "@/services/notificationWriter";
import { setNotificationActorRole } from "@/services/flowNotifications";

type Card = "enable" | "ios-install" | "blocked" | "install" | "error" | null;

const SNOOZE_MS: Record<Exclude<Card, null>, number> = {
  enable: 3 * 24 * 60 * 60 * 1000,
  "ios-install": 3 * 24 * 60 * 60 * 1000,
  blocked: 7 * 24 * 60 * 60 * 1000,
  install: 7 * 24 * 60 * 60 * 1000,
  error: 24 * 60 * 60 * 1000,
};
const REFRESH_MS = 24 * 60 * 60 * 1000;

const snoozeKey = (card: string) => `alumana-push-snooze-${card}`;

function isSnoozed(card: Exclude<Card, null>): boolean {
  try {
    const until = Number(localStorage.getItem(snoozeKey(card)) || 0);
    return Date.now() < until;
  } catch {
    return false;
  }
}

function snooze(card: Exclude<Card, null>): void {
  try { localStorage.setItem(snoozeKey(card), String(Date.now() + SNOOZE_MS[card])); } catch { /* ignore */ }
}

function currentPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

/**
 * Mendaftarkan HP ke notifikasi push dan menampilkan satu kartu ajakan:
 * aktifkan notifikasi, pasang aplikasi (Android), cara pasang di iPhone, atau
 * cara membuka blokir. Perangkat yang sudah aktif disegarkan diam-diam
 * (token baru / role berubah) paling sering sekali sehari.
 */
export function PushNotificationCenter() {
  const { user, profile } = useAuth();
  const [availability, setAvailability] = useState<PushAvailability | null>(null);
  const [permission, setPermission] = useState(currentPermission);
  const [installable, setInstallable] = useState(canPromptInstall);
  const [card, setCard] = useState<Card>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justEnabled, setJustEnabled] = useState(false);

  const uid = user?.uid;
  const role = profile?.role;

  useEffect(() => { setNotificationActorRole(role); }, [role]);
  useEffect(() => onInstallPromptChange(() => setInstallable(canPromptInstall())), []);
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getPushAvailability().then((value) => { if (!cancelled) setAvailability(value); });
    return () => { cancelled = true; };
  }, [uid]);

  // Perangkat yang sudah diizinkan: perbarui token & role secara diam-diam
  // (dan minta token baru kalau Worker sudah membuang token lama yang mati).
  useEffect(() => {
    if (!uid || !role || availability !== "ready" || permission !== "granted") return;
    refreshPushDevice(uid, role, REFRESH_MS).catch((err) => {
      console.warn("[push] gagal memperbarui perangkat:", err);
      setError(err instanceof Error ? err.message : "Gagal mendaftarkan HP untuk notifikasi.");
    });
  }, [uid, role, availability, permission]);

  useEffect(() => {
    if (!uid || availability === null) { setCard(null); return; }
    const pick = (): Card => {
      if (error && !isSnoozed("error")) return "error";
      if (availability === "needs-install") return isSnoozed("ios-install") ? null : "ios-install";
      if (availability !== "ready") return null;
      if (permission === "default") return isSnoozed("enable") ? null : "enable";
      if (permission === "denied") return isSnoozed("blocked") ? null : "blocked";
      if (installable && !isStandalone() && !isSnoozed("install")) return "install";
      return null;
    };
    setCard(pick());
  }, [uid, availability, permission, installable, error]);

  const handleEnable = useCallback(async () => {
    if (!uid || !role) return;
    setBusy(true);
    setError(null);
    try {
      const result = await enablePushNotifications(uid, role);
      setPermission(result);
      if (result === "granted") {
        setJustEnabled(true);
        // Notifikasi uji lewat jalur yang sama (Firestore → Worker → HP).
        pushNotification({
          recipientId: uid, type: "system", actorRole: role,
          title: "Notifikasi aktif", titleEn: "Notifications enabled",
          message: "HP ini akan menerima notifikasi Al-Umanaa walau aplikasi ditutup.",
          messageEn: "This phone will receive Al-Umanaa notifications even when the app is closed.",
        }).catch((err) => console.warn("[push] notifikasi uji gagal:", err));
        setTimeout(() => setJustEnabled(false), 6000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengaktifkan notifikasi.");
    } finally {
      setBusy(false);
    }
  }, [uid, role]);

  const handleInstall = useCallback(async () => {
    setBusy(true);
    try { await promptInstall(); } finally { setBusy(false); }
  }, []);

  const close = useCallback(() => {
    if (card) snooze(card);
    if (card === "error") setError(null);
    setCard(null);
  }, [card]);

  if (justEnabled) {
    return (
      <Shell>
        <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">Notifikasi aktif</p>
          <p className="mt-0.5 text-xs text-neutral-300">Notifikasi uji akan masuk ke HP ini dalam beberapa detik.</p>
        </div>
      </Shell>
    );
  }

  if (!card) return null;

  return (
    <Shell onClose={close}>
      {card === "enable" && (
        <>
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-[#FBBF24]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">Aktifkan notifikasi di HP ini</p>
            <p className="mt-0.5 text-xs text-neutral-300">
              Pesanan, job desk, task, dan update MBG langsung masuk ke HP walau aplikasi ditutup.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <PrimaryButton onClick={handleEnable} disabled={busy}>{busy ? "Mengaktifkan…" : "Aktifkan"}</PrimaryButton>
              {installable && !isStandalone() && <SecondaryButton onClick={handleInstall} disabled={busy}><Download className="h-3.5 w-3.5" />Pasang aplikasi</SecondaryButton>}
              <SecondaryButton onClick={close}>Nanti</SecondaryButton>
            </div>
          </div>
        </>
      )}

      {card === "ios-install" && (
        <>
          <Share className="mt-0.5 h-5 w-5 shrink-0 text-[#FBBF24]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">Pasang aplikasi supaya notifikasi bisa masuk</p>
            <p className="mt-0.5 text-xs text-neutral-300">
              Di {isIos() ? "iPhone/iPad" : "perangkat ini"}, buka lewat Safari → ketuk <b>Bagikan</b> → <b>Tambah ke Layar Utama</b>,
              lalu buka Al-Umanaa dari ikon di layar utama dan aktifkan notifikasi.
            </p>
            <div className="mt-3"><SecondaryButton onClick={close}>Mengerti</SecondaryButton></div>
          </div>
        </>
      )}

      {card === "blocked" && (
        <>
          <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">Notifikasi diblokir</p>
            <p className="mt-0.5 text-xs text-neutral-300">
              Buka setelan situs/aplikasi di browser → <b>Notifikasi</b> → <b>Izinkan</b>, lalu muat ulang aplikasi.
            </p>
            <div className="mt-3"><SecondaryButton onClick={close}>Tutup</SecondaryButton></div>
          </div>
        </>
      )}

      {card === "install" && (
        <>
          <Download className="mt-0.5 h-5 w-5 shrink-0 text-[#FBBF24]" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">Pasang aplikasi Al-Umanaa</p>
            <p className="mt-0.5 text-xs text-neutral-300">Buka lebih cepat dari layar utama HP, tampil layar penuh.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <PrimaryButton onClick={handleInstall} disabled={busy}>Pasang</PrimaryButton>
              <SecondaryButton onClick={close}>Nanti</SecondaryButton>
            </div>
          </div>
        </>
      )}

      {card === "error" && (
        <>
          <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="font-bold">Notifikasi belum aktif</p>
            <p className="mt-0.5 text-xs text-neutral-300">{error}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <PrimaryButton onClick={handleEnable} disabled={busy}>{busy ? "Mencoba…" : "Coba lagi"}</PrimaryButton>
              <SecondaryButton onClick={close}>Nanti</SecondaryButton>
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}

function Shell({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div role="status" aria-live="polite"
      className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[9998] flex justify-center px-4 lg:inset-x-auto lg:bottom-4 lg:right-4 font-['Hanken_Grotesk',system-ui,sans-serif]">
      <div className="relative flex w-full max-w-sm items-start gap-3 rounded-2xl border border-white/10 bg-[#111827]/95 p-4 pr-9 text-sm text-white shadow-2xl backdrop-blur">
        {children}
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Tutup"
            className="absolute right-2 top-2 rounded-full p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props}
    className="inline-flex items-center gap-1.5 rounded-full bg-[#FBBF24] px-4 py-1.5 text-xs font-bold text-[#111827] hover:bg-[#F59E0B] disabled:opacity-60" />;
}

function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props}
    className="inline-flex items-center gap-1.5 rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold text-white hover:bg-white/10 disabled:opacity-60" />;
}
