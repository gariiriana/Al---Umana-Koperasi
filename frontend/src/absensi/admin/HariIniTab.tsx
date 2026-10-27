import { useCallback, useEffect, useState } from "react";

import { getHariIni } from "@/absensi/api";
import { errorMessage } from "@/absensi/errorMessage";
import { formatJam, formatTanggalPanjang } from "@/absensi/logic/format";
import type { HariIniRow } from "@/absensi/types";
import { Button } from "@/components/ui/Button";

const text = "font-['Hanken_Grotesk',system-ui,sans-serif]";

const STATE_STYLE: Record<HariIniRow["state"], string> = {
  belum: "bg-white/10 text-neutral-300",
  masuk: "bg-amber-400/15 text-amber-300",
  pulang: "bg-emerald-500/15 text-emerald-300",
  tidak_clock_out: "bg-orange-500/15 text-orange-300",
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

/** Siapa yang sudah clock in / clock out / belum absen hari ini (muat ulang manual, tanpa realtime). */
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

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-white">Hari ini</h2>
          {date && <p className={`${text} text-xs text-neutral-400`}>{formatTanggalPanjang(date)}</p>}
        </div>
        <Button variant="secondary" size="sm" loading={loading} onClick={() => void load()}>Muat ulang</Button>
      </div>

      {rows && (
        <p className={`${text} text-sm text-neutral-300`}>
          {count("masuk") + count("pulang") + count("tidak_clock_out")} sudah clock in · {count("pulang")} sudah clock out ·{" "}
          {count("belum")} belum absen
        </p>
      )}

      {error && <p role="alert" className={`${text} text-sm text-[#EF4444]`}>{error}</p>}

      {rows && rows.length === 0 && <p className={`${text} text-sm text-neutral-400`}>Belum ada karyawan.</p>}

      {rows && rows.length > 0 && (
        <ul className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/5">
          {rows.map((row) => (
            <li key={row.uid} className={`${text} flex items-center justify-between gap-3 px-4 py-3`}>
              <span className="min-w-0 truncate text-sm font-bold text-white">{row.name}</span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATE_STYLE[row.state]}`}>
                {stateLabel(row)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
