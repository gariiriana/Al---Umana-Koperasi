import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";

import {
  nyalakanPengingat, pengingatAktif, pengingatAvailability, segarkanPengingat, type PengingatAvailability,
} from "@/absensi/pengingat";
import { Button } from "@/components/ui/Button";

/**
 * Beranda: ajakan menyalakan pengingat clock in 07:30 dan clock out 16:30 WIB ke HP.
 * Hilang setelah aktif. Tidak muncul di browser yang tidak mendukung notifikasi.
 */
export function PengingatCard({ uid }: { uid: string }) {
  const [availability, setAvailability] = useState<PengingatAvailability | null>(null);
  const [active, setActive] = useState(() => pengingatAktif(uid));
  const [denied, setDenied] = useState(() => typeof Notification !== "undefined" && Notification.permission === "denied");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void pengingatAvailability().then((value) => {
      if (!cancelled) setAvailability(value);
    });
    // Izin sudah ada: pastikan token HP ini terdaftar untuk akun ini (token bisa berganti).
    segarkanPengingat(uid).then(() => !cancelled && setActive(pengingatAktif(uid)), () => {});
    return () => {
      cancelled = true;
    };
  }, [uid]);

  if (active || availability === null || availability === "unsupported") return null;

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await nyalakanPengingat(uid);
      if (permission === "denied") setDenied(true);
      setActive(pengingatAktif(uid));
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Pengingat belum bisa dinyalakan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex items-start gap-3 rounded-3xl border border-amber-200 bg-white p-4 shadow-xs">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
        <BellRing className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="font-['Manrope',system-ui,sans-serif] text-sm font-extrabold text-neutral-900">Pengingat absen ke HP</p>
          <p className="text-xs text-neutral-600">Notifikasi jam 07:30 untuk clock in dan 16:30 untuk clock out, kalau kamu belum absen.</p>
        </div>
        {availability === "needs-install" ? (
          <p className="text-xs font-semibold text-amber-900">
            Di iPhone, pasang dulu aplikasinya: buka di Safari, ketuk Bagikan → Tambahkan ke Layar Utama, lalu buka dari ikon itu.
          </p>
        ) : denied ? (
          <p className="text-xs font-semibold text-rose-700">
            Notifikasi diblokir. Izinkan notifikasi untuk aplikasi ini di pengaturan HP, lalu buka lagi.
          </p>
        ) : (
          <Button variant="primary" size="sm" loading={busy} onClick={() => void enable()}>
            Nyalakan pengingat
          </Button>
        )}
        {error && <p role="alert" className="text-xs font-semibold text-rose-700">{error}</p>}
      </div>
    </section>
  );
}
