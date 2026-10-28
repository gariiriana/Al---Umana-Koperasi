import { useCallback, useEffect, useState } from "react";

import { getHariIni } from "@/absensi/api";
import { errorMessage } from "@/absensi/errorMessage";
import { LEAVE_TYPE_LABEL, formatJam, formatTanggalPanjang } from "@/absensi/logic/format";
import type { HariIniRow } from "@/absensi/types";
import { Button } from "@/components/ui/Button";

const STATE_STYLE: Record<HariIniRow["state"], string> = {
  belum: "bg-neutral-100 text-neutral-600 border border-neutral-200",
  masuk: "bg-amber-100 text-amber-900 border border-amber-300",
  pulang: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  tidak_clock_out: "bg-orange-100 text-orange-800 border border-orange-200",
};

function stateLabel(row: HariIniRow): string {
  switch (row.state) {
    case "belum":
      return "Belum absen";
    case "masuk":
      return row.masukAt !== null ? `Sudah clock in · ${formatJam(row.masukAt)}` : "Sudah clock in";
    case "pulang":
      return row.pulangAt !== null ? `Sudah clock out · ${formatJam(row.pulangAt)}` : "Sudah clock out";
    case "tidak_clock_out":
      return "Tidak clock out";
  }
}

/** Ringkasan kehadiran hari ini (termasuk karyawan yang sedang cuti/sakit/pergantian shift). */
export function HariIniTab() {
  const [date, setDate] = useState<string | null>(null);
  const [rows, setRows] = useState<HariIniRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getHariIni();
      setDate(res.date);
      setRows(res.rows);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const count = (state: HariIniRow["state"]) => rows?.filter((row) => row.state === state).length ?? 0;
  const cutiToday = rows?.filter((row) => Boolean(row.leaveType)).length ?? 0;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-xs">
        <div>
          <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">
            Kehadiran Hari Ini
          </h2>
          {date && <p className="text-xs font-semibold text-amber-700">{formatTanggalPanjang(date)}</p>}
        </div>
        <Button variant="outlined" size="sm" loading={loading} onClick={() => void load()}>
          Muat ulang
        </Button>
      </div>

      {rows && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4">
            <p className="text-xs font-bold text-amber-800">Sudah Clock In</p>
            <p className="mt-1 font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-neutral-900">
              {count("masuk") + count("pulang") + count("tidak_clock_out")}
            </p>
          </div>
          <div className="rounded-2xl border border-emerald-200/80 bg-emerald-50/60 p-4">
            <p className="text-xs font-bold text-emerald-800">Sudah Clock Out</p>
            <p className="mt-1 font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-neutral-900">
              {count("pulang")}
            </p>
          </div>
          <div className="rounded-2xl border border-rose-200/80 bg-rose-50/60 p-4">
            <p className="text-xs font-bold text-rose-800">Cuti / Sakit / Izin</p>
            <p className="mt-1 font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-neutral-900">
              {cutiToday}
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <p className="text-xs font-bold text-neutral-500">Belum Absen</p>
            <p className="mt-1 font-['Manrope',system-ui,sans-serif] text-2xl font-extrabold text-neutral-900">
              {count("belum")}
            </p>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </p>
      )}

      {rows && rows.length === 0 && (
        <div className="rounded-3xl border border-neutral-200/80 bg-white p-8 text-center text-sm text-neutral-500">
          Belum ada karyawan aktif.
        </div>
      )}

      {rows && rows.length > 0 && (
        <ul className="divide-y divide-neutral-100 overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-xs">
          {rows.map((row) => (
            <li key={row.uid} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 hover:bg-amber-50/30">
              <div className="min-w-0">
                <p className="truncate font-['Manrope',system-ui,sans-serif] text-sm font-extrabold text-neutral-900">
                  {row.name}
                </p>
                {row.shiftSwap && (
                  <p className="mt-0.5 text-xs font-semibold text-amber-800">
                    Shift: {row.shiftSwap.fromShift} → {row.shiftSwap.toShift}
                    {row.shiftSwap.partnerName ? ` (rekan: ${row.shiftSwap.partnerName})` : ""}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {row.leaveType && (
                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700">
                    {LEAVE_TYPE_LABEL[row.leaveType]}
                  </span>
                )}
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${STATE_STYLE[row.state]}`}>
                  {stateLabel(row)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
