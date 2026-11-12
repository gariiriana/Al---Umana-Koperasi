import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";

import { workDateWIB } from "../../../../workers/absensi/shared/time.js";
import { getRekap, listEmployees } from "@/absensi/api";
import { ShiftPhoto } from "@/absensi/admin/ShiftPhoto";
import { useAbsensiSession } from "@/absensi/AbsensiSession";
import { errorMessage } from "@/absensi/errorMessage";
import {
  buildUnifiedRekapItems,
  summarizeRekap,
  type RekapMeta,
  type UnifiedRekapItem,
} from "@/absensi/export/rekapData";
import {
  formatDurasi,
  formatHariTanggal,
  formatJam,
  formatTanggalPanjang,
  formatTanggalPendek,
  formatTerlambat,
} from "@/absensi/logic/format";
import type { AbsensiRequestView, EmployeeView, RekapRow, SilahEntry } from "@/absensi/types";
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
  silah: "bg-teal-50 text-teal-800 border border-teal-200",
};

/** Absen luar zona yang belum diverifikasi / ditolak diberi warna mencolok. */
function badgeClass(item: UnifiedRekapItem): string {
  if (item.zoneStatus === "pending") return "bg-violet-100 text-violet-900 border border-violet-300";
  if (item.zoneStatus === "rejected") return "bg-rose-100 text-rose-800 border border-rose-300";
  return BADGE_TONE[item.badgeTone];
}

interface Filter {
  from: string;
  to: string;
  uid: string;
}

function defaultFilter(): Filter {
  const today = workDateWIB(Date.now());
  return { from: `${today.slice(0, 8)}01`, to: today, uid: "" };
}

/** Rekap terpadu kehadiran, cuti/sakit/izin, dan pergantian shift beserta export Excel & Word. */
export function RekapTab() {
  const { me } = useAbsensiSession();
  const [filter, setFilter] = useState<Filter>(defaultFilter);
  const [applied, setApplied] = useState<Filter | null>(null);
  const [employees, setEmployees] = useState<EmployeeView[]>([]);
  const [rows, setRows] = useState<RekapRow[] | null>(null);
  const [requests, setRequests] = useState<AbsensiRequestView[]>([]);
  const [silah, setSilah] = useState<{ entries: SilahEntry[]; today?: string }>({ entries: [] });
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
      setSilah({ entries: res.silah ?? [], today: res.today });
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
    return buildUnifiedRekapItems(rows, requests, { from: applied.from, to: applied.to, silah: silah.entries, today: silah.today });
  }, [rows, requests, applied, silah]);

  const summaries = useMemo(() => {
    if (!rows || !applied) return [];
    return summarizeRekap(rows, requests, { from: applied.from, to: applied.to, silah: silah.entries, today: silah.today });
  }, [rows, requests, applied, silah]);

  /** Kartu HP dikelompokkan per tanggal (item sudah urut tanggal lalu nama). */
  const dayGroups = useMemo(() => {
    const groups = new Map<string, UnifiedRekapItem[]>();
    for (const item of unifiedItems) {
      const list = groups.get(item.workDate);
      if (list) list.push(item);
      else groups.set(item.workDate, [item]);
    }
    return [...groups.entries()];
  }, [unifiedItems]);

  // Nama area di tiap kartu HP hanya berguna kalau ada lebih dari satu area.
  const showArea = useMemo(() => new Set(unifiedItems.map((item) => item.areaName).filter(Boolean)).size > 1, [unifiedItems]);

  const meta = (): RekapMeta | null => {
    if (!applied || !rows) return null;
    const areaNames = [...new Set(rows.map((row) => row.areaName).filter((name): name is string => !!name))];
    return {
      from: applied.from,
      to: applied.to,
      areaNames,
      printedBy: me?.name ?? "Admin absensi",
      printedAt: Date.now(),
      silah: silah.entries,
      today: silah.today,
    };
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

          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
            <Button
              variant="outlined"
              size="sm"
              className="w-full sm:w-auto"
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
              className="w-full sm:w-auto"
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
          className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:items-end"
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
          <label className={`${fieldLabel} col-span-2 sm:col-span-1`}>
            <span>Karyawan</span>
            <select className={field} value={filter.uid} onChange={(e) => setFilter({ ...filter, uid: e.target.value })}>
              <option value="">Semua karyawan</option>
              {employees.map((employee) => (
                <option key={employee.uid} value={employee.uid}>{employee.name}</option>
              ))}
            </select>
          </label>
          <Button type="submit" variant="primary" className="col-span-2 sm:col-span-1" loading={loading} disabled={invalidRange}>
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

          {/* HP: satu kartu per karyawan, tanpa geser ke samping. */}
          <ul className="divide-y divide-neutral-100 md:hidden">
            {summaries.map((s) => (
              <li key={s.uid} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 break-words text-sm font-extrabold text-neutral-900">{s.name}</p>
                  <p className="shrink-0 text-right text-xs font-bold text-neutral-700 tabular-nums">
                    {formatDurasi(s.totalMenit)}
                  </p>
                </div>
                {/* Hanya angka yang tidak nol supaya kartu tetap pendek; "Hadir" selalu tampil. */}
                <dl className="mt-2 flex flex-wrap gap-1.5">
                  {([
                    ["Hadir", s.hariHadir, "border-amber-200 bg-amber-50 text-amber-900"],
                    ["Cuti", s.cuti, "border-slate-200 bg-slate-50 text-slate-800"],
                    ["Sakit", s.sakit, "border-rose-200 bg-rose-50 text-rose-800"],
                    ["Izin", s.izin, "border-sky-200 bg-sky-50 text-sky-800"],
                    ["Silah", s.silah, "border-teal-200 bg-teal-50 text-teal-800"],
                    ["Tidak clock out", s.tidakClockOut, "border-orange-200 bg-orange-50 text-orange-800"],
                    ["Ganti shift", s.pergantianShift, "border-neutral-200 bg-neutral-50 text-neutral-700"],
                  ] as const)
                    .filter(([label, value]) => label === "Hadir" || value > 0)
                    .map(([label, value, tone]) => (
                      <div key={label} className={`flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] ${tone}`}>
                        <dt className="font-semibold">{label}</dt>
                        <dd className="font-extrabold tabular-nums">{value}</dd>
                      </div>
                    ))}
                </dl>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[740px] text-left text-xs sm:text-sm">
              <thead className="border-b border-neutral-100 bg-neutral-50/80 text-xs font-bold text-neutral-500">
                <tr>
                  {["Nama", "Hadir", "Cuti", "Sakit", "Izin", "Silah", "Tidak Clock Out", "Ganti Shift", "Total Jam Kerja"].map((head) => (
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
                    <td className="px-4 py-3 text-teal-700">{s.silah}</td>
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
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-b border-neutral-100 bg-amber-50/70 px-5 py-3">
            <h3 className="font-['Manrope',system-ui,sans-serif] text-sm font-extrabold text-amber-950">
              Rincian Harian
            </h3>
            <span className="text-[11px] font-medium text-amber-900/75">
              Ketuk baris hadir untuk melihat foto selfie
            </span>
          </div>

          {/* HP: kartu per hari, dikelompokkan per tanggal. */}
          <div className="md:hidden">
            {dayGroups.map(([date, items]) => (
              <section key={date}>
                <h4 className="border-b border-neutral-100 bg-neutral-50 px-4 py-2 text-xs font-extrabold text-neutral-600">
                  {formatHariTanggal(date)}
                </h4>
                <ul className="divide-y divide-neutral-100">
                  {items.map((item) => {
                    const notes = showArea && item.areaName ? [item.areaName, ...item.notes] : item.notes;
                    const body = (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 break-words text-sm font-extrabold text-neutral-900">{item.name}</p>
                          <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${badgeClass(item)}`}>
                            {item.statusLabel}
                          </span>
                        </div>
                        {item.kind === "shift" && (
                          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs font-semibold text-neutral-700 tabular-nums">
                            <span className={item.late ? "text-orange-700" : undefined}>
                              Masuk {item.masukAt !== null ? formatJam(item.masukAt) : "-"}
                            </span>
                            {item.late && (
                              <span className="whitespace-nowrap rounded-full border border-orange-200 bg-orange-50 px-2 py-px text-[10px] font-bold text-orange-800">
                                Terlambat
                              </span>
                            )}
                            <span>· Pulang {item.pulangAt !== null ? formatJam(item.pulangAt) : "-"}</span>
                            {item.durationMin !== null && (
                              <span className="font-medium text-neutral-500">· {formatDurasi(item.durationMin)}</span>
                            )}
                          </p>
                        )}
                        {notes.map((note) => (
                          <p key={note} className="mt-1 break-words text-xs text-neutral-600">{note}</p>
                        ))}
                      </>
                    );
                    const shiftRow = item.shiftRow;
                    return (
                      <li key={item.key}>
                        {shiftRow ? (
                          <button
                            type="button"
                            onClick={() => setSelected(shiftRow)}
                            className="block w-full px-4 py-3 text-left transition active:bg-amber-50"
                          >
                            {body}
                          </button>
                        ) : (
                          <div className="bg-neutral-50/40 px-4 py-3">{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[720px] text-left text-xs sm:text-sm">
              <thead className="border-b border-neutral-100 bg-neutral-50/80 text-xs font-bold text-neutral-500">
                <tr>
                  {["Tanggal", "Nama", "Clock in", "Clock out", "Durasi", "Status", showArea ? "Area / Keterangan" : "Keterangan"].map((head) => (
                    <th key={head} className="whitespace-nowrap px-4 py-2.5">{head}</th>
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
                    <td className="min-w-[9rem] px-4 py-3 font-extrabold text-neutral-900">{item.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {item.masukAt !== null ? formatJam(item.masukAt) : "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {item.pulangAt !== null ? formatJam(item.pulangAt) : "-"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {item.durationMin !== null ? formatDurasi(item.durationMin) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeClass(item)}`}>
                          {item.statusLabel}
                        </span>
                        {item.late && (
                          <span className="whitespace-nowrap rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs font-bold text-orange-800">
                            Terlambat
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Ditulis utuh (tidak dipotong) supaya alasan terlambat terbaca; area hanya kalau lebih dari satu. */}
                    <td className="min-w-[10rem] px-4 py-3 text-xs text-neutral-600">
                      {[...(showArea && item.areaName ? [item.areaName] : []), ...item.notes].map((note) => (
                        <p key={note} className="break-words">{note}</p>
                      ))}
                      {!(showArea && item.areaName) && item.notes.length === 0 && "-"}
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
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 px-4 py-8 backdrop-blur-xs sm:items-center"
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
            {formatTerlambat(selected.masukAt) && (
              <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm">
                <p className="font-extrabold text-orange-900">{formatTerlambat(selected.masukAt)}</p>
                <p className="mt-0.5 break-words font-semibold text-orange-800">
                  {selected.lateReason ? `Alasan: ${selected.lateReason}` : "Tidak ada alasan tercatat."}
                </p>
                {selected.latePhotoId && (
                  <div className="mt-3">
                    <ShiftPhoto label="Foto bukti" photoId={selected.latePhotoId} variant="bukti" />
                  </div>
                )}
              </div>
            )}
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
