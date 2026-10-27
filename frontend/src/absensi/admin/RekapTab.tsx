import { useCallback, useEffect, useState } from "react";

import { workDateWIB } from "../../../../workers/absensi/shared/time.js";
import { fetchPhotoUrl, getRekap, listEmployees } from "@/absensi/api";
import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { errorMessage } from "@/absensi/errorMessage";
import type { RekapMeta } from "@/absensi/export/rekapData";
import { SHIFT_STATUS_LABEL, formatDurasi, formatJam, formatTanggalPanjang, formatTanggalPendek } from "@/absensi/logic/format";
import type { EmployeeView, RekapRow } from "@/absensi/types";
import { Button } from "@/components/ui/Button";

const text = "font-['Hanken_Grotesk',system-ui,sans-serif]";
const field = `${text} w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white`;
const fieldLabel = `${text} block space-y-1 text-xs font-bold text-neutral-300`;

interface Filter {
  from: string;
  to: string;
  uid: string;
}

function defaultFilter(): Filter {
  const today = workDateWIB(Date.now());
  return { from: `${today.slice(0, 8)}01`, to: today, uid: "" };
}

/** Satu foto shift; dimuat hanya saat modal dibuka. */
function ShiftPhoto({ label, photoId }: { label: string; photoId: string | null }) {
  const [state, setState] = useState<{ url: string | null; loading: boolean }>({ url: null, loading: photoId !== null });

  useEffect(() => {
    if (!photoId) return undefined;
    let url: string | null = null;
    let cancelled = false;
    fetchPhotoUrl(photoId).then(
      (result) => {
        url = result;
        if (!cancelled) setState({ url: result, loading: false });
      },
      () => {
        if (!cancelled) setState({ url: null, loading: false });
      },
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photoId]);

  let content: React.ReactNode;
  if (!photoId) content = "Tidak ada foto";
  else if (state.loading) content = "Memuat...";
  else if (!state.url) content = "Foto sudah dihapus (lebih dari 90 hari)";
  else content = <img src={state.url} alt={`Selfie ${label.toLowerCase()}`} className="h-full w-full object-cover" />;

  return (
    <figure className="space-y-1">
      <figcaption className={`${text} text-xs font-bold text-neutral-300`}>{label}</figcaption>
      <div className={`${text} flex aspect-[3/4] items-center justify-center overflow-hidden rounded-2xl bg-white/10 p-2 text-center text-xs text-neutral-400`}>
        {content}
      </div>
    </figure>
  );
}

/** Rekap per rentang tanggal & karyawan, foto per baris, export Excel/Word dari data yang tampil. */
export function RekapTab() {
  const { me } = useAbsensiSession();
  const [filter, setFilter] = useState<Filter>(defaultFilter);
  const [applied, setApplied] = useState<Filter | null>(null);
  const [employees, setEmployees] = useState<EmployeeView[]>([]);
  const [rows, setRows] = useState<RekapRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"xlsx" | "docx" | null>(null);
  const [selected, setSelected] = useState<RekapRow | null>(null);

  const load = useCallback(async (next: Filter) => {
    setLoading(true);
    setError(null);
    try {
      const res = await getRekap({ from: next.from, to: next.to, uid: next.uid || undefined });
      setRows(res.rows);
      setApplied(next);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(defaultFilter());
    listEmployees().then((res) => setEmployees(res.employees.filter((e) => e.role === "absen_karyawan")), () => {});
  }, [load]);

  const meta = (): RekapMeta | null => {
    if (!applied || !rows) return null;
    const areaNames = [...new Set(rows.map((row) => row.areaName).filter((name): name is string => !!name))];
    return { from: applied.from, to: applied.to, areaNames, printedBy: me?.name ?? "Admin absensi", printedAt: Date.now() };
  };

  const exportAs = async (ext: "xlsx" | "docx") => {
    const info = meta();
    if (!info || !rows) return;
    setExporting(ext);
    setError(null);
    try {
      // Pustaka export besar; dimuat hanya saat dipakai.
      if (ext === "xlsx") (await import("@/absensi/export/rekapExcel")).downloadRekapExcel(rows, info);
      else await (await import("@/absensi/export/rekapDocx")).downloadRekapDocx(rows, info);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(null);
    }
  };

  const invalidRange = filter.from > filter.to;
  const hasRows = (rows?.length ?? 0) > 0;

  return (
    <section className="space-y-4">
      <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-white">Rekap</h2>

      <form
        className="grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:grid-cols-4 sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (!invalidRange) void load(filter);
        }}
      >
        <label className={fieldLabel}>
          <span>Dari</span>
          <input type="date" className={field} required value={filter.from} onChange={(e) => setFilter({ ...filter, from: e.target.value })} />
        </label>
        <label className={fieldLabel}>
          <span>Sampai</span>
          <input type="date" className={field} required value={filter.to} onChange={(e) => setFilter({ ...filter, to: e.target.value })} />
        </label>
        <label className={fieldLabel}>
          <span>Karyawan</span>
          <select className={field} value={filter.uid} onChange={(e) => setFilter({ ...filter, uid: e.target.value })}>
            <option value="" className="text-[#111827]">Semua karyawan</option>
            {employees.map((employee) => (
              <option key={employee.uid} value={employee.uid} className="text-[#111827]">{employee.name}</option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="primary" loading={loading} disabled={invalidRange}>Tampilkan</Button>
      </form>

      {invalidRange && <p role="alert" className={`${text} text-sm text-[#EF4444]`}>Tanggal "dari" harus sebelum "sampai".</p>}
      {error && <p role="alert" className={`${text} text-sm text-[#EF4444]`}>{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" disabled={!hasRows} loading={exporting === "xlsx"} onClick={() => void exportAs("xlsx")}>
          Export Excel
        </Button>
        <Button variant="secondary" size="sm" disabled={!hasRows} loading={exporting === "docx"} onClick={() => void exportAs("docx")}>
          Export Word
        </Button>
        {applied && (
          <span className={`${text} text-xs text-neutral-400`}>
            {formatTanggalPanjang(applied.from)} – {formatTanggalPanjang(applied.to)} · {rows?.length ?? 0} shift
          </span>
        )}
      </div>

      {rows?.length === 0 && <p className={`${text} text-sm text-neutral-400`}>Tidak ada absen di rentang ini.</p>}

      {hasRows && (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className={`${text} w-full min-w-[640px] text-left text-sm text-neutral-200`}>
            <thead className="bg-white/5 text-xs text-neutral-400">
              <tr>
                {["Tanggal", "Nama", "Clock in", "Clock out", "Durasi", "Status"].map((head) => (
                  <th key={head} className="px-3 py-2 font-bold">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows?.map((row) => (
                <tr key={row.shiftId} className="cursor-pointer hover:bg-white/5" onClick={() => setSelected(row)}>
                  <td className="px-3 py-2">{formatTanggalPendek(row.workDate)}</td>
                  <td className="px-3 py-2 font-bold text-white">{row.name}</td>
                  <td className="px-3 py-2">{formatJam(row.masukAt)}</td>
                  <td className="px-3 py-2">{row.pulangAt !== null ? formatJam(row.pulangAt) : "-"}</td>
                  <td className="px-3 py-2">{row.durationMin !== null ? formatDurasi(row.durationMin) : "-"}</td>
                  <td className="px-3 py-2">{SHIFT_STATUS_LABEL[row.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Foto absen ${selected.name}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => setSelected(null)}
        >
          <div className="w-full max-w-lg space-y-4 rounded-3xl border border-white/10 bg-[#111827] p-5" onClick={(e) => e.stopPropagation()}>
            <div>
              <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-bold text-white">{selected.name}</h3>
              <p className={`${text} text-xs text-neutral-400`}>
                {formatTanggalPanjang(selected.workDate)} · {selected.areaName ?? "-"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <ShiftPhoto label={`Clock in · ${formatJam(selected.masukAt)}`} photoId={selected.masukPhotoId} />
              <ShiftPhoto
                label={selected.pulangAt !== null ? `Clock out · ${formatJam(selected.pulangAt)}` : "Clock out"}
                photoId={selected.pulangPhotoId}
              />
            </div>
            <Button variant="secondary" className="w-full" onClick={() => setSelected(null)}>Tutup</Button>
          </div>
        </div>
      )}
    </section>
  );
}
