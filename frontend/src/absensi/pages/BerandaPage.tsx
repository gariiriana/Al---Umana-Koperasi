import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  RefreshCcw,
} from "lucide-react";

import { workDateWIB } from "../../../../workers/absensi/shared/time.js";
import { getRiwayat } from "@/absensi/api";
import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { ClockButtons } from "@/absensi/components/ClockButtons";
import { EmployeeBottomNav } from "@/absensi/components/EmployeeBottomNav";
import { LocationConfirmModal } from "@/absensi/components/LocationConfirmModal";
import { NotificationBellButton } from "@/absensi/components/NotificationSheet";
import { SelfieCapture } from "@/absensi/components/SelfieCapture";
import { SignalStatusPill, useAmbientGps, useOnlineStatus } from "@/absensi/components/SignalStatusPill";
import { hasDeviceMarker } from "@/absensi/deviceMarker";
import { useClockFlow } from "@/absensi/flow/useClockFlow";
import { buttonState } from "@/absensi/logic/buttonState";
import {
  bulanWIB,
  formatHariTanggal,
  formatJam,
  formatJamDetik,
  formatLogWaktu,
  geserBulan,
} from "@/absensi/logic/format";
import { messageFor } from "@/absensi/messages";
import type { Me, ShiftStatus, ShiftView } from "@/absensi/types";
import { Button } from "@/components/ui/Button";

const SUCCESS_MS = 2200;
const CLOCK_TICK_MS = 1000;

interface LogEvent {
  id: string;
  kind: "in" | "out";
  at: number;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "K";
}

function buildRecentLogs(shifts: ShiftView[]): LogEvent[] {
  const events: LogEvent[] = [];
  for (const s of shifts) {
    if (s.pulangAt !== null) {
      events.push({ id: `${s.id}-out`, kind: "out", at: s.pulangAt });
    }
    events.push({ id: `${s.id}-in`, kind: "in", at: s.masukAt });
  }
  return events.sort((a, b) => b.at - a.at).slice(0, 5);
}

function Beranda({
  me,
  setStatus,
  reloadMe,
}: {
  me: Me;
  setStatus: (status: ShiftStatus) => void;
  reloadMe: () => Promise<void>;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [historyOpen, setHistoryOpen] = useState(true);
  const [recentShifts, setRecentShifts] = useState<ShiftView[] | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const online = useOnlineStatus();
  const { gpsConnected } = useAmbientGps();

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), CLOCK_TICK_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        void reloadMe();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [reloadMe]);

  const currentMonth = useMemo(() => bulanWIB(now), [now]);

  useEffect(() => {
    let cancelled = false;
    const prevMonth = geserBulan(currentMonth, -1);
    Promise.all([getRiwayat(currentMonth), getRiwayat(prevMonth)])
      .then(([curr, prev]) => {
        if (cancelled) return;
        const map = new Map<string, ShiftView>();
        for (const row of [...curr.rows, ...prev.rows]) map.set(row.id, row);
        setRecentShifts([...map.values()]);
      })
      .catch(() => {
        if (!cancelled) setRecentShifts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentMonth, reloadKey]);

  const flow = useClockFlow({ me, onStatus: setStatus });
  const view = buttonState(me.status, now);
  const activeShift = me.status.open ?? (me.status.today?.workDate === workDateWIB(now) ? me.status.today : null);
  const showDeviceBanner = hasDeviceMarker(me.uid) === false;
  const recentLogs = useMemo(() => (recentShifts ? buildRecentLogs(recentShifts) : null), [recentShifts]);

  const { step, cancel } = flow;
  useEffect(() => {
    if (step !== "sukses") return undefined;
    const id = setTimeout(() => {
      cancel();
      setReloadKey((n) => n + 1);
      void reloadMe();
    }, SUCCESS_MS);
    return () => clearTimeout(id);
  }, [step, cancel, reloadMe]);

  const closeFailure = () => {
    cancel();
    void reloadMe();
  };

  const title = flow.kind === "pulang" ? "Clock Out" : "Clock In";
  const areaLabel = me.areas[0]?.name ?? "KOPERASI AL UMANAA";

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 font-['Hanken_Grotesk',system-ui,sans-serif] text-neutral-900">
      {/* Header Kuning Khas (menggantikan header biru di referensi SS 1) */}
      <div className="relative overflow-hidden rounded-b-[2.25rem] bg-gradient-to-br from-amber-400 via-yellow-400 to-amber-500 px-4 pb-20 pt-7 shadow-xs">
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/20" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-amber-300/40" />

        <header className="relative mx-auto flex w-full max-w-md items-center justify-between gap-3">
          <Link to="/absensi/profil" className="group flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white/80 bg-white/90 font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-amber-800 shadow-sm">
              {initials(me.name)}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1">
                <h1 className="truncate font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">
                  {me.name}
                </h1>
                <ChevronRight className="h-4 w-4 shrink-0 text-neutral-800 transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="truncate text-[11px] font-bold tracking-wider text-neutral-800/80 uppercase">
                {areaLabel}
              </p>
            </div>
          </Link>

          <NotificationBellButton variant="header" />
        </header>
      </div>

      {/* Konten Utama */}
      <main className="relative z-10 mx-auto -mt-14 w-full max-w-md space-y-4 px-4">
        {/* Floating Clock Card */}
        <section className="relative rounded-3xl border border-amber-100 bg-white p-5 shadow-[0_12px_32px_-10px_rgba(17,24,39,0.10)]">
          <div className="absolute right-4 top-4">
            <SignalStatusPill gpsConnected={gpsConnected} online={online} />
          </div>

          <div className="py-2 text-center">
            <p className="font-['Manrope',system-ui,sans-serif] text-3xl font-extrabold tracking-tight text-neutral-900 tabular-nums sm:text-4xl">
              {formatJamDetik(now)}
            </p>
            <p className="mt-1 text-sm font-bold text-amber-700">
              {formatHariTanggal(workDateWIB(now))}
            </p>
          </div>

          {(view.shiftDateLabel || view.lastShiftLine || view.durasi) && (
            <div className="mb-3 flex flex-wrap justify-center gap-1.5">
              {view.shiftDateLabel && (
                <span className="rounded-full bg-amber-100 px-3 py-0.5 text-xs font-bold text-amber-900">
                  {view.shiftDateLabel}
                </span>
              )}
              {view.durasi && (
                <span className="rounded-full bg-emerald-50 px-3 py-0.5 text-xs font-bold text-emerald-700">
                  Durasi kerja: {view.durasi}
                </span>
              )}
              {view.lastShiftLine && (
                <span className="rounded-full bg-amber-50 px-3 py-0.5 text-xs font-semibold text-amber-800">
                  {view.lastShiftLine}
                </span>
              )}
            </div>
          )}

          <div className="mt-3">
            <ClockButtons view={view} activeShift={activeShift} onPress={(kind) => flow.start(kind)} />
          </div>
        </section>

        {showDeviceBanner && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
            {messageFor("PASSKEY_TIDAK_DIKENAL")}
          </div>
        )}

        {/* Card Riwayat Absensi Saya (Collapsible + Lihat Selengkapnya) */}
        <section className="rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-xs">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex w-full items-center justify-between text-left"
          >
            <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
              Riwayat Absensi Saya
            </h2>
            {historyOpen ? (
              <ChevronUp className="h-4 w-4 text-neutral-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-neutral-500" />
            )}
          </button>

          {historyOpen && (
            <div className="mt-3">
              {recentLogs === null && (
                <p className="py-4 text-center text-xs text-neutral-400">Memuat riwayat terbaru...</p>
              )}
              {recentLogs?.length === 0 && (
                <p className="py-4 text-center text-xs text-neutral-400">Belum ada catatan absensi terbaru.</p>
              )}
              {recentLogs && recentLogs.length > 0 && (
                <ul className="divide-y divide-neutral-100">
                  {recentLogs.map((item) => (
                    <li key={item.id} className="flex items-center justify-between py-2.5 text-xs sm:text-sm">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`h-2.5 w-2.5 rounded-full ${
                            item.kind === "in" ? "bg-amber-500" : "bg-rose-500"
                          }`}
                        />
                        <span className="font-semibold text-neutral-800">
                          {item.kind === "in" ? "Clock In" : "Clock Out"}
                        </span>
                      </div>
                      <span className="font-medium text-neutral-500 tabular-nums">
                        {formatLogWaktu(item.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 border-t border-neutral-100 pt-3 text-center">
                <Link
                  to="/absensi/riwayat"
                  className="inline-flex items-center gap-1.5 text-xs font-extrabold text-amber-700 hover:text-amber-800"
                >
                  <span>Lihat Selengkapnya</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          )}
        </section>

        {/* Grid Menu Layanan */}
        <section className="rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-xs">
          <h2 className="mb-3.5 font-['Manrope',system-ui,sans-serif] text-sm font-extrabold text-neutral-900">
            Layanan Kehadiran & Pengajuan
          </h2>
          <div className="grid grid-cols-4 gap-2.5 text-center">
            <Link
              to="/absensi/persetujuan?buat=cuti"
              className="group flex flex-col items-center gap-2 rounded-2xl p-1.5 transition hover:bg-amber-50/60"
            >
              <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 shadow-2xs transition group-hover:scale-105">
                <CalendarPlus className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-bold leading-tight text-neutral-700">Permohonan Cuti</span>
            </Link>

            <Link
              to="/absensi/persetujuan?buat=shift"
              className="group flex flex-col items-center gap-2 rounded-2xl p-1.5 transition hover:bg-amber-50/60"
            >
              <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-amber-100/80 text-amber-700 shadow-2xs transition group-hover:scale-105">
                <RefreshCcw className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-bold leading-tight text-neutral-700">Pergantian Shift</span>
            </Link>

            <Link
              to="/absensi/riwayat"
              className="group flex flex-col items-center gap-2 rounded-2xl p-1.5 transition hover:bg-amber-50/60"
            >
              <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-yellow-100/80 text-yellow-800 shadow-2xs transition group-hover:scale-105">
                <CalendarDays className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-bold leading-tight text-neutral-700">Kalender Absensi</span>
            </Link>

            <Link
              to="/absensi/persetujuan"
              className="group flex flex-col items-center gap-2 rounded-2xl p-1.5 transition hover:bg-amber-50/60"
            >
              <div className="flex h-13 w-13 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 shadow-2xs transition group-hover:scale-105">
                <ClipboardList className="h-6 w-6" />
              </div>
              <span className="text-[11px] font-bold leading-tight text-neutral-700">Status Pengajuan</span>
            </Link>
          </div>
        </section>
      </main>

      <EmployeeBottomNav />

      {/* Langkah 1 Clock In / Out: Layar Peta Konfirmasi Google Maps (Referensi SS 3–5) */}
      {flow.step === "lokasi" && flow.kind && (
        <LocationConfirmModal
          kind={flow.kind}
          areas={me.areas}
          headerRight={<NotificationBellButton variant="plain" />}
          onConfirm={(fix) => flow.confirmLocation(fix)}
          onCancel={cancel}
        />
      )}

      {/* Langkah 2–4: Selfie Liveness, Passkey, dan Hasil */}
      {flow.step !== "idle" && flow.step !== "lokasi" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 px-4 py-8 backdrop-blur-xs"
        >
          <div className="w-full max-w-md space-y-5 rounded-3xl border border-amber-100 bg-white p-6 shadow-2xl">
            <div className="text-center">
              <span className="inline-block rounded-full bg-amber-100 px-3 py-0.5 text-[11px] font-extrabold text-amber-800">
                Verifikasi Kehadiran
              </span>
              <h2 className="mt-1 font-['Manrope',system-ui,sans-serif] text-xl font-extrabold text-neutral-900">
                {title}
              </h2>
            </div>

            {flow.step === "selfie" && (
              <SelfieCapture
                mode={me.faceRequired && me.faceDescriptor ? "match" : "photo"}
                reference={me.faceDescriptor}
                onDone={(selfie) => void flow.selfieDone(selfie)}
                onCancel={cancel}
              />
            )}

            {flow.step === "passkey" && (
              <div className="space-y-4 text-center">
                <p className="text-sm text-neutral-600">
                  Konfirmasi kehadiran dengan sidik jari atau Face ID perangkat Anda.
                </p>
                <Button
                  variant="primary"
                  className="w-full"
                  loading={!flow.passkeyReady}
                  disabled={!flow.passkeyReady}
                  onClick={() => void flow.confirmPasskey()}
                >
                  Konfirmasi sidik jari / Face ID
                </Button>
                <Button variant="outlined" className="w-full" onClick={cancel}>
                  Batal
                </Button>
              </div>
            )}

            {flow.step === "kirim" && (
              <p className="py-6 text-center text-sm font-semibold text-neutral-600">
                Mengirim data absensi...
              </p>
            )}

            {flow.step === "sukses" && flow.result && (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 className="h-10 w-10" aria-hidden="true" />
                </div>
                <p className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">
                  {flow.result.kind === "masuk" ? "Clock in berhasil" : "Clock out berhasil"} · {formatJam(flow.result.serverTime)}
                </p>
              </div>
            )}

            {flow.step === "gagal" && (
              <div className="space-y-4 text-center">
                <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {flow.error}
                </p>
                <div className="flex justify-center gap-2">
                  <Button variant="primary" onClick={flow.retry}>Coba lagi</Button>
                  <Button variant="outlined" onClick={closeFailure}>Tutup</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Beranda karyawan: kartu jam & tombol absen, riwayat singkat, dan menu layanan. */
export function BerandaPage() {
  const { me, setStatus, reloadMe } = useAbsensiSession();
  if (!me) return null;
  return <Beranda me={me} setStatus={setStatus} reloadMe={reloadMe} />;
}
