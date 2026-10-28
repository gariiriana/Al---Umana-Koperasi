import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { workDateWIB } from "../../../../workers/absensi/shared/time.js";
import { getRiwayat } from "@/absensi/api";
import { EmployeeBottomNav } from "@/absensi/components/EmployeeBottomNav";
import { NotificationBellButton } from "@/absensi/components/NotificationSheet";
import { errorMessage } from "@/absensi/errorMessage";
import {
  LEAVE_TYPE_LABEL,
  SHIFT_STATUS_LABEL,
  bulanWIB,
  daysInMonth,
  expandDatesInRange,
  formatBulan,
  formatDurasi,
  formatJam,
  formatTanggalPanjang,
  geserBulan,
} from "@/absensi/logic/format";
import type { AbsensiRequestView, LeaveType, ShiftView } from "@/absensi/types";

const WEEKDAYS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function buildCalendarCells(bulan: string): Array<{ day: number; date: string } | null> {
  const [year, month] = bulan.split("-").map(Number);
  const firstDayUtc = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=Minggu..6=Sabtu
  const mondayOffset = (firstDayUtc + 6) % 7; // 0=Senin..6=Minggu
  const total = daysInMonth(bulan);
  const cells: Array<{ day: number; date: string } | null> = Array.from({ length: mondayOffset }, () => null);
  for (let d = 1; d <= total; d++) {
    cells.push({ day: d, date: `${bulan}-${pad(d)}` });
  }
  return cells;
}

interface DonutSegment {
  label: string;
  count: number;
  color: string;
  dotClass: string;
}

function DonutChart({ segments, total, hadirPct }: { segments: DonutSegment[]; total: number; hadirPct: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="relative flex h-36 w-36 shrink-0 items-center justify-center">
      <svg viewBox="0 0 132 132" className="h-full w-full -rotate-90">
        <circle cx="66" cy="66" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="16" />
        {total > 0 && segments.filter((s) => s.count > 0).map((seg) => {
          const length = (seg.count / total) * circumference;
          const dashOffset = -offset;
          offset += length;
          return (
            <circle
              key={seg.label}
              cx="66"
              cy="66"
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth="16"
              strokeDasharray={`${Math.max(0, length - 2)} ${circumference}`}
              strokeDashoffset={dashOffset}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-neutral-900">
          {total}
        </span>
        <span className="text-[10px] font-medium text-neutral-400">Total Hari</span>
        <span className="mt-0.5 text-[11px] font-extrabold text-amber-700">{hadirPct}% Hadir</span>
      </div>
    </div>
  );
}

/** Halaman ke-2 ketika klik "Lihat Selengkapnya": Kalender Absensi & Ringkasan Kehadiran (Referensi SS 2). */
export function RiwayatPage() {
  const navigate = useNavigate();
  const today = useMemo(() => workDateWIB(Date.now()), []);
  const [bulan, setBulan] = useState(() => bulanWIB(Date.now()));
  const [shifts, setShifts] = useState<ShiftView[]>([]);
  const [requests, setRequests] = useState<AbsensiRequestView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(today);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getRiwayat(bulan)
      .then((res) => {
        if (cancelled) return;
        setShifts(res.rows);
        setRequests(res.requests ?? []);
        setSelectedDate((curr) => (curr && curr.startsWith(bulan) ? curr : `${bulan}-01`));
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bulan]);

  const shiftByDate = useMemo(() => {
    const map = new Map<string, ShiftView>();
    for (const s of shifts) map.set(s.workDate, s);
    return map;
  }, [shifts]);

  const approvedLeaveByDate = useMemo(() => {
    const map = new Map<string, { type: LeaveType; req: AbsensiRequestView }>();
    const clipFrom = `${bulan}-01`;
    const clipTo = `${bulan}-${pad(daysInMonth(bulan))}`;
    for (const r of requests) {
      if (r.status === "approved" && r.kind === "cuti" && r.leaveType) {
        for (const d of expandDatesInRange(r.startDate, r.endDate, clipFrom, clipTo)) {
          if (!map.has(d)) map.set(d, { type: r.leaveType, req: r });
        }
      }
    }
    return map;
  }, [requests, bulan]);

  const approvedSwapByDate = useMemo(() => {
    const map = new Map<string, AbsensiRequestView>();
    for (const r of requests) {
      if (r.status === "approved" && r.kind === "pergantian_shift") {
        map.set(r.startDate, r);
      }
    }
    return map;
  }, [requests]);

  const summary = useMemo(() => {
    let hadir = 0;
    let tidakClockOut = 0;
    let sakit = 0;
    let cuti = 0;
    for (const s of shifts) {
      if (s.status === "lupa_pulang") tidakClockOut += 1;
      else hadir += 1;
    }
    for (const [date, item] of approvedLeaveByDate.entries()) {
      if (shiftByDate.has(date)) continue;
      if (item.type === "sakit") sakit += 1;
      else cuti += 1;
    }
    const total = hadir + tidakClockOut + sakit + cuti;
    const pct = (val: number) => (total === 0 ? 0 : Math.round((val / total) * 100));
    return {
      total,
      hadir,
      tidakClockOut,
      sakit,
      cuti,
      hadirPct: pct(hadir),
      segments: [
        { label: "Hadir", count: hadir, color: "#F59E0B", dotClass: "bg-amber-500" },
        { label: "Tidak Clock Out", count: tidakClockOut, color: "#F97316", dotClass: "bg-orange-500" },
        { label: "Sakit", count: sakit, color: "#EF4444", dotClass: "bg-rose-500" },
        { label: "Cuti / Izin", count: cuti, color: "#64748B", dotClass: "bg-slate-500" },
      ] satisfies DonutSegment[],
      pct,
    };
  }, [shifts, approvedLeaveByDate, shiftByDate]);

  const cells = useMemo(() => buildCalendarCells(bulan), [bulan]);
  const selectedShift = selectedDate ? shiftByDate.get(selectedDate) ?? null : null;
  const selectedLeave = selectedDate ? approvedLeaveByDate.get(selectedDate) ?? null : null;
  const selectedSwap = selectedDate ? approvedSwapByDate.get(selectedDate) ?? null : null;

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 font-['Hanken_Grotesk',system-ui,sans-serif] text-neutral-900">
      {/* Header Atas */}
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <button
            type="button"
            aria-label="Kembali ke Beranda"
            onClick={() => navigate("/absensi")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-neutral-800 hover:bg-amber-50"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-neutral-900">
            Riwayat Absensi Saya
          </h1>
          <NotificationBellButton variant="plain" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-md space-y-4 px-4 pt-4">
        {error && (
          <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
            {error}
          </p>
        )}

        {/* Card 1: Kalender Absensi */}
        <section className="rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-xs">
          <div className="rounded-2xl bg-amber-50/90 px-4 py-3">
            <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-amber-900">
              Kalender Absensi
            </h2>
            <p className="mt-0.5 text-xs text-amber-800/80">
              Ketuk tanggal untuk melihat kehadiran dan detail aktivitas.
            </p>
          </div>

          {/* Navigasi Bulan */}
          <div className="my-4 flex items-center justify-between px-2">
            <button
              type="button"
              aria-label="Bulan sebelumnya"
              onClick={() => setBulan((b) => geserBulan(b, -1))}
              className="flex h-8 w-8 items-center justify-center rounded-full text-amber-800 hover:bg-amber-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-amber-700">
              {formatBulan(bulan)}
            </span>
            <button
              type="button"
              aria-label="Bulan berikutnya"
              onClick={() => setBulan((b) => geserBulan(b, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-full text-amber-800 hover:bg-amber-100"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Header Hari */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-neutral-500">
            {WEEKDAYS.map((day) => (
              <span key={day} className="py-1">{day}</span>
            ))}
          </div>

          {/* Grid Tanggal */}
          <div className="mt-1 grid grid-cols-7 gap-y-2 text-center">
            {cells.map((cell, index) => {
              if (!cell) return <div key={`empty-${index}`} />;
              const shift = shiftByDate.get(cell.date);
              const leave = approvedLeaveByDate.get(cell.date);
              const swap = approvedSwapByDate.get(cell.date);
              const hasData = Boolean(shift || leave || swap);
              const isFuture = cell.date > today;
              const isSelected = selectedDate === cell.date;

              let pillClass = "text-neutral-700 hover:bg-neutral-100";
              if (shift) {
                pillClass = shift.status === "lupa_pulang"
                  ? "bg-orange-400 text-white font-extrabold shadow-2xs"
                  : "bg-gradient-to-br from-amber-400 to-yellow-400 text-neutral-900 font-extrabold shadow-2xs";
              } else if (leave) {
                pillClass = leave.type === "sakit"
                  ? "bg-rose-500 text-white font-extrabold shadow-2xs"
                  : "bg-slate-600 text-white font-extrabold shadow-2xs";
              } else if (isFuture) {
                pillClass = "text-neutral-300";
              }

              return (
                <div key={cell.date} className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => setSelectedDate(cell.date)}
                    aria-label={formatTanggalPanjang(cell.date)}
                    className={`relative flex h-9 w-9 items-center justify-center rounded-xl text-xs transition ${pillClass} ${
                      isSelected ? "ring-2 ring-amber-600 ring-offset-2" : ""
                    }`}
                  >
                    <span>{cell.day}</span>
                    {swap && (
                      <span className="absolute -bottom-0.5 h-1.5 w-1.5 rounded-full bg-amber-700" />
                    )}
                    {!hasData && !isFuture && cell.date < today && (
                      <span className="sr-only">Tidak ada data</span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Legenda */}
          <div className="mt-5 flex items-center justify-between border-t border-neutral-100 pt-3 text-xs font-bold text-neutral-700">
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-amber-400" />
              Data tersedia
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-rose-500" />
              Tidak ada data / Sakit
            </span>
          </div>

          {/* Detail Tanggal Terpilih */}
          {selectedDate && !loading && (
            <div className="mt-4 rounded-2xl border border-amber-200/70 bg-amber-50/40 p-3.5 text-xs">
              <p className="font-['Manrope',system-ui,sans-serif] text-xs font-extrabold text-neutral-900">
                {formatTanggalPanjang(selectedDate)}
              </p>
              {selectedShift ? (
                <div className="mt-1.5 space-y-1 text-neutral-700">
                  <p>
                    Status:{" "}
                    <span className="font-bold text-amber-800">{SHIFT_STATUS_LABEL[selectedShift.status]}</span>
                  </p>
                  <p>
                    Clock In: <span className="font-bold">{formatJam(selectedShift.masukAt)}</span> · Clock Out:{" "}
                    <span className="font-bold">
                      {selectedShift.pulangAt !== null ? formatJam(selectedShift.pulangAt) : "-"}
                    </span>
                  </p>
                  {selectedShift.durationMin !== null && (
                    <p>
                      Durasi Kerja: <span className="font-bold">{formatDurasi(selectedShift.durationMin)}</span>
                    </p>
                  )}
                </div>
              ) : selectedLeave ? (
                <p className="mt-1.5 text-neutral-700">
                  Status:{" "}
                  <span className="font-bold text-amber-800">
                    {LEAVE_TYPE_LABEL[selectedLeave.type]} (Disetujui)
                  </span>{" "}
                  — "{selectedLeave.req.reason}"
                </p>
              ) : (
                <p className="mt-1 text-neutral-500">Tidak ada catatan kehadiran pada tanggal ini.</p>
              )}

              {selectedSwap && (
                <p className="mt-1.5 rounded-xl bg-white px-2.5 py-1.5 font-semibold text-amber-900">
                  Pergantian Shift Disetujui: {selectedSwap.fromShift} → {selectedSwap.toShift}
                  {selectedSwap.partnerName ? ` (bersama ${selectedSwap.partnerName})` : ""}
                </p>
              )}
            </div>
          )}
        </section>

        {/* Card 2: Ringkasan Kehadiran */}
        <section className="rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-xs">
          <h2 className="font-['Manrope',system-ui,sans-serif] text-base font-extrabold text-amber-800">
            Ringkasan Kehadiran
          </h2>

          <div className="mt-4 flex items-center gap-4">
            <DonutChart
              segments={summary.segments}
              total={summary.total}
              hadirPct={summary.hadirPct}
            />

            <div className="min-w-0 flex-1 space-y-2">
              {summary.segments.map((seg) => (
                <div
                  key={seg.label}
                  className="flex items-center justify-between rounded-xl bg-neutral-50 px-3 py-2 text-xs"
                >
                  <span className="flex items-center gap-2 font-medium text-neutral-600">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${seg.dotClass}`} />
                    <span className="truncate">{seg.label}</span>
                  </span>
                  <span className="shrink-0 font-extrabold text-neutral-900 tabular-nums">
                    {seg.count} · {summary.pct(seg.count)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <EmployeeBottomNav />
    </div>
  );
}

