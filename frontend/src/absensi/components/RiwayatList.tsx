import { useEffect, useMemo, useState } from "react";

import { getRiwayat } from "@/absensi/api";
import { errorMessage } from "@/absensi/errorMessage";
import { SHIFT_STATUS_LABEL, formatBulan, formatDurasi, formatJam, formatTanggalPendek, recentBulan } from "@/absensi/logic/format";
import type { ShiftStatusName, ShiftView } from "@/absensi/types";

const STATUS_STYLE: Record<ShiftStatusName, string> = {
  selesai: "bg-emerald-500/15 text-emerald-300",
  terbuka: "bg-amber-400/15 text-amber-300",
  lupa_pulang: "bg-orange-500/15 text-orange-300",
};

export interface RiwayatListProps {
  /** `YYYY-MM` */
  bulan: string;
  onBulanChange: (bulan: string) => void;
  /** Naikkan untuk memuat ulang (mis. sesudah clock in/out). */
  reloadKey?: number;
}

/** Riwayat absen milik karyawan sendiri, satu baris per hari kerja (tanpa foto). */
export function RiwayatList({ bulan, onBulanChange, reloadKey = 0 }: RiwayatListProps) {
  const [rows, setRows] = useState<ShiftView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const months = useMemo(() => recentBulan(Date.now()), []);

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError(null);
    getRiwayat(bulan).then(
      (res) => {
        if (!cancelled) setRows([...res.rows].sort((a, b) => b.masukAt - a.masukAt));
      },
      (err) => {
        if (!cancelled) setError(errorMessage(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [bulan, reloadKey]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-white">Riwayat</h2>
        <select
          aria-label="Bulan"
          value={bulan}
          onChange={(e) => onBulanChange(e.target.value)}
          className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-white"
        >
          {months.map((month) => (
            <option key={month} value={month} className="text-[#111827]">
              {formatBulan(month)}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-[#EF4444]">{error}</p>
      )}
      {!error && rows === null && (
        <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-neutral-400">Memuat riwayat...</p>
      )}
      {rows?.length === 0 && (
        <p className="font-['Hanken_Grotesk',system-ui,sans-serif] text-sm text-neutral-400">Belum ada absen di bulan ini.</p>
      )}

      {rows && rows.length > 0 && (
        <ul className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/5">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3 font-['Hanken_Grotesk',system-ui,sans-serif]">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">{formatTanggalPendek(row.workDate)}</p>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${STATUS_STYLE[row.status]}`}>
                  {SHIFT_STATUS_LABEL[row.status]}
                </span>
              </div>
              <div className="text-right text-sm text-neutral-200">
                <p>
                  <span>{formatJam(row.masukAt)}</span>
                  {" – "}
                  <span>{row.pulangAt !== null ? formatJam(row.pulangAt) : "—"}</span>
                </p>
                <p className="text-xs text-neutral-400">
                  <span>{row.durationMin !== null ? formatDurasi(row.durationMin) : "—"}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
