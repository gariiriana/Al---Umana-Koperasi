import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";

import { workDateWIB } from "../../../../workers/absensi/shared/time.js";
import { fetchPhotoUrl, getRekap, listEmployees } from "@/absensi/api";
import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { errorMessage } from "@/absensi/errorMessage";
import {
  buildUnifiedRekapItems,
  summarizeRekap,
  type RekapMeta,
  type UnifiedRekapItem,
} from "@/absensi/export/rekapData";
import { formatDurasi, formatJam, formatTanggalPanjang, formatTanggalPendek } from "@/absensi/logic/format";
import type { AbsensiRequestView, EmployeeView, RekapRow } from "@/absensi/types";
import { Button } from "@/components/ui/Button";

const field =
  "w-full rounded-xl border border-neutral-200 bg-white px-3.5 py-2 text-sm text-neutral-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200";
const fieldLabel = "block space-y-1 text-xs font-bold text-neutral-700";

const BADGE_TONE: Record<UnifiedRekapItem["badgeTone"], string> = {
  selesai: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  terbuka: "bg-amber-100 text-amber-900 border border-amber-300",
  lupa_pulang: "bg-orange-100 text-orange-800 border border-orange-200",
  cuti: "bg-slate-100 text-slate-800 border border-slate-300",
  sakit: "bg-rose-100 text-rose-800 border border-rose-200",
  izin: "bg-sky-100 text-sky-800 border border-sky-200",
};

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
    if (!photoId) {
      setState({ url: null, loading: false });
      return undefined;
    }
    let url: string | null = null;
    let cancelled = false;
    setState({ url: null, loading: true });
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
    <figure className="space-y-1.5">
      <figcaption className="text-xs font-bold text-neutral-700">{label}</figcaption>
      <div className="flex aspect-[3/4] items-center justify-center overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 p-2 text-center text-xs text-neutral-500">
        {content}
      </div>
    </figure>
  );
}

/** Rekap terpadu kehadiran, cuti/sakit/izin, dan pergantian shift beserta export Excel & Word. */
export function RekapTab() {
  const { me } = useAbsensiSession();
  const [filter, setFilter] = useState<Filter>(defaultFilter);
  const [applied, setApplied] = useState<Filter | null>(null);
  const [employees, setEmployees] = useState<EmployeeView[]>([]);
  const [rows, setRows] = useState<RekapRow[] | null>(null);
  const [requests, setRequests] = useState<AbsensiRequestView[]>([]);
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
      setRequests(res.requests ?? []);
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

  const unifiedItems = useMemo(() => {
    if (!rows || !applied) return [];
    return buildUnifiedRekapItems(rows, requests, { from: applied.from, to: applied.to });
  }, [rows, requests, applied]);

  const summaries = useMemo(() => {
    if (!rows || !applied) return [];
    return summarizeRekap(rows, requests, { from: applied.from, to: applied.to });
  }, [rows, requests, applied]);

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
      if (ext === "xlsx") (await import("@/absensi/export/rekapExcel")).downloadRekapExcel(rows, info, requests);
      else await (await import("@/absensi/export/rekapDocx")).downloadRekapDocx(rows, info, requests);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(null);
    }
  };

  const invalidRange = filter.from > filter.to;
  const hasData = unifiedItems.length > 0;

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-neutral-200/80 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">
              Rekap Kehadiran & Pengajuan
            </h2>
            {applied && (
              <p className="text-xs font-semibold text-amber-700">
                {formatTanggalPanjang(applied.from)} – {formatTanggalPanjang(applied.to)} · {rows?.length ?? 0} shift hadir ·{" "}
                {requests.length} pengajuan disetujui
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outlined"
              size="sm"
              disabled={!hasData}
              loading={exporting === "xlsx"}
              leftIcon={<FileSpreadsheet className="h-4 w-4 text-emerald-700" />}
              onClick={() => void exportAs("xlsx")}
            >
              Export Excel
            </Button>
            <Button
              variant="outlined"
              size="sm"
              disabled={!hasData}
              loading={exporting === "docx"}
              leftIcon={<FileText className="h-4 w-4 text-amber-700" />}
              onClick={() => void exportAs("docx")}
            >
              Export Word
            </Button>
          </div>
        </div>

        <form
          className="mt-4 grid gap-3 sm:grid-cols-4 sm:items-end"
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
              <option value="">Semua karyawan</option>
              {employees.map((employee) => (
                <option key={employee.uid} value={employee.uid}>{employee.name}</option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="primary" loading={loading} disabled={invalidRange}>
            Tampilkan
          </Button>
        </form>
      </div>

      {invalidRange && (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          Tanggal "dari" harus sebelum "sampai".
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </p>
      )}

      {rows !== null && !hasData && (
        <div className="rounded-3xl border border-neutral-200/80 bg-white p-8 text-center text-sm text-neutral-500">
          Tidak ada catatan absensi maupun pengajuan di rentang tanggal ini.
        </div>
      )}

      {/* Ringkasan per Karyawan */}
      {summaries.length > 0 && (
        <div className="overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-xs">
          <div className="border-b border-neutral-100 bg-amber-50/70 px-5 py-3">
            <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-extrabold text-amber-950">
              Ringkasan per Karyawan
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs sm:text-sm">
              <thead className="border-b border-neutral-100 bg-neutral-50/80 text-xs font-bold text-neutral-500">
                <tr>
                  {["Nama", "Hadir", "Cuti", "Sakit", "Izin", "Tidak Clock Out", "Ganti Shift", "Total Jam Kerja"].map((head) => (
                    <th key={head} className="px-4 py-2.5">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {summaries.map((s) => (
                  <tr key={s.uid} className="hover:bg-amber-50/30">
                    <td className="px-4 py-3 font-extrabold text-neutral-900">{s.name}</td>
                    <td className="px-4 py-3 font-bold text-amber-800">{s.hariHadir}</td>
                    <td className="px-4 py-3">{s.cuti}</td>
                    <td className="px-4 py-3">{s.sakit}</td>
                    <td className="px-4 py-3">{s.izin}</td>
                    <td className="px-4 py-3 text-orange-700">{s.tidakClockOut}</td>
                    <td className="px-4 py-3">{s.pergantianShift}</td>
                    <td className="px-4 py-3 font-semibold text-neutral-700">{formatDurasi(s.totalMenit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabel Detail Harian Terpadu */}
      {hasData && (
        <div className="overflow-hidden rounded-3xl border border-neutral-200/80 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-neutral-100 bg-amber-50/70 px-5 py-3">
            <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-extrabold text-amber-950">
              Rincian Harian
            </h3>
            <span className="text-[11px] font-medium text-amber-900/75">
              Klik baris hadir untuk melihat foto selfie
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs sm:text-sm">
              <thead className="border-b border-neutral-100 bg-neutral-50/80 text-xs font-bold text-neutral-500">
                <tr>
                  {["Tanggal", "Nama", "Clock in", "Clock out", "Durasi", "Status", "Area / Keterangan"].map((head) => (
                    <th key={head} className="px-4 py-2.5">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {unifiedItems.map((item) => (
                  <tr
                    key={item.key}
                    onClick={() => {
                      if (item.shiftRow) setSelected(item.shiftRow);
                    }}
                    className={
                      item.shiftRow
                        ? "cursor-pointer transition hover:bg-amber-50/50"
                        : "bg-neutral-50/40"
                    }
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-neutral-600">
                      {formatTanggalPendek(item.workDate)}
                    </td>
                    <td className="px-4 py-3 font-extrabold text-neutral-900">{item.name}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {item.masukAt !== null ? formatJam(item.masukAt) : "-"}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {item.pulangAt !== null ? formatJam(item.pulangAt) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      {item.durationMin !== null ? formatDurasi(item.durationMin) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${BADGE_TONE[item.badgeTone]}`}>
                        {item.statusLabel}
                      </span>
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 text-xs text-neutral-600" title={item.info}>
                      {item.info}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Foto Selfie */}
      {selected && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Foto absen ${selected.name}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 backdrop-blur-xs"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-lg space-y-4 rounded-3xl border border-amber-100 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="font-['Manrope',system-ui,sans-serif] text-lg font-extrabold text-neutral-900">
                {selected.name}
              </h3>
              <p className="text-xs font-semibold text-amber-700">
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
            <Button variant="primary" className="w-full" onClick={() => setSelected(null)}>
              Tutup
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
